import { useState } from 'react';
import { FmtN } from '../../lib/format';
import { t } from '../../i18n/til';
import type { SummaPaket } from '../../lib/summa-paket';

type Qator = { kalit: string; nom: string; summa: number; izoh?: string; doim?: boolean };

const soatMatni = (n: number, tur: 'chel' | 'mash') =>
  tur === 'chel' ? t('{n} chel-soat', { n: n.toLocaleString('ru-RU', { maximumFractionDigits: 1 }) })
    : t('{n} mash-soat', { n: n.toLocaleString('ru-RU', { maximumFractionDigits: 1 }) });

/**
 * ▸ Kesim (egasi 2026-10-29, yagona summa standarti): to'g'ri xarajat (прямые) resurs turlari bo'yicha —
 * ЧЕЛ (+ chel-soat), МАШ (+ mash-soat), МАТ (М/К, КАБ, БЕЗСКЛАД ichida), ОБ, Subpudrat / maxsus ishlar (kontragent bilan),
 * svod «письмо» va boshqa ustamasiz qismlar, kat noma'lum. Σ kesim = прямые. Hisob yo'q — faqat server paketi.
 */
export function SummaKesimi({ paket, ochiq = false }: { paket: SummaPaket; ochiq?: boolean }) {
  // Ichki qatorlar faqat ochilganda chiziladi (jadvallarda DOM og'irlashmasin).
  const [och, setOch] = useState(ochiq);
  const k = paket.kesim;
  const s = paket.soat;
  const qatorlar: Qator[] = [
    { kalit: 'chel', nom: 'ЧЕЛ', summa: k.chel, izoh: s.chel ? soatMatni(s.chel, 'chel') : undefined, doim: true },
    { kalit: 'mash', nom: 'МАШ', summa: k.mash, izoh: [s.mash ? soatMatni(s.mash, 'mash') : '', s.mashinist ? t('mashinist: {s}', { s: soatMatni(s.mashinist, 'chel') }) : ''].filter(Boolean).join(' · ') || undefined, doim: true },
    { kalit: 'mat', nom: 'МАТ', summa: k.mat, doim: true },
    { kalit: 'ob', nom: 'ОБ', summa: k.ob, doim: true },
    { kalit: 'subpudrat', nom: t('Subpudrat / maxsus ishlar'), summa: k.subpudrat,
      izoh: paket.subpudratchilar.length ? paket.subpudratchilar.map((x) => x.kontragent).join(', ') : undefined },
    { kalit: 'svod', nom: t('Svod («письмо»), ustamasiz'), summa: k.svod },
    { kalit: 'ustamasiz', nom: t('Boshqa ustamasiz (bojxona va h.k.)'), summa: k.ustamasiz },
    { kalit: 'nomalum', nom: t('Kategoriyasi noma’lum'), summa: k.nomalum },
  ];
  const korinadi = qatorlar.filter((q) => q.doim || q.summa !== 0);
  return (
    <details className="text-[10.5px] text-text-mute" open={och} data-testid="summa-kesim">
      <summary className="cursor-pointer select-none" onClick={(e) => { e.preventDefault(); setOch((v) => !v); }}>{t('▸ kesim (to‘g‘ri xarajat)')}</summary>
      {och && <span className="mt-0.5 grid grid-cols-[auto_auto] gap-x-2">
        {korinadi.map((q) => (
          <span key={q.kalit} className="contents" data-testid={`summa-kesim-${q.kalit}`}>
            <span className={q.kalit === 'nomalum' ? 'text-warn' : ''}>{q.nom}</span>
            <span className="text-right">
              <FmtN val={q.summa} />
              {q.izoh && <span className="block text-[10px]">{q.izoh}</span>}
            </span>
          </span>
        ))}
      </span>}
      {och && paket.narxsiz_soni > 0 && (
        <span className="block text-[10px] text-warn" data-testid="summa-kesim-narxsiz">{t('{n} ta qator narxsiz — summaga kirmagan', { n: paket.narxsiz_soni })}</span>
      )}
    </details>
  );
}
