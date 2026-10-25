import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, EyeOff, ShieldCheck, Lock, User, ArrowRight, Building2, Mail, Phone } from 'lucide-react';
import { toast } from '../umumiy/ui/Toast';
import GoogleKirish, { type GoogleNatija } from './GoogleKirish';
import { t } from '../i18n/til';
import { PublicEntry } from '../components/public-entry/PublicEntry';
import { kutilayotganTaklifKodi } from './QoshilSahifa';
import { kutilayotganUlashKodi } from './UlashSahifa';
import { MAVJUD_FOYDALANUVCHI_KIRISH } from '../lib/nav/boshSahifa';

export default function KirishSahifa() {
  const [isLogin, setIsLogin] = useState(true);

  // Login form state
  const [login, setLogin] = useState('');
  const [parol, setParol] = useState('');
  const [parolKor, setParolKor] = useState(false);
  
  // Register form state
  const [regKompaniya, setRegKompaniya] = useState('');
  const [regLogin, setRegLogin] = useState('');
  const [regParol, setRegParol] = useState('');
  const [regParolKor, setRegParolKor] = useState(false);
  const regOpId = useRef<string>(crypto.randomUUID());
  const [regIsm, setRegIsm] = useState('');
  const [regTelefon, setRegTelefon] = useState('');
  const [regKod, setRegKod] = useState('');
  const [tasdiqlashId, setTasdiqlashId] = useState<string | null>(null);
  
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigateAsl = useNavigate();
  /* «Telegram modeli» (2026-10-22): taklif havolasidan kelgan odam kirgach/ro'yxatdan o'tgach o'sha havolaga qaytadi. */
  const navigate = (yol: string) => {
    const kod = kutilayotganTaklifKodi(), ulash = kutilayotganUlashKodi();
    navigateAsl(kod ? `/qoshil/${encodeURIComponent(kod)}` : ulash ? `/ulash/${encodeURIComponent(ulash)}` : yol);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const r = await fetch('/api/kirish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login, parol }),
      });
      const data = await r.json();

      if (data.ok) {
        /* Kompaniya-aware `/admin` indeksi (RolBoshSahifa) JORIY KOMPANIYADAGI effektiv rol bo'yicha bosh sahifani
           tanlaydi — sessiyadagi global rol emas (bir odam A da boss, B da pto bo'lishi mumkin). Taklif/ulash
           havolasi ustuvor (navigate o'rami). */
        navigate(MAVJUD_FOYDALANUVCHI_KIRISH);
      } else {
        setError(data.xato || 'Xato yuz berdi');
      }
    } catch {
      setError('Tizimga ulanish amalga oshmadi. Qayta urinib ko‘ring.');
    } finally {
      setLoading(false);
    }
  };

  /* Egasi 2026-10-02: tashqaridan kelgan odam O'ZI ro'yxatdan o'tadi (operator kutilmaydi):
     /api/royxat-ozi → foydalanuvchi + o'z kompaniyasi + bepul tarif tokenlari (+ demo obyekt, agar egasi tanlagan bo'lsa),
     so'ng odatdagi /api/kirish (parol bazadagi bcrypt xesh bilan tekshiriladi) — yangi auth yo'li yo'q. */
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    const l = regLogin.trim().toLowerCase();
    if (regIsm.trim().length < 2) { setError('Ismingizni kiriting'); return; }
    if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(l)) { setError('Email manzilini to‘g‘ri kiriting'); return; }
    if (regParol.length < 8) { setError('Parol kamida 8 belgi'); return; }
    setLoading(true);
    setError('');
    try {
      if (!tasdiqlashId) {
        const r = await fetch('/api/royxat-email-kod', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: l }) });
        const d = await r.json().catch(() => ({ ok: false, xabar: 'Server javobi noto‘g‘ri' }));
        if (!d.ok) { setError(d.xabar || 'Kod yuborib bo‘lmadi'); return; }
        setTasdiqlashId(d.tasdiqlash_id);
        toast('Emailingizga 6 xonali kod yuborildi.', 'ok');
        return;
      }
      const r = await fetch('/api/royxat-ozi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login: l, parol: regParol, ism: regIsm.trim(), telefon: regTelefon.trim(), kompaniya: regKompaniya.trim(), operation_id: regOpId.current, tasdiqlash_id: tasdiqlashId, kod: regKod }),
      });
      const d = await r.json().catch(() => ({ ok: false, xabar: 'Server javobi noto‘g‘ri' }));
      if (!d.ok) {
        setError(d.xabar || "Ro'yxatdan o'tkazib bo'lmadi");
        // Login band / parol qisqa kabi xatoda keyingi urinish yangi amal bo'ladi.
        if (d.code && d.code !== 'LIMIT') regOpId.current = crypto.randomUUID();
        return;
      }
      const k = await fetch('/api/kirish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ login: l, parol: regParol }) });
      const kd = await k.json().catch(() => ({ ok: false }));
      if (!kd.ok) { toast("Hisob yaratildi. Endi login va parol bilan kiring.", 'ok'); setIsLogin(true); setLogin(l); setParol(''); return; }
      toast(d.demo ? 'Xush kelibsiz! Bepul tokenlar va demo obyekt tayyor.' : 'Xush kelibsiz! Bepul tokenlar hisobingizda.', 'ok');
      navigate('/admin/tokenlar');
    } catch {
      setError('Tizimga ulanish amalga oshmadi. Qayta urinib ko‘ring.');
    } finally {
      setLoading(false);
    }
  };

  /* ⚠️ 2026-08-28 XAVFSIZLIK TUZATISHI.
   * Avval bu tugmalar `{isBoss:true}` / `{isSuperadmin:true}` yuborardi va
   * server buni PAROLSIZ qabul qilardi — ya'ni internetdagi istalgan odam
   * bitta so'rov bilan superadmin bo'la olardi.
   * Endi tugmalar faqat LOGIN NOMINI to'ldiradi, parolni odam kiritadi. */
  const parolMaydoni = useRef<HTMLInputElement>(null);

  const loginniToldir = (nomi: string) => {
    setError('');
    setLogin(nomi);
    setParol('');
    setTimeout(() => parolMaydoni.current?.focus(), 0);
  };

  /* Google bilan kirish (egasi 2026-10-02): yangi hisob → Tokenlar; mavjud hisob → odatdagi rol sahifasi. */
  const googleNatija = (n: GoogleNatija) => {
    setLoading(false);
    if (!n.ok) { setError(n.xato); return; }
    if (n.yangi) {
      toast(n.demo ? 'Xush kelibsiz! Bepul tokenlar va demo obyekt tayyor.' : 'Xush kelibsiz! Bepul tokenlar hisobingizda.', 'ok');
      navigate('/admin/tokenlar');
    } else navigate(MAVJUD_FOYDALANUVCHI_KIRISH);
  };
  const googleBoshlandi = () => { setError(''); setLoading(true); };

  const handleBossLogin = () => loginniToldir('boss');
  const handleSuperadminLogin = () => loginniToldir('Anvar');

  const field = 'entry-input';
  return (
    <PublicEntry onChooseAuth={(mode) => { setIsLogin(mode === "login"); setError(""); }}>
        <div className="entry-auth">
          <div className="entry-auth-switch">
            <button type="button" aria-pressed={isLogin} onClick={() => { setIsLogin(true); setError(''); }}>
              {isLogin && <motion.span layoutId="entry-auth-pill" className="entry-auth-pill" transition={{ type: 'spring', stiffness: 400, damping: 34 }} />}
              <span>{t('Kirish')}</span>
            </button>
            <button type="button" aria-pressed={!isLogin} onClick={() => { setIsLogin(false); setError(''); }}>
              {!isLogin && <motion.span layoutId="entry-auth-pill" className="entry-auth-pill" transition={{ type: 'spring', stiffness: 400, damping: 34 }} />}
              <span>{t("Ro'yxatdan o'tish")}</span>
            </button>
          </div>

          <div>
            {isLogin ? (
              <motion.div
                key="login"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ duration: 0.2 }}
              >
                <h2 className="entry-auth-title">{t('Tizimga kirish')}</h2>
                <p className="entry-auth-note">{t("O'z hisob ma'lumotlaringizni kiriting")}</p>

                <div className="entry-auth-google"><GoogleKirish matn="signin_with" onNatija={googleNatija} onBoshlandi={googleBoshlandi} /></div>
                <form onSubmit={handleLogin} className="entry-auth-form">
                  <div className="entry-field">
                    <label htmlFor="entry-login">{t('Login')}</label>
                    <div className="entry-input-wrap">
                      <User aria-hidden="true" size={17} />
                      <input
                        type="text"
                        id="entry-login"
                        autoComplete="username"
                        value={login}
                        onChange={e => setLogin(e.target.value)}
                        className={field}
                        placeholder={t('foydalanuvchi_nomi')}
                      />
                    </div>
                  </div>

                  <div className="entry-field">
                    <label htmlFor="entry-password">{t('Parol')}</label>
                    <div className="entry-input-wrap">
                      <Lock aria-hidden="true" size={17} />
                      <input
                        ref={parolMaydoni}
                        id="entry-password"
                        autoComplete="current-password"
                        type={parolKor ? 'text' : 'password'}
                        value={parol}
                        onChange={e => setParol(e.target.value)}
                        className={field}
                        placeholder="••••••••"
                      />
                      <button type="button" onClick={() => setParolKor(!parolKor)} aria-label={t(parolKor ? 'Parolni yashirish' : 'Parolni ko‘rsatish')} className="entry-eye">{parolKor ? <EyeOff size={17} /> : <Eye size={17} />}</button>
                    </div>
                  </div>

                  <AnimatePresence>
                    {error && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="entry-auth-error-wrap">
                        <div className="entry-auth-error" role="alert">{t(error)}</div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <button type="submit" disabled={loading || !login || !parol} className="entry-auth-submit">
                    {loading ? t('Tekshirilmoqda...') : (
                      <>{t('Kirish')} <ArrowRight size={18} aria-hidden="true" /></>
                    )}
                  </button>
                </form>

                <div className="entry-auth-divider"><span>{t('Tezkor')}</span></div>

                <div className="entry-auth-quick">
                  <button type="button" onClick={handleSuperadminLogin} disabled={loading}>
                    <ShieldCheck size={16} aria-hidden="true" />
                    {t('Admin')}
                  </button>
                  <button type="button" onClick={handleBossLogin} disabled={loading}>
                    {t('Rahbar kirishi (svodka)')}
                  </button>
                </div>

              </motion.div>
            ) : (
              <motion.div
                key="register"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2 }}
              >
                <h2 className="entry-auth-title">{t("Bepul sinab ko'rish")}</h2>
                <p className="entry-auth-note">{t("1 daqiqada hisob oching — bepul tokenlar bilan smeta import, F2 va hujjatlarni o'zingiz sinab ko'ring. Operator kutish shart emas.")}</p>

                <div className="entry-auth-google"><GoogleKirish matn="signup_with" onNatija={googleNatija} onBoshlandi={googleBoshlandi} /></div>
                <form onSubmit={handleRegister} className="entry-auth-form">
                  <div className="entry-field">
                    <label htmlFor="entry-signup-name">{t('Ismingiz')}</label>
                    <div className="entry-input-wrap">
                      <User aria-hidden="true" size={17} />
                      <input id="entry-signup-name" type="text" autoComplete="name" required value={regIsm} onChange={e => setRegIsm(e.target.value)} placeholder={t('F.I.Sh.')} className={field} />
                    </div>
                  </div>
                  <div className="entry-field">
                    <label htmlFor="entry-signup-phone">{t('Telefon')} <span>{t('(ixtiyoriy)')}</span></label>
                    <div className="entry-input-wrap">
                      <Phone aria-hidden="true" size={17} />
                      <input id="entry-signup-phone" type="tel" autoComplete="tel" value={regTelefon} onChange={e => setRegTelefon(e.target.value)} placeholder="+998" className={field} />
                    </div>
                  </div>
                  <div className="entry-field">
                    <label htmlFor="entry-signup-company">{t('Kompaniya')} <span>{t('(ixtiyoriy)')}</span></label>
                    <div className="entry-input-wrap">
                      <Building2 aria-hidden="true" size={17} />
                      <input id="entry-signup-company" type="text" autoComplete="organization" value={regKompaniya} onChange={e => setRegKompaniya(e.target.value)} placeholder={t('MChJ / XK nomi')} className={field} />
                    </div>
                  </div>
                  <div className="entry-field">
                    <label htmlFor="entry-signup-email">{t('Email manzili')}</label>
                    <div className="entry-input-wrap">
                      <Mail aria-hidden="true" size={17} />
                      <input id="entry-signup-email" type="email" autoComplete="email" required value={regLogin} onChange={e => { setRegLogin(e.target.value.toLowerCase()); setTasdiqlashId(null); setRegKod(''); }} placeholder={t('masalan: aziz@gmail.com')} className={field} />
                    </div>
                  </div>
                  {tasdiqlashId && <div className="entry-field">
                    <label htmlFor="email-tasdiqlash-kodi">{t('Email tasdiqlash kodi')}</label>
                    <input id="email-tasdiqlash-kodi" inputMode="numeric" autoComplete="one-time-code" required maxLength={6} value={regKod} onChange={e => setRegKod(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="123456" className={`${field} entry-input--code`} />
                    <button type="button" disabled={loading} onClick={() => { setTasdiqlashId(null); setRegKod(''); }} className="entry-auth-resend">{t('Kodni qayta yuborish')}</button>
                  </div>}
                  <div className="entry-field">
                    <label htmlFor="entry-signup-password">{t('Parol')} <span>{t('(kamida 8 belgi)')}</span></label>
                    <div className="entry-input-wrap">
                      <Lock aria-hidden="true" size={17} />
                      <input id="entry-signup-password" type={regParolKor ? 'text' : 'password'} autoComplete="new-password" required minLength={8} value={regParol} onChange={e => setRegParol(e.target.value)} className={field} />
                      <button type="button" onClick={() => setRegParolKor(v => !v)} aria-label={t(regParolKor ? 'Parolni yashirish' : 'Parolni ko‘rsatish')} className="entry-eye">
                        {regParolKor ? <EyeOff size={17} /> : <Eye size={17} />}
                      </button>
                    </div>
                  </div>

                  <AnimatePresence>
                    {error && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="entry-auth-error-wrap">
                        <div className="entry-auth-error" role="alert">{t(error)}</div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <button type="submit" disabled={loading} className="entry-auth-submit">
                    {loading ? t('Hisob ochilmoqda...') : tasdiqlashId ? t('Kodni tasdiqlash va hisob ochish') : t('Emailga kod yuborish')}
                  </button>
                </form>

                <p className="entry-auth-foot">
                  {t('Bepul tarif: 300 token (taxminan 150 ta F2 hujjati). Keyin tarifni «Tokenlar va obuna» bo‘limida tanlaysiz.')}
                </p>
              </motion.div>
            )}
          </div>
        </div>
    </PublicEntry>
  );
}
