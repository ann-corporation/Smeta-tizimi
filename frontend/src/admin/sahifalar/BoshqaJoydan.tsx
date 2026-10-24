import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { X } from 'lucide-react';
import { yangiOperationId } from '../../api/supabase';
import { abcXato, ishAbcSaqla, ishTuriQidir, type IshTuriVariant } from '../../api/t2-ish-abc';
import { t } from '../../i18n/til';
import { abcHisobla, abcTekshir, son, type AbcResurs } from '../../lib/ish-abc';
import { boshlangichHajm, boshqaJoySabab, variantResurslari } from '../../lib/xotira-fakt/boshqaJoy';
import type { XotiraQator } from '../../lib/xotira-fakt/parse';
import { useHotkeys } from '../../lib/hotkeys/useHotkeys';
import { MoneyInput } from '../../umumiy/ui/MoneyInput';

const fmt = (v: number | null | undefined) => (v == null ? '—' : Number(v).toLocaleString('ru-RU', { maximumFractionDigits: 3 }));

export interface YaratilganQator { id: number | null; nom: string; birlik: string; hajm: number; jami: number }

/**
 * «Boshqa joydan olish» (egasi 2026-10-24): ish smetaning boshqa razdelida yoki boshqa obyekt smetasida bo‘lsa — o‘sha qator
 * (resurslari va narxi bilan) shablon, kerakli razdelga QO‘SHIMCHA qator bo‘lib yaratiladi va bajarilgan hajm (fakt) shu amalda
 * yoziladi. Mavjud `ish_abc_saqla_v1` (additional) oqimi; asl smeta qatorlari o‘zgarmaydi; manba qator id sababda saqlanadi.
 */
export function BoshqaJoydan({ kompaniyaId, obyektId, qator, bolimlar, onYop, onSaqlandi, onKatalog }: {
  kompaniyaId: number; obyektId: number; qator: XotiraQator;
  bolimlar: Array<{ id: number; nom: string; versiya: number; daraja: number }>;
  onYop: () => void;
  onSaqlandi: (q: YaratilganQator) => unknown;
  /** Smetada umuman yo'q — katalog/resurs qidiruvidan qo'shimcha ish yaratish oynasiga o'tish. */
  onKatalog?: () => void;
}) {
  const [q, setQ] = useState(qator.nom);
  const [variantlar, setVariantlar] = useState<IshTuriVariant[]>([]);
  const [yuklanmoqda, setYuklanmoqda] = useState(false);
  const [faol, setFaol] = useState(0);
  const [tanlangan, setTanlangan] = useState<IshTuriVariant | null>(null);
  const [bolimId, setBolimId] = useState('');
  const [hajm, setHajm] = useState('');
  const [resurslar, setResurslar] = useState<AbcResurs[]>([]);
  const [sabab, setSabab] = useState('');
  const [band, setBand] = useState(false);
  const [xato, setXato] = useState('');
  const operationId = useRef(yangiOperationId());
  const navbat = useRef(0);
  const qRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (tanlangan || q.trim().length < 3) { setVariantlar([]); return; }
    const n = ++navbat.current;
    const tm = setTimeout(() => {
      setYuklanmoqda(true);
      void ishTuriQidir(obyektId, q).then((v) => { if (n === navbat.current) { setVariantlar(v.filter((x) => x.manba === 'smeta' && x.sostav.length > 0)); setFaol(0); } })
        .finally(() => { if (n === navbat.current) setYuklanmoqda(false); });
    }, 300);
    return () => clearTimeout(tm);
  }, [q, obyektId, tanlangan]);

  const tanla = (v: IshTuriVariant) => {
    setTanlangan(v); setResurslar(variantResurslari(v)); setHajm(boshlangichHajm(qator, v.birlik)); setSabab(boshqaJoySabab(v, qator.xom));
  };
  const hisob = useMemo(() => abcHisobla(hajm, resurslar), [hajm, resurslar]);
  const xatolar = useMemo(() => abcTekshir({ rejim: 'ish', ish: { nom: tanlangan?.nom ?? '', birlik: tanlangan?.birlik ?? '', hajm }, resurslar, sabab, fakt: hajm }), [tanlangan, hajm, resurslar, sabab]);
  const yangila = (i: number, p: Partial<AbcResurs>) => setResurslar((o) => o.map((r, j) => (j === i ? { ...r, ...p } : r)));

  const klav = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!variantlar.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setFaol((f) => Math.min(f + 1, variantlar.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setFaol((f) => Math.max(f - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); tanla(variantlar[faol]); }
  };

  const saqla = async () => {
    if (!tanlangan || band) return;
    if (xatolar.length) { setXato(xatolar[0].matn); return; }
    const bolim = bolimlar.find((b) => String(b.id) === bolimId);
    setBand(true); setXato('');
    try {
      const h = son(hajm)!;
      const res = await ishAbcSaqla({
        kompaniyaId, obyektId, command: 'additional', sana: new Date().toISOString().slice(0, 10), sabab: sabab.trim(), operationId: operationId.current,
        otaQatorId: bolim?.id ?? null, kutilganVersiya: bolim?.versiya ?? null, almashtirilayotganQatorId: null,
        ish: { kod: tanlangan.kod?.trim() || null, nom: tanlangan.nom.trim(), birlik: (tanlangan.birlik ?? '').trim(), hajm: h },
        resurslar: resurslar.map((r) => { const n = son(r.norma); return { kat: r.kat, kod: r.kod.trim() || null, nom: r.nom.trim(), birlik: r.birlik.trim(), norma: n != null && n > 0 ? n : null, hajm: n != null && n > 0 ? null : son(r.hajm ?? ''), narx: son(r.narx), narx_manba: r.manba }; }),
        faktHajm: h,
      });
      if (!res.ok) { setXato(abcXato(res)); return; }
      const id = Number.isSafeInteger(Number((res as { qator_id?: unknown }).qator_id)) ? Number((res as { qator_id?: unknown }).qator_id) : null;
      await onSaqlandi({ id, nom: tanlangan.nom, birlik: tanlangan.birlik ?? '', hajm: h, jami: hisob.jami });
    } catch { setXato(t('Javob olinmadi. Qayta bosing — takroriy saqlash xavfsiz.')); } finally { setBand(false); }
  };

  useHotkeys('boshqa-joydan', t('Boshqa joydan olish'), [{ id: 'boshqa.yop', keys: 'esc', nom: t('Yopish'), inInput: true, run: () => { if (band) return false; onYop(); } }], true);

  const inp = 'w-full rounded-md border border-border bg-bg px-2 py-1 text-[12px] text-text outline-none focus:border-accent';
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/60 p-4" role="dialog" aria-modal="true" aria-label={t('Boshqa joydan olish')}>
      <div className="karta mt-4 w-full max-w-[980px] space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">{t('Boshqa joydan olish')}</h2>
            <p className="mt-1 text-[12px] text-text-dim">{t('“{xom}” smetaning boshqa razdelida yoki boshqa obyekt smetasida bor ishdan shablon olinadi: kerakli razdelga qoʻshimcha qator yaratiladi, asl smeta qatorlari oʻzgarmaydi.', { xom: qator.xom })}</p>
          </div>
          <button type="button" disabled={band} onClick={onYop} className="rounded p-1 text-text-dim hover:bg-surface-2" aria-label={t('Yopish')}><X size={18} /></button>
        </div>

        {!tanlangan && (
          <div>
            <input ref={qRef} autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={klav} aria-label={t('Ish nomi boʻyicha qidirish')} placeholder={t('Ish nomi (3+ harf)')} className={inp} />
            <ul role="listbox" aria-label={t('Boshqa smetalardagi ishlar')} className="mt-2 max-h-80 overflow-auto rounded-lg border border-border">
              {yuklanmoqda && <li className="px-3 py-2 text-[12px] text-text-mute">{t('Qidirilmoqda…')}</li>}
              {variantlar.map((v, i) => (
                <li key={`${v.qator_id}-${i}`} role="option" aria-selected={i === faol} onMouseEnter={() => setFaol(i)} onClick={() => tanla(v)}
                  className={`cursor-pointer border-b border-border/50 px-3 py-2 text-[12px] ${i === faol ? 'bg-accent/10' : 'hover:bg-surface-2'}`}>
                  <div className="flex justify-between gap-3"><span className="font-medium text-text">{v.nom}</span><span className="shrink-0 text-text-mute">{v.birlik}</span></div>
                  <div className="mt-0.5 flex gap-3 text-[10px] text-text-mute"><span className="font-mono">{v.kod}</span><span>{t('{n} resurs', { n: v.sostav.length })}</span><span>{v.shu_obyekt ? t('shu obyekt smetasida') : t('{n} ta smetada', { n: v.soni ?? 1 })}</span></div>
                </li>
              ))}
              {!yuklanmoqda && !variantlar.length && <li className="px-3 py-2 text-[12px] text-text-mute">{q.trim().length < 3 ? t('Qidirish uchun kamida 3 harf yozing.') : t('Boshqa smetalarda mos ish topilmadi.')}</li>}
            </ul>
          </div>
        )}

        {tanlangan && (
          <fieldset disabled={band} className="space-y-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-0 flex-1 text-[12px]"><div className="font-semibold text-text">{tanlangan.nom}</div><div className="text-text-mute">{tanlangan.kod ?? ''} · {tanlangan.birlik}</div></div>
              <button type="button" onClick={() => { setTanlangan(null); setXato(''); }} className="rounded-md border border-border px-2 py-1 text-[12px] hover:bg-surface-2">{t('Boshqasini tanlash')}</button>
            </div>
            <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
              <label className="block text-[12px] font-medium">{t('Razdel')}
                <select value={bolimId} onChange={(e) => setBolimId(e.target.value)} aria-label={t('Razdel')} className={`${inp} mt-1`}>
                  <option value="">{t('«СМЕТАДАН ТАШҚАРИ ИШЛАР» (avtomatik razdel)')}</option>
                  {bolimlar.map((b) => <option key={b.id} value={b.id}>{`${'· '.repeat(b.daraja)}${b.nom}`}</option>)}
                </select>
              </label>
              <label className="block text-[12px] font-medium">{t('Bajarilgan hajm')}
                <input value={hajm} onChange={(e) => setHajm(e.target.value)} inputMode="decimal" aria-label={t('Bajarilgan hajm')} className={`${inp} mt-1 text-right`} />
              </label>
            </div>
            <table className="w-full text-[12px]">
              <thead className="bg-surface-2 text-[11px] text-text-dim"><tr><th className="p-1.5 text-left">{t('Resurs')}</th><th className="w-20 p-1.5 text-left">{t('Birlik')}</th><th className="w-24 p-1.5 text-right">{t('Norma')}</th><th className="w-24 p-1.5 text-right">{t('Hajm')}</th><th className="w-28 p-1.5 text-right">{t('Narx')}</th><th className="w-28 p-1.5 text-right">{t('Summa')}</th></tr></thead>
              <tbody>
                {resurslar.map((r, i) => (
                  <tr key={i} className="border-t border-border/60">
                    <td className="p-1.5"><span className="mr-1 text-[10px] text-text-mute">{r.kat}</span>{r.nom}</td>
                    <td className="p-1.5 text-text-dim">{r.birlik}</td>
                    <td className="p-1"><input value={r.norma} onChange={(e) => yangila(i, { norma: e.target.value })} aria-label={t('{n}-resurs normasi', { n: i + 1 })} className={`${inp} text-right`} /></td>
                    <td className="p-1.5 text-right tabular-nums">{fmt(hisob.qatorlar[i]?.hajm)}</td>
                    <td className="p-1"><MoneyInput value={r.narx} onValueChange={(v) => yangila(i, { narx: v, manba: v.trim() && r.manba === 'smeta' ? 'smeta' : 'qolda' })} inputMode="decimal" aria-label={t('{n}-resurs narxi', { n: i + 1 })} className={`${inp} text-right`} /></td>
                    <td className="p-1.5 text-right tabular-nums">{fmt(hisob.qatorlar[i]?.summa)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr className="border-t border-border font-semibold"><td colSpan={5} className="p-1.5 text-right">{t('Jami (narxsiz: {n})', { n: hisob.narxsiz })}</td><td className="p-1.5 text-right tabular-nums">{fmt(hisob.jami)}</td></tr></tfoot>
            </table>
            <label className="block text-[12px] font-medium">{t('Sabab (manba qator saqlanadi)')}
              <input value={sabab} onChange={(e) => setSabab(e.target.value)} aria-label={t('Sabab')} className={`${inp} mt-1`} />
            </label>
          </fieldset>
        )}

        {xato && <div role="alert" className="rounded-lg border border-danger/40 bg-danger/5 px-3 py-2 text-[12px] text-danger">{xato}</div>}
        <div className="flex justify-end gap-2">
          {onKatalog && !tanlangan && <button type="button" onClick={onKatalog} className="mr-auto rounded-lg border border-accent/40 bg-accent/5 px-3 py-2 text-[12px] font-semibold text-text hover:bg-accent/10">{t('Smetada yoʻq — katalogdan qoʻshish')}</button>}
          <button type="button" disabled={band} onClick={onYop} className="rounded-lg border border-border px-3 py-2 text-[12px]">{t('Bekor qilish')}</button>
          {tanlangan && <button type="button" disabled={band} onClick={() => void saqla()} className="rounded-lg bg-accent px-3 py-2 text-[12px] font-semibold text-white disabled:opacity-50">{band ? t('Saqlanmoqda…') : t('Qoʻshimcha qator yaratish va fakt yozish')}</button>}
        </div>
      </div>
    </div>
  );
}
