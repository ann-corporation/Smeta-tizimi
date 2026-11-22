/**
 * Scope x shablon -> IshNiyati[] (deterministik; model ishtirok etmaydi).
 *  - qoida faqat element Scope'da bo'lsa va `agar` shartlari bajarilsa qo'llanadi;
 *  - shart/formula parametri yo'q bo'lsa -> ish HAJM_KERAK holatida + SAVOL (jim sukut qiymat yo'q);
 *  - parametr "assumed" bo'lsa -> ish `taxmin` bilan (foydalanuvchi tasdiqlaguncha kutadi);
 *  - hajm: o'lcham tekshirilgan formula, aniq hisob + yaxlit2; natija IshNiyati.hajmIfoda'da SONLI formula sifatida
 *    qoladi (mavjud Studio quvuri uni qayta hisoblab tekshira oladi).
 */
import type { IshNiyati } from '../smeta-ai/protokol';
import { ifodaParametrlari, ifodaQiymati } from './ifoda';
import type { Kengaytma, Scope, ScopeSavol, Shablon, ShablonQoida } from './turlar';

const sonQiymati = (scope: Scope, nom: string): number | null => {
  const v = scope.olchamlar[nom]?.value;
  return typeof v === 'number' ? v : null;
};
const uz = (n: number) => String(n).replace('.', ',');

function savolParam(s: Shablon, nom: string): ScopeSavol {
  const p = s.parametrlar[nom];
  return { matn: p.savol, param: nom, variantlar: p.tur === 'tanlov' ? (p.variantlar ?? []).map(v => v.yorliq) : (p.tavsiya ?? []) };
}

export function kengaytir(scope: Scope, s: Shablon): Kengaytma {
  const ishlar: IshNiyati[] = [];
  const otkazilgan: Kengaytma['otkazilgan'] = [];
  const kerakParam = new Set<string>();
  const elementlar = new Set(scope.elementlar.map(e => e.id));

  const asos = (q: ShablonQoida) => ({ id: q.id, bolim: s.elementlar.find(e => e.id === q.element)?.yorliq ?? q.bolim, tavsif: q.tavsif,
    qidiruv: q.qidiruv.slice(0, 3), birlik: q.birlik, material: q.material ?? null, ...(q.toplam?.length ? { toplam: q.toplam } : {}) });

  for (const q of s.qoidalar) {
    if (!elementlar.has(q.element)) continue;

    // 1) Shartlar: ma'lum qiymat mos kelmasa — qoida shu uyga tegishli emas (jim o'tkaziladi); noma'lum — savol.
    const nomalumShart: string[] = [];
    let mos = true;
    for (const [param, qiymatlar] of Object.entries(q.agar ?? {})) {
      const v = scope.olchamlar[param]?.value;
      if (v == null) nomalumShart.push(param);
      else if (!qiymatlar.includes(String(v))) mos = false;
    }
    if (!mos) { otkazilgan.push({ qoida: q.id, sabab: 'shart mos emas' }); continue; }
    if (nomalumShart.length) {
      nomalumShart.forEach(n => kerakParam.add(n));
      // Variantlardan qaysi biri ekani noma'lum: ish ro'yxatga qo'yilmaydi (har variantga alohida joy-egasi — shovqin), savol beriladi.
      otkazilgan.push({ qoida: q.id, sabab: `shart noma'lum: ${nomalumShart.join(', ')}` });
      continue;
    }

    // 2) Joy-egasi: formula yo'q.
    if (q.ifoda == null) { ishlar.push({ ...asos(q), hajmIfoda: null, hajmIzoh: q.izoh ?? 'Hajm loyihadan aniqlanadi', holat: 'ANIQLASH_KERAK' }); continue; }

    // 3) Formula parametrlari.
    const params = ifodaParametrlari(q.ifoda);
    const yoq = params.filter(n => sonQiymati(scope, n) == null);
    if (yoq.length) {
      yoq.forEach(n => kerakParam.add(n));
      ishlar.push({ ...asos(q), hajmIfoda: null, hajmIzoh: `Kerak: ${yoq.map(n => s.parametrlar[n].tavsif).join('; ')}`, holat: 'HAJM_KERAK' });
      continue;
    }
    try {
      const { hajm, sonli } = ifodaQiymati(q.ifoda, n => sonQiymati(scope, n) as number);
      if (!(hajm > 0)) { otkazilgan.push({ qoida: q.id, sabab: `hajm ${hajm} (nol yoki manfiy) — parametrlarni tekshiring` }); continue; }
      const taxminlar = params.filter(n => scope.olchamlar[n].source === 'assumed');
      ishlar.push({ ...asos(q), hajmIfoda: sonli.replace(/\./g, ',').replace(/ /g, ''),
        hajmIzoh: `${q.ifoda.replace(/\*/g, '×')} = ${uz(hajm)}${q.izoh ? ` · ${q.izoh}` : ''}`.slice(0, 400),
        ...(taxminlar.length ? { taxmin: `Taxmin qiymatlar: ${taxminlar.map(n => `${n}=${uz(sonQiymati(scope, n) as number)}`).join(', ')} — tasdiqlang` } : {}),
        holat: 'TAYYOR' });
    } catch (e) {
      otkazilgan.push({ qoida: q.id, sabab: `formula hisoblanmadi (${(e as Error).message})` });
      ishlar.push({ ...asos(q), hajmIfoda: null, hajmIzoh: 'Parametrlar zid (hajm manfiy yoki hisoblanmadi) — tekshiring', holat: 'HAJM_KERAK' });
    }
  }

  // Savollar: model savollari + yetishmagan parametrlar (param bo'yicha takrorsiz).
  const savollar: ScopeSavol[] = [];
  const korilgan = new Set<string>();
  for (const n of kerakParam) { savollar.push(savolParam(s, n)); korilgan.add(n); }
  for (const x of scope.savollar) if (!(x.param && korilgan.has(x.param)) && !savollar.some(y => y.matn === x.matn)) savollar.push(x);
  return { ishlar, savollar, otkazilgan };
}
