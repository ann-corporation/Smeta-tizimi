import type { WarehouseOption, WarehouseSnapshot, WarehouseTransport } from '../../../src/lib/jarvis/warehouse-command';
import { qidiruvKaliti } from '../../../src/i18n/lotin-kirill';
import { kartaMatni } from '../telegram-ombor';
import type { JarvisText } from './reply-language';

/** All authority, matching, prices and preview signing stay in the warehouse endpoint. */
export async function warehouseCommand(call: WarehouseTransport, company: number, question: string, warehouseId?: number): Promise<WarehouseSnapshot> {
  if (!question.trim() || question.length > 1000) return { company, question, warehouses: [], warehouseId: null, result: { ok: false, code: 'TEXT_TOO_LONG' } };
  const context = await call({ amal: 'kontekst' });
  const warehouses: WarehouseOption[] = context.ok === true && Array.isArray(context.omborlar)
    ? context.omborlar.filter((row): row is WarehouseOption => row?.kompaniya_id === company && row.yozish === true &&
      Number.isSafeInteger(row.id) && row.id > 0 && typeof row.nomi === 'string' && !!row.nomi.trim()) : [];
  const scope = { company, question, warehouses, warehouseId: null, result: null };
  if (context.ok !== true) return { ...scope, result: { ok: false, code: String(context.code ?? 'SERVER_XATO') } };
  if (!warehouses.length) return { ...scope, result: { ok: false, code: 'PERMISSION_DENIED' } };
  const query = ' ' + qidiruvKaliti(question) + ' ';
  const named = warehouses.filter(row => query.includes(' ' + qidiruvKaliti(row.nomi) + ' '));
  const selected = warehouseId != null ? warehouses.find(row => row.id === warehouseId)
    : named.length === 1 ? named[0] : warehouses.length === 1 ? warehouses[0] : null;
  if (warehouseId != null && !selected) return { ...scope, result: { ok: false, code: 'PERMISSION_DENIED' } };
  if (!selected) return scope;
  const result = await call({ amal: 'tahlil', kompaniya_id: company, sklad_id: selected.id, matn: question });
  return { ...scope, warehouseId: selected.id, result: result as WarehouseSnapshot['result'] };
}

export function warehouseAnswer(snapshot: WarehouseSnapshot, text: JarvisText) {
  const result = snapshot.result;
  if (!result) return text('Qaysi ombor?', 'Какой склад?') + '\n' + snapshot.warehouses.map(row => `${row.nomi} (#${row.id})`).join('\n');
  if (!result.ok) return text('Ombor buyrug‘ini tayyorlab bo‘lmadi. Ruxsat va omborni tekshiring.', 'Не удалось подготовить складскую операцию. Проверьте доступ и склад.');
  return kartaMatni(result, text('uz', 'ru') === 'ru' ? 'ru' : 'uz');
}
