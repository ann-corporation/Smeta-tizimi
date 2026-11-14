-- Rollback: 20261212400000 — t2_qator_muhr yuklamasini R2 ga ko'chirish. Asl const trigger va view tiklanadi, yangi ustunlar/jadval/funksiyalar olib tashlanadi.
-- DIQQAT: bazada SOVUQ qator (yuklamasi R2 da) qolgan bo'lsa rollback RAD ETILADI — avval hammasini isiting:
--   mcp/smeta-mcp-remote: isitBarchasi (frontend/src/lib/qator-muhr-r2/sovuq.ts) yoki /api/muhr-isit har obyekt uchun, keyin
--   select count(*) from public.t2_qator_muhr where sovuq_id is not null;  -- 0 bo'lishi shart.
-- R2 dagi obyektlar O'CHIRILMAYDI (isbot nusxasi). t2_qator va import o'ramlari tegilmagan.
begin;
do $rb$
begin
  if exists (select 1 from public.t2_qator_muhr where sovuq_id is not null) then
    raise exception 'ROLLBACK RAD ETILDI: sovuq muhr qatorlari bor (yuklama R2 da) — avval isiting (t2_qator_muhr_isit_v1)';
  end if;
end $rb$;
-- Asl const trigger (20261112700000)
create or replace function public.t2_qator_muhr_const_trg()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'T2_QATOR_MUHR_CONST: muhr o''chirilmaydi (qator_id=%)', old.qator_id using errcode = 'check_violation';
  end if;
  if old.yopildi is not null
     or (to_jsonb(new) - 'yopildi' - 'yopilish_sabab') is distinct from (to_jsonb(old) - 'yopildi' - 'yopilish_sabab') then
    raise exception 'T2_QATOR_MUHR_CONST: muhr o''zgarmaydi (qator_id=%)', old.qator_id using errcode = 'check_violation';
  end if;
  return new;
end $$;

-- Asl view (20261112700000)
drop view if exists public.t2_qator_muhr_farq;
create or replace view public.t2_qator_muhr_farq with (security_invoker = true) as
with b as (
  select m.kompaniya_id, m.obyekt_id, m.qator_id,
         coalesce(q.tur, m.tur) as tur, coalesce(q.kod, m.kod) as kod, coalesce(q.nom, m.nom) as nom, coalesce(q.ota_id, m.ota_id) as ota_id,
         case when q.id is null then 'ochirilgan' when cardinality(f.maydonlar) > 0 then 'ozgargan' else 'qoshilgan' end as holat,
         f.maydonlar, f.avval, f.endi,
         (q.id is not null and f.maydonlar = array['narx'] and m.narx is null) as faqat_narx_qoyildi,
         m.aslda_yoq, m.ekspertizagacha, m.tekshirilmagan, m.manba as muhr_manba, m.asos_vaqt, m.bosqich, m.revision_id, m.muhr
    from public.t2_qator_muhr m
    left join public.t2_qator q on q.id = m.qator_id
    left join lateral (
      select public.t2_qator_muhr_hisob(q.tur, q.kod, q.nom, q.birlik, q.kat, q.ota_id, q.hajm, q.narx, q.norma) as h
       where q.id is not null
         and (q.tur is distinct from m.tur or q.kod is distinct from m.kod or q.nom is distinct from m.nom
              or q.birlik is distinct from m.birlik or q.kat is distinct from m.kat or q.ota_id is distinct from m.ota_id
              or q.hajm is distinct from m.hajm or q.narx is distinct from m.narx or q.norma is distinct from m.norma)
    ) c on true
    cross join lateral (
      select coalesce(array_agg(x.maydon order by x.n), '{}'::text[]) as maydonlar,
             coalesce(jsonb_object_agg(x.maydon, x.avval), '{}'::jsonb) as avval,
             coalesce(jsonb_object_agg(x.maydon, x.endi), '{}'::jsonb) as endi
        from (values
          (1, 'tur',    to_jsonb(m.tur),    to_jsonb(c.h[2])),
          (2, 'kod',    to_jsonb(m.kod),    to_jsonb(c.h[3])),
          (3, 'nom',    to_jsonb(m.nom),    to_jsonb(c.h[4])),
          (4, 'birlik', to_jsonb(m.birlik), to_jsonb(c.h[5])),
          (5, 'kat',    to_jsonb(m.kat),    to_jsonb(c.h[6])),
          (6, 'ota_id', to_jsonb(m.ota_id), to_jsonb(q.ota_id)),
          (7, 'hajm',   to_jsonb(m.hajm),   to_jsonb(trim_scale(q.hajm))),
          (8, 'narx',   to_jsonb(m.narx),   to_jsonb(trim_scale(q.narx))),
          (9, 'norma',  to_jsonb(m.norma),  to_jsonb(trim_scale(q.norma)))
        ) x(n, maydon, avval, endi)
       where c.h is not null and x.avval is distinct from x.endi
    ) f
   where m.yopildi is null
     and not exists (select 1 from public.t2_qator_muhr m2 where m2.qator_id = m.qator_id and m2.bosqich > m.bosqich and m2.yopildi is null)
     and (q.id is null or cardinality(f.maydonlar) > 0 or m.aslda_yoq)
  union all
  select q.kompaniya_id, q.obyekt_id, q.id, q.tur, q.kod, q.nom, q.ota_id, 'muhrsiz', '{}'::text[], '{}'::jsonb, '{}'::jsonb,
         false, null::boolean, null::boolean, '{}'::text[], null::text, null::timestamptz, null::integer, null::bigint, null::text
    from public.t2_qator q
   where not exists (select 1 from public.t2_qator_muhr m where m.qator_id = q.id and m.yopildi is null)
)
select b.*, j.jurnal_soni, j.oxirgi_tahrir, j.oxirgi_kim, j.oxirgi_manba
  from b
  left join lateral (
    select count(*)::int as jurnal_soni, max(z.vaqt) as oxirgi_tahrir,
           (array_agg(z.kim order by z.vaqt desc))[1] as oxirgi_kim, (array_agg(z.manba order by z.vaqt desc))[1] as oxirgi_manba
      from public.t2_ozgarish z
     where z.qator_id = b.qator_id and z.jadval = 't2_qator' and (b.asos_vaqt is null or z.vaqt >= b.asos_vaqt)
  ) j on true;
comment on view public.t2_qator_muhr_farq is
  'SMETA CONST: muhrdan farq qilgan qatorlar (ozgargan / ochirilgan / qoshilgan / muhrsiz), avval/endi faqat o''zgargan maydonlar, t2_ozgarish jurnali bilan. jurnal_soni = 0 va holat = ozgargan — jurnalsiz o''zgarish (import/markirovka yo''li).';
revoke all on public.t2_qator_muhr_farq from public, anon, authenticated;
grant select on public.t2_qator_muhr_farq to service_role;

alter table public.t2_qator_muhr drop constraint if exists t2_qator_muhr_sovuq_shakl;
alter table public.t2_qator_muhr drop column if exists sovuq_id, drop column if exists xom_xesh;
drop function if exists public.t2_qator_muhr_sovuq_statistika_v1();
drop function if exists public.t2_qator_muhr_isit_nomzod_v1(bigint, integer);
drop function if exists public.t2_qator_muhr_isit_v1(bigint, text, text, bigint[]);
drop function if exists public.t2_qator_muhr_sovuq_sovut_v1(bigint, text);
drop function if exists public.t2_qator_muhr_sovuq_tasdiq_v1(bigint, text);
drop function if exists public.t2_qator_muhr_sovuq_yoz_v1(bigint, bigint[], text, text, bigint);
drop function if exists public.t2_qator_muhr_sovuq_oqi_v1(bigint, integer, integer);
drop function if exists public.t2_qator_muhr_sovuq_nomzod_v1(integer, integer);
drop function if exists public.t2_qator_muhr_sovuq_matn_v1(bigint[]);
drop function if exists public.t2_qator_muhr_xom_v1(text, text, text, text, text, bigint, numeric, numeric, numeric);
drop trigger if exists t2_qator_muhr_sovuq_const on public.t2_qator_muhr_sovuq;
drop table if exists public.t2_qator_muhr_sovuq;
drop function if exists public.t2_qator_muhr_sovuq_const_trg();
commit;