/**
 * ai-ishchi.ts — AI ishchilar klienti. Shlyuz: /api/ai-ishchi (actor sessiyadan; ruxsat/tenant bazada).
 * kompaniyaId = null → TIZIM doirasi (faqat platforma superadmini; baza tekshiradi). Bu fayl faqat so'rov yuboradi.
 */
export type IshchiHolat = 'navbatda' | 'ishlayapti' | 'tugadi' | 'xato' | 'limit';
export type AiHolat = 'yoq' | 'kutilmoqda' | 'ishlayapti' | 'tayyor' | 'limit' | 'xato';
export type IshchiQatori = {
  kod: string; nom: string; tavsif: string; doira: 'kompaniya' | 'tizim'; ai_bor: boolean; model_daraja: string; sukut_jadval: string; vositalar: string[];
  yoqilgan: boolean; jadval: 'qolda' | 'kunlik' | 'haftalik'; soat: number; ai_xulosa: boolean; max_token_ish: number; yangi_natija: number;
  oxirgi: { id: number; holat: IshchiHolat; ai_holat: AiHolat; yaratildi: string; tugadi: string | null; xato_kod: string | null; natija_id: number | null } | null;
};
export type Band = { tur: string; daraja: number; matn: string; royxat?: unknown };
export type NatijaQatori = {
  id: number; ish_id: number; ishchi_kod: string; sarlavha: string; xulosa: string; quruq: boolean; ustuvorlik: number; bandlar: Band[];
  holat: 'yangi' | 'oqildi' | 'bajarildi'; yaratildi: string; ish_holat: IshchiHolat; ai_holat: AiHolat;
};
export type SarfQatori = { ishchi: string; chaqiruv: number; token: number; xato: number };
export type SarfMalumoti = {
  fon_foiz?: number | null; oy_token_ishchi: number; oy_token_jami: number; token_limit: number | null; token_balans: number | null; ishchilar: SarfQatori[];
  ishlar: Array<{ id: number; ishchi: string; holat: IshchiHolat; ai_holat: AiHolat; kirish_token: number; chiqish_token: number; model: string | null; yaratildi: string }>;
};
export type ManbaQatori = { id: number; url: string; domen: string; nom: string; maqsad: string | null; tur: string; chastota_soat: number; faol: boolean; oxirgi_vaqt: string | null; oxirgi_holat: string | null; domen_ruxsat: boolean };

type Xom = { ok?: boolean; error?: string; code?: string } & Record<string, unknown>;
export type Javob<T> = { ok: true; data: T } | { ok: false; error: string; code?: string };

async function chaqir(url: string, init?: RequestInit): Promise<Xom> {
  try {
    const r = await fetch(url, { credentials: 'same-origin', ...init });
    const matn = await r.text();
    try { return JSON.parse(matn) as Xom; } catch { return { ok: false, error: `Server javob bermadi (HTTP ${r.status})` }; }
  } catch (e) { return { ok: false, error: 'Tarmoq: ' + (e instanceof Error ? e.message : String(e)) }; }
}
const xatoMatni = (x: Xom) => String(x.error ?? x.xabar ?? (x.code ? `Amal bajarilmadi (${x.code})` : 'Xato'));

/** Bo'lim nomi -> javob shakli (chaqiruvchi tur argumentini yozmaydi). */
export type BolimJavobi = { ishchilar: { royxat: IshchiQatori[] }; inbox: { royxat: NatijaQatori[] }; sarf: SarfMalumoti; manbalar: { royxat: ManbaQatori[] } };

export async function aiIshchiOl<B extends keyof BolimJavobi>(bolim: B, kompaniyaId: number | null, holat?: string): Promise<Javob<BolimJavobi[B]>> {
  const q = new URLSearchParams({ bolim });
  if (kompaniyaId != null) q.set('kompaniya_id', String(kompaniyaId));
  if (holat) q.set('holat', holat);
  const x = await chaqir('/api/ai-ishchi?' + q.toString());
  return x.ok === false ? { ok: false, error: xatoMatni(x), code: x.code } : { ok: true, data: x as unknown as BolimJavobi[B] };
}

/** UI yozish amali: natija {ok, error?}; YozFn — bajarish + muvaffaqiyat xabari (komponent ichida yagona toast/yangilash yo'li). */
export type YozIshi = () => Promise<{ ok: boolean; error?: string }>;
export type YozFn = (fn: YozIshi, xabar: string) => Promise<void>;

export async function aiIshchiYoz(body: Record<string, unknown>): Promise<Javob<Xom>> {
  const x = await chaqir('/api/ai-ishchi', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ operation_id: crypto.randomUUID(), ...body }) });
  return x.ok === false ? { ok: false, error: xatoMatni(x), code: x.code } : { ok: true, data: x };
}
