/**
 * Topshirilgan oylik paket ogohlantirishi (egasi 2026-11-03): fakt/F2 saqlashdan OLDIN, shu obyekt va oy uchun paket «topshirildi»
 * bo'lsa ogohlantirish chiqadi. HECH QACHON bloklamaydi: tekshiruv xato bersa yoki sekin bo'lsa ham saqlash davom etadi.
 */
import { t } from '../../i18n/til';
import { topshirilganPaketlar, type TopshirilganPaket } from '../../api/t2-shartnoma-oylik-paket';
import { toast } from '../../umumiy/ui/Toast';
import { raqamTozala } from '../raqam-belgi';

/** «DD.MM.YYYY» (Toshkent vaqti bo'yicha, mashina soat mintaqasiga bog'liq emas). */
export function paketSanasi(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return new Intl.DateTimeFormat('ru-RU', { timeZone: 'Asia/Tashkent', day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
}

/** Ogohlantirish matni: har shartnoma uchun bitta jumla (bir nechta bo'lsa shartnoma raqami bilan). */
export function paketOgohMatni(paketlar: readonly TopshirilganPaket[]): string {
  const ko = (p: TopshirilganPaket) => t('Bu oy paketi topshirilgan (v{n}, {sana}). O‘zgarish paketga kirmaydi — yangi versiya kerak bo‘ladi.', { n: String(p.versiya), sana: paketSanasi(p.vaqt) });
  if (paketlar.length === 1) return ko(paketlar[0]);
  return paketlar.map((p) => `${t('Shartnoma')} № ${raqamTozala(p.shartnoma_raqam)}: ${ko(p)}`).join('\n');
}

/**
 * Saqlashdan oldin chaqiriladi. `oy` - «YYYY-MM» yoki «YYYY-MM-DD». Tekshiruv 1,5 s dan oshsa kutilmaydi.
 * Ogohlantirish chiqqan bo'lsa matn qaytadi (test uchun); aks holda null.
 */
export async function topshirilganPaketOgohi(obyektId: number, oy: string | null | undefined, kutishMs = 1500): Promise<string | null> {
  if (!oy) return null;
  try {
    const paketlar = await Promise.race([
      topshirilganPaketlar(obyektId, oy),
      new Promise<TopshirilganPaket[]>((res) => setTimeout(() => res([]), kutishMs)),
    ]);
    if (!paketlar.length) return null;
    const matn = paketOgohMatni(paketlar);
    toast(matn, 'warn', undefined, 9000);
    return matn;
  } catch { return null; }
}
