import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Undo2 } from 'lucide-react';
import { t, tilLocale } from '../../i18n/til';
import { toast } from '../../umumiy/ui/Toast';
import { yangiOperationId } from '../../api/supabase';
import { useKompaniya } from '../../test02/KompaniyaTanlov';
import { hujjatTokenBilan } from '../../lib/token-hujjat';
import { downloadBlob } from '../../lib/construction-document-control/export/download-helper';
import { MoneyInput } from '../../umumiy/ui/MoneyInput';
import { buxKassaBekor, buxKassaKitobOl, buxKassaYoz, buxXato, type BuxHisob, type KassaKitob } from '../../api/t2-bux-hisob';
import { kassaOrderHujjat } from '../../lib/buxgalteriya/eksport';
import { sonOl } from '../../lib/qarzdorlik/parse';
import { Izoh, Son, XatoQator } from './umumiy';
import { bugun, ddmmyyyy, kirit, td, th, yorliq, type Davr } from './yordamchi';

/** Kassa: kirim/chiqim orderlari (yil bo'yicha raqamlash), kunlik kassa kitobi (jurnaldan), chop etish (Excel, token). */
export function Kassa({ kid, davr, versiya, hisoblar, yozadi, onOzgardi }: { kid: number; davr: Davr; versiya: number; hisoblar: BuxHisob[]; yozadi: boolean; onOzgardi: () => void }) {
  const [d, setD] = useState<KassaKitob | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const [tur, setTur] = useState<'kirim' | 'chiqim'>('kirim');
  const [sana, setSana] = useState(bugun());
  const [summa, setSumma] = useState('');
  const [qarshi, setQarshi] = useState('');
  const [asos, setAsos] = useState('');
  const op = useRef(yangiOperationId());
  const { joriy } = useKompaniya();
  const ru = tilLocale().startsWith('ru');
  const yukla = useCallback(async () => {
    const r = await buxKassaKitobOl(kid, { dan: davr.dan, gacha: davr.gacha });
    if (r.ok) { setD(r.natija); setXato(null); } else setXato(r.error);
  }, [kid, davr.dan, davr.gacha]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void yukla(); }, [yukla, versiya]);

  const yoz = async () => {
    const r = await buxKassaYoz({ kompaniyaId: kid, tur, sana, summa: sonOl(summa) ?? 0, qarshi, asos: asos || null, operationId: op.current });
    if (!r.ok) { setXato(buxXato(r)); return; }
    toast(r.manfiy_qoldiq ? t('Order №{n} yozildi. Diqqat: kassa qoldig‘i manfiy.', { n: r.raqam ?? 0 }) : t('Order №{n} yozildi', { n: r.raqam ?? 0 }), r.manfiy_qoldiq ? 'danger' : 'ok');
    op.current = yangiOperationId(); setSumma(''); setAsos(''); void yukla(); onOzgardi();
  };
  const bekor = async (id: number) => {
    const r = await buxKassaBekor(kid, id, yangiOperationId());
    if (!r.ok) { setXato(buxXato(r)); return; }
    toast(t('Order bekor qilindi (storno)'), 'ok'); void yukla(); onOzgardi();
  };
  const chop = async (o: KassaKitob['orderlar'][number]) => {
    const { bytes, faylNomi } = kassaOrderHujjat({ kompaniya: (joriy as { nom?: string } | null | undefined)?.nom ?? null, order: o, kassaHisob: d?.kassa_hisob ?? '5010' });
    const r = await hujjatTokenBilan({ kompaniyaId: kid, bytes, hujjat: 'KASSA_ORDER', sabab: `Кассовый ордер ${o.tur} № ${o.raqam}/${o.yil}` }, () => downloadBlob(bytes, faylNomi));
    toast(r.ok ? (r.xabar || t('Order yuklandi')) : r.xabar, r.ok ? 'ok' : 'danger');
  };
  const faol = hisoblar.filter((h) => h.faol && h.kod !== (d?.kassa_hisob ?? '5010'));
  return (
    <div className="space-y-3">
      <XatoQator xato={xato} />
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-semibold">{t('Kassa (касса): orderlar va kassa kitobi')}</span>
        <Izoh matn={t('Kirim va chiqim orderlari yil bo‘yicha alohida raqamlanadi. Order provodka hosil qiladi (kassa hisobi ↔ qarshi hisob). Kassa kitobi jurnaldan hisoblanadi. Shakl va raqamlash tartibi T — tekshirilsin.')} />
      </div>
      {yozadi && (
        <div className="fz-panel grid grid-cols-2 gap-2 sm:grid-cols-6" role="group" aria-label={t('Yangi kassa order')}>
          <div><span className={yorliq}>{t('Tur')}</span><select aria-label={t('Order turi')} className={kirit} value={tur} onChange={(e) => setTur(e.target.value as 'kirim' | 'chiqim')}><option value="kirim">{t('Kirim (ПКО)')}</option><option value="chiqim">{t('Chiqim (РКО)')}</option></select></div>
          <div><span className={yorliq}>{t('Sana')}</span><input type="date" aria-label={t('Sana')} className={kirit} value={sana} onChange={(e) => setSana(e.target.value)} /></div>
          <div><span className={yorliq}>{t('Summa')}</span><MoneyInput aria-label={t('Summa')} inputMode="decimal" className=" tabular-nums" value={summa} onValueChange={(v) => { setSumma(v); op.current = yangiOperationId(); }} /></div>
          <div><span className={yorliq}>{t('Qarshi hisob')}</span><select aria-label={t('Qarshi hisob')} className={kirit} value={qarshi} onChange={(e) => { setQarshi(e.target.value); op.current = yangiOperationId(); }}><option value="">—</option>{faol.map((h) => <option key={h.kod} value={h.kod}>{h.kod} · {ru ? h.nom_ru : h.nom_uz}</option>)}</select></div>
          <div><span className={yorliq}>{t('Asos')}</span><input aria-label={t('Asos')} className={kirit} maxLength={300} value={asos} onChange={(e) => setAsos(e.target.value)} /></div>
          <div className="flex items-end"><button type="button" className="fz-btn" disabled={!qarshi || !sonOl(summa)} onClick={() => void yoz()}>{t('Yozish')}</button></div>
        </div>
      )}
      {d && (
        <>
          <p className="text-[12px] text-text-mute">{t('Kassa hisobi')} {d.kassa_hisob}; {t('davr boshida')}: <Son v={d.ochilish} /> · {t('davr oxirida')}: <Son v={d.yopilish} qalin /></p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-[12.5px]" aria-label={t('Kunlik kassa kitobi')}>
              <thead><tr className="text-left text-[11px] uppercase text-text-mute"><th className={th}>{t('Sana')}</th><th className={`${th} text-right`}>{t('Kirim')}</th><th className={`${th} text-right`}>{t('Chiqim')}</th><th className={`${th} text-right`}>{t('Qoldiq')}</th></tr></thead>
              <tbody>
                {d.kunlar.length === 0 && <tr><td colSpan={4} className="px-2 py-4 text-center text-text-mute">{t('Bu davrda kassa harakati yo‘q.')}</td></tr>}
                {d.kunlar.map((k) => <tr key={k.sana} className="border-t border-border/50"><td className={td}>{ddmmyyyy(k.sana)}</td><td className={`${td} text-right`}><Son v={k.kirim} /></td><td className={`${td} text-right`}><Son v={k.chiqim} /></td><td className={`${td} text-right`}><Son v={k.qoldiq} /></td></tr>)}
              </tbody>
            </table>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-[12.5px]" aria-label={t('Kassa orderlari')}>
              <thead><tr className="text-left text-[11px] uppercase text-text-mute"><th className={th}>{t('Order')}</th><th className={th}>{t('Sana')}</th><th className={th}>{t('Qarshi hisob')}</th><th className={th}>{t('Asos')}</th><th className={`${th} text-right`}>{t('Summa')}</th><th className={th} /></tr></thead>
              <tbody>
                {d.orderlar.map((o) => (
                  <tr key={o.id} className={`border-t border-border/50 ${o.holat === 'bekor' ? 'text-text-mute line-through' : ''}`}>
                    <td className={td}>{o.tur === 'kirim' ? 'ПКО' : 'РКО'} № {o.raqam}/{o.yil}</td><td className={td}>{ddmmyyyy(o.sana)}</td><td className={td}>{o.qarshi_hisob}</td><td className={td}>{o.asos ?? '—'}</td>
                    <td className={`${td} text-right`}><Son v={o.summa} /></td>
                    <td className={td}>
                      <button type="button" className="fz-btn" title={t('Chop etish (Excel, token yechiladi)')} onClick={() => void chop(o)}><Download size={12} /></button>
                      {yozadi && o.holat === 'faol' && <button type="button" className="fz-btn ml-1" title={t('Teskari yozuv (storno)')} onClick={() => void bekor(o.id)}><Undo2 size={12} /></button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}