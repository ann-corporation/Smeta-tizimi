/* Ijtimoiy nashr (Facebook + Instagram + Telegram): holat, tarmoqlar bilan qoralama, tasdiqdan keyin Graph chaqiruvlari, qisman xato, o'z origin, token sizmasligi. Graph va Telegram soxtalashtirilgan. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { imzola } from '../../_shared/auth';
import { onRequestPost as kanalPost } from './kanal';
import { updateIshla } from './webhook';

const TOKEN = '123456789:AAFakeSinovTokenFakeSinovToken_abc';
const META = 'EAAFakeMetaSystemUserTokenXXXXXXXXXXXXXXXXXXXXXXXX';
const PAGE_TOK = 'EAAFakePageAccessTokenYYYYYYYYYYYYYYYYYYYYYYYYYYYY';
const SITE = 'https://qurai.uz';
const OWNER = 1; const OWNER_TG = 5550001; const IG = '17841473771174115';
const r2 = () => { const m = new Map<string, string>(); return { m, put: async (k: string, v: string) => { m.set(k, v); }, get: async (k: string) => (m.has(k) ? { json: async () => JSON.parse(m.get(k)!) } : null) }; };
const mkEnv = (o: Record<string, unknown> = {}) => ({ SUPABASE_URL: 'https://sinov.supabase.co', SUPABASE_KEY: 'server-only', SESSIYA_KALIT: 'k'.repeat(32), TELEGRAM_BOT_TOKEN: TOKEN,
  TELEGRAM_WEBHOOK_SECRET: 'webhook-sir-sinov-0123456789', TG_KANAL: '@qurai_uz', TG_GURUH: '-1001234567890', R2_CANONICAL: r2(),
  META_TOKEN: META, META_PAGE_ID: '', META_IG_ID: IG, META_GRAPH_VERSION: 'v21.0', META_POLL_MS: '0', ...o });

type Chaqiruv = { usul: string; yol: string; yuk: any; auth: string | null };
function tarmoq(opts: { reelsHolat?: string[]; igXato?: boolean; fbXato?: boolean } = {}) {
  const tg: { metod: string; yuk: any }[] = []; const gr: Chaqiruv[] = [];
  const holatlar = [...(opts.reelsHolat ?? ['FINISHED'])];
  vi.stubGlobal('fetch', vi.fn(async (raw: string, init?: RequestInit) => {
    const url = new URL(raw);
    if (url.host === 'api.telegram.org') {
      const metod = url.pathname.split('/').at(-1)!; tg.push({ metod, yuk: init?.body ? JSON.parse(String(init.body)) : {} });
      if (metod === 'sendMessage' || metod === 'sendPhoto' || metod === 'sendVideo') return Response.json({ ok: true, result: { message_id: 901 } });
      return Response.json({ ok: true, result: true });
    }
    if (url.host === 'graph.facebook.com') {
      const yol = url.pathname.replace(/^\/v21\.0\//, '');
      const yuk = init?.body ? JSON.parse(String(init.body)) : Object.fromEntries(url.searchParams);
      const auth = new Headers(init?.headers).get('Authorization');
      gr.push({ usul: init?.method ?? 'GET', yol, yuk, auth });
      if (yol === 'me/accounts') return Response.json({ data: [{ id: 'P0', name: 'Boshqa' }, { id: 'P1', name: 'Qurai.uz', access_token: PAGE_TOK, instagram_business_account: { id: IG, username: 'qurai.uz' } }] });
      if (yol === 'me/permissions') return Response.json({ data: [{ permission: 'pages_manage_posts', status: 'granted' }, { permission: 'instagram_content_publish', status: 'granted' }, { permission: 'x', status: 'declined' }] });
      if (yol === `${IG}/media` && init?.method === 'POST') return opts.igXato ? Response.json({ error: { code: 10, error_subcode: 2207, type: 'OAuthException', message: `bad ${PAGE_TOK} token` } }, { status: 400 }) : Response.json({ id: 'C1' });
      if (yol === 'C1') return Response.json({ status_code: holatlar.length > 1 ? holatlar.shift() : holatlar[0] });
      if (yol === `${IG}/media_publish`) return Response.json({ id: 'M1' });
      if (yol === 'M1') return Response.json({ permalink: 'https://www.instagram.com/p/abc/' });
      if (yol === 'P1/photos') return opts.fbXato ? Response.json({ error: { code: 200, type: 'OAuthException', message: 'perm' } }, { status: 403 }) : Response.json({ id: 'F1', post_id: 'P1_F1' });
      if (yol === 'P1/videos') return Response.json({ id: 'V1' });
      if (yol === 'P1/feed') return Response.json({ id: 'P1_F2' });
      if (/^P1_[A-Z0-9]+$|^V1$/.test(yol)) return Response.json({ permalink_url: 'https://www.facebook.com/p/' + yol });
      if (yol === `${IG}/media` ) return Response.json({ data: [] });
      if (yol === 'P1/posts') return Response.json({ data: [{ id: 'P1_9', message: 'salom', reactions: { summary: { total_count: 4 } }, comments: { summary: { total_count: 1 } } }] });
      if (yol === 'P1_9/insights') return Response.json({ data: [{ name: 'post_impressions_unique', values: [{ value: 77 }] }, { name: 'post_impressions', values: [{ value: 99 }] }] });
      return Response.json({ error: { code: 100, message: 'yoq' } }, { status: 404 });
    }
    const nom = url.pathname.split('/').at(-1)!;
    if (nom === 't2_boshqaruv_umumiy_v1') return Response.json({ foydalanuvchi: { jami: 1 } });
    if (nom === 't2_telegram_manzil_v1') return Response.json({ ok: true, yuborish: true, chat_id: OWNER_TG, til: 'uz' });
    if (nom === 't2_telegram_update_qabul_v1') return Response.json({ ok: true, yangi: true, limit: false });
    if (nom === 't2_telegram_aniqla_v1') return Response.json({ ok: true, ulangan: true, foydalanuvchi_id: OWNER });
    return Response.json({ message: 'yoq' }, { status: 404 });
  }));
  return { tg, gr };
}
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const cookie = async () => 'sess=' + await imzola({ rol: 'pto', foydalanuvchi_id: OWNER, kompaniyalar: [] }, 'k'.repeat(32));
const post = async (env: ReturnType<typeof mkEnv>, body: unknown) => kanalPost({ request: new Request(SITE + '/api/telegram/kanal', { method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: SITE, Cookie: await cookie() }, body: JSON.stringify(body) }), env } as never);
const cb = (data: string, id: number) => ({ update_id: id, callback_query: { id: 'c' + id, from: { id: OWNER_TG, language_code: 'uz' }, data, message: { message_id: 5, chat: { id: OWNER_TG, type: 'private' } } } });
const qid = (env: ReturnType<typeof mkEnv>) => [...env.R2_CANONICAL.m.keys()].find((k) => k.startsWith('tg-kanal/qoralama/'))!.split('/').pop()!.replace('.json', '');
const hammasi = (env: ReturnType<typeof mkEnv>) => JSON.stringify([...env.R2_CANONICAL.m.values()]);
const auditlar = (env: ReturnType<typeof mkEnv>) => [...env.R2_CANONICAL.m.entries()].filter(([k]) => k.startsWith('tg-kanal/audit/')).map(([, v]) => JSON.parse(v) as { amal: string; tarmoqlar?: string[] });
const egasiga = (tg: { metod: string; yuk: any }[]) => tg.filter((x) => x.metod === 'sendMessage' && x.yuk.chat_id === OWNER_TG).map((x) => String(x.yuk.text));

describe('meta_holat va statistika', () => {
  it('meta_holat: sahifa, instagram, huquqlar; token qaytmaydi; tizim tokeni Bearer da', async () => {
    const { gr } = tarmoq(); const env = mkEnv();
    const t = await (await post(env, { amal: 'meta_holat' })).text();
    expect(t).not.toContain(META); expect(t).not.toContain(PAGE_TOK);
    expect(JSON.parse(t)).toMatchObject({ ok: true, token_ok: true, sahifa: { id: 'P1', nom: 'Qurai.uz' }, instagram: { id: IG, username: 'qurai.uz' }, huquqlar: ['pages_manage_posts', 'instagram_content_publish'] });
    expect(gr[0].auth).toBe('Bearer ' + META);
    expect(gr.every((x) => !JSON.stringify(x.yuk).includes(META))).toBe(true);   // token so'rov tanasi/URL da emas
  });
  it('META_TOKEN yo‘q → ok:false token_ok:false', async () => {
    tarmoq(); const r = await (await post(mkEnv({ META_TOKEN: '' }), { amal: 'meta_holat' })).json();
    expect(r).toMatchObject({ ok: false, token_ok: false, code: 'META_SOZLANMAGAN' });
  });
  it('statistika: FB postlari insights bilan; IG ro‘yxati bo‘sh bo‘lsa ham ishlaydi', async () => {
    tarmoq(); const env = mkEnv();
    const r = await (await post(env, { amal: 'statistika', n: 3 })).json() as any;
    expect(r.ok).toBe(true);
    expect(r.facebook.postlar[0]).toMatchObject({ id: 'P1_9', reaksiya: 4, izoh: 1, qamrov: 77, korish: 99 });
    expect(auditlar(env).map((a) => a.amal)).toContain('statistika');
  });
});

describe('post_taklif: tarmoqlar', () => {
  it('standart: media bor → uchala tarmoq; egasiga qoralama, hech narsa chiqmaydi', async () => {
    const { tg, gr } = tarmoq(); const env = mkEnv();
    expect((await post(env, { amal: 'post_taklif', chat: 'kanal', matn: 'Salom', rasm: SITE + '/a.png' })).status).toBe(200);
    expect(JSON.parse(env.R2_CANONICAL.m.get(`tg-kanal/qoralama/${qid(env)}.json`)!).tarmoqlar).toEqual(['telegram', 'facebook', 'instagram']);
    expect(egasiga(tg)[0]).toContain('telegram, facebook, instagram');
    expect(gr).toEqual([]); expect(tg.some((x) => x.yuk.chat_id === '@qurai_uz')).toBe(false);
  });
  it('matn-only standart: instagram‘siz; META yo‘q → faqat telegram', async () => {
    tarmoq(); const env = mkEnv(); await post(env, { amal: 'post_taklif', chat: 'kanal', matn: 'x' });
    expect(JSON.parse(env.R2_CANONICAL.m.get(`tg-kanal/qoralama/${qid(env)}.json`)!).tarmoqlar).toEqual(['telegram', 'facebook']);
    const e2 = mkEnv({ META_TOKEN: '' }); await post(e2, { amal: 'post_taklif', chat: 'kanal', matn: 'x' });
    expect(JSON.parse(e2.R2_CANONICAL.m.get(`tg-kanal/qoralama/${qid(e2)}.json`)!).tarmoqlar).toEqual(['telegram']);
  });
  it('xato kirishlar: nomalum tarmoq, instagram mediasiz, o‘zga origin rasm/video, rasm+video, META yo‘q', async () => {
    tarmoq(); const env = mkEnv();
    const k = (o: object) => post(env, { amal: 'post_taklif', chat: 'kanal', matn: 'x', ...o });
    expect((await k({ tarmoqlar: ['tiktok'] })).status).toBe(400);
    expect((await k({ tarmoqlar: [] })).status).toBe(400);
    expect(await (await k({ tarmoqlar: ['instagram'] })).json()).toMatchObject({ code: 'MEDIA_KERAK' });
    expect(await (await k({ tarmoqlar: ['instagram'], rasm: 'https://evil.example/a.png' })).json()).toMatchObject({ code: 'RASM_MANZIL_NOTOGRI' });
    expect(await (await k({ tarmoqlar: ['instagram'], video: 'https://evil.example/a.mp4' })).json()).toMatchObject({ code: 'VIDEO_MANZIL_NOTOGRI' });
    expect(await (await k({ tarmoqlar: ['instagram'], video: SITE + '/a.mov' })).json()).toMatchObject({ code: 'VIDEO_MANZIL_NOTOGRI' });
    expect(await (await k({ rasm: SITE + '/a.png', video: SITE + '/a.mp4' })).json()).toMatchObject({ code: 'MEDIA_IKKALASI' });
    expect((await post(mkEnv({ META_TOKEN: '' }), { amal: 'post_taklif', chat: 'kanal', matn: 'x', tarmoqlar: ['facebook'] })).status).toBe(503);
    expect(env.R2_CANONICAL.m.size).toBe(0);
  });
});

describe('Chiqarish: har tarmoqqa Graph chaqiruvi', () => {
  it('rasm: IG media→media_publish, FB photos, Telegram sendPhoto; natija egasiga havola bilan; audit; token sizmaydi', async () => {
    const { tg, gr } = tarmoq(); const env = mkEnv();
    await post(env, { amal: 'post_taklif', chat: 'kanal', matn: 'Salom QURAI', rasm: SITE + '/a.png', tarmoqlar: ['telegram', 'facebook', 'instagram'] });
    const id = qid(env); tg.length = 0; gr.length = 0;
    expect(await updateIshla(env as never, cb(`kp:y:${id}`, 10))).toBe('kp_chiqarildi');
    expect(tg.find((x) => x.metod === 'sendPhoto')!.yuk).toMatchObject({ chat_id: '@qurai_uz', photo: SITE + '/a.png' });
    const ig = gr.find((x) => x.yol === `${IG}/media`)!; expect(ig.yuk).toEqual({ image_url: SITE + '/a.png', caption: 'Salom QURAI' });
    expect(gr.find((x) => x.yol === `${IG}/media_publish`)!.yuk).toEqual({ creation_id: 'C1' });
    expect(gr.find((x) => x.yol === 'P1/photos')!.yuk).toEqual({ url: SITE + '/a.png', caption: 'Salom QURAI' });
    expect(gr.filter((x) => x.usul === 'POST').every((x) => x.auth === 'Bearer ' + PAGE_TOK)).toBe(true);   // sahifa tokeni bilan
    const m = egasiga(tg).join('\n');
    expect(m).toContain('Telegram: ✅ https://t.me/qurai_uz/901'); expect(m).toContain('Facebook: ✅ https://www.facebook.com/p/P1_F1'); expect(m).toContain('Instagram: ✅ https://www.instagram.com/p/abc/');
    expect(auditlar(env).map((a) => a.amal)).toEqual(expect.arrayContaining(['chiqarish_urinish', 'ijtimoiy_telegram', 'ijtimoiy_facebook', 'ijtimoiy_instagram', 'chiqarildi']));
    expect(await updateIshla(env as never, cb(`kp:y:${id}`, 11))).toBe('kp_yopiq');   // takror bosish qayta chiqarmaydi
    for (const s of [hammasi(env), JSON.stringify(tg), m]) { expect(s).not.toContain(META); expect(s).not.toContain(PAGE_TOK); }
  });
  it('reel: REELS + video_url, status FINISHED kutiladi, so‘ng media_publish; FB videos; Telegram sendVideo', async () => {
    const { tg, gr } = tarmoq({ reelsHolat: ['IN_PROGRESS', 'FINISHED'] }); const env = mkEnv();
    await post(env, { amal: 'post_taklif', chat: 'kanal', matn: 'Reel', video: SITE + '/v.mp4' });
    const id = qid(env); tg.length = 0; gr.length = 0;
    expect(await updateIshla(env as never, cb(`kp:y:${id}`, 20))).toBe('kp_chiqarildi');
    expect(gr.find((x) => x.yol === `${IG}/media`)!.yuk).toEqual({ media_type: 'REELS', video_url: SITE + '/v.mp4', caption: 'Reel' });
    expect(gr.filter((x) => x.yol === 'C1')).toHaveLength(2);
    expect(gr.find((x) => x.yol === 'P1/videos')!.yuk).toEqual({ file_url: SITE + '/v.mp4', description: 'Reel' });
    expect(tg.find((x) => x.metod === 'sendVideo')!.yuk).toMatchObject({ video: SITE + '/v.mp4' });
  });
  it('reel tayyor bo‘lmasa: kutish holati + «Tekshirish» tugmasi; keyin kp:r bilan yakunlanadi', async () => {
    const { tg, gr } = tarmoq({ reelsHolat: ['IN_PROGRESS'] }); const env = mkEnv();
    await post(env, { amal: 'post_taklif', chat: 'kanal', matn: 'Reel', video: SITE + '/v.mp4', tarmoqlar: ['instagram'] });
    const id = qid(env); tg.length = 0;
    expect(await updateIshla(env as never, cb(`kp:y:${id}`, 30))).toBe('kp_qisman');
    expect(JSON.parse(env.R2_CANONICAL.m.get(`tg-kanal/qoralama/${id}.json`)!)).toMatchObject({ holat: 'kutish', natijalar: { instagram: { creation_id: 'C1', holat: 'kutilmoqda' } } });
    const kv = tg.find((x) => x.yuk.reply_markup?.inline_keyboard?.[0]?.[0]?.callback_data === `kp:r:${id}`); expect(kv).toBeTruthy();
    expect(gr.some((x) => x.yol === `${IG}/media_publish`)).toBe(false);
    expect(await updateIshla(env as never, cb(`kp:r:${id}`, 31))).toBe('kp_ig_kutish');
    vi.unstubAllGlobals(); const n2 = tarmoq({ reelsHolat: ['FINISHED'] });
    expect(await updateIshla(env as never, cb(`kp:r:${id}`, 32))).toBe('kp_chiqarildi');
    expect(n2.gr.some((x) => x.yol === `${IG}/media_publish`)).toBe(true);
    expect(JSON.parse(env.R2_CANONICAL.m.get(`tg-kanal/qoralama/${id}.json`)!).holat).toBe('chiqarildi');
  });
  it('qisman xato: FB rad etdi, IG/Telegram chiqdi — xato kodi egasiga, xom Graph tanasi/token yo‘q', async () => {
    const { tg } = tarmoq({ fbXato: true }); const env = mkEnv();
    await post(env, { amal: 'post_taklif', chat: 'kanal', matn: 'Salom', rasm: SITE + '/a.png', tarmoqlar: ['telegram', 'facebook', 'instagram'] });
    const id = qid(env); tg.length = 0;
    expect(await updateIshla(env as never, cb(`kp:y:${id}`, 40))).toBe('kp_qisman');
    const m = egasiga(tg).join('\n');
    expect(m).toContain('Facebook: ❌ GRAPH_200'); expect(m).toContain('Instagram: ✅'); expect(m).toContain('Telegram: ✅');
    expect(JSON.parse(env.R2_CANONICAL.m.get(`tg-kanal/qoralama/${id}.json`)!).holat).toBe('chiqarildi');
  });
  it('hammasi rad: IG xato matnida token bor — sizmaydi; holat xato; kp_rad', async () => {
    const { tg } = tarmoq({ igXato: true }); const env = mkEnv();
    await post(env, { amal: 'post_taklif', chat: 'kanal', matn: 'x', rasm: SITE + '/a.png', tarmoqlar: ['instagram'] });
    const id = qid(env); tg.length = 0;
    expect(await updateIshla(env as never, cb(`kp:y:${id}`, 50))).toBe('kp_rad');
    expect(egasiga(tg).join('\n')).toContain('Instagram: ❌ GRAPH_10/2207');
    for (const s of [hammasi(env), JSON.stringify(tg)]) { expect(s).not.toContain(PAGE_TOK); expect(s).not.toContain(META); }
    expect(JSON.parse(env.R2_CANONICAL.m.get(`tg-kanal/qoralama/${id}.json`)!).holat).toBe('xato');
  });
});
