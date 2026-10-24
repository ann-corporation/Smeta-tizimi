import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { X } from 'lucide-react';
import { yangiOperationId } from '../../api/supabase';
import { narxTakliflari, type NarxVariant } from '../../api/t2-ish-abc';
import { sbT2SmetaNarxlaRes } from '../../api/t2-smeta-narxlash';
import { MANBA_NOMI, son } from '../../lib/ish-abc';
import { narxVariantlariTartibla, narxsizSummalar } from '../../lib/fakt-studio';
import { SummaJuft } from '../../umumiy/ui/SummaJuft';
import { t } from '../../i18n/til';

export type NarxlashQator = { id: number; nom: string; birlik: string | null; kat: string | null; fakt: number; smeta: number | null };

const fmt = (v: number | null | undefined) => (v == null ? '—' : Number(v).toLocaleString('ru-RU', { maximumFractionDigits: 3 }));

/**
 * Fakt oynasida narxsiz material/uskunani joyida narxlash (Studio narxlash oqimining qisqa varianti).
 * Manbalar: shu smeta/shartnoma, boshqa shartnomalar, katalog (mavjud `narxTakliflari`) yoki qo'lda.
 * Yozish: mavjud `smeta_narxla_res` (faqat narxi NULL qatorlarni to'ldiradi - mavjud narxni bosmaydi; narx NDS siz).
 * Narx to'qilmaydi: tanlanmasa yoki bo'sh bo'lsa hech narsa yozilmaydi.
 */
export function FaktNarxlash({ kompaniyaId, obyektId, qator, onYop, onSaqlandi }: {
  kompaniyaId: number; obyektId: number; qator: NarxlashQator; onYop: () => void; onSaqlandi: (xabar: string) => void;
}) {
  const [variantlar, setVariantlar] = useState<NarxVariant[]>([]);
  const [yuk, setYuk] = useState(true);
  const [faol, setFaol] = useState(0);
  const [qolda, setQolda] = useState('');
  const [band, setBand] = useState(false);
  const [xato, setXato] = useState('');
  const opRef = useRef(yangiOperationId());
  const qoldaRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let tirik = true;
    void narxTakliflari(obyektId, [{ nom: qator.nom, birlik: qator.birlik ?? '' }])
      .then((v) => { if (tirik) setVariantlar(narxVariantlariTartibla(v[0] ?? [])); })
      .catch(() => { if (tirik) setVariantlar([]); })
      .finally(() => { if (tirik) setYuk(false); });
    return () => { tirik = false; };
  }, [obyektId, qator.nom, qator.birlik]);

  const qoldaNarx = son(qolda);
  // Egasi qarori (2026-10-25): bazaga FAQAT qo'lda maydondagi narx yoziladi. Manba taklifi bosilsa
  // u faqat qo'lda maydonga ko'chiriladi - yozish har doim egasining aniq «Narxni yozish» bosishi bilan.
  const tanlangan = qoldaNarx != null ? { narx: qoldaNarx, manba: 'qolda' as const } : null;
  const variantniOl = (i: number) => { const v = variantlar[i]; setFaol(i); if (v) setQolda(String(v.narx)); qoldaRef.current?.focus(); };
  const yaroqli = tanlangan != null && Number.isFinite(tanlangan.narx) && tanlangan.narx > 0;
  const sm = useMemo(() => (yaroqli ? narxsizSummalar(qator.kat, qator.fakt, qator.smeta, tanlangan!.narx) : null), [yaroqli, tanlangan, qator.kat, qator.fakt, qator.smeta]);

  const yubor = async () => {
    if (band || !yaroqli) { if (!yaroqli) setXato(t('Narx tanlang yoki qo‘lda yozing.')); return; }
    setBand(true); setXato('');
    try {
      const r = await sbT2SmetaNarxlaRes({ kompaniyaId, obyektId, operationId: opRef.current, narxlar: [{ nom: qator.nom, birlik: qator.birlik ?? '', narx: tanlangan!.narx }] });
      if (!r.ok) { setXato(r.error || r.code || t('Amal bajarilmadi')); return; }
      onSaqlandi(r.yozildi ? t('Narx yozildi: {n} ta qator.', { n: String(r.yozildi) }) : t('Mos narxsiz qator topilmadi - o‘zgarish yo‘q.'));
    } catch (e) { setXato(e instanceof Error ? e.message : t('Amal bajarilmadi')); }
    finally { setBand(false); }
  };
  const klav = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') { e.preventDefault(); onYop(); }
    else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      // Ro'yxatda turib Enter - taklifni qo'lda maydonga ko'chiradi (yozmaydi); qo'lda maydonda Enter - yozadi.
      if (e.target === qoldaRef.current) void yubor(); else variantniOl(faol);
    }
    else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && variantlar.length && e.target !== qoldaRef.current) {
      e.preventDefault();
      setFaol((f) => Math.max(0, Math.min(variantlar.length - 1, f + (e.key === 'ArrowDown' ? 1 : -1))));
    }
  };

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label={t('Narxlash')} onKeyDown={klav}>
    <div className="karta w-full max-w-lg space-y-3 p-4 text-[12px]">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0"><h3 className="text-[14px] font-semibold text-text">{t('Narxlash')}</h3>
          <p className="truncate text-text-dim" title={qator.nom}>{qator.nom} · {qator.birlik ?? '—'}</p></div>
        <button type="button" onClick={onYop} aria-label={t('Yopish')} className="rounded p-1 text-text-mute hover:bg-surface-2"><X size={14} /></button>
      </div>
      <p className="text-text-mute">{t('Narx NDS siz. Taklifni bossangiz qo‘lda maydonga tushadi; faqat «Narxni yozish» bosilganda yoziladi.')}</p>
      <div role="listbox" aria-label={t('Narx manbalari')} className="max-h-48 overflow-auto rounded border border-border">
        {yuk && <p className="p-2 text-text-mute">{t('Qidirilmoqda…')}</p>}
        {!yuk && variantlar.length === 0 && <p className="p-2 text-text-mute">{t('Manbalardan narx topilmadi - qo‘lda yozing.')}</p>}
        {variantlar.map((v, i) => <button key={i} type="button" role="option" aria-selected={i === faol} onClick={() => variantniOl(i)}
          className={`flex w-full items-center justify-between gap-3 border-b border-border/50 px-3 py-1.5 text-left ${i === faol ? 'bg-accent/10' : 'hover:bg-surface-2'}`}>
          <span><span className="rounded bg-surface-2 px-1 text-[10px]">{MANBA_NOMI[v.manba]}</span> <span className="text-text-mute">{v.izoh}</span></span>
          <b className="font-mono tabular-nums">{fmt(v.narx)}</b></button>)}
      </div>
      <label className="block">{t('Qo‘lda narx')}
        <input ref={qoldaRef} aria-label={t('Qo‘lda narx')} inputMode="decimal" value={qolda} onChange={(e) => setQolda(e.target.value)} className="mt-1 w-full rounded border border-border bg-bg px-2 py-1 text-right font-mono text-[13px]" /></label>
      {sm && <div className="grid grid-cols-2 gap-3 rounded border border-border bg-surface-2 p-2" data-testid="narx-korinish">
        <div><div className="text-[10px] uppercase text-text-mute">{t('Fakt summasi')}</div><SummaJuft kichik obyektId={obyektId} kompaniyaId={kompaniyaId} ustamasiz={sm.faktSumma} katKesim={sm.faktKesim} /></div>
        {sm.smetaSumma != null && sm.smetaKesim && <div><div className="text-[10px] uppercase text-text-mute">{t('Smeta summasi')}</div><SummaJuft kichik obyektId={obyektId} kompaniyaId={kompaniyaId} ustamasiz={sm.smetaSumma} katKesim={sm.smetaKesim} /></div>}
      </div>}
      {xato && <p role="alert" className="text-danger">{xato}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onYop} className="rounded border border-border px-3 py-1">{t('Bekor')} <kbd className="text-[10px] text-text-mute">{'Esc'}</kbd></button>
        <button type="button" disabled={band || !yaroqli} onClick={() => void yubor()} className="rounded bg-accent px-3 py-1 font-semibold text-white disabled:opacity-50">{band ? t('Saqlanmoqda…') : t('Narxni yozish')} <kbd className="text-[10px] opacity-80">{'Enter'}</kbd></button>
      </div>
    </div>
  </div>;
}
