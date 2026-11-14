/**
 * Jarvis «kim / lavozim» keshi (brauzer): panel har ochilganda `kasbOl` ni qayta so'ramaslik uchun foydalanuvchi + kompaniya bo'yicha
 * BIR MARTA yig'iladi (xotirada + sessionStorage) va o'zgarganda yangilanadi:
 *  - kalit foydalanuvchi id + kompaniya id; foydalanuvchi noma'lum bo'lsa (uid yo'q) HECH NARSA keshlanmaydi (boshqa odamga tushib qolmasin);
 *  - TTL 5 daqiqa; eskirgan bo'lsa kesh darhol ko'rsatiladi va fonda yangilanadi (stale-while-revalidate);
 *  - kompaniya almashsa kalit boshqa — eski lavozim ko'rinmaydi.
 * Bu faqat ko'rsatish uchun (ishchi nomi, namuna savollar); ruxsatni server har so'rovda o'zi tekshiradi.
 */
import type { KasbIshchi } from '../../api/t2-agent-ish';

export const KASB_TTL_MS = 5 * 60_000;
type Yozuv = { t: number; kasb: KasbIshchi };
const xotira = new Map<string, Yozuv>();
const kalit = (uid: number, kid: number) => `jarvis-kasb:${uid}:${kid}`;

function oqi(uid: number, kid: number): Yozuv | null {
  const k = kalit(uid, kid);
  const m = xotira.get(k);
  if (m) return m;
  try {
    const v = JSON.parse(sessionStorage.getItem(k) ?? 'null') as Yozuv | null;
    if (v && typeof v.t === 'number' && v.kasb && typeof v.kasb.rol === 'string') { xotira.set(k, v); return v; }
  } catch { /* xotira yopiq */ }
  return null;
}

export function kasbKeshOl(uid: number | null | undefined, kid: number | null | undefined, hozir = Date.now()): { kasb: KasbIshchi; eskirgan: boolean } | null {
  if (uid == null || kid == null) return null;
  const y = oqi(uid, kid);
  return y ? { kasb: y.kasb, eskirgan: hozir - y.t >= KASB_TTL_MS } : null;
}

export function kasbKeshYoz(uid: number | null | undefined, kid: number | null | undefined, kasb: KasbIshchi, hozir = Date.now()): void {
  if (uid == null || kid == null) return;
  const y: Yozuv = { t: hozir, kasb };
  xotira.set(kalit(uid, kid), y);
  try { sessionStorage.setItem(kalit(uid, kid), JSON.stringify(y)); } catch { /* xotira yopiq */ }
}

export function kasbKeshTozala(): void {
  xotira.clear();
  try { Object.keys(sessionStorage).filter((k) => k.startsWith('jarvis-kasb:')).forEach((k) => sessionStorage.removeItem(k)); } catch { /* xotira yopiq */ }
}
