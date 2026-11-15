/**
 * telegram-username.ts — bot orqali @username (USERNAME-V1): /username, /start da Telegram username taklifi (tasdiq tugmasi bilan), /taklif.
 * Mantiq serverda: bot faqat RPC chaqiradi (t2_username_*, t2_kompaniya_taklif_yubor_v1 — huquq, band so'zlar, noyoblik, limit RPC ichida).
 * `uid` FAQAT bog'langan foydalanuvchidan (t2_telegram_aniqla_v1). Telegram username tasdiqsiz yozilmaydi (callback tugmasi bilan).
 * Telegram username/telefon logga yozilmaydi va bazada alohida saqlanmaydi.
 */
import { type TgEnv, type TgTil, tgRpc, tgT } from './telegram';
import { qiymatTuri, usernameNorm, usernameXato } from './username';

export const USR_HA = 'usr:ha:';
export const USR_YOQ = 'usr:yoq';
const ROLLAR = ['rahbar', 'bugalter', 'pto', 'prorab', 'buyurtmachi', 'pudratchi', 'kuzatuvchi'];

type Ol = { ok?: boolean; username?: string | null; bugun_qoldi?: number };
type Natija = { ok?: boolean; code?: string; username?: string | null; profil?: { ism?: string; username?: string | null } };
type Men = { ok?: boolean; azoliklar?: { kompaniya_id?: number; nom?: string; kod?: string; is_director?: boolean; faol?: boolean }[] };

const XATO: Record<string, string> = {
  USERNAME_QISQA: 'Username kamida 5 belgi bo‘lsin.',
  USERNAME_UZUN: 'Username 32 belgidan oshmasin.',
  USERNAME_FORMAT: 'Faqat kichik lotin harflari, raqamlar va pastki chiziq (_) mumkin.',
  USERNAME_BOSHLANISH: 'Username harf bilan boshlanishi kerak.',
  USERNAME_UNDERSCORE: 'Ketma-ket ikki pastki chiziq va oxirgi pastki chiziq mumkin emas.',
  USERNAME_BAND_SOZ: 'Bu nom tizim uchun band qilingan.',
  USERNAME_BAND: 'Bu username band.',
  USERNAME_LIMIT: 'Bugun username’ni o‘zgartirish limiti tugadi (kuniga 5 marta).',
};

/** Telegram username i QURAI qoidalariga mos bo'lsa — kichik harfda; aks holda null. */
export const tgUsernameMos = (tg: unknown): string | null => { const n = usernameNorm(tg); return n && !usernameXato(n) ? n : null; };

/** /start: QURAI username bo'sh va Telegram username mos bo'lsa — tasdiq so'raladi (BotJavob shaklida) yoki null. */
export async function usernameTaklifi(env: TgEnv, uid: number, til: TgTil, tgUsername: unknown): Promise<{ matn: string; markup: Record<string, unknown> } | null> {
  const tg = tgUsernameMos(tgUsername);
  if (!tg) return null;
  const j = await tgRpc<Ol>(env, 't2_username_ol_v1', { p_actor_id: uid });
  if (!j?.ok || j.username) return null;
  return {
    matn: tgT('Telegram’ingizda @{tg} username bor. Shuni QURAI username’i qilaylikmi? Odamlar sizni shu orqali topib, kompaniyaga qo‘shadi.', til, { tg }),
    markup: { inline_keyboard: [[{ text: tgT('Ha, @{tg} bo‘lsin', til, { tg }), callback_data: USR_HA + tg }, { text: tgT('Yo‘q, keyinroq', til), callback_data: USR_YOQ }]] },
  };
}

async function belgila(env: TgEnv, uid: number, til: TgTil, nom: string): Promise<string> {
  const r = await tgRpc<Natija>(env, 't2_username_belgila_v1', { p_actor_id: uid, p_username: nom, p_operation_id: crypto.randomUUID() });
  if (r?.ok) return tgT('Username o‘rnatildi: @{u}', til, { u: r.username ?? nom });
  if (r?.code && XATO[r.code]) return tgT(XATO[r.code], til);
  return tgT('Username o‘rnatilmadi. Keyinroq urinib ko‘ring.', til);
}

/** Inline tugma: `usr:ha:<nom>` (tasdiq) yoki `usr:yoq`. Qiymat serverda qayta tekshiriladi. */
export async function usernameCallback(env: TgEnv, uid: number, til: TgTil, data: string): Promise<{ toast: string; xabar?: { matn: string }; tugmalarniOlibTashla: boolean; amal: string }> {
  if (data === USR_YOQ) return { toast: tgT('Xo‘p, keyinroq', til), tugmalarniOlibTashla: true, amal: 'usr_yoq' };
  const nom = usernameNorm(data.slice(USR_HA.length));
  if (!nom || usernameXato(nom)) return { toast: tgT('Username mos emas', til), tugmalarniOlibTashla: true, amal: 'usr_notogri' };
  return { toast: '', xabar: { matn: await belgila(env, uid, til, nom) }, tugmalarniOlibTashla: true, amal: 'usr_ha' };
}

/** /username  — ko'rsatadi; /username <nom> — o'rnatadi (nom bo'sh qoldirib bo'lmaydi; o'chirish — saytdan). */
export async function usernameJavobi(env: TgEnv, uid: number, til: TgTil, arg: string): Promise<string> {
  const nom = usernameNorm(arg);
  if (nom) {
    const x = usernameXato(nom);
    if (x) return tgT(XATO[x] ?? 'Username mos emas', til);
    return belgila(env, uid, til, nom);
  }
  const j = await tgRpc<Ol>(env, 't2_username_ol_v1', { p_actor_id: uid });
  if (!j?.ok) return tgT('Server bilan aloqa yo‘q. Birozdan keyin urinib ko‘ring.', til);
  return j.username ? tgT('Username: @{u}', til, { u: j.username }) : tgT('Username hali yo‘q. Tanlash: /username <nom>', til);
}

/** /taklif <@username|telefon|email> <rol> [kompaniya_kodi] — kutiladigan taklif (RPC direktor huquqini tekshiradi). */
export async function taklifJavobi(env: TgEnv, uid: number, til: TgTil, arg: string): Promise<string> {
  const qism = arg.trim().split(/\s+/).filter(Boolean);
  const ri = qism.findIndex((x) => ROLLAR.includes(x.toLowerCase()));
  const qiymat = ri > 0 ? qism.slice(0, ri).join(' ') : '';
  if (ri < 1 || qiymatTuri(qiymat) === 'noaniq') return tgT('Foydalanish: /taklif <@username|telefon|email> <rol> [kompaniya kodi]. Rollar: {rollar}', til, { rollar: ROLLAR.join(', ') });
  const kod = (qism[ri + 1] || '').toLowerCase();
  const m = await tgRpc<Men>(env, 't2_men_v1', { p_actor_id: uid });
  if (!m?.ok) return tgT('Server bilan aloqa yo‘q. Birozdan keyin urinib ko‘ring.', til);
  const dir = (m.azoliklar ?? []).filter((a) => a.faol !== false && a.is_director && Number.isSafeInteger(a.kompaniya_id) && (a.kompaniya_id as number) > 0);
  const tanlangan = kod ? dir.filter((a) => (a.kod || '').toLowerCase() === kod) : dir;
  if (tanlangan.length === 0) return tgT('Taklif uchun ruxsatingiz yo‘q yoki kompaniya aniqlanmadi.', til);
  if (tanlangan.length > 1) return tgT('Bir nechta kompaniyangiz bor — oxirida kompaniya kodini yozing: {kodlar}', til, { kodlar: tanlangan.map((a) => a.kod).filter(Boolean).slice(0, 8).join(', ') });
  const r = await tgRpc<Natija & { telefon_taklif?: boolean }>(env, 't2_kompaniya_taklif_yubor_v1', {
    p_actor_id: uid, p_kompaniya_id: tanlangan[0].kompaniya_id, p_qiymat: qiymat.slice(0, 254), p_rol: ri >= 0 ? qism[ri].toLowerCase() : '', p_operation_id: crypto.randomUUID(),
  });
  if (r?.ok) {
    const p = r.profil ?? {};
    return tgT('Taklif yuborildi: {ism}{u}. U qabul qilgach a’zo bo‘ladi.', til, { ism: p.ism ?? '—', u: p.username ? ` (@${p.username})` : '' });
  }
  const KOD: Record<string, string> = {
    TOPILMADI: r?.telefon_taklif ? 'Bu raqam bilan hisob topilmadi. Taklif havolasi/kodini saytdan yarating: Kompaniya → A’zolar.' : 'Foydalanuvchi topilmadi.',
    ALREADY_MEMBER: 'Bu odam allaqachon kompaniya a’zosi.', RUXSAT_YOQ: 'Taklif uchun ruxsatingiz yo‘q yoki kompaniya aniqlanmadi.',
    LIMIT: 'Juda ko‘p so‘rov. Birozdan keyin urinib ko‘ring.', ROL_NOTOGRI: 'Bu rolni taklif orqali berib bo‘lmaydi.', QIYMAT_NOTOGRI: 'Qiymat noto‘g‘ri: @username, telefon yoki email yozing.',
  };
  return tgT(KOD[r?.code || ''] ?? 'Taklif yuborilmadi. Keyinroq urinib ko‘ring.', til);
}

/** /men uchun qator (yo'q bo'lsa — bo'sh massiv). */
export async function menUsernameQatori(env: TgEnv, uid: number, til: TgTil): Promise<string[]> {
  const j = await tgRpc<Ol>(env, 't2_username_ol_v1', { p_actor_id: uid });
  return j?.ok && j.username ? [tgT('Username: @{u}', til, { u: j.username })] : [];
}
