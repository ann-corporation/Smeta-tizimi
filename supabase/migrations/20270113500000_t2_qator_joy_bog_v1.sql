-- T2-MAT-JOY-001 - razdel darajasidagi mat/ob ni O'Z ishi (BL) ostiga qo'lda biriktirish (ko'rinish/hujjat qatlami).
-- Asl smeta qatorlari (t2_qator) O'ZGARMAYDI; bu faqat tartib bog'lanishi (summaga tegmaydi). Avto qoida frontend `lib/mat-joy`,
-- bu jadval faqat foydalanuvchining QO'LDA tanlovini saqlaydi (manba = 'qol'; bl_qator_id null = «joyida qoldir»).
create table if not exists public.t2_qator_joy_bog (
  id bigint generated always as identity primary key,
  kompaniya_id bigint not null,
  obyekt_id bigint not null,
  mat_qator_id bigint not null,
  bl_qator_id bigint,
  manba text not null default 'qol' check (manba in ('avto', 'qol')),
  kim bigint,
  vaqt timestamptz not null default now(),
  unique (obyekt_id, mat_qator_id)
);
create index if not exists t2_qator_joy_bog_kompaniya_obyekt_idx on public.t2_qator_joy_bog (kompaniya_id, obyekt_id);

-- RLS: to'g'ridan-to'g'ri kirish yo'q (siyosatsiz); faqat quyidagi nomli RPC lar orqali (service_role, kompaniya + ruxsat tekshiruvi bilan).
alter table public.t2_qator_joy_bog enable row level security;
revoke all on table public.t2_qator_joy_bog from public, anon, authenticated;

create or replace function public.t2_qator_joy_ol_v1(p_kompaniya_id bigint, p_actor_id bigint, p_obyekt_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $fn$
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'f2.read');
  if not exists (select 1 from public.t2_obyekt o where o.id = p_obyekt_id and o.kompaniya_id = p_kompaniya_id) then
    return jsonb_build_object('ok', false, 'code', 'OBYEKT_NOT_FOUND');
  end if;
  return jsonb_build_object('ok', true, 'joylar', coalesce((
    select jsonb_agg(jsonb_build_object('mat_qator_id', j.mat_qator_id, 'bl_qator_id', j.bl_qator_id, 'manba', j.manba) order by j.mat_qator_id)
      from public.t2_qator_joy_bog j where j.kompaniya_id = p_kompaniya_id and j.obyekt_id = p_obyekt_id), '[]'::jsonb));
end $fn$;

-- versiya: texnik (id bo'yicha yozuvchi tekshiruvi; smeta asosi o'qilmaydi).
-- Qo'lda tanlov: p_bl_qator_id = null - joyida qoldirish; mat bilan bir razdeldagi BL bo'lmasa - BL_YAROQSIZ.
-- Idempotent (upsert). p_qaytar = true - qo'lda tanlov o'chiriladi (avto qoidaga qaytadi).
create or replace function public.t2_qator_joy_qoy_v1(p_kompaniya_id bigint, p_actor_id bigint, p_obyekt_id bigint, p_mat_qator_id bigint, p_bl_qator_id bigint, p_qaytar boolean default false)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $fn$
declare m record; b record;
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'f2.prepare');
  if not exists (select 1 from public.t2_obyekt o where o.id = p_obyekt_id and o.kompaniya_id = p_kompaniya_id) then
    return jsonb_build_object('ok', false, 'code', 'OBYEKT_NOT_FOUND');
  end if;
  select q.id, q.ota_id, q.tur into m from public.t2_qator q where q.id = p_mat_qator_id and q.obyekt_id = p_obyekt_id;
  if m.id is null or m.tur not in ('mat', 'ob') then return jsonb_build_object('ok', false, 'code', 'MAT_NOT_FOUND'); end if;
  if coalesce(p_qaytar, false) then
    delete from public.t2_qator_joy_bog where obyekt_id = p_obyekt_id and mat_qator_id = p_mat_qator_id and kompaniya_id = p_kompaniya_id;
    return jsonb_build_object('ok', true, 'qaytarildi', true);
  end if;
  if p_bl_qator_id is not null then
    select q.id, q.ota_id, q.tur into b from public.t2_qator q where q.id = p_bl_qator_id and q.obyekt_id = p_obyekt_id;
    if b.id is null or b.tur <> 'bl' or b.ota_id is distinct from m.ota_id then return jsonb_build_object('ok', false, 'code', 'BL_YAROQSIZ'); end if;
  end if;
  insert into public.t2_qator_joy_bog (kompaniya_id, obyekt_id, mat_qator_id, bl_qator_id, manba, kim)
  values (p_kompaniya_id, p_obyekt_id, p_mat_qator_id, p_bl_qator_id, 'qol', p_actor_id)
  on conflict (obyekt_id, mat_qator_id) do update set bl_qator_id = excluded.bl_qator_id, manba = 'qol', kim = excluded.kim, vaqt = now()
  where public.t2_qator_joy_bog.kompaniya_id = p_kompaniya_id;
  return jsonb_build_object('ok', true);
end $fn$;

revoke all on function public.t2_qator_joy_ol_v1(bigint, bigint, bigint) from public, anon, authenticated;
revoke all on function public.t2_qator_joy_qoy_v1(bigint, bigint, bigint, bigint, bigint, boolean) from public, anon, authenticated;
grant execute on function public.t2_qator_joy_ol_v1(bigint, bigint, bigint) to service_role;
grant execute on function public.t2_qator_joy_qoy_v1(bigint, bigint, bigint, bigint, bigint, boolean) to service_role;
comment on function public.t2_qator_joy_qoy_v1(bigint, bigint, bigint, bigint, bigint, boolean) is 'versiya: texnik - id bo''yicha yozuvchi tekshiruvi, smeta asosi hisoblanmaydi';
comment on function public.t2_qator_joy_ol_v1(bigint, bigint, bigint) is 'versiya: texnik - faqat joy bog''lanishlari jadvalini o''qiydi';
