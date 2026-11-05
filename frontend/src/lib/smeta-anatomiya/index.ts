/**
 * SMETA_ANATOMIYA_V1 — kirish nuqtasi. Smeta yuklash, F2 import, Oferta,
 * Ostatka, Nakopitelniy faylni FAQAT shu orqali tushunadi.
 * Kontrakt: docs/architecture/SMETA_ANATOMIYA_V1.md.
 */
import { varaqniTahlilQil } from './varaq';
import { erkinVaraqlar } from './erkin';
import { svodVaraqlari } from './svod';
import { tushunilmaganVaraqlar } from './darvoza';
import { allToplamRollari } from './all-toplam';
import { analyzeWorkbookEvidence, type WorkbookEvidence } from '../document-understanding/evidence';
import type { ErkinVaraq, KirishKitob, ReviewBand, SvodVaraq, TushunilmaganVaraq, VaraqAnatomiyasi } from './turlar';

export interface KitobAnatomiyasi {
  fayl: string;
  varaqlar: VaraqAnatomiyasi[];
  /** Transport (tn·km qatorlari bilan) / perevozka RES / erkin hisob varaqlari — yakuniy summa va svod qatori bilan. */
  erkin: ErkinVaraq[];
  /** Moddali svod varaqlari (`SvodQatori`: modda, foiz, xat lump-sum, snijenie…). Smetaga o'zi yozilmaydi. */
  svod: SvodVaraq[];
  /** «Bo'sh import» darvozasi: sonli qatorlari bor, lekin hech bir shakl o'qimagan varaqlar. */
  tushunilmadi: TushunilmaganVaraq[];
  /** Ish daraxti uchun asosiy varaq (LRV). F5_UZB kabi dublikatlar `dublikat` da. */
  asosiyLrv: string | null;
  dublikat: Array<{ varaq: string; asl: string; sabab: string }>;
  review: ReviewBand[];
  /** Lossless source facts, formulas, explicit rates and unassigned rows. */
  sourceEvidence: WorkbookEvidence;
}

/** Ikki LRV varag'i bir xil ishlarni beradimi (shifr + hajm ketma-ketligi). */
function birXilIshlar(a: VaraqAnatomiyasi, b: VaraqAnatomiyasi): boolean {
  if (a.ishlar.length !== b.ishlar.length || !a.ishlar.length) return false;
  return a.ishlar.every((x, i) => (x.shifr ?? '') === (b.ishlar[i].shifr ?? '') && x.hajm === b.ishlar[i].hajm);
}

function varaqlarniTahlilQil(kitob: KirishKitob): VaraqAnatomiyasi[] {
  let keyingiId = 1;
  return kitob.varaqlar.map((v) => {
    const a = varaqniTahlilQil(kitob.fayl, v, keyingiId);
    for (const s of [...a.titul, ...a.sarlavhalar]) keyingiId = Math.max(keyingiId, s.id + 1);
    return a;
  });
}

/** Hamroh natijalar (transport/perevozka, moddali svod, «tushunilmadi» darvozasi) va ularning review'lari. */
function hamrohlar(kitob: KirishKitob, varaqlar: readonly VaraqAnatomiyasi[], review: ReviewBand[]): Pick<KitobAnatomiyasi, 'erkin' | 'svod' | 'tushunilmadi'> {
  const erkin = erkinVaraqlar(kitob, varaqlar);
  for (const e of erkin) {
    if (!e.yakuniy) review.push({ kod: 'erkin_summa_yoq', izoh: `"${e.varaq}" varag'ida ИТОГО/ВСЕГО summasi topilmadi — operator ko'rib chiqadi` });
    if (e.jamiMos === false) {
      review.push({ kod: 'transport_jami_farq', izoh: `"${e.varaq}": material qatorlari jami ${e.qatorlarJami} ≠ ИТОГО ${e.yakuniy?.qiymat} — qatorlarni tekshiring`, ...(e.yakuniy ? { manzil: e.yakuniy.manzil } : {}) });
    }
  }
  const svod = svodVaraqlari(kitob, varaqlar);
  for (const s of svod) {
    review.push(...s.review);
    const xatlar = s.qatorlar.filter((q) => q.tur === 'xat_lumpsum');
    if (xatlar.length) {
      review.push({ kod: 'svod_xat_lumpsum', izoh: `"${s.varaq}": ${xatlar.length} ta «письмо заказчика» yaxlit qatori — smetaga faqat operator tanlasa kiradi` });
    }
  }
  const tushunilmadi = tushunilmaganVaraqlar(kitob, varaqlar, erkin, svod);
  for (const t of tushunilmadi) {
    review.push({ kod: 'tushunilmadi', izoh: `"${t.varaq}": ${t.sonliQatorlar} ta sonli qator bor, lekin o'qilmadi${t.engKattaSumma ? ` (eng katta summa ${t.engKattaSumma.qiymat})` : ''} — ${t.taklif}`, ...(t.engKattaSumma ? { manzil: t.engKattaSumma.manzil } : {}) });
  }
  return { erkin, svod, tushunilmadi };
}

/**
 * Smeta yuklash UI uchun yengil kirish: varaq rollari + hamroh natijalar (sourceEvidence siz).
 * Xuddi `kitobAnatomiyasi` bilan bir xil yadro — parallel aniqlagich emas.
 */
export function kitobHamrohlari(kitob: KirishKitob): Pick<KitobAnatomiyasi, 'fayl' | 'varaqlar' | 'erkin' | 'svod' | 'tushunilmadi' | 'review'> {
  const varaqlar = varaqlarniTahlilQil(kitob);
  const review: ReviewBand[] = [];
  return { fayl: kitob.fayl, varaqlar, ...hamrohlar(kitob, varaqlar, review), review };
}

const resursSoni = (v: VaraqAnatomiyasi) => v.ishlar.reduce((n, i) => n + i.resurslar.length, 0);

export function kitobAnatomiyasi(kitob: KirishKitob): KitobAnatomiyasi {
  const varaqlar = varaqlarniTahlilQil(kitob);
  const all = allToplamRollari(kitob.varaqlar);
  // Resursli varaq asosiy (VED/TNDR — ish+hajm, resurssiz — hech qachon asosiy LRV emas); keyin eng kam review'li:
  // F5_UZB va LRV bir xil ishlarni beradi, lekin F5_UZB da resurslar to'liq emas (Navoiy STR: 19 065 vs 19 838).
  const lrvlar = varaqlar
    .filter((v) => (all ? v.varaq === all.f5 : v.rol === 'lrv') && v.ishlar.length)
    .sort((a, b) => Number(resursSoni(b) > 0) - Number(resursSoni(a) > 0) || a.review.length - b.review.length);
  const dublikat: KitobAnatomiyasi['dublikat'] = [];
  const asosiylar: VaraqAnatomiyasi[] = [];
  for (const v of lrvlar) {
    const asl = asosiylar.find((a) => birXilIshlar(a, v));
    if (asl) dublikat.push({ varaq: v.varaq, asl: asl.varaq, sabab: "ishlar shifr va hajm bo'yicha bir xil" });
    else asosiylar.push(v);
  }
  const review: ReviewBand[] = [];
  if (all) {
    for (const n of [...all.ved, ...all.tndr]) {
      const asl = all.rollar[n] === 'ved' ? 'hajm vedomosti' : 'tender narxi, transport ichida';
      dublikat.push({ varaq: n, asl: all.f5, sabab: `ALL to'plam: ${asl} — import manbai emas` });
    }
    review.push({ kod: 'all_toplam', izoh: `ALL to'plam: LRV — «${all.f5}», RES — «${all.res}»; ${[...all.ved, ...all.tndr].map((n) => `«${n}»`).join(', ')} — e'tibor berilmaydi${all.mazmundan.length ? ` (mazmundan: ${all.mazmundan.join(', ')})` : ''}` });
  }
  if (asosiylar.length > 1) {
    review.push({ kod: 'kop_lrv', izoh: `bitta faylda ${asosiylar.length} ta turli LRV: ${asosiylar.map((a) => a.varaq).join(', ')} — operator tanlaydi` });
  }
  if (/(^|[\\/])\s*\d*\.?\s*итог[^\\/]*\.xlsx?$/i.test(kitob.fayl)) {
    review.push({ kod: 'import_manbai_emas', izoh: `«${kitob.fayl.split(/[\\/]/).pop()}» — yig'ma (итог) fayl: faqat svod, import manbai emas; uchastka (lokal) fayllarini yuklang` });
  }
  const h = hamrohlar(kitob, varaqlar, review);
  const asosiyLrv = asosiylar[0]?.varaq ?? (all && varaqlar.some((v) => v.varaq === all.f5) ? all.f5 : null);
  const result = { fayl: kitob.fayl, varaqlar, ...h, asosiyLrv, dublikat, review };
  return { ...result, sourceEvidence: analyzeWorkbookEvidence(kitob, result) };
}

export { sarlavhaYoli } from './ierarxiya';
export { moddaliSvodniOqi, svodVaraqlari } from './svod';
export { nakrutkaPodvaliniOqi, nakrutkaVaraqlari, formulaniHisobla, NAKRUTKA_FOIZ_KODLARI, type NakrutkaPodvalOqish, type NakrutkaPodvalQatori, type NakrutkaIsbot } from './nakrutka';
export { transportQatorlari } from './erkin';
export { allToplamRollari, type AllToplam, type AllRol, type AllTeg } from './all-toplam';
export { resBloklari, podvalFoizSumma, type ResBlok, type ResBlokKat, type ResBloklarNatija } from './res-blok';
export { tushunilmaganVaraqlar, sonliQatorlar } from './darvoza';
export { hamrohDaraxti, xatQatoriNarxi, type HamrohTanlov } from './yuklash';
export { varaqRoliniAniqla, varaqNomiRoli, nomTokenlari, type VaraqRol, type VaraqRolXulosa } from './rol';
export { sarlavhaBlokiniTop, ustunXaritasi, tartibRaqamlariQatorimi, type SarlavhaBloki } from './ustun';
export { arifmetikUchlik, uchlikniMoslashtir, qoshimchaUstunlar, type MoslashuvNatija, type UstunUchlik } from './ustun-dalil';
export type * from './turlar';
export { formatAniqla, nomNaqshi, profilMos, varaqProfili, type SmetaFormat, type VaraqProfili } from './profil';
export { tuzatishSababi, tuzatishQatorimi, tuzatishBoglanishlari, tuzatishFakti, type TuzatishManba, type TuzatishSabab, type TuzatishBoglanish, type TuzatishXarita } from './tuzatish';
