/**
 * Jarvis F2/fakt vositalari server javobi — SOF TURLAR (brauzer/Functions ikkalasiga xavfsiz: importsiz).
 * Shartnoma: frontend/functions/api/f2-buyruq.ts. Mijoz (src/api/f2-buyruq.ts) va vosita qobig'i shu turlarni ishlatadi.
 */
export type F2Uchlik = { qqs_bilan: number | null; ustamali: number | null; ustamasiz: number | null; narxsiz_soni?: number | null };
export type F2Preview = {
  qatorlar: Array<{ qator_id: number; kod: string | null; nom: string | null; birlik: string | null; ozgarish: Array<{ maydon: string; oldin: number | null; keyin: number | null }>; olib_tashlandi?: boolean; yangi?: boolean }>;
  jami: { oldin: F2Uchlik | null; keyin: F2Uchlik | null; farq: F2Uchlik | null };
  natijalar: Array<{ rpc: string; ok: boolean; xabar?: string }>;
};
export type F2Javob = {
  ok?: boolean; code?: string; xabar?: string; holat?: string; token?: string; vosita?: string; tavsif?: string; ogohlantirish?: string[]; birlik_soni?: number;
  preview?: F2Preview; kerak?: number; balans?: number; yozildi?: number; sarflandi?: number; bepul_takror?: boolean; [k: string]: unknown;
};