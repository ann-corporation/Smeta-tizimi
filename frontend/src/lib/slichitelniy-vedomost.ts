import type { T2Qator, T2QatorHolat } from '../api/supabase';
import {
  RasmiyVaraq, bugunSana, sumRefs, hujjatFaylNomi, imzoTomonlari, rasmiyKitob, yaxlit2,
  type ImzoNomlar, type Qiymat, type RasmiyUstun,
} from './hujjat-yozuvchi';
import type { OstatkaIstisno } from './ostatka-export';
import type { F3DavrAkt } from './forma3-export';
import type { NakrutkaKoeffitsientlar } from '../api/t2-nakrutka';
import { NAKRUTKA_KATLAR, NOMALUM_KAT, kOplate, kategoriyaKf, nakrutkaKat, nakrutkaPodvaliYoz, podvalKfQatorlari, podvalNdsFoiz, podvalQatorRaqami, type KatSummalar } from './nakrutka-podval';
import { YAXLIT_IZOH, YAXLIT_KAT, svodYaxlitQqs, type SvodYaxlit } from './svod-yaxlit';
import { NDS_SUKUT_FOIZ, yaxlitQatorlarga, faktSummaF2Narxda, faktSummaF2NarxFormula, qatorSumma, serverMerosKoefQoy, standartPodval, podvalVsegoKodi, yaxlitKOplate, yigindi2, type Podval } from './hisob-yadro';
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
  /** Bekor qilingan Ф-2 aktlari — faqat ma'lumot ilovasi (jamiga kirmaydi). */
  bekorAktlar?: ReadonlyArray<BekorAkt>;
};

/** Model opsiyalari. Fakt hajmi yozilganidek; fakt summasi — tasdiqlangan F2 bor qatorda F2 narxida (yadro). */
export type SlichitelniyModelOpsiya = Pick<SlichitelniyOpsiya, 'faqatFarq' | 'istisnolar'> & {
  /** Svod yaxlit (server): bo'lim ildizlari jamidan chiqariladi (yaxlit summa faqat podvalda, bir marta). */
  svodYaxlit?: SvodYaxlit | null;
  /** Faol «bajarilmadi» qatorlari (qator_id): hujjatda joyida «НЕ ВЫПОЛНЯЕТСЯ» belgisi bilan. */
  bajarilmadiIdlar?: ReadonlySet<number> | null;
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
  /** Svod yaxlit bo'limi bargi: bo'lim qator id si. Qator summalari TO'G'RI narxda (taqsimsiz); yaxlit summa faqat podvalda, jamiga kirmaydi. */
  yaxlitTaqsim?: number;
  /** Svod bo'limi ichidagi har qator (rz/bl/barg/itogo) va uning ildizi. */
  svodId?: number;
  svodRoot?: boolean;
  /** «Bajarilmadi» belgilangan (t2_qator_bajarilmadi, faol) — qator joyida «НЕ ВЫПОЛНЯЕТСЯ» belgisi bilan. */
  bajarilmadi?: boolean;
  /** Qo'shimcha/zamena rejadagi hajm (smeta hajmi 0 — asl smeta o'zgarmaydi). */
  rejaHajm?: number;
  /** O'zgarish turi (faqat barg, svoddan tashqari): ОСН asosiy, ИСК zamena bilan chiqarilgan, ЗАМ zamena, ДОП qo'shimcha. */
  ozgarish?: 'ОСН' | 'ИСК' | 'ЗАМ' | 'ДОП';
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
  /** Svod (yaxlit) bo'limlari ildizlari (`qatorlar` indekslari): jamiga kirmaydi, podvalda bir marta. */
  svodIldizlar: number[];
  /** HUJJAT tanasi jami: svodsiz, to'g'ri xarajat (ustamasiz), hamma ustunda bir daraja. */
  tana: SlichitelniyJami;
  /** Sahifalar bilan paritet jami (svod bo'limlari bilan; smeta — yaxlit summa QQS siz, fakt/F-2 — to'g'ri narx: aralash daraja, hujjatda ISHLATILMAYDI). */
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
  const bajarilmadiSet: ReadonlySet<number> = o.bajarilmadiIdlar ?? new Set<number>();
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
    if (q.qoshimcha && !q.zamena) b.push('доп. работа (нет в смете)');
    if (q.zamena) b.push('замена');
    if (bajarilmadiSet.has(q.id)) b.push('НЕ ВЫПОЛНЯЕТСЯ');
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
  };  const svodRoots: number[] = [];
  const qayta = (q: T2Qator, daraja: number, blNo: string | null, k: number, otaIdx: number | null = null, svodOta: number | null = null): number | null => {
    const tur = q.tur ?? '';
    const kids = bolalar.get(q.id) ?? [];
    // Svod (yaxlit) bo'limi: bir marta, faqat podvalda (yaxlit summa). Tanada uning qatorlari spravochno (to'g'ri narx) va yuqori jamilarga KIRMAYDI.
    const svodId: number | null = svodOta ?? (lumpIds.has(q.id) ? q.id : null);
    const svodBelgi = svodId != null ? { svodId, ...(lumpIds.has(q.id) ? { svodRoot: true } : {}) } : {};
    const bolaYig = (c: T2Qator, i: number | null, b: number[], kk: number): boolean => { if (i == null) return false; if (lumpIds.has(c.id)) { svodRoots.push(i); return false; } b.push(i); return kk >= 0; };
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
        ...(q.qoshimcha && !lumpOstida(q) && q.hajm != null ? { rejaHajm: q.hajm } : {}),
        ...svodBelgi, ...(svodId != null ? { yaxlitTaqsim: svodId } : {}),
        ...(bajarilmadiSet.has(q.id) ? { bajarilmadi: true } : {}),
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
        ...svodBelgi, ...(bajarilmadiSet.has(q.id) ? { bajarilmadi: true } : {}),
      });
      const b: number[] = [];
      let kk = 0;
      for (const c of kids) { const i = qayta(c, daraja + 1, nomer, kk + 1, idx, svodId); if (bolaYig(c, i, b, kk)) kk++; }
      if (!b.length && o.faqatFarq && (farq === 0)) { out.length = idx; no--; return null; }
      yigindi(out[idx], b);
      return idx;
    }
    const idx = out.length;
    out.push({ id: q.id, tur: 'rz', daraja, tartib: '', kod: '', nom: q.nom ?? '', birlik: '', smetaHajm: null, narx: null, smetaSumma: null, faktHajm: null, faktSumma: null, f2Hajm: 0, f2Summa: 0, farqHajm: null, farqSumma: null, doplataHajm: null, doplataSumma: null, izoh: '', nomalum: 0, bolalar: [], ...svodBelgi });
    const b: number[] = [];
    const svodOldin = svodRoots.length;
    for (const c of kids) { const i = qayta(c, daraja + 1, null, 0, null, svodId); bolaYig(c, i, b, 0); }
    if (lumpIds.has(q.id)) { out[idx].bolalar = b; return b.length ? idx : (out.length = idx, null); } // svod bo'limi: jami qatori yo'q
    if (!b.length) { if (svodRoots.length === svodOldin) out.length = idx; return null; }
    const it: SlichitelniyQator = { ...svodBelgi, id: q.id, tur: 'itogo', daraja, tartib: '', kod: '', nom: `ИТОГО ПО РАЗДЕЛУ: ${q.nom ?? ''}`, birlik: '', smetaHajm: null, narx: null, smetaSumma: null, faktHajm: null, faktSumma: null, f2Hajm: 0, f2Summa: 0, farqHajm: null, farqSumma: null, doplataHajm: null, doplataSumma: null, izoh: '', nomalum: 0, bolalar: [] };
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
  for (const q of bolalar.get(null) ?? []) { const i = qayta(q, 0, null, 0); if (i != null) { if (lumpIds.has(q.id)) svodRoots.push(i); else ildizlar.push(i); } }
  // Svod yaxlit (egasi 2026-11-14): bo'lim yaxlit summasi tanaga taqsimlanMAYDI — tana faqat to'g'ri xarajat (bir daraja, hamma ustunda);
  // svod qatorlari spravochno, jamiga kirmaydi; yaxlit summa podvalda bitta qator.
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
  // O'zgarish turi (Свод изменений formulalari uchun yagona manba): svoddan tashqari barglar.
  {
    const ota = new Map<number, number>();
    out.forEach((r, i) => r.bolalar.forEach((k) => ota.set(k, i)));
    const yuqori = (i: number, f: (r: SlichitelniyQator) => boolean): boolean => { for (let p: number | undefined = i, n = 0; p != null && n < 64; p = ota.get(p), n++) if (f(out[p])) return true; return false; };
    out.forEach((r, i) => {
      if (r.tur !== 'barg' || r.svodId != null) return;
      r.ozgarish = yuqori(i, (x) => !!x.zamena) ? 'ЗАМ' : yuqori(i, (x) => !!x.qoshimcha) ? 'ДОП' : yuqori(i, (x) => !!x.almashtirilganIdlar?.length) ? 'ИСК' : 'ОСН';
    });
  }
  const nomalum = ildizlar.reduce((s, i) => s + out[i].nomalum, 0);
  const js =(f: (x: SlichitelniyQator) => number | null) => (!ildizlar.length ? null : yigindi2(ildizlar.map((i) => f(out[i]))));
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
    net: yigindi2(lar.map((r) => r.doplataSumma)) ?? 0,
    nomalum: nomalum + svodRoots.reduce((s, i) => s + out[i].nomalum, 0),
  };
  // TANA jami (hujjat uchun): svodsiz, to'g'ri xarajat, hamma ustunda bir daraja.
  const tana: SlichitelniyJami = { smeta: js((x) => x.smetaSumma), fakt: js((x) => x.faktSumma), farq: js((x) => x.farqSumma), f2: yaxlit2(ildizlar.reduce((t, i) => t + out[i].f2Summa, 0)) };
  // JAMI (sahifalar bilan paritet): tana + svod bo'limlari (smeta — yaxlit summa QQS siz, fakt va F-2 — to'g'ri narx; hujjatda ishlatilmaydi — aralash daraja).
  let jami: SlichitelniyJami = tana;
  if (svodRoots.length) {
    const barglar2 = (i: number): number[] => (out[i].tur === 'barg' ? [i] : out[i].bolalar.flatMap(barglar2));
    let sm = 0, fk = 0, f2 = 0, fq = 0;
    const lumpB = new Map((o.svodYaxlit?.bolimlar ?? []).map((b) => [Number(b.qator_id), b]));
    for (const ri of svodRoots) {
      const lv = barglar2(ri);
      const b = !o.faqatFarq ? lumpB.get(out[ri].id) : undefined;
      const G = b ? yaxlitQatorlarga(Number(b.qqssiz), lv.map((i) => ({ id: i, summa: out[i].smetaSumma }))) : null;
      sm += G ? yaxlit2([...G.values()].reduce((s, x) => s + x, 0)) : yigindi2(lv.map((i) => out[i].smetaSumma)) ?? 0;
      fk += yigindi2(lv.map((i) => out[i].faktSumma)) ?? 0;
      f2 += lv.reduce((s, i) => s + out[i].f2Summa, 0);
      for (const i of lv) { const sh = G ? G.get(i) ?? null : out[i].smetaSumma; const fa = out[i].faktSumma; if (fa != null && sh != null) fq += fa - sh; }
    }
    jami = { smeta: yaxlit2((tana.smeta ?? 0) + sm), fakt: yaxlit2((tana.fakt ?? 0) + fk), farq: yaxlit2((tana.farq ?? 0) + fq), f2: yaxlit2(tana.f2 + f2) };
  }
  return {
    qatorlar: out, ildizlar, svodIldizlar: svodRoots, diqqat, barglar, ortiq, kam, pereraschet,
    tana, jami,
  };
}

export type OzgarishQism = { reja: number; fakt: number; f2: number; doplata: number; plus: number; minus: number; soni: number };
/** «Смета до изменений → замена → дополнительные работы → смета после изменений» (прямые затраты, svod bo'limlarisiz). Asl smeta o'zgarmaydi: o'zgarishlar alohida qatlam. */
export type SlichitelniyOzgarishSvodi = { asl: OzgarishQism; istisno: OzgarishQism; zamena: OzgarishQism; qoshimcha: OzgarishQism; keyin: OzgarishQism };

export function ozgarishSvodi(model: SlichitelniyModel): SlichitelniyOzgarishSvodi {
  const q = model.qatorlar;
  const ota = new Map<number, number>();
  q.forEach((r, i) => r.bolalar.forEach((k) => ota.set(k, i)));
  const yuqori = (i: number, f: (r: SlichitelniyQator) => boolean): boolean => { for (let p: number | undefined = i, n = 0; p != null && n < 64; p = ota.get(p), n++) if (f(q[p])) return true; return false; };
  const bosh = (): OzgarishQism => ({ reja: 0, fakt: 0, f2: 0, doplata: 0, plus: 0, minus: 0, soni: 0 });
  const asl = bosh(), istisno = bosh(), zamena = bosh(), qoshimcha = bosh();
  q.forEach((r, i) => {
    if (r.tur !== 'barg' || r.yaxlitTaqsim != null) return;
    const z = yuqori(i, (x) => !!x.zamena);
    const qo = !z && yuqori(i, (x) => !!x.qoshimcha);
    const t = z ? zamena : qo ? qoshimcha : asl;
    t.reja += z || qo ? r.rejaSumma ?? 0 : r.smetaSumma ?? 0;
    t.fakt += r.faktSumma ?? 0; t.f2 += r.f2Summa; t.doplata += r.doplataSumma ?? 0; t.plus += r.doplataPlus ?? 0; t.minus += r.doplataMinus ?? 0; t.soni++;
    if (!z && !qo && yuqori(i, (x) => !!x.almashtirilganIdlar?.length)) { istisno.reja -= r.smetaSumma ?? 0; istisno.soni++; }
  });
  const keyin: OzgarishQism = {
    reja: asl.reja + istisno.reja + zamena.reja + qoshimcha.reja, fakt: asl.fakt + zamena.fakt + qoshimcha.fakt, f2: asl.f2 + zamena.f2 + qoshimcha.f2,
    doplata: asl.doplata + zamena.doplata + qoshimcha.doplata, plus: asl.plus + zamena.plus + qoshimcha.plus, minus: asl.minus + zamena.minus + qoshimcha.minus, soni: asl.soni + zamena.soni + qoshimcha.soni,
  };
  const yu = (x: OzgarishQism): OzgarishQism => ({ reja: yaxlit2(x.reja), fakt: yaxlit2(x.fakt), f2: yaxlit2(x.f2), doplata: yaxlit2(x.doplata), plus: yaxlit2(x.plus), minus: yaxlit2(x.minus), soni: x.soni });
  return { asl: yu(asl), istisno: yu(istisno), zamena: yu(zamena), qoshimcha: yu(qoshimcha), keyin: yu(keyin) };
}


const PERER_GURUH = 'ПЕРЕРАСЧЕТ: К ДОПЛАТЕ (+) / К СНЯТИЮ (−) (ФАКТ − ПРЕДЪЯВЛЕНО ПО Ф-2)';
const SVOD_VARAQ = 'Свод изменений';
const ASOSIY_VARAQ = 'Сличительная ведомость';
const BEKOR_VARAQ = 'Отмененные Ф-2';

/** Bekor qilingan Ф-2 aktlari — faqat ma'lumot ilovasi (jamiga KIRMAYDI). */
export type BekorAkt = { nomer: string; sana?: string | null; summa?: number | null; almashtirgan?: string | null; sabab?: string | null };

// Tana: faqat to'g'ri xarajat (ustamasiz), hamma ustunda bir daraja. Ustama / QQS / yaxlit svod — FAQAT podvalda.
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
  { sarlavha: 'кол-во (+/−)', kenglik: 13, tur: 'hajm', guruh: PERER_GURUH },
  { sarlavha: 'сумма, сум', kenglik: 19, tur: 'pul', guruh: PERER_GURUH },
  { sarlavha: 'Примечание', kenglik: 30, tur: 'matn' },
  // Yashirin texnik ustunlar (podval SUMIF va «Свод изменений» uchun). Ustamali ustun YO'Q.
  { sarlavha: 'Н', kenglik: 4, tur: 'texnik', yashirin: true },
  { sarlavha: 'Кат.', kenglik: 6, tur: 'texnik', yashirin: true },
  { sarlavha: 'Кат. Ф-2', kenglik: 6, tur: 'texnik', yashirin: true },
  { sarlavha: 'Откл. (расчет)', kenglik: 15, tur: 'pul', yashirin: true },
  { sarlavha: 'Д+', kenglik: 15, tur: 'pul', yashirin: true },
  { sarlavha: 'С−', kenglik: 15, tur: 'pul', yashirin: true },
  { sarlavha: 'Свод ЧЕЛ/МАШ', kenglik: 6, tur: 'texnik', yashirin: true },
  { sarlavha: 'Изм.', kenglik: 6, tur: 'texnik', yashirin: true },
  { sarlavha: 'План изм.', kenglik: 15, tur: 'pul', yashirin: true },
];
// A№ B kod C nom D ed E smHajm F narx G smSumma H faktHajm I faktSumma J f2Hajm K f2Summa L farqHajm M farqSumma N perHajm O perSumma P izoh
// Q nomalum R kat S kat-F2 T otkl-hisob U Д+ V С− W svod-mehnat X o'zgarish Y reja-summa

export type SlichitelniyXlsxNatija = { bytes: Uint8Array; faylNomi: string; kOplata: { fakt: number | null; farq: number | null; doplata: number | null } };

/** Сличительная ведомость (.xlsx). */
export function slichitelniyHujjatXlsx(model: SlichitelniyModel, o: SlichitelniyOpsiya): SlichitelniyXlsxNatija {
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
  const nQ = model.qatorlar.length;
  const rowOf = (i: number) => bosh + i;
  const qiy = (x: number | null): Qiymat => (x == null ? null : x);
  const sumKid = (q: SlichitelniyQator, col: string) => sumRefs(col, q.bolalar.map(rowOf));
  const pulYig = (q: SlichitelniyQator, col: string, val: number | null): Qiymat => (q.bolalar.length ? { f: sumKid(q, col), v: val ?? 0 } : null);
  const nk: Partial<NakrutkaKoeffitsientlar> = { ...(o.nakrutka ?? {}) };
  nk.НДС = o.ndsFoiz ?? nk.НДС ?? NDS_SUKUT_FOIZ;
  // Foizlar faqat podvaldan (server meros rejimi); noma'lum — к оплате bo'sh, 0 emas.
  const podval = o.podval ? serverMerosKoefQoy(o.podval, nk, o.nkManba) : null;
  const kfJS = kategoriyaKf(nk, podval);
  const ndsFoiz = podvalNdsFoiz(podval, nk);
  const yax = (q: SlichitelniyQator) => q.tur === 'barg' && (!!o.yaxlitIdlar?.has(q.id) || q.yaxlitTaqsim != null || q.svodId != null);
  const yaxlitBor = model.qatorlar.some(yax);
  const katsizmi = (q: SlichitelniyQator) => q.tur === 'barg' && !yax(q) && !nakrutkaKat(q.kat);
  const COLS = ['G', 'I', 'K', 'M', 'O'] as const;
  const nomalumQ: Record<string, number> = { G: 0, I: 0, K: 0, M: 0, O: 0 };
  for (const q of model.qatorlar.filter(katsizmi)) { nomalumQ.G += q.smetaSumma ?? 0; nomalumQ.I += q.faktSumma ?? 0; nomalumQ.K += q.f2Summa; nomalumQ.M += q.farqSumma ?? 0; nomalumQ.O += q.doplataSumma ?? 0; }
  const nomalumBor = Object.values(nomalumQ).some((x) => Math.abs(x) >= 0.005);
  const podStart = bosh + nQ + 2; // ВСЕГО qatori + bo'sh qator
  const ndsQ = podvalQatorRaqami(podStart, podval, 'nds', yaxlitBor, nomalumBor);
  const yaxKf = ndsQ != null ? `(1+F${ndsQ}/100)` : '1';
  // SERVER QOIDASI (Ф-2 va fakt o'lchovi): svod bo'limi ichidagi pudratchi mehnati (ЧЕЛ/МАШ) yaxlit emas — oddiy ustama kaskadiga kiradi,
  // qolgan svod qatorlari to'g'ri narxda × (1+НДС) (podvalda yaxlit qator). Smeta tomonida butun svod = yaxlit summa.
  const f2Ustamali = (q: SlichitelniyQator): boolean => { const k = nakrutkaKat(q.kat); return q.tur === 'barg' && yax(q) && (k === 'ЧЕЛ' || k === 'МАШ'); };
  const svodG = svodGuruhlari(model.qatorlar);
  const katsiz: string[] = [];
  const svodTan = (q: SlichitelniyQator) => q.svodId != null;
  const SPR = 'справочно: раздел по своду, в итог не входит (единая сумма — в подвале)';
  type Rang = ReturnType<typeof bargUslubi>['rang'];
  const qatorRang = (q: SlichitelniyQator, asl: Rang): Rang =>
    svodTan(q) ? 'almashtirilgan' : q.zamena ? 'zamena' : q.qoshimcha ? 'qoshimcha' : q.almashtirilganIdlar?.length || q.ozgarish === 'ИСК' ? 'almashtirilgan' : asl;

  model.qatorlar.forEach((q, i) => {
    let r = 0;
    if (q.tur === 'rz') {
      r = v.bolim(q.svodRoot ? `РАЗДЕЛ ПО СВОДУ — единая сумма в подвале; строки ниже справочно, в итог не входят: ${q.nom}` : q.nom, { daraja: q.daraja });
    } else if (q.tur === 'barg') {
      const ota = q.otaIdx != null ? model.qatorlar[q.otaIdx] : undefined;
      // Formula faqat keshni aynan qaytarsa (ROUND(...,6)); bazadagi hajm 6 belgidan ortiq bo'lsa — qiymat yoziladi.
      const normaF = q.norma != null && ota?.tur === 'bl' && ota.smetaHajm != null && q.smetaHajm != null
        && Math.abs(Math.round((q.norma * ota.smetaHajm + Number.EPSILON) * 1e6) / 1e6 - q.smetaHajm) < 5e-10;
      const us = bargUslubi(q.resTur);
      const kat = nakrutkaKat(q.kat);
      if (!yax(q) && !kat) katsiz.push(`${q.nom}${q.birlik ? `, ${q.birlik}` : ''}`);
      const grp = q.yaxlitTaqsim != null ? svodG.get(q.yaxlitTaqsim) : undefined;
      const pm = (n: number, mx: boolean): Qiymat => {
        if (!grp) return { f: `IF(O${n}="","",${mx ? 'MAX' : 'MIN'}(O${n},0))`, v: q.doplataSumma == null ? '' : mx ? Math.max(q.doplataSumma, 0) : Math.min(q.doplataSumma, 0) };
        if (grp[0] !== i) return 0;
        return { f: `${mx ? 'MAX' : 'MIN'}(${sumRefs('O', grp.map(rowOf))},0)`, v: (mx ? q.doplataPlus : q.doplataMinus) ?? 0 };
      };
      const f2U = f2Ustamali(q);
      r = v.qator(us.tur, (n) => [
        q.tartib, q.kod, q.nom, q.birlik, normaF ? { f: `ROUND(${q.norma}*E${rowOf(q.otaIdx!)},6)`, v: q.smetaHajm! } : qiy(q.smetaHajm), qiy(q.narx),
        { f: `IF(OR(E${n}="",F${n}=""),"",ROUND(E${n}*F${n},2))`, v: q.smetaSumma ?? '' },
        qiy(q.faktHajm),
        // Narx qoidasi (yadro): F2 bor — ROUND(H × K / J); yo'q — ROUND(H × F). Kesh = formula.
        q.faktServerdan ? qiy(q.faktSumma) : { f: faktSummaF2NarxFormula(`H${n}`, `J${n}`, `K${n}`, `IF(OR(H${n}="",F${n}=""),"",ROUND(H${n}*F${n},2))`), v: q.faktSumma ?? '' },
        // Tasdiqlangan F-2: imzolangan hujjatdan aynan (qiymat, formula emas).
        q.f2Hajm, q.f2SummaNomalum ? '' : q.f2Summa,
        { f: `IF(OR(E${n}="",H${n}=""),"",H${n}-E${n})`, v: q.farqHajm ?? '' },
        { f: `IF(OR(G${n}="",I${n}=""),"",ROUND(I${n}-G${n},2))`, v: q.farqSumma ?? '' },
        { f: `IF(H${n}="","",ROUND(H${n}-J${n},6))`, v: q.doplataHajm ?? '' },
        { f: `IF(OR(I${n}="",K${n}=""),"",ROUND(I${n}-K${n},2))`, v: q.doplataSumma ?? '' },
        [svodTan(q) ? SPR : '', q.izoh].filter(Boolean).join('; ') || null,
        q.narx == null && mashinistMehnati(q) ? 0 : { f: `IF(OR(G${n}="",I${n}="",M${n}="",K${n}=""),1,0)`, v: q.nomalum },
        yax(q) ? YAXLIT_KAT : kat ?? NOMALUM_KAT,
        f2U ? kat : yax(q) ? YAXLIT_KAT : kat ?? NOMALUM_KAT,
        f2U ? { f: `IF(I${n}="","",I${n})`, v: q.faktSumma ?? '' } : { f: `IF(M${n}="","",M${n})`, v: q.farqSumma ?? '' },
        pm(n, true), pm(n, false),
        f2U ? kat : null,
        q.ozgarish ?? null,
        (q.ozgarish === 'ЗАМ' || q.ozgarish === 'ДОП') && q.rejaHajm != null ? { f: `IF(F${n}="","",ROUND(${q.rejaHajm}*F${n},2))`, v: q.rejaSumma ?? '' } : null,
      ], { daraja: q.daraja, rang: qatorRang(q, us.rang) });
    } else if (q.tur === 'bl') {
      const bosKatak = q.svodRoot === true;
      r = v.qator('ish', (n) => [
        q.tartib, q.kod, bosKatak ? `РАЗДЕЛ ПО СВОДУ — единая сумма в подвале; строки ниже справочно, в итог не входят: ${q.nom}` : q.nom, q.birlik,
        bosKatak ? null : qiy(q.smetaHajm), null,
        bosKatak ? null : pulYig(q, 'G', q.smetaSumma),
        bosKatak ? null : qiy(q.faktHajm),
        bosKatak ? null : pulYig(q, 'I', q.faktSumma),
        bosKatak ? null : q.f2Hajm, bosKatak ? null : q.bolalar.length ? { f: sumKid(q, 'K'), v: q.f2Summa } : null,
        bosKatak ? null : { f: `IF(OR(E${n}="",H${n}=""),"",H${n}-E${n})`, v: q.farqHajm ?? '' },
        bosKatak ? null : pulYig(q, 'M', q.farqSumma),
        bosKatak ? null : { f: `IF(H${n}="","",ROUND(H${n}-J${n},6))`, v: q.doplataHajm ?? '' },
        bosKatak ? null : pulYig(q, 'O', q.doplataSumma),
        [svodTan(q) ? SPR : '', q.izoh].filter(Boolean).join('; ') || null,
        q.bolalar.length ? { f: sumKid(q, 'Q'), v: q.nomalum } : 0,
        null, null, null, null, null, null, null, null,
      ], { daraja: q.daraja, ...(qatorRang(q, null) ? { rang: qatorRang(q, null) } : {}) });
    } else {
      r = v.qator('jami', (n) => [
        null, null, q.nom, null, null, null,
        pulYig(q, 'G', q.smetaSumma), null, pulYig(q, 'I', q.faktSumma),
        null, { f: sumKid(q, 'K'), v: q.f2Summa }, null, pulYig(q, 'M', q.farqSumma), null, pulYig(q, 'O', q.doplataSumma), null,
        { f: sumKid(q, 'Q'), v: q.nomalum },
        null, null, null, null, null, null, null, null,
      ], { daraja: q.daraja });
    }
    if (r !== rowOf(i)) throw new Error('SLICHITELNIY_QATOR_SILJIDI');
  });

  /** Svodsiz yaproq barglar (jami uchun). */
  const yaprokNon = (i: number): number[] => { const r = model.qatorlar[i]; return r.tur === 'barg' ? (svodTan(r) ? [] : [i]) : r.bolalar.flatMap(yaprokNon); };
  const nonSvodBarglar = model.ildizlar.flatMap(yaprokNon);
  const pmJami = (col: 'U' | 'V') => sumRefs(col, nonSvodBarglar.concat([...svodG.values()].map((g) => g[0])).map(rowOf));
  const ref = (c: string) => sumRefs(c, model.ildizlar.map(rowOf));
  const nomalumJami = model.ildizlar.reduce((s, i) => s + model.qatorlar[i].nomalum, 0);
  const ild = model.ildizlar.length > 0;
  v.qator('vsego', () => [
    null, null, 'ИТОГО ПО ОБЪЕКТУ: ПРЯМЫЕ ЗАТРАТЫ (БЕЗ НАКЛАДНЫХ И НДС, БЕЗ РАЗДЕЛОВ ПО СВОДУ)', null, null, null,
    ild ? { f: ref('G'), v: model.tana.smeta ?? '' } : null, null,
    ild ? { f: ref('I'), v: model.tana.fakt ?? '' } : null, null,
    ild ? { f: ref('K'), v: model.tana.f2 } : null, null,
    ild ? { f: ref('M'), v: model.tana.farq ?? '' } : null, null,
    ild ? { f: ref('O'), v: yigindi2(model.ildizlar.map((i) => model.qatorlar[i].doplataSumma)) ?? 0 } : null, null,
    ild ? { f: ref('Q'), v: nomalumJami } : null,
    null, null, null,
    { f: pmJami('U'), v: model.pereraschet.doplata },
    { f: pmJami('V'), v: model.pereraschet.snyatie },
    null, null, null,
  ]);
  v.bosh();

  // ─────────── PODVAL: smeta / fakt / Ф-2 / otklonenie / pereraschet — bitta kaskad, ustama faqat shu yerda ───────────
  const katSummalar: Record<string, KatSummalar> = {};
  for (const c of COLS) {
    const ks = Object.fromEntries(NAKRUTKA_KATLAR.map((k) => [k, 0])) as KatSummalar;
    for (const q of model.qatorlar) {
      // Fakt/Ф-2 ustunlarida svod bo'limidagi ЧЕЛ/МАШ — oddiy toifada (server qoidasi); smeta ustunida butun svod yaxlit.
      const kat = q.tur === 'barg' && (!yax(q) || (c !== 'G' && f2Ustamali(q))) ? nakrutkaKat(q.kat) : null;
      if (!kat) continue;
      const val = c === 'G' ? q.smetaSumma : c === 'I' ? q.faktSumma : c === 'K' ? q.f2Summa : c === 'M' ? (yax(q) ? q.faktSumma : q.farqSumma) : q.doplataSumma;
      if (val != null) ks[kat] += val;
    }
    katSummalar[c] = ks;
  }
  const [a1, b1] = [bosh, bosh + nQ - 1];
  const sumif = (kat: string, col: string) => {
    const krit = col === 'G' ? 'R' : 'S';
    const s = col === 'M' ? 'T' : col;
    return `SUMIF(${krit}${a1}:${krit}${b1},"${kat}",${s}${a1}:${s}${b1})`;
  };
  let yaxlit: Record<string, number> | null = null;
  let yaxlitF: Record<string, string> | null = null;
  const vsegoKodi = podvalVsegoKodi(podval ?? standartPodval({}));
  const yaxQator = vsegoKodi == null ? null : (podvalQatorRaqami(podStart, podval, vsegoKodi, true, nomalumBor) ?? 0) - 1;
  if (yaxlitBor && ndsFoiz != null && ndsQ != null && yaxQator != null) {
    const yi = model.qatorlar.map((q, i) => (yax(q) ? i : -1)).filter((i) => i >= 0);
    const yiF2 = yi.filter((i) => !f2Ustamali(model.qatorlar[i])); // podvalda yaxlit qoladigan qatorlar
    const kF = (f: (q: SlichitelniyQator) => number | null) => yaxlitKOplate(yigindi2(yiF2.map((i) => f(model.qatorlar[i]))), ndsFoiz) ?? 0;
    const pSum = kF((q) => q.faktSumma), kSum = kF((q) => q.f2Summa), tSum = kF((q) => q.doplataSumma);
    // Smeta: svod bo'limi yaxlit summasi QQS BILAN (server, bir marta); svod ma'lumoti yo'q — to'g'ri narxdagi tarkib × (1+QQS).
    const svQ = o.svodYaxlit && !o.faqatFarq ? svodYaxlitQqs(o.svodYaxlit, ndsFoiz)?.qqsBilan ?? null : null;
    const gSum = svQ ?? yaxlitKOplate(yigindi2(yi.map((i) => model.qatorlar[i].smetaSumma)), ndsFoiz) ?? 0;
    // Svod qatorida «farq (fakt − smeta)» katagi bo'sh: ikki xil daraja (svod ustamali, fakt to'g'ri narx × НДС) — solishtirish faqat перерасчет (fakt − Ф-2) orqali.
    yaxlit = { G: gSum, I: pSum, K: kSum, M: 0, O: tSum };
    const bir = (c: string) => `ROUND(${sumif(YAXLIT_KAT, c)}*${yaxKf},2)`;
    yaxlitF = { I: bir('I'), K: bir('K'), O: bir('O') };
  }
  const nomalumP = nomalumBor ? Object.fromEntries(Object.entries(nomalumQ).map(([k, x]) => [k, yaxlit2(x)])) : null;
  const nomalumF = nomalumBor ? Object.fromEntries(COLS.map((col) => [col, sumif(NOMALUM_KAT, col)])) : null;
  const p = nakrutkaPodvaliYoz(v, { podval, katUstun: 'R', katUstunPer: { I: 'S', K: 'S', M: 'S', O: 'S' }, summaUstunPer: { M: 'T' }, oraliq: [a1, b1], pulUstunlar: COLS, foizUstun: 'F', nk, katSummalar, yaxlit, yaxlitF, yaxlitBosh: ['M'], nomalum: nomalumP, nomalumF });
  if (p.vsegoQator <= 0 || (ndsQ != null && p.kfQator.ЧЕЛ !== podvalKfQatorlari(podStart, podval, yaxlitBor, nomalumBor).ЧЕЛ)) throw new Error('SLICHITELNIY_PODVAL_SILJIDI');
  // Spravochno: svod ichidagi ЧЕЛ/МАШ (fakt va Ф-2 da — ustama bilan, smetada — svod summasi ichida): ЧЕЛ/МАШ qatorlari nega farq qilishi tushunarli bo'lsin.
  const svodMehnat = model.qatorlar.filter(f2Ustamali);
  if (svodMehnat.length) {
    const sf = (col: string) => `SUMIF(W${a1}:W${b1},"ЧЕЛ",${col}${a1}:${col}${b1})+SUMIF(W${a1}:W${b1},"МАШ",${col}${a1}:${col}${b1})`;
    const kv = (f: (q: SlichitelniyQator) => number | null) => yaxlit2(svodMehnat.reduce((s, q) => s + (f(q) ?? 0), 0));
    v.qator('oddiy', () => {
      const c: Qiymat[] = Array(USTUNLAR.length).fill(null);
      c[2] = 'Справочно (в итог не входит): в строках ЧЕЛ/МАШ выше по факту и Ф-2 учтен труд разделов по своду (с накладными расходами, правило Ф-2); по смете он внутри единой суммы свода';
      c[8] = { f: sf('I'), v: kv((q) => q.faktSumma) };
      c[10] = { f: sf('K'), v: kv((q) => q.f2Summa) };
      c[12] = { f: sf('T'), v: kv((q) => q.faktSumma) };
      c[14] = { f: sf('O'), v: kv((q) => q.doplataSumma) };
      return c;
    });
  }
  v.narxsizOgoh(narxsizSoni(model.qatorlar.filter((q) => q.tur === 'barg' && !svodTan(q)), (q) => q.narx ?? q.smetaSumma));
  v.bosh();
  v.izoh('Тело ведомости — только прямые затраты (без накладных расходов и НДС), единый уровень во всех графах: по смете, фактически, по Ф-2, отклонения и перерасчет. Накладные и прочие расходы, НДС и единая сумма разделов по своду — только в подвале «Расчет стоимости» (проценты — из подвала сметы; ИТОГО ПРЯМЫЕ → накладные → ИТОГО-4 → НДС → ВСЕГО).');
  v.izoh('Отклонение = фактически выполнено − по смете: «+» — сверх сметы, «−» — не выполнено. Перерасчет = фактически выполнено − ранее предъявлено по Ф-2: «+» — к доплате, «−» — к снятию. Суммы Ф-2 — утвержденные акты, значения из подписанных документов; остальные суммы — живые формулы Excel (изменили количество — все пересчитывается).');
  if (model.tana.smeta == null && ild) v.izoh('Итоги не определены: есть позиции без количества, выполнения или цены — см. перечень ниже.');
  if (model.qatorlar.some((q) => q.almashtirilganIdlar?.length)) v.izoh('Замена: заменяемая позиция отмечена «исключается» (факт 0, смета видна, отклонение — минус), новая стоит сразу под ней — «взамен поз. N» (синий фон); дополнительные работы — желтый фон.');
  if (model.qatorlar.some((q) => q.bajarilmadi)) v.izoh('«НЕ ВЫПОЛНЯЕТСЯ» — позиция отмечена как невыполненная: остается в ведомости на своем месте, смета видна, факт 0, отклонение отрицательное.');
  if (yaxlitBor) v.izoh(YAXLIT_IZOH);
  if (yaxlitBor) v.izoh('Разделы по своду: строки раздела показаны справочно (прямые цены), в итоги тела не входят. В подвале раздел один раз: по смете — единая сумма свода (с НДС), по факту и Ф-2 — прямые цены × (1+НДС) (труд — с накладными по правилу Ф-2). Графа «отклонение» в строке свода пуста: два уровня (свод с накладными и прямые цены) — сравнение только через перерасчет (факт − Ф-2).');
  if (Object.values(kfJS).some((x) => x == null)) v.izoh('Проценты накладных и прочих расходов для объекта не заданы — стоимость с накладными не определена (проценты не принимаются равными 0).');
  /* Zanjir (F-2 aktlar → slichitelniy): podval K ВСЕГО (obyekt podvali) imzolangan F-2 aktlari (O'Z podvali) bilan solishtiriladi. */
  const vs = (c: string): number | null => p.natija[c]?.vsego ?? null;
  if (o.aktlarKOplate !== undefined && !o.faqatFarq) {
    const nomi = 'К ОПЛАТЕ ПО АКТАМ Ф-2';
    const stroki = vs('K'), fakt = vs('I');
    if (o.aktlarKOplate === null) {
      v.diqqat([{ nom: 'Акты Ф-2', sabab: 'суммы утвержденных актов Ф-2 по их подвалам не прочитаны — «ранее предъявлено» с накладными рассчитано по подвалу объекта и может отличаться от фактически предъявленного' }], nomi);
    } else if (stroki != null && fakt != null && o.aktlarKOplate.length) {
      const akt = o.aktlarKOplate.some((a) => a.qqsBilan == null) ? null : yaxlit2(o.aktlarKOplate.reduce((t, a) => t + (a.qqsBilan as number), 0));
      const f = (x: number) => x.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      if (akt == null) v.diqqat([{ nom: 'Акты Ф-2', sabab: 'сумма хотя бы одного акта Ф-2 не определена — сравнение с суммой по строкам невозможно' }], nomi);
      else if (Math.abs(akt - stroki) >= 0.005) {
        v.diqqat([{ nom: 'Ранее предъявлено по Ф-2 (с НДС)', sabab: `по строкам (подвал объекта) ${f(stroki)}, по актам Ф-2 (подвал каждого акта) ${f(akt)}; «к доплате» с учетом актов: ${f(yaxlit2(fakt - akt))}` }], nomi);
      }
    }
  }
  v.diqqat(model.diqqat);
  if (katsiz.length) v.diqqat(katsiz.map((nom) => ({ nom, sabab: 'не указан вид затрат — в подвале без накрутки (только НДС), отдельной строкой' })), 'ВИД ЗАТРАТ НЕ УКАЗАН');
  v.imzo(imzoTomonlari(['ЗАКАЗЧИК', 'ПОДРЯДЧИК', 'ТЕХНАДЗОР', 'СОСТАВИЛ'], o.imzo));
  const varaqlar: RasmiyVaraq[] = [v];
  const A = `'${ASOSIY_VARAQ}'!`;

  // ─────────── «Свод изменений»: smeta до → исключаемые → замена → доп. работы → smeta после; bo'limlar; svod; podval jami ───────────
  if (model.qatorlar.length) {
    const sv = new RasmiyVaraq({
      nom: SVOD_VARAQ, sarlavha: 'СВОД ИЗМЕНЕНИЙ СТОИМОСТИ (ПЕРЕРАСЧЕТ ПО Ф-2)',
      ostSarlavha: [`объект: ${o.obyektNomi}; по состоянию на ${sanaRu}${o.faqatFarq ? ' (только позиции с отклонениями)' : ''}; прямые затраты, накладные и НДС — в подвале основного листа`],
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
    const bolimNomi = (r: SlichitelniyQator) => (r.tur === 'itogo' ? r.nom.replace(/^ИТОГО ПО РАЗДЕЛУ:\s*/, '') : r.nom).replace(/^РАЗДЕЛ:\s*/i, '');
    const H = ['C', 'D', 'E', 'F', 'G', 'H'] as const;
    const xs = (tag: string, c: string) => `SUMIF(${A}X${a1}:X${b1},"${tag}",${A}${c}${a1}:${c}${b1})`;
    const oz = ozgarishSvodi(model);

    // 1) Smeta до/после izmeneniy (formulalar: yashirin «Изм.» ustuni bo'yicha SUMIF)
    if (oz.zamena.soni || oz.qoshimcha.soni || oz.istisno.soni) {
      sv.bolim('ИЗМЕНЕНИЯ СМЕТЫ: СМЕТА ДО ИЗМЕНЕНИЙ → ИСКЛЮЧАЕМЫЕ → ЗАМЕНА → ДОПОЛНИТЕЛЬНЫЕ РАБОТЫ → СМЕТА ПОСЛЕ ИЗМЕНЕНИЙ (ПРЯМЫЕ ЗАТРАТЫ, БЕЗ РАЗДЕЛОВ ПО СВОДУ)', { daraja: 0 });
      const ozQ: number[] = [];
      const satr = (nom: string, tags: readonly string[], s: OzgarishQism, rejaCol: 'G' | 'Y', faqatReja: boolean, minus = false) => {
        const sum = (c: string) => tags.map((t) => xs(t, c)).join('+');
        ozQ.push(sv.qator('oddiy', () => [ozQ.length + 1, nom,
          { f: `${minus ? '-(' : ''}${sum(rejaCol)}${minus ? ')' : ''}`, v: s.reja },
          faqatReja ? null : { f: sum('I'), v: s.fakt }, faqatReja ? null : { f: sum('K'), v: s.f2 },
          faqatReja ? null : { f: sum('U'), v: s.plus }, faqatReja ? null : { f: sum('V'), v: s.minus }, faqatReja ? null : { f: sum('O'), v: s.doplata }, null]));
      };
      satr('Смета до изменений (основные разделы, без свода)', ['ОСН', 'ИСК'], oz.asl, 'G', false);
      satr('(а) Замена: исключаемые позиции (заменены — минус)', ['ИСК'], oz.istisno, 'G', true, true);
      satr('(б) Замена: новые позиции (взамен исключаемых; план = объем × цена)', ['ЗАМ'], oz.zamena, 'Y', false);
      satr('(в) Дополнительные работы (нет в смете; план = объем × цена)', ['ДОП'], oz.qoshimcha, 'Y', false);
      sv.qator('vsego', () => [null, 'СМЕТА ПОСЛЕ ИЗМЕНЕНИЙ (ВСЕГО)', ...H.map((h, j): Qiymat => ({ f: sumRefs(h, ozQ), v: yaxlit2([oz.keyin.reja, oz.keyin.fakt, oz.keyin.f2, oz.keyin.plus, oz.keyin.minus, oz.keyin.doplata][j]) })), null]);
      sv.bosh();
      sv.izoh('Замена и дополнительные работы — отдельный слой: исходная смета не меняется. «По смете» для (б) и (в) — плановая сумма изменения (объем × цена); в основной ведомости замена стоит сразу под заменяемой позицией («взамен поз. N»). Исключаемая позиция входит в «Смета до изменений» и вычитается в (а).');
    }

    // 2) Bo'limlar bo'yicha (svodsiz, to'g'ri xarajat) — formulalar asosiy varaqqa havola
    sv.bolim('ПО РАЗДЕЛАМ: ПРЯМЫЕ ЗАТРАТЫ (БЕЗ НАКЛАДНЫХ, БЕЗ НДС, БЕЗ РАЗДЕЛОВ ПО СВОДУ)', { daraja: 0 });
    const satrlar: number[] = [];
    const jami = [0, 0, 0, 0, 0, 0];
    model.ildizlar.forEach((ri, k) => {
      const r = model.qatorlar[ri];
      const leaves = yaprokNon(ri).map(rowOf);
      const qiym: Array<number | null> = [r.smetaSumma, r.faktSumma, r.f2Summa, yigindi2(yaprokNon(ri).map((x) => model.qatorlar[x].doplataPlus ?? null)) ?? 0, yigindi2(yaprokNon(ri).map((x) => model.qatorlar[x].doplataMinus ?? null)) ?? 0, r.doplataSumma];
      const man = ['G', 'I', 'K', 'U', 'V', 'O'];
      satrlar.push(sv.qator('oddiy', [k + 1, bolimNomi(r),
        ...qiym.map((x, j): Qiymat => ({ f: j === 3 || j === 4 ? sumRefs(man[j], leaves).replace(/([A-Z]{1,2}\d+(?::[A-Z]{1,2}\d+)?)/g, `${A}$1`) : `${A}${man[j]}${rowOf(ri)}`, v: x ?? '' })),
        { f: `${A}Q${rowOf(ri)}`, v: r.nomalum }]));
      qiym.forEach((x, j) => { jami[j] += x ?? 0; });
    });
    const nomJ = ildizSumma(model);
    sv.qator('vsego', () => [null, 'ИТОГО: ПРЯМЫЕ ЗАТРАТЫ (БЕЗ РАЗДЕЛОВ ПО СВОДУ)', ...H.map((h, j): Qiymat => ({ f: satrlar.length ? sumRefs(h, satrlar) : '0', v: yaxlit2(jami[j]) })), { f: satrlar.length ? sumRefs('I', satrlar) : '0', v: nomJ }]);
    sv.bosh();

    // 3) Svod bo'limlari — bir marta: perereschet to'g'ri narxda; yaxlit summa podvalda
    let svodJamiQ: number[] = [];
    if (model.svodIldizlar.length) {
      sv.bolim('РАЗДЕЛЫ ПО СВОДУ (ЕДИНАЯ СУММА — В ПОДВАЛЕ; ЗДЕСЬ ТОЛЬКО ПЕРЕРАСЧЕТ ПО ПРЯМЫМ ЦЕНАМ)', { daraja: 0 });
      model.svodIldizlar.forEach((ri, k) => {
        const r = model.qatorlar[ri];
        const lv: number[] = []; const coll = (x: number) => { const t = model.qatorlar[x]; if (t.tur === 'barg') lv.push(x); else t.bolalar.forEach(coll); }; coll(ri);
        const sg = (c: string) => sumRefs(c, lv.map(rowOf)).replace(/([A-Z]{1,2}\d+(?::[A-Z]{1,2}\d+)?)/g, `${A}$1`);
        const fk = yigindi2(lv.map((x) => model.qatorlar[x].faktSumma)) ?? 0, f2 = yaxlit2(lv.reduce((t, x) => t + model.qatorlar[x].f2Summa, 0));
        const net = yigindi2(lv.map((x) => model.qatorlar[x].doplataSumma)) ?? 0;
        const [pl, mi] = split0(net);
        svodJamiQ.push(sv.qator('oddiy', [k + 1, `РАЗДЕЛ ПО СВОДУ: ${bolimNomi(r)}`, null, { f: sg('I'), v: fk }, { f: sg('K'), v: f2 }, { f: `MAX(${sg('O')},0)`, v: pl }, { f: `MIN(${sg('O')},0)`, v: mi }, { f: sg('O'), v: net }, null]));
      });
    }
    // 4) Podval jami (ustama va QQS bilan) — asosiy varaq podvaliga havola
    if (p.vsegoQator > 0) {
      sv.bolim('ИТОГО С НАКЛАДНЫМИ РАСХОДАМИ И НДС (ПОДВАЛ ОСНОВНОГО ЛИСТА; РАЗДЕЛЫ ПО СВОДУ — ОДИН РАЗ)', { daraja: 0 });
      const cell = (c: string, rr: number, x: number | null): Qiymat => ({ f: `${A}${c}${rr}`, v: x ?? '' });
      sv.qator('vsego', () => [null, 'ВСЕГО ПО ПОДВАЛУ (прямые → накладные → ИТОГО-4 → НДС → свод → ВСЕГО)',
        cell('G', p.vsegoQator, vs('G')), cell('I', p.vsegoQator, vs('I')), cell('K', p.vsegoQator, vs('K')), null, null, cell('O', p.vsegoQator, vs('O')), null]);
      if (yaxlit && yaxQator != null) sv.qator('oddiy', () => [null, 'в том числе: разделы по своду (единая сумма, с НДС)', cell('G', yaxQator, yaxlit!.G), cell('I', yaxQator, yaxlit!.I), cell('K', yaxQator, yaxlit!.K), null, null, cell('O', yaxQator, yaxlit!.O), null]);
      sv.bosh();
    }
    // 5) Bajarilmadi / исключаемые — alohida ro'yxat (jamiga qo'shilmaydi, qatorlar o'z joyida)
    const bajar = model.qatorlar.filter((q) => q.tur === 'barg' && q.bajarilmadi && q.svodId == null);
    const iskl = model.qatorlar.filter((q) => q.tur === 'barg' && q.ozgarish === 'ИСК');
    if (bajar.length || iskl.length) {
      sv.bolim('НЕ ВЫПОЛНЯЕТСЯ И ИСКЛЮЧАЕМЫЕ ПОЗИЦИИ (НА СВОИХ МЕСТАХ В ВЕДОМОСТИ; СУММА ПО СМЕТЕ — СПРАВОЧНО)', { daraja: 0 });
      const lst = (nom: string, arr: SlichitelniyQator[]) => {
        if (!arr.length) return;
        const idx = arr.map((q) => model.qatorlar.indexOf(q));
        const rr = idx.map(rowOf);
        sv.qator('oddiy', [null, `${nom}: ${arr.length} поз.`, { f: sumRefs('G', rr).replace(/([A-Z]{1,2}\d+(?::[A-Z]{1,2}\d+)?)/g, `${A}$1`), v: yigindi2(arr.map((q) => q.smetaSumma)) ?? 0 },
          { f: sumRefs('I', rr).replace(/([A-Z]{1,2}\d+(?::[A-Z]{1,2}\d+)?)/g, `${A}$1`), v: yigindi2(arr.map((q) => q.faktSumma)) ?? 0 }, null, null, null,
          { f: sumRefs('M', rr).replace(/([A-Z]{1,2}\d+(?::[A-Z]{1,2}\d+)?)/g, `${A}$1`), v: yigindi2(arr.map((q) => q.farqSumma)) ?? 0 }, null]);
      };
      lst('НЕ ВЫПОЛНЯЕТСЯ (отмечено «не выполнено»)', bajar);
      lst('ИСКЛЮЧАЕТСЯ (заменено другой позицией)', iskl);
      sv.izoh('Графа «Итого перерасчет (±)» в этих строках — отклонение «факт − смета» (минус = не выполнено). Позиции остаются в ведомости на своих местах и в итогах уже учтены; здесь — только перечень.');
      sv.bosh();
    }
    sv.izoh('К доплате (+) — выполнено больше, чем предъявлено по Ф-2; к снятию (−) — предъявлено по Ф-2 больше, чем выполнено. «Ранее предъявлено по Ф-2» — сумма утвержденных актов Ф-2 с учетом знака корректирующих (сторно) актов; сумма выполнения при наличии Ф-2 — по цене утвержденной Ф-2, иначе по сметной цене.');
    sv.izoh('Сумма к доплате и к снятию — по позициям (разницы раздела суммируются отдельно, взаимно не погашаются); разделы по своду — по разделу в целом. Итого перерасчет (±) = факт − предъявлено по Ф-2.');
    if (!(ndsFoiz != null && ndsQ != null)) sv.izoh('Ставка НДС / накладные расходы объекта не заданы — расчет с накладными и НДС не сформирован (проценты не принимаются равными 0).');
    const nomSoni = model.pereraschet.nomalum;
    if (nomSoni) sv.izoh(`Итог неполный: позиций, требующих внимания (нет количества, цены, выполнения или суммы Ф-2) — ${nomSoni}; они в суммы не включены (пустые, не 0) — перечень на листе «${ASOSIY_VARAQ}».`);
    varaqlar.push(sv);
  }

  // «Плюсы и минусы» — 20 ta eng katta pereraschet pozitsiyasi (to'g'ri narx): svod bo'limi BITTA pozitsiya.
  const svodPoz = [...svodG].map(([bid, idx]) => {
    const net = yigindi2(idx.map((k) => model.qatorlar[k].doplataSumma));
    const bq = model.qatorlar.find((r) => r.id === bid && r.tur !== 'itogo') ?? model.qatorlar.find((r) => r.id === bid);
    const q = { ...model.qatorlar[idx[0]], id: bid, kod: '', nom: `РАЗДЕЛ ПО СВОДУ: ${(bq?.nom ?? '').replace(/^ИТОГО ПО РАЗДЕЛУ:\s*/, '')}`, smetaSumma: null, faktSumma: yigindi2(idx.map((k) => model.qatorlar[k].faktSumma)), f2Summa: yaxlit2(idx.reduce((t, k) => t + model.qatorlar[k].f2Summa, 0)), doplataSumma: net, almashtirilganIdlar: undefined } as SlichitelniyQator;
    return { q, i: idx[0], svodBolim: true };
  });
  const doplataQ = [...model.qatorlar.map((q, i) => ({ q, i, svodBolim: false })).filter((x) => x.q.tur === 'barg' && x.q.yaxlitTaqsim == null && x.q.doplataSumma != null && Math.abs(x.q.doplataSumma) >= 0.005), ...svodPoz.filter((x) => x.q.doplataSumma != null && Math.abs(x.q.doplataSumma) >= 0.005)]
    .sort((a, b) => Math.abs(b.q.doplataSumma!) - Math.abs(a.q.doplataSumma!)).slice(0, 20);
  if (doplataQ.length) {
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
        pm.qator('oddiy', [k + 1, q.nom, null, qiy(q.faktSumma), q.f2Summa, qiy(q.doplataSumma),
          (q.doplataSumma! > 0 ? 'Плюс' : 'Минус') + ': раздел по своду в целом (единая сумма); перерасчет — по прямым ценам, внутренние строки раздела взаимно погашаются']);
        return;
      }
      pm.qator('oddiy', [k + 1, [q.kod, q.nom].filter(Boolean).join(' — '),
        { f: `${A}G${rowOf(i)}`, v: q.smetaSumma ?? '' },
        { f: `${A}I${rowOf(i)}`, v: q.faktSumma ?? '' },
        { f: `${A}K${rowOf(i)}`, v: q.f2SummaNomalum ? '' : q.f2Summa },
        { f: `${A}O${rowOf(i)}`, v: q.doplataSumma! },
        sabab(q)]);
    });
    pm.bosh();
    pm.izoh('Позиции отсортированы по модулю разницы «факт − ранее предъявлено по Ф-2». Полный перечень — на листе «' + ASOSIY_VARAQ + '» (графы 14–15), по разделам — «' + SVOD_VARAQ + '».');
    varaqlar.push(pm);
  }

  // Bekor qilingan Ф-2 lar — faqat ma'lumot ilovasi, jamiga kirmaydi.
  if (o.bekorAktlar?.length) {
    const bk = new RasmiyVaraq({
      nom: BEKOR_VARAQ, sarlavha: 'ОТМЕНЕННЫЕ АКТЫ Ф-2 (СПРАВОЧНО, В ИТОГИ НЕ ВХОДЯТ)', yonalish: 'landscape',
      ostSarlavha: [`объект: ${o.obyektNomi}; по состоянию на ${sanaRu}`],
      ustunlar: [
        { sarlavha: '№ п/п', kenglik: 7, tur: 'tartib' }, { sarlavha: 'Номер акта', kenglik: 22, tur: 'kod' }, { sarlavha: 'Дата', kenglik: 14, tur: 'kod' },
        { sarlavha: 'Сумма (без НДС), сум', kenglik: 22, tur: 'pul' }, { sarlavha: 'Заменен актом', kenglik: 26, tur: 'matn' }, { sarlavha: 'Причина', kenglik: 40, tur: 'matn' },
      ],
    });
    o.bekorAktlar.forEach((a, i) => bk.qator('oddiy', [i + 1, a.nomer, a.sana ?? '', a.summa ?? null, a.almashtirgan ?? '', a.sabab ?? '']));
    bk.bosh();
    bk.izoh('Отмененные акты Ф-2 не учитываются в «ранее предъявлено» и итогах; приведены для сведения (номер, дата, чем заменен).');
    varaqlar.push(bk);
  }

  // Alohida «Работы вне сметы» varag'i — faqat so'rovga ko'ra.
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
        vv.qator('oddiy', (n) => [i + 1, q.kod, q.nom, q.birlik, q.qoshimcha ? 'дополнительная работа' : 'замена', qiy(q.faktHajm), qiy(q.narx), { f: `IF(OR(F${n}="",G${n}=""),"",ROUND(F${n}*G${n},2))`, v: q.faktSumma ?? '' }]);
      });
      const summa = yigindi2(vne.map((q) => q.faktSumma));
      vv.qator('jami', () => [null, null, 'ИТОГО', null, null, null, null, { f: sumRefs('H', vne.map((_, i) => bosh2 + i)), v: summa ?? '' }]);
      vv.bosh();
      vv.izoh('Работы, которых нет в смете (дополнительные и замена): стоимость по сметным ценам (прямые затраты), без накладных расходов и НДС; в основной ведомости эти строки также отмечены.');
      varaqlar.push(vv);
    }
  }
  const { bytes } = rasmiyKitob(varaqlar, { tur: 'slichitelniy' });
  return { bytes, faylNomi: hujjatFaylNomi({ obyekt: o.obyektNomi, hujjat: 'СЛИЧИТЕЛЬНАЯ_ВЕДОМОСТЬ', davr: sana }), kOplata: { fakt: vs('I'), farq: vs('M'), doplata: vs('O') } };
}

const split0 = (d: number): [number, number] => [d > 0 ? d : 0, d < 0 ? d : 0];
const ildizSumma = (m: SlichitelniyModel): number => m.ildizlar.reduce((t, i) => t + m.qatorlar[i].nomalum, 0);

