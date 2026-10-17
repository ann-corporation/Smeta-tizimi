import { tekshir, kalitBormi } from '../_shared/auth';
import { roleAuthority } from '../_shared/role-authority';

/**
 * Joriy sessiya haqida ma'lumot — sayt kim bo'lib kirganini BILISHI uchun.
 * Bulmasa foydalanuvchi admin panelida turib «Раҳбар режимида ёзиш мумкин эмас»
 * xatosini oladi va sababini tushunmaydi.
 */
export const onRequestGet: PagesFunction<{ SESSIYA_KALIT: string; SUPABASE_URL: string; SUPABASE_KEY: string }> = async (ctx) => {
  const secret = ctx.env.SESSIYA_KALIT;
  let sess = await tekshir(ctx.request.headers.get('Cookie'), secret);
  if (!sess) return Response.json({ ok: false }, { status: 401 });
  sess = await roleAuthority(sess, ctx.env);
  if (!sess) return Response.json({ ok: false, code: 'AUTHORITY_UNAVAILABLE' }, { status: 503 });

  /* gas.ts dagi bilan BIR XIL ro'yxat bo'lishi shart — aks holda UI bir narsa
   * ko'rsatib, server boshqacha qaror qiladi. */
  const yozaOladi = sess.rol !== 'rahbar'; // Affordance only; tenant command uses fresh DB authority.

  return Response.json({
    ok: true,
    rol: sess.rol,
    platform_role: sess.rol === 'superadmin' ? 'superadmin' : 'none',
    email: sess.email || '',
    yozaOladi,
    tugaydi: sess.exp,
    /* ⚠️ Ochiq xavf ko'rsatkichi. `true` bo'lsa sessiyalar repozitoriyda
       yozilgan zaxira kalit bilan imzolanyapti — uni bilgan har kim
       admin bo'lib kira oladi. Bu ataylab qoldirilgan vaqtinchalik
       holat; ko'zdan yo'qolmasligi uchun shu yerda ochiq turadi. */
    zaxira_kalit: !kalitBormi(secret),
    /* ⚡ 2026-08-27: "Auth Session -> User -> Tenant" poydevori — sess
     * endi (yangi kirishlardan keyin) foydalanuvchi a'zo bo'lgan
     * kompaniyalarni biladi. Eski sessiyalarda bu `undefined` (frontend
     * buni "hammasi ko'rinadi, hali eski sessiya" deb talqin qilishi
     * mumkin — UI o'zgarishi hozircha qilinmadi, faqat ma'lumot
     * uzatiladi). */
    foydalanuvchi_id: sess.foydalanuvchi_id,
    kompaniyalar: sess.kompaniyalar,
  });
};
