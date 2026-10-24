import { useCallback, useEffect, useMemo, useState } from 'react';
import { yangiOperationId, type T2Qator, type T2QatorHolat } from '../../api/supabase';
import {
  BAJARILMADI_SABABLAR, bajarilmadiBekor, bajarilmadiBelgila, bajarilmadiRoyxatOl, bajarilmadiXato,
  type BajarilmadiQator, type BajarilmadiSabab,
} from '../../api/t2-bajarilmadi';
import { FmtN } from '../../lib/format';
import { bajarilmadiXlsx } from '../../lib/bajarilmadi-export';
import { hujjatTokenBilan } from '../../lib/token-hujjat';
import { downloadBlob } from '../../lib/construction-document-control/export/download-helper';
import { t } from '../../i18n/til';

const BARG = new Set(['bl', 'rs', 'mat', 'ob']);
const sabNom = (k: string) => BAJARILMADI_SABABLAR.find((s) => s.kod === k)?.nom ?? k;
const bugun = () => new Date().toISOString().slice(0, 10);

/**
 * «Bajarilmadi» belgisi (egasi 2026-10-24): smeta qatori O'ZGARMAYDI. Bajarilmagan hajm sabab (ro'yxatdan), sana, kim va
 * ixtiyoriy dalil hujjat bilan alohida yoziladi; «Bajarilmagan hajmlar ro'yxati» hujjati shu yozuvlardan olinadi.
 * Faqat tasdiqlash-talab etilmaydigan KO'RSATKICH: ostatka/F2 hisobi o'zgarmaydi, sabab va dalil saqlanadi.
 */
export function BajarilmadiPanel({ kompaniyaId, obyektId, obyektNomi, qatorlar, holatlar }: {
  kompaniyaId: number; obyektId: number; obyektNomi?: string; qatorlar: readonly T2Qator[]; holatlar: readonly T2QatorHolat[];
}) {
  const [royxat, setRoyxat] = useState<BajarilmadiQator[]>([]);
  const [qidiruv, setQidiruv] = useState('');
  const [tanlangan, setTanlangan] = useState<T2Qator | null>(null);
  const [sabab, setSabab] = useState<BajarilmadiSabab>('texnik_sabab');
  const [izoh, setIzoh] = useState('');
  const [sana, setSana] = useState(bugun);
  const [hajm, setHajm] = useState('');
  const [hujjat, setHujjat] = useState('');
  const [band, setBand] = useState(false);
  const [xabar, setXabar] = useState<{ tur: 'ok' | 'xato'; matn: string } | null>(null);

  const yangila = useCallback(async () => {
    const r = await bajarilmadiRoyxatOl(kompaniyaId, obyektId);
    if (r.ok) setRoyxat(r.qatorlar); else setXabar({ tur: 'xato', matn: r.error ?? t('Bajarilmadi ro‘yxati o‘qilmadi') });
  }, [kompaniyaId, obyektId]);
  useEffect(() => { void yangila(); }, [yangila]);

  const faktOf = useMemo(() => new Map(holatlar.map((h) => [h.qator_id, Number(h.fakt_hajm ?? 0)])), [holatlar]);
  const topildi = useMemo(() => {
    const f = qidiruv.trim().toLowerCase();
    if (f.length < 2) return [];
    return qatorlar.filter((q) => BARG.has(q.tur ?? '') && q.hajm != null && q.hajm > 0
      && ((q.kod ?? '').toLowerCase().includes(f) || (q.nom ?? '').toLowerCase().includes(f))).slice(0, 20);
  }, [qatorlar, qidiruv]);
  const faol = royxat.filter((x) => x.holat === 'faol');

  const belgila = async () => {
    if (!tanlangan) return;
    const n = hajm.trim() ? Number(hajm.replace(',', '.')) : null;
    if (n != null && (!Number.isFinite(n) || n < 0)) { setXabar({ tur: 'xato', matn: t('Hajm musbat son bo‘lishi kerak') }); return; }
    const id = hujjat.trim() ? Number(hujjat) : null;
    if (id != null && !(Number.isInteger(id) && id > 0)) { setXabar({ tur: 'xato', matn: t('Dalil hujjat raqami noto‘g‘ri') }); return; }
    setBand(true); setXabar(null);
    try {
      const r = await bajarilmadiBelgila({ kompaniyaId, obyektId, qatorlar: [{ qator_id: tanlangan.id, hajm: n }], sabab, izoh: izoh.trim() || undefined,
        hujjatId: id, sana, operationId: yangiOperationId() });
      if (!r.ok) { setXabar({ tur: 'xato', matn: t(bajarilmadiXato(r)) }); return; }
      setXabar({ tur: 'ok', matn: r.yaratildi ? t('Bajarilmadi deb belgilandi (smeta o‘zgarmadi).') : t('Bu qator allaqachon bajarilmadi deb belgilangan.') });
      setTanlangan(null); setQidiruv(''); setIzoh(''); setHajm(''); setHujjat('');
      await yangila();
    } catch (e) { setXabar({ tur: 'xato', matn: e instanceof Error ? e.message : t('Amal bajarilmadi') }); }
    finally { setBand(false); }
  };

  /** «Bajarilmagan hajmlar ro'yxati» (Excel) — boshqa hujjatlar kabi token orqali beriladi. */
  const eksport = async () => {
    setBand(true); setXabar(null);
    try {
      const { bytes, faylNomi, soni } = await bajarilmadiXlsx(royxat, { obyektNomi: obyektNomi ?? `#${obyektId}` });
      if (!soni) { setXabar({ tur: 'xato', matn: t('Bajarilmadi deb belgilangan ish yo‘q.') }); return; }
      const r = await hujjatTokenBilan({ kompaniyaId, bytes, hujjat: 'BAJARILMADI', sabab: `Ведомость невыполненных объёмов · ${obyektNomi ?? obyektId}`, obyekt: obyektId },
        () => downloadBlob(bytes, faylNomi));
      if (!r.ok) setXabar({ tur: 'xato', matn: r.xabar }); else setXabar({ tur: 'ok', matn: `${soni} ${t('ta pozitsiya')}${r.xabar ? ' · ' + r.xabar : ''}` });
    } catch { setXabar({ tur: 'xato', matn: t('Excel fayli tuzilmadi. Qayta urinib ko‘ring.') }); }
    finally { setBand(false); }
  };

  const bekor = async (x: BajarilmadiQator) => {
    setBand(true); setXabar(null);
    try {
      const r = await bajarilmadiBekor({ kompaniyaId, id: x.id, sabab: 'Belgi bekor qilindi', operationId: yangiOperationId() });
      if (!r.ok) { setXabar({ tur: 'xato', matn: t(bajarilmadiXato(r)) }); return; }
      await yangila();
    } finally { setBand(false); }
  };

  return (
    <div className="space-y-3 text-[12px]" aria-label={t('Bajarilmadi belgisi')}>
      <p className="text-text-dim">{t('Bajarilmaydigan ishni sabab bilan belgilang — smeta qatori o‘zgarmaydi. Sabab, sana va dalil hujjat saqlanadi; «Bajarilmagan hajmlar ro‘yxati» shundan olinadi.')}</p>
      <input aria-label={t('Ishni qidirish')} value={qidiruv} onChange={(e) => { setQidiruv(e.target.value); setTanlangan(null); }}
        placeholder={t('Ish yoki resursni kod/nom bo‘yicha qidiring…')} className="w-full rounded border border-border bg-bg px-2 py-1" />
      {!tanlangan && topildi.length > 0 && (
        <ul className="max-h-48 overflow-auto rounded border border-border" role="listbox" aria-label={t('Topilgan ishlar')}>
          {topildi.map((q) => (
            <li key={q.id}><button type="button" onClick={() => setTanlangan(q)} className="w-full px-2 py-1 text-left hover:bg-surface-2">
              <span className="text-text-mute">{q.kod ?? ''}</span> {q.nom} — <FmtN val={q.hajm ?? 0} /> {q.birlik ?? ''}
            </button></li>
          ))}
        </ul>
      )}
      {tanlangan && (
        <div className="space-y-2 rounded border border-border p-2">
          <div><b>{tanlangan.nom}</b> ({tanlangan.birlik ?? '—'}) — {t('smeta')}: <FmtN val={tanlangan.hajm ?? 0} />, {t('bajarilgan')}: <FmtN val={faktOf.get(tanlangan.id) ?? 0} /></div>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block">{t('Sabab')}
              <select aria-label={t('Sabab')} value={sabab} onChange={(e) => setSabab(e.target.value as BajarilmadiSabab)} className="mt-1 w-full rounded border border-border bg-bg px-2 py-1">
                {BAJARILMADI_SABABLAR.map((s) => <option key={s.kod} value={s.kod}>{t(s.nom)}</option>)}
              </select></label>
            <label className="block">{t('Sana')}
              <input aria-label={t('Sana')} type="date" value={sana} onChange={(e) => setSana(e.target.value)} className="mt-1 w-full rounded border border-border bg-bg px-2 py-1" /></label>
            <label className="block">{t('Bajarilmagan hajm (bo‘sh = butun qoldiq)')}
              <input aria-label={t('Bajarilmagan hajm')} inputMode="decimal" value={hajm} onChange={(e) => setHajm(e.target.value)} className="mt-1 w-full rounded border border-border bg-bg px-2 py-1" /></label>
            <label className="block">{t('Dalil hujjat № (ixtiyoriy)')}
              <input aria-label={t('Dalil hujjat raqami')} inputMode="numeric" value={hujjat} onChange={(e) => setHujjat(e.target.value)} className="mt-1 w-full rounded border border-border bg-bg px-2 py-1" /></label>
          </div>
          <label className="block">{t('Izoh')}
            <textarea aria-label={t('Izoh')} value={izoh} onChange={(e) => setIzoh(e.target.value)} rows={2} className="mt-1 w-full rounded border border-border bg-bg px-2 py-1" /></label>
          <div className="flex gap-2">
            <button type="button" disabled={band || (sabab === 'boshqa' && !izoh.trim())} onClick={() => void belgila()} className="rounded bg-accent px-3 py-1 text-white disabled:opacity-40">{t('Bajarilmadi deb belgilash')}</button>
            <button type="button" onClick={() => setTanlangan(null)} className="rounded border border-border px-3 py-1">{t('Bekor')}</button>
          </div>
        </div>
      )}
      {xabar && <p role={xabar.tur === 'xato' ? 'alert' : 'status'} className={xabar.tur === 'xato' ? 'text-danger' : 'text-success'}>{xabar.matn}</p>}
      {faol.length > 0 && <div><button type="button" disabled={band} onClick={() => void eksport()} className="rounded border border-accent/50 px-3 py-1 text-accent disabled:opacity-40">{t('Bajarilmagan hajmlar ro‘yxati (Excel)')}</button></div>}
      {faol.length > 0 && (
        <table className="w-full border-collapse">
          <thead><tr className="text-left text-text-mute"><th className="py-1">{t('Ish')}</th><th>{t('Bajarilmagan')}</th><th>{t('Sabab')}</th><th>{t('Sana')}</th><th>{t('Kim')}</th><th /></tr></thead>
          <tbody>{faol.map((x) => (
            <tr key={x.id} className="border-t border-border/60 align-top">
              <td className="py-1 pr-2">{x.kod ? `${x.kod} ` : ''}{x.nom}</td>
              <td className="pr-2 tabular-nums"><FmtN val={x.bajarilmagan_hajm} /> {x.birlik ?? ''}</td>
              <td className="pr-2">{t(sabNom(x.sabab_kod))}{x.sabab_izoh ? ` — ${x.sabab_izoh}` : ''}{x.hujjat_nom ? ` · ${x.hujjat_nom}` : ''}</td>
              <td className="pr-2">{x.sana}</td><td className="pr-2">{x.kim ?? '—'}</td>
              <td><button type="button" disabled={band} onClick={() => void bekor(x)} className="rounded border border-border px-2 disabled:opacity-40">{t('Bekor qilish')}</button></td>
            </tr>))}</tbody>
        </table>
      )}
    </div>
  );
}

export default BajarilmadiPanel;
