import type { RpcNatija } from '../agent-rpc';
import { jarvisHasPermission } from './authority';
import { resolveJarvisObject, type JarvisObjectScope, type JarvisReadRpc } from './object-scope';
import { jarvisText } from './reply-language';

const source = 't2_qator_transport_audit_v1';

/** «Transport tekshir / auditi / xatolari» — faqat o'qish. Yozuv (taqsimla, belgila) alohida preview vositalarida (write-tools). */
export function transportIntent(question: string): boolean {
  const q = question.toLowerCase().replace(/[’ʻʼ‘']/g, '');
  if (/taqsimla|belgila|yozib|qo.y\b|o.zgartir|распредел|отметь|измени|установи/u.test(q)) return false;
  return /transport|трансп|t.?km|т.?км/u.test(q) && /tekshir|audit|xato|toza|muammo|tekshiruv|текшир|хато|провер|аудит|ошибк|проблем/u.test(q);
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : null);
const plain = (value: string) => value.replace(/[\r\n<>[\]*_\x60]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160);

export async function transportAnswer(rpc: JarvisReadRpc, scope: JarvisObjectScope, men: RpcNatija | null) {
  const text = scope.text ?? jarvisText();
  const unavailable = { javob: text('Transport auditini hozir tekshirib bo‘lmadi. Keyinroq qayta urinib ko‘ring.', 'Не удалось проверить транспорт. Повторите запрос позже.') };
  const denied = { rad: true, javob: text('Transport auditini ko‘rish uchun smetani o‘qish ruxsati kerak.', 'Для проверки транспорта нужен доступ к смете.') } as const;
  if (!jarvisHasPermission(men, scope.company, 'smeta.read')) return denied;
  const selected = await resolveJarvisObject(rpc, scope).catch(() => ({ tur: 'unavailable' as const }));
  if (selected.tur === 'denied') return denied;
  if (selected.tur === 'unavailable') return unavailable;
  if (selected.tur === 'noaniq') return { javob: text('Qaysi obyekt?', 'Какой объект?') + ' ' + selected.variantlar.map((row) => plain(row.nom)).join(' · ') };
  if (selected.tur === 'yoq') return { javob: text('Qaysi obyekt transportini tekshiray? Obyekt nomini yozing.', 'Транспорт какого объекта проверить? Укажите название.') };
  const { id, nom } = selected.obyekt;
  const result = await rpc(source, { p_actor_id: scope.actor, p_obyekt_id: id }).catch(() => null);
  if (!result?.ok) return result?.status === 403 ? denied : unavailable;
  const { data } = result;
  if (data.ok !== true || data.obyekt_id !== id || !data.xulosa || typeof data.xulosa !== 'object') return unavailable;
  const x = data.xulosa as Record<string, unknown>;
  const xatolar = Array.isArray(data.xatolar) ? data.xatolar as Array<Record<string, unknown>> : [];
  const unknown = text('noma’lum', 'неизвестно');
  const line = (uz: string, ru: string, v: unknown) => '- ' + text(uz, ru) + ': ' + (num(v) ?? unknown);
  const lines = [
    line('Foiz (podval transport %)', 'Процент (транспорт в подвале)', x.foiz), line('t·km (alohida qator)', 'т·км (отдельная строка)', x.tkm),
    line('Narx ichida', 'В цене', x.narx_ichida), line('t·km qatorlari', 'Строки т·км', x.tkm_qator_soni), line('Xatolar', 'Ошибки', x.xato_soni),
  ];
  const xato = xatolar.slice(0, 8).map((e) => '- ' + plain(String(e.kod ?? '')) + ' #' + String(num(e.qator_id) ?? '?') + ': ' + plain(String(e.xabar ?? '')));
  const yol = '/admin/holat/' + id + '?panel=transport';
  return {
    javob: text('**{name}** · transport turi auditi', '**{name}** · аудит вида транспорта', { name: plain(nom) }) + '\n\n' + lines.join('\n') +
      (xato.length ? '\n\n' + text('Xatolar (F-2 tasdiqlanishidan oldin tuzatiladi):', 'Ошибки (исправить до утверждения Ф-2):') + '\n' + xato.join('\n') : '') +
      '\n\n' + text('[Transport panelini ochish]({url})', '[Открыть панель транспорта]({url})', { url: yol }),
    dalil: { tur: 'transport-audit', id, rpc: source, yol },
  };
}
