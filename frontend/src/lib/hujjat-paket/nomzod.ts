/**
 * Hujjatlar paketi (universal) - TOZA mantiq: nomzodlar (server RPC `t2_hujjat_paket_nomzod_v1`), filtr, daraxt, uch holatli tanlov,
 * paket rejasi (nimani Diskdan olish / nimani yasash), token bahosi va ZIP yo'llari. UI ham, MCP ham, Telegram ham shu modulni ishlatadi.
 * Yangi hisob YO'Q: hujjatni yasash `/api/hujjat-yarat` (mavjud dvigatel + token + Disk), mavjud Disk versiyasi BEPUL.
 *
 * Egasi qoidalari: obyekt x oy = bitta F-2 (takror/taxminiy paketga kirmaydi), bekor kirmaydi; summalar bu modulda hisoblanmaydi.
 */

export type PaketHolat = 'qoralama' | 'tasdiqlangan' | 'joriy';
export type PaketTur = 'f2' | 'forma3' | 'nakopitelniy' | 'm29' | 'slichitelniy' | 'ostatka' | 'aosr';

/** Server qaytaradigan nomzod (SQL `t2_hujjat_paket_nomzod_v1` bilan bir xil maydonlar). */
export type Nomzod = {
  kalit: string; tur: PaketTur | string; sarlavha: string; holat: PaketHolat;
  loyiha_id: number | null; loyiha_nom: string | null; shartnoma_id: number | null; shartnoma_raqam: string | null;
  obyekt_id: number | null; obyekt_nom: string | null; oy: string | null;
  akt_id: number | null; forma3_id: number | null; taxminiy: boolean; takror: boolean; qator_soni: number | null;
  fayl_id: number | null; versiya: number | null; bayt: number | null; yangilandi?: string | null; yasash: boolean;
};

export type PaketFiltr = {
  loyihaIds?: readonly number[]; shartnomaIds?: readonly number[]; obyektIds?: readonly number[];
  oyDan?: string | null; oyGacha?: string | null; turlar?: readonly string[]; holatlar?: readonly PaketHolat[];
};

/** Hujjat turlari: ko'rinadigan nom va ZIP papka nomi (tartib shu). */
export const TUR_NOMI: Readonly<Record<string, string>> = {
  f2: 'F-2', forma3: 'F-3', nakopitelniy: 'Nakopitelniy', m29: 'M-29', slichitelniy: 'Slichitelniy', ostatka: 'Ostatka', aosr: 'AOSR',
};
export const TUR_TARTIB: readonly string[] = ['f2', 'forma3', 'nakopitelniy', 'm29', 'slichitelniy', 'ostatka', 'aosr'];
/** `/api/hujjat-yarat` yasay oladigan turlar (qolganlari faqat Diskdan olinadi). */
export const YASALADIGAN_TURLAR: ReadonlySet<string> = new Set(['f2', 'forma3', 'nakopitelniy', 'm29', 'slichitelniy', 'ostatka']);

export const OY_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export type RadSabab = 'bekor' | 'taxminiy' | 'takror';
export type RadEtilgan = { nomzod: Nomzod; sabab: RadSabab };

/** Paketga umuman kirmaydigan nomzodlar: taxminiy qoralama (PR #670) va bir obyekt+oyda ortiqcha F-2 (takror). Qolgani - toza ro'yxat. */
export function qoidaBilanAjrat(nomzodlar: readonly Nomzod[]): { yaroqli: Nomzod[]; rad: RadEtilgan[] } {
  const yaroqli: Nomzod[] = []; const rad: RadEtilgan[] = [];
  for (const n of nomzodlar) {
    if (n.taxminiy) rad.push({ nomzod: n, sabab: 'taxminiy' });
    else if (n.takror) rad.push({ nomzod: n, sabab: 'takror' });
    else yaroqli.push(n);
  }
  return { yaroqli, rad };
}

const ichida = <T,>(r: readonly T[] | undefined, v: T | null): boolean => !r || r.length === 0 || (v != null && r.includes(v));

/** Mijoz tomonida filtr (server filtri bilan bir xil ma'no; server ham filtrlaydi - bu qayta suzish va oldindan ko'rish uchun). */
export function nomzodSuz(nomzodlar: readonly Nomzod[], f: PaketFiltr): Nomzod[] {
  return nomzodlar.filter((n) =>
    ichida(f.loyihaIds, n.loyiha_id) && ichida(f.shartnomaIds, n.shartnoma_id) && ichida(f.obyektIds, n.obyekt_id)
    && (!f.turlar?.length || f.turlar.includes(n.tur))
    && (!f.holatlar?.length || n.holat === 'joriy' || f.holatlar.includes(n.holat))
    && (!f.oyDan || !n.oy || n.oy >= f.oyDan) && (!f.oyGacha || !n.oy || n.oy <= f.oyGacha));
}

/** Server RPC ga ketadigan filtr (snake_case). */
export function filtrServerga(f: PaketFiltr): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  if (f.loyihaIds?.length) o.loyiha_ids = [...f.loyihaIds];
  if (f.shartnomaIds?.length) o.shartnoma_ids = [...f.shartnomaIds];
  if (f.obyektIds?.length) o.obyekt_ids = [...f.obyektIds];
  if (f.oyDan && OY_RE.test(f.oyDan)) o.oy_dan = f.oyDan;
  if (f.oyGacha && OY_RE.test(f.oyGacha)) o.oy_gacha = f.oyGacha;
  if (f.turlar?.length) o.turlar = [...f.turlar];
  if (f.holatlar?.length) o.holatlar = [...f.holatlar];
  return o;
}

/* ------------------------------------------------------------------ daraxt (Loyiha > Shartnoma > Obyekt > Oy > Tur > hujjat) */

export type Daraja = 'loyiha' | 'shartnoma' | 'obyekt' | 'oy' | 'tur';
export type DaraxtTugun = {
  /** Barqaror kalit (ota yo'li bilan): `l:3/s:7/o:12/m:2026-03/t:f2`. */
  id: string; daraja: Daraja; nom: string; bolalar: DaraxtTugun[]; hujjatlar: Nomzod[];
  /** Shu tugun ostidagi hamma hujjat kalitlari (tanlovni almashtirish va sanash uchun). */
  barg: string[];
};

const GURUH = (k: string | number | null, nom: string | null, yoq: string): { k: string; nom: string } => ({ k: k == null ? '0' : String(k), nom: nom?.trim() || yoq });

const DARAJALAR: ReadonlyArray<{ d: Daraja; ol: (n: Nomzod) => { k: string; nom: string } }> = [
  { d: 'loyiha', ol: (n) => ({ ...GURUH(n.loyiha_id, n.loyiha_nom, 'Loyihasiz'), k: `l:${n.loyiha_id ?? 0}` }) },
  { d: 'shartnoma', ol: (n) => ({ k: `s:${n.shartnoma_id ?? 0}`, nom: n.shartnoma_raqam ? `Shartnoma №${n.shartnoma_raqam}` : 'Shartnomasiz' }) },
  { d: 'obyekt', ol: (n) => ({ ...GURUH(n.obyekt_id, n.obyekt_nom, 'Obyektsiz'), k: `o:${n.obyekt_id ?? 0}` }) },
  { d: 'oy', ol: (n) => ({ k: `m:${n.oy ?? '-'}`, nom: n.oy ?? 'Oysiz' }) },
  { d: 'tur', ol: (n) => ({ k: `t:${n.tur}`, nom: TUR_NOMI[n.tur] ?? n.tur }) },
];

/** Diskdagi papka ierarxiyasi bilan bir xil: Loyiha > Shartnoma > Obyekt > Oy > Hujjat turi. Tartib: nom (loyiha/obyekt), oy, tur tartibi. */
export function daraxtQur(nomzodlar: readonly Nomzod[]): DaraxtTugun[] {
  const ildiz: DaraxtTugun[] = [];
  for (const n of nomzodlar) {
    let qator = ildiz; let yol = '';
    DARAJALAR.forEach((dj, i) => {
      const g = dj.ol(n);
      yol = yol ? `${yol}/${g.k}` : g.k;
      let t = qator.find((x) => x.id === yol);
      if (!t) { t = { id: yol, daraja: dj.d, nom: g.nom, bolalar: [], hujjatlar: [], barg: [] }; qator.push(t); }
      t.barg.push(n.kalit);
      if (i === DARAJALAR.length - 1) t.hujjatlar.push(n);
      qator = t.bolalar;
    });
  }
  const tartibla = (q: DaraxtTugun[]) => {
    q.sort((a, b) => {
      if (a.daraja === 'tur') return (TUR_TARTIB.indexOf(a.id.split('t:')[1]) + 1 || 99) - (TUR_TARTIB.indexOf(b.id.split('t:')[1]) + 1 || 99);
      if (a.daraja === 'oy') return a.nom.localeCompare(b.nom);
      return a.nom.localeCompare(b.nom, 'ru');
    });
    for (const t of q) { tartibla(t.bolalar); t.hujjatlar.sort((a, b) => a.sarlavha.localeCompare(b.sarlavha, 'ru', { numeric: true })); }
  };
  tartibla(ildiz);
  return ildiz;
}

/* ------------------------------------------------------------------ uch holatli tanlov */

export type Uchlik = 'hammasi' | 'qisman' | 'yoq';
export type Tanlov = ReadonlySet<string>;

export function tugunUchligi(t: Pick<DaraxtTugun, 'barg'>, tanlov: Tanlov): Uchlik {
  if (!t.barg.length) return 'yoq';
  let n = 0;
  for (const k of t.barg) if (tanlov.has(k)) n++;
  return n === 0 ? 'yoq' : n === t.barg.length ? 'hammasi' : 'qisman';
}

/** Tugunni almashtirish: hammasi tanlangan bo'lsa - hammasini olib tashlaydi; aks holda (qisman/yo'q) - hammasini tanlaydi. */
export function tugunniAlmashtir(t: Pick<DaraxtTugun, 'barg'>, tanlov: Tanlov): Set<string> {
  const yangi = new Set(tanlov);
  if (tugunUchligi(t, tanlov) === 'hammasi') for (const k of t.barg) yangi.delete(k);
  else for (const k of t.barg) yangi.add(k);
  return yangi;
}

export function hujjatniAlmashtir(kalit: string, tanlov: Tanlov): Set<string> {
  const yangi = new Set(tanlov);
  if (yangi.has(kalit)) yangi.delete(kalit); else yangi.add(kalit);
  return yangi;
}

/** Tugun (id) bo'yicha topish - Diskdagi papkadan «Paket yasash» oldindan tanlash uchun. */
export function tugunTop(daraxt: readonly DaraxtTugun[], id: string): DaraxtTugun | null {
  for (const t of daraxt) {
    if (t.id === id) return t;
    const x = tugunTop(t.bolalar, id);
    if (x) return x;
  }
  return null;
}

/** Hozirgi nomzodlar ichida bo'lmagan kalitlar tanlovdan tushadi (filtr o'zgarganda eskirgan tanlov qolmasin). */
export const tanlovniTozala = (tanlov: Tanlov, nomzodlar: readonly Nomzod[]): Set<string> => {
  const bor = new Set(nomzodlar.map((n) => n.kalit));
  return new Set([...tanlov].filter((k) => bor.has(k)));
};

/** Sukut tanlov: Diskda tasdiqlangan hujjatlar (qoralama va yasalmaganlarni foydalanuvchi o'zi belgilaydi). */
export const sukutTanlov = (nomzodlar: readonly Nomzod[]): Set<string> => new Set(nomzodlar.filter((n) => n.holat !== 'qoralama' && !n.yasash).map((n) => n.kalit));

/* ------------------------------------------------------------------ reja: Diskdan olish / yasash / token bahosi */

/**
 * Hisoblangan katak (formula) bahosi - token faqat YASALADIGAN hujjat uchun. F-2: qator soni x 5 (summa, nakrutka, QQS, jami, farq);
 * boshqa turlar - ruxsat etilgan taxminiy qiymat. Bu BAHO: aniq narx hujjat yasalgach (`/api/hujjat-yarat`, qayta yuklash bepul) yoki MCP preview da.
 */
export const KATAK_STANDART: Readonly<Record<string, number>> = { forma3: 300, nakopitelniy: 1200, m29: 600, slichitelniy: 900, ostatka: 400, aosr: 0 };
export const F2_QATOR_KATAK = 5;
export const katakBahosi = (n: Pick<Nomzod, 'tur' | 'qator_soni'>): number =>
  n.tur === 'f2' ? Math.max(0, (n.qator_soni ?? 0)) * F2_QATOR_KATAK : KATAK_STANDART[n.tur] ?? 0;

export type PaketReja = {
  /** Tanlangan va paketga kirishi mumkin hujjatlar. */
  hujjatlar: Nomzod[];
  /** Diskdagi tayyor versiyadan olinadi (BEPUL). */
  diskdan: Nomzod[];
  /** Yasaladi (token yechiladi): Diskda yo'q va yasaladigan tur. */
  yasash: Nomzod[];
  /** Tanlangan, lekin ham Diskda yo'q, ham yasab bo'lmaydigan tur (masalan AOSR) - o'tkazib yuboriladi. */
  olinmaydi: Nomzod[];
  rad: RadEtilgan[];
  bayt: number; katak: number;
};

export function paketReja(nomzodlar: readonly Nomzod[], tanlov: Tanlov): PaketReja {
  const tanlangan = nomzodlar.filter((n) => tanlov.has(n.kalit));
  const { yaroqli, rad } = qoidaBilanAjrat(tanlangan);
  const diskdan: Nomzod[] = []; const yasash: Nomzod[] = []; const olinmaydi: Nomzod[] = [];
  for (const n of yaroqli) {
    if (!n.yasash && n.fayl_id != null) diskdan.push(n);
    else if (YASALADIGAN_TURLAR.has(n.tur)) yasash.push(n);
    else olinmaydi.push(n);
  }
  return {
    hujjatlar: [...diskdan, ...yasash], diskdan, yasash, olinmaydi, rad,
    bayt: diskdan.reduce((s, n) => s + (n.bayt ?? 0), 0),
    katak: yasash.reduce((s, n) => s + katakBahosi(n), 0),
  };
}

/**
 * F-2 Diskdan to'g'ridan olinadimi: Diskda fayl bor, fonda yangilanmayapti (eskirmagan), navbat xatosi yo'q VA allaqachon to'langan (qayta yuklash bepul).
 * Aks holda (eskirgan/yo'q/to'lanmagan) - server dvigateli (`/api/hujjat-yarat`: token shu yerda, kerak bo'lsa yangidan yasaydi va Diskka yozadi).
 */
export const f2DisktanOlinadi = (n: Nomzod): boolean => {
  const x = n as Nomzod & { yangilanmoqda?: boolean; navbat_holat?: string | null; tolangan?: boolean };
  return n.tur === 'f2' && n.fayl_id != null && x.yangilanmoqda !== true && x.navbat_holat !== 'xato' && x.tolangan === true;
};

/** Sayt va server uchun bitta qoida: F-2 yangi va to'langan bo'lsa Diskdan, qolgan F-2 server dvigateli orqali; boshqa turlar Diskdan (rejadagidek). */
export function rejaF2Disk(r0: Pick<PaketReja, 'diskdan' | 'yasash'>): Pick<PaketReja, 'diskdan' | 'yasash'> {
  const f2 = r0.diskdan.filter((n) => n.tur === 'f2');
  return {
    diskdan: [...r0.diskdan.filter((n) => n.tur !== 'f2'), ...f2.filter(f2DisktanOlinadi)],
    yasash: [...r0.yasash, ...f2.filter((n) => !f2DisktanOlinadi(n))],
  };
}

/** Token bahosi: `narx(katak)` - chaqiruvchi beradi (sayt: `narxHisob` + token holati; MCP: RPC). Faqat yasaladigan hujjat uchun; Disk BEPUL. */
export function tokenBahosi(reja: Pick<PaketReja, 'yasash' | 'katak'>, narx: ((katak: number) => number | null) | null): { token: number | null; yasashSoni: number; katak: number } {
  if (!reja.yasash.length) return { token: 0, yasashSoni: 0, katak: 0 };
  if (!narx) return { token: null, yasashSoni: reja.yasash.length, katak: reja.katak };
  // Har hujjat alohida yechiladi (asos narx har hujjatga) - bahoni hujjat bo'yicha yig'amiz.
  let jami = 0;
  for (const n of reja.yasash) { const t = narx(katakBahosi(n)); if (t == null) return { token: null, yasashSoni: reja.yasash.length, katak: reja.katak }; jami += t; }
  return { token: jami, yasashSoni: reja.yasash.length, katak: reja.katak };
}

/* ------------------------------------------------------------------ ZIP yo'llari (papkalar Disk ierarxiyasini aks ettiradi) */

export const YOL_MAKS = 200;
const BELGI_RE = /[\\/:*?"<>|\u0000-\u001f]+/g;
export const yolQismi = (s: string | null | undefined, zaxira: string, maks = 60): string => {
  const t = (s ?? '').replace(BELGI_RE, '_').replace(/\s+/g, ' ').trim().replace(/^\.+/, '').slice(0, maks).trim();
  return t || zaxira;
};

/** Papka yo'li: Loyiha / Shartnoma / Obyekt / Oy / Hujjat turi (Disk daraxti bilan bir xil). */
export function papkaYoli(n: Nomzod): string {
  return [
    yolQismi(n.loyiha_nom, 'Loyihasiz'),
    yolQismi(n.shartnoma_raqam ? `Shartnoma №${n.shartnoma_raqam}` : null, 'Shartnomasiz'),
    yolQismi(n.obyekt_nom, 'Obyektsiz'),
    yolQismi(n.oy, 'Oysiz', 10),
    yolQismi(TUR_NOMI[n.tur] ?? n.tur, 'Boshqa', 30),
  ].join('/');
}

/** Fayl nomi: serverdan kelgan nom bo'lsa o'sha, aks holda sarlavha + kengaytma; yo'l YOL_MAKS dan oshmaydi (fayl nomi qisqartiriladi); takror - `_2`, `_3`. */
export function zipYollari(hujjatlar: ReadonlyArray<{ n: Nomzod; faylNomi?: string | null }>): Array<{ kalit: string; yol: string }> {
  const band = new Set<string>(); const out: Array<{ kalit: string; yol: string }> = [];
  for (const { n, faylNomi } of hujjatlar) {
    const papka = papkaYoli(n);
    const xom = yolQismi(faylNomi || `${n.sarlavha}.xlsx`, 'hujjat.xlsx', 400);
    const nuqta = xom.lastIndexOf('.');
    const kengaytma = nuqta > 0 && xom.length - nuqta <= 6 ? xom.slice(nuqta) : '';
    const asos = kengaytma ? xom.slice(0, nuqta) : xom;
    const sigim = Math.max(8, YOL_MAKS - papka.length - 1 - kengaytma.length - 4);
    let nom = asos.slice(0, sigim) + kengaytma; let yol = `${papka}/${nom}`; let i = 2;
    while (band.has(yol.toLowerCase())) { nom = `${asos.slice(0, sigim)}_${i++}${kengaytma}`; yol = `${papka}/${nom}`; }
    band.add(yol.toLowerCase()); out.push({ kalit: n.kalit, yol });
  }
  return out;
}

/** «Tarkib» txt: daraxt ko'rinishida ro'yxat + manba (Disk/yasaldi) + holat + rad etilganlar. */
export function tarkibMatni(o: { sarlavha: string; qatorlar: ReadonlyArray<{ yol: string; n: Nomzod; manba: 'disk' | 'yasaldi' }>; xatolar?: readonly string[]; rad?: readonly RadEtilgan[]; olinmaydi?: readonly Nomzod[] }): string {
  const RAD_NOMI: Record<RadSabab, string> = { bekor: 'bekor qilingan', taxminiy: 'taxminiy qoralama (prorab tasdig\'i kutilmoqda)', takror: 'obyekt+oyga bittadan ortiq F-2' };
  const q = [o.sarlavha, '', `Hujjatlar soni: ${o.qatorlar.length}`, ''];
  for (const r of [...o.qatorlar].sort((a, b) => a.yol.localeCompare(b.yol, 'ru'))) {
    const v = r.n.versiya != null ? ` v${r.n.versiya}` : '';
    q.push(`  ${r.yol}  [${r.manba === 'disk' ? 'Diskdan' : 'yasaldi'}${v}; ${r.n.holat}]`);
  }
  if (o.olinmaydi?.length) { q.push('', 'Olinmadi (Diskda yo\'q va yasab bo\'lmaydi):'); for (const n of o.olinmaydi) q.push(`  ${n.sarlavha} - ${n.obyekt_nom ?? ''} ${n.oy ?? ''}`.trimEnd()); }
  if (o.rad?.length) { q.push('', 'Qoida bo\'yicha kiritilmadi:'); for (const r of o.rad) q.push(`  ${r.nomzod.sarlavha} - ${r.nomzod.obyekt_nom ?? ''} ${r.nomzod.oy ?? ''}: ${RAD_NOMI[r.sabab]}`.replace(/ +:/, ':')); }
  if (o.xatolar?.length) { q.push('', 'Xato (kiritilmadi):'); for (const x of o.xatolar) q.push(`  ${x}`); }
  return q.join('\r\n');
}
