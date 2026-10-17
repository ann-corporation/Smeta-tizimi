-- Narx tanlovi tajribasi — tizim darajasida (egasi 2026-10-17: "har narsaga ruxsat so'rayveradi, to'g'ri topganini ham
-- tasdiqla deydi … tizim butun yuklangan smetalardan o'rgansin, uverennostni oshirsin, kuchli smetchiklardan o'rgansin —
-- faqat kompaniya emas, tizim darajasida"). Faqat qo'shimcha: yangi jadval va ikki funksiya; mavjud jadvallar o'zgarmaydi.
--
-- Maxfiylik: boshqa kompaniyaning narxi, nomi, obyekti HECH QACHON qaytmaydi. Tizim faqat (1) "shu resursga shu manba
-- qatorini smetachilar necha marta qabul/rad qilgan" sonlarini va (2) taklif qilingan narx yuklangan smetalardagi amaliyotga
-- MOSmi (ha/yo'q/ma'lumot yetarli emas) degan hukmni beradi; narx statistikasi raqamlari faqat ≥3 kompaniya bo'lsa.

create table if not exists public.t2_narx_tanlov_tajriba (
  id bigint generated always as identity primary key,
  kompaniya_id bigint not null references public.t2_kompaniya(id) on delete cascade,
  foydalanuvchi_id bigint references public.t2_foydalanuvchi(id) on delete set null,
  -- Smeta resursi kaliti: t2_resurs_nom_kalit(nom) || '|' || t2_resurs_birlik_kalit(birlik) (t2_qator.nom_key/birlik_key bilan bir xil).
  resurs_kalit text not null check (length(resurs_kalit) between 2 and 300),
  -- Manba qatori kaliti (katalog revizyasidan mustaqil): manbadagi nom va birlik kaliti.
  manba_kalit text not null check (length(manba_kalit) between 2 and 300),
  manba_tur text not null check (manba_tur in ('katalog', 'kp', 'internet', 'qolda')),
  narx numeric check (narx is null or narx >= 0),
  holat text not null check (holat in ('qabul', 'rad')),
  yaratildi timestamptz not null default now()
);
create index if not exists t2_narx_tanlov_tajriba_kalit on public.t2_narx_tanlov_tajriba (resurs_kalit);
alter table public.t2_narx_tanlov_tajriba enable row level security;
revoke all on public.t2_narx_tanlov_tajriba from public, anon, authenticated;

-- Yozish: Studio narx qabul qilinganda (foydalanuvchi tasdig'i yoki qo'lda tanlov) va AI tanlovi rad etilganda, ≤ 200 tagacha.
create or replace function public.t2_narx_tajriba_yoz_v1(p_actor_id bigint, p_kompaniya_id bigint, p_yozuvlar jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare g jsonb; v_n int;
begin
  g := public.t2_agent_scope_guard_v1(p_actor_id, p_kompaniya_id);
  if not (g->>'ok')::boolean then return g; end if;
  if g->>'rol' = 'kuzatuvchi' then return jsonb_build_object('ok', false, 'code', 'WRITE_ROLE_REQUIRED'); end if;
  if jsonb_typeof(p_yozuvlar) <> 'array' or jsonb_array_length(p_yozuvlar) > 200 then return jsonb_build_object('ok', false, 'code', 'TAJRIBA_INVALID'); end if;
  insert into t2_narx_tanlov_tajriba (kompaniya_id, foydalanuvchi_id, resurs_kalit, manba_kalit, manba_tur, narx, holat)
  select p_kompaniya_id, p_actor_id, left(x->>'resurs', 300), left(x->>'manba', 300), x->>'tur',
         case when x->>'narx' ~ '^[0-9]+(\.[0-9]+)?$' then (x->>'narx')::numeric end, x->>'holat'
    from jsonb_array_elements(p_yozuvlar) x
   where length(coalesce(x->>'resurs', '')) between 2 and 300 and length(coalesce(x->>'manba', '')) between 2 and 300
     and x->>'tur' in ('katalog', 'kp', 'internet', 'qolda') and x->>'holat' in ('qabul', 'rad');
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', true, 'yozildi', v_n);
end $$;

-- O'qish: har resurs uchun (1) manba qatorlari bo'yicha qabul/rad sonlari va nechta kompaniya; (2) taklif narxi yuklangan
-- smetalardagi (oxirgi 3 yil, barcha kompaniyalar) amaliyotga mosligi. Mos = [0,6 × P25; 1,6 × P75] ichida, kamida 5 kuzatuv
-- va 2 kompaniya bo'lsa; aks holda null. P25/mediana/P75 raqamlari faqat ≥ 3 kompaniya bo'lganda qaytadi.
create or replace function public.t2_narx_tajriba_v1(p_actor_id bigint, p_kompaniya_id bigint, p_sorovlar jsonb)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare g jsonb; v jsonb;
begin
  g := public.t2_agent_scope_guard_v1(p_actor_id, p_kompaniya_id);
  if not (g->>'ok')::boolean then return g; end if;
  if jsonb_typeof(p_sorovlar) <> 'array' or jsonb_array_length(p_sorovlar) > 300 then return jsonb_build_object('ok', false, 'code', 'SOROV_INVALID'); end if;
  with so as (
    select distinct on (x->>'resurs') x->>'resurs' resurs, split_part(x->>'resurs', '|', 1) nk, split_part(x->>'resurs', '|', 2) bk,
           case when x->>'narx' ~ '^[0-9]+(\.[0-9]+)?$' then (x->>'narx')::numeric end narx
      from jsonb_array_elements(p_sorovlar) x where length(coalesce(x->>'resurs', '')) between 3 and 300 and position('|' in x->>'resurs') > 1
  ), st as (
    select so.resurs, count(*) n, count(distinct q.kompaniya_id) k,
           percentile_cont(0.25) within group (order by q.narx) p25, percentile_cont(0.5) within group (order by q.narx) p50,
           percentile_cont(0.75) within group (order by q.narx) p75
      from so join t2_qator q on q.nom_key = so.nk and q.birlik_key = so.bk
     where q.tur in ('rs', 'mat', 'ob') and q.narx > 0 and q.yaratildi > now() - interval '3 years'
     group by so.resurs
  ), tj as (
    select t.resurs_kalit resurs, jsonb_agg(jsonb_build_object('manba', t.manba_kalit, 'qabul', t.qabul, 'rad', t.rad, 'kompaniya_soni', t.k) order by t.qabul desc) tanlovlar
      from (select resurs_kalit, manba_kalit, count(*) filter (where holat = 'qabul') qabul, count(*) filter (where holat = 'rad') rad, count(distinct kompaniya_id) k
              from t2_narx_tanlov_tajriba where resurs_kalit in (select resurs from so) group by 1, 2 order by 3 desc) t
     group by t.resurs_kalit
  )
  select coalesce(jsonb_object_agg(so.resurs, jsonb_strip_nulls(jsonb_build_object(
      'tanlovlar', (select jsonb_path_query_array(tj.tanlovlar, '$[0 to 4]') from tj where tj.resurs = so.resurs),
      'kuzatuv', st.n, 'kompaniya_soni', st.k,
      'mos', case when st.n >= 5 and st.k >= 2 and so.narx is not null then so.narx between 0.6 * st.p25 and 1.6 * st.p75 end,
      'p25', case when st.k >= 3 then round(st.p25::numeric, 2) end,
      'mediana', case when st.k >= 3 then round(st.p50::numeric, 2) end,
      'p75', case when st.k >= 3 then round(st.p75::numeric, 2) end))) filter (where st.n is not null or exists (select 1 from tj where tj.resurs = so.resurs)), '{}'::jsonb)
    into v from so left join st on st.resurs = so.resurs;
  return jsonb_build_object('ok', true, 'resurslar', v);
end $$;

revoke all on function public.t2_narx_tajriba_yoz_v1(bigint, bigint, jsonb) from public, anon, authenticated;
revoke all on function public.t2_narx_tajriba_v1(bigint, bigint, jsonb) from public, anon, authenticated;
grant execute on function public.t2_narx_tajriba_yoz_v1(bigint, bigint, jsonb) to service_role;
grant execute on function public.t2_narx_tajriba_v1(bigint, bigint, jsonb) to service_role;
