/**
 * Rahbar paneli (issue #195, egasi 2026-10-29). O'qish: /api/sb `rahbar_panel_v1` (stable, a'zolik + financial.read).
 * Javob — `t2_rahbar_panel_v1`: §1 kartalar, §2 pul oqimi, §3 obyektlar matritsasi, §4 diqqat (top-10), §5 tasdiq navbati.
 * Summalar — yagona summa paketi (lib/summa-paket). Kiritilmagan qiymat — null (UI «kiritilmagan»), 0 emas.
 */
import { useQuery } from '@tanstack/react-query';
import { vaqtliOqish } from './vaqtli-fetch';
import { ogirYuklashKut } from './ogir-sorov-navbat';
import { summaPaket, type SummaPaket } from '../lib/summa-paket';

export type ManbaYoq = string[];

export type RahbarKartalar = {
  portfel: { shartnoma_qqs_bilan: number | null; shartnoma_soni: number; smeta: SummaPaket | null };
  bajarildi: {
    davr: SummaPaket | null; jami: SummaPaket | null; akt_soni: number;
    foiz_smeta: number | null; foiz_shartnoma: number | null;
    /** Qo'lda reestr — MANBA EMAS, faqat «tizim ↔ reestr» farqi. */
    reestr: { qqs_bilan: number; soni: number; farq: number } | null;
  };
  tolandi: { davr: number | null; jami: number | null; yozuv_soni: number; manbalar_yoq: ManbaYoq };
  debitor: {
    qiymat: number | null; hujjatlangan: number | null; tolangan: number | null;
    yosh: { k0_30: number; k30_60: number; k60: number } | null; asos: string; manbalar_yoq: ManbaYoq;
  };
  kreditor: { qiymat: number | null; manbalar_yoq: ManbaYoq };
  rentabellik: { daromad: number | null; tannarx: number | null; marja: number | null; foiz: number | null; manbalar_yoq: ManbaYoq };
};

export type RahbarOy = { oy: string; bajarildi: number; tolov: number | null; xarajat: number | null };

export type RahbarObyekt = {
  obyekt_id: number; nom: string; holat: string | null; loyiha_id: number | null; loyiha_nom: string | null;
  shartnoma: { id: number; raqam: string | null; qqs_bilan: number | null; umumiy: boolean } | null;
  smeta: SummaPaket | null; fakt: SummaPaket | null; f2: SummaPaket | null;
  f2_qoralama: { qqs_bilan: number | null; ustamali: number | null; soni: number };
  f3: { sotuv: number | null; soni: number } | null;
  tolangan: number | null; tolangan_foiz: number | null; qarz: number | null; marja_foiz: number | null;
  bajarilish: { fakt: number | null; f2: number | null; f3: number | null };
  signal: { soni: number; kritik: number; eng_kop: string | null };
};

export type DiqqatKod =
  | 'fakt_topshirilmagan' | 'f2_faktdan_oshgan' | 'smetadan_oshgan' | 'f3_chiqarilmagan' | 'shartnoma_limit'
  | 'tolov_kechikkan' | 'reestr_farq' | 'narxsiz' | 'sklad_manfiy';
export type RahbarDiqqat = { kod: DiqqatKod | string; obyekt_id: number | null; nom: string | null; summa_tasir: number | null; soni: number | null };

export type RahbarTasdiq = {
  tur: 'f2' | 'zayavka' | string; id: number; obyekt_id: number | null; nom: string | null;
  bosqich: string | null; summa: number | null; qachondan: string | null; kim: string | number | null;
};

export type RahbarSignalGuruh = { signal_type: string; soni: number; kritik: number; obyektlar: Array<{ obyekt_id: number; soni: number }> };

export type RahbarPanel = {
  ok: true; generated_at: string; versiya: number;
  davr: { dan: string | null; gacha: string | null };
  qamrov: { kompaniya_id: number; obyekt_id: number | null; obyekt_soni: number };
  kartalar: RahbarKartalar;
  fakt: SummaPaket | null; f2_qoralama: SummaPaket | null;
  pul_oqimi: {
    oylar: RahbarOy[];
    prognoz: { kun: number; qoralama_f2: number | null; tolanmagan_f2: number | null; kutilayotgan: number | null; majburiyatlar: number | null; manbalar_yoq: ManbaYoq };
  };
  obyektlar: RahbarObyekt[];
  diqqat: RahbarDiqqat[];
  tasdiq_kutmoqda: RahbarTasdiq[];
  signal_guruh: RahbarSignalGuruh[];
  shartnomalar: Array<{ id: number; raqam: string | null; nom: string | null; qqs_bilan: number | null; obyektlar: number[]; f2_qqs_bilan: number | null; tolangan: number | null }>;
};

const obyektmi = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const ro = <T,>(a: unknown): T[] => (Array.isArray(a) ? a.filter(obyektmi) : []) as T[];

/** Server javobidagi paketlarni tekshiradi (buzuq paket → null) va massivlarni xavfsiz qiladi. */
export function rahbarPanelTozala(x: Record<string, unknown>): RahbarPanel {
  const k = (obyektmi(x.kartalar) ? x.kartalar : {}) as Record<string, Record<string, unknown>>;
  const portfel = obyektmi(k.portfel) ? k.portfel : {};
  const baj = obyektmi(k.bajarildi) ? k.bajarildi : {};
  const kartalar = {
    ...k,
    portfel: { ...portfel, smeta: summaPaket(portfel.smeta) },
    bajarildi: { ...baj, davr: summaPaket(baj.davr), jami: summaPaket(baj.jami) },
  } as unknown as RahbarKartalar;
  const pul = (obyektmi(x.pul_oqimi) ? x.pul_oqimi : {}) as Record<string, unknown>;
  const obyektlar = ro<Record<string, unknown>>(x.obyektlar).map((o) => ({
    ...o, smeta: summaPaket(o.smeta), fakt: summaPaket(o.fakt), f2: summaPaket(o.f2),
  })) as unknown as RahbarObyekt[];
  return {
    ...(x as unknown as RahbarPanel),
    kartalar,
    fakt: summaPaket(x.fakt),
    f2_qoralama: summaPaket(x.f2_qoralama),
    pul_oqimi: { ...(pul as unknown as RahbarPanel['pul_oqimi']), oylar: ro<RahbarOy>(pul.oylar) },
    obyektlar,
    diqqat: ro<RahbarDiqqat>(x.diqqat),
    tasdiq_kutmoqda: ro<RahbarTasdiq>(x.tasdiq_kutmoqda),
    signal_guruh: ro<RahbarSignalGuruh>(x.signal_guruh),
    shartnomalar: ro(x.shartnomalar),
  };
}

export async function rahbarPanelOl(p: {
  kompaniyaId: number; obyektId?: number | null; davrDan?: string | null; davrGacha?: string | null;
}): Promise<{ ok: true; natija: RahbarPanel } | { ok: false; error: string; code?: string }> {
  try {
    await ogirYuklashKut();
    const r = await vaqtliOqish('/api/sb', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        soro: 'rahbar_panel_v1', kompaniya_id: p.kompaniyaId,
        ...(p.obyektId ? { obyekt_id: p.obyektId } : {}),
        ...(p.davrDan ? { davr_dan: p.davrDan } : {}),
        ...(p.davrGacha ? { davr_gacha: p.davrGacha } : {}),
      }),
    });
    const j = await r.json() as { ok: boolean; natija?: Record<string, unknown>; error?: string };
    if (!j.ok || !obyektmi(j.natija)) return { ok: false, error: j.error || 'Rahbar panelini o‘qib bo‘lmadi.' };
    if (j.natija.ok !== true) return { ok: false, error: 'Rahbar panelini o‘qib bo‘lmadi.', code: typeof j.natija.code === 'string' ? j.natija.code : undefined };
    return { ok: true, natija: rahbarPanelTozala(j.natija) };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'Tarmoq xatosi' }; }
}

/** Rahbar paneli server paketi (F2 uchligi uchun): xato bo‘lsa `data` undefined — UI «hisoblanmadi» deydi (0 emas). */
export function useRahbarPanel(kompaniyaId: number | null | undefined) {
  return useQuery({
    queryKey: ['rahbar-panel-v1', kompaniyaId], enabled: kompaniyaId != null, staleTime: 60_000, retry: 1,
    queryFn: async () => { const r = await rahbarPanelOl({ kompaniyaId: kompaniyaId as number }); if (!r.ok) throw new Error(r.error); return r.natija; },
  });
}
