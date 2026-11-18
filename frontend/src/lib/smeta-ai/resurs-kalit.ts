/**
 * Canonical resource / norm keys — ONE place that decides "same code, different spelling".
 *
 * Owner 2026-11-16: «00001 Затраты труда» and «1 Затраты труда» are the same labour resource, but the studio split every
 * slightly different code or name into a separate item. The rules here are formatting-only (never semantic guesses):
 *   • case, spaces, Latin look-alikes (C/С, E/Е, A/А …) fold to ONE alphabet (Cyrillic);
 *   • every separator (- – — . / _ ,) becomes "-";
 *   • leading zeros of every numeric group go away («00001» = «1», «Е01-01-001-1» = «Е1-1-1-1»);
 *   • the name key drops decoration (quotes, brackets, extra spaces, «ё»), never words.
 * Smeta understanding stays in lib/smeta-anatomiya; this module only compares keys of what it already read.
 */

const LAT2CYR: Record<string, string> = { A: 'А', B: 'В', C: 'С', E: 'Е', H: 'Н', K: 'К', M: 'М', O: 'О', P: 'Р', T: 'Т', X: 'Х', Y: 'У' };
const SEP = /[\s\-–—−./_,\\]+/g;

/** Upper-case, Ё→Е, Latin look-alikes → Cyrillic (only the letters that look the same). */
export function alifboKalit(v: string | null | undefined): string {
  return (v ?? '').toUpperCase().replace(/Ё/g, 'Е').replace(/[ABCEHKMOPTXY]/g, ch => LAT2CYR[ch]);
}

/**
 * Canonical code: «С101-0025» = «C101-25» = «с101 25»; «00001» = «1»; «Е01-01-001-1» = «Е1-1-1-1».
 * Null when there is no code at all (empty / only punctuation) — NULL is never turned into a key.
 */
export function kodKalit(code: string | null | undefined): string | null {
  const t = alifboKalit(code).replace(/^[№N#]\s*/, '').replace(/[«»"'()[\]{}]/g, '').trim();
  if (!t) return null;
  // Letters glued to digits stay together («С101»); separators between groups unify to "-".
  const groups = t.replace(SEP, '-').split('-').filter(Boolean)
    .map(g => g.replace(/^(\D*)0+(?=\d)/, '$1').replace(/^0+(?=\d)/, ''));
  return groups.length ? groups.join('-') : null;
}

/**
 * Norm (work) code as written in a smeta line: «E16-2-12-8 ШНК.ДОП.15», «Е0101-009-08 ДОП. 3», «Е1-2-57-1 К=0,41»,
 * «Е01-01-001-1». The trailing annotation (ДОП., ШНК, К=…) is not part of the code; a fused «Е0101-009-08» is
 * collection 01 + section 01 → «Е01-01-009-08». Null when the text does not start with a norm code.
 */
export function ishKodKalit(shifr: string | null | undefined): string | null {
  const t = alifboKalit(shifr).replace(/^[№N#]\s*/, '').trim();
  const m = /^([ЕЦУ])\s?(\d{1,4}(?:\s?[-–—.]\s?\d{1,4}){1,4})(?![\d])/.exec(t);
  if (!m) return null;
  let body = m[2].replace(/\s+/g, '').replace(/[–—.]/g, '-');
  const fused = /^(\d{2})(\d{2})-(\d{1,3})-(\d{1,3})$/.exec(body);
  if (fused) body = `${fused[1]}-${fused[2]}-${fused[3]}-${fused[4]}`;
  return kodKalit(m[1] + body);
}

/** Name key: decoration stripped, whitespace collapsed, same alphabet; words are never dropped. */
export function nomKalit(name: string | null | undefined): string {
  return alifboKalit(name).replace(/(\d),(\d)/g, '$1.$2').replace(/[«»"“”'`´()[\]{};:!?|\\,]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Unit key: «м³» = «М3» = «м.куб» = «куб.м»; «шт.» = «ШТ»; leading «1 » factor of a plain unit is dropped («1 шт.» = «шт»). */
export function birlikKalit(unit: string | null | undefined): string {
  let u = alifboKalit(unit).replace(/[³]/g, '3').replace(/[²]/g, '2').replace(/\s+/g, '').replace(/\.+$/, '').replace(/\./g, '');
  const syn: Record<string, string> = { КУБМ: 'М3', МКУБ: 'М3', КВМ: 'М2', МКВ: 'М2', ТН: 'Т', ТОННА: 'Т', ТОНН: 'Т', ШТУК: 'ШТ', ШТУКА: 'ШТ', ПМ: 'М', ПОГМ: 'М', МП: 'М', КИЛОГРАММ: 'КГ',
    ЧЕЛЧ: 'ЧЕЛЧ', 'ЧЕЛ-Ч': 'ЧЕЛЧ', МАШЧ: 'МАШЧ', 'МАШ-Ч': 'МАШЧ' };
  u = u.replace(/^1(?=\D)/, '');
  return syn[u] ?? u;
}

/** Generic labour / machine-hour lines: their codes are placeholders («1», «00001», «1.1»), the NAME carries the identity. */
const MEHNAT = /^ЗАТРАТЫ\s+ТРУДА|^ТРУДОЗАТРАТЫ|^ЗАТРАТЫ\s+ТРУДА\s+МАШИНИСТОВ|^МАШИНИСТЫ?$|^ЧЕЛ[-.\s]*Ч/;
export const mehnatMi = (name: string | null | undefined) => MEHNAT.test(nomKalit(name));

export type ResursQatori = { kod?: string | null; nom: string | null; birlik?: string | null; narx?: number | null; hajm?: number | null };
export type ResursKaliti = { kalit: string; asos: 'kod' | 'mehnat' | 'nom' };

/**
 * One canonical key per resource line. Code wins (canonical form) unless the line is a labour/machine-hour placeholder,
 * where name + unit decide. Without a code the key is the normalised name + unit (same name, different unit = two resources).
 */
export function resursKaliti(r: ResursQatori): ResursKaliti {
  const nom = nomKalit(r.nom), b = birlikKalit(r.birlik);
  if (mehnatMi(r.nom)) return { kalit: `M|${nom}|${b}`, asos: 'mehnat' };
  const kod = kodKalit(r.kod);
  // A code that is only a short running number («1», «2») is a row marker, not a catalogue code: name decides.
  if (kod && !/^\d{1,3}$/.test(kod)) return { kalit: `K|${kod}`, asos: 'kod' };
  return { kalit: `N|${nom}|${b}`, asos: 'nom' };
}

export type ResursGuruh<T extends ResursQatori> = { kalit: string; asos: ResursKaliti['asos']; qatorlar: T[]; kodlar: string[]; nomlar: string[]; birliklar: string[] };

/** Merge spelling variants: every line of one canonical key lands in one group (order of first appearance). */
export function resurslarniBirlashtir<T extends ResursQatori>(qatorlar: readonly T[]): ResursGuruh<T>[] {
  const out = new Map<string, ResursGuruh<T>>();
  for (const q of qatorlar) {
    const { kalit, asos } = resursKaliti(q);
    let g = out.get(kalit);
    if (!g) { g = { kalit, asos, qatorlar: [], kodlar: [], nomlar: [], birliklar: [] }; out.set(kalit, g); }
    g.qatorlar.push(q);
    const add = (l: string[], v: string | null | undefined) => { const t = (v ?? '').trim(); if (t && !l.includes(t)) l.push(t); };
    add(g.kodlar, q.kod); add(g.nomlar, q.nom); add(g.birliklar, q.birlik);
  }
  return [...out.values()];
}
