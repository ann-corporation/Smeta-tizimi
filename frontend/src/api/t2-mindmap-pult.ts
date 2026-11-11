/**
 * Mindmap pulti yozuvchisi: `lib/mindmap-pult` `PultYozuvchi` interfeysining haqiqiy bajaruvchisi.
 * Hech qanday yangi buyruq yo‘q — faqat mavjud, ruxsat/audit/versiya tekshiruvi serverda bo‘lgan yo‘llar:
 * `sbMindmapTugunYarat` (loyiha_yarat / shartnoma_saqla), `sbT2ObyektYarat` (obyekt_yarat), `sbMindmapBog(Ochir)`
 * (mindmap_bog / mindmap_bog_ochir), `sbLoyihaYangila`, `sbObyektTahrirlash` (obyekt_yangila).
 */
import type { PultNatija, PultYozuvchi } from '../lib/mindmap-pult';
import { sbMindmapBog, sbMindmapBogOchir, sbMindmapTugunYarat } from './t2-mindmap';
import { sbLoyihaYangila } from './t2-loyiha';
import { obyektImzochiSaqla } from './obyekt-imzochi';
import { sbObyektTahrirlash, sbOqi, sbT2ObyektYarat } from './supabase';

type Xom = { ok?: boolean; error?: string; xato?: string; entity_id?: number; obyekt_id?: number; versiya?: number; version?: number };

const natija = (r: Xom | null | undefined, id?: number): PultNatija => ({
  ok: !!r?.ok, error: r?.error || r?.xato, id, versiya: r?.versiya ?? r?.version,
});

export function pultYozuvchi(kompaniyaId: number): PultYozuvchi {
  return {
    async loyihaYarat(nom, hudud) {
      const r = (await sbMindmapTugunYarat('loyiha', kompaniyaId, { nom, hudud })) as Xom;
      return natija(r, r.entity_id);
    },
    async obyektYarat(loyihaId, nom) {
      const r = (await sbT2ObyektYarat({ kompaniyaId, loyihaId, nom })) as Xom;
      return natija(r, r.obyekt_id);
    },
    async shartnomaYarat(raqam, taraf) {
      const r = (await sbMindmapTugunYarat('shartnoma', kompaniyaId, { nom: raqam, taraf })) as Xom;
      return natija(r, r.entity_id);
    },
    async bog(tur, manbaId, maqsadId, kutilganVersiya, rol) {
      return natija((await sbMindmapBog(kompaniyaId, tur, manbaId, maqsadId, kutilganVersiya, rol)) as Xom);
    },
    async bogOchir(tur, manbaId, maqsadId, kutilganVersiya, rol) {
      return natija((await sbMindmapBogOchir(kompaniyaId, tur, manbaId, maqsadId, kutilganVersiya, rol)) as Xom);
    },
    async loyihaNomla(id, kutilganVersiya, nom) {
      return natija((await sbLoyihaYangila(id, kutilganVersiya, { nom })) as Xom);
    },
    async imzochiSaqla(obyektId, rol, m) {
      const r = (await obyektImzochiSaqla(kompaniyaId, obyektId, rol as never, 'obyekt', null, m)) as { ok?: boolean; error?: string; xato?: string };
      return { ok: !!r?.ok, error: r?.error || r?.xato };
    },
    async obyektNomla(id, nom) {
      return natija((await sbObyektTahrirlash(id, nom, '')) as Xom);
    },
  };
}

export type ObyektBolimi = { id: number; kod: string | null; nom: string };

/** Obyektning smeta bo‘limlari (faol versiya, rz darajasi) — obyekt ochilganda LAZY o‘qiladi, summasiz. */
export async function obyektBolimlariOl(obyektId: number): Promise<{ ok: true; bolimlar: ObyektBolimi[] } | { ok: false; error: string }> {
  const r = await sbOqi<{ id: number; kod: string | null; nom: string | null }>({
    jadval: 't2_daraxt', filtr: 'obyekt_id=eq.' + obyektId + '&tur=eq.rz', ustunlar: 'id,kod,nom', tartib: 'tartib.asc,id.asc', limit: 300,
  });
  if (!r.ok) return { ok: false, error: r.error || 'Bo‘limlar o‘qilmadi' };
  return { ok: true, bolimlar: (r.qatorlar ?? []).map((q) => ({ id: q.id, kod: q.kod ?? null, nom: (q.nom ?? '').trim() || '—' })) };
}