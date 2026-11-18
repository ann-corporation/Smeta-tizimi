/**
 * telegram-disk.ts - Telegram bot -> Hujjat maydoni (shaxsiy "Kiruvchi" papkasi).
 * Qoidalar (egasi 2026-11-18): faqat SHAXSIY chat (guruh/kanal avtomatik saqlanmaydi - webhook private'dan boshqasini rad etadi);
 * fayl kelganda bot "qaysi papkaga?" deb so'raydi (Kiruvchi + oxirgi 2 papka tugmasi); > 20 MB bo'lsa veb-yuklash havolasi.
 * Saqlash - veb yuklash bilan BIR XIL yo'l (hmYukla: ruxsat + kvota serverda, R2 yagona yozuv nuqtasi).
 */
import { type TgEnv, type TgTil, saytUrl, tgApi, tgRpc, tgT, tokenBormi, xabarYubor } from './telegram';
import { HM_TG_MAX_BAYT, hmYukla, type HmEnv } from './hujjat-maydoni';

export type TgHujjat = { file_id?: string; file_name?: string; mime_type?: string; file_size?: number };
export const DISK_CB = /^hd:(\d{1,12}):(\d{1,12})$/;

export const diskWebHavola = (env: TgEnv) => saytUrl(env) + '/admin/hujjat-maydoni';

/** Fayl (document) keldi: kutish yoziladi va papka tanlash tugmalari yuboriladi. */
export async function diskFayl(env: TgEnv, uid: number, til: TgTil, chatId: number, doc: TgHujjat): Promise<string> {
  if (!doc.file_id || !/^[A-Za-z0-9_-]{10,200}$/.test(doc.file_id)) return 'disk_fayl_yoq';
  if (!Number.isFinite(doc.file_size) || (doc.file_size as number) > HM_TG_MAX_BAYT) {
    await xabarYubor(env, chatId, tgT('Fayl 20 MB dan katta. Veb orqali yuklang:', til) + ' ' + diskWebHavola(env));
    return 'disk_katta';
  }
  const r = await tgRpc<{ ok?: boolean; id?: number; papkalar?: Array<{ id: number; nom: string }> }>(env, 't2_hm_tg_kutish_yoz_v1', {
    p_actor: uid, p_tg_file_id: doc.file_id, p_nom: String(doc.file_name || 'fayl').slice(0, 200), p_mime: doc.mime_type || null, p_bayt: doc.file_size ?? null,
  });
  if (!r?.ok || !r.id) { await xabarYubor(env, chatId, tgT('Server bilan aloqa yo‘q. Birozdan keyin urinib ko‘ring.', til)); return 'disk_xato'; }
  const tugmalar = (r.papkalar ?? []).slice(0, 3).map((p) => [{ text: '📁 ' + String(p.nom).slice(0, 40), callback_data: `hd:${r.id}:${p.id}` }]);
  await xabarYubor(env, chatId, tgT('Qaysi papkaga saqlaymiz?', til), { reply_markup: { inline_keyboard: tugmalar } });
  return 'disk_papka_sora';
}

/** Papka tugmasi bosildi: fayl Telegramdan olinadi va saqlanadi. */
export async function diskCallback(env: TgEnv, uid: number, til: TgTil, data: string, chatId: number): Promise<{ toast: string; amal: string }> {
  const m = DISK_CB.exec(data);
  if (!m) return { toast: '', amal: 'disk_nomalum' };
  const kutish = Number(m[1]); const papka = Number(m[2]);
  const k = await tgRpc<{ ok?: boolean; tg_file_id?: string; nom?: string; mime?: string; bayt?: number }>(env, 't2_hm_tg_kutish_ol_v1', { p_actor: uid, p_id: kutish, p_ochir: false });
  if (!k?.ok || !k.tg_file_id) return { toast: tgT('Eskirgan so‘rov. Faylni qayta yuboring.', til), amal: 'disk_kutish_yoq' };
  const token = String(env.TELEGRAM_BOT_TOKEN || '').trim();
  if (!tokenBormi(env)) return { toast: tgT('Bot sozlanmagan', til), amal: 'disk_config' };
  const g = await tgApi<{ file_path?: string; file_size?: number }>(env, 'getFile', { file_id: k.tg_file_id });
  const yol = g.result?.file_path;
  if (!g.ok || !yol || !/^[A-Za-z0-9_\-./]{3,200}$/.test(yol) || yol.includes('..')) return { toast: tgT('Faylni olib bo‘lmadi', til), amal: 'disk_getfile' };
  const resp = await fetch(`https://api.telegram.org/file/bot${token}/${yol}`);
  if (!resp.ok) return { toast: tgT('Faylni olib bo‘lmadi', til), amal: 'disk_yuklab' };
  const bayt = new Uint8Array(await resp.arrayBuffer());
  if (bayt.byteLength === 0 || bayt.byteLength > HM_TG_MAX_BAYT) return { toast: tgT('Fayl 20 MB dan katta. Veb orqali yuklang:', til), amal: 'disk_hajm' };
  const rez = await hmYukla(env as unknown as HmEnv, {
    actorId: uid, kompaniyaId: null, papkaId: papka, faylId: null, nom: String(k.nom || 'fayl'), mime: String(k.mime || ''), bayt,
    operationId: crypto.randomUUID(),
  });
  const j = await rez.json().catch(() => null) as { ok?: boolean; code?: string; xato?: string } | null;
  if (j?.ok) {
    await tgRpc(env, 't2_hm_tg_kutish_ol_v1', { p_actor: uid, p_id: kutish, p_ochir: true });
    await xabarYubor(env, chatId, tgT('Saqlandi: Hujjatlarim.', til) + ' ' + diskWebHavola(env));
    return { toast: tgT('Saqlandi', til), amal: 'disk_saqlandi' };
  }
  const xabar = j?.code === 'KVOTA_TUGADI' ? tgT('Shaxsiy disk to‘ldi. Joy bo‘shating:', til) + ' ' + diskWebHavola(env) : tgT('Saqlab bo‘lmadi', til);
  await xabarYubor(env, chatId, xabar);
  return { toast: '', amal: 'disk_' + (j?.code || 'xato') };
}
