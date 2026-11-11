/**
 * «Boshqaruv pulti» — mindmapning asosiy ko‘rinishi: ierarxik daraxt
 * kompaniya → loyiha → shartnoma → obyekt (→ smeta bo‘limlari), yonida tomonlar/subpudratchilar/resurslar.
 *
 * To‘liq nomlar (kesilmaydi, qatorga o‘raladi), holat belgilari xaritaning yagona hisobidan (`XTugun`), har tugunda
 * «Amallar» (mavjud AmalMenyu: sahifaga o‘tish + yaratish/biriktirish/uzish/nomlash — hammasi oldindan ko‘rish + tasdiq bilan)
 * va obyektda «Keyingi qadam». Chizish BOSQICHMA-BOSQICH: avval birinchi qatorlar, qolgani keyingi kadrlarda; obyekt ichi
 * (smeta bo‘limlari) faqat ochilganda yuklanadi.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Building2, ChevronDown, ChevronRight, FileSignature, FolderKanban, Layers, MoreHorizontal, Users, ArrowRight } from 'lucide-react';
import { t } from '../../i18n/til';
import { HOLAT_TARTIB, type XHolat } from '../../lib/mindmap-korinish';
import {
  boshlangichYoyilgan, keyingiQadam, pultBelgilari, pultQatorlari,
  type PultTugun, type PultYon,
} from '../../lib/mindmap-pult-daraxt';
import type { ObyektBolimi } from '../../api/t2-mindmap-pult';
import { Bajarilish, HolatChiziq, Romb } from './belgilar';
import { foizMatn, holatNomi, pulQ } from './holat';
import { rolNomi } from '../../lib/mindmap-pult';

export type BolimlarOl = { (obyektId: number): Promise<{ ok: true; bolimlar: ObyektBolimi[] } | { ok: false; error: string }> };

type Props = {
  ildiz: PultTugun;
  tanlangan: string | null;
  onTanla: (id: string) => void;
  /** Qidiruv/filtrga mos kalitlar (`null` — filtr yo‘q; filtr bor — hammasi yoyilgan ko‘rinadi). */
  korinadi: ReadonlySet<string> | null;
  pulYoq: boolean;
  /** Tugun amallari menyusini ochadi (tugma ostida). */
  amalOch: (t: PultTugun, el: HTMLElement) => void;
  /** Tugundagi amallar soni (0 — menyu tugmasi chiqmaydi). */
  amalSoni: (t: PultTugun) => number;
  /** Sahifaga o‘tish. */
  yolOch: (yol: string) => void;
  /** Sahifa shu foydalanuvchiga ochiqmi (yagona navigatsiya reestri); yopiq — tugma bosilmaydi. */
  yolMumkin: (yol: string) => boolean;
  bolimlarOl?: BolimlarOl;
};

const TUR_IKON = { kompaniya: Building2, loyiha: FolderKanban, shartnoma: FileSignature, obyekt: Layers, guruh: FolderKanban } as const;

/** Bosqichma-bosqich chizish: birinchi `bosh` qator darhol, qolgani har kadrda `qadam` tadan. */
function useBosqichma(jami: number, bosh = 80, qadam = 140): number {
  const [k, setK] = useState(bosh);
  useEffect(() => {
    if (k >= jami) return;
    const id = window.setTimeout(() => setK((x) => x + qadam), 16);
    return () => window.clearTimeout(id);
  }, [k, jami, qadam]);
  return Math.min(jami, k);
}

const YON_NOMI: Record<PultYon['tur'], () => string> = {
  tomon: () => t('Tomon'), subpudrat: () => t('Subpudratchi'), sklad: () => t('Sklad'), texnika: () => t('Texnika'), xodim: () => t('Xodim'), masul: () => t('Mas‘ul'),
};

export function MindmapPult({ ildiz, tanlangan, onTanla, korinadi, pulYoq, amalOch, amalSoni, yolOch, yolMumkin, bolimlarOl }: Props) {
  const [yoyilgan, setYoyilgan] = useState<Set<string>>(() => boshlangichYoyilgan(ildiz));
  const [ochiqObyekt, setOchiqObyekt] = useState<Set<string>>(new Set());
  const korilgan = useRef<Set<string>>(new Set(yoyilgan));

  // Yangi (avval ko‘rilmagan) loyiha/shartnomalar avtomatik yoyiladi; foydalanuvchi yopganlari qayta ochilmaydi.
  useEffect(() => {
    const yangi = [...boshlangichYoyilgan(ildiz)].filter((k) => !korilgan.current.has(k));
    if (!yangi.length) return;
    yangi.forEach((k) => korilgan.current.add(k));
    setYoyilgan((s) => new Set([...s, ...yangi]));
  }, [ildiz]);

  const yoyuvchi = useMemo<ReadonlySet<string>>(() => {
    if (!korinadi) return yoyilgan;
    return new Set(korinadi); // filtr bor — mos tarmoq to‘liq ochiq
  }, [korinadi, yoyilgan]);
  const qatorlar = useMemo(() => pultQatorlari(ildiz, yoyuvchi, korinadi), [ildiz, yoyuvchi, korinadi]);
  const korsat = useBosqichma(qatorlar.length);

  const toggle = useCallback((k: string) => setYoyilgan((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; }), []);
  const obyektToggle = useCallback((k: string) => setOchiqObyekt((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; }), []);

  if (!ildiz.bolalar.length) return null;
  return (
    <div role="tree" aria-label={t('Boshqaruv daraxti')} data-testid="pult-daraxt" className="px-2 py-2 sm:px-4">
      {qatorlar.slice(0, korsat).map(({ t: tg, daraja }) => (
        <Qator key={tg.kalit} tg={tg} daraja={daraja} tanlangan={tanlangan === tg.id}
          yoyiq={tg.tur === 'obyekt' ? ochiqObyekt.has(tg.kalit) : yoyuvchi.has(tg.kalit)}
          onToggle={() => (tg.tur === 'obyekt' ? obyektToggle(tg.kalit) : toggle(tg.kalit))}
          onTanla={onTanla} pulYoq={pulYoq} amalOch={amalOch} amalSoni={amalSoni} yolOch={yolOch} yolMumkin={yolMumkin} bolimlarOl={bolimlarOl} />
      ))}
      {korsat < qatorlar.length && (
        <p role="status" className="px-3 py-2 text-[12px] text-text-mute" data-testid="pult-davom">{t('Yana {n} qator yuklanmoqda…', { n: qatorlar.length - korsat })}</p>
      )}
    </div>
  );
}

function Qator({ tg, daraja, tanlangan, yoyiq, onToggle, onTanla, pulYoq, amalOch, amalSoni, yolOch, yolMumkin, bolimlarOl }: {
  tg: PultTugun; daraja: number; tanlangan: boolean; yoyiq: boolean; onToggle: () => void; onTanla: (id: string) => void;
  pulYoq: boolean; amalOch: Props['amalOch']; amalSoni: Props['amalSoni']; yolOch: Props['yolOch']; yolMumkin: Props['yolMumkin']; bolimlarOl?: BolimlarOl;
}) {
  const Ikon = TUR_IKON[tg.tur];
  const obyekt = tg.tur === 'obyekt';
  const ochiladi = obyekt || tg.bolalar.length > 0;
  const nom = tg.tur === 'guruh' ? t('Loyihasiz obyektlar') : tg.tur === 'kompaniya' ? tg.nom || t('Kompaniya') : tg.nomAniq;
  const belgi = pultBelgilari(tg.x);
  const qadam = obyekt ? keyingiQadam(tg.x, Number(tg.id.split(':')[1]), (k) => (k === 'smeta' ? t('Smeta yuklash') : k === 'fakt' ? t('Fakt kiritish') : k === 'f2' ? t('F2 tayyorla') : k === 'f3' ? t('Nakopitelniy va F3') : t('АОСР yoz'))) : null;
  const soni = amalSoni(tg);
  const tanlanishi = tg.tur !== 'guruh';
  return (
    <div role="treeitem" aria-level={daraja + 1} aria-expanded={ochiladi ? yoyiq : undefined} aria-selected={tanlangan} data-testid="pult-qator" data-tugun={tg.id}
      className={'border-b border-[var(--border)] py-2 ' + (tanlangan ? 'bg-[var(--accent-soft)]' : '')} style={{ paddingLeft: daraja * 20 + 8 }}>
      <div className="flex min-w-0 flex-wrap items-start gap-x-2 gap-y-1">
        <button type="button" className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-[var(--radius-xs)] text-text-mute hover:bg-[var(--surface-3)]"
          onClick={onToggle} disabled={!ochiladi} aria-label={yoyiq ? t('Yig‘ish') : t('Yoyish')} aria-hidden={!ochiladi}>
          {ochiladi ? (yoyiq ? <ChevronDown aria-hidden className="h-4 w-4" /> : <ChevronRight aria-hidden className="h-4 w-4" />) : null}
        </button>
        <Ikon aria-hidden className="mt-1 h-4 w-4 shrink-0 text-text-dim" />
        <div className="min-w-0 flex-1 basis-[220px]">
          {tanlanishi
            ? <button type="button" onClick={() => onTanla(tg.id)} title={nom} className="block w-full break-words text-left text-[13.5px] font-semibold leading-5 text-text hover:underline">{nom}</button>
            : <span className="block break-words text-[13.5px] font-semibold leading-5 text-text">{nom}</span>}
          {tg.yonlar.length > 0 && <Yonlar yonlar={tg.yonlar} />}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-[11.5px]" data-testid="pult-belgilar">
          {belgi ? <ObyektBelgilari b={belgi} pulYoq={pulYoq} /> : <Jamlanma tg={tg} />}
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          {qadam && (
            <button type="button" className="fz-btn fz-btn--sm" data-testid="pult-qadam" data-qadam={qadam.kalit} title={yolMumkin(qadam.yol) ? t('Keyingi qadam') : t('Bu sahifaga ruxsatingiz yo‘q')} disabled={!yolMumkin(qadam.yol)} onClick={() => yolOch(qadam.yol)}>
              {qadam.nom}<ArrowRight aria-hidden />
            </button>
          )}
          {soni > 0 && (
            <button type="button" className="fz-btn fz-btn--sm fz-btn--icon" aria-haspopup="menu" aria-label={t('Amallar: {nom}', { nom })} title={t('Amallar')} data-testid="pult-amallar"
              onClick={(e) => amalOch(tg, e.currentTarget)}>
              <MoreHorizontal aria-hidden />
            </button>
          )}
        </div>
      </div>
      {obyekt && yoyiq && <ObyektIchi tg={tg} yolOch={yolOch} yolMumkin={yolMumkin} bolimlarOl={bolimlarOl} />}
    </div>
  );
}

function Yonlar({ yonlar }: { yonlar: PultYon[] }) {
  const [hammasi, setHammasi] = useState(false);
  const kop = yonlar.length > 6;
  const korinadigan = hammasi ? yonlar : yonlar.slice(0, 6);
  return (
    <ul className="mt-1 flex flex-wrap gap-1" aria-label={t('Bog‘langanlar')} data-testid="pult-yonlar">
      {korinadigan.map((y, i) => (
        <li key={y.tur + (y.tugunId ?? y.nom) + i} className="fz-chip max-w-full break-words" title={YON_NOMI[y.tur]() + (y.rol ? ' · ' + (y.tur === 'masul' ? y.rol : rolNomi(y.rol)) : '')}>
          <Users aria-hidden className="h-3 w-3 shrink-0" />
          <span className="break-words">{(y.rol && y.tur !== 'masul' ? rolNomi(y.rol) : YON_NOMI[y.tur]()) + ': ' + y.nom}</span>
        </li>
      ))}
      {kop && !hammasi && (
        <li><button type="button" className="fz-chip" onClick={() => setHammasi(true)}>{t('yana {n}', { n: yonlar.length - 6 })}</button></li>
      )}
    </ul>
  );
}

function Jamlanma({ tg }: { tg: PultTugun }) {
  if (!tg.obyektSoni) return <span className="text-text-mute">{t('obyekt yo‘q')}</span>;
  return (
    <span className="inline-flex items-center gap-2" title={HOLAT_TARTIB.filter((h) => tg.holatSanoq[h] > 0).map((h) => holatNomi(h) + ': ' + tg.holatSanoq[h]).join(' · ')}>
      <span className="text-text-dim">{t('{n} obyekt', { n: tg.obyektSoni })}</span>
      <span className="w-20"><HolatChiziq sanoq={tg.holatSanoq} balandlik={6} /></span>
    </span>
  );
}

function ObyektBelgilari({ b, pulYoq }: { b: NonNullable<ReturnType<typeof pultBelgilari>>; pulYoq: boolean }) {
  const holat: XHolat = b.holat;
  return (
    <>
      <span className="inline-flex items-center gap-1.5" title={holatNomi(holat)}><Romb holat={holat} olcham={8} />{holatNomi(holat)}</span>
      {!pulYoq && (
        <>
          <span className="w-24" title={t('Fakt / F2 smeta (ustamasiz) bo‘yicha')}><Bajarilish faktFoiz={b.faktFoiz} f2Foiz={b.f2Foiz} smetaBor={b.smeta != null} matn={foizMatn(b.faktFoiz)} /></span>
          <span className="text-text-dim" title={t('F2 (tasdiqlangan) smetadan')}>{t('F2')} {foizMatn(b.f2Foiz)}</span>
          <span className="text-text-dim" title={t('Qoldiq = smeta − F2, ustamasiz, QQS siz')}>{t('Qoldiq')} {b.qoldiq == null ? '—' : pulQ(b.qoldiq)}</span>
        </>
      )}
      {(b.signalSoni ?? 0) > 0 && (
        <span className={'fz-chip ' + ((b.kritikSoni ?? 0) > 0 ? 'fz-chip--danger' : 'fz-chip--warn')} title={b.muammolar.map((m) => m.matn).join('\n')}>
          <AlertTriangle aria-hidden className="h-3 w-3" />{t('{n} signal', { n: b.signalSoni ?? 0 })}
        </span>
      )}
    </>
  );
}

const keshB = new Map<number, ObyektBolimi[]>();

function ObyektIchi({ tg, yolOch, yolMumkin, bolimlarOl }: { tg: PultTugun; yolOch: Props['yolOch']; yolMumkin: Props['yolMumkin']; bolimlarOl?: BolimlarOl }) {
  const id = Number(tg.id.split(':')[1]);
  const belgi = pultBelgilari(tg.x);
  const [bolimlar, setBolimlar] = useState<ObyektBolimi[] | null>(() => keshB.get(id) ?? null);
  const [xato, setXato] = useState('');
  useEffect(() => {
    if (!bolimlarOl || bolimlar) return;
    let bekor = false;
    void bolimlarOl(id).then((r) => {
      if (bekor) return;
      if (r.ok) { keshB.set(id, r.bolimlar); setBolimlar(r.bolimlar); } else setXato(r.error);
    });
    return () => { bekor = true; };
  }, [id, bolimlarOl, bolimlar]);
  const havolalar: { nom: string; yol: string }[] = [
    { nom: t('Ish varag‘i va smeta'), yol: '/admin/holat/' + id },
    { nom: t('F2 tarixi'), yol: '/admin/f2-tarix?obyekt=' + id },
    { nom: t('Nakopitelniy va F3'), yol: '/admin/nakopitelniy?obyekt=' + id },
    { nom: t('АОСР'), yol: '/admin/aosr?obyekt=' + id },
    { nom: t('Zayavkalar'), yol: '/admin/zayavka?obyekt=' + id },
  ];
  return (
    <div className="mt-2 space-y-2 pl-7" data-testid="pult-obyekt-ichi">
      <div className="flex flex-wrap gap-1.5">
        {havolalar.map((h) => <button key={h.yol} type="button" className="fz-chip hover:bg-[var(--surface-3)] disabled:opacity-50" disabled={!yolMumkin(h.yol)} title={yolMumkin(h.yol) ? undefined : t('Bu sahifaga ruxsatingiz yo‘q')} onClick={() => yolOch(h.yol)}>{h.nom}</button>)}
      </div>
      {belgi && belgi.muammolar.length > 0 && (
        <ul className="space-y-1" aria-label={t('Muammolar')} data-testid="pult-muammolar">
          {belgi.muammolar.map((m) => (
            <li key={m.matn} className="flex items-start gap-1.5 text-[12px] text-text-dim break-words">
              <AlertTriangle aria-hidden className={'mt-0.5 h-3.5 w-3.5 shrink-0 ' + (m.ogoh ? 'text-[var(--danger)]' : 'text-[var(--warn)]')} />
              <span>{m.matn}{m.soni > 1 ? ' ×' + m.soni : ''}</span>
            </li>
          ))}
        </ul>
      )}
      <div>
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.04em] text-text-mute">{t('Smeta bo‘limlari')}</div>
        {xato && <p className="text-[12px] text-[var(--danger)]" role="alert">{xato}</p>}
        {!xato && !bolimlar && <p className="text-[12px] text-text-mute">{t('Yuklanmoqda…')}</p>}
        {bolimlar && bolimlar.length === 0 && <p className="text-[12px] text-text-mute">{t('Smeta bo‘limlari yo‘q (smeta yuklanmagan).')}</p>}
        {bolimlar && bolimlar.length > 0 && (
          <ul className="grid gap-x-4 gap-y-0.5 text-[12px] text-text sm:grid-cols-2" data-testid="pult-bolimlar">
            {bolimlar.map((b) => <li key={b.id} className="break-words">{(b.kod ? b.kod + ' · ' : '') + b.nom}</li>)}
          </ul>
        )}
      </div>
    </div>
  );
}
