import { useEffect, useMemo, useRef, useState } from 'react';
import { RotateCcw, ShieldAlert } from 'lucide-react';
import { F2Oyna } from './F2Oyna';
import { FmtN } from '../../lib/format';
import { davrNomi } from '../../lib/f2-hujjat-korinish';
import { t, tilLocale } from '../../i18n/til';
import { faolStornolar, stornoFaktReja, stornoQator, stornoQur, type StornoManbaQator, type StornoReestrAkt } from '../../lib/f2-storno';
import { f2StornoAktIdlari, f2StornoFaktYoz, f2StornoHolatOl, f2StornoManbaOl, f2StornoQoralamaYarat, yangiOperationId, type StornoQatorKorinish } from '../../api/t2-f2-storno';

export type F2StornoAkt = { id: number; raqam: string | null; oy: string | null; hujjat_jami: number | null };

const KORSATISH_LIMIT = 400;
const bugun = () => new Date().toISOString().slice(0, 10);
const oyBosh = () => `${bugun().slice(0, 7)}-01`;

/**
 * «Storno (minus) F2 yaratish»: tanlangan F2 aktning qatorlari (hammasi belgilangan; SAQLAB QOLINADIGANLARNI belgidan oling)
 * minus qilib YANGI qoralamaga yoziladi, shu qatorlarning fakti ham minus yozuv bilan 0 ga tushiriladi.
 * Asl akt va o'tgan fakt yozuvlari o'zgarmaydi. Yangi pozitsiyalar keyin F2 tayyorlashda shu qoralama ostiga qo'shiladi.
 */
export function F2StornoOyna(p: {
  obyektId: number; akt: F2StornoAkt; reestr: readonly StornoReestrAkt[];
  onYop: () => void; onTugadi: (yangiAktId: number) => void;
}) {
  const [manba, setManba] = useState<StornoManbaQator[] | null>(null);
  const [holat, setHolat] = useState<StornoQatorKorinish[] | null>(null);
  const [faol, setFaol] = useState<StornoReestrAkt[] | null>(null);
  const [yuklashXato, setYuklashXato] = useState('');
  const [tanlangan, setTanlangan] = useState<ReadonlySet<number>>(new Set());
  const [qidir, setQidir] = useState('');
  const [raqam, setRaqam] = useState(`${p.akt.raqam || p.akt.id}-С`);
  const [oy, setOy] = useState(oyBosh());
  const [takrorTasdiq, setTakrorTasdiq] = useState(false);
  const [band, setBand] = useState(false);
  const [xato, setXato] = useState('');
  /** Qoralama yaratilgach shu yerda saqlanadi: fakt yozuvi yiqilsa, faqat fakt qayta uriniladi (qoralama takrorlanmaydi). */
  const [yaratilganAkt, setYaratilganAkt] = useState<number | null>(null);
  const opQoralama = useRef(yangiOperationId());
  const opFakt = useRef(yangiOperationId());

  useEffect(() => {
    let jonli = true;
    void (async () => {
      try {
        const [m, h, ids] = await Promise.all([f2StornoManbaOl(p.akt.id, p.obyektId), f2StornoHolatOl(p.obyektId), f2StornoAktIdlari(p.akt.id, p.obyektId)]);
        if (!jonli) return;
        if (!m.ok || !h.ok) { setYuklashXato(t('F2 qatorlari yoki fakt holati o‘qilmadi. Qayta urinib ko‘ring.')); return; }
        setManba(m.qatorlar); setHolat(h.qatorlar);
        setFaol(faolStornolar(ids, p.reestr));
        setTanlangan(new Set(m.qatorlar.filter((x) => stornoQator(x, p.akt.id).tur === 'qator').map((x) => x.qator_id)));
      } catch { if (jonli) setYuklashXato(t('Storno tekshiruvi o‘qilmadi (ikki marta storno himoyasi). Qayta urinib ko‘ring.')); }
    })();
    return () => { jonli = false; };
  }, [p.akt.id, p.obyektId, p.reestr]);

  const nomlar = useMemo(() => new Map((holat ?? []).map((h) => [h.qator_id, h] as const)), [holat]);
  const reja = useMemo(() => (manba ? stornoQur(manba, p.akt.id, tanlangan) : null), [manba, tanlangan, p.akt.id]);
  const stornolanadi = useMemo(() => new Set((reja?.qatorlar ?? []).map((q) => q.qatorId)), [reja]);
  const faktReja = useMemo(() => (holat ? stornoFaktReja(stornolanadi, holat, p.akt.raqam || String(p.akt.id)) : null), [holat, stornolanadi, p.akt.raqam, p.akt.id]);

  const korinadigan = useMemo(() => {
    const q = qidir.trim().toLowerCase();
    return (manba ?? []).filter((x) => {
      if (!q) return true;
      const n = nomlar.get(x.qator_id);
      return `${n?.kod ?? ''} ${n?.nom ?? ''}`.toLowerCase().includes(q);
    });
  }, [manba, qidir, nomlar]);

  const kesilgan = korinadigan.length > KORSATISH_LIMIT;
  const belgila = (id: number, on: boolean) => setTanlangan((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });
  const hammasi = (on: boolean) => setTanlangan((s) => {
    const n = new Set(s);
    for (const x of korinadigan) { if (stornoQator(x, p.akt.id).tur !== 'qator') continue; if (on) n.add(x.qator_id); else n.delete(x.qator_id); }
    return n;
  });

  const takrorKerak = (faol?.length ?? 0) > 0;
  const tayyor = !!reja && reja.qatorlar.length > 0 && !!/^\d{4}-\d{2}-\d{2}$/.test(oy) && (!takrorKerak || takrorTasdiq) && faol !== null;

  async function faktYoz(aktId: number) {
    if (!faktReja || faktReja.yozuvlar.length === 0) { p.onTugadi(aktId); return; }
    const r = await f2StornoFaktYoz({ obyektId: p.obyektId, sana: bugun(), yozuvlar: faktReja.yozuvlar, operationId: opFakt.current, raqam: undefined, izoh: `Сторно F2 №${p.akt.raqam || p.akt.id}: fakt 0 ga` });
    if (!r.ok) { setXato(`${t('Storno qoralamasi yaratildi, lekin fakt 0 ga tushmadi')}: ${r.error || r.xabar || ''} ${t('— qayta urinib ko‘ring (qoralama takrorlanmaydi).')}`); return; }
    p.onTugadi(aktId);
  }

  async function bajar() {
    if (!tayyor || !reja || band) return;
    setBand(true); setXato('');
    try {
      let aktId = yaratilganAkt;
      if (aktId == null) {
        const r = await f2StornoQoralamaYarat({ obyektId: p.obyektId, oy, raqam: raqam.trim() || undefined, qatorlar: reja.qatorlar, operationId: opQoralama.current });
        if (!r.ok || r.akt_id == null) { setXato(r.error || r.xabar || t('Storno qoralamasi yaratilmadi.')); return; }
        aktId = r.akt_id; setYaratilganAkt(aktId);
      }
      await faktYoz(aktId);
    } catch { setXato(t('Javob olinmadi. Qayta urinib ko‘ring — takror yozilmaydi.')); }
    finally { setBand(false); }
  }

  return (
    <F2Oyna label={t('Storno (minus) F2 yaratish')} onYop={band ? undefined : p.onYop} kenglik={880}>
      <div className="fz-card__head" style={{ padding: '10px 16px' }}><h3 className="fz-card__title"><RotateCcw size={15} aria-hidden="true" /> {t('Storno (minus) F2 yaratish')}</h3></div>
      <div className="space-y-3 p-4 text-[13px]">
        <p className="text-text-dim">{t('F2 №{r} · {d} — tanlangan qatorlar minus qilib YANGI qoralamaga yoziladi (narx o‘sha). Asl F2 o‘zgarmaydi.', { r: p.akt.raqam || String(p.akt.id), d: davrNomi(p.akt.oy ?? '', tilLocale()) || '—' })}</p>
        {yuklashXato && <p role="alert" className="fz-note fz-note--danger"><ShieldAlert />{yuklashXato}</p>}
        {!yuklashXato && !manba && <div className="skel min-h-[120px] rounded-xl" />}
        {takrorKerak && (
          <div role="alert" className="fz-note fz-note--warn flex-wrap">
            <ShieldAlert />
            <span>{t('Bu F2 uchun storno allaqachon bor: {r}. Yana bir storno ikki marta minus qiladi.', { r: (faol ?? []).map((a) => `№${a.raqam || a.id}`).join(', ') })}</span>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={takrorTasdiq} onChange={(e) => setTakrorTasdiq(e.target.checked)} />{t('Baribir yana bitta storno yarataman')}</label>
          </div>
        )}
        {manba && reja && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <input aria-label={t('Qator qidirish')} value={qidir} onChange={(e) => setQidir(e.target.value)} placeholder={t('Kod yoki nom bo‘yicha qidirish')} className="w-64" />
              <button type="button" className="fz-btn fz-btn--ghost fz-btn--sm" onClick={() => hammasi(true)}>{t('Ko‘ringanlarni belgilash')}</button>
              <button type="button" className="fz-btn fz-btn--ghost fz-btn--sm" onClick={() => hammasi(false)}>{t('Ko‘ringanlardan belgini olish')}</button>
              <span className="text-text-dim">{t('Saqlab qolinadigan qatorlardan belgini oling.')}</span>
            </div>
            <div className="max-h-[38dvh] overflow-auto rounded border border-border/60">
              <table className="w-full text-[12.5px]">
                <thead className="sticky top-0 bg-surface-2 text-left text-text-dim"><tr><th className="w-8 p-1.5" /><th>{t('Kod')}</th><th>{t('Nomi')}</th><th className="text-right">{t('Hajm')}</th><th className="text-right">{t('Summa')}</th><th className="p-1.5 text-right">{t('Fakt')}</th></tr></thead>
                <tbody>
                  {korinadigan.slice(0, KORSATISH_LIMIT).map((x) => {
                    const n = stornoQator(x, p.akt.id);
                    const h = nomlar.get(x.qator_id);
                    return (
                      <tr key={x.qator_id} data-testid="f2-storno-qator" className="border-t border-border/40">
                        <td className="p-1.5"><input type="checkbox" disabled={n.tur !== 'qator' || band} checked={tanlangan.has(x.qator_id)} onChange={(e) => belgila(x.qator_id, e.target.checked)} aria-label={t('Storno: {n}', { n: h?.kod || h?.nom || String(x.qator_id) })} /></td>
                        <td>{h?.kod || '—'}</td>
                        <td>{h?.nom || `#${x.qator_id}`}{n.tur === 'otkaz' && <span className="ml-1 text-warn">({n.sabab === 'nol' ? t('hajm 0 — stornolanmaydi') : t('hajm noma‘lum — stornolanmaydi')})</span>}</td>
                        <td className="text-right tabular-nums">{n.tur === 'qator' ? <FmtN val={n.qator.certifiedQuantity} /> : '—'}</td>
                        <td className="text-right tabular-nums">{n.tur === 'qator' ? (n.qator.certifiedAmount == null ? <span className="text-warn">{t('noma‘lum')}</span> : <FmtN val={n.qator.certifiedAmount} />) : '—'}</td>
                        <td className="p-1.5 text-right tabular-nums">{h?.fakt_hajm != null ? <FmtN val={Number(h.fakt_hajm)} /> : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {kesilgan && <p className="p-2 text-text-dim">{t('Ro‘yxat {n} qatorgacha ko‘rsatildi — qidiruv bilan toraytiring (belgilar hammasi uchun amal qiladi).', { n: KORSATISH_LIMIT })}</p>}
            </div>
            <div className="grid gap-2 sm:grid-cols-4" aria-label={t('Storno jami')}>
              <div className="fz-card px-3 py-2"><p className="text-[10px] uppercase text-text-mute">{t('Qatorlar')}</p><p data-testid="storno-soni" className="text-lg font-semibold tabular-nums">{reja.qatorlar.length}</p></div>
              <div className="fz-card px-3 py-2"><p className="text-[10px] uppercase text-text-mute">{t('Σ summa (minus)')}</p><p data-testid="storno-jami" className="text-lg font-semibold tabular-nums"><FmtN val={reja.jami} /></p></div>
              <div className="fz-card px-3 py-2"><p className="text-[10px] uppercase text-text-mute">{t('Summasi noma‘lum')}</p><p data-testid="storno-nomalum" className={`text-lg font-semibold tabular-nums ${reja.nomalum ? 'text-warn' : ''}`}>{reja.nomalum}</p></div>
              <div className="fz-card px-3 py-2"><p className="text-[10px] uppercase text-text-mute">{t('Saqlab qolinadi')}</p><p className="text-lg font-semibold tabular-nums">{manba.length - reja.qatorlar.length}</p></div>
            </div>
            <p data-testid="storno-fakt" className="fz-note fz-note--info">{t('Fakt ham 0 ga tushiriladi: {n} qator', { n: faktReja?.yozuvlar.length ?? 0 })}
              {faktReja && faktReja.hosila > 0 ? ` · ${t('{n} qatorning fakti ish normasidan hosil bo‘ladi (qo‘lda yozilmaydi)', { n: faktReja.hosila })}` : ''}
              {' — '}{t('o‘tgan fakt yozuvlari o‘chirilmaydi, minus yozuv qo‘shiladi.')}</p>
            {reja.nomalum > 0 && <p className="fz-note fz-note--warn"><ShieldAlert />{t('{n} qatorda summa noma‘lum: noma‘lum bo‘lib qoladi (0 emas), narx «ataylab yo‘q» deb belgilanadi.', { n: reja.nomalum })}</p>}
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-xs text-text-dim">{t('Storno F2 raqami')}<input value={raqam} onChange={(e) => setRaqam(e.target.value)} maxLength={100} className="mt-1 block w-48" disabled={band || yaratilganAkt != null} /></label>
              <label className="text-xs text-text-dim">{t('Davr')}<input type="month" value={oy.slice(0, 7)} onChange={(e) => setOy(`${e.target.value}-01`)} className="mt-1 block" disabled={band || yaratilganAkt != null} /></label>
            </div>
          </>
        )}
        {xato && <p role="alert" className="fz-note fz-note--danger"><ShieldAlert />{xato}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="fz-btn fz-btn--ghost" onClick={p.onYop} disabled={band}>{t('Yopish')}</button>
          <button type="button" className="fz-btn fz-btn--primary" onClick={() => void bajar()} disabled={!tayyor || band}>
            {band ? '…' : yaratilganAkt != null ? t('Faktni qayta urinish') : t('{n} qatorni storno qilish', { n: reja?.qatorlar.length ?? 0 })}
          </button>
        </div>
      </div>
    </F2Oyna>
  );
}

export default F2StornoOyna;
