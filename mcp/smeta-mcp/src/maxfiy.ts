/**
 * Maxfiy qiymatlar HECH QAYERGA chiqmaydi: tool javobi, xato matni, lokal audit, bazadagi audit.
 * Ikki qatlam: (1) ro'yxatdan o'tkazilgan aniq qiymatlar (SMETA_DB_URL, uning paroli) — har joyda almashtiriladi;
 * (2) naqshlar: postgres URL ichidagi parol, password=..., JWT, Supabase kalitlari.
 */
const royxat = new Set<string>();

/** Aniq maxfiy qiymatni ro'yxatga oladi (masalan ulanish satri va undagi parol). */
export function maxfiyQosh(qiymat: string | null | undefined): void {
  if (!qiymat || qiymat.length < 4) return;
  royxat.add(qiymat);
  try {
    const u = new URL(qiymat);
    if (u.password) { royxat.add(u.password); royxat.add(decodeURIComponent(u.password)); }
  } catch { /* URL emas — faqat o'zi */ }
}

/** Test uchun. */
export function maxfiyTozala(): void { royxat.clear(); }

const NAQSHLAR: Array<[RegExp, string]> = [
  // postgres://user:parol@host -> postgres://user:***@host
  [/\b(postgres(?:ql)?:\/\/[^:\s/@]+:)[^@\s]+@/gi, '$1***@'],
  [/\b(password|parol|pwd|passwd)\s*[=:]\s*("[^"]*"|'[^']*'|[^\s&;,"']+)/gi, '$1=***'],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, '***JWT***'],
  [/\b(sb_secret_|sb_publishable_|sk_live_|sk_test_|sbp_)[A-Za-z0-9_-]{6,}/g, '$1***'],
];

export function yashir(matn: string): string {
  let s = matn;
  for (const q of royxat) if (q && s.includes(q)) s = s.split(q).join('***');
  for (const [re, o] of NAQSHLAR) s = s.replace(re, o);
  return s;
}

const MAXFIY_KALIT = /(parol|password|passwd|secret|token|api[_-]?key|dsn|connection|db_url|jwt|authorization)/i;

/** Argumentlar nusxasi: maxfiy nomli kalitlar va maxfiy qiymatlar yashirilgan (audit uchun). */
export function argYashir(x: unknown, chuqur = 0): unknown {
  if (chuqur > 8) return '…';
  if (typeof x === 'string') return yashir(x.length > 2000 ? x.slice(0, 2000) + '…' : x);
  if (Array.isArray(x)) return x.length > 50 ? [...x.slice(0, 50).map((v) => argYashir(v, chuqur + 1)), `…(+${x.length - 50})`] : x.map((v) => argYashir(v, chuqur + 1));
  if (x && typeof x === 'object') {
    const o: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(x)) o[k] = MAXFIY_KALIT.test(k) ? '***' : argYashir(v, chuqur + 1);
    return o;
  }
  return x;
}

/** Xatodan foydalanuvchiga xavfsiz matn (pg xatosi: message/detail/hint/code; ulanish parametrlari hech qachon). */
export function xatoMatni(e: unknown): string {
  if (e && typeof e === 'object') {
    const p = e as { message?: unknown; detail?: unknown; hint?: unknown; code?: unknown; where?: unknown; position?: unknown };
    const qism = [String(p.message ?? e)];
    if (p.code) qism.push(`[${String(p.code)}]`);
    if (p.detail) qism.push(`detail: ${String(p.detail)}`);
    if (p.hint) qism.push(`hint: ${String(p.hint)}`);
    if (p.where) qism.push(`where: ${String(p.where).slice(0, 400)}`);
    if (p.position) qism.push(`position: ${String(p.position)}`);
    return yashir(qism.join(' '));
  }
  return yashir(String(e));
}
