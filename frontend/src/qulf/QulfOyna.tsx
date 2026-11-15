/** QULF oynasi: butun ekran qulf (kontent yashirin) YOKI tasdiq (step-up) oynasi. PIN klaviaturasi + biometrik tugma. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Delete, Fingerprint, Lock, ShieldCheck } from 'lucide-react';
import { t } from '../i18n/til';
import { passkeyKirish, qulfSoz } from './api';
import { pinBosh, pinOchir, pinRaqam, pinTayyor, PIN_MAX, type PinHolat } from './mantiq';

export type OynaRejim = 'qulf' | 'tasdiq';
type Props = {
  rejim: OynaRejim; pinBor: boolean; biometrik: boolean; usullar?: string[];
  onOchildi: () => void; onBekor?: () => void; onChiqish?: () => void;
};

const RAQAMLAR = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
const tugmaStil = { height: 56, borderRadius: 12, fontSize: 20, fontWeight: 600, cursor: 'pointer', color: 'var(--text)', background: 'var(--surface-2)', border: '1px solid var(--border)' } as const;

export function QulfOyna({ rejim, pinBor, biometrik, usullar, onOchildi, onBekor, onChiqish }: Props) {
  const [h, setH] = useState<PinHolat>(pinBosh());
  const [xabar, setXabar] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const bioRuxsat = biometrik && (!usullar || usullar.includes('passkey'));

  const yubor = useCallback(async (hh: PinHolat) => {
    if (!pinTayyor(hh)) return;
    setH({ ...hh, band: true }); setXabar(null);
    const r = await qulfSoz('pin_tekshir', { pin: hh.raqamlar });
    if (r.ok) { onOchildi(); return; }
    setH(pinBosh());
    if (r.code === 'QAYTA_KIRISH_KERAK') setXabar(t('Xavfsizlik uchun tizimga qayta kiring.'));
    else if (r.code === 'BLOKLANGAN') setXabar(t('Juda ko‘p urinish. 15 daqiqadan keyin urinib ko‘ring.'));
    else if (r.code === 'PIN_NOTOGRI') setXabar(t('PIN noto‘g‘ri'));
    else if (r.status === 401) setXabar(t('Sessiya tugagan. Tizimga qayta kiring.'));
    else setXabar(t('Aloqa yo‘q. Qayta urinib ko‘ring.'));
  }, [onOchildi]);

  const bio = useCallback(async () => {
    setXabar(null);
    const r = await passkeyKirish();
    if (r.ok) onOchildi();
    else if (r.code !== 'BEKOR') setXabar(t('Biometrik tasdiq o‘tmadi. PIN kiriting.'));
  }, [onOchildi]);

  /* Oyna ochilganda biometrikni darrov taklif qilamiz (foydalanuvchi PIN terishga majbur emas). */
  useEffect(() => { if (bioRuxsat) void bio(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  useEffect(() => { ref.current?.focus(); }, []);

  const klavish = (e: React.KeyboardEvent) => {
    if (/^\d$/.test(e.key)) { e.preventDefault(); setH((x) => pinRaqam(x, e.key)); }
    else if (e.key === 'Backspace') { e.preventDefault(); setH((x) => pinOchir(x)); }
    else if (e.key === 'Enter') { e.preventDefault(); void yubor(h); }
    else if (e.key === 'Escape' && rejim === 'tasdiq') onBekor?.();
  };

  const sarlavha = rejim === 'qulf' ? t('Ilova qulflangan') : t('Amalni tasdiqlang');
  const izoh = rejim === 'qulf' ? t('Davom etish uchun PIN kodni kiriting yoki biometrik bilan oching.')
    : t('Bu amal pul yoki imzoga tegishli. PIN yoki biometrik bilan tasdiqlang.');
  const Ikon = rejim === 'qulf' ? Lock : ShieldCheck;

  const oyna = (
    <div role="dialog" aria-modal="true" aria-label={sarlavha} data-qulf={rejim} onKeyDown={klavish} ref={ref} tabIndex={-1}
      style={{ position: 'fixed', inset: 0, zIndex: 2147483000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        background: rejim === 'qulf' ? 'var(--bg, #0B0E14)' : 'rgba(8,10,16,.72)', backdropFilter: 'blur(14px)', outline: 'none' }}>
      <div className="fz-card" style={{ width: 'min(100%, 340px)', padding: 20, display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center' }}>
        <Ikon size={28} aria-hidden="true" />
        <h2 style={{ margin: 0, fontSize: 18 }}>{sarlavha}</h2>
        <p style={{ margin: 0, fontSize: 13, textAlign: 'center', color: 'var(--text-dim)' }}>{izoh}</p>
        {pinBor && (
          <>
            <div role="status" aria-label={t('PIN kod')} style={{ display: 'flex', gap: 10, height: 18 }}>
              {Array.from({ length: PIN_MAX }).map((_, i) => (
                <span key={i} style={{ width: 12, height: 12, borderRadius: 6, border: '1px solid var(--border-strong, #555)', background: i < h.raqamlar.length ? 'var(--accent, #4f8cff)' : 'transparent' }} />
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, width: '100%' }}>
              {RAQAMLAR.map((d) => <button key={d} type="button" style={tugmaStil} disabled={h.band} onClick={() => setH((x) => pinRaqam(x, d))}>{d}</button>)}
              <button type="button" style={tugmaStil} aria-label={t('O‘chirish')} disabled={h.band} onClick={() => setH((x) => pinOchir(x))}><Delete size={18} aria-hidden="true" /></button>
              <button type="button" style={tugmaStil} disabled={h.band} onClick={() => setH((x) => pinRaqam(x, '0'))}>0</button>
              <button type="button" style={{ ...tugmaStil, background: 'var(--accent, #4f8cff)', color: '#fff' }} disabled={!pinTayyor(h)} onClick={() => void yubor(h)}>{h.band ? t('Tekshirilmoqda…') : t('Tasdiqlash')}</button>
            </div>
          </>
        )}
        {bioRuxsat && (
          <button type="button" onClick={() => void bio()} className="fz-btn" style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center', width: '100%', height: 44, cursor: 'pointer' }}>
            <Fingerprint size={18} aria-hidden="true" /> {t('Biometrik bilan ochish')}
          </button>
        )}
        {xabar && <div role="alert" style={{ color: 'var(--danger, #ef4444)', fontSize: 13, textAlign: 'center' }}>{xabar}</div>}
        <div style={{ display: 'flex', gap: 12 }}>
          {rejim === 'tasdiq' && <button type="button" onClick={onBekor} style={{ cursor: 'pointer', background: 'none', border: 0, color: 'var(--text-dim)', fontSize: 13 }}>{t('Bekor qilish')}</button>}
          {rejim === 'qulf' && <button type="button" onClick={onChiqish} style={{ cursor: 'pointer', background: 'none', border: 0, color: 'var(--text-dim)', fontSize: 13 }}>{t('Chiqish')}</button>}
        </div>
      </div>
    </div>
  );
  return createPortal(oyna, document.body);
}
