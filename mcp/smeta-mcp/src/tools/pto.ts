/**
 * PTO QAMROVI (v1) — web ilovada PTO bajaradigan, lekin MCP'da faqat xom `rpc`/`sql_yozish` bilan qilinadigan amallar uchun toollar.
 * Uslub `tools/ish-oqimi.ts` bilan bir xil: mavjud SECURITY DEFINER RPC, obyekt bo'yicha tranzaksiya → avtomatik snapshot → amal →
 * bazadagi audit → COMMIT; yozuvchilarda `dry_run` STANDART TRUE (server tekshiruvlari bilan ROLLBACK). Aktor — SMETA_AKTOR_ID / aktor_tanla.
 * Pul: QQS siz; ustamasiz / ustamali (ИТОГО-4) / QQS bilan — t2_obyekt_nakrutka kf_*. null — noma'lum (0 emas).
 */
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Mijoz } from '../db';
import { f2HujjatManba, Kesim, uuidHosila, xatoIzoh, y2, y6, yukJami, type MavjudAktQator } from '../ish-oqimi';
import { obyektBormi } from '../malumot';
import { xatoMatni } from '../maxfiy';
import { avlodlar, bolimXarita, f2CertYuki, f2YangilaYuki, moslash, tarixTahlil, type DaraxtQator, type SmetaQ, type TarixRef } from '../pto';
import { obyektIdS, tool } from '../tool';
import {
  aktOl, dryRunT, KAT, korsatS, mumkinOl, nkOl, obyektlarS, opS, oyS, qisqa, quruq, rpcOk, sanaS, uch, type NkRow,
} from './ish-oqimi';

const ndsOl = (nk: NkRow | null) => { const v = nk?.koeffitsientlar?.['НДС']; return v == null || v === '' ? null : Number(v); };
const resursS = z.object({
  nom: z.string().min(1).max(1000), birlik: z.string().min(1).max(50), kat: z.enum(KAT).optional(), norma: z.number().positive().optional(), hajm: z.number().optional(),
  narx: z.number().min(0).optional(), narx_manba: z.string().max(40).optional(), kod: z.string().max(100).optional(),
});
type Daraxt = DaraxtQator & { tartib?: number | null };
async function daraxtOl(m: Mijoz, obyektId: number): Promise<Daraxt[]> {
  return (await m.query<Daraxt>('select id, ota_id, tur, nom, tartib from public.t2_qator where obyekt_id = $1', [obyektId])).rows
    .map((r) => ({ ...r, id: Number(r.id), ota_id: r.ota_id == null ? null : Number(r.ota_id) }));
}
const num = (v: unknown) => (v == null || v === '' ? null : Number(v));

// ───────────────────────────── 1. zamena_qosh ─────────────────────────────

export const zamenaQosh = tool({
  nom: 'zamena_qosh',
  tavsif: 'ZAMENA (almashtirish) — asl smeta qatori o\'rniga yangi ish yoki resurs (t2_ish_abc_saqla_v1). `rejim:"ish"` (command replacement): `almashtirilayotgan_qator_id` (ish/resurs), '
    + '`ish {nom, birlik, hajm, kod?}`, `resurslar [{nom, birlik, kat?, norma?|hajm?, narx?, narx_manba?, kod?}]` (≤60; norma — ish birligiga, rs; normasiz — mat/ob), ixtiyoriy `fakt_hajm`+`sana`. '
    + 'Takror zamena (shu kod/birlik/nom) — mavjud qator qayta ishlatiladi (server zamena_qozon). `rejim:"resurs"` (resurs_zamena) — rs/mat/ob o\'rniga BITTA resurs (`resurslar[0]`). '
    + 'Ota va kutilgan versiya avtomatik (almashtirilayotgan qatorning otasi). `almashtirish_hajm` — birlik farqli bo\'lsa aslning qancha hajmini qoplashi (t2_zamena_almashtirish_belgila_v1). '
    + '`sabab` majburiy. Asl qator o\'zgarmaydi; javobda asl qatorning qoldig\'i oldin→keyin (almashtirilgan_hajm).',
  kirish: {
    obyekt_id: obyektIdS, almashtirilayotgan_qator_id: z.number().int().positive(), rejim: z.enum(['ish', 'resurs']).optional().describe('standart: asl qator bl bo\'lsa "ish", rs/mat/ob bo\'lsa "resurs"'),
    ish: z.object({ nom: z.string().min(1).max(1000), birlik: z.string().min(1).max(50), hajm: z.number().refine((v) => v !== 0, 'hajm 0 bo\'lmasin'), kod: z.string().max(100).optional() }).optional(),
    resurslar: z.array(resursS).max(60).optional(), fakt_hajm: z.number().positive().optional(), sana: sanaS.optional(),
    almashtirish_hajm: z.number().positive().optional(), sabab: z.string().min(3).max(1000), operation_id: opS, dry_run: dryRunT,
  },
  yozadi: true,
  bajar: async (a, mu) => {
    const aktor = mu.aktorKerak(); const dry = quruq(a.dry_run); const asos = a.operation_id ?? randomUUID();
    return mu.yozish({ tool: 'zamena_qosh', args: a, dryRun: dry, obyektId: a.obyekt_id, izoh: `#${a.almashtirilayotgan_qator_id} ← ${(a.ish?.nom ?? a.resurslar?.[0]?.nom ?? '').slice(0, 80)}` }, async (m, ogoh) => {
      const ob = await obyektBormi(m, a.obyekt_id);
      type AslRow = { id: number; ota_id: number | null; tur: string; kod: string | null; nom: string | null; birlik: string | null; versiya_holat: string | null };
      const asl = (await m.query<AslRow>('select id, ota_id, tur, kod, nom, birlik, versiya_holat from public.t2_qator where id = $1 and obyekt_id = $2', [a.almashtirilayotgan_qator_id, a.obyekt_id])).rows[0];
      if (!asl) throw new Error(`qator #${a.almashtirilayotgan_qator_id} bu obyektda yo'q`);
      if ((asl.versiya_holat ?? 'faol') !== 'faol') throw new Error(`qator #${asl.id} faol versiyada emas (${asl.versiya_holat}) — yangi versiya qatorini almashtiring`);
      const rejim = a.rejim ?? (asl.tur === 'bl' ? 'ish' : 'resurs');
      if (rejim === 'resurs') {
        if (!['rs', 'mat', 'ob'].includes(asl.tur)) throw new Error(`rejim "resurs": almashtiriladigan qator resurs (rs/mat/ob) bo'lsin, bu — ${asl.tur}`);
        if (a.resurslar?.length !== 1) throw new Error('rejim "resurs": `resurslar` da aynan bitta resurs bering');
        if (a.ish) ogoh.push('rejim "resurs": `ish` e\'tiborga olinmadi');
      } else {
        if (!a.ish) throw new Error('rejim "ish": `ish {nom, birlik, hajm}` majburiy');
        for (const [i, r] of (a.resurslar ?? []).entries()) if (r.norma == null && (r.hajm == null || r.hajm === 0)) throw new Error(`resurs ${i + 1}: norma (>0) yoki aniq hajm (≠0) kerak`);
      }
      const holatOl = async () => (await m.query<{ qoldiq_hajm: number | null; almashtirilgan_hajm: number | null; smeta_hajm: number | null }>(
        'select qoldiq_hajm, almashtirilgan_hajm, smeta_hajm from public.t2_qator_holat where qator_id = $1', [asl.id])).rows[0] ?? null;
      const oldin = await holatOl();
      let versiya: number | null = null;
      if (rejim === 'ish' && asl.ota_id != null) versiya = Number((await m.query<{ versiya: number }>('select versiya from public.t2_qator where id = $1', [asl.ota_id])).rows[0]?.versiya ?? 0);
      const res = await rpcOk(m, 't2_ish_abc_saqla_v1', {
        p_actor_id: aktor, p_kompaniya_id: Number(ob.kompaniya_id), p_obyekt_id: a.obyekt_id, p_command: rejim === 'ish' ? 'replacement' : 'resurs_zamena',
        p_ota_qator_id: rejim === 'ish' ? asl.ota_id : null, p_almashtirilayotgan_qator_id: asl.id, p_ish: rejim === 'ish' ? a.ish : null, p_resurslar: a.resurslar ?? [],
        p_fakt_hajm: rejim === 'ish' ? a.fakt_hajm ?? null : null, p_sana: a.sana ?? null, p_sabab: a.sabab, p_operation_id: uuidHosila(asos, 'zamena'), p_kutilgan_versiya: versiya,
      }, aktor);
      const yangiId = num(res.qator_id);
      let belgi: Record<string, unknown> | undefined;
      if (a.almashtirish_hajm != null && yangiId != null) {
        belgi = await rpcOk(m, 't2_zamena_almashtirish_belgila_v1', { p_actor_id: aktor, p_kompaniya_id: Number(ob.kompaniya_id), p_qator_id: yangiId, p_hajm: a.almashtirish_hajm }, aktor);
      }
      const keyin = await holatOl();
      return {
        rejim, asl: { qator_id: asl.id, tur: asl.tur, kod: asl.kod, nom: qisqa(asl.nom, 60), birlik: asl.birlik }, qator_id: yangiId, resurs_ids: res.resurs_ids ?? res.resurs_idlar ?? [],
        ...(res.qayta_ishlatildi || res.takror ? { qayta_ishlatildi: true } : {}), change_id: res.change_id ?? null,
        asl_holat: { oldin, keyin }, ...(belgi ? { almashtirish_hajm: a.almashtirish_hajm } : {}),
      };
    });
  },
});

// ───────────────────────────── 2. ish_ochir ─────────────────────────────

export const ishOchir = tool({
  nom: 'ish_ochir',
  tavsif: 'Qo\'shilgan ish / zamena / qo\'shimcha resursni (va avlodlarini) o\'chirish — asliga qaytarish. Asl smeta qatori o\'chirilmaydi (SMETA_QATORI_OZGARMAS). '
    + 'Hujjat tarixi tekshiriladi: F2 (bekor emas, qoralama ham) da bo\'lsa — rad (avval F2 dan olib tashlang: f2_qoralama_tahrir olib_tashla / bekor). '
    + 'Fakt yozuvlari har qator bo\'yicha SOF NOL bo\'lsa (masalan +5 va −5) — xavfsiz tozalanadi: t2_ish_abc_ochir_v1 fakt qatorlarini t2_qator_ochirilgan ga arxivlab o\'chiradi. '
    + 'Sof fakt nol emas — rad (avval `fakt_yoz` bilan −delta, yoki ongli `fakt_bilan:true` — fakt ham arxivlanib o\'chadi). Tarixsiz qator — t2_ish_abc_ochir_v2 (versiya bilan). `sabab` majburiy.',
  kirish: {
    obyekt_id: obyektIdS, qator_id: z.number().int().positive(), sabab: z.string().min(3).max(1000),
    fakt_bilan: z.boolean().optional().describe('true — sof fakt nol bo\'lmasa ham fakt yozuvlari arxivlanib o\'chiriladi (ehtiyot bo\'ling)'),
    kutilgan_versiya: z.number().int().optional(), operation_id: opS, dry_run: dryRunT,
  },
  yozadi: true,
  bajar: async (a, mu) => {
    const aktor = mu.aktorKerak(); const dry = quruq(a.dry_run);
    return mu.yozish({ tool: 'ish_ochir', args: a, dryRun: dry, obyektId: a.obyekt_id, izoh: `#${a.qator_id}: ${a.sabab.slice(0, 100)}` }, async (m, ogoh) => {
      const ob = await obyektBormi(m, a.obyekt_id);
      type QRow = { id: number; ota_id: number | null; tur: string; nom: string | null; versiya: number; qoshimcha: boolean | null; zamena: boolean | null; replaces_line_id: number | null; change_type: string | null };
      const q = (await m.query<QRow>('select id, ota_id, tur, nom, versiya, qoshimcha, zamena, replaces_line_id, change_type from public.t2_qator where id = $1 and obyekt_id = $2', [a.qator_id, a.obyekt_id])).rows[0];
      if (!q) throw new Error(`qator #${a.qator_id} bu obyektda yo'q`);
      if (!q.qoshimcha) throw new Error('SMETA_QATORI_OZGARMAS — bu asl smeta qatori; faqat qo\'shilgan ish/zamena o\'chiriladi (asl qatorga «bajarilmadi» belgisi qo\'ying).');
      const ids = [...avlodlar(await daraxtOl(m, a.obyekt_id), q.id)];
      const refs = (await m.query<TarixRef>(`select aq.qator_id, aq.akt_id, a.tur, a.holat, coalesce(aq.certified_quantity, aq.hajm) as hajm
                                              from public.t2_akt_qator aq join public.t2_akt a on a.id = aq.akt_id where aq.qator_id = any($1::bigint[])`, [ids])).rows
        .map((r) => ({ ...r, qator_id: Number(r.qator_id), akt_id: Number(r.akt_id), hajm: num(r.hajm) }));
      const t = tarixTahlil(refs);
      if (t.f2_aktlar.length) throw new Error(`F2_DA — qator(lar) F2 aktida: ${t.f2_aktlar.map((x) => `#${x}`).join(', ')}. Qoralamadan olib tashlang (f2_qoralama_tahrir olib_tashla) yoki F2 ni bekor qiling; tasdiqlangan F2 — tuzatish hujjati.`);
      if (t.boshqa_aktlar.length) throw new Error(`QATOR_TARIXDA — boshqa turdagi hujjatlarda: ${t.boshqa_aktlar.join(', ')}`);
      if (t.nolmas.length && !a.fakt_bilan) {
        throw new Error(`FAKT_NOL_EMAS — ${t.nolmas.length} qatorda sof fakt bor (${t.nolmas.slice(0, 10).map((x) => `#${x.qator_id}: ${x.net}`).join('; ')}). `
          + 'Avval fakt_yoz bilan −delta yozing yoki ongli fakt_bilan:true.');
      }
      const k = Number(ob.kompaniya_id);
      let res: Record<string, unknown>; let yol: string;
      if (t.toza) {
        yol = 't2_ish_abc_ochir_v2';
        res = await rpcOk(m, yol, { p_actor_id: aktor, p_kompaniya_id: k, p_obyekt_id: a.obyekt_id, p_qator_id: q.id, p_kutilgan_versiya: a.kutilgan_versiya ?? Number(q.versiya), p_sabab: a.sabab, p_operation_id: a.operation_id ?? randomUUID() }, aktor);
      } else {
        if (a.kutilgan_versiya != null && a.kutilgan_versiya !== Number(q.versiya)) throw new Error(`STALE_VERSION — ${xatoIzoh('STALE_VERSION').split(' — ')[1]} (bazada ${q.versiya})`);
        yol = 't2_ish_abc_ochir_v1';
        if (t.nolmas.length) ogoh.push(`fakt_bilan: ${t.nolmas.length} qatorning sof fakti arxivlanib o'chirildi`);
        res = await rpcOk(m, yol, { p_actor_id: aktor, p_kompaniya_id: k, p_obyekt_id: a.obyekt_id, p_qator_id: q.id, p_sabab: a.sabab, p_operation_id: a.operation_id ?? randomUUID() }, aktor);
      }
      return {
        qator_id: q.id, tur: q.tur, nom: qisqa(q.nom, 60), turi: q.zamena || q.replaces_line_id != null ? 'zamena' : 'qoshimcha', yol,
        ochirildi: res.ochirildi ?? ids.length, fakt_arxivlandi: res.fakt_ochirildi ?? 0, fakt_aktlar: t.fakt_aktlar.length, ...(res.bekor_f2_arxivlandi ? { bekor_f2_arxivlandi: res.bekor_f2_arxivlandi } : {}),
        ota_id: res.ota_id ?? q.ota_id,
      };
    });
  },
});

// ───────────────────────────── 3. f2_qoralama_yangila ─────────────────────────────

export const f2QoralamaYangila = tool({
  nom: 'f2_qoralama_yangila',
  tavsif: 'F2 QORALAMA(lar)ni joriy fakt qoldig\'idan qayta qurish (t2_f2_qoralama_yangila_v1, kutilgan versiya bilan): har qator hajmi = t2_qator_holat.f2_mumkin_hajm («bajarilmadi» chiqarilgan), '
    + 'qoldig\'i qolmagan qatorlar olinadi; storno qatorlari tegilmaydi; boshqa ochiq qoralamalardagi hajm ayiriladi (ikki marta olinmaydi). Narx qoidasi `narx_qoida` (standart "max"): max(smeta narxi, `narxlar` {qator_id: xarid narxi QQS siz}); '
    + '"smeta" / "berilgan" — ustunlik. Ish (bl) narxsiz; narxi yo\'q resurs — avto narxsiz. `qosh_yangi:true` — qoralamada yo\'q fakt qatorlari ham qo\'shiladi (standart — faqat mavjudlari); `mavjud_narx_saqla:true` — qoralamadagi narxli qator narxi saqlanadi. '
    + 'Javob: oldin/keyin qator va summa (ustamasiz/ustamali/QQS bilan).',
  kirish: {
    akt_idlar: z.array(z.number().int().positive()).min(1).max(100),
    narxlar: z.record(z.string().regex(/^\d+$/), z.number().min(0)).optional(), narx_qoida: z.enum(['max', 'smeta', 'berilgan']).optional(),
    qosh_yangi: z.boolean().optional().describe('true — qoralamada yo\'q, lekin fakt qoldig\'i bor qatorlar ham qo\'shiladi (standart false — faqat mavjud qatorlar yangilanadi/olinadi)'),
    mavjud_narx_saqla: z.boolean().optional(), operation_id: opS, dry_run: dryRunT,
  },
  yozadi: true,
  bajar: async (a, mu) => {
    const aktor = mu.aktorKerak(); const dry = quruq(a.dry_run); const asos = a.operation_id ?? randomUUID();
    const out: Array<Record<string, unknown>> = [];
    const korilganObyekt = new Map<number, number>();
    for (const aktId of a.akt_idlar) {
      try {
        const r = await mu.yozish({ tool: 'f2_qoralama_yangila', args: { ...a, akt_id: aktId }, dryRun: dry, obyektId: async (m) => (await aktOl(m, aktId)).obyekt_id, izoh: `akt #${aktId}` }, async (m, ogoh) => {
          const akt = await aktOl(m, aktId);
          if (akt.tur !== 'f2') throw new Error(`Akt #${aktId} F2 emas (${akt.tur}).`);
          if (akt.holat !== 'qoralama' || !['draft', 'rejected'].includes(akt.lifecycle_status ?? 'draft')) throw new Error(`AKT_QORALAMA_EMAS — ${xatoIzoh('AKT_QORALAMA_EMAS').split(' — ')[1]} (holat ${akt.holat}/${akt.lifecycle_status}).`);
          const avval = korilganObyekt.get(akt.obyekt_id);
          if (avval != null) throw new Error(`obyekt #${akt.obyekt_id} uchun akt #${avval} allaqachon yangilandi — bitta obyektda bitta qoralama yangilanadi (hajm ikki marta olinmasin).`);
          korilganObyekt.set(akt.obyekt_id, aktId);
          const boshqa = (await m.query<{ id: number }>(`select id from public.t2_akt where obyekt_id = $1 and tur = 'f2' and holat = 'qoralama' and id <> $2
              and coalesce(lifecycle_status,'draft') not in ('cancelled','superseded','approved')`, [akt.obyekt_id, aktId])).rows.map((x) => Number(x.id));
          const band = new Map<number, number>();
          if (boshqa.length) {
            for (const b of (await m.query<{ qator_id: number; h: number }>('select qator_id, sum(coalesce(certified_quantity, hajm))::numeric as h from public.t2_akt_qator where akt_id = any($1::bigint[]) group by qator_id', [boshqa])).rows) band.set(Number(b.qator_id), Number(b.h ?? 0));
            ogoh.push(`obyektda boshqa ochiq qoralama(lar): ${boshqa.map((x) => `#${x}`).join(', ')} — ularning hajmi (${band.size} qator) fakt qoldig'idan ayirildi`);
          }
          const mavjud = (await m.query<MavjudAktQator>(`select qator_id, hajm, certified_quantity, certified_unit_price, certified_amount, provenance_status, certified_source_hash, raw_snapshot, izoh, manba_akt_qator_id
                                                           from public.t2_akt_qator where akt_id = $1 order by id`, [aktId])).rows.map((x) => ({ ...x, qator_id: Number(x.qator_id) }));
          const { rows, bajHisobda } = await mumkinOl(m, akt.obyekt_id);
          if (!bajHisobda) ogoh.push('t2_qator_bajarilmadi jadvali yo\'q — «bajarilmadi» filtri qo\'llanmadi');
          const qolgan = rows.map((r) => (band.has(r.qator_id) ? { ...r, mumkin: y6(r.mumkin - band.get(r.qator_id)!) } : r));
          const y = f2YangilaYuki(mavjud, qolgan, { manba: f2HujjatManba(akt.raqam), narxlar: a.narxlar, qoida: a.narx_qoida, faqatMavjud: a.qosh_yangi !== true, mavjudNarxSaqla: a.mavjud_narx_saqla });
          if (!y.yuk.length) throw new Error('yangilangan qoralamada qator qolmaydi (fakt qoldig\'i yo\'q) — F2 ni bekor qiling (f2_holat cancelled yoki akt_bekor).');
          const idlar = [...new Set([...mavjud.map((x) => x.qator_id), ...y.yuk.map((x) => x.qator_id)])];
          const katlar = new Map((await m.query<{ id: number; kat: string | null; tur: string }>('select id, kat, tur from public.t2_qator where id = any($1::bigint[])', [idlar])).rows.map((r) => [Number(r.id), r]));
          const nk = await nkOl(m, akt.obyekt_id);
          const kesim = (yuk: ReadonlyArray<{ qator_id: number; certified_amount: number | null }>) => { const k = new Kesim(); for (const q of yuk) { const s = katlar.get(q.qator_id); if (s && s.tur !== 'bl') k.qosh(s.kat, q.certified_amount); } return k; };
          const eski = mavjud.map((x) => ({ qator_id: x.qator_id, certified_amount: x.provenance_status === 'price_intentionally_absent' ? null : x.certified_amount, price_intentionally_absent: x.provenance_status === 'price_intentionally_absent', raw_snapshot: x.raw_snapshot ?? {} }));
          const res = await rpcOk(m, 't2_f2_qoralama_yangila_v1', {
            p_actor_id: aktor, p_kompaniya_id: akt.kompaniya_id, p_akt_id: aktId, p_kutilgan_versiya: akt.versiya, p_qatorlar: y.yuk,
            p_operation_id: uuidHosila(asos, `yangila:${aktId}`), p_manba: 'frontend_v2',
          }, aktor);
          return {
            akt_id: aktId, obyekt_id: akt.obyekt_id, raqam: akt.raqam, oy: akt.oy, qoshildi: y.qoshildi, ozgardi: y.ozgardi, ozgarmadi: y.ozgarmadi, olindi: y.olindi.length,
            ...(y.olindi.length ? { olingan_namuna: y.olindi.slice(0, 10) } : {}), storno: y.storno, xarid_narxi_qollandi: y.berilgan_narx, versiya: res.versiya ?? null,
            oldin: { ...yukJami(eski), summa: uch(kesim(eski), nk) }, keyin: { ...yukJami(y.yuk), summa: uch(kesim(y.yuk), nk) },
          };
        });
        out.push({ ...(r.snapshot_id != null ? { snapshot_id: r.snapshot_id } : {}), ...(r.ogohlantirishlar.length ? { ogoh: r.ogohlantirishlar } : {}), ...r.natija });
      } catch (e) { out.push({ akt_id: aktId, xato: xatoIzoh(xatoMatni(e)) }); }
    }
    return { dry_run: dry, ...(dry ? { izoh: 'dry_run: server tekshiruvlari o\'tdi/yiqildi, ROLLBACK — bazaga yozilmadi. Yozish uchun dry_run:false.' } : {}), narx_qoida: a.narx_qoida ?? 'max', aktlar: out,
      ...(out.length > 1 ? { xulosa: { jami: out.length, xato: out.filter((x) => x.xato).length } } : {}) };
  },
});

// ───────────────────────────── 4. f2_yarat ─────────────────────────────

export const f2Yarat = tool({
  nom: 'f2_yarat',
  tavsif: 'Aniq qatorli F2 qoralama (t2_akt_yarat_v2, manba frontend_v2) — certified_* maydonlar bilan: `qatorlar [{qator_id, hajm, narx?, summa?, narxsiz?, narx_manba?, izoh?}]`. '
    + 'Ish (bl) — avtomatik price_intentionally_absent; resurs narxi berilmasa — smeta narxi; `narx:null` — avto narxsiz (tasdiqdan oldin narx kerak); narx 0 — ongli narxsiz (summa null, 0 emas); '
    + '`narxsiz:true` — ongli narxsiz. Hajm f2_mumkin dan oshsa — bloklanmaydi, ogohlantirish. Ochiq qoralama bo\'lsa — `majburiy:true` siz rad. Javob: qator soni, summa ustamasiz/ustamali/QQS bilan.',
  kirish: {
    obyekt_id: obyektIdS, oy: oyS, raqam: z.string().max(100).optional(),
    qatorlar: z.array(z.object({
      qator_id: z.number().int().positive(), hajm: z.number(), narx: z.number().nullable().optional(), summa: z.number().optional(), narxsiz: z.boolean().optional(),
      narx_manba: z.string().max(200).optional(), izoh: z.string().max(500).optional(),
    })).min(1).max(5000),
    majburiy: z.boolean().optional(), operation_id: opS, dry_run: dryRunT,
  },
  yozadi: true,
  bajar: async (a, mu) => {
    const aktor = mu.aktorKerak(); const dry = quruq(a.dry_run);
    return mu.yozish({ tool: 'f2_yarat', args: a, dryRun: dry, obyektId: a.obyekt_id, izoh: `${a.oy} ${a.raqam ?? ''}` }, async (m, ogoh) => {
      await obyektBormi(m, a.obyekt_id);
      const ochiq = (await m.query<{ id: number }>(`select id from public.t2_akt where obyekt_id = $1 and tur = 'f2' and holat = 'qoralama'
          and coalesce(lifecycle_status,'draft') not in ('cancelled','superseded','approved') order by id`, [a.obyekt_id])).rows;
      if (ochiq.length && !a.majburiy) throw new Error(`ochiq F2 qoralama bor (${ochiq.map((x) => `#${x.id}`).join(', ')}) — uni tahrirlang (f2_qoralama_tahrir/yangila) yoki majburiy:true`);
      if (ochiq.length) ogoh.push(`ochiq qoralama(lar) bor: ${ochiq.map((x) => `#${x.id}`).join(', ')}`);
      const band = (await m.query<{ id: number; holat: string }>(`select id, holat from public.t2_akt where obyekt_id = $1 and tur = 'f2' and oy = $2::date
          and coalesce(raqam, '') = coalesce($3::text, '') limit 1`, [a.obyekt_id, `${a.oy}-01`, a.raqam?.trim() || null])).rows[0];
      if (band) throw new Error(`AKT_RAQAM_BAND — shu oyda ${a.raqam?.trim() ? `«${a.raqam.trim()}» raqamli` : 'raqamsiz'} F2 bor (#${band.id}, ${band.holat}); boshqa \`raqam\` bering.`);
      const ids = a.qatorlar.map((q) => q.qator_id);
      type MRow = { id: number; tur: string; kat: string | null; smeta_narx: number | null; mumkin: number | null; versiya_holat: string | null };
      const meta = (await m.query<MRow>(`select q.id, q.tur, q.kat, q.versiya_holat, h.smeta_narx, h.f2_mumkin_hajm as mumkin from public.t2_qator q left join public.t2_qator_holat h on h.qator_id = q.id
                                           where q.obyekt_id = $1 and q.id = any($2::bigint[])`, [a.obyekt_id, ids])).rows.map((r) => ({ ...r, id: Number(r.id), smeta_narx: num(r.smeta_narx), mumkin: num(r.mumkin) }));
      const faol = new Map(meta.filter((r) => (r.versiya_holat ?? 'faol') === 'faol').map((r) => [r.id, r]));
      const y = f2CertYuki(a.qatorlar, faol, f2HujjatManba(a.raqam));
      if (y.xato.length) throw new Error(`F2 qatorlari rad etildi: ${y.xato.slice(0, 20).join('; ')}`);
      const oshgan = a.qatorlar.filter((q) => { const r = faol.get(q.qator_id); return r && r.mumkin != null && q.hajm > r.mumkin + 1e-6; });
      if (oshgan.length) ogoh.push(`${oshgan.length} qatorda hajm fakt qoldig'idan (f2_mumkin) katta: ${oshgan.slice(0, 10).map((q) => `#${q.qator_id}`).join(', ')}`);
      const nk = await nkOl(m, a.obyekt_id);
      const k = new Kesim();
      for (const q of y.yuk) { const r = faol.get(q.qator_id)!; if (r.tur !== 'bl') k.qosh(r.kat, q.certified_amount); }
      const res = await rpcOk(m, 't2_akt_yarat_v2', {
        p_obyekt_id: a.obyekt_id, p_oy: `${a.oy}-01`, p_qatorlar: y.yuk, p_actor_id: aktor, p_raqam: a.raqam?.trim() || null, p_operation_id: a.operation_id ?? randomUUID(), p_manba: 'frontend_v2',
      }, aktor);
      return { akt_id: res.akt_id ?? null, oy: a.oy, ...yukJami(y.yuk), narx0_ongli: y.narx0, summa: uch(k, nk) };
    });
  },
});

// ───────────────────────────── 5. akt_bekor ─────────────────────────────

export const aktBekor = tool({
  nom: 'akt_bekor',
  tavsif: 'Fakt hujjati yoki F2 ni bekor qilish (hujjat o\'chirilmaydi — holat «bekor», hisobdan chiqadi). Fakt — t2_akt_bekor (kutilgan versiya bilan); '
    + 'F2 (qoralama, rad etilgan VA tasdiqlangan) — lifecycle cancelled (t2_akt_lifecycle_transition_v1). Tasdiqlangan F2 ga Forma 3 / storno / davr muhri bog\'langan bo\'lsa DEPENDENTS_EXIST — aniq ro\'yxat bilan (avval o\'shalarni bekor qiling). `sabab` majburiy. Bir yoki ko\'p akt.',
  kirish: { akt_idlar: z.array(z.number().int().positive()).min(1).max(200), sabab: z.string().min(3).max(2000), operation_id: opS, dry_run: dryRunT },
  yozadi: true,
  bajar: async (a, mu) => {
    const aktor = mu.aktorKerak(); const dry = quruq(a.dry_run); const asos = a.operation_id ?? randomUUID();
    const out: Array<Record<string, unknown>> = [];
    for (const aktId of a.akt_idlar) {
      try {
        const r = await mu.yozish({ tool: 'akt_bekor', args: { ...a, akt_id: aktId }, dryRun: dry, obyektId: async (m) => (await aktOl(m, aktId)).obyekt_id, izoh: `#${aktId}: ${a.sabab.slice(0, 100)}` }, async (m) => {
          const akt = await aktOl(m, aktId);
          const n = Number((await m.query<{ n: number }>('select count(*)::int as n from public.t2_akt_qator where akt_id = $1', [aktId])).rows[0]?.n ?? 0);
          if (akt.holat === 'bekor') return { akt_id: aktId, tur: akt.tur, holat: 'bekor', takror: true };
          if (akt.tur === 'f2') {
            // Tasdiqlangan F2 ham lifecycle approved→cancelled orqali (eski t2_akt_bekor approved aktda immutable trigger bilan rad etiladi);
            // bog'liq Forma 3 / storno / davr muhri bo'lsa server DEPENDENTS_EXIST + ro'yxat qaytaradi (xatoIzoh aniq matnga aylantiradi).
            if (!['draft', 'rejected', 'submitted', 'checked', 'approved'].includes(akt.lifecycle_status ?? 'draft')) throw new Error(`Akt #${aktId} lifecycle ${akt.lifecycle_status} — bekor qilib bo'lmaydi.`);
            const res = await rpcOk(m, 't2_akt_lifecycle_transition_v1', {
              p_kompaniya_id: akt.kompaniya_id, p_akt_id: aktId, p_to_status: 'cancelled', p_actor_id: aktor, p_expected_version: akt.versiya,
              p_operation_id: uuidHosila(asos, `bekor:${aktId}`), p_reason: a.sabab,
            }, aktor);
            const keyin = await aktOl(m, aktId);
            return { akt_id: aktId, tur: 'f2', raqam: akt.raqam, oy: akt.oy, qatorlar: n, oldin: `${akt.holat}/${akt.lifecycle_status ?? 'draft'}`, keyin: `${keyin.holat}/${keyin.lifecycle_status}`, versiya: res.version ?? keyin.versiya };
          }
          const res = await rpcOk(m, 't2_akt_bekor', { p_akt_id: aktId, p_sabab: a.sabab, p_kutilgan_versiya: akt.versiya, p_kim: `mcp:actor:${aktor}` }, aktor);
          return { akt_id: aktId, tur: akt.tur, raqam: akt.raqam, qatorlar: n, oldin: akt.holat, keyin: res.holat ?? 'bekor' };
        });
        out.push({ ...(r.snapshot_id != null ? { snapshot_id: r.snapshot_id } : {}), ...r.natija });
      } catch (e) { out.push({ akt_id: aktId, xato: xatoIzoh(xatoMatni(e)) }); }
    }
    return { dry_run: dry, ...(dry ? { izoh: 'dry_run: ROLLBACK — bazaga yozilmadi.' } : {}), aktlar: out, ...(out.length > 1 ? { xulosa: { jami: out.length, xato: out.filter((x) => x.xato).length } } : {}) };
  },
});

// ───────────────────────────── 6. nakopitelniy ─────────────────────────────

type NakQ = Record<string, unknown> & { qator_id: number; tur: string; kat: string | null; kod: string | null; nom: string | null };
const NAK_PUL = ['smeta_summa', 'fakt_summa', 'oldingi_summa', 'joriy_summa', 'jami_summa', 'qoldiq_summa', 'almashtirilgan_summa'] as const;

export const nakopitelniy = tool({
  nom: 'nakopitelniy',
  tavsif: 'Nakopitelniy vedomost (t2_nakopitelniy_v2 — web ilova bilan bir xil manba; barcha sahifalar o\'qiladi): server jami (smeta, fakt, oldingi/joriy/jami tasdiqlangan F2, qoldiq, F2-mumkin, ustama kaskadi), '
    + 'davrlar (F2 aktlar), va BO\'LIM (yuqori rz) kesimida smeta / fakt / oldingi / joriy / jami / qoldiq / almashtirilgan — ustamasiz va ustamali (barglar rs/mat/ob bo\'yicha). '
    + '`davr` YYYY-MM (standart joriy), `bolim_id` — bitta bo\'lim, `matn`/`qator_idlar` — qatorlar namunasi (`korsat`). Javob markdown jadval + JSON.',
  kirish: {
    obyekt_id: obyektIdS, davr: oyS.optional(), bolim_id: z.number().int().positive().optional(), qator_idlar: z.array(z.number().int().positive()).max(500).optional(),
    matn: z.string().max(200).optional(), faqat_faol: z.boolean().optional().describe('standart true — almashtirilgan versiya qatorlari chiqarilmaydi'), korsat: korsatS,
  },
  yozadi: false,
  bajar: async (a, mu) => {
    const aktor = mu.aktorKerak();
    return mu.oqish(async (m) => {
      const ob = await obyektBormi(m, a.obyekt_id);
      const qatorlar: NakQ[] = []; let bosh: Record<string, unknown> | null = null; let offset = 0;
      for (let sahifa = 0; sahifa < 200; sahifa++) {
        const r = (await m.query<{ n: Record<string, unknown> }>('select public.t2_nakopitelniy_v2(p_obyekt_id => $1::bigint, p_actor_id => $2::bigint, p_davr => $3::date, p_limit => 5000, p_faqat_faol => $4::boolean, p_offset => $5::int) as n',
          [a.obyekt_id, aktor, a.davr ? `${a.davr}-01` : null, a.faqat_faol !== false, offset])).rows[0]?.n;
        if (!r || r.ok === false) throw new Error(`t2_nakopitelniy_v2: ${xatoIzoh(r ?? 'javob yo\'q')}`);
        if (!bosh) bosh = r;
        qatorlar.push(...((r.qatorlar as NakQ[]) ?? []).map((q) => ({ ...q, qator_id: Number(q.qator_id) })));
        const k = r.keyingi_offset;
        if (k == null) break;
        offset = Number(k);
      }
      const daraxt = await daraxtOl(m, a.obyekt_id);
      const bx = bolimXarita(daraxt);
      const nomi = new Map(daraxt.map((d) => [d.id, d]));
      const nk = await nkOl(m, a.obyekt_id);
      const bolimlar = new Map<number | null, Record<string, Kesim>>();
      for (const q of qatorlar) {
        if (!['rs', 'mat', 'ob'].includes(q.tur)) continue;
        const b = bx.get(q.qator_id) ?? null;
        if (a.bolim_id && b !== a.bolim_id) continue;
        const g = bolimlar.get(b) ?? Object.fromEntries(NAK_PUL.map((k) => [k, new Kesim()]));
        for (const k of NAK_PUL) if (k in q) g[k].qosh(q.kat, num(q[k]));
        bolimlar.set(b, g);
      }
      const rows = [...bolimlar].map(([b, g]) => ({ bolim_id: b, nom: b == null ? '(bo\'limsiz)' : qisqa(nomi.get(b)?.nom, 50), tartib: b == null ? 1e12 : Number(nomi.get(b)?.tartib ?? 0),
        smeta: uch(g.smeta_summa, nk), fakt: uch(g.fakt_summa, nk), oldingi: uch(g.oldingi_summa, nk), joriy: uch(g.joriy_summa, nk), jami: uch(g.jami_summa, nk),
        qoldiq: uch(g.qoldiq_summa, nk), almashtirilgan: uch(g.almashtirilgan_summa, nk) })).sort((x, y) => x.tartib - y.tartib);
      const pm = (x: number | null | undefined) => (x == null ? '—' : Math.round(x).toLocaleString('ru-RU').replace(/\s/g, ' '));
      const jadval = ['| bo\'lim | smeta ustamasiz / ustamali | fakt ustamali | jami F2 ustamali | joriy F2 ustamali | qoldiq ustamasiz / ustamali |', '|---|---|---|---|---|---|',
        ...rows.map((r) => `| ${r.bolim_id ?? ''} ${r.nom} | ${pm(r.smeta.ustamasiz)} / ${pm(r.smeta.ustamali)} | ${pm(r.fakt.ustamali)} | ${pm(r.jami.ustamali)} | ${pm(r.joriy.ustamali)} | ${pm(r.qoldiq.ustamasiz)} / ${pm(r.qoldiq.ustamali)} |`)].join('\n');
      const n = a.korsat ?? 20;
      let namuna: unknown[] | undefined;
      if (a.qator_idlar?.length || a.matn) {
        const ids = new Set(a.qator_idlar ?? []); const sozlar = (a.matn ?? '').toUpperCase().split(/\s+/).filter(Boolean);
        namuna = qatorlar.filter((q) => (ids.size ? ids.has(q.qator_id) : true) && sozlar.every((s) => `${q.kod ?? ''} ${q.nom ?? ''}`.toUpperCase().includes(s)))
          .slice(0, n).map((q) => ({ qator_id: q.qator_id, tur: q.tur, kod: q.kod, nom: qisqa(q.nom, 60), birlik: q.birlik, smeta_hajm: q.smeta_hajm, fakt_hajm: q.fakt_hajm, oldingi_hajm: q.oldingi_hajm,
            joriy_hajm: q.joriy_hajm, jami_hajm: q.jami_hajm, f2_mumkin_hajm: q.f2_mumkin_hajm, almashtirilgan_hajm: q.almashtirilgan_hajm, qoldiq_hajm: q.qoldiq_hajm, smeta_narx: q.smeta_narx, qoldiq_summa: q.qoldiq_summa }));
      }
      return {
        obyekt: { id: a.obyekt_id, nom: qisqa(ob.nom, 60) }, davr: bosh?.davr ?? a.davr ?? null, qatorlar_jami: qatorlar.length, jami: bosh?.jami ?? null,
        davrlar: ((bosh?.davrlar as unknown[]) ?? []).slice(0, 60), jadval, bolimlar: rows.map(({ tartib: _t, ...r }) => r), ...(namuna ? { qatorlar: namuna } : {}),
        izoh: 'so\'m, QQS siz (ustamasiz / ustamali ИТОГО-4) va QQS bilan; bo\'lim summalari — barglar (rs/mat/ob). jami — server (t2_nakopitelniy_v2.jami). null — noma\'lum.',
      };
    });
  },
});

// ───────────────────────────── 7. ostatka ─────────────────────────────

export const ostatka = tool({
  nom: 'ostatka',
  tavsif: 'Ostatka (qoldiq) — t2_qator_holat (zamena qozoni bilan): har qator asl smeta hajmi, smeta (zamena reja) hajmi, F2 tasdiqlangan, fakt, almashtirilgan (zamena qoplagan), qoldiq hajm/summa, F2-mumkin. '
    + 'Bo\'lim (yuqori rz) kesimida qoldiq / almashtirilgan / F2 summalari ustamasiz va ustamali. Filtr: `bolim_id`, `qator_idlar`, `faqat`: "qoldiq" (qoldiq>0), "ortiqcha" (qoldiq<0 — smetadan oshgan), '
    + '"zamena" (zamena qatorlari va ular almashtirgan asl qatorlar), "almashtirilgan" (almashtirilgan_hajm>0). Zamena qatorida `almashtiradi` (asl qator), asl qatorda `zamenalar`.',
  kirish: {
    obyekt_id: obyektIdS, bolim_id: z.number().int().positive().optional(), qator_idlar: z.array(z.number().int().positive()).max(2000).optional(),
    faqat: z.enum(['qoldiq', 'ortiqcha', 'zamena', 'almashtirilgan']).optional(), korsat: korsatS,
  },
  yozadi: false,
  bajar: async (a, mu) => mu.oqish(async (m) => {
    const ob = await obyektBormi(m, a.obyekt_id);
    type HRow = { qator_id: number; ota_id: number | null; tur: string; kod: string | null; nom: string | null; birlik: string | null; kat: string | null; asl_smeta_hajm: number | null; smeta_hajm: number | null; smeta_narx: number | null;
      smeta_summa: number | null; fakt_hajm: number | null; f2_hajm: number | null; f2_summa: number | null; almashtirilgan_hajm: number | null; almashtirilgan_summa: number | null; qoldiq_hajm: number | null; qoldiq_summa: number | null;
      f2_mumkin_hajm: number | null; change_type: string | null; replaces_line_id: number | null; almashtirish_hajm: number | null; qoshimcha: boolean | null };
    const rows = (await m.query<HRow>(`select h.qator_id, q.ota_id, h.tur, h.kod, h.nom, h.birlik, h.kat, h.asl_smeta_hajm, h.smeta_hajm, h.smeta_narx, h.smeta_summa, h.fakt_hajm, h.f2_hajm, h.f2_summa,
        h.almashtirilgan_hajm, h.almashtirilgan_summa, h.qoldiq_hajm, h.qoldiq_summa, h.f2_mumkin_hajm, q.change_type, q.replaces_line_id, q.almashtirish_hajm, q.qoshimcha
       from public.t2_qator q join public.t2_qator_holat h on h.qator_id = q.id
      where q.obyekt_id = $1 and coalesce(q.versiya_holat,'faol') = 'faol' order by q.tartib nulls last, q.id`, [a.obyekt_id])).rows
      .map((r) => ({ ...r, qator_id: Number(r.qator_id), ota_id: r.ota_id == null ? null : Number(r.ota_id), replaces_line_id: r.replaces_line_id == null ? null : Number(r.replaces_line_id) }));
    const daraxt = await daraxtOl(m, a.obyekt_id);
    const bx = bolimXarita(daraxt);
    const nomi = new Map(daraxt.map((d) => [d.id, d]));
    const zamenalar = new Map<number, number[]>();
    for (const r of rows) if (r.replaces_line_id != null) { const x = zamenalar.get(r.replaces_line_id) ?? []; x.push(r.qator_id); zamenalar.set(r.replaces_line_id, x); }
    const zamenaOta = new Set(rows.filter((r) => r.replaces_line_id != null).map((r) => r.qator_id));
    const zamenaga = (r: HRow) => r.replaces_line_id != null || zamenalar.has(r.qator_id) || (r.ota_id != null && (zamenaOta.has(r.ota_id) || zamenalar.has(r.ota_id)));
    const ids = new Set(a.qator_idlar ?? []);
    const tanla = rows.filter((r) => (!a.bolim_id || bx.get(r.qator_id) === a.bolim_id) && (!ids.size || ids.has(r.qator_id)) && (
      a.faqat === 'qoldiq' ? (r.qoldiq_hajm ?? 0) > 1e-6 : a.faqat === 'ortiqcha' ? (r.qoldiq_hajm ?? 0) < -1e-6 : a.faqat === 'zamena' ? zamenaga(r) : a.faqat === 'almashtirilgan' ? (r.almashtirilgan_hajm ?? 0) > 1e-6 : true));
    const nk = await nkOl(m, a.obyekt_id);
    const g = new Map<number | null, { qoldiq: Kesim; almashtirilgan: Kesim; f2: Kesim; smeta: Kesim; n: number }>();
    for (const r of tanla) {
      if (!['rs', 'mat', 'ob'].includes(r.tur)) continue;
      const b = bx.get(r.qator_id) ?? null;
      const x = g.get(b) ?? { qoldiq: new Kesim(), almashtirilgan: new Kesim(), f2: new Kesim(), smeta: new Kesim(), n: 0 };
      x.n++; x.qoldiq.qosh(r.kat, num(r.qoldiq_summa)); x.almashtirilgan.qosh(r.kat, num(r.almashtirilgan_summa)); x.f2.qosh(r.kat, num(r.f2_summa)); x.smeta.qosh(r.kat, num(r.smeta_summa));
      g.set(b, x);
    }
    const bolimlar = [...g].map(([b, x]) => ({ bolim_id: b, nom: b == null ? '(bo\'limsiz)' : qisqa(nomi.get(b)?.nom, 50), resurslar: x.n, smeta: uch(x.smeta, nk), f2: uch(x.f2, nk), almashtirilgan: uch(x.almashtirilgan, nk), qoldiq: uch(x.qoldiq, nk), _t: Number(nomi.get(b ?? -1)?.tartib ?? 1e12) }))
      .sort((p, q) => p._t - q._t).map(({ _t, ...r }) => r);
    const n = a.korsat ?? 30;
    return {
      obyekt: { id: a.obyekt_id, nom: qisqa(ob.nom, 60) }, filtr: { bolim_id: a.bolim_id ?? null, faqat: a.faqat ?? null }, qatorlar_soni: tanla.length, bolimlar,
      qatorlar: tanla.slice(0, n).map((r) => ({
        qator_id: r.qator_id, tur: r.tur, kod: r.kod, nom: qisqa(r.nom, 60), birlik: r.birlik, asl_smeta_hajm: r.asl_smeta_hajm, smeta_hajm: r.smeta_hajm, f2_hajm: r.f2_hajm, fakt_hajm: r.fakt_hajm,
        almashtirilgan_hajm: r.almashtirilgan_hajm, qoldiq_hajm: r.qoldiq_hajm, qoldiq_summa: r.qoldiq_summa, f2_mumkin_hajm: r.f2_mumkin_hajm, smeta_narx: r.smeta_narx,
        ...(r.replaces_line_id != null ? { almashtiradi: r.replaces_line_id, change_type: r.change_type, ...(r.almashtirish_hajm != null ? { almashtirish_hajm: r.almashtirish_hajm } : {}) } : {}),
        ...(zamenalar.has(r.qator_id) ? { zamenalar: zamenalar.get(r.qator_id) } : {}),
      })),
      ...(tanla.length > n ? { yana: tanla.length - n } : {}),
      izoh: 'qoldiq = smeta (zamena reja) − F2 tasdiqlangan − almashtirilgan; summalar so\'m QQS siz (ustamasiz/ustamali), bo\'lim — barglar (rs/mat/ob). null — noma\'lum.',
    };
  }),
});

// ───────────────────────────── 8. shartnoma_moslash ─────────────────────────────

export const shartnomaMoslash = tool({
  nom: 'shartnoma_moslash',
  tavsif: 'Shartnoma / hisob-faktura / xarid ro\'yxati pozitsiyalarini (`pozitsiyalar [{nom, kod?, birlik?, soni?, narx_qqs?}]`, ≤1000) smeta qatorlariga moslash — FAQAT O\'QISH. '
    + 'Har pozitsiyaga eng mos `top` (standart 3) qator: nom so\'zlari qamrovi, kod, birlik, hajm yaqinligi bo\'yicha ishonch 0…1 (holat aniq/noaniq/topilmadi), '
    + 'narx_qqs → QQS siz narx bilan smeta narxi farqi (%). Doira: `obyekt_idlar` yoki `shartnoma_id` (faol obyektlari); `tur` filtri (standart rs/mat/ob).',
  kirish: {
    obyekt_idlar: obyektlarS.optional(), shartnoma_id: z.number().int().positive().optional(),
    pozitsiyalar: z.array(z.object({ nom: z.string().min(2).max(1000), kod: z.string().max(100).optional(), birlik: z.string().max(50).optional(), soni: z.number().optional(), narx_qqs: z.number().min(0).optional() })).min(1).max(1000),
    tur: z.array(z.enum(['bl', 'rs', 'mat', 'ob'])).min(1).optional(), top: z.number().int().min(1).max(10).optional(), min_ishonch: z.number().min(0).max(1).optional(),
  },
  yozadi: false,
  bajar: async (a, mu) => mu.oqish(async (m) => {
    let ids = a.obyekt_idlar ?? [];
    if (a.shartnoma_id) ids = [...new Set([...ids, ...(await m.query<{ obyekt_id: number }>("select obyekt_id from public.t2_shartnoma_bog where shartnoma_id = $1 and holat = 'faol' order by obyekt_id", [a.shartnoma_id])).rows.map((r) => Number(r.obyekt_id))])];
    if (!ids.length) throw new Error('obyekt_idlar yoki shartnoma_id bering (shartnomada faol obyekt yo\'q).');
    const turlar = a.tur ?? ['rs', 'mat', 'ob'];
    const qatorlar = (await m.query<SmetaQ>(`select id, obyekt_id, tur, kod, nom, birlik, hajm, narx from public.t2_qator
                                              where obyekt_id = any($1::bigint[]) and coalesce(versiya_holat,'faol') = 'faol' and tur = any($2::text[])`, [ids, turlar])).rows
      .map((r) => ({ ...r, id: Number(r.id), obyekt_id: Number(r.obyekt_id), hajm: num(r.hajm), narx: num(r.narx) }));
    const nk = await nkOl(m, ids[0]);
    const nat = moslash(a.pozitsiyalar, qatorlar, { top: a.top, minIshonch: a.min_ishonch, ndsFoiz: ndsOl(nk) });
    const sana = (h: string) => nat.filter((x) => x.holat === h).length;
    return {
      doira: { obyektlar: ids, qatorlar: qatorlar.length, tur: turlar }, xulosa: { aniq: sana('aniq'), noaniq: sana('noaniq'), topilmadi: sana('topilmadi') },
      pozitsiyalar: nat.map((p) => ({ ...p, nomzodlar: p.nomzodlar.map((c) => ({ ...c, nom: qisqa(c.nom, 80) })) })),
      izoh: 'faqat taklif — hech narsa yozilmadi. ishonch ≥0.75 va ikkinchidan ≥0.1 farq — «aniq». narx_farq_foiz: (narx_qqs / (1+QQS%)) / smeta narx − 1.',
    };
  }),
});

// ───────────────────────────── 9. fakt_jurnal ─────────────────────────────

export const faktJurnal = tool({
  nom: 'fakt_jurnal',
  tavsif: 'Fakt tarixi (t2_akt_qator × t2_akt, tur=fakt): har yozuv — akt, sana, hajm (delta), summa, izoh, kim; har qator bo\'yicha SOF fakt va yozuvlar soni. '
    + 'Filtr: `qator_idlar` yoki `bolim_id` (avlodlari bilan), `sana_dan`/`sana_gacha`, `bekor_ham:true` — bekor hujjatlar ham. Hech biri berilmasa — obyektning oxirgi yozuvlari.',
  kirish: {
    obyekt_id: obyektIdS, qator_idlar: z.array(z.number().int().positive()).max(2000).optional(), bolim_id: z.number().int().positive().optional(),
    sana_dan: sanaS.optional(), sana_gacha: sanaS.optional(), bekor_ham: z.boolean().optional(), limit: z.number().int().min(1).max(2000).optional(),
  },
  yozadi: false,
  bajar: async (a, mu) => mu.oqish(async (m) => {
    await obyektBormi(m, a.obyekt_id);
    let ids: number[] | null = a.qator_idlar?.length ? a.qator_idlar : null;
    if (a.bolim_id) { const d = [...avlodlar(await daraxtOl(m, a.obyekt_id), a.bolim_id)]; ids = ids ? ids.filter((x) => d.includes(x)) : d; }
    const limit = a.limit ?? 200;
    type JRow = { id: number; akt_id: number; raqam: string | null; sana: string | null; holat: string; kim: string | null; qator_id: number; tur: string; kod: string | null; nom: string | null; birlik: string | null; hajm: number | null; summa: number | null; izoh: string | null; yaratildi: string };
    const r = (await m.query<JRow>(`select aq.id, a.id as akt_id, a.raqam, coalesce(a.sana, a.oy)::text as sana, a.holat, a.kim, aq.qator_id, q.tur, q.kod, q.nom, q.birlik, aq.hajm, aq.summa, aq.izoh, aq.yaratildi::text as yaratildi
        from public.t2_akt_qator aq join public.t2_akt a on a.id = aq.akt_id join public.t2_qator q on q.id = aq.qator_id
       where a.obyekt_id = $1 and a.tur = 'fakt' and ($2::bigint[] is null or aq.qator_id = any($2::bigint[])) and ($3::boolean or a.holat <> 'bekor')
         and ($4::date is null or coalesce(a.sana, a.oy) >= $4::date) and ($5::date is null or coalesce(a.sana, a.oy) <= $5::date)
       order by aq.yaratildi desc, aq.id desc limit $6`, [a.obyekt_id, ids, a.bekor_ham === true, a.sana_dan ?? null, a.sana_gacha ?? null, limit + 1])).rows;
    const yana = r.length > limit; const rows = r.slice(0, limit);
    const net = new Map<number, { qator_id: number; kod: string | null; nom: string | null; birlik: string | null; net_hajm: number; net_summa: number | null; yozuv: number }>();
    for (const x of rows) {
      if (x.holat === 'bekor') continue;
      const id = Number(x.qator_id);
      const g = net.get(id) ?? { qator_id: id, kod: x.kod, nom: qisqa(x.nom, 60), birlik: x.birlik, net_hajm: 0, net_summa: 0 as number | null, yozuv: 0 };
      g.net_hajm = y6(g.net_hajm + Number(x.hajm ?? 0)); g.net_summa = g.net_summa == null || x.summa == null ? null : y2(g.net_summa + Number(x.summa)); g.yozuv++;
      net.set(id, g);
    }
    return {
      yozuvlar: rows.map((x) => ({ akt_id: Number(x.akt_id), raqam: x.raqam, sana: x.sana, holat: x.holat, kim: x.kim, qator_id: Number(x.qator_id), tur: x.tur, kod: x.kod, nom: qisqa(x.nom, 50), hajm: num(x.hajm), summa: num(x.summa), izoh: x.izoh, yaratildi: x.yaratildi })),
      ...(yana ? { yana_bor: true, izoh_limit: `faqat oxirgi ${limit} yozuv — sof qiymat shu yozuvlar bo'yicha; to'liq uchun qator_idlar/limit bering` } : {}),
      qator_boyicha: [...net.values()].sort((p, q) => p.qator_id - q.qator_id),
    };
  }),
});

// ───────────────────────────── 10. normativ_qidir ─────────────────────────────

export const normativQidir = tool({
  nom: 'normativ_qidir',
  tavsif: 'Qidiruv (faqat o\'qish): `tur:"normativ"` — ShNK/normativ hujjatlar bo\'laklari (t2_normativ_qidir_v1: norma kodi, nom, tahrir, sahifa); '
    + '`"resurs"` — resurs variantlari shu obyekt/boshqa smetalar/katalogdan narxi bilan (t2_resurs_qidir_v1, `kat` filtri); `"ish"` — ish turi variantlari tarkibi (norma) bilan (t2_ish_turi_qidir_v1). '
    + 'Zamena/qo\'shimcha ish uchun kod, norma va narx topishda ishlating. `obyekt_id` majburiy (resurs/ish; normativ uchun kompaniya shundan).',
  kirish: { matn: z.string().min(2).max(300), tur: z.enum(['normativ', 'resurs', 'ish']).optional(), obyekt_id: obyektIdS, kat: z.enum(KAT).optional(), limit: z.number().int().min(1).max(100).optional() },
  yozadi: false,
  bajar: async (a, mu) => {
    const aktor = mu.aktorKerak();
    return mu.oqish(async (m) => {
      const ob = await obyektBormi(m, a.obyekt_id);
      const tur = a.tur ?? 'normativ'; const limit = a.limit ?? 20;
      if (tur === 'normativ') {
        const r = (await m.query<{ r: { ok?: boolean; natijalar?: Array<Record<string, unknown>>; code?: string } }>('select public.t2_normativ_qidir_v1($1::bigint, $2::bigint, $3::text, null, null, null, $4::int) as r', [aktor, Number(ob.kompaniya_id), a.matn, limit])).rows[0]?.r;
        if (!r || r.ok === false) throw new Error(`t2_normativ_qidir_v1: ${xatoIzoh(r ?? 'javob yo\'q')}`);
        return { tur, natijalar: (r.natijalar ?? []).map((x) => ({ norma_kod: x.norma_kod, nom: x.nom, tahrir: x.tahrir, bob_punkt: x.bob_punkt, jadval_kod: x.jadval_kod, sahifa_pdf: x.sahifa_pdf, sahifa_bosma: x.sahifa_bosma, hujjat_id: x.hujjat_id, unit: x.unit })) };
      }
      if (tur === 'resurs') {
        const r = (await m.query<{ r: unknown }>('select public.t2_resurs_qidir_v1($1::bigint, $2::bigint, $3::text, $4::text) as r', [a.obyekt_id, aktor, a.matn, a.kat ?? ''])).rows[0]?.r;
        return { tur, natijalar: (Array.isArray(r) ? r : []).slice(0, limit) };
      }
      const r = (await m.query<{ r: unknown }>('select public.t2_ish_turi_qidir_v1($1::bigint, $2::bigint, $3::text) as r', [a.obyekt_id, aktor, a.matn])).rows[0]?.r;
      return { tur, natijalar: (Array.isArray(r) ? r : []).slice(0, limit) };
    });
  },
});

// ───────────────────────────── 11. forma3 ─────────────────────────────

export const forma3 = tool({
  nom: 'forma3',
  tavsif: 'Форма № 3 (счёт-фактура): `amal:"royxat"` — mavjud F3 lar (t2_forma3_royxat_v1, obyekt yoki loyiha bo\'yicha); `amal:"yarat"` — tasdiqlangan F2 aktlardan F3 qoralama (t2_forma3_yarat_v1): '
    + '`davr_boshi`/`davr_oxiri` (YYYY-MM-DD), `akt_idlar` (berilmasa — davr ichidagi obyekt/loyihaning barcha tasdiqlangan F2 lari), `raqam`, `shartnoma_id`. Rol: boss/rahbar/bugalter. yarat — dry_run standart true.',
  kirish: {
    amal: z.enum(['royxat', 'yarat']), obyekt_id: obyektIdS.optional(), loyiha_id: z.number().int().positive().optional(), shartnoma_id: z.number().int().positive().optional(),
    davr_boshi: sanaS.optional(), davr_oxiri: sanaS.optional(), akt_idlar: z.array(z.number().int().positive()).max(500).optional(), raqam: z.string().max(100).optional(),
    operation_id: opS, dry_run: dryRunT,
  },
  yozadi: true,
  bajar: async (a, mu) => {
    const aktor = mu.aktorKerak();
    if (!a.obyekt_id && !a.loyiha_id) throw new Error('obyekt_id yoki loyiha_id bering.');
    if (a.amal === 'royxat') {
      return mu.oqish(async (m) => {
        const r = (await m.query<{ r: Record<string, unknown> }>('select public.t2_forma3_royxat_v1($1::bigint, $2::bigint, $3::bigint) as r', [a.loyiha_id ?? null, a.obyekt_id ?? null, aktor])).rows[0]?.r;
        if (!r || r.ok === false) throw new Error(`t2_forma3_royxat_v1: ${xatoIzoh(r ?? 'javob yo\'q')}`);
        return r;
      });
    }
    if (!a.davr_boshi || !a.davr_oxiri) throw new Error('yarat: davr_boshi va davr_oxiri majburiy.');
    const dry = quruq(a.dry_run);
    return mu.yozish({ tool: 'forma3', args: a, dryRun: dry, obyektId: a.obyekt_id ?? null, snapshot: a.obyekt_id != null, izoh: `${a.davr_boshi}..${a.davr_oxiri}` }, async (m) => {
      let akt = a.akt_idlar ?? [];
      if (!akt.length) {
        akt = (await m.query<{ id: number }>(`select a.id from public.t2_akt a left join public.t2_obyekt o on o.id = a.obyekt_id
            where a.tur = 'f2' and a.holat = 'tasdiqlangan' and a.forma3_id is null and ($1::bigint is null or a.obyekt_id = $1) and ($2::bigint is null or o.loyiha_id = $2)
              and a.oy between date_trunc('month', $3::date) and date_trunc('month', $4::date) order by a.oy, a.id`, [a.obyekt_id ?? null, a.loyiha_id ?? null, a.davr_boshi, a.davr_oxiri])).rows.map((r) => Number(r.id));
        if (!akt.length) throw new Error('davr ichida F3 ga bog\'lanmagan tasdiqlangan F2 yo\'q.');
      }
      const res = await rpcOk(m, 't2_forma3_yarat_v1', {
        p_actor_id: aktor, p_loyiha_id: a.loyiha_id ?? null, p_obyekt_id: a.obyekt_id ?? null, p_shartnoma_id: a.shartnoma_id ?? null, p_davr_boshi: a.davr_boshi, p_davr_oxiri: a.davr_oxiri,
        p_akt_ids: akt, p_raqam: a.raqam?.trim() || null, p_operation_id: a.operation_id ?? randomUUID(),
      }, aktor);
      return { forma3_id: res.forma3_id ?? null, aktlar: akt.length, akt_idlar: akt.slice(0, 50), ...(res.takror ? { takror: true } : {}), javob: res };
    });
  },
});

export const PTO_TOOLLAR = [zamenaQosh, ishOchir, f2QoralamaYangila, f2Yarat, aktBekor, nakopitelniy, ostatka, shartnomaMoslash, faktJurnal, normativQidir, forma3];
