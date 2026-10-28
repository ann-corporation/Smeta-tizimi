-- Acceptance: 20261114000000 — tizim xaritasi (o'qish RPC + ko'rish ruxsatlari). SINTETIK yozuvlar. BEGIN … ROLLBACK.
-- Avval asosiy migratsiya qo'llangan bo'lishi kerak (shu tranzaksiyada yoki prodda).
-- S1 obyektlar, RLS va ruxsatlar; S2 boss (grantsiz) rad etiladi — o'z kompaniyasi bilan ham; S3 superadmin ko'radi
-- (tizim ildizi, 7 modul, sintetik audit F2 moduliga tushadi); S4 grant → ko'radi, ber idempotent;
-- S5 olish → yana rad, ol idempotent; S6 superadmin bo'lmagan grant bera olmaydi (42501); S7 noto'g'ri so'rov.
begin;
do $acc$
declare
  v_super bigint; v_boss bigint; v_k bigint; r jsonb; g jsonb; v_n integer;
begin
  -- S1
  if to_regclass('public.t2_tizim_xaritasi_ruxsat') is null then raise exception 'ACCEPT_FAIL: jadval yo''q'; end if;
  if not (select relrowsecurity from pg_class where oid = 'public.t2_tizim_xaritasi_ruxsat'::regclass) then raise exception 'ACCEPT_FAIL: RLS yoqilmagan'; end if;
  if has_table_privilege('anon', 'public.t2_tizim_xaritasi_ruxsat', 'select') or has_table_privilege('authenticated', 'public.t2_tizim_xaritasi_ruxsat', 'select') then
    raise exception 'ACCEPT_FAIL: ruxsat jadvali anon/authenticated ga ochiq';
  end if;
  if to_regprocedure('public.t2_tizim_xaritasi_v1(bigint,bigint)') is null then raise exception 'ACCEPT_FAIL: o''qish funksiyasi yo''q'; end if;
  if has_function_privilege('anon', 'public.t2_tizim_xaritasi_v1(bigint,bigint)', 'execute')
     or has_function_privilege('authenticated', 'public.t2_tizim_xaritasi_v1(bigint,bigint)', 'execute') then raise exception 'ACCEPT_FAIL: o''qish anon/authenticated ga ochiq'; end if;
  if not has_function_privilege('service_role', 'public.t2_tizim_xaritasi_v1(bigint,bigint)', 'execute') then raise exception 'ACCEPT_FAIL: service_role o''qiy olmaydi'; end if;
  if has_function_privilege('authenticated', 'public.t2_tizim_xaritasi_ruxsat_ber_v1(bigint,bigint,text,uuid)', 'execute')
     or has_function_privilege('anon', 'public.t2_tizim_xaritasi_ruxsat_ol_v1(bigint,bigint,text,uuid)', 'execute')
     or has_function_privilege('anon', 'public.t2_tizim_xaritasi_ruxsat_royxat_v1(bigint)', 'execute')
     or has_function_privilege('anon', 'public.t2_tizim_xaritasi_ruxsat_tekshir_v1(bigint)', 'execute') then
    raise exception 'ACCEPT_FAIL: ruxsat RPC lari ochiq';
  end if;

  select a.foydalanuvchi_id into v_super from public.t2_azolik a join public.t2_foydalanuvchi u on u.id = a.foydalanuvchi_id
   where a.rol = 'superadmin' and a.holat = 'faol' and u.holat = 'faol' order by a.id limit 1;
  select a.foydalanuvchi_id, a.kompaniya_id into v_boss, v_k from public.t2_azolik a join public.t2_foydalanuvchi u on u.id = a.foydalanuvchi_id
   where a.rol = 'boss' and a.holat = 'faol' and u.holat = 'faol' and not coalesce(public.t2_platforma_superadmin(a.foydalanuvchi_id), false)
   order by a.id limit 1;

  -- S7
  r := public.t2_tizim_xaritasi_v1(0, null);
  if r->>'code' <> 'REQUEST_INVALID' then raise exception 'ACCEPT_FAIL: S7 actor 0: %', r; end if;

  -- S2: boss — grant yo'q bo'lsa rad (kompaniya filtri bilan ham)
  if v_boss is not null then
    delete from public.t2_tizim_xaritasi_ruxsat where foydalanuvchi_id = v_boss; -- tranzaksiya ichida (rollback)
    r := public.t2_tizim_xaritasi_v1(v_boss, v_k);
    if r->>'code' <> 'AUTHORIZATION_DENIED' then raise exception 'ACCEPT_FAIL: S2 boss o''z kompaniyasini ko''rdi: %', left(r::text, 200); end if;
    r := public.t2_tizim_xaritasi_v1(v_boss, null);
    if r->>'code' <> 'AUTHORIZATION_DENIED' then raise exception 'ACCEPT_FAIL: S2 boss tizimni ko''rdi'; end if;
    r := public.t2_tizim_xaritasi_ruxsat_tekshir_v1(v_boss);
    if (r->>'ruxsat')::boolean then raise exception 'ACCEPT_FAIL: S2 tekshir boss uchun true: %', r; end if;
  else raise notice 'S2: faol boss yo''q — o''tkazib yuborildi'; end if;

  if v_super is null then raise notice 'superadmin yo''q — S3..S6 o''tkazib yuborildi'; return; end if;

  -- S3: superadmin
  if v_k is not null then
    insert into public.t2_audit_log (kompaniya_id, kim, amal_turi, modul, tafsilot, yaratilgan_vaqt)
      values (v_k, 'actor:' || v_super, 'acceptance_sinov', 'f2', 'SINOV', now());
  end if;
  g := public.t2_tizim_xaritasi_v1(v_super, null);
  if g->>'ok' <> 'true' or g->'korinish'->>'doira' <> 'tizim' then raise exception 'ACCEPT_FAIL: S3 superadmin: %', left(g::text, 300); end if;
  if not exists (select 1 from jsonb_array_elements(g->'tugunlar') t where t->>'id' = 'tizim:0' and t->>'tur' = 'tizim') then raise exception 'ACCEPT_FAIL: S3 tizim ildizi yo''q'; end if;
  if jsonb_typeof(g->'oxirgi_hodisalar') <> 'array' or jsonb_array_length(g->'oxirgi_hodisalar') > 20 then raise exception 'ACCEPT_FAIL: S3 hodisalar'; end if;
  if v_k is not null then
    g := public.t2_tizim_xaritasi_v1(v_super, v_k);
    select count(*) into v_n from jsonb_array_elements(g->'tugunlar') t where t->>'tur' = 'modul';
    if v_n <> 7 then raise exception 'ACCEPT_FAIL: S3 modul soni % (7 kerak)', v_n; end if;
    if not exists (select 1 from jsonb_array_elements(g->'tugunlar') t
                    where t->>'id' = 'modul:' || v_k || ':f2' and (t #>> '{meta,soni_24s}')::int >= 1
                      and t #>> '{meta,oxirgi_amal,amal}' = 'acceptance_sinov') then
      raise exception 'ACCEPT_FAIL: S3 sintetik audit F2 moduliga tushmadi';
    end if;
    if exists (select 1 from jsonb_array_elements(g->'tugunlar') t where t #>> '{meta,holat}' not in ('ok', 'diqqat', 'xato')) then
      raise exception 'ACCEPT_FAIL: S3 noma''lum holat';
    end if;
  end if;
  r := public.t2_tizim_xaritasi_ruxsat_tekshir_v1(v_super);
  if not (r->>'ruxsat')::boolean or not (r->>'superadmin')::boolean then raise exception 'ACCEPT_FAIL: S3 tekshir: %', r; end if;

  -- S4: grant → ko'radi; idempotent
  if v_boss is not null then
    r := public.t2_tizim_xaritasi_ruxsat_ber_v1(v_super, v_boss, 'acceptance', null);
    if r->>'code' <> 'OPERATION_ID_REQUIRED' then raise exception 'ACCEPT_FAIL: S4 op: %', r; end if;
    r := public.t2_tizim_xaritasi_ruxsat_ber_v1(v_super, v_boss, 'acceptance', gen_random_uuid());
    if r->>'ok' <> 'true' or (r->>'ozgarmadi')::boolean then raise exception 'ACCEPT_FAIL: S4 ber: %', r; end if;
    r := public.t2_tizim_xaritasi_ruxsat_ber_v1(v_super, v_boss, 'acceptance', gen_random_uuid());
    if r->>'ok' <> 'true' or not (r->>'ozgarmadi')::boolean then raise exception 'ACCEPT_FAIL: S4 idempotent emas: %', r; end if;
    if not exists (select 1 from public.t2_audit_log where amal_turi = 'tizim_xaritasi_ruxsat_ber' and tafsilot like 'foydalanuvchi=' || v_boss || ' %') then
      raise exception 'ACCEPT_FAIL: S4 audit yozilmadi';
    end if;
    r := public.t2_tizim_xaritasi_v1(v_boss, null);
    if r->>'ok' <> 'true' then raise exception 'ACCEPT_FAIL: S4 grant olgan ko''rmadi: %', left(r::text, 200); end if;
    r := public.t2_tizim_xaritasi_ruxsat_royxat_v1(v_super);
    if not exists (select 1 from jsonb_array_elements(r->'qatorlar') q where (q->>'foydalanuvchi_id')::bigint = v_boss) then raise exception 'ACCEPT_FAIL: S4 ro''yxatda yo''q'; end if;

    -- S6: grant olgan (superadmin emas) boshqaga bera olmaydi
    begin
      r := public.t2_tizim_xaritasi_ruxsat_ber_v1(v_boss, v_super, 'x', gen_random_uuid());
      raise exception 'ACCEPT_FAIL: S6 superadmin bo''lmagan grant berdi';
    exception when insufficient_privilege then null;
    end;
    begin
      r := public.t2_tizim_xaritasi_ruxsat_royxat_v1(v_boss);
      raise exception 'ACCEPT_FAIL: S6 superadmin bo''lmagan ro''yxatni ko''rdi';
    exception when insufficient_privilege then null;
    end;

    -- S5: olish → rad; idempotent
    r := public.t2_tizim_xaritasi_ruxsat_ol_v1(v_super, v_boss, 'acceptance', gen_random_uuid());
    if r->>'ok' <> 'true' or (r->>'ozgarmadi')::boolean then raise exception 'ACCEPT_FAIL: S5 ol: %', r; end if;
    r := public.t2_tizim_xaritasi_ruxsat_ol_v1(v_super, v_boss, 'acceptance', gen_random_uuid());
    if not (r->>'ozgarmadi')::boolean then raise exception 'ACCEPT_FAIL: S5 ol idempotent emas: %', r; end if;
    r := public.t2_tizim_xaritasi_v1(v_boss, null);
    if r->>'code' <> 'AUTHORIZATION_DENIED' then raise exception 'ACCEPT_FAIL: S5 olingandan keyin ham ko''rdi'; end if;
  end if;
  raise notice 'tizim xaritasi acceptance: OK';
end
$acc$;
rollback;
