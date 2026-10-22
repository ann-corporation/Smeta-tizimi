import { MoneyInput } from '../../umumiy/ui/MoneyInput';
/**
 * Smeta studiyasi bosqichlari (egasi 2026-10-13): ① LRV oynada yasaladi → ② «Narxlashga o'tish»: foiz stavkalari,
 * kataloglar va manbalarga asoslangan narxlar (AI har resursni MA'NOSI bo'yicha topadi) → ③ RES va hujjatlar.
 *
 * Bu fayl ②/③ va LRV dagi koeffitsientlar panelini beradi. Hamma o'zgarish studiyaning yagona buyruq qatlami
 * (BATCH = bitta «Bekor qilish») orqali; narx/stavka/koeffitsient o'ylab topilmaydi — har biri manba yoki operator qarori.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { agentRegister, jarayonYoz } from './studioAgent';
import { hujjatTokenBilan } from '../../lib/token-hujjat';
import { t } from '../../i18n/til';
import type { RemoteNormCatalog } from '../../lib/catalog-extraction/norm-remote';
import { narxKatalogi, type PriceCatalog } from '../../lib/narx-katalog/price-remote';
import type { DocCalc } from '../../lib/smeta-studio/calc';
import type { StudioCommand } from '../../lib/smeta-studio/commands';
import type { EstimateDoc, PriceJustification } from '../../lib/smeta-studio/model';
import { indeksniTayyorla, matchResource, type MatchCatalog, type MatchPriceRow } from '../../lib/smeta-studio/resource-match';
import { aiNarxlash, loyihaBoyicha, qatorKategoriyasi, qaytaHisobla, katalogdanNarxlanadi, narxBuyruqlari, narxNomi, narxNomzodlari, ortachaQil, qatorNomzodi, resursGuruhlari,
  type AiNarxNatija, type NarxNomzod, type ResursGuruh } from '../../lib/smeta-studio/narx-yigish';
import { kompaniyaKuzatuvlari, kompaniyaMoslik, type KuzatilganNarx } from '../../lib/smeta-studio/company-prices';
import { kompaniyaManbalariniOl, type KompaniyaManbalari } from '../../lib/smeta-studio/kompaniya-manbalari';
import { StudioKpYuklash } from './StudioKpYuklash';
import { mashAsosi, mashKatalogi, mashView } from '../../lib/smeta-studio/mash-katalog';
import { loadHourCatalog, type HourCatalog } from '../../lib/hour-price-catalog';
import { hourPrices, labourPeriods, type HourPeriod } from '../../lib/smeta-studio/hour-pricing';
import { NAKRUTKA_KOEF_IZOH, NAKRUTKA_KOEF_KODLAR, t2NakrutkaKoefOl } from '../../api/t2-nakrutka';
import { NAKRUTKA_STANDART } from '../../lib/nakrutka-kaskad';
import { NAKRUTKA_KATLAR, nakrutkaKaskadJS, type KatSummalar, type NakrutkaKat } from '../../lib/nakrutka-podval';
import { podvalHisobla, standartPodval, type Podval } from '../../lib/nakrutka-konstruktor';
import { amaldagiPodval } from '../../api/t2-nakrutka-podval';
import { narxTajribasi, narxTajribaYoz, smetachiNarxInternet, smetachiNarxTanla } from '../../api/smeta-ai';
import { internetBuyruqlari } from '../../lib/smeta-studio/narx-internet';
import { ishonchniKuchaytir, manbaKaliti, resursKaliti, type NarxTajriba } from '../../lib/smeta-studio/narx-ishonch';
import { HujjatTomonlariPanel, useHujjatTomonlari } from '../../umumiy/hujjat/HujjatTomonlari';
import { MarketPriceComparison } from '../../components/smeta-studio-pro/MarketPriceComparison';
import { PriceResearchQueue, researchKey, retainResearch } from '../../components/smeta-studio-workspace/PriceResearchQueue';

type UnitText = (code: string | null) => string | null;
/** «… ПО ПРОЕКТУ» without the project's material is never priced by a guess. */
const materialKerak = (g: ResursGuruh) => loyihaBoyicha(g.nom) && !g.talab;
const fmt = (n: number | string | null | undefined, d = 2) => n == null || n === '' ? '—' : Number(n).toLocaleString('ru-RU', { maximumFractionDigits: d });
const KAT_NOMI: Record<string, string> = { ЧЕЛ: 'Mehnat (ЧЕЛ)', МАШ: 'Mashina va mexanizmlar (МАШ)', МАТ: 'Materiallar (МАТ)', 'БЕЗ СКЛАД': 'Omborsiz materiallar (БЕЗ СКЛАД)',
  'М/К': 'Metall konstruksiyalar (М/К)', КАБ: 'Kabel mahsulotlari (КАБ)', ОБ: 'Uskunalar (ОБ)', '': 'Kategoriyasi aniqlanmagan' };

/** Lines of a group that still have no price (an operator's existing choice is never overwritten silently). */
/** Lines to price now: without a price, or priced earlier without the document requisites (re-priced with a full justification). */
function narxsizQatorlar(g: ResursGuruh, hisob: DocCalc) {
  const eski = new Set((g.eskiQatorlar ?? []).map(q => q.occurrenceId + '\u0001' + q.recipeId));
  return g.qatorlar.filter(q => eski.has(q.occurrenceId + '\u0001' + q.recipeId) || hisob.occurrences[q.occurrenceId]?.lines.find(l => l.recipeId === q.recipeId)?.price == null);
}
const narxKerak = (g: ResursGuruh) => g.narxsiz > 0 || !!g.eskiQatorlar?.length;
/** A matched row with its price and unit as the source document states them (before the matcher's unit conversion). */
const manbaQatori = (r: MatchPriceRow) => (r.unitConversion ? { ...r, narx: r.unitConversion.sourcePrice, birlik: r.unitConversion.sourceUnit } : r);
/** The estimator is told whenever a price is the mean of several suppliers' offers (owner 2026-10-17). */
function ortachaYoz(g: ResursGuruh, n: NarxNomzod) {
  if (!n.ortacha) return;
  jarayonYoz(t('{nom}: {s} ta yetkazuvchi narxi turlicha ({min}–{max}) — o‘rtachasi {narx} olindi', { nom: g.talab ?? g.nom, s: n.ortacha.soni,
    min: fmt(n.ortacha.min), max: fmt(n.ortacha.max), narx: fmt(n.narx) }).slice(0, 220), 'ok');
}
/** Machine lines priced automatically from an older source (2023 calculation) — the official 01.01.2026 list replaces them. */
function eskiMashQatorlari(g: ResursGuruh, doc: EstimateDoc) {
  return g.qatorlar.filter(q => { const p = doc.occurrences[q.occurrenceId]?.overrides[q.recipeId]?.price;
    return !!p && p.basis !== 'OPERATOR_MANUAL' && !(p.sourcePriceId ?? '').startsWith('mash-katalog:'); });
}
/** Waits (≤ 30 s) until a condition on the latest render holds — sources loaded, a just-set region applied. */
async function kut(shart: () => boolean) { for (let i = 0; i < 150 && !shart(); i++) await new Promise(r => setTimeout(r, 200)); }

/* ───────────────────────── LRV: koeffitsientlar ───────────────────────── */
export { KoeffitsientlarPaneli } from './StudioKoeffitsientlar';

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
  const [researchRevision,setResearchRevision]=useState(0);
  const [researchError,setResearchError]=useState(false);
  const researchScope=researchKey(kompaniyaId,doc.draftId);
  const latestPricing=useRef({doc,kompaniyaId,hudud});latestPricing.current={doc,kompaniyaId,hudud};
  const pricingAlive=useRef(true),pricingCancelled=useRef(false);
  useEffect(()=>{pricingAlive.current=true;return()=>{pricingAlive.current=false;};},[]);
  const pricingValid=(allowCancelled=false)=>pricingAlive.current && (allowCancelled || !pricingCancelled.current) && latestPricing.current.doc===doc && latestPricing.current.kompaniyaId===kompaniyaId && latestPricing.current.hudud===hudud;
  const [filtr, setFiltr] = useState<'hammasi' | 'narxsiz' | 'taklif'>('hammasi');
  const [qolda, setQolda] = useState<{ key: string; narx: string; dalil: string } | null>(null);
  // The company's own documents (КП, invoices, price lists) — justified sources, offered before the platform index.
  const [kpm, setKpm] = useState<KompaniyaManbalari | null>(null);
  const [kpmVersiya, setKpmVersiya] = useState(0);
  // Official machine-hour list (01.01.2026, 710 machines) — the first source for МАШ lines.
  const [mash, setMash] = useState<MatchCatalog | null>(null);
  // Every source has settled (loaded or failed). The chat agent opens this step and prices at once — production run
  // 2026-10-16 priced before the machine-hour list arrived (1 of 11 machines, from the old 2023 calculation).
  const [yuklandi, setYuklandi] = useState({ mash: false, soat: false, kpm: kompaniyaId == null });
  useEffect(() => { let alive = true; mashKatalogi().then(k => { if (alive) setMash(mashView(k)); }).catch(() => {})
    .finally(() => { if (alive) setYuklandi(y => ({ ...y, mash: true })); }); return () => { alive = false; }; }, []);
  useEffect(() => {
    let alive = true;
    if (kompaniyaId == null) { setKpm(null); setYuklandi(y => ({ ...y, kpm: true })); return; }
    setYuklandi(y => ({ ...y, kpm: false }));
    kompaniyaManbalariniOl(kompaniyaId).then(m => { if (alive) setKpm(m); }).catch(() => { if (alive) setKpm(null); })
      .finally(() => { if (alive) setYuklandi(y => ({ ...y, kpm: true })); });
    return () => { alive = false; };
  }, [kompaniyaId, kpmVersiya]);
  useEffect(() => {
    let alive = true;
    // The matcher index is built in slices before pricing may start (one-shot build froze the page ≈ 6 s).
    narxKatalogi().then(async c => { await indeksniTayyorla(c.matchView()); if (alive) { setCat(c); setCatHolat('tayyor'); } }).catch(() => { if (alive) setCatHolat('xato'); });
    loadHourCatalog().then(c => { if (alive) { setSoat(c); setDavr(labourPeriods(c)[0] ?? null); } }).catch(() => {})
      .finally(() => { if (alive) setYuklandi(y => ({ ...y, soat: true })); });
    return () => { alive = false; };
  }, []);
  const manbalarTayyor = catHolat !== 'yuklanmoqda' && yuklandi.mash && yuklandi.soat && yuklandi.kpm;
  const regions = useMemo(() => {
    if (!cat) return [] as Array<[string, string]>;
    const seen = new Map<string, string>();
    cat.dict.hudud.forEach((h, i) => { const k = cat.dict.hududKalit[i]; if (k && !seen.has(k)) seen.set(k, h); });
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [cat]);
  const guruhlar = useMemo(() => resursGuruhlari(doc, hisob, unitText), [doc, hisob, unitText]);
  const narxsizSoni = guruhlar.filter(narxKerak).length;
  // Applied prices against the catalogue market (same products, period, region) — a sanity check, not a price source.
  const bozorQatorlari = useMemo(() => guruhlar.filter(g => g.narx != null && katalogdanNarxlanadi(g)).map(g => ({ id: g.key, name: g.nom, unit: g.birlik, price: Number(g.narx) })), [guruhlar]);
  const korinadi = guruhlar.filter(g => filtr === 'hammasi' || (filtr === 'narxsiz' ? g.narxsiz > 0 : takliflar.has(g.key)));

  function qoy(commands: StudioCommand[], label: string): boolean {
    if (!commands.length) return true;
    if(!pricingValid(true)){setXabar(t('Smeta yoki hudud o‘zgardi. Eski narxlash natijasi qo‘llanmadi; qayta boshlang.'));return false;}
    const ok = command(commands.length === 1 ? commands[0] : { type: 'BATCH', label, commands });
    if (!ok) setXabar(t('Narxlar qo‘llanmadi. Qoralama holatini tekshirib, qayta urinib ko‘ring.'));
    return ok;
  }

  /** Deterministic sources: hour catalogue for labour/machines, exact catalogue identity for materials. Nothing applied here. */
  function avtoBuyruqlar() {
    const commands: StudioCommand[] = [];
    const narxlangan = new Set<string>();
    let soatSoni = 0, kpSoni = 0;
    const qoplangan = new Set<string>();
    if (mash) for (const g of guruhlar) {
      if (g.kat !== 'МАШ' || /МАШИНИСТ/.test(g.nom.toUpperCase())) continue;
      const eski = eskiMashQatorlari(g, doc);
      if (!narxKerak(g) && !eski.length) continue;
      const m = matchResource(mash, g.nom, 'маш-ч', null);
      if ((m.confidence !== 'EXACT' && m.confidence !== 'HIGH') || !m.best) continue;
      const justification = mashAsosi(m.best.row, m.confidence === 'EXACT' ? 'nomi aynan mos' : 'mashina va quvvati/sig‘imi mos');
      const qatorlar = new Map([...narxsizQatorlar(g, hisob), ...eski].map(q => [q.occurrenceId + '\u0001' + q.recipeId, q]));
      for (const q of qatorlar.values()) {
        commands.push({ type: 'SET_PRICE', occurrenceId: q.occurrenceId, recipeId: q.recipeId, price: { value: String(m.best.row.narx), basis: 'CATALOG_CANDIDATE',
          evidence: `Mash.-soat ro‘yxati 01.01.2026 · № ${m.best.row.kod} · ${m.best.row.nom}`.slice(0, 300), sourcePriceId: `mash-katalog:${m.best.row.kod}`, justification } });
        qoplangan.add(q.occurrenceId + '\u0001' + q.recipeId);
      }
      narxlangan.add(g.key); soatSoni++;
    }
    if (soat) {
      const r = hourPrices(doc, hisob, soat, unitText, hudud || null, davr);
      const qolgan = r.commands.filter(c => c.type !== 'SET_PRICE' || !qoplangan.has(c.occurrenceId + '\u0001' + c.recipeId));
      commands.push(...qolgan); soatSoni += qolgan.length;
    }
    for (const g of guruhlar) {
      if (!katalogdanNarxlanadi(g) || !narxKerak(g) || materialKerak(g)) continue;
      // A supplier's КП for exactly this product is the real price → first; then the platform index (catalogue, birja, price lists).
      const kpMos = kpm?.qatorlar ? matchResource(kpm.view, narxNomi(g), g.birlik, null, 40) : null;
      const kpTop = kpMos && (kpMos.confidence === 'EXACT' || kpMos.confidence === 'HIGH') && kpMos.best ? kpMos : null;
      if (kpTop) {
        const n0 = qatorNomzodi(manbaQatori(kpTop.best!.row), g.birlik, 'kp');
        // Several suppliers' КП for the same product → their average (owner 2026-10-17).
        const n = n0 && ortachaQil(n0, kpTop.candidates.map(c => manbaQatori(c.row)), null);
        if (n) { commands.push(...narxBuyruqlari({ qatorlar: narxsizQatorlar(g, hisob) }, n, 'yetkazuvchi KP si, nomi va xarakteristikasi mos')); narxlangan.add(g.key); kpSoni++; if (n.ortacha) ortachaYoz(g, n); continue; }
      }
      if (!cat) continue;
      const m = matchResource(cat.matchView(), narxNomi(g), g.birlik, hudud || null, 40);
      if ((m.confidence !== 'EXACT' && m.confidence !== 'HIGH') || !m.best) continue;
      const n0 = qatorNomzodi(manbaQatori(m.best.row), g.birlik, 'katalog');
      if (!n0) continue;
      const n = ortachaQil(n0, m.candidates.map(c => manbaQatori(c.row)), hudud || null);
      commands.push(...narxBuyruqlari({ qatorlar: narxsizQatorlar(g, hisob) }, n, m.confidence === 'EXACT' ? 'nomi va birligi aynan mos' : 'xarakteristikasi mos, yagona mahsulot'));
      narxlangan.add(g.key);
      if (n.ortacha) ortachaYoz(g, n);
    }
    return { commands, soatSoni, kpSoni, narxlangan };
  }

  /** AI understands each remaining resource by MEANING and picks among source candidates (two search rounds). */
  /** Source candidates for a resource: price catalogue (meaning + gates) and the company's own estimates. */
  async function nomzodManbasi(kerak: ResursGuruh[]) {
    let kuzatuv: KuzatilganNarx[] = [];
    if (kompaniyaId != null) {
      setAi({ ish: true, matn: t('Kompaniya smetalaridagi narxlar o‘qilmoqda...') });
      try { kuzatuv = await kompaniyaKuzatuvlari(kompaniyaId, kerak.map(g => narxNomi(g))); } catch { /* catalogue still works without company history */ }
    }
    const view = cat?.matchView() ?? null;
    return (g: ResursGuruh, iboralar: string[]) => g.kat === 'МАШ' ? narxNomzodlari({ nom: g.nom, birlik: 'маш-ч' }, mash, null, null, iboralar) : narxNomzodlari({ nom: narxNomi(g), birlik: g.birlik }, view, kuzatuv.length ? kompaniyaMoslik(kuzatuv, narxNomi(g), g.birlik, false) : null, hudud || null, iboralar, 12,
      kpm?.qatorlar ? matchResource(kpm.view, narxNomi(g), g.birlik, null, 5) : null);
  }

  async function aiBuyruqlar(kerak: ResursGuruh[], nomzodlar: (g: ResursGuruh, iboralar: string[]) => NarxNomzod[]) {
    const natija = await aiNarxlash(kerak, nomzodlar,
      async sorov => { const r = await smetachiNarxTanla(kompaniyaId!, sorov, regions.find(([k]) => k === hudud)?.[1] ?? null); return r.ok ? r.tanlovlar : null; },
      (x, y) => { setAi({ ish: true, matn: t('AI resurslarni tahlil qilmoqda: {a} / {b}', { a: x, b: y }) }); jarayonYoz(t('AI resurslarni ma’nosi bo‘yicha solishtirmoqda: {a} / {b}', { a: x, b: y })); });
    const commands: StudioCommand[] = [];
    const qoldi = new Map<string, AiNarxNatija>();
    // Platform experience (owner 2026-10-17: "to'g'ri topganini ham tasdiqla deydi … tizim darajasida o'rgansin"): what estimators
    // accepted/rejected for this resource and whether the price fits the practice of every uploaded estimate.
    const kalit = (g: ResursGuruh) => resursKaliti(narxNomi(g), g.birlik);
    const tajriba = await Promise.resolve().then(() => narxTajribasi(kompaniyaId!, natija.flatMap(n => { const g = kerak.find(x => x.key === n.key);
      return g && n.nomzod ? [{ resurs: kalit(g), narx: n.nomzod.narx }] : []; }))).catch(() => ({} as Record<string, NarxTajriba>));
    let kotarildi = 0;
    for (const n0 of natija) {
      const g = kerak.find(x => x.key === n0.key)!;
      const k = ishonchniKuchaytir(n0.nomzod, n0.ishonch, tajriba[kalit(g)]);
      const n = k.ishonch === n0.ishonch ? n0 : { ...n0, ishonch: k.ishonch, sabab: `${n0.sabab} · ${k.dalil}`.slice(0, 400) };
      if (k.ishonch === 'yuqori' && n0.ishonch !== 'yuqori') kotarildi++;
      if (k.dalil && k.ishonch !== n0.ishonch) jarayonYoz(`${g.talab ?? g.nom}: ${k.dalil}`.slice(0, 220), k.ishonch === 'yuqori' ? 'ok' : 'savol');
      // An earlier estimate's price is never applied automatically and never becomes a justification (owner 2026-10-15).
      // High confidence from a documented source is applied; a medium pick is PRE-SELECTED and waits for the user's yes
      // (owner 2026-10-16: "mujmal bo'lsa so'rab tasdiqlatib olsin") — one «AI tanlagan narxlarni tasdiqlash» applies them all.
      if (n.nomzod && n.ishonch === 'yuqori' && n.nomzod.tur !== 'kompaniya') {
        commands.push(...narxBuyruqlari({ qatorlar: narxsizQatorlar(g, hisob) }, n.nomzod, n.sabab));
        jarayonYoz(`${g.talab ?? g.nom}: ${n.nomzod.narx} — ${n.sabab}`.slice(0, 220), 'ok');
        ortachaYoz(g, n.nomzod);
      } else {
        qoldi.set(n.key, n);
        if (n.nomzod && n.ishonch === 'orta') jarayonYoz(`${g.talab ?? g.nom}: ${n.nomzod.narx} taklif (o‘rta ishonch) — tasdiqingizni kutadi`.slice(0, 220), 'savol');
      }
    }
    return { commands, qoldi, kotarildi, topildi: natija.length - qoldi.size, manbadaYoq: [...qoldi.values()].filter(x => !x.nomzodlar.length).length };
  }

  /**
   * Last step (owner 2026-10-17: "narxsiz smeta qatori qolmasin — internetdan havolalar bilan obosnovat qilsin; mashinist 0"):
   * materials no source priced go to the internet agent; only prices VERIFIED on the opened page are applied, with the links.
   */
  async function internetBosqichi(qoldi: Map<string, AiNarxNatija>) {
    const kerak = [...qoldi.values()].filter(x => !x.nomzod).map(x => guruhlar.find(g => g.key === x.key))
      .filter((g): g is ResursGuruh => !!g && katalogdanNarxlanadi(g) && !materialKerak(g));
    const commands: StudioCommand[] = [];
    let topildi = 0, tekshirilmadi = 0;
    if (!kerak.length || kompaniyaId == null) return { commands, topildi, tekshirilmadi };
    const hududNomi = regions.find(([k]) => k === hudud)?.[1] ?? null;
    for (let i = 0; i < kerak.length; i += 8) {
      if(!pricingValid())break;
      const part = kerak.slice(i, i + 8);
      setAi({ ish: true, matn: t('Internetdan narx qidirilmoqda: {a} / {b}', { a: Math.min(i + 8, kerak.length), b: kerak.length }) });
      const r = await Promise.resolve().then(() => smetachiNarxInternet(kompaniyaId, part.map((g, j) => ({ id: `r${i + j}`, nom: narxNomi(g), birlik: g.birlik, kat: g.kat })), hududNomi)).catch(() => null);
      if (!r?.ok) { jarayonYoz(t('Internet qidiruvi javob bermadi — qolgan resurslar ro‘yxatda'), 'savol'); break; }
      if(!pricingValid())break;
      for (const n of r.natijalar) {
        const g = part[Number(n.id.slice(1)) - i]; if (!g) continue;
        const checked=n.manbalar.filter(m=>m.tekshirildi && m.smetaNarx!=null);
        if(checked.some(m=>m.nds==='nomalum') || checked.length!==1 || n.narx==null) {
          try{await retainResearch(researchScope,{key:g.key,name:g.talab ?? g.nom,result:n});setResearchRevision(v=>v+1);}catch{setResearchError(true);}
        }
        // Unknown tax is not an implicit 12% tax. Multiple suppliers require an
        // operator's equivalence decision before their average becomes a draft price.
        if(checked.some(m=>m.nds==='nomalum') || checked.length>1) {
          tekshirilmadi++;
          const prev=qoldi.get(g.key);
          if(prev)qoldi.set(g.key,{...prev,sabab:`${prev.sabab} · ${t(checked.some(m=>m.nds==='nomalum') ? 'QQS holatini aniqlashtiring; narx avtomatik qo‘llanmadi.' : 'Bir nechta taklif topildi. Komplektatsiya va yetkazish shartlarini solishtirib, narxni tasdiqlang.')} ${checked.map(m=>m.url).join('; ')}`.slice(0,600)});
          continue;
        }
        const b = internetBuyruqlari(narxsizQatorlar(g, hisob), n);
        if (b.length) {
          commands.push(...b); topildi++; qoldi.delete(g.key);
          jarayonYoz(`${g.talab ?? g.nom}: ${n.narx} — internet (${n.manbalar.filter(m => m.tekshirildi).map(m => m.domen).join(', ')})`.slice(0, 220), 'ok');
        } else if (n.manbalar.length) {
          // Links exist but the page did not show the price/product — the estimator opens them; nothing is applied silently.
          tekshirilmadi++;
          const prev = qoldi.get(g.key);
          if (prev) qoldi.set(g.key, { ...prev, sabab: `${prev.sabab} · internetda topildi, sahifada tasdiqlanmadi: ${n.manbalar.map(m => `${m.url} (${m.narx}${m.sabab ? `, ${m.sabab}` : ''})`).join('; ')}`.slice(0, 600) });
        }
      }
    }
    return { commands, topildi, tekshirilmadi };
  }

  /**
   * ONE action (owner 2026-10-14: "narxlar bittada topiladimi?"): every source in order — hour rates, exact catalogue
   * identity, then AI by meaning for the rest — applied as ONE batch (one undo). Without AI (no company/budget)
   * the deterministic part still runs and says so.
   */
  async function hammasiniNarxla(): Promise<string> {
    pricingCancelled.current=false;
    setXabar('');
    jarayonYoz(t('Narxlash: {n} resurs; manbalar — mash-soat ro‘yxati 01.01.2026, narx indeksi, kompaniya KP', { n: guruhlar.filter(narxKerak).length }));
    const avto = avtoBuyruqlar();
    jarayonYoz(t('Aniq mos topildi: {n} (mehnat/mash-soat {s}, KP {k})', { n: avto.narxlangan.size, s: avto.soatSoni, k: avto.kpSoni }), 'ok');
    // Machines without an exact list match also go to the AI (candidates from the machine-hour list); operators' labour never.
    const kerak = guruhlar.filter(g => narxKerak(g) && !avto.narxlangan.has(g.key) && !materialKerak(g)
      && (katalogdanNarxlanadi(g) || (!!mash && g.kat === 'МАШ' && !/МАШИНИСТ/.test(g.nom.toUpperCase()))));
    let ai: Awaited<ReturnType<typeof aiBuyruqlar>> | null = null, aiXato = false;
    let internet = { topildi: 0, tekshirilmadi: 0 };
    let zaxira = new Map<string, AiNarxNatija>();
    if (kerak.length) {
      try {
        const nomzodlar = await nomzodManbasi(kerak);
        if (kompaniyaId != null) {
          try { ai = await aiBuyruqlar(kerak, nomzodlar); } catch { aiXato = true; }
          if (ai) { const net = await internetBosqichi(ai.qoldi); ai.commands.push(...net.commands); internet = net; }
        }
        // Without AI the candidates are still shown — the estimator picks; nothing is applied silently.
        if (!ai) zaxira = new Map(kerak.map(g => [g.key, { key: g.key, nomzod: null, ishonch: 'past' as const, nomzodlar: nomzodlar(g, []),
          sabab: 'AI ishlamadi — manbadagi nomzodlardan o‘zingiz tanlang' }]));
      } finally { setAi({ ish: false, matn: '' }); }
    }
    if(!pricingValid())return t('Narxlash to‘xtadi. Topilgan takliflar izlanishlar navbatida saqlandi.');
    if (!qoy([...avto.commands, ...(ai?.commands ?? [])], t('Narxlash: stavkalar, katalog va AI'))) return t('Narxlar qo‘llanmadi.');
    const takliflarYangi = ai?.qoldi ?? zaxira;
    setTakliflar(takliflarYangi);
    if (takliflarYangi.size) setFiltr('taklif');
    const kutadi = [...takliflarYangi.values()].filter(x => x.nomzod && x.ishonch === 'orta' && x.nomzod.tur !== 'kompaniya');
    const qism = [t('mehnat/mashina-soat: {n} qator', { n: avto.soatSoni }), ...(avto.kpSoni ? [t('KP dan: {n}', { n: avto.kpSoni })] : []),
      t('katalogdan aniq: {n}', { n: avto.narxlangan.size - avto.kpSoni })];
    // How many resources took the mean of several suppliers' offers — the estimator must know (owner 2026-10-17).
    const ortachalar = new Set([...avto.commands, ...(ai?.commands ?? [])].flatMap(c => (c.type === 'SET_PRICE' && c.price?.justification?.average ? [c.price.justification] : [])));
    if (ortachalar.size) qism.push(t('{n} ta resursda bir nechta yetkazuvchi narxi turlicha — o‘rtacha narx olindi (Обоснование цен da har bir taklif ko‘rsatilgan)', { n: ortachalar.size }));
    if (ai?.kotarildi) qism.push(t('{n} ta narx tizim tajribasi tasdiqlagani uchun so‘ralmasdan qo‘yildi', { n: ai.kotarildi }));
    if (ai) {
      const yoq = [...ai.qoldi.values()].filter(x => !x.nomzodlar.length).length;
      qism.push(t('AI topdi: {n}', { n: ai.topildi }), ...(internet.topildi ? [t('internetdan havola bilan: {n}', { n: internet.topildi })] : []),
        t('tekshiruvingizda: {n}', { n: ai.qoldi.size - yoq }), t('manbalarda yo‘q: {n}', { n: yoq }));
      if (internet.tekshirilmadi) qism.push(t('{n} ta resursga internetda havola topildi, lekin sahifada narx tasdiqlanmadi — havolalar ro‘yxatda', { n: internet.tekshirilmadi }));
    }
    else if (kerak.length) qism.push(aiXato ? t('AI javob bermadi — {n} resurs uchun manba nomzodlari ro‘yxatda, tanlang', { n: kerak.length })
      : t('AI uchun kompaniya tanlanmagan — {n} resurs uchun katalog nomzodlari ro‘yxatda, tanlang', { n: kerak.length }));
    if (kutadi.length) qism.push(t('AI tanlagan {n} ta narx tasdiqingizni kutmoqda — «AI tanlagan narxlarni tasdiqlash» yoki chatda «tasdiqlayman» deng', { n: kutadi.length }));
    setXabar(qism.join(' · '));
    return qism.join(' · ');
  }
  /** Applies every pre-selected medium-confidence AI pick (documented sources only) as one batch. */
  function aiNarxlariniTasdiqla(): string {
    const ok = [...takliflar.values()].filter(x => x.nomzod && x.ishonch === 'orta' && x.nomzod.tur !== 'kompaniya');
    const commands = ok.flatMap(n => { const g = guruhlar.find(x => x.key === n.key); return g ? narxBuyruqlari({ qatorlar: narxsizQatorlar(g, hisob) }, n.nomzod!, `AI taklifi, foydalanuvchi tasdiqladi: ${n.sabab}`) : []; });
    if (!commands.length) return t('Tasdiq kutayotgan AI narxi yo‘q.');
    if (!qoy(commands, t('AI narxlari tasdiqlandi'))) return t('Narxlar qo‘llanmadi.');
    tajribaYoz(ok.flatMap(n => { const g = guruhlar.find(x => x.key === n.key); return g ? [{ g, n: n.nomzod!, holat: 'qabul' as const }] : []; }));
    setTakliflar(m => { const x = new Map(m); ok.forEach(n => x.delete(n.key)); return x; });
    return t('{n} ta AI narxi tasdiqlandi va qo‘yildi', { n: ok.length });
  }
  /** One pricing run at a time: the button, the chat agent and the automatic start share it (no double AI spend). */
  const joriyNarxlash = useRef<Promise<string> | null>(null);
  function narxla(): Promise<string> {
    if (!joriyNarxlash.current) joriyNarxlash.current = hammasiniNarxla().finally(() => { joriyNarxlash.current = null; });
    return joriyNarxlash.current;
  }
  // Studio agent (chat): pricing, region, a manual price with its document — the same functions as the buttons.
  const agent = useRef({ hammasiniNarxla: narxla, aiNarxlariniTasdiqla, setHudud, regions, guruhlar, qoy, hisob, hudud, manbalarTayyor });
  agent.current = { hammasiniNarxla: narxla, aiNarxlariniTasdiqla, setHudud, regions, guruhlar, qoy, hisob, hudud, manbalarTayyor };
  // Owner 2026-10-17 ("maksimal sodda, maksimal AI boshqaruvi"): opening this step with unpriced resources starts pricing by
  // itself, once per visit — every source in order, then the internet agent; one undo step.
  const avtoBoshlandi = useRef(false);
  useEffect(() => {
    if (avtoBoshlandi.current || !manbalarTayyor || !narxsizSoni || kompaniyaId == null) return;
    avtoBoshlandi.current = true;
    jarayonYoz(t('Narxlash avtomatik boshlandi: {n} ta resurs narxsiz', { n: narxsizSoni }));
    void narxla();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manbalarTayyor, narxsizSoni, kompaniyaId]);
  useEffect(() => {
    const off = [
      agentRegister('narx_tasdiq', async () => agent.current.aiNarxlariniTasdiqla()),
      agentRegister('narxla', async () => {
        await kut(() => agent.current.manbalarTayyor);
        if (!agent.current.manbalarTayyor) throw new Error(t('Narx manbalari yuklanmadi — sahifani yangilab, qayta urinib ko‘ring.'));
        return agent.current.hammasiniNarxla();
      }),
      agentRegister('hudud', async v => {
        const q = (v ?? '').toLowerCase();
        await kut(() => agent.current.regions.length > 0);
        const r = agent.current.regions.find(([k, n]) => k === q || n.toLowerCase().includes(q));
        if (!r) throw new Error(t('Hudud topilmadi: {h}', { h: v ?? '—' }));
        agent.current.setHudud(r[0]);
        // The next action (usually «narxla») must price for this region, not the previous one.
        await kut(() => agent.current.hudud === r[0]);
        return t('Obyekt hududi: {h}', { h: r[1] });
      }),
      agentRegister('narx', async (v, a) => {
        const narx = (v ?? '').replace(/\s/g, '').replace(',', '.');
        if (!/^\d+(\.\d+)?$/.test(narx)) throw new Error(t('Narx son emas: {v}', { v: v ?? '—' }));
        if (!a.manba?.trim()) throw new Error(t('Narx manbasi (hujjat) ko‘rsatilmagan — narx qo‘yilmaydi.'));
        const q = (a.ish ?? '').trim().toUpperCase();
        const g = agent.current.guruhlar.find(x => (x.talab ?? x.nom).toUpperCase() === q) ?? agent.current.guruhlar.find(x => (x.talab ?? x.nom).toUpperCase().includes(q));
        if (!g || !q) throw new Error(t('Resurs topilmadi: {r}', { r: a.ish ?? '—' }));
        const commands = g.qatorlar.map(x => ({ type: 'SET_PRICE' as const, occurrenceId: x.occurrenceId, recipeId: x.recipeId,
          price: { value: narx, basis: 'OPERATOR_MANUAL' as const, evidence: a.manba!.slice(0, 300), sourcePriceId: null,
            justification: { docType: 'MANUAL' as const, document: a.manba!.slice(0, 400), sourceName: null, sourceUnit: g.birlik, sourcePrice: narx, conversion: null, reason: a.izoh || null } } }));
        if (!agent.current.qoy(commands, t('AI: narx qo‘yildi'))) throw new Error(t('Narx qo‘yilmadi.'));
        return t('{r}: {n} (manba: {m})', { r: g.talab ?? g.nom, n: narx, m: a.manba });
      }),
    ];
    return () => off.forEach(f => f());
  }, []);
  /** Every estimator's decision teaches the platform (owner 2026-10-17); a failed write never blocks pricing. */
  function tajribaYoz(l: Array<{ g: ResursGuruh; n: NarxNomzod; holat: 'qabul' | 'rad' }>) {
    if (kompaniyaId == null) return;
    void Promise.resolve().then(() => narxTajribaYoz(kompaniyaId, l.filter(x => x.n.tur !== 'kompaniya').map(x => ({ resurs: resursKaliti(narxNomi(x.g), x.g.birlik), manba: manbaKaliti(x.n),
      tur: x.n.tur === 'kp' ? 'kp' as const : 'katalog' as const, narx: x.n.narx, holat: x.holat })))).catch(() => {});
  }
  function qabul(g: ResursGuruh, n: NarxNomzod, sabab: string) {
    if (qoy(narxBuyruqlari({ qatorlar: narxsizQatorlar(g, hisob).length ? narxsizQatorlar(g, hisob) : g.qatorlar }, n, sabab), t('Narx tanlandi'))) {
      // The estimator chose a different source than the AI → the AI's pick is a rejection for this resource.
      const ai = takliflar.get(g.key)?.nomzod;
      tajribaYoz([{ g, n, holat: 'qabul' }, ...(ai && manbaKaliti(ai) !== manbaKaliti(n) ? [{ g, n: ai, holat: 'rad' as const }] : [])]);
      setTakliflar(m => { const x = new Map(m); x.delete(g.key); return x; });
    }
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
    {researchError && <p role="alert" className="text-xs text-danger">{t('Izlanishlar navbati qurilmada saqlanmadi. Oynani yopmang.')}</p>}
    <PriceResearchQueue scope={researchScope} revision={researchRevision} onApply={(key,result)=>{const group=guruhlar.find(g=>g.key===key);if(!group)return false;const commands=internetBuyruqlari(narxsizQatorlar(group,hisob),result);return commands.length>0 && qoy(commands,t('Smetachi tanlagan internet narxi'));}} />
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
        : t('Narx manbalari: {n} qator ({m} nashr: katalog, birja, prays-list), NDS siz', { n: cat?.rows.length.toLocaleString('ru-RU') ?? '0', m: cat?.dict.manbalar?.length ?? 1 })}</span>
      {kpm && (kpm.qatorlar > 0 || kpm.qqsNomalum > 0) && <span className="text-xs text-text-mute">{t('Kompaniya KP/prays: {n} narx', { n: kpm.qatorlar })}
        {kpm.qqsNomalum > 0 && <span className="text-warn"> · {t('QQS holati noma’lum {n} narx ishlatilmaydi', { n: kpm.qqsNomalum })}</span>}</span>}
    </section>
    <StudioKpYuklash kompaniyaId={kompaniyaId} onSaqlandi={() => setKpmVersiya(v => v + 1)} />

    <StavkalarKartasi doc={doc} command={command} kompaniyaId={kompaniyaId} />

    <section aria-label={t('Resurslar narxi')} className="karta overflow-hidden p-0 text-[12.5px]">
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface-2/60 px-2 py-1.5">
        <strong className="text-[11px] font-semibold uppercase tracking-wide text-text-dim">{t('Resurslar narxi')}</strong>
        <span className="text-xs text-text-mute">{t('{a} resurs, narxsiz: {b}', { a: guruhlar.length, b: narxsizSoni })}</span>
        <span className="flex-1" />
        <button type="button" className="tugma tugma-asosiy h-8 px-3 text-[12px]" disabled={ai.ish || !narxsizSoni || catHolat === 'yuklanmoqda'} onClick={() => void narxla()}>
          {ai.ish ? t('Narxlar qidirilmoqda...') : t('Barcha narxlarni topish')}</button>
        {[...takliflar.values()].some(x => x.nomzod && x.ishonch === 'orta' && x.nomzod.tur !== 'kompaniya') && <button type="button" className="tugma h-8 px-3 text-[12px]" onClick={() => setXabar(aiNarxlariniTasdiqla())}>
          {t('AI tanlagan narxlarni tasdiqlash ({n})', { n: [...takliflar.values()].filter(x => x.nomzod && x.ishonch === 'orta' && x.nomzod.tur !== 'kompaniya').length })}</button>}
        <select aria-label={t('Ko‘rinish')} className="input h-7 text-[11.5px]" value={filtr} onChange={e => setFiltr(e.target.value as typeof filtr)}>
          <option value="hammasi">{t('Hammasi')}</option><option value="narxsiz">{t('Faqat narxsiz')}</option><option value="taklif">{t('AI takliflari ({n})', { n: takliflar.size })}</option>
        </select>
      </div>
      {(xabar || ai.matn) && <p role="status" className="px-2 py-1 text-xs text-accent">{ai.matn || xabar}</p>}
      {ai.ish && <button className="tugma m-2 px-3 py-1" onClick={()=>{pricingCancelled.current=true;setAi({ish:true,matn:t('Narxlash to‘xtatilmoqda...')});}}>{t('Narxlashni to‘xtatish')}</button>}
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
                  <td className="px-2 py-1">{g.talab ? <>{g.talab.toUpperCase()} <span className="text-[11px] text-text-mute">({g.nom})</span></> : g.nom}
                    {materialKerak(g) && <span className="block text-[11px] text-danger">{t('Loyiha materiali ko‘rsatilmagan — LRV dagi «Loyiha materiallari» da kiriting (sinf/marka). Shungacha narxlanmaydi.')}</span>}{g.qatorlar.length > 1 && <span className="text-[11px] text-text-mute"> · {t('{n} ishda', { n: g.qatorlar.length })}</span>}</td>
                  <td className="px-1 py-1">{g.birlik ?? '—'}
                    <select aria-label={t('Nakrutka kategoriyasi')} title={t('Qaysi foizlar qo‘llanadi')} className="input mt-0.5 block h-6 text-[10.5px]" value={g.kat ?? ''}
                      onChange={e => qoy(g.qatorlar.map(q => ({ type: 'SET_RESOURCE_KAT' as const, occurrenceId: q.occurrenceId, recipeId: q.recipeId, kat: e.target.value || null })), t('Nakrutka kategoriyasi'))}>
                      <option value="">{t('Kat.')}</option>
                      {NAKRUTKA_KATLAR.map(k => <option key={k} value={k}>{k}</option>)}
                    </select></td>
                  <td className="px-1 py-1 text-right tabular-nums">{fmt(g.miqdor, 4)}</td>
                  <td className="px-1 py-1 text-right tabular-nums">{g.narx != null ? fmt(g.narx) : g.aralash ? <span className="text-warn">{t('aralash')}</span> : <span className="text-warn">{t('narx yo‘q')}</span>}</td>
                  <td className="px-1 py-1 text-right tabular-nums">{fmt(summa)}</td>
                  <td className="px-2 py-1">
                    <NarxAsosi g={g} />
                    {taklif && <AiTaklif g={g} taklif={taklif} onQabul={qabul} />}
                    {qolda?.key === g.key
                      ? <form className="mt-1 flex flex-wrap gap-1" onSubmit={e => { e.preventDefault(); qoldaSaqla(); }}>
                          <MoneyInput aria-label={t('Birlik narxi')} className="input h-7 w-28 text-[11.5px]" inputMode="decimal" value={qolda.narx} onValueChange={(moneyValue) => setQolda({ ...qolda, narx: moneyValue })} />
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
    {a.average && <p data-testid="narx-ortacha">{t('O‘rtacha {n} ta yetkazuvchi narxidan', { n: a.average.count })}: {a.average.offers.map(o => `${o.supplier} — ${fmt(o.price)}`).join('; ')}</p>}
    {a.sources?.map(s => <p key={s.url} data-testid="narx-internet-manba">{s.name} — {fmt(s.price)}{s.unit ? ` / ${s.unit}` : ''}{s.vat === true ? ` (${t('QQS bilan')})` : ''}:{' '}
      <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="underline break-all">{s.url}</a></p>)}
    {a.conversion &&<p className="text-text-dim">{t('Qayta hisob')}:{a.conversion.formula} = {a.conversion.factor}{a.conversion.note ? ` (${a.conversion.note})` : ''}</p>}
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
  /** Custom markup structure: the company/contract/object podval from the constructor, or the standard one to edit here. */
  async function podvalOl() {
    if (kompaniyaId == null) return;
    try {
      const p = await amaldagiPodval(kompaniyaId, { obyektId: doc.context.objectId ?? null });
      const values = Object.fromEntries(NAKRUTKA_KOEF_KODLAR.map(k => [k, Number(String(qiymat[k] ?? '0').replace(',', '.')) || 0]));
      const podval: Podval = p ?? standartPodval(values);
      if (command({ type: 'SET_RATES', rates: { values, source: manba.trim() || t('Operator'), podval } }))
        setHolat(p ? t('Maxsus podval qo‘llandi: {n} qator. Foizlarni shu yerda o‘zgartirish mumkin.', { n: p.qatorlar.length }) : t('Saqlangan maxsus podval yo‘q — standart tuzilma tahrirlash uchun ochildi.'));
    } catch { setHolat(t('Podval o‘qilmadi.')); }
  }
  function podvalFoiz(kod: string, v: string) {
    const p = doc.rates?.podval; if (!p || !doc.rates) return;
    const n = Number(v.replace(',', '.'));
    if (v.trim() && (!Number.isFinite(n) || n < 0 || n > 100)) return;
    command({ type: 'SET_RATES', rates: { ...doc.rates, podval: { ...p, qatorlar: p.qatorlar.map(q => q.kod === kod ? { ...q, foiz: v.trim() ? n : null } : q) } } });
  }
  const tasdiqRef = useRef(tasdiqla);
  tasdiqRef.current = tasdiqla;
  useEffect(() => agentRegister('stavka_tasdiq', async () => { tasdiqRef.current(); return t('Stavkalar tasdiqlandi.'); }), []);
  // Agent: one rate (code + percent) → confirmed at once so the RES cascade follows.
  const stavkaRef = useRef({ qiymat, manba, rates: doc.rates, command });
  stavkaRef.current = { qiymat, manba, rates: doc.rates, command };
  useEffect(() => agentRegister('stavka', async (v, a) => {
    const kod = (a.ish ?? '').trim().toUpperCase();
    if (!(NAKRUTKA_KOEF_KODLAR as readonly string[]).includes(kod)) throw new Error(t('Stavka kodi noma’lum: {k}', { k: a.ish ?? '—' }));
    const n = Number((v ?? '').replace(',', '.'));
    if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error(t('Foiz 0 dan 100 gacha bo‘lishi kerak: {k}', { k: kod }));
    const cur = stavkaRef.current;
    const values = Object.fromEntries(NAKRUTKA_KOEF_KODLAR.map(k => [k, Number(String(cur.qiymat[k] ?? '0').replace(',', '.')) || 0]));
    values[kod] = n;
    setQiymat(Object.fromEntries(Object.entries(values).map(([k, x]) => [k, String(x)])));
    if (!cur.command({ type: 'SET_RATES', rates: { values, source: cur.manba.trim() || t('Operator'), ...(cur.rates?.podval ? { podval: cur.rates.podval } : {}) } })) throw new Error(t('Stavka qo‘yilmadi.'));
    return t('{k} = {n}%', { k: kod, n });
  }), []);
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
    <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-2">
      <span className="text-[11.5px] text-text-dim">{t('Nakrutka tuzilmasi')}: <b>{doc.rates?.podval ? t('maxsus podval') : t('standart kaskad')}</b></span>
      {kompaniyaId != null && <button type="button" className="tugma h-7 px-2 text-[11.5px]" onClick={() => void podvalOl()}>{t('Maxsus podvalni qo‘llash / tahrirlash')}</button>}
      {doc.rates?.podval && <button type="button" className="tugma h-7 px-2 text-[11.5px]" onClick={() => command({ type: 'SET_RATES', rates: { values: doc.rates!.values, source: doc.rates!.source } })}>{t('Standart kaskadga qaytish')}</button>}
      <a className="text-[11.5px] underline" href="/admin/nakrutka" target="_blank" rel="noreferrer">{t('Podval konstruktori (qator qo‘shish, baza tanlash)')}</a>
    </div>
    {doc.rates?.podval && <div className="grid gap-1 sm:grid-cols-2">
      {doc.rates.podval.qatorlar.filter(q => q.tur === 'foiz').map(q => <label key={q.kod} className="flex items-center gap-2 text-[11.5px]">
        <span className="flex-1 text-text-dim">{q.nom}</span>
        <input aria-label={q.nom} className="input h-7 w-20 text-right text-[12px]" inputMode="decimal" defaultValue={q.foiz == null ? '' : String(q.foiz)} onBlur={e => podvalFoiz(q.kod, e.target.value)} />
        <span>%</span>
      </label>)}
    </div>}
    <p className="text-[11px] text-text-mute">{t('Har resurs qaysi foizlar bilan hisoblanishini narxlash jadvalidagi «Kat.» ustunida alohida tanlash mumkin.')}</p>
    {holat && <p role="status" className="text-xs text-accent">{holat}</p>}
  </section>;
}

/* ───────────────────────── Jami va ③ RES ───────────────────────── */
function katSummalari(doc: EstimateDoc, hisob: DocCalc, unitText: UnitText): { ks: KatSummalar; narxsiz: number; aniqlanmagan: number } {
  const ks = Object.fromEntries(NAKRUTKA_KATLAR.map(k => [k, 0])) as KatSummalar;
  let narxsiz = 0, aniqlanmagan = 0;
  for (const o of Object.values(doc.occurrences)) for (const l of hisob.occurrences[o.id]?.lines ?? []) {
    if (!l.resource) continue;
    const kat: NakrutkaKat | null = qatorKategoriyasi(o, l.recipeId, l.resource, unitText);
    if (l.amount == null) { if (l.price == null) narxsiz++; continue; }
    if (!kat) { aniqlanmagan++; continue; }
    ks[kat] = Math.round((ks[kat] + Number(l.amount)) * 100) / 100;
  }
  return { ks, narxsiz, aniqlanmagan };
}

function JamiSatri({ doc, hisob, unitText }: { doc: EstimateDoc; hisob: DocCalc; unitText: UnitText }) {
  const { ks, narxsiz } = useMemo(() => katSummalari(doc, hisob, unitText), [doc, hisob, unitText]);
  const pryamye = NAKRUTKA_KATLAR.reduce((s, k) => s + ks[k], 0);
  const vsego = doc.rates ? (doc.rates.podval ? podvalHisobla(doc.rates.podval, ks).vsego : nakrutkaKaskadJS(ks, doc.rates.values).vsego) : null;
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
  /** Official documents are billed by filled cells like every other document (token session 2026-10-16); the file is given only after payment. */
  async function tokenBilanBer(bytes: Uint8Array, nom: string, hujjat: string, sabab: string): Promise<string | null> {
    if (kompaniyaId == null) { setXabar(t('Hujjat uchun avval kompaniyani tanlang.')); return null; }
    const r = await hujjatTokenBilan({ kompaniyaId, bytes, hujjat, sabab: `${sabab} · ${doc.context.objectLabel || doc.context.title || 'Smeta'}` }, () => yuklabBer(bytes, nom));
    if (!r.ok) { setXabar(r.xabar); return null; }
    return r.xabar;
  }
  /** «ПРОТОКОЛ СОГЛАСОВАНИЯ ЦЕН» between the client and the contractor for the estimate's own prices. */
  async function protokolYukla(): Promise<string | null> {
    try {
      const [{ studioProtokolQatorlari, STUDIO_PROTOKOL_USTUNLARI, STUDIO_PROTOKOL_MAQSADI }, { narxProtokolXlsx }] = await Promise.all([
        import('../../lib/smeta-studio/abc-hujjat'), import('../../lib/narx-protokol-hujjat')]);
      const qatorlar = studioProtokolQatorlari(doc, hisob, unitText);
      if (!qatorlar.length) { setXabar(t('Protokol uchun narxlangan resurs yo‘q — avval narxlang.')); return null; }
      const r = narxProtokolXlsx(qatorlar, { obyektNomi: doc.context.objectLabel || doc.context.title || 'Smeta', raqam: protokol.raqam.trim() || '1', sana: protokol.sana,
        imzo: tomonlar, ustunNomlari: STUDIO_PROTOKOL_USTUNLARI, maqsad: STUDIO_PROTOKOL_MAQSADI });
      const tx = await tokenBilanBer(r.bytes, r.faylNomi, 'PROTOKOL_NARX', 'Протокол согласования цен');
      if (tx == null) return null;
      const m = t('Narxlarni kelishish protokoli yuklandi: {n} pozitsiya. Ikki tomon imzosidan keyin kuchga kiradi.', { n: r.soni }) + (tx ? ` · ${tx}` : '');
      setXabar(m); return m;
    } catch { setXabar(t('Hujjat tayyorlanmadi. Qayta urinib ko‘ring.')); return null; }
  }
  const { ks, narxsiz, aniqlanmagan } = useMemo(() => katSummalari(doc, hisob, unitText), [doc, hisob, unitText]);
  const kaskad = doc.rates && !doc.rates.podval ? nakrutkaKaskadJS(ks, doc.rates.values) : null;
  const maxsus = doc.rates?.podval ? { p: doc.rates.podval, h: podvalHisobla(doc.rates.podval, ks) } : null;
  const tasdiqsizQator = <tr><td colSpan={2} className="px-2 py-1 text-warn">{t('Foiz stavkalari tasdiqlanmagan — faqat to‘g‘ri xarajatlar. «Narxlash» bosqichida stavkalarni tasdiqlang.')}</td></tr>;
  const maxsusQatorlar = maxsus ? maxsus.p.qatorlar.map(q => <tr key={q.kod} className={q.tur === 'jami' ? 'font-semibold' : ''}><td className="px-2 py-0.5">{q.nom}{q.tur === 'foiz' && q.foiz != null ? ` (${String(q.foiz).replace('.', ',')}%)` : ''}</td>
            <td className="px-2 py-0.5 text-right tabular-nums">{maxsus.h.qiymat[q.kod] == null ? '—' : fmt(maxsus.h.qiymat[q.kod]!)}</td></tr>) : null;
  const workUnit = (code: string | null) => (code && katalog ? katalog.unit(code)?.text ?? null : null);
  async function yukla(): Promise<string | null> {
    try {
      const { abcHujjat } = await import('../../lib/smeta-studio/abc-hujjat');
      const r = abcHujjat(doc, hisob, { resource: unitText, work: workUnit }, { obyekt: doc.context.objectLabel || null, qurilish: doc.context.title || null, imzo: tomonlar });
      const tx = await tokenBilanBer(r.bytes, hisob.total.unresolved ? `DRAFT_${r.faylNomi}` : r.faylNomi, 'LRV_RES', 'ЛРВ + РС + обоснование цен');
      if (tx == null) return null;
      const m = (hisob.total.unresolved ? t('Qoralama yuklandi. Narx, hajm yoki norma aniqlanmagan qatorlar bor; yakuniy smeta summasi hali hisoblanmagan.') : t('LRV va RES yuklandi (tirik formulalar).')) + (tx ? ` · ${tx}` : '');
      setXabar(m); return m;
    } catch (e) {
      setXabar(e instanceof Error && e.message === 'LRV_BOSH' ? t('Hujjat uchun avval smetaga ish qo‘shing.') : t('Hujjat tayyorlanmadi. Qayta urinib ko‘ring.'));
      return null;
    }
  }
  const hujjatRef = useRef({ yukla, protokolYukla });
  hujjatRef.current = { yukla, protokolYukla };
  useEffect(() => agentRegister('hujjat', async v => {
    // The agent reports what really happened (paid and given, or why not) — never a success it did not see.
    const m = v === 'protokol' ? await hujjatRef.current.protokolYukla() : await hujjatRef.current.yukla();
    if (m == null) throw new Error(t('Hujjat berilmadi — sababi narxlash/RES bosqichida ko‘rsatildi.'));
    return m;
  }), []);
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
        </> : maxsusQatorlar ?? tasdiqsizQator}
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
