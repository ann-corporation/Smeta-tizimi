/**
 * Normativ katalog paneli — to'plam → bo'lim → jadval → pozitsiya daraxti, shifr/nom (va ma'no) bo'yicha qidiruv,
 * tanlangan ishning normativ resurslari. Smeta Studio (LRV) va fakt oynasidagi zamena (IshAbcModal) BIR XIL
 * komponentdan foydalanadi (dublikat yo'q). Katalog o'zgarmas ma'lumotnoma (R2); bu panel faqat o'qiydi.
 */
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { t } from '../../i18n/til';
import type { NormDetail, RemoteTreeNode } from '../../lib/catalog-extraction/norm-remote';
import type { StudioNormCatalog } from '../../lib/catalog-extraction/norm-library';
import type { NormWork } from '../../lib/catalog-extraction/norm-catalog';
import { catalogueBasis } from '../../lib/smeta-studio/catalog-bridge';
import { parseQuantityInput } from '../../lib/smeta-studio/quantity-input';
import { ishIndeksi } from '../../lib/smeta-ai/worker';

export type NormRecipe = NormDetail['recipes'][number];

export function KatalogPanel({ katalog, nishon = null, onAdd, commandError = '', amalMatn, izoh, hajmYoq = false, onResurs, boshlangichIsh, amalYoq = false }: {
  katalog: StudioNormCatalog; nishon?: string | null; commandError?: string;
  onAdd: (work: NormWork, detail: NormDetail, quantity: string) => boolean;
  /** Tugma matni (standart: «Smetaga qo‘shish»). */
  amalMatn?: string;
  /** Tugma yonidagi izoh (standart: Smeta Studio bo'lim izohi). */
  izoh?: ReactNode;
  /** Hajm maydoni kerak emas (masalan zamena oynasida hajm o'zida kiritiladi). */
  hajmYoq?: boolean;
  /** Berilsa — resurs qatorini tanlash (resurs zamenasi: normativ resursni olish). */
  onResurs?: (r: NormRecipe, detail: NormDetail) => void;
  /** Berilsa — shu ish darhol ochiladi (masalan AI taklifidan). */
  boshlangichIsh?: NormWork | null;
  /** Ishni qo'shish tugmasi kerak emas (faqat resurs tanlanadi). */
  amalYoq?: boolean;
}) {
  const [tugun, setTugun] = useState(-1);
  const [soz, setSoz] = useState(''), [qidiruv, setQidiruv] = useState(''), [sahifa, setSahifa] = useState(0);
  const [tanlangan, setTanlangan] = useState<NormWork | null>(null), [detail, setDetail] = useState<NormDetail | null>(null);
  const [yuklash, setYuklash] = useState(false), [resSahifa, setResSahifa] = useState(0), [hajm, setHajm] = useState('');
  const [xato, setXato] = useState('');
  const [addResult, setAddResult] = useState<'success' | 'failed' | null>(null);
  const [addedSection, setAddedSection] = useState('');
  const quantityInput = useRef<HTMLInputElement>(null);
  const quantityHelpId = useId();
  const detailId = detail?.work.id;
  useEffect(() => { if (detailId && !hajmYoq && !amalYoq) quantityInput.current?.focus(); }, [detailId, hajmYoq, amalYoq]);
  useEffect(() => { const timer = setTimeout(() => { setQidiruv(soz); setSahifa(0); }, 200); return () => clearTimeout(timer); }, [soz]);
  const selectionRequest = useRef(0);
  useEffect(() => () => { selectionRequest.current++; }, []);
  const bolalar = useMemo(() => {
    const first = katalog.childNodes(tugun, 0);
    const nodes = [...first.nodes];
    for (let page=1; page*25<first.total; page++) nodes.push(...katalog.childNodes(tugun,page).nodes);
    return { total:first.total,nodes };
  }, [katalog, tugun]);
  const yolak = useMemo(() => tugun >= 0 ? katalog.breadcrumb(tugun) : [], [katalog, tugun]);
  const jadvalmi = tugun >= 0 && katalog.node(tugun).isTable;
  const ishlar = useMemo(() => {
    if (!(qidiruv.trim() || jadvalmi)) return null;
    const r = katalog.search(qidiruv, sahifa, tugun);
    if (r.total || !qidiruv.trim() || tugun >= 0) return { ...r, mano: false };
    // No literal match: closest works by meaning (estimate wording differs from normative wording).
    const x = ishIndeksi(katalog);
    const rows = x ? x.idx.qidir([qidiruv], 75).map(h => x.works[h.id]) : [];
    return { rows: rows.slice(sahifa * 25, (sahifa + 1) * 25), total: rows.length, mano: true };
  }, [katalog, qidiruv, sahifa, tugun, jadvalmi]);
  const nom = (n: RemoteTreeNode) => n.name || t('Ish turlari');
  const ochish = (i: number) => { setTugun(i); setSahifa(0); };
  async function tanla(w: NormWork) {
    const request = ++selectionRequest.current;
    setTanlangan(w); setDetail(null); setResSahifa(0); setHajm(''); setXato(''); setAddResult(null); setYuklash(true);
    try { await katalog.load(w.id); if (request === selectionRequest.current) setDetail(katalog.detail(w.id, 0)); }
    catch { if (request === selectionRequest.current) setXato(t('Ish resurslari yuklanmadi. Qayta urinib ko‘ring.')); }
    finally { if (request === selectionRequest.current) setYuklash(false); }
  }
  const boshlandi = useRef<string | null>(null);
  useEffect(() => { if (boshlangichIsh && boshlandi.current !== boshlangichIsh.id) { boshlandi.current = boshlangichIsh.id; void tanla(boshlangichIsh); } });
  const unit = tanlangan ? katalog.unit(tanlangan.unitCode) : null;
  const sourceMeasure = 'sourceBasis' in katalog;
  const basis = detail ? catalogueBasis(katalog, detail.work.unitCode) : null;
  const measureLabel = unit?.text ?? (sourceMeasure ? detail?.work.unitCode : null);
  let quantity: ReturnType<typeof parseQuantityInput> | null = null;
  let quantityInvalid = false;
  if (!hajmYoq && hajm.trim()) {
    try { quantity = parseQuantityInput(hajm); } catch { quantityInvalid = true; }
  }
  return <div className="space-y-2">
    {tugun >= 0 && katalog.breadcrumb(tugun).some(n => n.labelOrigin === 'EDITORIAL') && <p role="status" className="text-sm text-text-dim">{t('Bo‘lim nomlari ishlar mazmuni asosida tuzilgan.')}</p>}
    <nav aria-label={t('Katalog ierarxiyasi')} className="flex flex-wrap gap-1 text-sm">
      <button className="underline" onClick={() => ochish(-1)}>{t('Katalog')}</button>
      {yolak.map(n => <span key={n.index}>/ <button className="underline" onClick={() => ochish(n.index)}>{nom(n)}</button></span>)}
    </nav>
    <input className="w-full p-2 border border-border rounded bg-bg" aria-label={t('Normativ ish qidirish')}
      placeholder={tugun >= 0 ? t('Shu bo‘lim ichida qidirish: shifr yoki nom') : t('Ish shifri yoki nomi (lotin/kirill)')} value={soz} onChange={e => setSoz(e.target.value)} />
    {!ishlar && <div className="border border-border rounded max-h-[55vh] overflow-y-auto">
      {bolalar.nodes.map(n => <button key={n.index} className="flex w-full items-center gap-2 text-left px-2 py-1.5 border-b border-border hover:bg-surface-2" onClick={() => ochish(n.index)}>
        <span className="flex-1 min-w-0 truncate">{nom(n)}</span>
        {n.labelOrigin === 'EDITORIAL' && <span className="text-xs text-text-mute">{t('Tahririy nom')}</span>}
        <span className="text-xs text-text-mute tabular-nums">{n.workCount.toLocaleString('ru')}</span>
      </button>)}
    </div>}
    {ishlar && <div className="border border-border rounded max-h-[34vh] overflow-y-auto">
      <p className="text-xs text-text-mute px-2 py-1">{ishlar.mano ? t('Aynan mos yozuv yo‘q — ma’no bo‘yicha eng yaqin ishlar') : <>{t('Topildi')}: {ishlar.total.toLocaleString('ru')}</>}</p>
      {ishlar.rows.map(w => <button key={w.id} className={`block w-full text-left px-2 py-1.5 border-b border-border hover:bg-surface-2 ${tanlangan?.id === w.id ? 'bg-surface-2' : ''}`} onClick={() => void tanla(w)}>
        <span className="font-mono text-xs text-accent">{w.code}</span> <span>{w.name ?? t('Nom noma’lum')}</span>
      </button>)}
      {ishlar.total > 25 && <div className="flex gap-2 items-center p-1 text-sm">
        <button disabled={!sahifa} onClick={() => setSahifa(p => p - 1)}>{t('Oldingi')}</button>
        <span>{sahifa + 1} / {Math.ceil(ishlar.total / 25)}</span>
        <button disabled={(sahifa + 1) * 25 >= ishlar.total} onClick={() => setSahifa(p => p + 1)}>{t('Keyingi')}</button>
      </div>}
    </div>}
    {yuklash && <p className="text-text-dim text-sm">{t('Resurslar yuklanmoqda...')}</p>}
    {xato && <p role="alert" className="text-danger text-sm">{xato}</p>}
    {tanlangan && detail && <div className="border border-accent rounded p-2 space-y-2">
      <h3 className="font-semibold"><span className="font-mono text-accent">{detail.work.code}</span> · {detail.work.name}</h3>
      <p className="text-sm">{t('O‘lchov birligi')}: {measureLabel ? <b>{measureLabel}</b> : <span className="text-warn">{t('manbada aniqlanmagan — qo‘shgandan keyin asosni kiriting')}</span>}
        {unit && <span className="text-xs text-text-mute"> · {t('real smetalarda {n} marta kuzatilgan', { n: unit.observations })}</span>}</p>
      {sourceMeasure && basis?.scale && basis.unitLabel && <p className="text-sm">{t('Norma masshtabi')}: <b>{basis.scale} {basis.unitLabel}</b></p>}
      {detail.recipeCount === 0 && <p role="status" className="text-sm text-warn">{t('Resurs retsepti yo‘q — ishni smetaga qo‘shib bo‘lmaydi.')}</p>}
      {detail.workCodeAmbiguous && <p className="text-danger text-sm">{t('Bir shifrga ikki ish yozuvi mos keladi — bu ish hisobga qo‘shilmaydi.')}</p>}
      {!amalYoq && <form className="space-y-2" onSubmit={e => {
        e.preventDefault();
        if (quantityInvalid || detail.workCodeAmbiguous || detail.recipeCount === 0) return;
        const ok = onAdd(tanlangan, detail, hajmYoq ? hajm : quantity?.qiymat ?? '');
        setAddResult(ok ? 'success' : 'failed');
        if (ok) { setAddedSection(nishon ?? ''); setHajm(''); quantityInput.current?.focus(); }
      }}>
        <div className="flex flex-wrap items-end gap-2">
          {!hajmYoq && <label className="min-w-40 flex-1 text-sm">{t('Hajm yoki formula')}{basis?.unitLabel ? ` (${basis.unitLabel})` : ''}
            <input ref={quantityInput} className="block w-full min-h-11 p-2 border border-border rounded bg-bg" inputMode="text"
              value={hajm} aria-invalid={quantityInvalid} aria-describedby={quantityHelpId} autoComplete="off"
              onChange={e => { setHajm(e.target.value); setAddResult(null); }} placeholder="12 × 3 × 0,2" />
          </label>}
          <button type="submit" className="min-h-11 px-3 py-2 rounded bg-accent text-white disabled:opacity-40"
            disabled={quantityInvalid || detail.workCodeAmbiguous || detail.recipeCount === 0}>{amalMatn ?? t('Smetaga qo‘shish')} →</button>
        </div>
        {!hajmYoq && <p id={quantityHelpId} role={quantityInvalid ? 'alert' : 'status'} className={`text-xs ${quantityInvalid ? 'text-danger' : 'text-text-dim'}`}>
          {quantityInvalid ? t('Hajm yoki formulani tekshiring. Masalan: 12 × 3 × 0,2.')
            : quantity ? t('Hisoblangan hajm: {n} {birlik}', { n: quantity.qiymat, birlik: basis?.unitLabel ?? '' })
            : t('Hajmni hozir kiriting yoki bo‘sh qoldirib keyin to‘ldiring. Enter — qo‘shish.')}
        </p>}
        {izoh !== undefined ? izoh : <p className="text-xs text-text-mute">{nishon ? t('Bo‘lim: {n}', { n: nishon }) : t('Ish uchun bo‘lim avtomatik yaratiladi')}</p>}
      </form>}
      {addResult === 'success' && izoh === undefined && <p role="status" className="text-sm text-accent">{addedSection
        ? t('Ish «{nom}» «{bolim}» bo‘limiga qo‘shildi.', { nom: detail.work.name ?? detail.work.code, bolim: addedSection })
        : t('Ish «{nom}» smetaga qo‘shildi.', { nom: detail.work.name ?? detail.work.code })}</p>}
      {addResult === 'failed' && <p role="alert" className="text-sm text-danger">{commandError || t('Amal bajarilmadi. Kiritilgan qiymatlarni tekshiring.')}</p>}
      <details key={detail.work.id} open={onResurs != null || amalYoq}>
      <summary className="cursor-pointer py-2 text-sm font-medium">{t('Resurslar tarkibi ({n})', { n: detail.recipeCount })}</summary>
      <table className="w-full text-xs"><thead><tr className="text-text-mute"><th className="text-left">{t('Resurs')}</th><th className="text-right">{t('Norma')}</th><th className="text-left">{t('Holat')}</th>{onResurs && <th />}</tr></thead>
        <tbody>{detail.recipes.map(r => <tr key={r.id} className="border-t border-border">
          <td>{r.resourceStatus === 'EXACT' ? r.candidates[0]?.name : <span className="text-warn">{r.resourceCode ?? r.resourceIdCode} — {t('{n} nomzod', { n: r.candidateCount })}</span>}</td>
          <td className="text-right tabular-nums">{r.norm ?? t('Noma’lum')}</td>
          <td>{r.resourceStatus === 'EXACT' ? '✓' : r.resourceStatus === 'AMBIGUOUS' ? t('noaniq') : t('topilmadi')}</td>
          {onResurs && <td className="text-right">{r.resourceStatus === 'EXACT' && <button type="button" className="rounded border border-accent/50 px-1.5 py-0.5 text-[11px] text-accent hover:bg-accent/10" onClick={() => onResurs(r, detail)} aria-label={t('Resursni tanlash: {nom}', { nom: r.candidates[0]?.name ?? '' })}>{t('Tanlash')}</button>}</td>}
        </tr>)}</tbody></table>
      {detail.recipeCount > 25 && <div className="flex gap-2 text-xs">
        <button disabled={!resSahifa} onClick={() => { setResSahifa(p => p - 1); setDetail(katalog.detail(detail.work.id, resSahifa - 1)); }}>{t('Oldingi')}</button>
        <span>{resSahifa + 1} / {Math.ceil(detail.recipeCount / 25)}</span>
        <button disabled={(resSahifa + 1) * 25 >= detail.recipeCount} onClick={() => { setResSahifa(p => p + 1); setDetail(katalog.detail(detail.work.id, resSahifa + 1)); }}>{t('Keyingi')}</button>
      </div>}
      </details>
    </div>}
  </div>;
}
