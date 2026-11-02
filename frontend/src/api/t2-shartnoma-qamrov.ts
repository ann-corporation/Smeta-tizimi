/**
 * Shartnoma qamrovi — mavjud t2_qator ustidagi contract-specific qaror.
 *
 * Bu modul yangi smeta truth yaratmaydi: qatorning o'zi t2_qator'da qoladi,
 * bu yerda faqat shartnoma uni hisobga oladimi va zarur bo'lsa shartnomaviy
 * hajm override'i bormi, shu saqlanadi.
 */
import { vaqtliOqish } from './vaqtli-fetch';
import { yangiOperationId } from './supabase';

export type ShartnomaQamrovQatori = {
  qator_id: number;
  obyekt_id: number;
  obyekt_nom: string;
  tur: string;
  kod: string | null;
  nom: string | null;
  birlik: string | null;
  hajm: number | null;
  narx: number | null;
  summa: number | null;
  kat: string | null;
  ota_id: number | null;
  daraja: number;
  tartib: number;
  qoshimcha: boolean;
  zamena: boolean;
  qator_versiya: number;
  holat: 'kiritilgan' | 'chiqarilgan';
  qamrov_id: number | null;
  hajm_override: number | null;
  sabab: string | null;
  dalil_hujjat_id: number | null;
  qamrov_versiya: number | null;
  amalda_qamrovda: boolean;
  hisobga_kiradi: boolean;
  summa_amaldagi: number | null;
};

export type ShartnomaQamrovNatija = {
  ok: boolean;
  code?: string;
  error?: string;
  shartnoma_id?: number;
  kompaniya_id?: number;
  qatorlar?: ShartnomaQamrovQatori[];
  summary?: {
    qator_soni: number;
    qamrovda: number;
    chiqarilgan: number;
    hisobga_kiradigan: number;
    jami: number | null;
    jami_noaniq: number;
  };
};

async function soro(body: Record<string, unknown>): Promise<{ ok: boolean; natija?: ShartnomaQamrovNatija; error?: string }> {
  try {
    const r = await vaqtliOqish('/api/sb', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    return await r.json();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function t2ShartnomaQamrovOl(shartnomaId: number): Promise<ShartnomaQamrovNatija> {
  const r = await soro({ soro: 'shartnoma_qamrov_ol_v1', shartnoma_id: shartnomaId });
  if (!r.ok || !r.natija || r.natija.ok !== true) {
    return { ok: false, code: r.natija?.code, error: r.error || r.natija?.error || 'Shartnoma qamrovi o\'qilmadi' };
  }
  return r.natija;
}

export async function t2ShartnomaQamrovSaqla(p: {
  kompaniyaId: number;
  shartnomaId: number;
  obyektId: number;
  qatorId: number;
  holat: 'kiritilgan' | 'chiqarilgan';
  hajmOverride?: number | null;
  sabab: string;
  dalilHujjatId?: number | null;
  kutilganVersiya: number;
  operationId?: string;
}): Promise<ShartnomaQamrovNatija> {
  try {
    const r = await fetch('/api/sb-yoz', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amal: 'shartnoma_qamrov_saqla', kompaniya_id: p.kompaniyaId,
        shartnoma_id: p.shartnomaId, obyekt_id: p.obyektId, qator_id: p.qatorId,
        holat: p.holat, hajm_override: p.hajmOverride ?? null, sabab: p.sabab,
        dalil_hujjat_id: p.dalilHujjatId ?? null, kutilgan_versiya: p.kutilganVersiya,
        operation_id: p.operationId || yangiOperationId(),
      }),
    });
    return await r.json();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
