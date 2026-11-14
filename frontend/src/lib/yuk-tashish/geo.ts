/**
 * Geo provayder interfeysi (Logistika P1): xarita plitkasi, manzil qidirish, marshrut — BITTA joyda, almashtiriladigan.
 * Sukut: ochiq ma'lumot (OpenStreetMap plitkasi va Nominatim; pullik kalit YO'Q) + mavjud `/api/yuk-marshrut` (OSRM) masofasi.
 * Eslatma: ochiq OSM plitka serveri yengil foydalanish uchun (siyosat — T tekshirilsin); ko'paygach o'z plitka serveri (PMTiles R2) bilan
 * `GEO_PROVAYDER` almashtiriladi — boshqa kod o'zgarmaydi. Nominatim: 1 so'rov/soniya, avto-to'ldirish YO'Q (faqat tugma/Enter).
 */
export type Nuqta = { lat: number; lng: number };
export type ManzilNatija = Nuqta & { nom: string };
export type MarshrutNatija = { km: number; daqiqa: number; manba: 'yol' | 'taxminiy' };

export interface GeoProvayder {
  readonly id: string;
  readonly atribut: string;
  plitkaUrl(z: number, x: number, y: number): string;
  qidir(matn: string, signal?: AbortSignal): Promise<ManzilNatija[]>;
  marshrut(a: Nuqta, b: Nuqta): Promise<MarshrutNatija | null>;
}

/** Oʻzbekiston chegarasi (taxminiy ramka) — qidiruv va xaritaga boshlang'ich ko'rinish. */
export const UZ_MARKAZ: Nuqta = { lat: 41.3, lng: 64.6 };
export const UZ_ZOOM = 6;

const OSM: GeoProvayder = {
  id: 'osm',
  atribut: '© OpenStreetMap',
  plitkaUrl: (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`,
  async qidir(matn, signal) {
    const q = matn.trim();
    if (q.length < 3) return [];
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=uz&accept-language=uz,ru&q=${encodeURIComponent(q)}`, { signal });
    if (!r.ok) return [];
    const j = await r.json() as Array<{ lat?: string; lon?: string; display_name?: string }>;
    return j.flatMap((x) => {
      const lat = Number(x.lat), lng = Number(x.lon);
      return Number.isFinite(lat) && Number.isFinite(lng) ? [{ lat, lng, nom: String(x.display_name ?? '').split(',').slice(0, 3).join(',').trim() }] : [];
    });
  },
  async marshrut(a, b) {
    try {
      const r = await fetch('/api/yuk-marshrut', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ a, b }) });
      const j = await r.json() as { ok?: boolean; km?: number; daqiqa?: number; manba?: 'yol' | 'taxminiy' };
      return j.ok && typeof j.km === 'number' ? { km: j.km, daqiqa: j.daqiqa ?? 0, manba: j.manba ?? 'taxminiy' } : null;
    } catch { return null; }
  },
};

/** Provayderni almashtirish nuqtasi (bitta konstanta). */
export const GEO_PROVAYDER: GeoProvayder = OSM;

/* ── Web Mercator (xarita matematikasi; testlangan) ── */
export const PLITKA = 256;
export function dunyoPiksel(p: Nuqta, z: number): { x: number; y: number } {
  const n = PLITKA * 2 ** z;
  const lat = Math.max(-85.0511, Math.min(85.0511, p.lat));
  const s = Math.sin((lat * Math.PI) / 180);
  return { x: ((p.lng + 180) / 360) * n, y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n };
}
export function pikseldanNuqta(x: number, y: number, z: number): Nuqta {
  const n = PLITKA * 2 ** z;
  const lng = (x / n) * 360 - 180;
  const t = Math.PI - (2 * Math.PI * y) / n;
  return { lat: (180 / Math.PI) * Math.atan(0.5 * (Math.exp(t) - Math.exp(-t))), lng };
}
/** Ikki nuqta orasidagi to'g'ri chiziq masofasi (km, haversine; yo'l masofasi emas). */
export function chiziqMasofaKm(a: Nuqta, b: Nuqta): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return Number((6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)))).toFixed(2));
}
