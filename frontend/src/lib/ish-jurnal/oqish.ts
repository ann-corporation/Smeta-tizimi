/**
 * Kundalik ish jurnali — o'qish va izoh saqlash (mavjud yo'llar: /api/sb tenant o'qish, /api/tomon, /api/sb-yoz, /api/ob-havo).
 * Tezlik: 3 bosqich — (1) mustaqil o'qishlar PARALLEL (akt, sklad, АОСР, murojaat, izoh, obyekt koordinatasi),
 * (2) akt qatorlari + ob-havo (koordinata kerak), (3) qator nomlari. Yangi og'ir RPC yo'q.
 */
import { sbOqi, yangiOperationId, yozAmali } from '../../api/supabase';
import { murojaatlarOl } from '../../api/t2-tomon';
import {
  jurnalMatni, kunAosr, kunIshlari, kunKirimlari, kunMurojaatlari,
  type JurnalIzoh, type JurnalObHavo, type KunJurnali, type XomAkt, type XomAktQator, type XomAosr, type XomKirim, type XomMurojaat, type XomQator,
} from './model';

export const SANA_RE = /^\d{4}-\d{2}-\d{2}$/;

type IzohXom = { izoh: string | null; odamlar: string | null; ob_havo: JurnalObHavo | null; tasdiqlandi: boolean; versiya: number };
type ObyektKoord = { lat: number | string | null; lng: number | string | null };

const bolak = <T,>(a: readonly T[], n: number): T[][] => { const o: T[][] = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };

/** Jonli ob-havo (ixtiyoriy xizmat): xato/yo'q — null; jurnal ob-havosiz ham to'liq. */
export async function obHavoOl(lat: number, lng: number, sana: string): Promise<JurnalObHavo | null> {
  try {
    const r = await fetch(`/api/ob-havo?lat=${encodeURIComponent(lat.toFixed(2))}&lng=${encodeURIComponent(lng.toFixed(2))}&sana=${encodeURIComponent(sana)}`, { credentials: 'same-origin' });
    const j = await r.json().catch(() => null) as ({ ok?: boolean } & Partial<JurnalObHavo>) | null;
    if (!j?.ok) return null;
    return { harorat_min: j.harorat_min ?? null, harorat_max: j.harorat_max ?? null, yogin_mm: j.yogin_mm ?? null, shamol_max: j.shamol_max ?? null, kod: j.kod ?? null, manba: j.manba ?? 'open-meteo', sana };
  } catch { return null; }
}

export async function kunOl(p: { kompaniyaId: number; obyektId: number; obyektNomi: string; sana: string; obHavo?: boolean }): Promise<KunJurnali> {
  const { kompaniyaId, obyektId, obyektNomi, sana } = p;
  const olinmagan: KunJurnali['olinmagan'] = [];
  // 1-bosqich: mustaqil o'qishlar parallel.
  const [aktR, kirimR, aosrR, murR, izohR, obR] = await Promise.all([
    sbOqi<XomAkt>({ jadval: 't2_akt', filtr: `obyekt_id=eq.${obyektId}&tur=eq.fakt&sana=eq.${sana}&holat=neq.bekor`, ustunlar: 'id,holat', limit: 500 }),
    sbOqi<XomKirim>({ jadval: 't2_sklad_harakat', filtr: `obyekt_id=eq.${obyektId}&sana=eq.${sana}&operatsiya=eq.prixod`, ustunlar: 'id,nomi,birligi,obyomi,postavshik,holat,operatsiya', limit: 1000 }),
    sbOqi<XomAosr>({ jadval: 't2_aosr_reestr_v2', filtr: `obyekt_id=eq.${obyektId}&sana=eq.${sana}`, ustunlar: 'id,raqam,ish_nomi,holat,sana', limit: 200 }),
    murojaatlarOl(kompaniyaId).catch(() => ({ ok: false as const, error: 'tarmoq' })),
    sbOqi<IzohXom>({ jadval: 't2_ish_jurnal_izoh', filtr: `obyekt_id=eq.${obyektId}&sana=eq.${sana}`, ustunlar: 'izoh,odamlar,ob_havo,tasdiqlandi,versiya', limit: 1 }),
    p.obHavo === false ? Promise.resolve(null) : sbOqi<ObyektKoord>({ jadval: 't2_obyekt', filtr: `id=eq.${obyektId}`, ustunlar: 'lat,lng', limit: 1 }),
  ]);
  if (!kirimR.ok) olinmagan.push('kirim');
  if (!aosrR.ok) olinmagan.push('aosr');
  if (!murR.ok) olinmagan.push('murojaat');
  if (!izohR.ok) olinmagan.push('izoh');
  const aktlar = aktR.ok ? aktR.qatorlar ?? [] : [];
  if (!aktR.ok) olinmagan.push('ishlar');

  const izohXom = izohR.ok ? izohR.qatorlar?.[0] : undefined;
  const izoh: JurnalIzoh | null = izohXom ? { izoh: izohXom.izoh ?? '', odamlar: izohXom.odamlar ?? '', tasdiqlandi: !!izohXom.tasdiqlandi, versiya: Number(izohXom.versiya) || 1, obHavo: izohXom.ob_havo ?? null } : null;

  // 2-bosqich: akt qatorlari + ob-havo (tasdiqlangan snapshot bo'lsa — jonli so'rov kerak emas).
  const koord = obR && 'ok' in obR && obR.ok ? obR.qatorlar?.[0] : undefined;
  const lat = koord?.lat == null ? NaN : Number(koord.lat); const lng = koord?.lng == null ? NaN : Number(koord.lng);
  const jonliKerak = !izoh?.obHavo && Number.isFinite(lat) && Number.isFinite(lng);
  const [aqR, jonli] = await Promise.all([
    aktlar.length
      ? Promise.all(bolak(aktlar.map((a) => a.id), 100).map((ids) => sbOqi<XomAktQator>({ jadval: 't2_akt_qator', filtr: `akt_id=in.(${ids.join(',')})`, ustunlar: 'akt_id,qator_id,hajm', limit: 5000 })))
      : Promise.resolve([] as Array<Awaited<ReturnType<typeof sbOqi<XomAktQator>>>>),
    jonliKerak ? obHavoOl(lat, lng, sana) : Promise.resolve(null),
  ]);
  if (aqR.some((r) => !r.ok) && !olinmagan.includes('ishlar')) olinmagan.push('ishlar');
  const aktQatorlar = aqR.flatMap((r) => (r.ok ? r.qatorlar ?? [] : []));

  // 3-bosqich: qator nomlari.
  const qIdlar = [...new Set(aktQatorlar.map((r) => r.qator_id))];
  const qR = qIdlar.length
    ? await Promise.all(bolak(qIdlar, 100).map((ids) => sbOqi<XomQator>({ jadval: 't2_qator', filtr: `id=in.(${ids.join(',')})`, ustunlar: 'id,kod,nom,birlik,tartib', limit: 200, versiya: 'tarix' })))
    : [];
  if (qR.some((r) => !r.ok) && !olinmagan.includes('ishlar')) olinmagan.push('ishlar');
  const qatorlar = qR.flatMap((r) => (r.ok ? r.qatorlar ?? [] : []));

  return {
    obyektId, obyektNomi, sana,
    ishlar: kunIshlari(aktlar, aktQatorlar, qatorlar),
    kirimlar: kunKirimlari(kirimR.ok ? kirimR.qatorlar ?? [] : []),
    aosr: kunAosr(aosrR.ok ? aosrR.qatorlar ?? [] : [], sana),
    murojaatlar: kunMurojaatlari(murR.ok ? (murR.natija as XomMurojaat[]) ?? [] : [], obyektNomi, sana),
    obHavo: izoh?.obHavo ?? jonli,
    izoh,
    olinmagan,
  };
}

/** AI yordamchi (buyruq satri «jurnal» vositasi): kun jurnali matni (faqat real ma'lumot; ob-havo ham ixtiyoriy). */
export async function jurnalMatniOl(p: { kompaniyaId: number; obyektId: number; obyektNomi: string; sana: string }): Promise<string> {
  return jurnalMatni(await kunOl(p));
}

/**
 * AI yordamchi: prorab izohini QORALAMA qilib yozadi (tasdiqlash — faqat jurnal sahifasida, prorab o'zi).
 * Mavjud izoh bo'lsa o'chirilmaydi — yangi matn yangi qatorda qo'shiladi (takror bo'lsa — o'zgarmaydi). Tasdiqlangan yozuv ham qoralamaga qaytadi
 * (matn o'zgardi — prorab qayta tasdiqlashi kerak).
 */
export async function jurnalIzohYoz(p: { kompaniyaId: number; obyektId: number; obyektNomi: string; sana: string; matn: string; operationId: string }): Promise<IzohSaqlaNatija> {
  const k = await kunOl({ kompaniyaId: p.kompaniyaId, obyektId: p.obyektId, obyektNomi: p.obyektNomi, sana: p.sana, obHavo: false });
  if (k.olinmagan.includes('izoh')) return { ok: false, error: 'Mavjud izohni o‘qib bo‘lmadi — yozilmadi' };
  const eski = k.izoh?.izoh ?? '';
  const matn = !eski ? p.matn : eski.includes(p.matn) ? eski : `${eski}\n${p.matn}`;
  if (matn === eski && k.izoh) return { ok: true, versiya: k.izoh.versiya, tasdiqlandi: k.izoh.tasdiqlandi };
  return izohSaqla({
    kompaniyaId: p.kompaniyaId, obyektId: p.obyektId, sana: p.sana, izoh: matn, odamlar: k.izoh?.odamlar ?? '', obHavo: k.izoh?.obHavo ?? null,
    tasdiqlash: false, kutilganVersiya: k.izoh?.versiya ?? null, operationId: p.operationId,
  });
}

export type IzohSaqlaNatija = { ok: boolean; versiya?: number; tasdiqlandi?: boolean; code?: string; error?: string };

/** Prorab izohini saqlash/tasdiqlash. Tasdiq paytida ob-havo snapshot yoziladi (keyin o'zgarmas hujjat uchun). CAS: `kutilganVersiya` (yangi yozuv — null). */
export async function izohSaqla(p: {
  kompaniyaId: number; obyektId: number; sana: string; izoh: string; odamlar: string; obHavo: JurnalObHavo | null; tasdiqlash: boolean;
  kutilganVersiya: number | null; operationId?: string;
}): Promise<IzohSaqlaNatija> {
  const r = await yozAmali({
    amal: 'ish_jurnal_saqla_v1', kompaniya_id: p.kompaniyaId, obyekt_id: p.obyektId, sana: p.sana,
    izoh: p.izoh.trim() || null, odamlar: p.odamlar.trim() || null, ob_havo: p.obHavo, tasdiqlash: p.tasdiqlash,
    kutilgan_versiya: p.kutilganVersiya, operation_id: p.operationId ?? yangiOperationId(),
  }) as unknown as { ok?: boolean; natija?: { ok?: boolean; versiya?: number; tasdiqlandi?: boolean; code?: string }; versiya?: number; tasdiqlandi?: boolean; code?: string; error?: string };
  // Gateway RPC natijasini `natija` ichida yoki tekis qaytarishi mumkin — ikkalasini qabul qilamiz.
  const n = r.natija ?? r;
  if (r.ok === false || n.ok === false) return { ok: false, code: n.code ?? r.code, error: r.error };
  return { ok: true, versiya: n.versiya, tasdiqlandi: n.tasdiqlandi };
}
