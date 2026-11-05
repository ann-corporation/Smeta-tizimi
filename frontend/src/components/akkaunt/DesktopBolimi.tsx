/**
 * DesktopBolimi — Akkaunt markazi → «Windows dastur»: dastur sizga ochiqmi, joriy o'rnatuvchi versiyasi va yuklab olish
 * havolasi (superadmin «Tizim nazorati → Windows dastur» da kiritadi; repoda binar fayl yo'q).
 */
import { Download, Laptop, Loader2 } from 'lucide-react';
import { useDesktopYangilanish } from '../../api/t2-desktop';
import { t } from '../../i18n/til';

export function DesktopBolimi() {
  const q = useDesktopYangilanish();
  const d = q.data;
  return (
    <section className="fz-card">
      <div className="fz-card__head"><div className="flex items-center gap-2"><Laptop size={16} aria-hidden="true" className="text-[var(--accent-text)]" />
        <div><h2 className="fz-card__title">{t('Windows dastur')}</h2><p className="fz-card__sub">{t('Kompyuterga o‘rnatiladigan dastur: internet bo‘lmaganda ham obyektlarni ko‘rish mumkin.')}</p></div></div></div>
      <div className="flex flex-col gap-3 px-4 pb-4 text-[13px]">
        {q.isLoading && <span className="flex items-center gap-2 text-text-dim"><Loader2 size={14} className="animate-spin" aria-hidden="true" /> {t('Yuklanmoqda…')}</span>}
        {q.isError && <span role="alert" className="text-danger">{t('Ma’lumotni o‘qib bo‘lmadi.')}</span>}
        {d && !d.yoqilgan && <div className="fz-note fz-note--warn">{t('Windows dastur hozircha sizning kompaniyangiz uchun o‘chirilgan.')}</div>}
        {d && d.yoqilgan && (
          <>
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <div><dt className="text-[11.5px] text-text-dim">{t('Joriy versiya')}</dt><dd className="font-medium">{d.joriy_versiya || '—'}</dd></div>
              <div><dt className="text-[11.5px] text-text-dim">{t('Minimal versiya')}</dt><dd className="font-medium">{d.min_versiya || '—'}</dd></div>
              <div><dt className="text-[11.5px] text-text-dim">{t('Qurilmalaringiz')}</dt><dd className="font-medium">{t('{n} / {m}', { n: d.faol_qurilmalar, m: d.max_qurilma })}</dd></div>
            </dl>
            {d.yangilanish_izoh && <p className="text-text-dim">{d.yangilanish_izoh}</p>}
            {d.yuklab_olish_url
              ? <a className="fz-btn fz-btn--primary self-start" href={d.yuklab_olish_url} target="_blank" rel="noopener noreferrer"><Download size={14} aria-hidden="true" /> {t('Yuklab olish')}</a>
              : <span className="text-text-dim">{t('Yuklab olish havolasi hali e’lon qilinmagan.')}</span>}
            {d.min_versiya && <span className="text-[12px] text-text-dim">{t('Eski versiya ulanmaydi: dastur yangilashni so‘raydi.')}</span>}
          </>
        )}
      </div>
    </section>
  );
}
