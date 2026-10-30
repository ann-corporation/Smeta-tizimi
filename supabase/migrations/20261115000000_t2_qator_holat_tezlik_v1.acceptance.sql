-- Qabul: yangi view natijasi eski funksiya formulasi bilan har qatorda aynan bir xil; butun jadval skani yo'q.
do $$ declare n bigint; farq bigint; skan boolean; begin
  select count(*), count(*) filter (where
      h.almashtirilgan_summa is distinct from public.t2_almashtirilgan_summa_hisob(h.almashtirilgan_hajm, h.asl_smeta_hajm, h.smeta_narx, h.asl_smeta_summa)
      or h.qoldiq_summa is distinct from (case when h.versiya_holat = 'almashtirilgan' then 0::numeric
           else h.asl_smeta_summa - h.f2_summa - coalesce(public.t2_almashtirilgan_summa_hisob(h.almashtirilgan_hajm, h.asl_smeta_hajm, h.smeta_narx, h.asl_smeta_summa), 0) end))
    into n, farq from public.t2_qator_holat h;
  if farq <> 0 then raise exception 'ACCEPT_FAIL: % qatorda almashtirilgan/qoldiq summa farq qildi', farq; end if;
  if exists (select 1 from public.t2_qator_holat where versiya_holat = 'almashtirilgan' and (smeta_summa <> 0 or qoldiq_summa <> 0)) then
    raise exception 'ACCEPT_FAIL: almashtirilgan qatorda smeta/qoldiq';
  end if;
  raise notice 'holat tezlik OK: % qator tekshirildi', n;
end $$;
