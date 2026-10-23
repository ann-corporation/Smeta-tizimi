/**
 * F2 auto-matching engine — ported from `Smeta tizimi/35_F2Moslash.js`
 * (`f2MoslashEngine`), which is the mature, evidence-grounded matcher that
 * has been running in production. This port exists for T2-GAS-EXIT-001
 * (`ops/handoff/T2_GAS_EXIT_001.md`): TIZIM_02's canonical F2 interactive
 * path must stop depending on GAS execution; per that document's own rule
 * ("do not build a second, weaker matcher"), this is a **line-by-line port**
 * of the GAS source, not a rewrite or a simplification.
 *
 * ⚠️ THIS CODE IS DELIBERATELY, NARROWLY TUNED. Every rule below exists
 * because of a real financial bug in production. Do not "clean up" a branch
 * without reading why it exists — see the matching comment in
 * `Smeta tizimi/35_F2Moslash.js` for the incident each guard closes:
 *   • unit shield (birlik qalqoni)   → Т↔КГ = 1000x error
 *   • grade mismatch (grade-farq)    → ПК↔ПБ is a different product
 *   • strict mode (qat'iy rejim)     → a generic resource (000001) matched
 *                                       153 unrelated places
 *   • code canonicalization          → 105 unmatched works = 2.57bn unseen
 *   • orphan rescue (yetim qutqarish)→ an unmatched parent work used to
 *                                       silently drop all its child resources
 *
 * Known, intentional divergence from the GAS source: `findUnique()` is
 * defined in `35_F2Moslash.js` (lines ~248-252) but is **dead code** — no
 * call site references it (confirmed by grep against the live source on
 * 2026-09-04); `pickUnique()` is what every call site actually uses. This
 * port therefore does not carry `findUnique` forward as executable code —
 * silently reintroducing unreachable code would be a worse audit trail than
 * noting its absence here.
 */

import type {
  AktNode,
  F2MatchOptions,
  F2MatchResult,
  F2MatchStat,
  LrvNode,
  RzDiagEntry,
} from './types';

/* ============ 1. NORMALIZERS ============ */

// V→В and N→Н were added so brand names (e.g. transliterated Latin spellings)
// normalize the same way regardless of which alphabet the source used.
const LAT2CYR: Record<string, string> = {
  A: 'А', B: 'В', C: 'С', E: 'Е', H: 'Н', K: 'К', M: 'М',
  N: 'Н', O: 'О', P: 'Р', T: 'Т', V: 'В', X: 'Х', Y: 'У',
};

function lat2Cyr(s: string): string {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s.charAt(i);
    out += LAT2CYR[ch] || ch;
  }
  return out;
}

/** Name key: keep only digits + Cyrillic letters. Spaces/punctuation/case-insensitive. */
export function normNom(s: unknown): string {
  const out = lat2Cyr(String(s == null ? '' : s).toUpperCase()).replace(/Ё/g, 'Е');
  return out.replace(/[^0-9А-Я]/g, '');
}

/** Unit key: м³/m3/М.3 all fold to the same value. */
export function normBir(s: unknown): string {
  const raw = String(s == null ? '' : s)
    .toUpperCase()
    .replace(/³/g, '3')
    .replace(/²/g, '2')
    .replace(/¹/g, '1')
    .replace(/Ё/g, 'Е')
    .replace(/[\s.,\-/]+/g, '');
  return birSinonim(lat2Cyr(raw));
}

/**
 * Birlik sinonimlari (egasi 2026-10-23): «К-Т» ≡ «КОМП-Т» ≡ «КОМПЛ» ≡ «КОМПЛЕКТ» (ko'paytuvchi bilan ham: «100 КОМПЛ»);
 * hajm birligidagi izoh so'zi tashlanadi: «100 М3 БЕТОНА» ≡ «100М3», «100 М2 ПОВЕРХНОСТИ» ≡ «100М2»
 * (Tizim1 F2 import qoidasi, F2_IMPORT_V3 §1.2). Kiruvchi qiymat bo'shliq/tinish belgisisiz.
 */
function birSinonim(b: string): string {
  const k = b.match(/^(\d*)(КТ|КОМПТ|КОМПЛ|КОМПЛЕКТ|КОМПЛЕКТА|КОМПЛЕКТОВ)$/);
  if (k) return k[1] + 'КОМПЛ';
  const q = b.match(/^(\d*М[23])([А-Я]{3,})$/);
  return q ? q[1] : b;
}

/**
 * Code key: Latin→Cyrillic (act "E1-1-195" ↔ LRV "Е1-1-195") + leading zeros
 * stripped in a purely numeric code ("000001" ↔ "1").
 */
export function normKod(s: unknown): string {
  let out = lat2Cyr(String(s == null ? '' : s).trim().toUpperCase().replace(/\s+/g, ''));
  if (/^\d+$/.test(out)) out = out.replace(/^0+/, '') || '0';
  return out;
}

/**
 * "Exactly the same item": name+unit match AND (code matches OR either side
 * has no code). Acts frequently omit the расценка code entirely — in that
 * case a replacement (zamena) must never be inferred from a code mismatch
 * that doesn't actually exist.
 */
export function aynanMi(
  kodA: string | undefined, nomA: string | undefined, birA: string | undefined,
  kodB: string | undefined, nomB: string | undefined, birB: string | undefined,
): boolean {
  if (normNom(nomA) !== normNom(nomB)) return false;
  if (normBir(birA) !== normBir(birB)) return false;
  const kA = normKod(kodA);
  const kB = normKod(kodB);
  return !kA || !kB || kA === kB;
}

/**
 * Section (razdel) name key. ⚠️ Cleanup runs on the RAW text — `normNom`
 * strips parentheses first, so "(ЛИСТ КР-5)" could not be removed afterward.
 */
export function normRz(s: unknown): string {
  let r = String(s == null ? '' : s).toUpperCase().replace(/Ё/g, 'Е');
  r = r.replace(/\([^)]*\)/g, ' '); // (ЛИСТ КР-5), (ПЕРЕРАСЧЕТ)
  r = r.replace(/\bЛИСТ[\s.\-№]*[А-ЯA-Z0-9\-.,]*/g, ' '); // "ЛИСТ КР-24" without parens
  r = r.replace(/ПЕРЕРАСЧ[ЕЁ]Т/g, ' ');
  r = r.replace(/^\s*РАЗДЕЛ\s*[:№.-]*\s*/, ' ');
  return normNom(r);
}

/**
 * CODE CANON: the act and the LRV write the same расценка two different
 * ways: act "Е1101-002-09 ДОП. 3" ↔ LRV "E11-1-2-9". Rule: take only the
 * first token → Latin→Cyrillic → if the first numeric group has 4 digits
 * and there's a second group, split it into two 2-digit groups → strip
 * leading zeros from every group.
 */
export function kodKanon(kod: unknown): string {
  let s = String(kod == null ? '' : kod).trim().toUpperCase().replace(/Ё/g, 'Е');
  if (!s) return '';
  s = s.split(/\s+/)[0];
  s = lat2Cyr(s);
  const g = s.match(/\d+/g) || [];
  if (!g.length) return '';
  const pm = s.match(/([А-Я]+)/);
  const pref = pm ? pm[1] : '';
  const parts: string[] = [];
  g.forEach((x, ix) => {
    if (ix === 0 && x.length === 4 && g.length >= 2) {
      parts.push(x.slice(0, 2));
      parts.push(x.slice(2));
    } else {
      parts.push(x);
    }
  });
  const numbered = parts.map((x) => {
    const n = parseInt(x, 10);
    return isNaN(n) ? x : String(n);
  });
  return pref + numbered.join('-');
}

const RZ_KOD_OK = new Set([
  'КР', 'АР', 'КЖ', 'АС', 'ЭО', 'ЭМ', 'ОВ', 'ВК', 'СС',
  'ТХ', 'ГП', 'ПЗ', 'ФЛ', 'БФМ', 'ПМ', 'КМ', 'ТИП',
]);

/**
 * DRAWING-SHEET codes (КР-5, АР-12…) — an engineer links by these even when
 * section names don't match. A range ("КР-28-35") is expanded.
 * ⚠️ `\b` is NOT used — JS's `\w` doesn't know Cyrillic, so it can't find a
 * word boundary there.
 */
export function rzKodlar(nom: unknown): string[] {
  const s = String(nom == null ? '' : nom).toUpperCase().replace(/Ё/g, 'Е');
  const out: Record<string, 1> = {};
  const re = /(^|[^А-ЯA-Z0-9])([А-Я]{1,3})[\s.-]*(\d{1,3})(?:\s*[-–]\s*(\d{1,3}))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const p = m[2];
    if (!RZ_KOD_OK.has(p)) continue;
    const a = parseInt(m[3], 10);
    let b = m[4] ? parseInt(m[4], 10) : a;
    if (isNaN(a)) continue;
    if (b < a || b - a > 40) b = a;
    for (let v = a; v <= b; v++) out[p + v] = 1;
  }
  return Object.keys(out);
}

/* ============ 2. ENGINE — PURE FUNCTION ============ */

interface ScopeIndex {
  byKod: Record<string, LrvNode[]>;
  byNomBir: Record<string, LrvNode[]>;
  byKanon: Record<string, LrvNode[]>;
  all: LrvNode[];
}

function pushIndex(map: Record<string, LrvNode[]>, key: string, node: LrvNode) {
  if (!key) return;
  (map[key] = map[key] || []).push(node);
}

function newScope(): ScopeIndex {
  return { byKod: {}, byNomBir: {}, byKanon: {}, all: [] };
}

/**
 * F2 auto-matching engine.
 *
 * @param aktTree F2 act tree (`apiF2FaylOqi` output). Node: {uid,type,kod,nom,bir,hajm,narx,summa,children}.
 * @param lrvTree LRV_PLUS tree (`apiHolatOl(...).tree`). Node: {type,kod,nom,birlik,varaq,row,lokalka,children}.
 * @param opts `{lokalka?}` — '' or 'AVTO' => auto/no restriction, search everything.
 *
 * ⚠️ ASYMMETRY (kept intentionally, matches the GAS source): act node unit field is `bir`, LRV node unit field is `birlik`.
 */
export function f2MatchEngine(
  aktTree: AktNode[] | null | undefined,
  lrvTree: LrvNode[] | null | undefined,
  opts?: F2MatchOptions,
): F2MatchResult {
  const akt = aktTree || [];
  const lrv = lrvTree || [];
  const o = opts || {};

  const mosliklar: F2MatchResult['mosliklar'] = [];
  const sabablar: Record<string, string> = {};
  const rzDiag: RzDiagEntry[] = [];
  const takliflar: Record<string, LrvNode[]> = {};

  // Speed: the client used to search with `.some()` — O(n). 10,000 LRV rows
  // × 2,000 act nodes = 20M comparisons → minutes in GAS. A Set makes it O(1).
  // Behavior is IDENTICAL, only the lookup structure changed.
  const band: Record<string, 1> = {}; // 'varaq#row' -> 1
  const moslangan: Record<string, 1> = {}; // uid -> 1
  const smetaTaken = (varaq: string, row: number) => band[varaq + '#' + row] === 1;
  const alreadyMapped = (uid: string) => moslangan[uid] === 1;
  function qoshMoslik(fNode: AktNode, sMatch: LrvNode) {
    mosliklar.push({
      uid: fNode.uid, varaq: sMatch.varaq, row: sMatch.row,
      kod: fNode.kod, hajm: fNode.hajm,
      narx: fNode.narx || 0, summa: fNode.summa || 0,
    });
    band[sMatch.varaq + '#' + sMatch.row] = 1;
    moslangan[fNode.uid] = 1;
  }

  /* --- 2.1 Lokalka (multi-estimate object) --- */
  const lok = o.lokalka && o.lokalka !== 'AVTO' ? o.lokalka : '';
  const lokAuto = false;
  // The system never auto-picks a lokalka; global search stays open for everything.

  /* --- 2.2 Global indices (respecting the lokalka restriction) --- */
  const byKod: Record<string, LrvNode[]> = {};
  const byNomBir: Record<string, LrvNode[]> = {};
  const byKanon: Record<string, LrvNode[]> = {};
  {
    const collect = (nodes: LrvNode[] | undefined) => {
      (nodes || []).forEach((n) => {
        if (n.type && n.type !== 'rz') {
          const k = normKod(n.kod);
          if (k) pushIndex(byKod, k, n);
          const kk = kodKanon(n.kod);
          if (kk) pushIndex(byKanon, kk, n);
          const nb = normNom(n.nom) + '||' + normBir(n.birlik);
          pushIndex(byNomBir, nb, n);
        }
        if (n.children) collect(n.children);
      });
    };
    lrv.forEach((rz) => {
      if (rz.type !== 'rz') return;
      if (lok && (rz.lokalka || '') !== lok) return;
      collect(rz.children);
    });
  }

  /* --- 2.3 SECTION SCOPES ---
   * Measured: a BL code is GLOBALLY unique in 11/54 cases, but unique WITHIN
   * its own section in 132/186 (71%) — hence: try the section scope first, then the item.
   */
  const rzScope: Record<string, ScopeIndex> = {};
  function scopeAdd(key: string, n: LrvNode) {
    if (!key) return;
    const sc = (rzScope[key] = rzScope[key] || newScope());
    const k = normKod(n.kod);
    if (k) pushIndex(sc.byKod, k, n);
    const kk = kodKanon(n.kod);
    if (kk) pushIndex(sc.byKanon, kk, n);
    const nb = normNom(n.nom) + '||' + normBir(n.birlik);
    pushIndex(sc.byNomBir, nb, n);
    sc.all.push(n);
  }
  lrv.forEach((rz) => {
    if (rz.type !== 'rz') return;
    if (lok && (rz.lokalka || '') !== lok) return;
    const k1 = normRz(rz.nom);
    const kodKeys = rzKodlar(rz.nom).map((k) => '#' + k);
    const collect = (nodes: LrvNode[] | undefined) => {
      (nodes || []).forEach((n) => {
        if (n.type && n.type !== 'rz') {
          scopeAdd(k1, n);
          kodKeys.forEach((kk) => scopeAdd(kk, n));
        }
        if (n.children) collect(n.children);
      });
    };
    collect(rz.children);
  });

  function scopeQosh(a: ScopeIndex | null, b: ScopeIndex | undefined): ScopeIndex | null {
    if (!b) return a;
    const target = a || newScope();
    for (const k in b.byKod) (target.byKod[k] = target.byKod[k] || []).push(...b.byKod[k]);
    for (const kk in b.byKanon || {}) (target.byKanon[kk] = target.byKanon[kk] || []).push(...b.byKanon[kk]);
    for (const n in b.byNomBir) (target.byNomBir[n] = target.byNomBir[n] || []).push(...b.byNomBir[n]);
    target.all.push(...b.all);
    return target;
  }
  function scopeOl(fRzNom: string | undefined): ScopeIndex | null {
    const k1 = normRz(fRzNom);
    if (rzScope[k1]) return rzScope[k1];
    const kodlar = rzKodlar(fRzNom);
    if (!kodlar.length) return null;
    let birlashgan: ScopeIndex | null = null;
    kodlar.forEach((k) => {
      const s = rzScope['#' + k];
      if (s) birlashgan = scopeQosh(birlashgan, s);
    });
    return birlashgan;
  }

  /* --- 2.4 SELECTORS --- */

  function ekvivmi(cands: LrvNode[]): boolean {
    if (cands.length < 2) return true;
    const key = (c: LrvNode) => normKod(c.kod) + '||' + normNom(c.nom) + '||' + normBir(c.birlik) + '||' + (Number((c as unknown as { narx?: number }).narx) || 0);
    const k0 = key(cands[0]);
    for (let i = 1; i < cands.length; i++) if (key(cands[i]) !== k0) return false;
    return true;
  }
  function birinchiBosh(cands: LrvNode[]): LrvNode | null {
    for (let i = 0; i < cands.length; i++) if (!smetaTaken(cands[i].varaq, cands[i].row)) return cands[i];
    return null;
  }

  /**
   * ⚡⚡⚡ Root cause of a real 2026-08-16 incident ("auto-match is binding to
   * wrong places"). User's own words: "make it work so precisely that it
   * only binds when it finds EXACTLY its own place, otherwise not at all."
   * The old code took the first free candidate even when candidates were
   * DIFFERENT items — silent wrong-money-to-wrong-work errors that the UI
   * still showed as a green "matched". Now: multiple candidates only bind
   * if they are all EQUIVALENT (code+name+unit+price all equal — i.e. it
   * doesn't matter which one is picked, the result is the same); otherwise
   * it does not bind and is left for manual matching.
   */
  function pickUnique(cands: LrvNode[]): LrvNode | null {
    if (!cands || !cands.length) return null;
    const ok = cands.filter((c) => c.type !== 'rz');
    if (!ok.length) return null;
    if (ok.length === 1) return smetaTaken(ok[0].varaq, ok[0].row) ? null : ok[0];
    return ekvivmi(ok) ? birinchiBosh(ok) : null;
  }
  /** STRICT: only exactly one candidate. No equivalence-shortcut, no fuzzy. A generic resource (000001 = "labor cost") is identical in 153 places — must never get mixed together. */
  function pickQatiy(arr: LrvNode[] | undefined): LrvNode | null {
    if (!arr || arr.length !== 1) return null;
    const c = arr[0];
    return c.type !== 'rz' && !smetaTaken(c.varaq, c.row) ? c : null;
  }
  // Referenced for parity with the source's own self-documentation of its strict path; not currently invoked by any live branch below (mirrors 35_F2Moslash.js exactly — `pickQatiy` itself likewise has no call site in the source at time of port).
  void pickQatiy;

  /** UNIT SHIELD: "ПРОВОЛОКА [Т]" ↔ "ПРОВОЛОКА [КГ]" — 1000x error risk. */
  function birMos(aBir: string | undefined, bBir: string | undefined): boolean {
    const x = normBir(aBir);
    const y = normBir(bBir);
    if (!x || !y) return true; // one side empty — no judgment made
    return x === y;
  }

  /**
   * FUZZY: when nothing exact is found, name similarity within the section
   * scope. STRICT conditions: unit exactly equal · numbers exactly equal
   * (B25≠B30) · Dice ≥ .86 · winner margin ≥ .12.
   * ⚠️⚠️ 2026-07-29 FIX — this guard was dead in the legacy client: its
   * tokenizer normalized whitespace away BEFORE splitting on it, so every
   * name became a single long token and fuzzy (and grade-mismatch, which
   * depends on tokens) never fired. Fixed order here: split the RAW text
   * into words first, then normalize each word.
   */
  function tokenlar(s: unknown): string[] {
    const raw = String(s == null ? '' : s).toUpperCase().replace(/Ё/g, 'Е');
    const parts = raw.split(/[^0-9A-Za-zА-Яа-я]+/);
    const out: string[] = [];
    for (const part of parts) {
      const t = normNom(part);
      if (t.length >= 2) out.push(t);
    }
    return out;
  }
  function raqamlar(s: unknown): string {
    const m = String(s || '').match(/\d+([.,]\d+)?/g) || [];
    return m.map((x) => x.replace(',', '.')).sort().join('|');
  }
  function dice(aTok: string[], bTok: string[]): number {
    if (!aTok.length || !bTok.length) return 0;
    const setB: Record<string, number> = {};
    let hit = 0;
    bTok.forEach((t) => { setB[t] = (setB[t] || 0) + 1; });
    aTok.forEach((t) => { if (setB[t] > 0) { hit++; setB[t]--; } });
    return (2 * hit) / (aTok.length + bTok.length);
  }
  /** GRADE MISMATCH: ПК↔ПБ, АI↔АIII — a different product, never auto-bound. */
  function qisqaHarfKodlar(s: unknown): string[] {
    return tokenlar(s).filter((t) => /^[А-Я]{2,3}$/.test(t));
  }
  function gradeFarq(nomA: unknown, nomB: unknown): boolean {
    const A = qisqaHarfKodlar(nomA);
    const B = qisqaHarfKodlar(nomB);
    if (!A.length || !B.length) return false;
    const setB: Record<string, 1> = {};
    B.forEach((t) => { setB[t] = 1; });
    const setA: Record<string, 1> = {};
    A.forEach((t) => { setA[t] = 1; });
    const aFarq = A.some((t) => !setB[t]);
    const bFarq = B.some((t) => !setA[t]);
    return aFarq && bFarq;
  }
  function pickFuzzy(cands: LrvNode[] | undefined, fNode: AktNode): LrvNode | null {
    if (!cands || cands.length < 1) return null;
    const free = cands.filter((c) => c.type !== 'rz' && c.type !== 'bl' && !smetaTaken(c.varaq, c.row));
    if (!free.length) return null;
    const fbir = normBir(fNode.bir);
    const fnum = raqamlar(fNode.nom);
    const ftok = tokenlar(fNode.nom);
    if (ftok.length < 2) return null; // too short a name — fuzzy is dangerous
    let b1: LrvNode | null = null;
    let s1 = 0;
    let s2 = 0;
    free.forEach((c) => {
      if (normBir(c.birlik) !== fbir) return;
      if (raqamlar(c.nom) !== fnum) return;
      const sc = dice(ftok, tokenlar(c.nom));
      if (sc > s1) { s2 = s1; s1 = sc; b1 = c; } else if (sc > s2) { s2 = sc; }
    });
    if (b1 && gradeFarq(fNode.nom, (b1 as LrvNode).nom)) return null;
    if (b1 && s1 >= 0.86 && s1 - s2 >= 0.12) return b1;
    return null;
  }

  /* --- 2.5 STATS --- */
  const st: F2MatchStat = {
    moslashti: 0, otkazib: 0, scopeHit: 0, fuzzyHit: 0, kanonHit: 0,
    birlikBlok: 0, zamenaShubha: 0, yetimUrindi: 0, yetimMos: 0,
    lokalka: lok, lokAuto, rzMos: 0, rzJami: 0,
  };

  function sababYoz(uid: string, kK: string, nb: string) {
    const gN = (byKod[kK] || []).length;
    const gN2 = (byNomBir[nb] || []).length;
    if (!gN && !gN2) { sabablar[uid] = 'сметада мос код/ном йўқ (доп бўлиши мумкин)'; return; }
    const n = Math.max(gN, gN2);
    sabablar[uid] = n > 1 ? n + ' та номзод — қўлда танланг' : 'номзод банд ёки раздел мос эмас';
  }

  function collectTaklif(uid: string, sources: LrvNode[]) {
    const uniq: LrvNode[] = [];
    const map: Record<string, 1> = {};
    for (const c of sources) {
      if (!smetaTaken(c.varaq, c.row)) {
        const k = c.varaq + '#' + c.row;
        if (!map[k]) { map[k] = 1; uniq.push(c); }
      }
    }
    if (uniq.length > 0) takliflar[uid] = uniq;
  }

  /* --- 2.6 RESOURCE/MATERIAL (leaf node) --- */
  function processStandalone(fNode: AktNode, scope: ScopeIndex | null, qatiy?: boolean) {
    if (alreadyMapped(fNode.uid)) return;
    const fk = normKod(fNode.kod);
    const fkan = kodKanon(fNode.kod);
    const nb = normNom(fNode.nom) + '||' + normBir(fNode.bir);
    const leafFilter = (c: LrvNode) => c.type !== 'rz' && c.type !== 'bl';
    let sMatch: LrvNode | null = null;
    let viaScope = false;

    if (scope) {
      sMatch = fk ? pickUnique((scope.byKod[fk] || []).filter(leafFilter)) : null;
      if (!sMatch && fkan) sMatch = pickUnique((scope.byKanon[fkan] || []).filter(leafFilter));
      if (!sMatch) sMatch = pickUnique((scope.byNomBir[nb] || []).filter(leafFilter));
      // STRICT mode: fuzzy never runs (mixing-up risk)
      if (!qatiy && !sMatch && scope.all) {
        sMatch = pickFuzzy(scope.all.filter(leafFilter), fNode);
        if (sMatch) st.fuzzyHit++;
      }
      if (sMatch) viaScope = true;
    }
    if (!qatiy && !sMatch && fk) sMatch = pickUnique((byKod[fk] || []).filter(leafFilter));
    if (!qatiy && !sMatch && fkan) sMatch = pickUnique((byKanon[fkan] || []).filter(leafFilter));
    if (!qatiy && !sMatch) sMatch = pickUnique((byNomBir[nb] || []).filter(leafFilter));

    if (sMatch && !birMos(fNode.bir, sMatch.birlik)) {
      st.otkazib++; st.birlikBlok++;
      sabablar[fNode.uid] = '⚖ БИРЛИК фарқли: акт «' + String(fNode.bir || '?') +
        '» ↔ смета «' + String(sMatch.birlik || '?') + '» — қўлда текширинг (1000x хато хавфи)';
      return;
    }
    if (sMatch && gradeFarq(fNode.nom, sMatch.nom)) {
      st.otkazib++; st.zamenaShubha++;
      sabablar[fNode.uid] = '🔄 эҳтимолий ЗАМЕНА: «' + String(sMatch.nom || '').slice(0, 38) +
        '» — маркаси фарқли, қўлда боғланг/замена қилинг';
      return;
    }
    if (sMatch) {
      qoshMoslik(fNode, sMatch);
      st.moslashti++;
      if (viaScope) st.scopeHit++;
    } else {
      st.otkazib++;
      sababYoz(fNode.uid, fk, nb);
      const ts: LrvNode[] = [];
      if (scope && fk) ts.push(...(scope.byKod[fk] || []).filter(leafFilter));
      if (scope && fkan) ts.push(...(scope.byKanon[fkan] || []).filter(leafFilter));
      if (scope) ts.push(...(scope.byNomBir[nb] || []).filter(leafFilter));
      if (!qatiy && fk) ts.push(...(byKod[fk] || []).filter(leafFilter));
      if (!qatiy && fkan) ts.push(...(byKanon[fkan] || []).filter(leafFilter));
      if (!qatiy) ts.push(...(byNomBir[nb] || []).filter(leafFilter));
      collectTaklif(fNode.uid, ts);
    }
  }

  /* --- 2.7 WORK ITEM (bl) + children --- */
  function processBl(fBl: AktNode, scope: ScopeIndex | null, qatiy?: boolean) {
    if (alreadyMapped(fBl.uid)) return;
    const kK = normKod(fBl.kod);
    const nbBl = normNom(fBl.nom) + '||' + normBir(fBl.bir);
    const kanBl = kodKanon(fBl.kod);
    let sMatch: LrvNode | null = null;
    let viaScope = false;
    let viaFuzzy = false;
    let viaKanon = false;

    if (scope) {
      sMatch = kK ? pickUnique(scope.byKod[kK]) : null;
      if (!sMatch && kanBl) { sMatch = pickUnique(scope.byKanon[kanBl]); if (sMatch) viaKanon = true; }
      if (!sMatch) sMatch = pickUnique(scope.byNomBir[nbBl]);
      if (sMatch) viaScope = true;
      if (!qatiy && !sMatch && scope.all) {
        sMatch = pickFuzzy(scope.all, fBl);
        if (sMatch) { viaScope = true; viaFuzzy = true; }
      }
    }
    if (!qatiy && !sMatch) sMatch = pickUnique(byKod[kK]);
    if (!qatiy && !sMatch && kanBl) { sMatch = pickUnique(byKanon[kanBl]); if (sMatch) viaKanon = true; }

    if (sMatch && !birMos(fBl.bir, sMatch.birlik)) {
      st.otkazib++; st.birlikBlok++;
      sabablar[fBl.uid] = '⚖ БИРЛИК фарқли: акт «' + String(fBl.bir || '?') +
        '» ↔ смета «' + String(sMatch.birlik || '?') + '» — қўлда текширинг (1000x хато хавфи)';
      return;
    }
    if (!sMatch) {
      sMatch = pickUnique((byNomBir[nbBl] || []).filter((c) =>
        // LRV may have mis-stored a work as 'mat' — anything but 'rz' passes here
        !!(c && aynanMi(fBl.kod, fBl.nom, fBl.bir, c.kod, c.nom, c.birlik)) && c.type !== 'rz'));
    }

    // Work not found → its children must NOT be lost. (105 unmatched works
    // once meant 824 child resources = 2.57bn never even entered matching.)
    if (!sMatch || sMatch.type === 'rz') {
      st.otkazib++;
      sababYoz(fBl.uid, kK, nbBl);

      const blFilter = (c: LrvNode) => c.type !== 'rz';
      const ts: LrvNode[] = [];
      if (scope && kK) ts.push(...(scope.byKod[kK] || []).filter(blFilter));
      if (scope && kanBl) ts.push(...(scope.byKanon[kanBl] || []).filter(blFilter));
      if (scope) ts.push(...(scope.byNomBir[nbBl] || []).filter(blFilter));
      if (!qatiy && kK) ts.push(...(byKod[kK] || []).filter(blFilter));
      if (!qatiy && kanBl) ts.push(...(byKanon[kanBl] || []).filter(blFilter));
      if (!qatiy) ts.push(...(byNomBir[nbBl] || []).filter(blFilter));
      collectTaklif(fBl.uid, ts);

      (fBl.children || []).forEach((fRs) => {
        if (fRs.type !== 'rs' && fRs.type !== 'mat' && fRs.type !== 'ob') return;
        if (alreadyMapped(fRs.uid)) return;
        st.yetimUrindi++;
        const oldin = mosliklar.length;
        processStandalone(fRs, scope, true); // STRICT — never mixes up
        if (mosliklar.length > oldin) st.yetimMos++;
      });
      return;
    }
    // GRADE MISMATCH gate: ПК↔ПБ — must be manually replaced (zamena)
    if (gradeFarq(fBl.nom, sMatch.nom)) {
      st.otkazib++; st.zamenaShubha++;
      sabablar[fBl.uid] = '🔄 эҳтимолий ЗАМЕНА: «' + String(sMatch.nom || '').slice(0, 38) +
        '» — маркаси фарқли, қўлда боғланг/замена қилинг';
      return;
    }

    qoshMoslik(fBl, sMatch);
    st.moslashti++;
    if (viaScope) st.scopeHit++;
    if (viaFuzzy) st.fuzzyHit++;
    if (viaKanon) st.kanonHit++;

    // Children are searched ONLY within this matched work. ⚠️ A global
    // search for generic codes used to pick a random row and misattribute money.
    if (fBl.children && fBl.children.length && sMatch.children && sMatch.children.length) {
      const sMatchChildren = sMatch.children;
      fBl.children.forEach((fRs) => {
        if (fRs.type !== 'rs' && fRs.type !== 'mat' && fRs.type !== 'ob') return;
        if (alreadyMapped(fRs.uid)) return;

        const fk = normKod(fRs.kod);
        const candKod = fk ? sMatchChildren.filter((c) => normKod(c.kod) === fk) : [];
        let sRs: LrvNode | null = candKod.length === 1 && !smetaTaken(candKod[0].varaq, candKod[0].row) ? candKod[0] : null;

        if (!sRs) {
          const kn2 = kodKanon(fRs.kod);
          const candKan = kn2 ? sMatchChildren.filter((c) => kodKanon(c.kod) === kn2) : [];
          if (candKan.length === 1 && !smetaTaken(candKan[0].varaq, candKan[0].row)) sRs = candKan[0];
        }
        if (!sRs) {
          const nb2 = normNom(fRs.nom) + '||' + normBir(fRs.bir);
          const candRs = sMatchChildren.filter((c) => normNom(c.nom) + '||' + normBir(c.birlik) === nb2);
          if (candRs.length === 1 && !smetaTaken(candRs[0].varaq, candRs[0].row)) sRs = candRs[0];
        }
        // Work matched, but its child wasn't found (LRV may store it as
        // 'mat') → search STRICTLY within the section scope.
        if (!sRs) {
          const oldinS = mosliklar.length;
          processStandalone(fRs, scope, true);
          if (mosliklar.length > oldinS) { st.moslashti++; return; }
        }
        if (sRs) { qoshMoslik(fRs, sRs); st.moslashti++; }
        else st.otkazib++;
      });
    }
  }

  /* --- 2.8 TREE WALK --- */
  (function walk(nodes: AktNode[], scope: ScopeIndex | null) {
    (nodes || []).forEach((n) => {
      if (n.type === 'rz') {
        const sc = scopeOl(n.nom);
        rzDiag.push({ nom: n.nom, ok: !!sc });
        walk(n.children || [], sc);
        return;
      }
      if (n.type === 'bl') processBl(n, scope);
      else if (n.type === 'mat' || n.type === 'ob' || n.type === 'rs') processStandalone(n, scope);
    });
  })(akt, null);

  st.rzMos = rzDiag.filter((d) => d.ok).length;
  st.rzJami = rzDiag.length;

  return { mosliklar, sabablar, rzDiag, stat: st, takliflar };
}

/**
 * Which lokalka (sub-estimate) an act most likely belongs to: matching
 * section name scores +5, matching work code scores +1.
 * Ported from `_f2mLokalkaAniqla` in `Smeta tizimi/35_F2Moslash.js`.
 */
export function f2LokalkaAniqla(
  aktTree: AktNode[] | null | undefined,
  lrvTree: LrvNode[] | null | undefined,
): { best: string; ball: number; soni: number } {
  const aktRz: Record<string, 1> = {};
  const aktKod: Record<string, 1> = {};
  (aktTree || []).forEach((rz) => {
    const k = normRz(rz.nom);
    if (k) aktRz[k] = 1;
    (function w(nodes: AktNode[] | undefined) {
      (nodes || []).forEach((n) => {
        if (n.type === 'bl') { const kk = normKod(n.kod); if (kk) aktKod[kk] = 1; }
        if (n.children) w(n.children);
      });
    })(rz.children);
  });
  const scores: Record<string, number> = {};
  (lrvTree || []).forEach((rz) => {
    if (rz.type !== 'rz') return;
    const L = rz.lokalka || '';
    if (!L) return;
    scores[L] = scores[L] || 0;
    if (aktRz[normRz(rz.nom)]) scores[L] += 5;
    (function w(nodes: LrvNode[] | undefined) {
      (nodes || []).forEach((n) => {
        if (n.type === 'bl' && aktKod[normKod(n.kod)]) scores[L] += 1;
        if (n.children) w(n.children);
      });
    })(rz.children);
  });
  let best = '';
  let bs = 0;
  for (const L in scores) if (scores[L] > bs) { bs = scores[L]; best = L; }
  return { best, ball: bs, soni: Object.keys(scores).length };
}
