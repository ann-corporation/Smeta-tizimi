-- Rollback: T5 obyekt ulashish. Mavjud ulash aloqalari va grantlari saqlanadi (o'chirilmaydi), faqat yangi RPC lar
-- olib tashlanadi va kod_qabul asl holatiga qaytadi.
drop function if exists public.t2_obyekt_ulash_v1(bigint, bigint, bigint, text[], text, text);
drop function if exists public.t2_obyekt_ulashlar_v1(bigint, bigint, bigint);

create or replace function public.t2_tomon_kod_qabul_v1(p_actor_id bigint, p_kompaniya_id bigint, p_kod_xesh text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare a public.t2_tomon_aloqa; v_xato integer;
begin
  perform public._t2_tomon_azo(p_actor_id, p_kompaniya_id, 'boshqarish');
  select count(*) into v_xato from public.t2_tomon_hodisa where actor_id = p_actor_id and tur = 'kod_xato' and vaqt > now() - interval '1 hour';
  if v_xato >= 10 then return jsonb_build_object('ok', false, 'code', 'KOP_XATO', 'error', 'Juda ko''p noto''g''ri urinish — bir soatdan keyin qayta urining'); end if;
  select * into a from public.t2_tomon_aloqa
   where kod_xesh = p_kod_xesh and holat = 'taklif' and qabul_kompaniya_id is null and kod_muddati > now() for update;
  if not found or a.taklif_kompaniya_id = p_kompaniya_id then
    perform public._t2_tomon_hodisa_yoz(null, null, p_kompaniya_id, p_actor_id, 'kod_xato', null);
    return jsonb_build_object('ok', false, 'code', 'KOD_NOTOGRI', 'error', 'Kod noto''g''ri yoki muddati o''tgan');
  end if;
  update public.t2_tomon_aloqa
     set qabul_kompaniya_id = p_kompaniya_id, holat = 'faol', javob_actor_id = p_actor_id, javob_vaqti = now(), kod_xesh = null, kod_muddati = null, versiya = versiya + 1, yangilandi = now()
   where id = a.id;
  perform public._t2_tomon_hodisa_yoz(a.id, null, p_kompaniya_id, p_actor_id, 'qabul', 'Taklif kodi orqali qabul qilindi');
  return jsonb_build_object('ok', true, 'id', a.id, 'holat', 'faol');
end $$;
revoke all on function public.t2_tomon_kod_qabul_v1(bigint, bigint, text) from public, anon, authenticated;
grant execute on function public.t2_tomon_kod_qabul_v1(bigint, bigint, text) to service_role;

-- Ustun saqlanadi agar unda ma'lumot bo'lsa; bo'sh bo'lsa olib tashlanadi.
do $$ begin
  if not exists (select 1 from public.t2_tomon_aloqa where kutilgan_grantlar is not null) then
    alter table public.t2_tomon_aloqa drop column if exists kutilgan_grantlar;
  end if;
end $$;
