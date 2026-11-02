do $$ declare a numeric; b numeric; c numeric; f numeric; f0 numeric; begin
  select round(sum(smeta_summa) filter (where tur in ('rs','mat','ob'))), round(sum(qoldiq_summa) filter (where tur in ('rs','mat','ob'))), round(sum(f2_summa) filter (where tur in ('rs','mat','ob')))
    into a, b, f from public.t2_qator_holat where obyekt_id = any(array[162,163,164,165,166,167,168,169,170,172,173,174,175,237,238,239,240,241,242,243]);
  select round(sum(summa)) into c from public.t2_qator where obyekt_id = any(array[162,163,164,165,166,167,168,169,170,172,173,174,175,237,238,239,240,241,242,243]) and versiya_holat='faol' and tur in ('rs','mat','ob');
  if abs(a - c) > 1 then raise exception 'ACCEPT_FAIL: holat smeta % <> faol smeta %', a, c; end if;
  if exists (select 1 from public.t2_qator_holat where versiya_holat='almashtirilgan' and (smeta_summa <> 0 or qoldiq_summa <> 0)) then raise exception 'ACCEPT_FAIL: almashtirilgan qatorda smeta/qoldiq'; end if;
  raise notice 'holat fix OK: smeta % qoldiq % f2 %', a, b, f;
end $$;