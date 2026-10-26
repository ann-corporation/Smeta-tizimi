import { t } from '../i18n/til';

/**
 * Mindmap tahrir ruxsati (sof hisob). Server `t2_mindmap_actor_tekshir` rahbar roliga yozishni taqiqlaydi va
 * `document.write` ni talab qiladi; UI shu qoidani oldindan ko‘rsatadi — bajarib bo‘lmaydigan tugmalar chiqmaydi.
 * Server baribir yakuniy to‘siq (UI faqat tushuntiradi).
 */
export type TahrirSababi = 'rahbar' | 'ruxsat_yoq' | 'boshqa_kompaniya';
export type TahrirRuxsati = { mumkin: true; sabab: null } | { mumkin: false; sabab: TahrirSababi };

export type RuxsatKirish = {
  superadmin?: boolean;
  /** Tanlangan kompaniya (`useKompaniya().joriy`); `null` — kompaniya tanlanmagan. */
  joriy: { id: number; rol?: string | null; membershipRole?: string | null; permissions?: string[] } | null;
  /** Xarita ko‘rsatayotgan kompaniya (ichki nusxada — props); berilmasa `joriy.id`. */
  kompaniyaId?: number | null;
};

export function mindmapTahrirRuxsati({ superadmin = false, joriy, kompaniyaId }: RuxsatKirish): TahrirRuxsati {
  if (!joriy) return { mumkin: false, sabab: 'ruxsat_yoq' };
  // Boshqa kompaniya xaritasi — joriy kompaniya ruxsati u yerga tegishli emas.
  if (kompaniyaId != null && kompaniyaId !== joriy.id) return { mumkin: false, sabab: 'boshqa_kompaniya' };
  // Server a’zolik rolini (t2_azolik.rol) tekshiradi; samarali rol ham rahbar bo‘lsa — yozuv yopiq.
  if ([joriy.rol, joriy.membershipRole].some((r) => (r ?? '').toLowerCase() === 'rahbar')) return { mumkin: false, sabab: 'rahbar' };
  if (superadmin) return { mumkin: true, sabab: null };
  // Ruxsatlar ro‘yxati kelmagan (eski `t2_men`) — aniqlab bo‘lmaydi: AdminShell kabi taqiqlamaymiz, server tekshiradi.
  if (!joriy.permissions) return { mumkin: true, sabab: null };
  return joriy.permissions.includes('document.write') ? { mumkin: true, sabab: null } : { mumkin: false, sabab: 'ruxsat_yoq' };
}

/** Yozish yopiq bo‘lsa foydalanuvchiga nima uchunligi (server ham baribir tekshiradi). */
export function tahrirYopiqMatni(r: TahrirRuxsati | undefined): string | null {
  if (!r || r.mumkin) return null;
  if (r.sabab === 'rahbar') return t('Faqat ko‘rish: rahbar roli xaritani o‘zgartira olmaydi.');
  if (r.sabab === 'boshqa_kompaniya') return t('Faqat ko‘rish: bu xarita joriy kompaniyangiz emas.');
  return t('Faqat ko‘rish: tahrirlash uchun «Hujjatlar bilan ishlash» (document.write) ruxsati kerak.');
}
