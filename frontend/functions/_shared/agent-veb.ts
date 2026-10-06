/**
 * Agent veb-olish: FAQAT admin tasdiqlagan domenlar, FAQAT https, SSRF himoyasi bilan.
 * Olingan matn — ISHONCHSIZ ma'lumot (buyruq emas); chaqiruvchi uni `tashqiMatnOra` bilan o'raydi.
 * Provayder/URL ro'yxati klientdan emas: domen ruxsatini chaqiruvchi (baza) beradi.
 */

export type VebNatija =
  | { ok: true; url: string; domen: string; status: number; bayt: number; sha256: string; matn: string; qisqartirildi: boolean }
  | { ok: false; xato: string };

const MAX_BAYT = 1_000_000;
const MAX_MATN = 20_000;
const TIMEOUT_MS = 8000;
const MAX_REDIRECT = 3;
const DOMEN = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/;
const RUXSAT_TURLAR = /^(text\/html|text\/plain|application\/xhtml\+xml|application\/json)\b/i;

/** URL ni tekshiradi: https, port 443, login/parolsiz, IP/localhost emas, oddiy domen. */
export function vebUrlTekshir(xom: string): { ok: true; url: URL; domen: string } | { ok: false; xato: string } {
  if (typeof xom !== 'string' || xom.length < 8 || xom.length > 2048) return { ok: false, xato: 'URL noto‘g‘ri' };
  let u: URL;
  try { u = new URL(xom.trim()); } catch { return { ok: false, xato: 'URL noto‘g‘ri' }; }
  if (u.protocol !== 'https:') return { ok: false, xato: 'Faqat https manzil ruxsat etiladi' };
  if (u.username || u.password) return { ok: false, xato: 'Manzilda login/parol bo‘lmasligi kerak' };
  if (u.port && u.port !== '443') return { ok: false, xato: 'Faqat standart port ruxsat etiladi' };
  const host = u.hostname.toLowerCase();
  if (!DOMEN.test(host)) return { ok: false, xato: 'Faqat domen nomi ruxsat etiladi (IP manzil emas)' };
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return { ok: false, xato: 'Ichki manzil ruxsat etilmaydi' };
  return { ok: true, url: u, domen: host };
}

const OBYEKT: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': '\'', '&nbsp;': ' ' };

/** HTML dan oddiy matn: script/style/teglar olib tashlanadi. */
export function htmlniMatnga(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg|iframe|template)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/(p|div|li|tr|h[1-6]|br)>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(amp|lt|gt|quot|nbsp|#39);/g, (m) => OBYEKT[m] ?? ' ')
    .replace(/[ \t\f\v ]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function sha256Hex(b: Uint8Array): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', b);
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

async function tanaOl(res: Response): Promise<{ bytes: Uint8Array; kesilgan: boolean }> {
  const reader = res.body?.getReader();
  if (!reader) return { bytes: new Uint8Array(await res.arrayBuffer()).slice(0, MAX_BAYT), kesilgan: false };
  const bolaklar: Uint8Array[] = []; let jami = 0; let kesilgan = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (jami + value.length > MAX_BAYT) { bolaklar.push(value.slice(0, MAX_BAYT - jami)); jami = MAX_BAYT; kesilgan = true; await reader.cancel(); break; }
    bolaklar.push(value); jami += value.length;
  }
  const out = new Uint8Array(jami); let o = 0;
  for (const b of bolaklar) { out.set(b, o); o += b.length; }
  return { bytes: out, kesilgan };
}

/**
 * Tasdiqlangan domendan sahifani oladi. Har redirect qayta tekshiriladi (domen yana ruxsatli bo'lishi shart).
 * `domenRuxsat` — bazadagi tasdiqlangan ro'yxat (t2_agent_veb_ruxsat_v1).
 */
export async function vebOl(
  xom: string,
  domenRuxsat: (domen: string) => Promise<boolean>,
  fetchImpl: typeof fetch = fetch,
): Promise<VebNatija> {
  let joriy = vebUrlTekshir(xom);
  for (let hop = 0; hop <= MAX_REDIRECT; hop += 1) {
    if (!joriy.ok) return { ok: false, xato: joriy.xato };
    if (!(await domenRuxsat(joriy.domen))) return { ok: false, xato: 'Bu domen admin tasdiqlagan manbalar ro‘yxatida yo‘q' };
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetchImpl(joriy.url.toString(), { method: 'GET', redirect: 'manual', signal: ctrl.signal, headers: { Accept: 'text/html,text/plain,application/json;q=0.9', 'User-Agent': 'Smeta-tizimi-agent/1' } });
    } catch { return { ok: false, xato: 'Manbaga ulanib bo‘lmadi' }; } finally { clearTimeout(timer); }
    if (res.status >= 300 && res.status < 400) {
      const joy = res.headers.get('location');
      if (!joy) return { ok: false, xato: 'Yo‘naltirish noto‘g‘ri' };
      let keyingi: string;
      try { keyingi = new URL(joy, joriy.url).toString(); } catch { return { ok: false, xato: 'Yo‘naltirish noto‘g‘ri' }; }
      joriy = vebUrlTekshir(keyingi);
      continue;
    }
    if (!res.ok) return { ok: false, xato: 'Manba javobi: ' + res.status };
    const tur = res.headers.get('content-type') ?? '';
    if (!RUXSAT_TURLAR.test(tur)) return { ok: false, xato: 'Manba turi qo‘llab-quvvatlanmaydi' };
    const { bytes, kesilgan } = await tanaOl(res);
    const xomMatn = new TextDecoder().decode(bytes);
    const toza = /html/i.test(tur) ? htmlniMatnga(xomMatn) : xomMatn.trim();
    const matn = toza.slice(0, MAX_MATN);
    return { ok: true, url: joriy.url.toString(), domen: joriy.domen, status: res.status, bayt: bytes.length, sha256: await sha256Hex(bytes), matn, qisqartirildi: kesilgan || toza.length > MAX_MATN };
  }
  return { ok: false, xato: 'Juda ko‘p yo‘naltirish' };
}
