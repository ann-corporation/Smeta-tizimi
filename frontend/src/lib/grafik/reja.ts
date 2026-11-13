/**
 * P6 GRAFIK (avto Gantt) + P7 CASHFLOW prognoz - sof hisoblar (React yo'q, test qilinadi).
 *
 * Yangi pul formulasi YO'Q: smeta/fakt summalari serverdagi yagona yadro (`_t2_summa_paket_v1`) paketidan keladi
 * (`SummaPaket`: QQS bilan -> ustamali -> ustamasiz). Razdel summalari (ustamasiz) faqat VAZN sifatida ishlatiladi:
 * paket summasi razdellar orasida shu vazn bo'yicha TAQSIMLANADI. NULL != 0: noma'lum qiymat `null` (UI "-").
 *
 * Davomiylik = razdelning o'z mehnati (chel-soat) / (brigada x smena soati); sukut: 10 kishi x 8 soat (ko'rsatiladi va tahrirlanadi).
 * Ketma-ketlik: razdel tartibi (tartib) bo'yicha ketma-ket; dam olish - yakshanba (6 kunlik hafta). Boshlanish: override -> shartnoma sanasi.
 * Mehnati yo'q razdel jadvalga qo'yilmaydi (o'ylab topilgan muddat yo'q) - uning ulushi "grafiksiz" deb alohida ko'rsatiladi.
 */
import { summaPaket, type SummaPaket } from '../summa-paket';

export const BRIGADA_SUKUT = 10;
export const SMENA_SUKUT = 8;
/** Reja foizi fakt foizidan shuncha oshsa - "kechikmoqda" (10 foiz punkti). */
export const KECHIKISH_CHEGARASI = 0.1;

export type RazdelXom = {
  id: number; ota_id: number | null; daraja: number; tartib: number; nom: string; kod: string | null;
  chel_soat: number; summa: number | null; narxsiz: number;
  fakt_summa: number | null; fakt_birinchi: string | null; fakt_oxirgi: string | null;
};
export type SozlamaQator = { razdel_id: number; brigada: number | null; smena_soat: number | null; boshlanish_sana: string | null; kun: number | null; versiya: number };
export type GrafikMalumot = {
  bugun: string; tomon: boolean;
  obyekt: { id: number; nom: string };
  razdellar: RazdelXom[];
  paketSmeta: SummaPaket | null; paketFakt: SummaPaket | null;
  shartnomaSana: string | null;
  f2Oylik: Array<{ oy: string; qqs_bilan: number | null; soni: number; f3_qqs_bilan: number | null; nomalum: number }>;
  tolovOylik: Array<{ oy: string; summa: number }>;
  sozlama: SozlamaQator[];
};

const son = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};
const sanaMi = (v: unknown): string | null => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);
const obyektmi = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const massiv = (x: unknown): Record<string, unknown>[] => (Array.isArray(x) ? x.filter(obyektmi) : []);

/** Server javobini (t2_grafik_reja_v1) tekshirib turga keltiradi; noto'g'ri bo'lsa `null`. */
export function grafikMalumot(raw: unknown): GrafikMalumot | null {
  if (!obyektmi(raw) || raw.ok !== true || !obyektmi(raw.obyekt)) return null;
  const bugun = sanaMi(raw.bugun);
  const oid = son(raw.obyekt.id);
  if (!bugun || oid == null) return null;
  return {
    bugun, tomon: raw.tomon === true,
    obyekt: { id: oid, nom: String(raw.obyekt.nom ?? '') },
    razdellar: massiv(raw.razdellar).map((r) => ({
      id: son(r.id) ?? 0, ota_id: son(r.ota_id), daraja: son(r.daraja) ?? 0, tartib: son(r.tartib) ?? 0, nom: String(r.nom ?? ''), kod: r.kod == null ? null : String(r.kod),
      chel_soat: son(r.chel_soat) ?? 0, summa: son(r.summa), narxsiz: son(r.narxsiz) ?? 0,
      fakt_summa: son(r.fakt_summa), fakt_birinchi: sanaMi(r.fakt_birinchi), fakt_oxirgi: sanaMi(r.fakt_oxirgi),
    })).filter((r) => r.id > 0),
    paketSmeta: summaPaket(raw.paket_smeta), paketFakt: summaPaket(raw.paket_fakt),
    shartnomaSana: sanaMi(raw.shartnoma_sana),
    f2Oylik: massiv(raw.f2_oylik).map((r) => ({ oy: sanaMi(r.oy) ?? '', qqs_bilan: son(r.qqs_bilan), soni: son(r.soni) ?? 0, f3_qqs_bilan: son(r.f3_qqs_bilan), nomalum: son(r.nomalum) ?? 0 })).filter((r) => r.oy),
    tolovOylik: massiv(raw.tolov_oylik).map((r) => ({ oy: sanaMi(r.oy) ?? '', summa: son(r.summa) ?? 0 })).filter((r) => r.oy),
    sozlama: massiv(raw.sozlama).map((r) => ({
      razdel_id: son(r.razdel_id) ?? 0, brigada: son(r.brigada), smena_soat: son(r.smena_soat), boshlanish_sana: sanaMi(r.boshlanish_sana), kun: son(r.kun), versiya: son(r.versiya) ?? 1,
    })),
  };
}

/* ── Kalendar (UTC kun raqami; yakshanba - dam) ───────────────────────────── */
const MS = 86_400_000;
export const kunRaqami = (iso: string): number => Math.floor(Date.parse(iso.slice(0, 10) + 'T00:00:00Z') / MS);
export const isoKun = (n: number): string => new Date(n * MS).toISOString().slice(0, 10);
const yakshanbami = (n: number) => (((n + 4) % 7) + 7) % 7 === 0;
const ishgaOt = (n: number) => (yakshanbami(n) ? n + 1 : n);
/** n - ish kuni; k ish kunidan keyingi ish kuni. */
function ishKunQosh(n: number, k: number): number {
  let m = n + Math.floor(k / 6) * 7; let r = k % 6;
  while (r > 0) { m += 1; if (!yakshanbami(m)) r -= 1; }
  return m;
}
/** [a, b] oralig'idagi ish kunlari soni (ikkala chegara kiradi). */
export function ishKunlari(a: number, b: number): number {
  if (b < a) return 0;
  const yaksh = Math.floor((b + 4) / 7) - Math.floor((a + 3) / 7);
  return b - a + 1 - yaksh;
}

export type Birlamchi = { brigada: number; smena: number };
export type Holat = 'bajarildi' | 'kechikmoqda' | 'vaqtida' | 'oldinda' | 'boshlanmagan' | 'malumot_yoq';

export type GrafikQator = {
  id: number; otaId: number | null; daraja: number; nom: string; kod: string | null;
  /** O'z ishi bormi (mehnat bor -> jadvalga qo'yilgan). */
  oz: null | { chelSoat: number; brigada: number; smena: number; kun: number; kunManba: 'override' | 'hisob'; bosh: string; tugash: string; override: boolean };
  /** Mehnati yo'q, lekin summasi bor - grafiksiz. */
  grafiksiz: boolean;
  /** O'z summasi (ustamasiz vazn) va butun daraxt yig'indisi. */
  summaOz: number | null; summaJami: number | null; narxsiz: number;
  /** Butun daraxt oralig'i (o'z + bolalar). */
  bosh: string | null; tugash: string | null;
  rejaFoiz: number | null; faktFoiz: number | null;
  faktBosh: string | null; faktTugash: string | null;
  holat: Holat; kechikishKun: number;
  bolalar: number;
};

export type GrafikNatija = {
  qatorlar: GrafikQator[];
  boshSana: string | null; boshManba: 'override' | 'shartnoma' | null;
  tugashSana: string | null;
  jamiChelSoat: number; jamiIshKun: number | null;
  birlamchi: Birlamchi;
  kechikmoqda: number; grafiksizSoni: number; grafiksizSummaUlush: number | null;
};

const qisqa = (x: number) => Math.max(0, Math.min(1, x));

/** Razdel foizlari: reja (sana bo'yicha) va fakt (summa bo'yicha, ustamasiz vazn). */
function rejaFoizi(bosh: string, tugash: string, kun: number, bugun: string): number {
  const b = kunRaqami(bosh); const t = kunRaqami(tugash); const d = kunRaqami(bugun);
  if (d < b) return 0;
  if (d >= t) return 1;
  return qisqa(ishKunlari(b, d) / Math.max(1, kun));
}

function holatniAniqla(reja: number | null, fakt: number | null, bosh: string | null, tugash: string | null, bugun: string, faktBor: boolean): { holat: Holat; kechikishKun: number; dur: number } {
  if (fakt != null && fakt >= 0.99) return { holat: 'bajarildi', kechikishKun: 0, dur: 0 };
  if (bosh == null || tugash == null || reja == null) return { holat: 'malumot_yoq', kechikishKun: 0, dur: 0 };
  const dur = Math.max(1, ishKunlari(kunRaqami(bosh), kunRaqami(tugash)));
  if (reja <= 0 && !faktBor) return { holat: 'boshlanmagan', kechikishKun: 0, dur };
  if (fakt == null) return { holat: faktBor ? 'malumot_yoq' : (reja > KECHIKISH_CHEGARASI ? 'kechikmoqda' : 'boshlanmagan'), kechikishKun: faktBor ? 0 : Math.ceil(reja * dur), dur };
  if (reja - fakt > KECHIKISH_CHEGARASI) return { holat: 'kechikmoqda', kechikishKun: Math.ceil((reja - fakt) * dur), dur };
  if (fakt - reja > KECHIKISH_CHEGARASI) return { holat: 'oldinda', kechikishKun: 0, dur };
  return { holat: 'vaqtida', kechikishKun: 0, dur };
}

export function grafikHisobla(m: GrafikMalumot, bugun: string = m.bugun): GrafikNatija {
  const soz = new Map(m.sozlama.map((s) => [s.razdel_id, s]));
  const obS = soz.get(0);
  const birlamchi: Birlamchi = { brigada: obS?.brigada ?? BRIGADA_SUKUT, smena: obS?.smena_soat ?? SMENA_SUKUT };
  const boshSana = obS?.boshlanish_sana ?? m.shartnomaSana ?? null;
  const boshManba: GrafikNatija['boshManba'] = obS?.boshlanish_sana ? 'override' : m.shartnomaSana ? 'shartnoma' : null;

  const rows = [...m.razdellar].sort((a, b) => a.tartib - b.tartib || a.id - b.id);
  const idlar = new Set(rows.map((r) => r.id));
  const bolalar = new Map<number, number[]>();
  for (const r of rows) if (r.ota_id != null && idlar.has(r.ota_id)) bolalar.set(r.ota_id, [...(bolalar.get(r.ota_id) ?? []), r.id]);

  /* 1) Ketma-ket joylashtirish (tartib bo'yicha, faqat o'z mehnati bor razdellar). */
  type Oz = NonNullable<GrafikQator['oz']> & { startN: number; endN: number };
  const ozlar = new Map<number, Oz>();
  let kursor: number | null = boshSana ? kunRaqami(boshSana) : null;
  let jamiChel = 0; let jamiKun = 0;
  for (const r of rows) {
    if (!(r.chel_soat > 0)) continue;
    const s = soz.get(r.id);
    const brigada = s?.brigada ?? birlamchi.brigada; const smena = s?.smena_soat ?? birlamchi.smena;
    const hisobKun = Math.max(1, Math.ceil(r.chel_soat / (brigada * smena)));
    const kun = s?.kun ?? hisobKun;
    jamiChel += r.chel_soat; jamiKun += kun;
    const ovS = s?.boshlanish_sana ? kunRaqami(s.boshlanish_sana) : null;
    const startRaw = ovS ?? kursor;
    if (startRaw == null) { ozlar.set(r.id, { chelSoat: r.chel_soat, brigada, smena, kun, kunManba: s?.kun != null ? 'override' : 'hisob', bosh: '', tugash: '', override: !!s, startN: -1, endN: -1 }); continue; }
    const startN = ishgaOt(startRaw); const endN = ishKunQosh(startN, kun - 1);
    kursor = endN + 1;
    ozlar.set(r.id, { chelSoat: r.chel_soat, brigada, smena, kun, kunManba: s?.kun != null ? 'override' : 'hisob', bosh: isoKun(startN), tugash: isoKun(endN), override: !!s, startN, endN });
  }

  /* 2) Daraxt bo'yicha yig'ish (bolalar tartibidan kech emas: tartib global, shuning uchun teskari yurish). */
  const byId = new Map(rows.map((r) => [r.id, r]));
  type Agg = { summa: number | null; vaznReja: number; vaznFakt: number; rejaS: number; faktS: number; faktVazn: number; bosh: number | null; tugash: number | null; fb: string | null; ft: string | null; narxsiz: number };
  const agg = new Map<number, Agg>();
  const hisobla = (id: number): Agg => {
    const c = agg.get(id); if (c) return c;
    const r = byId.get(id)!; const oz = ozlar.get(id);
    const a: Agg = { summa: r.summa, vaznReja: 0, vaznFakt: 0, rejaS: 0, faktS: 0, faktVazn: 0, bosh: oz && oz.startN >= 0 ? oz.startN : null, tugash: oz && oz.startN >= 0 ? oz.endN : null, fb: r.fakt_birinchi, ft: r.fakt_oxirgi, narxsiz: r.narxsiz };
    agg.set(id, a);
    // O'z ishining foizi: vazn = o'z summasi (yoki yo'q bo'lsa chel-soat).
    if (oz && oz.startN >= 0) {
      const w = r.summa != null && r.summa > 0 ? r.summa : 0;
      const rf = rejaFoizi(oz.bosh, oz.tugash, oz.kun, bugun);
      a.vaznReja += w; a.rejaS += w * rf;
      if (w > 0 && r.fakt_summa != null) { a.vaznFakt += w; a.faktS += w * qisqa(r.fakt_summa / w); }
    }
    for (const cid of bolalar.get(id) ?? []) {
      const ca = hisobla(cid);
      a.summa = a.summa == null && ca.summa == null ? null : (a.summa ?? 0) + (ca.summa ?? 0);
      a.vaznReja += ca.vaznReja; a.rejaS += ca.rejaS; a.vaznFakt += ca.vaznFakt; a.faktS += ca.faktS;
      a.bosh = ca.bosh == null ? a.bosh : a.bosh == null ? ca.bosh : Math.min(a.bosh, ca.bosh);
      a.tugash = ca.tugash == null ? a.tugash : a.tugash == null ? ca.tugash : Math.max(a.tugash, ca.tugash);
      if (ca.fb && (!a.fb || ca.fb < a.fb)) a.fb = ca.fb;
      if (ca.ft && (!a.ft || ca.ft > a.ft)) a.ft = ca.ft;
      a.narxsiz += ca.narxsiz;
    }
    return a;
  };

  let kechikmoqda = 0; let grafiksizSoni = 0; let grafiksizSumma = 0; let summaJami = 0; let summaBor = false;
  const qatorlar: GrafikQator[] = [];
  const chuq = (r: RazdelXom) => { let d = 0; let p = r.ota_id; while (p != null && idlar.has(p) && d < 12) { d += 1; p = byId.get(p)!.ota_id; } return d; };
  for (const r of rows) {
    const a = hisobla(r.id); const oz = ozlar.get(r.id);
    const rejaFoiz = a.vaznReja > 0 ? a.rejaS / a.vaznReja : null;
    const faktFoiz = a.vaznFakt > 0 ? a.faktS / a.vaznFakt : null;
    const bosh = a.bosh != null ? isoKun(a.bosh) : null; const tugash = a.tugash != null ? isoKun(a.tugash) : null;
    const faktBor = !!(a.fb || a.ft);
    const h = holatniAniqla(rejaFoiz, faktFoiz, bosh, tugash, bugun, faktBor);
    const grafiksiz = !oz && r.summa != null && r.summa > 0 && !(r.chel_soat > 0);
    if (grafiksiz) { grafiksizSoni += 1; grafiksizSumma += r.summa ?? 0; }
    if (r.summa != null) { summaJami += r.summa; summaBor = true; }
    if (!bolalar.has(r.id) && h.holat === 'kechikmoqda') kechikmoqda += 1;
    qatorlar.push({
      id: r.id, otaId: r.ota_id != null && idlar.has(r.ota_id) ? r.ota_id : null, daraja: chuq(r), nom: r.nom, kod: r.kod,
      oz: oz ? { chelSoat: oz.chelSoat, brigada: oz.brigada, smena: oz.smena, kun: oz.kun, kunManba: oz.kunManba, bosh: oz.bosh, tugash: oz.tugash, override: oz.override } : null,
      grafiksiz, summaOz: r.summa, summaJami: a.summa, narxsiz: a.narxsiz, bosh, tugash, rejaFoiz, faktFoiz,
      faktBosh: a.fb, faktTugash: a.ft, holat: h.holat, kechikishKun: h.kechikishKun, bolalar: (bolalar.get(r.id) ?? []).length,
    });
  }
  const tugashN = [...ozlar.values()].reduce<number | null>((t, o) => (o.endN >= 0 && (t == null || o.endN > t) ? o.endN : t), null);
  return {
    qatorlar, boshSana, boshManba, tugashSana: tugashN != null ? isoKun(tugashN) : null,
    jamiChelSoat: jamiChel, jamiIshKun: boshSana ? jamiKun : null, birlamchi, kechikmoqda, grafiksizSoni,
    grafiksizSummaUlush: summaBor && summaJami > 0 ? grafiksizSumma / summaJami : null,
  };
}

/* ── P7: oylik cashflow ──────────────────────────────────────────────────── */
export type OyQatori = {
  oy: string;
  /** Grafikdan rejalashtirilgan ijro (QQS bilan, yadro paketidan taqsimlangan). `null` - paket yo'q. */
  reja: number | null;
  /** F2 reestridagi haqiqiy hisoblangan (QQS bilan). */
  hisoblangan: number | null; f3: number | null; hisoblanganNomalum: number;
  tolangan: number | null;
  /** Kutilayotgan hisob (joriy va kelgusi oylar). */
  prognoz: number | null;
  /** O'tgan / joriy / kelgusi. */
  davr: 'otgan' | 'joriy' | 'kelgusi';
};
export type CashflowNatija = {
  oylar: OyQatori[];
  /** Ustamali va ustamasiz nisbatlari: paketdagi (qqs_bilan) ga nisbatan - oylik reja uchlikni shu nisbat bilan taqsimlaydi. */
  nisbat: { ustamali: number; ustamasiz: number } | null;
  jamiReja: number | null; jamiHisoblangan: number; jamiTolangan: number;
  hisoblanmaganFakt: number | null; tolanmaganQoldiq: number;
  grafiksizSumma: number | null;
  sana: { bosh: string | null };
};

const oyBoshi = (iso: string) => iso.slice(0, 7) + '-01';
function oyQosh(oy: string, k: number): string {
  const [y, mo] = oy.split('-').map(Number);
  const t = (y * 12 + (mo - 1)) + k;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}-01`;
}
const oyKunlari = (oy: string): [number, number] => [kunRaqami(oy), kunRaqami(oyQosh(oy, 1)) - 1];

/**
 * Grafik x smeta paketi -> oylik reja; F2 reestri va to'lovlar -> haqiqat; prognoz:
 *  - o'tgan oylar: faqat haqiqat (prognoz yo'q);
 *  - joriy oy: shu oy rejasi + hali hisoblanmagan bajarilgan ish (fakt - hisoblangan; fakt noma'lum bo'lsa o'tgan oylar rejasi - hisoblangan);
 *  - kelgusi oylar: oylik reja.
 */
export function cashflowHisobla(m: GrafikMalumot, g: GrafikNatija, bugun: string = m.bugun): CashflowNatija {
  const paket = m.paketSmeta;
  const jamiVazn = m.razdellar.reduce((s, r) => s + (r.summa != null && r.summa > 0 ? r.summa : 0), 0);
  const reja = new Map<string, number>();
  if (paket && jamiVazn > 0) {
    for (const q of g.qatorlar) {
      if (!q.oz || q.oz.bosh === '') continue;
      const w = q.summaOz; if (w == null || w <= 0) continue;
      const miqdor = paket.qqs_bilan * (w / jamiVazn);
      const b = kunRaqami(q.oz.bosh); const t = kunRaqami(q.oz.tugash); const kunlar = ishKunlari(b, t);
      if (kunlar <= 0) continue;
      for (let oy = oyBoshi(q.oz.bosh); oy <= q.oz.tugash; oy = oyQosh(oy, 1)) {
        const [a0, a1] = oyKunlari(oy);
        const k = ishKunlari(Math.max(a0, b), Math.min(a1, t));
        if (k > 0) reja.set(oy, (reja.get(oy) ?? 0) + miqdor * (k / kunlar));
      }
    }
  }
  const f2 = new Map(m.f2Oylik.map((x) => [oyBoshi(x.oy), x]));
  const tl = new Map(m.tolovOylik.map((x) => [oyBoshi(x.oy), x.summa]));
  const barcha = [...reja.keys(), ...f2.keys(), ...tl.keys()].sort();
  const joriy = oyBoshi(bugun);
  const oylar: OyQatori[] = [];
  if (barcha.length) {
    const bosh = barcha[0]; const oxir = barcha[barcha.length - 1] > joriy ? barcha[barcha.length - 1] : joriy;
    for (let oy = bosh, n = 0; oy <= oxir && n < 120; oy = oyQosh(oy, 1), n += 1) {
      const x = f2.get(oy);
      oylar.push({ oy, reja: paket ? (reja.get(oy) ?? 0) : null, hisoblangan: x ? x.qqs_bilan : null, f3: x ? x.f3_qqs_bilan : null, hisoblanganNomalum: x?.nomalum ?? 0,
        tolangan: tl.has(oy) ? tl.get(oy)! : null, prognoz: null, davr: oy < joriy ? 'otgan' : oy === joriy ? 'joriy' : 'kelgusi' });
    }
  }
  const jamiHisob = m.f2Oylik.reduce((s, x) => s + (x.qqs_bilan ?? 0), 0);
  const jamiTolov = m.tolovOylik.reduce((s, x) => s + x.summa, 0);
  const faktQqs = m.paketFakt ? m.paketFakt.qqs_bilan : null;
  const otganReja = oylar.filter((o) => o.davr === 'otgan').reduce((s, o) => s + (o.reja ?? 0), 0);
  const hisoblanmaganFakt = faktQqs != null ? Math.max(0, faktQqs - jamiHisob) : null;
  const qoldiq = hisoblanmaganFakt ?? (paket ? Math.max(0, otganReja - jamiHisob) : null);
  for (const o of oylar) {
    if (o.davr === 'otgan') continue;
    if (o.reja == null && qoldiq == null) continue;
    o.prognoz = (o.reja ?? 0) + (o.davr === 'joriy' ? (qoldiq ?? 0) : 0);
  }
  const nisbat = paket && paket.qqs_bilan > 0 ? { ustamali: paket.ustamali / paket.qqs_bilan, ustamasiz: paket.ustamasiz / paket.qqs_bilan } : null;
  const grafiksizUlush = g.grafiksizSummaUlush;
  return {
    oylar, nisbat, jamiReja: paket && jamiVazn > 0 ? [...reja.values()].reduce((s, v) => s + v, 0) : null,
    jamiHisoblangan: jamiHisob, jamiTolangan: jamiTolov, hisoblanmaganFakt, tolanmaganQoldiq: Math.max(0, jamiHisob - jamiTolov),
    grafiksizSumma: paket && grafiksizUlush != null ? paket.qqs_bilan * grafiksizUlush : null,
    sana: { bosh: g.boshSana },
  };
}
