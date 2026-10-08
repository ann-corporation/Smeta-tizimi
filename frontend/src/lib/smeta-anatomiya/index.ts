/**
 * SMETA_ANATOMIYA_V1 — kirish nuqtasi. Smeta yuklash, F2 import, Oferta,
 * Ostatka, Nakopitelniy faylni FAQAT shu orqali tushunadi.
 * Kontrakt: docs/architecture/SMETA_ANATOMIYA_V1.md.
 */
import { varaqniTahlilQil } from './varaq';
import { erkinVaraqlar } from './erkin';
import { analyzeWorkbookEvidence, type WorkbookEvidence } from '../document-understanding/evidence';
import type { ErkinVaraq, KirishKitob, ReviewBand, VaraqAnatomiyasi } from './turlar';

export interface KitobAnatomiyasi {
  fayl: string;
  varaqlar: VaraqAnatomiyasi[];
  /** Transport/erkin hisob varaqlari — yakuniy summa va svod qatori bilan. */
  erkin: ErkinVaraq[];
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

export function kitobAnatomiyasi(kitob: KirishKitob): KitobAnatomiyasi {
  let keyingiId = 1;
  const varaqlar = kitob.varaqlar.map((v) => {
    const a = varaqniTahlilQil(kitob.fayl, v, keyingiId);
    for (const s of [...a.titul, ...a.sarlavhalar]) keyingiId = Math.max(keyingiId, s.id + 1);
    return a;
  });
  // Eng kam review'li LRV asosiy: F5_UZB va LRV bir xil ishlarni beradi, lekin
  // F5_UZB da resurslar to'liq emas (Navoiy STR: 19 065 vs 19 838).
  const lrvlar = varaqlar
    .filter((v) => v.rol === 'lrv' && v.ishlar.length)
    .sort((a, b) => a.review.length - b.review.length);
  const dublikat: KitobAnatomiyasi['dublikat'] = [];
  const asosiylar: VaraqAnatomiyasi[] = [];
  for (const v of lrvlar) {
    const asl = asosiylar.find((a) => birXilIshlar(a, v));
    if (asl) dublikat.push({ varaq: v.varaq, asl: asl.varaq, sabab: "ishlar shifr va hajm bo'yicha bir xil" });
    else asosiylar.push(v);
  }
  const review: ReviewBand[] = [];
  if (asosiylar.length > 1) {
    review.push({ kod: 'kop_lrv', izoh: `bitta faylda ${asosiylar.length} ta turli LRV: ${asosiylar.map((a) => a.varaq).join(', ')} — operator tanlaydi` });
  }
  const erkin = erkinVaraqlar(kitob, varaqlar);
  for (const e of erkin) {
    if (!e.yakuniy) review.push({ kod: 'erkin_summa_yoq', izoh: `"${e.varaq}" varag'ida ИТОГО/ВСЕГО summasi topilmadi — operator ko'rib chiqadi` });
  }
  const result = { fayl: kitob.fayl, varaqlar, erkin, asosiyLrv: asosiylar[0]?.varaq ?? null, dublikat, review };
  return { ...result, sourceEvidence: analyzeWorkbookEvidence(kitob, result) };
}

export { sarlavhaYoli } from './ierarxiya';
export { sarlavhaBlokiniTop, ustunXaritasi, tartibRaqamlariQatorimi, type SarlavhaBloki } from './ustun';
export { arifmetikUchlik, uchlikniMoslashtir, qoshimchaUstunlar, type MoslashuvNatija, type UstunUchlik } from './ustun-dalil';
export type * from './turlar';
export { formatAniqla, nomNaqshi, profilMos, varaqProfili, type SmetaFormat, type VaraqProfili } from './profil';
