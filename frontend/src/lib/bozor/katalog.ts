/**
 * Bozor ma'lumotnomalari (P1): e'lon turlari, kategoriyalar, birliklar, hududlar. Kategoriya kaliti — a-z0-9_ (bazadagi check bilan mos).
 * Kategoriyalar smeta resurs guruhlariga mos (material/ish/texnika); aniq pozitsiya kodi (pozitsiya_kodi) ixtiyoriy va e'londa alohida.
 */
import { lotinKirill, qidiruvTayyorla, UZ_RU_LUGAT } from '../qidiruv-normalizatsiya';

export type ElonTur = 'tovar' | 'xizmat' | 'ijara';
export const ELON_TURLARI: ReadonlyArray<{ kalit: ElonTur; nom: string }> = [
  { kalit: 'tovar', nom: 'Tovar' }, { kalit: 'xizmat', nom: 'Ish va xizmat' }, { kalit: 'ijara', nom: 'Texnika ijarasi' },
];

export const KATEGORIYALAR: ReadonlyArray<{ kalit: string; nom: string; tur: ElonTur }> = [
  { kalit: 'sement', nom: 'Sement va quruq aralashmalar', tur: 'tovar' },
  { kalit: 'beton', nom: 'Beton va temirbeton', tur: 'tovar' },
  { kalit: 'armatura', nom: 'Armatura va metall', tur: 'tovar' },
  { kalit: 'gisht', nom: 'G‘isht va bloklar', tur: 'tovar' },
  { kalit: 'qum_shagal', nom: 'Qum, shag‘al, tosh', tur: 'tovar' },
  { kalit: 'yogoch', nom: 'Yog‘och va fanera', tur: 'tovar' },
  { kalit: 'tom_izolyatsiya', nom: 'Tom va izolyatsiya', tur: 'tovar' },
  { kalit: 'boyoq_pardoz', nom: 'Bo‘yoq va pardoz', tur: 'tovar' },
  { kalit: 'quvur_santexnika', nom: 'Quvur va santexnika', tur: 'tovar' },
  { kalit: 'elektr', nom: 'Elektr va kabel', tur: 'tovar' },
  { kalit: 'eshik_deraza', nom: 'Eshik va deraza', tur: 'tovar' },
  { kalit: 'asbob', nom: 'Asbob-uskuna', tur: 'tovar' },
  { kalit: 'tovar_boshqa', nom: 'Boshqa tovar', tur: 'tovar' },
  { kalit: 'qurilish_ishi', nom: 'Qurilish-montaj ishlari', tur: 'xizmat' },
  { kalit: 'pardoz_ishi', nom: 'Pardozlash ishlari', tur: 'xizmat' },
  { kalit: 'santexnika_elektr_ishi', nom: 'Santexnika va elektr ishlari', tur: 'xizmat' },
  { kalit: 'loyiha_xizmat', nom: 'Loyiha va nazorat', tur: 'xizmat' },
  { kalit: 'xizmat_boshqa', nom: 'Boshqa xizmat', tur: 'xizmat' },
  { kalit: 'ekskavator', nom: 'Ekskavator va buldozer', tur: 'ijara' },
  { kalit: 'kran_lift', nom: 'Kran va ko‘targich', tur: 'ijara' },
  { kalit: 'beton_texnika', nom: 'Mikser va nasos', tur: 'ijara' },
  { kalit: 'asbob_ijara', nom: 'Asbob va iskala ijarasi', tur: 'ijara' },
  { kalit: 'ijara_boshqa', nom: 'Boshqa texnika', tur: 'ijara' },
];
export const kategoriyaNomi = (k: string | null | undefined) => KATEGORIYALAR.find((x) => x.kalit === k)?.nom ?? null;

export const BIRLIKLAR = ['dona', 'kg', 'tonna', 'm', 'm2', 'm3', 'litr', 'qop', 'komplekt', 'soat', 'smena', 'kun', 'reys'] as const;
export const HUDUDLAR = ['Toshkent sh.', 'Toshkent v.', 'Andijon', 'Buxoro', 'Farg‘ona', 'Jizzax', 'Namangan', 'Navoiy', 'Qashqadaryo', 'Qoraqalpog‘iston', 'Samarqand', 'Sirdaryo', 'Surxondaryo', 'Xorazm'] as const;

/**
 * Qidiruv so'zi -> server uchun variantlar (lotin/kirill farqsiz + o'zbekcha -> ruscha ildizlar). Server kirillni lotinga keltirib solishtiradi.
 * Bitta so'z: so'zning o'zi + kirill shakli + lug'at ildizlari; ko'p so'z: butun ibora + kirill shakli.
 */
export function qidiruvVariantlari(q: string): string[] {
  const s = q.trim().replace(/\s+/g, ' ');
  if (!s) return [];
  const v = new Set<string>([s]);
  v.add(lotinKirill(s));
  const n = s.toLowerCase().replace(/[ʻʼ’‘`´']/g, '');
  if (!s.includes(' ')) for (const [uz, ru] of Object.entries(UZ_RU_LUGAT)) if (n.startsWith(uz) || (uz.startsWith(n) && n.length >= 3)) for (const r of ru) v.add(r);
  return [...v].slice(0, 8);
}

/** Mijoz tomonida (masalan mavjud ro'yxatni filtrlash) — mavjud qidiruv predikati qayta ishlatiladi. */
export const elonQidiruvi = qidiruvTayyorla;
