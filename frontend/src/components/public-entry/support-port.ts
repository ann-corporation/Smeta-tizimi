/** Public support: visitor scope serverda aniqlanadi; company agent API bu port emas. */
export type SupportMessage = { id: string; author: 'visitor' | 'assistant' | 'operator'; text: string };
export type SupportSnapshot = {
  version: number;
  mode: 'AI_ASSISTING' | 'WAITING_OPERATOR' | 'HUMAN_ACTIVE' | 'CLOSED';
  messages: readonly SupportMessage[];
};
export interface PublicSupportPort {
  /** Faqat server tasdiqlagan transcript. Chat tokeni URL/UI matnida chiqmaydi. */
  read(signal: AbortSignal): Promise<SupportSnapshot>;
  send(command: { text: string; operationId: string }, signal: AbortSignal): Promise<SupportSnapshot>;
  requestOperator(command: { operationId: string }, signal: AbortSignal): Promise<SupportSnapshot>;
}
