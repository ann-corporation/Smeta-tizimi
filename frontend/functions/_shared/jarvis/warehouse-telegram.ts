import { tokenTekshir, tokenYarat } from '../ombor-buyruq-yadro';
import { javobYasa } from '../telegram-ombor';
import { saytUrl, tgT, type TgEnv, type TgTil } from '../telegram';
import { botChaqiruv } from '../telegram-amal';
import { onRequest as middleware } from '../../api/_middleware';
import { onRequestPost as warehousePost } from '../../api/ombor-buyruq';
import { warehouseCommand } from './warehouse-command';
import type { WarehouseSnapshot } from '../../../src/lib/jarvis/warehouse-command';
import type { JarvisBotReply } from '../telegram-jarvis';

const retry = (til: TgTil) => ({ matn: tgT('Bajarilmadi. Birozdan keyin urinib ko‘ring.', til) });
const tooLarge = (env: TgEnv) => ({ matn: tgT('Taklif juda katta. Uni web chatda qayta so‘rang.', 'uz') + '\n' + saytUrl(env) + '/admin' });
const transport = (env: TgEnv, actor: number, choices: Record<string, unknown> = {}) => async (body: Record<string, unknown>) => {
  const result = await botChaqiruv(env, actor, { api: 'ombor-buyruq', json: body.amal === 'tahlil' ? { ...body, ...choices } : body }, middleware, warehousePost);
  return result.status === 200 && result.body ? result.body : { ok: false, code: 'SERVER_XATO' };
};
export async function warehouseBotReply(env: TgEnv, actor: number, til: TgTil, snapshot: WarehouseSnapshot, page = 0): Promise<JarvisBotReply> {
  if (snapshot.result?.ok === false) return retry(til);
  const selected = snapshot.warehouses.find(row => row.id === snapshot.warehouseId);
  if (selected && snapshot.result) {
    const card = await javobYasa(env, actor, selected, snapshot.result, til, { matn: snapshot.question, t: {} });
    if (snapshot.result.holat !== 'tasdiq_kerak' && !['javob', 'hisobot'].includes(String(snapshot.result.holat))) {
      const token = await tokenYarat(String(env.SESSIYA_KALIT ?? ''), { a: actor, k: snapshot.company,
        s: selected.id, op: 'jarvis-warehouse-question', p: { question: snapshot.question } });
      card.matn += '\n#WQ:' + token;
    }
    if (card.matn.length > 3900) return tooLarge(env);
    return { matn: card.matn, options: card.markup ? { reply_markup: card.markup } : undefined };
  }
  if (!snapshot.warehouses.length) return retry(til);
  const token = await tokenYarat(String(env.SESSIYA_KALIT ?? ''), { a: actor, k: snapshot.company,
    s: snapshot.warehouses[0].id, op: 'jarvis-warehouse', p: { question: snapshot.question } });
  if (token.length > 3500) return tooLarge(env);
  const offset = Math.min(Math.floor((snapshot.warehouses.length - 1) / 40) * 40, Math.floor(page / 40) * 40);
  const buttons = snapshot.warehouses.slice(offset, offset + 40).map(row => [{ text: row.nomi.slice(0, 60), callback_data: `j:w:${row.id}` }]);
  if (offset > 0) buttons.push([{ text: '‹', callback_data: `j:w:p:${offset - 40}` }]);
  if (offset + 40 < snapshot.warehouses.length) buttons.push([{ text: '›', callback_data: `j:w:p:${offset + 40}` }]);
  return { matn: tgT('Qaysi ombor?', til) + '\n#JW:' + token, options: { reply_markup: {
    inline_keyboard: buttons,
  } } };
}

export async function warehouseBotSelect(env: TgEnv, actor: number, til: TgTil, data: string, message: string): Promise<JarvisBotReply> {
  const choice = /^j:w:([1-9]\d{0,15})$/.exec(data);
  const page = /^j:w:p:(\d{1,6})$/.exec(data);
  const marker = /\n#JW:([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.exec(message);
  const token = marker ? await tokenTekshir(String(env.SESSIYA_KALIT ?? ''), marker[1]) : null;
  if ((!choice && !page) || !token || token === 'muddati' || token.a !== actor || token.op !== 'jarvis-warehouse' ||
      typeof token.p?.question !== 'string' || token.p.question.length > 1000) return retry(til);
  const snapshot = await warehouseCommand(transport(env, actor), token.k, token.p.question, choice ? Number(choice[1]) : undefined);
  return warehouseBotReply(env, actor, til, snapshot, page ? Number(page[1]) : 0);
}

/** Free-text clarification remains bound to the actor, company, warehouse and original command. */
export async function warehouseBotFollowup(env: TgEnv, actor: number, til: TgTil, message: string, answer: string): Promise<JarvisBotReply | null> {
  if (message.includes('#OB:')) return { matn: tgT('Yozish uchun «Tasdiqlash» tugmasini bosing.', til) };
  const marker = /#(WQ|OS):([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)(?:\s|$)/.exec(message);
  if (!marker) return null;
  const token = await tokenTekshir(String(env.SESSIYA_KALIT ?? ''), marker[2]);
  if (!token || token === 'muddati' || token.a !== actor ||
      token.op !== (marker[1] === 'OS' ? 'sv' : 'jarvis-warehouse-question')) return retry(til);
  const question = marker[1] === 'OS' ? token.p?.matn : token.p?.question;
  if (typeof question !== 'string' || !answer.trim() || question.length + answer.length + 1 > 1000) return retry(til);
  const choices = marker[1] === 'OS' ? { tanlov: token.p.t, narx_rejim: token.p.r } : {};
  const snapshot = await warehouseCommand(transport(env, actor, choices), token.k, question + '\n' + answer.trim(), token.s);
  return warehouseBotReply(env, actor, til, snapshot);
}
