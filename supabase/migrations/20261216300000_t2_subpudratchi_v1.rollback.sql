-- rollback 20261216300000_t2_subpudratchi_v1
-- Diqqat: subpudratchi topshiriqlari, aktlari va ularning taqdimlari/grantlari o'chadi. Allaqachon qabul qilingan aktlardan yozilgan fakt va xarajat
-- (t2_akt 'sub_akt:' izohli fakt hujjatlari, t2_xarajat hujjat_ref 'sub_akt:*', t2_qarz_asos operation_id md5('sub_akt_qarz:*')) QOLADI - ularni alohida ko'rib chiqing.
drop trigger if exists t2_sub_taqdim_qorovul on public.t2_tomon_taqdim;
drop function if exists public._t2_sub_taqdim_qorovul();
drop function if exists public.t2_sub_tolov_holati_v1(bigint, bigint);
drop function if exists public.t2_sub_akt_tafsilot_v1(bigint, bigint, bigint);
drop function if exists public.t2_sub_akt_royxat_v1(bigint, bigint, text);
drop function if exists public.t2_sub_akt_qaror_v1(bigint, bigint, bigint, text, text);
drop function if exists public.t2_sub_akt_qaytar_v1(bigint, bigint, bigint, text);
drop function if exists public.t2_sub_akt_yubor_v1(bigint, bigint, bigint, text, uuid);
drop function if exists public.t2_sub_akt_yoz_v1(bigint, bigint, bigint, bigint, date, jsonb, bigint, text, text, uuid);
drop function if exists public.t2_sub_ishlarim_v1(bigint, bigint);
drop function if exists public.t2_sub_boshqaruv_v1(bigint, bigint, bigint);
drop function if exists public.t2_sub_topshiriq_bekor_v1(bigint, bigint, bigint);
drop function if exists public.t2_sub_topshir_v1(bigint, bigint, bigint, bigint, jsonb, bigint, bigint, numeric, numeric);
drop function if exists public._t2_sub_akt_xesh(bigint);
drop function if exists public._t2_sub_gc_fakt(bigint);
drop function if exists public._t2_sub_ishlatilgan(bigint, bigint);
drop function if exists public._t2_sub_qarshi_gc(bigint, bigint);
drop function if exists public._t2_sub_qarshi_sub(bigint, bigint);
drop function if exists public._t2_sub_azo(bigint, bigint, text);
drop function if exists public._t2_sub_rol_ok(text, text);

-- sub_akt taqdimlari, ularning voqealari va grantlari
delete from public.t2_tomon_hodisa where taqdim_id in (select id from public.t2_tomon_taqdim where resurs = 'sub_akt');
update public.t2_sub_akt set taqdim_id = null where taqdim_id is not null;
delete from public.t2_tomon_taqdim where resurs = 'sub_akt';
delete from public.t2_tomon_grant where resurs = 'sub_ish' or (resurs = 'tolov_holati' and berdi_actor_id in (select kim_actor from public.t2_sub_topshiriq));

drop table if exists public.t2_sub_akt_qator;
drop table if exists public.t2_sub_akt;
drop table if exists public.t2_sub_topshiriq;

do $$
declare c record;
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.t2_tomon_taqdim'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%manba_jadval%' loop
    execute format('alter table public.t2_tomon_taqdim drop constraint %I', c.conname);
  end loop;
  alter table public.t2_tomon_taqdim add constraint t2_tomon_taqdim_manba_jadval_check
    check (manba_jadval in ('t2_akt', 't2_aosr', 't2_chizma_revizya', 't2_document_registry'));
end $$;

delete from public.t2_tomon_resurs where kalit in ('sub_ish', 'sub_akt');
