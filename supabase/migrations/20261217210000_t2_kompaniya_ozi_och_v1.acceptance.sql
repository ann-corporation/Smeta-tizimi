-- Acceptance: o'zi kompaniya ochish (20261217210000). BEGIN ... ROLLBACK — hech narsa saqlanmaydi.
-- Har qadam xatosi `KIRISH qadam [<nom>]` bilan ko'tariladi. Soxta ma'lumotlar (KIRISH-OCH-*), real nom/STIR YO'Q.
begin;
set local statement_timeout = '300s';

create or replace function pg_temp._k(p_ok boolean, p_qadam text, p_tafsilot text default '') returns void language plpgsql as $$
begin
  if p_ok is distinct from true then raise exception 'KIRISH qadam [%] %', p_qadam, p_tafsilot; end if;
end $$;

do $t$
declare
  q text := 'tayyorlov'; v_a bigint; v_b bigint; v_c bigint; v_boshqa bigint; v_kboshqa bigint; r jsonb; r2 jsonb; v_op uuid := gen_random_uuid();
  v_inn text := '900000001';
begin
  insert into public.t2_foydalanuvchi (login, ism, holat) values ('kirish-och-a', 'KIRISH-OCH a', 'faol') returning id into v_a;
  insert into public.t2_foydalanuvchi (login, ism, holat) values ('kirish-och-b', 'KIRISH-OCH b', 'faol') returning id into v_b;
  insert into public.t2_foydalanuvchi (login, ism, holat) values ('kirish-och-c', 'KIRISH-OCH c', 'faol') returning id into v_c;
  insert into public.t2_foydalanuvchi (login, ism, holat) values ('kirish-och-boshqa', 'KIRISH-OCH boshqa', 'faol') returning id into v_boshqa;
  insert into public.t2_kompaniya (nom, kod) values ('KIRISH-OCH begona', 'KIRISH-OCH-' || floor(random() * 1e9)::text) returning id into v_kboshqa;
  insert into public.t2_azolik (foydalanuvchi_id, kompaniya_id, rol, holat) values (v_boshqa, v_kboshqa, 'boss', 'faol');

  q := 'tuzilma';
  perform pg_temp._k(not has_function_privilege('anon', 'public.t2_kompaniya_ozi_och_v1(bigint,text,text,text,uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.t2_kompaniya_ozi_och_v1(bigint,text,text,text,uuid)', 'execute')
    and has_function_privilege('service_role', 'public.t2_kompaniya_ozi_och_v1(bigint,text,text,text,uuid)', 'execute'), q, 'grantlar noto''g''ri');
  perform pg_temp._k((select count(*) from public.t2_azolik where foydalanuvchi_id = v_a) = 0, q, 'yangi hisobda a''zolik bor edi');

  q := 'rad_yollari';
  r := public.t2_kompaniya_ozi_och_v1(v_a, 'K', null, null, gen_random_uuid());
  perform pg_temp._k(r->>'code' = 'COMPANY_NAME_REQUIRED', q, 'qisqa nom: ' || r::text);
  r := public.t2_kompaniya_ozi_och_v1(v_a, 'KIRISH-OCH firma', '12ab', null, gen_random_uuid());
  perform pg_temp._k(r->>'code' = 'INN_INVALID', q, 'yaroqsiz STIR: ' || r::text);
  r := public.t2_kompaniya_ozi_och_v1(null, 'KIRISH-OCH firma', null, null, gen_random_uuid());
  perform pg_temp._k(r->>'code' = 'AUTH_REQUIRED', q, 'actor siz: ' || r::text);
  r := public.t2_kompaniya_ozi_och_v1(-7, 'KIRISH-OCH firma', null, null, gen_random_uuid());
  perform pg_temp._k(r->>'code' in ('AUTH_REQUIRED', 'ACTOR_NOT_FOUND'), q, 'yaroqsiz actor: ' || r::text);
  r := public.t2_kompaniya_ozi_och_v1(v_a, 'KIRISH-OCH firma', null, null, null);
  perform pg_temp._k(r->>'code' = 'OPERATION_ID_REQUIRED', q, 'operation_id siz');
  perform pg_temp._k((select count(*) from public.t2_azolik where foydalanuvchi_id = v_a) = 0, q, 'rad etilgan chaqiruv a''zolik yaratdi');

  q := 'bir_qadam_bitta_kompaniya';
  r := public.t2_kompaniya_ozi_och_v1(v_a, 'KIRISH-OCH firma', v_inn, null, v_op);
  perform pg_temp._k(r->>'ok' = 'true' and r->>'rol' = 'boss', q, 'ochilmadi: ' || r::text);
  perform pg_temp._k((select count(*) from public.t2_azolik where foydalanuvchi_id = v_a and holat = 'faol') = 1, q, 'faol a''zolik soni != 1');
  perform pg_temp._k((select rol from public.t2_azolik where foydalanuvchi_id = v_a and holat = 'faol') = 'boss'
    and (select kompaniya_id from public.t2_azolik where foydalanuvchi_id = v_a and holat = 'faol') = (r->>'kompaniya_id')::bigint, q, 'boss a''zolik yoki kompaniya mos emas');
  perform pg_temp._k(not public.t2_platforma_superadmin(v_a), q, 'yaratuvchiga superadmin huquqi berildi');
  perform pg_temp._k(exists (select 1 from public.t2_obuna where kompaniya_id = (r->>'kompaniya_id')::bigint and tarif_kod = 'free'), q, 'bepul tarif yo''q');
  perform pg_temp._k(exists (select 1 from public.t2_audit_log where kompaniya_id = (r->>'kompaniya_id')::bigint and amal_turi = 'kompaniya_ozi_och'), q, 'audit yo''q');
  perform pg_temp._k((select count(*) from public.t2_azolik where kompaniya_id = v_kboshqa and holat = 'faol') = 1
    and not exists (select 1 from public.t2_azolik where foydalanuvchi_id = v_a and kompaniya_id = v_kboshqa), q, 'begona kompaniya a''zoligi o''zgardi / yaratuvchi unga kirdi');

  q := 'idempotent';
  r2 := public.t2_kompaniya_ozi_och_v1(v_a, 'KIRISH-OCH firma', v_inn, null, v_op);
  perform pg_temp._k(r2->>'takror' = 'true' and r2->>'kompaniya_id' = r->>'kompaniya_id', q, 'takror javob: ' || r2::text);
  perform pg_temp._k((select count(*) from public.t2_azolik where foydalanuvchi_id = v_a) = 1, q, 'takror chaqiruv yangi a''zolik yaratdi');
  r2 := public.t2_kompaniya_ozi_och_v1(v_b, 'KIRISH-OCH firma', null, null, v_op);
  perform pg_temp._k(r2->>'code' = 'OPERATION_CONFLICT', q, 'boshqa actor shu operation_id bilan: ' || r2::text);

  q := 'ikkinchi_urinish_rad';
  r2 := public.t2_kompaniya_ozi_och_v1(v_a, 'KIRISH-OCH ikkinchi', null, null, gen_random_uuid());
  perform pg_temp._k(r2->>'code' = 'OZI_OCHILGAN', q, 'ikkinchi kompaniya ochildi: ' || r2::text);
  perform pg_temp._k((select count(*) from public.t2_azolik where foydalanuvchi_id = v_a) = 1, q, 'a''zolik soni o''zgardi');

  q := 'band_stir_rad';
  r2 := public.t2_kompaniya_ozi_och_v1(v_b, 'KIRISH-OCH boshqa firma', v_inn, null, gen_random_uuid());
  perform pg_temp._k(r2->>'code' = 'INN_BAND', q, 'band STIR qabul qilindi: ' || r2::text);
  perform pg_temp._k((select count(*) from public.t2_azolik where foydalanuvchi_id = v_b) = 0, q, 'band STIR rad etilganda a''zolik yaratildi');
  insert into public.t2_kompaniya_royxat (actor_id, nom, inn, operation_id) values (v_boshqa, 'KIRISH-OCH kutilmoqda', '900000002', gen_random_uuid());
  r2 := public.t2_kompaniya_ozi_och_v1(v_b, 'KIRISH-OCH kutilayotgan', '900000002', null, gen_random_uuid());
  perform pg_temp._k(r2->>'code' = 'INN_BAND', q, 'kutilayotgan so''rov STIR i bo''yicha ochildi: ' || r2::text);

  q := 'stirsiz_ochiladi_va_ruyxat_oqimi_qoladi';
  r2 := public.t2_kompaniya_ozi_och_v1(v_c, 'KIRISH-OCH stirsiz', null, null, gen_random_uuid());
  perform pg_temp._k(r2->>'ok' = 'true' and (select inn from public.t2_kompaniya where id = (r2->>'kompaniya_id')::bigint) is null, q, 'STIR siz ochilmadi: ' || r2::text);
  perform pg_temp._k(to_regprocedure('public.t2_kompaniya_royxat_soraw_v1(bigint,text,text,text,uuid)') is not null, q, 'eski so''rov oqimi yo''qoldi');

  q := 'ish_joylarim_menyusi';
  insert into public.t2_foydalanuvchi (login, ism, holat) values ('kirish-och-menyu', 'KIRISH-OCH menyu', 'faol') returning id into v_c;
  r := public.t2_ish_joyi_yarat_v1(v_c, 'KIRISH-OCH menyu firma', 'shaxsiy', gen_random_uuid());
  perform pg_temp._k(r->>'ok' = 'true' and (select turi from public.t2_kompaniya where id = (r->>'kompaniya_id')::bigint) = 'shaxsiy'
    and (select count(*) from public.t2_azolik where foydalanuvchi_id = v_c and holat = 'faol' and rol = 'boss') = 1, q, 'ish joyi menyusi kompaniya ochmadi: ' || r::text);
  r2 := public.t2_ish_joyi_yarat_v1(v_c, 'KIRISH-OCH menyu ikkinchi', 'tashkilot', gen_random_uuid());
  perform pg_temp._k(r2->>'code' = 'OZI_OCHILGAN', q, 'ish joyi menyusi ikkinchi kompaniya ochdi: ' || r2::text);
exception when others then
  if sqlerrm like 'KIRISH qadam%' then raise; end if;
  raise exception 'KIRISH qadam [%] kutilmagan xato: % (%)', q, sqlerrm, sqlstate;
end $t$;

rollback;
