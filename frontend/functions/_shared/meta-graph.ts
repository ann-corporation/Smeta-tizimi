/**
 * meta-graph.ts — Meta Graph API mijozi (Facebook sahifa + Instagram biznes), server tomonida.
 *
 * SIR: META_TOKEN (system-user tokeni) faqat Cloudflare Pages secret; env.META_TOKEN sifatida o'qiladi. Hech qachon javob/log/auditga
 * chiqmaydi: token `Authorization: Bearer` sarlavhasida (URL da emas), xato matnidan tozalanadi, Graph xato tanasi xomligicha qaytarilmaydi
 * (faqat kod/subkod/tur + tozalangan qisqa matn). Sahifa tokeni `/me/accounts` orqali HAR SO'ROVDA olinadi (xotirada, keshsiz).
 * Sir bo'lmagan sozlamalar wrangler.toml [vars]: META_PAGE_ID (bo'sh = ish vaqtida topiladi), META_IG_ID, META_GRAPH_VERSION.
 */
export type MetaEnv = { META_TOKEN?: string; META_PAGE_ID?: string; META_IG_ID?: string; META_GRAPH_VERSION?: string; META_POLL_MS?: string };
export type GraphXato = { ok: false; kod: string; sub?: number; tur?: string; xabar?: string };
export type GraphJavob<T> = { ok: true; data: T } | GraphXato;
export type Sahifa = { id: string; nom: string; token: string; ig_id: string | null; ig_username: string | null };

export const metaBormi = (env: MetaEnv) => String(env.META_TOKEN ?? '').trim().length > 20;
const versiya = (env: MetaEnv) => (/^v\d{1,2}\.\d$/.test(String(env.META_GRAPH_VERSION ?? '')) ? String(env.META_GRAPH_VERSION) : 'v21.0');

/** Matndan tokenlarni (sozlangan + EAA… ko'rinishidagilarini) olib tashlaydi. */
export function tozala(s: unknown, ...sirlar: string[]): string {
  let t = String(s ?? '');
  for (const x of sirlar) if (x && x.length > 8) t = t.split(x).join('***');
  return t.replace(/\bEAA[A-Za-z0-9]{12,}\b/g, '***').replace(/(access_token=)[^&\s"]+/gi, '$1***').slice(0, 160);
}

type Usul = 'GET' | 'POST';
/** Past darajali chaqiruv. `token` — qaysi token (tizim yoki sahifa). Xatoda hech qachon xom tana qaytmaydi. */
export async function graph<T = Record<string, unknown>>(env: MetaEnv, usul: Usul, yol: string, p: Record<string, unknown>, token: string): Promise<GraphJavob<T>> {
  if (!/^[A-Za-z0-9_./-]{1,80}$/.test(yol)) return { ok: false, kod: 'YOL_NOTOGRI' };
  const base = `https://graph.facebook.com/${versiya(env)}/${yol}`;
  const sirlar = [token, String(env.META_TOKEN ?? '').trim()];
  try {
    let r: Response;
    const bosh = { Authorization: `Bearer ${token}` };
    if (usul === 'GET') {
      const q = new URLSearchParams(Object.entries(p).filter(([, v]) => v != null).map(([k, v]): [string, string] => [k, String(v)]));
      r = await fetch(`${base}?${q}`, { headers: bosh });
    } else {
      r = await fetch(base, { method: 'POST', headers: { ...bosh, 'Content-Type': 'application/json' }, body: JSON.stringify(p) });
    }
    const j = await r.json().catch(() => null) as (Record<string, unknown> & { error?: { code?: number; error_subcode?: number; type?: string; message?: string } }) | null;
    if (!r.ok || j?.error) {
      const e = j?.error;
      return { ok: false, kod: e?.code != null ? `GRAPH_${e.code}` : `HTTP_${r.status}`, sub: e?.error_subcode, tur: typeof e?.type === 'string' ? tozala(e.type, ...sirlar).slice(0, 40) : undefined, xabar: e?.message ? tozala(e.message, ...sirlar) : undefined };
    }
    return { ok: true, data: (j ?? {}) as T };
  } catch { return { ok: false, kod: 'TARMOQ' }; }
}

/* ───────── sahifa (id + sahifa tokeni) — har so'rovda /me/accounts dan ───────── */
type Hisob = { id?: string; name?: string; access_token?: string; instagram_business_account?: { id?: string; username?: string } };
export async function sahifaOl(env: MetaEnv): Promise<GraphJavob<Sahifa>> {
  if (!metaBormi(env)) return { ok: false, kod: 'META_SOZLANMAGAN' };
  const tok = String(env.META_TOKEN).trim();
  const r = await graph<{ data?: Hisob[] }>(env, 'GET', 'me/accounts', { fields: 'id,name,access_token,instagram_business_account{id,username}', limit: 100 }, tok);
  if (!r.ok) return r;
  const royxat = r.data.data ?? [];
  const ig = String(env.META_IG_ID ?? '').trim(); const pid = String(env.META_PAGE_ID ?? '').trim();
  const h = (pid && royxat.find((x) => x.id === pid)) || (ig && royxat.find((x) => x.instagram_business_account?.id === ig)) || royxat.find((x) => x.name === 'Qurai.uz');
  if (!h?.id || !h.access_token) return { ok: false, kod: 'SAHIFA_TOPILMADI' };
  return { ok: true, data: { id: h.id, nom: h.name ?? '', token: h.access_token, ig_id: h.instagram_business_account?.id ?? (ig || null), ig_username: h.instagram_business_account?.username ?? null } };
}

/* ───────── holat (token qaytmaydi) ───────── */
export async function metaHolat(env: MetaEnv) {
  const s = await sahifaOl(env);
  if (!s.ok) return { ok: false as const, token_ok: s.kod !== 'META_SOZLANMAGAN' && s.kod !== 'GRAPH_190', code: s.kod };
  const tok = String(env.META_TOKEN).trim();
  let huquqlar: string[] | null = null;
  const p = await graph<{ data?: { permission?: string; status?: string }[] }>(env, 'GET', 'me/permissions', {}, tok);
  if (p.ok) huquqlar = (p.data.data ?? []).filter((x) => x.status === 'granted').map((x) => String(x.permission));
  else {
    const d = await graph<{ data?: { scopes?: string[] } }>(env, 'GET', 'debug_token', { input_token: tok }, tok);
    if (d.ok) huquqlar = d.data.data?.scopes ?? null;
  }
  let username = s.data.ig_username;
  if (!username && s.data.ig_id) { const u = await graph<{ username?: string }>(env, 'GET', s.data.ig_id, { fields: 'username' }, s.data.token); if (u.ok) username = u.data.username ?? null; }
  return { ok: true as const, token_ok: true, sahifa: { id: s.data.id, nom: s.data.nom }, instagram: { id: s.data.ig_id, username }, huquqlar };
}

/* ───────── nashr ───────── */
export type TarmoqNatija = { ok: boolean; id?: string; havola?: string; kod?: string; holat?: 'kutilmoqda'; creation_id?: string };
const kod = (r: GraphXato): string => r.sub ? `${r.kod}/${r.sub}` : r.kod;
const kut = (ms: number) => (ms > 0 ? new Promise((x) => setTimeout(x, ms)) : Promise.resolve());

export async function fbNashr(env: MetaEnv, s: Sahifa, m: { matn: string; rasm?: string | null; video?: string | null }): Promise<TarmoqNatija> {
  const r = m.video ? await graph<{ id?: string }>(env, 'POST', `${s.id}/videos`, { file_url: m.video, description: m.matn }, s.token)
    : m.rasm ? await graph<{ id?: string; post_id?: string }>(env, 'POST', `${s.id}/photos`, { url: m.rasm, caption: m.matn }, s.token)
      : await graph<{ id?: string }>(env, 'POST', `${s.id}/feed`, { message: m.matn }, s.token);
  if (!r.ok) return { ok: false, kod: kod(r) };
  const id = (r.data as { post_id?: string }).post_id ?? r.data.id;
  if (!id) return { ok: false, kod: 'ID_YOQ' };
  const l = await graph<{ permalink_url?: string }>(env, 'GET', id, { fields: 'permalink_url' }, s.token);
  return { ok: true, id, havola: l.ok ? l.data.permalink_url : undefined };
}

async function igChiqar(env: MetaEnv, s: Sahifa, creationId: string): Promise<TarmoqNatija> {
  const p = await graph<{ id?: string }>(env, 'POST', `${s.ig_id}/media_publish`, { creation_id: creationId }, s.token);
  if (!p.ok) return { ok: false, kod: kod(p) };
  const l = p.data.id ? await graph<{ permalink?: string }>(env, 'GET', p.data.id, { fields: 'permalink' }, s.token) : null;
  return { ok: true, id: p.data.id, havola: l?.ok ? l.data.permalink : undefined };
}
/** Reels konteyneri holati: FINISHED bo'lsa chiqaradi; IN_PROGRESS — `kutilmoqda` (keyinroq «Tekshirish» tugmasi, kp:r:<id>). */
export async function igReelsYakunla(env: MetaEnv, s: Sahifa, creationId: string, urinish = 5): Promise<TarmoqNatija> {
  const ms = Number.isFinite(Number(env.META_POLL_MS)) ? Number(env.META_POLL_MS) : 3000;
  for (let i = 0; i < urinish; i++) {
    const h = await graph<{ status_code?: string }>(env, 'GET', creationId, { fields: 'status_code' }, s.token);
    if (!h.ok) return { ok: false, kod: kod(h) };
    const sc = h.data.status_code;
    if (sc === 'FINISHED') return igChiqar(env, s, creationId);
    if (sc === 'ERROR' || sc === 'EXPIRED') return { ok: false, kod: `IG_${sc}` };
    if (i < urinish - 1) await kut(ms);
  }
  return { ok: false, holat: 'kutilmoqda', creation_id: creationId, kod: 'IG_KUTILMOQDA' };
}
export async function igNashr(env: MetaEnv, s: Sahifa, m: { matn: string; rasm?: string | null; video?: string | null }): Promise<TarmoqNatija> {
  if (!s.ig_id) return { ok: false, kod: 'IG_ULANMAGAN' };
  if (!m.rasm && !m.video) return { ok: false, kod: 'MEDIA_KERAK' };
  const c = await graph<{ id?: string }>(env, 'POST', `${s.ig_id}/media`, m.video ? { media_type: 'REELS', video_url: m.video, caption: m.matn } : { image_url: m.rasm, caption: m.matn }, s.token);
  if (!c.ok) return { ok: false, kod: kod(c) };
  if (!c.data.id) return { ok: false, kod: 'ID_YOQ' };
  return m.video ? igReelsYakunla(env, s, c.data.id) : igChiqar(env, s, c.data.id);
}

/* ───────── statistika (haftalik hisobot uchun) ───────── */
const qisqa = (x: unknown) => String(x ?? '').replace(/\s+/g, ' ').slice(0, 80);
async function insights(env: MetaEnv, token: string, id: string, metrikalar: string): Promise<Record<string, number | null>> {
  const r = await graph<{ data?: { name?: string; values?: { value?: number }[]; total_value?: { value?: number } }[] }>(env, 'GET', `${id}/insights`, { metric: metrikalar }, token);
  const o: Record<string, number | null> = Object.fromEntries(metrikalar.split(',').map((k) => [k, null]));
  if (r.ok) for (const x of r.data.data ?? []) if (x.name) o[x.name] = x.values?.[0]?.value ?? x.total_value?.value ?? null;
  return o;
}
export async function statistika(env: MetaEnv, n: unknown) {
  const soni = Math.min(10, Math.max(1, Number.isSafeInteger(n) ? (n as number) : 5));
  const s = await sahifaOl(env);
  if (!s.ok) return { ok: false as const, status: s.kod === 'META_SOZLANMAGAN' ? 503 : 502, code: s.kod };
  const ig = s.data.ig_id
    ? await graph<{ data?: { id: string; caption?: string; media_type?: string; permalink?: string; timestamp?: string; like_count?: number; comments_count?: number }[] }>(env, 'GET', `${s.data.ig_id}/media`, { fields: 'id,caption,media_type,permalink,timestamp,like_count,comments_count', limit: soni }, s.data.token)
    : null;
  const fb = await graph<{ data?: { id: string; message?: string; created_time?: string; permalink_url?: string; reactions?: { summary?: { total_count?: number } }; comments?: { summary?: { total_count?: number } } }[] }>(env, 'GET', `${s.data.id}/posts`, { fields: 'id,message,created_time,permalink_url,reactions.summary(true).limit(0),comments.summary(true).limit(0)', limit: soni }, s.data.token);
  const igPostlar = ig?.ok ? await Promise.all((ig.data.data ?? []).slice(0, soni).map(async (m) => {
    const i = await insights(env, s.data.token, m.id, 'reach,impressions');
    return { id: m.id, tur: m.media_type ?? null, vaqt: m.timestamp ?? null, havola: m.permalink ?? null, matn: qisqa(m.caption), yoqtirish: m.like_count ?? null, izoh: m.comments_count ?? null, qamrov: i.reach, korish: i.impressions };
  })) : [];
  const fbPostlar = fb.ok ? await Promise.all((fb.data.data ?? []).slice(0, soni).map(async (m) => {
    const i = await insights(env, s.data.token, m.id, 'post_impressions_unique,post_impressions');
    return { id: m.id, vaqt: m.created_time ?? null, havola: m.permalink_url ?? null, matn: qisqa(m.message), reaksiya: m.reactions?.summary?.total_count ?? null, izoh: m.comments?.summary?.total_count ?? null, qamrov: i.post_impressions_unique, korish: i.post_impressions };
  })) : [];
  return {
    ok: true as const,
    instagram: ig ? (ig.ok ? { postlar: igPostlar } : { xato: kod(ig) }) : { xato: 'IG_ULANMAGAN' },
    facebook: fb.ok ? { postlar: fbPostlar } : { xato: kod(fb) },
  };
}
