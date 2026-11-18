/**
 * arxiv-siyosat.ts - SAQLASH SIYOSATI REYESTRI (deklarativ). Har tarix/log/versiya/snapshot/qoralama jadvali SHU YERDA e'lon qilinadi:
 * issiq saqlash muddati, arxiv formati va tiklash usuli. DB dagi t2_arxiv_siyosat jadvali (migratsiya) shu ro'yxatning nusxasi;
 * ikkalasining mosligi arxiv-siyosat.test.ts da tekshiriladi. Yangi history-like jadval qo'shilsa - bu yerga yozuv shart (CI guard).
 *
 * rejim:
 *   'qator-arxiv'   - sovuq qatorlar R2 ga ndjson.gz, tekshiruvdan keyin bazadan o'chiriladi; tiklash: t2_arxiv_tikla_v1 / /api/arxiv-tikla
 *   'snapshot-sovuq'- snapshot.bolak_mazmun: mazmun R2 ga, bazada kalit+sha256; tiklash: snapshot.sovuq_tikla (snapshot_qaytar/farq avtomatik)
 *   'saqlanadi'     - ATAYIN bazada qoladi (biznes manbasi, FK bilan bog'liq yoki kichik); sababi `izoh` da
 */
export type ArxivRejim = 'qator-arxiv' | 'snapshot-sovuq' | 'saqlanadi';
export type ArxivSiyosat = {
  jadval: string;                 // 'sxema.jadval' yoki public jadval nomi
  rejim: ArxivRejim;
  saqlashKun: number | null;     // issiq muddat (kun)
  kalit?: string; kalitTur?: 'bigint' | 'uuid'; vaqt?: string;
  shartUstun?: string; shartEmas?: string;   // qo'shimcha: shartUstun <> shartEmas bo'lgan qatorlargina arxivlanadi
  format: 'ndjson.gz' | 'json.gz' | '-';
  tiklash: string;
  izoh: string;
};

const QATOR = (jadval: string, kalit: string, kalitTur: 'bigint' | 'uuid', vaqt: string, saqlashKun: number, izoh: string, sh?: { ustun: string; emas: string }): ArxivSiyosat => ({
  jadval, rejim: 'qator-arxiv', saqlashKun, kalit, kalitTur, vaqt, format: 'ndjson.gz', tiklash: 't2_arxiv_tikla_v1', izoh,
  ...(sh ? { shartUstun: sh.ustun, shartEmas: sh.emas } : {}),
});
const SAQLANADI = (jadval: string, izoh: string): ArxivSiyosat => ({ jadval, rejim: 'saqlanadi', saqlashKun: null, format: '-', tiklash: '-', izoh });

export const ARXIV_SIYOSATLARI: readonly ArxivSiyosat[] = [
  SAQLANADI('t2_hm_versiya', 'Hujjat maydoni fayl versiyalari: faqat metama\'lumot (baytlar R2 da); foydalanuvchi versiyani o\'chirguncha yoki fayl savatda 30 kun turgach tozalanadi - sovuq arxivga o\'tkazilmaydi'),
  QATOR('t2_onboarding_command_log', 'operation_id', 'uuid', 'created_at', 7, 'buyruq payloadlari; faqat audit tarixi'),
  QATOR('t2_addrepl_command', 'operation_id', 'uuid', 'created_at', 7, 'qo\'shimcha/zamena buyruq jurnali (idempotentlik kaliti 7 kundan keyin kerak emas)'),
  QATOR('t2_ai_telemetriya', 'id', 'bigint', 'vaqt', 30, 'AI chaqiruv telemetriyasi (yuza/kechikish/xato kodi/token); matn yo\'q; 30 kundan keyin R2 ga'),
  QATOR('t2_ozgarish', 'id', 'bigint', 'vaqt', 30, 'qator o\'zgarish tarixi (muhr farq ko\'rinishi o\'qiydi - 30 kundan kamaytirilmaydi)'),
  QATOR('t2_audit_log', 'id', 'bigint', 'yaratilgan_vaqt', 7, 'audit jurnali'),
  QATOR('t2_f2_import_draft_qator', 'id', 'bigint', 'yaratildi', 7, 'F2 import qoralama qatorlari; hal qilinmaganlari qoladi', { ustun: 'holat', emas: 'hal_qilinmagan' }),
  { jadval: 'snapshot.bolak_mazmun', rejim: 'snapshot-sovuq', saqlashKun: 30, format: 'json.gz', tiklash: 'snapshot.sovuq_tikla', izoh: 'snapshot blok mazmuni; 30 kundan eskisi R2 ga' },
  SAQLANADI('snapshot.obyekt_snapshot', 'kichik (3 MB) boshqaruv jadvali; mazmun bolak_mazmun orqali sovutiladi'),
  SAQLANADI('snapshot.obyekt_snapshot_bolak', 'kichik havolalar jadvali'),
  SAQLANADI('snapshot.qaytarish_jurnal', 'kichik; qaytarish tarixi'),
  SAQLANADI('snapshot.r2_yetim', 'R2 yetim kalitlar ro\'yxati (tozalash uchun)'),
  SAQLANADI('snapshot.jadval_royxat', 'sozlama jadvali'),
  SAQLANADI('t2_smeta_revision', 'FK: t2_smeta_versiya/t2_smeta_ozgarish havola qiladi; 22 qator, jsonb ustunni R2 ga ko\'chirish alohida ADR'),
  SAQLANADI('t2_qator_muhr', 'biznes ma\'lumoti (muhrlangan qatorlar), arxivlanmaydi'),
  SAQLANADI('t2_smeta_versiya_pozitsiya', 'faol versiya ma\'lumoti'),
  SAQLANADI('t2_smeta_versiya_moslik', 'faol versiya ma\'lumoti'),
  SAQLANADI('t2_smeta_ozgarish', 'smeta o\'zgarish arizalari (FK, biznes)'),
  SAQLANADI('t2_signal', 'faol signallar; hal qilinganlarini tozalash keyingi bosqich'),
  SAQLANADI('t2_arxiv_bolak', 'arxiv manifesti (R2 indeksi)'),
  SAQLANADI('t2_arxiv_siyosat', 'siyosat reyestri'),
  SAQLANADI('t2_arxiv_ish_jurnal', 'arxivlovchi ish jurnali (kichik; 90 kundan keyin o\'zi tozalanadi)'),
];

export const siyosatOl = (jadval: string): ArxivSiyosat | undefined => ARXIV_SIYOSATLARI.find((s) => s.jadval === jadval);
export const qatorArxivRoyxati = (): ArxivSiyosat[] => ARXIV_SIYOSATLARI.filter((s) => s.rejim === 'qator-arxiv');

/** Tarix/log-ga o'xshash jadval nomi naqshlari - yangi migratsiyada shunday jadval yaratilsa, reyestrda yozuv SHART. */
export const TARIX_NAQSHI = /(_log|_tarix|_audit|_ozgarish|_qoralama|_versiya|_jurnal)$/;
