/**
 * Studio agenti (egasi 2026-10-16: "yondagi chat smetani oxirigacha ishlatishi kerak — narxlashdan hujjat tartibigacha").
 * AI faqat TAKLIF qiladi (AgentAmal); foydalanuvchi «Bajarish» ni bosadi. Smeta tahrirlari — yagona buyruq qatlami (BATCH = bitta
 * «Bekor qilish»); narxlash, koeffitsient tanlash, hujjat — shu ishni qiladigan bosqich komponenti ro'yxatdan o'tkazgan funksiya.
 */
import type { AgentAmal } from '../../lib/smeta-ai/protokol';
import type { StudioCommand } from '../../lib/smeta-studio/commands';
import type { EstimateDoc } from '../../lib/smeta-studio/model';
import { ishHavolalari } from '../../lib/smeta-studio/ai-kontekst';
import { resursNomi } from '../../lib/smeta-studio/loyiha-material';
import { NAKRUTKA_KATLAR } from '../../lib/nakrutka-podval';

/** One line of what the estimator is doing right now (owner 2026-10-16: "Claude Code'dagidek izohlab borsin"). */
export type Qadam = { matn: string; holat: 'ishda' | 'ok' | 'xato' | 'savol' };
const tinglovchilar = new Set<(q: Qadam) => void>();
export function jarayonYoz(matn: string, holat: Qadam['holat'] = 'ishda') { tinglovchilar.forEach(f => f({ matn, holat })); }
export function jarayonTingla(fn: (q: Qadam) => void): () => void { tinglovchilar.add(fn); return () => { tinglovchilar.delete(fn); }; }

type Handler = (arg: string | null, amal: AgentAmal) => Promise<string>;
const handlers = new Map<string, Handler>();
/** A studio step registers what it can do (pricing, documents, coefficients) while it is mounted. */
export function agentRegister(nom: string, fn: Handler): () => void {
  handlers.set(nom, fn);
  return () => { if (handlers.get(nom) === fn) handlers.delete(nom); };
}
/** Calls a step's handler; switches to that step first and waits for it to mount (≤ 8 s). */
export async function agentChaqir(nom: string, amal: AgentAmal, ochish: () => void): Promise<string> {
  if (!handlers.has(nom)) {
    ochish();
    for (let i = 0; i < 40 && !handlers.has(nom); i++) await new Promise(r => setTimeout(r, 200));
  }
  const h = handlers.get(nom);
  if (!h) throw new Error('AGENT_STEP_UNAVAILABLE');
  return h(amal.qiymat, amal);
}

/** Which step runs an action that is not a plain document edit. */
export const AMAL_BOSQICH: Partial<Record<AgentAmal['tur'], 'lrv' | 'narx' | 'res'>> = { narxla: 'narx', hudud: 'narx', narx: 'narx', stavka_tasdiq: 'narx', stavka: 'narx', hujjat: 'res', koef_tanla: 'lrv', koef_qolla: 'lrv', narx_tasdiq: 'narx' };

const grades = (text: string) => [...text.toUpperCase().matchAll(/(?:^|[^A-ZА-ЯЁ0-9])([ABАВМM]\s*\d+(?:[.,]\d+)?)(?=$|[^0-9])/g)]
  .map(m => m[1].replace(/\s/g, '').replace(/А/g, 'A').replace(/В/g, 'B').replace(/М/g, 'M').replace(',', '.'));
/** A material class/mark the user never stated is not written (the model must ask instead). */
export function materialManbadami(material: string, userText: string): boolean {
  const said = new Set(grades(userText));
  return grades(material).every(g => said.has(g));
}

/** Plain document edits → studio commands; null when the action needs a step handler; throws a readable reason. */
export function amalBuyruqlari(doc: EstimateDoc, a: AgentAmal, newId: () => string): StudioCommand[] | null {
  const refs = ishHavolalari(doc);
  const ish = () => {
    const r = (a.ish ?? '').replace(/[[\]\s]/g, '');
    const id = refs.get(r);
    if (!id) throw new Error(`Ish topilmadi: ${a.ish ?? '—'}`);
    return id;
  };
  const bolimId = (nom: string | null) => Object.values(doc.sections).find(s => s.name.trim().toLowerCase() === (nom ?? '').trim().toLowerCase())?.id ?? null;
  switch (a.tur) {
    case 'material': return [{ type: 'SET_MATERIAL', occurrenceId: ish(), material: a.qiymat }];
    case 'hajm': {
      const q = (a.qiymat ?? '').replace(/\s/g, '').replace(',', '.');
      if (!/^\d+(\.\d+)?$/.test(q)) throw new Error(`Hajm son emas: ${a.qiymat ?? '—'}`);
      return [{ type: 'SET_QUANTITY', occurrenceId: ish(), quantity: q }];
    }
    case 'ochir': return [{ type: 'REMOVE_OCCURRENCE', occurrenceId: ish() }];
    case 'bolim': {
      if (!a.qiymat) throw new Error('Bo‘lim nomi yo‘q');
      return bolimId(a.qiymat) ? [] : [{ type: 'ADD_SECTION', sectionId: newId(), parentId: null, name: a.qiymat }];
    }
    case 'kochir': {
      const id = ish();
      let sid = bolimId(a.qiymat);
      const out: StudioCommand[] = [];
      if (!sid) { if (!a.qiymat) throw new Error('Bo‘lim nomi yo‘q'); sid = newId(); out.push({ type: 'ADD_SECTION', sectionId: sid, parentId: null, name: a.qiymat }); }
      out.push({ type: 'MOVE_OCCURRENCE', occurrenceId: id, sectionId: sid });
      return out;
    }
    case 'bolim_tartib': {
      const sid = bolimId(a.ish);
      if (!sid) throw new Error(`Bo‘lim topilmadi: ${a.ish ?? '—'}`);
      const s = doc.sections[sid];
      const qardosh = s.parentId ? doc.sections[s.parentId].children : doc.rootOrder;
      const i = qardosh.indexOf(sid), j = a.qiymat === 'yuqori' ? i - 1 : i + 1;
      if (j < 0 || j >= qardosh.length) return [];
      return [{ type: 'MOVE_SECTION', sectionId: sid, parentId: s.parentId, index: j }];
    }
    case 'resurs_kat': {
      const kat = (a.qiymat ?? '').trim().toUpperCase();
      if (!(NAKRUTKA_KATLAR as readonly string[]).includes(kat)) throw new Error(`Kategoriya noma’lum: ${a.qiymat ?? '—'}`);
      const q = (a.ish ?? '').trim().toUpperCase();
      const out: StudioCommand[] = [];
      if (q) for (const o of Object.values(doc.occurrences)) for (const r of o.recipe) {
        const res = o.overrides[r.recipeId]?.substitution?.resource ?? r.resource;
        if (res && resursNomi(res.name, o.material).toUpperCase().includes(q)) out.push({ type: 'SET_RESOURCE_KAT', occurrenceId: o.id, recipeId: r.recipeId, kat });
      }
      if (!out.length) throw new Error(`Resurs topilmadi: ${a.ish ?? '—'}`);
      return out;
    }
    default: return null;
  }
}
