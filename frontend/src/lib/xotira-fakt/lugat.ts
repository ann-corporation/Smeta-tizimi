/**
 * «Xotiradan fakt» — matn normallashtirish (egasi 2026-10-24): lotin/kirill transliteratsiya + o'zbekcha → ruscha qurilish
 * so'zlari lug'ati. DETERMINISTIK (pullik AI yo'q). Smeta ruscha-kirillda; operator esa ko'pincha lotinda va o'zbekcha yozadi
 * («kanal tubiga beton 120 m3», «geomembrana 3500 m2»).
 */
import { qidiruvNormal, qidiruvTranslit } from '../f2-moslash-v3/qidiruv';

/** O'zbekcha (lotin, apostrofsiz) so'z → ruscha smeta so'zlari. Qo'shimchali shakllar (tubiga, betonni) o'zak bo'yicha topiladi. */
const LUGAT: Readonly<Record<string, string>> = {
  beton: 'БЕТОН', armatura: 'АРМАТУРА', sement: 'ЦЕМЕНТ', sementli: 'ЦЕМЕНТНЫЙ', qum: 'ПЕСОК', shagal: 'ЩЕБЕНЬ', shcheben: 'ЩЕБЕНЬ', sheben: 'ЩЕБЕНЬ', shebyon: 'ЩЕБЕНЬ',
  grunt: 'ГРУНТ', tuproq: 'ГРУНТ', qazish: 'РАЗРАБОТКА', qazilgan: 'РАЗРАБОТКА', kovlash: 'РАЗРАБОТКА', yotqizish: 'УКЛАДКА', yotqizildi: 'УКЛАДКА',
  quyish: 'УСТРОЙСТВО', quyildi: 'УСТРОЙСТВО', ornatish: 'УСТАНОВКА', ornatildi: 'УСТАНОВКА', montaj: 'МОНТАЖ', demontaj: 'ДЕМОНТАЖ', yigish: 'МОНТАЖ',
  devor: 'СТЕНА', devorlar: 'СТЕНЫ', poydevor: 'ФУНДАМЕНТ', fundament: 'ФУНДАМЕНТ', pol: 'ПОЛ', tom: 'КРОВЛЯ', shift: 'ПОТОЛОК', eshik: 'ДВЕРЬ', deraza: 'ОКНО',
  kanal: 'КАНАЛ', tub: 'ДНО', tubi: 'ДНО', tubiga: 'ДНО', quvur: 'ТРУБА', quvurlar: 'ТРУБЫ', truba: 'ТРУБА', kabel: 'КАБЕЛЬ', sim: 'ПРОВОД', chiroq: 'СВЕТИЛЬНИК',
  svetilnik: 'СВЕТИЛЬНИК', nasos: 'НАСОС', filtr: 'ФИЛЬТР', geomembrana: 'ГЕОМЕМБРАНА', membrana: 'МЕМБРАНА', plita: 'ПЛИТА', plitka: 'ПЛИТКА', granit: 'ГРАНИТ',
  gisht: 'КИРПИЧ', ohak: 'ИЗВЕСТЬ', suvoq: 'ШТУКАТУРКА', boyash: 'ОКРАСКА', buyash: 'ОКРАСКА', boyoq: 'КРАСКА', shpatlyovka: 'ШПАТЛЕВКА', shpaklyovka: 'ШПАТЛЕВКА',
  panjara: 'ОГРАЖДЕНИЕ', tosiq: 'ОГРАЖДЕНИЕ', ograda: 'ОГРАЖДЕНИЕ', zinapoya: 'ЛЕСТНИЦА', metall: 'МЕТАЛЛ', polat: 'СТАЛЬ', burchak: 'УГОЛОК', shveller: 'ШВЕЛЛЕР',
  qolip: 'ОПАЛУБКА', qoliplash: 'ОПАЛУБКА', opalubka: 'ОПАЛУБКА', tekislash: 'ПЛАНИРОВКА', planirovka: 'ПЛАНИРОВКА', zichlash: 'УПЛОТНЕНИЕ', asfalt: 'АСФАЛЬТ',
  yol: 'ДОРОГА', bordyur: 'БОРДЮР', daraxt: 'ДЕРЕВО', maysa: 'ГАЗОН', koklamzor: 'ОЗЕЛЕНЕНИЕ', suv: 'ВОДА', kanalizatsiya: 'КАНАЛИЗАЦИЯ', drenaj: 'ДРЕНАЖ',
  quduq: 'КОЛОДЕЦ', lyuk: 'ЛЮК', isitish: 'ОТОПЛЕНИЕ', shamollatish: 'ВЕНТИЛЯЦИЯ', konditsioner: 'КОНДИЦИОНЕР', gidroizolyatsiya: 'ГИДРОИЗОЛЯЦИЯ',
  izolyatsiya: 'ИЗОЛЯЦИЯ', issiqlik: 'ТЕПЛОИЗОЛЯЦИЯ', penoplast: 'ПЕНОПЛАСТ', polietilen: 'ПОЛИЭТИЛЕН', bitum: 'БИТУМ', rulon: 'РУЛОННЫЙ', bruschatka: 'БРУСЧАТКА',
  ustun: 'КОЛОННА', balka: 'БАЛКА', plastina: 'ПЛИТА', yopma: 'ПЕРЕКРЫТИЕ', tayanch: 'ОПОРА', fontan: 'ФОНТАН', kolonna: 'КОЛОННА', ograjdeniya: 'ОГРАЖДЕНИЕ',
  transformator: 'ТРАНСФОРМАТОР', kompressor: 'КОМПРЕССОР', forsunka: 'ФОРСУНКА', skimmer: 'СКИММЕР', ozero: 'ОЗЕРО', kol: 'ОЗЕРО', kanalning: 'КАНАЛ',
};
/** Suffikslar (qo'shimcha) — lug'at kalitini topish uchun ketma-ket kesiladi. */
const QOSHIMCHA = ['lardan', 'larga', 'larni', 'ning', 'dan', 'ga', 'ni', 'da', 'ka', 'qa', 'lar', 'i', 'a'];

/** Ruscha qo'shimcha so'zlar va o'zbekcha ko'makchilar — moslashda e'tiborga olinmaydi. */
export const TO_XTATISH_SOZLARI: ReadonlySet<string> = new Set(['НА', 'В', 'ВО', 'ДЛЯ', 'ПОД', 'И', 'С', 'ПО', 'ИЗ', 'ПРИ', 'ДО', 'ОТ', 'ЗА', 'К', 'ILA', 'VA', 'BILAN', 'UCHUN', 'BOYICHA', 'HAMDA']);

const apostrofsiz = (s: string) => s.replace(/[ʻʼ`´’‘']/g, '');

/** Bitta so'zni smeta kirillgiga o'tkazadi: lug'at → (qo'shimchani kesib lug'at) → transliteratsiya. */
export function sozniOgir(soz: string): string {
  const t = apostrofsiz(soz).toLowerCase();
  if (!t) return '';
  if (/[а-яё]/.test(t)) return t.toUpperCase().replace(/Ё/g, 'Е');
  if (!/[a-z]/.test(t)) return t.toUpperCase();               // raqam/belgi
  if (/\d/.test(t)) return qidiruvNormal(t);                  // marka (b25, a500): ko'rinishi bir xil harflar (B25 → В25)
  if (LUGAT[t]) return LUGAT[t];
  for (const q of QOSHIMCHA) if (t.length > q.length + 2 && t.endsWith(q) && LUGAT[t.slice(0, -q.length)]) return LUGAT[t.slice(0, -q.length)];
  return qidiruvTranslit(t.toUpperCase());
}

/** Matn → ruscha kirill so'zlar ro'yxati (to'xtatish so'zlarisiz). «kanal tubiga beton» → [КАНАЛ, ДНО, БЕТОН]. */
export function xotiraSozlari(matn: string): string[] {
  return matn.split(/[^0-9A-Za-zА-Яа-яЁёʻʼ`´’‘']+/)
    .map(sozniOgir).flatMap((s) => s.split(/\s+/)).filter((s) => s && !TO_XTATISH_SOZLARI.has(s));
}
