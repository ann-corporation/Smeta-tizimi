-- ACCEPTANCE: 20261127000000 (hujjat aylanishi v1) - BEGIN..ROLLBACK, FAQAT sintetik fixture. Prodda ishlatilmaydi.
-- Tekshiradi: (1) RLS/huquqlar; (2) zanjir: yaratish, tartib, begona kompaniya navbatsiz tasdiqlay olmaydi, rad/qaytarish izohi, qayta yuborish raundi;
-- (3) faol aloqasiz zanjir/xat rad; (4) xat raqamlari ketma-ket, javob xati ota xatni yopadi, kiruvchi raqam; (5) kiruvchi quti; (6) eslatma idempotent;
-- (7) hujjat jurnali o'zgarmas. Natija oxirgi exception matnida "ACC_HUJJAT ...".
begin;

do $acc$
declare
  ka bigint; kb bigint; kc bigint; kx bigint;
  ua bigint; ub bigint; uc bigint; ux bigint; ukuz bigint;
  oa bigint; z bigint; r jsonb; rep text[] := array[]::text[]; n integer; x1 bigint; x2 bigint; mid bigint; v_b boolean;
begin
  insert into public.t2_kompaniya (nom, kod, faol) values ('_ACC_H_A_', gen_random_uuid()::text, true) returning id into ka;
  insert into public.t2_kompaniya (nom, kod, faol) values ('_ACC_H_B_', gen_random_uuid()::text, true) returning id into kb;
  insert into public.t2_kompaniya (nom, kod, faol) values ('_ACC_H_C_', gen_random_uuid()::text, true) returning id into kc;
  insert into public.t2_kompaniya (nom, kod, faol) values ('_ACC_H_X_', gen_random_uuid()::text, true) returning id into kx;
  insert into public.t2_foydalanuvchi (login, ism, holat) values ('acc_h_a', 'A', 'faol') returning id into ua;
  insert into public.t2_foydalanuvchi (login, ism, holat) values ('acc_h_b', 'B', 'faol') returning id into ub;
  insert into public.t2_foydalanuvchi (login, ism, holat) values ('acc_h_c', 'C', 'faol') returning id into uc;
  insert into public.t2_foydalanuvchi (login, ism, holat) values ('acc_h_x', 'X', 'faol') returning id into ux;
  insert into public.t2_foydalanuvchi (login, ism, holat) values ('acc_h_kuz', 'K', 'faol') returning id into ukuz;
  insert into public.t2_azolik (foydalanuvchi_id, kompaniya_id, rol, holat) values (ua, ka, 'boss', 'faol'), (ub, kb, 'boss', 'faol'), (uc, kc, 'boss', 'faol'), (ux, kx, 'boss', 'faol'), (ukuz, ka, 'kuzatuvchi', 'faol');
  insert into public.t2_obyekt (nom, kompaniya_id) values ('_ACC_H_O_', ka) returning id into oa;
  -- A-B va A-C faol aloqa; X begona.
  insert into public.t2_tomon_aloqa (taklif_kompaniya_id, qabul_kompaniya_id, taklif_rol, qabul_rol, holat, taklif_actor_id) values (ka, kb, 'pudratchi', 'texnadzor', 'faol', ua);
  insert into public.t2_tomon_aloqa (taklif_kompaniya_id, qabul_kompaniya_id, taklif_rol, qabul_rol, holat, taklif_actor_id) values (ka, kc, 'pudratchi', 'zakazchik', 'faol', ua);

  -- 1. RLS va huquqlar
  select count(*) into n from pg_class c join pg_namespace s on s.oid = c.relnamespace
   where s.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity and c.relname in ('t2_hujjat_zanjir','t2_hujjat_zanjir_qadam','t2_hujjat_zanjir_tarix','t2_xat','t2_xat_raqam');
  rep := rep || (case when n = 0 then 'OK   RLS yoqilgan' else ('FAIL RLS: ' || n) end);
  v_b := has_function_privilege('anon', 'public.t2_xat_yubor_v1(bigint,bigint,bigint,text,text,text,date,bigint,bigint,bigint,uuid)', 'execute')
      or has_function_privilege('authenticated', 'public.t2_hujjat_zanjir_qaror_v1(bigint,bigint,bigint,text,text)', 'execute')
      or has_table_privilege('authenticated', 'public.t2_xat', 'select');
  rep := rep || (case when not v_b then 'OK   anon/authenticated yopiq' else 'FAIL huquq ochiq' end);

  -- 2. Zanjir: A -> B (texnadzor) -> C (zakazchik)
  r := t2_hujjat_zanjir_yarat_v1(ua, ka, 'lab_protokol', 'ACC protokol', oa, null, null, null,
        jsonb_build_array(jsonb_build_object('kompaniya_id', kb, 'rol', 'texnadzor'), jsonb_build_object('kompaniya_id', kc, 'rol', 'zakazchik', 'muddat', (current_date - 1)::text)), gen_random_uuid());
  z := (r->>'id')::bigint;
  rep := rep || (case when (r->>'ok')::boolean and z is not null then 'OK   zanjir yaratildi' else ('FAIL yaratish: ' || r::text) end);
  r := t2_hujjat_zanjir_yarat_v1(ua, ka, 'akt', 'ACC begona', null, null, null, null, jsonb_build_array(jsonb_build_object('kompaniya_id', kx, 'rol', 'texnadzor')), gen_random_uuid());
  rep := rep || (case when r->>'code' = 'ALOQA_YOQ' then 'OK   aloqasiz kompaniya qadamga qo''yilmaydi' else ('FAIL aloqasiz: ' || r::text) end);
  r := t2_hujjat_zanjir_qaror_v1(uc, kc, z, 'tasdiqlash', null);
  rep := rep || (case when r->>'code' = 'NAVBAT_EMAS' then 'OK   navbatsiz tasdiq rad' else ('FAIL navbat: ' || r::text) end);
  r := t2_hujjat_zanjir_qaror_v1(ub, kb, z, 'qaytarish', null);
  rep := rep || (case when r->>'code' = 'IZOH_KERAK' then 'OK   qaytarishda izoh majburiy' else ('FAIL izoh: ' || r::text) end);
  begin
    r := t2_hujjat_zanjir_qaror_v1(ukuz, ka, z, 'tasdiqlash', null);
    rep := rep || ('FAIL kuzatuvchi qaror chiqardi: ' || r::text);
  exception when others then rep := rep || 'OK   kuzatuvchi qaror chiqara olmaydi'; end;
  r := t2_hujjat_zanjir_qaror_v1(ub, kb, z, 'qaytarish', 'Protokolda sana yo''q');
  rep := rep || (case when r->>'holat' = 'qaytarildi' then 'OK   qaytarildi' else ('FAIL qaytarish: ' || r::text) end);
  r := t2_hujjat_zanjir_qayta_v1(ub, kb, z, 'x', null);
  rep := rep || (case when r->>'code' = 'TOPILMADI' then 'OK   qayta yuborishni faqat egasi qiladi' else ('FAIL qayta (begona): ' || r::text) end);
  r := t2_hujjat_zanjir_qayta_v1(ua, ka, z, 'Tuzatildi', null);
  rep := rep || (case when (r->>'raund')::int = 2 then 'OK   qayta yuborildi, raund 2' else ('FAIL qayta: ' || r::text) end);
  r := t2_hujjat_kiruvchi_v1(ub, kb);
  rep := rep || (case when (r->'sanoq'->>'zanjir')::int = 1 then 'OK   B kiruvchi qutisida 1 zanjir' else ('FAIL quti B: ' || r::text) end);
  r := t2_hujjat_zanjir_qaror_v1(ub, kb, z, 'tasdiqlash', 'Mos');
  rep := rep || (case when r->>'holat' = 'jarayonda' and (r->>'keyingi_tartib')::int = 2 then 'OK   1-qadam tasdiqlandi, navbat C da' else ('FAIL tasdiq: ' || r::text) end);
  select count(*) into n from public.t2_outbox where entity_jadval = 't2_hujjat_zanjir' and entity_id = z and mavzu = 'hujjat.tasdiq_kutmoqda';
  rep := rep || (case when n >= 3 then 'OK   outbox hodisalari yozildi' else ('FAIL outbox: ' || n) end);
  perform t2_hujjat_eslatma_v1(2);
  perform t2_hujjat_eslatma_v1(2);
  select count(*) into n from public.t2_outbox where entity_jadval = 't2_hujjat_zanjir' and entity_id = z and mavzu = 'hujjat.muddat_otdi';
  rep := rep || (case when n = 1 then 'OK   eslatma idempotent (bir kunda bitta)' else ('FAIL eslatma soni: ' || n) end);
  r := t2_hujjat_zanjir_qaror_v1(uc, kc, z, 'tasdiqlash', null);
  rep := rep || (case when r->>'holat' = 'tasdiqlandi' then 'OK   zanjir yakunlandi' else ('FAIL yakun: ' || r::text) end);
  r := t2_hujjat_zanjir_tafsilot_v1(ux, kx, z);
  rep := rep || (case when r->>'code' = 'TOPILMADI' then 'OK   begona kompaniya zanjirni ko''rmaydi' else ('FAIL begona ko''rdi: ' || r::text) end);
  begin
    update public.t2_hujjat_zanjir_tarix set izoh = 'x' where zanjir_id = z;
    rep := rep || 'FAIL jurnal o''zgardi';
  exception when others then rep := rep || 'OK   jurnal o''zgarmas'; end;

  -- 3-4. Xat
  r := t2_xat_yubor_v1(ua, ka, kb, 'talabnoma', 'ACC talabnoma 1', 'matn', current_date + 3, oa, null, null, gen_random_uuid());
  x1 := (r->>'id')::bigint;
  rep := rep || (case when (r->>'ok')::boolean and (r->>'raqam') like 'CHIQ-%-0001' then 'OK   birinchi chiquvchi raqam 0001' else ('FAIL xat1: ' || r::text) end);
  r := t2_xat_yubor_v1(ua, ka, kc, 'xat', 'ACC xat 2', null, null, null, null, null, gen_random_uuid());
  x2 := (r->>'id')::bigint;
  rep := rep || (case when (r->>'raqam') like 'CHIQ-%-0002' then 'OK   ikkinchi raqam 0002' else ('FAIL xat2: ' || r::text) end);
  r := t2_xat_yubor_v1(ua, ka, kx, 'xat', 'ACC begona xat', null, null, null, null, null, gen_random_uuid());
  rep := rep || (case when r->>'code' = 'ALOQA_YOQ' then 'OK   faol aloqasiz xat rad' else ('FAIL begona xat: ' || r::text) end);
  r := t2_xat_qabul_v1(ub, kb, x1);
  rep := rep || (case when (r->>'kiruvchi_raqam') like 'KIR-%-0001' then 'OK   kiruvchi raqam berildi' else ('FAIL qabul: ' || r::text) end);
  r := t2_xat_qabul_v1(ux, kx, x1);
  rep := rep || (case when r->>'code' = 'TOPILMADI' then 'OK   begona xatni qabul qila olmaydi' else ('FAIL begona qabul: ' || r::text) end);
  r := t2_xat_yubor_v1(ub, kb, ka, 'javob_xati', 'ACC javob', 'ok', null, null, null, x1, gen_random_uuid());
  rep := rep || (case when (r->>'ok')::boolean then 'OK   javob xati yuborildi' else ('FAIL javob: ' || r::text) end);
  rep := rep || (case when (select holat from public.t2_xat where id = x1) = 'javob_berildi' then 'OK   ota xat javob_berildi' else 'FAIL ota xat holati' end);
  r := t2_xat_royxat_v1(ua, ka, 'chiquvchi', null, 50);
  rep := rep || (case when jsonb_array_length(r) = 2 then 'OK   chiquvchi reestr 2 ta' else ('FAIL reestr: ' || r::text) end);
  r := t2_xat_royxat_v1(ua, ka, 'kiruvchi', null, 50);
  rep := rep || (case when jsonb_array_length(r) = 1 then 'OK   kiruvchi reestr 1 ta' else ('FAIL kiruvchi: ' || r::text) end);

  -- 5. Murojaat turlari katalogi
  select count(*) into n from public.t2_tomon_murojaat_turi where kalit in ('talabnoma','ogohlantirish') and faol;
  rep := rep || (case when n = 2 then 'OK   talabnoma/ogohlantirish turlari bor' else ('FAIL turlar: ' || n) end);

  raise exception 'ACC_HUJJAT %', array_to_string(rep, E'\n');
end $acc$;

rollback;
