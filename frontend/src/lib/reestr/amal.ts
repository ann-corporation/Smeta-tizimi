/** AMAL REESTRI turi (ekotizim V2 §2): yagona amal = capability + RPC. 1-qadamda faqat tur; yozuvlar 3-qadamda. */
import type { IlovaKod } from '../ilova/ilovalar';

export type AmalTuri = 'oqish' | 'yozish';

export type Amal = {
  kalit: string;
  turi: AmalTuri;
  rpc: string;
  capability: string;
  ilova: IlovaKod;
  /** Amal tegishli sahifa kaliti (Sahifa.kalit). */
  sahifa?: string;
  /** AI (Jarvis) uchun tavsif; yozuvchi amalda dryRun majburiy (qo'riqchi test). */
  ai?: { tavsif: string; kirish: string; xavf: 'past' | 'orta' | 'yuqori'; dryRun: boolean };
  /** Token narxi (har ish pul ishlaydi qoidasi). */
  tokenNarx?: number;
  mindmapAmal?: string;
};

export const AMALLAR: readonly Amal[] = [];
