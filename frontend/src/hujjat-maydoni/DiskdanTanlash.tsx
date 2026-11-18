/**
 * DiskdanTanlash.tsx - umumiy «Diskdan tanlash» oynasi: yuklash joyi bor HAR sahifada fayl qayta yuklanmasdan, Diskdagi mavjud fayl tanlanadi.
 * Yangi Disk ko'rinishi EMAS: HujjatMaydoni bilan bir xil API (hmRoyxat / hmUlashilgan / hmQidir / hmBaytlar) va bir xil tablar
 * (Mening diskim | Kompaniya diski | Ulashilgan; Savat tanlanmaydi). Tanlangan fayl `tanlovniFaylga` orqali oddiy File ga aylanadi -
 * sahifaning mavjud yuklash handleriga o'zgartirishsiz beriladi.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileText, Folder, Search, X } from 'lucide-react';
import { t, tilLocale } from '../i18n/til';
import { useKompaniya } from '../umumiy/kontekst/KompaniyaKontekst';
import { hmBaytlar, hmHajm, hmQidir, hmRoyxat, hmUlashilgan, type HmFayl, type HmPapka, type HmUlashilgan } from '../api/t2-hujjat-maydoni';

export type DiskTanlov = { faylId: number; versiya: number | null; nom: string; mime: string; bayt: number | null };
type Joy = 'shaxsiy' | 'kompaniya' | 'ulashilgan';

/** `accept` (input type=file bilan bir xil: ".xlsx,image/*") bo'yicha fayl mosligi. Bo'sh accept - hammasi mos. */
export function faylMos(nom: string, mime: string | null | undefined, accept?: string): boolean {
  const q = (accept ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!q.length) return true;
  const n = nom.toLowerCase(); const m = (mime ?? '').toLowerCase();
  return q.some((a) => (a.startsWith('.') ? n.endsWith(a) : a.endsWith('/*') ? m.startsWith(a.slice(0, -1)) : m === a));
}

/** Disk faylini brauzer File ob'ektiga aylantiradi (mavjud yuklash handlerlari File kutadi). Topilmasa xato tashlaydi. */
export async function tanlovniFaylga(x: DiskTanlov): Promise<File> {
  const b = await hmBaytlar(x.faylId, x.versiya ?? undefined);
  if (!b) throw new Error('DISK_FAYL_OCHILMADI');
  return new File([b.bayt as BlobPart], x.nom, { type: x.mime || b.mime });
}

type Qator = { id: number; nom: string; mime: string; bayt: number | null; versiya: number | null };

export function DiskdanTanlash({ onYop, onTanlandi, kopmi = false, accept }: {
  onYop: () => void; onTanlandi: (fayllar: DiskTanlov[]) => void; kopmi?: boolean; accept?: string;
}) {
  const { joriy } = useKompaniya();
  const kompId = joriy?.id ?? null;
  const [joy, setJoy] = useState<Joy>('shaxsiy');
  const [papkaId, setPapkaId] = useState<number | null>(null);
  const [yol, setYol] = useState<HmPapka[]>([]);
  const [papkalar, setPapkalar] = useState<HmPapka[]>([]);
  const [fayllar, setFayllar] = useState<Qator[]>([]);
  const [ulashilgan, setUlashilgan] = useState<HmUlashilgan[]>([]);
  const [q, setQ] = useState('');
  const [natija, setNatija] = useState<Qator[] | null>(null);
  const [tanlangan, setTanlangan] = useState<Record<number, Qator>>({});
  const [yuk, setYuk] = useState(false);
  const [xato, setXato] = useState<string | null>(null);

  const joylar: Array<[Joy, string]> = useMemo(() => [['shaxsiy', 'Mening diskim'], ...(kompId ? [['kompaniya', 'Kompaniya diski'] as [Joy, string]] : []), ['ulashilgan', 'Ulashilgan']], [kompId]);

  const yangila = useCallback(async () => {
    setYuk(true); setXato(null);
    try {
      if (joy === 'ulashilgan') {
        const r = await hmUlashilgan();
        if (r.ok) setUlashilgan(r.royxat); else setXato(r.xato ?? t('Amal bajarilmadi.'));
        return;
      }
      const r = await hmRoyxat({ kompaniyaId: joy === 'kompaniya' ? kompId : null, papkaId });
      if (r.ok) {
        setPapkalar(r.papkalar); setYol(r.yol);
        setFayllar(r.fayllar.map((f: HmFayl) => ({ id: f.id, nom: f.nom, mime: f.mime, bayt: f.bayt, versiya: f.versiya })));
      } else setXato(r.xato ?? t('Amal bajarilmadi.'));
    } catch { setXato(t('Aloqa xatosi. Internetni tekshirib, qayta urinib ko‘ring.')); } finally { setYuk(false); }
  }, [joy, kompId, papkaId]);
  useEffect(() => { void yangila(); }, [yangila]);
  useEffect(() => { setPapkaId(null); setQ(''); setNatija(null); }, [joy]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onYop(); };
    document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k);
  }, [onYop]);

  const qidir = async (s: string) => {
    setQ(s);
    if (joy === 'ulashilgan' || s.trim().length < 2) { setNatija(null); return; }
    const r = await hmQidir(s.trim(), joy === 'kompaniya' ? kompId : null);
    if (r.ok) setNatija(r.royxat.map((x) => ({ id: x.id, nom: x.nom, mime: x.mime, bayt: null, versiya: null })));
  };

  const royxat: Qator[] = (natija ?? (joy === 'ulashilgan'
    ? ulashilgan.filter((u) => u.turi === 'fayl').map((u) => ({ id: u.id, nom: u.nom, mime: u.mime ?? '', bayt: null, versiya: null }))
    : fayllar)).filter((f) => faylMos(f.nom, f.mime, accept));
  const bos = (f: Qator) => {
    setTanlangan((p) => {
      if (!kopmi) return { [f.id]: f };
      const n = { ...p }; if (n[f.id]) delete n[f.id]; else n[f.id] = f; return n;
    });
  };
  const tanlanganlar = Object.values(tanlangan);
  const tasdiq = () => onTanlandi(tanlanganlar.map((f) => ({ faylId: f.id, versiya: f.versiya, nom: f.nom, mime: f.mime, bayt: f.bayt })));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onYop(); }}>
      <div role="dialog" aria-modal="true" aria-label={t('Diskdan tanlash')} className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-lg border border-border bg-surface shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-2">
          <h2 className="text-[14px] font-semibold text-text">{t('Diskdan tanlash')}</h2>
          <button type="button" className="fz-btn fz-btn--icon" aria-label={t('Yopish')} onClick={onYop}><X size={14} /></button>
        </div>
        <div className="flex flex-wrap items-center gap-2 px-4 pt-2">
          <div className="flex flex-wrap gap-1" role="tablist" aria-label={t('Disk bo‘limlari')}>
            {joylar.map(([k, nom]) => (
              <button key={k} type="button" role="tab" aria-selected={joy === k} onClick={() => setJoy(k)}
                className={`rounded px-3 py-1 text-[12px] ${joy === k ? 'bg-accent/15 font-semibold text-text' : 'text-text-dim hover:bg-surface-2'}`}>{t(nom)}</button>))}
          </div>
          {joy !== 'ulashilgan' && (
            <label className="relative ml-auto"><Search size={13} className="absolute left-2 top-2 text-text-mute" />
              <input value={q} onChange={(e) => void qidir(e.target.value)} placeholder={t('Qidirish')} aria-label={t('Qidirish')} className="input h-8 pl-7 text-[12px]" /></label>)}
        </div>
        {joy !== 'ulashilgan' && !natija && (
          <nav className="flex flex-wrap items-center gap-1 px-4 pt-2 text-[12px]" aria-label={t('Papka yo‘li')}>
            <button type="button" className="text-accent hover:underline" onClick={() => setPapkaId(null)}>{joy === 'kompaniya' ? t('Kompaniya diski') : t('Mening diskim')}</button>
            {yol.map((p) => (<span key={p.id}>/ <button type="button" className="hover:underline" onClick={() => setPapkaId(p.id)}>{p.nom}</button></span>))}
          </nav>)}
        <div className="min-h-[160px] flex-1 overflow-y-auto px-4 py-2">
          {xato && <p className="mb-2 text-[13px] text-text" role="alert">{xato}</p>}
          {yuk && <div className="skel h-24 rounded" role="status" aria-label={t('Yuklanmoqda…')} />}
          {!yuk && (
            <ul className="divide-y divide-border text-[13px]">
              {!natija && joy !== 'ulashilgan' && [...papkalar].sort((a, b) => a.nom.localeCompare(b.nom, tilLocale())).map((p) => (
                <li key={'p' + p.id}><button type="button" className="flex w-full items-center gap-2 py-1.5 text-left hover:underline" onClick={() => setPapkaId(p.id)}><Folder size={15} /> {p.nom}</button></li>))}
              {royxat.map((f) => (
                <li key={f.id}>
                  <label className={`flex cursor-pointer items-center gap-2 py-1.5 ${tanlangan[f.id] ? 'bg-accent/10' : ''}`}>
                    <input type={kopmi ? 'checkbox' : 'radio'} name="disk-tanlov" checked={!!tanlangan[f.id]} onChange={() => bos(f)} aria-label={f.nom} />
                    <FileText size={15} /><span className="min-w-0 flex-1 truncate">{f.nom}</span><span className="text-[11px] text-text-mute">{hmHajm(f.bayt)}</span>
                  </label>
                </li>))}
              {!royxat.length && !papkalar.length && !xato && <li className="py-6 text-center text-text-mute">{t('Mos fayl topilmadi.')}</li>}
            </ul>)}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-2">
          <span className="text-[12px] text-text-mute">{tanlanganlar.length ? t('Tanlandi: {n}', { n: tanlanganlar.length }) : ''}</span>
          <div className="flex gap-2">
            <button type="button" className="fz-btn" onClick={onYop}>{t('Bekor qilish')}</button>
            <button type="button" className="fz-btn fz-btn--primary" disabled={!tanlanganlar.length} onClick={tasdiq}>{t('Tanlash')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * «Diskdan tanlash» tugmasi: bosilganda oyna ochiladi, tanlangan fayllar File ga aylantirilib `onFayllar` ga beriladi
 * (yuklash inputining onChange handleri bilan bir xil File[]). Disk yo'q/xato bo'lsa sahifa buzilmaydi - faqat toast o'rniga `onXato`.
 */
export function DiskdanTanlashTugma({ onFayllar, kopmi = false, accept, disabled, className, onXato }: {
  onFayllar: (fayllar: File[]) => void | Promise<void>; kopmi?: boolean; accept?: string; disabled?: boolean; className?: string; onXato?: (xabar: string) => void;
}) {
  const [ochiq, setOchiq] = useState(false);
  const [band, setBand] = useState(false);
  const tanlandi = async (x: DiskTanlov[]) => {
    setOchiq(false); setBand(true);
    try { await onFayllar(await Promise.all(x.map(tanlovniFaylga))); } catch { onXato?.(t('Faylni ochib bo‘lmadi')); } finally { setBand(false); }
  };
  return (
    <>
      <button type="button" className={className ?? 'fz-btn fz-btn--sm'} disabled={disabled || band} onClick={() => setOchiq(true)}>
        <Folder size={13} className="mr-1 inline" />{band ? t('Yuklanmoqda…') : t('Diskdan tanlash')}
      </button>
      {ochiq && <DiskdanTanlash kopmi={kopmi} accept={accept} onYop={() => setOchiq(false)} onTanlandi={(x) => void tanlandi(x)} />}
    </>
  );
}
