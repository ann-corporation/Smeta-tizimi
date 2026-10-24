/** Topshiriqlar (P1) - minimal ekran: "Menga" / "Mendan" ro'yxati, berish, holat o'tkazish. Katta tugmalar, mobil uchun. */
import { useCallback, useEffect, useState } from 'react';
import { useKompaniya } from '../../umumiy/kontekst/KompaniyaKontekst';
import { harakatlar, topshiriqBer, topshiriqlarOl, topshiriqOtish, topshiriqXato, type Topshiriq, type TopshiriqHolat } from '../../api/t2-topshiriq';
import { t } from '../../i18n/til';

export const HOLAT_NOMI: Record<TopshiriqHolat, string> = {
  berildi: 'Berildi', qabul_qilindi: 'Qabul qilindi', rad: 'Rad etildi', bajarilmoqda: 'Bajarilmoqda',
  bajarildi: 'Bajarildi (tasdiq kutilmoqda)', tasdiqlandi: 'Tasdiqlandi', qaytarildi: 'Qaytarildi', bekor: 'Bekor qilindi',
};

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
    const izoh = izohKerak ? (window.prompt(t('Sababini yozing')) ?? '').trim() : undefined;
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
      <h1 className="mb-3 text-xl font-semibold">{t('Topshiriqlar')}</h1>
      <div className="mb-3 flex gap-2">
        {(['menga', 'mendan'] as const).map((y) => (
          <button key={y} type="button" onClick={() => setYonalish(y)}
            className={`min-h-12 flex-1 rounded-lg border px-3 text-base ${yonalish === y ? 'border-accent bg-accent/10 font-semibold' : 'border-border'}`}>
            {y === 'menga' ? t('Menga berilgan') : t('Men bergan')}
          </button>
        ))}
      </div>
      {yonalish === 'mendan' && (
        <div className="mb-4 flex flex-col gap-2 rounded-lg border border-border p-3">
          <input value={sarlavha} onChange={(e) => setSarlavha(e.target.value)} maxLength={200} placeholder={t('Topshiriq sarlavhasi')} className="min-h-12 rounded border border-border bg-transparent px-3" />
          <input type="date" value={muddat} onChange={(e) => setMuddat(e.target.value)} className="min-h-12 rounded border border-border bg-transparent px-3" />
          <button type="button" onClick={() => void ber()} disabled={!sarlavha.trim()} className="min-h-12 rounded-lg bg-accent px-3 font-semibold text-white disabled:opacity-50">{t('Topshiriq berish')}</button>
        </div>
      )}
      {xato && <div role="alert" className="mb-3 rounded border border-red-500/40 p-2 text-sm text-red-500">{xato}</div>}
      {band && <div className="text-text-dim">{t('yuklanmoqda…')}</div>}
      {!band && qatorlar.length === 0 && <div className="text-text-dim">{t('Topshiriq yo‘q')}</div>}
      <ul className="flex flex-col gap-2">
        {qatorlar.map((q) => (
          <li key={q.id} className="rounded-lg border border-border p-3">
            <div className="font-medium">{q.sarlavha}</div>
            <div className="text-sm text-text-dim">{[q.obyekt_nom, q.beruvchi_nom, q.muddat].filter(Boolean).join(' · ')}</div>
            <div className="mt-1 text-sm">{t(HOLAT_NOMI[q.holat])}{q.oxirgi_izoh ? ` - ${q.oxirgi_izoh}` : ''}</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {harakatlar(q.holat, yonalish).map((h) => (
                <button key={h.holat} type="button" onClick={() => void otkaz(q, h.holat, h.izohKerak)} className="min-h-12 flex-1 rounded-lg border border-border px-3 font-semibold">{t(h.nom)}</button>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
