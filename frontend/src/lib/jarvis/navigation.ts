import { SAHIFALAR } from '../reestr/sahifa';
import { qidiruvKaliti } from '../../i18n/lotin-kirill';

export type JarvisOpen = { kalit: string; yol: string; parametrlar: Record<string, number> };
export const navigationTool = { name: 'navigate', mode: 'read', description: 'Offer a registered page to open. Never performs a business operation.' } as const;
export const navigationSchema = { type: 'object', additionalProperties: false, required: ['name', 'arguments'], properties: {
  name: { const: navigationTool.name }, arguments: { type: 'object', additionalProperties: false, required: ['page_key'],
    properties: { page_key: { type: 'string', enum: SAHIFALAR.map(page => page.kalit) } } },
} };
export function navigationCall(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).length !== 2) return null;
  const call = raw as { name?: unknown; arguments?: unknown };
  if (call.name !== navigationTool.name || !call.arguments || typeof call.arguments !== 'object' || Array.isArray(call.arguments)) return null;
  const args = call.arguments as { page_key?: unknown };
  return Object.keys(args).length === 1 && SAHIFALAR.some(page => page.kalit === args.page_key) ? String(args.page_key) : null;
}
export function navigationIntent(question: string): boolean {
  const text = question.toLowerCase() + ' ' + qidiruvKaliti(question);
  if (/kirim qil|chiqim qil|kirit|saqla|ozgartir|o.zgartir|tuzat|almashtir|bekor qil|yozib|qosh|qo.sh|созда|измени|запиши|спиши|оприход/.test(text)) return false;
  return /(?:^|\s)(?:och(?:ib(?: ber)?)?|qayerda|qayerdan|otib ber|olib bor)(?:\s|[?!.,]|$)|открой|перейди|как открыть|navigate/.test(text);
}
export function navigationPages(question: string): string[] {
  const query = qidiruvKaliti(question).replace(/f-2|ф-?2|ks-?2/g, 'f2');
  const words = query.split(/[^\p{L}\p{N}]+/u).map(word => word.replace(/(?:dagi|dan|ni|ga)$/, ''))
    .filter(word => (word.length >= 3 || word === 'f2') && !['och', 'ochib', 'qayerda', 'qayer', 'men', 'menga', 'sahifa', 'otkroy', 'ber'].includes(word));
  return SAHIFALAR.map(page => {
    const terms = qidiruvKaliti([page.nom, page.kalit, ...page.sinonimlar].join(' '));
    return { page, score: words.reduce((sum, word) => sum + (terms.includes(word) ? 1 : 0), 0) };
  }).filter(item => item.score > 0).sort((a, b) => b.score - a.score || a.page.tartib - b.page.tartib).map(item => item.page.kalit);
}

/** Route and numeric query values come from the shared registry, never arbitrary model URLs. */
export function navigationTarget(key: string, params: Record<string, number> = {}): JarvisOpen | null {
  const page = SAHIFALAR.find(row => row.kalit === key);
  if (!page) return null;
  const allowed = page.yol === '/admin/f2-tarix' ? ['obyekt', 'akt'] : page.scope === 'OBJECT_SCOPED' ? ['obyekt'] : [];
  if (Object.entries(params).some(([name, value]) => !allowed.includes(name) || !Number.isSafeInteger(value) || value <= 0)) return null;
  return { kalit: page.kalit, yol: page.yol, parametrlar: { ...params } };
}
export function navigationUrl(target: JarvisOpen): string {
  const search = new URLSearchParams(Object.entries(target.parametrlar).map(([key, value]): [string, string] => [key, String(value)]));
  return target.yol + (search.size ? '?' + search.toString() : '');
}
