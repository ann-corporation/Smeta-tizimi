import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, FileUp } from 'lucide-react';
import { t } from '../../i18n/til';
import { toast } from '../../umumiy/ui/Toast';
import { yangiOperationId } from '../../api/supabase';
import { buxBankQabul, buxBankTaklifOl, buxBankYuklash, buxXato, type BankNavbat, type BankYuklash } from '../../api/t2-bux-hisob';
import { bankKalitlari, bankParse, csvGrid } from '../../lib/buxgalteriya/bank';
import { readWorkbookGrids } from '../../lib/qarzdorlik/parse';
import { Izoh, Son, XatoQator } from './umumiy';
import { ddmmyyyy, td, th } from './yordamchi';

/** Bank: ko'chirma qatorlari navbati. Har qatorga taklif (ball + sabab); bir bosishda qabul (to'lov yoki oylik); aniqlanmaganlar navbatda qoladi. */
export function BankAniq({ kid, versiya, yozadi, onOzgardi }: { kid: number; versiya: number; yozadi: boolean; onOzgardi: () => void }) {
  const [d, setD] = useState<BankNavbat | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const [band, setBand] = useState(false);
  const op = useRef<Record<number, string>>({});
  const yukla = useCallback(async () => {
    const r = await buxBankTaklifOl(kid, { limit: 200 });
    if (r.ok) { setD(r.natija); setXato(null); } else setXato(r.error);
  }, [kid]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void yukla(); }, [yukla, versiya]);

  const faylTanla = async (f: File | undefined) => {
    if (!f) return;
    try {
      const grid = /\.csv$|\.txt$/i.test(f.name) ? csvGrid(await f.text()) : ((await readWorkbookGrids(await f.arrayBuffer()))[0]?.grid ?? []);
      const p = bankParse(grid);
      const kalitlar = bankKalitlari(p.qatorlar);
      const qatorlar: BankYuklash[] = [];
      p.qatorlar.forEach((q, i) => { if (q.sana && q.summa != null && q.summa > 0 && q.yonalish) qatorlar.push({ kalit: kalitlar[i], sana: q.sana, summa: String(q.summa), yonalish: q.yonalish, hujjat_raqam: q.hujjat_raqam, izoh: q.izoh, inn: q.inn, kontragent: q.kontragent }); });
      if (qatorlar.length === 0) { setXato(t('Faylda o‘qiladigan bank qatori topilmadi.')); return; }
      setBand(true);
      const r = await buxBankYuklash(kid, qatorlar.slice(0, 500), yangiOperationId());
      setBand(false);
      if (!r.ok) { setXato(buxXato(r)); return; }
      toast(t('Yuklandi: {y} yangi, {k} takror', { y: r.yangi ?? 0, k: r.takror ?? 0 }), 'ok'); void yukla();
    } catch { setXato(t('Faylni o‘qib bo‘lmadi. CSV yoki Excel (.xlsx) yuklang.')); }
  };
  const qabul = async (qatorId: number, shartnomaId: number | null, oylikId: number | null) => {
    setBand(true);
    const kalit = qatorId;
    const r = await buxBankQabul({ kompaniyaId: kid, qatorId, shartnomaId, oylikId, operationId: op.current[kalit] ?? (op.current[kalit] = yangiOperationId()) });
    setBand(false);
    if (!r.ok) { setXato(buxXato(r)); delete op.current[kalit]; return; }
    delete op.current[kalit]; setXato(null); toast(t('Qabul qilindi va yozildi'), 'ok'); void yukla(); onOzgardi();
  };

  return (
    <div className="space-y-3">
      <XatoQator xato={xato} />
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-semibold">{t('Bank: aniqlash navbati (выписка банка)')}</span>
        <Izoh matn={t('Ko‘chirma qatorlari navbatga tushadi. Har qatorga shartnoma raqami, STIR/nom va ochiq qarz summasi bo‘yicha taklif beriladi (ball va sabab bilan). «Qabul» — to‘lov yoziladi va provodka bir marta hosil bo‘ladi. Ish haqi qatorlari tasdiqlangan oylikka bog‘lanadi. Aniqlanmaganlar navbatda qoladi.')} />
        {yozadi && <label className="fz-btn cursor-pointer"><FileUp size={14} /> {t('Ko‘chirma yuklash')}<input type="file" className="hidden" accept=".csv,.txt,.xlsx,.xls" aria-label={t('Bank ko‘chirmasi fayli')} disabled={band} onChange={(e) => void faylTanla(e.target.files?.[0])} /></label>}
        {d && <span className="text-[12px] text-text-mute">{t('Navbatda: {n}; qabul qilingan: {q}', { n: d.jami.kutmoqda, q: d.jami.qabul })}</span>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-[12.5px]" aria-label={t('Bank navbati')}>
          <thead><tr className="text-left text-[11px] uppercase text-text-mute"><th className={th}>{t('Sana')}</th><th className={th}>{t('Yo‘nalish')}</th><th className={`${th} text-right`}>{t('Summa')}</th><th className={th}>{t('To‘lov maqsadi')}</th><th className={th}>{t('Taklif')}</th></tr></thead>
          <tbody>
            {d && d.qatorlar.length === 0 && <tr><td colSpan={5} className="px-2 py-6 text-center text-text-mute">{t('Navbat bo‘sh.')}</td></tr>}
            {!d && <tr><td colSpan={5} className="px-2 py-6 text-center text-text-mute">{t('Yuklanmoqda…')}</td></tr>}
            {(d?.qatorlar ?? []).map((q) => (
              <tr key={q.id} className="border-t border-border/50 align-top">
                <td className={td}>{ddmmyyyy(q.sana)}</td><td className={td}>{q.yonalish === 'kirim' ? t('Kirim') : t('Chiqim')}</td>
                <td className={`${td} text-right`}><Son v={q.summa} /></td><td className={td}>{q.izoh ?? '—'}{q.kontragent ? <span className="block text-[11px] text-text-mute">{q.kontragent}</span> : null}</td>
                <td className={td}>
                  {q.aniqlanmagan && <span className="text-warn">{t('Aniqlanmagan: mos shartnoma topilmadi')}</span>}
                  {q.takliflar.map((x) => (
                    <div key={x.shartnoma_id} className="mb-1 flex flex-wrap items-center gap-2">
                      <span><b>{x.raqam}</b> {x.kontragent ?? ''} · {t('ball')} {x.ball}</span>
                      <span className="text-[11px] text-text-mute">{x.sabab.join('; ')}</span>
                      {yozadi && <button type="button" className="fz-btn" disabled={band} onClick={() => void qabul(q.id, x.shartnoma_id, null)}><CheckCircle2 size={12} /> {t('Qabul')}</button>}
                    </div>
                  ))}
                  {q.oylik.map((x) => (
                    <div key={x.oylik_id} className="mb-1 flex flex-wrap items-center gap-2">
                      <span>{t('Ish haqi')} {x.oy.slice(0, 7)} · {t('ball')} {x.ball}</span><span className="text-[11px] text-text-mute">{x.sabab.join('; ')}</span>
                      {yozadi && <button type="button" className="fz-btn" disabled={band} onClick={() => void qabul(q.id, null, x.oylik_id)}><CheckCircle2 size={12} /> {t('Oylikka bog‘lash')}</button>}
                    </div>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}