/**
 * /tg — Telegram Mini App kirish nuqtasi (egasi 2026-10-28: «mini app shaklida ham ochib bera olishi kerak»).
 * Telegram imzolagan initData serverga yuboriladi (/api/telegram/miniapp) — imzo va muddat SERVERDA tekshiriladi;
 * bog'langan foydalanuvchiga oddiy sessiya beriladi va rol bosh sahifasi (/admin → RolBoshSahifa) ochiladi.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { t } from '../i18n/til';
import { initDataOl, tgMiniAppKirish, tgSignal, tgXato } from '../api/t2-telegram';

type Holat = { tur: 'kutish' } | { tur: 'tashqarida' } | { tur: 'ulanmagan' } | { tur: 'xato'; matn: string };

export default function TgKirish() {
  const nav = useNavigate();
  const [holat, setHolat] = useState<Holat>({ tur: 'kutish' });
  const [urinish, setUrinish] = useState(0);

  useEffect(() => {
    let tirik = true;
    tgSignal('web_app_ready'); tgSignal('web_app_expand');
    const initData = initDataOl();
    if (!initData) { setHolat({ tur: 'tashqarida' }); return; }
    void tgMiniAppKirish(initData).then((r) => {
      if (!tirik) return;
      if (r.ok) { nav('/admin', { replace: true }); return; }
      setHolat(r.code === 'ULANMAGAN' ? { tur: 'ulanmagan' } : { tur: 'xato', matn: t(tgXato(r)) });
    });
    return () => { tirik = false; };
  }, [nav, urinish]);

  return (
    <main className="min-h-screen bg-bg flex items-center justify-center p-4">
      <section className="fz-card p-5 w-full max-w-sm flex flex-col gap-3 text-center" aria-live="polite">
        <h1 className="text-lg font-semibold text-text m-0">{t('Smeta tizimi')}</h1>
        {holat.tur === 'kutish' && <p className="text-[13px] text-text-dim m-0">{t('Telegram orqali kirilmoqda…')}</p>}
        {holat.tur === 'tashqarida' && (
          <>
            <p className="text-[13px] text-text-dim m-0">{t('Bu sahifa Telegram ichida (@qur_uz_bot menyu tugmasi) ochiladi.')}</p>
            <a className="fz-btn fz-btn--primary" href="/">{t('Saytga kirish')}</a>
          </>
        )}
        {holat.tur === 'ulanmagan' && (
          <>
            <p className="text-[13px] text-text m-0">{t('Telegram hali hisobingizga ulanmagan.')}</p>
            <p className="text-[13px] text-text-dim m-0">{t('Saytga kiring → Akkaunt → Bildirishnomalar → «Telegramni ulash». Keyin bu oynani qayta oching.')}</p>
            <a className="fz-btn" href="/" target="_blank" rel="noopener noreferrer">{t('Saytni ochish')}</a>
          </>
        )}
        {holat.tur === 'xato' && (
          <>
            <p className="text-[13px] text-danger m-0">{holat.matn}</p>
            <button type="button" className="fz-btn" onClick={() => { setHolat({ tur: 'kutish' }); setUrinish((n) => n + 1); }}>{t('Qayta urinish')}</button>
          </>
        )}
      </section>
    </main>
  );
}
