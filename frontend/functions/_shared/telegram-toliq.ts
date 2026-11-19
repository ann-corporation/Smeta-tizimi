/**
 * telegram-toliq.ts — @qur_uz_bot «to'liq bot» yo'naltirgichi (docs/ops/TELEGRAM_BOT_QAMROV.md): `g:` callback lari, doimiy menyu tugmalari matni,
 * force_reply javoblari (qidiruv / hajm) va `/start` chuqur havolalari (o_79, f_79, y_79, h_79, t, n, m).
 * Mini App dan tashqari tizimni botning o'zida ishlatish: Obyektlar → karta → Fakt / F-2 / Hujjatlar; Tasdiqlar; Bildirishnomalar.
 * Hamma amal mavjud shlyuz/yagona nuqtalar orqali (telegram-toliq-*.ts); bu fayl faqat yo'naltiradi (yangi yozish yo'li yo'q).
 */
import { type TgEnv, type TgTil, botNomi, tgT, xabarYubor } from './telegram';
import { type BotJavob, type Callback, bugunJavobi } from './telegram-bot';
import { menyuTugmasi } from './telegram-bot-oqim';
import {
  type BotEnv, type CbNatija, asosiyMenyuJavobi, gKonteksti, joriyObyektId, menyuAmali, rolOl, sonlar,
} from './telegram-toliq-yadro';
import { bolimlarJavobi, kompaniyaTanlash, obyektKarta, obyektQidiruviSorovi, obyektlarRoyxati } from './telegram-toliq-obyekt';
import {
  f2AktXulosasi, f2HajmSorovi, f2Royxati, f2TahrirPreview, faktHajmSorovi, faktPreview, faktQatorlari, faktQidiruviSorovi, yozuvBekori, yozuvTasdiqi,
} from './telegram-toliq-fakt';
import { bildirishnomalarRoyxati, hujjatBerish, hujjatSorovi, hujjatlarRoyxati, radBajar, radSorovi, tasdiqlarRoyxati } from './telegram-toliq-hujjat';

/** `/start <param>` chuqur havolalar → callback_data. Ulash kodlari (≥16 belgi) bilan to'qnashmaydi. */
export function chuqurHavolaOl(arg: string): string | null {
  const m = /^([ofyh])_(\d{1,12})$/.exec(arg.trim());
  if (m) return { o: 'g:k:', f: 'g:f:', y: 'g:y:', h: 'g:h:' }[m[1] as 'o' | 'f' | 'y' | 'h'] + m[2];
  return ({ t: 'g:t:0', n: 'g:n:0', m: 'g:m' } as Record<string, string>)[arg.trim()] ?? null;
}
export const chuqurHavola = (env: TgEnv, param: string) => `https://t.me/${botNomi(env)}?start=${param}`;

const javob = (amal: string, xabar: BotJavob, extra: Partial<CbNatija> = {}): CbNatija => ({ toast: '', amal, xabar, ...extra });

/** Obyekt kerak bo'lgan amal: callback dagi id, bo'lmasa chatning joriy obyekti, bo'lmasa — obyektlar ro'yxati. */
async function obyektTanla(env: BotEnv, uid: number, til: TgTil, chatId: number | undefined, berilgan: number | null): Promise<{ oid: number } | { royxat: BotJavob }> {
  const oid = berilgan ?? (chatId ? await joriyObyektId(env, chatId) : null);
  if (oid) return { oid };
  const r = await obyektlarRoyxati(env, uid, til, 0, null);
  return { royxat: { ...r, matn: tgT('Avval obyektni tanlang.', til) + '\n' + r.matn } };
}

/** `g:` callback lari. Boshqa prefiks — null (webhook mavjud yo'lga o'tadi). */
export async function toliqCallback(env: BotEnv, uid: number, til: TgTil, cb: Callback, chatId?: number): Promise<CbNatija | null> {
  const d = String(cb.data ?? '').slice(0, 64);
  if (!d.startsWith('g:')) return null;
  const T = { tugmalarniOlibTashla: true } as const;
  const kerak = async (berilgan: number | null, davom: (oid: number) => Promise<CbNatija>): Promise<CbNatija> => {
    const t = await obyektTanla(env, uid, til, chatId, berilgan);
    return 'royxat' in t ? javob('g_obyekt_kerak', t.royxat, T) : davom(t.oid);
  };

  if (d === 'g:m') return javob('g_menyu', asosiyMenyuJavobi(til, (await rolOl(env, uid))?.ijro ?? false), T);
  if (d === 'g:c') return javob('g_kompaniya', await kompaniyaTanlash(env, uid, til), T);
  const o = sonlar(d, 'g:o:', 1, 2);
  if (o) return javob('g_obyektlar', await obyektlarRoyxati(env, uid, til, o[0], o[1] ?? null), T);
  const s = d === 'g:s' ? [] : sonlar(d, 'g:s:', 1, 1);
  if (s) return javob('g_qidiruv', obyektQidiruviSorovi(til, s[0] ?? null));
  const k = sonlar(d, 'g:k:', 1, 1);
  if (k) {
    const j = await obyektKarta(env, uid, til, k[0]);
    if (j.obyektId && chatId) await menyuTugmasi(env, uid, til, chatId, j.obyektId);   // joriy obyekt konteksti (chat menyu tugmasida)
    return javob('g_karta', j, T);
  }
  const b = sonlar(d, 'g:b:', 2, 2);
  if (b) return javob('g_bolimlar', await bolimlarJavobi(env, uid, til, b[0], b[1]), T);
  const y = d === 'g:y' ? [] : sonlar(d, 'g:y:', 1, 1);
  if (y) return kerak(y[0] ?? null, async (oid) => javob('g_fakt', faktQidiruviSorovi(til, oid)));
  const r = sonlar(d, 'g:r:', 2, 2);
  if (r) return javob('g_fakt_qator', await faktHajmSorovi(env, uid, til, r[0], r[1]));
  if (d === 'g:ok') return yozuvTasdiqi(env, uid, til, cb);
  if (d === 'g:no') return yozuvBekori(til);
  const f = d === 'g:f' ? [] : sonlar(d, 'g:f:', 1, 2);
  if (f) return kerak(f[0] ?? null, async (oid) => javob('g_f2', await f2Royxati(env, uid, til, oid, f[1] ?? null), T));
  const a = sonlar(d, 'g:a:', 2, 2);
  if (a) return javob('g_f2_akt', await f2AktXulosasi(env, uid, til, a[0], a[1]), T);
  const l = sonlar(d, 'g:l:', 3, 3);
  if (l) return javob('g_f2_tahrir', f2HajmSorovi(til, l[0], l[1], l[2]));
  const h = d === 'g:h' ? [] : sonlar(d, 'g:h:', 1, 1);
  if (h) return kerak(h[0] ?? null, async (oid) => javob('g_hujjatlar', await hujjatlarRoyxati(env, uid, til, oid), T));
  const hd = /^g:d:(\d{1,12}):([A-Za-z0-9:_-]{1,40})$/.exec(d);
  if (hd) return javob('g_hujjat', await hujjatSorovi(env, uid, til, Number(hd[1]), hd[2]), T);
  const hx = /^g:x:(\d{1,12}):([xp]):([A-Za-z0-9:_-]{1,40})$/.exec(d);
  if (hx) return hujjatBerish(env, uid, til, chatId ?? 0, Number(hx[1]), hx[2], hx[3]);
  const t = sonlar(d, 'g:t:', 1, 1);
  if (t) return javob('g_tasdiqlar', await tasdiqlarRoyxati(env, uid, til, t[0]), T);
  const n = sonlar(d, 'g:n:', 1, 1);
  if (n) return javob('g_bildirish', await bildirishnomalarRoyxati(env, uid, til, n[0]), T);
  const rq = sonlar(d, 'g:rq:', 1, 1);
  if (rq) return radSorovi(env, uid, til, rq[0]);
  const ry = /^g:ry:(\d{1,15}):(\d{1,6}-\d{1,4})$/.exec(d);
  if (ry) return radBajar(env, uid, til, Number(ry[1]), ry[2]);
  return { toast: tgT('Noma’lum tugma', til), amal: 'g_nomalum' };
}

/** Matnli xabar: force_reply javobi (qidiruv/hajm) yoki doimiy menyu tugmasi. Qayta ishlansa — amal nomi (webhook qaytaradi); aks holda null. */
export async function toliqMatn(env: BotEnv, uid: number, til: TgTil, chatId: number, msg: { text?: string; reply_to_message?: { from?: { is_bot?: boolean }; text?: string } }): Promise<string | null> {
  const matn = String(msg.text ?? '');
  const yubor = async (j: BotJavob) => { await xabarYubor(env, chatId, j.matn, j.markup ? { reply_markup: j.markup } : {}); };
  const k = gKonteksti(msg.reply_to_message);
  if (k && matn.trim()) {
    const t = matn.slice(0, 200);
    if (k.tur === 'gs') await yubor(await obyektlarRoyxati(env, uid, til, 0, k.a || null, t));
    else if (k.tur === 'gq') await yubor(await faktQatorlari(env, uid, til, k.a, t));
    else if (k.tur === 'gh' && k.b) await yubor(await faktPreview(env, uid, til, k.a, k.b, t));
    else if (k.tur === 'ge' && k.b && k.c) await yubor(await f2TahrirPreview(env, uid, til, k.a, k.b, k.c, t));
    else return null;
    return 'g_javob_' + k.tur;
  }
  const amal = menyuAmali(matn);
  if (!amal || amal === 'jarvis') return null;   // Jarvis — mavjud /jarvis yo'li (webhook)
  const ijro = (await rolOl(env, uid))?.ijro ?? false;
  const oid = ['fakt', 'f2', 'hujjat'].includes(amal) ? await joriyObyektId(env, chatId) : null;
  if (['fakt', 'f2', 'hujjat'].includes(amal) && !oid) { const r = await obyektTanla(env, uid, til, undefined, null); if ('royxat' in r) await yubor(r.royxat); return 'g_' + amal + '_obyektsiz'; }
  if (amal === 'obyektlar') await yubor(await obyektlarRoyxati(env, uid, til, 0, null));
  else if (amal === 'bugun') await yubor(await bugunJavobi(env, uid, til));
  else if (amal === 'tasdiq') await yubor(await tasdiqlarRoyxati(env, uid, til, 0));
  else if (amal === 'bildirish') await yubor(await bildirishnomalarRoyxati(env, uid, til, 0));
  else if (amal === 'fakt') await yubor(faktQidiruviSorovi(til, oid as number));
  else if (amal === 'f2') await yubor(await f2Royxati(env, uid, til, oid as number, null));
  else if (amal === 'hujjat') await yubor(await hujjatlarRoyxati(env, uid, til, oid as number));
  else await yubor(asosiyMenyuJavobi(til, ijro));
  return 'g_menyu_' + amal;
}
