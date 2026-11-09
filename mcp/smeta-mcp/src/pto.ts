/**
 * PTO qamrovi (MCP qamrov v1) toollari uchun SOF yordamchilar — bazasiz, testlanadi.
 * Pul: QQS siz; null — noma'lum (0 EMAS). F2 qator shakli `ish-oqimi.ts → f2Qator` bilan bir xil.
 */
import {
  CHANG_HAJM, f2Qator, mavjudYuk, stornomi, y2, y6, type F2YukQator, type MavjudAktQator, type MumkinQator,
} from './ish-oqimi';

// ───────────────────────────── Daraxt: qator → bo'lim ─────────────────────────────

export type DaraxtQator = { id: number; ota_id: number | null; tur: string; nom?: string | null };

/** Har qator uchun eng yuqori bo'lim (rz) ajdodi; bo'limsiz qator — null. */
export function bolimXarita(qatorlar: readonly DaraxtQator[]): Map<number, number | null> {
  const by = new Map(qatorlar.map((q) => [q.id, q]));
  const memo = new Map<number, number | null>();
  const top = (id: number): number | null => {
    if (memo.has(id)) return memo.get(id)!;
    const zanjir: number[] = [];
    let joriy: DaraxtQator | undefined = by.get(id);
    let natija: number | null = null;
    const korildi = new Set<number>();
    while (joriy && !korildi.has(joriy.id)) {
      korildi.add(joriy.id);
      if (memo.has(joriy.id)) { const m = memo.get(joriy.id)!; natija = m ?? natija; if (m != null) break; }
      zanjir.push(joriy.id);
      if (joriy.tur === 'rz') natija = joriy.id;
      joriy = joriy.ota_id != null ? by.get(joriy.ota_id) : undefined;
    }
    for (const z of zanjir) memo.set(z, natija);
    return natija;
  };
  for (const q of qatorlar) top(q.id);
  return memo;
}

/** `ildiz` va uning barcha avlodlari id to'plami. */
export function avlodlar(qatorlar: readonly DaraxtQator[], ildiz: number): Set<number> {
  const bolalar = new Map<number, number[]>();
  for (const q of qatorlar) if (q.ota_id != null) { const a = bolalar.get(q.ota_id) ?? []; a.push(q.id); bolalar.set(q.ota_id, a); }
  const out = new Set<number>([ildiz]);
  const navbat = [ildiz];
  while (navbat.length) { const x = navbat.pop()!; for (const b of bolalar.get(x) ?? []) if (!out.has(b)) { out.add(b); navbat.push(b); } }
  return out;
}

// ───────────────────────────── F2 qoralamani yangilash ─────────────────────────────

export type NarxQoida = 'max' | 'smeta' | 'berilgan';

/** Narx qoidasi: max(smeta, berilgan xarid narxi); bittasi bo'lsa — o'sha; ikkalasi yo'q — null (avto narxsiz). */
export function narxTanla(smeta: number | null | undefined, berilgan: number | null | undefined, qoida: NarxQoida = 'max'): { narx: number | null; manba: 'smeta' | 'berilgan' | null } {
  const s = smeta == null || !Number.isFinite(Number(smeta)) ? null : Number(smeta);
  const b = berilgan == null || !Number.isFinite(Number(berilgan)) ? null : Number(berilgan);
  if (qoida === 'smeta') return s == null ? { narx: b, manba: b == null ? null : 'berilgan' } : { narx: s, manba: 'smeta' };
  if (qoida === 'berilgan') return b == null ? { narx: s, manba: s == null ? null : 'smeta' } : { narx: b, manba: 'berilgan' };
  if (s == null && b == null) return { narx: null, manba: null };
  if (s == null) return { narx: b, manba: 'berilgan' };
  if (b == null) return { narx: s, manba: 'smeta' };
  return b > s ? { narx: b, manba: 'berilgan' } : { narx: s, manba: 'smeta' };
}

export const NARX_XARID = 'цена закупки (max: смета/закуп)';

/**
 * Qoralamani fakt qoldig'idan (f2_mumkin) qayta qurish: har qator hajmi = joriy f2_mumkin, narx = qoida bo'yicha.
 * Storno qatorlari aynan saqlanadi. `faqatMavjud` — faqat qoralamada bor qatorlar yangilanadi (yangi qo'shilmaydi).
 * `mavjudNarxSaqla` — qoralamada qo'lda/hujjatdan qo'yilgan (narxli) narx saqlanadi.
 */
export function f2YangilaYuki(mavjud: readonly MavjudAktQator[], rows: readonly MumkinQator[], o: {
  manba: string; narxlar?: Record<string, number>; qoida?: NarxQoida; faqatMavjud?: boolean; mavjudNarxSaqla?: boolean;
}) {
  const oddiy = new Map<number, MavjudAktQator>();
  for (const q of mavjud) if (!stornomi(q)) oddiy.set(q.qator_id, q);
  const storno = mavjud.filter((q) => stornomi(q)).map(mavjudYuk);
  const narxlar = o.narxlar ?? {};
  const yuk: Array<F2YukQator & { manba_akt_qator_id?: number }> = [...storno];
  let qoshildi = 0; let ozgardi = 0; let ozgarmadi = 0; let berilganNarx = 0;
  const kirdi = new Set<number>();
  for (const r of rows) {
    if (!(Number.isFinite(r.mumkin) && r.mumkin > CHANG_HAJM) || !['bl', 'rs', 'mat', 'ob'].includes(r.tur)) continue;
    const eski = oddiy.get(r.qator_id);
    if (o.faqatMavjud && !eski) continue;
    let ov: { narx: number; manba?: string } | undefined;
    if (r.tur !== 'bl') {
      const eskiNarx = eski && eski.provenance_status !== 'price_intentionally_absent' && eski.certified_unit_price != null ? Number(eski.certified_unit_price) : null;
      if (o.mavjudNarxSaqla && eskiNarx != null) ov = { narx: eskiNarx, manba: 'цена по документу' };
      else {
        const t = narxTanla(r.smeta_narx, narxlar[String(r.qator_id)], o.qoida ?? 'max');
        if (t.manba === 'berilgan' && t.narx != null) { ov = { narx: t.narx, manba: NARX_XARID }; berilganNarx++; }
        else if (t.narx == null) ov = undefined;
      }
    }
    const q = f2Qator(r, r.mumkin, o.manba, ov);
    if (eski) {
      kirdi.add(r.qator_id);
      const bir = Math.abs(Number(eski.certified_quantity ?? eski.hajm ?? 0) - q.certified_quantity) < CHANG_HAJM
        && (eski.certified_unit_price == null ? null : Number(eski.certified_unit_price)) === q.certified_unit_price;
      if (bir) { yuk.push(mavjudYuk(eski)); ozgarmadi++; continue; }
      ozgardi++;
      yuk.push({ ...q, izoh: eski.izoh ?? null });
    } else { qoshildi++; yuk.push(q); }
  }
  const olindi = [...oddiy.keys()].filter((id) => !kirdi.has(id));
  return { yuk, qoshildi, ozgardi, ozgarmadi, olindi, berilgan_narx: berilganNarx, storno: storno.length };
}

// ───────────────────────────── F2 (certified) qatorlari ─────────────────────────────

export type CertKirish = { qator_id: number; hajm: number; narx?: number | null; summa?: number; narxsiz?: boolean; narx_manba?: string; izoh?: string };

/**
 * Aniq F2 qatorlari: ish (bl) — narxsiz (price_intentionally_absent); resurs narx berilmasa — smeta narxi;
 * narx null — avto narxsiz (tasdiqdan oldin narx kerak); narx 0 — ongli narxsiz (summa 0 emas, null); `narxsiz:true` — ongli narxsiz.
 */
export function f2CertYuki(qatorlar: readonly CertKirish[], meta: ReadonlyMap<number, { tur: string; smeta_narx: number | null }>, manba: string) {
  const xato: string[] = [];
  const yuk: F2YukQator[] = [];
  const takror = new Set<number>();
  let narx0 = 0; let avto = 0;
  for (const k of qatorlar) {
    const m = meta.get(k.qator_id);
    if (!m) { xato.push(`#${k.qator_id}: qator obyektda yo'q yoki faol emas`); continue; }
    if (!['bl', 'rs', 'mat', 'ob'].includes(m.tur)) { xato.push(`#${k.qator_id}: tur ${m.tur} — F2 ga faqat bl/rs/mat/ob`); continue; }
    if (takror.has(k.qator_id)) { xato.push(`#${k.qator_id}: ikki marta berilgan`); continue; }
    takror.add(k.qator_id);
    if (!Number.isFinite(k.hajm) || Math.abs(k.hajm) < CHANG_HAJM) { xato.push(`#${k.qator_id}: hajm 0 bo'lmasin`); continue; }
    const hajm = y6(k.hajm);
    const asos = { source: 'native_f2_preparation', enteredQuantity: hajm, hajmManba: 'qolda' } as Record<string, unknown>;
    const absent = (snap: Record<string, unknown>): F2YukQator => ({ qator_id: k.qator_id, certified_quantity: hajm, certified_unit_price: null, certified_amount: null,
      price_intentionally_absent: true, certified_source_hash: null, raw_snapshot: snap, izoh: k.izoh ?? null });
    if (m.tur === 'bl' || k.narxsiz) { yuk.push(absent({ ...asos, sourceReference: manba })); continue; }
    const narx = k.narx === undefined ? m.smeta_narx : k.narx;
    if (narx == null || !Number.isFinite(Number(narx))) { avto++; yuk.push(absent({ ...asos, sourceReference: `${manba}; без цены`, narxsizSabab: 'avto_qoralama' })); continue; }
    if (Number(narx) < 0) { xato.push(`#${k.qator_id}: narx manfiy`); continue; }
    if (Number(narx) === 0) { narx0++; yuk.push(absent({ ...asos, sourceReference: `${manba}; цена 0`, narx0: true })); continue; }
    const summa = k.summa != null ? y2(k.summa) : y2(hajm * Number(narx));
    const nm = k.narx === undefined ? 'цена по смете' : (k.narx_manba?.trim() || 'цена по документу');
    yuk.push({ qator_id: k.qator_id, certified_quantity: hajm, certified_unit_price: Number(narx), certified_amount: summa, price_intentionally_absent: false, certified_source_hash: null,
      raw_snapshot: { ...asos, sourceReference: `${manba}; ${nm}`, enteredUnitPrice: Number(narx), enteredAmount: summa }, izoh: k.izoh ?? null });
  }
  return { yuk, xato, narx0, avto };
}

// ───────────────────────────── Ish o'chirish: fakt tarixi ─────────────────────────────

export type TarixRef = { qator_id: number; akt_id: number; tur: string; holat: string | null; hajm: number | null };

/** Qator (va avlodlari) hujjat tarixi tahlili: F2 (bekor emas) bormi, fakt har qator bo'yicha sof (net) nolmi. */
export function tarixTahlil(refs: readonly TarixRef[]) {
  const faol = refs.filter((r) => r.holat !== 'bekor');
  const f2 = faol.filter((r) => r.tur === 'f2');
  const net = new Map<number, number>();
  for (const r of faol) if (r.tur === 'fakt') net.set(r.qator_id, (net.get(r.qator_id) ?? 0) + Number(r.hajm ?? 0));
  const nolmas = [...net].filter(([, v]) => Math.abs(v) >= CHANG_HAJM).map(([qator_id, v]) => ({ qator_id, net: y6(v) }));
  const boshqa = faol.filter((r) => r.tur !== 'f2' && r.tur !== 'fakt');
  return {
    f2_aktlar: [...new Set(f2.map((r) => r.akt_id))], fakt_qatorlar: faol.filter((r) => r.tur === 'fakt').length,
    fakt_aktlar: [...new Set(faol.filter((r) => r.tur === 'fakt').map((r) => r.akt_id))], nolmas, boshqa_aktlar: [...new Set(boshqa.map((r) => r.akt_id))],
    toza: faol.length === 0,
  };
}

// ───────────────────────────── Shartnoma pozitsiyalari ↔ smeta qatorlari ─────────────────────────────

const LAT_KIR: Record<string, string> = { A: 'А', B: 'В', C: 'С', E: 'Е', H: 'Н', K: 'К', M: 'М', O: 'О', P: 'Р', T: 'Т', X: 'Х', Y: 'У' };
export const matnNorm = (s: string | null | undefined) => (s ?? '').toUpperCase().replace(/Ё/g, 'Е')
  .replace(/[ABCEHKMOPTXY]/g, (c) => LAT_KIR[c] ?? c)
  .replace(/(\d),(\d)/g, '$1.$2').replace(/[^0-9A-ZА-Я.]+/g, ' ').replace(/\s+/g, ' ').trim();
const STOP = new Set(['И', 'В', 'НА', 'С', 'ПО', 'ДЛЯ', 'ИЗ', 'ДО', 'ОТ', 'ТИПА', 'ПРИ', 'К', 'ИЛИ']);
export const tokenlar = (s: string | null | undefined) => new Set(matnNorm(s).split(' ').map((t) => t.replace(/^\.+|\.+$/g, '')).filter((t) => t.length >= 2 && !STOP.has(t) || /^\d/.test(t)));
export const birlikNorm = (s: string | null | undefined) => matnNorm(s).replace(/[\s.]+/g, '').replace(/^1(?=[А-Я])/, '');

export type Pozitsiya = { nom: string; kod?: string; birlik?: string; soni?: number; narx_qqs?: number };
export type SmetaQ = { id: number; obyekt_id: number; tur: string; kod: string | null; nom: string | null; birlik: string | null; hajm: number | null; narx: number | null };
export type Nomzod = { qator_id: number; obyekt_id: number; tur: string; kod: string | null; nom: string | null; birlik: string | null; hajm: number | null; narx: number | null; ishonch: number; sabab: string[]; narx_farq_foiz?: number | null };

/** Har pozitsiya uchun eng mos smeta qatorlari (ishonch 0…1): nom so'zlari, kod, birlik, hajm yaqinligi; QQS siz narx farqi. */
export function moslash(pozitsiyalar: readonly Pozitsiya[], qatorlar: readonly SmetaQ[], o: { top?: number; minIshonch?: number; ndsFoiz?: number | null } = {}) {
  const top = o.top ?? 3; const min = o.minIshonch ?? 0.25;
  const tok = qatorlar.map((q) => tokenlar(q.nom));
  const indeks = new Map<string, number[]>();
  tok.forEach((s, i) => { for (const t of s) { const a = indeks.get(t) ?? []; a.push(i); indeks.set(t, a); } });
  const kodIdx = new Map<string, number[]>();
  qatorlar.forEach((q, i) => { const k = matnNorm(q.kod).replace(/\s/g, ''); if (k) { const a = kodIdx.get(k) ?? []; a.push(i); kodIdx.set(k, a); } });
  return pozitsiyalar.map((p, pi) => {
    const pt = tokenlar(p.nom);
    const nomzodlar = new Map<number, number>();
    for (const t of pt) for (const i of indeks.get(t) ?? []) nomzodlar.set(i, (nomzodlar.get(i) ?? 0) + 1);
    const pk = matnNorm(p.kod).replace(/\s/g, '');
    if (pk) for (const i of kodIdx.get(pk) ?? []) if (!nomzodlar.has(i)) nomzodlar.set(i, 0);
    const pb = birlikNorm(p.birlik);
    const natija: Nomzod[] = [];
    for (const [i, umumiy] of nomzodlar) {
      const q = qatorlar[i];
      const sabab: string[] = [];
      const qamrov = pt.size ? umumiy / pt.size : 0;
      const jac = pt.size + tok[i].size - umumiy > 0 ? umumiy / (pt.size + tok[i].size - umumiy) : 0;
      let ball = 0.65 * qamrov + 0.2 * jac;
      if (qamrov > 0) sabab.push(`nom ${Math.round(qamrov * 100)}%`);
      if (pk && matnNorm(q.kod).replace(/\s/g, '') === pk) { ball += 0.35; sabab.push('kod mos'); }
      const qb = birlikNorm(q.birlik);
      if (pb && qb) { if (pb === qb) { ball += 0.1; sabab.push('birlik mos'); } else { ball -= 0.1; sabab.push('birlik farqli'); } }
      if (p.soni != null && q.hajm != null && p.soni > 0 && q.hajm > 0) {
        const r = Math.min(p.soni, q.hajm) / Math.max(p.soni, q.hajm);
        ball += 0.1 * r; if (r > 0.95) sabab.push('hajm mos');
      }
      const ishonch = Math.max(0, Math.min(1, Math.round(ball * 100) / 100));
      if (ishonch < min) continue;
      let farq: number | null | undefined;
      if (p.narx_qqs != null && q.narx != null && q.narx > 0) {
        const nds = o.ndsFoiz == null ? null : Number(o.ndsFoiz);
        farq = nds == null ? null : Math.round(((p.narx_qqs / (1 + nds / 100)) / q.narx - 1) * 1000) / 10;
      }
      natija.push({ qator_id: q.id, obyekt_id: q.obyekt_id, tur: q.tur, kod: q.kod, nom: q.nom, birlik: q.birlik, hajm: q.hajm, narx: q.narx, ishonch, sabab, ...(farq !== undefined ? { narx_farq_foiz: farq } : {}) });
    }
    natija.sort((a, b) => b.ishonch - a.ishonch || a.qator_id - b.qator_id);
    const eng = natija.slice(0, top);
    const aniq = eng.length > 0 && eng[0].ishonch >= 0.75 && (eng.length < 2 || eng[0].ishonch - eng[1].ishonch >= 0.1);
    return { i: pi, nom: p.nom, ...(p.kod ? { kod: p.kod } : {}), ...(p.birlik ? { birlik: p.birlik } : {}), ...(p.soni != null ? { soni: p.soni } : {}), holat: !eng.length ? 'topilmadi' : aniq ? 'aniq' : 'noaniq', nomzodlar: eng };
  });
}
