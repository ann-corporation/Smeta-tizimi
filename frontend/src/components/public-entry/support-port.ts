/** Public support: visitor scope serverda aniqlanadi; company agent API bu port emas. */
export type SupportMessage = { id: string; author: 'visitor' | 'assistant' | 'operator'; text: string };
export type SupportSnapshot = {
  version: number;
  mode: 'AI_ASSISTING' | 'WAITING_OPERATOR' | 'HUMAN_ACTIVE' | 'CLOSED';
  messages: readonly SupportMessage[];
};

/** Tarmoq javobi TS kontraktiga avtomatik mos bo'lmaydi; noto'g'ri receipt qabul qilinmaydi. */
export function validateSupportSnapshot(value: unknown): SupportSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (!Number.isSafeInteger(v.version) || (v.version as number) < 0
    || !['AI_ASSISTING', 'WAITING_OPERATOR', 'HUMAN_ACTIVE', 'CLOSED'].includes(v.mode as string)
    || !Array.isArray(v.messages) || v.messages.length > 10000) return null;
  const ids = new Set<string>();
  const messages: SupportMessage[] = [];
  for (const item of v.messages) {
    if (!item || typeof item !== 'object') return null;
    const m = item as Record<string, unknown>;
    if (typeof m.id !== 'string' || !m.id || m.id.length > 200 || ids.has(m.id)
      || !['visitor', 'assistant', 'operator'].includes(m.author as string)
      || typeof m.text !== 'string' || m.text.length > 20000) return null;
    ids.add(m.id);
    messages.push({ id: m.id, author: m.author as SupportMessage['author'], text: m.text });
  }
  return { version: v.version as number, mode: v.mode as SupportSnapshot['mode'], messages: messages.slice(-100) };
}
export interface PublicSupportPort {
  /** Faqat server tasdiqlagan transcript. Chat tokeni URL/UI matnida chiqmaydi. */
  read(signal: AbortSignal): Promise<SupportSnapshot>;
  send(command: { text: string; operationId: string }, signal: AbortSignal): Promise<SupportSnapshot>;
  requestOperator(command: { operationId: string }, signal: AbortSignal): Promise<SupportSnapshot>;
}
