/**
 * Frontend sof mantig'i — YAGONA manba (dublikat yozilmaydi). MCP shu modullarni bundle qiladi:
 * pereraschet, ustamali summa (kaskad + podval), fakt jurnali (bo'lim summalari), F2 import (o'qish → moslash →
 * ish joyi → exact yozish yuki), F2 dublikat tekshiruvi. Brauzer modullari stubs.mjs da almashtiriladi.
 */
export { pereraschetHisobla, PERERASCHET_USTUNLAR, type PQator, type PNatija, type PNatijaQator } from '../../../frontend/src/lib/pereraschet';
export { ustamaliHisobla, bosKatKesim, katKesimgaQosh, type KatKesim, type UstamaNatija } from '../../../frontend/src/lib/ustamali-summa';
export { podvalTanla } from '../../../frontend/src/api/t2-nakrutka-podval';
export { standartPodval, podvalTekshir, type Podval, type PodvalQator } from '../../../frontend/src/lib/hisob-yadro/podval';
export { jurnalQur, bolimSummalari, bolimTarkibi, type JurnalHolat, type JurnalIsh, type BolimSumma } from '../../../frontend/src/lib/fakt-jurnal';
export { takliflarQur, ishNomzodlari, ishonchDarajasi } from '../../../frontend/src/lib/aosr-taklif';
export { readXlsx } from '../../../frontend/src/lib/f2-import-parse/xlsxReader';
export { f2AktlarniOqi, type F2Akt } from '../../../frontend/src/lib/smeta-anatomiya/f2';
export { f2MoslashV3, type SmetaQator, type F2MoslashNatija } from '../../../frontend/src/lib/f2-moslash-v3';
export { boshlangich, f2Indeks, smetaIndeks, type IshJoyi } from '../../../frontend/src/lib/f2-moslash-v3/ishJoyi';
export { dvigatelDaraxti, podvalTaklifQosh } from '../../../frontend/src/lib/f2-moslash-v3/podval';
export { nakQoldiqXaritalari } from '../../../frontend/src/lib/f2-moslash-v3/nakQoldiq';
export { qoralamaBandi } from '../../../frontend/src/lib/f2-moslash-v3/band';
export {
  aktualQator, bogniAktualla, vorisXaritasi, xotiraniAktualla, faktMavjudYigish, faktDeltaReja, ESKI_VERSIYA_SABAB, FAKT_BOR_SABAB,
  type AQator, type FaktSatr, type FaktReja,
} from '../../../frontend/src/lib/f2-moslash-v3/aktual';
export { f2RaqamNormal } from '../../../frontend/src/lib/f2-moslash-v3/takror';
export { f2QoralamaYozish } from '../../../frontend/src/lib/f2-ishchi-qoralama';
export { exactWrite, exactWriteIzohlar } from '../../../frontend/src/lib/f2-exact-write';
export { dublikatTekshiruv, bloklarmi, pereraschetBelgisi, type DAkt, type Masala } from '../../../frontend/src/lib/f2-dublikat/tekshiruv';
export * as qamrovModul from '@frontend-ixtiyoriy/fakt-qamrov';
