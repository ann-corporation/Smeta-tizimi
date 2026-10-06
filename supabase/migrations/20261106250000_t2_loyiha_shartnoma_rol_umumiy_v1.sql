-- Loyiha/shartnoma tahriri: server tomonda ROL asosida (avval t2_loyiha_* da rol tekshiruvi umuman yo'q edi)
-- + kompaniyada loyiha bo'lmasa avtomatik «Umumiy» loyiha (dalil/hujjat yuklash uchun).
-- Rol xaritasi — bitta joyda: yangi mansab = shu funksiyada bitta qator.
set local statement_timeout = '60s';

create or replace function public._t2_tahrir_rol_ok(p_rol text, p_ob text)
returns boolean language sql immutable set search_path = public, pg_temp as $$
  select case p_ob
    when 'loyiha'          then p_rol in ('admin','superadmin','boss','director','pto','prorab')
    when 'loyiha_ochir'    then p_rol in ('admin','superadmin','boss','director')
    when 'shartnoma_ochir' then p_rol in ('admin','superadmin','boss','director','pto','bugalter')
    else false end
$$;

drop function if exists public.t2_loyiha_yarat(bigint, text, text, text, numeric);
drop function if exists public.t2_loyiha_yangila(bigint, integer, text, text, text, numeric, text);
drop function if exists public.t2_loyiha_ochir(bigint);
drop function if exists public.t2_shartnoma_ochir(bigint, integer);

create or replace function public.t2_loyiha_yarat(p_actor_id bigint, p_kompaniya_id bigint, p_nom text,
  p_izoh text default null, p_hudud text default null, p_byudjet numeric default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id bigint; v_rol text;
begin
  v_rol := public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  if not public._t2_tahrir_rol_ok(v_rol, 'loyiha') then return jsonb_build_object('ok', false, 'code', 'WRITE_ROLE_REQUIRED', 'xabar', 'Loyiha yaratish uchun rolingiz yetarli emas'); end if;
  if not exists (select 1 from t2_kompaniya where id = p_kompaniya_id and faol) then return jsonb_build_object('ok', false, 'xabar', 'Kompaniya topilmadi yoki faol emas'); end if;
  if coalesce(btrim(p_nom), '') = '' then return jsonb_build_object('ok', false, 'xabar', 'Loyiha nomi bo''sh bo''lishi mumkin emas'); end if;
  insert into t2_loyiha (kompaniya_id, nom, izoh, hudud, byudjet, holat) values (p_kompaniya_id, btrim(p_nom), p_izoh, p_hudud, p_byudjet, 'faol') returning id into v_id;
  perform public.t2_audit_yoz(p_kompaniya_id, 'loyiha_yarat', 'loyiha', null, format('loyiha=%s', v_id), 'actor:' || p_actor_id, null);
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

create or replace function public.t2_loyiha_yangila(p_actor_id bigint, p_id bigint, p_kutilgan_versiya integer, p_nom text default null,
  p_izoh text default null, p_hudud text default null, p_byudjet numeric default null, p_holat text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_joriy integer; v_komp bigint; v_rol text;
begin
  select versiya, kompaniya_id into v_joriy, v_komp from t2_loyiha where id = p_id for update;
  if not found then return jsonb_build_object('ok', false, 'xabar', 'Loyiha topilmadi'); end if;
  v_rol := public.t2_actor_kompaniya_azo_tekshir(v_komp, p_actor_id);
  if not public._t2_tahrir_rol_ok(v_rol, 'loyiha') then return jsonb_build_object('ok', false, 'code', 'WRITE_ROLE_REQUIRED', 'xabar', 'Loyihani tahrirlash uchun rolingiz yetarli emas'); end if;
  if v_joriy <> p_kutilgan_versiya then
    return jsonb_build_object('ok', false, 'xabar', 'Versiya mos emas (' || v_joriy || ' != ' || p_kutilgan_versiya || ') — boshqa birov allaqachon o''zgartirgan, sahifani yangilang');
  end if;
  if p_holat is not null and p_holat not in ('faol','tuxtatilgan','yakunlangan','bekor') then return jsonb_build_object('ok', false, 'xabar', 'holat noto''g''ri'); end if;
  if p_holat = 'bekor' and not public._t2_tahrir_rol_ok(v_rol, 'loyiha_ochir') then return jsonb_build_object('ok', false, 'code', 'WRITE_ROLE_REQUIRED', 'xabar', 'Loyihani bekor qilish uchun rolingiz yetarli emas'); end if;
  update t2_loyiha set nom = coalesce(nullif(btrim(p_nom), ''), nom), izoh = coalesce(p_izoh, izoh), hudud = coalesce(p_hudud, hudud),
    byudjet = coalesce(p_byudjet, byudjet), holat = coalesce(p_holat, holat), versiya = versiya + 1 where id = p_id;
  perform public.t2_audit_yoz(v_komp, 'loyiha_tahrir', 'loyiha', null, format('loyiha=%s', p_id), 'actor:' || p_actor_id, null);
  return jsonb_build_object('ok', true, 'versiya', v_joriy + 1);
end $$;

create or replace function public.t2_loyiha_ochir(p_actor_id bigint, p_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_komp bigint; v_rol text;
begin
  select kompaniya_id into v_komp from t2_loyiha where id = p_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'topilmadi'); end if;
  v_rol := public.t2_actor_kompaniya_azo_tekshir(v_komp, p_actor_id);
  if not public._t2_tahrir_rol_ok(v_rol, 'loyiha_ochir') then return jsonb_build_object('ok', false, 'code', 'WRITE_ROLE_REQUIRED', 'xabar', 'Loyihani bekor qilish uchun rolingiz yetarli emas'); end if;
  update t2_loyiha set holat = 'bekor', versiya = versiya + 1 where id = p_id;
  update t2_obyekt set loyiha_id = null where loyiha_id = p_id;
  perform public.t2_audit_yoz(v_komp, 'loyiha_bekor', 'loyiha', null, format('loyiha=%s', p_id), 'actor:' || p_actor_id, null);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.t2_shartnoma_ochir(p_actor_id bigint, p_shartnoma_id bigint, p_kutilgan_versiya integer default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_ver int; v_komp bigint; v_rol text;
begin
  select versiya, kompaniya_id into v_ver, v_komp from t2_shartnoma where id = p_shartnoma_id for update;
  if not found then return jsonb_build_object('ok', false, 'sabab', 'topilmadi', 'xabar', 'Shartnoma topilmadi'); end if;
  v_rol := public.t2_actor_kompaniya_azo_tekshir(v_komp, p_actor_id);
  if not public._t2_tahrir_rol_ok(v_rol, 'shartnoma_ochir') then return jsonb_build_object('ok', false, 'code', 'WRITE_ROLE_REQUIRED', 'xabar', 'Shartnomani bekor qilish uchun rolingiz yetarli emas'); end if;
  if p_kutilgan_versiya is not null and v_ver <> p_kutilgan_versiya then return jsonb_build_object('ok', false, 'sabab', 'versiya', 'xabar', 'Orada o''zgargan'); end if;
  update t2_shartnoma set holat = 'bekor', versiya = versiya + 1, yangilandi = now() where id = p_shartnoma_id;
  perform public.t2_audit_yoz(v_komp, 'shartnoma_bekor', 'shartnoma', null, format('shartnoma=%s', p_shartnoma_id), 'actor:' || p_actor_id, null);
  return jsonb_build_object('ok', true, 'shartnoma_id', p_shartnoma_id, 'holat', 'bekor');
end $$;

-- Avtomatik «Umumiy» loyiha: kompaniyaning istalgan faol a'zosi; idempotent (bor bo'lsa — o'shani qaytaradi).
create or replace function public.t2_loyiha_umumiy_v1(p_actor_id bigint, p_kompaniya_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id bigint; v_yangi boolean := false;
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform pg_advisory_xact_lock(hashtextextended('t2_loyiha_umumiy:' || p_kompaniya_id, 0));
  select id into v_id from t2_loyiha where kompaniya_id = p_kompaniya_id and holat <> 'bekor' order by (nom = 'Umumiy') desc, id limit 1;
  if v_id is null then
    insert into t2_loyiha (kompaniya_id, nom, izoh, holat) values (p_kompaniya_id, 'Umumiy', 'Avtomatik yaratilgan umumiy loyiha', 'faol') returning id into v_id;
    v_yangi := true;
    perform public.t2_audit_yoz(p_kompaniya_id, 'loyiha_umumiy_avto', 'loyiha', null, format('loyiha=%s', v_id), 'actor:' || p_actor_id, null);
  end if;
  return jsonb_build_object('ok', true, 'id', v_id, 'yangi', v_yangi);
end $$;

revoke all on function public._t2_tahrir_rol_ok(text, text) from public, anon, authenticated;
revoke all on function public.t2_loyiha_yarat(bigint, bigint, text, text, text, numeric) from public, anon, authenticated;
revoke all on function public.t2_loyiha_yangila(bigint, bigint, integer, text, text, text, numeric, text) from public, anon, authenticated;
revoke all on function public.t2_loyiha_ochir(bigint, bigint) from public, anon, authenticated;
revoke all on function public.t2_shartnoma_ochir(bigint, bigint, integer) from public, anon, authenticated;
revoke all on function public.t2_loyiha_umumiy_v1(bigint, bigint) from public, anon, authenticated;
grant execute on function public._t2_tahrir_rol_ok(text, text), public.t2_loyiha_yarat(bigint, bigint, text, text, text, numeric),
  public.t2_loyiha_yangila(bigint, bigint, integer, text, text, text, numeric, text), public.t2_loyiha_ochir(bigint, bigint),
  public.t2_shartnoma_ochir(bigint, bigint, integer), public.t2_loyiha_umumiy_v1(bigint, bigint) to service_role;
