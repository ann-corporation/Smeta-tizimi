/**
 * /qoshil/:kod — taklif havolasi («Telegram modeli», egasi 2026-10-22). Odam havolani ochadi:
 *  • kirgan bo'lsa — «Qo'shilish» tugmasi, tasdiqsiz qo'shiladi va o'sha ish joyi tanlanadi;
 *  • kirmagan bo'lsa — kod eslab qolinadi (sessionStorage), kirish/ro'yxatdan o'tishdan keyin shu sahifaga qaytadi.
 */
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Link2, Loader2 } from 'lucide-react';
import { ishJoyiXato, qoshil } from '../api/t2-ish-joyi';
import { t } from '../i18n/til';

const KALIT = 't2_qoshil_kod';
const tozala = (kod: string) => kod.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 40);

/** Kirish sahifasi uchun: taklif havolasidan kelingan bo'lsa — kod (bir martalik). */
export function kutilayotganTaklifKodi(): string | null {
  try { const k = sessionStorage.getItem(KALIT); return k ? tozala(k) : null; } catch { return null; }
}
function kodniUnut() { try { sessionStorage.removeItem(KALIT); } catch { /* yo'q bo'lsa ham */ } }
function kodniEslab(kod: string) { try { sessionStorage.setItem(KALIT, kod); } catch { /* saqlab bo'lmasa — havola qayta ochiladi */ } }
/** Qo'shilgan ish joyini faol qilish: KompaniyaKontekst tanlovi ({uid, id, global}) shu foydalanuvchi uchun yangilanadi. */
const KONTEKST_KALIT = 't2_kompaniya_kontekst';
function ishJoyiniTanla(id: number) {
  try {
    const p = JSON.parse(localStorage.getItem(KONTEKST_KALIT) ?? 'null') as { uid?: unknown } | null;
    if (p && typeof p.uid === 'number') localStorage.setItem(KONTEKST_KALIT, JSON.stringify({ uid: p.uid, id, global: false }));
  } catch { /* ixtiyoriy — bo'lmasa ro'yxatdan qo'lda tanlanadi */ }
}

export default function QoshilSahifa() {
  const { kod: xom = '' } = useParams();
  const kod = tozala(decodeURIComponent(xom));
  const navigate = useNavigate();
  const [holat, setHolat] = useState<'tekshir' | 'kirish' | 'tayyor' | 'band' | 'xato' | 'ok'>('tekshir');
  const [xabar, setXabar] = useState('');

  useEffect(() => {
    let tirik = true;
    fetch('/api/sessiya').then((r) => { if (!tirik) return; if (r.ok) setHolat('tayyor'); else { kodniEslab(kod); setHolat('kirish'); } })
      .catch(() => { if (tirik) { kodniEslab(kod); setHolat('kirish'); } });
    return () => { tirik = false; };
  }, [kod]);

  async function bos() {
    setHolat('band');
    const r = await qoshil(kod);
    if (!r.ok) { setXabar(ishJoyiXato(r)); setHolat('xato'); return; }
    kodniUnut();
    if (r.kompaniya_id) ishJoyiniTanla(r.kompaniya_id);
    setXabar(r.mavjud ? `${t('Siz allaqachon a’zosiz')}: ${r.nom ?? ''}` : `${t('Qo‘shildingiz')}: ${r.nom ?? ''}`);
    setHolat('ok');
    setTimeout(() => navigate('/admin/obyektlar'), 900);
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="karta w-full max-w-md space-y-3 p-6 text-center">
        <Link2 className="mx-auto text-accent" size={28} />
        <h1 className="text-lg font-semibold text-text">{t('Ish joyiga taklif')}</h1>
        <p className="font-mono text-sm text-text-dim">{kod || '—'}</p>
        {holat === 'tekshir' && <p className="text-sm text-text-dim"><Loader2 size={14} className="inline animate-spin" /> {t('Tekshirilmoqda…')}</p>}
        {holat === 'kirish' && <>
          <p className="text-sm text-text-dim">{t('Qo‘shilish uchun avval tizimga kiring yoki ro‘yxatdan o‘ting — keyin shu sahifaga qaytasiz.')}</p>
          <button type="button" className="tugma tugma-asosiy w-full" onClick={() => navigate('/')}>{t('Kirish / ro‘yxatdan o‘tish')}</button>
        </>}
        {(holat === 'tayyor' || holat === 'band' || holat === 'xato') && <>
          <p className="text-sm text-text-dim">{t('Taklifni qabul qilsangiz, shu ish joyiga havolada ko‘rsatilgan rol bilan qo‘shilasiz.')}</p>
          <button type="button" className="tugma tugma-asosiy w-full" disabled={holat === 'band' || !kod} onClick={() => void bos()}>
            {holat === 'band' ? <Loader2 size={14} className="animate-spin" /> : null} {t('Qo‘shilish')}</button>
        </>}
        {xabar && <p role={holat === 'xato' ? 'alert' : 'status'} className={holat === 'xato' ? 'text-sm text-rose-400' : 'text-sm text-emerald-400'}>{xabar}</p>}
      </div>
    </div>
  );
}
