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
export type ModelKatalogi = { id: string; nom: string; tavsif: string | null; narx_izoh: string | null; vision: boolean; narx_kirish_usd?: number | null; narx_chiqish_usd?: number | null };
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
export const modelKatalogYoz = (p: { id: string; nom: string; tavsif?: string; narxIzoh?: string; vision?: boolean; faol?: boolean; narxKirishUsd?: number | null; narxChiqishUsd?: number | null }) =>
  agentYoz('model_katalog_yoz', null, { model_id: p.id, nom: p.nom, tavsif: p.tavsif, narx_izoh: p.narxIzoh, vision: p.vision, faol: p.faol, narx_kirish_usd: p.narxKirishUsd, narx_chiqish_usd: p.narxChiqishUsd });
export const takliflarOl = (k: number | null, holat: string | null = 'kutilmoqda') => agentOqi<{ natija: AgentTaklif[] }>('takliflar', k, { holat });
export const taklifQarori = (k: number | null, taklifId: number, qaror: 'tasdiqlash' | 'rad', izoh?: string, avtoBirlashtirish?: boolean) =>
  agentYoz('taklif_qaror', k, { taklif_id: taklifId, qaror, izoh, avto_birlashtirish: avtoBirlashtirish === true });
export const buyruqlarOl = () => agentOqi<{ natija: AgentBuyruq[] }>('buyruqlar', null);
export const buyruqYubor = (buyruqId: number) => agentYoz<{ issue: number | null; url: string | null }>('buyruq_yubor', null, { buyruq_id: buyruqId });
export const rivojlanishTahlil = () => agentYoz<{ takliflar: number[]; otkazildi: number; xabar?: string }>('rivojlanish_tahlil', null);
export const fikrYubor = (k: number, p: { tur: string; matn: string; sahifa?: string; skrinIds?: number[]; skrinTahlil?: { mimeType: string; data: string } }) =>
  agentYoz<{ fikr_id: number; javob: string | null; ulashildi: boolean }>('fikr', k, { tur: p.tur, matn: p.matn, sahifa: p.sahifa, skrin_ids: p.skrinIds, skrin_tahlil: p.skrinTahlil });
export const qadamTaklifOl = (k: number, sahifa: string, iz: HarakatIzi[]) => agentYoz<QadamTaklifi>('qadam_taklif', k, { sahifa, iz });

export type MarkazSonlar = {
  taklif_kutilmoqda: number; buyruq_navbat: number; buyruq_ishda: number; buyruq_bitgan: number; signal_yangi: number; fikr_30kun: number;
  qoida_faol: number; manba_faol: number; agent_soni: number; model_soni: number;
};
export type KunSarfi = { kun: string; narx_usd: number; chaqiruv: number };
export type Markaz = {
  oy_sarfi_usd: number; limit_usd: number | null; ogohlantirish_foiz: number | null; limit_faol: boolean;
  kunlar: KunSarfi[]; agentlar: Array<{ profil: string; amal: string; chaqiruv: number; narx_usd: number; token: number }>;
  modellar: Array<{ model: string; chaqiruv: number; narx_usd: number; narxsiz: number }>;
  kompaniyalar: Array<{ kompaniya_id: number | null; nom: string | null; narx_usd: number; mijoz_usd: number; token: number; chaqiruv: number; limit_usd: number | null; ustama_foiz: number }>;
  ustama_foiz: number; mijoz_oy_usd: number; foyda_oy_usd: number;
  sonlar: MarkazSonlar; sozlama: { ai_yoqilgan: boolean; openrouter: boolean; github: boolean };
};
/** Kompaniya faqat TOKEN sarfini ko'radi (tannarx va ustama yo'q). */
export type SarfHisoboti = { oy_token: number; balans: number; agentlar: Array<{ profil: string; chaqiruv: number; token: number }>; kunlar: Array<{ kun: string; token: number; chaqiruv: number }> };
export type KompaniyaSozlama = { ai_yoqilgan: boolean; oylik_token_limit: number | null; kuzatuv_ruxsat: boolean; oy_token: number; balans: number; tahrir_mumkin: boolean };
export type SignalGuruhi = { sahifa: string; tur: string; soni: number; kompaniya_soni: number; namunalar: string[] };
export type MuhitQoidasi = { doira: 'yadro' | 'global' | 'company'; kod: string; matn: string; versiya: number };
export type MuhitKorinishi = { qoidalar: MuhitQoidasi[]; manbalar: Array<{ domen: string; nom: string }> };

export const markazOl = () => agentOqi<Markaz>('markaz', null);
export const sarfHisobotiOl = (k: number) => agentOqi<SarfHisoboti>('hisobot', k);
export const kompaniyaSozlamaOl = (k: number) => agentOqi<KompaniyaSozlama>('kompaniya_sozlama', k);
export const kompaniyaSozlamaSaqla = (k: number, p: { aiYoqilgan: boolean; tokenLimit: number | null; kuzatuvRuxsat: boolean }) =>
  agentYoz('kompaniya_sozlama_saqla', k, { ai_yoqilgan: p.aiYoqilgan, token_limit: p.tokenLimit, kuzatuv_ruxsat: p.kuzatuvRuxsat });
/** Ustama (%): kompaniyaId=null — platforma standarti; berilsa — shu kompaniyaga alohida; foiz=null — kompaniya ustamasini olib tashlash. */
export const ustamaBelgila = (kompaniyaId: number | null, foiz: number | null) => agentYoz('ustama_belgila', kompaniyaId, { foiz });
export type KasbIshchi = { rol: string; profil: string; nom: string; vazifa: string; kategoriyalar: string[]; namuna_savollar: string[]; taqiq_izoh: string | null; boshqalar: Array<{ rol: string; nom: string; vazifa: string }> };
export type KasbJavobi = { javob: string; kasb: { nom: string; rol: string; profil: string }; toifalar?: string[]; rad?: boolean; model?: string; ms?: number };
export const kasbOl = (k: number) => agentOqi<KasbIshchi>('kasb', k);
export const kasbSavol = (k: number, savol: string, sahifa?: string, obyektId?: number | null) => agentYoz<KasbJavobi>('kasb_savol', k, { savol, sahifa, obyekt_id: obyektId ?? undefined });
export type ModelMoslik = {
  id: string; nom: string; kirish_usd: number; chiqish_usd: number; kontekst: number; vision: boolean; tools: boolean; json: boolean; reasoning: boolean;
  ball: number; manba: 'tanilgan' | 'taxmin'; daraja: 'juda_mos' | 'mos' | 'chegarada' | 'kuchsiz'; talab: number; sabablar: string[]; ogohlantirish: string | null; javob_narxi_usd: number;
};
export type ModellarRoyxati = { jami: number; tavsiya: string[]; talab: { min: number; izoh: string }; natija: ModelMoslik[] };
export const openrouterModellarOl = (p: { profil?: string | null; q?: string; ids?: string[] } = {}) =>
  agentOqi<ModellarRoyxati>('openrouter_modellar', null, { profil: p.profil ?? undefined, q: p.q, ids: p.ids?.join(',') });
export const modelOpenrouterdanQosh = (modelId: string) => agentYoz('model_openrouterdan_qosh', null, { model_id: modelId });
export const signallarOl = () => agentOqi<{ natija: SignalGuruhi[] }>('signallar', null);
export const muhitRoyxatiOl = () => agentOqi<MuhitKorinishi>('muhit_royxat', null);
export const byudjetBelgila = (k: number | null, limitUsd: number, ogohlantirishFoiz = 80, faol = true) =>
  agentYoz('byudjet_belgila', k, { limit_usd: limitUsd, ogohlantirish_foiz: ogohlantirishFoiz, faol });
export const manbaHolati = (domen: string, faol: boolean) => agentYoz('manba_holat', null, { domen, faol });

/* ───────── Kasb ishchisi: jonli qadamlar, jurnal, shaxsiy sozlama, harakat takliflari ───────── */
export type Qadam = { ms: number; belgi: string; matn: string };
export type HarakatTaklif = {
  id: number; amal: string; parametrlar: Record<string, unknown>; xavf: 'past' | 'orta' | 'yuqori'; avto: boolean; ogohlantirish: string | null; tushuntirish: string;
};
export type SahifaIshora = { yol: string; nom: string };
export type KasbYakun = {
  ok: boolean; status?: number; javob?: string; rad?: boolean; kasb?: { nom: string; rol: string; profil: string }; harakatlar?: HarakatTaklif[];
  sahifalar?: SahifaIshora[]; model_manba?: 'foydalanuvchi' | 'kompaniya' | 'platforma' | null;
  toifalar?: string[]; model?: string; ms?: number; jurnal_id?: number | null; qadamlar?: Qadam[]; error?: string; code?: string;
};

/** Savolni yuboradi va AI qadamlarini JONLI oladi (NDJSON). `qadam` har yangi qadamda chaqiriladi; yakunda to'liq natija qaytadi. */
export async function kasbSavolOqim(k: number, savol: string, o: { sahifa?: string; obyektId?: number | null; qadam?: (q: Qadam) => void; signal?: AbortSignal } = {}): Promise<KasbYakun> {
  let r: Response;
  try {
    r = await fetch('/api/agent-ish', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, signal: o.signal,
      body: JSON.stringify({ amal: 'kasb_savol', kompaniya_id: k, savol, sahifa: o.sahifa, obyekt_id: o.obyektId ?? undefined, oqim: true }) });
  } catch (e) { return { ok: false, error: 'Tarmoq: ' + (e instanceof Error ? e.message : String(e)) }; }
  if (!(r.headers.get('content-type') ?? '').includes('x-ndjson') || !r.body) {
    try { return { ...(await r.json() as KasbYakun), status: r.status }; } catch { return { ok: false, error: `Server javob bermadi (HTTP ${r.status})` }; }
  }
  const reader = r.body.getReader(); const dec = new TextDecoder(); let bufer = ''; let yakun: KasbYakun | null = null;
  const qator = (x: string) => {
    if (!x.trim()) return;
    try {
      const j = JSON.parse(x) as { t?: string } & Record<string, unknown>;
      if (j.t === 'qadam') o.qadam?.({ ms: Number(j.ms) || 0, belgi: String(j.belgi ?? ''), matn: String(j.matn ?? '') });
      else if (j.t === 'yakun') { const { t: _t, ...qolgan } = j; void _t; yakun = qolgan as unknown as KasbYakun; }
    } catch { /* buzilgan satr — o'tkazib yuboriladi */ }
  };
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bufer += dec.decode(value, { stream: true });
      const q = bufer.split('\n'); bufer = q.pop() ?? '';
      q.forEach(qator);
    }
    qator(bufer);
  } catch (e) { if ((e as { name?: string })?.name === 'AbortError') return { ok: false, error: 'To‘xtatildi' }; }
  return yakun ?? { ok: false, error: 'Aloqa uzildi — javob to‘liq kelmadi' };
}

export type JurnalYozuvi = {
  id: number; vaqt: string; profil_kod: string | null; rol: string | null; tur: 'savol' | 'rad' | 'salom' | 'xato'; savol: string | null; javob: string | null; qadamlar: Qadam[];
  toifalar: string[]; model: string | null; kirish_token: number; chiqish_token: number; ms: number | null; rad: boolean; kim: string | null;
  harakatlar: Array<{ id: number; amal: string; xavf: string; holat: string; tushuntirish: string | null }>;
};
export const jurnalOl = (k: number, hamma = false) => agentOqi<{ hamma: boolean; natija: JurnalYozuvi[] }>('jurnal', k, { hamma: hamma ? '1' : undefined });
export type ShaxsiySozlama = { til: 'auto' | 'uz' | 'ru'; uslub: 'qisqa' | 'batafsil'; ishonch: 'sora' | 'jiddiy' | 'avto' };
export const shaxsiyOl = () => agentOqi<ShaxsiySozlama>('shaxsiy', null);
export const shaxsiySaqla = (p: ShaxsiySozlama) => agentYoz('shaxsiy_saqla', null, { ...p });
/* Foydalanuvchi uslubi (o'rganilgan shakl belgilari + o'z ko'rsatmasi), shaxsiy model tanlovi, kompaniyasiz tokensiz tizim yordamchisi */
export type UslubHolati = { xususiyat: Record<string, number>; xulosa: string[]; korsatma: string | null; yoqilgan: boolean };
export const uslubOl = () => agentOqi<UslubHolati>('uslub', null);
export const uslubSaqla = (korsatma: string, yoqilgan: boolean) => agentYoz('uslub_saqla', null, { korsatma, yoqilgan });
export const uslubTozala = () => agentYoz('uslub_tozala', null);
export type ShaxsiyModelTanlovi = { tanlovlar: Array<{ profil: string; model_id: string }> };
export const modelShaxsiyOl = () => agentOqi<ShaxsiyModelTanlovi>('model_shaxsiy', null);
export const modelShaxsiyTanla = (profil: string, modelId: string | null) => agentYoz('model_shaxsiy_tanla', null, { profil, model_id: modelId });
export type TizimYordam = { javob: string; sahifalar: SahifaIshora[]; topildi: boolean };
export const tizimYordamSavol = (savol: string, sahifa?: string) => agentYoz<TizimYordam>('tizim_yordam', null, { savol, sahifa });
export const harakatQarori =(harakatId: number, qaror: 'tasdiqlash' | 'rad') => agentYoz<{ holat: string }>('harakat_qaror', null, { harakat_id: harakatId, qaror });
export const harakatNatijasi = (harakatId: number, ok: boolean, natija: Record<string, unknown>) => agentYoz('harakat_natija', null, { harakat_id: harakatId, ok, natija });
