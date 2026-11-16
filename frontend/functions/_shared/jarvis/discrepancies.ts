import type { RpcNatija } from '../agent-rpc';
import { jarvisHasPermission } from './authority';
import { resolveJarvisObject, type JarvisObjectScope, type JarvisReadRpc } from './object-scope';

const source = 't2_aosr_slichitelniy_v1';
const unavailable = { javob: 'Smeta va fakt solishtiruvini hozir tekshirib bo‘lmadi. Keyinroq qayta urinib ko‘ring.' };
const denied = { rad: true, javob: 'Solishtiruvni ko‘rish uchun fakt va hujjatlarni o‘qish ruxsati kerak.' } as const;

export function discrepancyIntent(question: string): boolean {
  const q = question.toLowerCase().replace(/[’ʻʼ‘']/g, '');
  if (/summa|narx|qiymat|сумм|цен[ау]|қиймат|yoz\b|kirit|yarat|saqla|tasdiqla\b|yubor|созда|внес|утверди|запиш|шу ой|shu oy|oylik|davr|период|месяц|\d{4}-\d{2}|на дату/u.test(q)) return false;
  return /\bslich\b|slichitel|сличитель/u.test(q)
    || (/(?:smeta|смет)/u.test(q) && /(?:fakt|факт)/u.test(q) && /farq|тафовут|фарқ|сравн|расхожд/u.test(q))
    || /(?:farq|фарқ|расхожд).*(?:aosr|аоср|asos)|(?:aosr|аоср|asos).*(?:farq|фарқ|расхожд)/u.test(q);
}

const fields = [
  ['farqli', 'Smeta va fakt hajmi farq qilgan ishlar'],
  ['ortiq', 'Fakt hajmi ortiq'],
  ['kam', 'Fakt hajmi kam'],
  ['tasdiqlagan', 'Farqli ishlar ichida АОСР asosi tasdiqlangan'],
  ['yetishmaydi_jami', 'Farqli ishlar ichida tasdiqlangan asos yetishmaydi'],
] as const;

const count = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
const plain = (value: string) => value.replace(/[\r\n<>\[\]*_\x60]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160);

export async function discrepancyAnswer(rpc: JarvisReadRpc, scope: JarvisObjectScope, men: RpcNatija | null) {
  if (!jarvisHasPermission(men, scope.company, 'fakt.read') ||
      !jarvisHasPermission(men, scope.company, 'document.read')) return denied;
  const selected = await resolveJarvisObject(rpc, scope).catch(() => ({ tur: 'unavailable' as const }));
  if (selected.tur === 'denied') return denied;
  if (selected.tur === 'unavailable') return unavailable;
  if (selected.tur === 'noaniq') return { javob: 'Qaysi obyekt? ' + selected.variantlar.map(row => plain(row.nom)).join(' · ') };
  if (selected.tur === 'yoq') return { javob: 'Qaysi obyekt bo‘yicha smeta va faktni solishtiray? Obyekt nomini yozing.' };
  const { id, nom } = selected.obyekt;
  const result = await rpc(source, {
    p_actor_id: scope.actor, p_kompaniya_id: scope.company, p_obyekt_id: id, p_limit: 1,
  }).catch(() => null);
  if (!result?.ok) return result?.status === 403 ? denied : unavailable;
  const { data } = result;
  if (data.ok !== true || data.obyekt_id !== id || !data.tayyorlik || typeof data.tayyorlik !== 'object') return unavailable;
  const readiness = data.tayyorlik as Record<string, unknown>;
  const values = fields.map(([field, label]) => [label, count(field === 'yetishmaydi_jami' ? data[field] : readiness[field])] as const);
  const lines = values.map(([label, value]) => '- ' + label + ': ' + (value === null ? 'noma’lum' : String(value)));
  const yol = '/admin/fakt?obyekt=' + id;
  return {
    javob: '**' + plain(nom) + '** · smeta va fakt hajmi solishtiruvi\n\n' + lines.join('\n') + '\n\n[Manbani ochish](' + yol + ')',
    dalil: { tur: 'smeta-fakt-solishtiruv', id, rpc: source, yol },
  };
}
