/** Vositalarning haqiqiy bog'lanishi: MAVJUD klient/shlyuz funksiyalari (aktor serverda sessiyadan; operation_id bilan). */
import { sbT2AktBekor, sbT2AktReestrOl, sbT2AktTasdiqlash, yangiOperationId } from '../../../api/supabase';
import { t2AktLifecycleTransition } from '../../../api/t2-akt-lifecycle';
import { sbT2ShartnomalarOl } from '../../../api/t2-shartnoma';
import { sbT2TolovYoz } from '../../../api/t2-buxgalteriya';
import { pulXarajatKirit } from '../../../api/t2-pul-tahlil';
import { solishtiruvOl } from '../../../api/t2-solishtiruv';
import { aloqalarOl, murojaatlarOl, murojaatTurlariOl, murojaatYarat, resurslarOl, taqdimYubor, taqdimlarOl, tolovXabarlariOl, bugunOl } from '../../../api/t2-tomon';
import { smetaXotiraYoz, smetaXotirasi } from '../../../api/smeta-ai';
import { friksiyaYoz } from '../../osuvchi/friksiya';
import type { VositaApi } from './tur';

const holat = (r: { ok: boolean; error?: string }) => ({ ok: r.ok, error: r.error });
const xom = <T,>(r: { ok: true; natija: T } | { ok: false }): T | null => (r.ok ? r.natija : null);

export function haqiqiyVositaApi(k: number): VositaApi {
  return {
    bugun: async () => {
      const [b, m, t, x] = await Promise.all([bugunOl(k), murojaatlarOl(k, { yonalish: 'menga', holat: 'ochiq' }), taqdimlarOl(k, { yonalish: 'kelgan' }), tolovXabarlariOl(k, { yonalish: 'menga', holat: 'xabar' })]);
      const q: Array<{ nom: string; soni: number; yol?: string }> = [];
      const kechikkan = b.ok ? b.natija.kutayotgan.murojaat_kechikkan : 0;
      if (m.ok) q.push({ nom: 'Menga ochiq murojaatlar', soni: m.natija.length, yol: '/admin/murojaatlar' });
      if (kechikkan) q.push({ nom: 'Muddati o‘tgan murojaatlar', soni: kechikkan, yol: '/admin/murojaatlar' });
      if (t.ok) q.push({ nom: 'Menga kelgan taqdimlar (ko‘rib chiqilmagan)', soni: t.natija.filter((x2) => x2.holat === 'yuborilgan' || x2.holat === 'ko_rilmoqda').length, yol: '/admin/hamkorlar' });
      if (x.ok) q.push({ nom: 'Tasdiqlanishi kutilayotgan to‘lov xabarlari', soni: x.natija.length });
      return q;
    },
    solishtiruv: async (obyektId) => {
      const r = await solishtiruvOl({ kompaniyaId: k, obyektId });
      return r.ok ? { ok: true as const, hisob: r.natija.hisob, royxat: r.natija.royxat.filter((x) => x.holat === 'ochiq').map((x) => ({ nom: x.nom, tavsif: x.tavsif, jiddiylik: x.jiddiylik, obyekt_nom: x.obyekt_nom, havola: x.havola })) } : { ok: false as const, error: r.error };
    },
    aktlar: async (obyektId) => {
      const r = await sbT2AktReestrOl(obyektId, 'f2');
      return r.ok ? (r.qatorlar ?? []).map((a) => ({ id: a.id, raqam: a.raqam, oy: a.oy, holat: a.holat, versiya: a.versiya, lifecycle_status: a.lifecycle_status })) : null;
    },
    aktTasdiqla: async (id, versiya, op) => holat(await sbT2AktTasdiqlash(id, versiya, op)),
    aktBekorQoralama: async (id, sabab, versiya) => holat(await sbT2AktBekor(id, sabab, versiya)),
    aktBekorLifecycle: async (id, versiya, sabab, op) => holat(await t2AktLifecycleTransition({ kompaniyaId: k, aktId: id, toStatus: 'cancelled', expectedVersion: versiya, reason: sabab, operationId: op })),
    shartnomalar: async () => { const r = await sbT2ShartnomalarOl(k, true); return r.ok ? (r.qatorlar ?? []).map((s) => ({ id: s.id, raqam: s.raqam, nom: s.nom })) : null; },
    tolovYoz: async (p) => holat(await sbT2TolovYoz({ shartnomaId: p.shartnomaId, summa: p.summa, tur: p.tur, sana: p.sana, obyektId: p.obyektId, izoh: p.izoh, operationId: p.operationId })),
    xarajatYoz: async (p) => holat(await pulXarajatKirit({ kompaniyaId: k, obyektId: p.obyektId, sana: p.sana, kat: p.kat, summa: String(p.summa), izoh: p.izoh, operationId: p.operationId })),
    aloqalar: async () => { const r = xom(await aloqalarOl(k)); return r ? r.map((a) => ({ id: a.id, nom: a.qarshi_nom, rol: a.qarshi_rol, faol: a.holat === 'faol' })) : null; },
    murojaatTurlari: async () => xom(await murojaatTurlariOl(k)),
    murojaatYarat: async (p) => { const r = await murojaatYarat(k, { aloqaId: p.aloqaId, turi: p.turi, sarlavha: p.sarlavha, matn: p.matn, obyektId: p.obyektId }); return { ok: r.ok, error: r.ok ? undefined : r.error }; },
    taqdimResurslari: async () => { const r = xom(await resurslarOl(k)); return r ? r.filter((x) => x.taqdim_mumkin).map((x) => ({ kalit: x.kalit, nom: x.nom })) : null; },
    taqdimYubor: async (p) => { const r = await taqdimYubor(k, p.aloqaId, p.resurs, p.manbaId); return { ok: r.ok, error: r.ok ? undefined : r.error }; },
    xotiraOl: async () => { try { const x = await smetaXotirasi(k); return x.yozuvlar.map((y) => ({ daraja: y.daraja, kalit: y.kalit, mazmun: y.mazmun })); } catch { return null; } },
    xotiraYoz: async (daraja, kalit, mazmun) => { try { const ok = await smetaXotiraYoz(k, mazmun, daraja, kalit); return { ok, error: ok ? undefined : 'Xotira yozilmadi (ruxsat yoki limit)' }; } catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'Xato' }; } },
    friksiya: (niyat) => friksiyaYoz('jarvis', 'qila_olmadi', 'nol_qidiruv', niyat),
  };
}

export const vositaOperationId = yangiOperationId;
