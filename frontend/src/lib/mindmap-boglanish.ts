/**
 * Karta (mindmap) da chiziq tortish = HAQIQIY aloqa yaratish. Bu yerda faqat QOIDA (sof, React yo‘q): qaysi ikki tugun orasida
 * qaysi MAVJUD buyruq ishlaydi, nima bo‘lishini oddiy o‘zbekcha aytadi (tasdiq kartasi uchun; ru/en tarjimali) va mumkin
 * bo‘lmasa — sabab bilan. Yangi back-end mantiq yo‘q: har amal mavjud yozuvchiga boradi (mindmap_bog / mindmap_masul / t2_tomon_* /
 * t2_sub_topshir_v1 sahifasi).
 *
 *   holat 'ishlaydi' — yozuvchi bor; 'rad' — qoida bo‘yicha mumkin emas; 'yoq' — back-end ulanmagan bo‘lsa (hozir hech qaysi juftlik).
 */
import { bogTuriniTop, type BogTur, type TugunTur } from '../api/t2-mindmap';
import { t } from '../i18n/til';

/** Karta turlari: graf turlari + «tomon» (boshqa kompaniya, aloqa roli bilan). */
export type KartaTur = TugunTur | 'tomon';

export type TugunTavsif = { id: string; tur: KartaTur; nom: string; meta?: Record<string, unknown> | null };
export type BoglanishKontekst = { tahrir: boolean; yopiqSabab: string | null; masulMumkin: boolean };
export type BogAmal = 'mindmap_bog' | 'qatnashchi' | 'tomon_taklif' | 'tomon_grant' | 'masul' | 'sub_topshir';

export type Qoida =
  | { holat: 'ishlaydi'; amal: BogAmal; manba: TugunTavsif; maqsad: TugunTavsif; bogTur: BogTur | null; tavsif: string; sarlavha: string;
      /** sub_topshir: mavjud topshirish sahifasi (oldindan to‘ldirilgan) — karta uni ochadi, qayta yozmaydi. */ yol?: string;
      /** tomon_taklif: kontragentda STIR yo‘q — tasdiq kartasi STIR so‘raydi. */ innKerak?: boolean }
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

export const TUR_ODAMCHA = (tur: KartaTur): string => ({
  kompaniya: t('kompaniya'), loyiha: t('loyiha'), obyekt: t('obyekt'), shartnoma: t('shartnoma'), sklad: t('sklad'), texnika: t('texnika'), kadr: t('xodim'),
  kontragent: t('kontragent'), zayavka: t('ta’minot zayavkasi'), foydalanuvchi: t('a’zo (odam)'), tomon: t('tomon (boshqa kompaniya)'),
} as Record<KartaTur, string>)[tur];

const DOIRA: KartaTur[] = ['obyekt', 'loyiha', 'shartnoma'];
const bor = (a: KartaTur, b: KartaTur, x: KartaTur, y: KartaTur) => (a === x && b === y) || (a === y && b === x);
const tomonAloqaFaol = (x: TugunTavsif) => x.meta?.holat === 'faol';
const rad = (sabab: string): Qoida => ({ holat: 'rad', sabab });

/** Ikki tugun orasida chiziq tortsa nima bo‘ladi. Yo‘nalish farqi yo‘q (odam teskari tortsa ham to‘g‘ri tushuniladi). */
export function boglanishQoidasi(a: TugunTavsif, b: TugunTavsif, k: BoglanishKontekst): Qoida {
  if (!k.tahrir) return rad(k.yopiqSabab || t('Faqat ko‘rish rejimi: bog‘lash uchun tahrir ruxsati kerak.'));
  if (a.id === b.id) return rad(t('Tugunni o‘zi bilan bog‘lab bo‘lmaydi.'));
  const nomi = (x: TugunTavsif) => '«' + x.nom + '»';

  // 1) Mavjud tuzilma bog‘lanishlari (loyiha/shartnoma/obyekt/sklad/texnika/xodim/qatnashchi) — yo‘nalish farqsiz.
  const togri = bogTuriniTop(a.tur as TugunTur, b.tur as TugunTur);
  const teskari = togri ? null : bogTuriniTop(b.tur as TugunTur, a.tur as TugunTur);
  const qoida = togri ?? teskari;
  if (qoida && a.tur !== 'tomon' && b.tur !== 'tomon') {
    const [m, q] = togri ? [a, b] : [b, a];
    const p = { m: nomi(m), q: nomi(q) };
    if (qoida.tur === 'qatnashchi') {
      return { holat: 'ishlaydi', amal: 'qatnashchi', manba: m, maqsad: q, bogTur: qoida.tur, sarlavha: t('Loyiha qatnashchisi'),
        tavsif: t('{m} {q} loyihasining qatnashchisi bo‘ladi. Keyingi qadamda uning rolini tanlaysiz.', p) };
    }
    const matn: Record<string, string> = {
      obyekt_loyiha: t('{m} loyihasiga {q} obyekti kiritiladi.', p),
      shartnoma_loyiha: t('{m} loyihasiga {q} shartnomasi biriktiriladi.', p),
      shartnoma_obyekt: t('{m} shartnomasi {q} obyektiga biriktiriladi (obyekt shu shartnoma ostida ko‘rinadi).', p),
      sklad_obyekt: t('{m} skladi {q} obyektini ta’minlaydigan bo‘ladi.', p),
      texnika_obyekt: t('{m} texnikasi {q} obyektiga biriktiriladi.', p),
      kadr_obyekt: t('{m} xodimi {q} obyektiga biriktiriladi.', p),
    };
    const sarlavha: Record<string, string> = {
      obyekt_loyiha: t('Obyektni loyihaga biriktirish'), shartnoma_loyiha: t('Shartnomani loyihaga biriktirish'), shartnoma_obyekt: t('Shartnomani obyektga biriktirish'),
      sklad_obyekt: t('Skladni obyektga xizmat qildirish'), texnika_obyekt: t('Texnikani obyektga biriktirish'), kadr_obyekt: t('Xodimni obyektga biriktirish'),
    };
    return { holat: 'ishlaydi', amal: 'mindmap_bog', manba: m, maqsad: q, bogTur: qoida.tur, sarlavha: sarlavha[qoida.tur] ?? qoida.nom, tavsif: matn[qoida.tur] ?? qoida.nom };
  }

  // 2) Kompaniya ↔ loyiha: tuzilmaviy — avtomatik.
  if (bor(a.tur, b.tur, 'kompaniya', 'loyiha')) return rad(t('Loyiha kompaniyaga avtomatik tegishli — chiziq kerak emas. Yangi loyiha kerak bo‘lsa, «+ Loyiha» ni bosing.'));

  // 3) Kompaniya ↔ kontragent: tomon aloqasi (taklif) — rol tanlanadi; STIR yo‘q bo‘lsa — STIR so‘raladi.
  if (bor(a.tur, b.tur, 'kompaniya', 'kontragent')) {
    const [kom, kon] = a.tur === 'kompaniya' ? [a, b] : [b, a];
    const inn = typeof kon.meta?.inn === 'string' ? kon.meta.inn.replace(/\D/g, '') : '';
    return { holat: 'ishlaydi', amal: 'tomon_taklif', manba: kom, maqsad: kon, bogTur: null, sarlavha: t('Tomon sifatida taklif qilish'), innKerak: inn.length < 9,
      tavsif: inn.length < 9
        ? t('{k} kontragentida STIR yo‘q. Tomon taklifi STIR bo‘yicha yuboriladi — keyingi qadamda uning STIRini (9 raqam) va rolini kiriting.', { k: nomi(kon) })
        : t('{k} kompaniyasiga TOMON bo‘lish taklifi yuboriladi (STIR: {inn}). U qabul qilgach siz unga qaysi obyektni ko‘rsatishni tanlaysiz. Keyingi qadamda uning rolini tanlaysiz.', { k: nomi(kon), inn }) };
  }
  if (bor(a.tur, b.tur, 'tomon', 'kompaniya')) return rad(t('Bu tomon bilan aloqa allaqachon bor. Yangi tomon kerak bo‘lsa, kontragentni kompaniya bilan bog‘lang.'));

  // 3b) Subpudratchi tomon ↔ obyekt / shartnoma: ISH TOPSHIRISH (mavjud t2_sub_topshir_v1 sahifasi, oldindan to‘ldirilgan).
  if ((a.tur === 'tomon' && b.tur !== 'tomon') || (b.tur === 'tomon' && a.tur !== 'tomon')) {
    const [tm, d] = a.tur === 'tomon' ? [a, b] : [b, a];
    if (tm.meta?.rol === 'subpudratchi' && (d.tur === 'obyekt' || d.tur === 'shartnoma' || d.tur === 'loyiha')) {
      if (!tomonAloqaFaol(tm)) return rad(t('{t} bilan aloqa hali faol emas — avval taklif qabul qilinishi kerak.', { t: nomi(tm) }));
      if (d.tur === 'loyiha') return rad(t('Ish topshirish obyekt darajasida: subpudratchini loyiha emas, aynan obyekt (yoki shartnomaning obyekti) bilan bog‘lang.'));
      const idlar = d.tur === 'obyekt' ? [Number(d.id.split(':')[1])] : (Array.isArray(d.meta?.obyekt_idlar) ? (d.meta!.obyekt_idlar as unknown[]).map(Number) : []);
      if (idlar.length !== 1 || !Number.isSafeInteger(idlar[0])) return rad(t('{d} shartnomasida bitta obyekt aniq emas — subpudratchini aynan obyekt tugunidan bog‘lang.', { d: nomi(d) }));
      const aloqaId = Number(tm.id.split(':')[1]);
      return { holat: 'ishlaydi', amal: 'sub_topshir', manba: d, maqsad: tm, bogTur: null, sarlavha: t('Subpudratchiga ish topshirish'),
        yol: '/admin/subpudrat?obyekt=' + idlar[0] + '&aloqa=' + aloqaId,
        tavsif: t('{d} bo‘yicha ishlar {t} subpudratchisiga topshiriladi. Topshirish sahifasi ochiladi: obyekt va subpudratchi oldindan tanlangan, ishlarni va kelishilgan narxni o‘sha yerda belgilaysiz.', { d: nomi(d), t: nomi(tm) }) };
    }
  }

  // 4) Tomon ↔ obyekt / loyiha / shartnoma: ko‘rish huquqi (grant).
  if ((a.tur === 'tomon' && DOIRA.includes(b.tur)) || (b.tur === 'tomon' && DOIRA.includes(a.tur))) {
    const [tm, d] = a.tur === 'tomon' ? [a, b] : [b, a];
    if (!tomonAloqaFaol(tm)) return rad(t('{t} bilan aloqa hali faol emas (taklif qabul qilinishi kerak) — ko‘rish huquqi berib bo‘lmaydi.', { t: nomi(tm) }));
    const matn = d.tur === 'obyekt'
      ? t('{t} {d} obyektini ko‘ra oladigan bo‘ladi. Keyingi qadamda nimani ko‘rishini (hujjat turlarini) tanlaysiz. Chiziqni o‘chirsangiz — huquq bekor qilinadi.', { t: nomi(tm), d: nomi(d) })
      : d.tur === 'loyiha'
        ? t('{t} {d} loyihasini ko‘ra oladigan bo‘ladi. Keyingi qadamda nimani ko‘rishini (hujjat turlarini) tanlaysiz. Chiziqni o‘chirsangiz — huquq bekor qilinadi.', { t: nomi(tm), d: nomi(d) })
        : t('{t} {d} shartnomasini ko‘ra oladigan bo‘ladi. Keyingi qadamda nimani ko‘rishini (hujjat turlarini) tanlaysiz. Chiziqni o‘chirsangiz — huquq bekor qilinadi.', { t: nomi(tm), d: nomi(d) });
    return { holat: 'ishlaydi', amal: 'tomon_grant', manba: tm, maqsad: d, bogTur: null, sarlavha: t('Tomonga ko‘rish huquqi berish'), tavsif: matn };
  }

  // 5) Odam ↔ obyekt / loyiha: mas’ul biriktirish.
  if (bor(a.tur, b.tur, 'foydalanuvchi', 'obyekt') || bor(a.tur, b.tur, 'foydalanuvchi', 'loyiha')) {
    if (!k.masulMumkin) return rad(t('Mas’ul biriktirish uchun «A’zolarni boshqarish» ruxsati kerak.'));
    const [o, d] = a.tur === 'foydalanuvchi' ? [a, b] : [b, a];
    return { holat: 'ishlaydi', amal: 'masul', manba: o, maqsad: d, bogTur: null, sarlavha: t('Mas’ul biriktirish'),
      tavsif: d.tur === 'obyekt'
        ? t('{o} {d} obyektiga mas’ul qilinadi (yozish huquqi bilan). Olib tashlash — chiziqni o‘chirish.', { o: nomi(o), d: nomi(d) })
        : t('{o} {d} loyihasiga mas’ul qilinadi (yozish huquqi bilan). Olib tashlash — chiziqni o‘chirish.', { o: nomi(o), d: nomi(d) }) };
  }

  // 6) Tomon ↔ tomon.
  if (a.tur === 'tomon' && b.tur === 'tomon') return rad(t('Ikki tomonni bir-biriga bog‘lab bo‘lmaydi. Subpudratchiga ish topshirish uchun chiziqni OBYEKT (yoki shartnoma) tugunidan subpudratchi tomoniga torting.'));

  return rad(t('Bu ikkisini bog‘lab bo‘lmaydi: {a} bilan {b} orasida bog‘lanish qoidasi yo‘q.', { a: TUR_ODAMCHA(a.tur), b: TUR_ODAMCHA(b.tur) }));
}

export type UzishAmal = 'mindmap_bog_ochir' | 'tomon_grant_bekor' | 'tomon_aloqa_toxtat' | 'masul_ol';
export type UzishQoidasi = { holat: 'ishlaydi'; amal: UzishAmal; tavsif: string } | { holat: 'rad'; sabab: string };

/** Chiziqni o‘chirish = aloqani TUGATISH (yozuvlarning o‘zi o‘chmaydi). Server qoidalari va ruxsatlari o‘z kuchida. */
export function uzishQoidasi(b: { tur: BogTur | 'tomon_aloqa' | 'tomon_grant' | 'tomon_buyurtma'; uzsa_boladi: boolean }, k: BoglanishKontekst): UzishQoidasi {
  if (!k.tahrir) return { holat: 'rad', sabab: k.yopiqSabab || t('Faqat ko‘rish rejimi.') };
  if (b.tur === 'tomon_buyurtma') return { holat: 'rad', sabab: t('Bu chiziq ochiq buyurtmalarni ko‘rsatadi — uni uzib bo‘lmaydi.') };
  if (b.tur === 'tomon_grant') return { holat: 'ishlaydi', amal: 'tomon_grant_bekor', tavsif: t('Tomonning shu obyekt/loyihani ko‘rish huquqi bekor qilinadi. Hujjatlarning o‘zi o‘chmaydi.') };
  if (b.tur === 'tomon_aloqa') return { holat: 'ishlaydi', amal: 'tomon_aloqa_toxtat', tavsif: t('Tomon bilan aloqa to‘xtatiladi: u endi hech narsani ko‘ra olmaydi. Keyin davom ettirish mumkin.') };
  if (b.tur === 'masul_obyekt' || b.tur === 'masul_loyiha') {
    return k.masulMumkin ? { holat: 'ishlaydi', amal: 'masul_ol', tavsif: t('Mas’ul olib tashlanadi. Odamning o‘zi kompaniyada qoladi.') }
      : { holat: 'rad', sabab: t('Mas’ulni olib tashlash uchun «A’zolarni boshqarish» ruxsati kerak.') };
  }
  if (!b.uzsa_boladi) return { holat: 'rad', sabab: t('Bu tuzilmaviy bog‘lanish — uzib bo‘lmaydi.') };
  return { holat: 'ishlaydi', amal: 'mindmap_bog_ochir', tavsif: t('Bog‘lanish uziladi. Yozuvlarning o‘zi O‘CHMAYDI.') };
}
