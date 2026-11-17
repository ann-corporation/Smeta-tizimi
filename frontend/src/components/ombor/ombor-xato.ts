import { t } from '../../i18n/til';

/** Omborchi xato kodlari -> tushunarli matn (web ekranlari uchun umumiy). */
const KOD: Record<string, string> = {
  QOLDIQ_YETMAYDI: 'Ostatka yetmaydi — chiqim yozilmadi.', PERMISSION_DENIED: 'Bu amal uchun ruxsat yo‘q.', DATE_IN_FUTURE: 'Sana kelajakda bo‘lishi mumkin emas.',
  INVALID_INPUT: 'Ma’lumot noto‘g‘ri (nom, birlik, miqdor).', OPERATION_ID_CONFLICT: 'Bu amal boshqa ma’lumot bilan yuborilgan. Sahifani yangilang.',
  NETWORK: 'Aloqa yo‘q. Qayta urinib ko‘ring.', ALREADY_REVERSED: 'Bu yozuv allaqachon tuzatilgan.', MOVEMENT_NOT_CORRECTABLE: 'Bu yozuvni tuzatib bo‘lmaydi.',
  TOKEN_YETMAYDI: 'Tokenlar yetarli emas.', BYUDJET_TUGADI: 'AI oylik limiti tugadi.', VOICE_NOT_CONFIGURED: 'Ovozni matnga o‘tkazish yoqilmagan.',
  DATE_INVALID: 'Sana noto‘g‘ri.',
};
export const omborXatoMatni = (code?: string, xabar?: string) => t(KOD[code ?? ''] ?? xabar ?? 'Bajarilmadi. Birozdan keyin urinib ko‘ring.');