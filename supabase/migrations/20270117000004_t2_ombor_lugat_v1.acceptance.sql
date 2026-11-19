-- Acceptance 20270117000004 (sintetik, BEGIN ... ROLLBACK; migratsiyadan KEYIN ishga tushiriladi).
begin;
do $$
declare f text; v_k bigint; v_id bigint; v_son integer;
begin
  if to_regclass('public.t2_ombor_lugat') is null then raise exception 'ACC1: jadval yoq'; end if;
  if not (select relrowsecurity from pg_class where oid = 'public.t2_ombor_lugat'::regclass) then raise exception 'ACC2: RLS yoqilmagan'; end if;
  if has_table_privilege('anon', 'public.t2_ombor_lugat', 'select') or has_table_privilege('authenticated', 'public.t2_ombor_lugat', 'select') then raise exception 'ACC3: anon/authenticated jadvalni o''qiy olmasin'; end if;
  foreach f in array array['public.t2_ombor_lugat_royxat_v1(bigint,bigint,bigint,text,integer)', 'public.t2_ombor_lugat_yoz_v1(bigint,bigint,bigint,text,jsonb)'] loop
    if to_regprocedure(f) is null then raise exception 'ACC4: funksiya yoq %', f; end if;
    if has_function_privilege('anon', f, 'execute') or has_function_privilege('authenticated', f, 'execute') then raise exception 'ACC5: anon/authenticated ijro eta olmasin %', f; end if;
  end loop;

  select id into v_k from public.t2_kompaniya order by id limit 1;
  if v_k is null then raise notice 'SKIP: kompaniya yoq'; return; end if;

  insert into public.t2_ombor_lugat (kompaniya_id, tur, ibora, ibora_kalit, kanonik) values (v_k, 'material', 'ACC betonchik', 'acc betonchik', 'ACC Beton M200') returning id into v_id;
  -- bitta faol ibora kaliti — takror yo'q
  begin
    insert into public.t2_ombor_lugat (kompaniya_id, tur, ibora, ibora_kalit, kanonik) values (v_k, 'material', 'ACC Betonchik', 'acc betonchik', 'boshqa');
    raise exception 'ACC6: takror faol ibora kirib ketdi';
  exception when unique_violation then null; end;
  -- ochirilgandan keyin xuddi shu kalit qayta qo'shilishi mumkin
  update public.t2_ombor_lugat set holat = 'ochirilgan' where id = v_id;
  insert into public.t2_ombor_lugat (kompaniya_id, tur, ibora, ibora_kalit, kanonik) values (v_k, 'material', 'ACC betonchik', 'acc betonchik', 'ACC Beton M300');
  select count(*) into v_son from public.t2_ombor_lugat where kompaniya_id = v_k and ibora_kalit = 'acc betonchik' and holat = 'faol';
  if v_son <> 1 then raise exception 'ACC7: faol soni % (kutilgan 1)', v_son; end if;
  -- turi va uzunlik cheklovlari
  begin insert into public.t2_ombor_lugat (kompaniya_id, tur, ibora, ibora_kalit, kanonik) values (v_k, 'boshqa', 'x', 'x', 'y'); raise exception 'ACC8: noto''g''ri tur kirdi';
  exception when check_violation then null; end;
  -- RPC: ruxsatsiz (mavjud bo'lmagan) aktor rad etiladi (yozuv qilmaydi)
  begin
    perform public.t2_ombor_lugat_yoz_v1(-1, v_k, -1, 'oyrat', jsonb_build_object('tur', 'material', 'ibora', 'x', 'ibora_kalit', 'x', 'kanonik', 'y'));
    raise exception 'ACC9: ruxsatsiz aktor yozdi';
  exception when others then if sqlerrm like 'ACC9%' then raise; end if; end;
end $$;
rollback;