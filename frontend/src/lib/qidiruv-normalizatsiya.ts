/**
 * Qidiruv uchun deterministik normalizatsiya (egasi 2026-10-24: lotin «beton» kirill «БЕТОН» ni topsin).
 * 1) lotin -> kirill transliteratsiya; 2) kichik o'zbek -> rus qurilish sinonimlari (ildiz bo'yicha).
 * AI yo'q, tasodif yo'q: bir xil kirish - bir xil natija.
 */
const IKKI: Array<[string, string]> = [['sh', 'ш'], ['ch', 'ч'], ['yo', 'ё'], ['yu', 'ю'], ['ya', 'я'], ['ts', 'ц'], ['ye', 'е'], ['ng', 'нг']];
const BIR: Record<string, string> = {
  a: 'а', b: 'б', c: 'ц', d: 'д', e: 'е', f: 'ф', g: 'г', h: 'х', i: 'и', j: 'ж', k: 'к', l: 'л', m: 'м', n: 'н', o: 'о', p: 'п',
  q: 'к', r: 'р', s: 'с', t: 'т', u: 'у', v: 'в', w: 'в', x: 'х', y: 'й', z: 'з',
};

const lotinMi = (s: string) => /[a-z]/i.test(s);

export function lotinKirill(s: string): string {
  let t = s.toLowerCase().replace(/[ʻʼ’‘`´]/g, "'").replace(/o'/g, 'о').replace(/g'/g, 'г');
  let out = '';
  for (let i = 0; i < t.length;) {
    const ikki = IKKI.find(([l]) => t.startsWith(l, i));
    if (ikki) { out += ikki[1]; i += 2; continue; }
    const ch = t[i];
    out += BIR[ch] ?? ch; i++;
  }
  return out;
}

/** O'zbekcha (lotin) ildiz -> ruscha ildizlar. Ildiz bo'yicha `includes` bilan qidiriladi. */
export const UZ_RU_LUGAT: Record<string, string[]> = {
  tub: ['дно', 'дна', 'днищ'], devor: ['стен'], poydevor: ['фундамент'], pol: ['пол'], tom: ['кровл', 'покрыти'], ustun: ['колонн'], tosin: ['балк'],
  qazish: ['разработк', 'грунт', 'котлован'], qazilma: ['разработк', 'котлован'], komish: ['засыпк'], zichlash: ['уплотн'], tuproq: ['грунт'],
  qum: ['песок', 'песча'], shagal: ['щебен', 'гравий'], sement: ['цемент'], temirbeton: ['железобетон'], armatura: ['арматур'], temir: ['металл', 'арматур'],
  gisht: ['кирпич'], suvoq: ['штукатур'], boyoq: ['краск', 'окраск'], plitka: ['плитк'], asfalt: ['асфальт'], bordyur: ['бордюр'], yotqizish: ['укладк', 'устройств'],
  ornatish: ['установк', 'монтаж'], quvur: ['труб'], truba: ['труб'], kabel: ['кабел'], sim: ['провод'], chiroq: ['светильник', 'освещени'], eshik: ['дверь', 'двер'],
  deraza: ['окон', 'окно'], izolyatsiya: ['изоляци'], gidroizolyatsiya: ['гидроизоляц'], kanal: ['канал', 'лоток'], kuvet: ['кювет'], fontan: ['фонтан'], kol: ['озер', 'водоем'],
  shpaklyovka: ['шпатлевк'], gips: ['гипс'], oyna: ['стекл'], yogoch: ['дерев'], payvandlash: ['сварк'], mix: ['гвозд'], bolt: ['болт'],
};

const normUz = (w: string) => w.toLowerCase().replace(/[ʻʼ’‘`´']/g, '');

function soz(w: string): string[] {
  const v = new Set<string>([w.toLowerCase()]);
  if (lotinMi(w)) {
    v.add(lotinKirill(w));
    const n = normUz(w);
    for (const [uz, ru] of Object.entries(UZ_RU_LUGAT)) if (n.startsWith(uz) || uz.startsWith(n) && n.length >= 3) for (const r of ru) v.add(r);
  }
  return [...v];
}

/** `q` ni so'zlarga ajratib, har so'z uchun muqobillar. Qator mos: har so'zning KAMIDA bitta muqobili matnda bor. */
export function qidiruvTayyorla(q: string): (matn: string) => boolean {
  const sozlar = q.trim().split(/\s+/).filter(Boolean);
  if (!sozlar.length) return () => true;
  const muq = sozlar.map(soz);
  return (matn: string) => {
    const m = matn.toLocaleLowerCase('ru');
    return muq.every((vs) => vs.some((v) => m.includes(v.toLocaleLowerCase('ru'))));
  };
}
