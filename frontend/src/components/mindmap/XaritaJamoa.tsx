/**
 * «Jamoa» — kompaniya a'zolari xaritada (2-bosqich): avatar, rol, mas'ul bo'lgan obyektlar va mas'ul biriktirish.
 * Ma'lumot — `t2_mindmap_grafi_v4` (foydalanuvchi tugunlari + masul_* chiziqlari). Yozish — faqat `onSaqla` (ota komponent).
 */
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Building2, ExternalLink, FolderKanban, Plus, UserCog, Users, X } from 'lucide-react';
import { t } from '../../i18n/til';
import type { MasulRuxsat } from '../../api/t2-mindmap';
import { JAMOA_ID, type XDaraxt, type XOdam, type XTugun } from '../../lib/mindmap-korinish';
import { AZOLAR_YOLI, guruhNomi, rolNomi, ruxsatNomi } from './jamoa-nomlar';

export type MasulSaqlaArgs = { obyektId?: number; loyihaId?: number; foydalanuvchiId: number; ruxsat: MasulRuxsat | null };
export type MasulNatija = { ok: boolean; error?: string };
export interface MasulBoshqaruv {
  /** Viewer biriktira/olib tashlay oladimi (`mindmapMasulRuxsati`). */
  mumkin: boolean;
  onSaqla(a: MasulSaqlaArgs): Promise<MasulNatija>;
}

export function Avatar({ initsial, olcham = 24, title }: { initsial: string; olcham?: number; title?: string }) {
  return (
    <span aria-hidden title={title} data-avatar
      className="inline-flex shrink-0 items-center justify-center rounded-full border border-[var(--accent)] bg-[var(--accent-soft)] font-semibold text-[var(--accent-text)]"
      style={{ width: olcham, height: olcham, fontSize: Math.max(9, olcham * 0.42) }}>{initsial}</span>
  );
}

/** Obyekt/loyiha uchun mas'ullar bloki + (ruxsat bo'lsa) biriktirish va olib tashlash. */
export function MasullarBlok({ x, daraxt, onTanla, masul }: { x: XTugun; daraxt: XDaraxt; onTanla: (id: string) => void; masul?: MasulBoshqaruv }) {
  const [tanlanganOdam, setTanlanganOdam] = useState('');
  const [ruxsat, setRuxsat] = useState<MasulRuxsat>('write');
  const [band, setBand] = useState(false);
  const [xato, setXato] = useState('');
  if (!daraxt.jamoa) return null; // server odamlarni yubormagan (eski RPC) — blok yo'q
  const nishonId = Number(x.id.split(':')[1]);
  const obyekt = x.tur === 'obyekt';
  const mavjud = new Set(x.masullar.map((m) => m.odamId));
  const nomzodlar = [...daraxt.jamoa.odamlar.values()].filter((o) => o.sonId != null && !mavjud.has(o.id)).sort((a, b) => a.nom.localeCompare(b.nom));
  const boshqarish = !!masul?.mumkin && Number.isSafeInteger(nishonId) && nishonId > 0;

  const saqla = async (foydalanuvchiId: number, r: MasulRuxsat | null) => {
    if (!masul) return;
    setBand(true); setXato('');
    const natija = await masul.onSaqla({ ...(obyekt ? { obyektId: nishonId } : { loyihaId: nishonId }), foydalanuvchiId, ruxsat: r });
    setBand(false);
    if (!natija.ok) setXato(natija.error || t('Mas‘ul saqlanmadi'));
    else setTanlanganOdam('');
  };

  return (
    <section className="fz-panel" aria-label={t('Mas‘ullar')} data-testid="xarita-masullar">
      <div className="fz-panel__h"><span className="inline-flex items-center gap-1.5"><UserCog aria-hidden className="h-3.5 w-3.5" />{t('Mas‘ullar')}</span><span>{x.masullar.length}</span></div>
      {x.masullar.length === 0 && <p className="text-[12.5px] text-text-mute">{t('Hali mas‘ul biriktirilmagan.')}</p>}
      <ul className="space-y-1">
        {x.masullar.map((m) => (
          <li key={m.odamId} className="flex items-center gap-2">
            <button type="button" onClick={() => onTanla(m.odamId)} className="flex min-w-0 flex-1 items-center gap-2 rounded-[var(--radius-sm)] px-1.5 py-1 text-left hover:bg-[var(--surface-3)]">
              <Avatar initsial={m.initsial} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold text-text">{m.nom}</span>
                <span className="block truncate text-[11.5px] text-text-mute">{rolNomi(m.rol)}</span>
              </span>
              <span className="fz-chip">{ruxsatNomi(m.ruxsat)}</span>
            </button>
            {boshqarish && (() => {
              const o = daraxt.jamoa!.odamlar.get(m.odamId);
              return o?.sonId != null ? (
                <button type="button" disabled={band} className="fz-btn fz-btn--ghost fz-btn--icon fz-btn--sm" onClick={() => void saqla(o.sonId!, null)}
                  aria-label={t('Mas‘ullikni olib tashlash: {nom}', { nom: m.nom })} title={t('Olib tashlash')}><X /></button>
              ) : null;
            })()}
          </li>
        ))}
      </ul>
      {boshqarish && (
        <div className="space-y-2 border-t border-border pt-2" data-testid="xarita-masul-biriktir">
          {nomzodlar.length === 0
            ? <p className="text-[12px] text-text-mute">{t('Biriktiriladigan boshqa a’zo yo‘q.')}</p>
            : (
              <>
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <select data-masul-fokus value={tanlanganOdam} onChange={(e) => setTanlanganOdam(e.target.value)} aria-label={t('A’zo')}
                    className="h-8 min-w-0 rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-surface px-2 text-[12.5px]">
                    <option value="">{t('A’zoni tanlang…')}</option>
                    {nomzodlar.map((o) => <option key={o.id} value={o.id}>{o.nom + ' · ' + rolNomi(o.rol)}</option>)}
                  </select>
                  <select value={ruxsat} onChange={(e) => setRuxsat(e.target.value as MasulRuxsat)} aria-label={t('Ruxsat darajasi')}
                    className="h-8 rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-surface px-2 text-[12.5px]">
                    <option value="read">{ruxsatNomi('read')}</option>
                    <option value="write">{ruxsatNomi('write')}</option>
                    <option value="manage">{ruxsatNomi('manage')}</option>
                  </select>
                </div>
                <button type="button" className="fz-btn fz-btn--sm fz-btn--primary w-full justify-center" disabled={band || !tanlanganOdam}
                  onClick={() => { const o = daraxt.jamoa!.odamlar.get(tanlanganOdam); if (o?.sonId != null) void saqla(o.sonId, ruxsat); }}>
                  <Plus aria-hidden />{t('Mas‘ul biriktirish')}
                </button>
                <p className="text-[11.5px] leading-4 text-text-mute">{t('Diqqat: ofis xodimiga birinchi biriktirish xaritada uning ko‘rinishini faqat biriktirilgan obyektlar bilan cheklaydi.')}</p>
              </>
            )}
          {xato && <div className="fz-note fz-note--danger" role="alert"><span>{xato}</span></div>}
        </div>
      )}
    </section>
  );
}

function BiriktirmaQator({ id, ruxsat, daraxt, onTanla }: { id: string; ruxsat: string | null; daraxt: XDaraxt; onTanla: (id: string) => void }) {
  const n = daraxt.tugunlar.get(id);
  if (!n) return null;
  return (
    <li>
      <button type="button" onClick={() => onTanla(id)} className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-1.5 py-1 text-left hover:bg-[var(--surface-3)]">
        {n.tur === 'obyekt' ? <Building2 aria-hidden className="h-3.5 w-3.5 text-text-mute" /> : <FolderKanban aria-hidden className="h-3.5 w-3.5 text-text-mute" />}
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-text">{n.nom}</span>
        <span className="fz-chip">{ruxsatNomi(ruxsat)}</span>
      </button>
    </li>
  );
}

function PanelSarlavha({ kicker, nom, ortga, onYop, amallar }: { kicker: string; nom: string; ortga?: { matn: string; onClick: () => void }; onYop?: () => void; amallar?: ReactNode }) {
  return (
    <header className="sticky top-0 z-[1] border-b border-border bg-surface px-4 pb-3 pt-3">
      <div className="flex items-center justify-between gap-2">
        {ortga
          ? <button type="button" className="fz-btn fz-btn--ghost fz-btn--sm -ml-2 max-w-[70%]" onClick={ortga.onClick}><ArrowLeft aria-hidden /><span className="truncate">{ortga.matn}</span></button>
          : <span className="fz-doc__eyebrow inline-flex items-center gap-1.5"><Users aria-hidden className="h-3.5 w-3.5" />{kicker}</span>}
        {onYop && <button type="button" className="fz-btn fz-btn--ghost fz-btn--icon fz-btn--sm" onClick={onYop} aria-label={t('Panelni yopish')}><X /></button>}
      </div>
      <div className="mt-1.5 flex items-start justify-between gap-2">
        <h2 className="min-w-0 break-words text-[18px] font-semibold leading-6 text-text">{nom}</h2>
        {amallar && <span className="shrink-0">{amallar}</span>}
      </div>
    </header>
  );
}

/** Tanlangan odam: rol, mas'ul bo'lgan obyekt/loyihalar, rolni o'zgartirish havolasi. */
export function OdamPanel({ x, daraxt, onTanla, onYop, rolOzgartir, amallar }: { x: XTugun; daraxt: XDaraxt; onTanla: (id: string | null) => void; onYop?: () => void; rolOzgartir: boolean; amallar?: ReactNode }) {
  const o = x.odam as XOdam;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelSarlavha kicker={t('A’zo')} nom={o.nom} ortga={{ matn: t('Jamoa'), onClick: () => onTanla(JAMOA_ID) }} onYop={onYop} amallar={amallar} />
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        <section className="fz-panel" data-testid="xarita-odam">
          <div className="flex items-center gap-3">
            <Avatar initsial={o.initsial} olcham={40} />
            <div className="min-w-0">
              <div className="text-[13.5px] font-semibold text-text">{(o.rollar.length ? o.rollar : [o.rol]).map((r) => rolNomi(r)).join(', ')}</div>
              {o.login && <div className="truncate font-mono text-[11.5px] text-text-mute">{o.login}</div>}
            </div>
          </div>
        </section>
        <section className="fz-panel">
          <div className="fz-panel__h"><span>{t('Mas‘ul bo‘lgan obyektlar')}</span><span>{o.obyektlar.length}</span></div>
          {o.obyektlar.length === 0 && <p className="text-[12.5px] text-text-mute">{t('Hali obyekt biriktirilmagan.')}</p>}
          <ul className="space-y-0.5">{o.obyektlar.map((b) => <BiriktirmaQator key={b.id} id={b.id} ruxsat={b.ruxsat} daraxt={daraxt} onTanla={onTanla} />)}</ul>
        </section>
        {o.loyihalar.length > 0 && (
          <section className="fz-panel">
            <div className="fz-panel__h"><span>{t('Mas‘ul bo‘lgan loyihalar')}</span><span>{o.loyihalar.length}</span></div>
            <ul className="space-y-0.5">{o.loyihalar.map((b) => <BiriktirmaQator key={b.id} id={b.id} ruxsat={b.ruxsat} daraxt={daraxt} onTanla={onTanla} />)}</ul>
          </section>
        )}
        {rolOzgartir && (
          <Link to={AZOLAR_YOLI} className="fz-btn fz-btn--sm justify-start no-underline">
            <UserCog aria-hidden /><span className="truncate">{t('Rolni o‘zgartirish (A’zolar)')}</span><ExternalLink aria-hidden className="ml-auto opacity-60" />
          </Link>
        )}
      </div>
    </div>
  );
}

/** «Jamoa» tuguni paneli: guruhlar bo'yicha odamlar. */
export function JamoaPanel({ daraxt, onTanla, onYop, amallar }: { daraxt: XDaraxt; onTanla: (id: string | null) => void; onYop?: () => void; amallar?: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelSarlavha kicker={t('Jamoa')} nom={t('Jamoa')} ortga={{ matn: t('Kompaniya'), onClick: () => onTanla(daraxt.ildiz) }} onYop={onYop} amallar={amallar} />
      <div className="flex-1 space-y-3 overflow-y-auto p-4"><JamoaGuruhlar daraxt={daraxt} onTanla={onTanla} /></div>
    </div>
  );
}

/** Guruhlangan ro'yxat (panel va «Ro'yxat» ko'rinishida bir xil). */
export function JamoaGuruhlar({ daraxt, onTanla, korinadi }: { daraxt: XDaraxt; onTanla: (id: string) => void; korinadi?: (id: string) => boolean }) {
  if (!daraxt.jamoa) return null;
  return (
    <>
      {daraxt.jamoa.guruhlar.map((g) => {
        const idlar = g.odamlar.filter((id) => !korinadi || korinadi(id));
        if (!idlar.length) return null;
        return (
          <section key={g.kalit} className="fz-panel" aria-label={guruhNomi(g.kalit)}>
            <div className="fz-panel__h"><span>{guruhNomi(g.kalit)}</span><span>{idlar.length}</span></div>
            <ul className="space-y-0.5">
              {idlar.map((id) => {
                const o = daraxt.jamoa!.odamlar.get(id)!;
                return (
                  <li key={id}>
                    <button type="button" onClick={() => onTanla(id)} className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-1.5 py-1 text-left hover:bg-[var(--surface-3)]">
                      <Avatar initsial={o.initsial} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-semibold text-text">{o.nom}</span>
                        <span className="block truncate text-[11.5px] text-text-mute">{rolNomi(o.rol)}</span>
                      </span>
                      <span className="shrink-0 text-[11.5px] text-text-dim tabular-nums" title={t('Mas‘ul obyektlar soni')}>{t('{n} ta obyekt', { n: o.obyektlar.length })}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </>
  );
}
