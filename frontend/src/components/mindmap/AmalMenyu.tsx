/**
 * Tugun amallari menyusi (A1): ixcham popover — o‘ng tugma, panel sarlavhasidagi «⋯ Amallar», klaviatura (ContextMenu
 * yoki Shift+F10). Amallar ro‘yxati — `lib/mindmap-amallar` reestridan (bu fayl faqat chizadi va bajaradi).
 * Yozuvchi amallar faqat mavjud buyruqlar orqali (`MasulBoshqaruv.onSaqla`, `VazifaBoshqaruv.onBer`) — ruxsat va audit serverda.
 */
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as RKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  Building2, ClipboardCheck, ClipboardList, CreditCard, FileSignature, FileText, FolderKanban, Gauge, HardHat, History,
  Layers, Link2, ListTree, Lock, Pencil, Plus, Sigma, Truck, Unlink, Upload, UserCog, UserPlus, Users, Warehouse, type LucideIcon,
} from 'lucide-react';
import { t } from '../../i18n/til';
import { menyuJoyi, type Amal, type AmalIkon } from '../../lib/mindmap-amallar';
import type { MasulRuxsat } from '../../api/t2-mindmap';
import type { XDaraxt } from '../../lib/mindmap-korinish';
import { ModalOyna } from '../pto-workspace/ModalOyna';
import type { MasulBoshqaruv } from './XaritaJamoa';
import { rolNomi, ruxsatNomi } from './jamoa-nomlar';

const IKON: Record<AmalIkon, LucideIcon> = {
  gauge: Gauge, fakt: ClipboardList, f2: FileSignature, tarix: History, jamlanma: Sigma, yuklash: Upload, zayavka: FileText,
  yangi: Plus, masul: UserPlus, vazifa: ClipboardCheck, royxat: ListTree, loyiha: FolderKanban, hujjat: Layers,
  shartnoma: FileSignature, tolov: CreditCard, sklad: Warehouse, odamlar: Users, rol: UserCog, kontragent: Building2,
  texnika: Truck, kadr: HardHat, ulash: Link2, uzish: Unlink, nomlash: Pencil,
};

export type MenyuHolati = { nishonNom: string; amallar: Amal[]; x: number; y: number };

export function AmalMenyu({ holat, onYop, onBajar }: { holat: MenyuHolati; onYop: () => void; onBajar: (a: Amal) => void }) {
  const quti = useRef<HTMLDivElement>(null);
  const [joy, setJoy] = useState<{ left: number; top: number }>({ left: holat.x, top: holat.y });
  const yopRef = useRef(onYop);
  yopRef.current = onYop;

  useLayoutEffect(() => {
    const el = quti.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setJoy(menyuJoyi(holat.x, holat.y, r.width, r.height, window.innerWidth, window.innerHeight));
  }, [holat.x, holat.y, holat.amallar.length]);

  useEffect(() => {
    const oldingi = document.activeElement as HTMLElement | null;
    const birinchi = quti.current?.querySelector<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])') ?? quti.current?.querySelector<HTMLElement>('[role="menuitem"]');
    birinchi?.focus();
    const tashqi = (e: PointerEvent) => { if (quti.current && !quti.current.contains(e.target as Node)) yopRef.current(); };
    const tugma = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); yopRef.current(); } };
    const aylan = () => yopRef.current();
    document.addEventListener('pointerdown', tashqi, true);
    window.addEventListener('keydown', tugma, true);
    window.addEventListener('resize', aylan);
    return () => {
      document.removeEventListener('pointerdown', tashqi, true);
      window.removeEventListener('keydown', tugma, true);
      window.removeEventListener('resize', aylan);
      if (oldingi && document.contains(oldingi)) oldingi.focus?.({ preventScroll: true });
    };
  }, []);

  const klaviatura = (e: RKeyboardEvent) => {
    const bandlar = [...(quti.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const i = bandlar.indexOf(document.activeElement as HTMLElement);
    const otish = (j: number) => { e.preventDefault(); bandlar[(j + bandlar.length) % bandlar.length]?.focus(); };
    if (e.key === 'ArrowDown') otish(i + 1);
    else if (e.key === 'ArrowUp') otish(i - 1);
    else if (e.key === 'Home') otish(0);
    else if (e.key === 'End') otish(bandlar.length - 1);
    else if (e.key === 'Tab') { e.preventDefault(); onYop(); }
  };

  const bosh = holat.amallar.length === 0;
  return createPortal(
    <div ref={quti} role="menu" aria-label={t('Amallar: {nom}', { nom: holat.nishonNom })} data-testid="mindmap-amal-menyu" onKeyDown={klaviatura}
      onContextMenu={(e) => e.preventDefault()}
      className="karta fixed z-[70] w-[264px] max-w-[calc(100vw-16px)] overflow-y-auto rounded-[var(--radius-md)] border border-border bg-surface p-1 shadow-[var(--shadow-pop)]"
      style={{ left: joy.left, top: joy.top, maxHeight: 'calc(100vh - 16px)' }}>
      <div className="truncate px-2 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-text-mute">{holat.nishonNom}</div>
      {bosh && <p className="px-2 py-1.5 text-[12.5px] text-text-mute">{t('Bu tugun uchun amal yo‘q.')}</p>}
      {holat.amallar.map((a) => {
        const I = IKON[a.ikon];
        return (
          <button key={a.kalit} type="button" role="menuitem" data-amal={a.kalit} aria-disabled={!a.mumkin}
            title={a.sabab ?? undefined}
            onClick={() => { if (a.mumkin) onBajar(a); }}
            className={'flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-[12.5px] outline-none focus-visible:bg-[var(--surface-3)] ' +
              (a.mumkin ? 'text-text hover:bg-[var(--surface-3)]' : 'cursor-not-allowed text-text-mute')}>
            <I aria-hidden className="h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 flex-1 truncate">{a.nom}</span>
            {!a.mumkin && <Lock aria-hidden className="h-3 w-3 shrink-0" />}
          </button>
        );
      })}
    </div>,
    document.body,
  );
}

/* ───────────── Modal amallar (mavjud buyruqlar) ───────────── */

export type VazifaBerArgs = { sarlavha: string; muddat?: string; obyektId?: number | null; foydalanuvchiId?: number | null };
export interface VazifaBoshqaruv {
  onBer(a: VazifaBerArgs): Promise<{ ok: boolean; error?: string }>;
}

const maydon = 'h-8 w-full min-w-0 rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-surface px-2 text-[12.5px]';

/** Odamni obyekt yoki loyihaga mas‘ul qilish — mavjud `t2_mindmap_masul_v1` (MasulBoshqaruv.onSaqla). */
export function MasulQilishModal({ daraxt, odamId, masul, onYop }: { daraxt: XDaraxt; odamId: string; masul: MasulBoshqaruv; onYop: () => void }) {
  const odam = daraxt.jamoa?.odamlar.get(odamId) ?? null;
  const band = new Set([...(odam?.obyektlar ?? []), ...(odam?.loyihalar ?? [])].map((b) => b.id));
  const nishonlar = [...daraxt.tugunlar.values()]
    .filter((x) => (x.tur === 'obyekt' || x.tur === 'loyiha') && x.manba && !band.has(x.id))
    .sort((a, b) => (a.tur === b.tur ? a.nom.localeCompare(b.nom) : a.tur === 'loyiha' ? -1 : 1));
  const [nishon, setNishon] = useState('');
  const [ruxsat, setRuxsat] = useState<MasulRuxsat>('write');
  const [ish, setIsh] = useState(false);
  const [xato, setXato] = useState('');
  const saqla = async () => {
    const [tur, idS] = nishon.split(':');
    const id = Number(idS);
    if (!odam?.sonId || !Number.isSafeInteger(id) || id <= 0) return;
    setIsh(true); setXato('');
    const r = await masul.onSaqla({ ...(tur === 'obyekt' ? { obyektId: id } : { loyihaId: id }), foydalanuvchiId: odam.sonId, ruxsat });
    setIsh(false);
    if (r.ok) onYop(); else setXato(r.error || t('Mas‘ul saqlanmadi'));
  };
  return (
    <ModalOyna sarlavha="Mas‘ul qilish…" ikon={<UserPlus aria-hidden className="h-4 w-4 text-accent" />} yop={onYop} kenglik={440}>
      <div className="space-y-3" data-testid="mindmap-masul-modal">
        <p className="text-[12.5px] text-text-dim">{odam ? odam.nom + ' · ' + rolNomi(odam.rol) : '—'}</p>
        {nishonlar.length === 0
          ? <p className="text-[12.5px] text-text-mute">{t('Biriktiriladigan obyekt yoki loyiha qolmagan.')}</p>
          : (
            <>
              <label className="block space-y-1 text-[12px] text-text-dim">
                <span>{t('Obyekt yoki loyiha')}</span>
                <select autoFocus value={nishon} onChange={(e) => setNishon(e.target.value)} className={maydon}>
                  <option value="">{t('Tanlang…')}</option>
                  {nishonlar.map((x) => <option key={x.id} value={x.id}>{(x.tur === 'loyiha' ? t('Loyiha') : t('Obyekt')) + ': ' + x.nom}</option>)}
                </select>
              </label>
              <label className="block space-y-1 text-[12px] text-text-dim">
                <span>{t('Ruxsat darajasi')}</span>
                <select value={ruxsat} onChange={(e) => setRuxsat(e.target.value as MasulRuxsat)} className={maydon}>
                  {(['read', 'write', 'manage'] as const).map((r) => <option key={r} value={r}>{ruxsatNomi(r)}</option>)}
                </select>
              </label>
              <p className="text-[11.5px] leading-4 text-text-mute">{t('Diqqat: ofis xodimiga birinchi biriktirish xaritada uning ko‘rinishini faqat biriktirilgan obyektlar bilan cheklaydi.')}</p>
            </>
          )}
        {xato && <div className="fz-note fz-note--danger" role="alert"><span>{xato}</span></div>}
        <div className="flex justify-end gap-2">
          <button type="button" className="fz-btn fz-btn--sm" onClick={onYop}>{t('Bekor qilish')}</button>
          <button type="button" className="fz-btn fz-btn--sm fz-btn--primary" disabled={ish || !nishon} onClick={() => void saqla()}>
            <UserPlus aria-hidden />{t('Mas‘ul biriktirish')}
          </button>
        </div>
      </div>
    </ModalOyna>
  );
}

/** Topshiriq berish — mavjud `t2_topshiriq_ber_v1` (/api/topshiriq). Ijrochi yoki obyekt nishondan oldindan tanlanadi. */
export function VazifaModal({ daraxt, odamId, obyektId, vazifa, onYop }: {
  daraxt: XDaraxt; odamId?: string | null; obyektId?: number | null; vazifa: VazifaBoshqaruv; onYop: () => void;
}) {
  const odamlar = [...(daraxt.jamoa?.odamlar.values() ?? [])].filter((o) => o.sonId != null).sort((a, b) => a.nom.localeCompare(b.nom));
  const obyektlar = [...daraxt.tugunlar.values()].filter((x) => x.tur === 'obyekt' && x.manba).sort((a, b) => a.nom.localeCompare(b.nom));
  const [sarlavha, setSarlavha] = useState('');
  const [muddat, setMuddat] = useState('');
  const [ijrochi, setIjrochi] = useState(odamId ?? '');
  const [obyekt, setObyekt] = useState(obyektId != null ? 'obyekt:' + obyektId : '');
  const [ish, setIsh] = useState(false);
  const [xato, setXato] = useState('');
  const [tayyor, setTayyor] = useState(false);
  const ber = async () => {
    if (!sarlavha.trim()) return;
    const o = ijrochi ? daraxt.jamoa?.odamlar.get(ijrochi) : null;
    const oid = obyekt ? Number(obyekt.split(':')[1]) : null;
    setIsh(true); setXato('');
    const r = await vazifa.onBer({ sarlavha: sarlavha.trim(), muddat: muddat || undefined, obyektId: oid, foydalanuvchiId: o?.sonId ?? null });
    setIsh(false);
    if (r.ok) setTayyor(true); else setXato(r.error || t('Amal bajarilmadi.'));
  };
  return (
    <ModalOyna sarlavha="Topshiriq berish…" ikon={<ClipboardCheck aria-hidden className="h-4 w-4 text-accent" />} yop={onYop} kenglik={460}>
      {tayyor ? (
        <div className="space-y-3" data-testid="mindmap-vazifa-tayyor">
          <div className="fz-note fz-note--info" role="status"><ClipboardCheck aria-hidden /><span>{t('Topshiriq berildi. Holatini «Mening topshiriqlarim» sahifasida kuzating.')}</span></div>
          <div className="flex justify-end"><button type="button" className="fz-btn fz-btn--sm fz-btn--primary" onClick={onYop}>{t('Yopish')}</button></div>
        </div>
      ) : (
        <form className="space-y-3" data-testid="mindmap-vazifa-modal" onSubmit={(e) => { e.preventDefault(); void ber(); }}>
          <label className="block space-y-1 text-[12px] text-text-dim">
            <span>{t('Topshiriq matni')}</span>
            <input autoFocus value={sarlavha} maxLength={200} onChange={(e) => setSarlavha(e.target.value)} className={maydon} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block space-y-1 text-[12px] text-text-dim">
              <span>{t('Ijrochi')}</span>
              <select value={ijrochi} onChange={(e) => setIjrochi(e.target.value)} className={maydon}>
                <option value="">{t('Kompaniya (aniq odamsiz)')}</option>
                {odamlar.map((o) => <option key={o.id} value={o.id}>{o.nom + ' · ' + rolNomi(o.rol)}</option>)}
              </select>
            </label>
            <label className="block space-y-1 text-[12px] text-text-dim">
              <span>{t('Muddat')}</span>
              <input type="date" value={muddat} onChange={(e) => setMuddat(e.target.value)} className={maydon} />
            </label>
          </div>
          <label className="block space-y-1 text-[12px] text-text-dim">
            <span>{t('Obyekt')}</span>
            <select value={obyekt} onChange={(e) => setObyekt(e.target.value)} className={maydon}>
              <option value="">{t('Obyektsiz')}</option>
              {obyektlar.map((x) => <option key={x.id} value={x.id}>{x.nom}</option>)}
            </select>
          </label>
          {xato && <div className="fz-note fz-note--danger" role="alert"><span>{xato}</span></div>}
          <div className="flex justify-end gap-2">
            <button type="button" className="fz-btn fz-btn--sm" onClick={onYop}>{t('Bekor qilish')}</button>
            <button type="submit" className="fz-btn fz-btn--sm fz-btn--primary" disabled={ish || !sarlavha.trim()}><ClipboardCheck aria-hidden />{t('Topshiriq berish')}</button>
          </div>
        </form>
      )}
    </ModalOyna>
  );
}
