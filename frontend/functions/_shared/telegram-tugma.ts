/**
 * telegram-tugma.ts — bot inline tugmalari va callback_data kelishuvi (sof modul; og'ir bog'liqliksiz).
 * Bildirishnoma yetkazuvchisi (bildirishnoma-yetkaz.ts) ham, webhook ham shu yerdan foydalanadi.
 * callback_data ≤ 64 bayt, faqat qisqa id; amal ruxsati callback kelganda SERVERDA qayta tekshiriladi (telegram-bot.ts).
 */
import { type TgEnv, type TgTil, miniAppYoliTugma, saytUrl, tgT } from './telegram';
export const TASDIQ_SO_ROV = 'tq:';    // tq:<zanjir_id>  — «Tasdiqlash» bosildi → tasdiq so'raladi
export const TASDIQ_HA = 'tqy:';       // tqy:<zanjir_id> — «Ha, tasdiqlayman» → RPC
export const TASDIQ_YOQ = 'tqn:';      // tqn:<zanjir_id> — bekor

export const zanjirIdOl = (data: string, prefiks: string): number | null => {
  if (!data.startsWith(prefiks)) return null;
  const s = data.slice(prefiks.length);
  return /^\d{1,15}$/.test(s) && Number.isSafeInteger(Number(s)) && Number(s) > 0 ? Number(s) : null;
};

/** Bildirishnoma tugmalari: «Ko'rish» (Mini App chuqur havola) + faqat hujjat.tasdiq_kutmoqda uchun «Tasdiqlash». */
export function bildirishnomaTugmalari(env: TgEnv, til: TgTil, mavzu: string, havola: string | null, parametrlar?: Record<string, unknown> | null) {
  const qator: Record<string, unknown>[] = [];
  if (havola) qator.push(miniAppYoliTugma(env, til, havola.startsWith('/admin') ? havola : null, 'Ko‘rish'));
  const z = Number(parametrlar?.zanjir_id);
  if (mavzu === 'hujjat.tasdiq_kutmoqda' && Number.isSafeInteger(z) && z > 0) qator.push({ text: tgT('Tasdiqlash', til), callback_data: TASDIQ_SO_ROV + z });
  return qator.length ? { inline_keyboard: [qator] } : null;
}


export function startTugmalari(env: TgEnv, til: TgTil) {
  return { inline_keyboard: [
    [{ text: tgT('Tizimni ochish', til), web_app: { url: saytUrl(env) + '/tg' } }],
    [{ text: tgT('Bugun', til), callback_data: 'm:b' }, { text: tgT('Obyektlar', til), callback_data: 'm:o' }],
    [{ text: tgT('Yordam', til), callback_data: 'm:y' }],
  ] };
}
