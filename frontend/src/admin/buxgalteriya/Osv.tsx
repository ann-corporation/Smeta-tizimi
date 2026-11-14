import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download } from 'lucide-react';
import { t, tilLocale } from '../../i18n/til';
import { toast } from '../../umumiy/ui/Toast';
import { useKompaniya } from '../../test02/KompaniyaTanlov';
import { hujjatTokenBilan } from '../../lib/token-hujjat';
import { downloadBlob } from '../../lib/construction-document-control/export/download-helper';
import { buxOsvOl, type BuxOsv } from '../../api/t2-bux-hisob';
import { osvHujjat } from '../../lib/buxgalteriya/eksport';
import { osvMuvozanat, saldoTomoni } from '../../lib/buxgalteriya/hisob';
import { yigindi2 } from '../../lib/hisob-yadro';
import { Izoh, Son, SonBosh, XatoQator } from './umumiy';
import { DT_IZOH, KT_IZOH, td, th, type Davr } from './yordamchi';

/** Oborot-saldo vedomost (ОСВ): davr uchun har hisob — boshlang'ich saldo, oborot, oxirgi saldo. Jami Debet = jami Kredit. */
export function Osv({ kid, davr, versiya, onHisob }: { kid: number; davr: Davr; versiya: number; onHisob: (kod: string) => void }) {
  const [d, setD] = useState<BuxOsv | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const yukla = useCallback(async () => {
    const r = await buxOsvOl(kid, { dan: davr.dan, gacha: davr.gacha });
    if (r.ok) { setD(r.natija); setXato(null); } else setXato(r.error);
  }, [kid, davr.dan, davr.gacha]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void yukla(); }, [yukla, versiya]);

  const ru = tilLocale().startsWith('ru');
  const jami = useMemo(() => {
    const q = d?.qatorlar ?? [];
    return {
      ochDt: yigindi2(q.map((r) => saldoTomoni(r.ochilish).dt)), ochKt: yigindi2(q.map((r) => saldoTomoni(r.ochilish).kt)),
      yopDt: yigindi2(q.map((r) => saldoTomoni(r.yopilish).dt)), yopKt: yigindi2(q.map((r) => saldoTomoni(r.yopilish).kt)),
    };
  }, [d]);
  const m = d ? osvMuvozanat(d) : null;
  const { joriy } = useKompaniya();
  const eksport = async () => {
    if (!d) return;
    const { bytes, faylNomi } = osvHujjat({ kompaniya: (joriy as { nom?: string } | null | undefined)?.nom ?? null, osv: d });
    const r = await hujjatTokenBilan({ kompaniyaId: kid, bytes, hujjat: 'OBOROT_SALDO', sabab: `Оборотно-сальдовая ведомость · ${d.dan}..${d.gacha}` }, () => downloadBlob(bytes, faylNomi));
    toast(r.ok ? (r.xabar || t('Oborot-saldo yuklandi')) : r.xabar, r.ok ? 'ok' : 'danger');
  };

  return (
    <div className="space-y-3">
      <XatoQator xato={xato} />
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-semibold">{t('Oborot-saldo vedomost (оборотно-сальдовая ведомость, ОСВ)')}</span>
        <button type="button" className="fz-btn" disabled={!d || d.qatorlar.length === 0} title={t('Excel (token yechiladi)')} onClick={() => void eksport()}><Download size={13} /> {t('Excel')}</button>
      </div>
      {m && (m.muvozanatda
        ? <p className="flex items-center gap-1 text-[12.5px] text-ok"><CheckCircle2 size={14} /> {t('Jami Debet = jami Kredit: hisob muvozanatda.')}</p>
        : <p role="alert" className="flex items-center gap-1 text-[12.5px] text-danger"><AlertTriangle size={14} /> {t('Muvozanat buzilgan: Debet va Kredit farqi bor.')}</p>)}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-[12.5px]" aria-label={t('Oborot-saldo vedomost')}>
          <thead>
            <tr className="text-[10.5px] uppercase text-text-mute"><th colSpan={2} /><th colSpan={2} className="text-center">{t('Davr boshida')}</th><th colSpan={2} className="text-center">{t('Davr oboroti')}</th><th colSpan={2} className="text-center">{t('Davr oxirida')}</th></tr>
            <tr className="text-left text-[11px] uppercase text-text-mute">
              <th className={th}>{t('Hisob')}</th><th className={th}>{t('Nomi')}</th>
              <th className={`${th} text-right`}>{t('Debet')}<Izoh matn={DT_IZOH()} /></th><th className={`${th} text-right`}>{t('Kredit')}<Izoh matn={KT_IZOH()} /></th>
              <th className={`${th} text-right`}>{t('Debet')}</th><th className={`${th} text-right`}>{t('Kredit')}</th>
              <th className={`${th} text-right`}>{t('Debet')}</th><th className={`${th} text-right`}>{t('Kredit')}</th>
            </tr>
          </thead>
          <tbody>
            {d && d.qatorlar.length === 0 && <tr><td colSpan={8} className="px-2 py-6 text-center text-text-mute">{t('Bu davrda provodka yo‘q.')}</td></tr>}
            {!d && <tr><td colSpan={8} className="px-2 py-6 text-center text-text-mute">{t('Yuklanmoqda…')}</td></tr>}
            {(d?.qatorlar ?? []).map((r) => {
              const o = saldoTomoni(r.ochilish); const y = saldoTomoni(r.yopilish);
              return (
                <tr key={r.kod} className="cursor-pointer border-t border-border/50 hover:bg-surface-2" title={t('Provodkalarni ko‘rish')} onClick={() => onHisob(r.kod)}>
                  <td className={`${td} font-medium`}>{r.kod}</td><td className={td}>{ru ? r.nom_ru : r.nom_uz}</td>
                  <td className={`${td} text-right`}><SonBosh v={o.dt} /></td><td className={`${td} text-right`}><SonBosh v={o.kt} /></td>
                  <td className={`${td} text-right`}><SonBosh v={r.dt} /></td><td className={`${td} text-right`}><SonBosh v={r.kt} /></td>
                  <td className={`${td} text-right`}><SonBosh v={y.dt} /></td><td className={`${td} text-right`}><SonBosh v={y.kt} /></td>
                </tr>
              );
            })}
            {d && d.qatorlar.length > 0 && (
              <tr className="border-t border-border font-semibold">
                <td className={td} colSpan={2}>{t('Jami')}</td>
                <td className={`${td} text-right`}><Son v={jami.ochDt} /></td><td className={`${td} text-right`}><Son v={jami.ochKt} /></td>
                <td className={`${td} text-right`}><Son v={d.jami_dt} /></td><td className={`${td} text-right`}><Son v={d.jami_kt} /></td>
                <td className={`${td} text-right`}><Son v={jami.yopDt} /></td><td className={`${td} text-right`}><Son v={jami.yopKt} /></td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
