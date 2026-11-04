/**
 * Yuk birjasi: to'lov (escrow) — PROVAYDER-NOMA'LUM interfeys. Platforma pulni O'ZI USHLAMAYDI: litsenziyali provayder (Click/Payme/Uzum —
 * egasi keyin tanlaydi) marketplace/split yoki escrow sxemasida pulni ushlaydi va chiqaradi. Bu yerda faqat shartnoma (interfeys) va STUB.
 * Oqim: bron → hold → (yuklash/yetkazish isboti) → tasdiq → release (komissiya split) | refund | nizo (muzlatish).
 * Provayder natijasi hodisa (TolovHodisaYozuv) sifatida bazaga t2_yb_tolov_hodisa_v1 orqali yoziladi (service_role, idempotent: operationId).
 * Yuridik jihatlar (to'lov tashkiloti litsenziyasi, soliq agenti, QQS) — tekshirish kerak.
 */
import { qatorSumma, qqsBilan, yaxlit2 } from '../hisob-yadro';
import type { TolovHodisa } from './holat';

export type TolovSorovi = {
  tolovId: number;
  bronId: number;
  /** QQS siz asos, so'm. */
  summaQqsSiz: number;
  qqsFoiz: number;
  /** Platforma komissiyasi, % (tashuvchidan, QQS siz asosdan). */
  komissiyaFoiz: number;
  /** Idempotentlik kaliti (provayderga ham, bazaga ham shu UUID). */
  operationId: string;
};
export type TolovHodisaYozuv = { operationId: string; tolovId: number; hodisa: TolovHodisa; provider: string; providerRef: string | null };

export interface TolovProvayder {
  readonly nom: string;
  /** Egasi to'lovini ushlab turish (hold). Natija: hold_ok | hold_xato. */
  hold(s: TolovSorovi): Promise<TolovHodisaYozuv>;
  /** Tashuvchiga chiqarish (komissiya split bilan). Natija: release_ok. */
  release(s: TolovSorovi): Promise<TolovHodisaYozuv>;
  /** Egasiga qaytarish. Natija: refund_ok. */
  refund(s: TolovSorovi): Promise<TolovHodisaYozuv>;
}

export type TolovSumma = { qqsSiz: number; jami: number | null; komissiya: number | null; tashuvchiga: number | null };
/** Summa taqsimoti (SQL _t2_yb_tolov_chiqarish bilan bir xil): komissiya = QQS siz × foiz; tashuvchiga = jami − komissiya. */
export function tolovSumma(summaQqsSiz: number, qqsFoiz: number, komissiyaFoiz: number): TolovSumma {
  const jami = qqsBilan(summaQqsSiz, qqsFoiz);
  const komissiya = qatorSumma(summaQqsSiz, komissiyaFoiz * 0.01);
  return { qqsSiz: summaQqsSiz, jami, komissiya, tashuvchiga: jami == null || komissiya == null ? null : yaxlit2(jami - komissiya) };
}

/** STUB: testlar va dev uchun. Haqiqiy pul harakati YO'Q. `xatoHold` — hold_xato qaytaradi. providerRef — deterministik. */
export class StubTolovProvayder implements TolovProvayder {
  readonly nom = 'stub';
  readonly jurnal: Array<{ amal: 'hold' | 'release' | 'refund'; tolovId: number; operationId: string }> = [];
  constructor(private readonly sozlama: { xatoHold?: boolean } = {}) {}
  private yoz(amal: 'hold' | 'release' | 'refund', s: TolovSorovi, hodisa: TolovHodisa): TolovHodisaYozuv {
    this.jurnal.push({ amal, tolovId: s.tolovId, operationId: s.operationId });
    return { operationId: s.operationId, tolovId: s.tolovId, hodisa, provider: this.nom, providerRef: `STUB-${amal}-${s.tolovId}` };
  }
  async hold(s: TolovSorovi) { return this.yoz('hold', s, this.sozlama.xatoHold ? 'hold_xato' : 'hold_ok'); }
  async release(s: TolovSorovi) { return this.yoz('release', s, 'release_ok'); }
  async refund(s: TolovSorovi) { return this.yoz('refund', s, 'refund_ok'); }
}