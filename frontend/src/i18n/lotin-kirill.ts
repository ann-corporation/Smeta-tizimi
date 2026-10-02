/**
 * O'zbek lotin ↔ kirill (egasi, 2026-10-02: "o'zbek tilida lotincha va kirillchada ideal ishlashi kerak").
 *
 * QOIDA: o'zbek kirill matni QO'LDA yozilmaydi — lotin manbadan shu modul bilan olinadi (ikki yozuv hech qachon
 * ajralib qolmaydi). Qoidaga sig'maydigan so'zlar — `lugat/kirill-istisno.json` (so'z yoki to'liq matn darajasida).
 * Qidiruv: `qidiruvKaliti` ikkala yozuvni bitta kalitga keltiradi ("Ўзбекча" = "Oʻzbekcha" = "O'zbekcha").
 */

/** Oʻ/gʻ belgisi (U+02BB) va tutuq belgisi (U+02BC) — rasmiy imlo. */
export const OKINA = 'ʻ';
export const TUTUQ = 'ʼ';
const APOSTROFLAR = /[ʻʼ‘’'`´]/;

/** Har xil apostroflarni rasmiy imloga keltiradi: o'/g' → oʻ/gʻ, harflar orasidagi boshqasi → ʼ. */
export function apostrofTozala(s: string): string {
  return s
    .replace(/([OoGg])[ʻʼ‘’'`´]/g, (_m, c: string) => c + OKINA)
    .replace(/(\p{L})[ʼ‘’'`´](?=\p{L})/gu, (_m, c: string) => c + TUTUQ);
}

const UNLI = new Set(['a', 'e', 'i', 'o', 'u', 'ў', OKINA]);
const LOTIN_KIRILL: Record<string, string> = {
  a: 'а', b: 'б', c: 'с', d: 'д', f: 'ф', g: 'г', h: 'ҳ', i: 'и', j: 'ж', k: 'к', l: 'л', m: 'м', n: 'н', o: 'о',
  p: 'п', q: 'қ', r: 'р', s: 'с', t: 'т', u: 'у', v: 'в', w: 'в', x: 'х', y: 'й', z: 'з',
};
/** Lotin yozuvda qoladigan nomlar (brend, texnik termin). */
const LOTINDA_QOLADI = new Set(['excel', 'google', 'gmail', 'telegram', 'didox', 'payme', 'click', 'supabase', 'storage', 'cloudflare', 'chrome', 'windows', 'email', 'e-mail']);

let SOZ_ISTISNO: Record<string, string> = {};
/** So'z darajasidagi istisnolar (kichik harfda kalit): masalan { "pto": "ПТО", "tsement": "цемент" }. */
export function sozIstisnolariniQoy(x: Record<string, string>): void {
  SOZ_ISTISNO = Object.fromEntries(Object.entries(x).map(([k, v]) => [apostrofTozala(k.toLowerCase()), v]));
}

function katta(s: string, up: boolean): string { return up ? s.toUpperCase() : s; }

function sozKirill(w: string): string {
  if (/[\d_]/.test(w) || /[Ѐ-ӿ]/.test(w)) return w;
  const kichik = w.toLowerCase();
  if (LOTINDA_QOLADI.has(kichik)) return w;
  const ist = SOZ_ISTISNO[kichik];
  if (ist) {
    if (w === w.toUpperCase() && w.length > 1) return ist.toUpperCase();
    return w[0] !== w[0].toLowerCase() ? ist[0].toUpperCase() + ist.slice(1) : ist;
  }
  if (/^[A-Z]{2,4}$/.test(w)) return w; // qisqartmalar (AI, PDF, LRV, CRM) — o'zgarmaydi; kerak bo'lsa istisnoga
  let out = '';
  for (let i = 0; i < w.length; i++) {
    const c = w[i], lc = c.toLowerCase(), n = w[i + 1] ?? '', ln = n.toLowerCase();
    const up = c !== lc;
    const oldingi = i > 0 ? w[i - 1].toLowerCase() : '';
    if ((lc === 's' || lc === 'c') && ln === 'h') { out += katta(lc === 's' ? 'ш' : 'ч', up); i++; continue; }
    if ((lc === 'o' || lc === 'g') && n === OKINA) { out += katta(lc === 'o' ? 'ў' : 'ғ', up); i++; continue; }
    if (lc === 'y' && 'ouae'.includes(ln) && ln && !(ln === 'o' && w[i + 2] === OKINA)) {
      out += katta({ o: 'ё', u: 'ю', a: 'я', e: 'е' }[ln]!, up); i++; continue;
    }
    if (c === TUTUQ) { if (!(oldingi === 's' && ln === 'h')) out += 'ъ'; continue; }
    if (c === OKINA) continue;
    if (lc === 'e') { out += katta(i === 0 || UNLI.has(oldingi) ? 'э' : 'е', up); continue; }
    const k = LOTIN_KIRILL[lc];
    out += k ? katta(k, up) : c;
  }
  return out;
}

/** O'zbek lotin matnni kirillga o'giradi. `{nom}` o'rinbosarlari va URL/email/kodlar o'zgarmaydi. */
export function lotinKirill(matn: string): string {
  const s = apostrofTozala(matn);
  return s.replace(/(\{[^}]*\}|https?:\/\/\S+|\S+@\S+|[\p{L}\p{N}_ʻʼ]+)/gu, (m) =>
    m.startsWith('{') || /^https?:/.test(m) || m.includes('@') ? m : sozKirill(m));
}

const KIRILL_LOTIN: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', ё: 'yo', ж: 'j', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n',
  о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'x', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sh', ъ: TUTUQ, ы: 'i',
  ь: '', э: 'e', ю: 'yu', я: 'ya', ў: 'o' + OKINA, қ: 'q', ғ: 'g' + OKINA, ҳ: 'h',
};
const KIRILL_UNLI = new Set([...'аеёиоуэюяўы']);

/** Kirill matnni o'zbek lotiniga o'giradi (kiritish va qidiruv uchun). */
export function kirillLotin(matn: string): string {
  let out = '';
  for (let i = 0; i < matn.length; i++) {
    const c = matn[i], lc = c.toLowerCase();
    const up = c !== lc;
    let l: string | undefined;
    if (lc === 'е') {
      const old = i > 0 ? matn[i - 1].toLowerCase() : '';
      l = !old || !/[Ѐ-ӿ]/.test(old) || KIRILL_UNLI.has(old) || old === 'ъ' || old === 'ь' ? 'ye' : 'e';
    } else l = KIRILL_LOTIN[lc];
    if (l === undefined) { out += c; continue; }
    if (!up || !l) { out += l; continue; }
    const keyingi = matn[i + 1] ?? '';
    const hammasiKatta = keyingi !== '' && keyingi !== keyingi.toLowerCase();
    out += hammasiKatta ? l.toUpperCase() : l[0].toUpperCase() + l.slice(1);
  }
  return out;
}

/** Qidiruv kaliti: yozuv (lotin/kirill), registr va apostrof farqlarini yo'qotadi. */
export function qidiruvKaliti(s: string): string {
  return kirillLotin(String(s ?? '').toLowerCase())
    .toLowerCase()
    .replace(new RegExp(APOSTROFLAR.source, 'g'), '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** `qidiruv` matni `matn` ichida bormi — lotin/kirill farqisiz. */
export function qidiruvdaBor(matn: string, qidiruv: string): boolean {
  const q = qidiruvKaliti(qidiruv);
  return !q || qidiruvKaliti(matn).includes(q);
}
