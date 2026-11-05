-- AI-NARXLASH-V2 (2026-11-05): internet narx agenti uchun oylik kesh va kompaniyaning afzal domenlari.
-- Egasi qoidasi: "har AI natija token yechadi; bir xil kontentni qayta ishga tushirish bepul" — shu oy ichida
-- (nom kaliti, birlik kaliti, hudud, oy) bo'yicha takroriy qidiruv AI chaqirmaydi. R2 vs Supabase qoidasi: internet narxi —
-- o'zgaruvchan biznes ma'lumoti (oyma-oy o'zgaradi, kompaniyaga tegishli) → Supabase. Faqat qo'shimcha: 2 jadval + 4 funksiya;
-- mavjud jadval/funksiyalar o'zgarmaydi. Smeta narxi, F2 va dalil bu migratsiyaga tegmaydi (qabul — mavjud yo'l:
-- narx_manba_yoz → smeta_narxla_res_v3 → narx_dalil_bogla).
-- Tenant: har chaqiruv t2_agent_scope_guard_v1(actor, kompaniya); jadvallar RLS yoqilgan, anon/authenticated ga yopiq;
-- funksiyalar faqat service_role (Cloudflare /api/smeta-ai serveri) uchun.

create table if not exists public.t2_narx_internet_kesh (
  kompaniya_id bigint not null references public.t2_kompaniya(id) on delete cascade,
  -- keshKalit(): t2_resurs_nom_kalit(nom) | t2_resurs_birlik_kalit(birlik) | hudud kaliti | YYYY-MM
  kalit text not null check (length(kalit) between 8 and 400 and kalit ~ '\|[0-9]{4}-[0-9]{2}$'),
  natija jsonb not null check (jsonb_typeof(natija) = 'object'),
  foydalanuvchi_id bigint references public.t2_foydalanuvchi(id) on delete set null,
  yaratildi timestamptz not null default now(),
  primary key (kompaniya_id, kalit)
);
alter table public.t2_narx_internet_kesh enable row level security;
revoke all on public.t2_narx_internet_kesh from public, anon, authenticated;

create table if not exists public.t2_narx_internet_sozlama (
  kompaniya_id bigint primary key references public.t2_kompaniya(id) on delete cascade,
  domenlar text[] not null default '{}' check (cardinality(domenlar) <= 40),
  foydalanuvchi_id bigint references public.t2_foydalanuvchi(id) on delete set null,
  yangilandi timestamptz not null default now()
);
alter table public.t2_narx_internet_sozlama enable row level security;
revoke all on public.t2_narx_internet_sozlama from public, anon, authenticated;

-- Kesh o'qish: faqat aniq kalitlar (kalitda oy bor — o'tgan oy natijasi qaytmaydi), ≤ 300.
create or replace function public.t2_narx_internet_kesh_ol_v1(p_actor_id bigint, p_kompaniya_id bigint, p_kalitlar text[])
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare g jsonb; v jsonb;
begin
  g := public.t2_agent_scope_guard_v1(p_actor_id, p_kompaniya_id);
  if not (g->>'ok')::boolean then return g; end if;
  if p_kalitlar is null or cardinality(p_kalitlar) > 300 then return jsonb_build_object('ok', false, 'code', 'KESH_INVALID'); end if;
  select coalesce(jsonb_object_agg(k.kalit, k.natija), '{}'::jsonb) into v
    from public.t2_narx_internet_kesh k
   where k.kompaniya_id = p_kompaniya_id and k.kalit = any (p_kalitlar)
     and right(k.kalit, 7) = to_char(now() at time zone 'Asia/Tashkent', 'YYYY-MM');
  return jsonb_build_object('ok', true, 'natijalar', v);
end $$;

-- Kesh yozish: ≤ 50 yozuv, joriy oy kalitlari; takror — yangilanadi.
create or replace function public.t2_narx_internet_kesh_yoz_v1(p_actor_id bigint, p_kompaniya_id bigint, p_yozuvlar jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare g jsonb; v_n int;
begin
  g := public.t2_agent_scope_guard_v1(p_actor_id, p_kompaniya_id);
  if not (g->>'ok')::boolean then return g; end if;
  if g->>'rol' = 'kuzatuvchi' then return jsonb_build_object('ok', false, 'code', 'WRITE_ROLE_REQUIRED'); end if;
  if p_yozuvlar is null or jsonb_typeof(p_yozuvlar) <> 'array' or jsonb_array_length(p_yozuvlar) > 50 then
    return jsonb_build_object('ok', false, 'code', 'KESH_INVALID');
  end if;
  insert into public.t2_narx_internet_kesh (kompaniya_id, kalit, natija, foydalanuvchi_id)
  select distinct on (x->>'kalit') p_kompaniya_id, x->>'kalit', x->'natija', p_actor_id
    from jsonb_array_elements(p_yozuvlar) x
   where length(coalesce(x->>'kalit', '')) between 8 and 400
     and right(x->>'kalit', 7) = to_char(now() at time zone 'Asia/Tashkent', 'YYYY-MM')
     and jsonb_typeof(x->'natija') = 'object' and jsonb_typeof(x->'natija'->'manbalar') = 'array'
     and length((x->'natija')::text) <= 60000
  on conflict (kompaniya_id, kalit) do update set natija = excluded.natija, foydalanuvchi_id = excluded.foydalanuvchi_id, yaratildi = now();
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', true, 'yozildi', v_n);
end $$;

create or replace function public.t2_narx_internet_domen_ol_v1(p_actor_id bigint, p_kompaniya_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare g jsonb; v text[];
begin
  g := public.t2_agent_scope_guard_v1(p_actor_id, p_kompaniya_id);
  if not (g->>'ok')::boolean then return g; end if;
  select domenlar into v from public.t2_narx_internet_sozlama where kompaniya_id = p_kompaniya_id;
  -- null → server keeps the built-in default list (UZ_DOMENLAR_SUKUT).
  return jsonb_build_object('ok', true, 'domenlar', case when v is null then null else to_jsonb(v) end);
end $$;

-- Domenlar: oddiy domen nomi (sxemasiz, yo'lsiz), ≤ 40; bo'sh ro'yxat — standart ro'yxatga qaytish.
create or replace function public.t2_narx_internet_domen_yoz_v1(p_actor_id bigint, p_kompaniya_id bigint, p_domenlar text[])
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare g jsonb;
begin
  g := public.t2_agent_scope_guard_v1(p_actor_id, p_kompaniya_id);
  if not (g->>'ok')::boolean then return g; end if;
  if g->>'rol' = 'kuzatuvchi' then return jsonb_build_object('ok', false, 'code', 'WRITE_ROLE_REQUIRED'); end if;
  if p_domenlar is null or cardinality(p_domenlar) > 40
     or exists (select 1 from unnest(p_domenlar) d where d !~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$') then
    return jsonb_build_object('ok', false, 'code', 'DOMEN_INVALID');
  end if;
  if cardinality(p_domenlar) = 0 then
    delete from public.t2_narx_internet_sozlama where kompaniya_id = p_kompaniya_id;
  else
    insert into public.t2_narx_internet_sozlama (kompaniya_id, domenlar, foydalanuvchi_id) values (p_kompaniya_id, p_domenlar, p_actor_id)
    on conflict (kompaniya_id) do update set domenlar = excluded.domenlar, foydalanuvchi_id = excluded.foydalanuvchi_id, yangilandi = now();
  end if;
  return jsonb_build_object('ok', true, 'domenlar', to_jsonb(p_domenlar));
end $$;

revoke all on function public.t2_narx_internet_kesh_ol_v1(bigint, bigint, text[]) from public, anon, authenticated;
revoke all on function public.t2_narx_internet_kesh_yoz_v1(bigint, bigint, jsonb) from public, anon, authenticated;
revoke all on function public.t2_narx_internet_domen_ol_v1(bigint, bigint) from public, anon, authenticated;
revoke all on function public.t2_narx_internet_domen_yoz_v1(bigint, bigint, text[]) from public, anon, authenticated;
grant execute on function public.t2_narx_internet_kesh_ol_v1(bigint, bigint, text[]) to service_role;
grant execute on function public.t2_narx_internet_kesh_yoz_v1(bigint, bigint, jsonb) to service_role;
grant execute on function public.t2_narx_internet_domen_ol_v1(bigint, bigint) to service_role;
grant execute on function public.t2_narx_internet_domen_yoz_v1(bigint, bigint, text[]) to service_role;
