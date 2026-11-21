import { HUJJAT_VOSITALAR, hujjatVositaSorov } from './hujjat-vositalar';
import { qidiruvKaliti } from '../../i18n/lotin-kirill';

const definitions = {
  fayl_qidir: { matn: { type: 'string', minLength: 2, maxLength: 80 } },
  fayl_royxat: { papka_id: { type: 'integer', minimum: 1 }, savat: { type: 'boolean' } },
  fayl_kvota: {},
  fayl_faoliyat: { limit: { type: 'integer', minimum: 1, maximum: 30 } },
} as const;
export type DiskReadName = keyof typeof definitions;
export type DiskReadCall = { name: DiskReadName; scope: 'company' | 'personal'; args: Record<string, unknown> };
export type DiskTransport = (body: Record<string, unknown>) => Promise<{ status: number; body: Record<string, unknown> }>;
export const diskReadTools = HUJJAT_VOSITALAR.filter(tool => Object.hasOwn(definitions, tool.nom));
export function diskPersonalRequested(question: string): boolean {
  const text = question.toLowerCase() + ' ' + qidiruvKaliti(question);
  return /shaxsiy|o.zimning|mening.*(?:disk|fayl|hujjat)|fayllarim|hujjatlarim|личн|мо[йия].*(?:диск|файл|документ)/.test(text);
}
export function diskReadIntent(question: string): DiskReadCall | null {
  const text = question.toLowerCase() + ' ' + qidiruvKaliti(question);
  if (!/disk|drive|fayllarim|hujjatlarim|диск/.test(text) || /saqla|yukla|ochir|o.chir|savatga|ulash|yoz|удал|сохрани|загрузи|подели/.test(text)) return null;
  const scope = diskPersonalRequested(question) ? 'personal' : 'company';
  const quoted = /[«“"]([^»”"\n]{2,80})[»”"]/.exec(question)?.[1];
  const name = /kvota|hajm|qancha joy|сколько.*мест|квот|объ[её]м/.test(text) ? 'fayl_kvota'
    : /faoliyat|kim nima|действи|активност|кто.*делал/.test(text) ? 'fayl_faoliyat'
    : quoted && /top|qidir|найд|поиск/.test(text) ? 'fayl_qidir'
    : /royxat|ro.yxat|fayllar|список|файлы/.test(text) ? 'fayl_royxat' : null;
  return name ? diskReadCall({ name, arguments: { scope, ...(name === 'fayl_qidir' ? { matn: quoted } : {}) } }) : null;
}
export const diskReadSchemas = diskReadTools.map(tool => ({ type: 'object', additionalProperties: false, required: ['name', 'arguments'], properties: {
  name: { const: tool.nom }, arguments: { type: 'object', additionalProperties: false,
    ...(tool.nom === 'fayl_qidir' ? { required: ['matn'] } : {}),
    properties: { ...definitions[tool.nom as DiskReadName], scope: { type: 'string', enum: ['company', 'personal'] } },
  },
} }));
export function diskReadCall(raw: unknown): DiskReadCall | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).length !== 2) return null;
  const call = raw as { name?: unknown; arguments?: unknown };
  if (typeof call.name !== 'string' || !Object.hasOwn(definitions, call.name) || !call.arguments || typeof call.arguments !== 'object' || Array.isArray(call.arguments)) return null;
  const name = call.name as DiskReadName;
  const { scope = 'company', ...args } = call.arguments as Record<string, unknown>;
  if (!['company', 'personal'].includes(String(scope)) || Object.keys(args).some(key => !Object.hasOwn(definitions[name], key))) return null;
  if (args.matn != null && (typeof args.matn !== 'string' || args.matn.trim().length < 2 || args.matn.length > 80)) return null;
  if (args.papka_id != null && (!Number.isSafeInteger(args.papka_id) || Number(args.papka_id) <= 0)) return null;
  if (args.savat != null && typeof args.savat !== 'boolean') return null;
  if (args.limit != null && (!Number.isSafeInteger(args.limit) || Number(args.limit) < 1 || Number(args.limit) > 30)) return null;
  const parsed = hujjatVositaSorov(name, args);
  if ('xato' in parsed || parsed.amal !== 'oqish') return null;
  const { kompaniya_id: _company, ...safe } = parsed.a;
  return { name, scope: scope as DiskReadCall['scope'], args: safe };
}
