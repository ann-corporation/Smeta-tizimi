/**
 * Kompaniya xaritasining yon paneli: tanlangan tugunning asosiy raqamlari va real sahifalarga havolalar.
 * Hech narsa tanlanmagan bo‘lsa — kompaniya umumiy holati (holat halqasi, loyihalar kesimi, diqqat ro‘yxati).
 * Pul — serverdagi ustamasiz qiymat (rz qatorlar yig‘indisi); ustamali summa obyekt holati sahifasida.
 */
import { Link } from 'react-router-dom';
import {
  AlertTriangle, ArrowLeft, Building2, ChevronRight, Clock, ExternalLink, FileText, FolderKanban, HardHat,
  PencilLine, Truck, Users, Warehouse, X, ClipboardList, History, Gauge, ShieldAlert, Info,
} from 'lucide-react';
import type { MindmapGraf, MindmapTugun } from '../../api/t2-mindmap';
import type { Hodisa } from '../../api/t2-hodisa';
import { qachon } from '../../api/t2-hodisa';
import { t, raqamFormatla } from '../../i18n/til';
import {
  boglanganlar, diqqatRoyxati, entityId, HOLAT_TARTIB, JAMOA_ID,
  type XDaraxt, type XHolat, type XTugun,
} from '../../lib/mindmap-korinish';
import { Bajarilish, HolatChiziq, HolatHalqa, Romb } from './belgilar';
import { foizMatn, holatIzohi, holatNomi, pulQ } from './holat';
import { RESURS_YOLI } from '../../lib/mindmap-yollar';
import { Avatar, JamoaPanel, MasullarBlok, OdamPanel, type MasulBoshqaruv } from './XaritaJamoa';
import { guruhNomi as guruhNomiOl } from './jamoa-nomlar';

export type HodisaHolati = { qatorlar: Hodisa[]; yuklanmoqda: boolean; xato: string };

type Props = {
  daraxt: XDaraxt;
  graf: MindmapGraf;
  tanlangan: string | null;
  onTanla: (id: string | null) => void;
  guruhNomi: string;
  hodisalar?: HodisaHolati;
  onTahrirdaOch?: (id: string) => void;
  onHolatFiltr?: (h: XHolat) => void;
  holatFiltri?: XHolat | null;
  /** Mobil ko‘rinishda yopish tugmasi. */
  onYop?: () => void;
  /** Mas'ul biriktirish (v4). Berilmasa — faqat ko‘rsatish. */
  masul?: MasulBoshqaruv;
};

const STAMP: Record<XHolat, string> = { xavf: 'fz-stamp--danger', etibor: 'fz-stamp--warn', yaxshi: 'fz-stamp--ok', nomalum: '' };
const RESURS_IKON: Record<string, typeof FileText> = { shartnoma: FileText, sklad: Warehouse, texnika: Truck, kadr: HardHat, kontragent: Users };
const turNomi = (tur: string): string => ({
  shartnoma: t('Shartnoma'), sklad: t('Sklad'), texnika: t('Texnika'), kadr: t('Xodim'), kontragent: t('Kontragent'),
} as Record<string, string>)[tur] ?? tur;

const SIGNAL_DARAJA: Record<string, string> = { critical: 'fz-note--danger', error: 'fz-note--danger', warning: 'fz-note--warn' };

function Raqam({ nom, qiymat, izoh, rang }: { nom: string; qiymat: string; izoh?: string; rang?: string }) {
  return (
    <div className="fz-kpi min-w-0">
      <span className="fz-kpi__label">{rang && <i style={{ background: rang }} />}{nom}</span>
      <span className="fz-kpi__value text-[18px] leading-6">{qiymat}</span>
      {izoh && <span className="fz-kpi__sub">{izoh}</span>}
    </div>
  );
}

function Havola({ to, ikon: I, matn, asosiy = false }: { to: string; ikon: typeof FileText; matn: string; asosiy?: boolean }) {
  return (
    <Link to={to} className={'fz-btn fz-btn--sm justify-start no-underline ' + (asosiy ? 'fz-btn--primary' : '')}>
      <I aria-hidden />
      <span className="truncate">{matn}</span>
      <ExternalLink aria-hidden className="ml-auto opacity-60" />
    </Link>
  );
}

function PulBloki({ x, pulYoq = false }: { x: XTugun; pulYoq?: boolean }) {
  if (pulYoq) {
    return (
      <section className="fz-panel" data-testid="xarita-pul-yoq">
        <div className="fz-panel__h"><span>{t('Bajarilish')}</span></div>
        <div className="fz-note fz-note--info"><Info aria-hidden /><span>{t('Summalar ko‘rsatilmaydi (moliyaviy ruxsat yo‘q)')}</span></div>
        <div className="grid grid-cols-2 gap-3">
          <Raqam nom={t('Smeta (ustamasiz)')} qiymat="—" izoh={t('moliyaviy ruxsat yo‘q')} />
          <Raqam nom={t('F2 (tasdiqlangan)')} rang="var(--accent)" qiymat="—" izoh={t('moliyaviy ruxsat yo‘q')} />
          <Raqam nom={t('Bajarilgan (fakt)')} rang="var(--info)" qiymat="—" izoh={t('moliyaviy ruxsat yo‘q')} />
        </div>
      </section>
    );
  }
  const qoldiq = x.smeta != null && x.f2 != null ? x.smeta - x.f2 : null;
  const taxm = x.smetaToliq ? '' : '≈ ';
  return (
    <section className="fz-panel">
      <div className="fz-panel__h"><span>{t('Bajarilish')}</span><span className="normal-case tracking-normal font-normal">{t('ustamasiz')}</span></div>
      {!x.f2Tasdiqlangan && x.obyektSoni > 0 && (
        <div className="fz-note fz-note--warn"><AlertTriangle aria-hidden /><span>{t('F2 asosi noma’lum: server hali yangilanmagan, qoralama F2 ham hisoblangan bo‘lishi mumkin.')}</span></div>
      )}
      <Bajarilish faktFoiz={x.faktFoiz} f2Foiz={x.f2Foiz} smetaBor={x.smeta != null} katta />
      <div className="grid grid-cols-2 gap-3">
        <Raqam nom={t('Smeta (ustamasiz)')} qiymat={x.smeta == null ? '—' : taxm + pulQ(x.smeta)} izoh={x.smeta == null ? t('smeta yuklanmagan') : x.smetaToliq ? undefined : t('to‘liq emas')} />
        <Raqam nom={t('F2 (tasdiqlangan)')} rang="var(--accent)" qiymat={pulQ(x.f2)} izoh={foizMatn(x.f2Foiz) + ' · ' + t('qoralama: {x}', { x: pulQ(x.f2Qoralama) })} />
        <Raqam nom={t('Bajarilgan (fakt)')} rang="var(--info)" qiymat={pulQ(x.fakt)} izoh={foizMatn(x.faktFoiz)} />
        <Raqam nom={t('F2 qoralama (tasdiqlanmagan)')} qiymat={x.f2Qoralama == null ? '—' : pulQ(x.f2Qoralama)} izoh={t('F2 ga kirmaydi')} />
        <Raqam nom={t('Qoldiq (smeta − F2 tasdiqlangan)')} qiymat={qoldiq == null ? '—' : taxm + pulQ(qoldiq)} />
      </div>
      {x.oshgan && (
        <div className="fz-note fz-note--warn"><AlertTriangle aria-hidden /><span>{t('F2 fakt yoki smetadan oshgan (overbilling radari) — tekshiring.')}</span></div>
      )}
    </section>
  );
}

/** Ochiq signallar (server `t2_mindmap_signal_summary`): soni, kritik soni va eng og‘ir 3 tasi. `null` — manba yo‘q. */
function SignalBloki({ x }: { x: XTugun }) {
  if (x.signalSoni == null) {
    return <p className="text-[12px] text-text-mute">{t('Signal ma’lumoti yo‘q (server yangilanmagan).')}</p>;
  }
  if (x.signalSoni === 0) return null;
  const qolgan = x.signalSoni - x.topSignallar.length;
  return (
    <section className="space-y-1.5" aria-label={t('Ochiq signallar')} data-testid="xarita-signallar">
      <div className="fz-panel__h"><span className="inline-flex items-center gap-1.5"><ShieldAlert aria-hidden className="h-3.5 w-3.5" />{t('Ochiq signallar')}</span><span>{t('{n} ta · {k} kritik', { n: x.signalSoni, k: x.kritikSoni ?? 0 })}</span></div>
      {x.topSignallar.map((s, i) => (
        <div key={i} className={'fz-note ' + (SIGNAL_DARAJA[s.severity ?? ''] ?? 'fz-note--info')}><AlertTriangle aria-hidden /><span>{s.title || t('Nomsiz signal')}</span></div>
      ))}
      {qolgan > 0 && <p className="text-[11.5px] text-text-mute">{t('Yana {n} ta signal — Tizim boshqaruv markazida.', { n: qolgan })}</p>}
    </section>
  );
}

function ObyektQatori({ x, onTanla, pulYoq = false }: { x: XTugun; onTanla: (id: string) => void; pulYoq?: boolean }) {
  return (
    <button type="button" className="fz-list__q" onClick={() => onTanla(x.id)}>
      <span className="flex min-w-0 items-center gap-2">
        <Romb holat={x.holat} olcham={8} />
        <span className="truncate text-[13px] font-semibold">{x.nom}</span>
      </span>
      <span className="text-right font-mono text-[11.5px] text-text-dim tabular-nums">{x.smeta == null ? (pulYoq ? '—' : t('smeta yo‘q')) : pulQ(x.smeta)}</span>
      <span className="col-span-2"><Bajarilish faktFoiz={x.faktFoiz} f2Foiz={x.f2Foiz} smetaBor={x.smeta != null} /></span>
    </button>
  );
}

function Sarlavha({ kicker, ikon: I, nom, holat, onYop, ortga }: { kicker: string; ikon: typeof FileText; nom: string; holat?: XHolat; onYop?: () => void; ortga?: { matn: string; onClick: () => void } }) {
  return (
    <header className="sticky top-0 z-[1] border-b border-border bg-surface px-4 pb-3 pt-3">
      <div className="flex items-center justify-between gap-2">
        {ortga
          ? <button type="button" className="fz-btn fz-btn--ghost fz-btn--sm -ml-2 max-w-[70%]" onClick={ortga.onClick}><ArrowLeft aria-hidden /><span className="truncate">{ortga.matn}</span></button>
          : <span className="fz-doc__eyebrow inline-flex items-center gap-1.5"><I aria-hidden className="h-3.5 w-3.5" />{kicker}</span>}
        <span className="flex items-center gap-1">
          {holat && <span className={'fz-stamp ' + STAMP[holat]}>{holatNomi(holat)}</span>}
          {onYop && <button type="button" className="fz-btn fz-btn--ghost fz-btn--icon fz-btn--sm" onClick={onYop} aria-label={t('Panelni yopish')}><X /></button>}
        </span>
      </div>
      <h2 className="mt-1.5 text-[18px] font-semibold leading-6 text-text break-words">{nom}</h2>
    </header>
  );
}

export function XaritaPanel({ daraxt, graf, tanlangan, onTanla, guruhNomi, hodisalar, onTahrirdaOch, onHolatFiltr, holatFiltri, onYop, masul }: Props) {
  const x = tanlangan ? daraxt.tugunlar.get(tanlangan) ?? null : null;
  const root = daraxt.tugunlar.get(daraxt.ildiz)!;

  if (!x || x.tur === 'kompaniya') return <KompaniyaPanel root={root} daraxt={daraxt} onTanla={onTanla} guruhNomi={guruhNomi} onHolatFiltr={onHolatFiltr} holatFiltri={holatFiltri} onYop={onYop} />;
  if (x.tur === 'jamoa') return <JamoaPanel daraxt={daraxt} onTanla={onTanla} onYop={onYop} />;
  if (x.tur === 'odam' && x.odam) return <OdamPanel x={x} daraxt={daraxt} onTanla={onTanla} onYop={onYop} rolOzgartir={!!masul?.mumkin} />;
  const ota = x.ota ? daraxt.tugunlar.get(x.ota) : null;
  const ortga = ota ? { matn: ota.tur === 'guruh' ? guruhNomi : (ota.nom || t('Kompaniya')), onClick: () => onTanla(ota.id) } : undefined;

  if (x.tur === 'loyiha' || x.tur === 'guruh') {
    const bolalar = x.bolalar.map((id) => daraxt.tugunlar.get(id)!);
    const boglar = x.manba ? boglanganlar(graf, x.id) : [];
    const qatnashchi = graf.bogichlar.filter((b) => b.tur === 'qatnashchi' && b.maqsad === x.id);
    const byudjet = x.manba?.meta?.byudjet != null ? Number(x.manba.meta.byudjet) : null;
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <Sarlavha kicker={x.tur === 'guruh' ? t('Guruh') : t('Loyiha')} ikon={FolderKanban} nom={x.tur === 'guruh' ? guruhNomi : x.nom} holat={x.holat} onYop={onYop} ortga={ortga} />
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {x.tur === 'guruh' && <div className="fz-note fz-note--info"><AlertTriangle aria-hidden /><span>{t('Bu obyektlar hech bir loyihaga biriktirilmagan. Tahrir rejimida loyihaga bog‘lang.')}</span></div>}
          <PulBloki x={x} pulYoq={daraxt.pulYoq} />
          {x.tur === 'loyiha' && <MasullarBlok x={x} daraxt={daraxt} onTanla={onTanla} masul={masul} />}
          {byudjet != null && Number.isFinite(byudjet) && (
            <section className="fz-panel">
              <div className="fz-panel__h"><span>{t('Loyiha byudjeti')}</span><span>{pulQ(byudjet)}</span></div>
              {x.smeta != null && byudjet > 0 && <div className="text-[12.5px] text-text-dim">{t('Smeta byudjetning {p} qismi', { p: foizMatn(Math.round((x.smeta / byudjet) * 1000) / 10) })}</div>}
            </section>
          )}
          <section className="fz-panel">
            <div className="fz-panel__h"><span>{t('Obyektlar holati')}</span><span>{x.obyektSoni}</span></div>
            <HolatChiziq sanoq={x.holatSanoq} balandlik={10} />
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-text-dim">
              {HOLAT_TARTIB.filter((h) => x.holatSanoq[h] > 0).map((h) => <span key={h} className="inline-flex items-center gap-1.5"><Romb holat={h} olcham={7} />{holatNomi(h) + ' · ' + x.holatSanoq[h]}</span>)}
            </div>
            <div className="fz-list -mx-2 p-0">{bolalar.map((b) => <ObyektQatori key={b.id} x={b} onTanla={onTanla} pulYoq={daraxt.pulYoq} />)}</div>
            {!bolalar.length && <p className="text-[12.5px] text-text-mute">{t('Bu loyihada hali obyekt yo‘q.')}</p>}
          </section>
          {(boglar.length > 0 || qatnashchi.length > 0) && (
            <section className="fz-panel">
              <div className="fz-panel__h"><span>{t('Shartnoma va qatnashchilar')}</span><span>{boglar.length}</span></div>
              <ResursRoyxat tugunlar={boglar} rollar={new Map(qatnashchi.map((q) => [q.manba, q.rol ?? '']))} />
            </section>
          )}
          <div className="grid gap-2">
            {x.tur === 'loyiha' && <Havola to="/admin/loyiha" ikon={FolderKanban} matn={t('Loyihalar sahifasi')} asosiy />}
            {onTahrirdaOch && x.manba && <button type="button" className="fz-btn fz-btn--sm justify-start" onClick={() => onTahrirdaOch(x.id)}><PencilLine aria-hidden />{t('Tahrir rejimida ochish')}</button>}
          </div>
        </div>
      </div>
    );
  }

  // Obyekt
  const oid = entityId(x.id);
  const m = x.manba?.meta ?? null;
  const boglar = boglanganlar(graf, x.id);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Sarlavha kicker={t('Obyekt')} ikon={Building2} nom={x.nom} holat={x.holat} onYop={onYop} ortga={ortga} />
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        <p className="-mt-1 text-[12px] text-text-mute">{holatIzohi(x.holat)}</p>
        {x.belgilar.length > 0 && (
          <section className="space-y-1.5" aria-label={t('Ogohlantirishlar')}>
            {x.belgilar.map((b, i) => (
              <div key={i} className={'fz-note ' + (b.daraja === 'ogoh' ? 'fz-note--danger' : 'fz-note--warn')}><AlertTriangle aria-hidden /><span>{b.matn}</span></div>
            ))}
          </section>
        )}
        <SignalBloki x={x} />
        <MasullarBlok x={x} daraxt={daraxt} onTanla={onTanla} masul={masul} />
        <PulBloki x={x} pulYoq={daraxt.pulYoq} />
        <section className="fz-panel">
          <div className="fz-panel__h"><span>{t('Ma’lumot sifati')}</span></div>
          <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 text-[12.5px]">
            <dt className="text-text-dim">{t('Resurs qatorlari')}</dt><dd className="text-right font-mono tabular-nums">{m?.resurs_qatori == null ? '—' : raqamFormatla(Number(m.resurs_qatori))}</dd>
            <dt className="text-text-dim">{t('Narxsiz qatorlar')}</dt><dd className={'text-right font-mono tabular-nums ' + ((x.narxsiz ?? 0) > 0 ? 'text-danger font-semibold' : '')}>{x.narxsiz == null ? '—' : raqamFormatla(x.narxsiz)}</dd>
            <dt className="text-text-dim">{t('Hisob holati')}</dt><dd className={'text-right ' + (m?.toliq === false ? 'text-warn font-semibold' : '')}>{m?.toliq == null ? '—' : m.toliq ? t('To‘liq') : t('To‘liq emas')}</dd>
            <dt className="text-text-dim">{t('Ochiq zayavkalar')}</dt><dd className={'text-right font-mono tabular-nums ' + ((x.zayavka ?? 0) > 0 ? 'text-warn font-semibold' : '')}>{x.zayavka == null ? '—' : raqamFormatla(x.zayavka)}</dd>
          </dl>
        </section>
        {boglar.length > 0 && (
          <section className="fz-panel">
            <div className="fz-panel__h"><span>{t('Biriktirilgan')}</span><span>{boglar.length}</span></div>
            <ResursRoyxat tugunlar={boglar} />
          </section>
        )}
        {hodisalar && (
          <section className="fz-panel">
            <div className="fz-panel__h"><span className="inline-flex items-center gap-1.5"><Clock aria-hidden className="h-3.5 w-3.5" />{t('So‘nggi hodisalar')}</span></div>
            {hodisalar.yuklanmoqda && <p className="text-[12px] text-text-mute">{t('Hodisa tarixi yuklanmoqda…')}</p>}
            {!hodisalar.yuklanmoqda && hodisalar.xato && <p className="text-[12px] text-warn">{t('Hodisa tarixi o‘qilmadi')}</p>}
            {!hodisalar.yuklanmoqda && !hodisalar.xato && hodisalar.qatorlar.length === 0 && <p className="text-[12px] text-text-mute">{t('Bu obyekt uchun hali hodisa yozilmagan.')}</p>}
            {!hodisalar.yuklanmoqda && hodisalar.qatorlar.length > 0 && (
              <ol className="relative space-y-2.5 border-l border-border pl-3">
                {hodisalar.qatorlar.slice(0, 5).map((h) => (
                  <li key={h.id} className="relative text-[12px]">
                    <span aria-hidden className="absolute -left-[16.5px] top-1.5 h-[7px] w-[7px] rotate-45 bg-[var(--accent)]" />
                    <div className="text-text">{h.satr || h.tafsilot || h.amal_turi}</div>
                    <div className="text-text-mute">{qachon(h.yaratilgan_vaqt) + (h.kim ? ' · ' + h.kim : '')}</div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        )}
        {oid != null && (
          <div className="grid gap-2">
            <Havola to={'/admin/holat/' + oid} ikon={Gauge} matn={t('Obyekt holati')} asosiy />
            <Havola to={'/admin/f2-tarix?obyekt=' + oid} ikon={History} matn={t('F2 tarixi')} />
            <Havola to={'/admin/fakt?obyekt=' + oid} ikon={ClipboardList} matn={t('Fakt (bajarilgan ishlar)')} />
            <Havola to={'/admin/zayavka?obyekt=' + oid} ikon={FileText} matn={t('Zayavkalar')} />
            {onTahrirdaOch && <button type="button" className="fz-btn fz-btn--sm justify-start" onClick={() => onTahrirdaOch(x.id)}><PencilLine aria-hidden />{t('Tahrir rejimida ochish')}</button>}
          </div>
        )}
        <p className="text-[11.5px] leading-4 text-text-mute">{t('Summalar ustamasiz (smeta bo‘limlari yig‘indisi). Ustamali summa — «Obyekt holati» sahifasida.')}</p>
      </div>
    </div>
  );
}

function ResursRoyxat({ tugunlar, rollar }: { tugunlar: MindmapTugun[]; rollar?: Map<string, string> }) {
  const tartib = ['shartnoma', 'kontragent', 'sklad', 'texnika', 'kadr'];
  const sort = [...tugunlar].sort((a, b) => tartib.indexOf(a.tur) - tartib.indexOf(b.tur) || a.nom.localeCompare(b.nom));
  return (
    <ul className="space-y-1">
      {sort.map((r) => {
        const I = RESURS_IKON[r.tur] ?? FileText;
        const rol = rollar?.get(r.id);
        const qoshimcha = r.tur === 'shartnoma' && r.meta?.summa != null ? pulQ(Number(r.meta.summa)) : rol || (r.tur === 'kadr' ? r.meta?.lavozim : r.tur === 'texnika' ? r.meta?.davlat_raqami : '') || '';
        return (
          <li key={r.id}>
            <Link to={RESURS_YOLI[r.tur] ?? '/admin'} className="group flex items-center gap-2 rounded-[var(--radius-sm)] px-1.5 py-1 text-[12.5px] text-text no-underline hover:bg-[var(--surface-3)]">
              <I aria-hidden className="h-3.5 w-3.5 shrink-0 text-text-mute" />
              <span className="min-w-0 flex-1 truncate">{r.nom}</span>
              <span className="fz-chip">{turNomi(r.tur)}</span>
              {qoshimcha && <span className="max-w-[90px] truncate font-mono text-[11px] text-text-mute">{String(qoshimcha)}</span>}
              <ChevronRight aria-hidden className="h-3.5 w-3.5 text-text-mute opacity-0 group-hover:opacity-100" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function KompaniyaPanel({ root, daraxt, onTanla, guruhNomi, onHolatFiltr, holatFiltri, onYop }: {
  root: XTugun; daraxt: XDaraxt; onTanla: (id: string | null) => void; guruhNomi: string;
  onHolatFiltr?: (h: XHolat) => void; holatFiltri?: XHolat | null; onYop?: () => void;
}) {
  const loyihalar = root.bolalar.map((id) => daraxt.tugunlar.get(id)!);
  const maxS = Math.max(0, ...loyihalar.map((l) => l.smeta ?? 0));
  const diqqat = diqqatRoyxati(daraxt, 6);
  const b = daraxt.biriktirilmagan;
  const biriktirilmagan = [
    { n: b.shartnoma, nom: t('shartnoma') }, { n: b.sklad, nom: t('sklad') }, { n: b.texnika, nom: t('texnika') },
    { n: b.kadr, nom: t('xodim') }, { n: b.kontragent, nom: t('kontragent') },
  ].filter((q) => q.n > 0);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Sarlavha kicker={t('Kompaniya')} ikon={Building2} nom={root.nom || t('Kompaniya')} holat={root.obyektSoni ? root.holat : undefined} onYop={onYop} />
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        <section className="fz-panel">
          <div className="fz-panel__h"><span>{t('Obyektlar holati')}</span><span>{t('bosing — filtr')}</span></div>
          <div className="flex items-center gap-4">
            <HolatHalqa sanoq={root.holatSanoq} onTanla={onHolatFiltr} faol={holatFiltri} />
            <ul className="min-w-0 flex-1 space-y-1.5 text-[12.5px]">
              {HOLAT_TARTIB.map((h) => (
                <li key={h}>
                  <button type="button" disabled={!onHolatFiltr} onClick={() => onHolatFiltr?.(h)} aria-pressed={holatFiltri === h}
                    className={'flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-1.5 py-0.5 text-left hover:bg-[var(--surface-3)] ' + (holatFiltri === h ? 'bg-[var(--accent-soft)]' : '')}>
                    <Romb holat={h} olcham={8} />
                    <span className="flex-1 text-text-dim">{holatNomi(h)}</span>
                    <b className="font-mono tabular-nums text-text">{root.holatSanoq[h]}</b>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="fz-panel">
          <div className="fz-panel__h"><span>{t('Loyihalar kesimi')}</span><span>{t('smeta · F2')}</span></div>
          <ul className="space-y-2.5">
            {loyihalar.map((l) => (
              <li key={l.id}>
                <button type="button" onClick={() => onTanla(l.id)} className="block w-full rounded-[var(--radius-sm)] px-1 py-0.5 text-left hover:bg-[var(--surface-3)]">
                  <span className="flex items-baseline justify-between gap-2 text-[12.5px]">
                    <span className="flex min-w-0 items-center gap-1.5"><Romb holat={l.holat} olcham={7} /><span className="truncate font-semibold text-text">{l.tur === 'guruh' ? guruhNomi : l.nom}</span></span>
                    <span className="shrink-0 font-mono text-[11.5px] text-text-dim tabular-nums">{l.smeta == null ? '—' : (l.smetaToliq ? '' : '≈ ') + pulQ(l.smeta)}</span>
                  </span>
                  {/* Uzunlik — smeta ulushi (eng kattasiga nisbatan), ichidagi to‘ldirish — F2 va fakt foizi. */}
                  <span className="mt-1 block" style={{ width: (l.smeta != null && maxS > 0 ? Math.max(18, (l.smeta / maxS) * 100) : 18) + '%' }}>
                    <Bajarilish faktFoiz={l.faktFoiz} f2Foiz={l.f2Foiz} smetaBor={l.smeta != null} />
                  </span>
                </button>
              </li>
            ))}
            {!loyihalar.length && <li className="text-[12.5px] text-text-mute">{t('Hali loyiha yo‘q.')}</li>}
          </ul>
          <div className="flex flex-wrap gap-3 text-[11.5px] text-text-mute">
            <span className="inline-flex items-center gap-1.5"><i className="inline-block h-2 w-3 rounded-sm bg-[var(--accent)]" />{t('F2 bilan topshirilgan')}</span>
            <span className="inline-flex items-center gap-1.5"><i className="inline-block h-2 w-3 rounded-sm bg-[var(--info)]" />{t('bajarilgan, F2 siz')}</span>
          </div>
        </section>

        <section className="fz-panel">
          <div className="fz-panel__h"><span>{t('Diqqat markazida')}</span><span>{diqqat.length}</span></div>
          {diqqat.length === 0 && <p className="text-[12.5px] text-text-dim">{t('Ogohlantirish belgisi bor obyekt yo‘q.')}</p>}
          <ul className="space-y-1">
            {diqqat.map((o) => (
              <li key={o.id}>
                <button type="button" onClick={() => onTanla(o.id)} className="flex w-full items-start gap-2 rounded-[var(--radius-sm)] px-1.5 py-1 text-left hover:bg-[var(--surface-3)]">
                  <Romb holat={o.holat} olcham={8} className="mt-1.5" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold text-text">{o.nom}</span>
                    <span className="block truncate text-[11.5px] text-text-mute">{[...o.belgilar.map((q) => q.matn), ...o.topSignallar.map((q) => q.title ?? '').filter(Boolean)].join(' · ') || (o.oshgan ? t('F2 ortiqcha') : '')}</span>
                  </span>
                  <ChevronRight aria-hidden className="mt-1 h-3.5 w-3.5 text-text-mute" />
                </button>
              </li>
            ))}
          </ul>
        </section>

        {daraxt.jamoa && (
          <section className="fz-panel" data-testid="xarita-jamoa-qisqa">
            <div className="fz-panel__h"><span>{t('Jamoa')}</span><span>{daraxt.jamoa.odamlar.size}</span></div>
            <ul className="space-y-1">
              {daraxt.jamoa.guruhlar.map((g) => (
                <li key={g.kalit}>
                  <button type="button" onClick={() => onTanla(g.odamlar[0])} className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-1.5 py-1 text-left hover:bg-[var(--surface-3)]">
                    <span className="flex -space-x-1.5">{g.odamlar.slice(0, 3).map((id) => <Avatar key={id} initsial={daraxt.jamoa!.odamlar.get(id)!.initsial} olcham={22} />)}</span>
                    <span className="flex-1 text-[12.5px] text-text-dim">{guruhNomiOl(g.kalit)}</span>
                    <b className="font-mono text-[12px] tabular-nums text-text">{g.odamlar.length}</b>
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className="fz-btn fz-btn--sm justify-start" onClick={() => onTanla(JAMOA_ID)}><Users aria-hidden />{t('Butun jamoani ochish')}</button>
          </section>
        )}
        {biriktirilmagan.length > 0 && (
          <div className="fz-note fz-note--info">
            <AlertTriangle aria-hidden />
            <span>{t('Hech bir obyekt yoki loyihaga biriktirilmagan: {r}', { r: biriktirilmagan.map((q) => q.n + ' ' + q.nom).join(', ') })}</span>
          </div>
        )}
        <p className="text-[11.5px] leading-4 text-text-mute">{t('Summalar ustamasiz (smeta bo‘limlari yig‘indisi). Ustamali summa — «Obyekt holati» sahifasida.')}</p>
      </div>
    </div>
  );
}
