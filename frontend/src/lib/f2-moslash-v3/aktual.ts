/**
 * F2 / FAKT importida smetaning AKTUAL (versiya_holat='faol') qatoriga moslash — yagona sof modul (UI F2ImportV3 va MCP f2_import).
 *
 * MUAMMO (egasi 2026-11-11): ekspertizadan oldingi qo'lda F2/LRV fayllari joriy (ekspertizadan keyingi) smetaga moslanadi.
 * Eski smeta qatorlari O'CHIRILMAYDI (`versiya_holat='almashtirilgan'`), lekin yangi akt_qator ularga yozilmaydi
 * (trigger QATOR_ALMASHTIRILGAN). Shuning uchun har bog'lanish faol qatorga yo'naltiriladi.
 *
 * Voris zanjiri (migratsiya 20261114700000_t2_smeta_versiya_faollashtir_v1):
 *   eski t2_qator.id → t2_smeta_versiya_pozitsiya.manba->>'qator_id' → t2_smeta_versiya_moslik.qator_id (yangi faol qator).
 * Moslik faqat bl va mustaqil mat/ob ni qamraydi; ularning bolalari (rs) — ota vorisi ostida kod/nom/birlik bo'yicha topiladi.
 * Yangi matcher YOZILMAYDI: nomzod tanlash mavjud f2MoslashV3 da (faqat faol qatorlar bilan chaqiriladi); bu modul faqat
 * tarixdan kelgan manbalarni (xotira imzolari, qo'lda boglar) va fakt hisobini faol qatorga keltiradi.
 */

export const ESKI_VERSIYA_SABAB = "eski versiya, aktual qator yo'q";
export const FAKT_BOR_SABAB = 'tizimda bor — yozilmaydi';
export const RS_SABAB = 'resurs — fakt ish normasidan ergashadi (alohida yozilmaydi)';

export interface AQator { id: number; otaId: number | null; kod: string | null; nom: string | null; birlik: string | null; faol: boolean }
/** t2_smeta_versiya_moslik: eski qator id → yangi (faol) qator id. */
export interface AJuft { eskiId: number; yangiId: number }

const norm = (s: string | null | undefined) => (s ?? '').toUpperCase().replace(/Ё/g, 'Е').replace(/\s+/g, ' ').trim();
const kalitTolaq = (q: AQator) => `${norm(q.kod)}|${norm(q.nom)}|${norm(q.birlik)}`;
const kalitKod = (q: AQator) => (norm(q.kod) ? `${norm(q.kod)}|${norm(q.birlik)}` : '');

/** Eski (almashtirilgan) qator id → aktual (faol) qator id. Faqat izchil juftlar; topilmaganlar xaritada yo'q. */
export function vorisXaritasi(qatorlar: readonly AQator[], juftlar: readonly AJuft[]): Map<number, number> {
  const byId = new Map(qatorlar.map((q) => [q.id, q]));
  const voris = new Map<number, number>();
  const olingan = new Set<number>();
  for (const j of juftlar) {
    const y = byId.get(j.yangiId);
    const e = byId.get(j.eskiId);
    if (!y?.faol || (e && e.faol) || voris.has(j.eskiId)) continue;
    voris.set(j.eskiId, j.yangiId); olingan.add(j.yangiId);
  }
  // Bolalar (rs): ota vorisi ostidagi faol bolalardan kod+nom+birlik (to'liq), keyin kod+birlik (yagona nomzod).
  const faolBola = new Map<number, AQator[]>();
  for (const q of qatorlar) if (q.faol && q.otaId != null) { const a = faolBola.get(q.otaId) ?? []; a.push(q); faolBola.set(q.otaId, a); }
  const eskilar = qatorlar.filter((q) => !q.faol);
  for (let tur = 0; tur < 12; tur++) {
    let ozgardi = false;
    for (const e of eskilar) {
      if (voris.has(e.id) || e.otaId == null) continue;
      const ota = voris.get(e.otaId);
      if (ota == null) continue;
      const nomzod = (faolBola.get(ota) ?? []).filter((c) => !olingan.has(c.id));
      let m = nomzod.find((c) => kalitTolaq(c) === kalitTolaq(e));
      if (!m && kalitKod(e)) { const k = nomzod.filter((c) => kalitKod(c) === kalitKod(e)); if (k.length === 1) m = k[0]; }
      if (m) { voris.set(e.id, m.id); olingan.add(m.id); ozgardi = true; }
    }
    if (!ozgardi) break;
  }
  return voris;
}

export type AktualNatija = { qatorId: number; almashgan: boolean } | { qatorId: null; sabab: string };

/** Qator id → aktual qator. Faol — o'zi; almashtirilgan — voris zanjiri; zanjir yo'q — sabab bilan rad. */
export function aktualQator(id: number, faolIds: ReadonlySet<number>, voris: ReadonlyMap<number, number>): AktualNatija {
  if (faolIds.has(id)) return { qatorId: id, almashgan: false };
  let cur = id;
  for (let i = 0; i < 10; i++) {
    const n = voris.get(cur);
    if (n == null) break;
    if (faolIds.has(n)) return { qatorId: n, almashgan: true };
    cur = n;
  }
  return { qatorId: null, sabab: ESKI_VERSIYA_SABAB };
}

export interface AktuallashNatija<B> {
  bog: Map<string, B>;
  /** Eski qatordan faol qatorga yo'naltirilganlar (ko'rsatish uchun). */
  almashgan: Array<{ uid: string; eskiId: number; yangiId: number }>;
  /** Aktual qatori yo'qlar — bog'lanmagan (topilmadi) sanaladi. */
  rad: Array<{ uid: string; eskiId: number; sabab: string }>;
}

/** Bog'lanishlar (uid → {qatorId}) ni aktual qatorga keltiradi (taqsim bo'laklari ham). Faol bo'lmagan zanjirsiz — chiqariladi. */
export function bogniAktualla<B extends { qatorId: number; taqsim?: readonly { qatorId: number; hajm: number }[] }>(
  bog: ReadonlyMap<string, B>, faolIds: ReadonlySet<number>, voris: ReadonlyMap<number, number>,
): AktuallashNatija<B> {
  const out = new Map<string, B>();
  const almashgan: AktuallashNatija<B>['almashgan'] = [];
  const rad: AktuallashNatija<B>['rad'] = [];
  for (const [uid, b] of bog) {
    const bolaklar = b.taqsim && b.taqsim.length > 1 ? b.taqsim : null;
    if (bolaklar) {
      const yangi = bolaklar.map((q) => ({ q, a: aktualQator(q.qatorId, faolIds, voris) }));
      const yomon = yangi.find((x) => x.a.qatorId == null);
      if (yomon) { rad.push({ uid, eskiId: yomon.q.qatorId, sabab: ESKI_VERSIYA_SABAB }); continue; }
      const t = yangi.map((x) => ({ ...x.q, qatorId: (x.a as { qatorId: number }).qatorId }));
      for (const x of yangi) if ((x.a as { almashgan: boolean }).almashgan) almashgan.push({ uid, eskiId: x.q.qatorId, yangiId: (x.a as { qatorId: number }).qatorId });
      out.set(uid, { ...b, qatorId: t[0].qatorId, taqsim: t });
      continue;
    }
    const a = aktualQator(b.qatorId, faolIds, voris);
    if (a.qatorId == null) { rad.push({ uid, eskiId: b.qatorId, sabab: a.sabab }); continue; }
    if (a.almashgan) almashgan.push({ uid, eskiId: b.qatorId, yangiId: a.qatorId });
    out.set(uid, a.qatorId === b.qatorId ? b : { ...b, qatorId: a.qatorId });
  }
  return { bog: out, almashgan, rad };
}

/** Xotira imzolari (imzo → qator id): faol qatorga keltiriladi, zanjirsizlari tashlanadi. */
export function xotiraniAktualla(xotira: ReadonlyMap<string, number>, faolIds: ReadonlySet<number>, voris: ReadonlyMap<number, number>): { xotira: Map<string, number>; tashlandi: number } {
  const out = new Map<string, number>();
  let tashlandi = 0;
  for (const [imzo, id] of xotira) {
    const a = aktualQator(id, faolIds, voris);
    if (a.qatorId == null) tashlandi++; else out.set(imzo, a.qatorId);
  }
  return { xotira: out, tashlandi };
}

/** Mavjud fakt (t2_akt tur='fakt', bekor emas) har faol qatorga yig'iladi: eski qatordagi fakt o'z vorisiga qo'shiladi (ikki marta sanalmaydi). */
export function faktMavjudYigish(
  faktQatorlar: ReadonlyArray<{ qatorId: number; hajm: number | null }>, faolIds: ReadonlySet<number>, voris: ReadonlyMap<number, number>,
): { mavjud: Map<number, number>; yetim: number } {
  const mavjud = new Map<number, number>();
  let yetim = 0;
  for (const f of faktQatorlar) {
    const h = Number(f.hajm ?? 0);
    if (!Number.isFinite(h) || h === 0) continue;
    const a = aktualQator(f.qatorId, faolIds, voris);
    if (a.qatorId == null) { yetim++; continue; }
    mavjud.set(a.qatorId, (mavjud.get(a.qatorId) ?? 0) + h);
  }
  return { mavjud, yetim };
}

export interface FaktSatr {
  qatorId: number; tur: string | null; kod: string | null; nom: string | null; birlik: string | null;
  /** Fayldagi hajm (shu qator bo'yicha jami). */
  faylHajm: number; smetaHajm: number | null;
  /** Moslash ishonchi: aniq | xotira | taklif | qolda ... */
  ishonch?: string | null; usul?: string | null;
}
export interface FaktYoziladi extends FaktSatr { mavjud: number; delta: number; ogohlantirish?: string }
export interface FaktBor extends FaktSatr { mavjud: number; sabab: string }
export interface FaktReja { yoziladi: FaktYoziladi[]; bor: FaktBor[] }

const yaxlit = (x: number) => Math.round(x * 1e6) / 1e6;

/** delta = fayl − mavjud fakt; faqat musbat deltalar yoziladi. Fakt smeta hajmidan oshsa — faqat ogohlantirish (egasi qoidasi). */
export function faktDeltaReja(satrlar: readonly FaktSatr[], mavjud: ReadonlyMap<number, number>): FaktReja {
  const yig = new Map<number, FaktSatr>();
  for (const s of satrlar) { const o = yig.get(s.qatorId); yig.set(s.qatorId, o ? { ...o, faylHajm: o.faylHajm + s.faylHajm } : { ...s }); }
  const reja: FaktReja = { yoziladi: [], bor: [] };
  for (const s of yig.values()) {
    const m = mavjud.get(s.qatorId) ?? 0;
    if (s.tur === 'rs') { reja.bor.push({ ...s, mavjud: m, sabab: RS_SABAB }); continue; }
    const delta = yaxlit(s.faylHajm - m);
    if (!(s.faylHajm > 0)) { reja.bor.push({ ...s, mavjud: m, sabab: "fayl hajmi ≤ 0 — yozilmaydi" }); continue; }
    if (delta <= 0) { reja.bor.push({ ...s, mavjud: m, sabab: FAKT_BOR_SABAB }); continue; }
    const jami = yaxlit(m + delta);
    reja.yoziladi.push({ ...s, mavjud: m, delta,
      ...(s.smetaHajm != null && jami > s.smetaHajm + 1e-9 ? { ogohlantirish: `fakt ${jami} smeta hajmi ${s.smetaHajm} dan oshadi (yoziladi — faqat ogohlantirish)` } : {}) });
  }
  return reja;
}
