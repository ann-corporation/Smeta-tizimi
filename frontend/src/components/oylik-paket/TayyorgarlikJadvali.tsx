/** «Tayyorgarlik» - shartnoma oylik paketi uchun obyektlar kesimida ✓ / ✗ / ⚠ jadvali. Hech narsani bloklamaydi. */
import { t } from '../../i18n/til';
import { KATAK_BELGI, TAYYORGARLIK_USTUNLARI, type Katak, type KatakHolat, type TayyorgarlikQator, type TayyorgarlikUstun } from '../../lib/f2-oylik-paket/shartnoma';

const SARLAVHA: Record<TayyorgarlikUstun, string> = {
  fakt: 'Fakt kiritilgan', f2: 'F2 holati', forma3: 'Forma-3', nakopitelniy: 'Nakopitelniy', m29: 'M-29', ostatka: 'Ostatka', slichitelniy: 'Slichitelniy', summa: 'Summa / narx',
};
const RANG: Record<KatakHolat, string> = { ok: 'text-ok', yoq: 'text-danger', ogoh: 'text-warn', nom: 'text-text-mute', na: 'text-text-mute' };
const NOM: Record<KatakHolat, string> = { ok: 'tayyor', yoq: 'yo‘q', ogoh: 'diqqat', nom: 'noma’lum', na: 'tegishli emas' };

function Hujayra({ k }: { k: Katak }) {
  return <td className={`px-2 py-1.5 text-center ${RANG[k.holat]}`} title={k.izoh ? t(k.izoh) : t(NOM[k.holat])}>
    <span aria-label={t(NOM[k.holat])}>{KATAK_BELGI[k.holat]}</span>{k.izoh && /^\d+$/.test(k.izoh) && k.holat !== 'ok' ? <sup className="ml-0.5 text-[10px]">{k.izoh}</sup> : null}
  </td>;
}

export function TayyorgarlikJadvali({ qatorlar }: { qatorlar: readonly TayyorgarlikQator[] }) {
  if (!qatorlar.length) return null;
  return <div className="rounded-lg border border-border/60" aria-label={t('Tayyorgarlik')}>
    <p className="px-3 pt-2 text-[12px] font-semibold text-text">{t('Tayyorgarlik')} <span className="font-normal text-text-mute">— {t('paketni bloklamaydi')}</span></p>
    <div className="overflow-auto">
      <table className="w-full min-w-[640px] text-[12px]">
        <thead className="text-left text-[11px] text-text-dim"><tr>
          <th className="px-2 py-1.5">{t('Obyekt')}</th>
          {TAYYORGARLIK_USTUNLARI.map((u) => <th key={u} className="px-2 py-1.5 text-center">{t(SARLAVHA[u])}</th>)}
        </tr></thead>
        <tbody>
          {qatorlar.map((q) => <tr key={q.obyektId} className="border-t border-border/60">
            <td className="px-2 py-1.5 font-medium text-text">{q.obyektNom}</td>
            {TAYYORGARLIK_USTUNLARI.map((u) => <Hujayra key={u} k={q[u]} />)}
          </tr>)}
        </tbody>
      </table>
    </div>
  </div>;
}
