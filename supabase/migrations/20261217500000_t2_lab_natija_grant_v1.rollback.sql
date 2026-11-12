-- Rollback: 20261217500000_t2_lab_natija_grant_v1
drop trigger if exists t2_lab_natija_outbox_trg on public.t2_lab_sinov_sorov;
drop function if exists public._t2_lab_natija_outbox();
drop function if exists public.t2_lab_natija_tafsilot_v1(bigint, bigint, bigint);
drop function if exists public.t2_lab_natija_royxat_v1(bigint, bigint, bigint, integer);
delete from public.t2_tomon_grant where resurs = 'lab_natija';
delete from public.t2_tomon_grant_shablon where resurs = 'lab_natija';
delete from public.t2_tomon_resurs where kalit = 'lab_natija';
