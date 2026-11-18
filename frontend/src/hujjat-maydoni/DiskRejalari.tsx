/**
 * DiskRejalari.tsx - "Tokenlar va obuna" sahifasidagi Disk bo'limi: joriy hajm, oylik disk rejalari (token bilan), ortiqcha xotira narxi.
 * Rejalar t2_tarif (tur='disk'); narx qiymatlari egasi tomonidan sozlanadi (namuna qiymatlar). Parallel billing yo'q: to'lov - kompaniya tokenlari.
 */
import { useState } from 'react';
import { toast } from '../umumiy/ui/Toast';
import { tasdiqSora } from '../umumiy/ui/Tasdiq';
import { t, tilLocale } from '../i18n/til';
import { hmHajm, hmRejaOl } from '../api/t2-hujjat-maydoni';
import type { TokenHolat } from '../api/t2-token';

export function DiskRejalari({ h, kompaniyaId, onOzgardi }: { h: TokenHolat; kompaniyaId: number; onOzgardi: () => void }) {
  const [oylar, setOylar] = useState(1);
  const [band, setBand] = useState(false);
  const tokenSom = h.sozlama.token_som || 1;
  const sotib = async (kod: string, nom: string) => {
    if (!(await tasdiqSora({ matn: t('{nom} rejasi {n} oyga sotib olinsinmi? Tokenlardan yechiladi.', { nom, n: oylar }) }))) return;
    setBand(true);
    const r = await hmRejaOl(kompaniyaId, kod, oylar);
    setBand(false);
    if (!r.ok) toast(r.code === 'TOKEN_YETMAYDI' ? t('Tokenlar yetarli emas.') : (r.xato ?? r.code), 'danger'); else { toast(t('Disk rejasi yoqildi'), 'ok'); onOzgardi(); }
  };
  const k = h.disk?.kvota;
  return (
    <section className="fz-card" aria-label={t('Disk (hujjat maydoni)')}>
      <div className="fz-card__head"><h2 className="fz-card__title">{t('Disk (hujjat maydoni)')}</h2></div>
      {k && <p className="text-[13px]">{t('Ishlatilgan')}: <b className="tabular-nums">{hmHajm(k.ishlatilgan)}</b> / {hmHajm(k.limit)}{h.disk?.reja ? <span className="text-text-mute"> · {t('reja {kod} gacha {sana}', { kod: h.disk.reja.kod, sana: h.disk.reja.tugaydi })}</span> : <span className="text-text-mute"> · {t('bepul reja')}</span>}</p>}
      <p className="mt-1 text-[12px] text-text-mute">{t('Limitdan oshganda yuklash bloklanadi (yuklab olish ishlayveradi). Disk boshqaruvida «limitdan oshganda tokenda hisoblash»ni yoqsangiz, ortiqcha xotira kunlik tokenda hisoblanadi.')}</p>
      <label className="mt-2 inline-flex items-center gap-2 text-[12px]">{t('Muddat')}
        <select className="input h-8" value={oylar} onChange={(e) => setOylar(Number(e.target.value))} aria-label={t('Muddat (oy)')}>{[1, 3, 6, 12].map((n) => <option key={n} value={n}>{n} {t('oy')}</option>)}</select></label>
      <div className="mt-2 grid gap-2 md:grid-cols-3">
        {(h.disk_tariflar ?? []).map((d) => (
          <div key={d.kod} className="rounded-lg border border-border p-3">
            <div className="text-[13px] font-semibold">{t(d.nom)}</div>
            <div className="text-lg font-bold tabular-nums">{hmHajm(d.disk_bayt)}</div>
            <div className="text-[12px] text-text-mute">{Number(d.narx_som).toLocaleString(tilLocale())} {t('soʻm / oy')} ≈ {Math.ceil(d.narx_som / tokenSom).toLocaleString(tilLocale())} {t('token')}</div>
            <button type="button" className="fz-btn fz-btn--primary mt-2" disabled={band} onClick={() => void sotib(d.kod, d.nom)}>{t('Sotib olish')}</button>
          </div>))}
      </div>
    </section>
  );
}