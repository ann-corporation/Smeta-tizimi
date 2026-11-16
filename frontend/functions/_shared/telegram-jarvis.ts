import { onRequest as middleware } from '../api/_middleware';
import { onRequestPost as agent } from '../api/agent-ish';
import { botChaqiruv } from './telegram-amal';
import { limitOshdi } from './telegram-bot';
import { saytUrl, tengSatr, tgRpc, tgT, type TgEnv, type TgTil } from './telegram';

type Turn = { r: 'user' | 'ai'; m: string };
type Chat = { id: string; sarlavha: string };
type Snapshot =
  | { id: string; holat: 'missing' }
  | { id: string; holat: 'changed'; etag: string; xabarlar: Turn[] | null; qisqartma: string | null; arxivlangan?: true };
type Sync = { ok?: boolean; royxat?: Chat[]; suhbat?: Snapshot };
type PageCursor = { at: string; row: string };
type Page = { ok?: boolean; royxat?: Chat[]; keyingi?: PageCursor | null };
type Target = { company: number; id: string; mode: 'n' | 'o' };
export type JarvisBotReply = { matn: string; options?: Record<string, unknown>; transcript?: string[] };
export type JarvisReplyTo = { from?: { is_bot?: boolean }; entities?: { type?: string; url?: string }[] };
const CHAT_ID = /^[A-Za-z0-9_.-]{1,40}$/;
const VERSION = /^[a-f0-9]{32}$/;
const PREFIX = '#jarvis-tg=';
const FORCE_REPLY = { force_reply: true };
const number = (s: unknown): s is number => Number.isSafeInteger(s) && Number(s) > 0;
const sent = (status: number) => status >= 200 && status < 300;
const call = <T>(env: TgEnv, actor: number, json: Record<string, unknown>) =>
  botChaqiruv<T>(env, actor, { api: 'agent-ish', json }, middleware, agent);
const unavailable = (til: TgTil) => ({ matn: tgT('Jarvis suhbatini ochib bo‘lmadi. /jarvis orqali qayta tanlang.', til) });
const bounded = (s: string, max: number) => [...s.trim()].slice(0, max).join('');
const validTurns = (value: unknown): value is Turn[] => Array.isArray(value) && value.length <= 12 &&
  value.every(x => x && (x.r === 'user' || x.r === 'ai') && typeof x.m === 'string' && x.m.length <= 800);

function sync(env: TgEnv, actor: number, company: number, id?: string) {
  return call<Sync>(env, actor, { amal: 'suhbat_sync', kompaniya_id: company, ...(id ? { klient_id: id } : {}) });
}

function pageButton(company: number, cursor: PageCursor | null | undefined, til: TgTil) {
  if (typeof cursor?.at !== 'string' || typeof cursor.row !== 'string' || !/^[1-9]\d{0,18}$/.test(cursor.row)) return null;
  const milliseconds = Date.parse(cursor.at);
  if (!Number.isSafeInteger(milliseconds) || milliseconds < 1) return null;
  const fraction = /\.(\d{1,6})/.exec(cursor.at)?.[1]?.padEnd(6, '0') ?? '000000';
  const micros = BigInt(milliseconds) * 1000n + BigInt(fraction.slice(3));
  const data = `j:p:${company}:${micros}:${cursor.row}`;
  return data.length <= 64 ? { text: tgT('Eski suhbatlarni ko‘rish', til), callback_data: data } : null;
}

async function historyPage(env: TgEnv, actor: number, company: number, til: TgTil, before?: PageCursor): Promise<JarvisBotReply> {
  const r = await call<Page>(env, actor, { amal: 'suhbat_page', kompaniya_id: company,
    ...(before ? { before_at: before.at, before_row: before.row } : {}) });
  if (!sent(r.status) || !r.body?.ok || !Array.isArray(r.body.royxat)) return unavailable(til);
  const keyboard = [[{ text: tgT('Yangi Jarvis suhbati', til), callback_data: `j:n:${company}` }],
    ...r.body.royxat.slice(0, 20).flatMap(row => CHAT_ID.test(row.id) && typeof row.sarlavha === 'string'
      ? [[{ text: row.sarlavha.slice(0, 60) || row.id, callback_data: `j:o:${company}:${row.id}` }]] : [])];
  const next = pageButton(company, r.body.keyingi, til);
  if (next) keyboard.push([next]);
  return { matn: tgT('Jarvis suhbatini tanlang.', til), options: { reply_markup: { inline_keyboard: keyboard } } };
}

async function sign(env: TgEnv, actor: number, telegram: number, value: string): Promise<string | null> {
  const secret = env.SESSIYA_KALIT?.trim();
  if (!secret || secret.length < 16) return null;
  const encode = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encode.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, encode.encode(`jarvis-telegram:v1:${actor}:${telegram}:${value}`));
  return [...new Uint8Array(mac)].map(x => x.toString(16).padStart(2, '0')).join('');
}

async function prompt(env: TgEnv, actor: number, telegram: number, til: TgTil, target: Target, body = ''): Promise<JarvisBotReply> {
  const value = [target.company, target.id, target.mode, Math.floor(Date.now() / 60_000)].join(':');
  const signature = await sign(env, actor, telegram, value);
  if (!signature) return unavailable(til);
  const guide = tgT('Savolingizni shu xabarga javob qilib yozing.', til);
  const url = `${saytUrl(env)}/admin${PREFIX}${value}:${signature}`;
  return { matn: body ? `${guide}\n\n${body.slice(0, 3800)}` : guide, options: {
    reply_markup: FORCE_REPLY,
    entities: [{ type: 'text_link', offset: 0, length: guide.length, url }],
  } };
}

export async function telegramJarvisMenu(env: TgEnv, actor: number, til: TgTil): Promise<JarvisBotReply> {
  const r = await tgRpc<{ ok?: boolean; azoliklar?: Array<{ kompaniya_id?: number; nom?: string; faol?: boolean }> }>(
    env, 't2_men_v1', { p_actor_id: actor },
  );
  if (!r?.ok) return unavailable(til);
  const companies = new Map<number, string>();
  for (const row of r.azoliklar ?? []) {
    if (row.faol !== false && number(row.kompaniya_id)) companies.set(row.kompaniya_id, row.nom?.trim() || String(row.kompaniya_id));
  }
  if (!companies.size) return { matn: tgT('Hali hech qaysi ish joyiga a’zo emassiz.', til) };
  const keyboard = [...companies].slice(0, 30).map(([id, name]) => [{ text: name.slice(0, 60), callback_data: `j:c:${id}` }]);
  return { matn: tgT('Jarvis uchun kompaniyani tanlang.', til), options: { reply_markup: { inline_keyboard: keyboard } } };
}

export async function telegramJarvisSelect(env: TgEnv, actor: number, telegram: number, til: TgTil, data: string): Promise<JarvisBotReply> {
  const older = /^j:p:([1-9]\d{0,15}):([1-9]\d{0,17}):([1-9]\d{0,18})$/.exec(data);
  if (older) {
    const company = Number(older[1]);
    const micros = BigInt(older[2]);
    const time = new Date(Number(micros / 1000n));
    if (!number(company) || !Number.isFinite(time.getTime()) || time.getUTCFullYear() > 9999) return unavailable(til);
    const at = time.toISOString().replace(/Z$/, String(micros % 1000n).padStart(3, '0') + 'Z');
    return historyPage(env, actor, company, til, { at, row: older[3] });
  }
  const fields = /^j:([cno]):([1-9]\d*)(?::([A-Za-z0-9_.-]{1,40}))?$/.exec(data);
  const company = Number(fields?.[2]);
  const action = fields?.[1];
  const id = fields?.[3];
  if (!number(company) || (action === 'o' ? !id : !!id)) return unavailable(til);
  if (action === 'c') return historyPage(env, actor, company, til);
  const r = await sync(env, actor, company, id);
  if (!sent(r.status) || !r.body?.ok || !Array.isArray(r.body.royxat)) return unavailable(til);
  if (action === 'n') return prompt(env, actor, telegram, til, { company, id: crypto.randomUUID(), mode: 'n' });
  if (action === 'o' && id) {
    const chat = r.body.suhbat;
    if (chat?.id !== id || chat.holat !== 'changed') return unavailable(til);
    const name = r.body.royxat.find(row => row.id === id)?.sarlavha;
    const turns = chat.xabarlar;
    if (turns === null) {
      return { matn: [name, chat.qisqartma, tgT('Eski suhbat qisqartmasi. Davom etish uchun /jarvis orqali yangi suhbat oching.', til)].filter(Boolean).join('\n\n') };
    }
    if (!validTurns(turns)) return unavailable(til);
    const transcript: string[] = [];
    let page = '';
    for (const turn of turns) {
      const line = `${tgT(turn.r === 'user' ? 'Siz yozdingiz' : 'Jarvis', til)}: ${turn.m}`;
      if (page.length + line.length + 2 > 3900) { transcript.push(page); page = ''; }
      page = page ? page + '\n\n' + line : line;
    }
    if (page) transcript.push(page);
    if (chat.arxivlangan) return { matn: tgT('Arxiv suhbati. Davom etish uchun /jarvis orqali yangi suhbat oching.', til), transcript };
    const entry = await prompt(env, actor, telegram, til, { company, id, mode: 'o' }, name);
    return { ...entry, transcript };
  }
  return unavailable(til);
}

export async function telegramJarvisReply(
  env: TgEnv, actor: number, telegram: number, til: TgTil, replyTo: JarvisReplyTo | undefined, text: string,
): Promise<JarvisBotReply | null> {
  if (!replyTo?.from?.is_bot || !Array.isArray(replyTo.entities)) return null;
  const start = `${saytUrl(env)}/admin${PREFIX}`;
  const url = replyTo.entities.find(item => item?.type === 'text_link' && typeof item.url === 'string' && item.url.startsWith(start))?.url;
  if (!url) return null;
  const match = /^([1-9]\d{0,15}):([A-Za-z0-9_.-]{1,40}):([no]):(\d{1,10}):([a-f0-9]{64})$/.exec(url.slice(start.length));
  if (!match) return unavailable(til);
  const [, companyText, id, mode, minutes, tag] = match;
  const company = Number(companyText);
  const age = Math.floor(Date.now() / 60_000) - Number(minutes);
  if (!number(company) || age < 0 || age > 60) return unavailable(til);
  const expected = await sign(env, actor, telegram, match.slice(1, 5).join(':'));
  if (!expected || !tengSatr(tag, expected)) return unavailable(til);
  const savol = text.trim();
  if (!savol || savol.length > 1000) return { matn: tgT('Savol juda uzun (1000 belgigacha).', til) };
  if (limitOshdi('jarvis:' + actor, 5)) return { matn: tgT('Juda ko‘p so‘rov. Bir daqiqadan keyin urinib ko‘ring.', til) };
  const r = await sync(env, actor, company, id);
  const chat = r.body?.suhbat;
  if (!sent(r.status) || r.body?.ok !== true || chat?.id !== id) return unavailable(til);
  if (chat.holat === 'missing' ? mode !== 'n' :
    chat.holat !== 'changed' || chat.arxivlangan || !validTurns(chat.xabarlar) || !VERSION.test(chat.etag)) return unavailable(til);
  const tarix = chat.holat === 'changed' ? chat.xabarlar?.slice(-6).map(x => ({ rol: x.r === 'user' ? 'user' : 'assistant', matn: x.m })) : [];
  const answer = await call<{ ok?: boolean; javob?: string; xabar?: string; error?: string; sahifalar?: Array<{ yol?: string }> }>(env, actor,
    { amal: 'kasb_savol', kompaniya_id: company, savol, tarix, sahifa: '/telegram/jarvis' });
  const javob = typeof answer.body?.javob === 'string' ? answer.body.javob.trim() : '';
  if (!sent(answer.status) || answer.body?.ok !== true || !javob) {
    const error = answer.body?.xabar ?? answer.body?.error;
    return { matn: answer.status === 402 && typeof error === 'string' ? error.slice(0, 300) : unavailable(til).matn };
  }
  const result = await call<{ ok?: boolean; id?: string; etag?: string }>(env, actor, {
    amal: 'suhbat_mutate', kompaniya_id: company, klient_id: id,
    ...(chat.holat === 'changed' ? { harakat: 'append', etag: chat.etag } :
      { harakat: 'create', sarlavha: savol.replace(/\s+/g, ' ').slice(0, 80) }),
    xabarlar: [{ r: 'user', m: bounded(savol, 400) }, { r: 'ai', m: bounded(javob, 400) }],
  });
  if (!sent(result.status) || result.body?.ok !== true || result.body.id !== id || !VERSION.test(result.body.etag ?? '')) {
    return { matn: tgT('Xabar suhbatga saqlanmadi. /jarvis orqali yangilangan suhbatni oching.', til) + '\n\n' + javob.slice(0, 3700) };
  }
  const links = Array.isArray(answer.body?.sahifalar) ? answer.body.sahifalar.slice(0, 3).flatMap(page => {
    if (typeof page?.yol !== 'string' || page.yol.length > 240 || !/^\/admin(?:$|[/?#])/.test(page.yol)) return [];
    const url = new URL(saytUrl(env) + page.yol);
    return url.pathname === '/admin' || url.pathname.startsWith('/admin/') ? [url.href] : [];
  }) : [];
  const body = links.length ? [javob.slice(0, 2900), ...links].join('\n\n') : javob;
  return prompt(env, actor, telegram, til, { company, id, mode: 'o' }, body);
}
