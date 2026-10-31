-- Acceptance: 20261116300000 — obyekt reviziyasi. SINTETIK obyekt (real mijoz ma'lumoti yo'q). BEGIN … ROLLBACK.
-- Bitta skript = bitta tranzaksiya, shuning uchun «yangi tranzaksiya» `oxirgi_txid = null` bilan taqlid qilinadi.
--   A0 tuzilma: jadvallar, RLS, anon/authenticated huquqi yo'q, triggerlar, yamoqlar.
--   A1 backfill: har obyektda rev qatori.
--   A2 tranzaksiyaga bitta rev: bir nechta INSERT/UPDATE → bitta rev.
--   A3 no-op UPDATE rev bermaydi; haqiqiy UPDATE — +1, qator_rev = rev.
--   A4 fakt (akt_qator) → bl + uning rs bolalari holat_rev; qator_rev o'zgarmaydi.
--   A5 akt holati → qatorlar holat_rev + meta_rev; obyekt UPDATE → meta_rev.
--   A6 DELETE va faol versiyadan chiqish → ochirildi.
--   A7 >5000 qatorli statement → toliq_rev = rev, qator belgilari yozilmaydi.
begin;
do $acc$
declare
  v_k bigint; v_o bigint; v_rz bigint; v_bl bigint; v_r1 bigint; v_r2 bigint; v_akt bigint;
  v_rev bigint; v_rev2 bigint; v_x record; v_n int;
  v_nom text := 'SINOV rev ' || substr(md5(random()::text), 1, 8);
begin
  -- A0
  if to_regclass('public.t2_obyekt_rev') is null or to_regclass('public.t2_obyekt_ozgarish') is null then raise exception 'A0: jadvallar yo''q'; end if;
  if not (select relrowsecurity from pg_class where oid = 'public.t2_obyekt_rev'::regclass)
     or not (select relrowsecurity from pg_class where oid = 'public.t2_obyekt_ozgarish'::regclass) then raise exception 'A0: RLS yoqilmagan'; end if;
  if has_table_privilege('anon', 'public.t2_obyekt_rev', 'select') or has_table_privilege('authenticated', 'public.t2_obyekt_ozgarish', 'select') then
    raise exception 'A0: anon/authenticated o''qiy oladi';
  end if;
  if has_function_privilege('authenticated', 'public._t2_rev_toliq(bigint)', 'execute') then raise exception 'A0: _t2_rev_toliq ochiq'; end if;
  select count(*) into v_n from pg_trigger where not tgisinternal and tgname like '%\_rev\_%' escape '\'
     and tgrelid in ('public.t2_qator'::regclass, 'public.t2_akt_qator'::regclass, 'public.t2_akt'::regclass, 'public.t2_obyekt'::regclass,
                     'public.t2_shartnoma_bog'::regclass, 'public.t2_smeta_versiya'::regclass, 'public.t2_svod_yaxlit'::regclass,
                     'public.t2_nakrutka'::regclass, 'public.t2_nakrutka_koef'::regclass, 'public.t2_nakrutka_podval'::regclass);
  if v_n <> 30 then raise exception 'A0: rev triggerlari soni % (30 kutilgan)', v_n; end if;
  if pg_get_functiondef('snapshot.qaytar(bigint,text,text)'::regprocedure) !~ 'perform public\._t2_rev_toliq\(v_s\.obyekt_id\)' then raise exception 'A0: snapshot.qaytar yamalmagan'; end if;
  if pg_get_functiondef('public.t2_smeta_versiya_faollashtir_v1(bigint,bigint,bigint,jsonb,jsonb,uuid)'::regprocedure) !~ 'perform public\._t2_rev_toliq\(p_obyekt_id\)' then
    raise exception 'A0: versiya faollashtirish yamalmagan';
  end if;
  if exists (select 1 from public.t2_versiya_xabardorlik_audit_v1() where nom like '\_t2\_rev%' escape '\' or nom like '\_t2\_obyekt%' escape '\') then
    raise exception 'A0: versiya qo''riqchisi yangi funksiyani ushladi';
  end if;

  -- A1
  if exists (select 1 from public.t2_obyekt o where not exists (select 1 from public.t2_obyekt_rev r where r.obyekt_id = o.id)) then
    raise exception 'A1: rev qatorisiz obyekt bor';
  end if;

  select k.id into v_k from public.t2_kompaniya k where k.faol order by k.id desc limit 1;
  if v_k is null then raise notice 'faol kompaniya yo''q — funksional tekshiruv o''tkazib yuborildi'; return; end if;

  -- A2: yangi obyekt + daraxt bitta tranzaksiyada → bitta rev.
  insert into public.t2_obyekt (nom, kompaniya_id) values (v_nom, v_k) returning id into v_o;
  insert into public.t2_qator (obyekt_id, kompaniya_id, tur, nom, tartib) values (v_o, v_k, 'rz', 'РАЗДЕЛ СИНОВ', 1) returning id into v_rz;
  insert into public.t2_qator (obyekt_id, kompaniya_id, ota_id, tur, kod, nom, birlik, hajm, tartib, daraja) values (v_o, v_k, v_rz, 'bl', 'S1-1', 'ИШ СИНОВ', 'М3', 10, 2, 1) returning id into v_bl;
  insert into public.t2_qator (obyekt_id, kompaniya_id, ota_id, tur, kod, nom, birlik, hajm, narx, summa, norma, kat, tartib, daraja) values (v_o, v_k, v_bl, 'rs', 'C1', 'ЦЕМЕНТ СИНОВ', 'Т', 10, 100, 1000, 1, 'МАТ', 3, 2) returning id into v_r1;
  insert into public.t2_qator (obyekt_id, kompaniya_id, ota_id, tur, kod, nom, birlik, hajm, narx, summa, norma, kat, tartib, daraja) values (v_o, v_k, v_bl, 'rs', 'C2', 'ПЕСОК СИНОВ', 'М3', 5, 10, 50, 0.5, 'МАТ', 4, 2) returning id into v_r2;
  select * into v_x from public.t2_obyekt_rev where obyekt_id = v_o;
  if v_x.rev <> 1 or v_x.meta_rev <> 1 then raise exception 'A2: bitta tranzaksiya bitta rev bermadi: rev=% meta=%', v_x.rev, v_x.meta_rev; end if;
  if (select count(*) from public.t2_obyekt_ozgarish where obyekt_id = v_o and qator_rev = 1) <> 4 then raise exception 'A2: 4 qator belgisi kutilgan'; end if;

  -- A3: «yangi tranzaksiya»; no-op UPDATE.
  update public.t2_obyekt_rev set oxirgi_txid = null where obyekt_id = v_o;
  update public.t2_qator set nom = nom, hajm = hajm where id = v_r1;
  if (select rev from public.t2_obyekt_rev where obyekt_id = v_o) <> 1 then raise exception 'A3: no-op UPDATE rev oshirdi'; end if;
  update public.t2_qator set hajm = 12 where id = v_r1;
  update public.t2_qator set narx = 101 where id = v_r1;  -- shu tranzaksiya — o'sha rev
  select rev into v_rev from public.t2_obyekt_rev where obyekt_id = v_o;
  if v_rev <> 2 then raise exception 'A3: haqiqiy UPDATE rev=% (2 kutilgan)', v_rev; end if;
  if (select qator_rev from public.t2_obyekt_ozgarish where obyekt_id = v_o and qator_id = v_r1) <> 2
     or (select qator_rev from public.t2_obyekt_ozgarish where obyekt_id = v_o and qator_id = v_r2) <> 1 then
    raise exception 'A3: qator_rev noto''g''ri';
  end if;

  -- A4: fakt bl ga → bl va rs bolalari holat_rev = 3, qator_rev o'zgarmaydi.
  update public.t2_obyekt_rev set oxirgi_txid = null where obyekt_id = v_o;
  insert into public.t2_akt (obyekt_id, kompaniya_id, tur, oy, holat) values (v_o, v_k, 'f2', date_trunc('month', now())::date, 'qoralama') returning id into v_akt;
  insert into public.t2_akt_qator (akt_id, qator_id, obyekt_id, hajm, narx) values (v_akt, v_bl, v_o, 2, 100);
  select rev into v_rev from public.t2_obyekt_rev where obyekt_id = v_o;
  if v_rev <> 3 then raise exception 'A4: fakt rev=% (3 kutilgan)', v_rev; end if;
  if exists (select 1 from public.t2_obyekt_ozgarish where obyekt_id = v_o and qator_id in (v_bl, v_r1, v_r2) and holat_rev <> 3) then
    raise exception 'A4: bl yoki rs bolasi holat_rev olmadi';
  end if;
  if (select qator_rev from public.t2_obyekt_ozgarish where obyekt_id = v_o and qator_id = v_r2) <> 1 then raise exception 'A4: holat qator_rev ni o''zgartirdi'; end if;
  if (select holat_rev from public.t2_obyekt_ozgarish where obyekt_id = v_o and qator_id = v_rz) = 3 then raise exception 'A4: begona qator belgilandi'; end if;

  -- A5: akt holati → qatorlar holat_rev + meta_rev; obyekt nomi → meta_rev.
  update public.t2_obyekt_rev set oxirgi_txid = null where obyekt_id = v_o;
  update public.t2_akt set holat = 'tasdiqlangan' where id = v_akt;
  select * into v_x from public.t2_obyekt_rev where obyekt_id = v_o;
  if v_x.rev <> 4 or v_x.meta_rev <> 4 then raise exception 'A5: akt holati rev=% meta=%', v_x.rev, v_x.meta_rev; end if;
  if (select holat_rev from public.t2_obyekt_ozgarish where obyekt_id = v_o and qator_id = v_r1) <> 4 then raise exception 'A5: akt holati qatorlarga yetmadi'; end if;
  update public.t2_obyekt_rev set oxirgi_txid = null where obyekt_id = v_o;
  update public.t2_obyekt set nom = nom where id = v_o;  -- no-op
  if (select rev from public.t2_obyekt_rev where obyekt_id = v_o) <> 4 then raise exception 'A5: obyekt no-op UPDATE rev oshirdi'; end if;
  update public.t2_obyekt set nom = v_nom || ' 2' where id = v_o;
  select * into v_x from public.t2_obyekt_rev where obyekt_id = v_o;
  if v_x.rev <> 5 or v_x.meta_rev <> 5 then raise exception 'A5: obyekt UPDATE meta_rev bermadi'; end if;

  -- A6: DELETE → ochirildi.
  update public.t2_obyekt_rev set oxirgi_txid = null where obyekt_id = v_o;
  delete from public.t2_qator where id = v_r2;
  if not (select ochirildi from public.t2_obyekt_ozgarish where obyekt_id = v_o and qator_id = v_r2) then raise exception 'A6: o''chirish tombstone bermadi'; end if;
  if (select qator_rev from public.t2_obyekt_ozgarish where obyekt_id = v_o and qator_id = v_r2) <> 6 then raise exception 'A6: tombstone rev noto''g''ri'; end if;

  -- A7: >5000 qatorli statement → toliq.
  update public.t2_obyekt_rev set oxirgi_txid = null where obyekt_id = v_o;
  insert into public.t2_qator (obyekt_id, kompaniya_id, ota_id, tur, nom, birlik, hajm, tartib, daraja)
  select v_o, v_k, v_bl, 'rs', 'КОП СИНОВ ' || g, 'КГ', 1, 100 + g, 2 from generate_series(1, 5001) g;
  select * into v_x from public.t2_obyekt_rev where obyekt_id = v_o;
  if v_x.rev <> 7 or v_x.toliq_rev <> 7 or v_x.meta_rev <> 7 then raise exception 'A7: toliq belgisi yo''q: %', row_to_json(v_x); end if;
  if (select count(*) from public.t2_obyekt_ozgarish where obyekt_id = v_o and qator_rev = 7) <> 0 then raise exception 'A7: >5000 da qator belgilari yozildi'; end if;

  -- A8: obyekt o'chirilsa — rev qatorlari tozalanadi, cascade DELETE yiqilmaydi.
  --     (alohida aktsiz obyekt: t2_akt_qator → t2_qator FK RESTRICT).
  insert into public.t2_obyekt (nom, kompaniya_id) values (v_nom || ' ochir', v_k) returning id into v_rev2;
  insert into public.t2_qator (obyekt_id, kompaniya_id, tur, nom, tartib) values (v_rev2, v_k, 'rz', 'РАЗДЕЛ ОЧИР', 1) returning id into v_rz;
  insert into public.t2_qator (obyekt_id, kompaniya_id, ota_id, tur, nom, tartib, daraja) values (v_rev2, v_k, v_rz, 'bl', 'ИШ ОЧИР', 2, 1);
  if not exists (select 1 from public.t2_obyekt_ozgarish where obyekt_id = v_rev2) then raise exception 'A8: belgi yozilmadi'; end if;
  delete from public.t2_obyekt where id = v_rev2;
  if exists (select 1 from public.t2_obyekt_rev where obyekt_id = v_rev2) or exists (select 1 from public.t2_obyekt_ozgarish where obyekt_id = v_rev2) then
    raise exception 'A8: o''chirilgan obyektning rev qatorlari qoldi';
  end if;
  raise notice 'ACCEPT OK: 20261116300000_t2_obyekt_rev_v1';
end $acc$;
rollback;
