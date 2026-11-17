import type { RpcNatija } from '../agent-rpc';
import { jarvisHasPermission } from './authority';
import { resolveJarvisObject, type JarvisObjectScope, type JarvisReadRpc } from './object-scope';
import { jarvisText } from './reply-language';

const source = 't2_jarvis_smeta_qator_aniq_v1';
const shifr = /(?<![\p{L}\p{N}-])[a-zесакмнрхцую]{1,3}\d{1,4}(?:-\d{1,5}){1,5}(?:\s+[kк]-\d{1,4}){0,4}(?![\p{L}\p{N}-]|\s+[kк]-\d)/giu;
const plain = (value: string) => value.replace(/[\r\n<>\[\]*_\x60]/g, ' ').trim().slice(0, 200);
const exactKey = (value: string) => value.trim().toUpperCase().replace(/[‐‑–—]/g, '-').replace(/\s+/g, ' ')
  .replace(/[ЕСАКМНРХ]/g, letter => 'ECAKMHPX'['ЕСАКМНРХ'.indexOf(letter)]);

export function estimateRowIntent(question: string): string | null {
  const q = question.toLowerCase().replace(/[’ʻʼ‘']/g, '').replace(/[‐‑–—]/g, '-');
  // This route explains the source row. Editing, valuation and certified/factual quantities have their own routes.
  if (/narx|сумм|цена|расценить|summa|fakt|факт|\bf-?2\b|кс-?2|qqs|ндс|yoz\b|kirit|ozgartir|qosh\b|ochir|замени|внес|сохрани|удали|кирит|ўзгартир/u.test(q)) return null;
  const matches = [...new Set((q.match(shifr) ?? []).map(exactKey))];
  if (matches.length !== 1) return null;
  if (exactKey(q) === matches[0] || /smeta|смет|shifr|шифр|\bkod\b|код|qator|қатор|pozits|позиц|band|банд|bolim|бўлим|раздел|find|найди|покажи/u.test(q)) return matches[0];
  return null;
}

type EstimateRow = { id: number; kod: string; nom: string | null; tur: string; birlik: string | null; hajm: number | null;
  ierarxiya: Array<string | null>; ierarxiya_toliq: boolean };
function validRow(value: unknown, code: string): value is EstimateRow {
  if (!value || typeof value !== 'object') return false;
  const row = value as Partial<EstimateRow>;
  return typeof row.id === 'number' && Number.isSafeInteger(row.id) && row.id > 0 && typeof row.kod === 'string' && exactKey(row.kod) === code &&
    (row.nom === null || typeof row.nom === 'string') && typeof row.tur === 'string' && ['rz', 'bl', 'rs', 'mat', 'ob'].includes(row.tur) &&
    (row.birlik === null || typeof row.birlik === 'string') && (row.hajm === null || typeof row.hajm === 'number' && Number.isFinite(row.hajm)) &&
    typeof row.ierarxiya_toliq === 'boolean' && Array.isArray(row.ierarxiya) && row.ierarxiya.length <= 16 &&
    row.ierarxiya.every(name => name === null || typeof name === 'string');
}

export async function estimateRowAnswer(rpc: JarvisReadRpc, scope: JarvisObjectScope, code: string, authority: RpcNatija | null) {
  const text = scope.text ?? jarvisText();
  const denied = { rad: true, javob: text('Smeta qatorlarini ko‘rish uchun ruxsat kerak.', 'Для просмотра сметных позиций нужен доступ.') } as const;
  const unavailable = { javob: text('Smeta qatorini tekshirib bo‘lmadi. Keyinroq qayta urinib ko‘ring.', 'Не удалось проверить сметную позицию. Повторите запрос позже.') };
  if (!jarvisHasPermission(authority, scope.company, 'smeta.read')) return denied;
  const object = await resolveJarvisObject(rpc, scope).catch(() => ({ tur: 'unavailable' as const }));
  if (object.tur === 'denied') return denied;
  if (object.tur === 'unavailable') return unavailable;
  if (object.tur === 'noaniq') return { javob: text('Qaysi obyekt? {names}', 'Какой объект? {names}', { names: object.variantlar.map(row => plain(row.nom)).join(' · ') }) };
  if (object.tur === 'yoq') return { javob: text('Shifrni qaysi obyektning smetasidan qidiray?', 'В смете какого объекта искать шифр?') };
  const { id, nom } = object.obyekt;
  const result = await rpc(source, { p_actor_id: scope.actor, p_kompaniya_id: scope.company, p_obyekt_id: id, p_kod: code }).catch(() => null);
  if (result?.status === 403) return denied;
  if (!result?.ok || result.data.ok !== true || result.data.kompaniya_id !== scope.company || result.data.obyekt_id !== id) return unavailable;
  const rows = result.data.qatorlar;
  if (!Array.isArray(rows) || rows.length > 6 || !rows.every(row => validRow(row, code)) || new Set(rows.map(row => row.id)).size !== rows.length) return unavailable;

  const yol = `/admin/holat/${id}`;
  const unknown = text('noma’lum', 'неизвестно');
  const lines = rows.slice(0, 5).map((row: EstimateRow) => {
    const path = row.ierarxiya.map(name => name ? plain(name) : text('Nomsiz bo‘lim', 'Раздел без названия')).join(' › ');
    const quantity = row.hajm === null ? unknown : String(row.hajm).replace('.', ',');
    const unit = row.birlik ? plain(row.birlik) : unknown;
    const branch = path ? '\n  ' + path : '';
    return '- **' + plain(row.kod) + '** · ' + (row.nom ? plain(row.nom) : text('Nomi noma’lum', 'Название неизвестно')) +
      ' · ' + text('Hajm: {qty}, birlik: {unit}', 'Объём: {qty}, единица: {unit}', { qty: quantity, unit }) + branch +
      (row.ierarxiya_toliq ? '' : '\n  ' + text('Bo‘lim zanjiri to‘liq tekshirilmadi.', 'Цепочку разделов удалось проверить частично.'));
  });
  const title = text('**{name}** · joriy smeta', '**{name}** · текущая смета', { name: plain(nom) });
  const detail = lines.length ? lines.join('\n') : text('Smetada {code} shifrli qator topilmadi.', 'В смете нет позиции с шифром {code}.', { code });
  const more = rows.length > 5 ? '\n\n' + text('Shu shifrli yana qatorlar bor. Smetani oching.', 'Есть другие позиции с этим шифром. Откройте смету.') : '';
  return {
    javob: title + '\n\n' + detail + more + '\n\n' + text('[Smetani ochish]({url})', '[Открыть смету]({url})', { url: yol }),
    dalil: { tur: 'smeta-qator', id, qator_ids: rows.slice(0, 5).map(row => row.id), rpc: source, yol },
    sahifalar: [{ yol, nom: plain(nom) }],
  };
}
