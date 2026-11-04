/**
 * Transport: masofa, marshrut va navigatsiya havolalari (sof funksiyalar; kalitsiz).
 * Yo'l masofasi: ochiq OSRM (kalitsiz) — sozlanmasa yoki xato bo'lsa TO'G'RI CHIZIQ (haversine) × yo'l koeffitsienti, «taxminiy» belgisi bilan.
 * Pullik xizmat (Yandex/Google) kerak bo'lsa — `YolOlish` adapteri shu interfeysni bajaradi; manzil env (VITE_ROUTING_URL) bilan beriladi.
 */
export type Nuqta = { lat: number; lng: number };
export type MarshrutManba = 'yol' | 'taxminiy';
export type MarshrutNatija = { km: number; daqiqa: number; manba: MarshrutManba; geometriya: Array<[number, number]> | null };

/** To'g'ri chiziq → yo'l masofasi koeffitsienti (shahar/tuman yo'llari uchun odatiy 1.25–1.4). */
export const YOL_KOEF = 1.3;
/** Taxminiy o'rtacha tezlik, km/soat (yuk mashinasi, aralash yo'l). */
export const ORTACHA_TEZLIK = 40;

const R_KM = 6371.0088;
const rad = (g: number) => (g * Math.PI) / 180;

export function togriNuqta(p: Partial<Nuqta> | null | undefined): p is Nuqta {
  return !!p && Number.isFinite(p.lat) && Number.isFinite(p.lng)
    && Math.abs(p.lat as number) <= 90 && Math.abs(p.lng as number) <= 180 && !(p.lat === 0 && p.lng === 0);
}

/** Ikki nuqta orasidagi to'g'ri chiziq masofasi (km). */
export function haversine(a: Nuqta, b: Nuqta): number {
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

const yaxlit = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

/** Bekatlar ketma-ketligi bo'yicha taxminiy marshrut. Koordinatasiz bekat bo'lsa — null (hisoblab bo'lmaydi, 0 emas). */
export function taxminiyMarshrut(bekatlar: Array<Partial<Nuqta>>, koef = YOL_KOEF, tezlik = ORTACHA_TEZLIK): MarshrutNatija | null {
  if (bekatlar.length < 2 || !bekatlar.every(togriNuqta)) return null;
  const pts = bekatlar as Nuqta[];
  let km = 0;
  for (let i = 1; i < pts.length; i++) km += haversine(pts[i - 1], pts[i]) * koef;
  return { km: yaxlit(km), daqiqa: Math.round((km / tezlik) * 60), manba: 'taxminiy', geometriya: pts.map((p) => [p.lat, p.lng]) };
}

export type YolOlish = (pts: Nuqta[], signal?: AbortSignal) => Promise<MarshrutNatija | null>;

/** Ochiq OSRM (kalitsiz). `baza` — masalan https://router.project-osrm.org yoki o'z serveringiz. Jamoat demo-serveri yengil foydalanish uchun. */
export function osrmAdapter(baza: string, fetchFn: typeof fetch = fetch): YolOlish {
  return async (pts, signal) => {
    if (pts.length < 2) return null;
    const yol = pts.map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(';');
    const r = await fetchFn(`${baza.replace(/\/$/, '')}/route/v1/driving/${yol}?overview=full&geometries=geojson`, { signal });
    if (!r.ok) return null;
    const j = await r.json() as { code?: string; routes?: Array<{ distance: number; duration: number; geometry?: { coordinates: Array<[number, number]> } }> };
    const m = j.routes?.[0];
    if (j.code !== 'Ok' || !m) return null;
    return {
      km: yaxlit(m.distance / 1000), daqiqa: Math.round(m.duration / 60), manba: 'yol',
      geometriya: m.geometry ? m.geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]) : null,
    };
  };
}

/** Yo'l olish; xato/tarmoq yo'q bo'lsa taxminiy (manba shu yerda ochiq aytiladi). */
export async function marshrutQur(pts: Array<Partial<Nuqta>>, yol?: YolOlish | null, signal?: AbortSignal): Promise<MarshrutNatija | null> {
  if (pts.length < 2 || !pts.every(togriNuqta)) return null;
  if (yol) {
    try { const n = await yol(pts as Nuqta[], signal); if (n) return n; } catch { /* taxminiyga o'tamiz */ }
  }
  return taxminiyMarshrut(pts);
}

const s = (p: Nuqta) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;

/** Haydovchi uchun Google Maps navigatsiya havolasi (kalitsiz). */
export function googleHavola(pts: Nuqta[]): string | null {
  if (pts.length < 1 || !pts.every(togriNuqta)) return null;
  const u = new URLSearchParams({ api: '1', destination: s(pts[pts.length - 1]), travelmode: 'driving' });
  if (pts.length > 1) u.set('origin', s(pts[0]));
  if (pts.length > 2) u.set('waypoints', pts.slice(1, -1).map(s).join('|'));
  return `https://www.google.com/maps/dir/?${u.toString().replace(/%2C/g, ',').replace(/%7C/g, '|')}`;
}

/** Yandex Maps havolasi (rtext = lat,lng~lat,lng). */
export function yandexHavola(pts: Nuqta[]): string | null {
  if (pts.length < 1 || !pts.every(togriNuqta)) return null;
  return `https://yandex.com/maps/?rtext=${pts.map(s).join('~')}&rtt=auto`;
}
