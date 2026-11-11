/**
 * ob-havo.ts — kundalik ish jurnali uchun ob-havo (P1). Bepul ochiq API (Open-Meteo, kalitsiz) shlyuz orqali:
 * brauzer tashqi servisga to'g'ridan-to'g'ri chiqmaydi, koordinata 2 xonaga yaxlitlanadi (taxminan 1 km), tashqariga faqat
 * koordinata + sana ketadi (kompaniya/obyekt nomi yoki boshqa ma'lumot emas). Natija Cache API da saqlanadi:
 * o'tgan kun — 12 soat, bugun — 1 soat. Ixtiyoriy xizmat: xato bo'lsa ok:false — jurnal ob-havosiz ham ishlaydi.
 *
 *   GET /api/ob-havo?lat=40.10&lng=65.37&sana=2026-11-12 → {ok, harorat_min, harorat_max, yogin_mm, shamol_max, kod, manba, sana}
 *
 * Sessiya majburiy (ochiq proxy bo'lib qolmasin).
 */
import { tekshir } from '../_shared/auth';

type Env = { SESSIYA_KALIT: string };

const SANA = /^\d{4}-\d{2}-\d{2}$/;
const KUN_MS = 86_400_000;

export type ObHavoJavob = {
  ok: true; sana: string; harorat_min: number | null; harorat_max: number | null; yogin_mm: number | null; shamol_max: number | null; kod: number | null; manba: 'open-meteo';
};

/** Open-Meteo URL: 90 kundan eski sana — arxiv API, aks holda prognoz API (o'tgan kunlarni ham beradi). */
export function ochiMeteoUrl(lat: number, lng: number, sana: string, bugun = new Date()): string {
  const kun = Date.parse(sana + 'T00:00:00Z');
  const eski = bugun.getTime() - kun > 90 * KUN_MS;
  const baza = eski ? 'https://archive-api.open-meteo.com/v1/archive' : 'https://api.open-meteo.com/v1/forecast';
  const q = new URLSearchParams({
    latitude: lat.toFixed(2), longitude: lng.toFixed(2), start_date: sana, end_date: sana, timezone: 'auto',
    daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,weather_code',
  });
  return `${baza}?${q.toString()}`;
}

const son = (a: unknown): number | null => (Array.isArray(a) && typeof a[0] === 'number' && Number.isFinite(a[0]) ? a[0] : null);

/** Open-Meteo javobini bizning shaklga o'tkazadi (noma'lum — null, 0 emas). */
export function ochiMeteoNatija(j: unknown, sana: string): ObHavoJavob | null {
  const d = (j as { daily?: Record<string, unknown> } | null)?.daily;
  if (!d || !Array.isArray(d.time) || d.time[0] !== sana) return null;
  return {
    ok: true, sana, harorat_min: son(d.temperature_2m_min), harorat_max: son(d.temperature_2m_max), yogin_mm: son(d.precipitation_sum),
    shamol_max: son(d.wind_speed_10m_max), kod: son(d.weather_code), manba: 'open-meteo',
  };
}

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const sess = await tekshir(ctx.request.headers.get('Cookie'), ctx.env.SESSIYA_KALIT);
  if (!sess) return Response.json({ ok: false, code: 'AUTH_REQUIRED' }, { status: 401 });
  const u = new URL(ctx.request.url);
  const lat = Number(u.searchParams.get('lat')); const lng = Number(u.searchParams.get('lng'));
  const sana = u.searchParams.get('sana') ?? '';
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || !SANA.test(sana) || Number.isNaN(Date.parse(sana + 'T00:00:00Z'))) {
    return Response.json({ ok: false, code: 'PARAM_YAROQSIZ' }, { status: 400 });
  }
  const bugun = new Date();
  if (Date.parse(sana + 'T00:00:00Z') > bugun.getTime() + 2 * KUN_MS) return Response.json({ ok: false, code: 'SANA_KELAJAK' }, { status: 400 });
  const url = ochiMeteoUrl(lat, lng, sana, bugun);
  const bugunmi = bugun.toISOString().slice(0, 10) <= sana;
  const ttl = bugunmi ? 3600 : 43200;
  const kesh = (globalThis as { caches?: { default?: Cache } }).caches?.default;
  const kalit = new Request(url);
  const topilgan = kesh ? await kesh.match(kalit).catch(() => undefined) : undefined;
  if (topilgan) return topilgan;
  let natija: ObHavoJavob | null = null;
  try {
    const r = await fetch(url, { headers: { Accept: 'application/json' } });
    if (r.ok) natija = ochiMeteoNatija(await r.json().catch(() => null), sana);
  } catch { /* ixtiyoriy xizmat — ok:false */ }
  if (!natija) return Response.json({ ok: false, code: 'OB_HAVO_YOQ' }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  const javob = Response.json(natija, { headers: { 'Cache-Control': `public, max-age=${ttl}` } }); // public: Cache API `private` ni saqlamaydi; ma'lumot ochiq (koordinata + sana)
  if (kesh) ctx.waitUntil(kesh.put(kalit, javob.clone()).catch(() => undefined));
  return javob;
};
