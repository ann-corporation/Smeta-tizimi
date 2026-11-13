/**
 * O'rganish halqasi (migratsiya 20261217400000) — transport qatlami.
 * O'qish: /api/sb `osuvchi_ol_v1` (kompaniya) va `osuvchi_platforma_ol_v1` (platforma egasi, anonim).
 * Yozish: /api/sb-yoz `osuvchi_yoz_v1` (idempotent operation_id; ruxsat shlyuzda dinamik, RPC ichida yana tekshiriladi).
 */
import { vaqtliOqish } from './vaqtli-fetch';
import { yangiOperationId, yozAmali, type AktNatija } from './supabase';

export type Daraja = 'user' | 'kompaniya' | 'tizim';
export type TajribaTaklifJavob = { daraja: Daraja | null; qiymat?: string; tasdiq?: number; rad?: number; foydalanuvchi_soni?: number };
export type TajribaQator = { id: number; domen: string; kalit: string; qiymat: string; tasdiq: number; rad: number; oxirgi: string };
export type FriksiyaQator = {
  sahifa: string; amal: string; boshlandi: number; tugadi: number; tashlandi: number; xato: number; nol_qidiruv: number;
  odam: number; nuqson: number; ball: number; top_kod: string | null; top_hodisa: string | null; dori: 'dars' | 'default' | 'ui' | 'funksiya';
};
export type TizimTaklif = { id: number; tur: 'tajriba' | 'friksiya'; domen: string; kalit: string; qiymat: string; dalil: Record<string, unknown>; holat: 'yangi' | 'qabul' | 'rad' | 'keyin'; yaratildi: string };

type Javob<T> = { ok: boolean; code?: string } & T;

async function oqi<T>(body: Record<string, unknown>): Promise<Javob<T> | null> {
  try {
    const r = await vaqtliOqish('/api/sb', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json() as { ok: boolean; natija?: Javob<T> };
    return j.ok && j.natija?.ok ? j.natija : null;
  } catch { return null; }
}

export const osuvchiTaklifOl = (kompaniyaId: number, domen: string, kalit: string) =>
  oqi<{ taklif: TajribaTaklifJavob }>({ soro: 'osuvchi_ol_v1', kompaniya_id: kompaniyaId, bolim: 'taklif', filtr: { domen, kalit } }).then((r) => r?.taklif ?? null);
export const osuvchiMeningOl = (kompaniyaId: number) =>
  oqi<{ royxat: TajribaQator[] }>({ soro: 'osuvchi_ol_v1', kompaniya_id: kompaniyaId, bolim: 'mening', filtr: {} }).then((r) => r?.royxat ?? null);
export const osuvchiSozlamaOl = (kompaniyaId: number) =>
  oqi<{ oqish: boolean; hissa: boolean }>({ soro: 'osuvchi_ol_v1', kompaniya_id: kompaniyaId, bolim: 'sozlama', filtr: {} }).then((r) => (r ? { oqish: r.oqish, hissa: r.hissa } : null));
export const osuvchiFriksiyaOl = (kompaniyaId: number) =>
  oqi<{ royxat: FriksiyaQator[] }>({ soro: 'osuvchi_ol_v1', kompaniya_id: kompaniyaId, bolim: 'friksiya', filtr: {} }).then((r) => r?.royxat ?? null);
export const osuvchiPlatformaFriksiyaOl = () =>
  oqi<{ royxat: FriksiyaQator[] }>({ soro: 'osuvchi_platforma_ol_v1', bolim: 'friksiya', filtr: {} }).then((r) => r?.royxat ?? null);
export const osuvchiPlatformaTakliflarOl = () =>
  oqi<{ royxat: TizimTaklif[] }>({ soro: 'osuvchi_platforma_ol_v1', bolim: 'taklif', filtr: {} }).then((r) => r?.royxat ?? null);
export const osuvchiPlatformaHaftaOl = () =>
  oqi<{ yangi_tajriba: number; yangi_friksiya: number; bu_hafta: Record<string, number>; tizim_qoidalari: number; hajm_bayt: number }>({ soro: 'osuvchi_platforma_ol_v1', bolim: 'hafta', filtr: {} });

export type OsuvchiYozNatija = AktNatija & { code?: string; taklif?: TajribaTaklifJavob; ochirildi?: number; otkazildi?: boolean; qabul?: number; tolib_toshdi?: number };

export function osuvchiYoz(p: { kompaniyaId: number; amal: 'tajriba_yoz' | 'tajriba_unut' | 'sozlama_saqla' | 'friksiya_yubor' | 'taklif_yigish' | 'taklif_qaror'; yuk: Record<string, unknown>; operationId?: string }): Promise<OsuvchiYozNatija> {
  return yozAmali({ amal: 'osuvchi_yoz_v1', kompaniya_id: p.kompaniyaId, osuvchi_amal: p.amal, operation_id: p.operationId ?? yangiOperationId(), yuk: p.yuk }) as Promise<OsuvchiYozNatija>;
}
