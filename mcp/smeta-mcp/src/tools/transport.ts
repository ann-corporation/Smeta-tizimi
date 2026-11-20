/**
 * transport_tekshir — har material uchun BITTA transport usuli (foiz | tkm | narx_ichida) auditi.
 * Manba: `t2_qator_transport_audit_v1` (migratsiya 20270120200000): t·km qatori transportsiz tkm material, materialsiz t·km qatori,
 * ikki marta (t·km + %-baza) olinayotgan material, bitta materialga ikkita t·km qatori. Faqat o'qish; pul qayta hisoblanmaydi.
 */
import { obyektIdS, tool } from '../tool';

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

export const TRANSPORT_TOOLLAR = [transportTekshir];
