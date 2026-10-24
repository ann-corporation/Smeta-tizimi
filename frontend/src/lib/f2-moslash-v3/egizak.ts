/**
 * EGIZAK OBYEKTDAN NUSXA (egasi 2026-10-24, Fast Food 2-etaj №1/№2/№3): bir xil smeta + bir xil F2 li obyektlarda birinchisida
 * qilingan F2 import ishini (qo'shimcha/zamena qatorlari + bog'lanishlar) qolganlariga takrorlash.
 *
 * Qonunlar:
 *  - ASL SMETA CONST: asl qatorlar o'zgartirilmaydi; xarita faqat tuzilma bo'yicha (id tartibidagi o'rni + daraja/tur/kod/nom/birlik/hajm
 *    + ota mosligi). Bitta farq bo'lsa — rad etiladi.
 *  - Qo'shimcha/zamenalar workbench ishlatadigan AYNI yo'l bilan yoziladi (`RejaliBuyruq` → `rejaliniYoz` → `rejaliYarat` → nomli RPC lar).
 *  - Idempotent: operation_id = f(A qator id, B obyekt id) — qayta ishga tushirishda smetada bor buyruqlar `rejaliniYozilganlardanTozala`
 *    bilan aniqlanib qayta yaratilmaydi (server ham `t2_addrepl_command` orqali takrorni qaytaradi).
 */
import type { Bog, F2Indeks, IshJoyi } from './ishJoyi';
import { BOLIM_ILDIZ, rejaliniYoz, rejaliniYozilganlardanTozala, type RejaliBuyruq, type RejaliResurs, type RejaliYaratish, type YozilganQator } from './rejali';

/** t2_qator dan kerakli ustunlar (asl + qo'shimcha qatorlar). */
export type EgizakQator = {
  id: number; ota_id: number | null; daraja?: number | null; tartib?: number | null; tur: string | null;
  kod: string | null; nom: string | null; birlik: string | null; hajm: number | string | null;
  qoshimcha?: boolean | null; replaces_line_id?: number | null; operation_id?: string | null;
};
export const EGIZAK_USTUNLAR = 'id,ota_id,daraja,tartib,tur,kod,nom,birlik,hajm,qoshimcha,replaces_line_id,operation_id';

const matn = (x: unknown) => (x == null ? '' : String(x)).replace(/\s+/g, ' ').trim();
const son = (x: unknown): number | null => (x == null || x === '' ? null : Number.isFinite(Number(x)) ? Number(x) : null);
/** Float shovqini ichida teng (1e-9 nisbiy / 1e-9 mutlaq). */
export function sonTeng(a: unknown, b: unknown): boolean {
  const x = son(a), y = son(b);
  if (x == null || y == null) return x == null && y == null;
  return Math.abs(x - y) <= Math.max(1e-9, Math.abs(y) * 1e-9);
}
const hajmMatn = (h: unknown) => { const n = son(h); return n == null ? '' : String(+n.toPrecision(12)); };
const tartibla = (a: EgizakQator, b: EgizakQator) => (Number(a.tartib ?? 0) - Number(b.tartib ?? 0)) || a.id - b.id;

/** Asl smeta qatorlari (qo'shimcha/zamena emas), id tartibida. */
export const aslQatorlar = (rows: readonly EgizakQator[]) => rows.filter((q) => !q.qoshimcha).sort((a, b) => a.id - b.id);

/** Asl smeta tuzilmasining imzosi (FNV-1a 32): daraja|tur|kod|nom|birlik|hajm + ota o'rni, id tartibida. */
export function aslImzo(rows: readonly EgizakQator[]): string {
  const asl = aslQatorlar(rows);
  const orin = new Map(asl.map((q, i) => [q.id, i]));
  let h = 0x811c9dc5;
  for (const q of asl) {
    const s = `${q.daraja ?? ''}|${q.tur ?? ''}|${matn(q.kod)}|${matn(q.nom)}|${matn(q.birlik)}|${hajmMatn(q.hajm)}|${q.ota_id == null ? '' : orin.get(q.ota_id) ?? '?'}\n`;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  }
  return `${asl.length}:${h.toString(16).padStart(8, '0')}`;
}

export type AslFarq = { orin: number; aId: number; bId: number | null; maydon: 'soni' | 'tur' | 'daraja' | 'kod' | 'nom' | 'birlik' | 'hajm' | 'ota' };
export type AslXarita =
  | { ok: true; map: Map<number, number>; soni: number; imzo: string }
  | { ok: false; aSoni: number; bSoni: number; imzoA: string; imzoB: string; farqlar: AslFarq[] };

/** A asl qatori → B asl qatori (o'rni bo'yicha). Har juftlik va ota mosligi tekshiriladi; bitta farq bo'lsa ham — rad. */
export function aslXarita(a: readonly EgizakQator[], b: readonly EgizakQator[]): AslXarita {
  const A = aslQatorlar(a), B = aslQatorlar(b);
  const imzoA = aslImzo(a), imzoB = aslImzo(b);
  if (A.length !== B.length) return { ok: false, aSoni: A.length, bSoni: B.length, imzoA, imzoB, farqlar: [{ orin: 0, aId: A[0]?.id ?? 0, bId: B[0]?.id ?? null, maydon: 'soni' }] };
  const map = new Map<number, number>(A.map((q, i) => [q.id, B[i].id]));
  const farqlar: AslFarq[] = [];
  A.forEach((x, i) => {
    const y = B[i];
    const f = (maydon: AslFarq['maydon']) => farqlar.push({ orin: i + 1, aId: x.id, bId: y.id, maydon });
    if ((x.tur ?? '') !== (y.tur ?? '')) f('tur');
    else if (Number(x.daraja ?? -1) !== Number(y.daraja ?? -1)) f('daraja');
    else if (matn(x.kod) !== matn(y.kod)) f('kod');
    else if (matn(x.nom) !== matn(y.nom)) f('nom');
    else if (matn(x.birlik) !== matn(y.birlik)) f('birlik');
    else if (!sonTeng(x.hajm, y.hajm)) f('hajm');
    else if ((x.ota_id == null ? null : map.get(x.ota_id) ?? -1) !== (y.ota_id ?? null)) f('ota');
  });
  if (farqlar.length || imzoA !== imzoB) return { ok: false, aSoni: A.length, bSoni: B.length, imzoA, imzoB, farqlar };
  return { ok: true, map, soni: A.length, imzo: imzoA };
}

/** A qoralamasining manba qatorlari ↔ B da ochiq F2 (uid, kod, hajm bir xil bo'lishi shart). */
export function f2Mosligi(aManba: ReadonlyArray<{ uid: string; kod?: string | null; hajm?: unknown }>, bInd: F2Indeks): { ok: boolean; farqlar: string[] } {
  const farqlar: string[] = [];
  if (aManba.length !== bInd.qatorlar.length) farqlar.push(`#${aManba.length}≠${bInd.qatorlar.length}`);
  for (const r of aManba) {
    const n = bInd.byUid.get(r.uid);
    if (!n) farqlar.push(r.uid);
    else if (matn(r.kod) !== matn(n.kod) || !sonTeng(r.hajm ?? null, n.hajm ?? null)) farqlar.push(r.uid);
    if (farqlar.length >= 20) break;
  }
  return { ok: farqlar.length === 0, farqlar };
}

/** Deterministik operation_id (UUID ko'rinishi, v5 belgilari): bir A qatori + bir B obyekti → doim bir xil. */
export async function egizakOpId(aQatorId: number, bObyektId: number): Promise<string> {
  const buf = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`f2-egizak|v1|${aQatorId}|${bObyektId}`))).slice(0, 16);
  buf[6] = (buf[6] & 0x0f) | 0x50;
  buf[8] = (buf[8] & 0x3f) | 0x80;
  const h = [...buf].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export type KochmaganSabab = 'ota' | 'almashtirilgan' | 'hajm' | 'birlik';
export interface QoshimchaReja {
  /** Yaratish tartibida (A da yaratilgan tartib — id): avval bo'limlar, keyin ularga tayanganlar. tempId = −(A qator id). */
  buyruqlar: RejaliBuyruq[];
  /** Ko'chirilmaydigan A qatorlari (sababi bilan). */
  kochmadi: Array<{ id: number; nom: string; sabab: KochmaganSabab }>;
  /** Yaratiladigan qatorlar jami (resurslar bilan), qo'shimcha va zamena buyruqlari soni. */
  qatorSoni: number; qoshimchaSoni: number; zamenaSoni: number; bolimSoni: number;
}

const RESURS_TUR = new Set(['rs', 'mat', 'ob']);

/**
 * A ning qo'shimcha/zamena qatorlaridan B uchun buyruqlar. Ish (bl) ostidagi qo'shimcha resurslar ish bilan BIRGA
 * (`ish_resurslar_bilan_yarat_v1`, bitta tranzaksiya) yaratiladi; asl ish ostidagi qo'shimcha resurs — alohida `resource`.
 * Joylashuv: zamena — almashtirilgan qatordan keyin; bo'lim — oldingi bo'limdan keyin; qolganlari — A da aynan oldingi qatordan
 * keyin qo'yilgan bo'lsa (bir xil tartib) o'sha qatordan keyin, aks holda ota qator oxirida (A dagi kabi).
 */
export function qoshimchaReja(aRows: readonly EgizakQator[], aslMap: ReadonlyMap<number, number>, opId: ReadonlyMap<number, string>, sabab: string): QoshimchaReja {
  const qosh = aRows.filter((q) => q.qoshimcha).sort((a, b) => a.id - b.id);
  const qoshId = new Set(qosh.map((q) => q.id));
  const byId = new Map(aRows.map((q) => [q.id, q]));
  const bolalar = new Map<number | null, EgizakQator[]>();
  for (const q of aRows) { const k = q.ota_id ?? null; const l = bolalar.get(k); if (l) l.push(q); else bolalar.set(k, [q]); }
  for (const l of bolalar.values()) l.sort(tartibla);
  // Qo'shimcha ish (bl) ostidagi qo'shimcha resurslar — ish bilan birga.
  const birga = new Map<number, EgizakQator[]>();
  const birgaId = new Set<number>();
  for (const q of qosh) {
    if (q.tur !== 'bl') continue;
    const r = (bolalar.get(q.id) ?? []).filter((x) => qoshId.has(x.id) && x.replaces_line_id == null && RESURS_TUR.has(x.tur ?? ''));
    birga.set(q.id, r); r.forEach((x) => birgaId.add(x.id));
  }
  const tashlandi = new Set<number>();
  const kochmadi: QoshimchaReja['kochmadi'] = [];
  const tashla = (q: EgizakQator, s: KochmaganSabab) => {
    tashlandi.add(q.id); kochmadi.push({ id: q.id, nom: matn(q.nom), sabab: s });
    for (const r of birga.get(q.id) ?? []) { tashlandi.add(r.id); kochmadi.push({ id: r.id, nom: matn(r.nom), sabab: 'ota' }); }
  };
  const ref = (id: number | null | undefined): number | undefined => {
    if (id == null) return undefined;
    if (aslMap.has(id)) return aslMap.get(id);
    return qoshId.has(id) && !tashlandi.has(id) ? -id : undefined;
  };
  /** Shu qatordan oldin mavjud bo'ladigan (asl yoki oldinroq yaratilgan) qator. */
  const tayyor = (s: EgizakQator, q: EgizakQator) => aslMap.has(s.id) || (qoshId.has(s.id) && s.id < q.id && !tashlandi.has(s.id) && !birgaId.has(s.id));
  const buyruqlar: RejaliBuyruq[] = [];
  let qatorSoni = 0, qoshimchaSoni = 0, zamenaSoni = 0, bolimSoni = 0;
  for (const q of qosh) {
    if (birgaId.has(q.id)) continue;
    const ota = q.ota_id == null ? (q.tur === 'rz' ? BOLIM_ILDIZ : undefined) : ref(q.ota_id);
    if (ota === undefined) { tashla(q, 'ota'); continue; }
    const aka = bolalar.get(q.ota_id ?? null) ?? [];
    const i = aka.findIndex((x) => x.id === q.id);
    const asos = { tempId: -q.id, f2Uid: '', f2ResursUidlar: [] as string[], otaQatorId: ota, nom: matn(q.nom), kod: matn(q.kod) || undefined, sabab, operationId: opId.get(q.id) ?? '' };
    if (!asos.operationId) throw new Error(`operation_id yo'q: ${q.id}`);
    if (q.tur === 'rz') {
      let keyin: number | undefined;
      for (let j = i - 1; j >= 0; j--) { const s = aka[j]; if (s.tur === 'rz' && tayyor(s, q)) { keyin = ref(s.id); break; } }
      buyruqlar.push({ ...asos, kind: 'bolim', tur: 'rz', resursTempIds: [], keyinQatorId: keyin, birlik: '', resurslar: [] });
      bolimSoni++; qatorSoni++;
      continue;
    }
    const hajm = son(q.hajm);
    const birlik = matn(q.birlik);
    const resursmi = q.replaces_line_id == null && q.tur !== 'bl' && byId.get(q.ota_id ?? -1)?.tur !== 'rz';
    if (!birlik) { tashla(q, 'birlik'); continue; }
    if (!resursmi && (hajm == null || hajm === 0)) { tashla(q, 'hajm'); continue; }
    const res = birga.get(q.id) ?? [];
    const resurslar: RejaliResurs[] = res.map((r) => ({ tur: r.tur as RejaliResurs['tur'], nom: matn(r.nom), birlik: matn(r.birlik), hajm: son(r.hajm), kod: matn(r.kod) || null }));
    const tur = (q.tur === 'bl' ? 'bl' : RESURS_TUR.has(q.tur ?? '') ? q.tur : 'mat') as RejaliBuyruq['tur'];
    if (q.replaces_line_id != null) {
      const alm = ref(q.replaces_line_id);
      if (alm === undefined) { tashla(q, 'almashtirilgan'); continue; }
      buyruqlar.push({ ...asos, kind: 'replacement', tur, resursTempIds: res.map((r) => -r.id), almashtirilayotganQatorId: alm, keyinQatorId: alm,
        birlik, hajm: hajm ?? undefined, resurslar });
      zamenaSoni++;
    } else {
      const old = i > 0 ? aka[i - 1] : undefined;
      const keyin = old && Number(old.tartib ?? NaN) === Number(q.tartib ?? NaN) && tayyor(old, q) ? ref(old.id) : undefined;
      buyruqlar.push({ ...asos, kind: resursmi ? 'resource' : 'additional', tur, resursTempIds: res.map((r) => -r.id), keyinQatorId: keyin,
        birlik, hajm: hajm ?? undefined, resurslar });
      qoshimchaSoni++;
    }
    qatorSoni += 1 + res.length;
  }
  return { buyruqlar, kochmadi, qatorSoni, qoshimchaSoni, zamenaSoni, bolimSoni };
}

/** Allaqachon B smetasida yozilgan buyruqlar (operation_id / bo'lim nomi bo'yicha) va qolgani. */
export function egizakHolat(reja: QoshimchaReja, bQoshimcha: readonly YozilganQator[]): { qolgan: RejaliBuyruq[]; map: Map<number, number> } {
  return rejaliniYozilganlardanTozala(reja.buyruqlar, bQoshimcha);
}

/**
 * Qo'shimcha/zamenalarni B ga yozish: avval smetada bor buyruqlar chiqarib tashlanadi (dublikat yo'q), qolganlari ayni workbench
 * yo'li (`rejaliniYoz` + sahifaning `rejaliYarat`) bilan ketma-ket yoziladi. Natija: A qatori → B qatori xaritasi (asl + qo'shimcha).
 */
export async function egizakQoshimchaYoz(reja: QoshimchaReja, bQoshimcha: readonly YozilganQator[],
  d: { yarat: RejaliYaratish; versiya: (id: number) => Promise<number>; progress?: (i: number, n: number) => void }):
  Promise<{ map: Map<number, number>; yozildi: number; oldin: number; qolgan: RejaliBuyruq[]; xato?: string }> {
  const h = egizakHolat(reja, bQoshimcha);
  const r = await rejaliniYoz(h.qolgan, d);
  const map = new Map([...h.map, ...r.map]);
  return { map, yozildi: h.qolgan.length - r.qolgan.length, oldin: reja.buyruqlar.length - h.qolgan.length, qolgan: r.qolgan, xato: r.xato };
}

/** A qatori id → B qatori id: asl (tuzilma) yoki qo'shimcha (tempId = −A id orqali yozilgan/topilgan). */
export function idXarita(aslMap: ReadonlyMap<number, number>, qoshMap: ReadonlyMap<number, number>) {
  return (aId: number): number | undefined => aslMap.get(aId) ?? qoshMap.get(-aId);
}

/**
 * A bog'lanishlarini B ga: har F2 qatori (uid bir xil) A dagi smeta qatorining B dagi juftiga bog'lanadi (holat/usul saqlanadi).
 * Taqsimda har bo'lak alohida xaritalanadi; bittasi ham topilmasa — bog'lanish ko'chmaydi (ro'yxatga). O'tkazilganlar (otkaz) ham ko'chadi.
 * B dagi joriy qarorlar ALMASHTIRILADI (A dagidek bo'lishi kerak); B da bo'lmagan uid lar e'tiborsiz.
 */
export function boglanishKochir(a: IshJoyi, bInd: F2Indeks, xarita: (aId: number) => number | undefined): { ij: IshJoyi; kochdi: number; kochmadi: string[] } {
  const bog = new Map<string, Bog>();
  const kochmadi: string[] = [];
  for (const [uid, b] of a.bog) {
    if (!bInd.byUid.has(uid)) { kochmadi.push(uid); continue; }
    const id = xarita(b.qatorId);
    const taqsim = b.taqsim?.map((q) => ({ ...q, qatorId: xarita(q.qatorId) }));
    if (id == null || taqsim?.some((q) => q.qatorId == null)) { kochmadi.push(uid); continue; }
    bog.set(uid, { ...b, qatorId: id, ...(taqsim ? { taqsim: taqsim as Bog['taqsim'] } : {}) });
  }
  const otkaz = new Set([...a.otkaz].filter((uid) => bInd.byUid.has(uid) && !bog.has(uid)));
  return { ij: { bog, otkaz }, kochdi: bog.size, kochmadi };
}
