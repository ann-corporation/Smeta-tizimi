-- AI smetachi xotirasi uch darajada va tizim tajribasi (egasi 2026-10-16: "AI xotirasi kompaniya, foydalanuvchi va butun
-- tizim darajasida bo'lsin; tizim foydalanuvchilar ishidan o'rganib borsin — qancha ko'p ishlatilsa, shuncha ko'p smetachi
-- kuchini olsin"). Faqat qo'shimcha: yangi ustun, yangi jadval, yangi funksiyalar. Mavjud t2_agent_xotira yozuvlari
-- (kompaniya darajasi) o'zgarmaydi.

-- 1) Foydalanuvchi darajasi: foydalanuvchi_id bo'lsa — faqat shu odam; kompaniya_id null va foydalanuvchi_id null — butun tizim.
alter table public.t2_agent_xotira add column if not exists foydalanuvchi_id bigint references public.t2_foydalanuvchi(id) on delete cascade;
drop index if exists public.t2_agent_xotira_uq;
create unique index t2_agent_xotira_uq on public.t2_agent_xotira
  (coalesce(kompaniya_id, 0::bigint), coalesce(foydalanuvchi_id, 0::bigint), coalesce(profil_kod, ''::text), kalit);

-- 2) Smetachi tanlovlari: qaysi ish tavsifiga qaysi norma qo'yildi (AI taklifi qabul qilindi yoki odam o'zi tanladi).
create table if not exists public.t2_smeta_tanlov_tajriba (
  id bigint generated always as identity primary key,
  kompaniya_id bigint not null references public.t2_kompaniya(id) on delete cascade,
  foydalanuvchi_id bigint references public.t2_foydalanuvchi(id) on delete set null,
  norma_kod text not null check (length(norma_kod) between 2 and 80),
  tavsif text check (tavsif is null or length(tavsif) <= 400),
  birlik text check (birlik is null or length(birlik) <= 40),
  koef text check (koef is null or length(koef) <= 200),
  manba text not null check (manba in ('ai', 'qolda')),
  yaratildi timestamptz not null default now()
);
create index if not exists t2_smeta_tanlov_tajriba_kod on public.t2_smeta_tanlov_tajriba (norma_kod);
alter table public.t2_smeta_tanlov_tajriba enable row level security;
revoke all on public.t2_smeta_tanlov_tajriba from public, anon, authenticated;

-- Norma kodi kaliti: kirill/lotin harflari bir xil, prefiks (Е310 = С310 — transport to'plami ikki yozuvda uchraydi).
create or replace function public.t2_norma_kalit(p text) returns text language sql immutable as $$
  select case when b ~ '^E31[01]-' then 'C' || substr(b, 2) else b end
  from (select substring(translate(upper(coalesce(p, '')), 'ЕСАОРХКТМН', 'ECAOPXKTMH') from '^[A-Z]+[0-9]+(?:-[0-9]+)+') b) z
$$;
-- Smeta ish qatorlari (≈20 ming) bo'yicha tez qidiruv: tajriba so'rovi har norma tanlovida chaqiriladi.
create index if not exists t2_qator_norma_kalit on public.t2_qator (public.t2_norma_kalit(kod)) where tur = 'bl';

-- 3) Uch darajali xotirani o'qish (smeta.* kalitlari).
create or replace function public.t2_smeta_xotira_v1(p_actor_id bigint, p_kompaniya_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare g jsonb;
begin
  g := public.t2_agent_scope_guard_v1(p_actor_id, p_kompaniya_id);
  if not (g->>'ok')::boolean then return g; end if;
  return jsonb_build_object('ok', true,
    'tizim', coalesce((select jsonb_agg(jsonb_build_object('kalit', kalit, 'mazmun', mazmun, 'yangilandi', yangilandi) order by yangilandi desc)
      from (select * from t2_agent_xotira where kompaniya_id is null and foydalanuvchi_id is null and kalit like 'smeta.%' order by yangilandi desc limit 60) z), '[]'),
    'kompaniya', coalesce((select jsonb_agg(jsonb_build_object('kalit', kalit, 'mazmun', mazmun, 'yangilandi', yangilandi) order by yangilandi desc)
      from (select * from t2_agent_xotira where kompaniya_id = p_kompaniya_id and foydalanuvchi_id is null and kalit like 'smeta.%' order by yangilandi desc limit 60) z), '[]'),
    'foydalanuvchi', coalesce((select jsonb_agg(jsonb_build_object('kalit', kalit, 'mazmun', mazmun, 'yangilandi', yangilandi) order by yangilandi desc)
      from (select * from t2_agent_xotira where kompaniya_id = p_kompaniya_id and foydalanuvchi_id = p_actor_id and kalit like 'smeta.%' order by yangilandi desc limit 60) z), '[]'),
    'superadmin', public.t2_platforma_superadmin(p_actor_id));
end $$;

-- 4) Yozish/o'chirish: foydalanuvchi — har qanday a'zo o'zi uchun; kompaniya — yozish huquqi bor a'zo; tizim — faqat superadmin.
-- mazmun '-' — yozuvni o'chirish.
create or replace function public.t2_smeta_xotira_yoz_v1(p_actor_id bigint, p_kompaniya_id bigint, p_daraja text, p_kalit text, p_mazmun text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare g jsonb; v_k bigint; v_f bigint; v_n int;
begin
  g := public.t2_agent_scope_guard_v1(p_actor_id, p_kompaniya_id);
  if not (g->>'ok')::boolean then return g; end if;
  if p_daraja not in ('foydalanuvchi', 'kompaniya', 'tizim') then return jsonb_build_object('ok', false, 'code', 'DARAJA_INVALID'); end if;
  if p_kalit is null or p_kalit !~ '^smeta\.[a-z0-9_.-]{1,74}$' or coalesce(length(p_mazmun), 0) not between 1 and 1500 then
    return jsonb_build_object('ok', false, 'code', 'XOTIRA_INVALID'); end if;
  if p_daraja = 'tizim' and not public.t2_platforma_superadmin(p_actor_id) then return jsonb_build_object('ok', false, 'code', 'SUPERADMIN_REQUIRED'); end if;
  if p_daraja = 'kompaniya' and g->>'rol' = 'kuzatuvchi' then return jsonb_build_object('ok', false, 'code', 'WRITE_ROLE_REQUIRED'); end if;
  v_k := case when p_daraja = 'tizim' then null else p_kompaniya_id end;
  v_f := case when p_daraja = 'foydalanuvchi' then p_actor_id else null end;
  if p_mazmun = '-' then
    delete from t2_agent_xotira where kompaniya_id is not distinct from v_k and foydalanuvchi_id is not distinct from v_f and profil_kod is null and kalit = p_kalit;
    return jsonb_build_object('ok', true, 'ochirildi', true);
  end if;
  perform pg_advisory_xact_lock(hashtextextended('t2_smeta_xotira:' || coalesce(v_k, 0) || ':' || coalesce(v_f, 0), 0));
  select count(*) into v_n from t2_agent_xotira where kompaniya_id is not distinct from v_k and foydalanuvchi_id is not distinct from v_f;
  if v_n >= 200 and not exists (select 1 from t2_agent_xotira where kompaniya_id is not distinct from v_k and foydalanuvchi_id is not distinct from v_f and profil_kod is null and kalit = p_kalit) then
    return jsonb_build_object('ok', false, 'code', 'XOTIRA_TO_LA');
  end if;
  insert into t2_agent_xotira (kompaniya_id, foydalanuvchi_id, profil_kod, kalit, mazmun, manba)
  values (v_k, v_f, null, p_kalit, p_mazmun, 'actor:' || p_actor_id)
  on conflict (coalesce(kompaniya_id, 0::bigint), coalesce(foydalanuvchi_id, 0::bigint), coalesce(profil_kod, ''::text), kalit)
  do update set mazmun = excluded.mazmun, manba = excluded.manba, versiya = t2_agent_xotira.versiya + 1, yangilandi = now();
  return jsonb_build_object('ok', true);
end $$;

-- 5) Tanlovni yozish (Studio ishlarni smetaga qo'shganda), ≤ 60 tagacha bir martada.
create or replace function public.t2_smeta_tajriba_yoz_v1(p_actor_id bigint, p_kompaniya_id bigint, p_tanlovlar jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare g jsonb; v_n int;
begin
  g := public.t2_agent_scope_guard_v1(p_actor_id, p_kompaniya_id);
  if not (g->>'ok')::boolean then return g; end if;
  if g->>'rol' = 'kuzatuvchi' then return jsonb_build_object('ok', false, 'code', 'WRITE_ROLE_REQUIRED'); end if;
  if jsonb_typeof(p_tanlovlar) <> 'array' or jsonb_array_length(p_tanlovlar) > 60 then return jsonb_build_object('ok', false, 'code', 'TAJRIBA_INVALID'); end if;
  insert into t2_smeta_tanlov_tajriba (kompaniya_id, foydalanuvchi_id, norma_kod, tavsif, birlik, koef, manba)
  select p_kompaniya_id, p_actor_id, left(x->>'kod', 80), left(x->>'tavsif', 400), left(x->>'birlik', 40), left(x->>'koef', 200),
         case when x->>'manba' = 'qolda' then 'qolda' else 'ai' end
    from jsonb_array_elements(p_tanlovlar) x
   where length(coalesce(x->>'kod', '')) between 2 and 80;
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', true, 'yozildi', v_n);
end $$;

-- 6) Tizim tajribasi: berilgan normalar barcha kompaniyalarning smetalarida va Studio tanlovlarida necha marta qo'llangan,
-- qaysi koeffitsientlar bilan. Faqat norma kodi, soni va koeffitsient matni — narx, kompaniya nomi, obyekt nomi chiqmaydi.
create or replace function public.t2_norma_tajriba_v1(p_actor_id bigint, p_kompaniya_id bigint, p_kodlar text[])
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare g jsonb; v jsonb;
begin
  g := public.t2_agent_scope_guard_v1(p_actor_id, p_kompaniya_id);
  if not (g->>'ok')::boolean then return g; end if;
  if p_kodlar is null or cardinality(p_kodlar) = 0 or cardinality(p_kodlar) > 200 then return jsonb_build_object('ok', true, 'normalar', '{}'::jsonb); end if;
  with so as (select distinct public.t2_norma_kalit(k) kalit from unnest(p_kodlar) k where public.t2_norma_kalit(k) is not null),
  q as (
    select public.t2_norma_kalit(q.kod) kalit, q.obyekt_id, q.kompaniya_id, q.kod || ' ' || coalesce(q.nom, '') matn
      from t2_qator q where q.tur = 'bl' and q.kod is not null and public.t2_norma_kalit(q.kod) in (select kalit from so)
  ), s as (
    select public.t2_norma_kalit(t.norma_kod) kalit, t.kompaniya_id, t.koef matn
      from t2_smeta_tanlov_tajriba t where public.t2_norma_kalit(t.norma_kod) in (select kalit from so)
  ), k as (
    select kalit, (regexp_matches(matn, '(К[А-Яа-яЭэA-Za-z]{0,3}\s*=\s*[0-9]+[,.][0-9]+)', 'g'))[1] koef from q
    union all select kalit, (regexp_matches(coalesce(matn, ''), '(К[А-Яа-яЭэA-Za-z]{0,3}\s*=\s*[0-9]+[,.][0-9]+)', 'g'))[1] from s
  ), kt as (
    select kalit, jsonb_agg(jsonb_build_object('koef', koef, 'soni', n) order by n desc) koeflar
      from (select kalit, regexp_replace(koef, '\s+', '', 'g') koef, count(*) n from k group by 1, 2 order by n desc) z group by kalit
  )
  select coalesce(jsonb_object_agg(so.kalit, jsonb_build_object(
      'smeta_soni', (select count(*) from q where q.kalit = so.kalit),
      'obyekt_soni', (select count(distinct obyekt_id) from q where q.kalit = so.kalit),
      'kompaniya_soni', (select count(distinct x.kompaniya_id) from (select kompaniya_id from q where q.kalit = so.kalit union select kompaniya_id from s where s.kalit = so.kalit) x),
      'studio_soni', (select count(*) from s where s.kalit = so.kalit),
      'koeflar', coalesce((select jsonb_path_query_array(kt.koeflar, '$[0 to 2]') from kt where kt.kalit = so.kalit), '[]'::jsonb)
    )) filter (where exists (select 1 from q where q.kalit = so.kalit) or exists (select 1 from s where s.kalit = so.kalit)), '{}'::jsonb)
    into v from so;
  return jsonb_build_object('ok', true, 'normalar', v);
end $$;

revoke all on function public.t2_smeta_xotira_v1(bigint, bigint) from public, anon, authenticated;
revoke all on function public.t2_smeta_xotira_yoz_v1(bigint, bigint, text, text, text) from public, anon, authenticated;
revoke all on function public.t2_smeta_tajriba_yoz_v1(bigint, bigint, jsonb) from public, anon, authenticated;
revoke all on function public.t2_norma_tajriba_v1(bigint, bigint, text[]) from public, anon, authenticated;
grant execute on function public.t2_smeta_xotira_v1(bigint, bigint) to service_role;
grant execute on function public.t2_smeta_xotira_yoz_v1(bigint, bigint, text, text, text) to service_role;
grant execute on function public.t2_smeta_tajriba_yoz_v1(bigint, bigint, jsonb) to service_role;
grant execute on function public.t2_norma_tajriba_v1(bigint, bigint, text[]) to service_role;

-- 7) Mavjud agent xotirasi funksiyalari yangi indeksga moslanadi; boshqa foydalanuvchining shaxsiy xotirasi agent muhitiga
-- tushmaydi (foydalanuvchi_id is null — faqat kompaniya/tizim yozuvlari).
create or replace function public.t2_agent_muhit_v1(p_actor_id bigint, p_kompaniya_id bigint, p_profil text DEFAULT NULL::text)
 returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare g jsonb; v_q jsonb; v_x jsonb; v_m jsonb; v_model text; v_manba text;
begin
  g := public.t2_agent_scope_guard_v1(p_actor_id, p_kompaniya_id);
  if not (g->>'ok')::boolean then return g; end if;
  if p_profil is not null and not exists (select 1 from t2_agent_profile where kod = p_profil) then return jsonb_build_object('ok', false, 'code', 'PROFIL_YOQ'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('doira', doira, 'kod', kod, 'matn', matn, 'versiya', versiya) order by case doira when 'yadro' then 0 when 'global' then 1 else 2 end, kod), '[]')
    into v_q from t2_agent_qoida
   where holat = 'faol' and (profil_kod is null or profil_kod = p_profil)
     and (doira in ('yadro','global') or (doira = 'company' and kompaniya_id = p_kompaniya_id));
  select coalesce(jsonb_agg(jsonb_build_object('kalit', kalit, 'mazmun', mazmun, 'yangilandi', yangilandi) order by yangilandi desc), '[]')
    into v_x from (select * from t2_agent_xotira
      where (profil_kod is null or profil_kod = p_profil) and kompaniya_id is not distinct from p_kompaniya_id and foydalanuvchi_id is null
      order by yangilandi desc limit 50) z;
  select coalesce(jsonb_agg(jsonb_build_object('domen', domen, 'nom', nom) order by domen), '[]') into v_m from t2_agent_manba where faol;
  if p_profil is not null then
    select f.model_id into v_model from t2_agent_foydalanuvchi_model f
      join t2_agent_model_katalog k on k.id = f.model_id and k.faol
     where f.actor_id = p_actor_id and f.profil_kod = p_profil
       and (p_kompaniya_id is null or coalesce((select s.model_erkin from t2_agent_kompaniya_sozlama s where s.kompaniya_id = p_kompaniya_id), true));
    if v_model is not null then v_manba := 'foydalanuvchi';
    else
      select t.model_id, case when t.kompaniya_id is null then 'platforma' else 'kompaniya' end into v_model, v_manba
        from t2_agent_model_tanlov t join t2_agent_model_katalog k on k.id = t.model_id and k.faol
       where t.profil_kod = p_profil and (t.kompaniya_id = p_kompaniya_id or t.kompaniya_id is null)
       order by (t.kompaniya_id is null) limit 1;
    end if;
  end if;
  return jsonb_build_object('ok', true, 'scope', g->>'scope', 'rol', g->>'rol', 'qoidalar', v_q, 'xotira', v_x, 'manbalar', v_m, 'model', v_model, 'model_manba', v_manba);
end $function$;

create or replace function public.t2_agent_xotira_yoz_v1(p_actor_id bigint, p_kompaniya_id bigint, p_profil text, p_kalit text, p_mazmun text)
 returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare g jsonb; v_n int;
begin
  g := public.t2_agent_scope_guard_v1(p_actor_id, p_kompaniya_id);
  if not (g->>'ok')::boolean then return g; end if;
  if g->>'rol' = 'kuzatuvchi' then return jsonb_build_object('ok', false, 'code', 'WRITE_ROLE_REQUIRED'); end if;
  if p_kalit is null or p_kalit !~ '^[a-z0-9_.-]{2,80}$' or coalesce(length(p_mazmun), 0) not between 1 and 4000 then return jsonb_build_object('ok', false, 'code', 'XOTIRA_INVALID'); end if;
  if p_profil is not null and not exists (select 1 from t2_agent_profile where kod = p_profil) then return jsonb_build_object('ok', false, 'code', 'PROFIL_YOQ'); end if;
  perform pg_advisory_xact_lock(hashtextextended('t2_agent_xotira:' || coalesce(p_kompaniya_id, 0), 0));
  select count(*) into v_n from t2_agent_xotira where kompaniya_id is not distinct from p_kompaniya_id and foydalanuvchi_id is null;
  if v_n >= 200 and not exists (select 1 from t2_agent_xotira where kompaniya_id is not distinct from p_kompaniya_id and foydalanuvchi_id is null and coalesce(profil_kod, '') = coalesce(p_profil, '') and kalit = p_kalit) then
    return jsonb_build_object('ok', false, 'code', 'XOTIRA_TO_LA', 'xabar', 'Xotira to''lgan (200 yozuv) — eskisini yangilang');
  end if;
  insert into t2_agent_xotira (kompaniya_id, profil_kod, kalit, mazmun, manba) values (p_kompaniya_id, p_profil, p_kalit, p_mazmun, 'actor:' || p_actor_id)
  on conflict (coalesce(kompaniya_id, 0::bigint), coalesce(foydalanuvchi_id, 0::bigint), coalesce(profil_kod, ''::text), kalit)
  do update set mazmun = excluded.mazmun, manba = excluded.manba, versiya = t2_agent_xotira.versiya + 1, yangilandi = now();
  return jsonb_build_object('ok', true);
end $function$;
