/**
 * Transport turi: kirishni tekshirish — SOF mantiq (tarmoq/DB yo'q). Bir manba: `/api/transport` (UI) va Jarvis vositalari
 * (`src/lib/jarvis/f2-vositalar.ts`) shu funksiyalardan foydalanadi; parallel tekshiruv yo'q.
 * Aktor/kompaniya hech qachon kirishda emas — faqat sessiyadan (server).
 */
export const TRANSPORT_USULLAR = ['foiz', 'tkm', 'narx_ichida'] as const;
export type TransportUsul = (typeof TRANSPORT_USULLAR)[number];

export type YoyGuruh = { material: string; birlik?: string; miqdor?: number; zichlik: number; km: number; hisob_tkm?: number; kodlar?: string[]; nom_pattern?: string };
export type YoyKirish = { obyekt_id: number; rz_id: number; tkm_narx: number; qatorlar: YoyGuruh[]; majburiy: boolean; yoz: boolean };
export type BelgilaKirish = { obyekt_id: number; qator_idlar: number[]; usul: TransportUsul };
export type KirishXato = { xato: string; tafsilot?: string };

export const YOY_MAX_GURUH = 500;
export const BELGILA_MAX_QATOR = 5000;

const butun = (v: unknown): number | null => { const n = typeof v === 'string' && v.trim() ? Number(v) : v; return typeof n === 'number' && Number.isSafeInteger(n) && n > 0 ? n : null; };
const son = (v: unknown): number | null => { const n = typeof v === 'string' && v.trim() ? Number(v.replace(',', '.').replace(/\s/g, '')) : v; return typeof n === 'number' && Number.isFinite(n) ? n : null; };
const matn = (v: unknown, n = 300): string | undefined => { const s = typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : ''; return s ? s.slice(0, n) : undefined; };
const xato = (kod: string, tafsilot?: string): KirishXato => ({ xato: kod, ...(tafsilot ? { tafsilot } : {}) });

export const usulTogrimi = (v: unknown): v is TransportUsul => typeof v === 'string' && (TRANSPORT_USULLAR as readonly string[]).includes(v);

export function belgilaKirish(x: Record<string, unknown>, max = BELGILA_MAX_QATOR): BelgilaKirish | KirishXato {
  const obyekt = butun(x.obyekt_id);
  if (!obyekt) return xato('OBYEKT_KERAK');
  if (!usulTogrimi(x.usul)) return xato('USUL_NOTOGRI', TRANSPORT_USULLAR.join(' | '));
  if (!Array.isArray(x.qator_idlar) || x.qator_idlar.length < 1 || x.qator_idlar.length > max) return xato('QATOR_IDLAR_NOTOGRI', `1..${max} qator`);
  const ids = x.qator_idlar.map(butun);
  if (!ids.every((i): i is number => i != null)) return xato('QATOR_IDLAR_NOTOGRI', 'butun musbat id lar');
  return { obyekt_id: obyekt, qator_idlar: [...new Set(ids)], usul: x.usul };
}

export function yoyKirish(x: Record<string, unknown>, opts: { maxGuruh?: number; yoz?: boolean } = {}): YoyKirish | KirishXato {
  const max = opts.maxGuruh ?? YOY_MAX_GURUH;
  const obyekt = butun(x.obyekt_id); const rz = butun(x.rz_id);
  if (!obyekt) return xato('OBYEKT_KERAK');
  if (!rz) return xato('BOLIM_KERAK', 'rz_id (bo\'lim/uchastka) kerak');
  const narx = son(x.tkm_narx);
  if (narx == null || narx < 0 || narx > 1e12) return xato('TKM_NARX_KERAK', 'tkm_narx ≥ 0 (so\'m, QQS siz); bo\'sh narx 0 deb olinmaydi');
  if (!Array.isArray(x.qatorlar) || x.qatorlar.length < 1 || x.qatorlar.length > max) return xato('QATORLAR_NOTOGRI', `1..${max} guruh`);
  const qatorlar: YoyGuruh[] = [];
  for (const r of x.qatorlar as unknown[]) {
    const o = (r ?? {}) as Record<string, unknown>;
    const material = matn(o.material, 200); const z = son(o.zichlik); const km = son(o.km);
    if (!material || z == null || z <= 0 || km == null || km < 0) return xato('GURUH_NOTOGRI', 'material, zichlik (>0) va km (≥0) kerak');
    const miqdor = o.miqdor == null ? undefined : son(o.miqdor); const hisob = o.hisob_tkm == null ? undefined : son(o.hisob_tkm);
    if ((o.miqdor != null && (miqdor == null || miqdor < 0)) || (o.hisob_tkm != null && (hisob == null || hisob < 0))) return xato('GURUH_NOTOGRI', 'miqdor/hisob_tkm ≥ 0');
    let kodlar: string[] | undefined;
    if (o.kodlar != null) {
      if (!Array.isArray(o.kodlar) || o.kodlar.length > 100) return xato('GURUH_NOTOGRI', 'kodlar ≤ 100');
      kodlar = (o.kodlar as unknown[]).map((k) => matn(k, 60)).filter((k): k is string => !!k);
    }
    const pattern = matn(o.nom_pattern, 120);
    if (!kodlar?.length && !pattern) return xato('GURUH_NOTOGRI', `«${material.slice(0, 40)}»: kodlar yoki nom_pattern kerak`);
    qatorlar.push({ material, ...(matn(o.birlik, 20) ? { birlik: matn(o.birlik, 20) } : {}), ...(miqdor != null ? { miqdor } : {}), zichlik: z, km,
      ...(hisob != null ? { hisob_tkm: hisob } : {}), ...(kodlar?.length ? { kodlar } : {}), ...(pattern ? { nom_pattern: pattern } : {}) });
  }
  return { obyekt_id: obyekt, rz_id: rz, tkm_narx: narx, qatorlar, majburiy: x.majburiy === true, yoz: opts.yoz ?? x.yoz === true };
}

export const kirishXatomi = (v: unknown): v is KirishXato => !!v && typeof v === 'object' && 'xato' in (v as object);

/** RPC `t2_qator_transport_yoy_v1` ning (sessiyadan aktor qo'yiladigan) yuki. */
export const yoyRpcYuki = (k: YoyKirish, aktorId: number): Record<string, unknown> => ({
  p_actor_id: aktorId, p_obyekt_id: k.obyekt_id, p_rz_id: k.rz_id, p_tkm_narx: k.tkm_narx, p_qatorlar: k.qatorlar, p_majburiy: k.majburiy, p_yoz: k.yoz,
});
export const belgilaRpcYuki = (k: BelgilaKirish, aktorId: number): Record<string, unknown> => ({
  p_actor_id: aktorId, p_obyekt_id: k.obyekt_id, p_qator_idlar: k.qator_idlar, p_usul: k.usul,
});
export const auditRpcYuki = (obyektId: number, aktorId: number): Record<string, unknown> => ({ p_actor_id: aktorId, p_obyekt_id: obyektId });
