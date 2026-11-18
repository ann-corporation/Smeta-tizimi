/**
 * Sinov bilan boshlash (egasi 2026-11-17): yangi o'zi ro'yxatdan o'tgan foydalanuvchi 1000 token bilan tizimni sinab ko'radi.
 *  • a'zoligi yo'q (boshlash_mumkin)  → «Sinovni boshlash» (nom so'ralmaydi): shaxsiy sinov ish joyi + 1000 token, BIR MARTA (RPC ichida).
 *  • sinov ish joyi bor, haqiqiy emas → birinchi qadamlar ro'yxati: demo namuna / smeta yuklash / F-2 / AI + token balansi va nima token yechishi
 *    + «Haqiqiy ish joyi» (STIR so'rovi/ochish: mavjud KompaniyaOching — sinov ish joyi haqiqiyga aylanadi, tokenlar saqlanadi).
 *  • boshqalarga hech narsa ko'rsatilmaydi.
 * Ma'lumot: /api/company?sinov=1 (actor sessiyadan). Demo nusxa faqat «Namunani ochish» bosilganda yaratiladi (DB hajmi).
 */
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Bot, Building2, CheckCircle2, FileSpreadsheet, FileText, Loader2, Sparkles } from 'lucide-react';
import { t } from '../../i18n/til';
import { sinovBoshlash, sinovDemo, useSinovHolat } from '../../api/t2-men';
import { yangiOperationId } from '../../api/supabase';
import { useKompaniya } from '../../umumiy/kontekst/KompaniyaKontekst';
import { KompaniyaOching } from './KompaniyaOching';

export const SINOV_XATO: Record<string, string> = {
  LIMIT: 'Bugungi sinov joylari tugadi. Ertaga urinib ko‘ring yoki pastdagi kompaniya so‘rovini yuboring.',
  SINOV_KERAKMAS: 'Sizda allaqachon ish joyi bor.',
  DEMO_YOQ: 'Namuna obyekt hozircha yo‘q.',
  AUTH_REQUIRED: 'Avval tizimga kiring.',
};
export const SINOV_TOKEN = 1000;

function Qadam({ ikon, matn, bajarildi, amal }: { ikon: React.ReactNode; matn: string; bajarildi?: boolean; amal: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <span className={bajarildi ? 'text-emerald-400' : 'text-text-dim'} aria-hidden="true">{bajarildi ? <CheckCircle2 size={16} /> : ikon}</span>
      <span className="flex-1 text-[13px]">{matn}</span>
      {amal}
    </li>
  );
}

export function SinovBoshlash() {
  const q = useSinovHolat();
  const k = useKompaniya();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [band, setBand] = useState(false);
  const [xato, setXato] = useState('');
  const [haqiqiyOchiq, setHaqiqiyOchiq] = useState(false);
  const [opId] = useState(() => yangiOperationId()); // ikki marta bosish — bitta amal
  const [demoOp] = useState(() => yangiOperationId());
  const h = q.data;
  if (!h || (!h.boshlash_mumkin && !(h.boshlangan && !h.haqiqiy))) return null;

  const xatoMatn = (err: unknown) => t(SINOV_XATO[(err as { code?: string })?.code ?? ''] ?? 'Bajarib bo‘lmadi. Qayta urinib ko‘ring.');
  async function boshlash() {
    setBand(true); setXato('');
    try {
      const r = await sinovBoshlash(opId);
      k.qayta();
      void qc.invalidateQueries({ queryKey: ['sinovHolat'] });
      if (r.kompaniya_id) setTimeout(() => k.tanla(r.kompaniya_id), 400);
    } catch (err) { setXato(xatoMatn(err)); } finally { setBand(false); }
  }
  async function demo() {
    setBand(true); setXato('');
    try {
      await sinovDemo(demoOp);
      void qc.invalidateQueries({ queryKey: ['sinovHolat'] });
      navigate('/admin/obyektlar');
    } catch (err) { setXato(xatoMatn(err)); } finally { setBand(false); }
  }

  if (h.boshlash_mumkin) {
    return (
      <section className="fz-card max-w-xl" aria-label={t('Sinab ko‘ring')}>
        <div className="fz-card__head">
          <div>
            <h2 className="fz-card__title flex items-center gap-2"><Sparkles size={16} /> {t('Tizimni bepul sinab ko‘ring')}</h2>
            <p className="fz-card__sub">{t('Bir bosishda shaxsiy sinov joyingiz ochiladi va hisobingizga {n} token tushadi. Kompaniya nomi yoki STIR kerak emas.', { n: SINOV_TOKEN })}</p>
          </div>
        </div>
        <div className="fz-card__body flex flex-col gap-3">
          {xato && <p role="alert" className="text-[12px] text-rose-300">{xato}</p>}
          <button type="button" className="fz-btn fz-btn--primary h-11" disabled={band} onClick={() => void boshlash()}>
            {band ? <Loader2 className="animate-spin" size={15} /> : t('Sinovni boshlash — {n} token', { n: SINOV_TOKEN })}
          </button>
          <p className="text-[12px] text-text-dim">{t('Token bir marta beriladi. Keyin haqiqiy kompaniyangizni shu joyning o‘zida ochasiz — tokenlaringiz saqlanadi.')}</p>
        </div>
      </section>
    );
  }

  const demoOchilgan = h.demo_obyekt_id != null;
  return (
    <section className="fz-card" aria-label={t('Birinchi qadamlar')}>
      <div className="fz-card__head">
        <div>
          <h2 className="fz-card__title flex items-center gap-2"><Sparkles size={16} /> {t('Birinchi qadamlar')}</h2>
          <p className="fz-card__sub">{t('Sinov balansi: {n} token', { n: Math.round(h.balans ?? 0) })}</p>
        </div>
        <Link className="fz-btn fz-btn--ghost fz-btn--sm" to="/admin/tokenlar">{t('Token narxlari')}</Link>
      </div>
      {xato && <p role="alert" className="px-4 pt-3 text-[12px] text-rose-300">{xato}</p>}
      <ul className="fz-list">
        <Qadam ikon={<FileSpreadsheet size={16} />} bajarildi={demoOchilgan} matn={t('Namuna obyektni oching — tayyor kichik smeta')}
          amal={h.demo_mavjud || demoOchilgan
            ? <button type="button" className="fz-btn fz-btn--sm" disabled={band} onClick={() => (demoOchilgan ? navigate('/admin/obyektlar') : void demo())}>{demoOchilgan ? t('Ochish') : t('Namunani ochish')}</button>
            : <span className="text-[12px] text-text-dim">{t('tez orada')}</span>} />
        <Qadam ikon={<FileSpreadsheet size={16} />} matn={t('O‘z smetangizni yuklang (Excel)')}
          amal={<Link className="fz-btn fz-btn--sm" to="/admin/obyektlar">{t('Yuklash')}</Link>} />
        <Qadam ikon={<FileText size={16} />} matn={t('F-2 tayyorlang')}
          amal={<Link className="fz-btn fz-btn--sm" to="/admin/f2-tarix">{t('F-2')}</Link>} />
        <Qadam ikon={<Bot size={16} />} matn={t('AI yordamchiga savol bering (Ctrl+K)')}
          amal={<span className="text-[12px] text-text-dim">{'Ctrl+K'}</span>} />
        <Qadam ikon={<Building2 size={16} />} matn={t('Haqiqiy kompaniya ish joyini oching (tokenlar saqlanadi)')}
          amal={<button type="button" className="fz-btn fz-btn--sm" aria-expanded={haqiqiyOchiq} onClick={() => setHaqiqiyOchiq((v) => !v)}>{t('Ochish')}</button>} />
      </ul>
      <p className="px-4 py-2 text-[12px] text-text-dim">{t('Ko‘rish va tahrirlash bepul. Hujjat tayyorlash, eksport va AI natijalari token yechadi — narxlar «Token narxlari» sahifasida.')}</p>
      {haqiqiyOchiq && <div className="border-t border-border p-3"><KompaniyaOching /></div>}
    </section>
  );
}
