-- Rollback: T2-IMZO-BIRLASHGAN-PAROL-V1 - t2_imzo_kalit_yarat_v1 ni 20261218000000 dagi asl tanaga qaytaradi.
begin;

create or replace function public.t2_imzo_kalit_yarat_v1(p_actor_id bigint, p_qurilma text, p_ochiq_kalit text, p_parol text, p_yangi_kirish boolean)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_u public.t2_foydalanuvchi%rowtype; v_id uuid; v_n int;
begin
  if p_actor_id is null then return jsonb_build_object('ok', false, 'code', 'ACTOR_NOT_FOUND'); end if;
  select * into v_u from public.t2_foydalanuvchi where id = p_actor_id and holat = 'faol' for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'ACTOR_NOT_FOUND'); end if;
  if v_u.parol_hash is not null then
    if coalesce(p_parol, '') = '' or v_u.parol_hash <> extensions.crypt(p_parol, v_u.parol_hash) then
      return jsonb_build_object('ok', false, 'code', 'PAROL_XATO');
    end if;
  elsif p_yangi_kirish is not true then
    return jsonb_build_object('ok', false, 'code', 'QAYTA_KIRISH_KERAK');
  end if;
  if length(btrim(coalesce(p_qurilma, ''))) not between 1 and 80 then return jsonb_build_object('ok', false, 'code', 'QURILMA_NOTOGRI'); end if;
  if p_ochiq_kalit is null or p_ochiq_kalit !~ '^[A-Za-z0-9_-]{87}$' then return jsonb_build_object('ok', false, 'code', 'KALIT_NOTOGRI'); end if;
  select count(*) into v_n from public.t2_imzo_kalit where foydalanuvchi_id = p_actor_id and bekor_vaqt is null;
  if v_n >= 5 then return jsonb_build_object('ok', false, 'code', 'KALIT_LIMIT'); end if;
  begin
    insert into public.t2_imzo_kalit (foydalanuvchi_id, qurilma, ochiq_kalit) values (p_actor_id, btrim(p_qurilma), p_ochiq_kalit) returning id into v_id;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'KALIT_BAND');
  end;
  perform public._t2_profil_audit(p_actor_id, 'imzo_kalit_yaratildi', 'kalit=' || v_id::text || '; qurilma=' || btrim(p_qurilma));
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

revoke all on function public.t2_imzo_kalit_yarat_v1(bigint, text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.t2_imzo_kalit_yarat_v1(bigint, text, text, text, boolean) to service_role;
comment on function public.t2_imzo_kalit_yarat_v1(bigint, text, text, text, boolean) is null;

commit;
