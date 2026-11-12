/**
 * Direktor pulti (V3): bitta ekran, 6 plitka. O'qish: /api/sb `rahbar_pult_v1` (stable, a'zolik + financial.read).
 * Javob — `t2_rahbar_pult_v1`: panelning «tayyor hisoblar» (t2_obyekt_kesh) orqali tez natijasidan yig'ilgan qisqa ko'rinish.
 * Summalar — yagona summa paketi (QQS bilan · ustamali · ustamasiz). Kiritilmagan qiymat — null («—»), 0 emas. Bu yerda hisob YO'Q.
 */
import { useQuery } from '@tanstack/react-query';
import { vaqtliOqish } from './vaqtli-fetch';
import { summaPaket, type SummaPaket } from '../lib/summa-paket';

export type PultXavfli = {
  obyekt_id: number; nom: string; kritik: number; signal_soni: number; sabablar: string[];
  qarz: number | null; f2_qqs_bilan: number | null;
};

export type RahbarPult = {
  ok: true; generated_at: string;
  oy: { oy: string; dan: string; gacha: string };
  portfel: {
    obyekt_soni: number; shartnoma_qqs_bilan: number | null; shartnoma_soni: number;
    smeta: SummaPaket | null; f2_jami: SummaPaket | null; foiz_shartnoma: number | null;
  };
  bajarildi_oy: { paket: SummaPaket | null; akt_soni: number };
  hujjat: {
    f2_tasdiqlangan: number; f2_qoralama: number; f2_tekshiruvda: number;
    f3_soni: number; f3_chiqarilmagan: number; f3_chiqarilmagan_summa: number | null;
  };
  qarz: {
    debitor: { qiymat: number | null; hujjatlangan: number | null; tolangan: number | null; yosh: { k0_30: number; k30_60: number; k60: number } | null; manbalar_yoq?: string[] };
    tolandi: { jami: number | null; yozuv_soni: number };
  };
  kechikkan: {
    predpisaniya: { ochiq: number; kechikkan: number };
    topshiriq: { ochiq: number; kechikkan: number };
  };
  xavfli: PultXavfli[];
  kesh: { obyekt_soni: number; toza_soni: number; eng_eski: string | null };
};

const obyektmi = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const son = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) ? x : 0);
const sonYoki = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);

/** Server javobini tekshiradi: buzuq paket → null, yo'q son → 0 (sanoq) yoki null (pul). */
export function rahbarPultTozala(x: Record<string, unknown>): RahbarPult {
  const g = (k: string): Record<string, unknown> => (obyektmi(x[k]) ? (x[k] as Record<string, unknown>) : {});
  const por = g('portfel'), baj = g('bajarildi_oy'), huj = g('hujjat'), qarz = g('qarz'), kech = g('kechikkan'), kesh = g('kesh');
  const deb = obyektmi(qarz.debitor) ? qarz.debitor : {};
  const tol = obyektmi(qarz.tolandi) ? qarz.tolandi : {};
  const yosh = obyektmi(deb.yosh) ? deb.yosh : null;
  const juft = (v: unknown) => { const o = obyektmi(v) ? v : {}; return { ochiq: son(o.ochiq), kechikkan: son(o.kechikkan) }; };
  return {
    ok: true,
    generated_at: typeof x.generated_at === 'string' ? x.generated_at : '',
    oy: { oy: '', dan: '', gacha: '', ...(g('oy') as object) } as RahbarPult['oy'],
    portfel: {
      obyekt_soni: son(por.obyekt_soni), shartnoma_qqs_bilan: sonYoki(por.shartnoma_qqs_bilan), shartnoma_soni: son(por.shartnoma_soni),
      smeta: summaPaket(por.smeta), f2_jami: summaPaket(por.f2_jami), foiz_shartnoma: sonYoki(por.foiz_shartnoma),
    },
    bajarildi_oy: { paket: summaPaket(baj.paket), akt_soni: son(baj.akt_soni) },
    hujjat: {
      f2_tasdiqlangan: son(huj.f2_tasdiqlangan), f2_qoralama: son(huj.f2_qoralama), f2_tekshiruvda: son(huj.f2_tekshiruvda),
      f3_soni: son(huj.f3_soni), f3_chiqarilmagan: son(huj.f3_chiqarilmagan), f3_chiqarilmagan_summa: sonYoki(huj.f3_chiqarilmagan_summa),
    },
    qarz: {
      debitor: {
        qiymat: sonYoki(deb.qiymat), hujjatlangan: sonYoki(deb.hujjatlangan), tolangan: sonYoki(deb.tolangan),
        yosh: yosh ? { k0_30: son(yosh.k0_30), k30_60: son(yosh.k30_60), k60: son(yosh.k60) } : null,
        manbalar_yoq: Array.isArray(deb.manbalar_yoq) ? deb.manbalar_yoq.map(String) : [],
      },
      tolandi: { jami: sonYoki(tol.jami), yozuv_soni: son(tol.yozuv_soni) },
    },
    kechikkan: { predpisaniya: juft(kech.predpisaniya), topshiriq: juft(kech.topshiriq) },
    xavfli: (Array.isArray(x.xavfli) ? x.xavfli.filter(obyektmi) : []).map((o) => ({
      obyekt_id: son(o.obyekt_id), nom: typeof o.nom === 'string' ? o.nom : '—', kritik: son(o.kritik), signal_soni: son(o.signal_soni),
      sabablar: Array.isArray(o.sabablar) ? o.sabablar.map(String) : [], qarz: sonYoki(o.qarz), f2_qqs_bilan: sonYoki(o.f2_qqs_bilan),
    })),
    kesh: { obyekt_soni: son(kesh.obyekt_soni), toza_soni: son(kesh.toza_soni), eng_eski: typeof kesh.eng_eski === 'string' ? kesh.eng_eski : null },
  };
}

export async function rahbarPultOl(kompaniyaId: number): Promise<{ ok: true; natija: RahbarPult } | { ok: false; error: string; code?: string }> {
  try {
    const r = await vaqtliOqish('/api/sb', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ soro: 'rahbar_pult_v1', kompaniya_id: kompaniyaId }),
    });
    const j = await r.json() as { ok: boolean; natija?: Record<string, unknown>; error?: string };
    if (!j.ok || !obyektmi(j.natija)) return { ok: false, error: j.error || 'Direktor pultini o‘qib bo‘lmadi.' };
    if (j.natija.ok !== true) return { ok: false, error: 'Direktor pultini o‘qib bo‘lmadi.', code: typeof j.natija.code === 'string' ? j.natija.code : undefined };
    return { ok: true, natija: rahbarPultTozala(j.natija) };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'Tarmoq xatosi' }; }
}

export function useRahbarPult(kompaniyaId: number | null | undefined) {
  return useQuery({
    queryKey: ['rahbar-pult-v1', kompaniyaId], enabled: kompaniyaId != null, staleTime: 60_000, retry: 1,
    queryFn: async () => {
      const r = await rahbarPultOl(kompaniyaId as number);
      if (!r.ok) throw new Error(r.error);
      return r.natija;
    },
  });
}
