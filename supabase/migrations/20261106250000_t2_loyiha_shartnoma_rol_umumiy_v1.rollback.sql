-- Orqaga qaytarish: eski (rolsiz, actor'siz) imzolar. DIQQAT: shlyuz ham eski imzoga qaytarilishi kerak.
drop function if exists public.t2_loyiha_umumiy_v1(bigint, bigint);
drop function if exists public.t2_loyiha_yarat(bigint, bigint, text, text, text, numeric);
drop function if exists public.t2_loyiha_yangila(bigint, bigint, integer, text, text, text, numeric, text);
drop function if exists public.t2_loyiha_ochir(bigint, bigint);
drop function if exists public.t2_shartnoma_ochir(bigint, bigint, integer);
drop function if exists public._t2_tahrir_rol_ok(text, text);
create or replace function public.t2_loyiha_ochir(p_id bigint) returns jsonb language plpgsql security definer as $$
begin
  update t2_loyiha set holat = 'bekor', versiya = versiya + 1 where id = p_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'topilmadi'); end if;
  update t2_obyekt set loyiha_id = null where loyiha_id = p_id;
  return jsonb_build_object('ok', true);
end $$;
create or replace function public.t2_shartnoma_ochir(p_shartnoma_id bigint, p_kutilgan_versiya integer default null) returns jsonb language plpgsql set search_path = public, pg_temp as $$
declare v_ver int;
begin
  select versiya into v_ver from t2_shartnoma where id = p_shartnoma_id;
  if not found then return jsonb_build_object('ok', false, 'sabab', 'topilmadi'); end if;
  if p_kutilgan_versiya is not null and v_ver <> p_kutilgan_versiya then return jsonb_build_object('ok', false, 'sabab', 'versiya'); end if;
  update t2_shartnoma set holat = 'bekor', versiya = versiya + 1, yangilandi = now() where id = p_shartnoma_id;
  return jsonb_build_object('ok', true, 'shartnoma_id', p_shartnoma_id, 'holat', 'bekor');
end $$;
-- t2_loyiha_yarat/yangila eski imzolari 20261106250000 dan oldingi migratsiya tarixida (git) bor.
