/**
 * hujjat-yozuvchi/dizayn.ts — «Hujjat dizayni»: BITTA uslub hal qiluvchi (resolver).
 *
 * Egasi (2026-11-03): barcha rasmiy hujjatlarda (F2, Forma-3, nakopitelniy, ostatka, smeta eksportlari, LRV, M-29,
 * obosnovanie …) daraja uslubi bir xil bo'lsin va kompaniya sozlamasidan boshqarilsin:
 *   - «Тип» (BL/RS/MAT/OB) belgi ustuni sukut bo'yicha YASHIRIN (hidden, chop etilmaydi);
 *   - BL qalin; RS kursiv, kichikroq, och kulrang; MAT/OB qalin + o'z och foni; bo'lim — rangli keng tasma;
 *   - jami/ВСЕГО qalin, alohida fon va qo'sh yuqori chiziq; har katakda ingichka ramka;
 *   - nomlar daraja bo'yicha otstup (razdel 0, BL 1, RS 2).
 * Barcha generatorlar `RasmiyVaraq.qator()` orqali shu yerdan o'tadi — alohida qo'lbola uslub yo'q.
 * Pul/formula hech qachon bu yerda o'zgarmaydi: faqat ko'rinish.
 */

export const DARAJALAR = ['rz', 'bl', 'rs', 'mat', 'ob', 'jami', 'vsego'] as const;
export type DarajaKalit = typeof DARAJALAR[number];

export type DarajaUslubi = {
  qalin: boolean;
  kursiv: boolean;
  /** Asosiy shriftga nisbatan pt farqi (−2…+4). */
  olchamQosh: number;
  /** Matn rangi (6 belgili hex) yoki null — qora. */
  matnRang: string | null;
  /** Fon (6 belgili hex) yoki null — rang mavzusidan. */
  fon: string | null;
  /** alignment.indent (nom ustuni). */
  otstup: number;
};

export type DizaynPreset = 'klassik' | 'kontrastli' | 'minimal';
export type ChegaraTuri = 'thin' | 'hair' | 'medium' | 'none';

export type HujjatDizayn = {
  versiya: 1;
  preset: DizaynPreset | 'maxsus';
  shrift: { nom: string; olcham: number };
  /** «Тип» belgi ustuni ko'rinsinmi (sukut yo'q — yashirin). */
  tipKorsat: boolean;
  xonaPul: number;
  xonaHajm: number;
  chegara: ChegaraTuri;
  /** BL qatorida yuqori chiziq qalinroq (yangi ish ko'rinsin). */
  blQalinChiziq: boolean;
  /** Jami/ВСЕГО yuqorisida qo'sh chiziq. */
  jamiQosChiziq: boolean;
  sarlavhaFon: string | null;
  zebra: boolean;
  zebraFon: string;
  chekka: { chap: number; ong: number; yuqori: number; past: number };
  yonalish: 'auto' | 'portrait' | 'landscape';
  daraja: Record<DarajaKalit, DarajaUslubi>;
};

export const SHRIFTLAR = ['Times New Roman', 'Arial', 'Calibri', 'Cambria', 'Tahoma', 'Verdana'] as const;

const d = (qalin: boolean, kursiv: boolean, olchamQosh: number, matnRang: string | null, fon: string | null, otstup: number): DarajaUslubi => ({ qalin, kursiv, olchamQosh, matnRang, fon, otstup });

const BAZA: Omit<HujjatDizayn, 'preset' | 'daraja'> = {
  versiya: 1,
  shrift: { nom: 'Times New Roman', olcham: 10 },
  tipKorsat: false,
  xonaPul: 2,
  xonaHajm: 3,
  chegara: 'thin',
  blQalinChiziq: true,
  jamiQosChiziq: true,
  sarlavhaFon: null,
  zebra: false,
  zebraFon: 'F7F7F7',
  chekka: { chap: 0.4, ong: 0.4, yuqori: 0.5, past: 0.6 },
  yonalish: 'auto',
};

export const DIZAYN_PRESETLAR: Record<DizaynPreset, HujjatDizayn> = {
  // Chop etishda ham, kulrang shkalada ham farqlanadi: fon yorqinligi daraja bo'yicha har xil.
  kontrastli: {
    ...BAZA, preset: 'kontrastli', sarlavhaFon: 'D0D8E8',
    daraja: {
      rz: d(true, false, 1, null, 'BDD7EE', 0),
      bl: d(true, false, 0, null, 'FFFFFF', 1),
      rs: d(false, true, -1, '595959', null, 2),
      mat: d(true, false, 0, null, 'E2EFDA', 2),
      ob: d(true, false, 0, null, 'FCE4D6', 2),
      jami: d(true, false, 0, null, 'D9D9D9', 0),
      vsego: d(true, false, 1, null, 'BFBFBF', 0),
    },
  },
  klassik: {
    ...BAZA, preset: 'klassik', blQalinChiziq: false,
    daraja: {
      rz: d(true, false, 0, null, null, 0),
      bl: d(true, false, 0, null, null, 1),
      rs: d(false, true, 0, null, null, 2),
      mat: d(true, false, 0, null, null, 2),
      ob: d(true, false, 0, null, null, 2),
      jami: d(true, false, 0, null, null, 0),
      vsego: d(true, false, 0, null, null, 0),
    },
  },
  minimal: {
    ...BAZA, preset: 'minimal', chegara: 'hair', blQalinChiziq: false, jamiQosChiziq: false,
    daraja: {
      rz: d(true, false, 0, null, null, 0),
      bl: d(true, false, 0, null, null, 0),
      rs: d(false, true, -1, '595959', null, 1),
      mat: d(true, false, 0, null, null, 1),
      ob: d(true, false, 0, null, null, 1),
      jami: d(true, false, 0, null, null, 0),
      vsego: d(true, false, 0, null, null, 0),
    },
  },
};

export const SUKUT_DIZAYN: HujjatDizayn = DIZAYN_PRESETLAR.kontrastli;
export const DIZAYN_PRESET_NOMI: Record<DizaynPreset, string> = { klassik: 'Klassik', kontrastli: 'Kontrastli', minimal: 'Minimal' };

const HEX = /^[0-9A-Fa-f]{6}$/;
const hexmi = (x: unknown): x is string => typeof x === 'string' && HEX.test(x);
const son = (x: unknown, lo: number, hi: number, sukut: number): number => {
  const n = typeof x === 'number' ? x : Number.NaN;
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : sukut;
};
const rec = (x: unknown): Record<string, unknown> => (x && typeof x === 'object' && !Array.isArray(x) ? x as Record<string, unknown> : {});

/** Saqlangan (ishonchsiz) JSON → to'g'ri HujjatDizayn. Noto'g'ri maydon — preset qiymati (sukut). */
export function dizaynTozala(xom: unknown): HujjatDizayn {
  const r = rec(xom);
  const presetKalit = (r.preset as string) in DIZAYN_PRESETLAR ? r.preset as DizaynPreset : 'kontrastli';
  const p = DIZAYN_PRESETLAR[presetKalit];
  const sh = rec(r.shrift);
  const ch = rec(r.chekka);
  const dr = rec(r.daraja);
  const daraja = Object.fromEntries(DARAJALAR.map((k) => {
    const x = rec(dr[k]); const s = p.daraja[k];
    return [k, {
      qalin: typeof x.qalin === 'boolean' ? x.qalin : s.qalin,
      kursiv: typeof x.kursiv === 'boolean' ? x.kursiv : s.kursiv,
      olchamQosh: Math.round(son(x.olchamQosh, -3, 4, s.olchamQosh)),
      matnRang: x.matnRang === null ? null : hexmi(x.matnRang) ? x.matnRang.toUpperCase() : s.matnRang,
      fon: x.fon === null ? null : hexmi(x.fon) ? x.fon.toUpperCase() : s.fon,
      otstup: Math.round(son(x.otstup, 0, 6, s.otstup)),
    } satisfies DarajaUslubi];
  })) as Record<DarajaKalit, DarajaUslubi>;
  const nom = typeof sh.nom === 'string' && (SHRIFTLAR as readonly string[]).includes(sh.nom) ? sh.nom : p.shrift.nom;
  return {
    versiya: 1,
    preset: r.preset === 'maxsus' ? 'maxsus' : presetKalit,
    shrift: { nom, olcham: Math.round(son(sh.olcham, 7, 14, p.shrift.olcham)) },
    tipKorsat: typeof r.tipKorsat === 'boolean' ? r.tipKorsat : p.tipKorsat,
    xonaPul: Math.round(son(r.xonaPul, 0, 4, p.xonaPul)),
    xonaHajm: Math.round(son(r.xonaHajm, 0, 6, p.xonaHajm)),
    chegara: r.chegara === 'thin' || r.chegara === 'hair' || r.chegara === 'medium' || r.chegara === 'none' ? r.chegara : p.chegara,
    blQalinChiziq: typeof r.blQalinChiziq === 'boolean' ? r.blQalinChiziq : p.blQalinChiziq,
    jamiQosChiziq: typeof r.jamiQosChiziq === 'boolean' ? r.jamiQosChiziq : p.jamiQosChiziq,
    sarlavhaFon: r.sarlavhaFon === null ? null : hexmi(r.sarlavhaFon) ? r.sarlavhaFon.toUpperCase() : p.sarlavhaFon,
    zebra: typeof r.zebra === 'boolean' ? r.zebra : p.zebra,
    zebraFon: hexmi(r.zebraFon) ? r.zebraFon.toUpperCase() : p.zebraFon,
    chekka: {
      chap: son(ch.chap, 0, 2, p.chekka.chap), ong: son(ch.ong, 0, 2, p.chekka.ong),
      yuqori: son(ch.yuqori, 0, 2, p.chekka.yuqori), past: son(ch.past, 0, 2, p.chekka.past),
    },
    yonalish: r.yonalish === 'portrait' || r.yonalish === 'landscape' ? r.yonalish : 'auto',
    daraja,
  };
}

/**
 * Joriy dizayn. Manba tartibi: kompaniya sozlamasidan sinxronlangan brauzer nusxasi (sahifa «Hujjatlar dizayni»
 * saqlaydi, server kaliti `hujjat.dizayn` → `_uslub`) → `hujjatDizayniniOrnat` → sukut «Kontrastli».
 * Generatorlar sinxron ishlaydi, shuning uchun brauzer nusxasi o'qiladi (rang mavzusi bilan bir xil yo'l).
 */
export const DIZAYN_SAQLASH_KALITI = 'hujjat-dizayn-uslub';
let joriy: HujjatDizayn = SUKUT_DIZAYN;
let keshSatr: string | null = null;
let keshDizayn: HujjatDizayn | null = null;
export function hujjatDizayniniOrnat(x: unknown | null | undefined): void { joriy = x == null ? SUKUT_DIZAYN : dizaynTozala(x); }
export function joriyHujjatDizayni(): HujjatDizayn {
  try {
    const s = globalThis.localStorage?.getItem(DIZAYN_SAQLASH_KALITI);
    if (s) {
      if (s !== keshSatr) { keshDizayn = dizaynTozala(JSON.parse(s)); keshSatr = s; }
      if (keshDizayn) return keshDizayn;
    }
  } catch { /* xususiy rejim / buzuq JSON — sukut */ }
  return joriy;
}
/** Brauzer nusxasiga yozadi (server sinxroni sahifada). null — sukutga qaytaradi. */
export function hujjatDizayniniSaqla(d: HujjatDizayn | null): void {
  try {
    if (d == null) globalThis.localStorage?.removeItem(DIZAYN_SAQLASH_KALITI);
    else globalThis.localStorage?.setItem(DIZAYN_SAQLASH_KALITI, JSON.stringify(d));
  } catch { /* saqlanmasa — sukut ishlaydi */ }
}

/** Qator turi + belgi + xarajat toifasidan daraja. null — oddiy (darajasiz) qator. */
export function darajaAniqla(tur: 'oddiy' | 'ish' | 'bolim' | 'jami' | 'vsego', belgi?: unknown, rang?: string | null): DarajaKalit | null {
  if (tur === 'vsego') return 'vsego';
  if (tur === 'jami') return 'jami';
  if (tur === 'bolim') return 'rz';
  if (tur === 'ish') return 'bl';
  const b = typeof belgi === 'string' ? belgi.trim().toLowerCase() : '';
  if (b === 'bl') return 'bl';
  if (b === 'rz') return 'rz';
  if (b === 'rs') return 'rs';
  if (b === 'mat') return 'mat';
  if (b === 'ob') return 'ob';
  if (rang === 'МАТ') return 'mat';
  if (rang === 'ОБ') return 'ob';
  if (rang === 'ЧЕЛ' || rang === 'МАШ' || rang === 'КАБ' || rang === 'М/К' || rang === 'БЕЗ СКЛАД') return 'rs';
  return null;
}

/** Soni formatlangan holda ko'rinadigan belgilar uzunligi (minglik ajratgich + o'nlik) — ustun eni uchun. */
export function sonUzunligi(x: number, minO: number, maxO: number): number {
  if (!Number.isFinite(x)) return 1;
  const a = Math.abs(x);
  const s = a.toFixed(maxO).replace(/0+$/, '');
  const nuqta = s.indexOf('.');
  const butun = nuqta < 0 ? s.length : nuqta;
  let o = nuqta < 0 ? 0 : s.length - nuqta - 1;
  o = Math.max(minO, o);
  return butun + Math.floor((Math.max(butun, 1) - 1) / 3) + (o > 0 ? o + 1 : 0) + (x < 0 ? 1 : 0);
}
