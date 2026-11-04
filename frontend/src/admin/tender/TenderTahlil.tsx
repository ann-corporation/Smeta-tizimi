/** Tender tahlili: byudjetga nisbatan tejam (QQS bilan), ishtirokchilar soni, aylanish vaqti, yetkazuvchi reytingi. Noma'lum = «kiritilmagan». */
import { useEffect, useState } from 'react';
import { t } from '../../i18n/til';
import { FmtN } from '../../lib/format';
import { OpsKpi, OpsKpiQator } from '../../components/kompaniya-ops/OpsUi';
import { tenderTahlilOl, type TenderTahlil as Tahlil } from '../../api/t2-tender';
import { tejam } from '../../lib/tender/pul';
import { Bosh, holatNomi } from './tender-ui';
import type { TenderHolat } from '../../lib/tender/holat';

const Yoq = () => <span className="text-text-mute">{t('kiritilmagan')}</span>;

export function TenderTahlil({ kompaniyaId, ochish }: { kompaniyaId: number; ochish: (id: number) => void }) {
  const [d, setD] = useState<Tahlil | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  useEffect(() => {
    let tirik = true;
    void tenderTahlilOl(kompaniyaId).then((r) => { if (!tirik) return; if (r.ok) { setD(r.natija); setXato(null); } else setXato(r.error); });
    return () => { tirik = false; };
  }, [kompaniyaId]);
  if (xato) return <Bosh>{xato}</Bosh>;
  if (!d) return <Bosh>{t('Yuklanmoqda…')}</Bosh>;
  const j = d.jami;
  return (
    <div className="space-y-3">
      <OpsKpiQator yorliq={t('Tender ko‘rsatkichlari')}>
        <OpsKpi nom={t('Tenderlar soni')} qiymat={j.tender_soni} />
        <OpsKpi nom={t('Jami tejam (QQS bilan)')} qiymat={j.jami_tejam_qqs_bilan == null ? <Yoq /> : <FmtN val={j.jami_tejam_qqs_bilan} />} rang="var(--ok)" ost={t('byudjeti va g‘olibi ma’lum {n} ta tender bo‘yicha', { n: j.tejam_hisoblangan_soni })} />
        <OpsKpi nom={t('O‘rtacha ishtirokchi')} qiymat={j.ortacha_ishtirokchi == null ? <Yoq /> : j.ortacha_ishtirokchi} ost={t('ochilgan tenderlarda')} />
        <OpsKpi nom={t('O‘rtacha aylanish (kun)')} qiymat={j.ortacha_aylanish_kun == null ? <Yoq /> : j.ortacha_aylanish_kun} ost={t('e’londan g‘olibgacha')} />
      </OpsKpiQator>
      <div className="fz-table-wrap"><table className="fz-table">
        <thead><tr><th>{t('Tender')}</th><th>{t('Holat')}</th><th className="fz-c-num">{t('Byudjet (QQS bilan)')}</th><th className="fz-c-num">{t('G‘olib (QQS bilan)')}</th><th className="fz-c-num">{t('Tejam')}</th><th className="fz-c-num">{t('Ishtirokchi')}</th><th className="fz-c-num">{t('Kun')}</th></tr></thead>
        <tbody>
          {d.tenderlar.length === 0 && <tr><td colSpan={7} className="p-4 text-center text-text-mute">{t('Hozircha tender yo‘q.')}</td></tr>}
          {d.tenderlar.map((x) => { const tj = tejam(x.byudjet_qqs_bilan, x.golib_qqs_bilan); return (
            <tr key={x.id} className="cursor-pointer" onClick={() => ochish(x.id)}>
              <td><span className="fz-c-shifr">{x.raqam ?? '#' + x.id}</span><span className="block text-[12px]">{x.nom}</span></td>
              <td>{holatNomi(x.holat as TenderHolat)}</td>
              <td className="fz-c-num">{x.byudjet_qqs_bilan == null ? <Yoq /> : <FmtN val={x.byudjet_qqs_bilan} />}</td>
              <td className="fz-c-num">{x.golib_qqs_bilan == null ? <Yoq /> : <FmtN val={x.golib_qqs_bilan} />}</td>
              <td className={`fz-c-num ${tj && tj.summa < 0 ? 'text-danger' : tj ? 'text-ok' : ''}`}>{tj == null ? <Yoq /> : <><FmtN val={tj.summa} />{tj.foiz != null && <span className="ml-1 text-[11px]">({tj.foiz}%)</span>}</>}</td>
              <td className="fz-c-num">{x.ishtirokchi}</td>
              <td className="fz-c-num">{x.aylanish_kun == null ? '—' : x.aylanish_kun}</td>
            </tr>); })}
        </tbody></table></div>
      <div className="fz-table-wrap"><table className="fz-table">
        <thead><tr><th>{t('Yetkazuvchi')}</th><th className="fz-c-num">{t('Buyurtmalar')}</th><th className="fz-c-num">{t('Reyting')}</th><th className="fz-c-num">{t('Baholar soni')}</th></tr></thead>
        <tbody>
          {d.yetkazuvchilar.length === 0 && <tr><td colSpan={4} className="p-4 text-center text-text-mute">{t('Hali g‘olib yetkazuvchi yo‘q.')}</td></tr>}
          {d.yetkazuvchilar.map((y) => <tr key={y.kompaniya_id}><td>{y.nom}</td><td className="fz-c-num">{y.buyurtma_soni}</td><td className="fz-c-num">{y.reyting_ball == null ? t('baho yo‘q') : y.reyting_ball + ' / 5'}</td><td className="fz-c-num">{y.baho_soni}</td></tr>)}
        </tbody></table></div>
    </div>
  );
}
