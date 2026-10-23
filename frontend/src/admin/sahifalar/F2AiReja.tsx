import { useMemo, useState } from 'react';
import { t } from '../../i18n/til';
import { FmtN } from '../../lib/format';
import { smetachiF2Niyat } from '../../api/smeta-ai';
import { matnniNiyatlarga, rejaTuz, type IshNiyati, type RejaHolat } from '../../lib/f2-moslash-v3/ai-reja';
import type { F2Bolim } from '../../lib/f2-tayyor';

const BELGI: Record<RejaHolat, string> = { aniq: '✓', taklif: '◐', topilmadi: '✕' };
const RANG: Record<RejaHolat, string> = { aniq: 'text-ok', taklif: 'text-warn', topilmadi: 'text-danger' };

/**
 * F2 yordamchi (B8): «shu oy nima bajarildi?» matni → reja. Hech narsa yozmaydi: ✓ qatorlar hajmi faqat operator
 * «Qoralamaga qo'shish» bosganda F2 kiritmasiga tushadi. AI faqat matnni ajratadi (ixtiyoriy); moslash/qoldiq/pul — kod.
 */
export function F2AiReja({ bolimlar, kompaniyaId, onQoshish }: { bolimlar: F2Bolim[]; kompaniyaId?: number; onQoshish: (hajm: Record<number, string>) => void }) {
  const [matn, setMatn] = useState('');
  const [niyatlar, setNiyatlar] = useState<IshNiyati[]>([]);
  const [band, setBand] = useState(false);
  const [xato, setXato] = useState('');
  const reja = useMemo(() => rejaTuz(niyatlar, bolimlar), [niyatlar, bolimlar]);

  const aisiz = () => { setXato(''); setNiyatlar(matnniNiyatlarga(matn)); };
  const aiBilan = async () => {
    if (!kompaniyaId || band) return;
    setBand(true); setXato('');
    try {
      const r = await smetachiF2Niyat(kompaniyaId, matn);
      if (!r.ok) throw new Error('AI');
      setNiyatlar(r.niyatlar.map((n) => ({ tavsif: n.tavsif, birlik: n.birlik, hajm: n.hajm, razdel: n.razdel })));
    } catch { setXato(t('AI hozir javob bermadi — «AI siz» tugmasi bilan davom eting.')); }
    finally { setBand(false); }
  };
  const tanla = (i: number, ishId: number) => setNiyatlar((o) => o.map((n, k) => (k === i ? { ...n, tanlanganIsh: ishId } : n)));

  return (
    <section className="karta space-y-2 p-3 text-[12px]" aria-label={t('F2 yordamchi')}>
      <label className="block font-medium text-text">{t('Shu oy nima bajarildi?')}
        <textarea aria-label={t('Shu oy nima bajarildi?')} value={matn} onChange={(e) => setMatn(e.target.value)} rows={3} maxLength={2000}
          placeholder={t('masalan: betonlash 120 m3 (Fundamentlar); armatura 5 t')} className="mt-1 block w-full rounded border border-border bg-bg px-2 py-1.5" />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="tugma tugma-asosiy" disabled={matn.trim().length < 3} onClick={aisiz}>{t('Reja tuzish')}</button>
        <button type="button" className="tugma" disabled={matn.trim().length < 3 || !kompaniyaId || band} onClick={() => void aiBilan()}>{band ? t('AI o‘qimoqda…') : t('AI bilan tushunish')}</button>
        {xato && <span role="alert" className="text-danger">{xato}</span>}
      </div>
      {reja.qatorlar.length > 0 && <>
        <table className="w-full text-[12px]">
          <thead><tr className="text-left text-text-mute"><th className="w-6" /><th>{t('Ish')}</th><th className="text-right">{t('Hajm')}</th><th className="text-right">{t('Qoldiq')}</th><th className="text-right">{t('Pul')}</th><th>{t('Dalil')}</th></tr></thead>
          <tbody>{reja.qatorlar.map((q, i) => <tr key={i} className="border-t border-border/40 align-top">
            <td className={`py-1 font-semibold ${RANG[q.holat]}`}>{BELGI[q.holat]}</td>
            <td className="py-1 pr-2">{q.niyat.tavsif}
              {q.holat === 'taklif' && q.nomzodlar.length > 0 && <select aria-label={`${t('Nomzod')}: ${q.niyat.tavsif}`} defaultValue="" onChange={(e) => e.target.value && tanla(i, Number(e.target.value))} className="mt-1 block w-full rounded border border-border bg-bg px-1 py-0.5">
                <option value="">{t('— tanlang —')}</option>
                {q.nomzodlar.map((n) => <option key={n.ishId} value={n.ishId}>{n.razdelNom} · {n.kod ? n.kod + ' ' : ''}{n.nom}</option>)}
              </select>}
            </td>
            <td className="py-1 text-right tabular-nums">{q.hajm != null ? <FmtN val={q.hajm} /> : '—'}</td>
            <td className="py-1 text-right tabular-nums">{q.mumkin != null ? <FmtN val={q.mumkin} /> : ''}</td>
            <td className="py-1 text-right tabular-nums">{q.pul != null ? <FmtN val={q.pul} /> : ''}</td>
            <td className="py-1 text-text-dim">{q.dalil}{q.ogoh.map((o) => <div key={o} className="text-warn">{o}</div>)}</td>
          </tr>)}</tbody>
        </table>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-text-dim">✓ {reja.jami.aniq} · ◐ {reja.jami.taklif} · ✕ {reja.jami.topilmadi} · {t('Pul')}: <b className="text-text"><FmtN val={reja.jami.pul} /></b></span>
          <button type="button" className="tugma tugma-asosiy ml-auto" disabled={reja.jami.aniq === 0} onClick={() => onQoshish(reja.kiritma.hajm)}>{t('Qoralamaga qo‘shish')} ({Object.keys(reja.kiritma.hajm).length})</button>
        </div>
      </>}
    </section>
  );
}
