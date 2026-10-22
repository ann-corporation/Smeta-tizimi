/**
 * /ulash/:kod — obyekt ulashish havolasi (T5 «Telegram modeli», egasi 2026-10-22).
 * Odam havolani ochadi, qaysi ish joyida ko'rishni tanlaydi (odatda shaxsiy) va «Qabul qilish» bosadi.
 * Shundan so'ng obyekt «Zakazchik kabineti» da faqat ko'rish uchun chiqadi. Kirmagan bo'lsa — kirgach shu sahifaga qaytadi.
 */
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Eye, Loader2 } from 'lucide-react';
import { ishJoylarim, type IshJoyiKarta } from '../api/t2-ish-joyi';
import { kodBilanQabul } from '../api/t2-tomon';
import { t } from '../i18n/til';

const KALIT = 't2_ulash_kod';
const tozala = (kod: string) => kod.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 40);
/** Havolani qabul qila oladigan rollar (bazadagi «boshqarish» bilan bir xil). */
const BOSHQARUVCHI = new Set(['superadmin', 'admin', 'boss', 'rahbar', 'director']);

/** Kirish sahifasi uchun: ulashish havolasidan kelingan bo'lsa — kod (bir martalik). */
export function kutilayotganUlashKodi(): string | null {
  try { const k = sessionStorage.getItem(KALIT); return k ? tozala(k) : null; } catch { return null; }
}
function kodniUnut() { try { sessionStorage.removeItem(KALIT); } catch { /* yo'q bo'lsa ham */ } }
function kodniEslab(kod: string) { try { sessionStorage.setItem(KALIT, kod); } catch { /* havola qayta ochiladi */ } }
const KONTEKST_KALIT = 't2_kompaniya_kontekst';
function ishJoyiniTanla(id: number) {
  try {
    const p = JSON.parse(localStorage.getItem(KONTEKST_KALIT) ?? 'null') as { uid?: unknown } | null;
    if (p && typeof p.uid === 'number') localStorage.setItem(KONTEKST_KALIT, JSON.stringify({ uid: p.uid, id, global: false }));
  } catch { /* ixtiyoriy */ }
}
/** Qabul qila oladigan ish joylari: shaxsiy birinchi. */
export function qabulQilaOladigan(joylar: IshJoyiKarta[]): IshJoyiKarta[] {
  return joylar.filter((j) => BOSHQARUVCHI.has(j.rol)).sort((a, b) => Number(b.turi === 'shaxsiy') - Number(a.turi === 'shaxsiy'));
}

export default function UlashSahifa() {
  const { kod: xom = '' } = useParams();
  const kod = tozala(decodeURIComponent(xom));
  const navigate = useNavigate();
  const [holat, setHolat] = useState<'tekshir' | 'kirish' | 'tayyor' | 'band' | 'xato' | 'ok'>('tekshir');
  const [joylar, setJoylar] = useState<IshJoyiKarta[]>([]);
  const [tanlangan, setTanlangan] = useState<number | null>(null);
  const [xabar, setXabar] = useState('');

  useEffect(() => {
    let tirik = true;
    fetch('/api/sessiya').then(async (r) => {
      if (!tirik) return;
      if (!r.ok) { kodniEslab(kod); setHolat('kirish'); return; }
      try {
        const q = qabulQilaOladigan((await ishJoylarim()).ishJoylari);
        if (!tirik) return;
        setJoylar(q); setTanlangan(q[0]?.kompaniya_id ?? null); setHolat('tayyor');
      } catch (e) { if (tirik) { setXabar(e instanceof Error ? e.message : t('Ma’lumot o‘qilmadi')); setHolat('xato'); } }
    }).catch(() => { if (tirik) { kodniEslab(kod); setHolat('kirish'); } });
    return () => { tirik = false; };
  }, [kod]);

  async function bos() {
    if (!tanlangan) return;
    setHolat('band');
    const r = await kodBilanQabul(tanlangan, kod);
    if (!r.ok) { setXabar(r.error); setHolat('xato'); return; }
    kodniUnut(); ishJoyiniTanla(tanlangan);
    setXabar(`${t('Ulashildi')}: ${r.natija.nom ?? ''}`); setHolat('ok');
    setTimeout(() => navigate('/admin/zakazchik'), 900);
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="karta w-full max-w-md space-y-3 p-6 text-center">
        <Eye className="mx-auto text-accent" size={28} />
        <h1 className="text-lg font-semibold text-text">{t('Sizga obyekt ulashildi')}</h1>
        <p className="font-mono text-sm text-text-dim">{kod || '—'}</p>
        {holat === 'tekshir' && <p className="text-sm text-text-dim"><Loader2 size={14} className="inline animate-spin" /> {t('Tekshirilmoqda…')}</p>}
        {holat === 'kirish' && <>
          <p className="text-sm text-text-dim">{t('Ko‘rish uchun avval tizimga kiring yoki ro‘yxatdan o‘ting — keyin shu sahifaga qaytasiz.')}</p>
          <button type="button" className="tugma tugma-asosiy w-full" onClick={() => navigate('/')}>{t('Kirish / ro‘yxatdan o‘tish')}</button>
        </>}
        {(holat === 'tayyor' || holat === 'band' || (holat === 'xato' && joylar.length > 0)) && <>
          <p className="text-sm text-text-dim">{t('Obyektni faqat ko‘rasiz: holati va sizga ochilgan hujjatlar. Hech narsani o‘zgartirmaysiz.')}</p>
          {joylar.length > 1 && <label className="block text-left text-[12.5px] text-text-dim">{t('Qaysi ish joyida ko‘rasiz')}
            <select className="mt-1 w-full rounded-lg border border-border bg-bg p-2 text-sm text-text" value={tanlangan ?? ''} onChange={(e) => setTanlangan(Number(e.target.value))}>
              {joylar.map((j) => <option key={j.kompaniya_id} value={j.kompaniya_id}>{j.turi === 'shaxsiy' ? '👤 ' : '🏢 '}{j.nom}</option>)}
            </select></label>}
          <button type="button" className="tugma tugma-asosiy w-full" disabled={holat === 'band' || !kod || !tanlangan} onClick={() => void bos()}>
            {holat === 'band' ? <Loader2 size={14} className="animate-spin" /> : null} {t('Qabul qilish')}</button>
        </>}
        {holat === 'tayyor' && !joylar.length && <p className="text-sm text-warn">{t('Sizda boshqaruvchi bo‘lgan ish joyi yo‘q. Avval shaxsiy ish joyingizni oching.')}</p>}
        {xabar && <p role={holat === 'xato' ? 'alert' : 'status'} className={holat === 'xato' ? 'text-sm text-rose-400' : 'text-sm text-emerald-400'}>{xabar}</p>}
      </div>
    </div>
  );
}
