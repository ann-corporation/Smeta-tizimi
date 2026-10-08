/** Agent RPC chaqiruvi: service_role bilan Supabase RPC; xatolar foydalanuvchiga tushunarli va ichki matnsiz. */
import { supabaseBaseUrl } from './supabase-url';

export type AgentRpcEnv = { SUPABASE_URL?: string; SUPABASE_KEY?: string };
export type Yuk = Record<string, unknown>;
export type RpcNatija = { ok: boolean; status: number; data: Yuk };

const KOD_MATNI: Record<string, string> = {
  MANBA_TASDIQLANMAGAN: 'Bu domen tasdiqlangan manbalar ro‘yxatida yo‘q — avval uni tasdiqlang',
  KUZATUV_INVALID: 'Manzil https:// bilan boshlanishi va nomi 2–120 belgi bo‘lishi kerak',
  BILIM_INVALID: 'Bilim yozuvi noto‘g‘ri: sarlavha, matn (20–1500 belgi) va kamida 1 ta kalit so‘z kerak',
  GLOBAL_SCOPE_DENIED: 'Bu amal faqat platforma superadminiga ruxsat etilgan',
  COMPANY_ACCESS_DENIED: 'Bu kompaniyaga ruxsat yo‘q',
  WRITE_ROLE_REQUIRED: 'Buning uchun admin, boss yoki direktor huquqi kerak',
  AUTH_REQUIRED: 'Sessiya tugagan — qayta kiring',
  TAKLIF_INVALID: 'Taklif shakli noto‘g‘ri',
  GLOBAL_TAKLIF_FAQAT_MANBA: 'Kompaniya ichidan umumiy (global) taklif yaratib bo‘lmaydi',
  ALLAQACHON_KORIB_CHIQILGAN: 'Bu taklif allaqachon ko‘rib chiqilgan',
  TOPILMADI: 'Topilmadi',
};

export async function rpcData(env: AgentRpcEnv, nom: string, yuk: Yuk): Promise<RpcNatija> {
  const r = await fetch(supabaseBaseUrl(env.SUPABASE_URL!) + '/rest/v1/rpc/' + nom, {
    method: 'POST', headers: { apikey: env.SUPABASE_KEY!, Authorization: 'Bearer ' + env.SUPABASE_KEY!, 'Content-Type': 'application/json' }, body: JSON.stringify(yuk),
  });
  const text = await r.text();
  if (!r.ok) {
    let code = ''; try { code = (JSON.parse(text) as { code?: string }).code ?? ''; } catch { /* matn emas */ }
    return { ok: false, status: code === '42501' ? 403 : code === '22023' ? 400 : 502, data: { ok: false, error: code === '42501' ? 'Bu doiraga ruxsat yo‘q' : 'Server xatosi' } };
  }
  let d: unknown = null;
  try { d = JSON.parse(text); } catch { return { ok: false, status: 502, data: { ok: false, error: 'Noto‘g‘ri javob' } }; }
  const o = (d && typeof d === 'object' ? d : { ok: true, natija: d }) as Yuk;
  // Baza `{ok:false, code, xabar}` qaytaradi — mijoz `error` ni ko'rsatadi: tushunarli matn bo'lmasa «Xato» chiqmasin.
  if (o.ok === false && typeof o.error !== 'string') o.error = typeof o.xabar === 'string' && o.xabar ? o.xabar : (KOD_MATNI[String(o.code ?? '')] ?? (o.code ? `Amal bajarilmadi (${String(o.code)})` : 'Amal bajarilmadi'));
  return { ok: o.ok !== false, status: o.ok === false ? (o.code === 'GLOBAL_SCOPE_DENIED' || o.code === 'COMPANY_ACCESS_DENIED' || o.code === 'WRITE_ROLE_REQUIRED' ? 403 : 400) : 200, data: o };
}
