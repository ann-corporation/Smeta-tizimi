-- 20261216610000 - LOYIHA <-> SMETA: varaq -> smeta bo'limi xaritasi (belgisi smetada topilmagan varaqlar uchun).
-- PTO tasdiqlagan taklif yoki qo'lda bog'lash eslab qolinadi: shu obyektda varaq belgisi shu bo'lim (rz/bl) nomidagi belgi kabi ishlaydi.
-- Asl smeta o'zgarmaydi (t2_qator faqat havola bilan). Pul hisoblanmaydi. Additiv; ~0.1 KB/qator. Rollback/acceptance - yonidagi fayllar.

create table if not exists public.t2_loyiha_varaq_xarita (
  id bigint generated always as identity primary key,
  kompaniya_id bigint not null references public.t2_kompaniya(id),
  obyekt_id bigint not null references public.t2_obyekt(id),
  varaq text not null check (length(btrim(varaq)) between 1 and 40),
  bolim_qator_id bigint not null references public.t2_qator(id),
  manba text not null default 'qolda' check (manba in ('qolda', 'taklif')),
  sabab text check (sabab is null or length(sabab) <= 300),
  actor_id bigint not null,
  yaratildi timestamptz not null default now(),
  unique (obyekt_id, varaq, bolim_qator_id)
);
create index if not exists t2_loyiha_varaq_xarita_obyekt_idx on public.t2_loyiha_varaq_xarita (kompaniya_id, obyekt_id);
alter table public.t2_loyiha_varaq_xarita enable row level security;
revoke all on table public.t2_loyiha_varaq_xarita from anon, authenticated;

create or replace function public._t2_lm_xarita_yoz_ich(p_kompaniya_id bigint, p_obyekt_id bigint, p_varaq text, p_bolim_qator_id bigint, p_manba text, p_sabab text, p_amal text, p_actor_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not exists (select 1 from public.t2_obyekt where id = p_obyekt_id and kompaniya_id = p_kompaniya_id) then
    return jsonb_build_object('ok', false, 'code', 'OBYEKT', 'error', 'Obyekt sizning kompaniyangizniki emas');
  end if;
  if length(btrim(coalesce(p_varaq, ''))) < 1 then return jsonb_build_object('ok', false, 'code', 'VARAQ', 'error', 'Varaq belgisi kerak'); end if;
  if p_amal = 'ochir' then
    delete from public.t2_loyiha_varaq_xarita where kompaniya_id = p_kompaniya_id and obyekt_id = p_obyekt_id and upper(varaq) = upper(btrim(p_varaq)) and bolim_qator_id = p_bolim_qator_id;
    return jsonb_build_object('ok', true);
  end if;
  if p_manba not in ('qolda', 'taklif') then return jsonb_build_object('ok', false, 'code', 'MANBA', 'error', 'Manba noto''g''ri'); end if;
  if not exists (select 1 from public.t2_qator q where q.id = p_bolim_qator_id and q.kompaniya_id = p_kompaniya_id and q.obyekt_id = p_obyekt_id
                  and q.versiya_holat = 'faol' and q.tur in ('rz', 'bl')) then
    return jsonb_build_object('ok', false, 'code', 'BOLIM', 'error', 'Bo''lim shu obyektning joriy smetasiga tegishli emas');
  end if;
  insert into public.t2_loyiha_varaq_xarita (kompaniya_id, obyekt_id, varaq, bolim_qator_id, manba, sabab, actor_id)
  values (p_kompaniya_id, p_obyekt_id, btrim(p_varaq), p_bolim_qator_id, p_manba, left(p_sabab, 300), p_actor_id)
  on conflict (obyekt_id, varaq, bolim_qator_id) do update set manba = excluded.manba, sabab = excluded.sabab, actor_id = excluded.actor_id;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public._t2_lm_xarita_royxat_ich(p_kompaniya_id bigint, p_obyekt_id bigint)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('ok', true, 'xarita', coalesce(jsonb_agg(jsonb_build_object('varaq', x.varaq, 'bolim_qator_id', x.bolim_qator_id, 'manba', x.manba) order by x.varaq, x.id), '[]'::jsonb))
  from public.t2_loyiha_varaq_xarita x where x.kompaniya_id = p_kompaniya_id and x.obyekt_id = p_obyekt_id
$$;

create or replace function public.t2_loyiha_xarita_yoz_v1(p_actor_id bigint, p_kompaniya_id bigint, p_obyekt_id bigint, p_varaq text, p_bolim_qator_id bigint, p_manba text, p_sabab text, p_amal text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'smeta.write');
  return public._t2_lm_xarita_yoz_ich(p_kompaniya_id, p_obyekt_id, p_varaq, p_bolim_qator_id, p_manba, p_sabab, p_amal, p_actor_id);
end $$;
create or replace function public.t2_loyiha_xarita_v1(p_actor_id bigint, p_kompaniya_id bigint, p_obyekt_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'smeta.read');
  return public._t2_lm_xarita_royxat_ich(p_kompaniya_id, p_obyekt_id);
end $$;

do $g$
declare f text;
begin
  foreach f in array array['_t2_lm_xarita_yoz_ich(bigint,bigint,text,bigint,text,text,text,bigint)', '_t2_lm_xarita_royxat_ich(bigint,bigint)',
    't2_loyiha_xarita_yoz_v1(bigint,bigint,bigint,text,bigint,text,text,text)', 't2_loyiha_xarita_v1(bigint,bigint,bigint)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $g$;

comment on function public._t2_lm_xarita_yoz_ich(bigint,bigint,text,bigint,text,text,text,bigint) is 'versiya: versiya - bo''lim faqat joriy (faol) smeta qatori bo''lishi tekshiriladi; t2_qator o''zgarmaydi.';
comment on function public.t2_loyiha_xarita_yoz_v1(bigint,bigint,bigint,text,bigint,text,text,text) is 'versiya: versiya - bo''lim faqat joriy (faol) smeta qatoriga bog''lanadi.';
