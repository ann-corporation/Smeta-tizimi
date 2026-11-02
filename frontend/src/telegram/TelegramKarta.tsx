/**
 * Telegram kanali (egasi 2026-10-28): «Telegramni ulash» — server bir martalik kod (10 daqiqa, bazada xesh) yaratadi,
 * t.me/qur_uz_bot?start=<kod> havolasi ochiladi, bot hisobni bog'laydi. Uzish — shu yerdan yoki botda /chiqish.
 * Bildirishnoma — foydalanuvchining o'z roziligi (opt-in). Ulangach holat avtomatik yangilanadi.
 */
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { t } from '../i18n/til';
import { tgHolatOl, tgKodOl, tgSozlama, tgUz, tgXato } from '../api/t2-telegram';
import { tasdiqSora } from '../umumiy/ui/Tasdiq';
import { toast } from '../umumiy/ui/Toast';
import { Nota, Qator } from '../components/akkaunt/AkkauntUi';

const KALIT = ['telegram-holat'];

export function TelegramKarta() {
  const qc = useQueryClient();
  const [havola, setHavola] = useState<string | null>(null);
  const [band, setBand] = useState(false);
  const q = useQuery({ queryKey: KALIT, queryFn: tgHolatOl, refetchInterval: havola ? 3000 : false, staleTime: 10_000 });
  const d = q.data;

  /* Havola berilgach ulanish kutiladi (3 s da bir); ulangach havola yopiladi. 10 daqiqadan keyin kutish to'xtaydi. */
  useEffect(() => { if (d?.ulangan && havola) { setHavola(null); toast(t('Telegram ulandi.')); } }, [d?.ulangan, havola]);
  useEffect(() => { if (!havola) return; const id = setTimeout(() => setHavola(null), 10 * 60_000); return () => clearTimeout(id); }, [havola]);

  async function ulash() {
    setBand(true);
    const r = await tgKodOl();
    setBand(false);
    if (!r.ok || !r.havola) { toast(t(tgXato(r)), 'danger'); return; }
    setHavola(r.havola);
    window.open(r.havola, '_blank', 'noopener,noreferrer');
  }
  async function uzish() {
    if (!await tasdiqSora({ sarlavha: 'Telegramni uzish', matn: 'Telegram hisobingiz tizimdan uziladi va xabarlar kelmaydi. Davom etasizmi?', xavfli: true })) return;
    setBand(true);
    const r = await tgUz();
    setBand(false);
    if (!r.ok) { toast(t(tgXato(r)), 'danger'); return; }
    await qc.invalidateQueries({ queryKey: KALIT });
  }
  async function sozla(kalit: string, qiymat: boolean) {
    const r = await tgSozlama({ [kalit]: qiymat });
    if (!r.ok) { toast(t(tgXato(r)), 'danger'); return; }
    await qc.invalidateQueries({ queryKey: KALIT });
  }

  if (q.isLoading) return <Qator yorliq="Telegram" qiymat={<span className="fz-chip">…</span>} />;
  if (!d?.ok) return <Qator yorliq="Telegram" qiymat={<span className="fz-chip">{t('Holatni o‘qib bo‘lmadi')}</span>} />;
  if (!d.sozlangan && !d.ulangan) return (
    <>
      <Qator yorliq="Telegram" qiymat={<span className="fz-chip">{t('Ulanmagan')}</span>} />
      <Nota tur="info">{t('Telegram bot hali sozlanmagan. Administratorga xabar bering.')}</Nota>
    </>
  );
  return (
    <div className="flex flex-col gap-2">
      <Qator yorliq="Telegram" qiymat={d.ulangan
        ? <span className="fz-chip fz-chip--accent">{t('Ulangan')} · @{d.bot}</span>
        : <span className="fz-chip">{t('Ulanmagan')}</span>} />
      {!d.ulangan && (
        <div className="flex flex-col gap-2">
          <button type="button" className="fz-btn fz-btn--primary fz-btn--sm self-start" disabled={band} onClick={() => { void ulash(); }}>
            {t('Telegramni ulash')}
          </button>
          {havola && (
            <Nota tur="info">
              {t('Telegram ochildi. Botda «Start» tugmasini bosing — ulanish shu yerda avtomatik ko‘rinadi. Havola 10 daqiqa amal qiladi va bir marta ishlaydi.')}{' '}
              <a href={havola} target="_blank" rel="noopener noreferrer" className="underline">{t('Havolani qayta ochish')}</a>
            </Nota>
          )}
        </div>
      )}
      {d.ulangan && (
        <>
          <label className="flex items-center gap-2 text-[13px] text-text cursor-pointer">
            <input type="checkbox" checked={d.bildirishnoma?.topshiriq !== false} onChange={(e) => { void sozla('topshiriq', e.target.checked); }} />
            {t('Yangi topshiriqlar haqida Telegramda xabar berish')}
          </label>
          <button type="button" className="fz-btn fz-btn--sm self-start" disabled={band} onClick={() => { void uzish(); }}>{t('Telegramni uzish')}</button>
        </>
      )}
    </div>
  );
}
