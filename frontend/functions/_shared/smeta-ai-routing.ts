import type { AiEnv, AiRequest } from './ai';
import type { NarxSorovi, NarxTanlov } from '../../src/lib/smeta-ai/protokol';

export type StudioRoutingEnv = AiEnv & { SMETA_AI_UTILITY_MODEL?: string; SMETA_AI_UTILITY_ENABLED?: string };
export const UTILITY_MODEL = 'google/gemini-2.5-flash-lite';
export type RoutedPriceRequest = NarxSorovi & { sourceComplete?: boolean };

/** The profile's selected model remains the planner. A fast tier alone must NOT override it. */
export function studioModelRequest(env: StudioRoutingEnv, profil: string, amal: string, req: AiRequest, primary?: string): AiRequest {
  const utility = env.SMETA_AI_UTILITY_ENABLED !== '0' && profil === 'smeta_ai' && amal === 'smeta_narx_tanlash' &&
    req.workload === 'utility' && !req.model && !req.attachment;
  // A generic FAST env may itself point at the expensive planner; use a dedicated explicit helper choice.
  const model = env.SMETA_AI_UTILITY_MODEL?.trim() || UTILITY_MODEL;
  return utility ? { ...req, model,
    reasoning: { effort: model === UTILITY_MODEL ? 'none' : 'minimal' } } : { ...req, model: req.model ?? primary,
      ...(profil === 'smeta_ai' ? { workload: req.workload ?? 'primary' } : {}),
      ...(profil === 'smeta_ai' && req.workload === 'primary' && !req.model && !primary ? { tier: 'reasoning' } : {}) };
}

// Intentionally conservative: formatting only, NOT fuzzy names, lost digits, or Latin/Cyrillic transliteration.
const key = (s: string | null) => s?.normalize('NFKC').trim().replace(/\s+/gu, ' ').toUpperCase() ?? '';
const reference = (s: NarxSorovi) => !!key(s.birlik) && s.nomzodlar.length > 0 && s.nomzodlar.every(n =>
  key(n.nom) === key(s.nom) && key(n.birlik) === key(s.birlik) && !n.birlikBoshqa &&
  Number.isFinite(n.narx) && n.narx >= 0 && !!key(n.manba) &&
  !/smeta|смет|obosnovaniya emas/i.test(n.manba));

export function priceLane(s: RoutedPriceRequest): 'local' | 'utility' | 'primary' {
  if (s.sourceComplete === false) return 'primary'; // Truncated text can conceal a grade, unit or non-authoritative source.
  if (!s.nomzodlar.length) return 'utility'; // Search phrases only; no price/norm can be chosen.
  if (!reference(s)) return 'primary'; // Meaning, dimensions, missing units and company estimates need the planner.
  if (s.nomzodlar.length === 1) return 'local';
  // Selecting a different supplier/period/price is a business decision, not a cheap similarity task.
  return s.nomzodlar.every(n => n.narx === s.nomzodlar[0].narx) ? 'utility' : 'primary';
}

export function exactPriceChoice(s: RoutedPriceRequest): NarxTanlov {
  if (priceLane(s) !== 'local') throw new Error('EXACT_PRICE_GATE_REQUIRED');
  return { id: s.id, tanlov: s.nomzodlar[0].id, ishonch: 'yuqori', sabab: 'Yagona manba: resurs nomi va birligi aynan mos.' };
}

/** Self-reported confidence is NOT sufficient. Identity/unit/source gates also have to hold. */
export function utilityPriceAccepted(s: RoutedPriceRequest, t: NarxTanlov): boolean {
  if (s.sourceComplete === false) return false;
  if (t.id !== s.id || t.qayta_hisob) return false;
  if (!s.nomzodlar.length) return t.tanlov === null && !!t.qidiruv?.length;
  return priceLane(s) !== 'primary' && reference(s) && t.ishonch === 'yuqori' && s.nomzodlar.some(n => n.id === t.tanlov);
}
