/**
 * Ombor materiallari: nom normallashtirish + noaniq (fuzzy) moslash. Sof funksiyalar (DB/tarmoq yo'q).
 *
 * Bitta jismoniy material ko'pincha turlicha yoziladi: «Полиэтилен труба ф25» / «ПЭ труба 25» / «Polietilen quvur d25»,
 * lotin-kirill o'xshash harflar (lotin «p» ichida kirill so'z), «х» va «x», bo'shliq/belgi farqi, birlik yozilishi.
 * Server SQL `t2_ombor_kalit_v1` shu qoidalarning aynan nusxasi (qiymatlari moslik testida tekshiriladi).
 *
 * MUHIM: moslash faqat TAKLIF. Birlashtirish egasi/omborchi tasdig'idan keyin `t2_material_alias` ga yoziladi.
 */

const LOTIN_O_XSHASH = 'aeopcxykmhtb';
const KIRILL_O_XSHASH = 'аеорсхуктнтв';

const FONETIK: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'j', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n',
  о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'x', ц: 's', ч: 'ch', ш: 'sh', щ: 'sh', ъ: '', ь: '', ы: 'i',
  э: 'e', ю: 'yu', я: 'ya', ў: 'u', қ: 'k', ғ: 'g', ҳ: 'h',
};

/** Kichik sinonim lug'ati (o'zbek/rus/qisqartma → bitta kalit so'z). Kalitlar allaqachon fonetik shaklda. */
const SINONIM: Record<string, string> = {
  quvur: 'truba', trubka: 'truba', trubi: 'truba', trubalar: 'truba',
  polietilen: 'pe', polietilenovaya: 'pe', polietilenovyi: 'pe', polietilenovoi: 'pe', polietilenli: 'pe', plastik: 'pe',
  sement: 'cement', tsement: 'cement', sementi: 'cement',
  qum: 'pesok', shebin: 'shebyon', shaggal: 'shebyon', shebyon: 'shebyon',
  armatura: 'armatura', armatur: 'armatura',
  kabel: 'kabel', kabil: 'kabel',
  diametr: 'f', diametri: 'f', dia: 'f', d: 'f', dn: 'f',
};

const BIRLIK: Record<string, string> = {
  sht: 'sht', shtuk: 'sht', shtuka: 'sht', dona: 'sht', dn: 'sht', pcs: 'sht', sht_: 'sht', 'sht.': 'sht', komplekt: 'komplekt', kmpl: 'komplekt', komp: 'komplekt',
  m: 'm', metr: 'm', metir: 'm', pm: 'm', 'p.m': 'm', pogm: 'm', mp: 'm',
  m2: 'm2', 'm^2': 'm2', kvm: 'm2', 'kv.m': 'm2', kvadrat: 'm2', 'm²': 'm2',
  m3: 'm3', 'm^3': 'm3', kub: 'm3', kubm: 'm3', 'kub.m': 'm3', 'm³': 'm3',
  kg: 'kg', kilogram: 'kg', kgr: 'kg',
  tn: 'tn', t: 'tn', tonna: 'tn', tonn: 'tn',
  l: 'l', litr: 'l', lit: 'l',
  rulon: 'rulon', rul: 'rulon', rulonlar: 'rulon',
  upak: 'upak', upakovka: 'upak', pachka: 'pachka', pochka: 'pachka', paket: 'paket', meshok: 'meshok', qop: 'meshok', mesh: 'meshok',
};

function sozKirill(w: string): string {
  const kirillBor = /[а-яёўқғҳ]/.test(w);
  if (!kirillBor) return w;
  let r = '';
  for (const ch of w) { const i = LOTIN_O_XSHASH.indexOf(ch); r += i >= 0 ? KIRILL_O_XSHASH[i] : ch; }
  return r;
}

function fonetik(s: string): string {
  let r = '';
  for (const ch of s) r += FONETIK[ch] ?? ch;
  r = r.replace(/kh/g, 'x').replace(/ts/g, 's').replace(/y[eo]/g, 'e').replace(/yo/g, 'e');
  return r.replace(/([a-z])\1+/g, '$1');
}

/** Matnni birlamchi tozalash: kichik harf, belgi/bo'shliq, o'nli vergul, x/×/* ajratgich, harf-raqam chegarasi. */
function tozala(matn: string): string[] {
  let s = String(matn ?? '').normalize('NFKC').toLowerCase();
  s = s.replace(/[ʻʼ’‘`´']/g, '');
  s = s.replace(/(\d),(\d)/g, '$1.$2');
  s = s.replace(/[×*✕]/g, ' x ').replace(/ø|⌀/g, ' f ').replace(/²/g, '2').replace(/³/g, '3');
  s = s.replace(/[^a-zа-яёўқғҳ0-9.]+/g, ' ').replace(/(^|\s)\.+|\.+(\s|$)/g, ' ');
  s = s.replace(/(\d)\.(?!\d)/g, '$1 ').replace(/(?<!\d)\.(\d)/g, ' $1');
  const words = s.split(/\s+/).filter(Boolean).map(sozKirill);
  const tokens: string[] = [];
  for (const w of words) {
    const f = fonetik(w);
    for (const p of f.match(/[0-9]+(?:\.[0-9]+)?|[a-z]+/g) ?? []) tokens.push(p);
  }
  return tokens;
}

/** Raqamli ko'rinishda «25х3» → 25 x 3 : x ajratgichi kalitda saqlanadi (o'lchamlar tartibi muhim). */
export function nomTokenlari(matn: string): string[] {
  const t = tozala(matn).map((x) => SINONIM[x] ?? x);
  // ketma-ket takror sinonimni qisqartirish (pe pe → pe)
  return t.filter((x, i) => i === 0 || x !== t[i - 1]);
}

/** Qidiruv/guruhlash kaliti (server `t2_ombor_kalit_v1` bilan bir xil). */
export function nomKaliti(matn: string): string {
  return nomTokenlari(matn).join(' ');
}

export function birlikKaliti(birlik: string): string {
  const b = String(birlik ?? '').normalize('NFKC').toLowerCase().replace(/[\s.]+/g, '').replace(/[ʻʼ’‘`´']/g, '');
  const f = fonetik(sozKirill(b));
  return BIRLIK[f] ?? f;
}

const SON = /^[0-9]+(?:\.[0-9]+)?$/;
/** Nomdagi barcha raqam tokenlari (o'lcham/marka) — faqat ularning to'plami teng bo'lsa birlashtirish mumkin. */
export function raqamImzosi(tokenlar: string[]): string {
  return tokenlar.filter((t) => SON.test(t)).map((t) => String(Number(t))).sort().join(',');
}

function trigramlar(s: string): Set<string> {
  const p = '  ' + s.replace(/\s+/g, ' ') + ' ';
  const out = new Set<string>();
  for (let i = 0; i + 3 <= p.length; i++) out.add(p.slice(i, i + 3));
  return out;
}
export function trigramO_xshashlik(a: string, b: string): number {
  if (!a || !b) return 0;
  const A = trigramlar(a), B = trigramlar(b);
  let kesish = 0;
  for (const x of A) if (B.has(x)) kesish++;
  const birlash = A.size + B.size - kesish;
  return birlash ? kesish / birlash : 0;
}

/** Tokenli o'xshashlik: so'z tokenlari (raqamsiz) bo'yicha noaniq Jaccard (bir-biriga ≥0.75 trigram yaqin token — mos). */
export function tokenO_xshashlik(a: string[], b: string[]): number {
  const A = a.filter((t) => !SON.test(t)), B = b.filter((t) => !SON.test(t));
  if (!A.length && !B.length) return 1;
  if (!A.length || !B.length) return 0;
  const used = new Set<number>();
  let mos = 0;
  for (const x of A) {
    let eng = -1, engBal = 0;
    B.forEach((y, j) => { if (used.has(j)) return; const bal = x === y ? 1 : trigramO_xshashlik(x, y); if (bal > engBal) { engBal = bal; eng = j; } });
    if (eng >= 0 && engBal >= 0.75) { used.add(eng); mos += engBal; }
  }
  return mos / (A.length + B.length - mos);
}

export type MosNatija = { ball: number; sabab: string };

/**
 * Ikki nom (birlik bilan) qanchalik bitta narsa: raqam imzosi va birlik oilasi teng bo'lishi SHART
 * («труба ф25» ≠ «труба ф32», «м» ≠ «шт»). Ball 0..1.
 */
export function moslikBalli(a: { nomi: string; birligi: string }, b: { nomi: string; birligi: string }): MosNatija {
  if (birlikKaliti(a.birligi) !== birlikKaliti(b.birligi)) return { ball: 0, sabab: 'birlik farq' };
  const ta = nomTokenlari(a.nomi), tb = nomTokenlari(b.nomi);
  if (raqamImzosi(ta) !== raqamImzosi(tb)) return { ball: 0, sabab: 'raqam/o\'lcham farq' };
  const ka = ta.join(' '), kb = tb.join(' ');
  if (ka === kb) return { ball: 1, sabab: 'kalit teng' };
  const ball = 0.55 * tokenO_xshashlik(ta, tb) + 0.45 * trigramO_xshashlik(ka, kb);
  return { ball, sabab: 'noaniq' };
}

export type Katalog = { id: string | number; nomi: string; birligi: string };
export type Taklif = { id: string | number; nomi: string; birligi: string; ball: number };

/**
 * Qidiruv (qisman/xato kiritish): so'rov tokenlari katalog nomi tokenlariga prefiks yoki noaniq mos tushsa ball oshadi.
 * Birlik ixtiyoriy (berilsa — mos kelmaydiganlari pastga tushadi, chiqarib tashlanmaydi).
 */
export function qidir(sorov: string, katalog: Katalog[], opts: { birlik?: string; limit?: number } = {}): Taklif[] {
  const q = nomTokenlari(sorov);
  if (!q.length) return [];
  const qb = opts.birlik ? birlikKaliti(opts.birlik) : null;
  const qs = q.join(' ');
  const out: Taklif[] = [];
  for (const k of katalog) {
    const t = nomTokenlari(k.nomi);
    if (!t.length) continue;
    let yig = 0;
    for (const x of q) {
      let eng = 0;
      for (const y of t) {
        const bal = x === y ? 1 : SON.test(x) || SON.test(y) ? (y.startsWith(x) ? 0.7 : 0) : y.startsWith(x) && x.length >= 2 ? 0.9 : trigramO_xshashlik(x, y) >= 0.5 ? trigramO_xshashlik(x, y) : 0;
        if (bal > eng) eng = bal;
        if (eng === 1) break;
      }
      yig += eng;
    }
    let ball = yig / q.length;
    if (!ball) continue;
    ball = 0.75 * ball + 0.25 * trigramO_xshashlik(qs, t.join(' '));
    if (qb && birlikKaliti(k.birligi) !== qb) ball *= 0.6;
    out.push({ id: k.id, nomi: k.nomi, birligi: k.birligi, ball: Math.round(ball * 1000) / 1000 });
  }
  out.sort((x, y) => y.ball - x.ball || x.nomi.localeCompare(y.nomi));
  return out.slice(0, opts.limit ?? 10);
}

export type GuruhKirish = { nomi: string; birligi: string; soni?: number };
export type Guruh = { kanonik: string; birligi: string; variantlar: { nomi: string; soni: number }[]; jami: number; minBall: number };

/**
 * Variantlarni guruhlash: avval aniq kalit bo'yicha, so'ng (raqam imzosi + birlik bir xil) bloklar ichida noaniq birlashtirish
 * (ball >= chegara, bog'lanish — birlashgan-bog'liqlik, markazga qarab). Kanonik = eng ko'p uchragan yozuv.
 */
export function guruhla(kirish: GuruhKirish[], chegara = 0.8): Guruh[] {
  const kal = new Map<string, { nomi: string; birligi: string; soni: number; nomlar: Map<string, number>; toks: string[] }>();
  for (const k of kirish) {
    const toks = nomTokenlari(k.nomi);
    if (!toks.length) continue;
    const key = birlikKaliti(k.birligi) + '|' + toks.join(' ');
    let e = kal.get(key);
    if (!e) { e = { nomi: k.nomi, birligi: k.birligi, soni: 0, nomlar: new Map(), toks }; kal.set(key, e); }
    const s = k.soni ?? 1;
    e.soni += s;
    e.nomlar.set(k.nomi, (e.nomlar.get(k.nomi) ?? 0) + s);
  }
  const elems = [...kal.entries()].map(([key, e]) => ({ key, ...e, blok: birlikKaliti(e.birligi) + '|' + raqamImzosi(e.toks) }));
  const bloklar = new Map<string, typeof elems>();
  for (const e of elems) { const a = bloklar.get(e.blok) ?? []; a.push(e); bloklar.set(e.blok, a); }
  const natija: Guruh[] = [];
  for (const arr of bloklar.values()) {
    const ota = arr.map((_, i) => i);
    const topO = (i: number): number => (ota[i] === i ? i : (ota[i] = topO(ota[i])));
    arr.sort((x, y) => y.soni - x.soni);
    const minBal = new Map<number, number>();
    for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) {
      const ka = arr[i].toks.join(' '), kb = arr[j].toks.join(' ');
      if (Math.abs(ka.length - kb.length) > Math.max(6, ka.length * 0.6)) continue;
      const ball = 0.55 * tokenO_xshashlik(arr[i].toks, arr[j].toks) + 0.45 * trigramO_xshashlik(ka, kb);
      if (ball >= chegara) {
        const a = topO(i), b = topO(j);
        if (a !== b) { ota[Math.max(a, b)] = Math.min(a, b); }
        minBal.set(Math.min(topO(i)), Math.min(minBal.get(topO(i)) ?? 1, ball));
      }
    }
    const guruhlar = new Map<number, number[]>();
    arr.forEach((_, i) => { const r = topO(i); const a = guruhlar.get(r) ?? []; a.push(i); guruhlar.set(r, a); });
    for (const [r, idxs] of guruhlar) {
      const vars = new Map<string, number>();
      let jami = 0;
      for (const i of idxs) for (const [n, c] of arr[i].nomlar) { vars.set(n, (vars.get(n) ?? 0) + c); jami += c; }
      const tartib = [...vars.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
      natija.push({ kanonik: tartib[0][0], birligi: arr[idxs[0]].birligi, variantlar: tartib.map(([nomi, soni]) => ({ nomi, soni })), jami, minBall: idxs.length > 1 ? (minBal.get(r) ?? chegara) : 1 });
    }
  }
  return natija.sort((a, b) => b.jami - a.jami);
}
