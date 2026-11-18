/**
 * F2 portfeli — tez yo'l uchun toza funksiyalar. YANGI HISOB YO'Q: summalar serverning yagona yadrosidan (`f2_portfel_v1` /
 * `f2_portfel_summa_v1` → `_t2_summa_paket_v1`) keladi; bu yerda faqat shaklga keltirish va yig'ish (qo'shish) bor.
 * Bekor qilingan akt hech bir jamiga kirmaydi; summasi noma'lum akt jamiga 0 bo'lib qo'shilmaydi (NULL ≠ 0).
 */
import type { PortfelAktQator, PortfelHolat } from '../../api/t2-f2-portfel';
import type { SummaPaket } from '../summa-paket';
import { yaxlit2 } from '../hisob-yadro';
import type { ReestrAkt, F2Bosqich } from '../f2-reestr/reestr';
import type { AktMoliya, PaketAkt } from './oylik';

/** Server holati (yadro semantikasi) → ekran bosqichi. Qoralama + rad etilgan (`rejected`) — «rad». */
export function portfelBosqich(a: Pick<PortfelAktQator, 'holat' | 'lifecycle_status'>): F2Bosqich {
  if (a.holat === 'tasdiqlangan') return 'tasdiqlangan';
  if (a.holat === 'bekor') return 'bekor';
  return a.lifecycle_status === 'rejected' ? 'rad' : 'jarayonda';
}

/** Server paketi → `AktMoliya` (paket-eksport/svod shakli). Qiymatlar o'zgarmaydi, qayta hisob yo'q. */
export function paketdanMoliya(p: SummaPaket | null | undefined): AktMoliya | null {
  if (!p) return null;
  return { ustamasiz: p.ustamasiz, ustamali: p.ustamali, taxminiy: false, nds: p.qqs, jami: p.qqs_bilan, narxsizQator: p.narxsiz_soni, qatorSoni: p.qator_soni, sabab: null };
}

/** Server akt qatori → `ReestrAkt` (hujjat generatori / svod uchun). */
export function reestrAktidan(a: PortfelAktQator, p?: SummaPaket | null): ReestrAkt {
  return { id: a.id, obyekt_id: a.obyekt_id, oy: a.oy, raqam: a.raqam, holat: a.holat, lifecycle_status: a.lifecycle_status, hujjat_jami: a.hujjat_jami,
    farq: null, qator_soni: p?.qator_soni ?? null, narxsiz_qator: p?.narxsiz_soni ?? null, manba: a.manba === 'import' ? 'import' : a.manba === 'tizim' ? 'tizim' : null };
}

export function paketAktiga(a: PortfelAktQator, p: SummaPaket | null | undefined): PaketAkt {
  return { akt: reestrAktidan(a, p), obyektNom: a.obyekt_nom, loyiha: null, bosqich: portfelBosqich(a), moliya: paketdanMoliya(p), moliyaXato: false, uchastkalar: null };
}

export type PortfelYigindi = { soni: number; qqsBilan: number | null; ustamali: number | null; ustamasiz: number | null; nomalum: number };

/** Aktlarning O'Z server paketlari yig'indisi (faqat qo'shish; bekor kirmaydi). `holat` — kerakli holatlar. */
export function aktlarYigindisi(aktlar: readonly PortfelAktQator[], paket: ReadonlyMap<number, SummaPaket | null>, holat: readonly PortfelHolat[]): PortfelYigindi {
  const y: PortfelYigindi = { soni: 0, qqsBilan: null, ustamali: null, ustamasiz: null, nomalum: 0 };
  for (const a of aktlar) {
    if (!holat.includes(a.holat)) continue;
    y.soni++;
    const p = paket.get(a.id);
    if (!p) { y.nomalum++; continue; }
    y.qqsBilan = (y.qqsBilan ?? 0) + p.qqs_bilan; y.ustamali = (y.ustamali ?? 0) + p.ustamali; y.ustamasiz = (y.ustamasiz ?? 0) + p.ustamasiz;
  }
  const yaxlit = (n: number | null) => (n == null ? null : yaxlit2(n));
  return { ...y, qqsBilan: yaxlit(y.qqsBilan), ustamali: yaxlit(y.ustamali), ustamasiz: yaxlit(y.ustamasiz) };
}

/**
 * Server jami (shartnoma/obyekt paketlari) bilan aktlar yig'indisi farqi (tiyin): ikkalasi ham yadrodan, shuning uchun farq 0 bo'lishi kerak.
 * Farq bo'lsa — ekranda sariq ogohlantirish (jim tuzatilmaydi). Faqat HAMMA aktning summasi kelgan bo'lsa solishtiriladi.
 */
export function jamiFarqi(server: SummaPaket | null, y: PortfelYigindi): number | null {
  if (!server || y.nomalum > 0 || y.qqsBilan == null) return null;
  const f = yaxlit2(server.qqs_bilan - y.qqsBilan);
  return Math.abs(f) > 0.05 ? f : 0;
}
