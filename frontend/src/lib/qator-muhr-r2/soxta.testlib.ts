/** Test yordamchisi: t2_qator_muhr_* RPC va R2 ning xotiradagi soxta nusxalari (frontend va mcp testlari ulashadi). */
import { gzipSync } from 'fflate';
import { sha256Hex, type Db, type R2 } from '../snapshot-r2/sovuq';

export type Qator = { id: number; obyekt: number; yuklama: string | null; sovuq_id?: number };
type Korsatkich = { id: number; obyekt: number; idlar: number[]; sha: string; key: string; tasdiq: boolean };

/** t2_qator_muhr_* RPC larining xotiradagi nusxasi: DB xuddi shu sha256/tasdiq tekshiruvlarini bajaradi (haqiqiy SQL: migratsiya + acceptance). */
export function soxtaMuhrDb(qatorlar: Qator[], opt: { ozgargan?: number[] } = {}) {
  const chaqiruvlar: string[] = [];
  const korsatkichlar: Korsatkich[] = [];
  const matnOl = (idlar: number[]) => JSON.stringify(qatorlar.filter((q) => idlar.includes(q.id) && q.yuklama !== null).map((q) => ({ id: q.id, y: q.yuklama })));
  const db: Db = {
    async query(sql, p = []) {
      if (sql.includes('t2_qator_muhr_sovuq_oqi_v1')) {
        chaqiruvlar.push('oqi');
        const idlar = qatorlar.filter((q) => q.obyekt === Number(p[0]) && q.yuklama !== null && q.sovuq_id === undefined && !(opt.ozgargan ?? []).includes(q.id)).slice(0, Number(p[2])).map((q) => q.id);
        return { rows: idlar.length ? [{ idlar, qator_soni: idlar.length, bayt: matnOl(idlar).length, matn: matnOl(idlar) }] : [] };
      }
      if (sql.includes('t2_qator_muhr_sovuq_yoz_v1')) {
        chaqiruvlar.push('yoz');
        const idlar = (p[1] as unknown[]).map(Number);
        if ((await sha256Hex(matnOl(idlar))) !== p[2]) throw new Error('sha256 mos emas (DB)');
        const bor = korsatkichlar.find((k) => k.obyekt === Number(p[0]) && k.sha === p[2]);
        if (bor) return { rows: [{ id: bor.id }] };
        const k: Korsatkich = { id: korsatkichlar.length + 1, obyekt: Number(p[0]), idlar, sha: String(p[2]), key: String(p[3]), tasdiq: false };
        korsatkichlar.push(k);
        return { rows: [{ id: k.id }] };
      }
      if (sql.includes('t2_qator_muhr_sovuq_tasdiq_v1')) { chaqiruvlar.push('tasdiq'); korsatkichlar.find((k) => k.id === Number(p[0]))!.tasdiq = true; return { rows: [{}] }; }
      if (sql.includes('t2_qator_muhr_sovuq_sovut_v1')) {
        chaqiruvlar.push('sovut');
        const k = korsatkichlar.find((x) => x.id === Number(p[0]))!;
        if (!k.tasdiq || k.sha !== p[1] || (await sha256Hex(matnOl(k.idlar))) !== k.sha) throw new Error('sovut rad etildi (DB)');
        let bayt = 0;
        for (const q of qatorlar) if (k.idlar.includes(q.id) && q.yuklama !== null) { bayt += q.yuklama.length; q.yuklama = null; q.sovuq_id = k.id; }
        return { rows: [{ b: bayt }] };
      }
      if (sql.includes('t2_qator_muhr_isit_nomzod_v1')) {
        const natija = korsatkichlar.map((k) => ({ k, idlar: k.idlar.filter((i) => (opt.ozgargan ?? []).includes(i) && qatorlar.find((q) => q.id === i)?.sovuq_id === k.id) }))
          .filter((x) => x.idlar.length);
        return { rows: natija.map((x) => ({ sovuq_id: x.k.id, r2_key: x.k.key, r2_sha256: x.k.sha, idlar: x.idlar })) };
      }
      if (sql.includes('t2_qator_muhr_isit_v1')) {
        chaqiruvlar.push('isit');
        const k = korsatkichlar.find((x) => x.id === Number(p[0]))!;
        if (k.sha !== p[2] || (await sha256Hex(String(p[1]))) !== p[2]) throw new Error('isit: sha256 mos emas (DB)');
        const arr = JSON.parse(String(p[1])) as Array<{ id: number; y: string }>;
        const faqat = p[3] as unknown[] | null;
        let n = 0;
        for (const e of arr) {
          const q = qatorlar.find((x) => x.id === e.id);
          if (!q || q.sovuq_id !== k.id || (faqat && !faqat.map(Number).includes(e.id))) continue;
          q.yuklama = e.y; q.sovuq_id = undefined; n++;
        }
        return { rows: [{ n }] };
      }
      if (sql.includes('from public.t2_qator_muhr_sovuq e where exists')) {
        return { rows: korsatkichlar.filter((k) => qatorlar.some((q) => q.sovuq_id === k.id)).map((k) => ({ sovuq_id: k.id, r2_key: k.key, r2_sha256: k.sha })) };
      }
      throw new Error('kutilmagan SQL: ' + sql);
    },
  };
  return { db, chaqiruvlar, korsatkichlar };
}

export function soxtaR2(opt: { buzib?: boolean; putXato?: boolean; yoq?: boolean } = {}) {
  const x = new Map<string, Uint8Array>();
  const r2: R2 = {
    async put(k, v) { if (opt.putXato) throw new Error('R2 PUT yiqildi'); x.set(k, new Uint8Array(v)); },
    async get(k) {
      if (opt.yoq) return null;
      const v = x.get(k);
      if (!v) return null;
      return opt.buzib ? gzipSync(new TextEncoder().encode('boshqa mazmun')) : v;
    },
  };
  return { r2, x };
}

export const yasa = (n: number, obyekt = 1): Qator[] => Array.from({ length: n }, (_, i) => ({ id: 100 + i, obyekt, yuklama: `YUKLAMA-${i}-`.repeat(5) }));

