import { BUYURTMA_HOLAT_NOMI, BUYURTMA_HOLAT_RANG, type BuyurtmaHolat } from '../../lib/yetkazuvchi/buyurtma-holat';
import { t } from '../../i18n/til';

/** Buyurtma holati - rangli yorliq (xaridor va yetkazuvchi ko'zida bir xil nom). */
export function BuyurtmaChip({ holat }: { holat: BuyurtmaHolat }) {
  const rang = BUYURTMA_HOLAT_RANG[holat];
  return <span className={`fz-stamp ${!rang || rang === 'mute' ? '' : 'fz-stamp--' + rang}`}>{t(BUYURTMA_HOLAT_NOMI[holat] ?? holat)}</span>;
}
