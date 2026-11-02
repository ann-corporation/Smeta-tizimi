/**
 * akkaunt-lib.ts — Akkaunt markazi uchun sof (React'siz) yordamchilar.
 * Qoidalar: NULL != 0 (noma'lum son — "—"), rol/ruxsat qarori sidebar bilan BIR manba
 * (`routePermission` + `k.joriy.permissions`); server tekshiruvi yakuniy qo'riqchi.
 */
import { ROLE_LABELS } from '../../lib/company-authorization/permission-labels';

export type AzolikQator = { kompaniya_id: number; nom: string; rol: string; faol?: boolean };
export type KompaniyaRollari = { kompaniyaId: number; nom: string; rollar: string[] };

/** Ism/login/email dan bosh harflar (maks. 2). Bo'sh bo'lsa "?". */
export function initsiallar(...manbalar: Array<string | null | undefined>): string {
  const matn = manbalar.map((m) => (m ?? '').trim()).find((m) => m.length > 0) ?? '';
  if (!matn) return '?';
  const boshi = matn.includes('@') ? matn.split('@')[0] : matn;
  const sozlar = boshi.split(/[\s._-]+/).filter(Boolean);
  const harflar = sozlar.length >= 2 ? [sozlar[0], sozlar[1]] : [sozlar[0] ?? ''];
  const r = harflar.map((s) => Array.from(s)[0] ?? '').join('').toUpperCase();
  return sozlar.length === 1 ? Array.from(sozlar[0]).slice(0, 2).join('').toUpperCase() : r;
}

export function rolNomi(rol: string | null | undefined): string {
  if (!rol) return '—';
  return ROLE_LABELS[rol] ?? rol;
}

/** Bir odam bir kompaniyada bir nechta rol tutishi mumkin: a'zolik qatorlari kompaniya bo'yicha guruhlanadi. */
export function kompaniyaRollari(azoliklar: AzolikQator[], qoshimcha: Array<{ kompaniyaId: number; nom: string; rol: string | null | undefined }> = []): KompaniyaRollari[] {
  const xarita = new Map<number, KompaniyaRollari>();
  const qosh = (id: number, nom: string, rol: string | null | undefined) => {
    let q = xarita.get(id);
    if (!q) { q = { kompaniyaId: id, nom, rollar: [] }; xarita.set(id, q); }
    if (rol && !q.rollar.includes(rol)) q.rollar.push(rol);
  };
  for (const a of azoliklar) if (a.faol !== false) qosh(a.kompaniya_id, a.nom, a.rol);
  for (const a of qoshimcha) qosh(a.kompaniyaId, a.nom, a.rol);
  return [...xarita.values()];
}

/** Noma'lum (null/undefined/NaN) — "—"; 0 haqiqiy nol sifatida ko'rsatiladi. */
export function sonYoki(n: number | null | undefined, tolaQiymat = '—'): string {
  if (n == null || typeof n !== 'number' || !Number.isFinite(n)) return tolaQiymat;
  return new Intl.NumberFormat('uz-UZ').format(n);
}

/** Sessiya muddati: `exp` sekundda (JWT) yoki millisekundda bo'lishi mumkin. */
export function sessiyaTugashi(exp: number | null | undefined): Date | null {
  if (typeof exp !== 'number' || !Number.isFinite(exp) || exp <= 0) return null;
  return new Date(exp < 1e12 ? exp * 1000 : exp);
}
