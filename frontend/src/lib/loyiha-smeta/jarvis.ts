/**
 * jarvis.ts — «КР-5 da nima farq», «smetaga kirmagan ishlar qancha» savollariga TASDIQLANGAN loyiha/smeta/fakt ma'lumotidan javob (Ctrl+K o'qish vositasi
 * `loyiha_farq`). Faqat o'qiydi; pul — farq.ts (hisob-yadro) natijasi: avval QQS bilan, so'ng QQS siz. Noma'lum narx «—» (0 emas).
 */
import { farqJami, type FarqJami, type FarqQator, type FarqTuri } from './farq';
import { varaqKalit } from './tahlil';
import type { TahrirMalumot } from './tahrir-jarvis';

export type LoyihaFarqMalumot = { farqlar: readonly FarqQator[]; taklifSoni: number; tasdiqlanganSoni: number; /** Chizma tahrirlari farqi (loyiha_tahrir vositasi). */ tahrir?: TahrirMalumot | null };

const NOM: Record<FarqTuri, string> = {
  loyihada_bor_smetada_yoq: 'loyihada bor — smetada yo‘q', smetada_bor_loyihada_yoq: 'smetada bor — loyihada yo‘q', hajm_farqi: 'hajm farqi',
  almashgan: 'almashgan (sinf/marka)', fakt_oshgan: 'fakt loyihadan oshgan',
};
const sum = (n: number | null) => (n == null ? '—' : new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(n));
const son = (n: number | null) => (n == null ? '—' : new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 3 }).format(n));

function jamiSatri(j: FarqJami): string {
  return `Smetaga kirmagan (hal qilinmagan): ${j.kirmaganSoni} ta, ${sum(j.kirmaganQQSbilan)} so‘m QQS bilan (${sum(j.kirmaganQQSsiz)} QQS siz). `
    + `Hujjatlashtirilgan: ${j.hujjatSoni} ta, ${sum(j.hujjatQQSbilan)} so‘m QQS bilan. Narxsiz (summa noma‘lum): ${j.narxsizSoni} ta.`;
}

export function loyihaFarqMatni(m: LoyihaFarqMalumot | null | undefined, arg: string | null, limit = 12): string {
  if (!m) return 'Loyiha–smeta–fakt ma‘lumoti hali yuklanmadi yoki bu obyektda tasdiqlangan loyiha miqdori yo‘q (sahifa: /admin/loyiha-smeta).';
  const tayyor = `Tasdiqlangan miqdorlar: ${m.tasdiqlanganSoni}; tasdiqlanmagan takliflar (pulga kirmaydi): ${m.taklifSoni}.`;
  if (m.tasdiqlanganSoni === 0) return `${tayyor} Solishtirish uchun avval chizma miqdorlarini tasdiqlang.`;
  const belgi = arg && arg.trim() ? varaqKalit(arg.trim()) : null;
  const r = belgi ? m.farqlar.filter((f) => f.varaq && varaqKalit(f.varaq) === belgi) : m.farqlar;
  if (belgi && r.length === 0) return `${belgi}: farq topilmadi (yoki bu varaq tasdiqlanmagan). ${tayyor}`;
  const j = farqJami([...r]);
  const katta = [...r].sort((a, b) => Math.abs(b.pulQQSbilan ?? 0) - Math.abs(a.pulQQSbilan ?? 0)).slice(0, limit);
  const qatorlar = katta.map((f) => `- ${f.varaq ?? ''} ${f.nom} (${NOM[f.tur]}): loyiha ${son(f.loyiha)}, smeta ${son(f.smeta)}, fakt ${son(f.fakt)} ${f.birlik}; farq ${son(f.farq)}; ${sum(f.pulQQSbilan)} so‘m QQS bilan${f.qaror && !f.qarorEskirgan ? `; qaror: ${f.qaror}` : f.qarorEskirgan ? '; qaror eskirgan (revizya)' : ''}`);
  return [belgi ? `${belgi} bo‘yicha ${r.length} ta farq.` : `Jami ${r.length} ta farq.`, jamiSatri(j), tayyor, ...qatorlar, r.length > limit ? `… yana ${r.length - limit} ta (/admin/loyiha-smeta).` : ''].filter(Boolean).join('\n');
}
