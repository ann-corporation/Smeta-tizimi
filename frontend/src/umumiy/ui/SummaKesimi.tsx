import { useState } from 'react';
import { FmtN } from '../../lib/format';
import { t } from '../../i18n/til';
import type { SummaPaket } from '../../lib/summa-paket';
import type { QiymatUchlik } from '../../lib/ustamali-summa';
import { paketZanjiri, uchlikZanjiri, type TafsilQism, type ZanjirQator } from '../../lib/summa-tafsilot';

type Qator = { kalit: string; nom: string; summa: number; izoh?: string; doim?: boolean };

const soatMatni = (n: number, tur: 'chel' | 'mash') =>
  tur === 'chel' ? t('{n} chel-soat', { n: n.toLocaleString('ru-RU', { maximumFractionDigits: 1 }) })
    : t('{n} mash-soat', { n: n.toLocaleString('ru-RU', { maximumFractionDigits: 1 }) });

/** Qiymat yoki «noma'lum» (NULL ≠ 0 — hech qachon 0 ko'rsatilmaydi). */
function Son({ v, kalit }: { v: number | null | undefined; kalit?: string }) {
  if (v == null || !Number.isFinite(v)) return <span className="text-warn" data-testid={kalit ? `${kalit}-nomalum` : undefined}>{t('noma’lum')}</span>;
  return <FmtN val={v} />;
}

/**
 * ▸ Kesim va hisob — YAGONA kengayuvchi tafsilot (egasi 2026-11-02: har summa bosilganda joyida ochiladi):
 *  1) uchlik: QQS bilan · ustamali (QQS siz, ИТОГО-4) · ustamasiz (прямые);
 *  2) kesim (server paketi bo'lsa): ЧЕЛ (+chel-soat), МАШ (+mash-soat), МАТ, ОБ, Subpudrat (kontragent), Svod («письмо»), boshqa ustamasiz, kat noma'lum — Σ = прямые;
 *  3) kaskad qadamlari: ... → ИТОГО-4 → НДС → ВСЕГО;
 *  4) agregat bo'lsa — hissa qo'shuvchi bandlar (obyekt/bo'lim), har biri o'z uchligi bilan;
 *  5) noma'lum / narxsiz sonlari (jim 0 emas).
 * Hisob yo'q — faqat server paketi / hisob-yadro natijasi.
 */
export function SummaKesimi({ paket = null, q = null, zanjir, qismlar, nomalumSoni, ochiq = false, sarlavha }: {
  paket?: SummaPaket | null; q?: QiymatUchlik | null; zanjir?: ZanjirQator[]; qismlar?: TafsilQism[];
  /** Hisoblanmagan (noma'lum) bandlar soni — ko'rsatiladi, jim 0 emas. */
  nomalumSoni?: number; ochiq?: boolean; sarlavha?: string;
}) {
  // Ichki qatorlar faqat ochilganda chiziladi (jadvallarda DOM og'irlashmasin).
  const [och, setOch] = useState(ochiq);
  const uchlik: QiymatUchlik | null = q ?? (paket ? { qqsBilan: paket.qqs_bilan, ustamali: paket.ustamali, ustamasiz: paket.ustamasiz, taxminiy: false, nomalum: paket.kesim.nomalum, sabab: null } : null);
  const k = paket?.kesim;
  const s = paket?.soat;
  const qatorlar: Qator[] = k && s ? [
    { kalit: 'chel', nom: 'ЧЕЛ', summa: k.chel, izoh: s.chel ? soatMatni(s.chel, 'chel') : undefined, doim: true },
    { kalit: 'mash', nom: 'МАШ', summa: k.mash, izoh: [s.mash ? soatMatni(s.mash, 'mash') : '', s.mashinist ? t('mashinist: {s}', { s: soatMatni(s.mashinist, 'chel') }) : ''].filter(Boolean).join(' · ') || undefined, doim: true },
    { kalit: 'mat', nom: 'МАТ', summa: k.mat, doim: true },
    { kalit: 'ob', nom: 'ОБ', summa: k.ob, doim: true },
    { kalit: 'subpudrat', nom: t('Subpudrat / maxsus ishlar'), summa: k.subpudrat,
      izoh: paket!.subpudratchilar.length ? paket!.subpudratchilar.map((x) => x.kontragent).join(', ') : undefined },
    { kalit: 'svod', nom: t('Svod («письмо»), ustamasiz'), summa: k.svod },
    { kalit: 'ustamasiz', nom: t('Boshqa ustamasiz (bojxona va h.k.)'), summa: k.ustamasiz },
    { kalit: 'nomalum', nom: t('Kategoriyasi noma’lum'), summa: k.nomalum },
  ] : [];
  const korinadi = qatorlar.filter((x) => x.doim || x.summa !== 0);
  const zj = zanjir ?? (paket ? paketZanjiri(paket) : uchlik ? uchlikZanjiri(uchlik) : []);
  return (
    <details className="text-[10.5px] text-text-mute" open={och} data-testid="summa-kesim">
      <summary className="cursor-pointer select-none" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOch((v) => !v); }}>{sarlavha ?? t('▸ kesim va hisob')}</summary>
      {och && <span className="mt-0.5 flex flex-col gap-1" data-testid="summa-tafsilot">
        {uchlik && <span className="grid grid-cols-[auto_auto] gap-x-2" data-testid="summa-tafsilot-uchlik">
          <span>{t('QQS bilan')}</span><span className="text-right font-medium text-text" data-testid="tafsilot-qqs"><Son v={uchlik.qqsBilan} kalit="tafsilot-qqs" /></span>
          <span>{t('ustamali, QQS siz')}</span><span className="text-right" data-testid="tafsilot-ustamali"><Son v={uchlik.ustamali} kalit="tafsilot-ustamali" /></span>
          <span>{t('ustamasiz (прямые)')}</span><span className="text-right" data-testid="tafsilot-ustamasiz"><Son v={uchlik.ustamasiz} kalit="tafsilot-ustamasiz" /></span>
        </span>}
        {korinadi.length > 0 && <span className="grid grid-cols-[auto_auto] gap-x-2" data-testid="summa-kesim-royxat">
          {korinadi.map((x) => (
            <span key={x.kalit} className="contents" data-testid={`summa-kesim-${x.kalit}`}>
              <span className={x.kalit === 'nomalum' ? 'text-warn' : ''}>{x.nom}</span>
              <span className="text-right">
                <FmtN val={x.summa} />
                {x.izoh && <span className="block text-[10px]">{x.izoh}</span>}
              </span>
            </span>
          ))}
        </span>}
        {zj.length > 0 && <span className="grid grid-cols-[auto_auto] gap-x-2 border-t border-border pt-0.5" data-testid="summa-zanjir">
          {zj.map((z) => (
            <span key={z.kalit} className="contents" data-testid={`summa-zanjir-${z.kalit}`}>
              <span className={z.jami ? 'font-medium text-text' : ''}>{z.nom}{z.foiz != null ? ` (${z.foiz}%)` : ''}</span>
              <span className={`text-right ${z.jami ? 'font-medium text-text' : ''}`}><Son v={z.summa} kalit={`summa-zanjir-${z.kalit}`} /></span>
            </span>
          ))}
        </span>}
        {qismlar && qismlar.length > 0 && <span className="flex flex-col gap-0.5 border-t border-border pt-0.5" data-testid="summa-qismlar">
          <span>{t('Tarkibi')}: {qismlar.length}</span>
          {qismlar.map((x) => (
            <span key={x.kalit} className="grid grid-cols-[1fr_auto_auto_auto] gap-x-2" data-testid={`summa-qism-${x.kalit}`}>
              <span className="truncate text-text-dim" title={x.nom}>{x.nom}</span>
              <span className="text-right text-text" data-testid="qism-qqs"><Son v={x.q.qqsBilan} /></span>
              <span className="text-right" data-testid="qism-ustamali"><Son v={x.q.ustamali} /></span>
              <span className="text-right" data-testid="qism-ustamasiz"><Son v={x.q.ustamasiz} /></span>
            </span>
          ))}
          <span className="text-[10px]">{t('ustunlar')}: {t('QQS bilan')} · {t('ustamali, QQS siz')} · {t('ustamasiz (прямые)')}</span>
        </span>}
        {nomalumSoni != null && nomalumSoni > 0 && (
          <span className="block text-[10px] text-warn" data-testid="summa-tafsilot-nomalum-soni">{t('{n} ta band hisoblanmagan (noma’lum) — yig‘indiga kirmagan', { n: nomalumSoni })}</span>
        )}
        {paket && (
          <span className="block text-[10px]" data-testid="summa-kesim-soni">{t('qatorlar: {n}', { n: paket.qator_soni })}</span>
        )}
        {paket && paket.narxsiz_soni > 0 && (
          <span className="block text-[10px] text-warn" data-testid="summa-kesim-narxsiz">{t('{n} ta qator narxsiz — summaga kirmagan', { n: paket.narxsiz_soni })}</span>
        )}
      </span>}
    </details>
  );
}
