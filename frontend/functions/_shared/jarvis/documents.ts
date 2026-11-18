import type { RpcNatija } from '../agent-rpc';
import { jarvisHasPermission } from './authority';
import type { JarvisObjectScope, JarvisReadRpc } from './object-scope';
import { jarvisText } from './reply-language';

const canonical = 't2_document_canonical_get_v1';
const registry = 't2_document_registry_v1';
const hub = '/admin/documents';
const limit = 200;
const safeId = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
const nameKey = (v: string) => v.normalize('NFC').trim().toLowerCase();
const textName = (v: string) => v.replace(/[\r\n<>\[\]*_\x60]/g, ' ').trim().slice(0, 160);
type Query = { id: number } | { filename: string };

export function documentIntent(question: string): Query | null {
  const q = question.trim();
  const words = q.replace(/[«"“][^«»"“”\r\n]*[»"”]/g, ' ').replace(/[’‘ʻʼ']/g, '');
  if (/imzo\s+(?:qoy|chek)|имзо\s+қўй|подпиши|tasdiqla|тасдиқла|утверди|ochir|ўчир|удали|yukla(?!b)|загрузи/iu.test(words) ||
      !/och(?:ing|ib ber)?\b|yuklab (?:ol|ber)|korsat|top(?:ing|ib ber)?\b|оч|юклаб ол|кўрсат|топ|открой|скачай|найди|покажи/iu.test(words)) return null;
  const ids = [...words.matchAll(/(?:hujjat|ҳужжат|документ(?:а)?|fayl|файл(?:а)?)\s*(?:id\s*|№\s*|#\s*)?([1-9]\d{0,14})(?![\p{L}\d.-])/giu)];
  const names = [...q.matchAll(/[«"“]([^«»"“”\r\n\\/]{1,180}\.(?:pdf|xlsx?|docx?|zip|jpe?g|png|dwg))[»"”]/giu)];
  if (ids.length + names.length !== 1) return null;
  return ids.length ? { id: Number(ids[0][1]) } : { filename: names[0][1] };
}

type Document = { id: number; filename: string; ready: boolean };

export async function documentAnswer(rpc: JarvisReadRpc, scope: JarvisObjectScope, query: Query, authority: RpcNatija | null) {
  const text = scope.text ?? jarvisText();
  const denied = { rad: true, javob: text('Bu hujjatni ko‘rish uchun ruxsat kerak.', 'Для просмотра документа нужен доступ.') };
  const unavailable = { javob: text('Hujjatni tekshirib bo‘lmadi. Keyinroq urinib ko‘ring.', 'Не удалось проверить документ. Повторите запрос позже.') };
  const missing = { javob: text('Joriy doirada hujjat topilmadi.', 'Документ не найден в текущей области.') };
  const pending = { javob: text('Hujjat fayli hozir ochishga tayyor emas.', 'Файл документа пока недоступен.') };
  if (!jarvisHasPermission(authority, scope.company, 'document.read')) return denied;

  let found: Document[];
  let rpcName: string;
  let capped = false;
  if ('id' in query && scope.objectId === null) {
    rpcName = canonical;
    const r = await rpc(rpcName, { p_actor_id: scope.actor, p_document_id: query.id }).catch(() => null);
    if (r?.status === 403 || r?.status === 401) return denied;
    if (r?.data.code === 'DOCUMENT_NOT_FOUND' || r?.data.code === 'CANONICAL_BINARY_MISSING') return missing;
    if (!r?.ok || r.data.ok !== true || r.data.document_id !== query.id) return unavailable;
    if (r.data.kompaniya_id !== scope.company) return missing;
    found = [{ id: query.id, filename: typeof r.data.original_filename === 'string' ? r.data.original_filename : '', ready: true }];
  } else {
    rpcName = registry;
    const r = await rpc(rpcName, { p_actor_id: scope.actor, p_kompaniya_id: scope.company, p_loyiha_id: null,
      p_obyekt_id: scope.objectId, p_limit: limit }).catch(() => null);
    if (r?.status === 403 || r?.status === 401) return denied;
    const rows = r?.data.documents;
    if (!r?.ok || r.data.ok !== true || r.data.kompaniya_id !== scope.company || r.data.obyekt_id !== scope.objectId ||
        !Array.isArray(rows) || rows.length > limit) return unavailable;
    capped = rows.length === limit;
    found = rows.flatMap(row => {
      if (!row || typeof row.id !== 'string' || !/^[1-9]\d{0,14}$/.test(row.id) || typeof row.filename !== 'string') return [];
      const id = Number(row.id);
      if (!safeId(id) || ('id' in query ? id !== query.id : nameKey(row.filename) !== nameKey(query.filename))) return [];
      return [{ id, filename: row.filename, ready: row.canonicalStatus === 'READY' }];
    });
    if (!found.length && capped) return { javob: text('So‘nggi tekshirilgan hujjatlar orasida topilmadi. To‘liq ro‘yxatni oching.',
      'Документ не найден среди последних проверенных записей. Откройте полный список.') + `\n\n[${text('Hujjatlar', 'Документы')}](${hub})` };
    if (!found.length) return missing;
  }

  const label = (row: Document) => (textName(row.filename) || text('Hujjat', 'Документ')) + ` · #${row.id}`;
  const ready = found.filter(row => row.ready);
  if (ready.length !== found.length && found.length === 1) return pending;
  if (found.length > 1 || ('filename' in query && capped)) {
    const heading = capped ? text('Tekshirilgan ro‘yxatdagi mos hujjatlar', 'Совпадения среди проверенных документов')
      : text('Bir xil nomli hujjatlar topildi. Raqamini tanlang.', 'Найдено несколько документов с таким названием. Выберите номер.');
    const lines = found.slice(0, 6).map(row => '- ' + (row.ready ? `[${label(row)}](${hub}?document_id=${row.id})` : label(row)));
    return { javob: [heading, '', ...lines, '', `[${text('Hujjatlar', 'Документы')}](${hub})`].join('\n') };
  }
  const row = ready[0];
  const open = `${hub}?document_id=${row.id}`;
  const download = `/api/hujjat-ol?id=${row.id}`;
  const title = text('Hujjatni ochish', 'Открыть документ');
  return { javob: `**${label(row)}**\n\n[${title}](${open}) · [${text('Yuklab olish', 'Скачать')}](${download})`,
    dalil: { tur: 'hujjat', id: row.id, rpc: rpcName, yol: open },
    sahifalar: [{ yol: open, nom: title }] };
}
