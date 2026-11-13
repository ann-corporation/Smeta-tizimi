/**
 * «Kompaniyangizni oching» — a'zoligi yo'q (yangi) foydalanuvchining YAGONA aniq ekrani (L0 qarori 2026-11-13).
 * Bitta qadam: nom (+ ixtiyoriy STIR) → t2_kompaniya_ozi_och_v1 (tasdiqsiz, birinchi kompaniya, o'zi boss) → darhol ish joyiga.
 * Muqobil: «Taklif havolam bor» — havola/kod yoki telefon + kod (emailsiz taklif sahifasi).
 */
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Building2, Link2, Loader2 } from 'lucide-react';
import { t } from '../../i18n/til';
import { kompaniyaOziOch } from '../../api/t2-men';
import { ishJoyiXato, qoshil } from '../../api/t2-ish-joyi';
import { yangiOperationId } from '../../api/supabase';
import { kodniAjrat } from '../../umumiy/kontekst/IshJoyiAmallari';
import { useKompaniya } from '../../umumiy/kontekst/KompaniyaKontekst';
import { MAVJUD_FOYDALANUVCHI_KIRISH } from '../../lib/nav/boshSahifa';

export const OCHISH_XATO: Record<string, string> = {
  COMPANY_NAME_REQUIRED: 'Kompaniya nomini yozing (kamida 2 belgi).',
  INN_INVALID: 'STIR 9 ta raqamdan iborat bo‘lishi kerak.',
  INN_BAND: 'Bu kompaniya tizimda mavjud. Uning egasidan taklif so‘rang.',
  OZI_OCHILGAN: 'Siz allaqachon o‘zingiz kompaniya ochgansiz. Qo‘shimcha kompaniya — «So‘rov yuborish» orqali.',
  AUTH_REQUIRED: 'Avval tizimga kiring.',
};

export function KompaniyaOching() {
  const k = useKompaniya();
  const navigate = useNavigate();
  const [nom, setNom] = useState('');
  const [inn, setInn] = useState('');
  const [band, setBand] = useState(false);
  const [xato, setXato] = useState('');
  const [havolaOchiq, setHavolaOchiq] = useState(false);
  const [havola, setHavola] = useState('');
  const [opId] = useState(() => yangiOperationId()); // ikki marta bosish bitta amal

  async function ochish(e: React.FormEvent) {
    e.preventDefault();
    setBand(true); setXato('');
    try {
      const r = await kompaniyaOziOch({ nom: nom.trim(), inn: inn.trim() || undefined, operation_id: opId }) as { kompaniya_id?: number };
      k.qayta();
      if (r.kompaniya_id) setTimeout(() => k.tanla(r.kompaniya_id as number), 400);
      navigate(MAVJUD_FOYDALANUVCHI_KIRISH, { replace: true });
    } catch (err) {
      const code = (err as { code?: string })?.code || '';
      setXato(t(OCHISH_XATO[code] ?? 'Kompaniyani ochib bo‘lmadi. Qayta urinib ko‘ring.'));
    } finally { setBand(false); }
  }
  async function qosh(e: React.FormEvent) {
    e.preventDefault();
    setBand(true); setXato('');
    const r = await qoshil(kodniAjrat(havola));
    setBand(false);
    if (!r.ok) { setXato(ishJoyiXato(r)); return; }
    k.qayta();
    if (r.kompaniya_id) setTimeout(() => k.tanla(r.kompaniya_id as number), 400);
    navigate(MAVJUD_FOYDALANUVCHI_KIRISH, { replace: true });
  }

  return (
    <section className="fz-card max-w-xl" aria-label={t('Kompaniyangizni oching')}>
      <div className="fz-card__head">
        <div>
          <h2 className="fz-card__title flex items-center gap-2"><Building2 size={16} /> {t('Kompaniyangizni oching')}</h2>
          <p className="fz-card__sub">{t('Bitta qadam: nomini yozing — kompaniya darhol ochiladi va siz uning rahbari bo‘lasiz. STIR keyin ham to‘ldiriladi.')}</p>
        </div>
      </div>
      <form className="fz-card__body flex flex-col gap-3" onSubmit={(e) => void ochish(e)}>
        <input className="input h-11" aria-label={t('Kompaniya nomi')} placeholder={t('Kompaniya nomi *')} value={nom} maxLength={200} onChange={(e) => setNom(e.target.value)} />
        <input className="input h-11" aria-label={t('STIR (ixtiyoriy)')} placeholder={t('STIR (ixtiyoriy, 9 raqam)')} inputMode="numeric" value={inn} maxLength={9} onChange={(e) => setInn(e.target.value.replace(/\D/g, ''))} />
        {xato && <p role="alert" className="text-[12px] text-rose-300">{xato}</p>}
        <button type="submit" className="fz-btn fz-btn--primary h-11" disabled={band || nom.trim().length < 2 || (inn !== '' && inn.length !== 9)}>
          {band ? <Loader2 className="animate-spin" size={15} /> : t('Kompaniyani ochish')}
        </button>
      </form>
      <div className="fz-card__body flex flex-col gap-2 border-t border-border">
        <button type="button" className="fz-btn fz-btn--ghost self-start" aria-expanded={havolaOchiq} onClick={() => setHavolaOchiq((v) => !v)}>
          <Link2 size={14} /> {t('Taklif havolam bor')}
        </button>
        {havolaOchiq && <form className="flex flex-col gap-2" onSubmit={(e) => void qosh(e)}>
          <input className="input h-11" aria-label={t('Taklif havolasi yoki kodi')} placeholder={t('Taklif havolasi yoki kodi')} value={havola} onChange={(e) => setHavola(e.target.value)} />
          <button type="submit" className="fz-btn h-11" disabled={band || !havola.trim()}>{t('Qo‘shilish')}</button>
          <p className="text-[12px] text-text-dim">{t('Telefon raqami va 8 xonali kod bilan taklif olgan bo‘lsangiz —')} <Link className="underline" to="/taklif">{t('shu sahifada qabul qiling')}</Link></p>
        </form>}
      </div>
    </section>
  );
}
