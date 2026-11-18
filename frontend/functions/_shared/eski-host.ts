/**
 * Eski host (smeta-tizimi.pages.dev) → kanonik domen (qurai.uz): FAQAT brauzer HTML sahifalari uchun 301.
 *
 * Eski ilovalar (Android/Windows) eski hostga qo'ng'iroq qiladi, shuning uchun redirect QILINMAYDI: /api/* (webhooklar ham shu yerda),
 * /mobile-release.json, /desktop-release.json, /t/* (QR tekshiruv), /android|windows|macos/* (R2 yuklab olish), statik fayllar
 * (kengaytmali yo'l, /assets, /brand, /ikonlar), shuningdek ilova ichki oqimlari (/ilova-qaytdi, /brauzer-kirish, /tg Mini App).
 * Ilova WebView'lari (UA da QURAIApp, X-Requested-With) va dastur o'zi ochgan navigatsiya (Sec-Fetch-User yo'q — eski Windows
 * qobig'ining loader.js `location.replace`i) ham o'tkazib yuboriladi: eski ilova yangi hostni «tashqi» deb brauzerda ochib yuboradi.
 * O'chirgich: env ESKI_HOST_YONLANTIRISH=0 (rollback — kodni qaytarmasdan). Domen: lib/sayt-manzil.ts.
 */
import { eskiHostmi, publicOrigin } from '../../src/lib/sayt-manzil';

type Env = { PUBLIC_ORIGIN?: string; ESKI_HOST_YONLANTIRISH?: string };

const OTMAYDIGAN_PREFIKS = ['/api/', '/t/', '/android/', '/windows/', '/macos/', '/assets/', '/brand/', '/ikonlar/'];
const OTMAYDIGAN_ANIQ = new Set(['/api', '/t', '/ilova-qaytdi', '/brauzer-kirish', '/tg', '/mobile-release.json', '/desktop-release.json', '/sw.js']);

export function eskiHostYonlantir(request: Request, env: Env | undefined): Response | null {
  if (request.method !== 'GET' && request.method !== 'HEAD') return null;
  if (String(env?.ESKI_HOST_YONLANTIRISH ?? '').trim() === '0') return null;
  const url = new URL(request.url);
  if (!eskiHostmi(url.hostname)) return null;
  const yol = url.pathname;
  if (OTMAYDIGAN_ANIQ.has(yol) || OTMAYDIGAN_PREFIKS.some((p) => yol.startsWith(p))) return null;
  const oxirgi = yol.split('/').pop() ?? '';
  if (oxirgi.includes('.')) return null; // statik fayl (js/css/png/json/pdf…) — HTML sahifa emas
  const h = request.headers;
  if (!/text\/html/i.test(h.get('Accept') ?? '')) return null;
  if (/QURAIApp\//.test(h.get('User-Agent') ?? '') || h.has('X-Requested-With')) return null; // Android WebView
  const mode = h.get('Sec-Fetch-Mode');
  if (mode && (mode !== 'navigate' || h.get('Sec-Fetch-User') !== '?1')) return null; // iframe/dastur navigatsiyasi; Sec-Fetch yo'q (eski brauzer) — yo'naltiriladi
  const target = new URL(publicOrigin(env));
  if (eskiHostmi(target.hostname)) return null; // PUBLIC_ORIGIN eski hostga qo'yilgan — sikl bo'lmasin
  return new Response(null, {
    status: 301,
    headers: { Location: target.origin + yol + url.search, 'Cache-Control': 'public, max-age=300', Vary: 'Accept, Sec-Fetch-Mode, Sec-Fetch-User' },
  });
}