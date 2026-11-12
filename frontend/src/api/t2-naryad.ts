/**
 * Naryad + kompaniya lug'ati (migratsiya 20261214800000). O'qish: /api/sb `naryad_ol_v1` (STABLE, GET; a'zolik + smeta.read RPC ichida).
 * Yozish: /api/sb-yoz `naryad_yoz_v1` (smeta.write; hisobla — yana financial.write; idempotent operation_id, CAS kutilgan_versiya).
 * Fakt: farq mavjud `fakt_yoz_v2` (sbFaktYoz) orqali, operationId = naryadning `fakt_operation_id` (qayta bosish ikkinchi hujjat yaratmaydi).
 */
import { vaqtliOqish } from './vaqtli-fetch';
import { sbOqi, yozAmali, type AktNatija } from './supabase';
import { sbFaktYoz } from './t2-fakt';
import type { LugatQoshimcha } from '../lib/qurilish-lugat';
import { naryadTozala, type FaktHozir, type Naryad, type NaryadHolat, type NaryadKat, type NaryadQisqa } from '../lib/naryad';
import type { TarixSatr } from '../lib/naryad/kelishuv';

type OqishJavob<T> = { ok: boolean; code?: string } & T;

async function ol<T>(kompaniyaId: number, bolim: string, filtr: Record<string, unknown>): Promise<OqishJavob<T> | null> {
  try {
    const r = await vaqtliOqish('/api/sb', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ soro: 'naryad_ol_v1', kompaniya_id: kompaniyaId, bolim, filtr }),
    });
    const j = await r.json() as { ok: boolean; natija?: OqishJavob<T> };
    return j.ok && j.natija?.ok ? j.natija : null;
  } catch { return null; }
}

const son = (x: unknown): number | null => (x == null || x === '' ? null : Number.isFinite(Number(x)) ? Number(x) : null);

export async function naryadlarOl(kompaniyaId: number, f: { obyektId?: number; holat?: NaryadHolat; limit?: number } = {}): Promise<NaryadQisqa[] | null> {
  const r = await ol<{ naryadlar: NaryadQisqa[] }>(kompaniyaId, 'royxat', { obyekt_id: f.obyektId, holat: f.holat, limit: f.limit });
  return r ? (r.naryadlar ?? []).map((n) => ({ ...n, reja_summa: son(n.reja_summa), xarajat_summa: son(n.xarajat_summa) })) : null;
}

export async function naryadOl(kompaniyaId: number, id: number): Promise<Naryad | null> {
  const r = await ol<{ naryad: Naryad }>(kompaniyaId, 'bitta', { id });
  return r?.naryad ? naryadTozala(r.naryad) : null;
}

/** Kompaniya lug'ati (sinonimlar, nomlar). Yo'q — null (umumiy lug'at ishlayveradi). */
export async function lugatKompaniyaOl(kompaniyaId: number): Promise<{ qiymat: LugatQoshimcha; versiya: number | null } | null> {
  const r = await ol<{ qiymat: LugatQoshimcha; versiya: number | null }>(kompaniyaId, 'lugat', {});
  return r ? { qiymat: r.qiymat ?? {}, versiya: r.versiya ?? null } : null;
}

export type NaryadYozNatija = AktNatija & { id?: number; versiya?: number; holat?: NaryadHolat; raqam?: string; fakt_operation_id?: string; xarajat_id?: number; xarajat_summa?: number; code?: string };

function yoz(p: { kompaniyaId: number; amal: string; naryadId?: number | null; versiya?: number | null; operationId: string; yuk?: Record<string, unknown> }): Promise<NaryadYozNatija> {
  return yozAmali({
    amal: 'naryad_yoz_v1', kompaniya_id: p.kompaniyaId, naryad_amal: p.amal, naryad_id: p.naryadId ?? null,
    kutilgan_versiya: p.versiya ?? null, operation_id: p.operationId, yuk: p.yuk ?? {},
  }) as Promise<NaryadYozNatija>;
}

export type NaryadYaratQator = {
  qator_id: number; hajm: number; usta_narx: number | null; norma_chel_soat: number | null; smeta_mehnat_birlik: number | null; fakt_boshida: number | null;
  /** Usta o'z birligida: toifa, birlik, koef (1 usta birligidagi smeta birligi), narx 1 usta birligiga, smeta МАТ/МАШ puli. */
  kat?: NaryadKat; usta_birlik?: string | null; koef?: number | null; usta_narx_birlik?: number | null; smeta_kat_birlik?: number | null;
};

export const naryadYarat = (p: {
  kompaniyaId: number; operationId: string; obyektId: number; ustaNom: string; ustaFoydalanuvchiId?: number | null; brigada?: string | null; davrDan?: string | null; davrGacha?: string | null; izoh?: string | null; qatorlar: NaryadYaratQator[];
}) => yoz({ kompaniyaId: p.kompaniyaId, amal: 'yarat', operationId: p.operationId, yuk: {
  obyekt_id: p.obyektId, usta_nom: p.ustaNom, usta_foydalanuvchi_id: p.ustaFoydalanuvchiId ?? null, brigada: p.brigada ?? null, davr_dan: p.davrDan ?? null, davr_gacha: p.davrGacha ?? null, izoh: p.izoh ?? null, qatorlar: p.qatorlar,
} });

export const naryadBajarildi = (p: { kompaniyaId: number; naryadId: number; versiya: number; operationId: string; qatorlar: Array<{ id: number; bajarilgan_hajm: number }> }) =>
  yoz({ kompaniyaId: p.kompaniyaId, amal: 'bajarildi', naryadId: p.naryadId, versiya: p.versiya, operationId: p.operationId, yuk: { qatorlar: p.qatorlar } });

export const naryadQabul = (p: { kompaniyaId: number; naryadId: number; versiya: number; operationId: string; qatorlar: Array<{ id: number; qabul_hajm: number; fakt_hozir: number | null }> }) =>
  yoz({ kompaniyaId: p.kompaniyaId, amal: 'qabul', naryadId: p.naryadId, versiya: p.versiya, operationId: p.operationId, yuk: { qatorlar: p.qatorlar } });

export const naryadNarx = (p: { kompaniyaId: number; naryadId: number; versiya: number; operationId: string; qatorlar: Array<{ id: number; usta_narx?: number; usta_narx_birlik?: number; koef?: number | null; usta_birlik?: string | null }> }) =>
  yoz({ kompaniyaId: p.kompaniyaId, amal: 'narx', naryadId: p.naryadId, versiya: p.versiya, operationId: p.operationId, yuk: { qatorlar: p.qatorlar } });

export const naryadFaktYozildi = (p: { kompaniyaId: number; naryadId: number; versiya: number; operationId: string; aktId: number | null }) =>
  yoz({ kompaniyaId: p.kompaniyaId, amal: 'fakt_yozildi', naryadId: p.naryadId, versiya: p.versiya, operationId: p.operationId, yuk: { akt_id: p.aktId } });

export const naryadHisobla = (p: { kompaniyaId: number; naryadId: number; versiya: number; operationId: string }) =>
  yoz({ kompaniyaId: p.kompaniyaId, amal: 'hisobla', naryadId: p.naryadId, versiya: p.versiya, operationId: p.operationId });

export const naryadBekor = (p: { kompaniyaId: number; naryadId: number; versiya: number; operationId: string }) =>
  yoz({ kompaniyaId: p.kompaniyaId, amal: 'bekor', naryadId: p.naryadId, versiya: p.versiya, operationId: p.operationId });

export const lugatKompaniyaSaqla = (p: { kompaniyaId: number; operationId: string; qiymat: LugatQoshimcha | null }) =>
  yoz({ kompaniyaId: p.kompaniyaId, amal: 'lugat_saqla', operationId: p.operationId, yuk: { qiymat: p.qiymat } });

/** Qatorlarning hozirgi fakt/smeta hajmi (naryad qabulida farqni hisoblash uchun). O'qib bo'lmasa — null (taxmin qilinmaydi). */
export async function faktHozirOl(qatorIdlar: number[]): Promise<Map<number, FaktHozir> | null> {
  const ids = [...new Set(qatorIdlar.filter((x) => Number.isSafeInteger(x) && x > 0))].slice(0, 200);
  if (!ids.length) return new Map();
  const r = await sbOqi<{ qator_id: number; fakt_hajm: number | null; smeta_hajm: number | null }>({
    jadval: 't2_qator_holat', filtr: `qator_id=in.(${ids.join(',')})`, ustunlar: 'qator_id,fakt_hajm,smeta_hajm', limit: 1000,
  });
  if (!r.ok || r.toliq === false || !Array.isArray(r.qatorlar)) return null;
  return new Map(r.qatorlar.map((x) => [Number(x.qator_id), { fakt_hajm: son(x.fakt_hajm), smeta_hajm: son(x.smeta_hajm) }]));
}

/**
 * Qabul qilingan naryad farqini FAKT ga yozadi (mavjud fakt_yoz_v2) va naryadga belgilaydi. Farq — serverda saqlangan `fakt_delta`;
 * operationId = naryad.fakt_operation_id: qayta bosish/tarmoq takrori ikkinchi fakt hujjatini yaratmaydi.
 */
export async function naryadFaktYoz(p: { kompaniyaId: number; naryad: Naryad; sana: string; operationId: string }): Promise<{ ok: boolean; xabar?: string; aktId?: number | null }> {
  const n = p.naryad;
  if (n.holat !== 'qabul') return { ok: false, xabar: 'HOLAT_NOTOGRI' };
  if (n.fakt_holat === 'yozildi') return { ok: true, aktId: n.fakt_akt_id };
  const qatorlar = n.qatorlar.filter((q) => q.qator_id != null && (q.fakt_delta ?? 0) > 0).map((q) => ({ qator_id: q.qator_id as number, hajm: q.fakt_delta as number, izoh: `Naryad ${n.raqam}` }));
  let aktId: number | null = null;
  if (qatorlar.length) {
    const f = await sbFaktYoz({ obyektId: n.obyekt_id, sana: p.sana, qatorlar, izoh: `Naryad ${n.raqam}: ${n.usta_nom}`, operationId: n.fakt_operation_id });
    if (!f.ok) return { ok: false, xabar: f.error ?? f.xabar ?? 'FAKT_YOZILMADI' };
    aktId = f.akt_id ?? null;
  }
  const r = await naryadFaktYozildi({ kompaniyaId: p.kompaniyaId, naryadId: n.id, versiya: n.versiya, operationId: p.operationId, aktId });
  return r.ok ? { ok: true, aktId } : { ok: false, xabar: r.error ?? r.code ?? 'NARYAD_BELGILANMADI' };
}

export type TarixQator = TarixSatr & { qator_id: number | null; kod: string | null; nom: string | null; birlik: string | null; yaratildi: string };

/** Shu kompaniyada shu ish (shifr/qator) uchun oldingi qabul qilingan naryad satrlari: koef va narx tarixi («oltin o'rtalik» tavsiyasi uchun). */
export async function tarixOl(kompaniyaId: number, qatorIdlar: number[], kodlar: string[]): Promise<TarixQator[] | null> {
  const ids = [...new Set(qatorIdlar.filter((x) => Number.isSafeInteger(x) && x > 0))].slice(0, 60);
  const k = [...new Set(kodlar.filter(Boolean))].slice(0, 60);
  if (!ids.length && !k.length) return [];
  const r = await ol<{ qatorlar: TarixQator[] }>(kompaniyaId, 'tarix', { qator_ids: ids, kodlar: k });
  return r ? (r.qatorlar ?? []).map((x) => ({ ...x, usta_narx: son(x.usta_narx), usta_narx_birlik: son(x.usta_narx_birlik), koef: son(x.koef) })) : null;
}
