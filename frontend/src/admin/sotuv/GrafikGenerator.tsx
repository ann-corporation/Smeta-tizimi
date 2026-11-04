/**
 * To'lov grafigi generatori: boshlang'ich to'lov (summa yoki %), sana, oylar, usul (teng / annuitet), yaxlitlash →
 * lib/sotuv/hisob.tolovGrafigi oldindan ko'rinishi, Σ tekshiruvi (server: |Σ − summa| ≤ 1) → grafikSaqla (yangi versiya).
 */
import { useMemo, useRef, useState } from 'react';
import { t } from '../../i18n/til';
import { toast } from '../../umumiy/ui/Toast';
import { MoneyInput } from '../../umumiy/ui/MoneyInput';
import { ModalOyna } from '../../components/pto-workspace/ModalOyna';
import { yangiOperationId } from '../../api/supabase';
import { grafikSaqla, type Valyuta } from '../../api/t2-sotuv';
import { tolovGrafigi, type GrafikUsul } from '../../lib/sotuv/hisob';
import { boshlangichSumma, bugun, grafikTekshir } from '../../lib/sotuv/bitim-korinish';
import { Maydon, Pul } from './umumiy';
import { kirit, sonOl, useSotuvYangila, xatoMatn } from './sotuv-umumiy';

export function GrafikGenerator({ kid, bitimId, summa, valyuta, yop }: { kid: number; bitimId: number; summa: number; valyuta: Valyuta; yop: () => void }) {
  const [bosh, setBosh] = useState('30');
  const [foizmi, setFoizmi] = useState(true);
  const [sana, setSana] = useState(bugun());
  const [oylar, setOylar] = useState('12');
  const [usul, setUsul] = useState<GrafikUsul>('teng');
  const [yillikFoiz, setYillikFoiz] = useState('');
  const [yaxlitlash, setYaxlitlash] = useState('1000');
  const [band, setBand] = useState(false);
  const op = useRef(yangiOperationId());
  const yangila = useSotuvYangila();

  const bs = boshlangichSumma(summa, sonOl(bosh) ?? 0, foizmi);
  const qatorlar = useMemo(() => {
    const oy = Math.max(0, Math.min(600, Math.trunc(sonOl(oylar) ?? 0)));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(sana)) return [];
    return tolovGrafigi({ summa, boshlangich: bs, boshlangichSana: sana, oylar: oy, usul, yillikFoiz: sonOl(yillikFoiz) ?? 0, yaxlitlash: sonOl(yaxlitlash) ?? 1 });
  }, [summa, bs, sana, oylar, usul, yillikFoiz, yaxlitlash]);
  const tek = grafikTekshir(qatorlar, summa);

  const saqla = async () => {
    setBand(true);
    const r = await grafikSaqla(kid, bitimId, qatorlar, op.current);
    setBand(false);
    if (!r.ok) { toast(xatoMatn(r), 'danger'); return; }
    toast(t('Grafik saqlandi')); yangila(); yop();
  };

  return (
    <ModalOyna sarlavha={t('To‘lov grafigi')} yop={yop} kenglik={640}>
      <div className="space-y-3 text-[13px]">
        <p className="text-text-dim">{t('Shartnoma summasi')}: <b><Pul val={summa} valyuta={valyuta} /></b></p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Maydon nom={foizmi ? t('Boshlang‘ich to‘lov, %') : t('Boshlang‘ich to‘lov')}>
            <div className="flex gap-1">
              <MoneyInput className={kirit} value={bosh} onValueChange={setBosh} aria-label={t('Boshlang‘ich to‘lov')} />
              <button type="button" className="fz-btn fz-btn--sm" aria-pressed={foizmi} onClick={() => setFoizmi((x) => !x)}>{foizmi ? '%' : valyuta}</button>
            </div>
          </Maydon>
          <Maydon nom={t('Boshlang‘ich to‘lov sanasi')}><input type="date" className={kirit} value={sana} onChange={(e) => setSana(e.target.value)} aria-label={t('Boshlang‘ich to‘lov sanasi')} /></Maydon>
          <Maydon nom={t('Oylar')}><input className={kirit} inputMode="numeric" value={oylar} onChange={(e) => setOylar(e.target.value)} aria-label={t('Oylar')} /></Maydon>
          <Maydon nom={t('Usul')}>
            <select className={kirit} value={usul} onChange={(e) => setUsul(e.target.value as GrafikUsul)}>
              <option value="teng">{t('Teng bo‘lib')}</option><option value="annuitet">{t('Annuitet')}</option>
            </select>
          </Maydon>
          {usul === 'annuitet' && <Maydon nom={t('Yillik foiz, %')}><input className={kirit} inputMode="decimal" value={yillikFoiz} onChange={(e) => setYillikFoiz(e.target.value)} aria-label={t('Yillik foiz')} /></Maydon>}
          <Maydon nom={t('Yaxlitlash')}>
            <select className={kirit} value={yaxlitlash} onChange={(e) => setYaxlitlash(e.target.value)}>
              {['1', '1000', '10000', '100000'].map((v) => <option key={v} value={v}>{Number(v).toLocaleString('ru-RU')}</option>)}
            </select>
          </Maydon>
        </div>
        <p className="text-text-dim">{t('Boshlang‘ich to‘lov')}: <Pul val={bs} valyuta={valyuta} /></p>

        <div className="max-h-64 overflow-auto rounded-md border border-border">
          <table className="w-full text-[12px]">
            <thead className="sticky top-0 bg-surface text-left text-text-mute"><tr><th className="px-2 py-1">{t('№')}</th><th className="px-2">{t('Sana')}</th><th className="px-2">{t('Tur')}</th><th className="px-2 text-right">{t('Summa')}</th></tr></thead>
            <tbody>
              {qatorlar.map((q, i) => (
                <tr key={i} className="border-t border-border/50">
                  <td className="px-2 py-0.5 tabular-nums">{i + 1}</td><td className="px-2 tabular-nums">{q.sana}</td>
                  <td className="px-2">{q.tur === 'boshlangich' ? t('Boshlang‘ich') : t('Oylik')}</td>
                  <td className="px-2 text-right"><Pul val={q.summa} valyuta={valyuta} /></td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr className="border-t border-border font-semibold"><td colSpan={3} className="px-2 py-1">{t('Jami')}</td><td className="px-2 text-right"><Pul val={tek.jami} valyuta={valyuta} /></td></tr></tfoot>
          </table>
        </div>
        {tek.mos
          ? <p className="fz-note fz-note--info">{t('Σ shartnoma summasiga teng.')}</p>
          : <p className="fz-note fz-note--warn">{usul === 'annuitet' && (sonOl(yillikFoiz) ?? 0) > 0
            ? t('Annuitet foizi bilan jami shartnoma summasidan oshadi — server faqat Σ = summa grafigini qabul qiladi.')
            : t('Grafik jami shartnoma summasiga teng emas.')}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="fz-btn fz-btn--ghost" onClick={yop}>{t('Bekor qilish')}</button>
          <button type="button" className="fz-btn fz-btn--primary" disabled={!tek.mos || band} onClick={saqla}>{t('Grafikni saqlash')}</button>
        </div>
      </div>
    </ModalOyna>
  );
}
