/**
 * KompaniyaLogo.tsx — kompaniya logosi: ko'rsatish (sidebar burchagi,
 * hujjatlar) va yuklash (Kompaniya → Profil). Logo `t2_kompaniya_logo`
 * jadvalida base64 sifatida saqlanadi (PNG/JPEG, ≤ 300 KB); yozish faqat
 * boss/admin (server `kompaniya_logo_saqla` darvozasi).
 */
import { useRef, useState, type ReactNode } from 'react';
import './hujjat-korinish.css';
import { useQueryClient } from '@tanstack/react-query';
import { ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { sbKompaniyaLogoSaqla } from '../../api/t2-ijro';
import { kalit, useKompaniyaLogo } from './useKompaniyaLogo';
import { t } from '../../i18n/til';
import { tasdiqSora } from '../ui/Tasdiq';

const MAX_BAYT = 300 * 1024;

/** Logo rasmi; logo bo'lmasa `zaxira` ko'rsatiladi. */
export function KompaniyaLogoRasm({ kompaniyaId, className, zaxira }: { kompaniyaId: number | null | undefined; className?: string; zaxira?: ReactNode }) {
  const q = useKompaniyaLogo(kompaniyaId);
  if (!q.data) return <>{zaxira ?? null}</>;
  return <img src={`data:${q.data.mime};base64,${q.data.data_b64}`} alt={t('Kompaniya logosi')} className={className} />;
}

function base64ga(fayl: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).replace(/^data:[^,]*,/, ''));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(fayl);
  });
}

/** Profil sahifasidagi logo bo'limi. `isDirector` bo'lmasa faqat ko'rish. */
export function KompaniyaLogoYuklash({ kompaniyaId, isDirector }: { kompaniyaId: number; isDirector: boolean }) {
  const qc = useQueryClient();
  const q = useKompaniyaLogo(kompaniyaId);
  const input = useRef<HTMLInputElement>(null);
  const [band, setBand] = useState(false);
  const [xato, setXato] = useState<string | null>(null);

  const saqla = async (mime: 'image/png' | 'image/jpeg' | null, data: string | null) => {
    setBand(true); setXato(null);
    const r = await sbKompaniyaLogoSaqla(kompaniyaId, mime, data);
    setBand(false);
    if (!r.ok) { setXato(r.error || r.sabab || t('Saqlab bo‘lmadi')); return; }
    await qc.invalidateQueries({ queryKey: kalit(kompaniyaId) });
  };

  const tanla = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (f.type !== 'image/png' && f.type !== 'image/jpeg') { setXato(t('Faqat PNG yoki JPEG.')); return; }
    if (f.size > MAX_BAYT) { setXato(t('Fayl {n} KB — ruxsat ≤ 300 KB.', { n: Math.round(f.size / 1024) })); return; }
    await saqla(f.type, await base64ga(f));
  };

  return (
    <section className="fz-card kl-card" aria-label={t('Kompaniya logosi')}>
      <div className="fz-card__head"><div><h3 className="fz-card__title">{t('Kompaniya logosi')}</h3><p className="fz-card__sub">{t('АОСР, F2 va boshqa hujjatlarda ishlatiladi. PNG/JPEG, ≤ 300 KB.')}</p></div>{q.data ? <span className="fz-stamp fz-stamp--ok">{t('yuklangan')}</span> : <span className="fz-stamp fz-stamp--draft">{t('logo yo‘q')}</span>}</div>
      <div className="fz-card__body kl-body">
        <div className="kl-frame">
          {q.isLoading ? <Loader2 className="animate-spin" size={16} />
            : <KompaniyaLogoRasm kompaniyaId={kompaniyaId} className="kl-img" zaxira={<span className="kl-none">{t('logo yo‘q')}</span>} />}
        </div>
        <div className="kl-side">
          {isDirector ? (
            <div className="kl-actions">
              <input ref={input} type="file" accept="image/png,image/jpeg" className="hidden" onChange={tanla} aria-label={t('Logo faylini tanlash')} />
              <button type="button" className="fz-btn fz-btn--primary" disabled={band} onClick={() => input.current?.click()}>
                {band ? <Loader2 className="animate-spin" size={14} /> : <><ImagePlus size={14} /> {q.data ? t('Almashtirish') : t('Yuklash')}</>}
              </button>
              {q.data && (
                <button type="button" className="fz-btn fz-btn--danger" disabled={band}
                  onClick={() => { void tasdiqSora({ matn: t('Logo olib tashlansinmi?'), xavfli: true }).then((ha) => { if (ha) void saqla(null, null); }); }}>
                  <Trash2 size={14} /> {t('olib tashlash')}
                </button>
              )}
            </div>
          ) : <p className="fz-note fz-note--warn">{t('Logoni faqat direktor (boss/admin) o‘zgartiradi.')}</p>}
          {xato && <p role="alert" className="fz-note fz-note--danger">{xato}</p>}
        </div>
      </div>
    </section>
  );
}
