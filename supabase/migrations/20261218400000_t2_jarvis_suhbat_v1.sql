-- T2-JARVIS-SUHBAT-001: Jarvis suhbatlari serverda (qurilmalar orasida davom ettirish). ADDITIV: faqat yangi jadval/funksiyalar.
-- BEGIN/COMMIT yo'q. Mavjud jadval/funksiya o'zgarmaydi. Domen: ai (prefiks t2_jarvis).
--
-- HAJM BAHOSI (Supabase FREE ~467/500 MB — byudjet juda tor, shuning uchun ataylab kichik):
--   to'liq qator (so'nggi 30 kun): sarlavha <=80 B + qisqartma <=600 B + <=12 xabar x <=400 belgi (<~5 KB jsonb) = ~6 KB maksimum, odatda ~2-3 KB
--   30 kundan keyin: faqat sarlavha + qisqartma qoladi (xabarlar NULL) = ~0.7 KB
--   90 kundan keyin: qator o'chadi
--   foydalanuvchi-kompaniya boshiga <=20 suhbat (oshsa eng eskisi o'chadi) -> eng yomon holat ~120 KB/foydalanuvchi, real ~20-40 KB.
--   100 faol foydalanuvchi uchun eng yomon holat ~12 MB (real <3 MB). Tozalash LAZY: faqat shu foydalanuvchi o'qiganda/yozganda (cron yo'q).
-- MAXFIYLIK: faqat egasi o'qiydi/o'chiradi (actor + kompaniya a'zoligi t2_agent_scope_guard_v1 orqali); kompaniya almashsa ko'rinmaydi.
--   Xabarlarda pul/parol saqlamaslik mijoz qoidasi (xotira.ts bilan bir xil) — bu yerda faqat uzunlik/shakl tekshiriladi.
set local statement_timeout = '300s';

create table if not exists public.t2_jarvis_suhbat (
  id bigint generated always as identity primary key,
  kompaniya_id bigint not null references public.t2_kompaniya(id) on delete cascade,
  foydalanuvchi_id bigint not null references public.t2_foydalanuvchi(id) on delete cascade,
  klient_id text not null check (klient_id ~ '^[A-Za-z0-9_.-]{1,40}$'),
  sarlavha text not null check (length(sarlavha) between 1 and 80),
  qisqartma text check (qisqartma is null or length(qisqartma) <= 600),
  xabarlar jsonb check (xabarlar is null or (jsonb_typeof(xabarlar) = 'array' and jsonb_array_length(xabarlar) <= 12)),
  yaratildi timestamptz not null default now(),
  yangilandi timestamptz not null default now()
);
create unique index if not exists t2_jarvis_suhbat_uq on public.t2_jarvis_suhbat (foydalanuvchi_id, kompaniya_id, klient_id);
create index if not exists t2_jarvis_suhbat_yangi_idx on public.t2_jarvis_suhbat (foydalanuvchi_id, kompaniya_id, yangilandi desc);

do $rls$
declare t text;
begin
  foreach t in array array['t2_jarvis_suhbat'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
end $rls$;

-- Lazy tozalash: 30 kundan keyin xabarlar NULL (sarlavha+qisqartma qoladi); 90 kundan keyin qator o'chadi; <=20 ta.
create or replace function public._t2_jarvis_suhbat_tozala(p_actor_id bigint, p_kompaniya_id bigint)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  delete from public.t2_jarvis_suhbat where foydalanuvchi_id = p_actor_id and kompaniya_id = p_kompaniya_id and yangilandi < now() - interval '90 days';
  update public.t2_jarvis_suhbat set xabarlar = null where foydalanuvchi_id = p_actor_id and kompaniya_id = p_kompaniya_id and xabarlar is not null and yangilandi < now() - interval '30 days';
  delete from public.t2_jarvis_suhbat where id in (
    select id from public.t2_jarvis_suhbat where foydalanuvchi_id = p_actor_id and kompaniya_id = p_kompaniya_id order by yangilandi desc offset 20);
end $$;

-- Saqlash: xabarlar [{r:'user'|'ai', m:'...'}] — oxirgi 12 ta, har biri <=400 belgi; qisqartma serverda hosil bo'ladi.
create or replace function public.t2_jarvis_suhbat_saqla_v1(p_actor_id bigint, p_kompaniya_id bigint, p_klient_id text, p_sarlavha text, p_xabarlar jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare g jsonb; v_x jsonb; v_qisqa text; v_birinchi text; v_oxirgi text;
begin
  g := public.t2_agent_scope_guard_v1(p_actor_id, p_kompaniya_id);
  if not (g ->> 'ok')::boolean then return g; end if;
  if p_klient_id is null or p_klient_id !~ '^[A-Za-z0-9_.-]{1,40}$' or coalesce(length(btrim(p_sarlavha)), 0) not between 1 and 200
     or p_xabarlar is null or jsonb_typeof(p_xabarlar) <> 'array' or jsonb_array_length(p_xabarlar) > 60 then
    return jsonb_build_object('ok', false, 'code', 'SUHBAT_INVALID');
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('r', case when s.e ->> 'r' = 'user' then 'user' else 'ai' end, 'm', left(regexp_replace(coalesce(s.e ->> 'm', ''), '\s+', ' ', 'g'), 400)) order by s.n), '[]'::jsonb)
    into v_x from (select t.e, t.n from jsonb_array_elements(p_xabarlar) with ordinality as t(e, n) where length(coalesce(t.e ->> 'm', '')) > 0 order by t.n desc limit 12) s;
  if jsonb_array_length(v_x) = 0 then return jsonb_build_object('ok', false, 'code', 'SUHBAT_BOSH'); end if;
  v_birinchi := (select e ->> 'm' from jsonb_array_elements(v_x) e where e ->> 'r' = 'user' limit 1);
  v_oxirgi := (select e ->> 'm' from jsonb_array_elements(v_x) with ordinality t(e, n) where e ->> 'r' = 'ai' order by n desc limit 1);
  v_qisqa := left('Savol: ' || coalesce(v_birinchi, '') || coalesce(' | Javob: ' || v_oxirgi, ''), 600);
  insert into public.t2_jarvis_suhbat (kompaniya_id, foydalanuvchi_id, klient_id, sarlavha, qisqartma, xabarlar)
  values (p_kompaniya_id, p_actor_id, p_klient_id, left(regexp_replace(btrim(p_sarlavha), '\s+', ' ', 'g'), 80), v_qisqa, v_x)
  on conflict (foydalanuvchi_id, kompaniya_id, klient_id)
  do update set sarlavha = excluded.sarlavha, qisqartma = excluded.qisqartma, xabarlar = excluded.xabarlar, yangilandi = now();
  perform public._t2_jarvis_suhbat_tozala(p_actor_id, p_kompaniya_id);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.t2_jarvis_suhbat_royxat_v1(p_actor_id bigint, p_kompaniya_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare g jsonb;
begin
  g := public.t2_agent_scope_guard_v1(p_actor_id, p_kompaniya_id);
  if not (g ->> 'ok')::boolean then return g; end if;
  perform public._t2_jarvis_suhbat_tozala(p_actor_id, p_kompaniya_id);
  return jsonb_build_object('ok', true, 'royxat', coalesce((
    select jsonb_agg(jsonb_build_object('id', klient_id, 'sarlavha', sarlavha, 'yangilandi', yangilandi, 'toliq', xabarlar is not null) order by yangilandi desc)
    from public.t2_jarvis_suhbat where foydalanuvchi_id = p_actor_id and kompaniya_id = p_kompaniya_id), '[]'::jsonb));
end $$;

create or replace function public.t2_jarvis_suhbat_ol_v1(p_actor_id bigint, p_kompaniya_id bigint, p_klient_id text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare g jsonb; s record;
begin
  g := public.t2_agent_scope_guard_v1(p_actor_id, p_kompaniya_id);
  if not (g ->> 'ok')::boolean then return g; end if;
  perform public._t2_jarvis_suhbat_tozala(p_actor_id, p_kompaniya_id);
  select sarlavha, qisqartma, xabarlar, yangilandi into s from public.t2_jarvis_suhbat
   where foydalanuvchi_id = p_actor_id and kompaniya_id = p_kompaniya_id and klient_id = p_klient_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'TOPILMADI'); end if;
  return jsonb_build_object('ok', true, 'sarlavha', s.sarlavha, 'qisqartma', s.qisqartma, 'xabarlar', s.xabarlar, 'yangilandi', s.yangilandi);
end $$;

create or replace function public.t2_jarvis_suhbat_ochir_v1(p_actor_id bigint, p_kompaniya_id bigint, p_klient_id text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare g jsonb; n integer;
begin
  g := public.t2_agent_scope_guard_v1(p_actor_id, p_kompaniya_id);
  if not (g ->> 'ok')::boolean then return g; end if;
  delete from public.t2_jarvis_suhbat where foydalanuvchi_id = p_actor_id and kompaniya_id = p_kompaniya_id and klient_id = p_klient_id;
  get diagnostics n = row_count;
  return jsonb_build_object('ok', true, 'ochirildi', n);
end $$;

do $grants$
declare f text;
begin
  foreach f in array array[
    'public._t2_jarvis_suhbat_tozala(bigint,bigint)',
    'public.t2_jarvis_suhbat_saqla_v1(bigint,bigint,text,text,jsonb)', 'public.t2_jarvis_suhbat_royxat_v1(bigint,bigint)',
    'public.t2_jarvis_suhbat_ol_v1(bigint,bigint,text)', 'public.t2_jarvis_suhbat_ochir_v1(bigint,bigint,text)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $grants$;
