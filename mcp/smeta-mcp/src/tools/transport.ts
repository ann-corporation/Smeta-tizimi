/**
 * transport_tekshir — har material uchun BITTA transport usuli (foiz | tkm | narx_ichida) auditi.
 * Manba: `t2_qator_transport_audit_v1` (migratsiya 20270120200000): t·km qatori transportsiz tkm material, materialsiz t·km qatori,
 * ikki marta (t·km + %-baza) olinayotgan material, bitta materialga ikkita t·km qatori. Faqat o'qish; pul qayta hisoblanmaydi.
 */
import { z } from 'zod';
import { obyektIdS, tool } from '../tool';
import { dryRunT, quruq } from './ish-oqimi';
export { transportOgoh } from '../transport-ogoh';

type AuditJavob = {
  ok?: boolean; code?: string; error?: string; obyekt_id?: number;
  xulosa?: Record<string, number>;
  materiallar?: Array<Record<string, unknown>>;
  xatolar?: Array<{ kod: string; qator_id: number; xabar: string }>;
};

export const transportTekshir = tool({
  nom: 'transport_tekshir',
  tavsif: 'Transport auditi (faqat o\'qish): obyektdagi har material qaysi usulda transport oladi — `foiz` (podval %-bazasida, NULL ham shu), `tkm` (alohida t·km qatori; %-bazadan chiqarilgan), '
    + '`narx_ichida` (narxda) — va XATOLAR: tkm material t·km qatorisiz (TKM_TRANSPORT_YOQ), materialsiz t·km qatori (TRANSPORT_MATERIAL_YOQ), '
    + 'bir material ham t·km, ham % bazada — IKKI MARTA transport (TKM_VA_FOIZ), bitta materialga ikkita t·km qatori (IKKITA_TRANSPORT). '
    + 'Aktor kerak (aktor_tanla / SMETA_AKTOR_ID). `xulosa.xato_soni = 0` — toza.',
  kirish: { obyekt_id: obyektIdS },
  yozadi: false,
  bajar: async (a, mu) => {
    if (mu.aktorId == null) throw new Error('Aktor o\'rnatilmagan — aktor_tanla yoki SMETA_AKTOR_ID.');
    const aktor = mu.aktorId;
    const r = await mu.oqish((m) => m.query<{ r: AuditJavob | null }>('select public.t2_qator_transport_audit_v1($1::bigint, $2::bigint) as r', [aktor, a.obyekt_id]));
    const j = r.rows[0]?.r;
    if (!j) throw new Error('t2_qator_transport_audit_v1 javob bermadi.');
    if (j.ok !== true) throw new Error(`Transport auditi rad etildi: ${j.code ?? 'XATO'}${j.error ? ` — ${j.error}` : ''}`);
    const xato = j.xatolar ?? [];
    return {
      obyekt_id: a.obyekt_id,
      toza: xato.length === 0,
      xulosa: j.xulosa ?? {},
      xatolar: xato,
      materiallar: j.materiallar ?? [],
    };
  },
});

type BelgilaJavob = { ok?: boolean; code?: string; error?: string; qator_idlar?: number[]; ozgardi?: number; qator_soni?: number; tkm_qatori_yoq_soni?: number; tkm_qatori_yoq?: number[] };

export const transportBelgila = tool({
  nom: 'transport_belgila',
  tavsif: 'Material qatorlariga transport usulini belgilash (`t2_qator_transport_belgila_v1`): `foiz` (podval transport-%, sukut), `tkm` (alohida t·km qatori; transport-% bazasidan chiqariladi) yoki '
    + '`narx_ichida` (yetkazish narxda; %-bazadan chiqariladi). Faqat shu obyektning faol material qatorlari (rs/mat/ob, material kat). t·km qatori bor materialni foiz/narx_ichida ga o\'tkazib bo\'lmaydi. '
    + 'Aktor `smeta.write` ruxsatiga ega bo\'lishi kerak. `dry_run` STANDART true: server tekshiruvi + audit natijasi, ROLLBACK; false — snapshot + yozish. Yozgach `transport_tekshir` natijasi qaytadi.',
  kirish: {
    obyekt_id: obyektIdS,
    qator_idlar: z.array(z.number().int().positive()).min(1).max(5000).describe('t2_qator.id (material qatorlari)'),
    usul: z.enum(['foiz', 'tkm', 'narx_ichida']),
    dry_run: dryRunT,
  },
  yozadi: true,
  bajar: async (a, mu) => {
    const aktor = mu.aktorKerak(); const dry = quruq(a.dry_run);
    const r = await mu.yozish({ tool: 'transport_belgila', args: a, dryRun: dry, obyektId: a.obyekt_id, izoh: `transport usuli: ${a.usul} (${a.qator_idlar.length} qator)` }, async (m) => {
      const j = (await m.query<{ r: BelgilaJavob | null }>('select public.t2_qator_transport_belgila_v1($1::bigint, $2::bigint, $3::bigint[], $4::text) as r', [aktor, a.obyekt_id, a.qator_idlar, a.usul])).rows[0]?.r;
      if (!j) throw new Error('t2_qator_transport_belgila_v1 javob bermadi.');
      if (j.ok !== true) throw new Error(`transport_belgila rad etildi: ${j.code ?? 'XATO'}${j.error ? ` — ${j.error}` : ''}${j.qator_idlar?.length ? ` [${j.qator_idlar.slice(0, 10).join(', ')}]` : ''}`);
      const au = (await m.query<{ r: AuditJavob | null }>('select public.t2_qator_transport_audit_v1($1::bigint, $2::bigint) as r', [aktor, a.obyekt_id])).rows[0]?.r;
      return { belgilash: j, audit: { xulosa: au?.xulosa ?? null, xatolar: (au?.xatolar ?? []).slice(0, 20) } };
    });
    return {
      dry_run: dry,
      ...(dry ? { izoh: 'dry_run: server tekshiruvlari o\'tdi, hammasi ROLLBACK — bazaga yozilmadi. Yozish uchun dry_run:false.' } : {}),
      obyekt_id: a.obyekt_id, snapshot_id: r.snapshot_id ?? null, ...(r.ogohlantirishlar?.length ? { ogoh: r.ogohlantirishlar } : {}), ...r.natija,
    };
  },
});

type YoyJavob = { ok?: boolean; code?: string; error?: string; yozildi?: boolean; bloklangan?: boolean; yaratildi?: number; guruhlar?: Array<Record<string, unknown>> };

const yoyGuruhS = z.object({
  material: z.string().min(1).describe('«Расчёт затрат транспорта» varag\'idagi material nomi'),
  birlik: z.string().optional(),
  miqdor: z.number().nonnegative().optional().describe('varaqdagi material miqdori (tizim bilan solishtiriladi)'),
  zichlik: z.number().positive().describe('t / birlik (varaq: Кол-во (тн) ÷ Кол-во). Tonnada bo\'lsa 1'),
  km: z.number().nonnegative().describe('Дальность возки, км'),
  hisob_tkm: z.number().nonnegative().optional().describe('varaqdagi Грузооборот тн.км (tizim bilan solishtiriladi)'),
  kodlar: z.array(z.string().min(1)).max(100).optional().describe('material resurs kodlari (masalan 12303)'),
  nom_pattern: z.string().min(2).optional().describe('nom bo\'yicha ILIKE namuna, masalan %ЩЕБЕН%'),
});

export const transportYoy = tool({
  nom: 'transport_yoy',
  tavsif: '«Расчёт затрат транспорта» varag\'idan t·km transportini tizim O\'ZI yoyadi: rz_id ostida material qatorlarini kod/nom bo\'yicha topadi, har biri tagiga bitta t·km rs qatori '
    + '(kod «Т·КМ», kat МАШ, birlik «Т·КМ»; norma/hajm = material x zichlik x km; narx = tkm_narx; transport_manba_qator_id) qo\'shadi va materialga transport_usul=tkm qo\'yadi (podval transport-% bazasidan chiqadi). '
    + 'Preview (dry_run STANDART true): har guruh bo\'yicha topilgan qatorlar, miqdor va t·km (tizim vs varaq), so\'mdagi farq, topilmaganlar. Farq > 0.5% / topilmadi / qisman — BLOKLANADI (`majburiy:true` bilan o\'tadi). '
    + 'Idempotent: allaqachon tkm bog\'langan material qayta yaratilmaydi. Keyin `transport_tekshir` bilan tekshiring.',
  kirish: {
    obyekt_id: obyektIdS,
    rz_id: z.number().int().positive().describe('bo\'lim/uchastka ildizi (t2_qator.id) — qidiruv shu ostida'),
    tkm_narx: z.number().nonnegative().describe('1 t·km narxi (so\'m, QQS siz)'),
    qatorlar: z.array(yoyGuruhS).min(1).max(500),
    majburiy: z.boolean().optional().describe('bloklangan guruhlar (farq/qisman) bilan ham yozish; topilmagan guruh baribir o\'tkaziladi'),
    dry_run: dryRunT,
  },
  yozadi: true,
  bajar: async (a, mu) => {
    const aktor = mu.aktorKerak(); const dry = quruq(a.dry_run);
    const chaq = async (m: import('../db').Mijoz, yoz: boolean): Promise<YoyJavob> => {
      const j = (await m.query<{ r: YoyJavob | null }>('select public.t2_qator_transport_yoy_v1($1::bigint, $2::bigint, $3::bigint, $4::numeric, $5::jsonb, $6::boolean, $7::boolean) as r',
        [aktor, a.obyekt_id, a.rz_id, a.tkm_narx, JSON.stringify(a.qatorlar), a.majburiy === true, yoz])).rows[0]?.r;
      if (!j) throw new Error('t2_qator_transport_yoy_v1 javob bermadi.');
      return j;
    };
    const r = await mu.yozish({ tool: 'transport_yoy', args: a, dryRun: dry, obyektId: a.obyekt_id, izoh: `t·km yoyish: ${a.qatorlar.length} guruh` }, async (m) => {
      // Preview har doim yozmaydi; dry_run da yozish yo'li ROLLBACK ichida sinab ko'riladi (cheklovlar/triggerlar).
      let j = await chaq(m, false);
      if (j.ok === false && j.code !== 'TASDIQ_KERAK') throw new Error(`transport_yoy rad etildi: ${j.code ?? 'XATO'}${j.error ? ` — ${j.error}` : ''}`);
      const preview = j;
      if (!j.bloklangan || a.majburiy === true) {
        j = await chaq(m, true);
        if (j.ok === false && j.code !== 'TASDIQ_KERAK') throw new Error(`transport_yoy rad etildi: ${j.code ?? 'XATO'}${j.error ? ` — ${j.error}` : ''}`);
      }
      const au = (await m.query<{ r: AuditJavob | null }>('select public.t2_qator_transport_audit_v1($1::bigint, $2::bigint) as r', [aktor, a.obyekt_id])).rows[0]?.r;
      return { bloklangan: preview.bloklangan === true, yozildi: j.yozildi === true, yaratildi: j.yaratildi ?? 0, kod: j.code ?? null, guruhlar: preview.guruhlar ?? [], audit: { xulosa: au?.xulosa ?? null, xatolar: (au?.xatolar ?? []).slice(0, 20) } };
    });
    const n = r.natija;
    return {
      dry_run: dry,
      ...(dry ? { izoh: 'dry_run: guruhlar bo\'yicha preview; yozish yo\'li ROLLBACK ichida sinaldi, bazaga yozilmadi. Yozish uchun dry_run:false.' } : {}),
      ...(n.bloklangan && a.majburiy !== true ? { ogohlantirish: 'Bloklangan guruhlar bor (farq > 0.5% / topilmadi / qisman) — hech narsa yozilmaydi. Ko\'rib chiqing yoki majburiy:true.' } : {}),
      obyekt_id: a.obyekt_id, snapshot_id: r.snapshot_id ?? null, ...(r.ogohlantirishlar?.length ? { ogoh: r.ogohlantirishlar } : {}), ...n,
    };
  },
});

export const TRANSPORT_TOOLLAR = [transportTekshir, transportBelgila, transportYoy];
