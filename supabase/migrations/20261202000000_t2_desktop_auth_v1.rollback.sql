-- Pre-release rollback only. Refuse to destroy enrolled credentials; no CASCADE.
do $$ begin
  if exists(select 1 from public.t2_desktop_qurilma) then
    raise exception 'DESKTOP_ROLLBACK_NONEMPTY: revoke/migrate devices using a reviewed forward migration';
  end if;
end $$;
drop function if exists public.t2_desktop_lease_chegara_v1(bigint,uuid);
drop function if exists public.t2_desktop_qurilma_bekor_v1(bigint,uuid,uuid);
drop function if exists public.t2_desktop_qurilma_tekshir_v1(text);
drop function if exists public.t2_desktop_qurilma_yarat_v1(bigint,uuid,text,bigint,uuid);
drop table if exists public.t2_desktop_qurilma;
