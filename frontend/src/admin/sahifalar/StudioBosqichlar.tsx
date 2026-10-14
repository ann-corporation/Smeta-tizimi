/**
 * Smeta studiyasi bosqichlari (egasi 2026-10-13): ① LRV oynada yasaladi → ② «Narxlashga o'tish»: foiz stavkalari,
 * kataloglar va manbalarga asoslangan narxlar (AI har resursni MA'NOSI bo'yicha topadi) → ③ RES va hujjatlar.
 *
 * Bu fayl ②/③ va LRV dagi koeffitsientlar panelini beradi. Hamma o'zgarish studiyaning yagona buyruq qatlami
 * (BATCH = bitta «Bekor qilish») orqali; narx/stavka/koeffitsient o'ylab topilmaydi — har biri manba yoki operator qarori.
 */
import { useEffect, useMemo, useState } from 'react';
import { t } from '../../i18n/til';
import type { RemoteNormCatalog } from '../../lib/catalog-extraction/norm-remote';
import { narxKatalogi, type PriceCatalog } from '../../lib/narx-katalog/price-remote';
import type { DocCalc } from '../../lib/smeta-studio/calc';
import type { StudioCommand } from '../../lib/smeta-studio/commands';
import type { EstimateDoc, PriceJustification, WorkCoefficient } from '../../lib/smeta-studio/model';
import { matchResource } from '../../lib/smeta-studio/resource-match';
import { aiNarxlash, qaytaHisobla, katalogdanNarxlanadi, nakrutkaKategoriyasi, narxBuyruqlari, narxNomzodlari, qatorNomzodi, resursGuruhlari,
  type AiNarxNatija, type NarxNomzod, type ResursGuruh } from '../../lib/smeta-studio/narx-yigish';
import { kompaniyaKuzatuvlari, kompaniyaMoslik, type KuzatilganNarx } from '../../lib/smeta-studio/company-prices';
import { loadHourCatalog, type HourCatalog } from '../../lib/hour-price-catalog';
import { hourPrices, labourPeriods, type HourPeriod } from '../../lib/smeta-studio/hour-pricing';
import { NAKRUTKA_KOEF_IZOH, NAKRUTKA_KOEF_KODLAR, t2NakrutkaKoefOl } from '../../api/t2-nakrutka';
import { NAKRUTKA_STANDART } from '../../lib/nakrutka-kaskad';
import { NAKRUTKA_KATLAR, nakrutkaKaskadJS, type KatSummalar, type NakrutkaKat } from '../../lib/nakrutka-podval';
import { smetachiNarxTanla } from '../../api/smeta-ai';
import { HujjatTomonlariPanel, useHujjatTomonlari } from '../../umumiy/hujjat/HujjatTomonlari';
import { MarketPriceComparison } from '../../components/smeta-studio-pro/MarketPriceComparison';

type UnitText = (code: string | null) => string | null;
const fmt = (n: number | string | null | undefined, d = 2) => n == null || n === '' ? '—' : Number(n).toLocaleString('ru-RU', { maximumFractionDigits: d });
const KAT_NOMI: Record<string, string> = { ЧЕЛ: 'Mehnat (ЧЕЛ)', МАШ: 'Mashina va mexanizmlar (МАШ)', МАТ: 'Materiallar (МАТ)', 'БЕЗ СКЛАД': 'Omborsiz materiallar (БЕЗ СКЛАД)',
  'М/К': 'Metall konstruksiyalar (М/К)', КАБ: 'Kabel mahsulotlari (КАБ)', ОБ: 'Uskunalar (ОБ)', '': 'Kategoriyasi aniqlanmagan' };

/** Lines of a group that still have no price (an operator's existing choice is never overwritten silently). */
function narxsizQatorlar(g: ResursGuruh, hisob: DocCalc) {
  return g.qatorlar.filter(q => hisob.occurrences[q.occurrenceId]?.lines.find(l => l.recipeId === q.recipeId)?.price == null);
}

/* ───────────────────────── LRV: koeffitsientlar ───────────────────────── */
export function KoeffitsientlarPaneli({ doc, command }: { doc: EstimateDoc; command: (c: StudioCommand) => boolean }) {
  const list = Object.values(doc.occurrences).filter(o => o.coefficients?.length);
  const [yangi, setYangi] = useState<{ occ: string; nom: string; qiymat: string; scope: WorkCoefficient['scope']; asos: string }>({ occ: '', nom: '', qiymat: '', scope: 'ALL', asos: '' });
  const set = (occ: string, coefficients: WorkCoefficient[]) => command({ type: 'SET_COEFFICIENTS', occurrenceId: occ, coefficients });
  const works = Object.values(doc.occurrences);
  if (!works.length) return null;
  return <section aria-label={t('Ish koeffitsientlari')} className="karta space-y-2 p-2 text-[12.5px]">
    <div className="flex items-center gap-2">
      <strong className="text-[11px] font-semibold uppercase tracking-wide text-text-dim">{t('Ish koeffitsientlari')}</strong>
      <span className="text-xs text-text-mute">{t('AI taklifi qabul qilinmaguncha hisobga kirmaydi')}</span>
    </div>
    {!list.length && <p className="text-xs text-text-mute">{t('Hozircha koeffitsient yo‘q. Ish sharoitini (ta’mir, tor joy, balandlik, qish) Smetachi AI ga yozing — u ShNQ texnik qismidan taklif qiladi.')}</p>}
    {list.map(o => <div key={o.id} className="rounded border border-border p-1.5">
      <p className="font-medium"><span className="font-mono text-accent">{o.source.code}</span> {o.source.name}</p>
      {o.coefficients!.map(k => <div key={k.id} className="mt-1 flex flex-wrap items-center gap-2">
        <span className={k.accepted ? 'text-ok' : 'text-warn'}>{k.accepted ? '✓' : '•'}</span>
        <span>{k.name} × <b>{k.value.replace('.', ',')}</b> ({k.scope})</span>
        <span className="text-[11px] text-text-mute">{k.evidence}{k.origin === 'AI' ? ` · ${t('AI taklifi')}` : ''}</span>
        <span className="flex-1" />
        <button type="button" className="tugma h-6 px-2 text-[11px]" onClick={() => set(o.id, o.coefficients!.map(x => x.id === k.id ? { ...x, accepted: !x.accepted } : x))}>
          {k.accepted ? t('Bekor qilish') : t('Qabul qilish')}</button>
        <button type="button" aria-label={t('Koeffitsientni olib tashlash')} className="text-xs text-text-mute hover:text-danger" onClick={() => set(o.id, o.coefficients!.filter(x => x.id !== k.id))}>✕</button>
      </div>)}
    </div>)}
    <form className="flex flex-wrap items-end gap-1" onSubmit={e => {
      e.preventDefault();
      const o = doc.occurrences[yangi.occ]; if (!o) return;
      const id = `op${Date.now().toString(36)}`;
      if (set(o.id, [...(o.coefficients ?? []), { id, name: yangi.nom, value: yangi.qiymat, scope: yangi.scope, evidence: yangi.asos, origin: 'OPERATOR', accepted: true }]))
        setYangi({ occ: yangi.occ, nom: '', qiymat: '', scope: 'ALL', asos: '' });
    }}>
      <select aria-label={t('Ish')} className="input h-7 max-w-[220px] text-[11.5px]" value={yangi.occ} onChange={e => setYangi({ ...yangi, occ: e.target.value })}>
        <option value="">{t('— ishni tanlang —')}</option>
        {works.map(o => <option key={o.id} value={o.id}>{o.source.code} · {(o.source.name ?? '').slice(0, 60)}</option>)}
      </select>
      <input aria-label={t('Koeffitsient nomi')} className="input h-7 w-36 text-[11.5px]" placeholder={t('Nomi')} value={yangi.nom} onChange={e => setYangi({ ...yangi, nom: e.target.value })} />
      <input aria-label={t('Koeffitsient qiymati')} className="input h-7 w-16 text-[11.5px]" inputMode="decimal" placeholder="1,15" value={yangi.qiymat} onChange={e => setYangi({ ...yangi, qiymat: e.target.value })} />
      <select aria-label={t('Qo‘llanish')} className="input h-7 text-[11.5px]" value={yangi.scope} onChange={e => setYangi({ ...yangi, scope: e.target.value as WorkCoefficient['scope'] })}>
        {(['ALL', 'ЧЕЛ', 'МАШ', 'ЧЕЛ+МАШ', 'МАТ'] as const).map(s => <option key={s} value={s}>{s === 'ALL' ? t('barcha resurslar') : s}</option>)}
      </select>
      <input aria-label={t('Koeffitsient asosi')} className="input h-7 flex-1 min-w-[160px] text-[11.5px]" placeholder={t('Asos: hujjat va band')} value={yangi.asos} onChange={e => setYangi({ ...yangi, asos: e.target.value })} />
      <button type="submit" className="tugma h-7 px-2 text-[11.5px]" disabled={!yangi.occ || !yangi.nom.trim() || !yangi.qiymat.trim() || !yangi.asos.trim()}>{t('Qo‘shish')}</button>
    </form>
  </section>;
}

/* ───────────────────────── ② Narxlash ───────────────────────── */
export function NarxlashBosqichi({ doc, hisob, command, kompaniyaId, hudud, setHudud, unitText, onNext }: {
  doc: EstimateDoc; hisob: DocCalc; command: (c: StudioCommand) => boolean; kompaniyaId: number | null;
  hudud: string; setHudud: (v: string) => void; unitText: UnitText; onNext: () => void;
}) {
  const [cat, setCat] = useState<PriceCatalog | null>(null);
  const [catHolat, setCatHolat] = useState<'yuklanmoqda' | 'tayyor' | 'xato'>('yuklanmoqda');
  const [soat, setSoat] = useState<HourCatalog | null>(null);
  const [davr, setDavr] = useState<HourPeriod | null>(null);
  const [xabar, setXabar] = useState('');
  const [ai, setAi] = useState<{ ish: boolean; matn: string }>({ ish: false, matn: '' });
  const [takliflar, setTakliflar] = useState<Map<string, AiNarxNatija>>(new Map());
  const [filtr, setFiltr] = useState<'hammasi' | 'narxsiz' | 'taklif'>('hammasi');
  const [qolda, setQolda] = useState<{ key: string; narx: string; dalil: string } | null>(null);
  useEffect(() => {
    let alive = true;
    narxKatalogi().then(c => { if (alive) { setCat(c); setCatHolat('tayyor'); } }).catch(() => { if (alive) setCatHolat('xato'); });
    loadHourCatalog().then(c => { if (alive) { setSoat(c); setDavr(labourPeriods(c)[0] ?? null); } }).catch(() => {});
    return () => { alive = false; };
  }, []);
  const regions = useMemo(() => {
    if (!cat) return [] as Array<[string, string]>;
    const seen = new Map<string, string>();
    cat.dict.hudud.forEach((h, i) => { const k = cat.dict.hududKalit[i]; if (k && !seen.has(k)) seen.set(k, h); });
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [cat]);
  const guruhlar = useMemo(() => resursGuruhlari(doc, hisob, unitText), [doc, hisob, unitText]);
  const narxsizSoni = guruhlar.filter(g => g.narxsiz > 0).length;
  // Applied prices against the catalogue market (same products, period, region) — a sanity check, not a price source.
  const bozorQatorlari = useMemo(() => guruhlar.filter(g => g.narx != null && katalogdanNarxlanadi(g)).map(g => ({ id: g.key, name: g.nom, unit: g.birlik, price: Number(g.narx) })), [guruhlar]);
  const korinadi = guruhlar.filter(g => filtr === 'hammasi' || (filtr === 'narxsiz' ? g.narxsiz > 0 : takliflar.has(g.key)));

  function qoy(commands: StudioCommand[], label: string): boolean {
    if (!commands.length) return true;
    const ok = command(commands.length === 1 ? commands[0] : { type: 'BATCH', label, commands });
    if (!ok) setXabar(t('Narxlar qo‘llanmadi. Qoralama holatini tekshirib, qayta urinib ko‘ring.'));
    return ok;
  }

  /** Deterministic sources: hour catalogue for labour/machines, exact catalogue identity for materials. Nothing applied here. */
  function avtoBuyruqlar() {
    const commands: StudioCommand[] = [];
    const narxlangan = new Set<string>();
    let soatSoni = 0;
    if (soat) {
      const r = hourPrices(doc, hisob, soat, unitText, hudud || null, davr);
      commands.push(...r.commands); soatSoni = r.commands.length;
    }
    if (cat) for (const g of guruhlar) {
      if (!katalogdanNarxlanadi(g) || !g.narxsiz) continue;
      const m = matchResource(cat.matchView(), g.nom, g.birlik, hudud || null);
      if ((m.confidence !== 'EXACT' && m.confidence !== 'HIGH') || !m.best) continue;
      const src = m.best.row.unitConversion ? { ...m.best.row, narx: m.best.row.unitConversion.sourcePrice, birlik: m.best.row.unitConversion.sourceUnit } : m.best.row;
      const n = qatorNomzodi(src, g.birlik, 'katalog');
      if (!n) continue;
      commands.push(...narxBuyruqlari({ qatorlar: narxsizQatorlar(g, hisob) }, n, m.confidence === 'EXACT' ? 'nomi va birligi aynan mos' : 'xarakteristikasi mos, yagona mahsulot'));
      narxlangan.add(g.key);
    }
    return { commands, soatSoni, narxlangan };
  }

  /** AI understands each remaining resource by MEANING and picks among source candidates (two search rounds). */
  /** Source candidates for a resource: price catalogue (meaning + gates) and the company's own estimates. */
  async function nomzodManbasi(kerak: ResursGuruh[]) {
    let kuzatuv: KuzatilganNarx[] = [];
    if (kompaniyaId != null) {
      setAi({ ish: true, matn: t('Kompaniya smetalaridagi narxlar o‘qilmoqda...') });
      try { kuzatuv = await kompaniyaKuzatuvlari(kompaniyaId, kerak.map(g => g.nom)); } catch { /* catalogue still works without company history */ }
    }
    const view = cat?.matchView() ?? null;
    return (g: ResursGuruh, iboralar: string[]) => narxNomzodlari(g, view, kuzatuv.length ? kompaniyaMoslik(kuzatuv, g.nom, g.birlik, false) : null, hudud || null, iboralar);
  }

  async function aiBuyruqlar(kerak: ResursGuruh[], nomzodlar: (g: ResursGuruh, iboralar: string[]) => NarxNomzod[]) {
    const natija = await aiNarxlash(kerak, nomzodlar,
      async sorov => { const r = await smetachiNarxTanla(kompaniyaId!, sorov, regions.find(([k]) => k === hudud)?.[1] ?? null); return r.ok ? r.tanlovlar : null; },
      (x, y) => setAi({ ish: true, matn: t('AI resurslarni tahlil qilmoqda: {a} / {b}', { a: x, b: y }) }));
    const commands: StudioCommand[] = [];
    const qoldi = new Map<string, AiNarxNatija>();
    for (const n of natija) {
      const g = kerak.find(x => x.key === n.key)!;
      if (n.nomzod && n.ishonch === 'yuqori') commands.push(...narxBuyruqlari({ qatorlar: narxsizQatorlar(g, hisob) }, n.nomzod, n.sabab));
      else qoldi.set(n.key, n);
    }
    return { commands, qoldi, topildi: natija.length - qoldi.size, manbadaYoq: [...qoldi.values()].filter(x => !x.nomzodlar.length).length };
  }

  /**
   * ONE action (owner 2026-10-14: "narxlar bittada topiladimi?"): every source in order — hour rates, exact catalogue
   * identity, then AI by meaning for the rest — applied as ONE batch (one undo). Without AI (no company/budget)
   * the deterministic part still runs and says so.
   */
  async function hammasiniNarxla() {
    setXabar('');
    const avto = avtoBuyruqlar();
    const kerak = guruhlar.filter(g => g.narxsiz > 0 && katalogdanNarxlanadi(g) && !avto.narxlangan.has(g.key));
    let ai: Awaited<ReturnType<typeof aiBuyruqlar>> | null = null, aiXato = false;
    let zaxira = new Map<string, AiNarxNatija>();
    if (kerak.length) {
      try {
        const nomzodlar = await nomzodManbasi(kerak);
        if (kompaniyaId != null) {
          try { ai = await aiBuyruqlar(kerak, nomzodlar); } catch { aiXato = true; }
        }
        // Without AI the candidates are still shown — the estimator picks; nothing is applied silently.
        if (!ai) zaxira = new Map(kerak.map(g => [g.key, { key: g.key, nomzod: null, ishonch: 'past' as const, nomzodlar: nomzodlar(g, []),
          sabab: 'AI ishlamadi — manbadagi nomzodlardan o‘zingiz tanlang' }]));
      } finally { setAi({ ish: false, matn: '' }); }
    }
    if (!qoy([...avto.commands, ...(ai?.commands ?? [])], t('Narxlash: stavkalar, katalog va AI'))) return;
    const takliflarYangi = ai?.qoldi ?? zaxira;
    setTakliflar(takliflarYangi);
    if (takliflarYangi.size) setFiltr('taklif');
    const qism = [t('mehnat/mashina-soat: {n} qator', { n: avto.soatSoni }), t('katalogdan aniq: {n}', { n: avto.narxlangan.size })];
    if (ai) qism.push(t('AI topdi: {n}', { n: ai.topildi }), t('tekshiruvingizda: {n}', { n: ai.qoldi.size - ai.manbadaYoq }), t('manbalarda yo‘q: {n}', { n: ai.manbadaYoq }));
    else if (kerak.length) qism.push(aiXato ? t('AI javob bermadi — {n} resurs uchun manba nomzodlari ro‘yxatda, tanlang', { n: kerak.length })
      : t('AI uchun kompaniya tanlanmagan — {n} resurs uchun katalog nomzodlari ro‘yxatda, tanlang', { n: kerak.length }));
    setXabar(qism.join(' · '));
  }
  function qabul(g: ResursGuruh, n: NarxNomzod, sabab: string) {
    if (qoy(narxBuyruqlari({ qatorlar: narxsizQatorlar(g, hisob).length ? narxsizQatorlar(g, hisob) : g.qatorlar }, n, sabab), t('Narx tanlandi')))
      setTakliflar(m => { const x = new Map(m); x.delete(g.key); return x; });
  }
  function qoldaSaqla() {
    if (!qolda) return;
    const g = guruhlar.find(x => x.key === qolda.key); if (!g) return;
    const commands = g.qatorlar.map(q => ({ type: 'SET_PRICE' as const, occurrenceId: q.occurrenceId, recipeId: q.recipeId,
      price: { value: qolda.narx.trim(), basis: 'OPERATOR_MANUAL' as const, evidence: qolda.dalil.trim().slice(0, 300), sourcePriceId: null,
        justification: { docType: 'MANUAL' as const, document: qolda.dalil.trim(), sourceName: null, sourceUnit: g.birlik, sourcePrice: qolda.narx.trim().replace(',', '.'), conversion: null, reason: null } } }));
    if (qoy(commands, t('Qo‘lda narx'))) setQolda(null);
  }

  return <div className="space-y-3">
    <section aria-label={t('Narx sharoiti')} className="karta flex flex-wrap items-center gap-3 p-2 text-[12.5px]">
      <strong className="text-[11px] font-semibold uppercase tracking-wide text-text-dim">{t('Narx sharoiti')}</strong>
      <label className="flex items-center gap-1">{t('Obyekt hududi')}
        <select aria-label={t('Obyekt hududi')} className="input h-7 text-[12px]" value={hudud} onChange={e => setHudud(e.target.value)}>
          <option value="">{t('— barcha hududlar —')}</option>
          {regions.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select></label>
      {soat && <label className="flex items-center gap-1">{t('Mehnat stavkasi davri')}
        <select aria-label={t('Mehnat stavkasi davri')} className="input h-7 text-[12px]" value={davr ? `${davr.year}-${davr.quarter}` : ''}
          onChange={e => { const [y, q] = e.target.value.split('-').map(Number); setDavr({ year: y, quarter: q }); }}>
          {labourPeriods(soat).map(p => <option key={`${p.year}-${p.quarter}`} value={`${p.year}-${p.quarter}`}>{t('{y} yil {q}-chorak', { y: p.year, q: p.quarter })}</option>)}
        </select></label>}
      <span className="text-xs text-text-mute">{catHolat === 'yuklanmoqda' ? t('Narx katalogi yuklanmoqda...') : catHolat === 'xato' ? t('Narx katalogi ochilmadi')
        : t('Narx katalogi: {n} qator, NDS siz', { n: cat?.rows.length.toLocaleString('ru-RU') ?? '0' })}</span>
    </section>

    <StavkalarKartasi doc={doc} command={command} kompaniyaId={kompaniyaId} />

    <section aria-label={t('Resurslar narxi')} className="karta overflow-hidden p-0 text-[12.5px]">
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface-2/60 px-2 py-1.5">
        <strong className="text-[11px] font-semibold uppercase tracking-wide text-text-dim">{t('Resurslar narxi')}</strong>
        <span className="text-xs text-text-mute">{t('{a} resurs, narxsiz: {b}', { a: guruhlar.length, b: narxsizSoni })}</span>
        <span className="flex-1" />
        <button type="button" className="tugma tugma-asosiy h-8 px-3 text-[12px]" disabled={ai.ish || !narxsizSoni || catHolat === 'yuklanmoqda'} onClick={() => void hammasiniNarxla()}>
          {ai.ish ? t('Narxlar qidirilmoqda...') : t('Barcha narxlarni topish')}</button>
        <select aria-label={t('Ko‘rinish')} className="input h-7 text-[11.5px]" value={filtr} onChange={e => setFiltr(e.target.value as typeof filtr)}>
          <option value="hammasi">{t('Hammasi')}</option><option value="narxsiz">{t('Faqat narxsiz')}</option><option value="taklif">{t('AI takliflari ({n})', { n: takliflar.size })}</option>
        </select>
      </div>
      {(xabar || ai.matn) && <p role="status" className="px-2 py-1 text-xs text-accent">{ai.matn || xabar}</p>}
      <div className="max-h-[560px] overflow-auto">
        <table className="w-full text-[12px]">
          <thead className="sticky top-0 bg-surface-1 text-text-mute"><tr>
            <th className="px-2 py-1 text-left">{t('Resurs')}</th><th className="px-1 text-left">{t('Birlik')}</th><th className="px-1 text-right">{t('Miqdor')}</th>
            <th className="px-1 text-right">{t('Narx')}</th><th className="px-1 text-right">{t('Summa')}</th><th className="px-2 text-left">{t('Manba va dalil')}</th>
          </tr></thead>
          <tbody>
            {korinadi.map((g, i) => {
              const bosh = i === 0 || korinadi[i - 1].kat !== g.kat;
              const taklif = takliflar.get(g.key);
              const summa = g.narx != null && g.miqdor != null ? Math.round(Number(g.narx) * g.miqdor * 100) / 100 : null;
              return [bosh && <tr key={`h-${g.key}`}><td colSpan={6} className="bg-surface-2/50 px-2 py-1 text-[11px] font-semibold uppercase text-text-dim">{t(KAT_NOMI[g.kat ?? ''])}</td></tr>,
                <tr key={g.key} className="border-t border-border/60 align-top">
                  <td className="px-2 py-1">{g.nom}{g.qatorlar.length > 1 && <span className="text-[11px] text-text-mute"> · {t('{n} ishda', { n: g.qatorlar.length })}</span>}</td>
                  <td className="px-1 py-1">{g.birlik ?? '—'}</td>
                  <td className="px-1 py-1 text-right tabular-nums">{fmt(g.miqdor, 4)}</td>
                  <td className="px-1 py-1 text-right tabular-nums">{g.narx != null ? fmt(g.narx) : g.aralash ? <span className="text-warn">{t('aralash')}</span> : <span className="text-warn">{t('narx yo‘q')}</span>}</td>
                  <td className="px-1 py-1 text-right tabular-nums">{fmt(summa)}</td>
                  <td className="px-2 py-1">
                    <NarxAsosi g={g} />
                    {taklif && <AiTaklif g={g} taklif={taklif} onQabul={qabul} />}
                    {qolda?.key === g.key
                      ? <form className="mt-1 flex flex-wrap gap-1" onSubmit={e => { e.preventDefault(); qoldaSaqla(); }}>
                          <input aria-label={t('Birlik narxi')} className="input h-7 w-28 text-[11.5px]" inputMode="decimal" value={qolda.narx} onChange={e => setQolda({ ...qolda, narx: e.target.value })} />
                          <input aria-label={t('Narx manbasi')} className="input h-7 flex-1 text-[11.5px]" placeholder={t('Manba: hujjat, sana')} value={qolda.dalil} onChange={e => setQolda({ ...qolda, dalil: e.target.value })} />
                          <button type="submit" className="tugma h-7 px-2 text-[11px]" disabled={!qolda.narx.trim() || !qolda.dalil.trim()}>{t('Saqlash')}</button>
                          <button type="button" className="tugma h-7 px-2 text-[11px]" onClick={() => setQolda(null)}>{t('Yopish')}</button>
                        </form>
                      : <div className="mt-0.5 flex gap-2 text-[11px]">
                          <button type="button" className="underline" onClick={() => setQolda({ key: g.key, narx: g.narx ?? '', dalil: '' })}>{t('Qo‘lda narx')}</button>
                          {g.narx != null && <button type="button" className="underline text-text-mute" onClick={() => qoy(g.qatorlar.map(q => ({ type: 'SET_PRICE' as const, occurrenceId: q.occurrenceId, recipeId: q.recipeId, price: null })), t('Narx olib tashlandi'))}>{t('Narxni olib tashlash')}</button>}
                        </div>}
                  </td>
                </tr>];
            })}
          </tbody>
        </table>
      </div>
    </section>
    {bozorQatorlari.length > 0 && <MarketPriceComparison lines={bozorQatorlari} companyId={kompaniyaId} />}
    <JamiSatri doc={doc} hisob={hisob} unitText={unitText} />
    <div className="flex justify-end"><button type="button" className="tugma tugma-asosiy h-9 px-4" onClick={onNext}>{t('RES ga o‘tish')} →</button></div>
  </div>;
}

function AiTaklif({ g, taklif, onQabul }: { g: ResursGuruh; taklif: AiNarxNatija; onQabul: (g: ResursGuruh, n: NarxNomzod, sabab: string) => void }) {
  const [tanlov, setTanlov] = useState(taklif.nomzod?.id ?? '');
  const [formula, setFormula] = useState(''), [izoh, setIzoh] = useState('');
  // The AI's own choice may already be recalculated into the estimate unit; any other pick of a unit-different row needs a formula.
  const tanlangan = taklif.nomzod && taklif.nomzod.id === tanlov ? taklif.nomzod : taklif.nomzodlar.find(x => x.id === tanlov) ?? null;
  const hisob = tanlangan?.birlikBoshqa && formula.trim() ? qaytaHisobla(tanlangan, g.nom, g.birlik, formula, izoh) : null;
  const n = !tanlangan ? null : !tanlangan.birlikBoshqa ? tanlangan : hisob && !('xato' in hisob) ? hisob : null;
  return <div className="mt-1 rounded border border-warn/50 bg-warn/5 p-1.5 text-[11.5px]">
    <p><b>{t('AI')}</b> ({taklif.ishonch === 'orta' ? t('o‘rta ishonch') : t('past ishonch')}): {taklif.sabab}</p>
    {taklif.nomzodlar.length > 0 && <div className="mt-1 flex flex-wrap items-center gap-1">
      <select aria-label={t('Narx nomzodi')} className="input h-7 max-w-full flex-1 text-[11px]" value={tanlov} onChange={e => { setTanlov(e.target.value); setFormula(''); setIzoh(''); }}>
        <option value="">{t('— nomzodni tanlang —')}</option>
        {taklif.nomzodlar.map(x => <option key={x.id} value={x.id}>{x.nom.slice(0, 80)} · {x.birlik ?? '—'} · {fmt(x.narx)}{x.birlikBoshqa ? ` · ${t('boshqa birlik — qayta hisob kerak')}` : ''} · {x.manba.slice(0, 40)}</option>)}
      </select>
      <button type="button" className="tugma h-7 px-2 text-[11px]" disabled={!n} onClick={() => n && onQabul(g, n, tanlangan?.id === taklif.nomzod?.id ? taklif.sabab : 'operator tanladi')}>{t('Qabul qilish')}</button>
    </div>}
    {tanlangan?.birlikBoshqa && <div className="mt-1 space-y-1">
      <p className="text-[11px] text-text-dim">{t('Narx {a} uchun, smetada {b}. O‘lchamlar nomdan olinadi: smeta narxi = narx × formula.', { a: tanlangan.birlik ?? '—', b: g.birlik ?? '—' })}</p>
      <div className="flex flex-wrap gap-1">
        <input aria-label={t('Qayta hisob formulasi')} className="input h-7 w-44 text-[11px]" placeholder="1/(2500/1000*1200/1000)" value={formula} onChange={e => setFormula(e.target.value)} />
        <input aria-label={t('Qayta hisob izohi')} className="input h-7 flex-1 text-[11px]" placeholder={t('Nima hisoblandi')} value={izoh} onChange={e => setIzoh(e.target.value)} />
      </div>
      {hisob && ('xato' in hisob ? <p role="alert" className="text-[11px] text-danger">{hisob.xato}</p>
        : <p className="text-[11px] text-ok">{fmt(tanlangan.narx)} × {hisob.qayta?.factor} = <b>{fmt(hisob.narx)}</b> / {g.birlik}</p>)}
    </div>}
  </div>;
}

/** Justification of a group: the structured one, else the evidence line of an older price. */
function NarxAsosi({ g }: { g: ResursGuruh }) {
  if (g.asos) return <Asos a={g.asos} />;
  return g.dalil ? <p className="text-[11px] text-text-mute">{g.dalil.slice(0, 220)}</p> : null;
}

/** «Обоснование цены» of an applied price: document, source row, recalculation, reason. */
function Asos({ a }: { a: PriceJustification }) {
  return <div className="text-[11px] text-text-mute">
    <p>{a.document}</p>
    {a.sourceName && <p>{t('Manbada')}: {a.sourceName}{a.sourcePrice ? ` — ${fmt(a.sourcePrice)} / ${a.sourceUnit ?? '—'}` : ''}</p>}
    {a.conversion && <p className="text-text-dim">{t('Qayta hisob')}: {a.conversion.formula} = {a.conversion.factor}{a.conversion.note ? ` (${a.conversion.note})` : ''}</p>}
    {a.reason && <p>{t('Sabab')}: {a.reason}</p>}
  </div>;
}

/* ───────────────────────── Foiz stavkalari ───────────────────────── */
function StavkalarKartasi({ doc, command, kompaniyaId }: { doc: EstimateDoc; command: (c: StudioCommand) => boolean; kompaniyaId: number | null }) {
  const [qiymat, setQiymat] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(doc.rates?.values ?? {}).map(([k, v]) => [k, String(v)])));
  const [manba, setManba] = useState(doc.rates?.source ?? '');
  const [holat, setHolat] = useState('');
  useEffect(() => {
    if (doc.rates || kompaniyaId == null) return;
    let alive = true;
    t2NakrutkaKoefOl(kompaniyaId).then(r => {
      if (!alive) return;
      const v = r.ok && r.koeffitsientlar ? r.koeffitsientlar : NAKRUTKA_STANDART;
      setQiymat(Object.fromEntries(NAKRUTKA_KOEF_KODLAR.map(k => [k, String(v[k] ?? 0)])));
      setManba(r.ok ? t('Kompaniya nakrutka sozlamasi') : t('Tizim standarti (kompaniya sozlamasi o‘qilmadi)'));
    }).catch(() => { if (alive) { setQiymat(Object.fromEntries(NAKRUTKA_KOEF_KODLAR.map(k => [k, String(NAKRUTKA_STANDART[k] ?? 0)]))); setManba(t('Tizim standarti (kompaniya sozlamasi o‘qilmadi)')); } });
    return () => { alive = false; };
  }, [doc.rates, kompaniyaId]);
  const tasdiqlangan = !!doc.rates && NAKRUTKA_KOEF_KODLAR.every(k => String(doc.rates!.values[k] ?? 0) === (qiymat[k] ?? '0')) && doc.rates.source === manba;
  function tasdiqla() {
    const values: Record<string, number> = {};
    for (const k of NAKRUTKA_KOEF_KODLAR) {
      const v = Number(String(qiymat[k] ?? '0').replace(',', '.'));
      if (!Number.isFinite(v) || v < 0 || v > 100) { setHolat(t('Foiz 0 dan 100 gacha bo‘lishi kerak: {k}', { k })); return; }
      values[k] = v;
    }
    if (command({ type: 'SET_RATES', rates: { values, source: manba.trim() || t('Operator') } })) setHolat(t('Stavkalar tasdiqlandi — RES ostida nakrutka kaskadi chiqadi.'));
  }
  return <section aria-label={t('Foiz stavkalari')} className="karta space-y-2 p-2 text-[12.5px]">
    <div className="flex flex-wrap items-center gap-2">
      <strong className="text-[11px] font-semibold uppercase tracking-wide text-text-dim">{t('Foiz stavkalari (nakrutka)')}</strong>
      <span className={`text-xs ${tasdiqlangan ? 'text-ok' : 'text-warn'}`}>{tasdiqlangan ? t('Tasdiqlangan') : t('Tasdiqlanmagan — RES da kaskad chiqmaydi')}</span>
    </div>
    <div className="grid gap-1 sm:grid-cols-2 xl:grid-cols-3">
      {NAKRUTKA_KOEF_KODLAR.map(k => <label key={k} className="flex items-center gap-2 text-[11.5px]">
        <span className="flex-1 text-text-dim">{NAKRUTKA_KOEF_IZOH[k]}</span>
        <input aria-label={k} className="input h-7 w-20 text-right text-[12px]" inputMode="decimal" value={qiymat[k] ?? ''} onChange={e => setQiymat({ ...qiymat, [k]: e.target.value })} />
        <span>%</span>
      </label>)}
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <input aria-label={t('Stavkalar manbasi')} className="input h-7 flex-1 min-w-[200px] text-[11.5px]" placeholder={t('Manba: kompaniya sozlamasi, shartnoma, buyurtmachi talabi')} value={manba} onChange={e => setManba(e.target.value)} />
      <button type="button" className="tugma tugma-asosiy h-7 px-3 text-[11.5px]" onClick={tasdiqla}>{t('Stavkalarni tasdiqlash')}</button>
    </div>
    {holat && <p role="status" className="text-xs text-accent">{holat}</p>}
  </section>;
}

/* ───────────────────────── Jami va ③ RES ───────────────────────── */
function katSummalari(doc: EstimateDoc, hisob: DocCalc, unitText: UnitText): { ks: KatSummalar; narxsiz: number; aniqlanmagan: number } {
  const ks = Object.fromEntries(NAKRUTKA_KATLAR.map(k => [k, 0])) as KatSummalar;
  let narxsiz = 0, aniqlanmagan = 0;
  for (const o of Object.values(doc.occurrences)) for (const l of hisob.occurrences[o.id]?.lines ?? []) {
    if (!l.resource) continue;
    const kat: NakrutkaKat | null = nakrutkaKategoriyasi(l.resource, unitText);
    if (l.amount == null) { if (l.price == null) narxsiz++; continue; }
    if (!kat) { aniqlanmagan++; continue; }
    ks[kat] = Math.round((ks[kat] + Number(l.amount)) * 100) / 100;
  }
  return { ks, narxsiz, aniqlanmagan };
}

function JamiSatri({ doc, hisob, unitText }: { doc: EstimateDoc; hisob: DocCalc; unitText: UnitText }) {
  const { ks, narxsiz } = useMemo(() => katSummalari(doc, hisob, unitText), [doc, hisob, unitText]);
  const pryamye = NAKRUTKA_KATLAR.reduce((s, k) => s + ks[k], 0);
  const vsego = doc.rates ? nakrutkaKaskadJS(ks, doc.rates.values).vsego : null;
  return <div className="karta flex flex-wrap items-center gap-4 p-2 text-[12.5px]">
    <span>{t('To‘g‘ri xarajatlar')}: <b className="tabular-nums">{fmt(pryamye)}</b></span>
    {vsego != null && <span>{t('Jami to‘lovga (nakrutka va QQS bilan)')}: <b className="tabular-nums">{fmt(vsego)}</b></span>}
    {narxsiz > 0 && <span className="text-warn">{t('Narxsiz resurs qatorlari: {n} — jami faqat ma’lum qismdan', { n: narxsiz })}</span>}
  </div>;
}

export function ResBosqichi({ doc, hisob, unitText, katalog, kompaniyaId, onBack }: { doc: EstimateDoc; hisob: DocCalc; unitText: UnitText;
  katalog: RemoteNormCatalog | null; kompaniyaId: number | null; onBack: () => void }) {
  const [xabar, setXabar] = useState('');
  const [tomonlar, setTomonlar] = useHujjatTomonlari(kompaniyaId);
  const [protokol, setProtokol] = useState({ raqam: '1', sana: new Date().toISOString().slice(0, 10) });
  const yuklabBer = (bytes: Uint8Array, nom: string) => {
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const a = document.createElement('a'); a.href = url; a.download = nom; a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  /** «ПРОТОКОЛ СОГЛАСОВАНИЯ ЦЕН» between the client and the contractor for the estimate's own prices. */
  async function protokolYukla() {
    try {
      const [{ studioProtokolQatorlari, STUDIO_PROTOKOL_USTUNLARI, STUDIO_PROTOKOL_MAQSADI }, { narxProtokolXlsx }] = await Promise.all([
        import('../../lib/smeta-studio/abc-hujjat'), import('../../lib/narx-protokol-hujjat')]);
      const qatorlar = studioProtokolQatorlari(doc, hisob, unitText);
      if (!qatorlar.length) { setXabar(t('Protokol uchun narxlangan resurs yo‘q — avval narxlang.')); return; }
      const r = narxProtokolXlsx(qatorlar, { obyektNomi: doc.context.objectLabel || doc.context.title || 'Smeta', raqam: protokol.raqam.trim() || '1', sana: protokol.sana,
        imzo: tomonlar, ustunNomlari: STUDIO_PROTOKOL_USTUNLARI, maqsad: STUDIO_PROTOKOL_MAQSADI });
      yuklabBer(r.bytes, r.faylNomi);
      setXabar(t('Narxlarni kelishish protokoli yuklandi: {n} pozitsiya. Ikki tomon imzosidan keyin kuchga kiradi.', { n: r.soni }));
    } catch { setXabar(t('Hujjat tayyorlanmadi. Qayta urinib ko‘ring.')); }
  }
  const { ks, narxsiz, aniqlanmagan } = useMemo(() => katSummalari(doc, hisob, unitText), [doc, hisob, unitText]);
  const kaskad = doc.rates ? nakrutkaKaskadJS(ks, doc.rates.values) : null;
  const workUnit = (code: string | null) => (code && katalog ? katalog.unit(code)?.text ?? null : null);
  async function yukla() {
    try {
      const { abcHujjat } = await import('../../lib/smeta-studio/abc-hujjat');
      const r = abcHujjat(doc, hisob, { resource: unitText, work: workUnit }, { obyekt: doc.context.objectLabel || null, qurilish: doc.context.title || null, imzo: tomonlar });
      yuklabBer(r.bytes, hisob.total.unresolved ? `DRAFT_${r.faylNomi}` : r.faylNomi);
      setXabar(hisob.total.unresolved ? t('Qoralama yuklandi. Narx, hajm yoki norma aniqlanmagan qatorlar bor; yakuniy smeta summasi hali hisoblanmagan.') : t('LRV va RES yuklandi (tirik formulalar).'));
    } catch (e) {
      setXabar(e instanceof Error && e.message === 'LRV_BOSH' ? t('Hujjat uchun avval smetaga ish qo‘shing.') : t('Hujjat tayyorlanmadi. Qayta urinib ko‘ring.'));
    }
  }
  const qator = (nom: string, v: number, jami = false) => <tr key={nom} className={jami ? 'font-semibold' : ''}><td className="px-2 py-0.5">{nom}</td><td className="px-2 py-0.5 text-right tabular-nums">{fmt(v)}</td></tr>;
  return <div className="space-y-3">
    <section aria-label={t('Resurs smeta (RES)')} className="karta space-y-2 p-3 text-[12.5px]">
      <strong className="text-[11px] font-semibold uppercase tracking-wide text-text-dim">{t('Resurs smeta (RES) — hisob')}</strong>
      {narxsiz > 0 && <p className="text-warn">{t('Narxsiz resurs qatorlari: {n} — jami faqat ma’lum qismdan', { n: narxsiz })}</p>}
      {aniqlanmagan > 0 && <p className="text-warn">{t('Kategoriyasi aniqlanmagan {n} qator nakrutka hisobiga kirmadi.', { n: aniqlanmagan })}</p>}
      <table className="w-full max-w-2xl"><tbody>
        {NAKRUTKA_KATLAR.filter(k => ks[k]).map(k => qator(t(KAT_NOMI[k]), ks[k]))}
        {kaskad ? <>
          {qator(t('To‘g‘ri xarajatlar'), kaskad.pryamye, true)}
          {qator(t('Transport va ombor xarajatlari'), kaskad.tr_mat + kaskad.skl_mat + (kaskad.skl_mk ?? 0) + kaskad.tr_kab)}
          {qator(t('Pudratchining boshqa xarajatlari'), kaskad.prochie)}
          {qator(t('Uskuna transporti va ombori'), kaskad.tr_ob + kaskad.zag_ob)}
          {qator(t('Sug‘urta va risk'), kaskad.strax + kaskad.risk)}
          {qator(t('QQS siz jami'), kaskad.itogo4, true)}
          {qator(t('QQS'), kaskad.nds)}
          {qator(t('Jami to‘lovga'), kaskad.vsego, true)}
        </> : <tr><td colSpan={2} className="px-2 py-1 text-warn">{t('Foiz stavkalari tasdiqlanmagan — faqat to‘g‘ri xarajatlar. «Narxlash» bosqichida stavkalarni tasdiqlang.')}</td></tr>}
      </tbody></table>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="tugma h-9 px-3" onClick={onBack}>← {t('Narxlashga qaytish')}</button>
        <button type="button" className="tugma tugma-asosiy h-9 px-4" onClick={() => void yukla()}>{t('LRV + RES + обоснование цен (Excel)')}</button>
      </div>
      {xabar && <p role="status" className="text-xs text-accent">{xabar}</p>}
    </section>
    <section aria-label={t('Narxlarni kelishish protokoli')} className="karta space-y-2 p-3 text-[12.5px]">
      <strong className="text-[11px] font-semibold uppercase tracking-wide text-text-dim">{t('Narxlarni kelishish protokoli (buyurtmachi — pudratchi)')}</strong>
      <p className="text-xs text-text-mute">{t('Har resurs: asos hujjatdagi narx (smeta birligida), smetaga qo‘yilgan kelishiladigan narx, og‘ish va obosnovaniye. Ikki tomon imzosi bilan.')}</p>
      <HujjatTomonlariPanel qiymat={tomonlar} onChange={setTomonlar} />
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs">{t('Protokol raqami')}<input aria-label={t('Protokol raqami')} className="input mt-0.5 block h-8 w-24" value={protokol.raqam} onChange={e => setProtokol({ ...protokol, raqam: e.target.value })} /></label>
        <label className="text-xs">{t('Sana')}<input aria-label={t('Protokol sanasi')} type="date" className="input mt-0.5 block h-8" value={protokol.sana} onChange={e => setProtokol({ ...protokol, sana: e.target.value || protokol.sana })} /></label>
        <button type="button" className="tugma h-9 px-4" onClick={() => void protokolYukla()}>{t('Протокол согласования цен (Excel)')}</button>
      </div>
    </section>
  </div>;
}
