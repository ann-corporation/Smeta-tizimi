/**
 * «Telegram modeli» (egasi 2026-10-22): ish joylari ro'yxati yonida ＋ menyu — yangi ish joyini DARHOL ochish
 * (tasdiqsiz) va taklif havolasi/kodi orqali qo'shilish. Muvaffaqiyatdan keyin ro'yxat yangilanadi va yangi joy tanlanadi.
 */
import { useEffect, useRef, useState } from 'react';
import { Plus, Link2, User, Building2 } from 'lucide-react';
import { useKompaniya } from './KompaniyaKontekst';
import { ishJoyiXato, ishJoyiYarat, qoshil, type IshJoyiTuri } from '../../api/t2-ish-joyi';
import { t } from '../../i18n/til';

/** Ish joyi turi belgisi: 👤 shaxsiy, 🏢 tashkilot. */
export function IshJoyiBelgi({ turi }: { turi?: IshJoyiTuri }) {
  return turi === 'shaxsiy'
    ? <User size={12} className="text-accent" aria-label={t('Shaxsiy ish joyi')} />
    : <Building2 size={12} className="text-accent" aria-label={t('Tashkilot')} />;
}
export const turiPrefiksi = (turi?: IshJoyiTuri) => (turi === 'shaxsiy' ? '👤 ' : '🏢 ');

/** Taklif havolasidan yoki matndan kodni ajratadi (…/qoshil/KOD yoki KOD). */
export function kodniAjrat(matn: string): string {
  const s = matn.trim();
  const m = /\/qoshil\/([^/?#\s]+)/.exec(s);
  return decodeURIComponent(m ? m[1] : s).toUpperCase().replace(/[^A-Z0-9-]/g, '');
}

export function IshJoyiAmallari() {
  const k = useKompaniya();
  const [ochiq, setOchiq] = useState(false);
  const [band, setBand] = useState(false);
  const [xabar, setXabar] = useState('');
  const quti = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!ochiq) return;
    const yop = (e: MouseEvent) => { if (!quti.current?.contains(e.target as Node)) setOchiq(false); };
    document.addEventListener('mousedown', yop);
    return () => document.removeEventListener('mousedown', yop);
  }, [ochiq]);

  async function keyin(id: number | undefined) {
    k.qayta();
    if (id) setTimeout(() => k.tanla(id), 600);
  }
  async function yangi(turi: IshJoyiTuri) {
    setOchiq(false); setXabar('');
    const nom = window.prompt(turi === 'shaxsiy' ? t('Shaxsiy ish joyi nomi:') : t('Tashkilot (jamoa) nomi:'), '');
    if (nom == null || !nom.trim()) return;
    setBand(true);
    const r = await ishJoyiYarat(nom.trim(), turi);
    setBand(false);
    if (!r.ok) { setXabar(ishJoyiXato(r)); return; }
    setXabar(`«${nom.trim()}» ${t('ochildi.')}`);
    await keyin(r.kompaniya_id);
  }
  async function havola() {
    setOchiq(false); setXabar('');
    const matn = window.prompt(t('Taklif havolasi yoki kodini kiriting:'), '');
    if (matn == null || !matn.trim()) return;
    setBand(true);
    const r = await qoshil(kodniAjrat(matn));
    setBand(false);
    if (!r.ok) { setXabar(ishJoyiXato(r)); return; }
    setXabar(r.mavjud ? `${t('Siz allaqachon a’zosiz')}: ${r.nom ?? ''}` : `${t('Qo‘shildingiz')}: ${r.nom ?? ''}`);
    await keyin(r.kompaniya_id);
  }

  return (
    <span ref={quti} className="relative inline-flex items-center gap-1.5">
      <button type="button" className="rounded border border-border px-1 py-0.5 text-text-dim hover:text-accent disabled:opacity-50"
        aria-label={t('Ish joyi qo‘shish')} aria-expanded={ochiq} disabled={band} onClick={() => setOchiq((v) => !v)} title={t('Yangi ish joyi yoki havola orqali qo‘shilish')}>
        <Plus size={12} />
      </button>
      {ochiq && <span role="menu" className="absolute left-0 top-full z-50 mt-1 grid w-60 gap-0.5 rounded-lg border border-border bg-[var(--surface-1)] p-1 text-[12px] shadow-lg">
        <button type="button" role="menuitem" className="flex items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-surface-2" onClick={() => void yangi('shaxsiy')}>
          <User size={13} /> {t('Yangi shaxsiy ish joyi')}</button>
        <button type="button" role="menuitem" className="flex items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-surface-2" onClick={() => void yangi('tashkilot')}>
          <Building2 size={13} /> {t('Yangi tashkilot (jamoa)')}</button>
        <button type="button" role="menuitem" className="flex items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-surface-2" onClick={() => void havola()}>
          <Link2 size={13} /> {t('Havola orqali qo‘shilish')}</button>
      </span>}
      {xabar && <span role="status" className="text-[11px] text-text-dim">{xabar}</span>}
    </span>
  );
}
