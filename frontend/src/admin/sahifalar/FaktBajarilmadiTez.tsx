import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { X } from 'lucide-react';
import { yangiOperationId } from '../../api/supabase';
import { BAJARILMADI_SABABLAR, bajarilmadiBelgila, bajarilmadiXato, type BajarilmadiSabab } from '../../api/t2-bajarilmadi';
import { bajarilmadiTaklif } from '../../lib/fakt-studio';
import { t } from '../../i18n/til';

export type BajarilmadiQatorInfo = { id: number; kod: string | null; nom: string; birlik: string | null; smeta: number | null; fakt: number; belgilangan: number };

/**
 * Fakt kiritish paytida joyida: «bu hajm bajarilmaydi / qilib bo'lmaydi» (sabab bilan). Mavjud bajarilmadi qatlamiga
 * yozadi (smeta qatori o'zgarmaydi; qoldiq/F2 hisobi o'zgarmaydi - faqat sabab va hajm saqlanadi).
 * Klaviatura: Enter - belgilash, Esc - yopish. Hajm bo'sh qoldirilsa - butun qoldiq (server qoidasi).
 */
export function FaktBajarilmadiTez({ kompaniyaId, obyektId, sana, qator, onYop, onSaqlandi }: {
  kompaniyaId: number; obyektId: number; sana: string; qator: BajarilmadiQatorInfo;
  onYop: () => void; onSaqlandi: (xabar: string) => void;
}) {
  const taklif = bajarilmadiTaklif(qator.smeta, qator.fakt, qator.belgilangan);
  const [hajm, setHajm] = useState(taklif != null && taklif > 0 ? String(taklif) : '');
  const [sabab, setSabab] = useState<BajarilmadiSabab>('texnik_sabab');
  const [izoh, setIzoh] = useState('');
  const [band, setBand] = useState(false);
  const [xato, setXato] = useState('');
  const opRef = useRef(yangiOperationId());
  const hajmRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => { hajmRef.current?.focus(); hajmRef.current?.select(); }, []);

  const yubor = async () => {
    if (band) return;
    const n = hajm.trim() ? Number(hajm.replace(',', '.')) : null;
    if (n != null && (!Number.isFinite(n) || n <= 0)) { setXato(t('Hajm musbat son bo‘lishi kerak')); return; }
    if (n == null && taklif == null) { setXato(t('Smeta hajmi noma‘lum - bajarilmagan hajmni yozing.')); return; }
    if (sabab === 'boshqa' && !izoh.trim()) { setXato(t(bajarilmadiXato({ ok: false, code: 'SABAB_IZOH_MAJBURIY' }))); return; }
    setBand(true); setXato('');
    try {
      const r = await bajarilmadiBelgila({ kompaniyaId, obyektId, qatorlar: [{ qator_id: qator.id, hajm: n }], sabab, izoh: izoh.trim() || undefined, sana, operationId: opRef.current });
      if (!r.ok) { setXato(t(bajarilmadiXato(r))); return; }
      onSaqlandi(t('Bajarilmaydi deb belgilandi (smeta o‘zgarmadi).'));
    } catch (e) { setXato(e instanceof Error ? e.message : t('Amal bajarilmadi')); }
    finally { setBand(false); }
  };
  const tugma = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') { e.preventDefault(); onYop(); }
    else if (e.key === 'Enter' && !(e.target instanceof HTMLTextAreaElement) && !(e.target instanceof HTMLSelectElement)) { e.preventDefault(); void yubor(); }
  };

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label={t('Bajarilmaydi')} onKeyDown={tugma}>
    <div className="karta w-full max-w-md space-y-3 p-4 text-[12px]">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0"><h3 className="text-[14px] font-semibold text-text">{t('Bajarilmaydi / qilib bo‘lmaydi')}</h3>
          <p className="truncate text-text-dim" title={qator.nom}>{qator.kod ? `${qator.kod} ` : ''}{qator.nom}</p></div>
        <button type="button" onClick={onYop} aria-label={t('Yopish')} className="rounded p-1 text-text-mute hover:bg-surface-2"><X size={14} /></button>
      </div>
      <p className="text-text-mute">{t('Smeta')}: {qator.smeta ?? '—'} · {t('fakt')}: {qator.fakt} · {t('allaqachon belgilangan')}: {qator.belgilangan} {qator.birlik ?? ''}</p>
      <label className="block">{t('Bajarilmagan hajm')} ({qator.birlik ?? '—'})
        <input ref={hajmRef} aria-label={t('Bajarilmagan hajm')} inputMode="decimal" value={hajm} onChange={(e) => setHajm(e.target.value)} className="mt-1 w-full rounded border border-border bg-bg px-2 py-1 font-mono text-[13px]" /></label>
      <label className="block">{t('Sabab')}
        <select aria-label={t('Sabab')} value={sabab} onChange={(e) => setSabab(e.target.value as BajarilmadiSabab)} className="mt-1 w-full rounded border border-border bg-bg px-2 py-1">
          {BAJARILMADI_SABABLAR.map((s) => <option key={s.kod} value={s.kod}>{t(s.nom)}</option>)}</select></label>
      <label className="block">{t('Izoh')}{sabab === 'boshqa' ? ' *' : ''}
        <textarea aria-label={t('Izoh')} rows={2} value={izoh} onChange={(e) => setIzoh(e.target.value)} className="mt-1 w-full rounded border border-border bg-bg px-2 py-1" /></label>
      {xato && <p role="alert" className="text-danger">{xato}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onYop} className="rounded border border-border px-3 py-1">{t('Bekor')} <kbd className="text-[10px] text-text-mute">{'Esc'}</kbd></button>
        <button type="button" disabled={band} onClick={() => void yubor()} className="rounded bg-accent px-3 py-1 font-semibold text-white disabled:opacity-50">{band ? t('Saqlanmoqda…') : t('Bajarilmaydi deb belgilash')} <kbd className="text-[10px] opacity-80">{'Enter'}</kbd></button>
      </div>
    </div>
  </div>;
}
