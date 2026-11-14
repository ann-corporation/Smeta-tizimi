import type { T2Qator, T2QatorHolat } from '../api/supabase';
import {
  RasmiyVaraq, bugunSana, sumRefs, hujjatFaylNomi, imzoTomonlari, rasmiyKitob, yaxlit2,
  type ImzoNomlar, type Qiymat, type RasmiyUstun,
} from './hujjat-yozuvchi';
import type { OstatkaIstisno } from './ostatka-export';
import type { F3DavrAkt } from './forma3-export';
import type { NakrutkaKoeffitsientlar } from '../api/t2-nakrutka';
import { NAKRUTKA_KATLAR, NOMALUM_KAT, kOplate, kategoriyaKf, nakrutkaKat, nakrutkaPodvaliYoz, podvalKfQatorlari, podvalNdsFoiz, podvalQatorRaqami, type KatSummalar } from './nakrutka-podval';
import { YAXLIT_IZOH, YAXLIT_KAT, bolimBarglari, bolimQqsBilan, svodYaxlitQqs, type SvodYaxlit } from './svod-yaxlit';
import { NDS_SUKUT_FOIZ, qqsSizNarx, faktSummaF2Narxda, faktSummaF2NarxFormula, qatorSumma, serverMerosKoefQoy, yaxlitBolimJami, yaxlitKOplate, yaxlitKOplateTaqsim, yaxlitKorinish, yaxlitQatorlarga, yigindi2, yigindi2Qatiy, type Podval } from './hisob-yadro';
import { mashinistMehnati, narxBildirishnomaKerak, narxsizSoni } from './narx-bildirishnoma';
import { bargUslubi } from './qator-uslubi';

/**
 * СЛИЧИТЕЛЬНАЯ ВЕДОМОСТЬ — smeta va haqiqatda bajarilgan hajmlarni
 * solishtirish (egasi 2026-09-25: "slichitelniy vedomost ham yasay oladigan
 * bo'lishi kerak"). Hujjat standarti H1–H9 (`docs/architecture/HUJJAT_STANDARTI_V1.md`).
 *
 * Katalogda DOC-14 / TPL-08 — ichki nazorat reestri: farqni KO'RSATADI, hech
 * bir manbani "to'g'rilamaydi". Manbalar kanonik:
 *   A — smeta (`t2_qator`: hajm, narx),
 *   B — fakt (`t2_qator_holat.fakt_hajm`, tasdiqlangan fakt hujjatlari),
 *   ma'lumot uchun — tasdiqlangan Ф-2 (`f2_hajm`, `f2_summa`, hujjat qiymati).
 * Bog'lash faqat `t2_qator.id` bilan (qator raqami yoki nom bilan emas).
 *
 * Qoidalar:
 *  - ОТКЛОНЕНИЕ = факт − смета (+ сверх сметы, − не выполнено); summa smeta
 *    narxida (to'g'ri xarajat, НДС siz) — Excel formulasi bilan;
 *  - smeta hajmi/narxi yoki fakt noma'lum — summa bo'sh, yuqoridagi jamilar
 *    bo'sh, «ТРЕБУЮТ ВНИМАНИЯ» da (NULL ≠ 0);
 *  - pul faqat barglardan yig'iladi (bl/rz summasi takror);
 *  - qo'shimcha ish, almashtirish va ostatkadan chiqarilgan ish (tasdiqlangan
 *    o'zgarish) «Примечание» da asosi bilan.
 */

export type SlichitelniyOpsiya = {
  obyektNomi: string;
  /** "По состоянию на" (YYYY-MM-DD). Berilmasa — bugun. */
  sana?: string;
  imzo?: ImzoNomlar;
  /** Faqat farqi bor (yoki noma'lum) pozitsiyalar. Sukut — hammasi. */
  faqatFarq?: boolean;
  /** Ostatkadan chiqarilgan ishlar (tasdiqlangan) — izohda. */
  istisnolar?: readonly OstatkaIstisno[];
  /** Obyekt nakrutka foizlari — к оплате = прямые × Kf. Berilmasa — к оплате noma'lum (0 % emas). */
  nakrutka?: Partial<NakrutkaKoeffitsientlar> | null;
  /** Maxsus nakrutka podvali (konstruktor) — null: standart kaskad. */
  podval?: Podval | null;
  /** Server `nk_manba` — meros foizlari izohi (yadro `serverMerosKoefQoy`). */
  nkManba?: string | null;
  /** НДС stavkasi (sukut: nakrutkadagi НДС, u ham bo'lmasa 12 %). */
  ndsFoiz?: number | null;
  /** Svod yaxlit bo'limlari va avlodlari (`yaxlitQatorIdlari`): ularga ustama qo'llanmaydi, podvalda alohida qator. */
  yaxlitIdlar?: ReadonlySet<number> | null;
  /** Svod yaxlit xulosasi (server) — to'liq ro'yxatda smeta ustunining yaxlit summasi svoddan (QQS siz). */
  svodYaxlit?: SvodYaxlit | null;
  /** Smetada yo'q bajarilgan ishlar (qo'shimcha/zamena): 'daraxt' (sukut) — asosiy varaqdagi «ДОПОЛНИТЕЛЬНЫЕ РАБОТЫ» bo'limi va zamena juftlari;
   *  'alohida' — qo'shimcha ravishda alohida varaq «Работы вне сметы». */
  vneSmeta?: 'alohida' | 'daraxt';
  /** Barcha tasdiqlangan F-2 aktlari — har biri O'Z podvali bilan (`aktlarBahosiOl`). Berilsa — «ranee предъявлено» к оплате aktlar yig'indisi bilan
   *  solishtiriladi; null — aktlar o'qilmadi (jim emas, ogohlantirish); berilmasa — solishtirilmaydi. */
  aktlarKOplate?: ReadonlyArray<F3DavrAkt> | null;
};

/** Model opsiyalari. Fakt hajmi yozilganidek; fakt summasi — tasdiqlangan F2 bor qatorda F2 narxida (yadro). */
export type SlichitelniyModelOpsiya = Pick<SlichitelniyOpsiya, 'faqatFarq' | 'istisnolar'> & {
  /** Svod yaxlit (server): bo'lim qatorlari yaxlit summaga taqsimlanadi (smeta, fakt, отклонение) — to'liq ro'yxatda. */
  svodYaxlit?: SvodYaxlit | null;
};

export type SlichitelniyQator = {
  id: number;
  tur: 'rz' | 'bl' | 'barg' | 'itogo';
  /** Resurs turi (RS/MAT/OB) - hujjatda qator uslubi uchun (rs: kursiv, mat/ob: qalin). */
  resTur?: 'rs' | 'mat' | 'ob';
  daraja: number;
  tartib: string;
  kod: string;
  nom: string;
  birlik: string;
  smetaHajm: number | null;
  narx: number | null;
  smetaSumma: number | null;
  faktHajm: number | null;
  faktSumma: number | null;
  f2Hajm: number;
  f2Summa: number;
  farqHajm: number | null;
  farqSumma: number | null;
  izoh: string;
  /** Resurs kategoriyasi (barg). */
  kat?: string | null;
  /** Noma'lum pul pozitsiyalari soni (bu qator va uning ostida). */
  nomalum: number;
  /** Svod yaxlit bo'limiga taqsimlangan qator — G/I/M qiymat (formula emas). */
  yaxlitTaqsim?: number;
  /** Svod bo'limi qatori: svodga taqsimlanishdan OLDINGI (to'g'ri narx, F-2 narxi qoidasi bilan) fakt summasi — «к оплате» hisobi (server qoidasi) shundan. */
  faktTogri?: number | null;
  /** Smetada yo'q ish (qo'shimcha / zamena) belgilari — «Работы вне сметы» bo'limi uchun. */
  qoshimcha?: boolean;
  zamena?: boolean;
  /** Qo'shimcha / zamena qatorining REJA summasi (o'zgarish hajmi × narx; smetada yo'q — smeta ustuni 0 qoladi, asl smeta o'zgarmaydi). Faqat svoddan tashqari qo'shimcha/zamena barglarida. */
  rejaSumma?: number | null;
  /** Fakt summasi tasdiqlangan F2 birlik narxida (narx qoidasi). */
  f2Narxda?: boolean;
  /** Fakt summasi serverning fakt_summa sidan (smeta narxi yo'q/0 yoki F-2 summasi yozilmagan) — Excelda formula emas, qiymat. */
  faktServerdan?: boolean;
  /** Tasdiqlangan F2 summasi noma'lum (NULL) — hujjatda K katagi bo'sh (formula kesh bilan teng bo'lsin). */
  f2SummaNomalum?: boolean;
  /** Resurs normasi va ota ish qatori indeksi — hujjatda smeta hajmi = norma × ish hajmi (tirik formula). */
  norma?: number | null;
  otaIdx?: number | null;
  /** Pereraschet: fakt − tasdiqlangan Ф-2 (hajm va summa). + к доплате, − к снятию. Noma'lum (fakt/narx/Ф-2 summasi NULL) — null. */
  doplataHajm: number | null;
  doplataSumma: number | null;
  /** Jamilar uchun: «к доплате» (+) / «к снятию» (−) ulushi (barg). Oddiy qator: doplataSumma ishorasiga qarab; svod bo'limida — bo'lim sof farqi birinchi qatorda, qolganlarda 0. */
  doplataPlus?: number | null;
  doplataMinus?: number | null;
  /** Zamena qatori: u almashtirgan asl qator id (`replaces_line_id`) — «взамен поз. N». */
  almashtiradiId?: number | null;
  /** Asl qator: uni almashtirgan zamena qatorlari id — «исключается (заменена поз. N)». */
  almashtirilganIdlar?: number[];
  bolalar: number[];
};

export type SlichitelniyJami = { smeta: number | null; fakt: number | null; f2: number; farq: number | null };

/** Pereraschet yakuni (barglar bo'yicha, summa smeta narxida / Ф-2 narxida, ustamasiz): + к доплате, − к снятию, net = fakt − Ф-2. */
export type SlichitelniyPereraschet = { doplata: number; snyatie: number; net: number; nomalum: number };

/** Sintetik bo'lim «ДОПОЛНИТЕЛЬНЫЕ РАБОТЫ» id si: razdel darajasidagi qo'shimcha ishlar smeta bo'limlaridan shu bo'limga ajratiladi. */
export const QOSHIMCHA_BOLIM_ID = -1;
export const QOSHIMCHA_BOLIM_NOMI = 'ДОПОЛНИТЕЛЬНЫЕ РАБОТЫ (НЕТ В СМЕТЕ)';

export type SlichitelniyModel = {
  qatorlar: SlichitelniyQator[];
  ildizlar: number[];
  jami: SlichitelniyJami;
  pereraschet: SlichitelniyPereraschet;
  diqqat: Array<{ nom: string; sabab: string; joy?: string }>;
  /** Barglar: jami / farqi borlar (+ ortiq, − kam). */
  barglar: number;
  ortiq: number;
  kam: number;
};

const BARG = new Set(['rs', 'mat', 'ob']);

/** Svod (yaxlit) bo'limlari barglari: bo'lim qator id si → `qatorlar` indekslari (tartib bilan). Faqat svod taqsimi qo'llangan barglar. */
export function svodGuruhlari(qatorlar: readonly SlichitelniyQator[]): Map<number, number[]> {
  const g = new Map<number, number[]>();
  qatorlar.forEach((r, i) => { if (r.tur === 'barg' && r.yaxlitTaqsim != null) { const a = g.get(r.yaxlitTaqsim); if (a) a.push(i); else g.set(r.yaxlitTaqsim, [i]); } });
  return g;
}
const EPS = 1e-9;
const nol = (x: number): number => (Math.abs(x) < EPS ? 0 : x);

export function slichitelniyModeli(qatorlar: readonly T2Qator[], holatlar: readonly T2QatorHolat[], o: SlichitelniyModelOpsiya = {}): SlichitelniyModel {
  const rows = [...qatorlar].sort((a, b) => (a.tartib ?? 0) - (b.tartib ?? 0) || a.id - b.id);
  const byId = new Map(rows.map((q) => [q.id, q]));
  const holat = new Map(holatlar.map((h) => [h.qator_id, h]));
  const istisno = new Map((o.istisnolar ?? []).filter((x) => x.holat === 'tasdiqlangan').map((x) => [x.qatorId, x]));
  const bolalar = new Map<number | null, T2Qator[]>();
  // Razdel (yoki ildiz) darajasidagi qo'shimcha ish (smeta 0) — smeta bo'limlaridan alohida «ДОПОЛНИТЕЛЬНЫЕ РАБОТЫ» bo'limiga.
  // Ish ichidagi qo'shimcha resurs joyida qoladi (ish tarkibi buzilmasin).
  // Svod yaxlit (bir butun summa) bo'limi ichidagi qatorlar smeta tarkibida: ular qo'shimcha bo'limga ko'chirilmaydi va smetasi 0 qilinmaydi (bo'lim summasi svoddan taqsimlanadi).
  const lumpIds = new Set((o.svodYaxlit?.bolimlar ?? []).map((b) => Number(b.qator_id)));
  const lumpOstida = (q: T2Qator): boolean => {
    if (!lumpIds.size) return false;
    for (let p: T2Qator | undefined = q, n = 0; p && n < 64; p = p.ota_id == null ? undefined : byId.get(p.ota_id), n++) if (lumpIds.has(p.id)) return true;
    return false;
  };
  const qoshimchaRoot = (q: T2Qator): boolean => {
    if (!q.qoshimcha || !(q.tur === 'bl' || BARG.has(q.tur ?? '')) || lumpOstida(q)) return false;
    const ota = q.ota_id == null ? undefined : byId.get(q.ota_id);
    return !ota || ota.tur === 'rz';
  };
  const qoshimchaBolim: T2Qator = { ...(rows[0] ?? ({} as T2Qator)), id: QOSHIMCHA_BOLIM_ID, ota_id: null, tur: 'rz', nom: QOSHIMCHA_BOLIM_NOMI, kod: null, hajm: null, narx: null, summa: null, qoshimcha: false, zamena: false };
  // Zamena (REPLACEMENT): yangi qator o'zi almashtirgan asl qator BILAN BIR BO'LIMDA va uning YONIDA turadi (asl «исключается» − , zamena +, bo'lim jami ikkalasini
  // qoplaydi); «ДОПОЛНИТЕЛЬНЫЕ РАБОТЫ» bo'limiga faqat sof qo'shimcha ish ketadi (egasi: zamena va qo'shimcha slichitelniyda aniq ko'rinsin).
  const zamenaAsl = (q: T2Qator): T2Qator | undefined => (q.zamena && q.replaces_line_id != null && q.replaces_line_id !== q.id ? byId.get(q.replaces_line_id) : undefined);
  const ozBolim = (q: T2Qator): number | null => (qoshimchaRoot(q) ? QOSHIMCHA_BOLIM_ID : q.ota_id != null && byId.has(q.ota_id) ? q.ota_id : null);
  const bolimOf = (q: T2Qator, n = 0): number | null => {
    const a = n < 8 && (q.tur === 'bl' || BARG.has(q.tur ?? '')) && !lumpOstida(q) ? zamenaAsl(q) : undefined;
    return a ? bolimOf(a, n + 1) : ozBolim(q);
  };
  for (const q of rows) {
    const ota = bolimOf(q);
    const a = bolalar.get(ota);
    if (a) a.push(q); else bolalar.set(ota, [q]);
  }
  for (const [k, arr] of [...bolalar]) {
    const bor = new Set(arr.map((x) => x.id));
    const yonida = new Map<number, T2Qator[]>();
    for (const x of arr) { const a = zamenaAsl(x); if (a && bor.has(a.id)) { const l = yonida.get(a.id); if (l) l.push(x); else yonida.set(a.id, [x]); } }
    if (!yonida.size) continue;
    const zset = new Set([...yonida.values()].flat().map((x) => x.id));
    const res: T2Qator[] = [];
    const qo = (x: T2Qator, n = 0) => { res.push(x); if (n < 8) (yonida.get(x.id) ?? []).forEach((z) => qo(z, n + 1)); };
    for (const x of arr) if (!zset.has(x.id)) qo(x);
    for (const x of arr) if (!res.includes(x)) res.push(x); // tsikl himoyasi: hech qator yo'qolmasin
    bolalar.set(k, res);
  }
  if (bolalar.has(QOSHIMCHA_BOLIM_ID)) { bolalar.set(null, [...(bolalar.get(null) ?? []), qoshimchaBolim]); byId.set(QOSHIMCHA_BOLIM_ID, qoshimchaBolim); }
  const yolOf = (q: T2Qator): string => {
    const y: string[] = [];
    for (let p = q.ota_id == null ? undefined : byId.get(q.ota_id); p; p = p.ota_id == null ? undefined : byId.get(p.ota_id)) if (p.tur === 'rz' || p.tur === 'bl') y.unshift(p.nom ?? '');
    return y.join(' › ');
  };
  const out: SlichitelniyQator[] = [];
  const diqqat: SlichitelniyModel['diqqat'] = [];
  let no = 0, barglar = 0, ortiq = 0, kam = 0;

  const izohOf = (q: T2Qator, smeta: number | null, fakt: number | null, farq: number | null): string => {
    const b: string[] = [];
    if (q.qoshimcha) b.push('дополнительная работа');
    if (q.zamena) b.push('замена');
    const x = istisno.get(q.id);
    if (x) b.push(`исключено из остатка: ${x.asos}${x.sabab ? `; ${x.sabab}` : ''}`);
    if (farq != null && farq > 0) b.push('выполнено сверх сметы');
    else if (farq != null && farq < 0) b.push(fakt === 0 ? 'не выполнено' : 'выполнено не полностью');
    if (smeta === 0 && !x && !(fakt ?? 0)) b.push('объем по смете 0');
    return b.join('; ');
  };

  const olchov = (q: T2Qator) => {
    const h = holat.get(q.id);
    // Asl smeta o'zgarmaydi (egasi): smetada yo'q qo'shimcha ish (svod bo'limidan tashqari) — smeta hajmi 0, hajmi/summasi faqat fakt va Ф-2 tomonda.
    const smeta = q.qoshimcha && !lumpOstida(q) ? 0 : q.hajm ?? null;
    // Fakt hajmi yozilganidek (egasi): F2 dan hech narsa chiqarilmaydi, fakt < F2 — normal. NULL — NULL (0 emas).
    const fakt = h?.fakt_hajm == null ? null : Number(h.fakt_hajm);
    const f2Hajm = h ? Number(h.f2_hajm ?? 0) : 0;
    const f2Summa = h ? Number(h.f2_summa ?? 0) : 0;
    const f2HajmV = h?.f2_hajm == null ? null : Number(h.f2_hajm);
    const f2SummaV = h?.f2_summa == null ? null : Number(h.f2_summa);
    // NARX qoidasi (yadro `faktSummaF2Narxda`): tasdiqlangan F2 bor qatorda fakt summasi F2 birlik narxida.
    const asl = qatorSumma(fakt, q.narx ?? null);
    const yoq = h?.f2_summa_yoq == null ? null : Number(h.f2_summa_yoq);
    let r = faktSummaF2Narxda(fakt, f2HajmV, f2SummaV, asl, yoq);
    // Server fakt summasi (t2_qator_holat.fakt_summa) — hujjat server bilan tiyinigacha: smeta narxi yo'q/0 yoki F-2 hajmi bor-u summasi
    // yozilmagan qatorlarda hajm × narx serverdan farq qiladi; shunda summa serverniki, fakt narxi = summa / hajm (izohda «по сумме факта»).
    let faktServerdan = false;
    const srv = h?.fakt_summa == null ? null : Number(h.fakt_summa);
    if (srv != null && Number.isFinite(srv) && ((q.narx ?? 0) === 0 || (yoq != null && yoq > 0)) && r.manba === 'fakt' && (r.summa == null || Math.abs(r.summa - srv) > 0.005)) {
      r = { summa: yaxlit2(srv), manba: 'fakt', narx: null }; faktServerdan = true;
    }
    const farq = smeta == null || fakt == null ? null : nol(fakt - smeta);
    return { h, smeta, fakt, faktSumma: r.summa, faktServerdan,
      // Izoh faqat F2 narxi summani o'zgartirganda (F2 narxi = smeta narxi bo'lsa shovqin yo'q).
      f2Narxda: r.manba === 'f2' && (r.summa == null ? asl != null : asl == null || Math.abs(r.summa - asl) > 0.005), farq, f2Hajm, f2Summa, f2SummaV };
  };  const qayta = (q: T2Qator, daraja: number, blNo: string | null, k: number, otaIdx: number | null = null): number | null => {
    const tur = q.tur ?? '';
    const kids = bolalar.get(q.id) ?? [];
    if (BARG.has(tur) || (tur === 'bl' && !kids.length)) {
      const { smeta, fakt, faktSumma, faktServerdan, f2Narxda, farq, f2Hajm, f2Summa, f2SummaV } = olchov(q);
      const faktNarxIzoh = faktServerdan ? `по сумме факта (расчёт сервера)${fakt ? `: цена факта ${yaxlit2((faktSumma ?? 0) / fakt)}` : ''}` : '';
      if (o.faqatFarq && farq === 0 && q.narx != null) return null;
      const narx = q.narx ?? null;
      const smetaSumma = qatorSumma(smeta, narx);
      // Отклонение SUMMA = I − G (fakt summasi F2 narxida − smeta summasi) — qator ichida izchil.
      const farqSumma = faktSumma == null || smetaSumma == null ? null : yaxlit2(faktSumma - smetaSumma);
      const f2Nomalum = f2SummaV == null;
      const sabab = [smeta == null ? 'нет количества по смете' : '', fakt == null ? 'нет данных о выполнении' : '', narxBildirishnomaKerak(q, narx) ? 'нет сметной цены — строка не включена в сумму' : '',
        f2Nomalum && fakt != null ? 'сумма по Ф-2 не определена' : ''].filter(Boolean);
      if (sabab.length) diqqat.push({ nom: `${q.nom ?? ''}${q.birlik ? `, ${q.birlik}` : ''}`, sabab: sabab.join('; '), joy: yolOf(q) || undefined });
      barglar++;
      if (farq != null && farq > 0) ortiq++;
      if (farq != null && farq < 0) kam++;
      const doplataSumma = faktSumma == null || f2Nomalum ? null : yaxlit2(faktSumma - f2Summa);
      const doplataHajm = fakt == null ? null : nol(Number((fakt - f2Hajm).toPrecision(12)));
      const nomalum = (smetaSumma == null || faktSumma == null || farqSumma == null || doplataSumma == null) && !(narx == null && mashinistMehnati(q)) ? 1 : 0;
      out.push({
        id: q.id, tur: 'barg', daraja, tartib: blNo ? `${blNo}.${k}` : String(++no), kod: q.kod ?? '', nom: q.nom ?? '', birlik: q.birlik ?? '',
        smetaHajm: smeta, narx, smetaSumma, faktHajm: fakt, faktSumma, f2Hajm, f2Summa, farqHajm: farq, farqSumma, doplataHajm, doplataSumma,
        izoh: [izohOf(q, smeta, fakt, farq), f2Narxda ? 'сумма факта — по цене утвержденной Ф-2' : '', faktNarxIzoh].filter(Boolean).join('; '),
        nomalum, kat: q.kat ?? null, bolalar: [], ...(faktServerdan ? { faktServerdan: true } : {}), ...(q.qoshimcha ? { qoshimcha: true } : {}), ...(q.zamena ? { zamena: true } : {}), ...(q.tur === 'rs' || q.tur === 'mat' || q.tur === 'ob' ? { resTur: q.tur } : {}), norma: q.norma ?? null, otaIdx, f2Narxda: f2Narxda || undefined, f2SummaNomalum: f2Nomalum || undefined,
        ...(q.zamena && q.replaces_line_id != null ? { almashtiradiId: q.replaces_line_id } : {}),
        ...(q.qoshimcha && !lumpOstida(q) ? { rejaSumma: qatorSumma(q.hajm ?? null, narx) } : {}),
      });
      return out.length - 1;
    }
    if (tur === 'bl') {
      const idx = out.length;
      const { smeta, fakt, farq, f2Hajm } = olchov(q);
      const nomer = String(++no);
      out.push({
        id: q.id, tur: 'bl', daraja, tartib: nomer, kod: q.kod ?? '', nom: q.nom ?? '', birlik: q.birlik ?? '',
        smetaHajm: smeta, narx: null, smetaSumma: null, faktHajm: fakt, faktSumma: null, f2Hajm, f2Summa: 0,
        farqHajm: farq, farqSumma: null, doplataHajm: fakt == null ? null : nol(Number((fakt - f2Hajm).toPrecision(12))), doplataSumma: null, izoh: izohOf(q, smeta, fakt, farq), nomalum: 0, bolalar: [],
        ...(q.qoshimcha ? { qoshimcha: true } : {}), ...(q.zamena ? { zamena: true } : {}),
        ...(q.zamena && q.replaces_line_id != null ? { almashtiradiId: q.replaces_line_id } : {}),
      });
      const b: number[] = [];
      let kk = 0;
      for (const c of kids) { const i = qayta(c, daraja + 1, nomer, kk + 1, idx); if (i != null) { b.push(i); kk++; } }
      if (!b.length && o.faqatFarq && (farq === 0)) { out.length = idx; no--; return null; }
      yigindi(out[idx], b);
      return idx;
    }
    const idx = out.length;
    out.push({ id: q.id, tur: 'rz', daraja, tartib: '', kod: '', nom: q.nom ?? '', birlik: '', smetaHajm: null, narx: null, smetaSumma: null, faktHajm: null, faktSumma: null, f2Hajm: 0, f2Summa: 0, farqHajm: null, farqSumma: null, doplataHajm: null, doplataSumma: null, izoh: '', nomalum: 0, bolalar: [] });
    const b: number[] = [];
    for (const c of kids) { const i = qayta(c, daraja + 1, null, 0); if (i != null) b.push(i); }
    if (!b.length) { out.length = idx; return null; }
    const it: SlichitelniyQator = { id: q.id, tur: 'itogo', daraja, tartib: '', kod: '', nom: `ИТОГО ПО РАЗДЕЛУ: ${q.nom ?? ''}`, birlik: '', smetaHajm: null, narx: null, smetaSumma: null, faktHajm: null, faktSumma: null, f2Hajm: 0, f2Summa: 0, farqHajm: null, farqSumma: null, doplataHajm: null, doplataSumma: null, izoh: '', nomalum: 0, bolalar: [] };
    yigindi(it, b);
    out.push(it);
    return out.length - 1;
  };
  function yigindi(r: SlichitelniyQator, b: number[]) {
    r.bolalar = b;
    r.nomalum = b.reduce((s, i) => s + out[i].nomalum, 0);
    // Egasi qoidasi (2026-10-08): summa har doim ko'rinadi — narxsiz barg faqat o'zi bo'sh, bildirishnoma alohida.
    const s = (f: (x: SlichitelniyQator) => number | null) => yigindi2(b.map((i) => f(out[i])));
    r.smetaSumma = s((x) => x.smetaSumma);
    r.faktSumma = s((x) => x.faktSumma);
    r.farqSumma = s((x) => x.farqSumma);
    r.doplataSumma = s((x) => x.doplataSumma);
    r.f2Summa = yaxlit2(b.reduce((t, i) => t + out[i].f2Summa, 0));
  }

  const ildizlar: number[] = [];
  for (const q of bolalar.get(null) ?? []) { const i = qayta(q, 0, null, 0); if (i != null) ildizlar.push(i); }
  // Svod yaxlit (egasi): bo'lim SMETASI = yaxlit summa, qatorlarga tiyingacha taqsim (Σ aynan). FAKT taqsimlanmaydi: qator ichida
  // hajm × narx = summa saqlanadi, fakt va Ф-2 bir xil (to'g'ri narx, Ф-2 usuli); otklonenie = fakt − smeta. Filtrlangan ro'yxatda (faqatFarq) taqsim yo'q.
  if (o.svodYaxlit?.bolimlar?.length && !o.faqatFarq) {
    for (const b of o.svodYaxlit.bolimlar) {
      const leaves = bolimBarglari(out, Number(b.qator_id));
      if (!leaves?.length) continue;
      const lump = Number(b.qqssiz);
      // Noma'lum (null) smetali qatorlar taqsimga kirmaydi va null qoladi (0 emas).
      const G = yaxlitQatorlarga(lump, leaves.map((i) => ({ id: i, summa: out[i].smetaSumma })));
      if (!G) continue;
      for (const i of leaves) {
        const r = out[i];
        r.smetaSumma = G.get(i) ?? null;
        r.faktTogri = r.faktSumma;
        r.farqSumma = r.faktSumma == null || r.smetaSumma == null ? null : yaxlit2(r.faktSumma - r.smetaSumma);
        r.yaxlitTaqsim = Number(b.qator_id);
      }
    }
    const qayt = (i: number) => { const r = out[i]; if (r.tur === 'barg' || !r.bolalar.length) return; r.bolalar.forEach(qayt); yigindi(r, r.bolalar); };
    out.forEach((r, i) => { if (r.tur === 'itogo' || r.tur === 'bl') qayt(i); });
  }
  // Zamena juftlari: yangi qator «взамен поз. N», asl qator «исключается (заменена поз. M)». Asl qator fakti 0 bo'lmasa — diqqatda (NULL ≠ 0 qoidasi: jim o'tmaydi).
  const outOf = new Map<number, number>();
  out.forEach((r, i) => { if (r.tur !== 'itogo' && !outOf.has(r.id)) outOf.set(r.id, i); });
  out.forEach((r) => {
    if (r.almashtiradiId == null) return;
    const ai = outOf.get(r.almashtiradiId);
    if (ai == null) return;
    const asl = out[ai];
    (asl.almashtirilganIdlar ??= []).push(r.id);
    r.izoh = [r.izoh, `взамен поз. ${asl.tartib}`].filter(Boolean).join('; ');
  });
  for (const r of out) {
    if (!r.almashtirilganIdlar?.length) continue;
    const yangi = r.almashtirilganIdlar.map((id) => out[outOf.get(id)!]?.tartib).filter(Boolean).join(', ');
    r.izoh = [r.izoh, `исключается (заменена поз. ${yangi})`].filter(Boolean).join('; ');
    if ((r.faktHajm ?? 0) !== 0) diqqat.push({ nom: `${r.nom}${r.birlik ? `, ${r.birlik}` : ''}`, sabab: 'заменяемая позиция («исключается»): факт не равен 0 — проверить, не выполнена ли она частично', joy: r.tartib ? `поз. ${r.tartib}` : undefined });
  }
  const nomalum = ildizlar.reduce((s, i) => s + out[i].nomalum, 0);
  const js = (f: (x: SlichitelniyQator) => number | null) => (!ildizlar.length ? null : yigindi2(ildizlar.map((i) => f(out[i]))));
  const lar = out.filter((r) => r.tur === 'barg');
  // «К доплате» / «к снятию» yig'indisi: oddiy qatorda — qator bo'yicha; svod (yaxlit) bo'limida — BO'LIM bo'yicha sof farq (bo'lim bitta summa:
  // Ф-2 qayta yozilganda ichki tarkib o'zgaradi, qator ichidagi + va − bir-birini qoplaydi). Sof farq bo'limning birinchi qatoriga qo'yiladi.
  const guruh = svodGuruhlari(out);
  for (const r of lar) { const d = r.doplataSumma; r.doplataPlus = d != null && d > 0 ? d : null; r.doplataMinus = d != null && d < 0 ? d : null; }
  for (const idx of guruh.values()) {
    const net = yigindi2(idx.map((i) => out[i].doplataSumma)) ?? 0;
    idx.forEach((i, k) => { out[i].doplataPlus = k === 0 && net > 0 ? net : 0; out[i].doplataMinus = k === 0 && net < 0 ? net : 0; });
  }
  const pereraschet: SlichitelniyPereraschet = {
    doplata: yigindi2(lar.map((r) => r.doplataPlus ?? null)) ?? 0,
    snyatie: yigindi2(lar.map((r) => r.doplataMinus ?? null)) ?? 0,
    net: js((x) => x.doplataSumma) ?? 0,
    nomalum,
  };
  return {
    qatorlar: out, ildizlar, diqqat, barglar, ortiq, kam, pereraschet,
    jami: { smeta: js((x) => x.smetaSumma), fakt: js((x) => x.faktSumma), farq: js((x) => x.farqSumma), f2: yaxlit2(ildizlar.reduce((t, i) => t + out[i].f2Summa, 0)) },
  };
}

export type OzgarishQism = { reja: number; fakt: number; f2: number; doplata: number; soni: number };
/** «Смета до изменений → замена → дополнительные работы → смета после изменений» (прямые затраты, svod bo'limlarisiz). Asl smeta o'zgarmaydi: o'zgarishlar alohida qatlam. */
export type SlichitelniyOzgarishSvodi = { asl: OzgarishQism; istisno: OzgarishQism; zamena: OzgarishQism; qoshimcha: OzgarishQism; keyin: OzgarishQism };

export function ozgarishSvodi(model: SlichitelniyModel): SlichitelniyOzgarishSvodi {
  const q = model.qatorlar;
  const ota = new Map<number, number>();
  q.forEach((r, i) => r.bolalar.forEach((k) => ota.set(k, i)));
  const yuqori = (i: number, f: (r: SlichitelniyQator) => boolean): boolean => { for (let p: number | undefined = i, n = 0; p != null && n < 64; p = ota.get(p), n++) if (f(q[p])) return true; return false; };
  const bosh = (): OzgarishQism => ({ reja: 0, fakt: 0, f2: 0, doplata: 0, soni: 0 });
  const asl = bosh(), istisno = bosh(), zamena = bosh(), qoshimcha = bosh();
  q.forEach((r, i) => {
    if (r.tur !== 'barg' || r.yaxlitTaqsim != null) return;
    const z = yuqori(i, (x) => !!x.zamena);
    const qo = !z && yuqori(i, (x) => !!x.qoshimcha);
    const t = z ? zamena : qo ? qoshimcha : asl;
    t.reja += z || qo ? r.rejaSumma ?? 0 : r.smetaSumma ?? 0;
    t.fakt += r.faktSumma ?? 0; t.f2 += r.f2Summa; t.doplata += r.doplataSumma ?? 0; t.soni++;
    if (!z && !qo && yuqori(i, (x) => !!x.almashtirilganIdlar?.length)) { istisno.reja -= r.smetaSumma ?? 0; istisno.soni++; }
  });
  const keyin: OzgarishQism = {
    reja: asl.reja + istisno.reja + zamena.reja + qoshimcha.reja, fakt: asl.fakt + zamena.fakt + qoshimcha.fakt, f2: asl.f2 + zamena.f2 + qoshimcha.f2,
    doplata: asl.doplata + zamena.doplata + qoshimcha.doplata, soni: asl.soni + zamena.soni + qoshimcha.soni,
  };
  const yu = (x: OzgarishQism): OzgarishQism => ({ reja: yaxlit2(x.reja), fakt: yaxlit2(x.fakt), f2: yaxlit2(x.f2), doplata: yaxlit2(x.doplata), soni: x.soni });
  return { asl: yu(asl), istisno: yu(istisno), zamena: yu(zamena), qoshimcha: yu(qoshimcha), keyin: yu(keyin) };
}

const PERER_GURUH = 'ПЕРЕРАСЧЕТ: К ДОПЛАТЕ (+) / К СНЯТИЮ (−) (ФАКТ − ПРЕДЪЯВЛЕНО ПО Ф-2)';
const PERER_KO_GURUH = 'ПЕРЕРАСЧЕТ К ОПЛАТЕ (с накладными расходами и НДС)';
const SVOD_VARAQ = 'Свод изменений';
const ASOSIY_VARAQ = 'Сличительная ведомость';

const USTUNLAR: RasmiyUstun[] = [
  { sarlavha: '№ п/п', kenglik: 7, tur: 'tartib' },
  { sarlavha: 'Шифр, код', kenglik: 13, tur: 'kod' },
  { sarlavha: 'Наименование работ и затрат', kenglik: 40, tur: 'matn' },
  { sarlavha: 'Ед. изм.', kenglik: 8, tur: 'birlik' },
  { sarlavha: 'кол-во', kenglik: 13, tur: 'hajm', guruh: 'ПО СМЕТЕ' },
  { sarlavha: 'цена за ед., сум', kenglik: 16, tur: 'narx', guruh: 'ПО СМЕТЕ' },
  { sarlavha: 'сумма, сум', kenglik: 19, tur: 'pul', guruh: 'ПО СМЕТЕ' },
  { sarlavha: 'кол-во', kenglik: 13, tur: 'hajm', guruh: 'ФАКТИЧЕСКИ ВЫПОЛНЕНО' },
  { sarlavha: 'сумма, сум', kenglik: 19, tur: 'pul', guruh: 'ФАКТИЧЕСКИ ВЫПОЛНЕНО' },
  { sarlavha: 'кол-во', kenglik: 13, tur: 'hajm', guruh: 'РАНЕЕ ПРЕДЪЯВЛЕНО ПО Ф-2 (утвержденные акты)' },
  { sarlavha: 'сумма, сум', kenglik: 19, tur: 'pul', guruh: 'РАНЕЕ ПРЕДЪЯВЛЕНО ПО Ф-2 (утвержденные акты)' },
  { sarlavha: 'кол-во (+/−)', kenglik: 13, tur: 'hajm', guruh: 'ОТКЛОНЕНИЕ (ФАКТ − СМЕТА)' },
  { sarlavha: 'сумма, сум', kenglik: 19, tur: 'pul', guruh: 'ОТКЛОНЕНИЕ (ФАКТ − СМЕТА)' },
  { sarlavha: 'Примечание', kenglik: 26, tur: 'matn' },
  // Yashirin texnik ustun: noma'lum pul pozitsiyalari soni (jamini bo'sh qoldirish uchun).
  { sarlavha: 'Н', kenglik: 4, tur: 'texnik', yashirin: true },
  { sarlavha: 'выполнено, сум', kenglik: 19, tur: 'pul', guruh: 'К ОПЛАТЕ (с накладными расходами и НДС)' },
  { sarlavha: 'отклонение, сум', kenglik: 19, tur: 'pul', guruh: 'К ОПЛАТЕ (с накладными расходами и НДС)' },
  { sarlavha: 'Кат.', kenglik: 6, tur: 'texnik', yashirin: true },
  // PERERASCHET: fakt − ilgari Ф-2 da predyavlen (tasdiqlangan Ф-2 lar yig'indisi, tuzatish/storno aktlari ishorasi bilan).
  { sarlavha: 'кол-во (+/−)', kenglik: 13, tur: 'hajm', guruh: PERER_GURUH },
  { sarlavha: 'сумма, сум', kenglik: 19, tur: 'pul', guruh: PERER_GURUH },
  { sarlavha: 'смета, сум', kenglik: 19, tur: 'pul', guruh: PERER_KO_GURUH },
  { sarlavha: 'принято Ф-2, сум', kenglik: 19, tur: 'pul', guruh: PERER_KO_GURUH },
  { sarlavha: 'к доплате (+) / к снятию (−), сум', kenglik: 21, tur: 'pul', guruh: PERER_KO_GURUH },
  // Texnik (yashirin) ustunlar: faqat barg qatorida — bo'lim bo'yicha «к доплате» / «к снятию» ni ajratish (Свод изменений).
  { sarlavha: 'Д+', kenglik: 15, tur: 'pul', yashirin: true },
  { sarlavha: 'С−', kenglik: 15, tur: 'pul', yashirin: true },
  { sarlavha: 'Д+ ко', kenglik: 15, tur: 'pul', yashirin: true },
  { sarlavha: 'С− ко', kenglik: 15, tur: 'pul', yashirin: true },
  // Ф-2 podval toifasi: svod bo'limidagi ЧЕЛ/МАШ qatorlari Ф-2 da yaxlit emas, ustama bilan (server `_t2_summa_agg_v1`: ustama_bor).
  { sarlavha: 'Кат. Ф-2', kenglik: 6, tur: 'texnik', yashirin: true },
  { sarlavha: 'Факт (расчет)', kenglik: 15, tur: 'pul', yashirin: true },
  { sarlavha: 'Откл. (расчет)', kenglik: 15, tur: 'pul', yashirin: true },
];
// A№ B kod C nom D ed E smHajm F narx G smSumma H faktHajm I faktSumma J f2Hajm K f2Summa L farqHajm M farqSumma N izoh O nomalum
// P faktKOplate Q farqKOplate R kat(yashirin) S doplataHajm T doplataSumma U smetaKO V f2KO W doplataKO X Д+ Y С− Z Д+KO AA С−KO

/** Сличительная ведомость (.xlsx). */
export function slichitelniyHujjatXlsx(model: SlichitelniyModel, o: SlichitelniyOpsiya): { bytes: Uint8Array; faylNomi: string; kOplata: { fakt: number | null; farq: number | null; doplata: number | null } } {
  const sana = o.sana ?? bugunSana();
  const sanaRu = sana.split('-').reverse().join('.');
  const v = new RasmiyVaraq({
    nom: ASOSIY_VARAQ,
    sarlavha: 'СЛИЧИТЕЛЬНАЯ ВЕДОМОСТЬ',
    ostSarlavha: [`объемов работ по смете и фактически выполненных, с перерасчетом по ранее предъявленным актам Ф-2, по состоянию на ${sanaRu}${o.faqatFarq ? ' (позиции с отклонениями)' : ''}`],
    titul: [
      ['Объект:', o.obyektNomi],
      ['Заказчик:', o.imzo?.zakazchik],
      ['Подрядчик:', o.imzo?.pudratchi],
      ['Основание:', 'ведомость объемов работ и ресурсов (ЛРВ) объекта; выполнение — по учтенным актам факта; предъявлено — по утвержденным актам формы № 2 (с учетом корректирующих актов)'],
    ],
    ustunlar: USTUNLAR,
    yonalish: 'landscape',
  });
  const bosh = v.malumotBoshi;
  const rowOf = (i: number) => bosh + i;
  const qiy = (x: number | null): Qiymat => (x == null ? null : x);
  const sumKid = (q: SlichitelniyQator, col: string) => sumRefs(col, q.bolalar.map(rowOf));
  const pulYig = (q: SlichitelniyQator, col: string, val: number | null, n: number): Qiymat =>
    (q.bolalar.length ? { f: sumKid(q, col), v: val ?? 0 } : null);
  // Ikki narx: P = ROUND(I × Kf), Q = ROUND(M × Kf); podval ВСЕГО dan keyin.
  const nk: Partial<NakrutkaKoeffitsientlar> = { ...(o.nakrutka ?? {}) };
  nk.НДС = o.ndsFoiz ?? nk.НДС ?? NDS_SUKUT_FOIZ;
  // Foizlar faqat podvaldan (server meros rejimi); noma'lum — к оплате bo'sh, 0 emas.
  const podval = o.podval ? serverMerosKoefQoy(o.podval, nk, o.nkManba) : null;
  const kfJS = kategoriyaKf(nk, podval);
  const ndsFoiz = podvalNdsFoiz(podval, nk);
  const yax = (q: SlichitelniyQator) => q.tur === 'barg' && (!!o.yaxlitIdlar?.has(q.id) || q.yaxlitTaqsim != null);
  const yaxlitBor = model.qatorlar.some(yax);
  // Kategoriyasi ko'rsatilmagan barglar: ustamasiz, faqat QQS; podvalda alohida qator (summa yashirilmaydi).
  const katsizmi = (q: SlichitelniyQator) => q.tur === 'barg' && !yax(q) && !nakrutkaKat(q.kat);
  const nomalumQ: Record<string, number> = { G: 0, I: 0, K: 0, M: 0, T: 0 };
  for (const q of model.qatorlar.filter(katsizmi)) { nomalumQ.G += q.smetaSumma ?? 0; nomalumQ.I += q.faktSumma ?? 0; nomalumQ.K += q.f2Summa; nomalumQ.M += q.farqSumma ?? 0; nomalumQ.T += q.doplataSumma ?? 0; }
  const nomalumBor = Object.values(nomalumQ).some((x) => Math.abs(x) >= 0.005);
  const kfQ = podvalKfQatorlari(bosh + model.qatorlar.length + 2, podval, yaxlitBor, nomalumBor);
  const ndsQ = podvalQatorRaqami(bosh + model.qatorlar.length + 2, podval, 'nds', yaxlitBor, nomalumBor);
  const yaxKf = ndsQ != null ? `(1+F${ndsQ}/100)` : '1';
  // SERVER QOIDASI (Ф-2 o'lchovi): svod bo'limi ichidagi pudratchi mehnati (ЧЕЛ/МАШ) yaxlit emas — Ф-2 da u oddiy ustama kaskadiga kiradi,
  // qolgan svod qatorlari Ф-2 da to'g'ri narxda × (1+НДС). Fakt va smeta bu istisnosiz (svod bo'yicha taqsim).
  const f2Ustamali = (q: SlichitelniyQator): boolean => { const k = nakrutkaKat(q.kat); return q.tur === 'barg' && yax(q) && (k === 'ЧЕЛ' || k === 'МАШ'); };
  // Taqsimlangan svod qatorlari к оплате (egasi 2026-10-30): bo'lim svod summasi QQS BILAN (yakuniy) qatorlarga taqsimlanadi —
  // P (выполнено) = svod × (fakt / smeta) taqsimi, Q = P − svod taqsimi; Σ aynan. Svod ma'lumoti yo'q — ×(1+QQS) taqsim.
  const bolimOf = new Map((o.svodYaxlit?.bolimlar ?? []).map((b) => [Number(b.qator_id), b]));
  const koTaqsim = new Map<string, number>();
  {
    // Faqat SMETA taqsimlanadi (svod summasi QQS bilan). Выполнено (P) taqsimlanmaydi: fakt va Ф-2 server qoidasi bilan bir xil
    // hisoblanadi (ЧЕЛ/МАШ — ustama kaskadi, qolgani to'g'ri narx × (1+НДС)) — `faktTogri`.
    const guruh = new Map<number, Map<number, number>>();
    model.qatorlar.forEach((q, i) => { if (q.yaxlitTaqsim == null || q.smetaSumma == null) return; const g = guruh.get(q.yaxlitTaqsim) ?? new Map<number, number>(); g.set(i, q.smetaSumma); guruh.set(q.yaxlitTaqsim, g); });
    for (const [bid, g] of guruh) {
      const b = bolimOf.get(bid);
      const qb = b ? bolimQqsBilan(b, ndsFoiz) : null;
      const Gk = qb == null ? yaxlitKOplateTaqsim(g, ndsFoiz) : yaxlitQatorlarga(qb, [...g].map(([id, summa]) => ({ id, summa })));
      if (!Gk) continue;
      for (const [i, gv] of Gk) koTaqsim.set(`${i}G`, gv);
    }
  }  const koMemo = new Map<string, number | null>();
  type KoUstun = 'P' | 'Q' | 'U' | 'V' | 'W';
  const koOf = (i: number, c: KoUstun): number | null => {
    const key = `${i}${c}`;
    if (koMemo.has(key)) return koMemo.get(key)!;
    const q = model.qatorlar[i];
    let val: number | null;
    if (q.tur === 'barg') {
      const kat = nakrutkaKat(q.kat);
      const ko = (summa: number | null) => kOplate(summa, kat, kfJS, yax(q), ndsFoiz);
      const koF2 = (summa: number | null) => kOplate(summa, kat, kfJS, yax(q) && !f2Ustamali(q), ndsFoiz);
      // U — smeta, V — ilgari Ф-2 (summasi noma'lum bo'lsa NULL), W = P − V (fakt к оплате − Ф-2 к оплате; + к доплате, − к снятию).
      if (c === 'U') val = koTaqsim.has(`${i}G`) ? koTaqsim.get(`${i}G`)! : ko(q.smetaSumma);
      else if (c === 'V') val = koF2(q.f2SummaNomalum ? null : q.f2Summa);
      else if (c === 'W' && q.yaxlitTaqsim != null) val = koF2(q.doplataSumma); // svod bo'limi: to'g'ri narxdagi fakt − Ф-2, QQS bilan
      else if (c === 'W') { const p = koOf(i, 'P'), f = koOf(i, 'V'); val = p == null || f == null ? null : yaxlit2(p - f); }
      else if (yax(q) && c === 'P') val = koF2(q.faktTogri !== undefined ? q.faktTogri : q.faktSumma); // fakt = Ф-2 usuli (server qoidasi)
      else if (yax(q) && c === 'Q') { const p = koOf(i, 'P'), u = koOf(i, 'U'); val = p == null || u == null ? null : yaxlit2(p - u); }
      else val = ko(c === 'P' ? q.faktSumma : q.farqSumma);
    }
    else if (q.tur === 'rz') val = null;
    // Yig'indi qatori: Excel SUM kabi — noma'lum (bo'sh) bolalar o'tkazib yuboriladi (kesh = formula); to'liqsizlik «ТРЕБУЮТ ВНИМАНИЯ» da.
    else { const vs = q.bolalar.map((k) => koOf(k, c)); val = !vs.length ? null : yaxlit2(vs.reduce<number>((a2, b2) => a2 + (b2 ?? 0), 0)); }
    koMemo.set(key, val);
    return val;
  };
  const koYig = (idx: readonly number[], c: KoUstun): Qiymat => {
    if (!idx.length) return null;
    const rows = idx.map(rowOf);
    const vs = idx.map((k) => koOf(k, c));
    return { f: sumRefs(c, rows), v: yaxlit2(vs.reduce<number>((a2, b2) => a2 + (b2 ?? 0), 0)) };
  };
  const svodG = svodGuruhlari(model.qatorlar);
  /** «К доплате» / «к снятию» к оплате (W) ulushi: oddiy qator — o'z ishorasi; svod bo'limi — bo'lim sofi birinchi qatorda, qolganlarda 0. */
  const koPM = (i: number): [number | null, number | null] => {
    const q = model.qatorlar[i];
    if (q.tur !== 'barg') return [null, null];
    const g = q.yaxlitTaqsim != null ? svodG.get(q.yaxlitTaqsim) : undefined;
    if (!g) { const x = koOf(i, 'W'); return [x != null && x > 0 ? x : null, x != null && x < 0 ? x : null]; }
    if (g[0] !== i) return [0, 0];
    const net = yaxlit2(g.reduce((s, k) => s + (koOf(k, 'W') ?? 0), 0));
    return [net > 0 ? net : 0, net < 0 ? net : 0];
  };
  /** Pereraschet kataklari (S..AA) barg qatorida: fakt − Ф-2; к оплате (смета, Ф-2, доплата); yashirin Д+/С− (Свод изменений uchun). */
  const perBarg = (q: SlichitelniyQator, i: number, n: number): Qiymat[] => {
    const kat = nakrutkaKat(q.kat);
    const yaxlitQqs = yax(q) || !kat;
    const kx: string | null = yaxlitQqs ? (ndsQ == null || ndsFoiz == null ? null : yaxKf) : kfJS[kat!] == null ? null : `F${kfQ[kat!]}`;
    const kxF2: string | null = f2Ustamali(q) ? (kat == null || kfJS[kat] == null ? null : `F${kfQ[kat]}`) : kx;
    const sg = (c: 'T' | 'W', f: (s: number) => number, rf: string): Qiymat => ({ f: `IF(${c}${n}="","",${rf}(${c}${n},0))`, v: (() => { const x = c === 'T' ? q.doplataSumma : koOf(i, 'W'); return x == null ? '' : f(x); })() });
    const grp = q.yaxlitTaqsim != null ? svodG.get(q.yaxlitTaqsim) : undefined;
    // Svod bo'limi: Д+/С− — bo'lim sof farqi (birinchi qatorda MAX/MIN(SUM(bo'lim qatorlari),0)), qolgan qatorlarda 0.
    const pm = (c: 'T' | 'W', mx: boolean): Qiymat => {
      if (!grp) return sg(c, mx ? (x) => Math.max(x, 0) : (x) => Math.min(x, 0), mx ? 'MAX' : 'MIN');
      if (grp[0] !== i) return 0;
      return { f: `${mx ? 'MAX' : 'MIN'}(${sumRefs(c, grp.map(rowOf))},0)`, v: (c === 'T' ? (mx ? q.doplataPlus : q.doplataMinus) : koPM(i)[mx ? 0 : 1]) ?? 0 };
    };
    return [
      { f: `IF(H${n}="","",ROUND(H${n}-J${n},6))`, v: q.doplataHajm ?? '' },
      q.yaxlitTaqsim != null ? qiy(q.doplataSumma) : { f: `IF(OR(I${n}="",K${n}=""),"",ROUND(I${n}-K${n},2))`, v: q.doplataSumma ?? '' },
      koTaqsim.has(`${i}G`) ? koTaqsim.get(`${i}G`)! : kx == null ? null : { f: `IF(G${n}="","",ROUND(G${n}*${kx},2))`, v: koOf(i, 'U') ?? '' },
      kxF2 == null ? null : { f: `IF(K${n}="","",ROUND(K${n}*${kxF2},2))`, v: koOf(i, 'V') ?? '' },
      kxF2 == null ? null : q.yaxlitTaqsim != null ? { f: `IF(T${n}="","",ROUND(T${n}*${kxF2},2))`, v: koOf(i, 'W') ?? '' } : { f: `IF(OR(P${n}="",V${n}=""),"",ROUND(P${n}-V${n},2))`, v: koOf(i, 'W') ?? '' },
      pm('T', true), pm('T', false),
      kxF2 == null ? null : pm('W', true), kxF2 == null ? null : pm('W', false),
      // Ф-2 podval toifasi (yashirin): svod bo'limidagi ЧЕЛ/МАШ — o'z toifasi, qolgan svod — «СВОД», qolgani — oddiy toifa.
      f2Ustamali(q) ? kat : yax(q) ? YAXLIT_KAT : kat ?? NOMALUM_KAT,
      // Podval hisobi uchun yashirin: fakt va og'ish — Ф-2 usulida (svod qatorlarida taqsimlanmagan, to'g'ri narxda).
      yax(q) ? qiy(q.faktTogri !== undefined ? q.faktTogri : q.faktSumma) : { f: `IF(I${n}="","",I${n})`, v: q.faktSumma ?? '' },
      yax(q) ? qiy(f2Ustamali(q) ? (q.faktTogri !== undefined ? q.faktTogri : q.faktSumma) : q.farqSumma) : { f: `IF(M${n}="","",M${n})`, v: q.farqSumma ?? '' },
    ];
  };
  const katsiz: string[] = [];
  model.qatorlar.forEach((q, i) => {
    let r = 0;
    if (q.tur === 'rz') r = v.bolim(q.nom, { daraja: q.daraja });
    else if (q.tur === 'barg') {
      // Egasi 2026-09-30: tirik smeta — resurs hajmi = norma × ish hajmi (ish hajmi o'zgarsa resurs ham).
      const ota = q.otaIdx != null ? model.qatorlar[q.otaIdx] : undefined;
      // Formula faqat keshni aynan qaytarsa (ROUND(...,6)); bazadagi hajm 6 belgidan ortiq bo'lsa — Excel qayta hisoblaganda summa siljimasin, qiymat yoziladi.
      const normaF = q.norma != null && ota?.tur === 'bl' && ota.smetaHajm != null && q.smetaHajm != null
        && Math.abs(Math.round((q.norma * ota.smetaHajm + Number.EPSILON) * 1e6) / 1e6 - q.smetaHajm) < 5e-10;
      const us = bargUslubi(q.resTur);
      r = v.qator(us.tur, (n) => [
        q.tartib, q.kod, q.nom, q.birlik, normaF ? { f: `ROUND(${q.norma}*E${rowOf(q.otaIdx!)},6)`, v: q.smetaHajm! } : qiy(q.smetaHajm), qiy(q.narx),
        // Svod bo'limiga taqsimlangan qator: G — bo'lim yaxlit summasidan taqsim (qiymat); I (fakt) taqsimlanmaydi — formula.
        q.yaxlitTaqsim != null ? qiy(q.smetaSumma) : { f: `IF(OR(E${n}="",F${n}=""),"",ROUND(E${n}*F${n},2))`, v: q.smetaSumma ?? '' },
        qiy(q.faktHajm),
        // Narx qoidasi (yadro): F2 bor — ROUND(H × K / J); yo'q — ROUND(H × F). Kesh = formula.
        q.faktServerdan ? qiy(q.faktSumma) : { f: faktSummaF2NarxFormula(`H${n}`, `J${n}`, `K${n}`, `IF(OR(H${n}="",F${n}=""),"",ROUND(H${n}*F${n},2))`), v: q.faktSumma ?? '' },
        q.f2Hajm, q.f2SummaNomalum ? '' : q.f2Summa,
        { f: `IF(OR(E${n}="",H${n}=""),"",H${n}-E${n})`, v: q.farqHajm ?? '' },
        q.yaxlitTaqsim != null ? { f: `ROUND(I${n}-G${n},2)`, v: q.farqSumma ?? '' } : { f: `IF(OR(G${n}="",I${n}=""),"",ROUND(I${n}-G${n},2))`, v: q.farqSumma ?? '' },
        q.izoh || null,
        q.narx == null && mashinistMehnati(q) ? 0 : { f: `IF(OR(G${n}="",I${n}="",M${n}="",K${n}=""),1,0)`, v: q.nomalum },
        ...((): Qiymat[] => {
          // Svod yaxlit bo'limi: ustama yo'q, faqat QQS (к оплате = прямые × (1+НДС)).
          if (yax(q)) {
            // Svod bo'limi: fakt Ф-2 usulida (server qoidasi): ЧЕЛ/МАШ — ustama kaskadi, qolgani to'g'ri narx × (1+НДС); taqsimsiz.
            const kt = nakrutkaKat(q.kat);
            const kxP: string | null = f2Ustamali(q) ? (kt == null || kfJS[kt] == null ? null : `F${kfQ[kt]}`) : ndsQ == null || ndsFoiz == null ? null : yaxKf;
            return [kxP == null ? null : { f: `IF(AC${n}="","",ROUND(AC${n}*${kxP},2))`, v: koOf(i, 'P') ?? '' }, kxP == null ? null : { f: `IF(OR(P${n}="",U${n}=""),"",ROUND(P${n}-U${n},2))`, v: koOf(i, 'Q') ?? '' }, YAXLIT_KAT];
          }
          const kat = nakrutkaKat(q.kat);
          if (!kat) {
            katsiz.push(`${q.nom}${q.birlik ? `, ${q.birlik}` : ''}`);
            // Vid zatrat ko'rsatilmagan: ustamasiz, faqat QQS (server kabi); podvalda «ВИД ЗАТРАТ НЕ УКАЗАН» qatori.
            return ndsQ == null || ndsFoiz == null ? [null, null, NOMALUM_KAT] : [{ f: `IF(I${n}="","",ROUND(I${n}*${yaxKf},2))`, v: koOf(i, 'P') ?? '' }, { f: `IF(M${n}="","",ROUND(M${n}*${yaxKf},2))`, v: koOf(i, 'Q') ?? '' }, NOMALUM_KAT];
          }
          if (kfJS[kat] == null) return [null, null, kat]; // Kf noma'lum — bo'sh, formula yo'q
          return [{ f: `IF(I${n}="","",ROUND(I${n}*F${kfQ[kat]},2))`, v: koOf(i, 'P') ?? '' }, { f: `IF(M${n}="","",ROUND(M${n}*F${kfQ[kat]},2))`, v: koOf(i, 'Q') ?? '' }, kat];
        })(),
        ...perBarg(q, i, n),
      ], { daraja: q.daraja, rang: us.rang });
    } else if (q.tur === 'bl') {
      r = v.qator('ish', (n) => [
        q.tartib, q.kod, q.nom, q.birlik, qiy(q.smetaHajm), null,
        pulYig(q, 'G', q.smetaSumma, n),
        qiy(q.faktHajm),
        pulYig(q, 'I', q.faktSumma, n),
        q.f2Hajm, q.bolalar.length ? { f: sumKid(q, 'K'), v: q.f2Summa } : null,
        { f: `IF(OR(E${n}="",H${n}=""),"",H${n}-E${n})`, v: q.farqHajm ?? '' },
        pulYig(q, 'M', q.farqSumma, n),
        q.izoh || null,
        q.bolalar.length ? { f: sumKid(q, 'O'), v: q.nomalum } : 0,
        koYig(q.bolalar, 'P'), koYig(q.bolalar, 'Q'), null,
        { f: `IF(H${n}="","",ROUND(H${n}-J${n},6))`, v: q.doplataHajm ?? '' }, pulYig(q, 'T', q.doplataSumma, n),
        koYig(q.bolalar, 'U'), koYig(q.bolalar, 'V'), koYig(q.bolalar, 'W'), null, null, null, null,
      ], { daraja: q.daraja });
    } else {
      r = v.qator('jami', (n) => [
        null, null, q.nom, null, null, null,
        pulYig(q, 'G', q.smetaSumma, n), null, pulYig(q, 'I', q.faktSumma, n),
        null, { f: sumKid(q, 'K'), v: q.f2Summa }, null, pulYig(q, 'M', q.farqSumma, n), null,
        { f: sumKid(q, 'O'), v: q.nomalum },
        koYig(q.bolalar, 'P'), koYig(q.bolalar, 'Q'), null,
        null, pulYig(q, 'T', q.doplataSumma, n),
        koYig(q.bolalar, 'U'), koYig(q.bolalar, 'V'), koYig(q.bolalar, 'W'), null, null, null, null,
      ], { daraja: q.daraja });
    }
    if (r !== rowOf(i)) throw new Error('SLICHITELNIY_QATOR_SILJIDI');
  });
  /** Barglarning к оплате доплата/снятие (W) — ВСЕГО dagi Z/AA va Свод uchun. */
  const barglarKo: Array<[number | null, number | null]> = model.qatorlar.map((q, i) => (q.tur === 'barg' ? koPM(i) : [null, null]));
  if (model.ildizlar.length) {
    const nomalum = model.ildizlar.reduce((s, i) => s + model.qatorlar[i].nomalum, 0);
    const ref = (c: string) => sumRefs(c, model.ildizlar.map(rowOf));
    v.qator('vsego', (n) => [
      null, null, 'ВСЕГО ПО ОБЪЕКТУ', null, null, null,
      { f: ref('G'), v: model.jami.smeta ?? '' }, null,
      { f: ref('I'), v: model.jami.fakt ?? '' }, null,
      { f: ref('K'), v: model.jami.f2 }, null,
      { f: ref('M'), v: model.jami.farq ?? '' }, null,
      { f: ref('O'), v: nomalum },
      koYig(model.ildizlar, 'P'), koYig(model.ildizlar, 'Q'), null,
      null, { f: ref('T'), v: model.pereraschet.net },
      koYig(model.ildizlar, 'U'), koYig(model.ildizlar, 'V'), koYig(model.ildizlar, 'W'),
      { f: `SUM(X${bosh}:X${bosh + model.qatorlar.length - 1})`, v: model.pereraschet.doplata },
      { f: `SUM(Y${bosh}:Y${bosh + model.qatorlar.length - 1})`, v: model.pereraschet.snyatie },
      { f: `SUM(Z${bosh}:Z${bosh + model.qatorlar.length - 1})`, v: yigindi2(barglarKo.map((x) => x[0])) ?? 0 },
      { f: `SUM(AA${bosh}:AA${bosh + model.qatorlar.length - 1})`, v: yigindi2(barglarKo.map((x) => x[1])) ?? 0 },
    ]);
    // Nakrutka podvali (смета, выполнено, принято Ф-2, отклонение, к доплате) — к оплате.
    v.bosh();
    const katSummalar: Record<string, KatSummalar> = {};
    for (const c of ['G', 'I', 'K', 'M', 'T'] as const) {
      const ks = Object.fromEntries(NAKRUTKA_KATLAR.map((k) => [k, 0])) as KatSummalar;
      for (const q of model.qatorlar) {
        // Fakt/Ф-2 ustunlarida (I, K, M, T) svod bo'limidagi ЧЕЛ/МАШ qatorlari oddiy toifada (server qoidasi: fakt ham Ф-2 usulida).
        const kat = q.tur === 'barg' && (!yax(q) || (c !== 'G' && f2Ustamali(q))) ? nakrutkaKat(q.kat) : null;
        if (!kat) continue;
        const togri = q.faktTogri !== undefined ? q.faktTogri : q.faktSumma;
        const val = c === 'G' ? q.smetaSumma : c === 'I' ? (yax(q) ? togri : q.faktSumma) : c === 'K' ? q.f2Summa : c === 'M' ? (yax(q) ? togri : q.farqSumma) : q.doplataSumma;
        if (val != null) ks[kat] += val;
      }
      katSummalar[c] = ks;
    }
    // Svod yaxlit podval qatori — QQS BILAN (НДС dan keyin, aynan; egasi 2026-10-30): smeta ustuni — svod summasi;
    // выполнено — svod × (fakt / smeta) (taqsimlangan qatorlar «к оплате» yig'indisi); F2 — aynan × (1+QQS); отклонение = выполнено − smeta.
    let yaxlit: Record<string, number> | null = null;
    let yaxlitF: Record<string, string> | null = null;
    const [a1, b1] = [bosh, bosh + model.qatorlar.length - 1];
    const sumif = (kat: string, col: string, kritUstun = col === 'G' ? 'R' : 'AB', summaUstun = col === 'I' ? 'AC' : col === 'M' ? 'AD' : col) => `SUMIF(${kritUstun}${a1}:${kritUstun}${b1},"${kat}",${summaUstun}${a1}:${summaUstun}${b1})`;
    if (yaxlitBor && ndsFoiz != null && ndsQ != null) {
      const yi = model.qatorlar.map((q, i) => (yax(q) ? i : -1)).filter((i) => i >= 0);
      const yiF2 = yi.filter((i) => !f2Ustamali(model.qatorlar[i])); // Ф-2 da yaxlit qoladigan qatorlar
      const kSum = yaxlitKOplate(yigindi2(yiF2.map((i) => model.qatorlar[i].f2Summa)), ndsFoiz) ?? 0;
      const pSum = yigindi2(yiF2.map((i) => koOf(i, 'P'))); // ЧЕЛ/МАШ qatorlari ustama kaskadida (toifa qatorlarida), qolgani — to'g'ri narx × (1+НДС)
      const svQ = o.svodYaxlit && !o.faqatFarq ? svodYaxlitQqs(o.svodYaxlit, ndsFoiz)?.qqsBilan ?? null : null;
      const taqsimlangan = yi.some((i) => koTaqsim.has(`${i}G`));
      const gSum = taqsimlangan ? yigindi2(yi.map((i) => koTaqsim.get(`${i}G`))) : svQ ?? yaxlitKOplate(yigindi2(yi.map((i) => model.qatorlar[i].smetaSumma)), ndsFoiz) ?? 0;
      yaxlit = { G: gSum, I: pSum, K: kSum, M: yaxlit2(pSum - gSum), T: yigindi2(yiF2.map((i) => koOf(i, 'W'))) ?? 0 };
      yaxlitF = { I: sumif(YAXLIT_KAT, 'P', 'AB', 'P'), K: `ROUND(${sumif(YAXLIT_KAT, 'K')}*${yaxKf},2)`, M: `ROUND(${sumif(YAXLIT_KAT, 'P', 'AB', 'P')}-${gSum},2)`,
        T: `ROUND(SUMIF(AB${a1}:AB${b1},"${YAXLIT_KAT}",W${a1}:W${b1}),2)` };
    }
    const nomalumP = nomalumBor ? Object.fromEntries(Object.entries(nomalumQ).map(([k, x]) => [k, yaxlit2(x)])) : null;
    const nomalumF = nomalumBor ? Object.fromEntries(['G', 'I', 'K', 'M', 'T'].map((col) => [col, sumif(NOMALUM_KAT, col)])) : null;
    const p = nakrutkaPodvaliYoz(v, { podval, katUstun: 'R', katUstunPer: { I: 'AB', K: 'AB', M: 'AB', T: 'AB' }, summaUstunPer: { I: 'AC', M: 'AD' }, oraliq: [a1, b1], pulUstunlar: ['G', 'I', 'K', 'M', 'T'], foizUstun: 'F', nk, katSummalar, yaxlit, yaxlitF, nomalum: nomalumP, nomalumF });
    if (p.kfQator.ЧЕЛ !== kfQ.ЧЕЛ) throw new Error('SLICHITELNIY_PODVAL_SILJIDI');
    // Egasi qoidasi (2026-11-06): narxsiz barglar — jamilar yonida «итог неполный» (summa kataklari formulali — bo'sh qoladi, ro'yxat diqqat da).
    v.narxsizOgoh(narxsizSoni(model.qatorlar.filter((q) => q.tur === 'barg'), (q) => q.narx ?? q.smetaSumma));
  }
  v.bosh();
  v.izoh('Отклонение = фактически выполнено − по смете: «+» — выполнено сверх сметы, «−» — не выполнено. Стоимость граф 7, 9 и 13 — по сметным ценам (прямые затраты), без накладных расходов и НДС; графа 11 — по утвержденным актам формы № 2. Ведомость фиксирует расхождения и не изменяет сметные и фактические данные.');
  if (model.jami.smeta == null && model.ildizlar.length) v.izoh('Итоги не определены: есть позиции без количества, выполнения или цены — см. перечень ниже.');
  v.izoh('Графы 15–16 — стоимость к оплате: прямые затраты × коэффициент по виду затрат (раздел «Расчет стоимости к оплате»).');
  v.izoh('Перерасчет (графы 17–21): к доплате (+) = фактически выполнено − ранее предъявлено по Ф-2 (графа 18 = графа 9 − графа 11; «+» — выполнено больше предъявленного, «−» — к снятию, предъявлено больше выполненного). Ранее предъявлено — утвержденные акты Ф-2 с учетом знака корректирующих (сторно) актов. Графы 19–21 — то же по стоимости к оплате (с накладными расходами и НДС); сводка по разделам — на листе «Свод изменений».');
  if (model.qatorlar.some((q) => q.almashtirilganIdlar?.length)) v.izoh('Замена: заменяемая позиция отмечена «исключается» (факт 0), новая — «взамен поз. N»; пары связаны по привязке замены в смете.');
  if (yaxlitBor) v.izoh(YAXLIT_IZOH);
  if (Object.values(kfJS).some((x) => x == null)) v.izoh('Проценты накладных и прочих расходов для объекта не заданы — стоимость к оплате не определена (проценты не принимаются равными 0).');
  /* Zanjir (F-2 aktlar → slichitelniy): «ranee предъявлено» к оплате qator hisobida OBYEKT podvali bilan; imzolangan F-2 aktlari esa O'Z podvali
   * bilan. Farq bo'lsa jim qolmaydi (nakopitelniy «К ОПЛАТЕ ПО АКТАМ Ф-2» bilan bir xil). Qism pozitsiyali («faqat farq») ko'rinishda solishtirib bo'lmaydi. */
  if (o.aktlarKOplate !== undefined && !o.faqatFarq) {
    const P = model.ildizlar.map((i) => koOf(i, 'P'));
    const W = model.ildizlar.map((i) => koOf(i, 'W'));
    const p = P.length ? yigindi2Qatiy(P) : null;
    const w = W.length ? yigindi2Qatiy(W) : null;
    const nomi = 'К ОПЛАТЕ ПО АКТАМ Ф-2';
    if (o.aktlarKOplate === null) {
      v.diqqat([{ nom: 'Акты Ф-2', sabab: 'суммы утвержденных актов Ф-2 по их подвалам не прочитаны — «ранее предъявлено» к оплате рассчитано по подвалу объекта и может отличаться от фактически предъявленного' }], nomi);
    } else if (p != null && w != null && o.aktlarKOplate.length) {
      const stroki = yaxlit2(p - w);
      const akt = o.aktlarKOplate.some((a) => a.qqsBilan == null) ? null : yaxlit2(o.aktlarKOplate.reduce((t, a) => t + (a.qqsBilan as number), 0));
      const f = (x: number) => x.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      if (akt == null) v.diqqat([{ nom: 'Акты Ф-2', sabab: 'сумма хотя бы одного акта Ф-2 не определена — сравнение с суммой по строкам невозможно' }], nomi);
      else if (Math.abs(akt - stroki) >= 0.005) {
        v.diqqat([{ nom: 'Ранее предъявлено по Ф-2 (с НДС)', sabab: `по строкам (подвал объекта) ${f(stroki)}, по актам Ф-2 (подвал каждого акта) ${f(akt)}; «к доплате» с учетом актов: ${f(yaxlit2(p - akt))}` }], nomi);
      }
    }
  }
  v.diqqat(model.diqqat);
  if (katsiz.length) v.diqqat(katsiz.map((nom) => ({ nom, sabab: 'не указан вид затрат — к оплате без накрутки (только НДС), в расчете отдельной строкой' })), 'ВИД ЗАТРАТ НЕ УКАЗАН');
  v.imzo(imzoTomonlari(['ЗАКАЗЧИК', 'ПОДРЯДЧИК', 'ТЕХНАДЗОР', 'СОСТАВИЛ'], o.imzo));
  const varaqlar: RasmiyVaraq[] = [v];

  // «Свод изменений» — bo'lim bo'yicha smeta / fakt / Ф-2 / к доплате / к снятию; jami: QQS bilan (asosiy), ustamali (QQS siz), ustamasiz.
  if (model.ildizlar.length) {
    const A = `'${ASOSIY_VARAQ}'!`;
    const sv = new RasmiyVaraq({
      nom: SVOD_VARAQ, sarlavha: 'СВОД ИЗМЕНЕНИЙ СТОИМОСТИ (ПЕРЕРАСЧЕТ ПО Ф-2)',
      ostSarlavha: [`объект: ${o.obyektNomi}; по состоянию на ${sanaRu}${o.faqatFarq ? ' (только позиции с отклонениями)' : ''}`],
      ustunlar: [
        { sarlavha: '№', kenglik: 6, tur: 'tartib' },
        { sarlavha: 'Раздел сметы', kenglik: 54, tur: 'matn' },
        { sarlavha: 'По смете', kenglik: 21, tur: 'pul' },
        { sarlavha: 'Фактически выполнено', kenglik: 21, tur: 'pul' },
        { sarlavha: 'Ранее предъявлено по Ф-2', kenglik: 21, tur: 'pul' },
        { sarlavha: 'К доплате (+)', kenglik: 21, tur: 'pul' },
        { sarlavha: 'К снятию (−)', kenglik: 21, tur: 'pul' },
        { sarlavha: 'Итого перерасчет (±)', kenglik: 21, tur: 'pul' },
        { sarlavha: 'Требуют внимания, поз.', kenglik: 12, tur: 'hajm' },
      ],
      yonalish: 'landscape',
    });
    const yaprok = (i: number): number[] => { const r = model.qatorlar[i]; return r.tur === 'barg' ? [i] : r.bolalar.flatMap(yaprok); };
    const diap = (i: number): [number, number] => {
      let lo = i, hi = i;
      const yur = (k: number) => { lo = Math.min(lo, k); hi = Math.max(hi, k); model.qatorlar[k].bolalar.forEach(yur); };
      yur(i);
      return [lo, hi];
    };
    const koSum = (i: number, c: KoUstun): number => { const r = model.qatorlar[i]; return r.tur === 'barg' ? koOf(i, c) ?? 0 : yaxlit2(r.bolalar.reduce((s, k) => s + koSum(k, c), 0)); };
    const bolimNomi = (r: SlichitelniyQator) => (r.tur === 'itogo' ? r.nom.replace(/^ИТОГО ПО РАЗДЕЛУ:\s*/, '') : r.nom).replace(/^РАЗДЕЛ:\s*/i, '');
    const ustunHarf = ['C', 'D', 'E', 'F', 'G', 'H'] as const;
    type Satr = { sm: number | null; fk: number | null; f2: number | null; plus: number; minus: number; net: number | null };
    const pryamyeSatr = (ri: number): Satr => {
      const r = model.qatorlar[ri];
      return { sm: r.smetaSumma, fk: r.faktSumma, f2: r.f2Summa, plus: yigindi2(yaprok(ri).map((k) => model.qatorlar[k].doplataPlus ?? null)) ?? 0, minus: yigindi2(yaprok(ri).map((k) => model.qatorlar[k].doplataMinus ?? null)) ?? 0, net: r.doplataSumma };
    };
    const qqsSatr = (ri: number): Satr => {
      const pmK = yaprok(ri).map((k) => koPM(k));
      return { sm: koSum(ri, 'U'), fk: koSum(ri, 'P'), f2: koSum(ri, 'V'), plus: yigindi2(pmK.map((x) => x[0])) ?? 0, minus: yigindi2(pmK.map((x) => x[1])) ?? 0, net: koSum(ri, 'W') };
    };
    const blok = (sarlavha: string, rejim: 'qqs' | 'ustamali' | 'pryamye', qqsQatorlar: readonly number[] | null): number[] => {
      sv.bolim(sarlavha, { daraja: 0 });
      const manba = rejim === 'pryamye' ? ['G', 'I', 'K', 'X', 'Y', 'T'] : ['U', 'P', 'V', 'Z', 'AA', 'W'];
      const satrlar: number[] = [];
      const jamiQiym: Array<number | null> = [0, 0, 0, 0, 0, 0];
      model.ildizlar.forEach((ri, k) => {
        const r = model.qatorlar[ri];
        const s = rejim === 'pryamye' ? pryamyeSatr(ri) : qqsSatr(ri);
        const [lo, hi] = diap(ri);
        const qiym: Array<number | null> = [s.sm, s.fk, s.f2, s.plus, s.minus, s.net];
        const nds = ndsFoiz ?? 0;
        const sr = sv.qator('oddiy', (n) => [
          k + 1, bolimNomi(r),
          ...qiym.map((x, j): Qiymat => {
            if (rejim === 'ustamali') {
              const bu = `${ustunHarf[j]}${qqsQatorlar![k]}`;
              return { f: `IF(${bu}="","",ROUND(${bu}*100/(100+${A}F${ndsQ}),2))`, v: x == null ? '' : qqsSizNarx(x, nds) };
            }
            const f = j === 3 || j === 4 ? `SUM(${A}${manba[j]}${rowOf(lo)}:${manba[j]}${rowOf(hi)})` : `${A}${manba[j]}${rowOf(ri)}`;
            return { f, v: x ?? '' };
          }),
          rejim === 'pryamye' ? { f: `${A}O${rowOf(ri)}`, v: r.nomalum } : null,
        ]);
        satrlar.push(sr);
        qiym.forEach((x, j) => { jamiQiym[j] = (jamiQiym[j] ?? 0) + (rejim === 'ustamali' ? (x == null ? 0 : qqsSizNarx(x, nds)) : x ?? 0); });
      });
      sv.qator('vsego', () => [
        null, 'ВСЕГО ПО ОБЪЕКТУ',
        ...ustunHarf.map((h, j): Qiymat => ({ f: sumRefs(h, satrlar), v: yaxlit2(jamiQiym[j] ?? 0) })),
        rejim === 'pryamye' ? { f: sumRefs('I', satrlar), v: model.ildizlar.reduce((t, i) => t + model.qatorlar[i].nomalum, 0) } : null,
      ]);
      sv.bosh();
      return satrlar;
    };
    const qqsBor = ndsQ != null && ndsFoiz != null;
    let qqsQ: number[] = [];
    if (qqsBor) {
      qqsQ = blok('С НАКЛАДНЫМИ РАСХОДАМИ И НДС (стоимость к оплате)', 'qqs', null);
      blok('С НАКЛАДНЫМИ РАСХОДАМИ (БЕЗ НДС)', 'ustamali', qqsQ);
    }
    blok('ПРЯМЫЕ ЗАТРАТЫ (БЕЗ НАКРУТКИ, БЕЗ НДС)', 'pryamye', null);
    // Замена / дополнительные работы — alohida qatlam: смета до изменений → (а) исключаемые → (б) замена → (в) дополнительные → смета после изменений.
    const oz = ozgarishSvodi(model);
    if (oz.zamena.soni || oz.qoshimcha.soni) {
      sv.bolim('ИЗМЕНЕНИЯ СМЕТЫ: ЗАМЕНА И ДОПОЛНИТЕЛЬНЫЕ РАБОТЫ (ПРЯМЫЕ ЗАТРАТЫ, БЕЗ РАЗДЕЛОВ ПО СВОДУ)', { daraja: 0 });
      const ozQ: number[] = [];
      const satr = (nom: string, s: OzgarishQism, faqatReja = false) => {
        const d = faqatReja ? 0 : s.doplata;
        ozQ.push(sv.qator('oddiy', () => [ozQ.length + 1, nom, s.reja, faqatReja ? null : s.fakt, faqatReja ? null : s.f2, faqatReja ? null : d > 0 ? d : 0, faqatReja ? null : d < 0 ? d : 0, faqatReja ? null : d, null]));
      };
      satr('Смета до изменений (основные разделы, без свода)', oz.asl);
      satr('(а) Замена: исключаемые позиции (заменены — минус)', oz.istisno, true);
      satr('(б) Замена: новые позиции (взамен исключаемых)', oz.zamena);
      satr('(в) Дополнительные работы (нет в смете)', oz.qoshimcha);
      sv.qator('vsego', () => [null, 'СМЕТА ПОСЛЕ ИЗМЕНЕНИЙ (ВСЕГО)', ...ustunHarf.map((h, j): Qiymat => ({ f: sumRefs(h, ozQ), v: yaxlit2([oz.keyin.reja, oz.keyin.fakt, oz.keyin.f2, oz.keyin.doplata > 0 ? oz.keyin.doplata : 0, oz.keyin.doplata < 0 ? oz.keyin.doplata : 0, oz.keyin.doplata][j]) })), null]);
      sv.bosh();
      sv.izoh('Замена и дополнительные работы — отдельный слой изменений: исходная смета не меняется. «По смете» для (б) и (в) — плановая сумма изменения (объем × цена), фактическая — графы «Фактически выполнено» и «Ранее по Ф-2». Исключаемая позиция входит в строку «Смета до изменений» и вычитается в (а); в основной ведомости замена стоит сразу под заменяемой позицией («взамен поз. N»).');
    }
    if (yaxlitBor) sv.izoh('Разделы по своду (единая сумма): «по смете» — сумма свода (с накладными, без НДС), «фактически» и «по Ф-2» — прямые цены; в блоке «ПРЯМЫЕ ЗАТРАТЫ» эти уровни не сопоставимы — сравнивайте по блоку «С НАКЛАДНЫМИ РАСХОДАМИ И НДС».');
    sv.izoh('К доплате (+) — выполнено больше, чем предъявлено по Ф-2; к снятию (−) — предъявлено по Ф-2 больше, чем выполнено. «Ранее предъявлено по Ф-2» — сумма утвержденных актов Ф-2 с учетом знака корректирующих (сторно) актов; сумма выполнения при наличии Ф-2 — по цене утвержденной Ф-2, иначе по сметной цене.');
    sv.izoh('Сумма к доплате и к снятию — по позициям (положительные и отрицательные разницы раздела суммируются отдельно, взаимно не погашаются); разделы по своду (единая сумма) — по разделу в целом: итоговая разница раздела. Итого перерасчет (±) = факт − предъявлено по Ф-2.');
    if (!qqsBor) sv.izoh('Ставка НДС / накладные расходы объекта не заданы — блоки «с накладными и НДС» не формируются (проценты не принимаются равными 0).');
    else if (Object.values(kfJS).some((x) => x == null)) sv.izoh('Часть процентов накладных расходов не задана — позиции этих видов затрат в блоках «с накладными» пустые (не 0).');
    const nomSoni = model.ildizlar.reduce((t, i) => t + model.qatorlar[i].nomalum, 0);
    if (nomSoni) sv.izoh(`Итог неполный: позиций, требующих внимания (нет количества, цены, выполнения или суммы Ф-2) — ${nomSoni}; они в суммы не включены (пустые, не 0) — перечень на листе «${ASOSIY_VARAQ}».`);
    varaqlar.push(sv);
  }

  // «Плюсы и минусы» — 20 ta eng katta pereraschet pozitsiyasi (to'g'ri narx, ustamasiz): PTO muhandisi qaysi qatorlar jamini belgilashini darrov ko'radi.
  // Svod (yaxlit) bo'limi ichki qatorlari ro'yxatga ALOHIDA kirmaydi: bo'lim bitta summa, ichki + va − bir-birini qoplaydi — bo'lim sof farqi BITTA pozitsiya.
  const svodPoz = [...svodG].map(([bid, idx]) => {
    const net = yigindi2(idx.map((k) => model.qatorlar[k].doplataSumma));
    const bq = model.qatorlar.find((r) => r.id === bid && r.tur !== 'itogo') ?? model.qatorlar.find((r) => r.id === bid);
    const q = { ...model.qatorlar[idx[0]], id: bid, kod: '', nom: `РАЗДЕЛ ПО СВОДУ: ${(bq?.nom ?? '').replace(/^ИТОГО ПО РАЗДЕЛУ:\s*/, '')}`, smetaSumma: null, faktSumma: yigindi2(idx.map((k) => model.qatorlar[k].faktTogri ?? model.qatorlar[k].faktSumma)), f2Summa: yaxlit2(idx.reduce((t, k) => t + model.qatorlar[k].f2Summa, 0)), doplataSumma: net, almashtirilganIdlar: undefined } as SlichitelniyQator;
    return { q, i: idx[0], svodBolim: true };
  });
  const doplataQ = [...model.qatorlar.map((q, i) => ({ q, i, svodBolim: false })).filter((x) => x.q.tur === 'barg' && x.q.yaxlitTaqsim == null && x.q.doplataSumma != null && Math.abs(x.q.doplataSumma) >= 0.005), ...svodPoz.filter((x) => x.q.doplataSumma != null && Math.abs(x.q.doplataSumma) >= 0.005)]
    .sort((a, b) => Math.abs(b.q.doplataSumma!) - Math.abs(a.q.doplataSumma!)).slice(0, 20);
  if (doplataQ.length) {
    const A2 = `'${ASOSIY_VARAQ}'!`;
    const pm = new RasmiyVaraq({
      nom: 'Плюсы и минусы', sarlavha: 'ПЛЮСЫ И МИНУСЫ: 20 КРУПНЕЙШИХ ПОЗИЦИЙ ПЕРЕРАСЧЕТА',
      ostSarlavha: [`объект: ${o.obyektNomi}; по состоянию на ${sanaRu}; прямые затраты (без накладных расходов и НДС); плюс — к доплате, минус — к снятию`],
      ustunlar: [
        { sarlavha: '№', kenglik: 5, tur: 'tartib' }, { sarlavha: 'Работа (шифр — наименование)', kenglik: 54, tur: 'matn' },
        { sarlavha: 'По смете', kenglik: 19, tur: 'pul' }, { sarlavha: 'Факт', kenglik: 19, tur: 'pul' }, { sarlavha: 'Ранее по Ф-2', kenglik: 19, tur: 'pul' },
        { sarlavha: '± к доплате (+) / к снятию (−)', kenglik: 21, tur: 'pul' }, { sarlavha: 'Обоснование', kenglik: 52, tur: 'matn' },
      ],
      yonalish: 'landscape',
    });
    const sabab = (q: SlichitelniyQator): string => {
      const d = q.doplataSumma!;
      if (d > 0) return q.f2Summa === 0 ? 'Плюс: в Ф-2 не предъявлялось' : 'Плюс: выполнено больше, чем предъявлено по Ф-2';
      if (q.almashtirilganIdlar?.length) return 'Минус: исключается — позиция заменена';
      return (q.faktHajm ?? 0) === 0 ? 'Минус: предъявлено по Ф-2, фактически не выполнено' : 'Минус: предъявлено по Ф-2 больше, чем выполнено';
    };
    doplataQ.forEach(({ q, i, svodBolim }, k) => {
      if (svodBolim) {
        // Svod bo'limi: smeta ustuni bo'sh (yaxlit summa boshqa daraja), fakt / Ф-2 / farq — bo'lim bo'yicha qiymat (ichki formulalar bo'lim jamiga teng).
        pm.qator('oddiy', [k + 1, q.nom, null, qiy(q.faktSumma), q.f2Summa, qiy(q.doplataSumma),
          (q.doplataSumma! > 0 ? 'Плюс' : 'Минус') + ': раздел по своду в целом (единая сумма); внутренние строки раздела взаимно погашаются, перерасчет — по прямым ценам']);
        return;
      }
      pm.qator('oddiy', [k + 1, [q.kod, q.nom].filter(Boolean).join(' — '),
        { f: `${A2}G${rowOf(i)}`, v: q.smetaSumma ?? '' },
        { f: `${A2}I${rowOf(i)}`, v: q.faktSumma ?? '' },
        { f: `${A2}K${rowOf(i)}`, v: q.f2SummaNomalum ? '' : q.f2Summa },
        { f: `${A2}T${rowOf(i)}`, v: q.doplataSumma! },
        sabab(q)]);
    });
    pm.bosh();
    pm.izoh('Позиции отсортированы по модулю разницы «факт − ранее предъявлено по Ф-2». Полный перечень — на листе «' + ASOSIY_VARAQ + '» (графы 17–18), по разделам — «' + SVOD_VARAQ + '».');
    varaqlar.push(pm);
  }

  // Alohida «Работы вне сметы» varag'i — faqat so'rovga ko'ra (asosiy varaqda «ДОПОЛНИТЕЛЬНЫЕ РАБОТЫ» bo'limi va zamena juftlari bor).
  if (o.vneSmeta === 'alohida') {
    const vne = model.qatorlar.filter((q) => (q.qoshimcha || q.zamena) && (q.tur === 'bl' || q.tur === 'barg') && q.faktHajm != null && q.faktHajm !== 0
      && !(q.tur === 'barg' && q.otaIdx != null && model.qatorlar[q.otaIdx]?.tur === 'bl'));
    if (vne.length) {
      const vv = new RasmiyVaraq({
        nom: 'Работы вне сметы', sarlavha: 'РАБОТЫ, ВЫПОЛНЕННЫЕ СВЕРХ СМЕТЫ (ДОПОЛНИТЕЛЬНЫЕ РАБОТЫ И ЗАМЕНА)', yonalish: 'landscape',
        ostSarlavha: [`к сличительной ведомости по объекту ${o.obyektNomi} по состоянию на ${sanaRu}`],
        ustunlar: [
          { sarlavha: '№ п/п', kenglik: 7, tur: 'tartib' }, { sarlavha: 'Шифр, код', kenglik: 14, tur: 'kod' }, { sarlavha: 'Наименование работ', kenglik: 46, tur: 'matn' },
          { sarlavha: 'Ед. изм.', kenglik: 9, tur: 'birlik' }, { sarlavha: 'Вид', kenglik: 18, tur: 'matn' }, { sarlavha: 'Выполнено, кол-во', kenglik: 14, tur: 'hajm' },
          { sarlavha: 'Цена за ед., сум', kenglik: 16, tur: 'narx' }, { sarlavha: 'Сумма выполнено, сум', kenglik: 20, tur: 'pul' },
        ],
      });
      const bosh2 = vv.malumotBoshi;
      vne.forEach((q, i) => {
        vv.qator('oddiy', [i + 1, q.kod, q.nom, q.birlik, q.qoshimcha ? 'дополнительная работа' : 'замена', qiy(q.faktHajm), qiy(q.narx), qiy(q.faktSumma)]);
      });
      const summa = yigindi2(vne.map((q) => q.faktSumma));
      vv.qator('jami', () => [null, null, 'ИТОГО', null, null, null, null, { f: sumRefs('H', vne.map((_, i) => bosh2 + i)), v: summa ?? '' }]);
      vv.bosh();
      vv.izoh('Работы, которых нет в смете (дополнительные и замена): стоимость по сметным ценам (прямые затраты), без накладных расходов и НДС; в основной ведомости эти строки также отмечены.');
      varaqlar.push(vv);
    }
  }
  const { bytes } = rasmiyKitob(varaqlar, { tur: 'slichitelniy' });
  const kv = (c: 'P' | 'Q' | 'W') => { const x = model.ildizlar.map((i) => koOf(i, c)); return x.length ? yigindi2Qatiy(x) : null; };
  return { bytes, faylNomi: hujjatFaylNomi({ obyekt: o.obyektNomi, hujjat: 'СЛИЧИТЕЛЬНАЯ_ВЕДОМОСТЬ', davr: sana }), kOplata: { fakt: kv('P'), farq: kv('Q'), doplata: kv('W') } };
}