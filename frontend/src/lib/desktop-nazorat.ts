/**
 * desktop-nazorat.ts — «Tizim nazorati → Windows dastur» uchun sof mantiq (UI'siz, testlanadi).
 * Server haqiqat manbai: /api/desktop/nazorat → t2_desktop_boshqaruv_v1. Bu yerda faqat filtr, qidiruv,
 * siyosat shaklini tekshirish va versiya taqqoslash — ruxsat qarori UI'da QILINMAYDI (bazada).
 */
export type DesktopHolat = 'faol' | 'bekor' | 'muddati_otgan';
export type DesktopQurilma = {
  device_id: string; foydalanuvchi_id: number; ism: string | null; login: string | null;
  qurilma_nomi: string | null; os: string | null; ilova_versiya: string | null;
  yaratildi: string; oxirgi_kirish: string | null; tugaydi: number; sessiya_exp: number;
  bekor: string | null; bekor_sabab: string | null; holat: DesktopHolat;
  oxirgi_lease: string | null; oxirgi_lease_kompaniya_id: number | null; oxirgi_lease_obyekt_soni: number | null; lease_faol: boolean;
  kompaniyalar: { id: number; nom: string }[];
};
export type DesktopSiyosat = {
  id: number; kompaniya_id: number | null; kompaniya_nom: string | null; manba: 'platforma' | 'kompaniya';
  yoqilgan: boolean | null; max_qurilma: number | null; lease_soat: number | null; oflayn: boolean | null; min_versiya: string | null;
  joriy_versiya: string | null; yuklab_olish_url: string | null; yangilanish_izoh: string | null; versiya: number; yangilandi: string;
};
export type DesktopSamarali = { yoqilgan: boolean; max_qurilma: number; lease_soat: number; oflayn: boolean; min_versiya: string | null };
export type DesktopAudit = {
  id: number; vaqt: string; actor_id: number; actor_ism: string | null; kompaniya_id: number | null;
  amal: 'bekor' | 'foydalanuvchi_bekor' | 'muddat' | 'siyosat'; device_id: string | null; nishon_foydalanuvchi_id: number | null;
  sabab: string; meta: Record<string, unknown>;
};
export type DesktopUmumiy = { faol: number; oxirgi_24s: number; bugun_bekor: number; lease_faol: number; kompaniyalar: number };
export type DesktopNazoratJavob = {
  ok: true; rol: 'superadmin' | 'kompaniya'; kompaniya_id: number | null; umumiy: DesktopUmumiy;
  qurilmalar: DesktopQurilma[]; siyosat: DesktopSiyosat[]; samarali: DesktopSamarali | null; audit: DesktopAudit[];
};

export type DesktopFiltr = { qidiruv: string; holat: DesktopHolat | 'hammasi'; kompaniyaId: number | null };

const kichik = (s: unknown) => String(s ?? '').toLocaleLowerCase('uz');

/** Qidiruv: foydalanuvchi ismi/logini, qurilma nomi, OS, versiya, kompaniya nomi, device ID boshi. */
export function qurilmaFiltrla(q: readonly DesktopQurilma[], f: DesktopFiltr): DesktopQurilma[] {
  const s = kichik(f.qidiruv).trim();
  return q.filter((d) => (f.holat === 'hammasi' || d.holat === f.holat)
    && (f.kompaniyaId == null || d.kompaniyalar.some((k) => k.id === f.kompaniyaId))
    && (!s || [d.ism, d.login, d.qurilma_nomi, d.os, d.ilova_versiya, d.device_id, ...d.kompaniyalar.map((k) => k.nom)].some((v) => kichik(v).includes(s))));
}

/** Ro'yxatdagi kompaniyalar (filtr tanlovi uchun), nom bo'yicha. */
export function qurilmaKompaniyalari(q: readonly DesktopQurilma[]): { id: number; nom: string }[] {
  const m = new Map<number, string>();
  for (const d of q) for (const k of d.kompaniyalar) m.set(k.id, k.nom);
  return [...m].map(([id, nom]) => ({ id, nom })).sort((a, b) => a.nom.localeCompare(b.nom, 'uz'));
}

export const VERSIYA_RE = /^\d{1,4}\.\d{1,4}\.\d{1,6}$/;
/** Raqamli taqqoslash (1.10.0 > 1.2.0). Noto'g'ri format → null. */
export function versiyaTaqqosla(a: string | null | undefined, b: string | null | undefined): number | null {
  if (!a || !b || !VERSIYA_RE.test(a) || !VERSIYA_RE.test(b)) return null;
  const x = a.split('.').map(Number), y = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  return 0;
}
/** Qurilma versiyasi minimal talabdan pastmi (yoki noma'lummi) — server bilan bir xil qoida. */
export const versiyaEskimi = (v: string | null | undefined, min: string | null | undefined): boolean =>
  !!min && (!v || !VERSIYA_RE.test(v) || (versiyaTaqqosla(v, min) ?? -1) < 0);

/** Siyosat shakli (matn maydonlari) → server `qiymat` obyekti. Bo'sh = meros (null). Xato bo'lsa — xato kaliti. */
export type SiyosatShakl = {
  yoqilgan: 'meros' | 'ha' | 'yoq'; oflayn: 'meros' | 'ha' | 'yoq';
  max_qurilma: string; lease_soat: string; min_versiya: string;
  joriy_versiya?: string; yuklab_olish_url?: string; yangilanish_izoh?: string;
};
export function siyosatShakldan(s: SiyosatShakl, global: boolean): { qiymat: Record<string, unknown> } | { xato: string } {
  const bool = (v: SiyosatShakl['yoqilgan']) => v === 'meros' ? null : v === 'ha';
  const son = (v: string, min: number, max: number): number | null | 'xato' => {
    const t = v.trim(); if (!t) return null;
    const n = Number(t); return Number.isInteger(n) && n >= min && n <= max ? n : 'xato';
  };
  const mx = son(s.max_qurilma, 1, 100); if (mx === 'xato') return { xato: 'Qurilmalar soni 1–100 oralig‘ida butun son bo‘lsin.' };
  const ls = son(s.lease_soat, 1, 72); if (ls === 'xato') return { xato: 'Oflayn ruxsat muddati 1–72 soat bo‘lsin.' };
  const mv = s.min_versiya.trim(); if (mv && !VERSIYA_RE.test(mv)) return { xato: 'Versiya 1.2.3 ko‘rinishida bo‘lsin.' };
  const qiymat: Record<string, unknown> = { yoqilgan: bool(s.yoqilgan), oflayn: bool(s.oflayn), max_qurilma: mx, lease_soat: ls, min_versiya: mv || null };
  if (global) {
    const jv = (s.joriy_versiya ?? '').trim(); if (jv && !VERSIYA_RE.test(jv)) return { xato: 'Versiya 1.2.3 ko‘rinishida bo‘lsin.' };
    const url = (s.yuklab_olish_url ?? '').trim();
    if (url && (!/^https:\/\/[^\s<>"'`]{4,}$/.test(url) || url.length > 500)) return { xato: 'Yuklab olish havolasi https:// bilan boshlansin.' };
    qiymat.joriy_versiya = jv || null; qiymat.yuklab_olish_url = url || null; qiymat.yangilanish_izoh = (s.yangilanish_izoh ?? '').trim() || null;
  }
  return { qiymat };
}
export function siyosatShaklga(p: DesktopSiyosat | undefined): SiyosatShakl {
  const tri = (v: boolean | null | undefined): SiyosatShakl['yoqilgan'] => v == null ? 'meros' : v ? 'ha' : 'yoq';
  return {
    yoqilgan: tri(p?.yoqilgan), oflayn: tri(p?.oflayn), max_qurilma: p?.max_qurilma != null ? String(p.max_qurilma) : '',
    lease_soat: p?.lease_soat != null ? String(p.lease_soat) : '', min_versiya: p?.min_versiya ?? '',
    joriy_versiya: p?.joriy_versiya ?? '', yuklab_olish_url: p?.yuklab_olish_url ?? '', yangilanish_izoh: p?.yangilanish_izoh ?? '',
  };
}

/** Sabab — server bilan bir xil chegara (3..500 belgi). */
export const sababYaroqli = (s: string) => s.trim().length >= 3 && s.trim().length <= 500;

/** Sana-vaqt (ms yoki ISO) → «05.11.2026 14:03». */
export function vaqtMatn(v: string | number | null | undefined): string {
  if (v == null || v === '') return '—';
  const d = new Date(v); if (Number.isNaN(d.getTime())) return '—';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
/** `datetime-local` qiymati ↔ ms. */
export const msDanLocal = (ms: number) => { const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60000); return d.toISOString().slice(0, 16); };
export const localDanMs = (v: string): number | null => { const n = new Date(v).getTime(); return Number.isFinite(n) ? n : null; };
