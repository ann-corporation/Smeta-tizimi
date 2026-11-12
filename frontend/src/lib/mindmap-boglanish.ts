/**
 * Karta (mindmap) da chiziq tortish = HAQIQIY aloqa yaratish. Bu yerda faqat QOIDA (sof, React yo‘q): qaysi ikki tugun orasida
 * qaysi MAVJUD buyruq ishlaydi, nima bo‘lishi oddiy o‘zbekcha aytiladi (tasdiq kartasi uchun), mumkin bo‘lmasa — sabab bilan.
 * Yangi back-end mantiq yo‘q: har amal mavjud yozuvchiga boradi (mindmap_bog / mindmap_masul / t2_tomon_*).
 *
 *   holat 'ishlaydi' — yozuvchi bor; 'rad' — qoida bo‘yicha mumkin emas; 'yoq' — back-end bu versiyada ulanmagan (soxtalashtirilmaydi).
 */
import { bogTuriniTop, type BogTur, type TugunTur } from '../api/t2-mindmap';

/** Karta turlari: graf turlari + «tomon» (boshqa kompaniya, aloqa roli bilan). */
export type KartaTur = TugunTur | 'tomon';

export type TugunTavsif = { id: string; tur: KartaTur; nom: string; meta?: Record<string, unknown> | null };
export type BoglanishKontekst = { tahrir: boolean; yopiqSabab: string | null; masulMumkin: boolean };
export type BogAmal = 'mindmap_bog' | 'qatnashchi' | 'tomon_taklif' | 'tomon_grant' | 'masul';

export type Qoida =
  | { holat: 'ishlaydi'; amal: BogAmal; manba: TugunTavsif; maqsad: TugunTavsif; bogTur: BogTur | null; tavsif: string; sarlavha: string }
  | { holat: 'rad' | 'yoq'; sabab: string };

/** Tomon rollari: odam tilida nom → server kaliti (`t2_tomon_taklif_v1` rollari). */
export const TOMON_ROLLARI: { kalit: string; nom: string }[] = [
  { kalit: 'zakazchik', nom: 'Buyurtmachi' },
  { kalit: 'texnadzor', nom: 'Texnik nazorat' },
  { kalit: 'loyihachi', nom: 'Loyihachi' },
  { kalit: 'laboratoriya', nom: 'Laboratoriya' },
  { kalit: 'taminotchi', nom: 'Yetkazuvchi' },
  { kalit: 'subpudratchi', nom: 'Subpudratchi' },
];

export const TUR_ODAMCHA: Record<KartaTur, string> = {
  kompaniya: 'kompaniya', loyiha: 'loyiha', obyekt: 'obyekt', shartnoma: 'shartnoma', sklad: 'sklad', texnika: 'texnika', kadr: 'xodim',
  kontragent: 'kontragent', zayavka: 'ta’minot zayavkasi', foydalanuvchi: 'a’zo (odam)', tomon: 'tomon (boshqa kompaniya)',
};

const DOIRA: KartaTur[] = ['obyekt', 'loyiha', 'shartnoma'];
const bor = (a: KartaTur, b: KartaTur, x: KartaTur, y: KartaTur) => (a === x && b === y) || (a === y && b === x);
const tomonAloqaFaol = (t: TugunTavsif) => t.meta?.holat === 'faol';

function rad(sabab: string): Qoida { return { holat: 'rad', sabab }; }

/** Ikki tugun orasida chiziq tortsa nima bo‘ladi. Yo‘nalish farqi yo‘q (odam teskari tortsa ham togri tushuniladi). */
export function boglanishQoidasi(a: TugunTavsif, b: TugunTavsif, k: BoglanishKontekst): Qoida {
  if (!k.tahrir) return rad(k.yopiqSabab || 'Faqat ko‘rish rejimi: bog‘lash uchun tahrir ruxsati kerak.');
  if (a.id === b.id) return rad('Tugunni o‘zi bilan bog‘lab bo‘lmaydi.');
  const nomi = (x: TugunTavsif) => '«' + x.nom + '»';

  // 1) Mavjud tuzilma bog‘lanishlari (loyiha/shartnoma/obyekt/sklad/texnika/xodim/qatnashchi) — yo‘nalish farqsiz.
  const togri = bogTuriniTop(a.tur as TugunTur, b.tur as TugunTur);
  const teskari = togri ? null : bogTuriniTop(b.tur as TugunTur, a.tur as TugunTur);
  const qoida = togri ?? teskari;
  if (qoida && a.tur !== 'tomon' && b.tur !== 'tomon') {
    const [m, q] = togri ? [a, b] : [b, a];
    if (qoida.tur === 'qatnashchi') {
      return { holat: 'ishlaydi', amal: 'qatnashchi', manba: m, maqsad: q, bogTur: qoida.tur, sarlavha: 'Loyiha qatnashchisi',
        tavsif: nomi(m) + ' ' + nomi(q) + ' loyihasining qatnashchisi bo‘ladi. Keyingi qadamda uning rolini tanlaysiz.' };
    }
    const matn: Record<string, string> = {
      obyekt_loyiha: nomi(m) + ' loyihasiga ' + nomi(q) + ' obyekti kiritiladi.',
      shartnoma_loyiha: nomi(m) + ' loyihasiga ' + nomi(q) + ' shartnomasi biriktiriladi.',
      shartnoma_obyekt: nomi(m) + ' shartnomasi ' + nomi(q) + ' obyektiga biriktiriladi (obyekt shu shartnoma ostida ko‘rinadi).',
      sklad_obyekt: nomi(m) + ' skladi ' + nomi(q) + ' obyektini ta’minlaydigan bo‘ladi.',
      texnika_obyekt: nomi(m) + ' texnikasi ' + nomi(q) + ' obyektiga biriktiriladi.',
      kadr_obyekt: nomi(m) + ' xodimi ' + nomi(q) + ' obyektiga biriktiriladi.',
    };
    return { holat: 'ishlaydi', amal: 'mindmap_bog', manba: m, maqsad: q, bogTur: qoida.tur, sarlavha: qoida.nom, tavsif: matn[qoida.tur] ?? qoida.nom };
  }

  // 2) Kompaniya ↔ loyiha: tuzilmaviy — avtomatik.
  if (bor(a.tur, b.tur, 'kompaniya', 'loyiha')) return rad('Loyiha kompaniyaga avtomatik tegishli — chiziq kerak emas. Yangi loyiha kerak bo‘lsa, «+ Loyiha» ni bosing.');

  // 3) Kompaniya ↔ tomon yoki kontragent: tomon aloqasi (taklif) — rol tanlanadi.
  if (bor(a.tur, b.tur, 'kompaniya', 'kontragent')) {
    const [kom, kon] = a.tur === 'kompaniya' ? [a, b] : [b, a];
    const inn = typeof kon.meta?.inn === 'string' ? kon.meta.inn.replace(/\D/g, '') : '';
    if (inn.length < 9) return rad(nomi(kon) + ' kontragentida STIR (9 raqam) yo‘q — tomon aloqasini STIR bo‘yicha taklif qilinadi. Avval kontragent kartasiga STIR kiriting.');
    return { holat: 'ishlaydi', amal: 'tomon_taklif', manba: kom, maqsad: kon, bogTur: null, sarlavha: 'Tomon sifatida taklif qilish',
      tavsif: nomi(kon) + ' kompaniyasiga TOMON bo‘lish taklifi yuboriladi (STIR: ' + inn + '). U qabul qilgach siz unga qaysi obyektni ko‘rsatishni tanlaysiz. Keyingi qadamda uning rolini tanlaysiz.' };
  }
  if (bor(a.tur, b.tur, 'tomon', 'kompaniya')) return rad('Bu tomon bilan aloqa allaqachon bor. Yangi tomon kerak bo‘lsa, kontragentni kompaniya bilan bog‘lang.');

  // 4) Tomon ↔ obyekt / loyiha / shartnoma: ko‘rish huquqi (grant).
  if ((a.tur === 'tomon' && DOIRA.includes(b.tur)) || (b.tur === 'tomon' && DOIRA.includes(a.tur))) {
    const [t, d] = a.tur === 'tomon' ? [a, b] : [b, a];
    if (!tomonAloqaFaol(t)) return rad(nomi(t) + ' bilan aloqa hali faol emas (taklif qabul qilinishi kerak) — ko‘rish huquqi berib bo‘lmaydi.');
    const doira = d.tur === 'obyekt' ? 'obyektni' : d.tur === 'loyiha' ? 'loyihani' : 'shartnomani';
    return { holat: 'ishlaydi', amal: 'tomon_grant', manba: t, maqsad: d, bogTur: null, sarlavha: 'Tomonga ko‘rish huquqi berish',
      tavsif: nomi(t) + ' ' + nomi(d) + ' ' + doira + ' ko‘ra oladigan bo‘ladi. Keyingi qadamda nimani ko‘rishini (hujjat turlarini) tanlaysiz. Chiziqni o‘chirsangiz — huquq bekor qilinadi.' };
  }

  // 5) Odam ↔ obyekt / loyiha: mas’ul biriktirish.
  if (bor(a.tur, b.tur, 'foydalanuvchi', 'obyekt') || bor(a.tur, b.tur, 'foydalanuvchi', 'loyiha')) {
    if (!k.masulMumkin) return rad('Mas’ul biriktirish uchun «A’zolarni boshqarish» ruxsati kerak.');
    const [o, d] = a.tur === 'foydalanuvchi' ? [a, b] : [b, a];
    return { holat: 'ishlaydi', amal: 'masul', manba: o, maqsad: d, bogTur: null, sarlavha: 'Mas’ul biriktirish',
      tavsif: nomi(o) + ' ' + nomi(d) + ' ' + (d.tur === 'obyekt' ? 'obyekti' : 'loyihasi') + 'ga mas’ul qilinadi (yozish huquqi bilan). Olib tashlash — chiziqni o‘chirish.' };
  }

  // 6) Pudratchi → subpudratchi topshirish va yetkazuvchi buyurtmalari: back-end bu versiyada ulanmagan.
  if (a.tur === 'tomon' && b.tur === 'tomon') return { holat: 'yoq', sabab: 'Ikki tomonni o‘zaro bog‘lash (pudratchi → subpudratchi topshirish) — «topshirish» buyrug‘i (t2_sub_topshir_v1) bu versiyada kartaga ulanmagan. Topshirishni obyekt bo‘limidan qiling.' };

  return rad('Bu ikkisini bog‘lab bo‘lmaydi: ' + TUR_ODAMCHA[a.tur] + ' bilan ' + TUR_ODAMCHA[b.tur] + ' orasida bog‘lanish qoidasi yo‘q.');
}

export type UzishAmal = 'mindmap_bog_ochir' | 'tomon_grant_bekor' | 'tomon_aloqa_toxtat' | 'masul_ol';
export type UzishQoidasi = { holat: 'ishlaydi'; amal: UzishAmal; tavsif: string } | { holat: 'rad'; sabab: string };

/** Chiziqni o‘chirish = aloqani TUGATISH (yozuvlarning o‘zi o‘chmaydi). Server qoidalari va ruxsatlari o‘z kuchida. */
export function uzishQoidasi(b: { tur: BogTur | 'tomon_aloqa' | 'tomon_grant'; uzsa_boladi: boolean }, k: BoglanishKontekst): UzishQoidasi {
  if (!k.tahrir) return { holat: 'rad', sabab: k.yopiqSabab || 'Faqat ko‘rish rejimi.' };
  if (b.tur === 'tomon_grant') return { holat: 'ishlaydi', amal: 'tomon_grant_bekor', tavsif: 'Tomonning shu obyekt/loyihani ko‘rish huquqi bekor qilinadi. Hujjatlarning o‘zi o‘chmaydi.' };
  if (b.tur === 'tomon_aloqa') return { holat: 'ishlaydi', amal: 'tomon_aloqa_toxtat', tavsif: 'Tomon bilan aloqa to‘xtatiladi: u endi hech narsani ko‘ra olmaydi. Keyin davom ettirish mumkin.' };
  if (b.tur === 'masul_obyekt' || b.tur === 'masul_loyiha') {
    return k.masulMumkin ? { holat: 'ishlaydi', amal: 'masul_ol', tavsif: 'Mas’ul olib tashlanadi. Odamning o‘zi kompaniyada qoladi.' }
      : { holat: 'rad', sabab: 'Mas’ulni olib tashlash uchun «A’zolarni boshqarish» ruxsati kerak.' };
  }
  if (!b.uzsa_boladi) return { holat: 'rad', sabab: 'Bu tuzilmaviy bog‘lanish — uzib bo‘lmaydi.' };
  return { holat: 'ishlaydi', amal: 'mindmap_bog_ochir', tavsif: 'Bog‘lanish uziladi. Yozuvlarning o‘zi O‘CHMAYDI.' };
}
