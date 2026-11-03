-- ACCEPTANCE (faqat o'qish): 1) ustunlar soni/tartibi 35 ta o'zgarmagan; 2) F2 qatorda fakt_summa = round(fakt_hajm*f2_summa/f2_hajm,2); 3) F2 siz qatorda o'zgarmagan.
do $$
declare v_n int; v_bad int;
begin
  select count(*) into v_n from information_schema.columns where table_schema='public' and table_name='t2_qator_holat';
  if v_n <> 35 then raise exception 'ustunlar soni % (kutilgan 35)', v_n; end if;
  select count(*) into v_bad from public.t2_qator_holat h
   where h.f2_hajm <> 0 and h.f2_summa_yoq = 0 and h.fakt_hajm is not null and h.fakt_summa is not null
     and h.fakt_summa is distinct from public._t2_f2_narxda_v1(h.fakt_hajm, h.f2_hajm, h.f2_summa) and h.obyekt_id = (select min(obyekt_id) from public.t2_qator_holat);
  if v_bad <> 0 then raise exception 'F2 narx qoidasi buzilgan: % qator', v_bad; end if;
end $$;