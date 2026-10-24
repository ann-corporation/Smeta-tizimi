import type { BirjaRfq, BirjaTaklif } from '../../api/t2-birja';
import type { TaklifQatori } from './taqqoslash';

/** Birja RFQ + uning takliflari -> taqqoslash qatori. Hozirgi birjada muddat/yetkazish alohida maydon emas (izohda), shuning uchun null - taxmin qilinmaydi. */
export function birjaQatori(rfq: Pick<BirjaRfq, 'id' | 'nom' | 'birlik' | 'hajm'>, takliflar: readonly BirjaTaklif[]): TaklifQatori {
  const tartib = [...takliflar].sort((a, b) => a.id - b.id);
  return {
    qatorId: rfq.id, nom: rfq.nom, birlik: rfq.birlik,
    miqdor: Number.isFinite(Number(rfq.hajm)) ? Number(rfq.hajm) : null,
    takliflar: tartib.map((t) => ({ yetkazuvchiId: t.kompaniya_id, yetkazuvchiNom: `#${t.kompaniya_id}`, narx: t.narx == null ? null : Number(t.narx), muddatKun: null, yetkazishNarx: null })),
  };
}
