-- 20261216900000 t2_baza_hajm_v1 -- baza hajmi: o'lchov tarixi + isbotlangan ortiqcha indekslar (Supabase Free 500 MB).
-- Dizayn va o'lchovlar: docs/ops/BAZA_HAJM_2026-11-12.md. Avvalgi qadam: 20261212100000 (dieta) va snapshot sovutish (20261128000000).
--
-- Nima qiladi (hammasi qaytariladi: .rollback.sql):
--  1) public.t2_baza_hajm_tarix + public.t2_baza_hajm_yoz_v1(): kunlik hajm tarixi (jami bayt, eng katta 15 jadval, 15 ta biznes
--     jadvalning aniq qator soni). Hozir faqat bitta nuqta bor (466 MB); o'sish sur'ati taxmin emas, o'lchov bo'lishi uchun.
--     ~2 KB/kun. Birinchi yozuv (manba='migratsiya_oldin') indekslar tushirilishidan OLDIN olinadi: acceptance shu yozuv bilan
--     biznes jadvallar qator soni KAMAYMAGANINI isbotlaydi.
--  2) Ikki PREFIKS-ortiqcha btree indeksni tushiradi (har biri boshqa indeksning boshlang'ich ustunlari; FK/ORDER BY ishlashi saqlanadi):
--       t2_akt_qator_akt_idx (akt_id)            <= t2_akt_qator_akt_id_id_idx (akt_id, id)           ~0,9 MB
--       t2_f2_import_draft_qator_job_ix (job_id) <= t2_f2_import_draft_qator_job_id_uid_key (job_id, uid) ~0,25 MB
--  3) pg_cron: har kuni 03:40 UTC t2_baza_hajm_yoz_v1('cron') (pg_cron bo'lsa).
-- TEGILMAYDI: hech bir biznes jadval qatori, t2_qator*, akt, F2, fakt, pul/audit, smeta versiyalari, FTS/FK indekslari.
-- VACUUM FULL / REINDEX bu faylda YO'Q (operator qadami: docs/ops/BAZA_HAJM_2026-11-12.md).
set local statement_timeout = '300s';
set local lock_timeout = '10s';

create table if not exists public.t2_baza_hajm_tarix (
  id          bigint generated always as identity primary key,
  olingan     timestamptz not null default now(),
  manba       text   not null,
  db_bytes    bigint not null check (db_bytes > 0),
  jadval_bayt jsonb  not null default '{}'::jsonb,
  qator_soni  jsonb  not null default '{}'::jsonb
);
create index if not exists t2_baza_hajm_tarix_olingan_idx on public.t2_baza_hajm_tarix (olingan desc);
alter table public.t2_baza_hajm_tarix enable row level security;
revoke all on public.t2_baza_hajm_tarix from public, anon, authenticated;
comment on table public.t2_baza_hajm_tarix is 'Baza hajmi tarixi (kunlik, ~2 KB/kun). Faqat diagnostika; biznes fakti emas.';

create or replace function public.t2_baza_hajm_yoz_v1(p_manba text default 'cron')
returns bigint language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id bigint; v_top jsonb; v_cnt jsonb := '{}'::jsonb; v_t text; v_n bigint;
  v_jadvallar text[] := array['t2_qator','t2_qator_muhr','t2_akt_qator','t2_akt','t2_smeta_revision','t2_smeta_versiya_pozitsiya',
    't2_smeta_versiya_moslik','t2_smeta_ozgarish','t2_ozgarish','t2_sklad_harakat','t2_audit_log','t2_aosr','t2_token_harakat',
    't2_f2_import_draft_qator','t2_qator_ochirilgan'];
begin
  if p_manba is null or length(trim(p_manba)) = 0 then raise exception 'BAZA_HAJM: manba bo''sh'; end if;
  select coalesce(jsonb_object_agg(x.t, x.b), '{}'::jsonb) into v_top
    from (select (n.nspname::text || '.' || c.relname::text) as t, pg_total_relation_size(c.oid)::bigint as b
            from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where c.relkind = 'r' and n.nspname in ('public', 'snapshot')
           order by pg_total_relation_size(c.oid) desc limit 15) x;
  foreach v_t in array v_jadvallar loop
    if to_regclass('public.' || quote_ident(v_t)) is not null then
      execute format('select count(*) from public.%I', v_t) into v_n;
      v_cnt := v_cnt || jsonb_build_object(v_t, v_n);
    end if;
  end loop;
  insert into public.t2_baza_hajm_tarix (manba, db_bytes, jadval_bayt, qator_soni)
  values (left(p_manba, 40), pg_database_size(current_database())::bigint, v_top, v_cnt)
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.t2_baza_hajm_yoz_v1(text) from public, anon, authenticated;
grant execute on function public.t2_baza_hajm_yoz_v1(text) to service_role;
comment on function public.t2_baza_hajm_yoz_v1(text) is 'Baza hajmi tarixiga bitta nuqta yozadi (jami bayt, top-15 jadval, biznes jadvallar aniq qator soni). Faqat service_role/pg_cron.';

-- Indekslar tushirilishidan OLDINGI asos nuqta (acceptance: qator soni kamaymaganini shu bilan solishtiradi).
select public.t2_baza_hajm_yoz_v1('migratsiya_oldin');

-- Strukturaviy shartlar: ikkala indeks ham haqiqatan prefiks-ortiqcha va hech bir constraint'ga bog'lanmagan.
do $$
declare v_bad text;
begin
  if to_regclass('public.t2_akt_qator_akt_id_id_idx') is null or to_regclass('public.t2_f2_import_draft_qator_job_id_uid_key') is null then
    raise exception 'BAZA_HAJM: saqlovchi indeks topilmadi (prefiks-ortiqchalik isbotlanmadi)';
  end if;
  select string_agg(c.relname::text, ',') into v_bad from pg_class c
   where c.relname in ('t2_akt_qator_akt_idx','t2_f2_import_draft_qator_job_ix')
     and exists (select 1 from pg_constraint k where k.conindid = c.oid);
  if v_bad is not null then raise exception 'BAZA_HAJM: indeks constraint''ga bog''langan: %', v_bad; end if;
  if (select count(*) from pg_index i where i.indexrelid in ('public.t2_akt_qator_akt_id_id_idx'::regclass, 'public.t2_f2_import_draft_qator_job_id_uid_key'::regclass)
        and i.indpred is null and i.indisvalid
        and (i.indkey::int2[])[0] in (select a.attnum from pg_attribute a where a.attrelid = i.indrelid and a.attname in ('akt_id', 'job_id'))) <> 2 then
    raise exception 'BAZA_HAJM: saqlovchi indekslarning birinchi ustuni akt_id/job_id emas yoki partial';
  end if;
end $$;

drop index if exists public.t2_akt_qator_akt_idx;
drop index if exists public.t2_f2_import_draft_qator_job_ix;

do $$
begin
  if to_regnamespace('cron') is not null then
    perform cron.schedule('t2-baza-hajm-kunlik', '40 3 * * *', 'select public.t2_baza_hajm_yoz_v1(''cron'')');
  end if;
end $$;