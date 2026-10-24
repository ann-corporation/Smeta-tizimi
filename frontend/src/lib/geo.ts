/* Geografik yordamchilar (obyekt lokatsiyasi + logistika uchun umumiy).
 * Hammasi sof funksiya: tarmoqsiz, kalitsiz. Geokoder - bepul OpenStreetMap Nominatim
 * (faqat foydalanuvchi tugma bosganda, avto-to'ldirishsiz: ularning foydalanish siyosati). */

export type LatLng = [number, number];

export const TOSHKENT: LatLng = [41.2995, 69.2401];

export function togriKoordinata(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng)
    && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
    && !(lat === 0 && lng === 0);
}

/** Matndan koordinata oladi: "41.2995, 69.2401", "41.2995 69.2401",
 *  "41,2995; 69,2401" (vergulli o'nlik), "41.2995N 69.2401E",
 *  Google/OSM havolalari (@lat,lng yoki ?mlat=..&mlon=..). Topilmasa null. */
export function koordinataniOqi(matn: string): LatLng | null {
  const s = (matn || '').trim();
  if (!s) return null;
  const havola = s.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/)
    || s.match(/[?&]mlat=(-?\d+(?:\.\d+)?)&mlon=(-?\d+(?:\.\d+)?)/);
  if (havola) return tekshir(Number(havola[1]), Number(havola[2]));

  const hemis = s.match(/^(\d+(?:[.,]\d+)?)\s*°?\s*([NSns])[\s,;]+(\d+(?:[.,]\d+)?)\s*°?\s*([EWew])$/);
  if (hemis) {
    const a = Number(hemis[1].replace(',', '.')) * (/s/i.test(hemis[2]) ? -1 : 1);
    const b = Number(hemis[3].replace(',', '.')) * (/w/i.test(hemis[4]) ? -1 : 1);
    return tekshir(a, b);
  }
  /* Ajratgich: nuqtali-vergul / bo'shliq / (o'nlik nuqta bo'lsa) vergul. */
  const sonlar = s.match(/-?\d+(?:[.,]\d+)?/g);
  if (!sonlar || sonlar.length !== 2) return null;
  if (/[^\d\s.,;:\-+°]/.test(s)) return null;
  return tekshir(Number(sonlar[0].replace(',', '.')), Number(sonlar[1].replace(',', '.')));
}

function tekshir(lat: number, lng: number): LatLng | null {
  return togriKoordinata(lat, lng) ? [lat, lng] : null;
}

/** Ikki nuqta orasidagi to'g'ri chiziq masofasi, km (haversine). */
export function masofaKm(a: LatLng, b: LatLng): number {
  const R = 6371.0088;
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b[0] - a[0]);
  const dLng = rad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function koordinataMatni(p: LatLng | null | undefined, raqam = 5): string {
  return p ? p[0].toFixed(raqam) + ', ' + p[1].toFixed(raqam) : '';
}

export type ManzilNatija = { nom: string; lat: number; lng: number };

/** Bepul geokoder (Nominatim). Faqat O'zbekiston bo'yicha cheklangan. */
export async function manzilQidir(so: string, signal?: AbortSignal): Promise<ManzilNatija[]> {
  const q = so.trim();
  if (q.length < 3) return [];
  const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=uz&accept-language=uz,ru&q='
    + encodeURIComponent(q);
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('Manzil qidiruvi ishlamadi (' + res.status + ')');
  const arr = (await res.json()) as Array<{ display_name?: string; lat?: string; lon?: string }>;
  return (Array.isArray(arr) ? arr : [])
    .map((x) => ({ nom: String(x.display_name || ''), lat: Number(x.lat), lng: Number(x.lon) }))
    .filter((x) => x.nom && togriKoordinata(x.lat, x.lng));
}
