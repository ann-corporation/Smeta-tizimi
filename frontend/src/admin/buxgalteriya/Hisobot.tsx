import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download } from 'lucide-react';
import { t, tilLocale } from '../../i18n/til';
import { toast } from '../../umumiy/ui/Toast';
import { useKompaniya } from '../../test02/KompaniyaTanlov';
import { hujjatTokenBilan } from '../../lib/token-hujjat';
import { downloadBlob } from '../../lib/construction-document-control/export/download-helper';
import { buxHisobotOl, type BuxHisobot } from '../../api/t2-bux-hisob';
import { hisobotHujjat } from '../../lib/buxgalteriya/eksport';
import { Izoh, Son, XatoQator } from './umumiy';
import { kirit, td, th, type Davr } from './yordamchi';

/** Balans va Foyda/zarar hisoboti (баланс, отчёт о прибылях и убытках) — FAQAT jurnaldan; qatorlar xaritasi ma'lumot (hammasi T). */
export function Hisobot({ kid, davr, versiya }: { kid: number; davr: Davr; versiya: number }) {
  const [forma, setForma] = useState<'balans' | 'foyda_zarar'>('balans');
  const [d, setD] = useState<BuxHisobot | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const { joriy } = useKompaniya();
  const ru = tilLocale().startsWith('ru');
  const yukla = useCallback(async () => {
    const r = await buxHisobotOl(kid, { forma, dan: davr.dan, gacha: davr.gacha });
    if (r.ok) { setD(r.natija); setXato(null); } else setXato(r.error);
  }, [kid, forma, davr.dan, davr.gacha]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void yukla(); }, [yukla, versiya]);

  const eksport = async () => {
    if (!d) return;
    const { bytes, faylNomi } = hisobotHujjat({ kompaniya: (joriy as { nom?: string } | null | undefined)?.nom ?? null, h: d });
    const r = await hujjatTokenBilan({ kompaniyaId: kid, bytes, hujjat: 'BUX_HISOBOT', sabab: `${forma === 'balans' ? 'Баланс' : 'Прибыли и убытки'} · ${d.gacha}` }, () => downloadBlob(bytes, faylNomi));
    toast(r.ok ? (r.xabar || t('Hisobot yuklandi')) : r.xabar, r.ok ? 'ok' : 'danger');
  };
  const muvozanat = d?.forma === 'balans' && d.tekshiruv != null;
  return (
    <div className="space-y-3">
      <XatoQator xato={xato} />
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-semibold">{t('Balans va foyda-zarar (баланс, отчёт о прибылях и убытках)')}</span>
        <select aria-label={t('Hisobot turi')} className={`${kirit} w-56`} value={forma} onChange={(e) => setForma(e.target.value as 'balans' | 'foyda_zarar')}>
          <option value="balans">{t('Balans (davr oxiriga)')}</option>
          <option value="foyda_zarar">{t('Foyda va zarar (davr uchun)')}</option>
        </select>
        <button type="button" className="fz-btn" disabled={!d || d.qatorlar.length === 0} onClick={() => void eksport()}><Download size={13} /> {t('Excel')}</button>
        <Izoh matn={t('Hisobot faqat provodkalar jurnalidan hisoblanadi. Qatorlar va ularga tegishli hisoblar ro‘yxati T — tekshirilsin: buxgalter rasmiy shakl bilan tasdiqlaydi.')} />
      </div>
      <p className="text-[11.5px] text-text-mute">{t('Manba: provodkalar jurnali.')} {d?.oz_xarita ? t('Kompaniyaning o‘z shakli ishlatilmoqda.') : t('Standart shakl (T — tekshirilsin).')}</p>
      {muvozanat && (Math.abs(d.tekshiruv as number) < 0.005
        ? <p className="flex items-center gap-1 text-[12.5px] text-ok"><CheckCircle2 size={14} /> {t('Aktiv = Passiv: balans muvozanatda.')}</p>
        : <p role="alert" className="flex items-center gap-1 text-[12.5px] text-danger"><AlertTriangle size={14} /> {t('Balans muvozanatda emas: aktiv va passiv farqi')} <Son v={d.tekshiruv} /></p>)}
      {d && d.xaritalanmagan.length > 0 && (
        <p role="alert" className="flex items-center gap-1 text-[12.5px] text-warn"><AlertTriangle size={14} /> {t('Shaklga kirmagan hisoblar (qoldig‘i bor): {royxat}', { royxat: d.xaritalanmagan.join(', ') })}</p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-[12.5px]" aria-label={t('Hisobot')}>
          <thead><tr className="text-left text-[11px] uppercase text-text-mute"><th className={th}>{t('Kod')}</th><th className={th}>{t('Ko‘rsatkich')}</th><th className={th}>{t('Hisoblar')}</th><th className={`${th} text-right`}>{t('Summa')}</th></tr></thead>
          <tbody>
            {!d && <tr><td colSpan={4} className="px-2 py-6 text-center text-text-mute">{t('Yuklanmoqda…')}</td></tr>}
            {(d?.qatorlar ?? []).map((q) => (
              <tr key={q.kod} className={`border-t border-border/50 ${q.tur === 'jami' ? 'font-semibold' : ''}`}>
                <td className={td}>{q.kod}{q.tekshirilsin && <span className="ml-1 rounded border border-warn/60 px-1 text-[10px] text-warn" title={t('T — tekshirilsin (buxgalter tasdiqlamagan)')}>T</span>}</td>
                <td className={td}>{ru ? q.nom_ru : q.nom_uz}</td><td className={`${td} text-text-mute`}>{q.hisoblar.join(', ')}</td>
                <td className={`${td} text-right`}><Son v={q.summa} qalin={q.tur === 'jami'} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
