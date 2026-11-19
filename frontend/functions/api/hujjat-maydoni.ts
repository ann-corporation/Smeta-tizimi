/**
 * hujjat-maydoni.ts - Hujjat maydoni (Hujjatlarim / Kompaniya diski) API: papka, fayl amallari, versiya, izoh, ulashish, kvota, admin.
 * Aktor - faqat sessiyadan. Ruxsat/kvota - service_role RPC lari ichida (t2_hm_*). Baytlar - /api/hujjat-maydoni-yukla va -ol.
 *
 *   GET  /api/hujjat-maydoni?amal=royxat|yetim|ulashilgan|versiyalar|izoh|ulashish|faoliyat|qidir|tizim|registry_joy|odamlar|admin|sozlama|tg|taqdim_nishon|taqdim_royxat|taqdim_tafsilot
 *   POST /api/hujjat-maydoni { amal: papka|fayl|izoh|ulash|sozlama|abadiy|bosh|reja|taqdim|taqdim_qaytar|yetim_kochir|yetim_ai, ... }
 *   Taqdim (tomonlararo o'zgarmas surat): oluvchi tomon faqat o'qiydi; yuklab olish - /api/hujjat-maydoni-ol?taqdim=<id>&el=<id>.
 *   qidir: fayl nomi + fayl ICHIDAGI matn (pdf/docx/xlsx/pptx/matn; yuklashda indekslanadi).
 */
import { hmQidirYuqori, hmRpc, rpcOk, rpcXato, sessiyaAktor, type HmEnv } from '../_shared/hujjat-maydoni';
import { r2Ochir, sha256Hex } from '../_shared/r2-saqlash';
import { yetimAi, yetimKochir, yetimRoyxat } from '../_shared/disk-yetim';

const num = (v: unknown): number | null => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Paket filtri (query `filtr` JSON): faqat ma'lum kalitlar va turlar o'tadi (RPC ga xom JSON ketmaydi). */
export function paketFiltri(xom: string | null): Record<string, unknown> {
  let j: Record<string, unknown> = {};
  try { const p = JSON.parse(xom || '{}'); if (p && typeof p === 'object' && !Array.isArray(p)) j = p as Record<string, unknown>; } catch { /* bo'sh filtr */ }
  const ids = (v: unknown): number[] => (Array.isArray(v) ? v.map(Number).filter((n) => Number.isSafeInteger(n) && n > 0).slice(0, 200) : []);
  const txt = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(x).toLowerCase()).filter((x) => /^[a-z0-9_]{1,40}$/.test(x)).slice(0, 20) : []);
  const oy = (v: unknown): string | null => (typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v) ? v : null);
  const o: Record<string, unknown> = {};
  for (const [k, v] of [['loyiha_ids', ids(j.loyiha_ids)], ['shartnoma_ids', ids(j.shartnoma_ids)], ['obyekt_ids', ids(j.obyekt_ids)], ['turlar', txt(j.turlar)], ['holatlar', txt(j.holatlar)]] as const) if (v.length) o[k] = v;
  if (oy(j.oy_dan)) o.oy_dan = oy(j.oy_dan);
  if (oy(j.oy_gacha)) o.oy_gacha = oy(j.oy_gacha);
  return o;
}

async function javob(p: Promise<{ httpOk: boolean; body: any; raw: string }>) {
  const r = await p;
  return rpcOk(r) ? Response.json(r.body) : rpcXato(r);
}

export const onRequestGet: PagesFunction<HmEnv> = async (ctx) => {
  try {
    const a = await sessiyaAktor(ctx);
    if (a instanceof Response) return a;
    const u = new URL(ctx.request.url);
    const q = u.searchParams;
    const amal = q.get('amal') || 'royxat';
    const komp = num(q.get('kompaniya_id'));
    const R = (n: string, args: Record<string, unknown>) => javob(hmRpc(ctx.env, n, args));
    const id = a.actorId;
    switch (amal) {
      case 'royxat': return R('t2_hm_royxat_v1', { p_actor: id, p_kompaniya: komp, p_papka: num(q.get('papka_id')), p_savat: q.get('savat') === '1' });
      case 'registry_joy': return R('t2_hm_registry_joy_v1', { p_actor: id, p_registry_id: num(q.get('registry_id')) });
      case 'ulashilgan': return R('t2_hm_ulashilgan_v1', { p_actor: id });
      case 'versiyalar': return R('t2_hm_versiyalar_v1', { p_actor: id, p_fayl_id: num(q.get('fayl_id')) });
      case 'izoh': return R('t2_hm_izoh_v1', { p_actor: id, p_fayl_id: num(q.get('fayl_id')) });
      case 'ulashish': return R('t2_hm_ulashish_royxat_v1', { p_actor: id, p_nishon_turi: q.get('nishon_turi') === 'papka' ? 'papka' : 'fayl', p_nishon_id: num(q.get('nishon_id')) });
      case 'faoliyat': return R('t2_hm_faoliyat_v1', { p_actor: id, p_kompaniya: komp, p_fayl_id: num(q.get('fayl_id')), p_limit: num(q.get('limit')) ?? 50 });
      case 'qidir': return javob(hmQidirYuqori(ctx.env, id, komp, (q.get('q') || '').slice(0, 80)));
      case 'taqdim_nishon': return komp ? R('t2_hm_taqdim_nishon_v1', { p_actor: id, p_kompaniya: komp }) : Response.json({ ok: false, code: 'KOMPANIYA_KERAK' }, { status: 400 });
      case 'taqdim_royxat': return komp ? R('t2_hm_taqdim_royxat_v1', { p_actor: id, p_kompaniya: komp, p_yonalish: q.get('yonalish') === 'yuborilgan' ? 'yuborilgan' : 'kelgan' }) : Response.json({ ok: false, code: 'KOMPANIYA_KERAK' }, { status: 400 });
      case 'taqdim_tafsilot': return R('t2_hm_taqdim_tafsilot_v1', { p_actor: id, p_taqdim_id: num(q.get('taqdim_id')) });
      case 'yetim': return komp ? yetimRoyxat(ctx.env, id, komp) : Response.json({ ok: false, code: 'KOMPANIYA_KERAK' }, { status: 400 });
      case 'tizim': return komp ? R('t2_hm_tizim_hujjat_v1', { p_actor: id, p_kompaniya: komp, p_limit: 200 }) : Response.json({ ok: false, code: 'KOMPANIYA_KERAK' }, { status: 400 });
      // Hujjatlar paketi (universal): Disk + akt reestri nomzodlari (bitta RPC; sayt, Telegram, MCP, Jarvis). filtr - JSON, faqat ma'lum kalitlar.
      case 'paket_nomzod': return komp ? R('t2_hujjat_paket_nomzod_v1', { p_actor: id, p_kompaniya: komp, p_filtr: paketFiltri(q.get('filtr')) }) : Response.json({ ok: false, code: 'KOMPANIYA_KERAK' }, { status: 400 });
      case 'odamlar': return R('t2_hm_odamlar_v1', { p_actor: id, p_kompaniya: komp, p_q: (q.get('q') || '').slice(0, 60) });
      case 'admin': return R('t2_hm_admin_v1', { p_actor: id, p_kompaniya: komp });
      case 'sozlama': return komp ? R('t2_hm_sozlama_v1', { p_actor: id, p_kompaniya: komp }) : Response.json({ ok: false, code: 'KOMPANIYA_KERAK' }, { status: 400 });
      default: return Response.json({ ok: false, code: 'AMAL_NOMALUM' }, { status: 400 });
    }
  } catch (e: any) {
    return Response.json({ ok: false, code: 'HM_XATO', xato: String(e?.message || e).slice(0, 200) }, { status: 500 });
  }
};

/** R2 baytlarini o'chiradi, keyin metama'lumotni (nomzodlar RPC dan: aktor huquqi tekshirilgan). */
async function r2Tozala(env: HmEnv, nom: any) {
  const fayllar: Array<{ id: number; kalitlar: string[] }> = Array.isArray(nom.fayllar) ? nom.fayllar : [];
  const eski: Array<{ id: number; kalit: string }> = Array.isArray(nom.eski) ? nom.eski : [];
  // har versiya obyekti bilan birga uning matn indeksi ('.txt') ham o'chadi; bor bo'lmasa r2Ochir zararsiz
  for (const f of fayllar) for (const k of f.kalitlar || []) { await r2Ochir(env.R2_CANONICAL, k); await r2Ochir(env.R2_CANONICAL, k + '.txt'); }
  for (const v of eski) { await r2Ochir(env.R2_CANONICAL, v.kalit); await r2Ochir(env.R2_CANONICAL, v.kalit + '.txt'); }
  return hmRpc(env, 't2_hm_tozala_tasdiq_v1', { p_fayl_idlar: fayllar.map((f) => f.id), p_versiya_idlar: [], p_eski_idlar: eski.map((v) => v.id) });
}

export const onRequestPost: PagesFunction<HmEnv> = async (ctx) => {
  try {
    const a = await sessiyaAktor(ctx);
    if (a instanceof Response) return a;
    const b = await ctx.request.json().catch(() => null) as Record<string, any> | null;
    if (!b || typeof b !== 'object') return Response.json({ ok: false, code: 'BODY_NOTOGRI' }, { status: 400 });
    const id = a.actorId; // body.actor_id HECH QACHON o'qilmaydi
    const R = (n: string, args: Record<string, unknown>) => javob(hmRpc(ctx.env, n, args));
    const komp = num(b.kompaniya_id);
    switch (b.amal) {
      case 'papka':
        return R('t2_hm_papka_amal_v1', { p_actor: id, p_kompaniya: komp, p_amal: String(b.op || ''), p_papka_id: num(b.papka_id), p_nom: b.nom ?? null, p_ota_id: num(b.ota_id) });
      case 'fayl':
        return R('t2_hm_fayl_amal_v1', { p_actor: id, p_fayl_id: num(b.fayl_id), p_amal: String(b.op || ''), p_papka_id: num(b.papka_id), p_nom: b.nom ?? null, p_raqam: num(b.raqam) });
      case 'izoh': {
        const es = Array.isArray(b.eslatilgan) ? b.eslatilgan.map(num).filter((x: number | null): x is number => x != null).slice(0, 20) : [];
        return R('t2_hm_izoh_v1', { p_actor: id, p_fayl_id: num(b.fayl_id), p_matn: String(b.matn || '').slice(0, 2000), p_eslatilgan: es });
      }
      case 'ulash': {
        const havola = b.subyekt_turi === 'havola' && b.op !== 'bekor';
        let token: string | null = null; let xesh: string | null = null;
        if (havola) {
          token = [...crypto.getRandomValues(new Uint8Array(32))].map((x) => x.toString(16).padStart(2, '0')).join('');
          xesh = await sha256Hex(new TextEncoder().encode(token)); // bazada faqat xesh
        }
        const r = await hmRpc(ctx.env, 't2_hm_ulash_v1', {
          p_actor: id, p_amal: b.op === 'bekor' ? 'bekor' : 'bering', p_nishon_turi: b.nishon_turi === 'papka' ? 'papka' : 'fayl', p_nishon_id: num(b.nishon_id),
          p_subyekt_turi: b.subyekt_turi ?? null, p_subyekt_id: num(b.subyekt_id), p_rol: b.rol ?? null, p_daraja: b.daraja || 'korish',
          p_havola_xesh: xesh, p_muddat_soat: num(b.muddat_soat), p_ulash_id: num(b.ulash_id),
        });
        if (!rpcOk(r)) return rpcXato(r);
        return Response.json(token ? { ...r.body, havola: '/api/hujjat-maydoni-ol?t=' + token } : r.body);
      }
      case 'sozlama':
        if (!komp) return Response.json({ ok: false, code: 'KOMPANIYA_KERAK' }, { status: 400 });
        return R('t2_hm_sozlama_v1', { p_actor: id, p_kompaniya: komp, p_havola_ruxsat: typeof b.havola_ruxsat === 'boolean' ? b.havola_ruxsat : null, p_ortiqcha: typeof b.ortiqcha === 'boolean' ? b.ortiqcha : null });
      case 'abadiy': { // savatdagi bitta faylni darhol o'chirish (joy bo'shatish)
        const n = await hmRpc(ctx.env, 't2_hm_tozala_ol_v1', { p_actor: id, p_fayl_id: num(b.fayl_id), p_limit: 1 });
        if (!rpcOk(n)) return rpcXato(n);
        return javob(r2Tozala(ctx.env, n.body));
      }
      case 'bosh': { // savatni bo'shatish / eski versiyalarni o'chirish (faqat egasi/boshqaruvchi - RPC tekshiradi)
        const tur = b.tur === 'eski_versiyalar' ? 'eski_versiyalar' : 'savat';
        const n = await hmRpc(ctx.env, 't2_hm_bosh_ol_v1', { p_actor: id, p_kompaniya: komp, p_amal: tur });
        if (!rpcOk(n)) return rpcXato(n);
        return javob(r2Tozala(ctx.env, n.body));
      }
      case 'taqdim': {
        const op = String(b.operation_id || '');
        if (!UUID.test(op)) return Response.json({ ok: false, code: 'OPERATION_ID_REQUIRED' }, { status: 400 });
        return R('t2_hm_taqdim_yarat_v1', { p_actor: id, p_nishon_turi: b.nishon_turi === 'papka' ? 'papka' : 'fayl', p_nishon_id: num(b.nishon_id), p_aloqa_id: num(b.aloqa_id), p_izoh: String(b.izoh || '').slice(0, 1000), p_operation_id: op });
      }
      case 'yetim_kochir':
        return komp ? yetimKochir(ctx.env, id, komp, num(b.fayl_id), num(b.loyiha_id), num(b.obyekt_id)) : Response.json({ ok: false, code: 'KOMPANIYA_KERAK' }, { status: 400 });
      case 'yetim_ai':
        return komp ? yetimAi(ctx.env, id, komp, (Array.isArray(b.fayl_idlar) ? b.fayl_idlar : []).map(num).filter((x: number | null): x is number => x != null).slice(0, 15)) : Response.json({ ok: false, code: 'KOMPANIYA_KERAK' }, { status: 400 });
      case 'taqdim_qaytar':
        return R('t2_hm_taqdim_qaytar_v1', { p_actor: id, p_taqdim_id: num(b.taqdim_id), p_sabab: String(b.sabab || '').slice(0, 500) });
      case 'reja': {
        const op = String(b.operation_id || '');
        if (!komp || !UUID.test(op)) return Response.json({ ok: false, code: 'OPERATION_ID_REQUIRED' }, { status: 400 });
        return R('t2_hm_reja_ol_v1', { p_actor: id, p_kompaniya: komp, p_tarif_kod: String(b.tarif_kod || ''), p_oylar: num(b.oylar) ?? 1, p_operation_id: op });
      }
      default: return Response.json({ ok: false, code: 'AMAL_NOMALUM' }, { status: 400 });
    }
  } catch (e: any) {
    return Response.json({ ok: false, code: 'HM_XATO', xato: String(e?.message || e).slice(0, 200) }, { status: 500 });
  }
};
