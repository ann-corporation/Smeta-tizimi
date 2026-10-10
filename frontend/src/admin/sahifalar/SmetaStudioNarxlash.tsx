import { MarketPriceComparison } from '../../components/smeta-studio-pro/MarketPriceComparison';
/**
 * Smeta studiyasi — avtomatik narxlash va hujjatlar.
 *
 * Egasi (2026-10-06): "katalogdan moslikni tizimning o'zi topsin, hududga qarasin; smeta uchun AI agent
 * resursning aynan xarakteristikasiga mos taklif bersin".
 *   1. Avto-narx: yangi narxsiz resurslar xarakteristika dvigatelidan (lib/smeta-studio/resource-match)
 *      o'tadi; EXACT/HIGH moslik bitta undo qadami (BATCH) bilan CATALOG_CANDIDATE narx sifatida qo'yiladi.
 *   2. Noaniqlar ro'yxati: eng yaxshi nomzodlar, bir bosishda qo'yish yoki boshqasini tanlash.
 *   3. AI agent (/api/smeta-narx-agent): faqat server tasdiqlagan nomzodlar ichidan tanlaydi, sababini yozadi;
 *      operator qabul qiladi (DB yozuvi yo'q).
 *   4. Hujjatlar: LRV + RES ABC/TN dasturlari shaklida (lib/smeta-studio/abc-hujjat), tirik formulalar.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { t } from '../../i18n/til';
import type { RemoteNormCatalog } from '../../lib/catalog-extraction/norm-remote';
import { narxKatalogi, type KatalogQatori, type PriceCatalog } from '../../lib/narx-katalog/price-remote';
import type { DocCalc } from '../../lib/smeta-studio/calc';
import type { StudioCommand } from '../../lib/smeta-studio/commands';
import type { EstimateDoc } from '../../lib/smeta-studio/model';
import { autoPrice, matchResource, type AutoPriceLine } from '../../lib/smeta-studio/resource-match';
import { priceCommand } from '../../lib/smeta-studio/price-lookup';
import { resourceCategory } from '../../lib/smeta-studio/export-adapter';
import { resourceUnitText } from '../../lib/smeta-studio/resource-units';
import { narxAgentSora, type AgentResult } from '../../api/smeta-narx-agent';
import { loadHourCatalog, type HourCatalog } from '../../lib/hour-price-catalog';
import { hourPrices, labourPeriods, type HourPeriod } from '../../lib/smeta-studio/hour-pricing';
import { kompaniyaKuzatuvlari, kompaniyaMoslik, type KuzatilganNarx } from '../../lib/smeta-studio/company-prices';

export const HUDUD_KALIT = 'smeta-studio:hudud';
const AVTO_KALIT = 'smeta-studio:avto-narx';
export const lsGet = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
export const lsSet = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };
const fmt = (n: number | string | null | undefined) => n == null ? '—' : Number(n).toLocaleString('ru-RU', { maximumFractionDigits: 2 });

/** Resource unit: ONLY the observed resource dictionary — an unknown resource KodI is never filled from the
 *  work-unit dictionary (Codex audit: different code spaces). */
export function unitTextOf(_katalog?: RemoteNormCatalog | null) {
  return (code: string | null) => resourceUnitText(code);
}
/** Work unit as the normative catalogue observed it (e.g. "1000 М3"). */
export function workUnitOf(katalog: RemoteNormCatalog | null) {
  return (code: string | null) => { if (!code || !katalog) return null; const u = katalog.unit(code); return u ? u.text : null; };
}
type Pending = { occurrenceId: string; recipeId: string; name: string | null; unit: string | null };

export function SmetaNarxlash({ doc, hisob, katalog, command, kompaniyaId, hudud, setHudud }: {
  doc: EstimateDoc; hisob: DocCalc; katalog: RemoteNormCatalog | null; command: (c: StudioCommand) => boolean; kompaniyaId: number | null;
  hudud: string; setHudud: (v: string) => void;
}) {
  const [cat, setCat] = useState<PriceCatalog | null>(null);
  const [holat, setHolat] = useState<'yuklanmoqda' | 'indeks' | 'tayyor' | 'xato'>('yuklanmoqda');
  const [avto, setAvto] = useState(() => lsGet(AVTO_KALIT) !== '0');
  const [review, setReview] = useState<AutoPriceLine[]>([]);
  const [xabar, setXabar] = useState('');
  const [agent, setAgent] = useState<{ holat: 'tayyor' | 'ishlayapti' | 'xato'; matn: string; natija: AgentResult[] }>({ holat: 'tayyor', matn: '', natija: [] });
  const [ochiq, setOchiq] = useState(false);
  const tried = useRef(new Set<string>());
  const unitText = useMemo(() => unitTextOf(katalog), [katalog]);
  const workUnit = useMemo(() => workUnitOf(katalog), [katalog]);
  const [soat, setSoat] = useState<HourCatalog | null>(null);
  const [davr, setDavr] = useState<HourPeriod | null>(null);
  const triedHour = useRef(new Set<string>());
  // Secondary observations: names + characteristics + units; no code-based identity.
  const kuzatuv = useRef<KuzatilganNarx[]>([]);
  const [companyReview, setCompanyReview] = useState<AutoPriceLine[]>([]);
  const scopeEpoch = useRef(0);
  const live = useRef({ doc, hisob, kompaniyaId, hudud, davr });
  live.current = { doc, hisob, kompaniyaId, hudud, davr };
  const companyBusy = useRef(false);
  const companyQueued = useRef(false);
  const [companyTick, setCompanyTick] = useState(0);
  const [hourError, setHourError] = useState(false);
  const sorlangan = useRef(new Set<string>());
  const triedKomp = useRef(new Set<string>());
  const [kompTayyor, setKompTayyor] = useState(false);
  const agentRequest = useRef(0);
  useEffect(() => {
    let alive = true;
    loadHourCatalog().then(c => { if (!alive) return; setSoat(c); setDavr(labourPeriods(c)[0] ?? null); }).catch(() => { if (alive) setHourError(true); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    narxKatalogi().then(c => {
      if (!alive) return;
      setCat(c); setHolat('indeks');
      // Build the characteristic index off the critical render path (≈2 s once per catalogue).
      setTimeout(() => { if (!alive) return; matchResource(c.matchView(), 'БЕТОН', 'м3'); setHolat('tayyor'); }, 50);
    }).catch(() => { if (alive) setHolat('xato'); });
    return () => { alive = false; };
  }, []);
  // A new draft starts with a clean "already tried" memory.
  useEffect(() => { scopeEpoch.current++; companyBusy.current = false; companyQueued.current = false; kuzatuv.current = []; sorlangan.current = new Set(); tried.current = new Set(); triedHour.current = new Set(); triedKomp.current = new Set(); setReview([]); setCompanyReview([]); setKompTayyor(false); setAgent({ holat: 'tayyor', matn: '', natija: [] }); }, [doc.draftId, kompaniyaId]);
  useEffect(() => { tried.current = new Set(); triedHour.current = new Set(); triedKomp.current = new Set(); }, [hudud, davr]);

  const regions = useMemo(() => {
    if (!cat) return [] as Array<[string, string]>;
    const seen = new Map<string, string>();
    cat.dict.hudud.forEach((h, i) => { const k = cat.dict.hududKalit[i]; if (k && !seen.has(k)) seen.set(k, h); });
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [cat]);

  // Labour and machine-hours are not in the material price catalogue: they are priced from the region's
  // man-hour / machine-hour rates, never matched against materials (that produced "gloves" for labour).
  const { pending, ishMashina } = useMemo(() => {
    const out: Pending[] = []; let im = 0;
    for (const o of Object.values(doc.occurrences)) for (const l of hisob.occurrences[o.id]?.lines ?? []) {
      if (l.price != null || !l.resource) continue;
      const kat = resourceCategory(l.resource);
      if (kat === 'ЧЕЛ' || kat === 'МАШ') { im++; continue; }
      out.push({ occurrenceId: o.id, recipeId: l.recipeId, name: l.resource.name, unit: unitText(l.resource.unitCode) });
    }
    return { pending: out, ishMashina: im };
  }, [doc.occurrences, hisob, unitText]);
  const marketLines = useMemo(() => Object.values(hisob.occurrences).flatMap(o => o.lines
    .filter(l => l.resource && l.price != null).map(l => ({ id:`${o.id}:${l.recipeId}`, name:l.resource!.name,
      unit:unitText(l.resource!.unitCode), price:l.price == null ? null : Number(l.price) }))), [hisob, unitText]);
  const key = (p: { occurrenceId: string; recipeId: string; name?: string | null; unit?: string | null }) => JSON.stringify([p.occurrenceId, p.recipeId, p.name ?? null, p.unit ?? null]);

  function narxla(lines: Pending[], izoh: string) {
    if (!cat || holat !== 'tayyor' || !lines.length) return;
    const r = autoPrice(lines, cat.matchView(), hudud || null);
    const commands = r.applied.map(a => candidateCommand(a, a.result.best!));
    if (commands.length && !command({ type: 'BATCH', label: 'Avto-narx (katalog)', commands })) {
      setXabar(t('Narxlar qo‘llanmadi. Qoralama holatini tekshirib, qayta urinib ko‘ring.')); return;
    }
    for (const l of lines) tried.current.add(key(l));
    setReview(old => [...old.filter(x => !lines.some(l => key(l) === key(x))), ...r.review]);
    setXabar(t('{izoh}: {a} ta resursga katalogdan narx qo‘yildi, {r} tasi ko‘rib chiqishda.', { izoh, a: commands.length, r: r.review.length }));
  }
  // System does it: every newly appearing priceless resource is matched once (an operator's later
  // removal of a price is respected — the same line is not re-filled automatically).
  useEffect(() => {
    if (!avto || holat !== 'tayyor') return;
    const fresh = pending.filter(p => !tried.current.has(key(p)));
    if (fresh.length) narxla(fresh, t('Avto-narx'));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avto, holat, pending, hudud]);
  /** Labour / machine-hours from the hour catalogue (region + period); each line is tried once. */
  function soatNarxla(majburiy: boolean) {
    if (!soat) return;
    const r = hourPrices(doc, hisob, soat, unitText, hudud || null, davr);
    const hourKey = (c: Extract<StudioCommand, { type: 'SET_PRICE' }>) => { const l = hisob.occurrences[c.occurrenceId]?.lines.find(l => l.recipeId === c.recipeId); return key({ occurrenceId:c.occurrenceId, recipeId:c.recipeId, name:l?.resource?.name, unit:l?.resource ? unitText(l.resource.unitCode) : null }); };
    const commands = r.commands.filter(c => c.type === 'SET_PRICE' && (majburiy || !triedHour.current.has(hourKey(c))));
    if (commands.length && !command({ type: 'BATCH', label: 'Chel.-soat / mash.-soat narxi', commands })) {
      setXabar(t('Narxlar qo‘llanmadi. Qoralama holatini tekshirib, qayta urinib ko‘ring.')); return;
    }
    for (const c of commands) if (c.type === 'SET_PRICE') triedHour.current.add(hourKey(c));
    if (commands.length || majburiy) setXabar(t('Mehnat: {l}, mashina: {m} ta narx qo‘yildi; mashinistlar: {o} (alohida stavka kerak); topilmadi: {f}.',
      { l: r.labour, m: r.machines, o: r.operatorsLeft, f: r.notFound }));
  }
  useEffect(() => {
    if (avto && soat && ishMashina > 0) soatNarxla(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avto, soat, ishMashina, hudud, davr, hisob]);

  /** Secondary company observations use name, characteristics and unit only. */
  const narxsizKalitlar = useMemo(() => {
    const out: string[] = [];
    for (const o of Object.values(doc.occurrences)) for (const l of hisob.occurrences[o.id]?.lines ?? []) if (l.price == null && l.resource) out.push(key({ occurrenceId:o.id, recipeId:l.recipeId, name:l.resource.name, unit:unitText(l.resource.unitCode) }));
    return out.join('|');
  }, [doc.occurrences, hisob, unitText]);
  async function kompNarxla(majburiy: boolean) {
    if (kompaniyaId == null) { setKompTayyor(true); return; }
    if (!((holat === 'tayyor' || holat === 'xato') && (soat || hourError))) return;
    if (companyBusy.current) { companyQueued.current = true; return; }
    const epoch = scopeEpoch.current;
    const company = kompaniyaId, draft = doc.draftId;
    const names = [...new Set(Object.values(doc.occurrences).flatMap(o => (hisob.occurrences[o.id]?.lines ?? [])
      .filter(l => l.price == null && l.resource?.name).map(l => l.resource!.name!)))];
    const fresh = names.filter(n => majburiy || !sorlangan.current.has(n));
    companyBusy.current = true;
    try {
      const fetched = fresh.length ? await kompaniyaKuzatuvlari(company, fresh) : [];
      if (epoch !== scopeEpoch.current || live.current.kompaniyaId !== company || live.current.doc.draftId !== draft) return;
      const merged = new Map((majburiy ? [] : kuzatuv.current).map(r => [r.id, r]));
      for (const r of fetched) merged.set(r.id, r);
      kuzatuv.current = [...merged.values()];
      for (const n of fresh) sorlangan.current.add(n);
      const current = live.current;
      const commands: StudioCommand[] = [], offers: AutoPriceLine[] = [];
      const primaryHours = new Set(soat ? hourPrices(current.doc, current.hisob, soat, unitText, current.hudud || null, current.davr).commands
        .filter(c => c.type === 'SET_PRICE').map(c => `${c.occurrenceId}:${c.recipeId}`) : []);
      for (const o of Object.values(current.doc.occurrences)) for (const l of current.hisob.occurrences[o.id]?.lines ?? []) {
        if (l.price != null || !l.resource) continue;
        const unit = unitText(l.resource.unitCode), name = l.resource.name;
        if (!unit) continue;
        const machine = unit.toLowerCase() === 'маш-ч';
        const hour = machine || unit.toLowerCase() === 'чел-ч';
        // The primary source always wins. Historical observations are never applied ahead of it.
        const primaryMaterial = !hour && cat && holat === 'tayyor' ? matchResource(cat.matchView(), name, unit, current.hudud || null) : null;
        if (primaryMaterial?.confidence === 'EXACT' || primaryMaterial?.confidence === 'HIGH') continue;
        if (hour && primaryHours.has(`${o.id}:${l.recipeId}`)) continue;
        const result = kompaniyaMoslik(kuzatuv.current, name, unit, machine);
        const line = { occurrenceId: o.id, recipeId: l.recipeId, name: name ?? '', unit, result };
        if (!result.best) continue;
        const strong = result.confidence === 'EXACT' || result.confidence === 'HIGH';
        const mayAuto = strong && (!hour || machine || !!current.hudud) && (hour || primaryMaterial?.confidence === 'NONE' || holat === 'xato') && (majburiy || !triedKomp.current.has(key(line)));
        if (mayAuto) {
          commands.push(candidateCommand(line, result.best));
        } else offers.push(line);
      }
      if (commands.length && !command({ type: 'BATCH', label: 'Nom va birlik bo‘yicha kompaniya narxlari', commands })) {
        setXabar(t('Narxlar qo‘llanmadi. Qoralama holatini tekshirib, qayta urinib ko‘ring.')); return;
      }
      for (const c of commands) if (c.type === 'SET_PRICE') {
        const l = current.hisob.occurrences[c.occurrenceId]?.lines.find(l => l.recipeId === c.recipeId);
        if (l?.resource) triedKomp.current.add(key({ occurrenceId:c.occurrenceId, recipeId:c.recipeId, name:l.resource.name, unit:unitText(l.resource.unitCode) }));
      }
      setCompanyReview(offers);
      if (commands.length || majburiy) setXabar(t('Kompaniya smetalari: {n} ta aniq narx qo‘yildi, {r} ta manbali taklif ko‘rib chiqishda.', { n: commands.length, r: offers.length }));
    } catch {
      if (epoch === scopeEpoch.current && live.current.kompaniyaId === company && live.current.doc.draftId === draft)
        setXabar(t('Kompaniya narxlarini olishda xato. Qayta urinib ko‘ring; boshqa kataloglar tekshiriladi.'));
    } finally {
      if (epoch === scopeEpoch.current) { companyBusy.current = false; setKompTayyor(true); if (companyQueued.current) { companyQueued.current = false; setCompanyTick(v => v + 1); } }
    }
  }
  useEffect(() => {
    if (avto && narxsizKalitlar && (holat === 'tayyor' || holat === 'xato') && (soat || hourError)) void kompNarxla(false);
    else if (!narxsizKalitlar) setKompTayyor(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avto, narxsizKalitlar, kompaniyaId, holat, soat, hourError, hudud, davr, companyTick]);

  const agentTaklifBor = agent.natija.some(a => a.tanlov);
  const openReview = review.filter(r => pending.some(p => key(p) === key(r)));
  const openCompanyReview = companyReview.filter(r => hisob.occurrences[r.occurrenceId]?.lines.some(l => l.recipeId === r.recipeId && l.price == null && l.resource && key(r) === key({ occurrenceId:r.occurrenceId, recipeId:l.recipeId, name:l.resource.name, unit:unitText(l.resource.unitCode) })));
  function compactEvidence(candidate: AutoPriceLine['result']['candidates'][number], reason = '') {
    const r = candidate.row;
    const required = [r.manba_tur === 'kompaniya-smeta' ? 'Kompaniya smetasi' : 'Katalog', `#${r.id}`,
      r.yil ? `${r.yil}${r.kvartal ? ` Q${r.kvartal}` : ''}` : '', candidate.unitConversion?.evidence,
      reason ? `AI: ${reason.slice(0, 50)}` : ''].filter(Boolean).join(' · ');
    // The immutable source row ID and exact conversion are retained; display labels are bounded
    // to the existing 300-character command contract. Full offers remain visible in the UI.
    const labels = [r.manba_nom, r.hudud, r.ishlab_chiqaruvchi].filter(Boolean).join(' · ');
    const room = Math.max(0, 300 - required.length - 3);
    return required + (room ? ' · ' + (labels.length > room ? labels.slice(0, Math.max(0, room - 1)) + '…' : labels) : '');
  }
  function candidateCommand(line: AutoPriceLine, candidate: AutoPriceLine['result']['candidates'][number], reason = '') {
    const current = live.current.hisob.occurrences[line.occurrenceId]?.lines.find(l => l.recipeId === line.recipeId);
    if (!current?.resource || current.price != null || !line.unit || !candidate.row.birlik || key(line) !== key({ occurrenceId:line.occurrenceId, recipeId:line.recipeId, name:current.resource.name, unit:unitText(current.resource.unitCode) })) throw new Error('PRICE_OFFER_STALE');
    const c = priceCommand(line.occurrenceId, line.recipeId, candidate.row);
    return c.type === 'SET_PRICE' && c.price ? { ...c, price: { ...c.price,
      basis: candidate.row.manba_tur === 'kompaniya-smeta' ? 'CONTRACT_DRAFT' as const : c.price.basis,
      evidence: compactEvidence(candidate, reason),
      sourcePriceId: candidate.row.manba_tur === 'kompaniya-smeta' ? `kompaniya-smeta-qator:${candidate.row.id}` : c.price.sourcePriceId } } : c;
  }
  function qoy(line: AutoPriceLine, row: KatalogQatori) {
    const candidate = line.result.candidates.find(c => c.row.id === row.id);
    try { if (candidate && !command(candidateCommand(line, candidate))) setXabar(t('Narxlar qo‘llanmadi. Qoralama holatini tekshirib, qayta urinib ko‘ring.')); }
    catch { setXabar(t('Narxlar qo‘llanmadi. Qoralama holatini tekshirib, qayta urinib ko‘ring.')); }
  }
  function koproq(line: AutoPriceLine) {
    if (!cat) return;
    const result = matchResource(cat.matchView(), line.name, line.unit, hudud || null, line.result.candidates.length + 25);
    setReview(old => old.map(r => key(r) === key(line) ? { ...r, result } : r));
  }

  async function agentgaYubor() {
    if (kompaniyaId == null) { setAgent({ holat: 'xato', matn: t('Avval yuqorida kompaniyani tanlang.'), natija: [] }); return; }
    const selected = openReview.filter(r => r.unit && r.result.candidates.some(c => !!c.row.birlik)).slice(0, 40);
    const transport = new Map(selected.map((r, i) => [`p_${i}`, key(r)]));
    const items = selected.map((r, i) => ({ key: `p_${i}`, nom: r.name, birlik: r.unit,
      nomzodlar: r.result.candidates.slice(0, 8).map(c => c.row.id) }));
    if (!items.length) { setAgent({ holat: 'xato', matn: t('Agentga yuboradigan nomzodli resurs yo‘q.'), natija: [] }); return; }
    const epoch = scopeEpoch.current, request = ++agentRequest.current;
    setAgent({ holat: 'ishlayapti', matn: t('AI agent {n} ta resursni tahlil qilmoqda...', { n: items.length }), natija: [] });
    const r = await narxAgentSora(kompaniyaId, regions.find(([k]) => k === hudud)?.[1] ?? null, items);
    if (epoch !== scopeEpoch.current || request !== agentRequest.current) return;
    if (!r.ok) {
      setAgent({ holat: 'xato', natija: [], matn: r.code === 'AI_NOT_CONFIGURED' ? t('AI agent hali sozlanmagan (Cloudflare’da AI kaliti yo‘q). Deterministik moslik ishlayveradi.')
        : r.code === 'FORBIDDEN' ? t('Bu kompaniyaga ruxsat yo‘q.') : t('AI agent hozir javob bermadi. Keyinroq qayta urinib ko‘ring.') });
      return;
    }
    const results = r.items.filter(x => transport.has(x.key)).map(x => ({ ...x, key: transport.get(x.key)! }));
    setAgent({ holat: 'tayyor', matn: t('AI agent {n} ta taklif berdi — tekshirib qabul qiling.', { n: results.filter(x => x.tanlov).length }), natija: results });
  }
  function agentQabul(list: AgentResult[]) {
    const commands = list.filter(a => a.tanlov && pending.some(p => key(p) === a.key)).map(a => {
      const line = openReview.find(r => key(r) === a.key);
      if (!line) return null;
      const candidate = line.result.candidates.find(c => c.row.id === a.tanlov!.id);
      if (!candidate) return null;
      return candidateCommand(line, candidate, a.sabab);
    });
    const valid = commands.filter((c): c is StudioCommand => c != null);
    if (valid.length && !command(valid.length === 1 ? valid[0] : { type: 'BATCH', label: 'AI agent narxlari', commands: valid }))
      setXabar(t('Narxlar qo‘llanmadi. Qoralama holatini tekshirib, qayta urinib ko‘ring.'));
  }

  async function lrvYukla() {
    try {
      // ABC/TN shape (owner: "study LRV and RES from real smetas"): LRV + RES, live formulas.
      const { abcHujjat } = await import('../../lib/smeta-studio/abc-hujjat');
      const r = abcHujjat(doc, hisob, { resource: unitText, work: workUnit }, { obyekt: doc.context.objectLabel || null, qurilish: doc.context.title || null });
      const url = URL.createObjectURL(new Blob([r.bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const a = document.createElement('a'); a.href = url; a.download = hisob.total.unresolved ? `DRAFT_${r.faylNomi}` : r.faylNomi; a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
      if (hisob.total.unresolved) setXabar(t('Qoralama yuklandi. Narx, hajm yoki norma aniqlanmagan qatorlar bor; yakuniy smeta summasi hali hisoblanmagan.'));
    } catch (e) {
      setXabar(e instanceof Error && e.message === 'LRV_BOSH' ? t('Hujjat uchun avval smetaga ish qo‘shing.') : t('Hujjat tayyorlanmadi. Qayta urinib ko‘ring.'));
    }
  }

  return <section aria-label={t('Narxlash va hujjatlar')} className="karta space-y-2 p-2 text-sm">
    <div className="flex flex-wrap items-center gap-2">
      <strong className="text-[11px] font-semibold uppercase tracking-wide text-text-dim">{t('Narxlash')}</strong>
      <span className="text-xs text-text-mute">{holat === 'yuklanmoqda' ? t('Narx katalogi yuklanmoqda...') : holat === 'indeks' ? t('Katalog indeksi tayyorlanmoqda...')
        : holat === 'xato' ? t('Narx katalogi ochilmadi') : t('Narx katalogi: {n} qator', { n: cat?.rows.length.toLocaleString('ru-RU') ?? '0' })}</span>
      <label className="flex items-center gap-1 text-xs">{t('Hudud')}
        <select aria-label={t('Obyekt hududi')} className="input h-7 text-[12px]" value={hudud} onChange={e => setHudud(e.target.value)}>
          <option value="">{t('— barcha hududlar —')}</option>
          {regions.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select></label>
      <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={avto} onChange={e => { setAvto(e.target.checked); lsSet(AVTO_KALIT, e.target.checked ? '1' : '0'); }} />{t('Avto-narx')}</label>
      <button type="button" className="tugma h-7 px-2 text-[11.5px]" disabled={kompaniyaId == null || (!kompTayyor && companyBusy.current) || !((holat === 'tayyor' || holat === 'xato') && (soat || hourError))} onClick={() => void kompNarxla(true)}>{t('Kompaniya smetalaridan takliflar')}</button>
      <button type="button" className="tugma h-7 px-2 text-[11.5px]" disabled={holat !== 'tayyor' || !pending.length} onClick={() => narxla(pending, t('Qayta tekshiruv'))}>
        {t('Narxsizlarni katalogdan topish ({n})', { n: pending.length })}</button>
      <span className="flex-1" />
      <button type="button" className="tugma tugma-asosiy h-7 px-2 text-[11.5px]" disabled={!Object.keys(doc.occurrences).length} onClick={() => void lrvYukla()}>{hisob.total.unresolved ? t('Qoralama LRV + RES (Excel)') : t('LRV + RES (Excel)')}</button>
    </div>
    {xabar && <p role="status" className="text-xs text-accent">{xabar}</p>}
    {hisob.total.unresolved > 0 && <p className="text-xs text-warn">{t('Hisob tugallanmagan: {n} ta resurs qatorida narx, hajm, norma yoki birlik asosi yetishmaydi. Eksport qoralama bo‘ladi.', { n: hisob.total.unresolved })}</p>}
    {ishMashina > 0 && <div className="flex flex-wrap items-center gap-2 text-xs text-text-mute">
      <span>{t('Mehnat va mashina resurslari ({n}) material katalogidan narxlanmaydi — ular hudud chel.-soat / mash.-soat stavkasidan olinadi.', { n: ishMashina })}</span>
      {soat && <label className="flex items-center gap-1">{t('Davr')}
        <select aria-label={t('Chel.-soat davri')} className="input h-7 text-[12px]" value={davr ? `${davr.year}-${davr.quarter}` : ''}
          onChange={e => { const [y, q] = e.target.value.split('-').map(Number); setDavr(y ? { year: y, quarter: q } : null); triedHour.current = new Set(); }}>
          {labourPeriods(soat).map(p => <option key={`${p.year}-${p.quarter}`} value={`${p.year}-${p.quarter}`}>{p.year} · {p.quarter}-{t('chorak')}</option>)}
        </select></label>}
      {soat && <button type="button" className="tugma h-7 px-2 text-[11.5px]" onClick={() => soatNarxla(true)}>{t('Mehnat va mashina narxini qo‘yish')}</button>}
      {!hudud && <span className="text-warn">{t('Mehnat stavkasi uchun hududni tanlang.')}</span>}
    </div>}
    {marketLines.length > 0 && <MarketPriceComparison lines={marketLines} companyId={kompaniyaId} />}
    {hourError && <p role="status" className="text-xs text-warn">{t('Mehnat va mashina katalogi ochilmadi. Manbali kompaniya takliflari tekshiriladi; stavka taxmin qilinmaydi.')}</p>}
    {openCompanyReview.length > 0 && <details className="rounded border border-border/60 p-2">
      <summary>{t('Kompaniya smetalaridan muqobil narxlar')}</summary>
      {openCompanyReview.map(r => <div key={key(r)} className="border-t border-border/40 py-1">
        <span>{r.name}, {r.unit}</span>
        {r.result.candidates.map(c => <button type="button" key={c.row.id} disabled={!c.row.birlik || !r.unit} className="tugma m-1 text-xs" onClick={() => command(candidateCommand(r, c))}>
          {c.row.nom} · {fmt(c.row.narx)} / {c.row.birlik} · {c.row.manba_nom}
        </button>)}
      </div>)}
    </details>}
    {openReview.length > 0 && <div className="rounded border border-border/60">
      <button type="button" className="flex w-full items-center gap-2 px-2 py-1 text-left text-xs" aria-expanded={ochiq} onClick={() => setOchiq(v => !v)}>
        <span>{ochiq ? '▾' : '▸'}</span><span className="font-medium">{t('Ko‘rib chiqish kerak: {n} ta resurs', { n: openReview.length })}</span>
        <span className="flex-1" />
        <span className="text-text-mute">{t('xarakteristika darvozasidan o‘tgan nomzodlar')}</span>
      </button>
      {ochiq && <div className="max-h-80 overflow-auto border-t border-border/60">
        <div className="flex items-center gap-2 px-2 py-1">
          <button type="button" className="tugma h-7 px-2 text-[11.5px]" disabled={agent.holat === 'ishlayapti'} onClick={() => void agentgaYubor()}>{t('AI agentga yuborish')}</button>
          {agentTaklifBor && <button type="button" className="tugma tugma-asosiy h-7 px-2 text-[11.5px]" onClick={() => agentQabul(agent.natija)}>{t('Agent takliflarini qabul qilish')}</button>}
          {agent.matn && <span role={agent.holat === 'xato' ? 'alert' : 'status'} className={`text-xs ${agent.holat === 'xato' ? 'text-warn' : 'text-text-dim'}`}>{agent.matn}</span>}
        </div>
        <table className="w-full text-[11.5px]"><tbody>
          {openReview.map(r => {
            const ai = agent.natija.find(a => a.key === key(r));
            const hasMore = r.result.candidateTotal > r.result.candidates.length;
            return <tr key={key(r)} className="border-t border-border/40 align-top">
              <td className="w-[38%] px-2 py-1"><span className="text-text">{r.name}</span>{r.unit && <span className="text-text-mute">, {r.unit}</span>}</td>
              <td className="px-2 py-1">
                {!r.result.candidates.length ? <span className="text-text-mute">{t('Xarakteristikasi mos nomzod topilmadi')}{r.result.gateRejected ? ` (${t('{n} ta rad etildi', { n: r.result.gateRejected })})` : ''}</span>
                  : <select aria-label={t('Katalog nomzodi')} disabled={!r.unit} className="input h-7 w-full text-[11.5px]" defaultValue=""
                    onChange={e => { const c = r.result.candidates.find(x => String(x.row.id) === e.target.value); if (c) qoy(r, c.row); }}>
                    <option value="" disabled>{t('— nomzod tanlang ({n}) —', { n: r.result.candidates.length })}</option>
                    {r.result.candidates.map(c => <option key={c.row.id} value={c.row.id} disabled={!c.row.birlik}>{fmt(c.row.narx)} · {c.row.nom}{c.row.birlik ? `, ${c.row.birlik}` : ''} · {c.row.hudud ?? ''} · {Math.round(c.score * 100)}%</option>)}
                  </select>}
                {hasMore && <button type="button" className="tugma mt-1 h-6 px-2" onClick={() => koproq(r)}>
                  {t('Ko‘proq nomzodlar')} ({r.result.candidates.length}/{r.result.candidateTotal})
                </button>}
                {ai && <p className={`mt-0.5 ${ai.tanlov ? 'text-ok' : 'text-text-mute'}`}>{t('AI')}: {ai.tanlov ? `${ai.tanlov.nom} — ${fmt(ai.tanlov.narx)}` : t('mos emas')} · {ai.sabab}
                  {ai.tanlov && <button type="button" className="tugma ml-1 h-6 px-1.5 text-[10.5px]" onClick={() => agentQabul([ai])}>{t('Qabul')}</button>}</p>}
              </td>
            </tr>;
          })}
        </tbody></table>
      </div>}
    </div>}
  </section>;
}
