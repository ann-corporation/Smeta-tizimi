import { FmtN } from '../../lib/format';
import { t } from '../../i18n/til';
import { smetaTengmi, type SmetaJuftlik } from '../../lib/smeta-jami';
import { SummaJuft } from './SummaJuft';

/**
 * SMETA JAMI JUFTI (egasi 2026-11-13): katta raqam — ASL smeta (shartnoma; qo‘shimcha/zamena kirmaydi),
 * ostida kichik — JORIY smeta (qo‘shimcha ishlar bilan). Ikkalasi yorliqli; teng bo‘lsa — bitta son.
 * Hisob yo‘q: qiymatlar serverning summa paketidan (`SummaJuft paket=`); noma’lum — «noma’lum», 0 emas.
 * `joriy === undefined` — manba joriyni bermaydi: faqat asl ko‘rsatiladi (joriy qatori yo‘q).
 */
export function SmetaJamiJuft({ juft, kichik = false, kesimYoq = false, className = '', kiritishYoli }: {
  juft: SmetaJuftlik; kichik?: boolean; kesimYoq?: boolean; className?: string; kiritishYoli?: { yol: string; matn?: string };
}) {
  const teng = smetaTengmi(juft);
  const yorliq = teng ? t('Smeta (asl = joriy), QQS bilan') : t('Asl smeta, QQS bilan');
  return (
    <span className={`inline-flex flex-col leading-tight ${className}`} data-testid="smeta-jami-juft">
      <SummaJuft paket={juft.asl} yorliq={yorliq} kichik={kichik} kesimYoq={kesimYoq} kiritishYoli={kiritishYoli} />
      {!teng && juft.joriy !== undefined && (
        <span className="text-[10.5px] text-text-mute tabular-nums" data-testid="smeta-joriy">
          {t('Joriy smeta (qo‘shimcha ishlar bilan)')}:{' '}
          {juft.joriy ? <FmtN val={juft.joriy.qqs_bilan} /> : <span className="text-warn">{t('noma’lum')}</span>}
        </span>
      )}
    </span>
  );
}
