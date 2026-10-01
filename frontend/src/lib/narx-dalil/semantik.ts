import type { NarxManbaTur } from '../../api/t2-narx-dalil';

export type NarxQidiruvResurs = {
  id: number;
  nom: string | null;
  birlik: string | null;
  kod: string | null;
  narx: number | null;
  kat: string | null;
  tur: string | null;
};

export type NarxQidiruvManba = {
  id: number;
  manba_id: number;
  nom: string;
  birlik: string | null;
  kod: string | null;
  narx: number | null;
};

export type NarxSemantikNomzod = {
  qator_id: number;
  manba_qator_id: number;
  manba_id: number;
  manba_narx: number;
  smeta_narx: number | null;
  farqFoiz: number | null;
  moslikFoiz: number;
  moslik: 'kod' | 'nom_birlik' | 'semantik';
  sabablar: string[];
  resursKalit: string;
};

const UNIT: Record<string, string> = {
  'машч': 'mashch', 'машчас': 'mashch', 'машиночас': 'mashch', 'машчасов': 'mashch',
  'челч': 'chelch', 'челчас': 'chelch', 'челчасов': 'chelch',
  'м3': 'm3', 'м³': 'm3', 'кубм': 'm3', 'кубметр': 'm3',
  'т': 't', 'тонна': 't', 'кг': 'kg', 'шт': 'pcs', 'м2': 'm2', 'м²': 'm2',
};

const STOP = new Set(['и', 'или', 'для', 'по', 'на', 'при', 'с', 'со', 'из', 'в', 'во', 'к', 'от', 'до', 'за', 'наименование', 'ресурс']);

function clean(v: unknown) {
  return String(v ?? '').toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').replace(/ў/g, 'у').replace(/ғ/g, 'г').replace(/қ/g, 'к').replace(/ҳ/g, 'х').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export function nomKalit(v: unknown) {
  return clean(v).replace(/\s+/g, '');
}

export function birlikKalit(v: unknown) {
  const c = clean(v).replace(/\s+/g, '');
  return UNIT[c] ?? c;
}

function tokens(v: unknown) {
  return clean(v).split(/\s+/).filter(t => t.length > 1 && !STOP.has(t)).map(tokenIldizi);
}

/**
 * Ruscha/uzbekcha kataloglarda bir xil resurs ko‘pincha kelishik yoki ko‘plik
 * qo‘shimchasi bilan yoziladi: `экскаваторы`/`экскаватор`,
 * `гусеничном`/`гусеничный`. Bu lug‘at emas, faqat nomzod qidiruv indeksi
 * uchun konservativ normalizatsiya; yakuniy bog‘lashni operator tasdiqlaydi.
 */
function tokenIldizi(token: string) {
  if (token.length < 5) return token;
  const ildiz = token.replace(/(?:ами|ями|ого|ему|ому|ыми|ими|ов|ев|ей|ом|ем|ый|ий|ой|ая|яя|ое|ее|ие|ые|ы|и|а|я|у|ю|ь|й)$/u, '');
  return ildiz.length >= 3 ? ildiz : token;
}

function sameUnit(a: unknown, b: unknown) {
  const x = birlikKalit(a); const y = birlikKalit(b);
  return !x || !y || x === y;
}

function compatibleCategory(q: NarxQidiruvResurs, m: NarxQidiruvManba & { manbaTur?: NarxManbaTur }) {
  // Generic catalog/faktura/KP rows may contain any resource category. Only
  // an explicitly opposite published source type is a hard exclusion.
  if (q.kat === 'МАШ' && m.manbaTur === 'chel_chas') return false;
  if (q.kat === 'ЧЕЛ' && m.manbaTur === 'kalkulyatsiya_mash') return false;
  return true;
}

function candidateScore(q: NarxQidiruvResurs, m: NarxQidiruvManba & { manbaTur?: NarxManbaTur }) {
  if (m.narx == null || !Number.isFinite(m.narx) || !sameUnit(q.birlik, m.birlik) || !compatibleCategory(q, m)) return null;
  const reasons: string[] = [];
  const qCode = nomKalit(q.kod); const mCode = nomKalit(m.kod);
  const qName = nomKalit(q.nom); const mName = nomKalit(m.nom);
  let score = 0;
  let moslik: NarxSemantikNomzod['moslik'] = 'semantik';
  if (qCode && mCode && qCode === mCode) {
    score = 100; moslik = 'kod'; reasons.push('shifr bir xil');
  } else {
    const qt = new Set(tokens(q.nom)); const mt = new Set(tokens(m.nom));
    const common = [...qt].filter(t => mt.has(t));
    if (!common.length && !(qName && mName && (qName.includes(mName) || mName.includes(qName)))) return null;
    const union = new Set([...qt, ...mt]).size || 1;
    const overlap = common.length / union;
    const contains = qName && mName && (qName.includes(mName) || mName.includes(qName));
    score = Math.min(94, 35 + Math.round(overlap * 55) + (contains ? 8 : 0));
    moslik = score >= 72 ? 'nom_birlik' : 'semantik';
    reasons.push(contains ? 'nom mazmuni bir-birini qamraydi' : `${common.length} ta asosiy nom belgisi mos`);
  }
  const qUnit = birlikKalit(q.birlik); const mUnit = birlikKalit(m.birlik);
  if (qUnit && mUnit && qUnit === mUnit) { score = Math.min(100, score + (moslik === 'kod' ? 0 : 5)); reasons.push('birlik mos'); }
  else if (!mUnit) reasons.push('manba birligi ko‘rsatilmagan — qo‘lda tekshirish kerak');
  if (m.manbaTur) reasons.push(`manba turi: ${m.manbaTur}`);
  return { score: Math.max(0, Math.min(100, score)), moslik, reasons };
}

/**
 * Barcha qatorlarni barcha manbalar bilan O(n²) solishtirmaydi.
 * Nom tokenlari, shifr va birlik indekslari orqali kichik nomzodlar to‘plami
 * quradi. Natija faqat taklif; canonical narxga yozmaydi.
 */
export function narxSemantikNomzodlari(
  resources: readonly (NarxQidiruvResurs & { manbaTur?: NarxManbaTur })[],
  sources: readonly (NarxQidiruvManba & { manbaTur?: NarxManbaTur })[],
  limit = 5,
): NarxSemantikNomzod[] {
  type IndexedSource = NarxQidiruvManba & { manbaTur?: NarxManbaTur };
  const byCode = new Map<string, IndexedSource[]>();
  const byToken = new Map<string, IndexedSource[]>();
  const MAX_POSTING_LIST = 3000;
  for (const s of sources) {
    if (s.narx == null) continue;
    const code = nomKalit(s.kod);
    if (code) byCode.set(code, [...(byCode.get(code) ?? []), s]);
    for (const token of new Set(tokens(s.nom))) byToken.set(token, [...(byToken.get(token) ?? []), s]);
  }
  const out: NarxSemantikNomzod[] = [];
  for (const q of resources) {
    const pool = new Map<number, IndexedSource>();
    const code = nomKalit(q.kod);
    for (const s of (code ? byCode.get(code) ?? [] : [])) pool.set(s.id, s);
    const qTokens = [...new Set(tokens(q.nom))]
      .sort((a, b) => (byToken.get(a)?.length ?? Number.MAX_SAFE_INTEGER) - (byToken.get(b)?.length ?? Number.MAX_SAFE_INTEGER))
      .slice(0, 4);
    for (const token of qTokens) for (const s of (byToken.get(token) ?? []).slice(0, MAX_POSTING_LIST)) pool.set(s.id, s);
    const scored = [...pool.values()].map(s => {
      const x = candidateScore(q, s);
      if (!x) return null;
      const farqFoiz = q.narx != null && q.narx !== 0 ? Math.round(((s.narx! - q.narx) / q.narx) * 10000) / 100 : null;
      return { qator_id: q.id, manba_qator_id: s.id, manba_id: s.manba_id, manba_narx: s.narx!, smeta_narx: q.narx, farqFoiz, moslikFoiz: x.score, moslik: x.moslik, sabablar: x.reasons, resursKalit: `${nomKalit(q.nom)}|${birlikKalit(q.birlik)}` } as NarxSemantikNomzod;
    }).filter((x): x is NarxSemantikNomzod => !!x && x.moslikFoiz >= 35);
    scored.sort((a, b) => b.moslikFoiz - a.moslikFoiz || a.manba_narx - b.manba_narx || a.manba_qator_id - b.manba_qator_id);
    out.push(...scored.slice(0, limit));
  }
  return out;
}
