/**
 * ISH OQIMLARI — egasi (PTO) kundalik ishini chatdan bajarishi uchun yuqori darajali toollar.
 * Har yozish: mavjud SECURITY DEFINER RPC orqali (narx_tuzat — t2_qator to'g'ridan, app bilan bir xil formula),
 * obyekt bo'yicha alohida tranzaksiya → avtomatik snapshot → amal → bazadagi audit → COMMIT.
 * `dry_run` STANDART TRUE: hamma tekshiruv (server RPC ham) ishlaydi, so'ng ROLLBACK. Javob ixcham (token tejash).
 * Pul: QQS siz; ustamasiz / ustamali (ИТОГО-4) / QQS bilan — t2_obyekt_nakrutka kf_* bo'yicha. null — noma'lum (0 emas).
 */
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Mijoz } from '../db';
import { podvalTekshir, standartPodval, type Podval } from '../frontend';
import { obyektBormi } from '../malumot';
import { xatoMatni } from '../maxfiy';
import type { Muhit } from '../muhit';
import {
  blSumma, f2Qator, f2HujjatManba, f2QoralamaYuki, faktNolYuki, Kesim, kfUch, lifecycleYol, LIFECYCLE, narxNusxa, PODVAL_KODLAR, podvalFoizQoy,
  qoralamaTahrirYuki, qoshimchaTaxmin, SABAB_KODLAR, uuidHosila, xatoIzoh, y2, yukJami, type F2YukQator, type Kf, type MavjudAktQator, type MumkinQator,
  type PodvalQatorX, type Uch,
} from '../ish-oqimi';
import { obyektIdS, tool } from '../tool';
import { rpcChaqir } from './yozish';

// ───────────────────────────── umumiy ─────────────────────────────

export const dryRunT = z.boolean().optional().describe('STANDART true — to\'liq preview (server RPC tekshiruvlari bilan) + ROLLBACK; false — haqiqiy yozish (snapshot + audit).');
export const quruq = (v: boolean | undefined) => v !== false;
export const oyS = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).describe('YYYY-MM');
export const sanaS = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('YYYY-MM-DD');
export const opS = z.string().uuid().optional().describe('idempotentlik kaliti (takroriy chaqiruv — o\'sha natija); berilmasa yangi UUID');
export const korsatS = z.number().int().min(0).max(500).optional().describe('javobdagi namuna qatorlar soni (standart 10)');
export const obyektlarS = z.array(z.number().int().positive()).min(1).max(200);
export const KAT = ['ЧЕЛ', 'МАШ', 'МАТ', 'ОБ', 'М/К', 'КАБ', 'БЕЗСКЛАД'] as const;
export const qisqa = (s: unknown, n = 70) => { const t = s == null ? '' : String(s); return t.length > n ? t.slice(0, n - 1) + '…' : t; };

/** RPC chaqirib, {ok:false} yoki exception'ni o'qiladigan xatoga aylantiradi. */
export async function rpcOk(m: Mijoz, nom: string, args: Record<string, unknown>, aktor: number): Promise<Record<string, unknown>> {
  let r: unknown;
  try { r = (await rpcChaqir(m, nom, args, () => aktor)).natija; } catch (e) { throw new Error(`${nom}: ${xatoIzoh(xatoMatni(e))}`); }
  const o = r && typeof r === 'object' && !Array.isArray(r) ? r as Record<string, unknown> : { natija: r };
  if (o.ok === false) throw new Error(`${nom}: ${xatoIzoh(o)}`);
  return o;
}

export async function jadvalBor(m: Mijoz, nom: string): Promise<boolean> {
  return !!(await m.query<{ bor: boolean }>('select to_regclass($1) is not null as bor', [nom])).rows[0]?.bor;
}

/** Aktor shu kompaniya a'zosimi (tenant chegarasi; server funksiyasi rad etsa — exception). */
export async function azoTekshir(m: Mijoz, kompaniyaId: number, aktor: number): Promise<void> {
  try { await m.query('select public.t2_actor_kompaniya_azo_tekshir($1::bigint, $2::bigint)', [kompaniyaId, aktor]); } catch (e) { throw new Error(`aktor #${aktor} kompaniya #${kompaniyaId} a'zosi emas: ${xatoMatni(e)}`); }
}

export type NkRow = Kf & { pryamye: number | null; itogo4: number | null; nds: number | null; vsego: number | null; nk_manba: string | null; nakrutka_podval_id: number | null; koeffitsientlar: Record<string, unknown> | null };
export async function nkOl(m: Mijoz, obyektId: number): Promise<NkRow | null> {
  const r = await m.query<NkRow>(`select kf_chel, kf_mash, kf_mat, kf_ob, kf_mk, kf_kab, kf_bezsklad, pryamye, itogo4, nds, vsego, nk_manba, nakrutka_podval_id, koeffitsientlar
                                    from public.t2_obyekt_nakrutka where obyekt_id = $1 limit 1`, [obyektId]);
  return r.rows[0] ?? null;
}
const ndsFoiz = (nk: NkRow | null) => { const v = nk?.koeffitsientlar?.['НДС']; return v == null || v === '' ? null : Number(v); };
const kfQism = (nk: NkRow | null) => nk ? { ЧЕЛ: nk.kf_chel, МАШ: nk.kf_mash, МАТ: nk.kf_mat, ОБ: nk.kf_ob, 'М/К': nk.kf_mk, КАБ: nk.kf_kab, БЕЗСКЛАД: nk.kf_bezsklad } : null;
export const uch = (k: Kesim, nk: NkRow | null): Uch => kfUch(k, nk, ndsFoiz(nk));

/** Ko'p obyekt: har biri alohida tranzaksiya; biri yiqilsa qolganlari davom etadi. */
export async function harBiri<T>(idlar: readonly number[], fn: (id: number) => Promise<{ snapshot_id: number | null; audit_baza: boolean; ogohlantirishlar: string[]; natija: T }>) {
  const out: Array<Record<string, unknown>> = [];
  for (const id of idlar) {
    try {
      const r = await fn(id);
      out.push({ obyekt_id: id, ...(r.snapshot_id != null ? { snapshot_id: r.snapshot_id } : {}), ...(r.audit_baza ? { audit: true } : {}), ...(r.ogohlantirishlar.length ? { ogoh: r.ogohlantirishlar } : {}), ...(r.natija as object) });
    } catch (e) {
      out.push({ obyekt_id: id, xato: xatoIzoh(xatoMatni(e)) });
    }
  }
  return out;
}

export const javob = (dry: boolean, natijalar: Array<Record<string, unknown>>, qoshimcha: Record<string, unknown> = {}) => ({
  dry_run: dry, ...(dry ? { izoh: 'dry_run: server tekshiruvlari o\'tdi/yiqildi, hammasi ROLLBACK — bazaga yozilmadi. Yozish uchun dry_run:false.' } : {}),
  ...qoshimcha, obyektlar: natijalar,
  ...(natijalar.length > 1 ? { xulosa: { jami: natijalar.length, xato: natijalar.filter((x) => x.xato).length } } : {}),
});

const MUMKIN_SQL = (baj: boolean) => `
  select q.id as qator_id, q.ota_id, q.tur, q.kod, q.nom, q.birlik, q.kat, h.f2_mumkin_hajm as mumkin, h.smeta_narx
    from public.t2_qator q join public.t2_qator_holat h on h.qator_id = q.id
   where q.obyekt_id = $1 and coalesce(q.versiya_holat, 'faol') = 'faol' and q.tur in ('bl','rs','mat','ob')
     and h.f2_mumkin_hajm > 0.000001 and ($2::bigint[] is null or q.id = any($2::bigint[]))
     ${baj ? "and not exists (select 1 from public.t2_qator_bajarilmadi b where b.qator_id = q.id and b.holat = 'faol')" : ''}
   order by q.tartib nulls last, q.id`;

export async function mumkinOl(m: Mijoz, obyektId: number, idlar: number[] | null = null): Promise<{ rows: MumkinQator[]; bajHisobda: boolean }> {
  const baj = await jadvalBor(m, 'public.t2_qator_bajarilmadi');
  const r = await m.query<MumkinQator>(MUMKIN_SQL(baj), [obyektId, idlar]);
  return { rows: r.rows.map((x) => ({ ...x, mumkin: Number(x.mumkin), smeta_narx: x.smeta_narx == null ? null : Number(x.smeta_narx) })), bajHisobda: baj };
}

const namuna = (yuk: readonly F2YukQator[], meta: Map<number, { tur: string; kod: string | null; nom: string | null }>, n: number) =>
  yuk.slice(0, n).map((q) => { const s = meta.get(q.qator_id); return { qator_id: q.qator_id, tur: s?.tur, kod: s?.kod, nom: qisqa(s?.nom, 60), hajm: q.certified_quantity, narx: q.certified_unit_price, summa: q.certified_amount }; });

export type AktRow = { id: number; obyekt_id: number; kompaniya_id: number; tur: string; holat: string | null; lifecycle_status: string | null; versiya: number; raqam: string | null; oy: string | null };
export async function aktOl(m: Mijoz, id: number): Promise<AktRow> {
  const r = await m.query<AktRow>('select id, obyekt_id, kompaniya_id, tur, holat, lifecycle_status, versiya, raqam, oy::text as oy from public.t2_akt where id = $1', [id]);
  if (!r.rows[0]) throw new Error(`Akt #${id} topilmadi.`);
  return { ...r.rows[0], id: Number(r.rows[0].id), obyekt_id: Number(r.rows[0].obyekt_id), kompaniya_id: Number(r.rows[0].kompaniya_id), versiya: Number(r.rows[0].versiya) };
}

// ───────────────────────────── 1. f2_qoralama_yarat ─────────────────────────────

export const f2QoralamaYarat = tool({
  nom: 'f2_qoralama_yarat',
  tavsif: 'Fakt qoldig\'idan (t2_qator_holat.f2_mumkin_hajm > 0, faol versiya, faol «bajarilmadi» belgisiz) bir yoki ko\'p obyekt uchun F2 QORALAMA (t2_akt_yarat_v2, manba frontend_v2). '
    + 'Ish (bl) — narxsiz; resurs narxi = smeta narxi yoki `narx_override` {qator_id:{narx,manba}}; narxi yo\'q resurs — avto narxsiz (tasdiqdan oldin narx kerak). '
    + '`chang_pul` — ish+resurslari ma\'lum qiymati shundan kam bo\'lsa tashlanadi. Obyektda ochiq F2 qoralama bo\'lsa — o\'tkaziladi (`majburiy:true` — baribir). '
    + 'Javob: har obyekt qator soni, summa ustamasiz/ustamali/QQS bilan, namuna. Masalan: {obyekt_idlar:[11,12], oy:"2026-10"} → keyin dry_run:false.',
  kirish: {
    obyekt_idlar: obyektlarS, oy: oyS, raqam: z.string().max(100).optional().describe('F2 raqami (hamma obyektga bir xil)'),
    narx_override: z.record(z.string().regex(/^\d+$/), z.object({ narx: z.number().min(0), manba: z.string().max(200).optional() })).optional(),
    chang_pul: z.number().min(0).optional().describe('so\'m, standart 0 (hech narsa tashlanmaydi)'),
    majburiy: z.boolean().optional(), korsat: korsatS, operation_id: opS, dry_run: dryRunT,
  },
  yozadi: true,
  bajar: async (a, mu) => {
    const aktor = mu.aktorKerak(); const dry = quruq(a.dry_run); const asos = a.operation_id ?? randomUUID(); const n = a.korsat ?? 10;
    const natijalar = await harBiri(a.obyekt_idlar, (id) => mu.yozish({ tool: 'f2_qoralama_yarat', args: { ...a, obyekt_id: id }, dryRun: dry, obyektId: id, izoh: a.oy }, async (m, ogoh) => {
      const ob = await obyektBormi(m, id);
      const ochiq = (await m.query<{ id: number; raqam: string | null; oy: string | null; lifecycle_status: string | null }>(
        `select id, raqam, oy::text as oy, lifecycle_status from public.t2_akt where obyekt_id = $1 and tur = 'f2' and holat = 'qoralama'
            and coalesce(lifecycle_status, 'draft') not in ('cancelled', 'superseded', 'approved') order by id`, [id])).rows;
      if (ochiq.length && !a.majburiy) return { nom: qisqa(ob.nom, 50), yozildi: false, sabab: 'ochiq F2 qoralama bor — avval uni tasdiqlang/tahrirlang yoki majburiy:true', ochiq_qoralamalar: ochiq };
      if (ochiq.length) ogoh.push(`ochiq qoralama(lar) bor: ${ochiq.map((x) => `#${x.id}`).join(', ')} — hajm ikki marta olinishi mumkin`);
      const { rows, bajHisobda } = await mumkinOl(m, id);
      if (!bajHisobda) ogoh.push('t2_qator_bajarilmadi jadvali yo\'q — «bajarilmadi» filtri qo\'llanmadi');
      const ovKalit = Object.keys(a.narx_override ?? {});
      const borId = new Set(rows.map((r) => String(r.qator_id)));
      const begona = ovKalit.filter((k) => !borId.has(k));
      if (begona.length && a.obyekt_idlar.length === 1) ogoh.push(`narx_override: ${begona.length} ta qator mumkin ro'yxatida yo'q (${begona.slice(0, 10).join(', ')})`);
      const y = f2QoralamaYuki(rows, { raqam: a.raqam, override: a.narx_override, changPul: a.chang_pul });
      if (!y.qatorlar.length) return { nom: qisqa(ob.nom, 50), yozildi: false, sabab: 'F2 ga olinadigan fakt qoldig\'i yo\'q', tashlandi: y.tashlandi.length };
      const nk = await nkOl(m, id);
      const k = new Kesim();
      y.qatorlar.forEach((q, i) => { if (y.manbaQatorlar[i].tur !== 'bl') k.qosh(y.manbaQatorlar[i].kat, q.certified_amount); });
      const j = yukJami(y.qatorlar);
      const res = await rpcOk(m, 't2_akt_yarat_v2', {
        p_obyekt_id: id, p_oy: `${a.oy}-01`, p_qatorlar: y.qatorlar, p_actor_id: aktor, p_raqam: a.raqam?.trim() || null,
        p_operation_id: uuidHosila(asos, `f2:${id}`), p_manba: 'frontend_v2',
      }, aktor);
      const meta = new Map(y.manbaQatorlar.map((r) => [r.qator_id, r]));
      return {
        nom: qisqa(ob.nom, 50), yozildi: true, akt_id: res.akt_id ?? null, qatorlar: j.qatorlar, ish: y.manbaQatorlar.filter((r) => r.tur === 'bl').length,
        narxsiz_avto: j.narxsiz_avto, summa: uch(k, nk),
        ...(y.tashlandi.length ? { chang_tashlandi: { guruh: y.tashlandi.length, qiymat: y2(y.tashlandi.reduce((s, g) => s + g.qiymat, 0)) } } : {}),
        ...(n ? { namuna: namuna(y.qatorlar, meta, n) } : {}),
      };
    }));
    return javob(dry, natijalar, { oy: a.oy, manba: f2HujjatManba(a.raqam) });
  },
});

// ───────────────────────────── 2. f2_holat ─────────────────────────────

export const f2Holat = tool({
  nom: 'f2_holat',
  tavsif: 'F2 lifecycle o\'tishi (t2_akt_lifecycle_transition_v1): draft→submitted→checked→approved, rejected (faqat checked dan, `sabab` bilan), cancelled (`sabab` bilan). '
    + '`toliq_tasdiq:true` + holat:"approved" — draft/rejected dan approved gacha ketma-ket (har qadam kutilgan versiya bilan, bitta tranzaksiya — biri yiqilsa hammasi qaytadi). '
    + 'Bir yoki ko\'p akt (`akt_idlar`). Server kodlari o\'qiladigan izoh bilan (NARXSIZ_QATOR_BOR, DEPENDENTS_EXIST, STALE_VERSION, INVALID_LIFECYCLE_TRANSITION). Tasdiqlangan F2 o\'zgarmaydi.',
  kirish: {
    akt_idlar: z.array(z.number().int().positive()).min(1).max(200), holat: z.enum(LIFECYCLE), sabab: z.string().max(2000).optional(),
    toliq_tasdiq: z.boolean().optional(), kutilgan_versiya: z.number().int().optional().describe('faqat bitta akt uchun (standart — bazadagi joriy)'),
    operation_id: opS, dry_run: dryRunT,
  },
  yozadi: true,
  bajar: async (a, mu) => {
    const aktor = mu.aktorKerak(); const dry = quruq(a.dry_run); const asos = a.operation_id ?? randomUUID();
    if ((a.holat === 'rejected' || a.holat === 'cancelled') && !a.sabab?.trim()) throw new Error('REASON_REQUIRED — rad etish / bekor qilish uchun `sabab` majburiy.');
    const out: Array<Record<string, unknown>> = [];
    for (const aktId of a.akt_idlar) {
      try {
        const r = await mu.yozish({ tool: 'f2_holat', args: { ...a, akt_id: aktId }, dryRun: dry, obyektId: async (m) => (await aktOl(m, aktId)).obyekt_id, izoh: `#${aktId} → ${a.holat}` }, async (m) => {
          const akt = await aktOl(m, aktId);
          if (akt.tur !== 'f2') throw new Error(`Akt #${aktId} F2 emas (${akt.tur}).`);
          const joriy = akt.lifecycle_status ?? 'draft';
          if (joriy === 'approved' && a.holat !== 'approved') throw new Error(`Akt #${aktId} tasdiqlangan — o'zgarmaydi (tuzatish/storno tartibida).`);
          const yol = lifecycleYol(joriy, a.holat, a.toliq_tasdiq);
          if (yol.some((s) => s === 'submitted' || s === 'approved')) {
            const nx = (await m.query<{ n: number; idlar: number[] | null }>(`select count(*)::int as n, (array_agg(qator_id order by id))[1:10] as idlar from public.t2_akt_qator
                 where akt_id = $1 and raw_snapshot->>'narxsizSabab' = 'avto_qoralama' and (provenance_status = 'price_intentionally_absent' or certified_unit_price is null)`, [aktId])).rows[0];
            if (nx && nx.n > 0) throw new Error(`NARXSIZ_QATOR_BOR — ${nx.n} ta avto narxsiz qator (masalan ${(nx.idlar ?? []).join(', ')}); f2_qoralama_tahrir bilan narx kiriting yoki narxsiz:true.`);
          }
          let versiya = a.akt_idlar.length === 1 && a.kutilgan_versiya != null ? a.kutilgan_versiya : akt.versiya;
          const qadamlar: Array<{ dan: string; ga: string; versiya: number }> = [];
          let holat = joriy;
          for (const [i, s] of yol.entries()) {
            const res = await rpcOk(m, 't2_akt_lifecycle_transition_v1', {
              p_kompaniya_id: akt.kompaniya_id, p_akt_id: aktId, p_to_status: s, p_actor_id: aktor, p_expected_version: versiya,
              p_operation_id: uuidHosila(asos, `${aktId}:${i}:${s}`), p_reason: a.sabab?.trim() || null,
            }, aktor);
            versiya = Number(res.version ?? versiya);
            qadamlar.push({ dan: holat, ga: s, versiya });
            holat = s;
          }
          return { akt_id: aktId, raqam: akt.raqam, oy: akt.oy, oldin: joriy, keyin: holat, versiya, qadamlar: qadamlar.length };
        });
        out.push({ ...(r.snapshot_id != null ? { snapshot_id: r.snapshot_id } : {}), ...(r.ogohlantirishlar.length ? { ogoh: r.ogohlantirishlar } : {}), ...r.natija });
      } catch (e) { out.push({ akt_id: aktId, xato: xatoIzoh(xatoMatni(e)) }); }
    }
    return { dry_run: dry, ...(dry ? { izoh: 'dry_run: o\'tishlar server tomonidan tekshirildi va ROLLBACK qilindi.' } : {}), aktlar: out, ...(out.length > 1 ? { xulosa: { jami: out.length, xato: out.filter((x) => x.xato).length } } : {}) };
  },
});

// ───────────────────────────── 3. f2_qoralama_tahrir ─────────────────────────────

export const f2QoralamaTahrir = tool({
  nom: 'f2_qoralama_tahrir',
  tavsif: 'F2 QORALAMA (yoki rad etilgan) qatorlarini tahrirlash (t2_f2_qoralama_yangila_v1, kutilgan versiya bilan): `ozgartir:[{qator_id, hajm?, narx?, narxsiz?}]` '
    + '(narx → summa = hajm×narx; narxsiz:true — ongli narxsiz), `olib_tashla:[qator_id]`, `qosh_mumkindan:[qator_id]` (fakt qoldig\'idan, smeta narxi yoki `narx_override`). '
    + 'Storno qatorlari tegilmaydi. Tasdiqlangan/yuborilgan F2 rad etiladi. Javob: oldin/keyin qator soni va summa (ustamasiz/ustamali/QQS bilan).',
  kirish: {
    akt_id: z.number().int().positive(),
    ozgartir: z.array(z.object({ qator_id: z.number().int().positive(), hajm: z.number().optional(), narx: z.number().min(0).optional(), narxsiz: z.boolean().optional() })).max(5000).optional(),
    olib_tashla: z.array(z.number().int().positive()).max(5000).optional(),
    qosh_mumkindan: z.array(z.number().int().positive()).max(5000).optional(),
    narx_override: z.record(z.string().regex(/^\d+$/), z.object({ narx: z.number().min(0), manba: z.string().max(200).optional() })).optional(),
    kutilgan_versiya: z.number().int().optional(), operation_id: opS, dry_run: dryRunT,
  },
  yozadi: true,
  bajar: async (a, mu) => {
    const aktor = mu.aktorKerak(); const dry = quruq(a.dry_run);
    return mu.yozish({ tool: 'f2_qoralama_tahrir', args: a, dryRun: dry, obyektId: async (m) => (await aktOl(m, a.akt_id)).obyekt_id, izoh: `akt #${a.akt_id}` }, async (m) => {
      const akt = await aktOl(m, a.akt_id);
      if (akt.tur !== 'f2') throw new Error(`Akt #${a.akt_id} F2 emas.`);
      if (akt.holat !== 'qoralama' || !['draft', 'rejected'].includes(akt.lifecycle_status ?? 'draft')) throw new Error(`AKT_QORALAMA_EMAS — ${xatoIzoh('AKT_QORALAMA_EMAS').split(' — ')[1]} (holat ${akt.holat}/${akt.lifecycle_status}).`);
      const mavjud = (await m.query<MavjudAktQator>(`select qator_id, hajm, certified_quantity, certified_unit_price, certified_amount, provenance_status, certified_source_hash, raw_snapshot, izoh
                                                       from public.t2_akt_qator where akt_id = $1 order by id`, [a.akt_id])).rows.map((x) => ({ ...x, qator_id: Number(x.qator_id) }));
      let qosh: F2YukQator[] = [];
      if (a.qosh_mumkindan?.length) {
        const { rows } = await mumkinOl(m, akt.obyekt_id, a.qosh_mumkindan);
        const bor = new Set(rows.map((r) => r.qator_id));
        const yoq = a.qosh_mumkindan.filter((id) => !bor.has(id));
        if (yoq.length) throw new Error(`qosh_mumkindan: ${yoq.length} ta qatorda fakt qoldig'i yo'q yoki «bajarilmadi»: ${yoq.slice(0, 20).join(', ')}`);
        const manba = f2HujjatManba(akt.raqam);
        qosh = rows.map((r) => f2Qator(r, r.mumkin, manba, a.narx_override?.[String(r.qator_id)]));
      }
      const t = qoralamaTahrirYuki(mavjud, { ozgartir: a.ozgartir, olibTashla: a.olib_tashla, qosh });
      if (t.xato.length) throw new Error(`Tahrir rad etildi: ${t.xato.slice(0, 20).join('; ')}`);
      const idlar = [...new Set([...mavjud.map((x) => x.qator_id), ...t.yuk.map((x) => x.qator_id)])];
      const katlar = new Map((await m.query<{ id: number; kat: string | null; tur: string }>('select id, kat, tur from public.t2_qator where id = any($1::bigint[])', [idlar])).rows.map((r) => [Number(r.id), r]));
      const nk = await nkOl(m, akt.obyekt_id);
      const kesim = (yuk: ReadonlyArray<{ qator_id: number; certified_amount: number | null }>) => { const k = new Kesim(); for (const q of yuk) { const s = katlar.get(q.qator_id); if (s && s.tur !== 'bl') k.qosh(s.kat, q.certified_amount); } return k; };
      const eski = mavjud.map((x) => ({ qator_id: x.qator_id, certified_amount: x.provenance_status === 'price_intentionally_absent' ? null : x.certified_amount, price_intentionally_absent: x.provenance_status === 'price_intentionally_absent', raw_snapshot: x.raw_snapshot ?? {} }));
      const res = await rpcOk(m, 't2_f2_qoralama_yangila_v1', {
        p_actor_id: aktor, p_kompaniya_id: akt.kompaniya_id, p_akt_id: a.akt_id, p_kutilgan_versiya: a.kutilgan_versiya ?? akt.versiya,
        p_qatorlar: t.yuk, p_operation_id: a.operation_id ?? randomUUID(), p_manba: 'frontend_v2',
      }, aktor);
      return {
        akt_id: a.akt_id, raqam: akt.raqam, ozgardi: t.ozgardi, olindi: t.olindi, qoshildi: t.qoshildi, versiya: res.versiya ?? null,
        oldin: { ...yukJami(eski), summa: uch(kesim(eski), nk) }, keyin: { ...yukJami(t.yuk), summa: uch(kesim(t.yuk), nk) },
        ...(res.ogohlantirish_soni ? { server_ogoh: res.ogohlantirish_soni } : {}),
      };
    });
  },
});

// ───────────────────────────── 4. podval_tahrir ─────────────────────────────

export const podvalTahrir = tool({
  nom: 'podval_tahrir',
  tavsif: 'Obyekt(lar) smeta podvali foizlarini o\'rnatish (t2_nakrutka_podval_saqla_v1; podval — t2_obyekt_nakrutka.nakrutka_podval_id yoki obyektning faol podvali, yo\'q bo\'lsa standartdan yangisi). '
    + `Kodlar: ${PODVAL_KODLAR.join(', ')} (foiz, masalan {"tr_mat":4.5,"nds":12}; null — noma'lum). O'rnatilgan foiz manba='smeta' (server shu foizni oladi). `
    + 'Ixtiyoriy `baza` {kod:[kat…]}, `dalil` matni, `katak` {kod:"F120"}. Preview: kf_* va pryamye/ИТОГО-4/ВСЕГО oldin→keyin.',
  kirish: {
    obyekt_idlar: obyektlarS,
    foizlar: z.record(z.string().regex(/^[A-Za-z0-9_]{1,40}$/), z.number().nullable()),
    baza: z.record(z.string(), z.array(z.enum(['ЧЕЛ', 'МАШ', 'МАТ', 'ОБ', 'КАБ', 'М/К', 'БЕЗ СКЛАД'])).min(1)).optional(),
    dalil: z.string().max(500).optional(), katak: z.record(z.string(), z.string().max(40)).optional(), nom: z.string().max(200).optional(),
    operation_id: opS, dry_run: dryRunT,
  },
  yozadi: true,
  bajar: async (a, mu) => {
    const aktor = mu.aktorKerak(); const dry = quruq(a.dry_run); const asos = a.operation_id ?? randomUUID();
    const natijalar = await harBiri(a.obyekt_idlar, (id) => mu.yozish({ tool: 'podval_tahrir', args: { ...a, obyekt_id: id }, dryRun: dry, obyektId: id, izoh: Object.keys(a.foizlar).join(',') }, async (m) => {
      const ob = await obyektBormi(m, id);
      if (ob.kompaniya_id == null) throw new Error('obyektda kompaniya yo\'q');
      const k = Number(ob.kompaniya_id);
      await azoTekshir(m, k, aktor);
      const oldin = await nkOl(m, id);
      type PRow = { id: number; nom: string; qatorlar: PodvalQatorX[]; versiya: number };
      const pr = oldin?.nakrutka_podval_id != null
        ? (await m.query<PRow>('select id, nom, qatorlar, versiya from public.t2_nakrutka_podval where id = $1 and kompaniya_id = $2 and faol', [oldin.nakrutka_podval_id, k])).rows[0]
        : (await m.query<PRow>('select id, nom, qatorlar, versiya from public.t2_nakrutka_podval where obyekt_id = $1 and kompaniya_id = $2 and faol order by id desc limit 1', [id, k])).rows[0];
      const asl: PodvalQatorX[] = pr ? pr.qatorlar : (standartPodval((oldin?.koeffitsientlar ?? null) as Parameters<typeof standartPodval>[0]).qatorlar.map((q) => ({ ...q, ...(q.tur === 'foiz' ? { manba: 'meros' as const } : {}) })) as PodvalQatorX[]);
      const p = podvalFoizQoy(asl, a.foizlar, { baza: a.baza, dalil: a.dalil, katak: a.katak });
      if (p.xato.length) throw new Error(p.xato.join('; '));
      const tek = podvalTekshir({ versiya: 1, qatorlar: p.qatorlar } as unknown as Podval);
      if (tek.length) throw new Error(`podval tuzilmasi: ${tek.map((x) => `${x.kod ?? ''} ${x.xabar}`).join('; ')}`);
      const res = await rpcOk(m, 't2_nakrutka_podval_saqla_v1', {
        p_kompaniya_id: k, p_obyekt_id: id, p_shartnoma_id: null, p_nom: a.nom ?? pr?.nom ?? 'Подвал', p_qatorlar: p.qatorlar,
        p_id: pr ? Number(pr.id) : null, p_kutilgan_versiya: pr ? Number(pr.versiya) : null, p_operation_id: uuidHosila(asos, `podval:${id}`), p_kim: `mcp:actor:${aktor}`,
      }, aktor);
      const keyin = await nkOl(m, id);
      const j = (x: NkRow | null) => x ? { pryamye: x.pryamye, itogo4: x.itogo4, vsego: x.vsego, nk_manba: x.nk_manba } : null;
      return { nom: qisqa(ob.nom, 50), podval_id: res.id ?? pr?.id ?? null, versiya: res.versiya ?? null, yangi_podval: !pr, ozgardi: p.ozgardi, kf: { oldin: kfQism(oldin), keyin: kfQism(keyin) }, jami: { oldin: j(oldin), keyin: j(keyin) } };
    }));
    return javob(dry, natijalar);
  },
});

// ───────────────────────────── 5. narx_tuzat ─────────────────────────────

type TQ = { id: number; obyekt_id: number; ota_id: number | null; tur: string; kod: string | null; nom: string | null; birlik: string | null; hajm: number | null; narx: number | null; summa: number | null; qoshimcha: boolean | null; zamena: boolean | null; replaces_line_id: number | null };
const TQ_USTUN = 'id, obyekt_id, ota_id, tur, kod, nom, birlik, hajm, narx, summa, qoshimcha, zamena, replaces_line_id';

export const narxTuzat = tool({
  nom: 'narx_tuzat',
  tavsif: 'Smeta qatorlari narxini ommaviy tuzatish (t2_qator; summa = hajm×narx, ota ish (bl) summasi = bolalari yig\'indisi, bola summasi null bo\'lsa null). '
    + '`narxlar:[{qator_id, narx}]` yoki `nusxa:{obyekt_idlar, manba_obyekt_id?, koef?, usul?, faqat_narxsiz?}` — boshqa smeta versiyasidan (shu obyektning almashtirilgan versiyasi yoki boshqa obyekt) '
    + 'tur+kod+nom+birlik bo\'yicha narx × koef. `sabab` majburiy (audit). Faqat rs/mat/ob. Preview: obyekt bo\'yicha pryamye/ИТОГО-4/ВСЕГО oldin→keyin.',
  kirish: {
    sabab: z.string().min(3).max(500),
    narxlar: z.array(z.object({ qator_id: z.number().int().positive(), narx: z.number().min(0).nullable() })).max(20000).optional(),
    nusxa: z.object({
      obyekt_idlar: obyektlarS, manba_obyekt_id: z.number().int().positive().optional().describe('standart — o\'sha obyektning almashtirilgan (eski) versiyasi'),
      koef: z.number().positive().optional(), usul: z.enum(['kod_nom', 'kod']).optional(), faqat_narxsiz: z.boolean().optional().describe('standart true'),
    }).optional(),
    korsat: korsatS, dry_run: dryRunT,
  },
  yozadi: true,
  bajar: async (a, mu) => {
    const aktor = mu.aktorKerak(); const dry = quruq(a.dry_run); const n = a.korsat ?? 10;
    if (!a.narxlar?.length && !a.nusxa) throw new Error('`narxlar` yoki `nusxa` bering.');
    let guruh = new Map<number, Map<number, number | null>>();
    if (a.narxlar?.length) {
      const ids = a.narxlar.map((x) => x.qator_id);
      const ob = await mu.oqish((m) => m.query<{ id: number; obyekt_id: number }>('select id, obyekt_id from public.t2_qator where id = any($1::bigint[])', [ids]));
      const xar = new Map(ob.rows.map((r) => [Number(r.id), Number(r.obyekt_id)]));
      const yoq = ids.filter((id) => !xar.has(id));
      if (yoq.length) throw new Error(`qatorlar topilmadi: ${yoq.slice(0, 20).join(', ')}`);
      for (const x of a.narxlar) { const o = xar.get(x.qator_id)!; const g = guruh.get(o) ?? new Map(); g.set(x.qator_id, x.narx); guruh.set(o, g); }
    }
    if (a.nusxa) for (const o of a.nusxa.obyekt_idlar) if (!guruh.has(o)) guruh.set(o, new Map());
    guruh = new Map([...guruh].sort((x, y) => x[0] - y[0]));
    const natijalar = await harBiri([...guruh.keys()], (id) => mu.yozish({ tool: 'narx_tuzat', args: { ...a, obyekt_id: id }, dryRun: dry, obyektId: id, izoh: a.sabab }, async (m, ogoh) => {
      const ob = await obyektBormi(m, id);
      if (ob.kompaniya_id != null) await azoTekshir(m, Number(ob.kompaniya_id), aktor);
      const narx = new Map(guruh.get(id)!);
      let nusxaStat: Record<string, unknown> | undefined;
      if (a.nusxa?.obyekt_idlar.includes(id)) {
        const faqatNarxsiz = a.nusxa.faqat_narxsiz !== false;
        const maqsad = (await m.query<TQ>(`select ${TQ_USTUN} from public.t2_qator where obyekt_id = $1 and coalesce(versiya_holat,'faol') = 'faol' and tur in ('rs','mat','ob') ${faqatNarxsiz ? 'and narx is null' : ''}`, [id])).rows;
        const src = a.nusxa.manba_obyekt_id ?? id;
        if (src !== id) {
          const so = await obyektBormi(m, src);
          if (so.kompaniya_id !== ob.kompaniya_id) throw new Error(`manba obyekt #${src} boshqa kompaniyada.`);
        }
        const manba = (await m.query<TQ>(`select ${TQ_USTUN} from public.t2_qator where obyekt_id = $1 and tur in ('rs','mat','ob') and narx is not null and ${src === id ? "coalesce(versiya_holat,'faol') <> 'faol'" : "coalesce(versiya_holat,'faol') = 'faol'"}`, [src])).rows;
        const r = narxNusxa(maqsad.filter((q) => !narx.has(q.id)), manba, { koef: a.nusxa.koef, usul: a.nusxa.usul });
        for (const x of r.narxlar) narx.set(x.qator_id, x.narx);
        nusxaStat = { manba_obyekt_id: src, manba_qatorlar: manba.length, maqsad: maqsad.length, topildi: r.narxlar.length, noaniq: r.noaniq.length, topilmadi: r.topilmadi.length };
      }
      if (!narx.size) return { nom: qisqa(ob.nom, 50), ozgardi: 0, ...(nusxaStat ? { nusxa: nusxaStat } : {}), sabab: 'o\'zgartiriladigan qator yo\'q' };
      const ids = [...narx.keys()];
      const oldinQ = (await m.query<TQ>(`select ${TQ_USTUN} from public.t2_qator where id = any($1::bigint[]) and obyekt_id = $2 for update`, [ids, id])).rows;
      const notogri = oldinQ.filter((q) => !['rs', 'mat', 'ob'].includes(q.tur));
      if (notogri.length) throw new Error(`faqat rs/mat/ob narxi tuzatiladi; boshqa tur: ${notogri.slice(0, 10).map((q) => `#${q.id}(${q.tur})`).join(', ')}`);
      if (oldinQ.length !== ids.length) throw new Error('ba\'zi qatorlar bu obyektga tegishli emas');
      const nkOldin = await nkOl(m, id);
      const upd = await m.query<{ id: number; narx: number | null; summa: number | null }>(
        `update public.t2_qator q set narx = v.narx, summa = case when q.hajm is null or v.narx is null then null else round(q.hajm * v.narx, 2) end
           from (select unnest($1::bigint[]) as id, unnest($2::numeric[]) as narx) v
          where q.id = v.id and q.obyekt_id = $3 returning q.id, q.narx, q.summa`, [ids, ids.map((i) => narx.get(i)), id]);
      const otalar = [...new Set(oldinQ.map((q) => q.ota_id).filter((x): x is number => x != null))];
      let ishQayta = 0;
      if (otalar.length) {
        const bolalar = (await m.query<{ ota_id: number; summa: number | null }>(`select c.ota_id, c.summa from public.t2_qator c join public.t2_qator p on p.id = c.ota_id
                                                                                  where c.ota_id = any($1::bigint[]) and p.tur = 'bl' and c.tur in ('rs','mat','ob')`, [otalar])).rows;
        const xar = new Map<number, Array<{ summa: number | null }>>();
        for (const b of bolalar) { const arr = xar.get(Number(b.ota_id)) ?? []; arr.push({ summa: b.summa == null ? null : Number(b.summa) }); xar.set(Number(b.ota_id), arr); }
        const blId = [...xar.keys()];
        if (blId.length) {
          const r = await m.query(`update public.t2_qator p set summa = v.s from (select unnest($1::bigint[]) as id, unnest($2::numeric[]) as s) v where p.id = v.id and p.obyekt_id = $3 and p.tur = 'bl'`,
            [blId, blId.map((b) => blSumma(xar.get(b)!)), id]);
          ishQayta = r.rowCount ?? 0;
        }
      }
      const asl = oldinQ.filter((q) => !q.qoshimcha && !q.zamena && q.replaces_line_id == null).length;
      if (asl) ogoh.push(`DIQQAT: ${asl} ta asl smeta qatori narxi o'zgardi («asl smeta const» — snapshot_id bilan qaytarish mumkin).`);
      const nkKeyin = await nkOl(m, id);
      const yangi = new Map(upd.rows.map((r) => [Number(r.id), r]));
      const j = (x: NkRow | null) => x ? { pryamye: x.pryamye, itogo4: x.itogo4, vsego: x.vsego } : null;
      return {
        nom: qisqa(ob.nom, 50), ozgardi: upd.rowCount, ish_qayta_hisob: ishQayta, ...(nusxaStat ? { nusxa: nusxaStat } : {}),
        jami: { oldin: j(nkOldin), keyin: j(nkKeyin) },
        ...(n ? { namuna: oldinQ.slice(0, n).map((q) => ({ qator_id: q.id, kod: q.kod, nom: qisqa(q.nom, 50), hajm: q.hajm, narx: [q.narx, yangi.get(q.id)?.narx ?? null], summa: [q.summa, yangi.get(q.id)?.summa ?? null] })) } : {}),
      };
    }));
    return javob(dry, natijalar, { sabab: a.sabab });
  },
});

// ───────────────────────────── 6. bajarilmadi ─────────────────────────────

export const bajarilmadi = tool({
  nom: 'bajarilmadi',
  tavsif: '«Bajarilmadi» belgisi (asl smetaga tegmaydigan qoplama): amal "belgila" — t2_bajarilmadi_belgila_v1 (qatorlar [{qator_id, hajm?}] yoki qator_idlar; `sabab_kod`: '
    + `${SABAB_KODLAR.join('|')}; boshqa → sabab_izoh majburiy), `
    + '`faktni_nol:true` — avval mavjud to\'g\'ridan fakt −delta bilan nolga (t2_fakt_yoz_v2); amal "bekor" — t2_bajarilmadi_bekor_v1 (`bekor_idlar` yoki qator_idlar bo\'yicha faol belgilar). F2 qoralama yaratishda belgili qatorlar olinmaydi.',
  kirish: {
    obyekt_id: obyektIdS, amal: z.enum(['belgila', 'bekor']).optional().describe('standart belgila'),
    qatorlar: z.array(z.object({ qator_id: z.number().int().positive(), hajm: z.number().min(0).optional() })).max(2000).optional(),
    qator_idlar: z.array(z.number().int().positive()).max(2000).optional(),
    sabab_kod: z.enum(SABAB_KODLAR).optional(), sabab_izoh: z.string().max(1000).optional(), sana: sanaS.optional(),
    hujjat_id: z.number().int().positive().optional(), zamena_qator_id: z.number().int().positive().optional(),
    faktni_nol: z.boolean().optional(), bekor_idlar: z.array(z.number().int().positive()).max(2000).optional(),
    operation_id: opS, dry_run: dryRunT,
  },
  yozadi: true,
  bajar: async (a, mu) => {
    const aktor = mu.aktorKerak(); const dry = quruq(a.dry_run); const asos = a.operation_id ?? randomUUID();
    const amal = a.amal ?? 'belgila';
    return mu.yozish({ tool: 'bajarilmadi', args: a, dryRun: dry, obyektId: a.obyekt_id, izoh: `${amal} ${a.sabab_kod ?? ''}` }, async (m, ogoh) => {
      const ob = await obyektBormi(m, a.obyekt_id);
      if (!(await jadvalBor(m, 'public.t2_qator_bajarilmadi'))) throw new Error('t2_qator_bajarilmadi jadvali bazada yo\'q (migratsiya 20261106880000 qo\'llanmagan).');
      const k = Number(ob.kompaniya_id);
      if (amal === 'bekor') {
        let ids = a.bekor_idlar ?? [];
        if (!ids.length && a.qator_idlar?.length) ids = (await m.query<{ id: number }>("select id from public.t2_qator_bajarilmadi where obyekt_id = $1 and qator_id = any($2::bigint[]) and holat = 'faol'", [a.obyekt_id, a.qator_idlar])).rows.map((r) => Number(r.id));
        if (!ids.length) throw new Error('bekor qilinadigan faol belgi topilmadi (bekor_idlar yoki qator_idlar bering).');
        for (const id of ids) await rpcOk(m, 't2_bajarilmadi_bekor_v1', { p_kompaniya_id: k, p_actor_id: aktor, p_id: id, p_sabab: a.sabab_izoh ?? null, p_operation_id: uuidHosila(asos, `bekor:${id}`) }, aktor);
        return { amal, bekor_qilindi: ids.length };
      }
      const qatorlar = a.qatorlar ?? (a.qator_idlar ?? []).map((qator_id) => ({ qator_id }));
      if (!qatorlar.length) throw new Error('`qatorlar` yoki `qator_idlar` bering.');
      if (!a.sabab_kod) throw new Error('SABAB_KOD_INVALID — `sabab_kod` majburiy.');
      if (a.sabab_kod === 'boshqa' && !a.sabab_izoh?.trim()) throw new Error('SABAB_IZOH_MAJBURIY — sabab_kod=boshqa uchun sabab_izoh kerak.');
      let fakt: Record<string, unknown> | undefined;
      if (a.faktni_nol) {
        const h = (await m.query<{ j: Record<string, unknown> }>('select to_jsonb(h) as j from public.t2_qator_holat h where h.obyekt_id = $1 and h.qator_id = any($2::bigint[])', [a.obyekt_id, qatorlar.map((q) => q.qator_id)])).rows.map((r) => r.j);
        const f = faktNolYuki(h.map((j) => ({ qator_id: Number(j.qator_id), fakt_hajm: j.fakt_hajm == null ? null : Number(j.fakt_hajm), fakt_manbasi: (j.fakt_manbasi as string) ?? null,
          ...('direct_fakt_hajm' in j ? { direct_fakt_hajm: j.direct_fakt_hajm == null ? null : Number(j.direct_fakt_hajm) } : {}) })));
        for (const o of f.otkazildi.slice(0, 10)) ogoh.push(`#${o.qator_id}: ${o.sabab}`);
        if (f.qatorlar.length) {
          await rpcOk(m, 't2_fakt_yoz_v2', { p_obyekt_id: a.obyekt_id, p_sana: a.sana ?? new Date().toISOString().slice(0, 10), p_qatorlar: f.qatorlar, p_actor_id: aktor,
            p_operation_id: uuidHosila(asos, 'fakt_nol'), p_izoh: `bajarilmadi: ${a.sabab_kod}`, p_raqam: null, p_actor_label: `mcp:actor:${aktor}` }, aktor);
        }
        fakt = { nolga: f.qatorlar.length, otkazildi: f.otkazildi.length };
      }
      const res = await rpcOk(m, 't2_bajarilmadi_belgila_v1', {
        p_kompaniya_id: k, p_actor_id: aktor, p_obyekt_id: a.obyekt_id, p_qatorlar: qatorlar, p_sabab_kod: a.sabab_kod, p_sabab_izoh: a.sabab_izoh ?? null,
        p_hujjat_id: a.hujjat_id ?? null, p_sana: a.sana ?? null, p_zamena_qator_id: a.zamena_qator_id ?? null, p_operation_id: uuidHosila(asos, 'belgila'),
      }, aktor);
      return { amal, yaratildi: res.yaratildi ?? null, otkazildi: res.otkazildi ?? null, ...(fakt ? { fakt } : {}) };
    });
  },
});

// ───────────────────────────── 7. qoshimcha_ish ─────────────────────────────

export const qoshimchaIsh = tool({
  nom: 'qoshimcha_ish',
  tavsif: 'Qo\'shimcha (smetadan tashqari) ish + resurslari (t2_ish_abc_saqla_v1, command additional): `ish {nom, birlik, hajm, kod?}`, '
    + '`resurslar [{nom, birlik, kat?, norma? (ish birligiga) | hajm?, narx?, narx_manba?, kod?}]` (≤60; norma bo\'lsa rs, aks holda mat/ob), ixtiyoriy `fakt_hajm` + `sana`. '
    + '`ota_qator_id` berilmasa — «СМЕТАДАН ТАШҚАРИ ИШЛАР» bo\'limiga. `sabab` majburiy. Preview: taxminiy summa.',
  kirish: {
    obyekt_id: obyektIdS, ota_qator_id: z.number().int().positive().optional(),
    ish: z.object({ nom: z.string().min(1).max(1000), birlik: z.string().min(1).max(50), hajm: z.number().positive(), kod: z.string().max(100).optional() }),
    resurslar: z.array(z.object({
      nom: z.string().min(1).max(1000), birlik: z.string().min(1).max(50), kat: z.enum(KAT).optional(), norma: z.number().positive().optional(), hajm: z.number().positive().optional(),
      narx: z.number().min(0).optional(), narx_manba: z.string().max(40).optional(), kod: z.string().max(100).optional(),
    })).max(60).optional(),
    fakt_hajm: z.number().positive().optional(), sana: sanaS.optional(), sabab: z.string().min(3).max(1000), operation_id: opS, dry_run: dryRunT,
  },
  yozadi: true,
  bajar: async (a, mu) => {
    const aktor = mu.aktorKerak(); const dry = quruq(a.dry_run);
    for (const [i, r] of (a.resurslar ?? []).entries()) if (r.norma == null && r.hajm == null) throw new Error(`resurs ${i + 1}: norma yoki hajm kerak`);
    return mu.yozish({ tool: 'qoshimcha_ish', args: a, dryRun: dry, obyektId: a.obyekt_id, izoh: a.ish.nom.slice(0, 100) }, async (m) => {
      const ob = await obyektBormi(m, a.obyekt_id);
      let versiya: number | null = null;
      if (a.ota_qator_id) {
        const o = (await m.query<{ versiya: number; tur: string }>('select versiya, tur from public.t2_qator where id = $1 and obyekt_id = $2', [a.ota_qator_id, a.obyekt_id])).rows[0];
        if (!o) throw new Error(`ota qator #${a.ota_qator_id} bu obyektda yo'q`);
        versiya = Number(o.versiya);
      }
      const res = await rpcOk(m, 't2_ish_abc_saqla_v1', {
        p_actor_id: aktor, p_kompaniya_id: Number(ob.kompaniya_id), p_obyekt_id: a.obyekt_id, p_command: 'additional', p_ota_qator_id: a.ota_qator_id ?? null,
        p_almashtirilayotgan_qator_id: null, p_ish: a.ish, p_resurslar: a.resurslar ?? [], p_fakt_hajm: a.fakt_hajm ?? null, p_sana: a.sana ?? null,
        p_sabab: a.sabab, p_operation_id: a.operation_id ?? randomUUID(), p_kutilgan_versiya: versiya,
      }, aktor);
      const t = qoshimchaTaxmin(a.ish.hajm, a.resurslar ?? []);
      return { qator_id: res.qator_id ?? null, resurs_ids: res.resurs_ids ?? [], bolim_id: res.bolim_id ?? null, taxmin_summa_ustamasiz: t.summa, narxsiz_resurs: t.narxsiz, ...(a.fakt_hajm ? { fakt_hajm: a.fakt_hajm } : {}) };
    });
  },
});

// ───────────────────────────── 8. fakt_yoz ─────────────────────────────

export const faktYoz = tool({
  nom: 'fakt_yoz',
  tavsif: 'Fakt yozish (t2_fakt_yoz_v2): `qatorlar [{qator_id, hajm}]` — DELTA (minus — kamaytirish), `sana` (standart bugun), `izoh`, `raqam`. Javob: qator bo\'yicha fakt oldin→keyin (namuna). Narxi NULL qator bo\'lsa — ogohlantirish «narxsiz qator: summa bo\'sh, narx_tuzat bilan narx qo\'ying» (yozuv BLOKLANMAYDI; narx 0 narxsiz emas).',
  kirish: {
    obyekt_id: obyektIdS, sana: sanaS.optional(),
    qatorlar: z.array(z.object({ qator_id: z.number().int().positive(), hajm: z.number().refine((v) => v !== 0, 'hajm 0 bo\'lmasin') })).min(1).max(5000),
    izoh: z.string().max(500).optional(), raqam: z.string().max(100).optional(), korsat: korsatS, operation_id: opS, dry_run: dryRunT,
  },
  yozadi: true,
  bajar: async (a, mu) => {
    const aktor = mu.aktorKerak(); const dry = quruq(a.dry_run); const n = a.korsat ?? 10;
    return mu.yozish({ tool: 'fakt_yoz', args: a, dryRun: dry, obyektId: a.obyekt_id, izoh: a.izoh }, async (m, ogoh) => {
      await obyektBormi(m, a.obyekt_id);
      const ids = a.qatorlar.map((q) => q.qator_id);
      const oq = async () => new Map((await m.query<{ qator_id: number; nom: string | null; fakt_hajm: number | null }>('select qator_id, nom, fakt_hajm from public.t2_qator_holat where obyekt_id = $1 and qator_id = any($2::bigint[])', [a.obyekt_id, ids])).rows.map((r) => [Number(r.qator_id), r]));
      const oldin = await oq();
      const yoq = ids.filter((id) => !oldin.has(id));
      if (yoq.length) throw new Error(`qatorlar bu obyektda yo'q: ${yoq.slice(0, 20).join(', ')}`);
      const res = await rpcOk(m, 't2_fakt_yoz_v2', { p_obyekt_id: a.obyekt_id, p_sana: a.sana ?? new Date().toISOString().slice(0, 10), p_qatorlar: a.qatorlar, p_actor_id: aktor,
        p_operation_id: a.operation_id ?? randomUUID(), p_izoh: a.izoh ?? null, p_raqam: a.raqam ?? null, p_actor_label: `mcp:actor:${aktor}` }, aktor);
      const keyin = await oq();
      // Narxsiz qator (narx NULL): fakt yoziladi (BLOKLANMAYDI), summa bo'sh — server (t2_fakt_yoz_v2) qaytargan ogohlantirish chiqariladi. Narx 0 — narxsiz emas.
      const narxsiz = Number(res.narxsiz_soni) > 0 ? Number(res.narxsiz_soni) : 0;
      const narxsizQ = Array.isArray(res.narxsiz_qatorlar) ? (res.narxsiz_qatorlar as Array<{ qator_id: number; nom?: string | null }>) : [];
      if (narxsiz) ogoh.push(`narxsiz qator: summa bo'sh, narx_tuzat bilan narx qo'ying — ${narxsiz} ta (${narxsizQ.slice(0, 10).map((x) => `#${x.qator_id}`).join(', ')}${narxsiz > 10 ? ', …' : ''})`);
      return { akt_id: res.akt_id ?? null, qatorlar: a.qatorlar.length, ...(narxsiz ? { narxsiz_soni: narxsiz, narxsiz_qatorlar: narxsizQ.slice(0, 50) } : {}), ...(n ? { namuna: a.qatorlar.slice(0, n).map((q) => ({ qator_id: q.qator_id, nom: qisqa(oldin.get(q.qator_id)?.nom, 50), delta: q.hajm, fakt: [oldin.get(q.qator_id)?.fakt_hajm ?? null, keyin.get(q.qator_id)?.fakt_hajm ?? null] })) } : {}) };
    });
  },
});

// ───────────────────────────── 9. yoyilma ─────────────────────────────

const pulM = (x: number | null | undefined) => (x == null ? '—' : Math.round(x).toLocaleString('ru-RU').replace(/ /g, ' '));

export const yoyilma = tool({
  nom: 'yoyilma',
  tavsif: 'Obyekt(lar) yoki shartnoma bo\'yicha pul yoyilmasi: fakt / F2-mumkin (fakt qoldig\'i × smeta narxi yoki override; «bajarilmadi» chiqarilgan) / F2 qoralama (jarayondagi) / F2 tasdiqlangan — '
    + 'har biri ustamasiz, ustamali (ИТОГО-4) va QQS bilan (t2_obyekt_nakrutka kf_*). «Summa qayerdan» jadvali. Javob — ixcham markdown jadval + jami; `batafsil:true` — obyektlar JSON.',
  kirish: {
    obyekt_idlar: obyektlarS.optional(), shartnoma_id: z.number().int().positive().optional(),
    narx_override: z.record(z.string().regex(/^\d+$/), z.number().min(0)).optional().describe('{qator_id: narx} — fakt va F2-mumkin uchun'),
    batafsil: z.boolean().optional(),
  },
  yozadi: false,
  bajar: async (a, mu: Muhit) => mu.oqish(async (m) => {
    let ids = a.obyekt_idlar ?? [];
    if (a.shartnoma_id) ids = [...new Set([...ids, ...(await m.query<{ obyekt_id: number }>("select obyekt_id from public.t2_shartnoma_bog where shartnoma_id = $1 and holat = 'faol' order by obyekt_id", [a.shartnoma_id])).rows.map((r) => Number(r.obyekt_id))])];
    if (!ids.length) throw new Error('obyekt_idlar yoki shartnoma_id bering (shartnomada faol obyekt yo\'q).');
    const ov = a.narx_override ?? {};
    const baj = await jadvalBor(m, 'public.t2_qator_bajarilmadi');
    const obs: Array<Record<string, unknown> & { nom: string; f: Uch; mu: Uch; q: Uch; t: Uch }> = [];
    for (const id of ids) {
      const ob = await obyektBormi(m, id);
      const rows = (await m.query<{ id: number; kat: string | null; fakt_hajm: number | null; fakt_summa: number | null; mumkin: number | null; smeta_narx: number | null; baj: boolean }>(
        `select q.id, q.kat, h.fakt_hajm, h.fakt_summa, h.f2_mumkin_hajm as mumkin, h.smeta_narx,
                ${baj ? "exists (select 1 from public.t2_qator_bajarilmadi b where b.qator_id = q.id and b.holat = 'faol')" : 'false'} as baj
           from public.t2_qator q join public.t2_qator_holat h on h.qator_id = q.id
          where q.obyekt_id = $1 and coalesce(q.versiya_holat,'faol') = 'faol' and q.tur in ('rs','mat','ob')`, [id])).rows;
      const fK = new Kesim(); const mK = new Kesim(); let bajSoni = 0;
      for (const r of rows) {
        const o = ov[String(r.id)];
        const fh = r.fakt_hajm == null ? null : Number(r.fakt_hajm);
        if (fh != null && Math.abs(fh) > 1e-9) fK.qosh(r.kat, o != null ? y2(fh * o) : r.fakt_summa);
        const mh = r.mumkin == null ? 0 : Number(r.mumkin);
        if (mh > 1e-6) {
          if (r.baj) { bajSoni++; continue; }
          const nr = o ?? (r.smeta_narx == null ? null : Number(r.smeta_narx));
          mK.qosh(r.kat, nr == null ? null : y2(mh * nr));
        }
      }
      const akt = (await m.query<{ id: number; lc: string; kat: string | null; s: number | null }>(
        `select a.id, coalesce(a.lifecycle_status,'draft') as lc, q.kat, aq.certified_amount as s
           from public.t2_akt a join public.t2_akt_qator aq on aq.akt_id = a.id join public.t2_qator q on q.id = aq.qator_id
          where a.obyekt_id = $1 and a.tur = 'f2' and coalesce(a.holat,'') <> 'bekor' and coalesce(a.lifecycle_status,'draft') not in ('cancelled','superseded')
            and q.tur in ('rs','mat','ob')`, [id])).rows;
      const qK = new Kesim(); const tK = new Kesim(); const qAkt = new Set<number>(); const tAkt = new Set<number>();
      for (const x of akt) { if (x.lc === 'approved') { tK.qosh(x.kat, x.s); tAkt.add(Number(x.id)); } else { qK.qosh(x.kat, x.s); qAkt.add(Number(x.id)); } }
      const nk = await nkOl(m, id);
      obs.push({ obyekt_id: id, nom: qisqa(ob.nom, 40), f: uch(fK, nk), mu: uch(mK, nk), q: { ...uch(qK, nk) }, t: uch(tK, nk), qoralama_akt: qAkt.size, tasdiq_akt: tAkt.size, bajarilmadi_qator: bajSoni, nk_manba: nk?.nk_manba ?? null });
    }
    const qoshUch = (xs: Uch[]): Uch => {
      const s = (k: 'ustamasiz' | 'ustamali' | 'qqs_bilan') => (xs.every((x) => x[k] == null) ? null : xs.some((x) => x[k] == null && x.ustamasiz != null) ? null : y2(xs.reduce((t, x) => t + (x[k] ?? 0), 0)));
      return { ustamasiz: s('ustamasiz'), ustamali: s('ustamali'), qqs_bilan: s('qqs_bilan'), narxsiz_soni: xs.reduce((t, x) => t + x.narxsiz_soni, 0) };
    };
    const jami = { fakt: qoshUch(obs.map((o) => o.f)), f2_mumkin: qoshUch(obs.map((o) => o.mu)), f2_qoralama: qoshUch(obs.map((o) => o.q)), f2_tasdiqlangan: qoshUch(obs.map((o) => o.t)) };
    const satr = (nom: string, f: Uch, mm: Uch, q: Uch, t: Uch) => `| ${nom} | ${pulM(f.ustamali)} | ${pulM(mm.ustamasiz)} / ${pulM(mm.ustamali)} / ${pulM(mm.qqs_bilan)}${mm.narxsiz_soni ? ` (narxsiz ${mm.narxsiz_soni})` : ''} | ${pulM(q.ustamali)} | ${pulM(t.ustamali)} / ${pulM(t.qqs_bilan)} |`;
    const jadval = ['| obyekt | fakt ustamali | F2-mumkin ustamasiz / ustamali / QQS bilan | F2 qoralama ustamali | F2 tasdiq ustamali / QQS bilan |', '|---|---|---|---|---|',
      ...obs.map((o) => satr(`#${o.obyekt_id} ${o.nom}`, o.f, o.mu, o.q, o.t)), ...(obs.length > 1 ? [satr('**JAMI**', jami.fakt, jami.f2_mumkin, jami.f2_qoralama, jami.f2_tasdiqlangan)] : [])].join('\n');
    return {
      jadval, jami,
      ...(a.batafsil ? { obyektlar: obs.map(({ f, mu: mm, q, t, ...r }) => ({ ...r, fakt: f, f2_mumkin: mm, f2_qoralama: q, f2_tasdiqlangan: t })) } : {}),
      izoh: 'so\'m, QQS siz (ustamasiz/ustamali) va QQS bilan; ustama — t2_obyekt_nakrutka kf_* (smeta podvali/shartnoma). null/— — noma\'lum (0 emas). F2-mumkin — fakt qoldig\'i × smeta narxi (override ustun).',
    };
  }),
});

export const ISH_OQIMI_TOOLLAR = [yoyilma, f2QoralamaYarat, f2Holat, f2QoralamaTahrir, podvalTahrir, narxTuzat, bajarilmadi, qoshimchaIsh, faktYoz];
