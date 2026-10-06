/**
 * t2-agent-ish.ts — AI agent ish muhiti klienti. Shlyuz: /api/agent-ish (yoqilgan bo'lsa).
 * kompaniyaId = null → TIZIM (global) doira: faqat platforma superadmini; baza tekshiradi.
 * Bu fayl faqat so'rov yuboradi: ruxsat, tenant chegarasi va model tanlovi serverda.
 */
export type AgentJavob<T> = { ok: true; natija: T } | { ok: false; error: string; code?: string };
type Xom = { ok?: boolean; natija?: unknown; error?: string; code?: string } & Record<string, unknown>;

export type AgentModelQatori = {
  kod: string; nom: string | null; rol: string | null; izoh: string | null; permission_mode: string; default_scope: string;
  model_id: string | null; model_manba: 'kompaniya' | 'platforma' | 'standart';
};
export type ModelKatalogi = { id: string; nom: string; tavsif: string | null; narx_izoh: string | null; vision: boolean };
export type ModellarJavobi = { rol: string; tanlash_mumkin: boolean; agentlar: AgentModelQatori[]; katalog: ModelKatalogi[] };

export type AgentTaklif = {
  id: number; tur: 'qoida' | 'manba' | 'rivojlanish'; doira: 'global' | 'company'; profil_kod: string | null; sarlavha: string;
  mazmun: Record<string, unknown>; dalil: Array<Record<string, unknown>>; holat: 'kutilmoqda' | 'tasdiqlandi' | 'qollandi' | 'rad'; yaratildi: string;
  qaror_izoh: string | null; qaror_vaqt: string | null;
};
export type AgentBuyruq = {
  id: number; taklif_id: number; sarlavha: string; spec: Record<string, unknown>; xavf: 'past' | 'orta' | 'yuqori'; avto_birlashtirish: boolean;
  holat: 'navbat' | 'bajarilmoqda' | 'pr_ochildi' | 'birlashtirildi' | 'muvaffaqiyatsiz' | 'bekor'; ijrochi: string | null; pr_url: string | null;
  github_issue: number | null; jurnal: Array<{ vaqt: string; hodisa: string; izoh?: string | null }>; yaratildi: string; yangilandi: string;
};
export type HarakatIzi = { t: number; tur: 'sahifa' | 'bosish' | 'xato' | 'saqlash' | 'kutish' | 'qidiruv'; nom: string };
export type QadamTaklifi = { taklif: string | null; sabab?: string | null; yol?: string | null; model?: string };

async function chaqir(url: string, init?: RequestInit): Promise<Xom> {
  try {
    const r = await fetch(url, { credentials: 'same-origin', ...init });
    const matn = await r.text();
    try { return JSON.parse(matn) as Xom; } catch { return { ok: false, error: `Server javob bermadi (HTTP ${r.status})` }; }
  } catch (e) { return { ok: false, error: 'Tarmoq: ' + (e instanceof Error ? e.message : String(e)) }; }
}

export async function agentOqi<T>(bolim: string, kompaniyaId: number | null, params: Record<string, string | null | undefined> = {}): Promise<AgentJavob<T>> {
  const q = new URLSearchParams({ bolim });
  if (kompaniyaId != null) q.set('kompaniya_id', String(kompaniyaId));
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
  const d = await chaqir('/api/agent-ish?' + q.toString());
  if (d.ok === false) return { ok: false, error: d.error || 'Xato', code: d.code };
  return { ok: true, natija: d as unknown as T };
}

export async function agentYoz<T = Record<string, unknown>>(amal: string, kompaniyaId: number | null, yuk: Record<string, unknown> = {}): Promise<AgentJavob<T>> {
  const d = await chaqir('/api/agent-ish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amal, ...(kompaniyaId != null ? { kompaniya_id: kompaniyaId } : {}), ...yuk }) });
  if (d.ok === false) return { ok: false, error: d.error || 'Xato', code: d.code };
  return { ok: true, natija: d as unknown as T };
}

export const modellarOl = (k: number | null) => agentOqi<ModellarJavobi>('modellar', k);
export const modelTanla = (k: number | null, profil: string, modelId: string | null) => agentYoz('model_tanla', k, { profil, model_id: modelId });
export const modelKatalogYoz = (p: { id: string; nom: string; tavsif?: string; narxIzoh?: string; vision?: boolean; faol?: boolean }) =>
  agentYoz('model_katalog_yoz', null, { model_id: p.id, nom: p.nom, tavsif: p.tavsif, narx_izoh: p.narxIzoh, vision: p.vision, faol: p.faol });
export const takliflarOl = (k: number | null, holat: string | null = 'kutilmoqda') => agentOqi<{ natija: AgentTaklif[] }>('takliflar', k, { holat });
export const taklifQarori = (k: number | null, taklifId: number, qaror: 'tasdiqlash' | 'rad', izoh?: string, avtoBirlashtirish?: boolean) =>
  agentYoz('taklif_qaror', k, { taklif_id: taklifId, qaror, izoh, avto_birlashtirish: avtoBirlashtirish === true });
export const buyruqlarOl = () => agentOqi<{ natija: AgentBuyruq[] }>('buyruqlar', null);
export const buyruqYubor = (buyruqId: number) => agentYoz<{ issue: number | null; url: string | null }>('buyruq_yubor', null, { buyruq_id: buyruqId });
export const rivojlanishTahlil = () => agentYoz<{ takliflar: number[]; otkazildi: number; xabar?: string }>('rivojlanish_tahlil', null);
export const fikrYubor = (k: number, p: { tur: string; matn: string; sahifa?: string; skrinIds?: number[]; skrinTahlil?: { mimeType: string; data: string } }) =>
  agentYoz<{ fikr_id: number; javob: string | null; ulashildi: boolean }>('fikr', k, { tur: p.tur, matn: p.matn, sahifa: p.sahifa, skrin_ids: p.skrinIds, skrin_tahlil: p.skrinTahlil });
export const qadamTaklifOl = (k: number, sahifa: string, iz: HarakatIzi[]) => agentYoz<QadamTaklifi>('qadam_taklif', k, { sahifa, iz });
