/**
 * f2_import — lokal Excel F2 faylini import qilish. Mantiq F2ImportV3 sahifasi bilan bir xil (frontend sof modullari):
 *   readXlsx → f2AktlarniOqi → (smeta, Nakopitelniy qoldig'i, xotira imzolari, qoralamalarda band hajm) → f2MoslashV3
 *   → boshlangich + podvalTaklifQosh → [agent qarorlari: taklif_qabul / boglar / otkaz] → f2QoralamaYozish → exactWrite
 *   → dublikat tekshiruvi → t2_akt_yarat_v2 (qoralama akt; tasdiqlash — alohida, egasida).
 * UI dan farqi: React holati yo'q; operator qarorlari argument sifatida beriladi. dry_run — to'liq preview + ROLLBACK.
 *
 * AKTUAL SMETA (egasi 2026-11-11): moslash FAQAT faol (versiya_holat='faol') qatorlarga. Xotira imzolari va qo'lda boglar
 * eski (almashtirilgan) qatorga ishora qilsa — voris zanjiri bo'yicha faol qatorga yo'naltiriladi (lib/f2-moslash-v3/aktual);
 * zanjir yo'q bo'lsa — bog'lanmagan, sabab «eski versiya, aktual qator yo'q».
 * `maqsad: 'fakt'` — F2 qoralama o'rniga FAKT: delta = fayl hajmi − tizimdagi fakt (t2_akt tur='fakt'), faqat musbat delta, t2_fakt_yoz_v2.
 * Dry run har doim to'liq preview qaytaradi: yozish xatolari bitta istisno emas, qator bo'yicha (`qator_xatolari`) hisobotga tushadi.
 */
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import type { Mijoz } from '../db';
import {
  aktualQator, bloklarmi, bogniAktualla, boshlangich, dublikatTekshiruv, dvigatelDaraxti, ESKI_VERSIYA_SABAB, exactWrite, exactWriteIzohlar, f2AktlarniOqi, f2Indeks, f2MoslashV3, f2QoralamaYozish,
  f2RaqamNormal, faktDeltaReja, faktMavjudYigish, nakQoldiqXaritalari, pereraschetBelgisi, podvalTaklifQosh, qoralamaBandi, readXlsx, smetaIndeks, vorisXaritasi, xotiraniAktualla,
  type AQator, type DAkt, type FaktSatr, type IshJoyi, type SmetaQator,
} from '../frontend';
import { pul } from '../format';
import { xatoMatni } from '../maxfiy';
import { obyektBormi } from '../malumot';
import { dryRun, obyektIdS, tool } from '../tool';
import { rpcChaqir } from './yozish';

const F2_SMETA_USTUNLAR = 'id,obyekt_id,ota_id,daraja,tartib,tur,kod,nom,birlik,hajm,narx,kat,summa,narx_usul,qoshimcha,zamena,versiya,raqam,norma,versiya_holat';
type SRow = { id: number; ota_id: number | null; tur: string | null; kod: string | null; nom: string | null; birlik: string | null; hajm: number | null; narx: number | null; norma: number | null; tartib: number | null; kat: string | null; qoshimcha?: boolean; zamena?: boolean; versiya_holat?: string | null };

/** F2ImportV3.smetaQatorlari bilan bir xil. */
const smetaQatorlari = (rows: SRow[]): SmetaQator[] => rows.map((q) => ({ id: q.id, otaId: q.ota_id, tur: q.tur ?? 'rs', kod: q.kod, nom: q.nom, birlik: q.birlik, hajm: q.hajm, narx: q.narx, norma: q.norma ?? null, tartib: q.tartib, kat: q.kat }) as SmetaQator);

type AktQatorBand = { akt_id: number; qator_id: number; hajm: number | null; certified_quantity: number | null; raw_snapshot: { manba?: string; fayl?: string; varaq?: string; fayl_sha256?: string; qatorlar?: Array<{ imzo?: string }> } | null };

/** Nakopitelniy (faqat faol qatorlar) — barcha sahifalar. */
async function nakopitelniyToliq(m: Mijoz, obyektId: number, aktorId: number, davr: string) {
  const qatorlar: Array<{ qator_id: number; jami_hajm?: number | null; oldingi_hajm?: number | null; joriy_hajm?: number | null; smeta_hajm: number | null; almashtirilgan_hajm?: number | null }> = [];
  let offset: number | null = 0;
  type Javob = { n: { ok?: boolean; code?: string; qatorlar?: typeof qatorlar; keyingi_offset?: number | null } | null };
  for (let i = 0; offset != null && i < 200; i++) {
    const r: { rows: Javob[] } = await m.query<Javob>(
      'select public.t2_nakopitelniy_v2(p_obyekt_id => $1::bigint, p_actor_id => $2::bigint, p_davr => $3::date, p_limit => 5000, p_faqat_faol => true, p_offset => $4::int) as n',
      [obyektId, aktorId, davr, offset]);
    const n: Javob['n'] = r.rows[0]?.n ?? null;
    if (!n?.ok) throw new Error(`Nakopitelniy o'qilmadi: ${n?.code ?? 'noma\'lum'}`);
    qatorlar.push(...(n.qatorlar ?? []));
    offset = n.keyingi_offset ?? null;
  }
  return qatorlar;
}

export type YozishXato = { qator_id: number | null; sabab: string };

/** Xato matnidan qator idlarini ajratadi: «qatorlar [1,2,3]» yoki matndagi ma'lum idlar. */
export function xatoQatorIdlari(matn: string, bilinadi: ReadonlySet<number>): number[] {
  const qavs = /qatorlar?\s*\[([\d,\s]+)\]/i.exec(matn);
  const xom = qavs ? qavs[1].split(',').map((x) => Number(x.trim())) : (matn.match(/\b\d{2,}\b/g) ?? []).map(Number);
  return [...new Set(xom.filter((x) => Number.isFinite(x) && bilinadi.has(x)))];
}

/** RPC chaqiruvi SAVEPOINT ichida: xato — istisno emas, qator bo'yicha hisobot. */
async function saqlanganChaqiruv(m: Mijoz, nom: string, args: Record<string, unknown>, aktor: number, bilinadi: ReadonlySet<number>):
  Promise<{ ok: true; natija: Record<string, unknown> | null } | { ok: false; xato: string; qatorlar: number[] }> {
  await m.query('SAVEPOINT f2_import_yoz');
  try {
    const res = await rpcChaqir(m, nom, args, () => aktor);
    const j = res.natija && typeof res.natija === 'object' && !Array.isArray(res.natija) ? res.natija as Record<string, unknown> : null;
    if (j && j.ok === false) throw new Error(`${nom} rad etdi: ${JSON.stringify(j).slice(0, 800)}`);
    await m.query('RELEASE SAVEPOINT f2_import_yoz');
    return { ok: true, natija: j };
  } catch (e) {
    await m.query('ROLLBACK TO SAVEPOINT f2_import_yoz');
    const xato = xatoMatni(e);
    return { ok: false, xato, qatorlar: xatoQatorIdlari(xato, bilinadi) };
  }
}

export const f2Import = tool({
  nom: 'f2_import',
  tavsif: 'Lokal Excel F2 faylini import qilish (UI «F2 import V3» mantiqi): o\'qish → AKTUAL (faol) smeta bilan moslash → F2 qoralama akt (t2_akt_yarat_v2) yoki `maqsad:\'fakt\'` — FAKT delta. '
    + 'Avval dry_run:true bilan preview oling: aktlar (varaqlar), moslash statistikasi, mos (ishonch bilan), bog\'lanmagan (`qolgan`, sabab bilan) va ◐ taklif qatorlar (uid bilan); yozish xatosi bo\'lsa ham preview to\'liq qaytadi. '
    + 'Keyin qarorlar: `taklif_qabul:true` (hamma ◐ ni qabul), `boglar:[{uid,qator_id}]` (qo\'lda bog\'lash; eski qator berilsa — aktual voris), `otkaz:[uid]` (o\'tkazish). '
    + 'Faqat tasdiqlangan bog\'lanishlar yoziladi (qolgani yozilmaydi — partial). Dublikat (shu varaq avval yozilgan / shu raqam bor) — blok; `majburiy:true` — baribir urinish (baza triggeri ham tekshiradi). '
    + '`maqsad:\'fakt\'` — ekspertizadan oldingi qo\'lda F2/LRV fayllarini FAKT sifatida kiritish: har mos faol ish qatori uchun delta = fayl hajmi − tizimdagi fakt (almashtirilgan oldingi qatordagi fakt bilan birga); '
    + 'faqat musbat delta t2_fakt_yoz_v2 bilan yoziladi, qolgani «tizimda bor — yozilmaydi». Fakt smeta hajmidan oshsa — faqat ogohlantirish.',
  kirish: {
    obyekt_id: obyektIdS,
    fayl_yoli: z.string().min(1).describe('lokal .xlsx/.xls yo\'li'),
    varaq: z.union([z.string(), z.number().int().min(0)]).optional().describe('varaq nomi yoki akt indeksi (standart 0)'),
    oy: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional().describe('YYYY-MM (standart — fayldagi davr)'),
    raqam: z.string().max(100).optional().describe('F2 raqami (akt №)'),
    maqsad: z.enum(['f2', 'fakt']).optional().describe('f2 (standart) — F2 qoralama akt; fakt — faqat musbat delta fakt sifatida'),
    sana: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('maqsad=fakt: fakt sanasi (standart — bugun)'),
    taklif_qabul: z.boolean().optional(),
    boglar: z.array(z.object({ uid: z.string(), qator_id: z.number().int().positive() })).optional(),
    otkaz: z.array(z.string()).optional(),
    majburiy: z.boolean().optional(),
    korsat: z.number().int().min(0).max(2000).optional().describe('preview ro\'yxatlari uzunligi (standart 60)'),
    dry_run: dryRun,
  },
  yozadi: true,
  bajar: async (a, mu) => {
    const aktor = mu.aktorKerak();
    const bytes = await readFile(a.fayl_yoli);
    const sha = createHash('sha256').update(bytes).digest('hex');
    const fayl = path.basename(a.fayl_yoli);
    const kitob = await readXlsx(new Uint8Array(bytes));
    const aktlar = f2AktlarniOqi({ fayl, varaqlar: kitob.sheets.map((s) => ({ nom: s.name, rows: s.rows, merges: s.merges })) } as Parameters<typeof f2AktlarniOqi>[0]);
    if (!aktlar.length) throw new Error('Faylda F2 akti topilmadi.');
    const idx = typeof a.varaq === 'number' ? a.varaq : typeof a.varaq === 'string' ? aktlar.findIndex((x) => x.varaq === a.varaq) : 0;
    const akt = aktlar[idx];
    if (!akt) throw new Error(`Varaq/akt topilmadi: ${String(a.varaq)}. Mavjud: ${aktlar.map((x, i) => `${i}:${x.varaq}`).join(', ')}`);
    const davr = a.oy ?? akt.davr;
    if (!davr || !/^\d{4}-(0[1-9]|1[0-2])$/.test(davr)) throw new Error('Davr (oy) fayldan aniqlanmadi — `oy: "YYYY-MM"` bering.');
    const raqamN = f2RaqamNormal(a.raqam ?? '');
    const n = a.korsat ?? 60;
    const faktRejim = a.maqsad === 'fakt';

    return mu.yozish({ tool: 'f2_import', args: { ...a, fayl_sha256: sha }, dryRun: a.dry_run, obyektId: a.obyekt_id, izoh: `${fayl} / ${akt.varaq} / ${davr}${faktRejim ? ' / fakt' : ''}` }, async (m, ogoh) => {
      await obyektBormi(m, a.obyekt_id);
      const [smetaBarcha, nak, xot, aktR, moslikR] = await Promise.all([
        m.query<SRow>(`select ${F2_SMETA_USTUNLAR} from public.t2_qator where obyekt_id = $1 order by tartib nulls last, id`, [a.obyekt_id]),
        nakopitelniyToliq(m, a.obyekt_id, aktor, `${davr}-01`),
        m.query<AktQatorBand>('select akt_id, qator_id, hajm, certified_quantity, raw_snapshot from public.t2_akt_qator where obyekt_id = $1', [a.obyekt_id]),
        m.query<DAkt & { tur: string }>("select id, raqam, oy::text as oy, holat, tur, hujjat_jami, manba from public.t2_akt where obyekt_id = $1 and tur = 'f2'", [a.obyekt_id]),
        // Eski (almashtirilgan) → yangi (faol) qator: smeta versiyasini faollashtirishda yozilgan moslik (migratsiya 20261114700000).
        m.query<{ eski_id: number; yangi_id: number }>(
          `select (p.manba->>'qator_id')::bigint as eski_id, mo.qator_id as yangi_id
             from public.t2_smeta_versiya_moslik mo
             join public.t2_smeta_versiya v on v.id = mo.versiya_id
             join public.t2_smeta_versiya_pozitsiya p on p.id = mo.pozitsiya_id
            where v.obyekt_id = $1 and mo.qator_id is not null and mo.tasdiq <> 'rad' and (p.manba->>'qator_id') ~ '^[0-9]+$'`, [a.obyekt_id]),
      ]);
      // FAQAT faol qatorlar moslashga kiradi (versiya_holat yo'q — eski baza — faol).
      const hammaQator = smetaBarcha.rows;
      const r = hammaQator.filter((q) => q.versiya_holat !== 'almashtirilgan');
      const eskiSoni = hammaQator.length - r.length;
      const faolIds = new Set(r.map((q) => Number(q.id)));
      const barchaIds = new Set(hammaQator.map((q) => Number(q.id)));
      const aq: AQator[] = hammaQator.map((q) => ({ id: Number(q.id), otaId: q.ota_id == null ? null : Number(q.ota_id), kod: q.kod, nom: q.nom, birlik: q.birlik, faol: q.versiya_holat !== 'almashtirilgan' }));
      const voris = vorisXaritasi(aq, moslikR.rows.map((x) => ({ eskiId: Number(x.eski_id), yangiId: Number(x.yangi_id) })));

      const { qol } = nakQoldiqXaritalari(nak, r);
      const xotiraXom = new Map<string, number>();
      for (const q of xot.rows) { const s = q.raw_snapshot; if (s?.manba === 'f2_v3') for (const x of s.qatorlar ?? []) if (x.imzo) xotiraXom.set(x.imzo, q.qator_id); }
      const { xotira, tashlandi: xotiraTashlandi } = xotiraniAktualla(xotiraXom, faolIds, voris);
      const aktMap = new Map(aktR.rows.map((x) => [x.id, x]));
      const lines: Array<{ aktId: number; qatorId: number; hajm: number }> = [];
      const manbaAkt = new Set<number>();
      for (const q of xot.rows) {
        const k = aktMap.get(q.akt_id);
        if (k?.holat === 'qoralama') lines.push({ aktId: q.akt_id, qatorId: aktualQator(q.qator_id, faolIds, voris).qatorId ?? q.qator_id, hajm: Number(q.certified_quantity ?? q.hajm ?? 0) });
        const s = q.raw_snapshot;
        if (k && k.holat !== 'bekor' && s?.fayl && s.varaq === akt.varaq && (s.fayl_sha256 ? s.fayl_sha256 === sha : s.fayl === fayl)) manbaAkt.add(q.akt_id);
      }
      for (const [id, v] of qoralamaBandi(lines as Parameters<typeof qoralamaBandi>[0], null)) if (qol.has(id)) qol.set(id, qol.get(id)! - v);

      const S0 = smetaQatorlari(r);
      const natija = f2MoslashV3(dvigatelDaraxti(akt.daraxt), S0, { qoldiq: qol, xotira, rzBog: new Map() });
      const ind = f2Indeks(akt.daraxt);
      let ij: IshJoyi = podvalTaklifQosh(boshlangich(natija), ind.qatorlar, r as unknown as Parameters<typeof podvalTaklifQosh>[2]);
      // Agent qarorlari.
      let bog = new Map(ij.bog);
      const otkaz = new Set(ij.otkaz);
      const rad: Array<{ uid: string; eski_qator_id: number; sabab: string }> = [];
      if (a.taklif_qabul) for (const [uid, b] of bog) if (b.holat === 'taklif') bog.set(uid, { ...b, holat: 'qolda' });
      for (const b of a.boglar ?? []) {
        if (!ind.byUid.has(b.uid)) throw new Error(`F2 uid topilmadi: ${b.uid}`);
        if (!barchaIds.has(b.qator_id)) throw new Error(`Smeta qatori #${b.qator_id} bu obyektda yo'q.`);
        const ak = aktualQator(b.qator_id, faolIds, voris);
        if (ak.qatorId == null) { bog.delete(b.uid); rad.push({ uid: b.uid, eski_qator_id: b.qator_id, sabab: ak.sabab }); otkaz.delete(b.uid); continue; }
        bog.set(b.uid, { qatorId: ak.qatorId, holat: 'qolda', usul: ak.almashgan ? 'qolda:aktual_voris' : 'qolda' });
        otkaz.delete(b.uid);
      }
      for (const uid of a.otkaz ?? []) { if (!ind.byUid.has(uid)) throw new Error(`F2 uid topilmadi: ${uid}`); otkaz.add(uid); }
      // Xavfsizlik to'ri: bog'lanish qanday yo'l bilan kelmasin, faol qatorga keltiriladi.
      const ak = bogniAktualla(bog, faolIds, voris);
      bog = ak.bog;
      for (const x of ak.rad) rad.push({ uid: x.uid, eski_qator_id: x.eskiId, sabab: x.sabab });
      ij = { bog, otkaz };

      const yozish = f2QoralamaYozish(ind, ij, smetaIndeks(S0));
      const tugun = (uid: string) => { const t = ind.byUid.get(uid); return t ? { uid, tur: t.tur, kod: t.kod, nom: t.nom, birlik: t.birlik, hajm: t.hajm, narx: t.narx, summa: t.summa } : { uid }; };
      const smetaNom = new Map(r.map((q) => [Number(q.id), `${q.kod ?? ''} ${q.nom ?? ''}`.trim()]));
      const radSabab = new Map(rad.map((x) => [x.uid, x]));
      const takliflar = [...ij.bog].filter(([, b]) => b.holat === 'taklif').map(([uid, b]) => ({ ...tugun(uid), taklif_qator_id: b.qatorId, taklif: smetaNom.get(b.qatorId), usul: b.usul, sabab: natija.natijalar.get(uid)?.sabab ?? null }));
      // Mos qatorlar — ishonch bilan (aniq / xotira / qolda; ◐ takliflar alohida).
      const mos = [...ij.bog].filter(([, b]) => b.holat !== 'taklif').map(([uid, b]) => ({ ...tugun(uid), qator_id: b.qatorId, smeta: smetaNom.get(b.qatorId), ishonch: b.holat, usul: b.usul, sabab: natija.natijalar.get(uid)?.sabab ?? null }));
      const qolgan = yozish.qolgan.map((t) => ({ ...tugun(t.uid), sabab: radSabab.get(t.uid)?.sabab ?? natija.natijalar.get(t.uid)?.sabab ?? 'bog\'lanmadi (mos faol qator topilmadi)' }));
      const preview = {
        fayl, fayl_sha256: sha, maqsad: faktRejim ? 'fakt' : 'f2',
        aktlar: aktlar.map((x, i) => ({ i, varaq: x.varaq, davr: x.davr, sarlavha: x.hujjatSarlavhasi ?? null, pryamye: x.jami.pryamye, vsego: x.jami.vsego, qatorlar_jami: x.qatorlarJami, ishlar: x.ishlarSoni, barglar: x.barglarSoni, ogohlantirish: x.ogohlantirishlar.length })),
        tanlangan: { i: idx, varaq: akt.varaq, davr, raqam: raqamN || null, ogohlantirishlar: akt.ogohlantirishlar.slice(0, 20) },
        aktual: { faol_qatorlar: r.length, almashtirilgan_qatorlar: eskiSoni, voris_soni: voris.size, xotira_tashlandi: xotiraTashlandi,
          yonaltirilgan: ak.almashgan.slice(0, n), eski_versiya_rad: rad.slice(0, n) },
        moslash: natija.stat,
        yoziladi: yozish.nodes.length, qolgan_soni: yozish.qolgan.length, takliflar_soni: takliflar.length, mos_soni: mos.length,
        mos: mos.slice(0, n),
        qolgan: qolgan.slice(0, n),
        takliflar: takliflar.slice(0, n),
        toxtatish: yozish.toxtatish, yozish_ogohlantirish: yozish.ogohlantirish,
      };

      // ───────── FAKT rejimi ─────────
      if (faktRejim) {
        if (!yozish.nodes.length) return { ...preview, yozildi: false, sabab: 'tasdiqlangan bog\'lanish yo\'q (taklif_qabul / boglar bering)' };
        let rows: ReturnType<typeof exactWrite>;
        try { rows = exactWrite(yozish.nodes, yozish.mapping); }
        catch (e) { return { ...preview, yozildi: false, sabab: `fayl qatorlari hisoblanmadi: ${xatoMatni(e)}` }; }
        const faktR = await m.query<{ qator_id: number; hajm: number | null }>(
          "select aq.qator_id, aq.hajm from public.t2_akt_qator aq join public.t2_akt a on a.id = aq.akt_id where aq.obyekt_id = $1 and a.tur = 'fakt' and a.holat <> 'bekor'", [a.obyekt_id]);
        const { mavjud, yetim } = faktMavjudYigish(faktR.rows.map((x) => ({ qatorId: Number(x.qator_id), hajm: x.hajm == null ? null : Number(x.hajm) })), faolIds, voris);
        if (yetim) ogoh.push(`${yetim} ta mavjud fakt yozuvi eski qatorda, aktual vorisi yo'q — hisobga olinmadi.`);
        const rowMap = new Map(r.map((q) => [Number(q.id), q]));
        const satrlar: FaktSatr[] = rows.map((x) => {
          const q = rowMap.get(x.qatorId);
          const uid = [...ij.bog].find(([, b]) => b.qatorId === x.qatorId)?.[0];
          const b = uid ? ij.bog.get(uid) : undefined;
          return { qatorId: x.qatorId, tur: q?.tur ?? null, kod: q?.kod ?? null, nom: q?.nom ?? null, birlik: q?.birlik ?? null, faylHajm: Number(x.certifiedQuantity ?? 0), smetaHajm: q?.hajm ?? null, ishonch: b?.holat ?? null, usul: b?.usul ?? null };
        });
        const reja = faktDeltaReja(satrlar, mavjud);
        const faktPreview = {
          ...preview,
          fakt: {
            yoziladi_soni: reja.yoziladi.length, tizimda_bor_soni: reja.bor.length,
            yoziladi: reja.yoziladi.slice(0, n), tizimda_bor: reja.bor.slice(0, n),
            ogohlantirishlar: reja.yoziladi.filter((x) => x.ogohlantirish).slice(0, n).map((x) => ({ qator_id: x.qatorId, matn: x.ogohlantirish })),
          },
        };
        if (!reja.yoziladi.length) return { ...faktPreview, yozildi: false, sabab: 'yoziladigan musbat delta yo\'q (hammasi tizimda bor yoki bog\'lanmagan)' };
        const izoh = `F2/LRV fayldan fakt: ${fayl} / ${akt.varaq} / ${davr} (delta)`.slice(0, 500);
        const sana = a.sana ?? new Date().toISOString().slice(0, 10);
        const bilinadi = new Set(reja.yoziladi.map((x) => x.qatorId));
        let qolgan2 = reja.yoziladi;
        const qatorXatolari: YozishXato[] = [];
        let aktJ: Record<string, unknown> | null = null;
        for (let urinish = 0; urinish < 6 && qolgan2.length; urinish++) {
          const javob = await saqlanganChaqiruv(m, 't2_fakt_yoz_v2', { p_obyekt_id: a.obyekt_id, p_sana: sana, p_qatorlar: qolgan2.map((x) => ({ qator_id: x.qatorId, hajm: x.delta })), p_actor_id: aktor,
            p_operation_id: randomUUID(), p_izoh: izoh, p_raqam: a.raqam ?? null, p_actor_label: `mcp:actor:${aktor}` }, aktor, bilinadi);
          if (javob.ok) { aktJ = javob.natija; qolgan2 = []; break; }
          const buzuq = new Set(javob.qatorlar);
          if (!buzuq.size) { for (const x of qolgan2) qatorXatolari.push({ qator_id: x.qatorId, sabab: javob.xato.slice(0, 300) }); qolgan2 = []; break; }
          for (const id of buzuq) qatorXatolari.push({ qator_id: id, sabab: javob.xato.slice(0, 300) });
          qolgan2 = qolgan2.filter((x) => !buzuq.has(x.qatorId));
        }
        const yozilganSoni = reja.yoziladi.length - qatorXatolari.length;
        return { ...faktPreview, yozildi: yozilganSoni > 0 && qatorXatolari.length === 0 ? true : yozilganSoni > 0 ? 'qisman' : false, yozilgan_soni: yozilganSoni, qator_xatolari: qatorXatolari, akt: aktJ };
      }

      // ───────── F2 rejimi ─────────
      if (yozish.toxtatish.length) return { ...preview, yozildi: false, sabab: 'toxtatish — yozish manbasi to\'liq emas (yuqoridagi ro\'yxat)' };
      if (!yozish.nodes.length) return { ...preview, yozildi: false, sabab: 'tasdiqlangan bog\'lanish yo\'q (taklif_qabul / boglar bering)' };

      const rows = exactWrite(yozish.nodes, yozish.mapping);
      const izohlar = exactWriteIzohlar(yozish.nodes, yozish.mapping);
      const manba = new Map<number, Array<Record<string, unknown>>>();
      for (const nd of yozish.nodes) {
        const id = yozish.mapping.get(nd.uid)!;
        const asl = yozish.aslUid.get(nd.uid) ?? nd.uid;
        const tg = ind.byUid.get(asl)!;
        const arr = manba.get(id) ?? [];
        arr.push({ uid: asl, imzo: yozish.imzolar.get(nd.uid), kod: tg.kod, nom: tg.nom, birlik: tg.birlik, hajm: tg.hajm, narx: tg.narx, summa: tg.summa, bog: ij.bog.get(asl)?.usul,
          ...(asl !== nd.uid ? { taqsimHajm: nd.hajm, taqsimSumma: nd.summa ?? null } : {}) });
        manba.set(id, arr);
      }
      const jami = rows.some((x) => x.certifiedAmount != null) ? rows.reduce((s, x) => s + (x.certifiedAmount ?? 0), 0) : null;
      const masalalar = dublikatTekshiruv({ aktlar: aktR.rows, oy: davr, raqam: raqamN, jami, ozAktId: null, manbaAktIdlar: [...manbaAkt],
        pereraschet: pereraschetBelgisi(r as Parameters<typeof pereraschetBelgisi>[0], rows.map((x) => x.qatorId)) });
      const blok = bloklarmi(masalalar);
      for (const ms of masalalar) ogoh.push(`dublikat [${ms.daraja}/${ms.kod}]: ${ms.matn}`);
      const qatorlar = rows.map((q) => ({
        qator_id: q.qatorId, certified_quantity: q.certifiedQuantity,
        certified_unit_price: q.priceIntentionallyAbsent ? null : q.certifiedUnitPrice ?? null,
        certified_amount: q.priceIntentionallyAbsent ? null : q.certifiedAmount ?? null,
        price_intentionally_absent: q.priceIntentionallyAbsent === true, certified_source_hash: null,
        raw_snapshot: { manba: 'f2_v3', fayl, varaq: akt.varaq, fayl_sha256: sha, davr, qatorlar: manba.get(q.qatorId), import: 'mcp', partial: yozish.qolgan.length > 0, unresolved_count: yozish.qolgan.length },
        izoh: null,
      }));
      const tayyor = { ...preview, jami_summa: jami, jami_matn: pul(jami), exact_izohlar: izohlar.slice(0, 30), dublikat: masalalar };
      if (blok && !a.majburiy) return { ...tayyor, yozildi: false, sabab: 'dublikat blok — mavjud F2 ni tekshiring yoki majburiy:true' };
      const javob = await saqlanganChaqiruv(m, 't2_akt_yarat_v2', {
        p_obyekt_id: a.obyekt_id, p_oy: `${davr}-01`, p_qatorlar: qatorlar, p_actor_id: aktor, p_raqam: raqamN || null, p_operation_id: randomUUID(), p_manba: 'mcp_f2_import',
      }, aktor, barchaIds);
      // Yozish xatosi preview'ni yo'qotmaydi: qator bo'yicha hisobot (dry_run da ham to'liq javob).
      if (!javob.ok) {
        const idlar = javob.qatorlar;
        const qatorXatolari: YozishXato[] = idlar.length ? idlar.map((id) => ({ qator_id: id, sabab: id != null && !faolIds.has(id) ? ESKI_VERSIYA_SABAB : javob.xato.slice(0, 300) })) : [{ qator_id: null, sabab: javob.xato.slice(0, 500) }];
        return { ...tayyor, yozildi: false, sabab: 't2_akt_yarat_v2 rad etdi (yuqoridagi preview to\'liq)', qator_xatolari: qatorXatolari };
      }
      return { ...tayyor, yozildi: true, akt: javob.natija };
    });
  },
});
