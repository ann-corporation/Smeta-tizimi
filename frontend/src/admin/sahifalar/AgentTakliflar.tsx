/**
 * AgentTakliflar.tsx — agentlar taklifi (qoida, manba, rivojlanish) → admin tasdig'i; tizim doirasida ISH BUYRUQLARI va ijrochiga yuborish.
 * Tasdiqlangan rivojlanish taklifi → ish buyrug'i → GitHub issue → ijrochi agent PR ochadi (CI + admin ko'rib chiqadi).
 */
import { useCallback, useEffect, useState } from 'react';
import { buyruqYubor, buyruqlarOl, rivojlanishTahlil, takliflarOl, taklifQarori, type AgentBuyruq, type AgentTaklif } from '../../api/t2-agent-ish';
import { t } from '../../i18n/til';
import { toast } from '../../umumiy/ui/Toast';

const TUR: Record<string, string> = { qoida: 'Qoida', manba: 'Veb-manba', rivojlanish: 'Rivojlanish', bilim: 'Bilim' };
const HOLAT: Record<string, string> = { navbat: 'Navbatda', bajarilmoqda: 'Bajarilmoqda', pr_ochildi: 'PR ochildi', birlashtirildi: 'Birlashtirildi', muvaffaqiyatsiz: 'Muvaffaqiyatsiz', bekor: 'Bekor' };
const IZOH_NAMUNA = 'Izoh (rad uchun sabab)';

function Tafsilot({ t: x }: { t: AgentTaklif }) {
  const m = x.mazmun;
  const satr = (a: string, v: unknown) => (v ? <div><span className="text-text-mute">{a}: </span>{String(v)}</div> : null);
  return (
    <div className="space-y-0.5 text-xs text-text-dim">
      {x.tur === 'qoida' && <>{satr(t('Kod'), m.kod)}{satr(t('Matn'), m.matn)}</>}
      {x.tur === 'manba' && <>{satr(t('Domen'), m.domen)}{satr(t('Nomi'), m.nom)}</>}
      {x.tur === 'bilim' && <>{satr(t('Matn'), m.matn)}{satr(t('Kalit so‘zlar'), Array.isArray(m.kalit) ? (m.kalit as unknown[]).join(', ') : '')}{x.dalil.length === 0 && <div className="text-warn">{t('Manba dalili yo‘q — qo‘lda yozilgan')}</div>}</>}
      {x.tur === 'rivojlanish' && <>{satr(t('Maqsad'), m.maqsad)}{satr(t('Tavsif'), m.tavsif)}{satr(t('Xavf'), m.xavf)}
        {Array.isArray(m.qabul_mezonlari) && m.qabul_mezonlari.length > 0 && <ul className="list-disc pl-5">{(m.qabul_mezonlari as unknown[]).map((q, i) => <li key={i}>{String(q)}</li>)}</ul>}</>}
      {x.dalil.length > 0 && <div className="text-text-mute">{t('Dalil')}: {x.dalil.map((d) => String(d.url ?? d.guruh ?? '')).filter(Boolean).join(', ')}</div>}
    </div>
  );
}

export function AgentTakliflar({ kompaniyaId, tizim }: { kompaniyaId: number | null; tizim: boolean }) {
  const k = tizim ? null : kompaniyaId;
  const [royxat, setRoyxat] = useState<AgentTaklif[]>([]);
  const [buyruqlar, setBuyruqlar] = useState<AgentBuyruq[]>([]);
  const [xato, setXato] = useState<string | null>(null);
  const [izoh, setIzoh] = useState<Record<number, string>>({});
  const [avto, setAvto] = useState<Record<number, boolean>>({});
  const [band, setBand] = useState(false);

  const yukla = useCallback(async () => {
    setXato(null);
    const r = await takliflarOl(k);
    if (r.ok) setRoyxat(r.natija.natija); else { setRoyxat([]); setXato(r.error); }
    if (tizim) { const b = await buyruqlarOl(); if (b.ok) setBuyruqlar(b.natija.natija); }
  }, [k, tizim]);
  useEffect(() => { void yukla(); }, [yukla]);

  const qaror = async (x: AgentTaklif, q: 'tasdiqlash' | 'rad') => {
    if (q === 'rad' && !(izoh[x.id] || '').trim()) { toast(t('Rad etish sababini yozing'), 'warn'); return; }
    const r = await taklifQarori(x.doira === 'global' ? null : k, x.id, q, izoh[x.id], avto[x.id]);
    if (r.ok) { toast(q === 'rad' ? t('Rad etildi') : t('Tasdiqlandi'), 'ok'); void yukla(); } else toast(r.error, 'danger');
  };
  const tahlil = async () => {
    setBand(true);
    try {
      const r = await rivojlanishTahlil();
      if (!r.ok) { toast(r.error, 'danger'); return; }
      toast(r.natija.xabar || `${t('Yangi takliflar')}: ${r.natija.takliflar.length}`, 'ok');
      void yukla();
    } finally { setBand(false); }
  };
  const yubor = async (b: AgentBuyruq) => {
    const r = await buyruqYubor(b.id);
    if (r.ok) { toast(t('Ijrochiga yuborildi'), 'ok'); void yukla(); } else toast(r.error, 'danger');
  };

  return (
    <section className="space-y-3" aria-label={t('Agent takliflari')}>
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold">{tizim ? t('Tizim takliflari va ish buyruqlari') : t('Agent takliflari (tasdiq kutmoqda)')}</h2>
        {tizim && <button type="button" disabled={band} onClick={() => void tahlil()} className="ml-auto rounded-md border border-accent/40 px-3 py-1 text-xs text-accent hover:bg-accent/10 disabled:opacity-40">{band ? t('Tahlil qilinmoqda…') : t('Signallardan taklif tayyorlash')}</button>}
      </div>
      {xato && <p className="text-xs text-text-dim">{xato}</p>}
      {!xato && royxat.length === 0 && <p className="text-xs text-text-dim">{t('Tasdiq kutayotgan taklif yo‘q')}</p>}
      <ul className="space-y-2">
        {royxat.map((x) => (
          <li key={x.id} className="karta space-y-1.5 p-3">
            <div className="flex items-center gap-2"><span className="rounded bg-accent/15 px-1.5 py-0.5 text-[10px] text-accent">{t(TUR[x.tur] ?? x.tur)}</span><span className="text-sm font-medium">{x.sarlavha}</span></div>
            <Tafsilot t={x} />
            <div className="flex flex-wrap items-center gap-2">
              <input aria-label={t('Izoh')} placeholder={t(IZOH_NAMUNA)} value={izoh[x.id] ?? ''} onChange={(e) => setIzoh((p) => ({ ...p, [x.id]: e.target.value }))} className="min-w-48 flex-1 rounded border border-border bg-surface px-2 py-1 text-xs" />
              {x.tur === 'rivojlanish' && x.doira === 'global' && x.mazmun.xavf === 'past' && (
                <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={avto[x.id] === true} onChange={(e) => setAvto((p) => ({ ...p, [x.id]: e.target.checked }))} />{t('CI yashil bo‘lsa avto-birlashtirish')}</label>
              )}
              <button type="button" onClick={() => void qaror(x, 'tasdiqlash')} className="tugma-asosiy h-7 px-3 text-[12px]">{t('Tasdiqlash')}</button>
              <button type="button" onClick={() => void qaror(x, 'rad')} className="tugma h-7 px-3 text-[12px]">{t('Rad etish')}</button>
            </div>
          </li>
        ))}
      </ul>
      {tizim && buyruqlar.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-text-dim">{t('Ish buyruqlari')}</h3>
          <ul className="space-y-1.5">
            {buyruqlar.map((b) => (
              <li key={b.id} className="karta flex flex-wrap items-center gap-2 px-3 py-2 text-xs">
                <span className="font-medium">#{b.id} {b.sarlavha}</span>
                <span className="rounded bg-surface-2 px-1.5 py-0.5">{t(HOLAT[b.holat] ?? b.holat)}</span>
                <span className="text-text-mute">{t('xavf')}: {b.xavf}{b.avto_birlashtirish ? ' · auto' : ''}</span>
                {b.pr_url && <a href={b.pr_url} target="_blank" rel="noreferrer" className="text-accent underline">{t('PR')}</a>}
                {b.holat === 'navbat' && <button type="button" onClick={() => void yubor(b)} className="ml-auto rounded-md border border-accent/40 px-2.5 py-1 text-accent hover:bg-accent/10">{t('Ijrochiga yuborish')}</button>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
