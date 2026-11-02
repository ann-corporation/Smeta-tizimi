/**
 * Tizim xaritasi ko'rish ruxsatlari — FAQAT superadmin (server ham tekshiradi: /api/boshqaruv + `_t2_boshqaruv_tekshir`).
 * Ro'yxat, foydalanuvchini qidirib ruxsat berish, ruxsatni olish. Har amal auditga yoziladi (bazada).
 */
import { useCallback, useEffect, useState } from 'react';
import { Search, UserPlus, UserMinus } from 'lucide-react';
import type { BFoydalanuvchi } from '../../../api/t2-boshqaruv';
import {
  tizimFoydalanuvchiQidir, tizimRuxsatBer, tizimRuxsatOl, tizimRuxsatRoyxat, type TizimRuxsatQator,
} from '../../../api/t2-tizim-xaritasi';
import { t } from '../../../i18n/til';
import { oldin } from '../../../lib/tizim-xaritasi';

export function RuxsatBoshqaruv() {
  const [qatorlar, setQatorlar] = useState<TizimRuxsatQator[]>([]);
  const [yuklanmoqda, setYuklanmoqda] = useState(true);
  const [xabar, setXabar] = useState('');
  const [qidiruv, setQidiruv] = useState('');
  const [topilgan, setTopilgan] = useState<BFoydalanuvchi[]>([]);
  const [izoh, setIzoh] = useState('');
  const [band, setBand] = useState(false);

  const yukla = useCallback(async () => {
    setYuklanmoqda(true);
    const r = await tizimRuxsatRoyxat();
    setYuklanmoqda(false);
    if (r.ok) setQatorlar(r.natija); else setXabar(r.error);
  }, []);
  useEffect(() => { void yukla(); }, [yukla]);

  const qidir = async () => {
    if (!qidiruv.trim()) { setTopilgan([]); return; }
    const r = await tizimFoydalanuvchiQidir(qidiruv.trim());
    if (r.ok) setTopilgan(r.natija); else setXabar(r.error);
  };
  const ber = async (id: number) => {
    setBand(true); setXabar('');
    const r = await tizimRuxsatBer(id, izoh.trim() || null);
    setBand(false);
    setXabar(r.ok ? (r.natija.ozgarmadi ? t('Ruxsat avvaldan bor edi') : t('Ruxsat berildi')) : r.error);
    if (r.ok) { setIzoh(''); setTopilgan([]); setQidiruv(''); void yukla(); }
  };
  const ol = async (id: number) => {
    setBand(true); setXabar('');
    const r = await tizimRuxsatOl(id, null);
    setBand(false);
    setXabar(r.ok ? t('Ruxsat olindi') : r.error);
    if (r.ok) void yukla();
  };
  const berilgan = new Set(qatorlar.map((q) => q.foydalanuvchi_id));

  return (
    <div className="space-y-3 p-4" data-testid="tizim-ruxsatlar">
      <div>
        <h2 className="text-[15px] font-semibold">{t('Ko‘rish ruxsatlari')}</h2>
        <p className="text-[12px] text-text-dim">{t('Tizim xaritasini superadmin va shu ro‘yxatdagi odamlar ko‘radi. Har amal auditga yoziladi.')}</p>
      </div>
      {xabar ? <p role="status" className="text-[12.5px] text-text-dim">{xabar}</p> : null}
      <section className="fz-panel">
        <div className="fz-panel__h"><span>{t('Ruxsat berilganlar')}</span></div>
        {yuklanmoqda ? <p className="text-[12.5px] text-text-mute">{t('Yuklanmoqda…')}</p> : null}
        {!yuklanmoqda && !qatorlar.length ? <p className="text-[12.5px] text-text-mute">{t('Hali hech kimga ruxsat berilmagan')}</p> : null}
        <ul className="space-y-1.5">
          {qatorlar.map((q) => (
            <li key={q.foydalanuvchi_id} className="flex items-center gap-2 text-[12.5px]">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{q.ism || q.login}</span>
                <span className="block truncate text-[11.5px] text-text-dim">{[q.login, oldin(q.berildi), q.berilgan_by_nom, q.izoh].filter(Boolean).join(' · ')}</span>
              </span>
              <button type="button" className="fz-btn fz-btn--sm" disabled={band} onClick={() => void ol(q.foydalanuvchi_id)}
                aria-label={t('Ruxsatni olish')} title={t('Ruxsatni olish')}><UserMinus aria-hidden /></button>
            </li>
          ))}
        </ul>
      </section>
      <section className="fz-panel">
        <div className="fz-panel__h"><span>{t('Ruxsat berish')}</span></div>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void qidir(); }}>
          <input value={qidiruv} onChange={(e) => setQidiruv(e.target.value)} placeholder={t('Login, ism yoki email…')} aria-label={t('Foydalanuvchini qidirish')}
            className="h-8 min-w-0 flex-1 rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-surface px-2 text-[12.5px]" />
          <button type="submit" className="fz-btn fz-btn--sm" aria-label={t('Qidirish')}><Search aria-hidden /></button>
        </form>
        <input value={izoh} onChange={(e) => setIzoh(e.target.value)} placeholder={t('Izoh (nima uchun)')} aria-label={t('Izoh')}
          className="mt-2 h-8 w-full rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-surface px-2 text-[12.5px]" />
        <ul className="mt-2 space-y-1">
          {topilgan.map((f) => (
            <li key={f.id} className="flex items-center gap-2 text-[12.5px]">
              <span className="min-w-0 flex-1 truncate">{[f.ism, f.login].filter(Boolean).join(' · ')}</span>
              <button type="button" className="fz-btn fz-btn--sm fz-btn--primary" disabled={band || berilgan.has(f.id) || f.holat !== 'faol'}
                onClick={() => void ber(f.id)}><UserPlus aria-hidden />{berilgan.has(f.id) ? t('Bor') : t('Berish')}</button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
