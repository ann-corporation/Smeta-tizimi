/** Topshiriqlar (P1) - minimal ekran: "Menga" / "Mendan" ro'yxati, berish, holat o'tkazish. Katta tugmalar, mobil uchun. */
import { matnSora } from '../../umumiy/ui/Tasdiq';
import { useCallback, useEffect, useState } from 'react';
import { useKompaniya } from '../../umumiy/kontekst/KompaniyaKontekst';
import { harakatlar, topshiriqBer, topshiriqlarOl, topshiriqOtish, topshiriqXato, type Topshiriq, type TopshiriqHolat } from '../../api/t2-topshiriq';
import { t } from '../../i18n/til';

export const HOLAT_NOMI: Record<TopshiriqHolat, string> = {
  berildi: 'Berildi', qabul_qilindi: 'Qabul qilindi', rad: 'Rad etildi', bajarilmoqda: 'Bajarilmoqda',
  bajarildi: 'Bajarildi (tasdiq kutilmoqda)', tasdiqlandi: 'Tasdiqlandi', qaytarildi: 'Qaytarildi', bekor: 'Bekor qilindi',
};

/** Holat muhri — so'z bilan, rang yordamchi. */
const HOLAT_MUHR: Record<TopshiriqHolat, string> = {
  berildi: 'fz-stamp--info', qabul_qilindi: 'fz-stamp--info', rad: 'fz-stamp--danger', bajarilmoqda: 'fz-stamp--warn',
  bajarildi: 'fz-stamp--warn', tasdiqlandi: 'fz-stamp--ok', qaytarildi: 'fz-stamp--danger', bekor: 'fz-stamp--draft',
};
const YOPIQ_HOLAT: readonly TopshiriqHolat[] = ['tasdiqlandi', 'bekor', 'rad'];
function muddatOtganmi(q: Topshiriq): boolean {
  const bugun = new Date().toISOString().slice(0, 10);
  return !!q.muddat && bugun > q.muddat && !YOPIQ_HOLAT.includes(q.holat);
}

export default function Topshiriqlar() {
  const { joriyId } = useKompaniya();
  const [yonalish, setYonalish] = useState<'menga' | 'mendan'>('menga');
  const [qatorlar, setQatorlar] = useState<Topshiriq[]>([]);
  const [xato, setXato] = useState(''); const [band, setBand] = useState(false);
  const [sarlavha, setSarlavha] = useState(''); const [muddat, setMuddat] = useState('');

  const yukla = useCallback(async () => {
    if (!joriyId) return;
    setBand(true);
    const r = await topshiriqlarOl(joriyId, yonalish);
    if (r.ok) { setQatorlar(r.qatorlar); setXato(''); } else setXato(r.error);
    setBand(false);
  }, [joriyId, yonalish]);
  useEffect(() => { void yukla(); }, [yukla]);

  async function otkaz(q: Topshiriq, holat: TopshiriqHolat, izohKerak?: boolean) {
    if (!joriyId) return;
    const izoh = izohKerak ? ((await matnSora({ matn: 'Sababini yozing', majburiy: true })) ?? '').trim() : undefined;
    if (izohKerak && !izoh) return;
    const r = await topshiriqOtish({ kompaniyaId: joriyId, topshiriq: q, holat, izoh });
    if (!r.ok) setXato(topshiriqXato(r)); else await yukla();
  }
  async function ber() {
    if (!joriyId || !sarlavha.trim()) return;
    const r = await topshiriqBer({ kompaniyaId: joriyId, sarlavha: sarlavha.trim(), muddat: muddat || undefined });
    if (!r.ok) setXato(topshiriqXato(r)); else { setSarlavha(''); setMuddat(''); await yukla(); }
  }

  if (!joriyId) return <div className="p-6 text-text-dim">{t('Avval ish joyini tanlang')}</div>;
  return (
    <div className="mx-auto max-w-2xl p-4">
      <h1 className="fz-pagehead__title mb-3">{t('Topshiriqlar')}</h1>
      <div className="mb-3 flex gap-2">
        {(['menga', 'mendan'] as const).map((y) => (
          <button key={y} type="button" onClick={() => setYonalish(y)}
            aria-pressed={yonalish === y} className={`fz-btn fz-btn--lg min-h-12 flex-1 text-base ${yonalish === y ? 'border-accent bg-accent/15 text-text' : ''}`}>
            {y === 'menga' ? t('Menga berilgan') : t('Men bergan')}
          </button>
        ))}
      </div>
      {yonalish === 'mendan' && (
        <div className="fz-panel mb-4">
          <input value={sarlavha} onChange={(e) => setSarlavha(e.target.value)} maxLength={200} placeholder={t('Topshiriq sarlavhasi')} className="min-h-12 px-3" />
          <input type="date" value={muddat} onChange={(e) => setMuddat(e.target.value)} className="min-h-12 px-3" />
          <button type="button" onClick={() => void ber()} disabled={!sarlavha.trim()} className="fz-btn fz-btn--primary fz-btn--lg min-h-12">{t('Topshiriq berish')}</button>
        </div>
      )}
      {xato && <div role="alert" className="fz-note fz-note--danger mb-3">{xato}</div>}
      {band && <div className="text-text-dim">{t('yuklanmoqda…')}</div>}
      {!band && qatorlar.length === 0 && <div className="text-text-dim">{t('Topshiriq yo‘q')}</div>}
      <ul className="flex flex-col gap-2">
        {qatorlar.map((q) => (
          <li key={q.id} className="fz-panel gap-1.5">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1 font-medium text-text">{q.sarlavha}</div>
              <span className={`fz-stamp ${HOLAT_MUHR[q.holat] ?? ''}`}>{t(HOLAT_NOMI[q.holat])}</span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-sm text-text-dim">{[q.obyekt_nom, q.beruvchi_nom, q.muddat].filter(Boolean).join(' · ')}{muddatOtganmi(q) && <span className="fz-chip fz-chip--danger">{t('Muddat o‘tgan')}</span>}</div>
            {q.oxirgi_izoh && <div className="text-sm text-text-dim">{q.oxirgi_izoh}</div>}
            <div className="mt-2 flex flex-wrap gap-2">
              {harakatlar(q.holat, yonalish).map((h) => (
                <button key={h.holat} type="button" onClick={() => void otkaz(q, h.holat, h.izohKerak)} className="fz-btn fz-btn--lg min-h-12 flex-1 font-semibold">{t(h.nom)}</button>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
