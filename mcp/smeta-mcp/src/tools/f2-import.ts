/**
 * f2_import — lokal Excel F2 faylini import qilish. Mantiq F2ImportV3 sahifasi bilan bir xil (frontend sof modullari):
 *   readXlsx → f2AktlarniOqi → (smeta, Nakopitelniy qoldig'i, xotira imzolari, qoralamalarda band hajm) → f2MoslashV3
 *   → boshlangich + podvalTaklifQosh → [agent qarorlari: taklif_qabul / boglar / otkaz] → f2QoralamaYozish → exactWrite
 *   → dublikat tekshiruvi → t2_akt_yarat_v2 (qoralama akt; tasdiqlash — alohida, egasida).
 * UI dan farqi: React holati yo'q; operator qarorlari argument sifatida beriladi. dry_run — to'liq preview + ROLLBACK.
 */
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import type { Mijoz } from '../db';
import {
  bloklarmi, boshlangich, dublikatTekshiruv, dvigatelDaraxti, exactWrite, exactWriteIzohlar, f2AktlarniOqi, f2Indeks, f2MoslashV3, f2QoralamaYozish,
  f2RaqamNormal, nakQoldiqXaritalari, pereraschetBelgisi, podvalTaklifQosh, qoralamaBandi, readXlsx, smetaIndeks, type DAkt, type IshJoyi, type SmetaQator,
} from '../frontend';
import { pul } from '../format';
import { obyektBormi } from '../malumot';
import { dryRun, obyektIdS, tool } from '../tool';
import { rpcChaqir } from './yozish';

const F2_SMETA_USTUNLAR = 'id,obyekt_id,ota_id,daraja,tartib,tur,kod,nom,birlik,hajm,narx,kat,summa,narx_usul,qoshimcha,zamena,versiya,raqam,norma';
type SRow = { id: number; ota_id: number | null; tur: string | null; kod: string | null; nom: string | null; birlik: string | null; hajm: number | null; narx: number | null; norma: number | null; tartib: number | null; kat: string | null; qoshimcha?: boolean; zamena?: boolean };

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

export const f2Import = tool({
  nom: 'f2_import',
  tavsif: 'Lokal Excel F2 faylini import qilish (UI «F2 import V3» mantiqi): o\'qish → smeta bilan moslash → F2 qoralama akt (t2_akt_yarat_v2). '
    + 'Avval dry_run:true bilan preview oling: aktlar (varaqlar), moslash statistikasi, bog\'lanmagan (`qolgan`) va ◐ taklif qatorlar (uid bilan). '
    + 'Keyin qarorlar: `taklif_qabul:true` (hamma ◐ ni qabul), `boglar:[{uid,qator_id}]` (qo\'lda bog\'lash), `otkaz:[uid]` (o\'tkazish). '
    + 'Faqat tasdiqlangan bog\'lanishlar yoziladi (qolgani yozilmaydi — partial). Dublikat (shu varaq avval yozilgan / shu raqam bor) — blok; `majburiy:true` — baribir urinish (baza triggeri ham tekshiradi).',
  kirish: {
    obyekt_id: obyektIdS,
    fayl_yoli: z.string().min(1).describe('lokal .xlsx/.xls yo\'li'),
    varaq: z.union([z.string(), z.number().int().min(0)]).optional().describe('varaq nomi yoki akt indeksi (standart 0)'),
    oy: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional().describe('YYYY-MM (standart — fayldagi davr)'),
    raqam: z.string().max(100).optional().describe('F2 raqami (akt №)'),
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

    return mu.yozish({ tool: 'f2_import', args: { ...a, fayl_sha256: sha }, dryRun: a.dry_run, obyektId: a.obyekt_id, izoh: `${fayl} / ${akt.varaq} / ${davr}` }, async (m, ogoh) => {
      await obyektBormi(m, a.obyekt_id);
      const [smeta, nak, xot, aktR] = await Promise.all([
        m.query<SRow>(`select ${F2_SMETA_USTUNLAR} from public.t2_qator where obyekt_id = $1 order by tartib nulls last, id`, [a.obyekt_id]),
        nakopitelniyToliq(m, a.obyekt_id, aktor, `${davr}-01`),
        m.query<AktQatorBand>('select akt_id, qator_id, hajm, certified_quantity, raw_snapshot from public.t2_akt_qator where obyekt_id = $1', [a.obyekt_id]),
        m.query<DAkt & { tur: string }>("select id, raqam, oy::text as oy, holat, tur, hujjat_jami, manba from public.t2_akt where obyekt_id = $1 and tur = 'f2'", [a.obyekt_id]),
      ]);
      const r = smeta.rows;
      const { qol } = nakQoldiqXaritalari(nak, r);
      const xotira = new Map<string, number>();
      for (const q of xot.rows) { const s = q.raw_snapshot; if (s?.manba === 'f2_v3') for (const x of s.qatorlar ?? []) if (x.imzo) xotira.set(x.imzo, q.qator_id); }
      const aktMap = new Map(aktR.rows.map((x) => [x.id, x]));
      const lines: Array<{ aktId: number; qatorId: number; hajm: number }> = [];
      const manbaAkt = new Set<number>();
      for (const q of xot.rows) {
        const k = aktMap.get(q.akt_id);
        if (k?.holat === 'qoralama') lines.push({ aktId: q.akt_id, qatorId: q.qator_id, hajm: Number(q.certified_quantity ?? q.hajm ?? 0) });
        const s = q.raw_snapshot;
        if (k && k.holat !== 'bekor' && s?.fayl && s.varaq === akt.varaq && (s.fayl_sha256 ? s.fayl_sha256 === sha : s.fayl === fayl)) manbaAkt.add(q.akt_id);
      }
      for (const [id, v] of qoralamaBandi(lines as Parameters<typeof qoralamaBandi>[0], null)) if (qol.has(id)) qol.set(id, qol.get(id)! - v);

      const S0 = smetaQatorlari(r);
      const natija = f2MoslashV3(dvigatelDaraxti(akt.daraxt), S0, { qoldiq: qol, xotira, rzBog: new Map() });
      const ind = f2Indeks(akt.daraxt);
      let ij: IshJoyi = podvalTaklifQosh(boshlangich(natija), ind.qatorlar, r as unknown as Parameters<typeof podvalTaklifQosh>[2]);
      // Agent qarorlari.
      const bog = new Map(ij.bog);
      const otkaz = new Set(ij.otkaz);
      const smetaIds = new Set(r.map((q) => q.id));
      if (a.taklif_qabul) for (const [uid, b] of bog) if (b.holat === 'taklif') bog.set(uid, { ...b, holat: 'qolda' });
      for (const b of a.boglar ?? []) {
        if (!ind.byUid.has(b.uid)) throw new Error(`F2 uid topilmadi: ${b.uid}`);
        if (!smetaIds.has(b.qator_id)) throw new Error(`Smeta qatori #${b.qator_id} bu obyektda yo'q.`);
        bog.set(b.uid, { qatorId: b.qator_id, holat: 'qolda', usul: 'qolda' });
        otkaz.delete(b.uid);
      }
      for (const uid of a.otkaz ?? []) { if (!ind.byUid.has(uid)) throw new Error(`F2 uid topilmadi: ${uid}`); otkaz.add(uid); }
      ij = { bog, otkaz };

      const yozish = f2QoralamaYozish(ind, ij, smetaIndeks(S0));
      const tugun = (uid: string) => { const t = ind.byUid.get(uid); return t ? { uid, tur: t.tur, kod: t.kod, nom: t.nom, birlik: t.birlik, hajm: t.hajm, narx: t.narx, summa: t.summa } : { uid }; };
      const smetaNom = new Map(r.map((q) => [q.id, `${q.kod ?? ''} ${q.nom ?? ''}`.trim()]));
      const takliflar = [...ij.bog].filter(([, b]) => b.holat === 'taklif').map(([uid, b]) => ({ ...tugun(uid), taklif_qator_id: b.qatorId, taklif: smetaNom.get(b.qatorId), usul: b.usul }));
      const preview = {
        fayl, fayl_sha256: sha, aktlar: aktlar.map((x, i) => ({ i, varaq: x.varaq, davr: x.davr, sarlavha: x.hujjatSarlavhasi ?? null, pryamye: x.jami.pryamye, vsego: x.jami.vsego, qatorlar_jami: x.qatorlarJami, ishlar: x.ishlarSoni, barglar: x.barglarSoni, ogohlantirish: x.ogohlantirishlar.length })),
        tanlangan: { i: idx, varaq: akt.varaq, davr, raqam: raqamN || null, ogohlantirishlar: akt.ogohlantirishlar.slice(0, 20) },
        moslash: natija.stat,
        yoziladi: yozish.nodes.length, qolgan_soni: yozish.qolgan.length, takliflar_soni: takliflar.length,
        qolgan: yozish.qolgan.slice(0, n).map((t) => tugun(t.uid)),
        takliflar: takliflar.slice(0, n),
        toxtatish: yozish.toxtatish, yozish_ogohlantirish: yozish.ogohlantirish,
      };
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
      const res = await rpcChaqir(m, 't2_akt_yarat_v2', {
        p_obyekt_id: a.obyekt_id, p_oy: `${davr}-01`, p_qatorlar: qatorlar, p_actor_id: aktor, p_raqam: raqamN || null, p_operation_id: randomUUID(), p_manba: 'mcp_f2_import',
      }, () => aktor);
      const j = res.natija as { ok?: boolean; akt_id?: number } | null;
      if (j && j.ok === false) throw new Error(`t2_akt_yarat_v2 rad etdi: ${JSON.stringify(j).slice(0, 800)}`);
      return { ...tayyor, yozildi: true, akt: j };
    });
  },
});
