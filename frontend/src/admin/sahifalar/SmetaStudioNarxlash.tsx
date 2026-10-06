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
 *   4. Hujjatlar: LRV + Ведомость ресурсов + Свод + pivot (mavjud lrv-hujjat dvigateli).
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
import { resourceCategory, studioToRows } from '../../lib/smeta-studio/export-adapter';
import { resourceUnitText } from '../../lib/smeta-studio/resource-units';
import { narxAgentSora, type AgentResult } from '../../api/smeta-narx-agent';
import type { KatalogSnapshot } from '../../../functions/_shared/narx-katalog-snapshot';

export const HUDUD_KALIT = 'smeta-studio:hudud';
const AVTO_KALIT = 'smeta-studio:avto-narx';
export const lsGet = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
export const lsSet = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };
const fmt = (n: number | string | null | undefined) => n == null ? '—' : Number(n).toLocaleString('ru-RU', { maximumFractionDigits: 2 });

/** Normative resource unit code → plain unit text the price catalogue uses (base unit of "100 м3" is "м3"). */
export function unitTextOf(katalog: RemoteNormCatalog | null) {
  return (code: string | null) => {
    if (!code) return null;
    const r = resourceUnitText(code);
    if (r) return r;
    const u = katalog?.unit(code);
    return u ? (u.base ?? u.text) : null;
  };
}
const snapToRow = (s: KatalogSnapshot): KatalogQatori => ({ ...s, narx: s.narx == null ? null : Number(s.narx), hudud_kalit: null });
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
  useEffect(() => { tried.current = new Set(); setReview([]); setAgent({ holat: 'tayyor', matn: '', natija: [] }); }, [doc.draftId]);

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
  const key = (p: { occurrenceId: string; recipeId: string }) => `${p.occurrenceId}:${p.recipeId}`;

  function narxla(lines: Pending[], izoh: string) {
    if (!cat || holat !== 'tayyor' || !lines.length) return;
    for (const l of lines) tried.current.add(key(l));
    const r = autoPrice(lines, cat.matchView(), hudud || null);
    const commands = r.applied.map(a => priceCommand(a.occurrenceId, a.recipeId, a.result.best!.row));
    if (commands.length) command({ type: 'BATCH', label: 'Avto-narx (katalog)', commands });
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
  }, [avto, holat, pending]);

  const agentTaklifBor = agent.natija.some(a => a.tanlov);
  const openReview = review.filter(r => pending.some(p => key(p) === key(r)));
  function qoy(line: AutoPriceLine, row: KatalogQatori) { command(priceCommand(line.occurrenceId, line.recipeId, row)); }

  async function agentgaYubor() {
    if (kompaniyaId == null) { setAgent({ holat: 'xato', matn: t('Avval yuqorida kompaniyani tanlang.'), natija: [] }); return; }
    const items = openReview.filter(r => r.result.candidates.length).slice(0, 40).map(r => ({ key: key(r), nom: r.name, birlik: r.unit,
      nomzodlar: r.result.candidates.slice(0, 8).map(c => c.row.id) }));
    if (!items.length) { setAgent({ holat: 'xato', matn: t('Agentga yuboradigan nomzodli resurs yo‘q.'), natija: [] }); return; }
    setAgent({ holat: 'ishlayapti', matn: t('AI agent {n} ta resursni tahlil qilmoqda...', { n: items.length }), natija: [] });
    const r = await narxAgentSora(kompaniyaId, regions.find(([k]) => k === hudud)?.[1] ?? null, items);
    if (!r.ok) {
      setAgent({ holat: 'xato', natija: [], matn: r.code === 'AI_NOT_CONFIGURED' ? t('AI agent hali sozlanmagan (Cloudflare’da AI kaliti yo‘q). Deterministik moslik ishlayveradi.')
        : r.code === 'FORBIDDEN' ? t('Bu kompaniyaga ruxsat yo‘q.') : t('AI agent hozir javob bermadi. Keyinroq qayta urinib ko‘ring.') });
      return;
    }
    setAgent({ holat: 'tayyor', matn: t('AI agent {n} ta taklif berdi — tekshirib qabul qiling.', { n: r.items.filter(x => x.tanlov).length }), natija: r.items });
  }
  function agentQabul(list: AgentResult[]) {
    const commands = list.filter(a => a.tanlov && pending.some(p => key(p) === a.key)).map(a => {
      const [occurrenceId, recipeId] = a.key.split(':');
      const c = priceCommand(occurrenceId, recipeId, snapToRow(a.tanlov!));
      return c.type === 'SET_PRICE' && c.price ? { ...c, price: { ...c.price, evidence: `${c.price.evidence} · AI agent: ${a.sabab}`.slice(0, 300) } } : c;
    });
    if (commands.length) command(commands.length === 1 ? commands[0] : { type: 'BATCH', label: 'AI agent narxlari', commands });
  }

  async function lrvYukla() {
    try {
      const { lrvHujjat } = await import('../../lib/lrv-hujjat');
      const r = lrvHujjat(studioToRows(doc, hisob, unitText), [], { obyektNom: doc.context.objectLabel || doc.context.title || t('Smeta qoralamasi') });
      const url = URL.createObjectURL(new Blob([r.bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const a = document.createElement('a'); a.href = url; a.download = r.faylNomi; a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
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
      <button type="button" className="tugma h-7 px-2 text-[11.5px]" disabled={holat !== 'tayyor' || !pending.length} onClick={() => narxla(pending, t('Qayta tekshiruv'))}>
        {t('Narxsizlarni katalogdan topish ({n})', { n: pending.length })}</button>
      <span className="flex-1" />
      <button type="button" className="tugma tugma-asosiy h-7 px-2 text-[11.5px]" disabled={!Object.keys(doc.occurrences).length} onClick={() => void lrvYukla()}>{t('LRV + Ведомость + Свод (Excel)')}</button>
    </div>
    {xabar && <p role="status" className="text-xs text-accent">{xabar}</p>}
    {ishMashina > 0 && <p className="text-xs text-text-mute">{t('Mehnat va mashina resurslari ({n}) material katalogidan narxlanmaydi — ular hudud chel.-soat / mash.-soat stavkasidan olinadi.', { n: ishMashina })}</p>}
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
            return <tr key={key(r)} className="border-t border-border/40 align-top">
              <td className="w-[38%] px-2 py-1"><span className="text-text">{r.name}</span>{r.unit && <span className="text-text-mute">, {r.unit}</span>}</td>
              <td className="px-2 py-1">
                {!r.result.candidates.length ? <span className="text-text-mute">{t('Xarakteristikasi mos nomzod topilmadi')}{r.result.gateRejected ? ` (${t('{n} ta rad etildi', { n: r.result.gateRejected })})` : ''}</span>
                  : <select aria-label={t('Katalog nomzodi')} className="input h-7 w-full text-[11.5px]" defaultValue=""
                    onChange={e => { const c = r.result.candidates.find(x => String(x.row.id) === e.target.value); if (c) qoy(r, c.row); }}>
                    <option value="" disabled>{t('— nomzod tanlang ({n}) —', { n: r.result.candidates.length })}</option>
                    {r.result.candidates.map(c => <option key={c.row.id} value={c.row.id}>{fmt(c.row.narx)} · {c.row.nom}{c.row.birlik ? `, ${c.row.birlik}` : ''} · {c.row.hudud ?? ''} · {Math.round(c.score * 100)}%</option>)}
                  </select>}
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
