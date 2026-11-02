import { t } from '../../i18n/til';

/** Lazy sahifa yuklanayotganda — matn emas, sahifa shaklidagi skelet (sarlavha + karta + jadval qatorlari). */
export function SahifaYuklanmoqda() {
  return (
    <div className="flex flex-col gap-4 p-6" role="status" aria-label={t('Yuklanmoqda...')}>
      <div className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-2"><div className="skel h-3 w-40" /><div className="skel h-6 w-72" /></div>
        <div className="flex gap-2"><div className="skel h-8 w-24" /><div className="skel h-8 w-32" /></div>
      </div>
      <div className="fz-card flex flex-col gap-3 p-5">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="flex flex-col gap-2"><div className="skel h-3 w-24" /><div className="skel h-5 w-32" style={{ animationDelay: `${i * 80}ms` }} /></div>)}</div>
        <div className="skel h-3 w-full" />
      </div>
      <div className="fz-card overflow-hidden">
        <div className="h-9 border-b border-border bg-surface-2" />
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="flex h-10 items-center gap-4 border-b border-border px-4 last:border-0">
            <div className="skel h-3 flex-1" style={{ animationDelay: `${i * 60}ms` }} /><div className="skel h-3 w-24" /><div className="skel h-3 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}
