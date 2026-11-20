/**
 * Transport paneli — SOF mantiq (DOM/tarmoq yo'q): audit kartalari, yoy preview jadvali, tasdiqlash tugmasi holati, smeta qatori belgisi.
 * Pul formulasi YO'Q: so'mlar faqat serverdagi qator summalaridan yig'iladi (t2_qator.summa; NULL ≠ 0 — noma'lum alohida sanaladi).
 */
import type { TransportUsul } from './kirish';

export type AuditXulosa = { material_soni?: number; foiz?: number; tkm?: number; narx_ichida?: number; tkm_qator_soni?: number; xato_soni?: number };
export type AuditXato = { kod: string; qator_id: number; xabar: string };
export type AuditJavob = { ok?: boolean; xulosa?: AuditXulosa; xatolar?: AuditXato[]; materiallar?: Array<Record<string, unknown>> };
export type YoyGuruhNatija = {
  material: string; holat: string; sabab?: string | null; topilgan_soni?: number | null; allaqachon_soni?: number | null;
  miqdor_hisob?: number | null; miqdor_tizim?: number | null; tkm_hisob?: number | null; tkm_tizim?: number | null; farq_som?: number | null;
};
export type YoyJavob = { ok?: boolean; code?: string; xabar?: string; yozildi?: boolean; bloklangan?: boolean; yaratildi?: number; guruhlar?: YoyGuruhNatija[] };

import type { TransportUsul as _Usul } from './kirish';
/** Qator transport turini o'zgartirish funksiyasi (SmetaTree / HolatNative / TransportQatorBlok bir xil shakl). */
export type TransportBelgilaFn = (qatorId: number, usul: _Usul) => Promise<{ ok?: boolean; xabar?: string; code?: string }>;
export type YangilaFn = () => Promise<void>;

/** Smeta qatorining panel uchun kerakli qismi (T2Qator ning pastki to'plami). */
export type PanelQator = { id: number; tur?: string | null; kod?: string | null; nom?: string | null; kat?: string | null; summa?: number | null; transport_usul?: string | null; transport_manba_qator_id?: number | null };

const MATERIAL_TUR = new Set(['rs', 'mat', 'ob']);
const MATERIAL_KAT = new Set(['МАТ', 'М/К', 'КАБ', 'БЕЗСКЛАД', 'ОБ']);

/** Е310/С310 (avtovozka) va Е311 (pogruzka-razgruzka): material transporti emas, oddiy ish qatori. Kirill ham, lotin ham. */
export const yukIshiKodmi = (kod: string | null | undefined): boolean => /^[ЕEСC]\s?31[01](?!\d)/iu.test((kod ?? '').trim());
export const tkmQatormi = (q: PanelQator): boolean => q.transport_manba_qator_id != null && Number(q.transport_manba_qator_id) > 0;
export const materialQatormi = (q: PanelQator): boolean => !tkmQatormi(q) && MATERIAL_TUR.has(String(q.tur ?? '')) && MATERIAL_KAT.has(String(q.kat ?? ''));

export type TransportKarta = { soni: number; som: number | null; somNomalum: number };
const yig = (qs: readonly PanelQator[]): TransportKarta => {
  let som = 0; let bor = false; let nomalum = 0;
  for (const q of qs) { if (q.summa == null || !Number.isFinite(Number(q.summa))) nomalum++; else { som += Number(q.summa); bor = true; } }
  return { soni: qs.length, som: bor ? Math.round(som * 100) / 100 : null, somNomalum: nomalum };
};

export type TransportKartalar = { tkm: TransportKarta; foiz: { soni: number }; narxIchida: { soni: number }; yuk: TransportKarta; xatoSoni: number };

/** 3 karta: t·km (qator, so'm), %-transport materiallari soni, Е310/Е311 yuk ishlari (soni, so'm). Material soni — audit ustun (server), bo'lmasa qatorlardan. */
export function transportKartalar(qatorlar: readonly PanelQator[], audit: AuditJavob | null | undefined): TransportKartalar {
  const x = audit?.xulosa;
  const mats = qatorlar.filter(materialQatormi);
  const foizQator = mats.filter((q) => !q.transport_usul || q.transport_usul === 'foiz').length;
  const narxQator = mats.filter((q) => q.transport_usul === 'narx_ichida').length;
  return {
    tkm: yig(qatorlar.filter(tkmQatormi)),
    foiz: { soni: x?.foiz ?? foizQator },
    narxIchida: { soni: x?.narx_ichida ?? narxQator },
    yuk: yig(qatorlar.filter((q) => q.tur === 'bl' && yukIshiKodmi(q.kod))),
    xatoSoni: x?.xato_soni ?? audit?.xatolar?.length ?? 0,
  };
}

/** Smeta ro'yxatidagi belgi: foiz — belgi yo'q; tkm / narx_ichida — belgi; t·km qatorining o'zi — «T·KM». */
export type TransportBelgi = { usul: 'tkm' | 'narx_ichida' | null; tkmQator: boolean };
export function transportBelgisi(q: PanelQator): TransportBelgi | null {
  if (tkmQatormi(q)) return { usul: null, tkmQator: true };
  if (q.transport_usul === 'tkm' || q.transport_usul === 'narx_ichida') return { usul: q.transport_usul, tkmQator: false };
  return null;
}
export function transportBelgiXaritasi(qatorlar: readonly PanelQator[]): Map<number, TransportBelgi> {
  const m = new Map<number, TransportBelgi>();
  for (const q of qatorlar) { const b = transportBelgisi(q); if (b) m.set(Number(q.id), b); }
  return m;
}
export const BELGI_MATN: Record<'tkm' | 'narx_ichida' | 'tkmQator', string> = { tkm: 't·km', narx_ichida: 'narx ichida', tkmQator: 'T·KM' };

export const USUL_NOMI: Record<TransportUsul, string> = { foiz: 'Foiz (podvaldagi transport %)', tkm: 't·km (alohida qator)', narx_ichida: 'Narx ichida (yetkazish narxda)' };

/* ───────── hisob aktidan taqsimlash (yoy) ───────── */
export type HolatTon = 'ok' | 'warn' | 'danger' | 'mute';
export type HolatChip = { kalit: string; soz: string; ton: HolatTon };
const HOLATLAR: Record<string, HolatChip> = {
  tayyor: { kalit: 'tayyor', soz: 'Tayyor', ton: 'ok' },
  allaqachon: { kalit: 'allaqachon', soz: 'Allaqachon bor', ton: 'mute' },
  qisman: { kalit: 'qisman', soz: 'Qisman', ton: 'warn' },
  chetlanish: { kalit: 'chetlanish', soz: 'Farq bor', ton: 'warn' },
  topilmadi: { kalit: 'topilmadi', soz: 'Topilmadi', ton: 'danger' },
  xato: { kalit: 'xato', soz: 'Xato', ton: 'danger' },
};
export const yoyHolatChip = (holat: string): HolatChip => HOLATLAR[holat] ?? { kalit: holat, soz: holat, ton: 'mute' };
/** Server qoidasi (migratsiya 20270120230000): shu holatlar tasdiqni BLOKLAYDI (majburiy bilan o'tadi; topilmagan guruh baribir o'tkaziladi). */
export const BLOKLOVCHI = new Set(['xato', 'topilmadi', 'qisman', 'chetlanish']);

export type YoyQator = { material: string; topilgan: number; miqdorHisob: number | null; miqdorTizim: number | null; tkmHisob: number | null; tkmTizim: number | null; farqSom: number | null; chip: HolatChip; sabab: string | null };
export function yoyJadval(guruhlar: readonly YoyGuruhNatija[] | undefined): YoyQator[] {
  return (guruhlar ?? []).map((g) => ({
    material: g.material, topilgan: Number(g.topilgan_soni ?? 0), miqdorHisob: g.miqdor_hisob ?? null, miqdorTizim: g.miqdor_tizim ?? null,
    tkmHisob: g.tkm_hisob ?? null, tkmTizim: g.tkm_tizim ?? null, farqSom: g.farq_som ?? null, chip: yoyHolatChip(g.holat), sabab: g.sabab ?? null,
  }));
}

export type YoyXulosa = { jami: number; tayyor: number; bloklovchi: number; yozilishiMumkin: number; farqJami: number | null };
export function yoyXulosa(guruhlar: readonly YoyGuruhNatija[] | undefined): YoyXulosa {
  const g = guruhlar ?? [];
  let farq = 0; let bor = false;
  for (const x of g) if (x.farq_som != null) { farq += Number(x.farq_som); bor = true; }
  return {
    jami: g.length, tayyor: g.filter((x) => x.holat === 'tayyor').length, bloklovchi: g.filter((x) => BLOKLOVCHI.has(x.holat)).length,
    yozilishiMumkin: g.filter((x) => ['tayyor', 'chetlanish', 'qisman'].includes(x.holat)).reduce((s, x) => s + Number(x.topilgan_soni ?? 0), 0),
    farqJami: bor ? Math.round(farq * 100) / 100 : null,
  };
}

/** «Tasdiqlash» holati: bloklangan bo'lsa faqat aniq «farqni qabul qilaman» belgisi bilan yoqiladi (→ majburiy:true). Yozadigan narsa yo'q — o'chiq. */
export function tasdiqHolati(p: { bloklangan: boolean; qabul: boolean; yozilishiMumkin: number; band: boolean }): { disabled: boolean; majburiy: boolean; sabab: 'band' | 'bosh' | 'qabul_kerak' | null } {
  if (p.band) return { disabled: true, majburiy: false, sabab: 'band' };
  if (p.yozilishiMumkin <= 0) return { disabled: true, majburiy: false, sabab: 'bosh' };
  if (p.bloklangan && !p.qabul) return { disabled: true, majburiy: false, sabab: 'qabul_kerak' };
  return { disabled: false, majburiy: p.bloklangan && p.qabul, sabab: null };
}

/* ───────── yuklangan hisob varag'i (`transport_yoy` yuki) ───────── */
export type YoyYuk = { varaq?: string; tkm_narx: number | null; qatorlar: Array<Record<string, unknown>>; topilmadi?: string[]; ogohlantirish?: string[] };
/** Smeta yuklashdagi fayl javobi (`handleFaylOqi`) ichidan `transport_yoy` ni ajratadi (tuzilmasi noto'g'ri bo'lsa — null). */
export function yoyYukiAjrat(javob: unknown): YoyYuk | null {
  const y = (javob as { transport_yoy?: unknown } | null)?.transport_yoy as Partial<YoyYuk> | undefined;
  if (!y || !Array.isArray(y.qatorlar) || y.qatorlar.length === 0) return null;
  const narx = typeof y.tkm_narx === 'number' && Number.isFinite(y.tkm_narx) ? y.tkm_narx : null;
  return { varaq: typeof y.varaq === 'string' ? y.varaq : undefined, tkm_narx: narx, qatorlar: y.qatorlar as Array<Record<string, unknown>>, topilmadi: Array.isArray(y.topilmadi) ? y.topilmadi.map(String) : [], ogohlantirish: Array.isArray(y.ogohlantirish) ? y.ogohlantirish.map(String) : [] };
}

/* ───────── matnli preview (Jarvis / Telegram / ilova — bitta shakl) ───────── */
const raqam = (n: number | null | undefined, kasr = 2): string => (n == null || !Number.isFinite(n) ? '—' : new Intl.NumberFormat('ru-RU', { maximumFractionDigits: kasr }).format(n));
const ishorali = (n: number | null | undefined): string => (n == null ? '—' : `${n > 0 ? '+' : ''}${raqam(n)}`);

export function yoyPreviewMatni(guruhlar: readonly YoyGuruhNatija[] | undefined, bloklangan: boolean): string {
  const q: string[] = [];
  for (const g of (guruhlar ?? []).slice(0, 15)) {
    const c = yoyHolatChip(g.holat);
    q.push(`- ${g.material.slice(0, 50)} — ${c.soz}: ${g.topilgan_soni ?? 0} qator; miqdor ${raqam(g.miqdor_tizim, 4)} / hisob ${raqam(g.miqdor_hisob, 4)}; t·km ${raqam(g.tkm_tizim)} / hisob ${raqam(g.tkm_hisob)}; farq ${ishorali(g.farq_som)} so'm${g.sabab ? ` (${g.sabab})` : ''}`);
  }
  if ((guruhlar?.length ?? 0) > 15) q.push(`… yana ${guruhlar!.length - 15} guruh`);
  const x = yoyXulosa(guruhlar);
  q.push(`**Jami:** ${x.jami} guruh, ${x.yozilishiMumkin} ta t·km qatori yoziladi; farq ${ishorali(x.farqJami)} so'm.`);
  if (bloklangan) q.push('⚠ Farq / topilmadi / qisman guruhlar bor — foydalanuvchi aniq qabul qilmaguncha yozilmaydi (majburiy).');
  return q.join('\n');
}

export type BelgilaSatr = { id: number; kod?: string | null; nom?: string | null; oldin: string; keyin: string };
export function belgilaPreviewMatni(qatorlar: readonly BelgilaSatr[]): string {
  const q = qatorlar.slice(0, 12).map((r) => `- ${(r.kod ?? `#${r.id}`)} ${(r.nom ?? '').slice(0, 50)}: ${r.oldin} → ${r.keyin}`.trim());
  if (qatorlar.length > 12) q.push(`… yana ${qatorlar.length - 12} qator`);
  return q.join('\n');
}

/** Bo'lim tanlash ro'yxati: faqat rz qatorlari. */
export const bolimlar = (qatorlar: readonly PanelQator[]) => qatorlar.filter((q) => q.tur === 'rz').map((q) => ({ id: Number(q.id), nom: String(q.nom ?? `#${q.id}`) }));
