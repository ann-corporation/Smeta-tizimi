/**
 * Kompaniya xaritasining ro‘yxat ko‘rinishi (mobil sukut va ekran o‘quvchilar uchun): loyiha kartalari ichida
 * obyekt qatorlari — holat rombi, smeta, F2/fakt o‘lchagichi va ogohlantirish chiplari.
 */
import { AlertTriangle, ChevronRight } from 'lucide-react';
import { t } from '../../i18n/til';
import type { XDaraxt, XTugun } from '../../lib/mindmap-korinish';
import { Bajarilish, HolatChiziq, Romb } from './belgilar';
import { foizMatn, holatNomi, pulQ } from './holat';

export function XaritaRoyxat({ daraxt, korinadi, tanlangan, onTanla, guruhNomi }: {
  daraxt: XDaraxt; korinadi: (id: string) => boolean; tanlangan: string | null; onTanla: (id: string) => void; guruhNomi: string;
}) {
  const root = daraxt.tugunlar.get(daraxt.ildiz)!;
  const loyihalar = root.bolalar.map((id) => daraxt.tugunlar.get(id)!).filter((l) => korinadi(l.id) || l.bolalar.some(korinadi));
  if (!loyihalar.length) return <p className="p-6 text-center text-[13px] text-text-mute">{t('Qidiruv yoki filtrga mos obyekt topilmadi.')}</p>;
  return (
    <div className="space-y-3 p-3 sm:p-4">
      {loyihalar.map((l) => {
        const bolalar = l.bolalar.map((id) => daraxt.tugunlar.get(id)!).filter((o) => korinadi(o.id));
        return (
          <section key={l.id} className="fz-card">
            <button type="button" onClick={() => onTanla(l.id)} aria-current={tanlangan === l.id}
              className="block w-full border-b border-border px-4 py-3 text-left hover:bg-[var(--surface-2)]">
              <span className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2">
                  <Romb holat={l.holat} olcham={10} />
                  <span className="truncate font-[600] text-[14.5px] text-text" style={{ fontFamily: 'var(--font-display)' }}>{l.tur === 'guruh' ? guruhNomi : l.nom}</span>
                </span>
                <span className="shrink-0 font-mono text-[12px] text-text-dim tabular-nums">{l.smeta == null ? t('smeta yo‘q') : (l.smetaToliq ? '' : '≈ ') + pulQ(l.smeta)}</span>
              </span>
              <span className="mt-2 grid grid-cols-[1fr_auto] items-center gap-3">
                <Bajarilish faktFoiz={l.faktFoiz} f2Foiz={l.f2Foiz} smetaBor={l.smeta != null} />
                <span className="text-[11.5px] text-text-mute">{t('{n} ta obyekt', { n: l.obyektSoni })}</span>
              </span>
              <HolatChiziq sanoq={l.holatSanoq} balandlik={4} className="mt-2" />
            </button>
            <ul className="divide-y divide-[var(--border)]">
              {bolalar.map((o) => <ObyektQator key={o.id} o={o} tanlangan={tanlangan === o.id} onTanla={onTanla} />)}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function ObyektQator({ o, tanlangan, onTanla }: { o: XTugun; tanlangan: boolean; onTanla: (id: string) => void }) {
  const ogoh = o.belgilar.filter((b) => b.daraja === 'ogoh');
  const info = o.belgilar.filter((b) => b.daraja !== 'ogoh');
  return (
    <li>
      <button type="button" onClick={() => onTanla(o.id)} aria-current={tanlangan}
        className={'grid w-full grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-1.5 px-4 py-2.5 text-left hover:bg-[var(--surface-2)] ' + (tanlangan ? 'bg-[var(--accent-soft)]' : '')}>
        <Romb holat={o.holat} olcham={8} />
        <span className="min-w-0">
          <span className="block truncate text-[13.5px] font-semibold text-text">{o.nom}</span>
          <span className="block text-[11.5px] text-text-mute">{holatNomi(o.holat) + ' · ' + (o.smeta == null ? t('smeta yo‘q') : pulQ(o.smeta)) + ' · ' + t('F2 {p}', { p: foizMatn(o.f2Foiz) })}</span>
        </span>
        <ChevronRight aria-hidden className="h-4 w-4 text-text-mute" />
        <span className="col-start-2 col-end-4"><Bajarilish faktFoiz={o.faktFoiz} f2Foiz={o.f2Foiz} smetaBor={o.smeta != null} /></span>
        {(ogoh.length > 0 || info.length > 0) && (
          <span className="col-start-2 col-end-4 flex flex-wrap gap-1">
            {ogoh.map((b, i) => <span key={'o' + i} className="fz-chip fz-chip--danger"><AlertTriangle aria-hidden className="h-3 w-3" />{b.matn}</span>)}
            {info.map((b, i) => <span key={'i' + i} className="fz-chip fz-chip--warn"><AlertTriangle aria-hidden className="h-3 w-3" />{b.matn}</span>)}
          </span>
        )}
      </button>
    </li>
  );
}
