/**
 * fakt_qamrov — «Qamrov %» (Tiklash rejimi): bo'lim (rz) yoki ish (bl/mat/ob) bo'yicha bitta foiz → har ish va alohida mat/ob uchun
 * fakt = foiz × ochiq qoldiq. Mantiq — frontend/src/lib/fakt-qamrov.ts (qamrovReja/qamrovJami/qamrovBolaklari) + fakt-jurnal.jurnalQur;
 * yozuv — mavjud t2_fakt_yoz_v2 (rs normadan serverda ergashadi). UI'dan farqi: barcha bo'laklar BITTA tranzaksiyada.
 */
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { bolimTarkibi, jurnalQur, qamrovModul, type JurnalHolat, type JurnalIsh, type KatKesim } from '../frontend';
import { pul, summaJuft } from '../format';
import { holatlarOl, obyektBormi, qatorlarOl, ustamaOl } from '../malumot';
import { dryRun, obyektIdS, tool } from '../tool';
import { rpcChaqir } from './yozish';

type QQator = { id: number; tur: string; kod: string | null; nom: string; birlik: string | null; otaIshId: number | null; smeta: number | null; fakt: number; ochiq: number; hajm: number; summa: number | null; istisnolar: string[] };
type QReja = { foiz: number; qatorlar: QQator[]; yopiq: number; smetasiz: number };
type QJami = { paket: Array<{ qator_id: number; hajm: number }>; ustamasiz: number | null; kesim: KatKesim; narxsiz: number; istisnoSoni: Record<string, number> };

const ISTISNOLAR = ['faktli', 'zamenalangan', 'zamena', 'bajarilmaydi', 'narxsiz', 'chegirma'] as const;

export function qamrovMavjud(): boolean {
  const q = qamrovModul as { MAVJUD_EMAS?: boolean; qamrovReja?: unknown };
  return !q.MAVJUD_EMAS && typeof q.qamrovReja === 'function';
}

const bugun = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

export const faktQamrov = tool({
  nom: 'fakt_qamrov',
  tavsif: '«Qamrov %» — bo\'lim (rz) yoki ish (bl/mat/ob) `qamrov_id` bo\'yicha bitta `foiz` → har ish/alohida mat-ob uchun fakt = foiz × ochiq qoldiq (frontend lib/fakt-qamrov). '
    + 'Istisnolar (faktli, zamenalangan, zamena, bajarilmaydi, narxsiz, chegirma) faqat belgilanadi; `chiqarish_istisno` / `chiqarish` (qator id) bilan olib tashlang. '
    + 'Yozuv: t2_fakt_yoz_v2 (3000 qatordan katta — bir necha hujjat, bitta tranzaksiyada). Avval dry_run:true bilan ko\'ring.',
  kirish: {
    obyekt_id: obyektIdS,
    qamrov_id: z.number().int().positive().describe('bo\'lim (rz) yoki ish (bl / alohida mat-ob) id'),
    foiz: z.number().positive().max(1000),
    sana: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('fakt sanasi (standart — bugun)'),
    ichki_resurslar: z.boolean().optional().describe('ish ichidagi mat/ob ham shu foizda (standart true)'),
    chiqarish_istisno: z.array(z.enum(ISTISNOLAR)).optional(),
    chiqarish: z.array(z.number().int().positive()).optional(),
    izoh: z.string().max(500).optional(),
    korsat: z.number().int().min(0).max(5000).optional().describe('preview qatorlari soni (standart 40)'),
    dry_run: dryRun,
  },
  yozadi: true,
  bajar: async (a, mu) => {
    if (!qamrovMavjud()) throw new Error('Qamrov % mantig\'i (frontend/src/lib/fakt-qamrov.ts) bu build\'da yo\'q — fakt-tez PR main\'ga qo\'shilgach `npm run build` (mcp/smeta-mcp) qayta qiling. Hozircha `rpc t2_fakt_yoz_v2` bilan to\'g\'ridan-to\'g\'ri yozish mumkin.');
    const qm = qamrovModul as unknown as {
      qamrovReja: (ishlar: JurnalIsh[], foiz: number, holat: ReadonlyMap<number, JurnalHolat>, op: { ichkiResurslar?: boolean }) => QReja;
      qamrovJami: (r: QReja, chiq: ReadonlySet<number>) => QJami;
      qamrovBolaklari: <T>(p: readonly T[]) => T[][];
    };
    const aktor = mu.aktorKerak();
    return mu.yozish({ tool: 'fakt_qamrov', args: a, dryRun: a.dry_run, obyektId: a.obyekt_id, izoh: `qamrov #${a.qamrov_id} ${a.foiz}%` }, async (m, ogoh) => {
      await obyektBormi(m, a.obyekt_id);
      const [rows, states] = await Promise.all([qatorlarOl(m, a.obyekt_id), holatlarOl(m, a.obyekt_id)]);
      const almashtiradi = new Map<number, number>();
      for (const r of rows) if (r.replaces_line_id != null) almashtiradi.set(Number(r.id), Number(r.replaces_line_id));
      const almashtirilgan = new Map<number, number>();
      for (const s of states) if ((s.almashtirilgan_hajm ?? 0) > 0) almashtirilgan.set(Number(s.qator_id), Number(s.almashtirilgan_hajm));
      const fe = rows as unknown as Parameters<typeof jurnalQur>[0];
      const holatlar = states as unknown as JurnalHolat[];
      const { bolimlar, bolimIshlari } = jurnalQur(fe, holatlar, { almashtiradi, almashtirilgan });
      const nishon = rows.find((r) => Number(r.id) === a.qamrov_id);
      if (!nishon) throw new Error(`Qator #${a.qamrov_id} bu obyektda topilmadi.`);
      let ishlar: JurnalIsh[];
      let sarlavha: string;
      if (nishon.tur === 'rz') {
        ishlar = bolimTarkibi(a.qamrov_id, bolimlar, bolimIshlari).flatMap((b) => b.ishlar);
        sarlavha = bolimlar.find((b) => b.id === a.qamrov_id)?.nom ?? `bo'lim #${a.qamrov_id}`;
      } else {
        const ish = [...bolimIshlari.values()].flat().find((x) => x.id === a.qamrov_id);
        if (!ish) throw new Error(`#${a.qamrov_id} (${nishon.tur}) bo'lim ishi yoki alohida resurs emas — qamrov uchun bo'lim (rz) yoki ish (bl) tanlang.`);
        ishlar = [ish];
        sarlavha = [nishon.kod, nishon.nom].filter(Boolean).join(' ');
      }
      const holatMap = new Map(holatlar.map((s) => [s.qator_id, s]));
      const reja = qm.qamrovReja(ishlar, a.foiz, holatMap, { ichkiResurslar: a.ichki_resurslar ?? true });
      const chiq = new Set<number>(a.chiqarish ?? []);
      const chiqTur = new Set<string>(a.chiqarish_istisno ?? []);
      if (chiqTur.size) for (const q of reja.qatorlar) if (q.istisnolar.some((i) => chiqTur.has(i))) chiq.add(q.id);
      const jami = qm.qamrovJami(reja, chiq);
      const u = await ustamaOl(m, a.obyekt_id, aktor);
      const summa = summaJuft(jami.ustamasiz, u.hisobla(jami.kesim));
      const k = a.korsat ?? 40;
      const preview = {
        qamrov: { id: a.qamrov_id, tur: nishon.tur, sarlavha }, foiz: a.foiz, sana: a.sana ?? bugun(),
        yoziladi: jami.paket.length, yopiq: reja.yopiq, smetasiz: reja.smetasiz, narxsiz: jami.narxsiz, istisno_soni: jami.istisnoSoni,
        summa, qatorlar: reja.qatorlar.filter((q) => !chiq.has(q.id) && !(q.otaIshId != null && chiq.has(q.otaIshId))).slice(0, k)
          .map((q) => ({ id: q.id, tur: q.tur, kod: q.kod, nom: q.nom, birlik: q.birlik, smeta: q.smeta, fakt: q.fakt, ochiq: q.ochiq, yoziladi: q.hajm, summa: q.summa, ...(q.istisnolar.length ? { istisno: q.istisnolar } : {}) })),
      };
      if (!jami.paket.length) return { ...preview, yozildi: false, sabab: 'yoziladigan qator yo\'q' };
      const bolaklar = qm.qamrovBolaklari(jami.paket);
      const hujjatlar: unknown[] = [];
      for (let i = 0; i < bolaklar.length; i++) {
        const r = await rpcChaqir(m, 't2_fakt_yoz_v2', {
          p_obyekt_id: a.obyekt_id, p_sana: a.sana ?? bugun(), p_qatorlar: bolaklar[i], p_actor_id: aktor, p_operation_id: randomUUID(),
          p_izoh: (a.izoh ?? `Qamrov ${a.foiz}% — ${sarlavha}`) + (bolaklar.length > 1 ? ` (${i + 1}/${bolaklar.length})` : ''), p_raqam: null, p_actor_label: `mcp:actor:${aktor}`,
        }, () => aktor);
        const j = r.natija as { ok?: boolean } | null;
        if (j && j.ok === false) throw new Error(`t2_fakt_yoz_v2 rad etdi (bo'lak ${i + 1}): ${JSON.stringify(j).slice(0, 800)}`);
        hujjatlar.push(j);
      }
      if (summa.ustamasiz != null) ogoh.push(`fakt summasi ustamasiz ${pul(summa.ustamasiz)} (NDS siz)`);
      return { ...preview, yozildi: true, hujjatlar };
    });
  },
});
