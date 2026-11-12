/**
 * «Telegram orqali kirish» (emailsiz, bepul): server nonce + brauzer siri beradi; foydalanuvchi botda O'Z kontaktini yuboradi;
 * brauzer so'rab turadi va oddiy sessiya cookie oladi. `sir` faqat shu brauzerning sessionStorage'ida (havolada yo'q).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { t } from '../i18n/til';
import { telegramBoshla, telegramHolat } from '../api/kirish-taklif';

export type TelegramNatija = { yangi: boolean };
type Holat = { nonce: string; sir: string; belgi: string; havola: string; tugaydi: number };
const KALIT = 'kirish_tg_holat';
const XATO: Record<string, string> = {
  YOQILMAGAN: 'Telegram orqali kirish hali yoqilmagan.', SOZLANMAGAN: 'Telegram bot hali sozlanmagan.', LIMIT: 'Juda ko‘p urinish. Birozdan keyin qayta urinib ko‘ring.',
  MUDDATI_OTGAN: 'Muddat tugadi. Qaytadan boshlang.', KIRISH_RAD: 'Bu raqam bilan Telegram orqali kirib bo‘lmadi. Boshqa usulni tanlang.', TOPILMADI: 'So‘rov topilmadi yoki eskirgan. Qaytadan boshlang.',
};

const saqla = (h: Holat | null) => { try { if (h) sessionStorage.setItem(KALIT, JSON.stringify(h)); else sessionStorage.removeItem(KALIT); } catch { /* maxfiy rejim */ } };
const oqi = (): Holat | null => {
  try {
    const h = JSON.parse(sessionStorage.getItem(KALIT) || 'null') as Holat | null;
    return h && h.tugaydi > Date.now() && h.nonce && h.sir ? h : null;
  } catch { return null; }
};

export function TelegramKirish({ onKirdi, ismKerak = false }: { onKirdi: (n: TelegramNatija) => void; ismKerak?: boolean }) {
  const [ism, setIsm] = useState('');
  const [h, setH] = useState<Holat | null>(() => oqi());
  const [xato, setXato] = useState('');
  const [band, setBand] = useState(false);
  const tugadi = useRef(false);

  const boshla = async () => {
    setBand(true); setXato('');
    const r = await telegramBoshla(ism.trim());
    setBand(false);
    if (!r.ok || !r.nonce || !r.sir || !r.havola || !r.belgi) { setXato(t(XATO[r.code || ''] ?? r.xabar ?? 'Boshlab bo‘lmadi. Qayta urinib ko‘ring.')); return; }
    const yangi: Holat = { nonce: r.nonce, sir: r.sir, belgi: r.belgi, havola: r.havola, tugaydi: Date.now() + 5 * 60_000 };
    saqla(yangi); setH(yangi);
  };

  const sora = useCallback(async (x: Holat) => {
    const r = await telegramHolat(x.nonce, x.sir);
    if (tugadi.current) return;
    if (r.ok && r.holat === 'tayyor') { tugadi.current = true; saqla(null); onKirdi({ yangi: !!r.yangi }); return; }
    if (!r.ok && r.code !== 'SERVER_XATO' && r.code !== 'TARMOQ') {
      tugadi.current = true; saqla(null); setH(null); setXato(t(XATO[r.code || ''] ?? 'Kirib bo‘lmadi. Qaytadan boshlang.'));
    }
  }, [onKirdi]);

  useEffect(() => {
    if (!h) return;
    tugadi.current = false;
    const id = window.setInterval(() => {
      if (Date.now() > h.tugaydi) { tugadi.current = true; saqla(null); setH(null); setXato(t(XATO.MUDDATI_OTGAN)); window.clearInterval(id); return; }
      void sora(h);
    }, 2500);
    return () => { tugadi.current = true; window.clearInterval(id); };
  }, [h, sora]);

  if (h) {
    return (
      <div className="entry-auth-form" role="status" aria-live="polite">
        <p className="entry-auth-note">{t('1) Telegramni oching. 2) Botda ko‘rsatilgan raqam saytdagi bilan bir xil ekanini tekshiring. 3) «Raqamimni yuborish» tugmasini bosing.')}</p>
        <p className="entry-auth-note" style={{ textAlign: 'center' }}>{t('Moslik raqami')}: <strong style={{ fontSize: 28, letterSpacing: 6 }} data-testid="tg-belgi">{h.belgi}</strong></p>
        <a className="entry-auth-submit" href={h.havola} target="_blank" rel="noreferrer noopener" style={{ textAlign: 'center', textDecoration: 'none' }}>
          <Send size={16} aria-hidden="true" /> {t('Telegramni ochish')}
        </a>
        <p className="entry-auth-note"><Loader2 size={13} className="animate-spin" aria-hidden="true" style={{ display: 'inline' }} /> {t('Tasdiq kutilmoqda… (5 daqiqa)')}</p>
        <button type="button" className="entry-auth-alt" onClick={() => { tugadi.current = true; saqla(null); setH(null); }}>{t('Bekor qilish')}</button>
      </div>
    );
  }
  return (
    <div className="entry-auth-form">
      <p className="entry-auth-note">{t('Email shart emas: telefon raqamingiz Telegramdagi o‘z kontaktingiz orqali tasdiqlanadi. Bepul.')}</p>
      {ismKerak && <div className="entry-field">
        <label htmlFor="entry-tg-ism">{t('Ismingiz (yangi hisob uchun)')}</label>
        <div className="entry-input-wrap"><input id="entry-tg-ism" className="entry-input" autoComplete="name" value={ism} maxLength={120} onChange={(e) => setIsm(e.target.value)} placeholder={t('Ism va familiya')} /></div>
      </div>}
      {xato && <div className="entry-auth-error" role="alert">{xato}</div>}
      <button type="button" className="entry-auth-submit" disabled={band} onClick={() => void boshla()}>
        {band ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Send size={16} aria-hidden="true" />} {t('Telegram orqali kirish')}
      </button>
    </div>
  );
}
