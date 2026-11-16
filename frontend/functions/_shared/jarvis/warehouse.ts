import type { RpcNatija } from '../agent-rpc';
import { jarvisHasPermission } from './authority';
import type { JarvisReadRpc } from './object-scope';

const source = 't2_sklad_markaziy_qoldiq_v1';
const displayLimit = 8;
type WarehouseQuery = { warehouse: number | null; material: string | null };

/** «Markaziy ombor #7 qoldig‘i: sement». The optional search after ':' is passed to the existing warehouse reader. */
export function warehouseIntent(question: string): WarehouseQuery | null {
  const [head, ...terms] = question.split(':');
  if (!/(?:qoldi[gq]|қолди[ғқ]|остат|наличи)/iu.test(head)) return null;
  const id = /(?:ombor(?:i)?|омбор(?:и)?|sklad|склад(?:а|е|у)?)\s*(?:#|№)\s*(\d+)(?![\d./-])/iu.exec(head);
  if (!id && !/(?:markaziy\s+(?:ombor|sklad)|марказий\s+омбор|центральн\p{L}*\s+склад)/iu.test(head)) return null;
  if (/(?:\byoz\b|kirit|chiqar|berdim|saqla|hisobdan|запиш|спиш|выда[йт]|внес|sana|kecha|davr|ойлик|на дату)/iu.test(head)) return null;
  const value = id ? Number(id[1]) : null;
  return { warehouse: value !== null && Number.isSafeInteger(value) && value > 0 ? value : null,
    material: terms.join(':').trim().slice(0, 200) || null };
}

type StockRow = { nomi: string; birligi: string; qoldiq: number };
function validRow(raw: unknown): raw is StockRow {
  if (!raw || typeof raw !== 'object') return false;
  const row = raw as Partial<StockRow>;
  return typeof row.nomi === 'string' && !!row.nomi.trim() && typeof row.birligi === 'string' && !!row.birligi.trim() &&
    typeof row.qoldiq === 'number' && Number.isFinite(row.qoldiq) && row.qoldiq > 0;
}

const unavailable = { javob: 'Ombor qoldig‘ini hozir tekshirib bo‘lmadi. Keyinroq qayta urinib ko‘ring.' };
const denied = { rad: true, javob: 'Bu kompaniyaning ombor qoldig‘ini ko‘rish uchun ruxsat kerak.' } as const;
const plain = (s: string, max: number) => s.replace(/[\r\n\[\]()<>\x60*_]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

export async function warehouseAnswer(rpc: JarvisReadRpc, actor: number, company: number, query: WarehouseQuery, men: RpcNatija | null) {
  if (!jarvisHasPermission(men, company, 'warehouse.read')) return denied;
  if (query.warehouse === null) return { javob: 'Qaysi markaziy ombor? Ombor raqamini yozing. Masalan: «Ombor #7 qoldig‘i: sement».' };
  const result = await rpc(source, {
    p_actor_id: actor, p_kompaniya_id: company, p_sklad_id: query.warehouse, p_qidir: query.material, p_limit: displayLimit + 1,
  }).catch(() => null);
  if (!result?.ok) {
    return result?.status === 403 || result?.data.code === 'WAREHOUSE_SCOPE_MISMATCH' ? denied : unavailable;
  }
  const rows = result.data.qatorlar;
  if (result.data.ok !== true || !Array.isArray(rows) || rows.length > displayLimit + 1 || !rows.every(validRow)) return unavailable;
  const display = rows.slice(0, displayLimit).map(row => '- ' + plain(row.nomi, 100) + ' · ' +
    new Intl.NumberFormat('uz-UZ', { maximumSignificantDigits: 16 }).format(row.qoldiq) + ' ' + plain(row.birligi, 35));
  const yol = '/admin/logistika';
  return {
    javob: '**Markaziy ombor #' + query.warehouse + '** · ' + (query.material ? plain(query.material, 100) : 'musbat qoldiqlar ro‘yxati') + '\n\n' +
      (display.length ? display.join('\n') : 'So‘rov bo‘yicha musbat qoldiq topilmadi.') +
      (rows.length > displayLimit ? '\n\nQolgan materiallarni ombor sahifasida ko‘ring.' : '') + '\n\n[Manbani ochish](' + yol + ')',
    dalil: { tur: 'ombor', id: query.warehouse, rpc: source, yol },
  };
}
