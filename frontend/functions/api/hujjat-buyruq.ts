/**
 * /api/hujjat-buyruq - Jarvis uchun Hujjat maydoni vositalarining YAGONA server nuqtasi (web, Android BFF, Telegram, Windows ilova).
 *   POST { amal: 'vosita', nom, args, ovoz?: boolean }
 * Aktor sessiyadan. O'qish vositalari bevosita natija; ulashish/savat - taklif, bajarish faqat `tasdiqlayman:true` bilan va OVOZ bilan HECH QACHON.
 * fayl_yukla veb yuklash bilan bir xil yo'l (kvota/ruxsat serverda).
 */
import { hmQidirYuqori, hmRpc, hmYukla, rpcOk, rpcXato, sessiyaAktor, type HmEnv } from '../_shared/hujjat-maydoni';
import { hujjatVositaSorov } from '../_shared/hujjat-vositalar';

const javob = (r: { httpOk: boolean; body: any; raw: string }) => (rpcOk(r) ? Response.json({ ok: true, natija: r.body }) : rpcXato(r));

export const onRequestPost: PagesFunction<HmEnv> = async (ctx) => {
  try {
    const a = await sessiyaAktor(ctx);
    if (a instanceof Response) return a;
    const b = await ctx.request.json().catch(() => null) as { amal?: string; nom?: string; args?: unknown; ovoz?: boolean } | null;
    if (!b || b.amal !== 'vosita') return Response.json({ ok: false, code: 'AMAL_NOMALUM' }, { status: 400 });
    const q = hujjatVositaSorov(b.nom, b.args);
    if ('xato' in q) return Response.json({ ok: false, code: q.xato, xato: q.tafsilot }, { status: 400 });
    const id = a.actorId; const A = q.a as Record<string, any>; const komp = A.kompaniya_id as number | null;
    switch (q.vosita.nom) {
      case 'fayl_qidir': return javob(await hmQidirYuqori(ctx.env, id, komp, String(A.matn)));
      case 'fayl_royxat': return javob(await hmRpc(ctx.env, 't2_hm_royxat_v1', { p_actor: id, p_kompaniya: komp, p_papka: A.papka_id, p_savat: A.savat }));
      case 'fayl_kvota': { const r = await hmRpc(ctx.env, 't2_hm_royxat_v1', { p_actor: id, p_kompaniya: komp, p_papka: null, p_savat: true }); return rpcOk(r) ? Response.json({ ok: true, natija: r.body.kvota }) : rpcXato(r); }
      case 'fayl_faoliyat': return javob(await hmRpc(ctx.env, 't2_hm_faoliyat_v1', { p_actor: id, p_kompaniya: komp, p_fayl_id: A.fayl_id, p_limit: A.limit }));
      case 'fayl_yukla': {
        const bayt = new TextEncoder().encode(String(A.matn));
        const res = await hmYukla(ctx.env, { actorId: id, kompaniyaId: komp, papkaId: A.papka_id, faylId: null, nom: String(A.nom), mime: /\.md$/i.test(String(A.nom)) ? 'text/markdown' : 'text/plain', bayt, operationId: crypto.randomUUID() });
        return res;
      }
      case 'fayl_taqdim_nishon': return javob(await hmRpc(ctx.env, 't2_hm_taqdim_nishon_v1', { p_actor: id, p_kompaniya: komp }));
      case 'fayl_taqdim': {
        const nishon = A.fayl_id ? `Fayl #${A.fayl_id}` : `Papka #${A.papka_id}`;
        const tavsif = `${nishon} aloqa #${A.aloqa_id} tomoniga o‘zgarmas surat sifatida taqdim qilinadi (oluvchi faqat o‘qiydi; qaytarib olish mumkin).`;
        if (A.tasdiqlayman !== true) return Response.json({ ok: true, holat: 'taklif', tasdiqKerak: true, tavsif });
        if (b.ovoz === true) return Response.json({ ok: false, code: 'OVOZ_BILAN_TASDIQLANMAYDI', xato: 'Taqdimni ovoz bilan tasdiqlab bo‘lmaydi.' }, { status: 403 });
        const r = await hmRpc(ctx.env, 't2_hm_taqdim_yarat_v1', { p_actor: id, p_nishon_turi: A.fayl_id ? 'fayl' : 'papka', p_nishon_id: A.fayl_id ?? A.papka_id, p_aloqa_id: A.aloqa_id, p_izoh: A.izoh || null, p_operation_id: crypto.randomUUID() });
        return rpcOk(r) ? Response.json({ ok: true, holat: 'bajarildi', tavsif, taqdim_id: r.body.id }) : rpcXato(r);
      }      case 'fayl_ulash':
      case 'fayl_savat': {
        const ulash = q.vosita.nom === 'fayl_ulash';
        const tavsif = ulash ? `Fayl #${A.fayl_id} foydalanuvchi #${A.foydalanuvchi_id} bilan ulashiladi (${A.daraja}).` : `Fayl #${A.fayl_id} savatga olinadi (30 kun ichida tiklanadi).`;
        if (A.tasdiqlayman !== true) return Response.json({ ok: true, holat: 'taklif', tasdiqKerak: true, tavsif });
        if (b.ovoz === true) return Response.json({ ok: false, code: 'OVOZ_BILAN_TASDIQLANMAYDI', xato: 'Ulashish/o\u2018chirishni ovoz bilan tasdiqlab bo\u2018lmaydi.' }, { status: 403 });
        const r = ulash
          ? await hmRpc(ctx.env, 't2_hm_ulash_v1', { p_actor: id, p_amal: 'bering', p_nishon_turi: 'fayl', p_nishon_id: A.fayl_id, p_subyekt_turi: 'foydalanuvchi', p_subyekt_id: A.foydalanuvchi_id, p_daraja: A.daraja })
          : await hmRpc(ctx.env, 't2_hm_fayl_amal_v1', { p_actor: id, p_fayl_id: A.fayl_id, p_amal: 'savat' });
        return rpcOk(r) ? Response.json({ ok: true, holat: 'bajarildi', tavsif }) : rpcXato(r);
      }
    }
    return Response.json({ ok: false, code: 'VOSITA_NOMALUM' }, { status: 400 });
  } catch (e: any) {
    return Response.json({ ok: false, code: 'HM_XATO', xato: String(e?.message || e).slice(0, 200) }, { status: 500 });
  }
};