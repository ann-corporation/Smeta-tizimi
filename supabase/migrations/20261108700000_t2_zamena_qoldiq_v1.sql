-- ZAMENA QOLDIQ v1 (egasi qarori 2026-10-24: QISMAN, hajm bo'yicha).
-- Zamena (change_type='REPLACEMENT', replaces_line_id -> asl) qatoriga F2/fakt yozilgan sari ASLNING qoldig'i kamayadi.
--   * birlik bir xil -> 1:1 (zamenaning F2/fakt hajmi aslning qoldig'idan ayriladi);
--   * birlik farqli  -> t2_qator.almashtirish_hajm (aslning birligida, zamenaning TO'LIQ rejalangan hajmi uchun) kiritilgan bo'lsa
--     proporsional: zamena_progress / zamena_hajm * almashtirish_hajm; kiritilmagan bo'lsa asl TO'LIQ almashtirilgan (butun qoldig'i yopiladi);
--   * zamena ISH (bl) bo'lsa, aslning bola resurslari (rs/mat/ob) ham xuddi shu ulushda yopiladi (jami summalar bargdan yig'iladi).
-- Asl smeta qatorlari O'ZGARMAYDI (ASL SMETA CONST) -- bu hisoblangan qoplash qatlami. Summa to'qilmaydi, hajm bloklanmaydi, NULL != 0.
-- YAGONA TA'RIF: t2_almashtirilgan_hajm(qator_id) + t2_almashtirilgan_summa_hisob(...); t2_qator_holat va t2_nakopitelniy_v2 shularni ishlatadi.
-- Eslatma: t2_qator_holat / t2_nakopitelniy_v2 joriy (prod) ta'rifdan replace() bilan o'zgartiriladi -- langar topilmasa EXCEPTION (jim o'tmaydi).
begin;

-- 1) Saqlash: faqat zamena qatorida, nullable, additiv.
alter table public.t2_qator add column if not exists almashtirish_hajm numeric;
alter table public.t2_qator drop constraint if exists t2_qator_almashtirish_hajm_chk;
alter table public.t2_qator add constraint t2_qator_almashtirish_hajm_chk
  check (almashtirish_hajm is null or (almashtirish_hajm >= 0 and almashtirish_hajm < 'Infinity'::numeric and change_type = 'REPLACEMENT')) not valid;
alter table public.t2_qator validate constraint t2_qator_almashtirish_hajm_chk;
comment on column public.t2_qator.almashtirish_hajm is
  'Zamena qatori uchun: aslning (replaces_line_id) QAYSI birligida, zamenaning TO''LIQ rejalangan hajmi aslning qancha hajmini almashtiradi. NULL = birlik bir xil bo''lsa 1:1, farqli bo''lsa asl to''liq almashtirilgan.';

-- 2) Zamena -> asl qoplash (har zamena uchun bitta qator; progress = max(tasdiqlangan F2, fakt)).
create or replace view public.t2_zamena_qoplash as
select z.replaces_line_id as asl_qator_id,
       z.id as zamena_qator_id,
       z.hajm as zamena_hajm,
       z.almashtirish_hajm,
       (coalesce(z.birlik_key, lower(btrim(z.birlik))) is not distinct from coalesce(o.birlik_key, lower(btrim(o.birlik)))) as ayni_birlik,
       pr.progress_hajm
  from public.t2_qator z
  join public.t2_qator o on o.id = z.replaces_line_id
 cross join lateral (
   select greatest(
            coalesce(sum(coalesce(aq.certified_quantity, aq.hajm)) filter (where a.tur = 'f2' and a.holat = 'tasdiqlangan'), 0),
            coalesce(sum(aq.hajm) filter (where a.tur = 'fakt' and a.holat <> 'bekor'), 0)) as progress_hajm
     from public.t2_akt_qator aq join public.t2_akt a on a.id = aq.akt_id
    where aq.qator_id = z.id) pr
 where z.change_type = 'REPLACEMENT' and z.replaces_line_id is not null;

-- 3) Aslning O'Z zamenalaridan qoplangan hajmi (aslning birligida), aslning qolgan qoldig'i bilan cheklangan.
create or replace function public.t2_almashtirilgan_oz_hajm(p_qator_id bigint) returns numeric
language sql stable set search_path = public, pg_temp as $fn$
  with o as (
    select greatest(coalesce(q.hajm, 0) - coalesce((
             select sum(coalesce(aq.certified_quantity, aq.hajm))
               from public.t2_akt_qator aq join public.t2_akt a on a.id = aq.akt_id
              where aq.qator_id = q.id and a.tur = 'f2' and a.holat = 'tasdiqlangan'), 0), 0) as rem
      from public.t2_qator q where q.id = p_qator_id),
  c as (
    select z.*,
           (z.almashtirish_hajm is null and not z.ayni_birlik)
             or (z.almashtirish_hajm is not null and coalesce(z.zamena_hajm, 0) <= 0) as toliq,
           case when z.almashtirish_hajm is not null and coalesce(z.zamena_hajm, 0) > 0
                  then z.progress_hajm / z.zamena_hajm * z.almashtirish_hajm
                when z.almashtirish_hajm is null and z.ayni_birlik then z.progress_hajm end as qoplash
      from public.t2_zamena_qoplash z where z.asl_qator_id = p_qator_id)
  select coalesce(case
           when not exists (select 1 from c) then 0::numeric
           when exists (select 1 from c where toliq) then (select rem from o)
           else least(coalesce((select sum(qoplash) from c), 0), (select rem from o)) end, 0::numeric)
$fn$;

-- 4) YAGONA ta'rif: asl qatorning almashtirilgan hajmi (o'z zamenalari; resurs bo'lsa almashtirilgan ISH ulushi ham).
create or replace function public.t2_almashtirilgan_hajm(p_qator_id bigint) returns numeric
language sql stable set search_path = public, pg_temp as $fn$
  select greatest(
    public.t2_almashtirilgan_oz_hajm(p_qator_id),
    coalesce((
      select case when o.hajm is null or o.hajm = 0 or ob.hajm is null or ob.hajm <= 0 then 0
                  else least(
                         greatest(o.hajm - coalesce((select sum(coalesce(aq.certified_quantity, aq.hajm))
                                                       from public.t2_akt_qator aq join public.t2_akt a on a.id = aq.akt_id
                                                      where aq.qator_id = o.id and a.tur = 'f2' and a.holat = 'tasdiqlangan'), 0), 0),
                         o.hajm * least(public.t2_almashtirilgan_oz_hajm(ob.id) / ob.hajm, 1)) end
        from public.t2_qator o
        join public.t2_qator ob on ob.id = o.ota_id and ob.tur = 'bl'
       where o.id = p_qator_id and o.tur in ('rs', 'mat', 'ob')
         and exists (select 1 from public.t2_qator zz where zz.replaces_line_id = ob.id)), 0))
$fn$;

-- 5) Narx qoidasi: summa to'qilmaydi -- narx yoki summa/hajm bo'lmasa NULL.
create or replace function public.t2_almashtirilgan_summa_hisob(p_alm numeric, p_hajm numeric, p_narx numeric, p_summa numeric) returns numeric
language sql immutable as $fn$
  select case when coalesce(p_alm, 0) = 0 then 0::numeric
              when p_narx is not null then p_alm * p_narx
              when p_hajm is not null and p_hajm <> 0 and p_summa is not null then p_alm * p_summa / p_hajm end
$fn$;

revoke all on function public.t2_almashtirilgan_oz_hajm(bigint) from public, anon, authenticated;
revoke all on function public.t2_almashtirilgan_hajm(bigint) from public, anon, authenticated;
revoke all on function public.t2_almashtirilgan_summa_hisob(numeric, numeric, numeric, numeric) from public, anon, authenticated;
grant execute on function public.t2_almashtirilgan_oz_hajm(bigint) to service_role;
grant execute on function public.t2_almashtirilgan_hajm(bigint) to service_role;
grant execute on function public.t2_almashtirilgan_summa_hisob(numeric, numeric, numeric, numeric) to service_role;
revoke all on public.t2_zamena_qoplash from public, anon, authenticated;
grant select on public.t2_zamena_qoplash to service_role;

-- 6) Zamenaning «aslning qancha hajmini almashtiradi» qiymatini belgilash/o'zgartirish (faqat zamena qatori, faqat shu ustun).
create or replace function public.t2_zamena_almashtirish_belgila_v1(p_actor_id bigint, p_kompaniya_id bigint, p_qator_id bigint, p_hajm numeric)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $fn$
declare v_rol text; z public.t2_qator%rowtype;
begin
  v_rol := public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  if v_rol not in ('admin','superadmin','boss','director','pto') then raise exception 'WRITE_ROLE_REQUIRED' using errcode = '42501'; end if;
  if p_hajm is not null and (p_hajm < 0 or p_hajm::text in ('NaN','Infinity','-Infinity')) then
    return jsonb_build_object('ok', false, 'code', 'QUANTITY_INVALID');
  end if;
  select * into z from public.t2_qator
   where id = p_qator_id and kompaniya_id = p_kompaniya_id and change_type = 'REPLACEMENT' and replaces_line_id is not null for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'ZAMENA_NOT_FOUND'); end if;
  update public.t2_qator set almashtirish_hajm = p_hajm where id = z.id;
  perform public.t2_audit_yoz(p_kompaniya_id, 'zamena_almashtirish', 'smeta', z.obyekt_id,
    'qator:' || z.id || '; asl:' || z.replaces_line_id || '; hajm:' || coalesce(p_hajm::text, 'null'), 'actor:' || p_actor_id, null);
  return jsonb_build_object('ok', true, 'qator_id', z.id, 'asl_qator_id', z.replaces_line_id, 'almashtirish_hajm', p_hajm,
                            'almashtirilgan_hajm', public.t2_almashtirilgan_hajm(z.replaces_line_id));
end $fn$;
revoke all on function public.t2_zamena_almashtirish_belgila_v1(bigint, bigint, bigint, numeric) from public, anon, authenticated;
grant execute on function public.t2_zamena_almashtirish_belgila_v1(bigint, bigint, bigint, numeric) to service_role;

-- 7) t2_qator_holat: qoldiq = smeta - f2 - almashtirilgan (+ yangi ustunlar oxirida).
do $do$
declare d text; n text;
begin
  d := pg_get_viewdef('public.t2_qator_holat'::regclass, true);
  n := d;
  n := replace(n, 'q.hajm - d.f2_hajm AS qoldiq_hajm,', 'q.hajm - d.f2_hajm - al.v AS qoldiq_hajm,');
  n := replace(n, 'q.summa - d.f2_summa_malum AS qoldiq_summa,', 'q.summa - d.f2_summa_malum - COALESCE(public.t2_almashtirilgan_summa_hisob(al.v, q.hajm, q.narx, q.summa), 0::numeric) AS qoldiq_summa,');
  n := replace(n, 'd.f2_summa_nomalum', 'd.f2_summa_nomalum,' || E'\n    al.v AS almashtirilgan_hajm,\n    public.t2_almashtirilgan_summa_hisob(al.v, q.hajm, q.narx, q.summa) AS almashtirilgan_summa');
  n := replace(n, 'FROM t2_qator q', 'FROM t2_qator q' || E'\n     CROSS JOIN LATERAL ( SELECT CASE WHEN EXISTS (SELECT 1 FROM public.t2_qator zz WHERE zz.replaces_line_id = q.id OR zz.replaces_line_id = q.ota_id) THEN public.t2_almashtirilgan_hajm(q.id) ELSE 0::numeric END AS v) al');
  if n = d or position('- al.v AS qoldiq_hajm' in n) = 0
     or position('AS almashtirilgan_summa' in n) = 0 or position('CROSS JOIN LATERAL ( SELECT CASE WHEN EXISTS' in n) = 0
     or position('COALESCE(public.t2_almashtirilgan_summa_hisob(al.v, q.hajm, q.narx, q.summa), 0::numeric) AS qoldiq_summa' in n) = 0 then
    raise exception 'ZAMENA_QOLDIQ: t2_qator_holat langari topilmadi (view ta''rifi o''zgargan)';
  end if;
  execute 'create or replace view public.t2_qator_holat as ' || rtrim(n, E'; \n');
end $do$;

-- 8) t2_nakopitelniy_v2: qator qoldig'i, faol filtri (asl ko'rinadi) va jami qoldiq_summa.
do $do$
declare d text; n text;
begin
  d := pg_get_functiondef('public.t2_nakopitelniy_v2(bigint,bigint,date,integer,boolean,integer)'::regprocedure);
  n := d;
  n := replace(n, ') p on true', ') p on true' || E'\n    left join lateral (select case when exists (select 1 from public.t2_qator zz where zz.replaces_line_id = q.id or zz.replaces_line_id = q.ota_id) then public.t2_almashtirilgan_hajm(q.id) else 0::numeric end as v) al on true');
  n := replace(n, 'where (not v_faol or ', 'where (not v_faol or coalesce(al.v,0) <> 0 or ');
  n := replace(n, $a$'qoldiq_hajm',  coalesce(q.hajm,0) - (coalesce(p.oldingi_hajm,0) + coalesce(p.joriy_hajm,0)),$a$,
    $b$'almashtirilgan_hajm', coalesce(al.v,0),
      'qoldiq_hajm',  coalesce(q.hajm,0) - (coalesce(p.oldingi_hajm,0) + coalesce(p.joriy_hajm,0)) - coalesce(al.v,0),$b$);
  n := replace(n, $a$'qoldiq_summa', coalesce(q.summa,0) - (coalesce(p.oldingi_summa,0) + coalesce(p.joriy_summa,0)),$a$,
    $b$'almashtirilgan_summa', public.t2_almashtirilgan_summa_hisob(coalesce(al.v,0), q.hajm, q.narx, q.summa),
      'qoldiq_summa', coalesce(q.summa,0) - (coalesce(p.oldingi_summa,0) + coalesce(p.joriy_summa,0)) - coalesce(public.t2_almashtirilgan_summa_hisob(coalesce(al.v,0), q.hajm, q.narx, q.summa),0),$b$);
  n := replace(n, $a$'qoldiq_summa', smeta_summa - jami_summa,$a$,
    $b$'qoldiq_summa', smeta_summa - jami_summa - (select coalesce(sum(public.t2_almashtirilgan_summa_hisob(public.t2_almashtirilgan_hajm(o.id), o.hajm, o.narx, o.summa)),0)
        from public.t2_qator o where o.obyekt_id = p_obyekt_id and o.tur in ('rs','mat','ob')
          and (exists (select 1 from public.t2_qator zz where zz.replaces_line_id = o.id)
               or exists (select 1 from public.t2_qator zz where zz.replaces_line_id = o.ota_id))),$b$);
  if position('else 0::numeric end as v) al on true' in n) = 0 or position('coalesce(al.v,0) <> 0 or ' in n) = 0
     or position('''almashtirilgan_hajm'', coalesce(al.v,0)' in n) = 0 or position('''almashtirilgan_summa'', public.t2_almashtirilgan_summa_hisob' in n) = 0
     or position('smeta_summa - jami_summa - (select' in n) = 0 then
    raise exception 'ZAMENA_QOLDIQ: t2_nakopitelniy_v2 langari topilmadi (funksiya ta''rifi o''zgargan)';
  end if;
  execute n;
end $do$;

commit;
