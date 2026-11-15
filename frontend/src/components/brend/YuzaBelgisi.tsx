/**
 * «Qayerdaman» belgisi: QURAI logosi + joriy yuza («QURAI · Sayt», «QURAI · Android», «QURAI · Windows», «QURAI · Telegram»)
 * va kerak bo'lsa mahsulot moduli. Foydalanuvchi doim qaysi sayt/ilovada ekanini ko'radi (lib/brend.ts — yagona manba).
 */
import { useMemo } from 'react';
import { yuzaAniqla, yuzaBelgisi, type Yuza } from '../../lib/brend';

export function YuzaBelgisi({ modul, yuza, className = '' }: { modul?: string | null; yuza?: Yuza; className?: string }) {
  const y = useMemo(() => yuza ?? yuzaAniqla(), [yuza]);
  const matn = yuzaBelgisi(y);
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap ${className}`} data-yuza={y} aria-label={yuzaBelgisi(y, modul)} title={yuzaBelgisi(y, modul)}>
      <img src="/brand/favicon.svg" alt="" width={20} height={20} className="rounded-[5px]" aria-hidden="true" />
      <span className="text-[12px] font-semibold tracking-wide text-text">{matn}</span>
      {modul ? <span className="hidden text-[11px] text-text-dim xl:inline">{`· ${modul}`}</span> : null}
    </span>
  );
}