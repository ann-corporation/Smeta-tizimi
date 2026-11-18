/**
 * F2 portfeli (shartnoma / obyekt bo'yicha barcha F2) вЂ” tez yo'l. O'qish: /api/sb `f2_portfel_v1` (bitta so'rov: obyektlar, aktlar,
 * jamilar) va `f2_portfel_summa_v1` (aktlarning O'Z summa paketi). Barcha summa SERVER yadrosidan (`_t2_summa_paket_v1`);
 * brauzerda hisob yo'q вЂ” smeta va F2 tafsilotlari portfel ochilganda o'qilmaydi.
 */
import { vaqtliOqish } from './vaqtli-fetch';
import { summaPaket, type SummaPaket } from '../lib/summa-paket';

export type PortfelHolat = 'tasdiqlangan' | 'qoralama' | 'bekor';
export type PortfelAktQator = {
  id: number; obyekt_id: number; obyekt_nom: string; raqam: string | null; oy: string; sana: string | null;
  holat: PortfelHolat; versiya: number; lifecycle_status: string | null; hujjat_jami: number | null; forma3_id: number | null; manba: string | null;
};
export type PortfelObyektQator = {
  id: number; nom: string; tasdiqlangan_soni: number; qoralama_soni: number; bekor_soni: number;
  f2: SummaPaket | null; f2_qoralama: SummaPaket | null;
};
export type PortfelJavob = {
  shartnoma: { id: number; raqam: string | null; nom: string | null; jami_nds_bilan: number | null } | null;
  jami: { tasdiqlangan: SummaPaket | null; qoralama: SummaPaket | null; hammasi: SummaPaket | null };
  soni: { tasdiqlangan: number; qoralama: number; bekor: number; jami: number };
  obyektlar: PortfelObyektQator[];
  aktlar: PortfelAktQator[];
  sahifa: { limit: number; offset: number; jami: number; yana_bor: boolean };
};
export type PortfelSorov = {
  kompaniyaId: number; shartnomaId?: number | null; obyektId?: number | null;
  oyDan?: string | null; oyGacha?: string | null; holat?: PortfelHolat | null; limit?: number; offset?: number;
};

const obyektmi = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const son = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const sonYoki = (v: unknown): number | null => (v == null || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);

async function oqi(soro: Record<string, unknown>): Promise<Record<string, unknown>> {
  const r = await vaqtliOqish('/api/sb', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(soro) });
  const j = await r.json() as { ok: boolean; natija?: unknown; error?: string };
  if (!j.ok || !obyektmi(j.natija)) throw new Error(j.error || 'F2 portfelini oвЂqib boвЂlmadi.');
  if (j.natija.ok !== true) throw new Error(typeof j.natija.code === 'string' ? j.natija.code : 'F2 portfelini oвЂqib boвЂlmadi.');
  return j.natija;
}

/** Portfel jadvali вЂ” BITTA so'rov (obyektlar в†’ aktlar в†’ jamilar), sahifalangan. */
export async function portfelOl(p: PortfelSorov): Promise<PortfelJavob> {
  const n = await oqi({
    soro: 'f2_portfel_v1', kompaniya_id: p.kompaniyaId,
    ...(p.shartnomaId ? { shartnoma_id: p.shartnomaId } : {}), ...(p.obyektId ? { obyekt_id: p.obyektId } : {}),
    ...(p.oyDan ? { oy_dan: p.oyDan } : {}), ...(p.oyGacha ? { oy_gacha: p.oyGacha } : {}),
    ...(p.holat ? { holat: p.holat } : {}), ...(p.limit ? { limit: p.limit } : {}), ...(p.offset ? { offset: p.offset } : {}),
  });
  const ro = (x: unknown): Record<string, unknown>[] => (Array.isArray(x) ? x.filter(obyektmi) : []);
  const jami = obyektmi(n.jami) ? n.jami : {};
  const soni = obyektmi(n.soni) ? n.soni : {};
  const sah = obyektmi(n.sahifa) ? n.sahifa : {};
  const sh = obyektmi(n.shartnoma) ? n.shartnoma : null;
  return {
    shartnoma: sh ? { id: son(sh.id), raqam: (sh.raqam as string | null) ?? null, nom: (sh.nom as string | null) ?? null, jami_nds_bilan: sonYoki(sh.jami_nds_bilan) } : null,
    jami: { tasdiqlangan: summaPaket(jami.tasdiqlangan), qoralama: summaPaket(jami.qoralama), hammasi: summaPaket(jami.hammasi) },
    soni: { tasdiqlangan: son(soni.tasdiqlangan), qoralama: son(soni.qoralama), bekor: son(soni.bekor), jami: son(soni.jami) },
    obyektlar: ro(n.obyektlar).map((o) => ({
      id: son(o.id), nom: String(o.nom ?? ''), tasdiqlangan_soni: son(o.tasdiqlangan_soni), qoralama_soni: son(o.qoralama_soni), bekor_soni: son(o.bekor_soni),
      f2: summaPaket(o.f2), f2_qoralama: summaPaket(o.f2_qoralama),
    })),
    aktlar: ro(n.aktlar).map((a) => ({
      id: son(a.id), obyekt_id: son(a.obyekt_id), obyekt_nom: String(a.obyekt_nom ?? ''), raqam: (a.raqam as string | null) ?? null, oy: String(a.oy ?? ''),
      sana: (a.sana as string | null) ?? null, holat: a.holat as PortfelHolat, versiya: son(a.versiya), lifecycle_status: (a.lifecycle_status as string | null) ?? null,
      hujjat_jami: sonYoki(a.hujjat_jami), forma3_id: sonYoki(a.forma3_id), manba: (a.manba as string | null) ?? null,
    })),
    sahifa: { limit: son(sah.limit), offset: son(sah.offset), jami: son(sah.jami), yana_bor: sah.yana_bor === true },
  };
}

/** Aktlarning o'z summa paketi (yadro). 1вЂ“12 akt; chaqiruvchi bo'laklab parallel yuboradi. */
export async function aktSummalarOl(kompaniyaId: number, aktIdlar: readonly number[]): Promise<Map<number, SummaPaket | null>> {
  const n = await oqi({ soro: 'f2_portfel_summa_v1', kompaniya_id: kompaniyaId, akt_idlar: [...aktIdlar] });
  const out = new Map<number, SummaPaket | null>();
  for (const a of Array.isArray(n.aktlar) ? n.aktlar : []) if (obyektmi(a)) out.set(son(a.id), summaPaket(a.paket));
  return out;
}

/** Barcha sahifalarni o'qiydi (paket yuklab olish uchun: akt idlar ro'yxati). */
export async function portfelBarchaAktlar(p: PortfelSorov): Promise<PortfelAktQator[]> {
  const out: PortfelAktQator[] = [];
  for (let offset = 0; offset < 100000; offset += 500) {
    const j = await portfelOl({ ...p, limit: 500, offset });
    out.push(...j.aktlar);
    if (!j.sahifa.yana_bor) break;
  }
  return out;
}

/** Bo'laklab (в‰¤ `bolak` ta) `n` ta parallel so'rov; har bo'lak tayyor bo'lganda `tayyor` chaqiriladi (jarayon ko'rsatkichi uchun). */
export async function aktSummalarParallel(
  kompaniyaId: number, aktIdlar: readonly number[], tayyor: (xarita: Map<number, SummaPaket | null>, bajarildi: number) => void,
  { bolak = 3, parallel = 4 }: { bolak?: number; parallel?: number } = {},
): Promise<void> {
  const bolaklar: number[][] = [];
  for (let i = 0; i < aktIdlar.length; i += bolak) bolaklar.push(aktIdlar.slice(i, i + bolak) as number[]);
  let k = 0; let bajarildi = 0;
  await Promise.all(Array.from({ length: Math.min(parallel, bolaklar.length) }, async () => {
    while (k < bolaklar.length) {
      const b = bolaklar[k++];
      let x: Map<number, SummaPaket | null>;
      try { x = await aktSummalarOl(kompaniyaId, b); } catch { x = new Map(b.map((id) => [id, null] as const)); }
      for (const id of b) if (!x.has(id)) x.set(id, null);
      bajarildi += b.length;
      tayyor(x, bajarildi);
    }
  }));
}
