import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Undo2, X } from 'lucide-react';
import { t } from '../../i18n/til';
import { toast } from '../../umumiy/ui/Toast';
import { yangiOperationId } from '../../api/supabase';
import { MoneyInput } from '../../umumiy/ui/MoneyInput';
import { buxJurnalOl, buxQolda, buxStorno, buxXato, type BuxHisob, type BuxJurnal } from '../../api/t2-bux-hisob';
import { MANBA_NOM, manbaYol } from '../../lib/buxgalteriya/hisob';
import { sonOl } from '../../lib/qarzdorlik/parse';
import { Izoh, Son, XatoQator } from './umumiy';
import { DT_IZOH, KT_IZOH, bugun, ddmmyyyy, kirit, td, th, yorliq, type Davr } from './yordamchi';

const TUR_NOM: Record<string, () => string> = { avto: () => t('Avtomatik'), qolda: () => t('Qo‘lda'), storno: () => t('Storno') };

/** Jurnal: barcha provodkalar (o'zgarmas). Tuzatish — faqat storno yoki yangi provodka. */
export function Jurnal({ kid, davr, versiya, hisoblar, hisob, onHisob, onOzgardi, yozadi }: {
  kid: number; davr: Davr; versiya: number; hisoblar: BuxHisob[]; hisob: string; onHisob: (k: string) => void; onOzgardi: () => void; yozadi: boolean;
}) {
  const [d, setD] = useState<BuxJurnal | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const [forma, setForma] = useState(false);
  const kop = d != null && d.qatorlar.length < d.jami;
  const yukla = useCallback(async () => {
    const r = await buxJurnalOl(kid, { dan: davr.dan, gacha: davr.gacha, hisob: hisob || null, limit: 500 });
    if (r.ok) { setD(r.natija); setXato(null); } else setXato(r.error);
  }, [kid, davr.dan, davr.gacha, hisob]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void yukla(); }, [yukla, versiya]);

  const storno = async (id: number) => {
    const r = await buxStorno({ kompaniyaId: kid, provodkaId: id, izoh: null, operationId: yangiOperationId() });
    if (!r.ok) { setXato(buxXato(r)); return; }
    toast(t('Storno yozildi'), 'ok'); void yukla(); onOzgardi();
  };

  return (
    <div className="space-y-3">
      <XatoQator xato={xato} />
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-semibold">{t('Provodkalar jurnali (журнал проводок)')}</span>
        <select aria-label={t('Hisob bo‘yicha filtr')} className={`${kirit} w-64`} value={hisob} onChange={(e) => onHisob(e.target.value)}>
          <option value="">{t('Hamma hisoblar')}</option>
          {hisoblar.map((h) => <option key={h.kod} value={h.kod}>{h.kod} · {h.nom_uz}</option>)}
        </select>
        {yozadi && <button type="button" className="fz-btn" onClick={() => setForma((x) => !x)}><Plus size={14} /> {t('Qo‘lda provodka')}</button>}
        <span className="text-[11.5px] text-text-mute">{t('Provodka o‘zgartirilmaydi: xato bo‘lsa «Storno» (teskari yozuv) qiling.')}</span>
      </div>
      {forma && <QoldaForma kid={kid} hisoblar={hisoblar} onYop={() => setForma(false)} onTayyor={() => { setForma(false); void yukla(); onOzgardi(); }} />}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] text-[12.5px]" aria-label={t('Provodkalar jurnali')}>
          <thead><tr className="text-left text-[11px] uppercase text-text-mute">
            <th className={th}>{t('Sana')}</th><th className={th}>{t('Debet')}<Izoh matn={DT_IZOH()} /></th><th className={th}>{t('Kredit')}<Izoh matn={KT_IZOH()} /></th>
            <th className={`${th} text-right`}>{t('Summa')}</th><th className={th}>{t('Kontragent')}</th><th className={th}>{t('Hujjat')}</th><th className={th}>{t('Turi')}</th><th className={th} />
          </tr></thead>
          <tbody>
            {d && d.qatorlar.length === 0 && <tr><td colSpan={8} className="px-2 py-6 text-center text-text-mute">{t('Provodka yo‘q.')}</td></tr>}
            {!d && <tr><td colSpan={8} className="px-2 py-6 text-center text-text-mute">{t('Yuklanmoqda…')}</td></tr>}
            {(d?.qatorlar ?? []).map((p) => (
              <tr key={p.id} className="border-t border-border/50">
                <td className={td}>{ddmmyyyy(p.sana)}</td><td className={td}>{p.dt}</td><td className={td}>{p.kt}</td>
                <td className={`${td} text-right`}><Son v={p.summa} /></td>
                <td className={td}>{p.kontragent ?? '—'}</td>
                <td className={td}>{manbaYol(p.manba_tur) ? <Link to={manbaYol(p.manba_tur) as string} className="text-accent underline" title={t('Hujjatga o‘tish')}>{p.hujjat ?? p.izoh ?? '—'}</Link> : (p.hujjat ?? p.izoh ?? '—')} <span className="text-[10.5px] text-text-mute">{MANBA_NOM[p.manba_tur] ? t(MANBA_NOM[p.manba_tur]) : p.manba_tur}</span></td>
                <td className={td}>{TUR_NOM[p.tur]?.() ?? p.tur}</td>
                <td className={td}>{yozadi && p.tur === 'qolda' && <button type="button" className="fz-btn" title={t('Teskari yozuv (storno) yozadi')} onClick={() => void storno(p.id)}><Undo2 size={12} /> {t('Storno')}</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {kop ? <p className="px-2 py-1 text-[11.5px] text-text-mute">{t('Oxirgi {n} ta ko‘rsatildi (jami {jami}). Davrni toraytiring.', { n: d?.qatorlar.length ?? 0, jami: d?.jami ?? 0 })}</p> : null}
      </div>
    </div>
  );
}

function QoldaForma({ kid, hisoblar, onYop, onTayyor }: { kid: number; hisoblar: BuxHisob[]; onYop: () => void; onTayyor: () => void }) {
  const faol = hisoblar.filter((h) => h.faol);
  const [sana, setSana] = useState(bugun());
  const [dt, setDt] = useState(''); const [kt, setKt] = useState('');
  const [summa, setSumma] = useState('');
  const [izoh, setIzoh] = useState('');
  const [xato, setXato] = useState<string | null>(null);
  const [band, setBand] = useState(false);
  const op = useRef(yangiOperationId());
  const yoz = async () => {
    setBand(true);
    const r = await buxQolda({ kompaniyaId: kid, sana, dtKod: dt, ktKod: kt, summa: sonOl(summa) ?? 0, izoh: izoh || null, operationId: op.current });
    setBand(false);
    if (!r.ok) { setXato(buxXato(r)); return; }
    toast(r.yopiq_davr_ogohlantirish ? t('Yozildi. Diqqat: bu oy yopilgan.') : t('Provodka yozildi'), r.yopiq_davr_ogohlantirish ? 'danger' : 'ok');
    onTayyor();
  };
  const sel = (v: string, set: (x: string) => void, nom: string) => (
    <select aria-label={nom} className={kirit} value={v} onChange={(e) => { set(e.target.value); op.current = yangiOperationId(); }}>
      <option value="">—</option>{faol.map((h) => <option key={h.kod} value={h.kod}>{h.kod} · {h.nom_uz}</option>)}
    </select>
  );
  return (
    <div className="fz-panel space-y-2" role="group" aria-label={t('Qo‘lda provodka')}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <div><span className={yorliq}>{t('Sana')}</span><input type="date" aria-label={t('Sana')} className={kirit} value={sana} onChange={(e) => setSana(e.target.value)} /></div>
        <div><span className={yorliq}>{t('Debet')}</span>{sel(dt, setDt, t('Debet hisobi'))}</div>
        <div><span className={yorliq}>{t('Kredit')}</span>{sel(kt, setKt, t('Kredit hisobi'))}</div>
        <div><span className={yorliq}>{t('Summa (minus mumkin)')}</span><MoneyInput aria-label={t('Summa')} inputMode="decimal" className={` tabular-nums`} value={summa} onValueChange={(v) => { setSumma(v); op.current = yangiOperationId(); }} /></div>
        <div><span className={yorliq}>{t('Izoh')}</span><input aria-label={t('Izoh')} className={kirit} value={izoh} onChange={(e) => setIzoh(e.target.value)} maxLength={300} /></div>
      </div>
      <XatoQator xato={xato} />
      <div className="flex gap-2">
        <button type="button" className="fz-btn" disabled={band || !dt || !kt || !sonOl(summa)} onClick={() => void yoz()}>{t('Yozish')}</button>
        <button type="button" className="fz-btn" onClick={onYop}><X size={13} /> {t('Bekor')}</button>
      </div>
    </div>
  );
}
