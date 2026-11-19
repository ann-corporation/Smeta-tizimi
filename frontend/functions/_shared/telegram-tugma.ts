/**
 * telegram-tugma.ts — bot inline tugmalari va callback_data kelishuvi (sof modul; og'ir bog'liqliksiz).
 * Bildirishnoma yetkazuvchisi (bildirishnoma-yetkaz.ts) ham, webhook ham shu yerdan foydalanadi.
 * callback_data ≤ 64 bayt, faqat qisqa id; amal ruxsati callback kelganda SERVERDA qayta tekshiriladi (telegram-bot.ts).
 */
import { type TgEnv, type TgTil, miniAppYoliTugma, saytUrl, tgT } from './telegram';
export const TASDIQ_SO_ROV = 'tq:';    // tq:<zanjir_id>  — «Tasdiqlash» bosildi → tasdiq so'raladi
export const TASDIQ_HA = 'tqy:';       // tqy:<zanjir_id>:<raund>-<tartib> — «Ha, tasdiqlayman» → RPC (qadam belgisi: eskirgan «Ha» o'tmaydi)
export const TASDIQ_YOQ = 'tqn:';      // tqn:<zanjir_id> — bekor
/** 2-bosqich: foto → fakt qatori (hammasi qisqa id; ≤ 64 bayt; server holati yo'q). */
export const FOTO_BOLIMLAR = 'fb:';    // fb:<foto_id>:<obyekt_id>[:<sahifa>] — bo'lim ro'yxati
export const FOTO_BOLIM = 'fd:';       // fd:<foto_id>:<obyekt_id>:<bolim_id>  — bo'lim tanlandi → qidiruv so'zi so'raladi
export const FOTO_QATOR = 'fq:';       // fq:<foto_id>:<obyekt_id>:<qator_id>  — qator tanlandi → biriktirish
/** /fakt qoralama: `fs:<obyekt_id>:<qator_id>:<hajm*1000>` — «Saqlash», `fx` — «Bekor». */
export const FAKT_SAQLA = 'fs:';
export const FAKT_BEKOR = 'fx';

/** Qadam belgisi: «raund-tartib» (zanjirning navbatdagi qadami). */
export const qadamBelgisi = (raund: unknown, tartib: unknown): string | null => {
  const r = Number(raund), t = Number(tartib);
  return Number.isSafeInteger(r) && r >= 0 && r < 1e6 && Number.isSafeInteger(t) && t >= 0 && t < 1e4 ? `${r}-${t}` : null;
};
export const zanjirHaOl = (data: string): { id: number; belgi: string } | null => {
  const m = /^tqy:(\d{1,15}):(\d{1,6}-\d{1,4})$/.exec(data);
  return m && Number.isSafeInteger(Number(m[1])) && Number(m[1]) > 0 ? { id: Number(m[1]), belgi: m[2] } : null;
};
/** `<prefiks><n>:<n>[:<n>]` → sonlar (har biri musbat/nol butun); aks holda null. */
export const sonlarOl = (data: string, prefiks: string, kamida: number, ko_pi: number): number[] | null => {
  if (!data.startsWith(prefiks)) return null;
  const p = data.slice(prefiks.length).split(':');
  if (p.length < kamida || p.length > ko_pi || !p.every((x) => /^\d{1,15}$/.test(x))) return null;
  const n = p.map(Number);
  return n.every((x) => Number.isSafeInteger(x)) ? n : null;
};

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
    [{ text: tgT('📥 Ilovani yuklab olish', til), callback_data: 'rl:y' }],
  ] };
}
