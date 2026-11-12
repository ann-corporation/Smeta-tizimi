-- Rollback: 20261217210000_t2_kompaniya_ozi_och_v1 — faqat RPC olib tashlanadi. O'zi ochilgan kompaniyalar, a'zoliklar, obuna va
-- onboarding_command_log yozuvlari QOLADI (ma'lumotga tegilmaydi).
-- t2_ish_joyi_yarat_v1 — avvalgi (prod, 20261111460000) tanasi: doim SOROV_ORQALI.
create or replace function public.t2_ish_joyi_yarat_v1(p_actor_id bigint, p_nom text, p_turi text, p_operation_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $f$
begin
  return jsonb_build_object('ok', false, 'code', 'SOROV_ORQALI',
    'xabar', 'Kompaniya faqat so''rov orqali ochiladi: STIR bilan so''rov yuboring, platforma administratori tasdiqlaydi. Mavjud kompaniyaga qo''shilish — taklif havolasi orqali.');
end $f$;
drop function if exists public.t2_kompaniya_ozi_och_v1(bigint, text, text, text, uuid);
notify pgrst, 'reload schema';
