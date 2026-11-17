/**
 * telegram-ombor.ts — omborchi ovoz/matn buyrug'i Telegram botda (ombor-buyruq endpointining yupqa qobig'i).
 *
 * Qoida (telegram-amal.ts bilan bir xil): bot hech narsani o'zi yozmaydi — har amal `botChaqiruv` orqali MAVJUD middleware →
 * `/api/ombor-buyruq` (ruxsat, aiHisobli, audit, RPC) dan o'tadi. Telegram hisobi faqat bog'langan foydalanuvchi sifatida.
 *
 * Oqim: ovozli xabar (yoki oddiy matn) → «tahlil» → PREVIEW kartasi + [Tasdiqlash]/[Bekor] → «Tasdiqlash» bosilganda yoziladi.
 * callback_data ≤ 64 bayt, server holati yo'q: tasdiq tokeni (HMAC, 15 daq.) preview xabari MATNIDA saqlanadi (`#OB:<token>`); xabarni faqat
 * bot yozadi (foydalanuvchi uni tahrirlay olmaydi), token serverda qayta tekshiriladi (aktor/ombor/muddati).
 */
import { type TgEnv, type TgTil, tgApi, tgT } from './telegram';
import { botChaqiruv } from './telegram-amal';
import { SON_FORMAT } from './ombor-buyruq-yadro';
import { onRequest as middleware } from '../api/_middleware';
import { onRequestPost as omborBuyruqPost } from '../api/ombor-buyruq';
import type { BotJavob } from './telegram-bot';

type BotEnv = TgEnv & Record<string, unknown>;
export const OMBOR_HA = 'ob:y';
export const OMBOR_YOQ = 'ob:n';
const TOKEN_BELGI = '#OB:';
const MAX_OVOZ = 6 * 1024 * 1024;

type Ombor = { id: number; kompaniya_id: number; nomi: string; yozish: boolean };
type Javob = Record<string, unknown> & { ok?: boolean; code?: string; holat?: string; token?: string; preview?: Record<string, unknown>; xabar?: string };

const chaqir = (env: BotEnv, uid: number, c: { json?: unknown; form?: FormData }) =>
  botChaqiruv<Javob>(env, uid, { api: 'ombor-buyruq', ...c }, middleware, omborBuyruqPost);

/** Foydalanuvchi yoza oladigan birinchi ombor (bo'lmasa — u omborchi emas, bot oddiy javob beradi). */
export async function omborTop(env: BotEnv, uid: number): Promise<Ombor | null> {
  const r = await chaqir(env, uid, { json: { amal: 'kontekst' } });
  const q = (r.body?.omborlar as Ombor[] | undefined)?.filter((o) => o.yozish) ?? [];
  return r.status === 200 && q.length ? q[0] : null;
}

/** Ovozli xabarni yuklab oladi (token log/javobga chiqmaydi). */
async function ovozYukla(env: BotEnv, fileId: string): Promise<Blob | null> {
  const f = await tgApi<{ file_path?: string; file_size?: number }>(env, 'getFile', { file_id: fileId });
  const yol = f.result?.file_path;
  if (!f.ok || !yol || !/^[\w/.-]+$/.test(yol) || (f.result?.file_size ?? 0) > MAX_OVOZ) return null;
  const token = String(env.TELEGRAM_BOT_TOKEN || '').trim();
  try {
    const r = await fetch(`https://api.telegram.org/file/bot${token}/${yol}`);
    if (!r.ok) return null;
    const buf = await r.arrayBuffer();
    if (buf.byteLength === 0 || buf.byteLength > MAX_OVOZ) return null;
    return new Blob([buf], { type: /\.(oga|ogg|opus)$/i.test(yol) ? 'audio/ogg' : /\.mp3$/i.test(yol) ? 'audio/mpeg' : /\.m4a$/i.test(yol) ? 'audio/mp4' : 'audio/ogg' });
  } catch { return null; }
}

const ish = (v: unknown) => (v == null || v === '' ? '—' : String(v));

/** Preview kartasi (Telegram matni). Faqat sintetik testlanadi. */
export function kartaMatni(j: Javob, til: TgTil): string {
  const p = j.preview as Record<string, unknown> | undefined;
  if (j.holat === 'tasdiq_kerak' && p) {
    if (p.amal === 'bekor' || p.amal === 'tuzat') {
      const a = (p.asl ?? {}) as Record<string, unknown>;
      return [tgT(p.amal === 'bekor' ? 'Yozuvni BEKOR qilish' : 'Yozuvni TUZATISH', til) + ` #${ish(p.harakat_id)}`,
        `${ish(a.sana)} · ${a.operatsiya === 'prixod' ? tgT('kirim', til) : tgT('chiqim', til)} · ${ish(a.nomi)} · ${SON_FORMAT(Number(a.obyomi))} ${ish(a.birligi)}`,
        ...(p.yangi ? [tgT('Yangi qiymat:', til) + ' ' + JSON.stringify(p.yangi)] : []), tgT('Tasdiqlaysizmi?', til)].join('\n');
    }
    const og = (p.ogohlantirish as string[] | undefined) ?? [];
    return [p.tur === 'prixod' ? tgT('KIRIM (prixod)', til) : tgT('CHIQIM (rasxod)', til),
      `${ish(p.nomi)} — ${SON_FORMAT(Number(p.miqdor))} ${ish(p.birligi)}`,
      `${tgT('Sana', til)}: ${ish(p.sana)}`,
      ...(p.kontragent ? [`${p.tur === 'prixod' ? tgT('Yetkazuvchi', til) : tgT('Kimga', til)}: ${ish(p.kontragent)}`] : []),
      ...(p.obyekt ? [`${tgT('Obyekt', til)}: ${ish(p.obyekt)}`] : []),
      ...(p.qoldiq_hozir != null ? [`${tgT('Ostatka', til)}: ${SON_FORMAT(Number(p.qoldiq_hozir))} → ${SON_FORMAT(Number(p.qoldiq_keyin))}`] : []),
      ...og.map((x) => '⚠ ' + x), '', tgT('Tasdiqlaysizmi?', til)].join('\n');
  }
  const nomz = (j.nomzodlar as { nomi?: string; birligi?: string; qoldiq?: number }[] | undefined) ?? [];
  switch (j.holat) {
    case 'javob':
      if (j.tarix) return [tgT('Oxirgi harakatlar:', til), ...(((j.tarix as { qatorlar?: Record<string, unknown>[] }).qatorlar ?? []).slice(0, 8).map((x) => `${ish(x.sana)} ${x.operatsiya === 'prixod' ? '+' : '−'}${SON_FORMAT(Number(x.obyomi))} ${ish(x.birligi)} #${ish(x.id)}`))].join('\n');
      return nomz.length ? [tgT('Ostatka:', til), ...nomz.slice(0, 5).map((x) => `• ${ish(x.nomi)} — ${SON_FORMAT(Number(x.qoldiq))} ${ish(x.birligi)}`)].join('\n') : tgT('Topilmadi.', til);
    case 'material_tanlang': case 'material_topilmadi':
      return [tgT('Qaysi material? Aniqroq nomini yozing yoki ovoz yuboring:', til), ...nomz.slice(0, 5).map((x) => `• ${ish(x.nomi)} (${ish(x.birligi)}, ${SON_FORMAT(Number(x.qoldiq))})`)].join('\n');
    case 'qoldiq_yetmaydi': return `${tgT('Ostatka yetmaydi', til)}: ${SON_FORMAT(Number(j.hozirgi_qoldiq))} < ${SON_FORMAT(Number(j.sorlagan))}`;
    case 'yozuv_tanlang': return [tgT('Qaysi yozuv? Raqamini yozing (masalan: #123 ni 50 ga o‘zgartir):', til), ...(((j.nomzodlar_yozuv as Record<string, unknown>[] | undefined) ?? []).slice(0, 5).map((x) => `#${ish(x.id)} ${ish(x.sana)} ${ish(x.nomi)} ${SON_FORMAT(Number(x.obyomi))} ${ish(x.birligi)}`))].join('\n');
    case 'toldirish_kerak': return tgT('Yetarli ma’lumot yo‘q: ', til) + ((j.yetishmaydi as string[] | undefined) ?? []).join(', ');
    case 'obyekt_tanlang': return tgT('Qaysi obyekt?', til) + ' ' + ((j.nomzodlar_obyekt as { nom?: string }[] | undefined) ?? []).map((o) => o.nom).join(' / ');
    case 'tushunilmadi': return tgT('Tushunmadim. Masalan: «sement 10 tonna keldi» yoki «mix 20 kg prorab Aliga berdim».', til);
    default: return tgT('Tushunmadim.', til);
  }
}

const XATO_KOD: Record<string, string> = {
  BYUDJET_YOQ: 'AI limiti belgilanmagan', BYUDJET_TUGADI: 'AI oylik limiti tugadi', TOKEN_YETMAYDI: 'Tokenlar yetarli emas', VOICE_NOT_CONFIGURED: 'Ovozni matnga o‘tkazish yoqilmagan',
  VOICE_COMPANY_NOT_ENABLED: 'Ovoz bu kompaniya uchun yoqilmagan', VOICE_NO_SPEECH: 'Ovozda gap eshitilmadi', PERMISSION_DENIED: 'Ruxsat yo‘q',
};
const xatoMatni = (til: TgTil, code?: string) => tgT(XATO_KOD[code ?? ''] ?? 'Bajarilmadi. Birozdan keyin urinib ko‘ring.', til);

/** Matn yoki ovozli xabar → tahlil → preview. `null` — foydalanuvchi omborchi emas (bot boshqa javob beradi). */
export async function omborBuyruq(env: BotEnv, uid: number, til: TgTil, kirish: { matn?: string; fileId?: string }): Promise<BotJavob | null> {
  const ombor = await omborTop(env, uid);
  if (!ombor) return null;
  let r;
  if (kirish.fileId) {
    const audio = await ovozYukla(env, kirish.fileId);
    if (!audio) return { matn: tgT('Ovozli xabarni olib bo‘lmadi (juda katta yoki mavjud emas).', til) };
    const f = new FormData();
    f.set('amal', 'tahlil'); f.set('kompaniya_id', String(ombor.kompaniya_id)); f.set('sklad_id', String(ombor.id)); f.set('audio', audio, 'voice');
    r = await chaqir(env, uid, { form: f });
  } else {
    r = await chaqir(env, uid, { json: { amal: 'tahlil', kompaniya_id: ombor.kompaniya_id, sklad_id: ombor.id, matn: String(kirish.matn ?? '').slice(0, 1000) } });
  }
  const j = r.body;
  if (!j) return { matn: xatoMatni(til) };
  if (j.ok === false) return { matn: xatoMatni(til, j.code) };
  const karta = kartaMatni(j, til);
  if (j.holat === 'tasdiq_kerak' && j.token) {
    return { matn: `${tgT('Ombor', til)}: ${ombor.nomi}\n${karta}\n\n${TOKEN_BELGI}${j.token}`,
      markup: { inline_keyboard: [[{ text: tgT('Tasdiqlash', til), callback_data: OMBOR_HA }, { text: tgT('Bekor', til), callback_data: OMBOR_YOQ }]] } };
  }
  return { matn: karta };
}

type Kb = { data?: string; message?: { text?: string } };
/** `ob:y` — preview xabaridagi token bilan tasdiq; `ob:n` — bekor. */
export async function omborCallback(env: BotEnv, uid: number, til: TgTil, cb: Kb): Promise<{ toast: string; xabar?: BotJavob; tugmalarniOlibTashla?: boolean; amal: string }> {
  if (cb.data === OMBOR_YOQ) return { toast: tgT('Bekor qilindi', til), amal: 'ombor_bekor', tugmalarniOlibTashla: true };
  const m = /#OB:([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\s*$/.exec(String(cb.message?.text ?? ''));
  if (!m) return { toast: tgT('Eskirgan tugma', til), amal: 'ombor_eskirgan', tugmalarniOlibTashla: true };
  let k = 0, s = 0;
  try { const yuk = JSON.parse(atob(m[1].split('.')[0].replace(/-/g, '+').replace(/_/g, '/'))) as { k?: number; s?: number }; k = Number(yuk.k); s = Number(yuk.s); } catch { /* quyida rad */ }
  if (!Number.isSafeInteger(k) || !Number.isSafeInteger(s) || k <= 0 || s <= 0) return { toast: tgT('Eskirgan tugma', til), amal: 'ombor_eskirgan', tugmalarniOlibTashla: true };
  const r = await chaqir(env, uid, { json: { amal: 'tasdiq', kompaniya_id: k, sklad_id: s, token: m[1] } });
  const j = r.body;
  if (r.status === 410 || j?.code === 'TOKEN_MUDDATI_OTGAN') return { toast: tgT('Muddati tugagan', til), amal: 'ombor_muddat', tugmalarniOlibTashla: true, xabar: { matn: tgT('Tasdiq muddati tugagan. Buyruqni qaytadan yuboring.', til) } };
  if (!j?.ok) {
    const kod = String(j?.code ?? '');
    return { toast: tgT('Bajarilmadi', til), amal: 'ombor_rad', tugmalarniOlibTashla: true, xabar: { matn: kod === 'QOLDIQ_YETMAYDI' ? tgT('Ostatka yetmaydi — yozilmadi.', til) : xatoMatni(til, kod) } };
  }
  return { toast: tgT('Yozildi', til), amal: 'ombor_yozildi', tugmalarniOlibTashla: true, xabar: { matn: tgT(j.takror ? 'Bu amal allaqachon yozilgan.' : 'Yozildi ✔', til) + (j.harakat_id ? ` #${String(j.harakat_id)}` : '') } };
}
