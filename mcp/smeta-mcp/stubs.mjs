// Frontend sof mantig'i (frontend/src/lib) MCP ichiga bundle qilinadi (dublikat yozilmaydi).
// Brauzerga bog'liq ikki modul Node'da stub bilan almashtiriladi:
//   - frontend/src/i18n/til.ts  (react + localStorage) -> matnni o'zgarishsiz qaytaradi;
//   - frontend/src/api/*         (fetch('/api/...'), sessiya) -> chaqirilsa aniq xato beradi (MCP bazaga o'zi ulanadi).
// Ixtiyoriy frontend modullar (hali main'da bo'lmasligi mumkin) — mavjud bo'lsa haqiqiysi, bo'lmasa «yo'q» stubi.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BU = path.dirname(fileURLToPath(import.meta.url));
export const FRONTEND_SRC = path.resolve(BU, '..', '..', 'frontend', 'src');
const STUB = (n) => path.join(BU, 'src', 'stubs', n);

/** Ixtiyoriy modullar: `@frontend-ixtiyoriy/<nom>` -> frontend/src/lib/<nom>.ts yoki stub. */
export const IXTIYORIY = { 'fakt-qamrov': 'lib/fakt-qamrov.ts' };

const norm = (p) => p.replace(/\\/g, '/').toLowerCase();

/** Hal qilingan absolyut yo'l uchun stub (yoki null). */
export function stubYoli(abs) {
  const n = norm(abs).replace(/\.(tsx?|jsx?)$/, '');
  const fe = norm(FRONTEND_SRC);
  if (n === fe + '/i18n/til') return STUB('til.ts');
  if (n === fe + '/api/supabase') return STUB('frontend-api.ts');
  return null;
}

/** `@frontend-ixtiyoriy/<nom>` ni hal qiladi. */
export function ixtiyoriyYoli(spec) {
  const m = /^@frontend-ixtiyoriy\/(.+)$/.exec(spec);
  if (!m) return null;
  const rel = IXTIYORIY[m[1]];
  if (rel) {
    const p = path.join(FRONTEND_SRC, rel);
    if (existsSync(p)) return p;
  }
  return STUB('yoq-' + m[1] + '.ts');
}

/** Nisbiy import spetsifikatorini kengaytmasiz absolyut yo'lga (stub tekshiruvi uchun). */
export function nisbiyAbs(spec, importer) {
  if (!importer || !(spec.startsWith('./') || spec.startsWith('../'))) return null;
  return path.resolve(path.dirname(importer), spec);
}
