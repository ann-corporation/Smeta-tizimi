/**
 * Mutaxassis kartasi (T6): kompaniya ko'radigan ko'rinish — kasb, hudud, tajriba, xizmatlar va TIZIM TASDIQLAGAN tajriba
 * (o'zi tuzgan F2 lar, obyektlar, jami summa). Statistikani egasi yashirishi mumkin.
 */
import { BadgeCheck, MapPin } from 'lucide-react';
import { KASB_NOMI, qisqaSumma, type MutaxassisKarta } from '../../api/t2-mutaxassis';
import { t } from '../../i18n/til';

const rang = (id: number) => `hsl(${(id * 137.508) % 360} 55% 42%)`;
const harf = (s: string) => s.trim().split(/\s+/).slice(0, 2).map((x) => x[0] ?? '').join('').toUpperCase() || '?';

export function MutaxassisKartasi({ m, children }: { m: MutaxassisKarta; children?: React.ReactNode }) {
  const s = m.statistika;
  return (
    <div className="rounded-xl border border-border bg-surface-1 p-3">
      <div className="flex items-start gap-3">
        <span aria-hidden className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[14px] font-semibold text-white" style={{ background: rang(m.foydalanuvchi_id) }}>{harf(m.ism)}</span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-text">{m.ism}</p>
          <p className="text-[12px] text-text-dim">
            {m.kasb ? t(KASB_NOMI[m.kasb]) : t('Mutaxassis')}
            {m.tajriba_yil != null && <> · {m.tajriba_yil} {t('yil tajriba')}</>}
            {m.hudud && <> · <MapPin size={11} className="inline" /> {m.hudud}</>}
          </p>
        </div>
      </div>
      {s && s.f2_soni > 0 && <div className="mt-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2 text-[12px]">
        <p className="flex items-center gap-1 font-semibold text-emerald-400"><BadgeCheck size={13} /> {t('Smeta tizimi tasdiqlagan tajriba')}</p>
        <p className="mt-0.5 text-text">
          <b>{s.f2_soni}</b> {t('ta F2')} ({s.tasdiqlangan_f2} {t('tasdiqlangan')}) · <b>{s.obyektlar}</b> {t('obyekt')} · <b>{qisqaSumma(s.jami_summa)}</b> {t('so‘m')}
        </p>
      </div>}
      {!!m.xizmatlar?.length && <div className="mt-2 flex flex-wrap gap-1">{m.xizmatlar.map((x) =>
        <span key={x} className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-text-dim">{x}</span>)}</div>}
      {m.haqida && <p className="mt-2 whitespace-pre-line text-[12px] text-text-dim">{m.haqida}</p>}
      {children && <div className="mt-2 flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}
