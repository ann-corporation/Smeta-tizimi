import { diskPersonalRequested, type DiskReadCall, type DiskTransport } from '../../../src/lib/jarvis/disk-tools';
import type { RpcNatija } from '../agent-rpc';
import { jarvisHasPermission } from './authority';
import { jarvisText, type JarvisText } from './reply-language';

const plain = (value: unknown, limit = 180): string => typeof value === 'string' ? value.replace(/[\r\n<>\[\]*_`]/g, ' ').slice(0, limit) : '';
const scalar = (value: unknown): string => typeof value === 'number' && Number.isFinite(value) || typeof value === 'string' && /^-?\d+(?:\.\d+)?$/.test(value) ? String(value) : '—';
export async function diskReadAnswer(transport: DiskTransport, company: number, men: RpcNatija | null, call: DiskReadCall, text: JarvisText = jarvisText(), question = '') {
  const denied = { rad: true, code: 'PERMISSION_DENIED', javob: text('Disk ma’lumotlarini ko‘rish uchun ruxsat kerak.', 'Для просмотра диска нужен доступ.') };
  const unavailable = { code: 'SOURCE_UNAVAILABLE', javob: text('Disk ma’lumotlarini hozir tekshirib bo‘lmadi. Qayta urinib ko‘ring.', 'Не удалось проверить данные диска. Повторите запрос.') };
  if (!jarvisHasPermission(men, company, 'document.read')) return denied;
  if (call.scope === 'personal' && !diskPersonalRequested(question)) return { rad: true, code: 'SCOPE_REQUIRED', javob: text('Shaxsiy disk kerakmi? So‘rovda shaxsiy diskni aniq ko‘rsating.', 'Нужен личный диск? Явно укажите это в запросе.') };
  const scope = call.scope === 'personal' ? null : company;
  const response = await transport({ amal: 'vosita', nom: call.name, args: { ...call.args, kompaniya_id: scope } }).catch(() => null);
  if (!response || response.status < 200 || response.status >= 300 || response.body.ok !== true)
    return response?.status === 403 ? denied : unavailable;
  const data = response.body.natija;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return unavailable;
  const result = data as Record<string, unknown>;
  if (result.ok === false) return unavailable;
  // Folder IDs can override company inside the existing endpoint. Reject that answer before exposing it.
  if (call.name === 'fayl_royxat' && (result.ok !== true || result.kompaniya_id !== scope || result.shaxsiy !== (scope === null))) return denied;
  const heading = call.scope === 'personal' ? text('Shaxsiy Disk', 'Личный диск') : text('Kompaniya diski', 'Диск компании');
  const lines: string[] = [];
  if (call.name === 'fayl_kvota') {
    if (!['ishlatilgan', 'limit', 'foiz'].every(key => Object.hasOwn(result, key))) return unavailable;
    lines.push(text('Ishlatilgan: {used} bayt; limit: {limit} bayt; foiz: {percent}', 'Использовано: {used} байт; лимит: {limit} байт; процент: {percent}',
      { used: scalar(result.ishlatilgan), limit: scalar(result.limit), percent: scalar(result.foiz) }));
  } else {
    if (call.name === 'fayl_royxat' && (!Array.isArray(result.papkalar) || !Array.isArray(result.fayllar))) return unavailable;
    const rows = call.name === 'fayl_royxat' ? [...(Array.isArray(result.papkalar) ? result.papkalar : []), ...(Array.isArray(result.fayllar) ? result.fayllar : [])]
      : Array.isArray(result.royxat) ? result.royxat : null;
    if (!rows) return unavailable;
    for (const row of rows.slice(0, 30)) {
      if (!row || typeof row !== 'object' || !Number.isSafeInteger(row.id) || row.id <= 0) return unavailable;
      if (call.name === 'fayl_faoliyat') lines.push(`- #${row.id} · ${plain(row.vaqt)} · ${plain(row.amal)} · ${plain(row.ism)} · ${plain(row.tafsilot)}`);
      else {
        const name = plain(row.nom);
        if (!name) return unavailable;
        lines.push(`- #${row.id} · ${name}${Object.hasOwn(row, 'bayt') ? ' · ' + scalar(row.bayt) + ' B' : ''}`);
      }
    }
    if (!lines.length) lines.push(text('Mos yozuv topilmadi.', 'Подходящие записи не найдены.'));
    if (rows.length > 30) lines.push(text('Birinchi 30 ta yozuv ko‘rsatildi. To‘liq ro‘yxat Diskda.', 'Показаны первые 30 записей. Полный список на диске.'));
  }
  return { javob: heading + '\n\n' + lines.join('\n'), sahifalar: [{ yol: '/admin/documents', nom: text('Diskni ochish', 'Открыть диск') }],
    dalil: { tur: call.name, scope: call.scope, kompaniya_id: scope, endpoint: '/api/hujjat-buyruq' } };
}
