/** QulfStore -- Supabase REST (service_role). Migratsiya: 20261225100000_t2_qulf_v1. Jadval yo'q (migratsiya qo'llanmagan) -> QulfYoq. */
import { supabaseBaseUrl } from './supabase-url';
import type { KalitQator, QulfStore } from './qulf-amal';
import type { QulfQator, Rejim, Talab } from './qulf';

export class QulfYoq extends Error { constructor() { super('QULF_YOQ'); } }
type Env = { SUPABASE_URL: string; SUPABASE_KEY: string };

export function supabaseStore(env: Env, fetcher: typeof fetch = fetch): QulfStore {
  const base = supabaseBaseUrl(env.SUPABASE_URL) + '/rest/v1/';
  const h = (extra: Record<string, string> = {}) => ({ apikey: env.SUPABASE_KEY, Authorization: 'Bearer ' + env.SUPABASE_KEY, 'Content-Type': 'application/json', ...extra });
  async function so(path: string, init: RequestInit = {}): Promise<unknown> {
    const r = await fetcher(base + path, { ...init, headers: h((init.headers as Record<string, string>) || {}) });
    if (r.status === 404 || r.status === 406) throw new QulfYoq(); // PGRST205/PGRST202: jadval/funksiya yo'q
    if (!r.ok) throw new Error('QULF_DB_' + r.status);
    const t = await r.text();
    return t ? JSON.parse(t) : null;
  }
  const rpc = (nom: string, args: Record<string, unknown>) => so('rpc/' + nom, { method: 'POST', body: JSON.stringify(args) }) as Promise<Record<string, unknown>>;
  const iso = (d: Date) => d.toISOString();
  return {
    async holat(uid) {
      const r = await so(`t2_qulf_foydalanuvchi?foydalanuvchi_id=eq.${uid}&select=*&limit=1`) as QulfQator[];
      return r[0] ?? null;
    },
    async pinYoz(uid, hash) {
      await so('t2_qulf_foydalanuvchi?on_conflict=foydalanuvchi_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ foydalanuvchi_id: uid, pin_hash: hash, pin_yangilandi: iso(new Date()), xato_soni: 0, jami_xato: 0, bloklangan_gacha: null, yangilandi: iso(new Date()) }) });
    },
    async pinOchir(uid) {
      await so(`t2_qulf_foydalanuvchi?foydalanuvchi_id=eq.${uid}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ pin_hash: null, xato_soni: 0, jami_xato: 0, bloklangan_gacha: null, yangilandi: iso(new Date()) }) });
    },
    async vaqtYoz(uid, daq) {
      await so('t2_qulf_foydalanuvchi?on_conflict=foydalanuvchi_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ foydalanuvchi_id: uid, bosh_vaqt_daq: daq, yangilandi: iso(new Date()) }) });
    },
    async urinish(uid, ok) {
      const r = await rpc('t2_qulf_urinish_v1', { p_foydalanuvchi_id: uid, p_ok: ok });
      return { code: typeof r?.code === 'string' ? r.code : undefined };
    },
    async chaqiriqIshlat(jti, uid, tugaydi) {
      const r = await rpc('t2_qulf_chaqiriq_ishlat_v1', { p_jti: jti, p_foydalanuvchi_id: uid, p_tugaydi: iso(tugaydi) });
      return r?.ok === true;
    },
    async kalitlar(uid) {
      return await so(`t2_qulf_kalit?foydalanuvchi_id=eq.${uid}&ochirildi=is.null&select=id,foydalanuvchi_id,tur,kredensial_id,ochiq_kalit,alg,hisob,transports,qurilma_nomi,yaratildi,oxirgi_ishlatildi&order=id.asc`) as KalitQator[];
    },
    async kalitQosh(uid, k) {
      await so('t2_qulf_kalit', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ ...k, foydalanuvchi_id: uid }) });
    },
    async kalitHisob(id, hisob) {
      await so(`t2_qulf_kalit?id=eq.${id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ hisob, oxirgi_ishlatildi: iso(new Date()) }) });
    },
    async kalitOchir(uid, id) {
      const r = await so(`t2_qulf_kalit?id=eq.${id}&foydalanuvchi_id=eq.${uid}&ochirildi=is.null`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ ochirildi: iso(new Date()) }) }) as unknown[];
      return Array.isArray(r) && r.length > 0;
    },
    async siyosatOl(kid) {
      const r = await so(`t2_qulf_siyosat?kompaniya_id=eq.${kid}&select=rejim&limit=1`) as { rejim: Rejim }[];
      return r[0]?.rejim ?? null;
    },
    async siyosatYoz(kid, rejim, yangilagan) {
      await so('t2_qulf_siyosat?on_conflict=kompaniya_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ kompaniya_id: kid, rejim, yangilagan_id: yangilagan, yangilandi: iso(new Date()) }) });
    },
    async talab(uid, kid) {
      const r = await rpc('t2_qulf_talab_v1', { p_foydalanuvchi_id: uid, p_kompaniya_id: kid });
      return { talab: r?.talab === true, rejim: (r?.rejim as Rejim) ?? 'pin', pin: r?.pin === true, kalit: r?.kalit === true } satisfies Talab;
    },
  };
}
