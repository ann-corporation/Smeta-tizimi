/**
 * Jarvis: «tizim nimani o'rgandi» va «qayerda qiynalishyapti» javoblari. Faqat O'QISH (bepul, model yo'q); xom biznes ma'lumot yuborilmaydi —
 * faqat sanoqlar va frictionKey. Kurs moduli ulangan bo'lsa (`kursTavsiyaUlash`) tegishli darslar ham aytiladi.
 */
import { t } from '../../i18n/til';
import { osuvchiMeningOl } from '../../api/t2-osuvchi';
import { kursTavsiya, qiyinJoylar } from './kurs';

const DOMEN: Record<string, string> = { lugat: 'qidiruv so‘zi', moslash: 'qator mosligi', naryad_qator: 'naryad (usta birligi, koef)', ustun: 'ustun mosligi', birlik: 'birlik' };

export async function osuvchiMatni(kompaniyaId: number, qism: 'oqigan' | 'qiyin'): Promise<string> {
  if (qism === 'oqigan') {
    const r = await osuvchiMeningOl(kompaniyaId);
    if (!r) return t('Tajribani o‘qib bo‘lmadi.');
    if (!r.length) return t('Tizim hozircha sizning tanlovlaringizdan hech narsa eslab qolmagan.');
    const per = new Map<string, number>();
    for (const x of r) per.set(x.domen, (per.get(x.domen) ?? 0) + 1);
    return t('Tizim sizning {n} ta tanlovingizni eslab qolgan: {royxat}. Keyingi safar ularni «taklif (tajribadan)» deb ko‘rsatadi; o‘zi qo‘llamaydi.', { n: r.length, royxat: [...per.entries()].map(([d, k]) => `${t(DOMEN[d] ?? d)} — ${k}`).join(', ') });
  }
  let joylar = await qiyinJoylar(kompaniyaId, 3);
  if (!joylar.length) joylar = await qiyinJoylar(null, 3);
  if (!joylar.length) return t('Hozircha ko‘pchilik adashayotgan joy qayd etilmagan.');
  const satr = joylar.map((j) => t('{k}: {o} odam, {p} % muvaffaqiyatsiz', { k: j.kalit, o: j.odam, p: Math.round(j.nuqson * 100) })).join('; ');
  const darslar = kursTavsiya(joylar.map((j) => j.kalit));
  return t('Eng ko‘p qiynalayotgan joylar: {satr}. Shu joyda ko‘pchilik adashadi — ko‘rsataymi?', { satr }) + (darslar.length ? ` ${t('Tavsiya etilgan darslar')}: ${darslar.map((x) => x.dars).join(', ')}.` : '');
}
