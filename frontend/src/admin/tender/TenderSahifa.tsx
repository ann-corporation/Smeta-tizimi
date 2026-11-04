/**
 * Tender / xarid (egasi 2026-11-03): xaridor — o'z tenderlari (qoralama → tasdiq → e'lon → ochish → baholash → g'olib),
 * yetkazuvchi/pudratchi — «Menga taklif» va ochiq e'lonlar, taklif berish; tahlil.
 * Takliflar muddat tugaguncha va xaridor ochmaguncha yashirin (baza qoidasi). Mobil: jadvallar ichida gorizontal skroll.
 */
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BarChart3, FileText, Inbox, Plus, RefreshCw, Send } from 'lucide-react';
import { Sahifa } from '../../umumiy/ui/Sahifa';
import { useKompaniya } from '../../test02/KompaniyaTanlov';
import { OpsQidiruv, OpsTablar } from '../../components/kompaniya-ops/OpsUi';
import { t } from '../../i18n/til';
import { tenderRoyxatOl, type TenderRoyxatQator, type TenderTafsilot as Tafsilot, type TenderYonalish } from '../../api/t2-tender';
import { FmtN } from '../../lib/format';
import { Bosh, HolatBelgi, sanaVaqt, turNomi } from './tender-ui';
import { TenderTafsilot } from './TenderTafsilot';
import { TenderTahrir } from './TenderTahrir';
import { TenderTahlil } from './TenderTahlil';

type Tab = TenderYonalish | 'tahlil';

export default function TenderSahifa() {
  const { joriy } = useKompaniya();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>('meniki');
  const [qatorlar, setQatorlar] = useState<TenderRoyxatQator[]>([]);
  const [xato, setXato] = useState<string | null>(null);
  const [yuk, setYuk] = useState(false);
  const [qidiruv, setQidiruv] = useState('');
  const [tahrirOchiq, setTahrirOchiq] = useState(false);
  const [tahrirTd, setTahrirTd] = useState<Tafsilot | null>(null);
  const [v, setV] = useState(0);
  const tanlangan = Number(params.get('id')) || null;

  const yukla = useCallback(async () => {
    if (!joriy || tab === 'tahlil') return;
    setYuk(true);
    const r = await tenderRoyxatOl({ kompaniyaId: joriy.id, yonalish: tab, limit: 100 });
    setYuk(false);
    if (r.ok) { setQatorlar(r.natija.qatorlar); setXato(null); } else { setQatorlar([]); setXato(r.error); }
  }, [joriy, tab]);
  useEffect(() => { void yukla(); }, [yukla]);

  const ochish = (id: number | null) => { const p = new URLSearchParams(params); if (id) p.set('id', String(id)); else p.delete('id'); setParams(p, { replace: false }); };
  const korinadi = qatorlar.filter((q) => !qidiruv || `${q.raqam ?? ''} ${q.nom} ${q.egasi_nom ?? ''}`.toLowerCase().includes(qidiruv.toLowerCase()));
  if (!joriy) return <Sahifa sarlavha="Tender / xarid"><Bosh>{t('Kompaniya tanlang.')}</Bosh></Sahifa>;

  return (
    <Sahifa
      sarlavha="Tender / xarid"
      tavsif="Tovar, xizmat va subpudrat uchun tender: tasdiq → e’lon → muhrlangan takliflar → solishtirish → g‘olib → buyurtma."
      amallar={tab !== 'tahlil' && !tanlangan ? <>
        <button type="button" className="fz-btn fz-btn--ghost" onClick={() => void yukla()} disabled={yuk}><RefreshCw className={yuk ? 'animate-spin' : ''} /> {t('Yangilash')}</button>
        <button type="button" className="fz-btn fz-btn--primary" onClick={() => { setTahrirTd(null); setTahrirOchiq(true); }}><Plus /> {t('Yangi tender')}</button>
      </> : undefined}
    >
      <div className="flex flex-col gap-3 overflow-auto">
        {tanlangan ? (
          <TenderTafsilot key={tanlangan + ':' + v} kompaniyaId={joriy.id} rfqId={tanlangan} orqaga={() => ochish(null)} tahrirlash={(td) => { setTahrirTd(td); setTahrirOchiq(true); }} />
        ) : (
          <>
            <OpsTablar yorliq={t('Tender bo‘limlari')} joriy={tab} onTanla={setTab} tablar={[
              { id: 'meniki', nom: t('Mening tenderlarim'), ikon: <FileText /> },
              { id: 'menga', nom: t('Menga taklif qilingan'), ikon: <Inbox /> },
              { id: 'ochiq', nom: t('Ochiq e’lonlar'), ikon: <Send /> },
              { id: 'tahlil', nom: t('Tahlil'), ikon: <BarChart3 /> },
            ]} />
            {tab === 'tahlil' ? <TenderTahlil kompaniyaId={joriy.id} ochish={(id) => { setTab('meniki'); ochish(id); }} /> : (
              <>
                <OpsQidiruv qiymat={qidiruv} onChange={setQidiruv} placeholder={t('Raqam, nom yoki tashkilot bo‘yicha…')} />
                {xato && <Bosh>{xato}</Bosh>}
                <div className="fz-table-wrap"><table className="fz-table min-w-[620px]">
                  <thead><tr><th>{t('Tender')}</th><th>{t('Holat')}</th><th>{t('Muddat')}</th><th className="fz-c-num">{t('Pozitsiya')}</th>
                    <th className="fz-c-num">{tab === 'meniki' ? t('Takliflar') : t('Sizning taklifingiz')}</th><th className="fz-c-num">{t('Byudjet')}</th></tr></thead>
                  <tbody>
                    {!yuk && korinadi.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-text-mute">
                      {tab === 'meniki' ? t('Hali tender yo‘q. «Yangi tender» tugmasi bilan yarating yoki zayavkadan import qiling.') : tab === 'menga' ? t('Sizga taklif qilingan tender yo‘q.') : t('Ochiq e’lonlar yo‘q.')}</td></tr>}
                    {korinadi.map((q) => (
                      <tr key={q.id} className="cursor-pointer" onClick={() => ochish(q.id)}>
                        <td><span className="fz-c-shifr">{q.raqam ?? '#' + q.id}</span><span className="block text-[12.5px] font-medium">{q.nom}</span>
                          <span className="block text-[11px] text-text-mute">{turNomi(q.tur)}{q.egasi_nom ? ' · ' + q.egasi_nom : ''}{q.raund > 1 ? ' · ' + t('Raund {n}', { n: q.raund }) : ''}</span></td>
                        <td><HolatBelgi holat={q.effektiv_holat} /></td>
                        <td className="whitespace-nowrap text-[12px]">{sanaVaqt(q.muddat)}</td>
                        <td className="fz-c-num">{q.qator_soni}{q.lot_soni > 1 ? <span className="text-[11px] text-text-mute"> / {q.lot_soni} {t('lot')}</span> : null}</td>
                        <td className="fz-c-num">{tab === 'meniki' ? (q.takliflar_soni ?? 0) : q.mening_taklifim ? t('yuborilgan') : '—'}</td>
                        <td className="fz-c-num">{q.byudjet_qqs_bilan == null ? <span className="text-text-mute">—</span> : <><FmtN val={q.byudjet_qqs_bilan} /><span className="block text-[11px] text-text-mute">{t('QQS bilan')}</span></>}</td>
                      </tr>))}
                  </tbody></table></div>
              </>
            )}
          </>
        )}
      </div>
      <TenderTahrir ochiq={tahrirOchiq} kompaniyaId={joriy.id} tahrir={tahrirTd} onYop={() => setTahrirOchiq(false)} onSaqlandi={(id) => { setTahrirOchiq(false); setV((x) => x + 1); void yukla(); ochish(id); }} />
    </Sahifa>
  );
}
