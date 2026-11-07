import { t } from '../../i18n/til';
import { useHotkeys } from '../../lib/hotkeys/useHotkeys';
import { INLINE_TAB, type InlineTur } from '../../lib/fakt-inline-amal';

/**
 * Faol qatorda z / q / m (yozayotganda Alt+Z / Alt+Q / Alt+M) — qator ostidagi panelni ochadi.
 * Yagona klaviatura moduli (lib/hotkeys) orqali: `?` yordam oynasida ko'rinadi, boshqa sohalar bilan to'qnashmaydi.
 */
export function useFaktInlineTugmalar(p: { faolQatorId: number | null; och: (tur: InlineTur) => boolean | void; faol: boolean }): void {
  const def = (tur: InlineTur, nom: string) => ({
    id: `fakt.inline.${tur}`, keys: [INLINE_TAB[tur].tugma, `alt+${INLINE_TAB[tur].tugma}`], nom, guruh: t('Zamena va qo‘shimchalar'), inInput: true,
    run: () => (p.faolQatorId == null ? false : p.och(tur)),
  });
  useHotkeys('fakt-inline', t('Zamena va qo‘shimchalar'), [
    def('zamena', t('Faol qator: zamena (boshqasi bilan almashtirildi)')),
    def('qoshimcha_ish', t('Faol qator: qo‘shimcha ish')),
    def('qoshimcha_material', t('Faol qator: qo‘shimcha material')),
  ], p.faol);
}
