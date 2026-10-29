do $$ declare v numeric; w numeric; begin
  select sum((public.t2_obyekt_nakrutka_v1(o, 183, null)->'nakrutka'->>'vsego')::numeric) into v from unnest(array[162,163,164,165,166,167,168,175]) o;
  select sum(n.vsego) into w from public.t2_obyekt_nakrutka n where n.obyekt_id = any(array[162,163,164,165,166,167,168,175]);
  if abs(v - w) > 1 then raise exception 'ACCEPT_FAIL: RPC vsego % <> view vsego %', v, w; end if;
  if exists (select 1 from public.t2_lrv where _versiya_holat <> 'faol') then raise exception 'ACCEPT_FAIL: t2_lrv almashtirilgan qator ko''rsatyapti'; end if;
  raise notice 'faol-fix acceptance OK: % = %', v, w;
end $$;