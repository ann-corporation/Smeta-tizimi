import { useState, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, EyeOff, Lock, User, ArrowRight, Phone, Send, Mail } from 'lucide-react';
import { toast } from '../umumiy/ui/Toast';
import GoogleKirish, { type GoogleNatija } from './GoogleKirish';
import { EmailKodKirish, type EmailKirishNatija } from './EmailKodKirish';
import { TelegramKirish, type TelegramNatija } from './TelegramKirish';
import { telefonNiqob } from '../lib/telefon-niqob';
import { t } from '../i18n/til';
import { PublicEntry } from '../components/public-entry/PublicEntry';
import { kutilayotganTaklifKodi } from './QoshilSahifa';
import { kutilayotganUlashKodi } from './UlashSahifa';
import { MAVJUD_FOYDALANUVCHI_KIRISH, YANGI_HISOB_KIRISH } from '../lib/nav/boshSahifa';
import { holatdanQaytish, qaytishOlibTozalash, qaytishSaqla } from '../lib/nav/qaytish';

export default function KirishSahifa() {
  const [isLogin, setIsLogin] = useState(true);

  // Login form state
  const [login, setLogin] = useState('');
  const [parol, setParol] = useState('');
  const [parolKor, setParolKor] = useState(false);
  
  /* Login-parol bilan kirish — ikkinchi darajali usul (asosiysi: email kod va Google). */
  const [usul, setUsul] = useState<'email' | 'parol' | 'telegram'>('email');
  const parolOchiq = usul === 'parol';
  /* Telegram tugmasi FAQAT server yoqqanda (KIRISH_TELEGRAM_YOQILGAN + bot sozlangan) ko'rinadi — o'chiqligida chalg'itmaydi. */
  const [tgYoqilgan, setTgYoqilgan] = useState(false);
  useEffect(() => {
    let tirik = true;
    try { void fetch('/api/kirish-telegram').then((r) => r.json()).then((j: { yoqilgan?: boolean }) => { if (tirik && j?.yoqilgan === true) setTgYoqilgan(true); }).catch(() => undefined); } catch { /* tarmoq yo'q */ }
    return () => { tirik = false; };
  }, []);

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigateAsl = useNavigate();
  /* Kirishdagi niyat: ommaviy sahifadagi amal tugmasi (`state.qaytish`) — kirgach o'sha ichki manzilga qaytariladi.
     sessionStorage ga ham yoziladi (sahifa qayta yuklansa / kirish boshqa oynadan qaytsa yo'qolmasin). Faqat ichki yo'l (lib/nav/qaytish). */
  const niyat = holatdanQaytish(useLocation().state);
  useEffect(() => { if (niyat) qaytishSaqla(niyat); }, [niyat]);
  /* Allaqachon tizimda bo'lgan foydalanuvchi (navigatsiya oqimi): «Tizimga kirish» formaga siljitmaydi — bevosita rol/oxirgi obyekt sahifasiga olib boradi. */
  const [kirgan, setKirgan] = useState(false);
  useEffect(() => {
    let tirik = true;
    try {
      void fetch('/api/sessiya').then((r) => {
        if (!tirik || !r.ok) return;
        setKirgan(true);
        /* Allaqachon kirgan odam amal tugmasini bosgan (niyat shu o'tishda kelgan) — formani ko'rsatmay o'sha manzilga. */
        if (niyat) { qaytishOlibTozalash(); navigateAsl(niyat, { replace: true }); }
      }).catch(() => undefined);
    } catch { /* tarmoq yo'q */ }
    return () => { tirik = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- faqat birinchi ochilishda: niyat shu o'tishning holatidan olinadi
  }, []);
  /* «Telegram modeli» (2026-10-22): taklif havolasidan kelgan odam kirgach/ro'yxatdan o'tgach o'sha havolaga qaytadi.
     Ustuvorlik: taklif kodi → ulash kodi → kirishdagi niyat (qaytish) → sukut manzil. Niyat bir marta ishlatiladi. */
  const navigate = (yol: string) => {
    const kod = kutilayotganTaklifKodi(), ulash = kutilayotganUlashKodi();
    const qaytish = qaytishOlibTozalash() ?? niyat;
    navigateAsl(kod ? `/qoshil/${encodeURIComponent(kod)}` : ulash ? `/ulash/${encodeURIComponent(ulash)}` : qaytish ?? yol);
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

  /* Email kod (egasi 2026-10-26): hisob bo'lmasa server o'zi ochadi — yangi → «Kompaniyangizni oching» (o'zi ochadi, #404), mavjud → rol sahifasi. */
  const emailNatija = (n: EmailKirishNatija) => {
    if (n.yangi) {
      toast('Xush kelibsiz! Hisobingiz tayyor. Keyingi qadam: kompaniyangizni o‘zingiz oching yoki direktordan taklif oling.', 'ok');
      navigate(YANGI_HISOB_KIRISH);
    } else navigate(MAVJUD_FOYDALANUVCHI_KIRISH);
  };

  /* Telegram orqali (telefon kontakti bilan tasdiqlangan): yangi hisob -> «Kompaniyangizni oching», mavjud -> rol sahifasi. */
  const telegramNatija = (n: TelegramNatija) => {
    if (n.yangi) { toast('Xush kelibsiz! Hisobingiz tayyor. Keyingi qadam: kompaniyangizni o‘zingiz oching yoki direktordan taklif oling.', 'ok'); navigate(YANGI_HISOB_KIRISH); }
    else navigate(MAVJUD_FOYDALANUVCHI_KIRISH);
  };

  const parolMaydoni = useRef<HTMLInputElement>(null);

  /* Google bilan kirish (egasi 2026-10-02): yangi hisob → «Kompaniyangizni oching»; mavjud hisob → odatdagi rol sahifasi. */
  const googleNatija = (n: GoogleNatija) => {
    setLoading(false);
    if (!n.ok) { setError(n.xato); return; }
    if (n.yangi) {
      toast('Xush kelibsiz! Hisobingiz tayyor. Keyingi qadam: kompaniyangizni o‘zingiz oching yoki direktordan taklif oling.', 'ok');
      navigate(YANGI_HISOB_KIRISH);
    } else {
      if (n.ulandi) toast('Google kirish usuli akkauntingizga qo‘shildi.', 'ok');
      navigate(MAVJUD_FOYDALANUVCHI_KIRISH);
    }
  };
  const googleBoshlandi = () => { setError(''); setLoading(true); };


  const field = 'entry-input';
  return (
    <PublicEntry kirgan={kirgan} onOpenApp={() => navigate(MAVJUD_FOYDALANUVCHI_KIRISH)} onChooseAuth={(mode) => { setIsLogin(mode === "login"); setError(""); }}>
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

                {/* Uch aniq yo'l (emailsiz kirish, 2026-11-13): telefon+parol | Telegram | email kod (Google — sozlangan bo'lsa, email panelida). */}
                <div className="entry-auth-tiles" role="group" aria-label={t('Kirish usuli')} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8, margin: '12px 0' }}>
                  {([
                    ['parol', t('Telefon va parol'), <Phone key="p" size={18} aria-hidden="true" />],
                    ...(tgYoqilgan ? [['telegram', t('Telegram orqali'), <Send key="t" size={18} aria-hidden="true" />] as const] : []),
                    ['email', t('Email kod'), <Mail key="e" size={18} aria-hidden="true" />],
                  ] as const).map(([k, nom, ikon]) => (
                    <button key={k} type="button" className="entry-auth-alt" aria-pressed={usul === k} aria-expanded={usul === k}
                      aria-controls={k === 'parol' ? 'entry-parol-forma' : `entry-usul-${k}`}
                      style={{ minHeight: 64, flexDirection: 'column', gap: 4, justifyContent: 'center', fontWeight: usul === k ? 700 : 500, outline: usul === k ? '2px solid currentColor' : undefined }}
                      onClick={() => { setUsul(k); setError(''); }}>
                      {ikon}<span>{nom}</span>
                    </button>
                  ))}
                </div>
                <div id="entry-usul-email" hidden={usul !== 'email'}>
                  <div className="entry-auth-google"><GoogleKirish matn="signin_with" onNatija={googleNatija} onBoshlandi={googleBoshlandi} /></div>
                  <EmailKodKirish onKirdi={emailNatija} onXizmatYoq={() => setUsul('parol')} />
                </div>
                <div id="entry-usul-telegram" hidden={usul !== 'telegram'}>
                  {usul === 'telegram' && <TelegramKirish ismKerak onKirdi={telegramNatija} />}
                </div>
                <div id="entry-parol-forma" hidden={!parolOchiq}>
                <form onSubmit={handleLogin} className="entry-auth-form">
                  <div className="entry-field">
                    <label htmlFor="entry-login">{t('Telefon, login yoki email')}</label>
                    <div className="entry-input-wrap">
                      <User aria-hidden="true" size={17} />
                      <input
                        type="text"
                        id="entry-login"
                        autoComplete="username"
                        value={login}
                        onChange={e => { const v = e.target.value; setLogin(/^\+?[\d\s()-]+$/.test(v) && /\d/.test(v) ? telefonNiqob(v) : v); }}
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
                {tgYoqilgan && <details className="entry-auth-foot">
                  <summary>{t('Emailingiz yo‘qmi? Telegram orqali ro‘yxatdan o‘ting')}</summary>
                  <TelegramKirish ismKerak onKirdi={telegramNatija} />
                </details>}

                <p className="entry-auth-foot">
                  {t('Bepul tarif: 300 token. Har hujjat narxi «Tokenlar» bo‘limidagi narx jadvalida. Keyin tarifni «Tokenlar va obuna» bo‘limida tanlaysiz.')}
                </p>
              </motion.div>
            )}
          </div>
        </div>
    </PublicEntry>
  );
}
