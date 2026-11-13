/** Vosita slotlarini ajratish yordamchilari: summa, sana, tanlov, so'z mosligi. Sof funksiyalar (testlanadi). */
import { sozNorm } from '../matn';
import { yaxlit2 } from '../../hisob-yadro/yaxlit';

const bosh = (royxat: readonly string[]) => royxat.map(sozNorm);

/** Normallashgan so'zlardan birortasi ro'yxatdagi (prefiks) so'zlardan biriga mos. */
export function borMi(tokenlar: readonly string[], royxat: readonly string[]): boolean {
  const r = bosh(royxat);
  return tokenlar.some((t) => r.some((x) => t === x || (x.length >= 4 && t.startsWith(x))));
}

const BIRLIK: Array<[RegExp, number]> = [[/^(mlrd|milliard|млрд|миллиард)/u, 1e9], [/^(mln|million|млн|миллион)/u, 1e6], [/^(ming|минг|тыс|k$)/u, 1e3]];

/** «50 mln», «1,5 mlrd», «250 ming», «250 000», «5 млн» -> so'm. Sana, F2 belgisi va №-raqamlar hisobga olinmaydi. Kichik (<1000) birliksiz son — summa emas. */
export function summaOl(xom: string): number | null {
  const s = xom.toLowerCase()
    .replace(/\d{4}-\d{2}-\d{2}/g, ' ').replace(/\d{1,2}\.\d{1,2}\.\d{2,4}/g, ' ').replace(/[fф]-?2\b/g, ' ').replace(/[mм]-?29\b/g, ' ').replace(/№\s*\S+/g, ' ')
    .replace(/(\d)[\s ](?=\d{3}(?!\d))/g, '$1');
  const re = /(\d+(?:[.,]\d+)?)\s*([\p{L}]+)?/gu;
  for (let m = re.exec(s); m; m = re.exec(s)) {
    const son = Number(m[1].replace(',', '.'));
    if (!Number.isFinite(son)) continue;
    const u = m[2] ? BIRLIK.find(([r]) => r.test(m[2]!)) : undefined;
    const qiymat = u ? son * u[1] : son;
    if (u || qiymat >= 1000) return yaxlit2(qiymat);
  }
  return null;
}

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** «bugun», «kecha», 2026-10-05, 05.10.2026; yo'q bo'lsa — bugun. */
export function sanaOl(xom: string, bugun: Date = new Date()): string {
  const m = /(\d{4})-(\d{2})-(\d{2})/.exec(xom);
  if (m) return m[0];
  const d = /(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(xom);
  if (d) return `${d[3]}-${pad(Number(d[2]))}-${pad(Number(d[1]))}`;
  if (/(^|[^\p{L}])(kecha|вчера|кеча)([^\p{L}]|$)/iu.test(xom)) { const k = new Date(bugun); k.setDate(k.getDate() - 1); return iso(k); }
  return iso(bugun);
}

/** Variantlar ichidan tanlash: «2» (tartib raqami) yoki nom bo'laklari mosligi. Bitta aniq natija bo'lmasa null. */
export function tanlovTop<T extends { nom: string }>(xom: string, royxat: readonly T[]): T | null {
  const s = xom.trim();
  const n = /^\s*(\d{1,2})\s*[.)]?\s*$/.exec(s);
  if (n) return royxat[Number(n[1]) - 1] ?? null;
  const q = sozNorm(s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ''));
  if (q.length < 2) return null;
  const mos = royxat.filter((r) => sozNorm(r.nom.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')).includes(q));
  return mos.length === 1 ? mos[0] : null;
}

/** Matndagi so'zlar bilan nom mosligi (nomning har bir ≥3 harfli so'zi matnda tokenlar orasida bo'lsa yoki aksincha). */
export function nomMosmi(tokenlar: readonly string[], nom: string): boolean {
  const n = nom.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((x) => x.length >= 3 && !['mchj', 'ooo', 'ооо', 'xk', 'aj'].includes(x)).map(sozNorm);
  return n.length > 0 && n.some((w) => tokenlar.some((t) => t === w || (w.length >= 5 && t.length >= 5 && (t.startsWith(w.slice(0, 5)) || w.startsWith(t.slice(0, 5))))));
}

export const KAT_SOZLARI: Array<[string, string[]]> = [
  ['МАТ', ['material', 'materiallar', 'sement', 'beton', 'материал']], ['ЧЕЛ', ['ishchi', 'mehnat', 'oylik', 'maosh', 'зарплат', 'рабоч']],
  ['МАШ', ['mashina', 'texnika', 'mexanizm', 'техник', 'машин']], ['SUB', ['subpudrat', 'субподряд']], ['ОБ', ['uskuna', 'jihoz', 'оборудован']],
];
export function katOl(tokenlar: readonly string[]): string {
  for (const [kat, soz] of KAT_SOZLARI) if (borMi(tokenlar, soz)) return kat;
  return 'OTK';
}

export const pulMatn = (n: number) => `${n.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} so‘m`;
