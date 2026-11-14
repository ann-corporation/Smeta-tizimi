/** Vositalarning haqiqiy bog'lanishi: MAVJUD klient/shlyuz funksiyalari (aktor serverda sessiyadan; operation_id bilan). */
import { sbT2AktBekor, sbT2AktReestrOl, sbT2AktTasdiqlash, sbT2AktYaratV2, yangiOperationId } from '../../../api/supabase';
import { t2AktLifecycleTransition } from '../../../api/t2-akt-lifecycle';
import { sbT2ShartnomalarOl } from '../../../api/t2-shartnoma';
import { sbT2TolovYoz } from '../../../api/t2-buxgalteriya';
import { pulXarajatKirit } from '../../../api/t2-pul-tahlil';
import { solishtiruvOl } from '../../../api/t2-solishtiruv';
import { aloqalarOl, murojaatlarOl, murojaatTurlariOl, murojaatYarat, resurslarOl, taqdimYubor, taqdimlarOl, tolovXabarlariOl, bugunOl } from '../../../api/t2-tomon';
import { smetaXotiraYoz, smetaXotirasi } from '../../../api/smeta-ai';
import { friksiyaYoz } from '../../osuvchi/friksiya';
import { rahbarPanelOl } from '../../../api/t2-rahbar-panel';
import { aiIshchiOl, aiIshchiYoz } from '../../../api/ai-ishchi';
import { moslashQutisiOl } from '../../../api/t2-moslash';
import { tokenBilan } from '../../../api/t2-token';
import { sbT2QoshimchaIshYarat, sbT2ZamenaIshYarat } from '../../../api/t2-additional-replacement';
import { abcXato } from '../../../api/t2-ish-abc';
import { daraxtVaHolatOl, ustamaManbaOl } from '../../oylik-hujjat/ostatka-slichitelniy';
import { slichitelniyModeli } from '../../slichitelniy-vedomost';
import { slichitelniyTsiklYuki } from '../../slichitelniy-tsikl';
import { yaxlitQatorIdlari } from '../../svod-yaxlit';
import type { SummaPaket } from '../../summa-paket';
import type { VositaApi } from './tur';

const holat = (r: { ok: boolean; error?: string }) => ({ ok: r.ok, error: r.error });

/** Slichitelniy yuki — sahifa (SlichitelniyTsikl) bilan bir xil manba va hisob. */
async function tsiklYuki(k: number, obyektId: number) {
  const m = await daraxtVaHolatOl(obyektId);
  if (!m.ok) return null;
  const u = await ustamaManbaOl(k, obyektId);
  if (!u.ok) return null;
  const svod = u.ustama.svodYaxlit ?? null;
  const model = slichitelniyModeli(m.rows, m.states, { svodYaxlit: svod });
  return { yuk: slichitelniyTsiklYuki(model, yaxlitQatorIdlari(m.rows, svod)) };
}
const xom = <T,>(r: { ok: true; natija: T } | { ok: false }): T | null => (r.ok ? r.natija : null);

export function haqiqiyVositaApi(k: number): VositaApi {
  return {
    bugun: async () => {
      const [b, m, t, x, ms] = await Promise.all([bugunOl(k), murojaatlarOl(k, { yonalish: 'menga', holat: 'ochiq' }), taqdimlarOl(k, { yonalish: 'kelgan' }), tolovXabarlariOl(k, { yonalish: 'menga', holat: 'xabar' }), moslashQutisiOl(k)]);
      const q: Array<{ nom: string; soni: number; yol?: string }> = [];
      if (ms && !ms.hisoblanmagan) q.push({ nom: 'Moslash qutisi (tizim topgan tafovutlar)', soni: ms.jami, yol: '/admin/solishtiruv' });
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
    slichitelniy: async (obyektId) => {
      /* #413 RPC main'ga tushgach ishlaydi; gateway uni bilmasa/RPC yo'q bo'lsa — null (halol «tez orada»). */
      try {
        const r = await fetch('/api/sb', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ soro: 't2_aosr_slichitelniy_v1', kompaniya_id: k, obyekt_id: obyektId }) });
        const j = await r.json() as { ok?: boolean; natija?: { ok?: boolean; xulosa?: string; matn?: string } };
        const m = j.natija?.xulosa ?? j.natija?.matn;
        return r.ok && j.ok !== false && j.natija?.ok !== false && m ? { matn: String(m).slice(0, 4000) } : null;
      } catch { return null; }
    },
    xotiraOl: async () => { try { const x = await smetaXotirasi(k); return x.yozuvlar.map((y) => ({ daraja: y.daraja, kalit: y.kalit, mazmun: y.mazmun })); } catch { return null; } },
    xotiraYoz: async (daraja, kalit, mazmun) => { try { const ok = await smetaXotiraYoz(k, mazmun, daraja, kalit); return { ok, error: ok ? undefined : 'Xotira yozilmadi (ruxsat yoki limit)' }; } catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'Xato' }; } },
    friksiya: (niyat) => friksiyaYoz('jarvis', 'qila_olmadi', 'nol_qidiruv', niyat),
    obyektHolat: async (obyektId) => {
      const r = await rahbarPanelOl({ kompaniyaId: k, obyektId });
      const o = r.ok ? r.natija.obyektlar.find((x) => x.obyekt_id === obyektId) : null;
      if (!o) return null;
      const u = (p: SummaPaket | null) => (p ? { qqs_bilan: p.qqs_bilan, ustamali: p.ustamali, ustamasiz: p.ustamasiz, narxsiz_soni: p.narxsiz_soni } : null);
      return { nom: o.nom, shartnoma: o.shartnoma ? { raqam: o.shartnoma.raqam, qqs_bilan: o.shartnoma.qqs_bilan, umumiy: o.shartnoma.umumiy } : null,
        smeta: u(o.smeta), fakt: u(o.fakt), f2: u(o.f2), f2Qoralama: { qqs_bilan: o.f2_qoralama.qqs_bilan, soni: o.f2_qoralama.soni }, f3: o.f3,
        tolangan: o.tolangan, qarz: o.qarz, bajarilish: o.bajarilish, signal: { soni: o.signal.soni, kritik: o.signal.kritik },
        diqqat: r.ok ? r.natija.diqqat.filter((d) => d.obyekt_id === obyektId).map((d) => ({ kod: String(d.kod), soni: d.soni })) : [] };
    },
    f2TasdiqgaYubor: async (aktId, versiya, op) => holat(await t2AktLifecycleTransition({ kompaniyaId: k, aktId, toStatus: 'submitted', expectedVersion: versiya, operationId: op })),
    ishchilar: async () => {
      const r = await aiIshchiOl('ishchilar', k);
      return r.ok ? r.data.royxat.map((x) => ({ kod: x.kod, nom: x.nom, doira: x.doira, yoqilgan: x.yoqilgan, jadval: x.jadval, yangiNatija: x.yangi_natija, oxirgiHolat: x.oxirgi?.holat ?? null, oxirgiVaqt: x.oxirgi?.yaratildi ?? null })) : null;
    },
    ishchiNatijalari: async () => {
      const r = await aiIshchiOl('inbox', k);
      return r.ok ? r.data.royxat.map((x) => ({ ishchi: x.ishchi_kod, sarlavha: x.sarlavha, xulosa: x.xulosa, holat: x.holat, yaratildi: x.yaratildi })) : null;
    },
    ishchiTopshir: async (kod, op) => {
      const r = await aiIshchiYoz({ amal: 'ishga_tushir', kompaniya_id: k, ishchi: kod, operation_id: op });
      return r.ok ? { ok: true } : { ok: false, error: r.error };
    },
    moslash: () => moslashQutisiOl(k),
    slichitelniyHisob: async (obyektId) => { const y = await tsiklYuki(k, obyektId); return y ? { doplata: { soni: y.yuk.doplata.length, jami: y.yuk.doplataJami }, snyatie: { soni: y.yuk.snyatie.length, jami: y.yuk.snyatieJami }, sigmadi: y.yuk.sigmadi.soni, nomalum: y.yuk.nomalum } : null; },
    slichitelniyYarat: async (p) => {
      const y = await tsiklYuki(k, p.obyektId);
      if (!y) return { ok: false, error: 'Slichitelniy hisoblanmadi' };
      const qatorlar = p.tur === 'doplata' ? y.yuk.doplata : y.yuk.snyatie;
      if (!qatorlar.length) return { ok: false, error: 'Qoralamaga yoziladigan qator yo‘q' };
      const aktRaqam = `${p.raqam}-${p.tur === 'doplata' ? 'Д' : 'К'}`;
      const birlik = qatorlar.length * 3;
      /* Sahifa (SlichitelniyTsikl) bilan AYNAN bir yo'l: token mexanizmi + t2_akt_yarat_v2 (F-2 qoralama). Tasdiqlanmaydi. */
      const r = await tokenBilan({ kompaniyaId: k, amal: 'f2_qoralama', birlikSoni: birlik, meta: { obyekt: p.obyektId, qator: qatorlar.length, yacheyka: birlik, manba: 'slichitelniy_tsikl', tur: p.tur } }, async () => {
        const res = await sbT2AktYaratV2({ obyektId: p.obyektId, oy: `${p.oy}-01`, operationId: p.operationId, raqam: aktRaqam, qatorlar });
        if (!res.ok) throw new Error(res.error || res.xabar || 'F2 qoralama yaratilmadi.');
        return res;
      }).catch((e: unknown) => ({ ok: false as const, xabar: e instanceof Error ? e.message : 'Javob olinmadi' }));
      return r.ok ? { ok: true } : { ok: false, error: r.xabar };
    },
    qatorTop: async (obyektId, matn) => {
      const m = await daraxtVaHolatOl(obyektId);
      if (!m.ok) return null;
      const t = matn.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((x) => x.length >= 2);
      if (!t.length) return [];
      return m.rows.filter((q) => { const h = `${q.kod ?? ''} ${q.nom ?? ''}`.toLowerCase(); return t.every((x) => h.includes(x)); }).slice(0, 6)
        .map((q) => ({ id: q.id, kod: q.kod, nom: q.nom ?? '', birlik: q.birlik, tur: q.tur, otaId: q.ota_id, versiya: q.versiya }));
    },
    zamenaSaqla: async (p) => {
      const baza = { kompaniyaId: k, obyektId: p.obyektId, operationId: p.operationId, expectedVersion: p.qator.versiya, sabab: p.sabab, otaQatorId: p.qator.otaId ?? p.qator.id, nom: p.nom, birlik: p.birlik, hajm: p.hajm, keyinQatorId: p.qator.id };
      const r = p.rejim === 'zamena' ? await sbT2ZamenaIshYarat({ ...baza, almashtirilayotganQatorId: p.qator.id }) : await sbT2QoshimchaIshYarat(baza);
      return { ok: r.ok, error: r.ok ? undefined : abcXato(r as never) };
    },
  };
}

export const vositaOperationId = yangiOperationId;
