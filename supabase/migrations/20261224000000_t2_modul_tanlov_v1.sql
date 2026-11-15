-- T2-MODUL-TANLOV-V1 (2026-11-15, «Telegram modeli», egasi): foydalanuvchi o'zi tanlagan ilovalar (pin) va tartib.
-- ISHLATILMAGAN (apply YO'Q) — egasi tasdig'ini kutadi. Veb, Android, Windows va Telegram bot BIR XIL endpointdan (/api/modullarim) foydalanadi.
-- Bu faqat KO'RINISH tanlovi: ruxsat/ilova yoqilganligi (t2_modul_holat_v1 + t2_men_v1 permissions) o'zgarmaydi; xavfsizlik chegarasi emas.
-- Foydalanuvchi + kompaniya bo'yicha bitta qator; versiya bilan optimistik yozish; faqat service_role.
begin;

create table if not exists public.t2_foydalanuvchi_modul_tanlov (
  foydalanuvchi_id bigint not null references public.t2_foydalanuvchi(id) on delete cascade,
  kompaniya_id bigint not null references public.t2_kompaniya(id) on delete cascade,
  tanlangan text[] not null default '{}',
  tartib text[] not null default '{}',
  versiya integer not null default 1,
  yangilandi timestamptz not null default now(),
  primary key (foydalanuvchi_id, kompaniya_id),
  constraint t2_modul_tanlov_hajm check (coalesce(array_length(tanlangan,1),0) <= 40 and coalesce(array_length(tartib,1),0) <= 40)
);
alter table public.t2_foydalanuvchi_modul_tanlov enable row level security;
revoke all on public.t2_foydalanuvchi_modul_tanlov from public, anon, authenticated;

create or replace function public.t2_modul_tanlov_oqi_v1(p_actor_id bigint, p_kompaniya_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare r public.t2_foydalanuvchi_modul_tanlov;
begin
  if p_actor_id is null or p_actor_id <= 0 then return jsonb_build_object('ok',false,'code','AUTH_REQUIRED'); end if;
  if p_kompaniya_id is null or not exists (select 1 from public.t2_azolik a where a.foydalanuvchi_id = p_actor_id and a.kompaniya_id = p_kompaniya_id and a.holat = 'faol') then
    return jsonb_build_object('ok',false,'code','AZO_EMAS');
  end if;
  select * into r from public.t2_foydalanuvchi_modul_tanlov where foydalanuvchi_id = p_actor_id and kompaniya_id = p_kompaniya_id;
  if not found then return jsonb_build_object('ok',true,'tanlangan','[]'::jsonb,'tartib','[]'::jsonb,'versiya',0); end if;
  return jsonb_build_object('ok',true,'tanlangan',to_jsonb(r.tanlangan),'tartib',to_jsonb(r.tartib),'versiya',r.versiya);
end $$;

create or replace function public.t2_modul_tanlov_yoz_v1(p_actor_id bigint, p_kompaniya_id bigint, p_tanlangan text[], p_tartib text[], p_expected_version integer)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_old integer; v_t text[]; v_o text[];
begin
  if p_actor_id is null or p_actor_id <= 0 then return jsonb_build_object('ok',false,'code','AUTH_REQUIRED'); end if;
  if p_kompaniya_id is null or not exists (select 1 from public.t2_azolik a where a.foydalanuvchi_id = p_actor_id and a.kompaniya_id = p_kompaniya_id and a.holat = 'faol') then
    return jsonb_build_object('ok',false,'code','AZO_EMAS');
  end if;
  -- kodlar: kichik lotin/raqam/nuqta/pastki chiziq, 2..40 belgi, takrorsiz
  select coalesce(array_agg(distinct x), '{}') into v_t from unnest(coalesce(p_tanlangan,'{}')) x where x ~ '^[a-z0-9_.]{2,40}$';
  select coalesce(array_agg(x order by ord), '{}') into v_o from (select distinct on (x) x, ord from unnest(coalesce(p_tartib,'{}')) with ordinality as u(x, ord) where x ~ '^[a-z0-9_.]{2,40}$' order by x, ord) q;
  select versiya into v_old from public.t2_foydalanuvchi_modul_tanlov where foydalanuvchi_id = p_actor_id and kompaniya_id = p_kompaniya_id for update;
  if not found then
    if coalesce(p_expected_version,0) <> 0 then return jsonb_build_object('ok',false,'code','STALE_VERSION'); end if;
    insert into public.t2_foydalanuvchi_modul_tanlov(foydalanuvchi_id,kompaniya_id,tanlangan,tartib) values (p_actor_id,p_kompaniya_id,v_t,v_o);
    return jsonb_build_object('ok',true,'versiya',1);
  end if;
  if coalesce(p_expected_version,-1) <> v_old then return jsonb_build_object('ok',false,'code','STALE_VERSION','versiya',v_old); end if;
  update public.t2_foydalanuvchi_modul_tanlov set tanlangan = v_t, tartib = v_o, versiya = v_old + 1, yangilandi = now()
   where foydalanuvchi_id = p_actor_id and kompaniya_id = p_kompaniya_id;
  return jsonb_build_object('ok',true,'versiya',v_old + 1);
end $$;

revoke all on function public.t2_modul_tanlov_oqi_v1(bigint,bigint) from public, anon, authenticated;
revoke all on function public.t2_modul_tanlov_yoz_v1(bigint,bigint,text[],text[],integer) from public, anon, authenticated;
grant execute on function public.t2_modul_tanlov_oqi_v1(bigint,bigint) to service_role;
grant execute on function public.t2_modul_tanlov_yoz_v1(bigint,bigint,text[],text[],integer) to service_role;

commit;

