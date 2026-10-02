import { useState, useRef, Suspense, lazy } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, EyeOff, ShieldCheck, Lock, User, ArrowRight, Building2, FlaskConical, Mail, Phone } from 'lucide-react';
import { toast } from '../umumiy/ui/Toast';
import GoogleKirish, { type GoogleNatija } from './GoogleKirish';
import { t } from '../i18n/til';
import { TilTanlagich } from '../i18n/TilTanlagich';

const Sahna3D = lazy(() => import('./Sahna3D'));

export default function KirishSahifa() {
  const [isLogin, setIsLogin] = useState(true);

  // Login form state
  const [login, setLogin] = useState('');
  const [parol, setParol] = useState('');
  
  // Register form state
  const [regKompaniya, setRegKompaniya] = useState('');
  const [regLogin, setRegLogin] = useState('');
  const [regParol, setRegParol] = useState('');
  const [regParolKor, setRegParolKor] = useState(false);
  const regOpId = useRef<string>(crypto.randomUUID());
  const [regIsm, setRegIsm] = useState('');
  const [regTelefon, setRegTelefon] = useState('');
  
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const [uch_D, setUch_D] = useState(() => localStorage.getItem('uchD') !== 'off');

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
        if (['admin', 'superadmin', 'bugalter', 'pto', 'prorab'].includes(data.rol)) {
          navigate('/admin/test/obyektlar');
        } else if (['boss', 'rahbar'].includes(data.rol)) {
          navigate('/boss');
        }
      } else {
        setError(data.xato || 'Xato yuz berdi');
      }
    } catch (err: any) {
      setError(err.message);
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
    // Egasi sinovi 2026-10-02: odamlar login o'rniga email yozadi — email ham login bo'la oladi.
    if (!/^[a-z0-9][a-z0-9_.@+-]{2,79}$/.test(l) || (l.match(/@/g)?.length ?? 0) > 1) { setError('Login yoki email: lotin harf, raqam, _ . - @ (3–80 belgi)'); return; }
    if (regParol.length < 8) { setError('Parol kamida 8 belgi'); return; }
    setLoading(true);
    setError('');
    try {
      const r = await fetch('/api/royxat-ozi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login: l, parol: regParol, ism: regIsm.trim(), telefon: regTelefon.trim(), kompaniya: regKompaniya.trim(), operation_id: regOpId.current }),
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
    } catch (err: any) {
      setError(err.message || 'Tarmoq xatosi');
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
    } else if (['boss', 'rahbar'].includes(n.rol)) navigate('/boss');
    else navigate('/admin/test/obyektlar');
  };
  const googleBoshlandi = () => { setError(''); setLoading(true); };

  const handleBossLogin = () => loginniToldir('boss');
  const handleSuperadminLogin = () => loginniToldir('Anvar');

  return (
    <div className="flex w-full h-screen overflow-hidden bg-[#020617] text-white">
      
      {/* LEFT SIDE: Visual & Branding */}
      <div className="relative hidden lg:flex flex-1 items-center justify-center overflow-hidden border-r border-white/10">
        
        {/* 3D Background */}
        {uch_D && (
          <div className="absolute inset-0 z-0">
            <Suspense fallback={<div className="w-full h-full bg-gradient-to-br from-[#020617] to-indigo-950 opacity-50" />}>
              <Sahna3D />
            </Suspense>
          </div>
        )}
        
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/40 via-black/40 to-[#020617]/80 z-10 pointer-events-none" />
        <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10 z-10 pointer-events-none" />

        <div className="relative z-20 flex flex-col p-12 w-full h-full justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center shadow-[0_0_20px_rgba(99,102,241,0.3)]">
              <Building2 className="text-indigo-400" size={24} />
            </div>
            <span className="text-xl font-bold tracking-widest text-white">SMETA OS<span className="text-indigo-500">.</span></span>
          </div>

          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="max-w-xl"
          >
            <h1 className="text-5xl font-extrabold text-white leading-tight mb-6 tracking-tight">
              Qurilishni <br/><span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400">Raqamli Boshqaring</span>
            </h1>
            <p className="text-zinc-400 text-lg leading-relaxed mb-8">
              Barcha loyihalar, smetalar, va pudratchilarni bir joyda nazorat qiling. O'zbekistonning eng ilg'or SaaS platformasi.
            </p>
            
            <div className="flex flex-wrap items-center gap-4 text-sm font-medium text-zinc-300">
              <div className="flex items-center gap-2 bg-white/5 rounded-full px-4 py-2 border border-white/10 backdrop-blur-md">
                <ShieldCheck size={16} className="text-emerald-400" />
                Bitcoin-level himoya
              </div>
              <div className="flex items-center gap-2 bg-white/5 rounded-full px-4 py-2 border border-white/10 backdrop-blur-md">
                <FlaskConical size={16} className="text-indigo-400" />
                SaaS Multi-Tenant
              </div>
            </div>
          </motion.div>
          
          <div className="text-zinc-500 text-sm font-medium flex justify-between items-center w-full pr-12">
            <span>© 2026 O'zbekiston. Barcha huquqlar himoyalangan.</span>
            
            <button
              onClick={() => {
                const newVal = !uch_D;
                setUch_D(newVal);
                localStorage.setItem('uchD', newVal ? 'on' : 'off');
              }}
              className="flex items-center gap-2 px-3 py-1.5 bg-white/5 backdrop-blur border border-white/10 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              {uch_D ? <Eye size={14} /> : <EyeOff size={14} />}
              <span>3D Fon: {uch_D ? 'ON' : 'OFF'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* RIGHT SIDE: Login / Register Form */}
      <div className="w-full lg:w-[480px] xl:w-[560px] flex flex-col justify-center items-center p-8 sm:p-12 xl:p-16 bg-[#020617] relative z-20 overflow-y-auto custom-scrollbar">
        
        <div className="w-full max-w-sm py-8">
          <div className="lg:hidden flex items-center gap-3 mb-10">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center">
              <Building2 className="text-indigo-400" size={24} />
            </div>
            <span className="text-xl font-bold tracking-widest text-white">SMETA OS<span className="text-indigo-500">.</span></span>
          </div>

          <div className="mb-3 flex justify-end"><TilTanlagich /></div>
          <div className="flex bg-[#0a0f1d] border border-white/10 p-1 rounded-xl mb-8">
            <button 
              onClick={() => { setIsLogin(true); setError(''); }}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${isLogin ? 'bg-indigo-600 text-white shadow-lg' : 'text-zinc-400 hover:text-white'}`}
            >
              {t('Kirish')}
            </button>
            <button 
              onClick={() => { setIsLogin(false); setError(''); }}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${!isLogin ? 'bg-indigo-600 text-white shadow-lg' : 'text-zinc-400 hover:text-white'}`}
            >
              {t("Ro'yxatdan o'tish")}
            </button>
          </div>

          <AnimatePresence mode="wait">
            {isLogin ? (
              <motion.div
                key="login"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ duration: 0.2 }}
              >
                <h2 className="text-2xl font-bold text-white mb-2">{t('Tizimga kirish')}</h2>
                <p className="text-zinc-400 text-sm mb-8">{t("O'z hisob ma'lumotlaringizni kiriting")}</p>

                <div className="mb-5"><GoogleKirish matn="signin_with" onNatija={googleNatija} onBoshlandi={googleBoshlandi} /></div>
                <form onSubmit={handleLogin} className="flex flex-col gap-5">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-zinc-300">{t('Login')}</label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
                      <input
                        type="text"
                        value={login}
                        onChange={e => setLogin(e.target.value)}
                        className="w-full bg-[#0a0f1d] border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all placeholder:text-zinc-600"
                        placeholder="foydalanuvchi_nomi"
                        autoFocus
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-zinc-300">{t('Parol')}</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
                      <input
                        ref={parolMaydoni}
                        type="password"
                        value={parol}
                        onChange={e => setParol(e.target.value)}
                        className="w-full bg-[#0a0f1d] border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all placeholder:text-zinc-600"
                        placeholder="••••••••"
                      />
                    </div>
                  </div>
                  
                  <AnimatePresence>
                    {error && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-400 text-sm">
                          {t(error)}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <button
                    type="submit"
                    disabled={loading || !login || !parol}
                    className="w-full bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl py-3 font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2 mt-2 shadow-[0_4px_14px_0_rgba(79,70,229,0.39)]"
                  >
                    {loading ? 'Текширилмоқда...' : (
                      <>Kirish <ArrowRight size={18} /></>
                    )}
                  </button>
                </form>

                <div className="flex items-center gap-4 my-8">
                  <div className="flex-1 h-px bg-white/10"></div>
                  <span className="text-zinc-500 text-xs font-medium uppercase tracking-widest">{t('Tezkor')}</span>
                  <div className="flex-1 h-px bg-white/10"></div>
                </div>

                <div className="flex flex-col gap-3">
                  <button
                    type="button"
                    onClick={handleSuperadminLogin}
                    disabled={loading}
                    className="w-full bg-indigo-600/10 border border-indigo-500/30 hover:bg-indigo-600/20 text-indigo-400 rounded-xl py-3 text-sm font-semibold transition-all disabled:opacity-50 flex justify-center items-center gap-2 group"
                  >
                    <ShieldCheck size={18} className="group-hover:scale-110 transition-transform" />
                    Anvar (Superadmin)
                  </button>

                  <button
                    type="button"
                    onClick={handleBossLogin}
                    disabled={loading}
                    className="w-full bg-white/5 border border-white/10 hover:bg-white/10 text-zinc-300 rounded-xl py-3 text-sm font-medium transition-all disabled:opacity-50"
                  >
                    Раҳбар кириши (Сводка)
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
                <h2 className="text-2xl font-bold text-white mb-2">{t("Bepul sinab ko'rish")}</h2>
                <p className="text-zinc-400 text-sm mb-6">{t("1 daqiqada hisob oching — bepul tokenlar bilan smeta import, F2 va hujjatlarni o'zingiz sinab ko'ring. Operator kutish shart emas.")}</p>

                <div className="mb-4"><GoogleKirish matn="signup_with" onNatija={googleNatija} onBoshlandi={googleBoshlandi} /></div>
                <form onSubmit={handleRegister} className="flex flex-col gap-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-zinc-300">{t('Ismingiz')}</label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
                      <input type="text" autoComplete="name" required value={regIsm} onChange={e => setRegIsm(e.target.value)} placeholder="F.I.Sh."
                        className="w-full bg-[#0a0f1d] border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all placeholder:text-zinc-600"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-zinc-300">{t('Telefon')} <span className="text-zinc-500">{t('(ixtiyoriy)')}</span></label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
                      <input type="tel" autoComplete="tel" value={regTelefon} onChange={e => setRegTelefon(e.target.value)} placeholder="+998"
                        className="w-full bg-[#0a0f1d] border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all placeholder:text-zinc-600"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-zinc-300">{t('Kompaniya')} <span className="text-zinc-500">{t('(ixtiyoriy)')}</span></label>
                    <div className="relative">
                      <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
                      <input type="text" autoComplete="organization" value={regKompaniya} onChange={e => setRegKompaniya(e.target.value)} placeholder="MChJ / XK nomi"
                        className="w-full bg-[#0a0f1d] border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all placeholder:text-zinc-600"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-zinc-300">{t('Login yoki email')}</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
                      <input type="text" autoComplete="username" required value={regLogin} onChange={e => setRegLogin(e.target.value.toLowerCase())} placeholder="aziz.pto yoki aziz@mail.uz"
                        className="w-full bg-[#0a0f1d] border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all placeholder:text-zinc-600"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-zinc-300">{t('Parol')} <span className="text-zinc-500">{t('(kamida 8 belgi)')}</span></label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
                      <input type={regParolKor ? 'text' : 'password'} autoComplete="new-password" required minLength={8} value={regParol} onChange={e => setRegParol(e.target.value)}
                        className="w-full bg-[#0a0f1d] border border-white/10 rounded-xl pl-10 pr-10 py-2.5 text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all placeholder:text-zinc-600"
                      />
                      <button type="button" onClick={() => setRegParolKor(v => !v)} aria-label={regParolKor ? 'Parolni yashirish' : 'Parolni ko‘rsatish'} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300">
                        {regParolKor ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>
                  
                  <AnimatePresence>
                    {error && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-400 text-sm">
                          {t(error)}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl py-3 font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2 mt-2 shadow-[0_4px_14px_0_rgba(16,185,129,0.39)]"
                  >
                    {loading ? t('Hisob ochilmoqda...') : t('Hisob ochish va bepul sinash')}
                  </button>
                </form>
                
                <p className="text-xs text-zinc-500 text-center mt-6">
                  Bepul tarif: 300 token (≈150 ta F2 hujjati). Keyin tarifni «Tokenlar va obuna» bo'limida tanlaysiz.
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
