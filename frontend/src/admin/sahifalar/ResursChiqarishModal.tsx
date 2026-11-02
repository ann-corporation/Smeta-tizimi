import { useRef, useState, type KeyboardEvent } from 'react';
import { MinusCircle, X } from 'lucide-react';
import { yangiOperationId } from '../../api/supabase';
import { BAJARILMADI_SABABLAR, bajarilmadiBelgila, bajarilmadiXato, type BajarilmadiSabab } from '../../api/t2-bajarilmadi';
import { chiqarishHajmi } from '../../lib/resurs-amal';
import { t } from '../../i18n/til';

export type ChiqarishQator = { id: number; kod: string | null; nom: string; birlik: string | null; smeta: number | null; ishNom?: string | null };

const fmt = (v: number) => v.toLocaleString('ru-RU', { maximumFractionDigits: 6 });

/**
 * «Resursni ishdan chiqarish» (egasi 2026-10-27): resurs shu ishda ishlatilmadi — F2 ga kirmaydi.
 * Mavjud «bajarilmaydi» qatlami (`bajarilmadi_belgila`) bilan bir xil semantika: asl smeta qatori O'ZGARMAYDI,
 * resursning TO'LIQ smeta hajmi «bajarilmaydi» deb sabab bilan belgilanadi; bekor qilish — belgini bekor qilish.
 */
export function ResursChiqarishModal({ kompaniyaId, obyektId, sana, qator, onYop, onSaqlandi }: {
  kompaniyaId: number; obyektId: number; sana: string; qator: ChiqarishQator;
  onYop: () => void; onSaqlandi: (xabar: string) => void;
}) {
  const hajm = chiqarishHajmi(qator.smeta);
  const [sabab, setSabab] = useState<BajarilmadiSabab>('buyurtmachi_chiqardi');
  const [izoh, setIzoh] = useState('');
  const [band, setBand] = useState(false);
  const [xato, setXato] = useState('');
  const opRef = useRef(yangiOperationId());

  const yubor = async () => {
    if (band) return;
    if (hajm == null) { setXato(t('Resursning smeta hajmi noma‘lum — chiqarib bo‘lmaydi.')); return; }
    if (sabab === 'boshqa' && !izoh.trim()) { setXato(t(bajarilmadiXato({ ok: false, code: 'SABAB_IZOH_MAJBURIY' }))); return; }
    setBand(true); setXato('');
    try {
      // Saqlanadigan izoh — bazada til-mustaqil belgi bilan (hisobot/eksportda «chiqarildi» ko'rinsin).
      const matn = ['resurs ishdan chiqarildi', qator.ishNom ? `(${qator.ishNom})` : '', izoh.trim()].filter(Boolean).join(' ');
      const r = await bajarilmadiBelgila({ kompaniyaId, obyektId, qatorlar: [{ qator_id: qator.id, hajm }], sabab, izoh: matn, sana, operationId: opRef.current });
      if (!r.ok) { setXato(t(bajarilmadiXato(r))); return; }
      if ((r.yaratildi ?? 0) === 0) { setXato(t('Resursda «bajarilmaydi» belgisi bor — avval uni bekor qiling.')); return; }
      onSaqlandi(t('Resurs ishdan chiqarildi — F2 ga kirmaydi (smeta o‘zgarmadi).'));
    } catch (e) { setXato(e instanceof Error ? e.message : t('Amal bajarilmadi')); }
    finally { setBand(false); }
  };
  const tugma = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') { e.preventDefault(); onYop(); }
    else if (e.key === 'Enter' && !(e.target instanceof HTMLTextAreaElement) && !(e.target instanceof HTMLSelectElement)) { e.preventDefault(); void yubor(); }
  };

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-[color-mix(in_srgb,var(--bg)_72%,transparent)] p-4" role="dialog" aria-modal="true" aria-label={t('Resursni ishdan chiqarish')} onKeyDown={tugma}>
    <div className="karta w-full max-w-md space-y-3 p-4 text-[12px]">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0"><h3 className="flex items-center gap-1.5 text-[14px] font-semibold text-text"><MinusCircle size={15} className="text-danger" aria-hidden="true" />{t('Resursni ishdan chiqarish')}</h3>
          <p className="truncate text-text-dim" title={qator.nom}>{qator.kod ? `${qator.kod} ` : ''}{qator.nom}</p>
          {qator.ishNom && <p className="truncate text-text-mute" title={qator.ishNom}>{t('Ish: {nom}', { nom: qator.ishNom })}</p>}</div>
        <button type="button" onClick={onYop} aria-label={t('Yopish')} className="rounded p-1 text-text-mute hover:bg-surface-2"><X size={14} /></button>
      </div>
      <p className="fz-note fz-note--info" data-testid="chiqarish-izoh">{t('Resurs shu ishda ishlatilmadi: F2 ga kirmaydi. Asl smeta qatori o‘zgarmaydi — butun smeta hajmi «bajarilmaydi» deb sabab bilan belgilanadi; bekor qilish mumkin.')}</p>
      <p className="text-text-dim">{t('Chiqariladigan hajm')}: <b className="font-mono text-text" data-testid="chiqarish-hajm">{hajm == null ? '—' : fmt(hajm)}</b> {qator.birlik ?? ''}</p>
      <label className="block">{t('Sabab')}
        <select aria-label={t('Sabab')} value={sabab} onChange={(e) => setSabab(e.target.value as BajarilmadiSabab)} className="mt-1 w-full rounded border border-border bg-bg px-2 py-1">
          {BAJARILMADI_SABABLAR.map((s) => <option key={s.kod} value={s.kod}>{t(s.nom)}</option>)}</select></label>
      <label className="block">{t('Izoh')}{sabab === 'boshqa' ? ' *' : ''}
        <textarea aria-label={t('Izoh')} rows={2} value={izoh} onChange={(e) => setIzoh(e.target.value)} className="mt-1 w-full rounded border border-border bg-bg px-2 py-1" /></label>
      {xato && <p role="alert" className="text-danger">{xato}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onYop} className="fz-btn fz-btn--ghost fz-btn--sm">{t('Bekor')} <kbd className="fz-kbd">{'Esc'}</kbd></button>
        <button type="button" disabled={band || hajm == null} onClick={() => void yubor()} className="fz-btn fz-btn--danger fz-btn--sm">{band ? t('Saqlanmoqda…') : t('Chiqarish')} <kbd className="fz-kbd">{'Enter'}</kbd></button>
      </div>
    </div>
  </div>;
}
