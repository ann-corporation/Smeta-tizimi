export const JARVIS_MAX_TURN_CHARS = 16_000;
export const JARVIS_MAX_TRANSCRIPT_TURNS = 256;
export const JARVIS_MAX_ARCHIVE_BYTES = 524_288;
export const JARVIS_MAX_MUTATION_BYTES = 262_144;

export type JarvisTurn = { r: 'user' | 'ai'; m: string };

export function validJarvisTurn(value: unknown): value is JarvisTurn {
  if (!value || typeof value !== 'object') return false;
  const turn = value as Partial<JarvisTurn>;
  return (turn.r === 'user' || turn.r === 'ai') && typeof turn.m === 'string' &&
    turn.m.length <= JARVIS_MAX_TURN_CHARS * 2 && !!turn.m.trim() &&
    (turn.m.length <= JARVIS_MAX_TURN_CHARS || [...turn.m].length <= JARVIS_MAX_TURN_CHARS);
}

export function validJarvisTurns(value: unknown): value is JarvisTurn[] {
  return Array.isArray(value) && value.length <= JARVIS_MAX_TRANSCRIPT_TURNS && value.every(validJarvisTurn);
}

export function legacyJarvisTurns(value: unknown): unknown {
  return validJarvisTurns(value) ? value.slice(-12).map(turn => ({ ...turn, m: [...turn.m].slice(0, 400).join('') })) : value;
}
