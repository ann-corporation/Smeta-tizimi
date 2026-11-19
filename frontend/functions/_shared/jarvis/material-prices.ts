import { qidiruvSozlari } from '../../../src/lib/jarvis/qidiruv-sozlari';
import { jarvisMoney } from '../../../src/lib/jarvis/answers';
import type { RpcNatija } from '../agent-rpc';
import type { PulObyekt } from '../agent-pul-javob';
import { jarvisHasPermission } from './authority';
import { estimateObjectPriceAnswer } from './estimate-prices';
import type { JarvisObjectScope, JarvisReadRpc } from './object-scope';
import { jarvisText } from './reply-language';

export function materialPriceIntent(question: string): string[] | null {
  const q = question.toLowerCase().replace(/[’‘ʻʼ']/g, '');
  if (!/obyektlar|объектлар|объектам|объектов/u.test(q) || !/narx|нарх|цен[ауы]/u.test(q) ||
      /kirit|ozgartir|qoy\b|yoz\b|saqla|qo[ll]+a|замени|измени|установи|внеси|кирит|ўзгартир|сохрани|итого|сумма|jami|summa|ombor|sklad|kirim|prixod|приход|склад|омбор|кирим/u.test(q)) return null;
  const words = q.replace(/obyektlar\p{L}*|объектлар\p{L}*|объектам|объектов|boyicha|kesimida|бўйича|кесимида|narx\p{L}*|нарх\p{L}*|цен[ауы]\p{L}*/gu, ' ');
  const terms = qidiruvSozlari(words).resurs;
  return terms.length ? terms : null;
}

const cell = (s: string) => s.replace(/[\r\n<>\x60*_]/g, ' ').replace(/\\/g, '\\\\').replace(/\|/g, '\\|').slice(0, 200);
const isObject = (raw: unknown): raw is PulObyekt => !!raw && typeof raw === 'object' &&
  Number.isSafeInteger((raw as PulObyekt).id) && (raw as PulObyekt).id > 0 && typeof (raw as PulObyekt).nom === 'string';

/** Compare source unit prices, never infer an actual receipt price from an estimate. */
export async function materialPriceAnswer(rpc: JarvisReadRpc, scope: JarvisObjectScope, terms: string[], authority: RpcNatija | null, mayReadMoney: boolean) {
  const text = scope.text ?? jarvisText();
  const denied = { rad: true, javob: text('Smetadagi narxlarni ko‘rish uchun ruxsat kerak.', 'Для просмотра цен сметы нужен доступ.') };
  const unavailable = { source_unavailable: true, javob: text('Obyektlar narxlarini hozir tekshirib bo‘lmadi. Keyinroq urinib ko‘ring.', 'Не удалось проверить цены по объектам. Повторите запрос позже.') };
  if (!mayReadMoney || !jarvisHasPermission(authority, scope.company, 'smeta.read')) return denied;
  const list = await rpc('t2_agent_fakt_v1', { p_actor_id: scope.actor, p_kompaniya_id: scope.company,
    p_kategoriyalar: ['obyektlar'], p_obyekt_id: null }).catch(() => null);
  if (!list?.ok) return list?.status === 403 ? denied : unavailable;
  const objects: unknown = (list.data.fakt as { obyektlar?: unknown } | undefined)?.obyektlar;
  if (!Array.isArray(objects) || !objects.every(isObject) || new Set(objects.map(row => row.id)).size !== objects.length) return unavailable;
  if (!objects.length) return { javob: text('Manba ro‘yxatida obyekt topilmadi.', 'В списке источника объекты не найдены.') };
  const selected = objects.slice(0, 5);
  const answers = await Promise.all(selected.map(object => estimateObjectPriceAnswer(rpc, scope, object, terms, authority, mayReadMoney)));
  if (answers.some(answer => 'rad' in answer && answer.rad)) return denied;
  const currency = text('so‘m', 'сум');
  const rows: string[] = [];
  const evidence: Array<{ obyekt_id: number; obyekt: string; nom: string; birlik: string | null; narx_min: number | null; narx_max: number | null; narxsiz_qator: number; yol: string }> = [];
  let partial = objects.length > selected.length;
  let sourceFailures = 0;
  answers.forEach((answer, i) => {
    const object = selected[i];
    if (!('narx_qatorlar' in answer)) {
      partial = true;
      sourceFailures++;
      rows.push(`| ${cell(object.nom)} | ${text('Manba tekshirilmadi', 'Источник не проверен')} | — | — | — |`);
      return;
    }
    partial ||= answer.narx_qisqa;
    const path = '/admin/holat/' + object.id;
    for (const row of answer.narx_qatorlar) {
      const amount = row.narx_min === undefined ? text('Narx kiritilmagan', 'Цена не указана') :
        jarvisMoney(row.narx_min, currency, 20) + (row.narx_max !== row.narx_min ? ' – ' + jarvisMoney(row.narx_max!, currency, 20) : '');
      const note = row.narxsiz_qator && row.narx_min !== undefined ? text(' · {n} narxsiz', ' · {n} без цены', { n: row.narxsiz_qator }) : '';
      rows.push(`| ${cell(object.nom)} | ${cell(row.nom)} | ${cell(row.birlik ?? '—')} | ${amount}${note} | [${text('Smeta', 'Смета')}](${path}) |`);
      evidence.push({ obyekt_id: object.id, obyekt: object.nom, nom: row.nom, birlik: row.birlik ?? null,
        narx_min: row.narx_min ?? null, narx_max: row.narx_max ?? null, narxsiz_qator: row.narxsiz_qator, yol: path });
    }
    if (!answer.narx_qatorlar.length) rows.push(`| ${cell(object.nom)} | ${text('Mos resurs topilmadi', 'Ресурс не найден')} | — | — | [${text('Smeta', 'Смета')}](${path}) |`);
  });
  const header = text('| Obyekt | Resurs | Birlik | Birlik narxi, QQSsiz | Manba |', '| Объект | Ресурс | Единица | Цена единицы без НДС | Источник |');
  const scopeNote = text('Manba ro‘yxatidan dastlabki {n} obyekt tekshirildi. Bu kompaniyaning to‘liq narx reestri emas.',
    'Проверены первые {n} объектов списка источника. Это не полный реестр цен компании.', { n: selected.length });
  const note = text('Faqat smeta narxlari. Ombor kirim narxlari bu jadvalga kiritilmadi.', 'Только сметные цены. Цены складских приходов в таблицу не включены.');
  return { source_unavailable: sourceFailures > 0, javob: scopeNote + '\n\n' + header + '\n|---|---|---|---|---|\n' + rows.join('\n') + '\n\n' + note +
      (partial ? '\n\n' + text('Natija qisman. Aniq obyekt yoki material markasi bilan qidiruvni toraytiring.', 'Результат частичный. Уточните объект или марку материала.') : ''),
    dalil: { tur: 'obyektlar-smeta-narxi', rpc: 't2_agent_qidiruv_v1', qatorlar: evidence, partial, company_complete: false, qamrov: { smeta: true, prixod: false } } };
}
