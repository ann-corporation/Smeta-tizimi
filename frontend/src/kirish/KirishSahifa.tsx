import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, EyeOff, Lock, User, ArrowRight, KeyRound } from 'lucide-react';
import { toast } from '../umumiy/ui/Toast';
import GoogleKirish, { type GoogleNatija } from './GoogleKirish';
import { EmailKodKirish, type EmailKirishNatija } from './EmailKodKirish';
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
  
  /* Login-parol bilan kirish — ikkinchi darajali usul (asosiysi: email kod va Google). */
  const [parolOchiq, setParolOchiq] = useState(false);

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

  /* Email kod (egasi 2026-10-26): hisob bo'lmasa server o'zi ochadi — yangi → Tokenlar, mavjud → rol sahifasi. */
  const emailNatija = (n: EmailKirishNatija) => {
    if (n.yangi) {
      toast(n.demo ? 'Xush kelibsiz! Bepul tokenlar va demo obyekt tayyor.' : 'Xush kelibsiz! Bepul tokenlar hisobingizda.', 'ok');
      navigate('/admin/tokenlar');
    } else navigate(MAVJUD_FOYDALANUVCHI_KIRISH);
  };

  const parolMaydoni = useRef<HTMLInputElement>(null);

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
                <p className="entry-auth-note">{t('Email yoki Google orqali — parol shart emas. Hisobingiz bo‘lmasa, avtomatik ochiladi.')}</p>

                <div className="entry-auth-google"><GoogleKirish matn="signin_with" onNatija={googleNatija} onBoshlandi={googleBoshlandi} /></div>
                <EmailKodKirish onKirdi={emailNatija} onXizmatYoq={() => setParolOchiq(true)} />

                <button type="button" className="entry-auth-alt" aria-expanded={parolOchiq} aria-controls="entry-parol-forma" onClick={() => { setParolOchiq((v) => !v); setError(''); }}>
                  <KeyRound size={15} aria-hidden="true" /> {t('Login va parol bilan kirish')}
                </button>
                <div id="entry-parol-forma" hidden={!parolOchiq}>
                <form onSubmit={handleLogin} className="entry-auth-form">
                  <div className="entry-field">
                    <label htmlFor="entry-login">{t('Login yoki email')}</label>
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
                <p className="entry-auth-note">{t('1 daqiqada hisob oching: emailingizga kod keladi — parol o‘ylab topish shart emas. Bepul tokenlar bilan smeta import, F2 va hujjatlarni o‘zingiz sinab ko‘ring.')}</p>

                <div className="entry-auth-google"><GoogleKirish matn="signup_with" onNatija={googleNatija} onBoshlandi={googleBoshlandi} /></div>
                <EmailKodKirish royxat onKirdi={emailNatija} />

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
