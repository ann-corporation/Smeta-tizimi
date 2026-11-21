/** Shablon paketi: yuklash va statik tekshiruv (birlik/o'lcham, parametr nomlari, shart qiymatlari). */
import { BIRLIKLAR } from '../../smeta-ai/protokol';
import { BIRLIK_DARAJA, OLCHOV_DARAJA, ifodaOlchami, ifodaParametrlari } from '../ifoda';
import type { ParamTavsif, Shablon } from '../turlar';
import xususiyUyJson from './xususiy-uy.json';

export const XUSUSIY_UY = xususiyUyJson as unknown as Shablon;

/** Tanlov qiymatini yagona shaklga keltiradi: kichik harf, apostrof turlari bir xil, bo'shliqsiz. */
export const tanlovKaliti = (s: unknown): string =>
  String(s ?? '').toLowerCase().replace(/[ʻʼ‘’`´]/g, "'").replace(/\s+/g, '').replace(/[.,;:]+$/, '');

/** Foydalanuvchi/model qiymatini variant `qiymat`iga aylantiradi; mos kelmasa null. */
export function tanlovQiymati(p: ParamTavsif, xom: unknown): string | null {
  const k = tanlovKaliti(xom);
  if (!k) return null;
  for (const v of p.variantlar ?? []) {
    if ([v.qiymat, v.yorliq, ...(v.sinonimlar ?? [])].some(x => tanlovKaliti(x) === k)) return v.qiymat;
  }
  return null;
}

/** Shablon xatolari ro'yxati (bo'sh = to'g'ri). Test va yuklashda ishlatiladi. */
export function shablonXatolari(s: Shablon): string[] {
  const xato: string[] = [];
  const elementlar = new Set(s.elementlar.map(e => e.id));
  const ids = new Set<string>();
  for (const [nom, p] of Object.entries(s.parametrlar)) {
    if (!/^[a-z][a-z0-9_]*$/.test(nom)) xato.push(`parametr nomi noto'g'ri: ${nom}`);
    if (p.tur === 'tanlov' && !(p.variantlar?.length)) xato.push(`${nom}: tanlov variantsiz`);
    if (p.tur === 'son' && (OLCHOV_DARAJA[p.olchov] == null || p.min == null || p.max == null || p.min > p.max)) xato.push(`${nom}: son parametri chegarasiz yoki o'lchovsiz`);
    if (!p.savol.trim()) xato.push(`${nom}: savol yo'q`);
  }
  for (const q of s.qoidalar) {
    const ctx = `qoida ${q.id}`;
    if (ids.has(q.id)) xato.push(`${ctx}: id takror`);
    ids.add(q.id);
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(q.id)) xato.push(`${ctx}: id IshNiyati uchun yaroqsiz`);
    if (!elementlar.has(q.element)) xato.push(`${ctx}: noma'lum element ${q.element}`);
    if (!(BIRLIKLAR as readonly string[]).includes(q.birlik)) xato.push(`${ctx}: birlik ${q.birlik} yaroqsiz`);
    if (!q.qidiruv.length || q.qidiruv.length > 3 || q.qidiruv.some(x => !/[Ѐ-ӿ]/.test(x))) xato.push(`${ctx}: qidiruv 1-3 ta RUS ibora bo'lishi kerak`);
    // Norma kodi yozilmaydi (faqat katalogdan topiladi).
    if ([q.tavsif, ...q.qidiruv].some(x => /(?<![\p{L}\d])[EЕЦУ]\d{1,3}-\d+-\d+/iu.test(x))) xato.push(`${ctx}: qidiruvda norma kodi bor`);
    for (const [param, qiymatlar] of Object.entries(q.agar ?? {})) {
      const p = s.parametrlar[param];
      if (!p || p.tur !== 'tanlov') { xato.push(`${ctx}: agar parametri tanlov emas: ${param}`); continue; }
      for (const v of qiymatlar) if (!p.variantlar?.some(x => x.qiymat === v)) xato.push(`${ctx}: agar qiymati yo'q: ${param}=${v}`);
    }
    if (q.ifoda == null) continue;
    try {
      for (const nom of ifodaParametrlari(q.ifoda)) if (s.parametrlar[nom]?.tur !== 'son') xato.push(`${ctx}: formulada son bo'lmagan parametr ${nom}`);
      const maqsad = BIRLIK_DARAJA[q.birlik];
      if (maqsad == null) xato.push(`${ctx}: ${q.birlik} birligi formuladan chiqmaydi`);
      else {
        const d = ifodaOlchami(q.ifoda, nom => OLCHOV_DARAJA[s.parametrlar[nom]?.olchov ?? 'matn']);
        if (d !== maqsad) xato.push(`${ctx}: formula o'lchami ${d} != ${q.birlik} (${maqsad})`);
      }
    } catch (e) { xato.push(`${ctx}: formula xato (${(e as Error).message})`); }
  }
  return xato;
}
