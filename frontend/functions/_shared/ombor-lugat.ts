/**
 * Ombor lug'ati — server yordamchilari (/api/ombor-buyruq ishlatadi). Moslash mantig'i sof: src/lib/ombor-moslash/lugat.ts.
 *
 * Manbalar (yangi ro'yxat YARATILMAYDI): shu omborning kirim/chiqim tarixi (t2_sklad_harakat), kompaniya kontragentlari (t2_kontragent),
 * smeta katalogi (faol t2_qator, mat) va kompaniyaning tasdiqlangan sinonimlari (t2_ombor_lugat; jadval hali yo'q bo'lsa — jim o'tkaziladi).
 * Yozuv: faqat tasdiqdan keyin (RPC t2_ombor_lugat_yoz_v1, ruxsat + audit RPC ichida). Barcha so'rovlar kompaniya bo'yicha majburiy filtrlangan.
 */
import { supabaseBaseUrl } from './supabase-url';
import { lugatKalit, nomzodYigish, type LugatSinonim, type Nomzod } from '../../src/lib/ombor-moslash/lugat';
import type { TaklifYozuv } from '../../src/lib/ombor-moslash/taklif';

type Muhit = { SUPABASE_URL: string; SUPABASE_KEY: string };
export type LugatYuki = { sinonimlar: LugatSinonim[]; materiallar: Nomzod[]; kontragentlar: Nomzod[] };

async function rest<T>(env: Muhit, yol: string): Promise<T[] | null> {
  const r = await fetch(supabaseBaseUrl(env.SUPABASE_URL) + '/rest/v1/' + yol, { headers: { apikey: env.SUPABASE_KEY, Authorization: 'Bearer ' + env.SUPABASE_KEY } }).catch(() => null);
  const j = r && r.ok ? await r.json().catch(() => null) : null;
  return Array.isArray(j) ? j as T[] : null;
}
const musbat = (v: unknown): number | null => { const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN; return Number.isFinite(n) && n > 0 ? n : null; };
const toza = (v: unknown): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');

/** Tarix yozuvlaridan material nomzodlari (kirim va chiqim birga — kompaniya nomenklaturasi): nom, birlik, soni, oxirgi kirim sanasi va narxi (QQS siz, faqat tarixdagi). */
export function materialNomzodlari(yoz: readonly TaklifYozuv[]): Nomzod[] {
  const out: Nomzod[] = [];
  for (const y of yoz) {
    const nomi = toza(y.nomi); if (!nomi) continue;
    const kirim = y.operatsiya === 'prixod';
    out.push({ nomi, birligi: toza(y.birligi) || null, manba: 'ombor', soni: 1, oxirgi_sana: kirim ? y.sana ?? null : null, oxirgi_narx: kirim ? musbat(y.narx) : null });
  }
  return nomzodYigish(out, 'material');
}

/** Kontragent nomzodlari: shu yo'nalishdagi tarix (yetkazuvchi/qabul qiluvchi) + kompaniya kontragentlari ro'yxati. */
export function kontragentNomzodlari(yoz: readonly TaklifYozuv[], tur: 'prixod' | 'chiqim', royxat: readonly string[]): Nomzod[] {
  const op = tur === 'prixod' ? 'prixod' : 'rasxod';
  const out: Nomzod[] = [];
  for (const y of yoz) {
    if (y.operatsiya !== op) continue;
    const nomi = toza(tur === 'prixod' ? y.postavshik : y.qabul_qiluvchi);
    if (nomi) out.push({ nomi, birligi: null, manba: 'ombor', soni: 1, oxirgi_sana: y.sana ?? null });
  }
  for (const r of royxat) { const nomi = toza(r); if (nomi) out.push({ nomi, birligi: null, manba: 'katalog', soni: 1, oxirgi_sana: null }); }
  return nomzodYigish(out, 'kontragent');
}

export async function sinonimlarYukla(env: Muhit, kid: number): Promise<LugatSinonim[]> {
  const q = await rest<{ id: number; tur: string; ibora_kalit: string; kanonik: string; birlik: string | null }>(env, `t2_ombor_lugat?kompaniya_id=eq.${kid}&holat=eq.faol&select=id,tur,ibora_kalit,kanonik,birlik&limit=3000`);
  return (q ?? []).filter((x) => x.tur === 'material' || x.tur === 'kontragent').map((x) => ({ id: x.id, tur: x.tur as 'material' | 'kontragent', ibora_kalit: x.ibora_kalit, kanonik: x.kanonik, birlik: x.birlik }));
}

/** Smeta katalogi (faol versiya) dan material nomzodlari: iborani eng uzun so'zi bo'yicha. Eslatma: qidiruv xom so'z bilan (kirill katalog nomlari lotin iborani topmasligi mumkin). */
// versiya: texnik — faqat faol versiya (versiya_holat=eq.faol); kompaniya obyektlari bilan cheklangan.
export async function katalogNomzodlari(env: Muhit, kid: number, ibora: string): Promise<Nomzod[]> {
  const soz = (ibora.match(/[\p{L}]{3,}/gu) ?? []).sort((a, b) => b.length - a.length)[0];
  if (!soz) return [];
  const ob = await rest<{ id: number }>(env, `t2_obyekt?kompaniya_id=eq.${kid}&select=id&limit=300`);
  if (!ob?.length) return [];
  const q = await rest<{ nom: string | null; birlik: string | null }>(env, `t2_qator?obyekt_id=in.(${ob.map((o) => o.id).join(',')})&versiya_holat=eq.faol&tur=eq.mat&nom=ilike.${encodeURIComponent('*' + soz.slice(0, 40) + '*')}&select=nom,birlik&limit=60`);
  return nomzodYigish((q ?? []).filter((x) => toza(x.nom)).map((x) => ({ nomi: toza(x.nom), birligi: toza(x.birlik) || null, manba: 'katalog' as const, soni: 1, oxirgi_sana: null })), 'material');
}

/** Bitta so'rov uchun lug'at yuki (katalog alohida: `katalogNomzodlari` — ibora ajratilgandan keyin). */
export async function lugatYukla(env: Muhit, kid: number, yoz: readonly TaklifYozuv[], tur: 'prixod' | 'chiqim'): Promise<LugatYuki> {
  const [sinonimlar, kon] = await Promise.all([
    sinonimlarYukla(env, kid).catch(() => [] as LugatSinonim[]),
    rest<{ nom: string | null }>(env, `t2_kontragent?kompaniya_id=eq.${kid}&select=nom&limit=1000`).catch(() => null),
  ]);
  return { sinonimlar, materiallar: materialNomzodlari(yoz), kontragentlar: kontragentNomzodlari(yoz, tur, (kon ?? []).map((x) => toza(x.nom)).filter(Boolean)) };
}

/** Material nomining tarixdagi oxirgi narxi/sanasi (QQS siz; yo'q bo'lsa null — o'ylab topilmaydi). */
export function oxirgiNarx(materiallar: readonly Nomzod[], nomi: string): { narx: number; sana: string | null } | null {
  const k = lugatKalit(nomi);
  const n = materiallar.filter((x) => x.oxirgi_narx != null && lugatKalit(x.nomi) === k).sort((a, b) => String(b.oxirgi_sana ?? '').localeCompare(String(a.oxirgi_sana ?? '')))[0];
  return n ? { narx: n.oxirgi_narx as number, sana: n.oxirgi_sana } : null;
}

export type OyrenishYozuv = { tur: 'material' | 'kontragent'; ibora: string; ibora_kalit: string; kanonik: string; birlik: string | null };
/** Tasdiqdan keyin: tasdiqlangan moslik kompaniya lug'atiga yoziladi (best-effort — yozuv muvaffaqiyatiga ta'sir qilmaydi). */
export async function oyrenishSaqla(rpc: (nom: string, yuk: Record<string, unknown>) => Promise<{ status: number; data: unknown }>, baza: Record<string, unknown>, yoz: readonly OyrenishYozuv[]): Promise<number> {
  let son = 0;
  for (const o of yoz.slice(0, 4)) {
    const r = await rpc('t2_ombor_lugat_yoz_v1', { ...baza, p_amal: 'oyrat', p_yuk: o }).catch(() => null);
    if (r && r.status < 400 && (r.data as { ok?: boolean } | null)?.ok === true) son++;
  }
  return son;
}
