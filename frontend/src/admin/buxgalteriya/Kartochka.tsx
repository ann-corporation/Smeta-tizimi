import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { t, tilLocale } from '../../i18n/til';
import { buxKartochkaOl, type BuxHisob, type BuxKartochka } from '../../api/t2-bux-hisob';
import { MANBA_NOM, manbaYol, saldoTomoni } from '../../lib/buxgalteriya/hisob';
import { Izoh, Son, SonBosh, XatoQator } from './umumiy';
import { DT_IZOH, KT_IZOH, ddmmyyyy, kirit, td, th, type Davr } from './yordamchi';

/** Hisob kartochkasi (карточка счёта): bitta hisob bo'yicha davrdagi har provodka, qarshi hisob va yuruvchi saldo. */
export function Kartochka({ kid, davr, versiya, hisoblar, hisob, onHisob }: {
  kid: number; davr: Davr; versiya: number; hisoblar: BuxHisob[]; hisob: string; onHisob: (k: string) => void;
}) {
  const [d, setD] = useState<BuxKartochka | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const ru = tilLocale().startsWith('ru');
  const yukla = useCallback(async () => {
    if (!hisob) { setD(null); return; }
    const r = await buxKartochkaOl(kid, { dan: davr.dan, gacha: davr.gacha, hisob, limit: 1000 });
    if (r.ok) { setD(r.natija); setXato(null); } else setXato(r.error);
  }, [kid, davr.dan, davr.gacha, hisob]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void yukla(); }, [yukla, versiya]);

  const o = d ? saldoTomoni(d.ochilish) : null;
  const y = d ? saldoTomoni(d.yopilish) : null;
  const kop = d != null && d.qatorlar.length < d.jami;
  return (
    <div className="space-y-3">
      <XatoQator xato={xato} />
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-semibold">{t('Hisob kartochkasi (карточка счёта)')}</span>
        <select aria-label={t('Hisobni tanlang')} className={`${kirit} w-72`} value={hisob} onChange={(e) => onHisob(e.target.value)}>
          <option value="">{t('Hisobni tanlang…')}</option>
          {hisoblar.map((h) => <option key={h.kod} value={h.kod}>{h.kod} · {ru ? h.nom_ru : h.nom_uz}</option>)}
        </select>
        <Izoh matn={t('Bitta hisob bo‘yicha hamma provodka: qarshi hisob, Debet, Kredit va yuruvchi saldo. Qatorni bosish — hujjatga o‘tish.')} />
      </div>
      {!hisob && <p className="text-[12.5px] text-text-mute">{t('Kartochka ko‘rish uchun hisobni tanlang yoki Oborot-saldodan hisob qatorini bosing.')}</p>}
      {d && o && y && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-[12.5px]" aria-label={t('Hisob kartochkasi')}>
            <thead><tr className="text-left text-[11px] uppercase text-text-mute">
              <th className={th}>{t('Sana')}</th><th className={th}>{t('Hujjat')}</th><th className={th}>{t('Kontragent')}</th><th className={th}>{t('Qarshi hisob')}</th>
              <th className={`${th} text-right`}>{t('Debet')}<Izoh matn={DT_IZOH()} /></th><th className={`${th} text-right`}>{t('Kredit')}<Izoh matn={KT_IZOH()} /></th>
              <th className={`${th} text-right`}>{t('Saldo')}</th>
            </tr></thead>
            <tbody>
              <tr className="border-t border-border/50 font-medium">
                <td className={td} colSpan={4}>{t('Davr boshidagi saldo')}</td>
                <td className={`${td} text-right`}><SonBosh v={o.dt} /></td><td className={`${td} text-right`}><SonBosh v={o.kt} /></td><td className={`${td} text-right`}><Son v={d.ochilish} /></td>
              </tr>
              {d.qatorlar.length === 0 && <tr><td colSpan={7} className="px-2 py-6 text-center text-text-mute">{t('Bu davrda provodka yo‘q.')}</td></tr>}
              {d.qatorlar.map((p) => {
                const yol = manbaYol(p.manba_tur);
                const nom = p.hujjat ?? p.izoh ?? '—';
                return (
                  <tr key={p.id} className="border-t border-border/50">
                    <td className={td}>{ddmmyyyy(p.sana)}</td>
                    <td className={td}>
                      {yol ? <Link to={yol} className="text-accent underline" title={t('Hujjatga o‘tish')}>{nom}</Link> : nom}
                      <span className="ml-1 text-[10.5px] text-text-mute">{MANBA_NOM[p.manba_tur] ? t(MANBA_NOM[p.manba_tur]) : p.manba_tur}</span>
                    </td>
                    <td className={td}>{p.kontragent ?? '—'}</td>
                    <td className={td}><button type="button" className="underline" title={t('Shu hisob kartochkasini ochish')} onClick={() => onHisob(p.korr)}>{p.korr}</button></td>
                    <td className={`${td} text-right`}><SonBosh v={p.dt} /></td><td className={`${td} text-right`}><SonBosh v={p.kt} /></td>
                    <td className={`${td} text-right`}><Son v={p.saldo} /></td>
                  </tr>
                );
              })}
              <tr className="border-t border-border font-semibold">
                <td className={td} colSpan={4}>{t('Davr oboroti va oxirgi saldo')}</td>
                <td className={`${td} text-right`}><Son v={d.dt} /></td><td className={`${td} text-right`}><Son v={d.kt} /></td><td className={`${td} text-right`}><Son v={d.yopilish} qalin /></td>
              </tr>
            </tbody>
          </table>
          {kop ? <p className="px-2 py-1 text-[11.5px] text-text-mute">{t('Oxirgi {n} ta ko‘rsatildi (jami {jami}). Davrni toraytiring.', { n: d.qatorlar.length, jami: d.jami })}</p> : null}
        </div>
      )}
    </div>
  );
}
