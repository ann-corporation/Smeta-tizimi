-- Rollback 20261216900000: indekslarni qaytaradi, cron va hajm tarixini olib tashlaydi.
-- Tarix jadvali faqat diagnostika (biznes fakti emas); o'chirilsa o'lchov tarixi yo'qoladi.
set local statement_timeout = '300s';
create index if not exists t2_akt_qator_akt_idx on public.t2_akt_qator (akt_id);
create index if not exists t2_f2_import_draft_qator_job_ix on public.t2_f2_import_draft_qator (job_id);
do $$
begin
  if to_regnamespace('cron') is not null then
    perform cron.unschedule(jobid) from cron.job where jobname = 't2-baza-hajm-kunlik';
  end if;
end $$;
drop function if exists public.t2_baza_hajm_yoz_v1(text);
drop table if exists public.t2_baza_hajm_tarix;