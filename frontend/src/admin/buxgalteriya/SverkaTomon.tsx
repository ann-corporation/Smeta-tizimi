import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download } from 'lucide-react';
import { t } from '../../i18n/til';
import { toast } from '../../umumiy/ui/Toast';
import { useKompaniya } from '../../test02/KompaniyaTanlov';
import { hujjatTokenBilan } from '../../lib/token-hujjat';
import { downloadBlob } from '../../lib/construction-document-control/export/download-helper';
import { buxSverkaOl, buxSverkaTomonlarOl, buxXato, type BuxSverka } from '../../api/t2-bux-hisob';
import { sverkaTomonHujjat } from '../../lib/buxgalteriya/eksport';
import { Izoh, Son, XatoQator } from './umumiy';
import { ddmmyyyy, kirit, td, th, type Davr } from './yordamchi';

const HOLAT_NOM: Record<string, () => string> = {
  mos: () => t('Mos'), sana_farq: () => t('Sana farqi'), summa_farq: () => t('Summa farqi'), faqat_men: () => t('Faqat bizda'), faqat_ular: () => t('Faqat ikkinchi tomonda'),
};
const HOLAT_RANG: Record<string, string> = { mos: 'text-ok', sana_farq: 'text-warn', summa_farq: 'text-danger', faqat_men: 'text-danger', faqat_ular: 'text-danger' };

/** Akt sverki (акт сверки) ikki kompaniya o'rtasida: ikkala daftardan, qator-ma'qator farq. Ikkinchi tomon uchun faqat sana + summa ko'rinadi. */
export function SverkaTomon({ kid, davr, versiya }: { kid: number; davr: Davr; versiya: number }) {
  const [tomonlar, setTomonlar] = useState<Array<{ kompaniya_id: number; nom: string }>>([]);
  const [qarshi, setQarshi] = useState<number | null>(null);
  const [d, setD] = useState<BuxSverka | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const { joriy } = useKompaniya();
  useEffect(() => { void buxSverkaTomonlarOl(kid).then((r) => { if (r.ok) setTomonlar(r.natija.tomonlar); }); }, [kid, versiya]);
  const yukla = useCallback(async () => {
    if (qarshi == null) { setD(null); return; }
    const r = await buxSverkaOl(kid, { qarshi_kompaniya_id: qarshi, dan: davr.dan, gacha: davr.gacha });
    if (r.ok) { setD(r.natija); setXato(null); } else { setD(null); setXato(r.error); }
  }, [kid, qarshi, davr.dan, davr.gacha]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void yukla(); }, [yukla, versiya]);

  const eksport = async () => {
    if (!d) return;
    const { bytes, faylNomi } = sverkaTomonHujjat({ kompaniya: (joriy as { nom?: string } | null | undefined)?.nom ?? null, s: d });
    const r = await hujjatTokenBilan({ kompaniyaId: kid, bytes, hujjat: 'SVERKA_TOMON', sabab: `Акт сверки сторон · ${d.qarshi_nom ?? ''}`.slice(0, 120) }, () => downloadBlob(bytes, faylNomi));
    toast(r.ok ? (r.xabar || t('Akt sverki yuklandi')) : r.xabar, r.ok ? 'ok' : 'danger');
  };
  return (
    <div className="space-y-3">
      <XatoQator xato={xato} />
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-semibold">{t('Akt sverki tomonlar o‘rtasida (акт сверки)')}</span>
        <select aria-label={t('Qarshi tomon')} className={`${kirit} w-72`} value={qarshi ?? ''} onChange={(e) => setQarshi(e.target.value === '' ? null : Number(e.target.value))}>
          <option value="">{t('Kompaniyani tanlang…')}</option>
          {tomonlar.map((x) => <option key={x.kompaniya_id} value={x.kompaniya_id}>{x.nom}</option>)}
        </select>
        <button type="button" className="fz-btn" disabled={!d} onClick={() => void eksport()}><Download size={13} /> {t('Excel')}</button>
        <Izoh matn={t('Ikkala kompaniya daftaridan hisoblanadi. Siz faqat o‘z daftaringizni ko‘rasiz; ikkinchi tomon uchun faqat sana va summa ko‘rsatiladi. Imzolash: Excel ni arxivga saqlab, «Tomonlar» orqali yuboring — ikkinchi tomon qabul qiladi yoki qaytaradi. Juftlash taxminiy (T).')} />
      </div>
      {tomonlar.length === 0 && <p className="text-[12.5px] text-text-mute">{t('Faol aloqador kompaniya yo‘q: avval «Tomonlar» orqali bog‘laning.')}</p>}
      {d && d.ogohlantirish.length > 0 && (
        <p role="alert" className="flex items-center gap-1 text-[12.5px] text-warn"><AlertTriangle size={14} /> {t('Kontragent juftligi topilmadi (STIR bo‘yicha): tomonlardan biri ikkinchisini kontragent sifatida STIR bilan kiritmagan.')}</p>
      )}
      {d && (
        <>
          <div className="fz-panel grid grid-cols-2 gap-2 text-[12.5px] sm:grid-cols-4">
            <div><span className="mb-1 block text-[11px] uppercase text-text-mute">{t('Bizning saldo')}</span><Son v={d.yopilish_men} qalin /></div>
            <div><span className="mb-1 block text-[11px] uppercase text-text-mute">{t('Ikkinchi tomon saldosi')}</span><Son v={d.yopilish_ular} qalin /></div>
            <div><span className="mb-1 block text-[11px] uppercase text-text-mute">{t('Farq')}</span><Son v={d.farq} qalin /></div>
            <div className="flex items-end">{d.farqli_soni === 0 ? <span className="flex items-center gap-1 text-ok"><CheckCircle2 size={14} /> {t('Farq yo‘q')}</span> : <span className="text-danger">{t('Farqli qator: {n}', { n: d.farqli_soni })}</span>}</div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-[12.5px]" aria-label={t('Akt sverki')}>
              <thead><tr className="text-left text-[11px] uppercase text-text-mute"><th className={th}>{t('Holat')}</th><th className={th}>{t('Sana (biz)')}</th><th className={th}>{t('Hujjat')}</th><th className={`${th} text-right`}>{t('Summa (biz)')}</th><th className={th}>{t('Sana (ular)')}</th><th className={`${th} text-right`}>{t('Summa (ular)')}</th><th className={`${th} text-right`}>{t('Farq')}</th></tr></thead>
              <tbody>
                {d.qatorlar.length === 0 && <tr><td colSpan={7} className="px-2 py-6 text-center text-text-mute">{t('Bu davrda hujjat yo‘q.')}</td></tr>}
                {d.qatorlar.map((q, i) => (
                  <tr key={i} className="border-t border-border/50">
                    <td className={`${td} ${HOLAT_RANG[q.holat] ?? ''}`}>{HOLAT_NOM[q.holat]?.() ?? q.holat}</td>
                    <td className={td}>{q.a_sana ? ddmmyyyy(q.a_sana) : '—'}</td><td className={td}>{q.hujjat ?? '—'}</td><td className={`${td} text-right`}><Son v={q.a_summa} /></td>
                    <td className={td}>{q.b_sana ? ddmmyyyy(q.b_sana) : '—'}</td><td className={`${td} text-right`}><Son v={q.b_summa} /></td><td className={`${td} text-right`}><Son v={q.farq} /></td>
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