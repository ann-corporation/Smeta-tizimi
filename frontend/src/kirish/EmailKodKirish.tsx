import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Mail, User, RotateCcw, Pencil } from 'lucide-react';
import { t } from '../i18n/til';

/**
 * Email kod bilan kirish/ro'yxat (egasi 2026-10-26: «pochtaga raqam keladi, keyin login bo'ladi»).
 * 1) email → «Kod yuborish»  2) 6 xonali kod (+ yangi bo'lsa ism) → kirish. Hisob bo'lmasa server o'zi ochadi.
 * Server: /api/kirish-email (amal: 'kod' | 'tasdiqla'); sessiya cookie server javobida o'rnatiladi.
 */
export type EmailKirishNatija = { yangi: boolean; demo: boolean };
type Javob = { ok?: boolean; code?: string; xabar?: string; tasdiqlash_id?: string; yangi?: boolean; demo?: boolean; qolgan_urinish?: number };

const EMAIL = /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i;
const QAYTA_SONIYA = 60;

async function sorov(body: unknown): Promise<{ status: number; d: Javob }> {
  const r = await fetch('/api/kirish-email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({ ok: false, xabar: t('Server javobi noto‘g‘ri') })) as Javob;
  return { status: r.status, d };
}

export function EmailKodKirish({ royxat = false, onKirdi, onXizmatYoq }: {
  royxat?: boolean; onKirdi: (n: EmailKirishNatija) => void; onXizmatYoq?: () => void;
}) {
  const [email, setEmail] = useState('');
  const [ism, setIsm] = useState('');
  const [kod, setKod] = useState('');
  const [tid, setTid] = useState<string | null>(null);
  const [band, setBand] = useState(false);
  const [xato, setXato] = useState('');
  const [qayta, setQayta] = useState(0);
  const opId = useRef<string>(crypto.randomUUID());
  const kodRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (qayta <= 0) return;
    const id = window.setTimeout(() => setQayta((s) => s - 1), 1000);
    return () => window.clearTimeout(id);
  }, [qayta]);
  useEffect(() => { if (tid) kodRef.current?.focus(); }, [tid]);

  const kodYubor = async () => {
    const e = email.trim().toLowerCase();
    if (!EMAIL.test(e)) { setXato(t('Email manzilini to‘g‘ri kiriting.')); return; }
    setBand(true); setXato('');
    try {
      const { d } = await sorov({ amal: 'kod', email: e });
      if (!d.ok || !d.tasdiqlash_id) {
        setXato(d.xabar || t('Kod yuborib bo‘lmadi.'));
        if (d.code === 'EMAIL_XIZMATI_SOZLANMAGAN' || d.code === 'SERVER_YANGILANMAGAN' || d.code === 'EMAIL_SINOV_REJIMI' || d.code === 'EMAIL_KALIT_XATO') onXizmatYoq?.();
        return;
      }
      setEmail(e); setTid(d.tasdiqlash_id); setKod(''); setQayta(QAYTA_SONIYA);
    } catch { setXato(t('Tizimga ulanish amalga oshmadi. Qayta urinib ko‘ring.')); }
    finally { setBand(false); }
  };

  const tasdiqla = async (qiymat = kod) => {
    if (!tid || !/^\d{6}$/.test(qiymat)) return;
    setBand(true); setXato('');
    try {
      const { d } = await sorov({ amal: 'tasdiqla', email, tasdiqlash_id: tid, kod: qiymat, ism: ism.trim() || undefined, operation_id: opId.current });
      if (!d.ok) {
        const qolgan = typeof d.qolgan_urinish === 'number' && d.qolgan_urinish >= 0 ? ' ' + t('Qolgan urinish: {n}', { n: d.qolgan_urinish }) : '';
        setXato((d.xabar || t('Kirib bo‘lmadi.')) + qolgan);
        if (d.code === 'KOD_NOTOGRI') { setKod(''); kodRef.current?.focus(); }
        if (d.code && ['KOD_MUDDATI_OTGAN', 'KOD_ISHLATILGAN', 'KOD_TOPILMADI', 'KOD_URINISH_LIMITI'].includes(d.code)) { setTid(null); setQayta(0); }
        return;
      }
      onKirdi({ yangi: !!d.yangi, demo: !!d.demo });
    } catch { setXato(t('Tizimga ulanish amalga oshmadi. Qayta urinib ko‘ring.')); }
    finally { setBand(false); }
  };

  const kodOzgardi = (v: string) => {
    const toza = v.replace(/\D/g, '').slice(0, 6);
    setKod(toza);
    if (toza.length === 6) void tasdiqla(toza);   // 6-raqam kiritilishi bilan avtomatik tasdiq
  };
  const qaytaMatni = qayta > 0 ? t('Qayta yuborish ({s} s)', { s: qayta }) : t('Kodni qayta yuborish');

  return (
    <form className="entry-auth-form" noValidate onSubmit={(e) => { e.preventDefault(); if (tid) void tasdiqla(); else void kodYubor(); }} aria-label={t('Email kod bilan kirish')}>
      {royxat && (
        <div className="entry-field">
          <label htmlFor="entry-email-ism">{t('Ismingiz')}</label>
          <div className="entry-input-wrap">
            <User aria-hidden="true" size={17} />
            <input id="entry-email-ism" type="text" autoComplete="name" value={ism} onChange={(e) => setIsm(e.target.value)} placeholder={t('F.I.Sh.')} className="entry-input" />
          </div>
        </div>
      )}
      <div className="entry-field">
        <label htmlFor="entry-email">{t('Email manzili')}</label>
        <div className="entry-input-wrap">
          <Mail aria-hidden="true" size={17} />
          <input id="entry-email" type="email" autoComplete="email" inputMode="email" value={email} readOnly={!!tid}
            onChange={(e) => { setEmail(e.target.value); setXato(''); }} placeholder={t('masalan: aziz@gmail.com')} className="entry-input" />
          {tid && <button type="button" className="entry-eye" onClick={() => { setTid(null); setKod(''); setQayta(0); }} aria-label={t('Emailni o‘zgartirish')}><Pencil size={15} /></button>}
        </div>
      </div>

      <AnimatePresence initial={false}>
        {tid && (
          <motion.div key="kod" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="entry-field">
            <label htmlFor="entry-email-kod">{t('Emailga kelgan 6 xonali kod')}</label>
            <input ref={kodRef} id="entry-email-kod" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={kod}
              onChange={(e) => kodOzgardi(e.target.value)} placeholder="••••••" className="entry-input entry-input--code" aria-describedby="entry-email-kod-izoh" />
            <p id="entry-email-kod-izoh" className="entry-auth-note" style={{ margin: '6px 0 0' }}>
              {t('Kod {email} manziliga yuborildi. «Spam» papkasini ham tekshiring.', { email })}
            </p>
            {!royxat && (
              <div className="entry-input-wrap" style={{ marginTop: 8 }}>
                <User aria-hidden="true" size={17} />
                <input id="entry-email-ism-ixt" type="text" autoComplete="name" value={ism} onChange={(e) => setIsm(e.target.value)}
                  placeholder={t('Ismingiz (yangi hisob ochilsa)')} aria-label={t('Ismingiz (yangi hisob ochilsa)')} className="entry-input" />
              </div>
            )}
            <button type="button" disabled={band || qayta > 0} onClick={() => void kodYubor()} className="entry-auth-resend">
              <RotateCcw size={13} aria-hidden="true" /> {qaytaMatni}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {xato && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="entry-auth-error-wrap">
            <div className="entry-auth-error" role="alert">{xato}</div>
          </motion.div>
        )}
      </AnimatePresence>

      <button type="submit" disabled={band || (!tid && !email.trim()) || (!!tid && kod.length !== 6)} className="entry-auth-submit">
        {band ? t('Tekshirilmoqda...') : tid ? <>{t('Kirish')} <ArrowRight size={18} aria-hidden="true" /></> : <>{t('Kod yuborish')} <ArrowRight size={18} aria-hidden="true" /></>}
      </button>
    </form>
  );
}
