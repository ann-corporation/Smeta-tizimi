/**
 * telegram-toliq-yadro.ts — @qur_uz_bot «to'liq bot» poydevori (docs/ops/TELEGRAM_BOT_QAMROV.md).
 *
 * Umumiy qismlar: doimiy menyu (rol bo'yicha), joriy obyekt konteksti, sahifalash, yo'l (breadcrumb), odam o'qiydigan xato matnlari,
 * force_reply belgilari. Server holati YO'Q: kontekst Telegram chat menyu tugmasida (mavjud `menyuTugmasi` mexanizmi) va callback_data da yuradi.
 *
 * QOIDALAR: `uid` faqat Telegram↔foydalanuvchi bog'lanishidan; hamma o'qish/yozish MAVJUD shlyuzlar orqali (`botChaqiruv`: middleware → shlyuz);
 * callback_data ≤ 64 bayt, faqat qisqa id; id lar serverda qayta tekshiriladi. Matn/summa/chat_id/token loglanmaydi.
 */
import { type TgEnv, type TgTil, tgApi, tgRpc, tgT } from './telegram';
import { IJRO_ROLLARI, type BotJavob } from './telegram-bot';

export type BotEnv = TgEnv & Record<string, unknown>;
export type CbNatija = { toast: string; xabar?: BotJavob; tugmalarniOlibTashla?: boolean; amal: string };

export const G = 'g:';
export const SAHIFA = 6;
export const musbat = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
export const bosh = (s: unknown, n: number) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
/** `g:x:12:34` → ['12','34'] (faqat raqamlar); prefiks mos kelmasa/raqam bo'lmasa null. */
export const sonlar = (data: string, prefiks: string, kamida: number, kopi: number): number[] | null => {
  if (!data.startsWith(prefiks)) return null;
  const p = data.slice(prefiks.length).split(':');
  if (p.length < kamida || p.length > kopi || !p.every((x) => /^\d{1,15}$/.test(x))) return null;
  const n = p.map(Number);
  return n.every((x) => Number.isSafeInteger(x)) ? n : null;
};

/* ───────── rol va kompaniyalar ───────── */
export type Azolik = { id: number; nom: string; rol: string };
export type RolMalumot = { ijro: boolean; superadmin: boolean; kompaniyalar: Azolik[] };
type Men = { ok?: boolean; platform_role?: string; azoliklar?: { kompaniya_id?: number; nom?: string; rol?: string; faol?: boolean }[] };

export async function rolOl(env: BotEnv, uid: number): Promise<RolMalumot | null> {
  const m = await tgRpc<Men>(env, 't2_men_v1', { p_actor_id: uid });
  if (!m?.ok) return null;
  const kompaniyalar = (m.azoliklar ?? []).filter((a) => a.faol !== false && musbat(a.kompaniya_id))
    .slice(0, 20).map((a) => ({ id: a.kompaniya_id as number, nom: bosh(a.nom, 40) || String(a.kompaniya_id), rol: String(a.rol ?? '') }));
  const superadmin = m.platform_role === 'superadmin';
  return { superadmin, kompaniyalar, ijro: superadmin || kompaniyalar.some((k) => IJRO_ROLLARI.has(k.rol)) };
}

/* ───────── doimiy menyu (reply keyboard) ───────── */
const YORLIQ = {
  obyektlar: 'Obyektlar', bugun: 'Bugun', tasdiq: 'Tasdiqlar', bildirish: 'Bildirishnomalar', fakt: 'Fakt kiritish',
  f2: 'F-2', hujjat: 'Hujjatlar', jarvis: 'Jarvis', menyu: 'Menyu',
} as const;
export type MenyuAmal = keyof typeof YORLIQ;

/** Reply keyboard tugmasi matni (uz/ru/en) → amal. Tugma bosilganda Telegram shu matnni oddiy xabar qilib yuboradi. */
export function menyuAmali(matn: string): MenyuAmal | null {
  const t = matn.trim().toLowerCase();
  if (!t || t.length > 40) return null;
  for (const [amal, kalit] of Object.entries(YORLIQ)) {
    for (const til of ['uz', 'ru', 'en'] as const) if (tgT(kalit, til).toLowerCase() === t) return amal as MenyuAmal;
  }
  return null;
}

/** Rol bo'yicha doimiy klaviatura: ijro rollari (PTO/prorab/…) fakt, F-2 va hujjat qatorini ham oladi. */
export function doimiyMenyu(til: TgTil, ijro: boolean) {
  const t = (a: MenyuAmal) => ({ text: tgT(YORLIQ[a], til) });
  const qatorlar = [
    [t('obyektlar'), t('bugun')],
    ...(ijro ? [[t('fakt'), t('f2'), t('hujjat')]] : [[t('hujjat')]]),
    [t('tasdiq'), t('bildirish')],
    [t('jarvis'), t('menyu')],
  ];
  return { keyboard: qatorlar, resize_keyboard: true, is_persistent: true, input_field_placeholder: tgT('Buyruq yoki savol yozing…', til) };
}

/** Inline asosiy menyu (g:m). */
export function asosiyMenyuJavobi(til: TgTil, ijro: boolean): BotJavob {
  const b = (kalit: string, data: string) => ({ text: tgT(kalit, til), callback_data: data });
  return {
    matn: [yol(til), tgT('Nimani bajaramiz? Obyektni tanlasangiz, keyingi amallar shu obyektda bajariladi.', til)].join('\n'),
    markup: { inline_keyboard: [
      [b('Obyektlar', 'g:o:0'), b('Obyekt qidirish', 'g:s')],
      ...(ijro ? [[b('Fakt kiritish', 'g:y'), b('F-2', 'g:f')]] : []),
      [b('Hujjatlar', 'g:h'), b('Tasdiqlar', 'g:t:0')],
      [b('Bildirishnomalar', 'g:n:0'), b('Bugun', 'm:b')],
      [b('Xatlar', 'g:q:0'), b('Topshiriqlar', 'g:z:0:0'), b('Tokenlar', 'g:tk')],
    ] },
  };
}

/* ───────── joriy obyekt konteksti ───────── */
/** Chat uchun «joriy obyekt» = Telegram menyu tugmasidagi `obyekt=<id>` (mavjud `menyuTugmasi` shuni yozadi). */
export async function joriyObyektId(env: BotEnv, chatId: number): Promise<number | null> {
  try {
    const r = await tgApi<{ web_app?: { url?: string } }>(env, 'getChatMenuButton', { chat_id: chatId });
    const m = /obyekt%3D(\d{1,12})/.exec(r.result?.web_app?.url ?? '');
    return m ? Number(m[1]) : null;
  } catch { return null; }
}

/* ───────── yo'l (breadcrumb), sahifalash, tugmalar ───────── */
export const yol = (til: TgTil, ...qismlar: string[]) => [tgT('Menyu', til), ...qismlar].join(' › ');

export function sahifala<T>(arr: readonly T[], p: number, olcham = SAHIFA) {
  const jami = Math.max(1, Math.ceil(arr.length / olcham));
  const sah = Math.min(Math.max(0, Math.trunc(p) || 0), jami - 1);
  return { qism: arr.slice(sah * olcham, sah * olcham + olcham), sah, jami };
}
/** ‹ n/m › qatori (bitta sahifa bo'lsa — bo'sh). */
export function navQatori(sah: number, jami: number, data: (p: number) => string): Record<string, unknown>[][] {
  if (jami <= 1) return [];
  const q: Record<string, unknown>[] = [];
  if (sah > 0) q.push({ text: '‹', callback_data: data(sah - 1) });
  q.push({ text: `${sah + 1}/${jami}`, callback_data: data(sah) });
  if (sah + 1 < jami) q.push({ text: '›', callback_data: data(sah + 1) });
  return [q];
}
export const orqaQatori = (til: TgTil, data: string) => [{ text: '‹ ' + tgT('Orqaga', til), callback_data: data }, { text: tgT('Menyu', til), callback_data: 'g:m' }];

/* ───────── xato matnlari (odam o'qiydigan) ───────── */
export const XATO_OQISH = 'Ma’lumotni o‘qib bo‘lmadi. Birozdan keyin urinib ko‘ring.';
export function xatoMatni(til: TgTil, status: number): string {
  if (status === 401 || status === 403) return tgT('Bu amal uchun ruxsatingiz yo‘q.', til);
  if (status === 402) return tgT('Tokenlar yetarli emas — hisobni to‘ldiring.', til);
  if (status === 404) return tgT('Topilmadi yoki sizga ochiq emas.', til);
  if (status === 409 || status === 410) return tgT('Ma’lumot o‘zgargan yoki muddati o‘tgan. Qaytadan boshlang.', til);
  if (status === 429) return tgT('Juda ko‘p so‘rov. Bir daqiqadan keyin urinib ko‘ring.', til);
  return tgT(XATO_OQISH, til);
}

/* ───────── force_reply belgilari: [gs:kid] [gq:oid] [gh:oid:qid] [ge:oid:akt:qid] ───────── */
export const BELGI = /\[(gs|gq|gh|ge|gz|gv|gy):(\d{1,15})(?::(\d{1,15}))?(?::(\d{1,15}))?\]/;
export type GKontekst = { tur: 'gs' | 'gq' | 'gh' | 'ge' | 'gz' | 'gv' | 'gy'; a: number; b: number | null; c: number | null };
export function gKonteksti(reply: { from?: { is_bot?: boolean }; text?: string } | undefined): GKontekst | null {
  if (!reply?.from?.is_bot || typeof reply.text !== 'string') return null;
  const m = BELGI.exec(reply.text);
  if (!m) return null;
  const n = (s: string | undefined) => (s == null ? null : Number(s));
  const a = Number(m[2]);
  return Number.isSafeInteger(a) ? { tur: m[1] as GKontekst['tur'], a, b: n(m[3]), c: n(m[4]) } : null;
}
export function soraydi(til: TgTil, matn: string, belgi: string, placeholder: string): BotJavob {
  return { matn: [matn, belgi].join('\n'), markup: { force_reply: true, input_field_placeholder: tgT(placeholder, til), selective: true } };
}
