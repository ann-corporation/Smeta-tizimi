import { t as tr } from '../../i18n/til';
import { MoneyInput } from '../../umumiy/ui/MoneyInput';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Building2, FileSignature, Link2, Plus, Save, Trash2, Users, X } from 'lucide-react';
import { Sahifa } from '../../umumiy/ui/Sahifa';
import { toast } from '../../umumiy/ui/Toast';
import { FmtN } from '../../lib/format';
import { useKompaniya } from '../../test02/KompaniyaTanlov';
import { sbT2ObyektlarOlKomp, yangiOperationId } from '../../api/supabase';
import { QQS_STAVKA, farq, smetaAloqa, yaxlit2, type ObyektSmeta } from '../../lib/shartnoma-smeta';
import { liniyaXato, shartnomaLiniyaOl, shartnomaSaqlaV2, type Liniya, type LiniyaShartnoma } from '../../api/t2-shartnoma-liniya';
import {
  ROL_TAKLIF, TUR_TAKLIF, liniyaDaraxt, shaklQur, shaklTekshir, shaklYuk, shartnomasizObyektlar, takliflar, tanlashMumkin, type Shakl,
} from '../../lib/shartnoma-liniya';
import { shartnomaSvodOl } from '../../api/t2-nakopitelniy';
import { shartnomaSvodi, svodJami, type ShartnomaSvodi } from '../../lib/nakopitelniy-svod';
import { PortfelSummaJuft } from '../../umumiy/ui/PortfelSummaJuft';
import { usePortfelUstamali } from '../../umumiy/ui/usePortfelUstamali';
import { HisobMeterIxcham, ShartnomaZanjir, ZanjirKpi } from '../../components/shartnoma-liniya/ShartnomaZanjir';
import { ShartnomaHujjatlar } from '../../components/shartnoma-liniya/ShartnomaHujjatlar';
import { raqamTozala } from '../../lib/raqam-belgi';

const kirit = 'w-full rounded-md border border-border bg-surface px-2 py-1.5 text-[13px] text-text outline-none focus:border-accent';
const yorliq = 'mb-1 block text-[11px] font-medium uppercase tracking-wide text-text-mute';

/**
 * Egasi (2026-10-01): «loyiha ichida shartnoma, shartnomada tomonlar bog'lanadi, undan keyingi qavatlarda obyektlar».
 * Asosiy (buyurtmachi ↔ pudratchi) shartnoma — obyektda bitta; subpudrat, laboratoriya, loyihachi, yetkazib beruvchi — cheklanmagan.
 * Rollar va turlar erkin matn (takliflar bilan).
 */
export function ShartnomaLiniya() {
  const { joriy } = useKompaniya();
  const kid = joriy?.id ?? null;
  const [liniya, setLiniya] = useState<Liniya | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const [yuklanmoqda, setYuklanmoqda] = useState(false);
  const [shakl, setShakl] = useState<Shakl | null>(null);
  const [saqlanmoqda, setSaqlanmoqda] = useState(false);
  const [obQidir, setObQidir] = useState('');
  // Ochiq shartnoma obyektlarining smeta qiymati — USTAMALI (ИТОГО-4, QQS siz) va QQS bilan: shartnoma summasi (QQS siz)
  // aynan ИТОГО-4 bilan solishtiriladi (avval to'g'ri xarajat bilan solishtirilardi — baza mos emas edi).
  const shaklObyektlar = useMemo(() => (shakl?.obyektlar ?? []).map((obyektId) => ({ obyektId, shartnomaId: shakl?.id ?? null })), [shakl?.obyektlar, shakl?.id]);
  const shaklUst = usePortfelUstamali(shaklObyektlar, { kompaniyaId: kid });
  const shaklUstamali = shaklUst.holat === 'tayyor' && shaklUst.nomalumSoni === 0 ? shaklUst.ustamali : null;
  const shaklQqsBilan = shaklUstamali != null ? shaklUst.ndsBilan : null;
  // Obyektlarning smeta summasi (nakrutkasiz) — shartnoma summasi bilan solishtirish uchun.
  const [smetalar, setSmetalar] = useState<ReadonlyMap<number, ObyektSmeta>>(new Map());
  useEffect(() => {
    if (!kid) return;
    let faol = true;
    void (async () => {
      try { const r = await sbT2ObyektlarOlKomp(kid); if (faol && r.ok) setSmetalar(new Map((r.qatorlar ?? []).map((o) => [o.id, { id: o.id, nom: o.nom, jami: o.jami }]))); }
      catch { /* smeta summasi ko'rsatilmaydi — tahrir ishlayveradi */ }
    })();
    return () => { faol = false; };
  }, [kid]);

  /** Shartnoma zanjiri (DS → F2 → F3 → to'lov → sverka): faqat ko'rsatish; o'qilmasa — zanjir ko'rinmaydi, tahrir ishlayveradi. */
  const [svod, setSvod] = useState<ReadonlyMap<number, ShartnomaSvodi> | null>(null);
  const svodYukla = useCallback(async () => {
    if (!kid) return;
    try { const r = await shartnomaSvodOl(kid); setSvod(r.ok ? new Map(r.natija.shartnomalar.map((x) => [x.id, shartnomaSvodi(x)])) : null); }
    catch { setSvod(null); }
  }, [kid]);
  useEffect(() => { void svodYukla(); }, [svodYukla]);
  const svodJ = useMemo(() => (svod && svod.size ? svodJami([...svod.values()]) : null), [svod]);

  const yukla = useCallback(async () => {
    if (!kid) return;
    setYuklanmoqda(true);
    const r = await shartnomaLiniyaOl(kid);
    setYuklanmoqda(false);
    if (r.ok) { setLiniya(r.natija); setXato(null); } else setXato(r.error);
  }, [kid]);
  useEffect(() => { void yukla(); }, [yukla]);

  const daraxt = useMemo(() => (liniya ? liniyaDaraxt(liniya) : []), [liniya]);
  const shartnomasiz = useMemo(() => (liniya ? shartnomasizObyektlar(liniya) : []), [liniya]);
  const obNom = useMemo(() => new Map((liniya?.obyektlar ?? []).map((o) => [o.id, o.nom])), [liniya]);
  const rollar = useMemo(() => takliflar(ROL_TAKLIF, liniya?.rollar ?? []), [liniya]);
  const turlar = useMemo(() => takliflar(TUR_TAKLIF, liniya?.turlar ?? []), [liniya]);
  const asosiylar = useMemo(() => (liniya?.shartnomalar ?? []).filter((s) => s.asosiy), [liniya]);
  const xatolar = useMemo(() => (shakl ? shaklTekshir(shakl) : []), [shakl]);
  const tanlov = useMemo(() => (liniya && shakl ? tanlashMumkin(liniya, shakl) : []), [liniya, shakl]);

  const ochish = (s: LiniyaShartnoma | null, loyihaId: number | null = null) => { setShakl(shaklQur(s, loyihaId)); setObQidir(''); };
  const ozgar = (p: Partial<Shakl>) => setShakl((s) => (s ? { ...s, ...p } : s));

  async function saqla(s: Shakl, xabar = 'Shartnoma saqlandi') {
    if (!kid || saqlanmoqda) return false;
    if (shaklTekshir(s).length) { toast('Shaklda xato bor', 'danger'); return false; }
    setSaqlanmoqda(true);
    const y = shaklYuk(s);
    const r = await shartnomaSaqlaV2({ kompaniyaId: kid, id: s.id, kutilganVersiya: s.versiya, ...y, operationId: yangiOperationId() });
    setSaqlanmoqda(false);
    if (!r.ok) { toast(liniyaXato(r), 'danger'); return false; }
    toast(xabar, 'ok');
    await yukla();
    void svodYukla();
    return true;
  }

  /** Shartnomasiz obyektni asosiy shartnomaga bir bosishda biriktirish. */
  async function biriktir(obyektId: number, shartnomaId: number) {
    const s = asosiylar.find((x) => x.id === shartnomaId);
    if (!s) return;
    const sh = shaklQur(s);
    await saqla({ ...sh, obyektlar: [...sh.obyektlar, obyektId] }, `«${obNom.get(obyektId) ?? obyektId}» № ${raqamTozala(s.raqam)} ga biriktirildi`);
  }

  function shartnomaQatori(s: LiniyaShartnoma) {
    const tanlangan = shakl?.id === s.id;
    return (
      <li key={s.id}>
        <button type="button" onClick={() => ochish(s)} aria-label={`Shartnoma № ${raqamTozala(s.raqam)}`}
          aria-current={tanlangan ? 'true' : undefined}
          className={`w-full rounded-lg border px-3 py-2.5 text-left transition ${tanlangan ? 'border-accent bg-accent/5' : 'border-border hover:border-accent/50 hover:bg-surface-2'}`}>
          <div className="flex items-center gap-2">
            <FileSignature size={14} className={s.asosiy ? 'text-accent' : 'text-text-mute'} />
            <span className="truncate text-[13px] font-semibold text-text">№ {raqamTozala(s.raqam)}</span>
            <span className={`fz-chip ${s.asosiy ? 'fz-chip--accent' : ''}`}>{s.asosiy ? tr('asosiy') : (s.turi || tr('qo‘shimcha'))}</span>
            {s.asosiy && s.turi && <span className="shrink-0 truncate text-[11px] text-text-mute">{s.turi}</span>}
            <span className="ml-auto shrink-0 text-right text-sm tabular-nums text-text-dim">{s.jami_nds_bilan != null ? <FmtN val={s.jami_nds_bilan} /> : <span className="text-text-mute">{tr('summa kiritilmagan')}</span>}
              {(() => { const a = smetaAloqa(s.obyektlar, smetalar); return a.smeta != null ? <span className="mt-0.5 flex items-start justify-end gap-1.5 text-xs text-text-mute">{tr('smeta:')} <PortfelSummaJuft kichik obyektlar={s.obyektlar.map((obyektId) => ({ obyektId, shartnomaId: s.id ?? null }))} ustamasiz={a.smeta} kompaniyaId={kid} /></span> : null; })()}</span>
          </div>
          {s.nom && <div className="mt-0.5 truncate text-[12px] text-text-dim">{s.nom}</div>}
          {svod?.get(s.id) && <div className="mt-1.5 max-w-sm"><HisobMeterIxcham sv={svod.get(s.id)!} /></div>}
          {s.tomonlar.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{s.tomonlar.map((t, i) => <span key={i} className="fz-chip font-normal"><span className="text-text-mute">{t.rol}:</span> {t.nom}</span>)}</div>}
          {s.obyektlar.length > 0 && <ul className="mt-1.5 space-y-0.5 border-l border-border pl-2">{s.obyektlar.map((o) => <li key={o} className="flex items-center gap-1 truncate text-[12px] text-text"><Building2 size={11} className="shrink-0 text-text-mute" />{obNom.get(o) ?? `#${o}`}</li>)}</ul>}
        </button>
      </li>
    );
  }

  function karta(s: Shakl) {
    const xatoJoy = (j: string) => xatolar.find((x) => x.joy === j)?.matn;
    const q = obQidir.trim().toLocaleLowerCase('ru');
    const korinadi = tanlov.filter((o) => !q || o.nom.toLocaleLowerCase('ru').includes(q) || s.obyektlar.includes(o.id));
    return (
      <section className="fz-card flex min-h-0 flex-col" aria-label="Shartnoma kartasi">
        <header className="fz-card__head">
          <div className="flex min-w-0 items-center gap-2">
            <FileSignature size={16} className="text-accent" />
            <h2 className="fz-card__title">{s.id ? `${tr('Shartnoma')} № ${s.raqam || '—'}` : tr('Yangi shartnoma')}</h2>
            {s.asosiy && <span className="fz-stamp fz-stamp--ok">{tr('asosiy')}</span>}
          </div>
          <button type="button" aria-label="Yopish" onClick={() => setShakl(null)} className="fz-btn fz-btn--ghost fz-btn--icon fz-btn--sm"><X size={16} /></button>
        </header>
        <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4">
          {s.id != null && svod?.get(s.id) && <ShartnomaZanjir sv={svod.get(s.id)!} />}
          {s.id != null && <ShartnomaHujjatlar kompaniyaId={kid} shartnomaId={s.id} />}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label><span className={yorliq}>{tr('Loyiha')} *</span>
              <select aria-label="Loyiha" className={kirit} value={s.loyiha_id ?? ''} onChange={(e) => ozgar({ loyiha_id: e.target.value ? Number(e.target.value) : null })}>
                <option value="">{tr('— tanlang —')}</option>
                {liniya?.loyihalar.map((l) => <option key={l.id} value={l.id}>{l.nom}</option>)}
              </select>
              {xatoJoy('loyiha') && <span className="text-[11px] text-danger">{xatoJoy('loyiha')}</span>}
            </label>
            <label><span className={yorliq}>{tr('Raqam')} *</span>
              <input aria-label="Raqam" className={kirit} value={s.raqam} onChange={(e) => ozgar({ raqam: e.target.value })} />
              {xatoJoy('raqam') && <span className="text-[11px] text-danger">{xatoJoy('raqam')}</span>}
            </label>
            <label className="sm:col-span-2"><span className={yorliq}>{tr('Nomi / predmeti')}</span>
              <input aria-label="Nomi" className={kirit} value={s.nom} onChange={(e) => ozgar({ nom: e.target.value })} />
            </label>
            <label><span className={yorliq}>{tr('Turi (erkin)')}</span>
              <input aria-label="Turi" list="sh-turlar" className={kirit} value={s.turi} onChange={(e) => ozgar({ turi: e.target.value })} placeholder={tr('Bosh shartnoma, Subpudrat, Laboratoriya…')} />
              <datalist id="sh-turlar">{turlar.map((t) => <option key={t} value={t} />)}</datalist>
            </label>
            <label className="flex items-start gap-2 pt-5">
              <input type="checkbox" aria-label="Asosiy shartnoma" checked={s.asosiy} onChange={(e) => ozgar({ asosiy: e.target.checked })} className="mt-0.5" />
              <span className="text-[12px] text-text">{tr('Asosiy (buyurtmachi ↔ pudratchi)')}<span className="block text-[11px] text-text-mute">{tr('Obyekt faqat bitta asosiy shartnomada bo‘ladi; qolganlari cheklanmagan.')}</span></span>
            </label>
            {(['summa_bez_nds', 'nds', 'jami_nds_bilan'] as const).map((k) => (
              <label key={k}><span className={yorliq}>{k === 'summa_bez_nds' ? tr('Summa (QQSsiz)') : k === 'nds' ? tr('QQS') : tr('Jami (QQS bilan)')}</span>
                <MoneyInput aria-label={k} inputMode="decimal" className={`${kirit} tabular-nums`} value={s[k]} onValueChange={(value) => ozgar({ [k]: value } as Partial<Shakl>)} />
                {xatoJoy(k) && <span className="text-[11px] text-danger">{xatoJoy(k)}</span>}
              </label>
            ))}
          </div>
          {(() => {
            const a = smetaAloqa(s.obyektlar, smetalar);
            const sonOl = (v: string) => { const n = Number(String(v).replace(/\s/g, '').replace(',', '.')); return v.trim() && Number.isFinite(n) ? n : null; };
            const shSumma = sonOl(s.summa_bez_nds);
            const f = farq(shSumma, shaklUstamali);
            const nds = sonOl(s.nds);
            return (
              <div className="fz-panel text-[12.5px]" aria-label={tr('Smeta bilan aloqa')}>
                <p className="fz-panel__h">{tr('Smeta bilan aloqa')}</p>
                {a.qatorlar.length === 0 ? <p className="text-text-mute">{tr('Obyekt bog‘lanmagan — pastda obyektlarni tanlang.')}</p> : <>
                  <ul className="space-y-0.5">{a.qatorlar.map((q) => <li key={q.id} className="flex justify-between gap-2"><span className="truncate">{q.nom}</span><span className="tabular-nums">{q.bor ? <FmtN val={q.jami} /> : <span className="text-text-mute">{tr('smeta yo‘q')}</span>}</span></li>)}</ul>
                  <p className="mt-1 flex justify-between border-t border-border/50 pt-1"><span>{tr('Smeta qiymati')}</span><span className="text-right">{a.smeta == null ? <b>—</b> : <PortfelSummaJuft kichik obyektlar={s.obyektlar.map((obyektId) => ({ obyektId, shartnomaId: s.id ?? null }))} ustamasiz={a.smeta} kompaniyaId={kid} />}</span></p>
                  <p className="flex justify-between"><span>{tr('Shartnoma summasi (QQSsiz)')}</span><b className="tabular-nums">{shSumma == null ? <span className="font-normal text-text-mute">{tr('kiritilmagan')}</span> : <FmtN val={shSumma} />}</b></p>
                  {f == null && shSumma != null && a.smeta != null && <p className="text-[11px] text-text-mute">{tr('Farq: smetaning ustamali qiymati hisoblanmadi — solishtirib bo‘lmaydi.')}</p>}
                  {f != null && <p className="flex justify-between"><span>{tr('Farq (shartnoma − smeta ustamali, QQS siz)')}</span><b className={`tabular-nums ${Math.abs(f) < 0.01 ? 'text-ok' : 'text-text'}`}><FmtN val={f} /></b></p>}
                  {a.nomalum > 0 && <p className="text-text-mute">{a.nomalum} {tr('ta obyektda smeta yo‘q — summaga kirmagan.')}</p>}
                  <p className="mt-0.5 text-[11px] text-text-mute">{tr('Smeta qiymati: QQS bilan (katta), ostida ustamali va to‘g‘ri xarajat. «Smeta qiymatini qo‘yish» ustamali (QQS siz) va QQS bilan qiymatni oladi. Shartnoma summasini tizim o‘zi o‘zgartirmaydi — kerak bo‘lsa tugma bilan to‘ldiring va tahrirlang.')}</p>
                </>}
                <div className="mt-1.5 flex flex-wrap gap-1">
                  <button type="button" className="fz-btn fz-btn--sm" disabled={shaklUstamali == null || shaklQqsBilan == null}
                    onClick={() => { const sm = yaxlit2(shaklUstamali as number); const jami = yaxlit2(shaklQqsBilan as number); ozgar({ summa_bez_nds: String(sm), nds: String(yaxlit2(jami - sm)), jami_nds_bilan: String(jami) }); }}>{tr('Smeta qiymatini qo‘yish (ustamali + QQS)')}</button>
                  <button type="button" className="fz-btn fz-btn--sm" disabled={shSumma == null}
                    onClick={() => { const q = yaxlit2((shSumma as number) * QQS_STAVKA); ozgar({ nds: String(q), jami_nds_bilan: String(yaxlit2((shSumma as number) + q)) }); }}>{tr('QQS 12% hisoblash')}</button>
                  <button type="button" className="fz-btn fz-btn--sm" disabled={shSumma == null}
                    onClick={() => ozgar({ jami_nds_bilan: String(yaxlit2((shSumma as number) + (nds ?? 0))) })}>{tr('Jami = Summa + QQS')}</button>
                  <button type="button" className="fz-btn fz-btn--sm" onClick={() => ozgar({ summa_bez_nds: '', nds: '', jami_nds_bilan: '' })}>{tr('Summalarni tozalash')}</button>
                </div>
              </div>
            );
          })()}

          <div>
            <div className="mb-1.5 flex items-center gap-2"><Users size={14} className="text-text-mute" /><span className="text-[13px] font-semibold text-text">{tr('Tomonlar')}</span>
              <button type="button" onClick={() => ozgar({ tomonlar: [...s.tomonlar, { rol: '', nom: '', inn: null }] })} className="fz-btn fz-btn--ghost fz-btn--sm ml-auto"><Plus size={12} />{tr('Tomon')}</button>
            </div>
            <datalist id="sh-rollar">{rollar.map((t) => <option key={t} value={t} />)}</datalist>
            <div className="space-y-1.5">
              {s.tomonlar.map((t, i) => (
                <div key={i} className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_minmax(0,7rem)_auto] items-start gap-1.5">
                  <input aria-label={`${i + 1}-tomon roli`} list="sh-rollar" className={kirit} value={t.rol} placeholder={tr('Rol')} onChange={(e) => ozgar({ tomonlar: s.tomonlar.map((x, j) => (j === i ? { ...x, rol: e.target.value } : x)) })} />
                  <input aria-label={`${i + 1}-tomon nomi`} className={kirit} value={t.nom} placeholder={tr('Tashkilot nomi')} onChange={(e) => ozgar({ tomonlar: s.tomonlar.map((x, j) => (j === i ? { ...x, nom: e.target.value } : x)) })} />
                  <input aria-label={`${i + 1}-tomon INN`} className={kirit} value={t.inn ?? ''} placeholder={tr('INN')} onChange={(e) => ozgar({ tomonlar: s.tomonlar.map((x, j) => (j === i ? { ...x, inn: e.target.value } : x)) })} />
                  <button type="button" aria-label={`${i + 1}-tomonni olib tashlash`} onClick={() => ozgar({ tomonlar: s.tomonlar.filter((_, j) => j !== i) })} className="rounded-md p-1.5 text-text-mute hover:bg-danger/10 hover:text-danger"><Trash2 size={14} /></button>
                  {xatoJoy(`t${i}`) && <span className="col-span-4 text-[11px] text-danger">{xatoJoy(`t${i}`)}</span>}
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-1.5 flex items-center gap-2"><Building2 size={14} className="text-text-mute" /><span className="text-[13px] font-semibold text-text">{tr('Obyektlar')}</span><span className="fz-chip">{tr('{n} ta tanlangan', { n: s.obyektlar.length })}</span></div>
            <input aria-label="Obyekt qidirish" className={`${kirit} mb-1.5`} value={obQidir} onChange={(e) => setObQidir(e.target.value)} placeholder={tr('Obyekt nomi…')} />
            <ul className="max-h-64 space-y-0.5 overflow-auto rounded-md border border-border p-1">
              {korinadi.length === 0 && <li className="px-2 py-1 text-[12px] text-text-mute">{s.asosiy ? tr('Mos obyekt yo‘q (boshqa asosiy shartnomadagilar ko‘rsatilmaydi)') : tr('Mos obyekt yo‘q')}</li>}
              {korinadi.map((o) => (
                <li key={o.id}><label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-[12px] text-text hover:bg-surface-2">
                  <input type="checkbox" aria-label={`Obyekt: ${o.nom}`} checked={s.obyektlar.includes(o.id)}
                    onChange={(e) => ozgar({ obyektlar: e.target.checked ? [...s.obyektlar, o.id] : s.obyektlar.filter((x) => x !== o.id) })} />
                  <span className="truncate">{o.nom}</span>
                  {o.loyiha_id == null && <span className="fz-chip fz-chip--warn ml-auto">{tr('loyihasiz')}</span>}
                </label></li>
              ))}
            </ul>
          </div>

          <label className="block"><span className={yorliq}>{tr('Izoh')}</span>
            <textarea aria-label="Izoh" rows={2} className={kirit} value={s.izoh} onChange={(e) => ozgar({ izoh: e.target.value })} />
          </label>
        </div>
        <footer className="flex items-center gap-3 border-t border-border px-4 py-2.5">
          {xatolar.length > 0 && <span className="fz-chip fz-chip--warn"><AlertTriangle size={13} />{tr('{n} ta xato', { n: xatolar.length })}</span>}
          <button type="button" disabled={saqlanmoqda || xatolar.length > 0} onClick={() => void saqla(s).then((ok) => { if (ok && !s.id) setShakl(null); })}
            className="fz-btn fz-btn--primary ml-auto"><Save size={14} />{saqlanmoqda ? tr('Saqlanmoqda…') : tr('Saqlash')}</button>
        </footer>
      </section>
    );
  }

  const bosh = <section className="fz-card hidden items-center justify-center p-6 text-center text-[13px] text-text-mute lg:flex">{tr('Shartnomani tanlang yoki yangisini qo‘shing — bu yerda uning zanjiri (qo‘shimcha kelishuv → F2 → F3 → to‘lov → akt-sverka) va kartasi ochiladi.')}</section>;
  return (
    <Sahifa sarlavha="Shartnoma liniyasi" tavsif="Loyiha → shartnoma (tomonlar) → obyektlar" onYangila={() => { void yukla(); void svodYukla(); }} yangilanmoqda={yuklanmoqda}
      amallar={<button type="button" onClick={() => ochish(null, daraxt.find((t) => t.id != null)?.id ?? null)} className="fz-btn fz-btn--primary"><Plus size={14} />{tr('Shartnoma')}</button>}>
      <div className="flex min-h-0 flex-col gap-3">
      {!kid && <section className="fz-card p-4 text-text-dim">{tr('Avval kompaniyani tanlang.')}</section>}
      {xato && <section role="alert" className="fz-note fz-note--danger"><AlertTriangle size={16} />{xato}</section>}
      {!liniya && yuklanmoqda && <div className="skel min-h-[280px] rounded-xl" />}
      {liniya && svodJ && <ZanjirKpi jami={svodJ} soni={svod?.size ?? 0} />}
      {liniya && (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,32rem)]">
          <div className="min-h-0 space-y-3 overflow-auto">
            {shartnomasiz.length > 0 && (
              <section className="fz-card border-warn/40 p-3" aria-label="Shartnomasiz obyektlar">
                <div className="mb-2 flex items-center gap-2"><Link2 size={14} className="text-warn" /><span className="text-[13px] font-semibold text-text">{tr('Asosiy shartnomasiz obyektlar')}</span><span className="fz-chip fz-chip--warn">{shartnomasiz.length}</span>
                  <span className="text-[12px] text-text-mute">{tr('— F2 va hujjat imzolovchilari shartnomadan olinadi; biriktiring.')}</span></div>
                <ul className="grid grid-cols-1 gap-1 md:grid-cols-2">
                  {shartnomasiz.map((o) => {
                    const mos = asosiylar.filter((s) => o.loyiha_id == null || s.loyiha_id == null || s.loyiha_id === o.loyiha_id);
                    return (
                      <li key={o.id} className="flex items-center gap-2 rounded-md border border-border px-2 py-1">
                        <span className="min-w-0 flex-1 truncate text-[12px] text-text">{o.nom}</span>
                        <select aria-label={`Biriktirish: ${o.nom}`} disabled={saqlanmoqda || mos.length === 0} value="" onChange={(e) => e.target.value && void biriktir(o.id, Number(e.target.value))}
                          className="max-w-[11rem] shrink-0 rounded border border-border bg-surface px-1 py-0.5 text-[12px] text-text-dim">
                          <option value="">{mos.length ? tr('Shartnomaga…') : tr('mos shartnoma yo‘q')}</option>
                          {mos.map((s) => <option key={s.id} value={s.id}>№ {raqamTozala(s.raqam)}{s.nom ? ` — ${s.nom}` : ''}</option>)}
                        </select>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
            {daraxt.map((t) => (
              <section key={t.id ?? 'yoq'} className="fz-card p-3" aria-label={`Loyiha: ${t.nom}`}>
                <div className="mb-2 flex items-center gap-2">
                  <span className={`text-[14px] font-semibold ${t.id == null ? 'text-warn' : 'text-text'}`} style={{ fontFamily: 'var(--font-display)' }}>{t.nom}</span>
                  {t.id != null && <span className="text-[12px] text-text-mute">{tr('{o} obyekt · {s} shartnoma', { o: t.obyektSoni, s: t.asosiy.length + t.qoshimcha.length })}</span>}
                  {t.id != null && <button type="button" onClick={() => ochish(null, t.id)} className="fz-btn fz-btn--ghost fz-btn--sm ml-auto"><Plus size={12} />{tr('Shartnoma')}</button>}
                </div>
                {t.id == null && <p className="mb-2 text-[12px] text-text-mute">{tr('Bu shartnomalarga loyiha biriktirilmagan — kartani ochib loyihani tanlang.')}</p>}
                {t.asosiy.length + t.qoshimcha.length === 0 ? <p className="text-[12px] text-text-mute">{tr('Shartnoma yo‘q')}</p> : (
                  <ul className="space-y-1.5">{t.asosiy.map(shartnomaQatori)}{t.qoshimcha.map(shartnomaQatori)}</ul>
                )}
              </section>
            ))}
          </div>
          {shakl ? karta(shakl) : bosh}
        </div>
      )}
      </div>
    </Sahifa>
  );
}

export default ShartnomaLiniya;
