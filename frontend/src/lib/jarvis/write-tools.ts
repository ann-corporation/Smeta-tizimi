import { F2_VOSITALAR, YOZISH_NOMLARI, vositaSorov, type YozishNomi } from './f2-vositalar';
import type { F2Javob } from './f2-javob';
import { qidiruvKaliti } from '../../i18n/lotin-kirill';

/** Route F2/fact edits past the legacy client intent rewriter to the shared server. */
export function jarvisF2WriteIntent(question: string): boolean {
  const text = question.toLowerCase() + ' ' + qidiruvKaliti(question);
  if (/excel|xlsx|eksport|export|скача|выгруз|экспорт|ko.rsat|покаж|просмотр|(?:^|\s)och(?:ib|ish)?(?:\s|$)|откро/.test(text) &&
      !/o.zgartir|ozgartir|tuzat|kamaytir|oshir|almashtir|измени|исправ|уменьш|увелич|замени/.test(text)) return false;
  return /f-?2|ф-?2|кс-?2|fakt|факт/.test(text) &&
    /qil|ozgartir|o.zgartir|tuzat|yoz|kirit|qosh|qo.sh|kamaytir|oshir|almashtir|bekor|bajarilmadi|измени|установи|исправ|добав|запиши|уменьш|увелич|замени|отмени/.test(text);
}

export type JarvisPreview = F2Javob & { token: string; holat: 'tasdiq_kerak' };
export type JarvisWriteCall = { name: YozishNomi; args: Record<string, unknown> };
export type JarvisPreviewCall = (name: YozishNomi, args: Record<string, unknown>) => Promise<F2Javob>;
const id = { type: 'integer', minimum: 1 };
const number = { type: 'number' };
const string = { type: 'string' };
const rows = (properties: Record<string, unknown>, required: string[], maxItems: number) => ({ type: 'array', minItems: 1, maxItems,
  items: { type: 'object', additionalProperties: false, required, properties } });
const resource = { nom: string, birlik: string, kat: string, norma: number, hajm: number, narx: number, narx_manba: string, kod: string };
const parameters: Record<YozishNomi, Record<string, unknown>> = {
  fakt_yoz: { obyekt_id: id, sana: string, qatorlar: rows({ qator_id: id, hajm: number }, ['qator_id', 'hajm'], 200), izoh: string, raqam: string },
  f2_qoralama_tahrir: { akt_id: id, ozgartir: rows({ qator_id: id, hajm: number, narx: number, narxsiz: { type: 'boolean' } }, ['qator_id'], 100),
    olib_tashla: { type: 'array', items: id, maxItems: 200 }, kutilgan_versiya: { type: 'integer', minimum: 0 } },
  zamena_qosh: { obyekt_id: id, almashtirilayotgan_qator_id: id, rejim: { type: 'string', enum: ['ish', 'resurs'] },
    ish: { type: 'object', properties: { nom: string, birlik: string, hajm: number, kod: string } },
    resurslar: rows(resource, ['nom', 'birlik'], 60), fakt_hajm: number, sana: string, sabab: string },
  bajarilmadi: { obyekt_id: id, amal: { type: 'string', enum: ['belgila', 'bekor'] }, qatorlar: rows({ qator_id: id, hajm: number }, ['qator_id'], 200),
    qator_idlar: { type: 'array', items: id }, sabab_kod: string, sabab_izoh: string, sana: string, bekor_idlar: { type: 'array', items: id } },
  narx_tuzat: { obyekt_id: id, narxlar: rows({ qator_id: id, narx: number }, ['qator_id', 'narx'], 100), sabab: string },
};
export const jarvisWriteTools = F2_VOSITALAR.filter(tool => YOZISH_NOMLARI.includes(tool.nom as YozishNomi));
export const jarvisWriteSchemas = jarvisWriteTools.map(tool => ({ type: 'object', additionalProperties: false, required: ['name', 'arguments'],
  properties: { name: { const: tool.nom }, arguments: { type: 'object', additionalProperties: false, properties: parameters[tool.nom as YozishNomi] } } }));

/** Confirmation is never a model tool. Validate through the existing F2 contract. */
export function parseJarvisWriteCall(value: unknown): JarvisWriteCall | null {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 2) return null;
  const call = value as { name?: unknown; arguments?: unknown };
  if (!jarvisWriteTools.some(tool => tool.nom === call.name) || !call.arguments || typeof call.arguments !== 'object' || Array.isArray(call.arguments)) return null;
  const args = call.arguments as Record<string, unknown>;
  if (Object.keys(args).some(key => !Object.hasOwn(parameters[call.name as YozishNomi], key))) return null;
  const parsed = vositaSorov(call.name, args);
  return 'xato' in parsed || parsed.amal !== 'taklif' ? null : { name: parsed.vosita.nom as YozishNomi, args: parsed.a };
}

/** Keep model numbers byte-for-byte traceable to tool output. Raw evidence is retained. */
export function toolSummary(raw: string, evidence: string): string | null {
  try {
    const value = JSON.parse(raw) as { javob?: unknown; tool_call?: unknown };
    if (value.tool_call != null || typeof value.javob !== 'string' || !value.javob.trim()) return null;
    const numbers = new Set(evidence.match(/[-+]?\d+(?:[.,]\d+)*/g) ?? []);
    return (value.javob.match(/[-+]?\d+(?:[.,]\d+)*/g) ?? []).every(number => numbers.has(number)) ? value.javob.slice(0, 1200) : null;
  } catch { return null; }
}
