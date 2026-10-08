/**
 * Prices observed in the company's OWN imported estimates (t2_qator), matched by the exact normative
 * resource code (KodR, e.g. 000913) — the strongest identity there is (same machine / material / labour).
 * Tenant-safe: read through /api/sb, which forces the caller's company membership on every query.
 *
 *  • Unit must agree (маш-ч ↔ МАШ-Ч, т ↔ ТН …); a different unit is never priced.
 *  • Machines: the highest observed price for the exact machine (owner rule: one MAX offer per machine).
 *  • Labour and materials: the most recent observation; range and count are shown in the evidence.
 * Estimate resource prices are VAT-free (VAT is added in the footer), consistent with the owner's rule.
 */
import { sbOqi } from '../../api/supabase';
import { resourceFacts } from '../resource-semantics';
import { unitKey } from './resource-match';
import type { DocCalc } from './calc';
import type { StudioCommand } from './commands';
import type { EstimateDoc } from './model';

export type KuzatilganNarx = { kod: string; birlik: string | null; narx: number; obyekt: string | null; sana: string | null };
export type KodNarxi = { kod: string; birlik: string | null; narx: number; min: number; max: number; soni: number; obyekt: string | null; sana: string | null; usul: 'MAX' | 'OXIRGI' };

export function kodNarxi(rows: KuzatilganNarx[], mashina: boolean): KodNarxi | null {
  const ok = rows.filter(r => Number.isFinite(r.narx) && r.narx > 0);
  if (!ok.length) return null;
  const pick = mashina ? ok.reduce((a, b) => (b.narx > a.narx ? b : a))
    : ok.reduce((a, b) => ((b.sana ?? '') > (a.sana ?? '') ? b : a));
  const narxlar = ok.map(r => r.narx);
  return { kod: pick.kod, birlik: pick.birlik, narx: pick.narx, min: Math.min(...narxlar), max: Math.max(...narxlar), soni: ok.length,
    obyekt: pick.obyekt, sana: pick.sana, usul: mashina ? 'MAX' : 'OXIRGI' };
}

/** Fetch observations for the given resource codes (chunked; the gateway adds the company filter itself). */
export async function kompaniyaKuzatuvlari(kompaniyaId: number, kodlar: string[]): Promise<Map<string, KuzatilganNarx[]>> {
  const out = new Map<string, KuzatilganNarx[]>();
  const uniq = [...new Set(kodlar.filter(k => /^[0-9A-Za-zА-Яа-я.-]{3,30}$/.test(k)))];
  for (let i = 0; i < uniq.length; i += 120) {
    const part = uniq.slice(i, i + 120);
    const r = await sbOqi<{ kod: string; birlik: string | null; narx: number; obyekt: string | null; yangilandi: string | null }>({
      jadval: 't2_qator', ustunlar: 'kod,birlik,narx,obyekt,yangilandi',
      filtr: `kompaniya_id=eq.${kompaniyaId}&tur=in.(rs,mat,ob)&narx=gt.0&kod=in.(${part.map(k => `"${k}"`).join(',')})`, limit: 20000 });
    if (!r.ok || !Array.isArray(r.qatorlar)) continue;
    for (const x of r.qatorlar) {
      const k = String(x.kod).trim();
      const l = out.get(k) ?? [];
      l.push({ kod: k, birlik: x.birlik, narx: Number(x.narx), obyekt: x.obyekt, sana: x.yangilandi });
      out.set(k, l);
    }
  }
  return out;
}

export type KompaniyaNarxNatija = { commands: StudioCommand[]; topildi: number; birlikMosEmas: number };

/** Exact-code proposals for every priceless resource line (all categories). */
export function kompaniyaNarxlari(doc: EstimateDoc, calc: DocCalc, kuzatuv: Map<string, KuzatilganNarx[]>,
  unitText: (code: string | null) => string | null, skip: (key: string) => boolean = () => false): KompaniyaNarxNatija {
  const res: KompaniyaNarxNatija = { commands: [], topildi: 0, birlikMosEmas: 0 };
  for (const o of Object.values(doc.occurrences)) for (const l of calc.occurrences[o.id]?.lines ?? []) {
    if (l.price != null || !l.resource || skip(`${o.id}:${l.recipeId}`)) continue;
    const kod = l.resource.resourceIdCode ?? null;
    const rows = (kod && kuzatuv.get(kod)) || (l.resource.code ? kuzatuv.get(l.resource.code) : undefined);
    if (!rows?.length) continue;
    const unit = unitText(l.resource.unitCode);
    const sameUnit = rows.filter(r => !unit || !r.birlik || unitKey(r.birlik) === unitKey(unit));
    if (!sameUnit.length) { res.birlikMosEmas++; continue; }
    const f = resourceFacts(l.resource, unitText);
    const n = kodNarxi(sameUnit, f.kind === 'MACHINE');
    if (!n) continue;
    res.topildi++;
    const fmt = (v: number) => v.toLocaleString('ru-RU', { maximumFractionDigits: 2 });
    res.commands.push({ type: 'SET_PRICE', occurrenceId: o.id, recipeId: l.recipeId, price: {
      value: String(Math.round(n.narx * 100) / 100), basis: 'CONTRACT_DRAFT',
      evidence: `Kompaniya smetalaridagi narx · kod ${n.kod} · ${n.usul === 'MAX' ? 'eng yuqori' : 'eng oxirgi'} · ${n.obyekt ?? 'obyekt ?'}${n.sana ? ' · ' + n.sana.slice(0, 10) : ''} · ${n.soni} marta, oraliq ${fmt(n.min)}–${fmt(n.max)} · NDS siz`,
      sourcePriceId: `kompaniya-smeta:${n.kod}` } });
  }
  return res;
}
