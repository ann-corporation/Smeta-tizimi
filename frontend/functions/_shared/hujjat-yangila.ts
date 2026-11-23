/**
 * hujjat-yangila.ts - «Hujjat doim tayyor» (egasi 2026-11-19): F-2 o'zgarsa rasmiy Excel fonda qayta yasalib Diskka YANGI VERSIYA (kalit f2:<akt_id>) yoziladi.
 *
 * Navbat SQL da (t2_hujjat_yangila_navbat: trigger + debounce 2 daqiqa + retry/backoff, migratsiya 20270119000001). Bu yerda faqat ISHLOVCHI:
 *   `navbatniIshla` - toza orkestrator (tarmoq `YangilaDeps` orqali; testlanadi), `haqiqiyDeps` - Worker amalga oshirishi.
 * TOKEN: fon yasash token YECHMAYDI (token yechish moduli umuman ishlatilmaydi). Token yuklab olish/paket vaqtida, mazmun kaliti (obyekt+oy+raqam) bo'yicha bir marta.
 * Boshqa turlar (forma3, nakopitelniy, m29, slichitelniy, ostatka): shu navbat, `hujjat-boshqa.ts` (hujjat-yarat bilan bir xil quruvchilar); manba_id kodlash - migratsiya 20270119000501.
 */
import { hmRpc, type HmEnv } from './hujjat-maydoni';
import { imzola } from './auth';
import { ichkiRejimda } from './hujjat-ichki';
import { Rad, f2DiskkaArxivlansinmi, f2Yasa, type F2Tayyor, type Tayyor } from './hujjat-f2';
import { boshqaTurMi, boshqaYasa, type BoshqaTur } from './hujjat-boshqa';
import { diskArxivla, type DiskArxivNatija, type DiskEnv } from './disk-yoz';
import { hujjatDizayniniYukla } from '../../src/api/f2-hujjat-kontekst';
import { mazmunXeshi } from '../../src/api/mazmun-xesh';
import { serverNashrQoy, nusxaBiriktir } from './hujjat-nashr';
import type { ImzoEnv } from './imzo';

export type NavbatQator = { id: number; tur: string; manba_id: number; kompaniya_id: number; obyekt_id: number | null; urinish: number; aktor_id: number | null };
export type TugatNatija = 'ok' | 'otkazildi' | 'xato';

export type YangilaDeps = {
  ol: (limit: number) => Promise<NavbatQator[]>;
  tugat: (id: number, natija: TugatNatija, xato?: string | null, versiya?: number | null) => Promise<void>;
  /** F-2 ni yasaydi (token YECHILMAYDI). Rad tashlashi mumkin. */
  yasaF2: (q: NavbatQator) => Promise<F2Tayyor>;
  /** F-3 / nakopitelniy / M-29 / slichitelniy / ostatka ni yasaydi (token YECHILMAYDI). */
  yasaBoshqa?: (q: NavbatQator & { tur: BoshqaTur }) => Promise<Tayyor>;
  /** Boshqa tur hujjatini Diskka yozadi. */
  yozBoshqa?: (q: NavbatQator, t: Tayyor) => Promise<DiskArxivNatija>;
  /** Diskka yozadi. */
  yoz: (q: NavbatQator, t: F2Tayyor) => Promise<DiskArxivNatija>;
  hozir?: () => number;
};
export type IshlaNatija = { korildi: number; yangilandi: number; otkazildi: number; xato: number; xatolar: string[] };

class FinishUnconfirmed extends Error {}

const qisqa = (e: unknown): string => (e instanceof Error ? e.message : String(e)).slice(0, 200);

/** Muddati kelgan navbatni ishlaydi. `byudjetMs` - umumiy vaqt chegarasi (Worker so'rov limiti); undan oshsa qolganlari navbatda qoladi (keyingi tick). */
export async function navbatniIshla(d: YangilaDeps, o: { limit?: number; byudjetMs?: number } = {}): Promise<IshlaNatija> {
  const hozir = d.hozir ?? Date.now;
  const boshi = hozir();
  const qatorlar = await d.ol(o.limit ?? 5);
  const n: IshlaNatija = { korildi: qatorlar.length, yangilandi: 0, otkazildi: 0, xato: 0, xatolar: [] };
  for (const q of qatorlar) {
    if (o.byudjetMs != null && hozir() - boshi > o.byudjetMs) { await d.tugat(q.id, 'xato', 'VAQT_BUDJETI', null); n.xato++; continue; }
    let phase = 'generate';
    try {
      if (boshqaTurMi(q.tur) && d.yasaBoshqa && d.yozBoshqa) {
        if (!q.aktor_id) { await d.tugat(q.id, 'xato', 'AKTOR_YOQ', null); n.xato++; n.xatolar.push(`${q.tur}#${q.manba_id}: AKTOR_YOQ`); continue; }
        const b = await d.yasaBoshqa(q as NavbatQator & { tur: BoshqaTur });
        if (!b.arxivla) { await d.tugat(q.id, 'otkazildi', 'arxivlanmaydi', null); n.otkazildi++; continue; }
        phase = 'archive';
        const rb = await d.yozBoshqa(q, b);
        if (!rb.ok || !rb.disk.ok) {
          const kod = !rb.ok ? rb.code : (rb.disk as { code?: string }).code ?? 'DISK_XATO';
          await d.tugat(q.id, 'xato', `disk:${kod}`, null); n.xato++; n.xatolar.push(`${q.tur}#${q.manba_id}: disk:${kod}`); continue;
        }
        await d.tugat(q.id, 'ok', null, rb.disk.versiya); n.yangilandi++; continue;
      }
      if (q.tur !== 'f2') { await d.tugat(q.id, 'otkazildi', `tur_qollanmaydi:${q.tur}`, null); n.otkazildi++; continue; }
      if (!q.aktor_id || !q.obyekt_id) { await d.tugat(q.id, 'xato', 'AKTOR_YOQ', null); n.xato++; n.xatolar.push(`#${q.manba_id}: AKTOR_YOQ`); continue; }
      const t = await d.yasaF2(q);
      if (!t.arxivla || !f2DiskkaArxivlansinmi(t.akt)) { await d.tugat(q.id, 'otkazildi', 'bekor_yoki_taxminiy', null); n.otkazildi++; continue; }
      phase = 'archive';
      const r = await d.yoz(q, t);
      if (!r.ok || !r.disk.ok) {
        const kod = !r.ok ? r.code : (r.disk as { code?: string }).code ?? 'DISK_XATO';
        await d.tugat(q.id, 'xato', `disk:${kod}`, null); n.xato++; n.xatolar.push(`#${q.manba_id}: disk:${kod}`); continue;
      }
      await d.tugat(q.id, 'ok', null, r.disk.versiya); n.yangilandi++;
    } catch (e) {
      if (e instanceof FinishUnconfirmed) { n.xato++; n.xatolar.push(`#${q.manba_id}: FINISH_UNCONFIRMED`); continue; }
      console.error(JSON.stringify({ hujjat_yangila: 'job_failed', queue_id: q.id, manba_id: q.manba_id,
        kompaniya_id: q.kompaniya_id, tur: q.tur, phase, urinish: q.urinish }));
      // Akt endi yo'q / boshqa kompaniya / bekor: qayta urinish befoyda.
      if (e instanceof Rad && (e.code === 'AKT_TOPILMADI' || e.status === 404 || (boshqaTurMi(q.tur) && ['HUJJAT_BOSH', 'F3_HISOBLANMADI', 'PARAMETR_YOQ'].includes(e.code)))) { await d.tugat(q.id, 'otkazildi', e.code, null).catch(() => undefined); n.otkazildi++; continue; }
      await d.tugat(q.id, 'xato', qisqa(e), null).catch(() => undefined); n.xato++; n.xatolar.push(`#${q.manba_id}: ${qisqa(e)}`);
    }
  }
  return n;
}

export type YangilaEnv = HmEnv & DiskEnv & { SESSIYA_KALIT: string };
type Ctx = { request: Request; env: YangilaEnv };

/** Worker: SQL RPC lari + ichki yuklovchilar (aktor sessiyasi serverda yasaladi; ruxsat DB dan yangidan olinadi - desktop/bff bilan bir xil usul). */
export function haqiqiyDeps(ctx: Ctx, o: { kompaniyaId?: number | null; turlar?: readonly string[] | null } = {}): YangilaDeps {
  const env = ctx.env;
  return {
    async ol(limit) {
      // v2: F-2 birinchi (og'ir ostatka/slichitelniy tez F-2 ni to'smaydi) + ixtiyoriy tur filtri (migratsiya 20270121000101).
      const r = await hmRpc(env, 't2_hujjat_yangila_ol_v2', { p_limit: limit, p_kompaniya: o.kompaniyaId ?? null, p_turlar: o.turlar?.length ? [...o.turlar] : null });
      if (!r.httpOk || r.body?.ok !== true || !Array.isArray(r.body.qatorlar)) throw new Error('NAVBAT_OL_RPC_XATO');
      return r.body.qatorlar as NavbatQator[];
    },
    async tugat(id, natija, xato, versiya) {
      try {
        const r = await hmRpc(env, 't2_hujjat_yangila_tugat_v1', { p_id: id, p_natija: natija, p_xato: xato ?? null, p_versiya: versiya ?? null });
        if (!r.httpOk || r.body?.ok !== true) throw new Error('NAVBAT_TUGAT_RPC_XATO');
      } catch {
        console.error(JSON.stringify({ hujjat_yangila: 'finish_unconfirmed', queue_id: id, natija }));
        throw new FinishUnconfirmed();
      }
    },
    async yasaF2(q) {
      const origin = new URL(ctx.request.url).origin;
      const cookie = await imzola({ rol: 'pto', foydalanuvchi_id: q.aktor_id as number }, env.SESSIYA_KALIT);
      const request = new Request(origin + '/', { headers: { Cookie: 'sess=' + cookie, Origin: origin, 'Sec-Fetch-Site': 'same-origin' } });
      return ichkiRejimda({ ...ctx, request }, async () => {
        await hujjatDizayniniYukla(q.kompaniya_id);
        return f2Yasa(q.kompaniya_id, q.obyekt_id as number, q.manba_id);
      }).then((t) => f2gaQrQosh(env, origin, q, t));
    },
    async yasaBoshqa(q) {
      const origin = new URL(ctx.request.url).origin;
      const cookie = await imzola({ rol: 'pto', foydalanuvchi_id: q.aktor_id as number }, env.SESSIYA_KALIT);
      const request = new Request(origin + '/', { headers: { Cookie: 'sess=' + cookie, Origin: origin, 'Sec-Fetch-Site': 'same-origin' } });
      return ichkiRejimda({ ...ctx, request }, async () => { await hujjatDizayniniYukla(q.kompaniya_id); return boshqaYasa(q); });
    },
    yozBoshqa: async (q, t) => diskArxivla(env, { actorId: q.aktor_id as number, kompaniyaId: q.kompaniya_id, obyektId: t.obyektId, turi: t.turi, faylNomi: t.faylNomi, bytes: t.bytes, davr: t.davr, xesh: await mazmunXeshi(t.bytes), manba: t.manba }),
    /* Disk operatsiya kaliti MAZMUN xeshi (token kaliti emas: u obyekt+oy+raqam, o'zgarishda bir xil qolardi -> yangi versiya yozilmasdi).
       Mazmun o'zgarmagan bo'lsa - bir xil operatsiya (versiya ortmaydi), o'zgargan bo'lsa - yangi versiya. */
    yoz: async (q, t) => {
      const r = await diskArxivla(env, { actorId: q.aktor_id as number, kompaniyaId: q.kompaniya_id, obyektId: q.obyekt_id as number, turi: t.turi, faylNomi: t.faylNomi, bytes: t.bytes, davr: t.davr, xesh: t.nashr?.mazmunXesh ?? await mazmunXeshi(t.bytes), manba: t.manba });
      // QR li nusxa registry ga tushdi -> nashrga biriktiriladi (QR /t/<token> orqali nusxa yuklanadi). Xato hujjatni yiqitmaydi.
      if (r.ok && t.nashr?.nusxaKerak) await nusxaBiriktir(env, q.aktor_id as number, t.nashr.token, r.documentId).catch(() => false);
      return r;
    },
  };
}

/** Fon F-2 ga ham brauzer eksporti kabi QR (`/t/<token>`, texnadzor tekshiruvi) qo'yiladi - bir xil `nashrQoy` yo'li. Xato bo'lsa QR siz (hujjat to'xtamaydi). */
export async function f2gaQrQosh(env: ImzoEnv, origin: string, q: Pick<NavbatQator, 'kompaniya_id' | 'obyekt_id' | 'manba_id' | 'aktor_id'>, t: F2Tayyor): Promise<F2Tayyor> {
  try {
    const mazmunXesh = await mazmunXeshi(t.bytes);
    const n = await serverNashrQoy(env, t.bytes, t.faylNomi, { actorId: q.aktor_id as number, kompaniyaId: q.kompaniya_id, obyektId: q.obyekt_id as number, origin, turi: 'f2', atama: t.faylNomi.replace(/\.[A-Za-z0-9]+$/, ''), aktId: q.manba_id });
    return n ? { ...t, bytes: n.bytes, nashr: { token: n.token, nusxaKerak: n.nusxaKerak, mazmunXesh } } : t;
  } catch { return t; }
}
