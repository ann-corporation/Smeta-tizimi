import type { RpcNatija } from '../agent-rpc';
import { qidiruvSozlari } from '../../../src/lib/jarvis/qidiruv-sozlari';
import { characteristics, gateFailure, normName } from '../../../src/lib/smeta-studio/resource-match';
import { jarvisMoney } from '../../../src/lib/jarvis/answers';
import { jarvisHasPermission } from './authority';
import { resolveJarvisObject, type JarvisObjectScope, type JarvisReadRpc } from './object-scope';
import { jarvisText } from './reply-language';
import type { PulObyekt } from '../agent-pul-javob';

const source = 't2_agent_qidiruv_v1';
const resources = new Set(['rs', 'mat', 'ob']);
const clean = (v: string) => v.replace(/[\r\n<>\[\]*_\x60]/g, ' ').trim().slice(0, 200);

export function estimatePriceIntent(question: string): string[] {
  const q = question.toLowerCase().replace(/[’‘ʻʼ']/g, '');
  if (!/smetada|smetadagi|сметада|сметадаги|(?:в|по)\s+смет[еы]/u.test(q) ||
      !/narx|qanchadan|necha pul|turadi|нарх|қанчадан|цен[ауы]|поч[её]м|сколько стоит/u.test(q) ||
      /katalog|каталог|birja|бирж|jami|итого|сумма|summa|fakt|факт|ustama|nakrutka|накладн|\bf-?2\b|кс-?2|kirit|ozgartir|qoy\b|qo[ll]+a|yoz\b|замени|установи|измени|внеси|кирит|ўзгартир/u.test(q)) return [];
  const words = q.replace(/(?:сметадаги|сметада|нархи|нарх|қанчадан|қанча|қандай|кўрсат|поч[её]м|сколько стоит)/gu, ' ');
  return qidiruvSozlari(words).resurs;
}

type Price = {
  obyekt: string; nom: string; birlik?: string; tur: string;
  narx_min?: number; narx_max?: number; narxsiz_qator: number; qator_soni: number;
};
const nonNegativeInt = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
function validPrice(value: unknown): value is Price {
  if (!value || typeof value !== 'object') return false;
  const row = value as Partial<Price>;
  const min = row.narx_min;
  const max = row.narx_max;
  return typeof row.nom === 'string' && typeof row.obyekt === 'string' && typeof row.tur === 'string' &&
    (row.birlik === undefined || typeof row.birlik === 'string') &&
    nonNegativeInt(row.narxsiz_qator) && nonNegativeInt(row.qator_soni) && row.qator_soni > 0 && row.narxsiz_qator <= row.qator_soni &&
    (row.narxsiz_qator === row.qator_soni ? min === undefined && max === undefined : finite(min) && finite(max) && min <= max);
}

export async function estimatePriceAnswer(rpc: JarvisReadRpc, scope: JarvisObjectScope, terms: string[], authority: RpcNatija | null, mayReadMoney: boolean) {
  const text = scope.text ?? jarvisText();
  const denied = { rad: true, javob: text('Smetadagi narxlarni ko‘rish uchun ruxsat kerak.', 'Для просмотра цен сметы нужен доступ.') };
  const unavailable = { javob: text('Smetadagi narxni tekshirib bo‘lmadi. Keyinroq urinib ko‘ring.', 'Не удалось проверить цену в смете. Повторите запрос позже.') };
  if (!mayReadMoney || !jarvisHasPermission(authority, scope.company, 'smeta.read')) return denied;
  const object = await resolveJarvisObject(rpc, scope).catch(() => ({ tur: 'unavailable' as const }));
  if (object.tur === 'denied') return denied;
  if (object.tur === 'unavailable') return unavailable;
  if (object.tur === 'noaniq') return { javob: text('Qaysi obyekt? {names}', 'Какой объект? {names}', { names: object.variantlar.map(row => clean(row.nom)).join(' · ') }) };
  if (object.tur === 'yoq') return { javob: text('Narxni qaysi obyekt smetasidan qidiray?', 'В смете какого объекта искать цену?') };
  return estimateObjectPriceAnswer(rpc, scope, object.obyekt, terms, authority, mayReadMoney);
}

/** Same permission, grade and unit checks for a server-selected object in a company comparison. */
export async function estimateObjectPriceAnswer(rpc: JarvisReadRpc, scope: JarvisObjectScope, object: PulObyekt, terms: string[], authority: RpcNatija | null, mayReadMoney: boolean) {
  const text = scope.text ?? jarvisText();
  const denied = { rad: true, javob: text('Smetadagi narxlarni ko‘rish uchun ruxsat kerak.', 'Для просмотра цен сметы нужен доступ.') };
  const unavailable = { javob: text('Smetadagi narxni tekshirib bo‘lmadi. Keyinroq urinib ko‘ring.', 'Не удалось проверить цену в смете. Повторите запрос позже.') };
  if (!mayReadMoney || !jarvisHasPermission(authority, scope.company, 'smeta.read')) return denied;
  const { id, nom } = object;
  const r = await rpc(source, { p_actor_id: scope.actor, p_kompaniya_id: scope.company, p_obyekt_id: id,
    p_obyekt_sozlar: [], p_resurs_sozlar: terms }).catch(() => null);
  if (r?.status === 403 || r?.data.narx_ruxsat === false) return denied;
  const rows = r?.data.qatorlar;
  const objects = r?.data.obyektlar;
  if (!r?.ok || r.data.ok !== true || r.data.narx_ruxsat !== true || r.data.ruxsat !== true ||
      !Array.isArray(objects) || objects.length !== 1 || objects[0]?.id !== id || objects[0]?.nom !== nom ||
      !Array.isArray(rows) || rows.length > 15 || !rows.every(validPrice) || rows.some(row => row.obyekt !== nom)) return unavailable;

  const normalizedTerms = terms.map(normName);
  const marks = normalizedTerms.filter(term => /\d/u.test(term));
  const words = normalizedTerms.filter(term => !/\d/u.test(term));
  const spec = characteristics(normalizedTerms.join(' '));
  const matches = rows.filter(row => {
    const name = normName(row.nom);
    const tokens = name.replace(/(\p{L})[-‐‑–—](?=\d)/gu, '$1').split(/[^\p{L}\p{N}.+-]+/u);
    return resources.has(row.tur) && (!words.length || words.some(word => name.includes(word))) &&
      marks.every(mark => tokens.includes(mark)) && !gateFailure(spec, characteristics(name), null, row.birlik ?? null, name);
  });
  const path = '/admin/holat/' + id;
  const name = text('Obyekt smetasini ochish', 'Открыть смету объекта');
  const currency = text('so‘m', 'сум');
  const formattedPrice = (value: number) => jarvisMoney(value, currency, 20);
  const lines = matches.slice(0, 6).map(row => {
    const unit = row.birlik ? clean(row.birlik) : text('Birlik noma’lum', 'Единица неизвестна');
    const amount = row.narx_min === undefined ? text('Narx kiritilmagan', 'Цена не указана')
      : row.narx_min === row.narx_max ? formattedPrice(row.narx_min)
        : formattedPrice(row.narx_min) + ' – ' + formattedPrice(row.narx_max!);
    return '- ' + clean(row.nom) + ' · ' + unit + ' · ' + amount +
      (row.narxsiz_qator > 0 && row.narx_min !== undefined
        ? text(' · {count} ta narxsiz qator', ' · строк без цены: {count}', { count: row.narxsiz_qator }) : '');
  });
  if (!lines.length) lines.push(text('Tekshirilgan smeta qatorlarida mos resurs topilmadi.', 'В проверенных строках сметы подходящий ресурс не найден.'));
  if (rows.length === 15 || matches.length > 6) lines.push(text('Ko‘proq qatorni smetadan tekshiring.', 'Другие строки проверьте в смете.'));
  const title = text('**{object}** · smetadagi birlik narxi, QQSsiz', '**{object}** · цена единицы в смете, без НДС', { object: clean(nom) });
  return { javob: title + '\n\n' + lines.join('\n') + `\n\n[${name}](${path})`,
    narx_qatorlar: matches.slice(0, 6), narx_qisqa: rows.length === 15 || matches.length > 6,
    dalil: { tur: 'smeta-resurs-narxi', id, rpc: source, yol: path },
    sahifalar: [{ yol: path, nom: name }] };
}
