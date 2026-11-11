-- Acceptance: 20261214000000_t2_buyurtmachi_bugun_tolov_v1 (forward fayldan KEYIN, bitta tranzaksiyada; oxirida ROLLBACK).
-- O'z sintetik kompaniya/foydalanuvchi/aloqa/grant/shartnoma/F3/to'lov ma'lumotini o'zi yaratadi (prodda faol aloqa yo'q).
begin;
set local statement_timeout = '300s';

-- 1. Sxema va ruxsatlar
do $$
begin
  if not exists (select 1 from public.t2_tomon_resurs where kalit = 'fakt' and faol) then raise exception 'ACC: fakt resursi faol emas'; end if;
  if not exists (select 1 from public.t2_tomon_resurs where kalit = 'tolov_holati' and faol) then raise exception 'ACC: tolov_holati resursi faol emas'; end if;
  if to_regclass('public.t2_tomon_tolov') is null then raise exception 'ACC: t2_tomon_tolov yo''q'; end if;
  if not (select relrowsecurity from pg_class where oid = 'public.t2_tomon_tolov'::regclass) then raise exception 'ACC: RLS yoqilmagan'; end if;
  if has_table_privilege('anon', 'public.t2_tomon_tolov', 'select') or has_table_privilege('authenticated', 'public.t2_tomon_tolov', 'select') then raise exception 'ACC: anon/authenticated huquqi ochiq'; end if;
  if has_function_privilege('authenticated', 'public.t2_zakazchik_bugun_v1(bigint,bigint)', 'execute') then raise exception 'ACC: authenticated bugun RPC ni chaqira oladi'; end if;
  if has_function_privilege('authenticated', 'public._t2_zakazchik_paket_v1(bigint,bigint,bigint,text,text)', 'execute') then raise exception 'ACC: authenticated paket o''rami ni chaqira oladi'; end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.t2_tolov'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%zakazchik_xabar%') then
    raise exception 'ACC: t2_tolov.manba cheklovi yangilanmagan';
  end if;
end $$;

-- 2. Biznes oqimi (sintetik ma'lumot)
do $$
declare
  v_z bigint; v_p bigint; v_uz bigint; v_up bigint; v_o bigint; v_sh bigint; v_al bigint; v_f3 bigint;
  v_r jsonb; v_ob jsonb; v_t bigint; v_t2 bigint; v_res text; v_n integer; v_op uuid := gen_random_uuid();
begin
  insert into public.t2_kompaniya (nom, kod) values ('ACC Buyurtmachi', 'ACC-BZ-' || floor(random() * 1e9)::text) returning id into v_z;
  insert into public.t2_kompaniya (nom, kod) values ('ACC Pudratchi', 'ACC-BP-' || floor(random() * 1e9)::text) returning id into v_p;
  insert into public.t2_foydalanuvchi (login) values ('acc_bz_' || floor(random() * 1e9)::text) returning id into v_uz;
  insert into public.t2_foydalanuvchi (login) values ('acc_bp_' || floor(random() * 1e9)::text) returning id into v_up;
  insert into public.t2_azolik (foydalanuvchi_id, kompaniya_id, rol) values (v_uz, v_z, 'buyurtmachi'), (v_up, v_p, 'rahbar');
  insert into public.t2_obyekt (nom, kompaniya_id) values ('ACC Obyekt', v_p) returning id into v_o;
  insert into public.t2_shartnoma (kompaniya_id, raqam, asosiy, summa_bez_nds, jami_nds_bilan) values (v_p, 'ACC-1', true, 1000, 1120) returning id into v_sh;
  insert into public.t2_shartnoma_bog (obyekt_id, shartnoma_id) values (v_o, v_sh);
  insert into public.t2_tomon_aloqa (taklif_kompaniya_id, qabul_kompaniya_id, taklif_rol, qabul_rol, taklif_actor_id, holat)
    values (v_p, v_z, 'pudratchi', 'zakazchik', v_up, 'faol') returning id into v_al;
  insert into public.t2_tomon_grant (aloqa_id, beruvchi_kompaniya_id, oluvchi_kompaniya_id, resurs, amallar, obyekt_id, berdi_actor_id)
    select v_al, v_p, v_z, r, array['korish'], v_o, v_up from unnest(array['obyekt_holat', 'shartnoma_xulosa', 'f2', 'fakt', 'tolov_holati']) r;
  insert into public.t2_forma3 (kompaniya_id, obyekt_id, shartnoma_id, davr_boshi, davr_oxiri, manba, sotuv_summa, holat, raqam)
    values (v_p, v_o, v_sh, current_date - 30, current_date, 'sotuv', 500, 'imzolangan', 'ACC-F3') returning id into v_f3;
  insert into public.t2_tolov (kompaniya_id, shartnoma_id, obyekt_id, sana, summa, tur) values (v_p, v_sh, v_o, current_date, 200, 'tolov');

  -- 2.1 Portfel: F3 va to'lov grant bilan ko'rinadi, qarz = 500 - 200; ma'lumotsiz fakt/smeta NULL (0 emas)
  v_r := public.t2_zakazchik_bugun_v1(v_uz, v_z);
  if jsonb_array_length(v_r->'obyektlar') <> 1 then raise exception 'ACC: portfelda 1 obyekt kutilgan: %', v_r; end if;
  v_ob := v_r->'obyektlar'->0;
  if (v_ob->'f3'->>'summa')::numeric <> 500 then raise exception 'ACC: F3 summasi: %', v_ob; end if;
  if (v_ob->'tolangan'->>'summa')::numeric <> 200 then raise exception 'ACC: tolangan: %', v_ob; end if;
  if (v_ob->>'qarz')::numeric <> 300 then raise exception 'ACC: qarz 300 kutilgan: %', v_ob; end if;
  if (v_ob->>'shartnoma_summa')::numeric <> 1120 then raise exception 'ACC: shartnoma summasi: %', v_ob; end if;
  if jsonb_typeof(v_ob->'fakt') <> 'null' or jsonb_typeof(v_ob->'smeta') <> 'null' then raise exception 'ACC: ma''lumotsiz fakt/smeta NULL bo''lishi kerak: %', v_ob; end if;

  -- 2.2 Begona aktor (pudratchi foydalanuvchisi buyurtmachi kompaniyasida a'zo emas) rad etiladi
  begin
    perform public.t2_zakazchik_bugun_v1(v_up, v_z);
    raise exception 'ACC: begona aktor portfelni ola oldi';
  exception when sqlstate '42501' then null;
  end;

  -- 2.3 To'lov xabari: noto'g'ri summa rad; to'g'ri summa yoziladi; takror operatsiya ikkinchi qator ochmaydi
  v_r := public.t2_zakazchik_tolov_yoz_v1(v_uz, v_z, v_o, v_f3, 0, current_date, null, null, gen_random_uuid());
  if (v_r->>'ok')::boolean then raise exception 'ACC: 0 summa qabul qilindi'; end if;
  v_r := public.t2_zakazchik_tolov_yoz_v1(v_uz, v_z, v_o, v_f3, 250, current_date, 'ACC-77', 'sinov', v_op);
  if not (v_r->>'ok')::boolean then raise exception 'ACC: to''lov xabari yozilmadi: %', v_r; end if;
  v_t := (v_r->>'id')::bigint;
  v_r := public.t2_zakazchik_tolov_yoz_v1(v_uz, v_z, v_o, v_f3, 250, current_date, 'ACC-77', 'sinov', v_op);
  if (v_r->>'id')::bigint <> v_t or not coalesce((v_r->>'qayta')::boolean, false) then raise exception 'ACC: takror operatsiya idempotent emas: %', v_r; end if;

  -- 2.4 Tasdiqlanmagan xabar qarzdan AYIRILMAYDI, alohida ko'rinadi
  v_ob := public.t2_zakazchik_bugun_v1(v_uz, v_z)->'obyektlar'->0;
  if (v_ob->>'qarz')::numeric <> 300 then raise exception 'ACC: tasdiqlanmagan xabar qarzdan ayirildi: %', v_ob; end if;
  if (v_ob->>'xabar_kutilmoqda')::numeric <> 250 then raise exception 'ACC: xabar_kutilmoqda 250 kutilgan: %', v_ob; end if;

  -- 2.5 Qaror huquqi: buyurtmachi o'z xabarini tasdiqlay olmaydi; pudratchi tasdiqlaydi -> t2_tolov ga yoziladi, qarz 50
  begin
    perform public.t2_tomon_tolov_qaror_v1(v_uz, v_z, v_t, 'tasdiq', null);
    raise exception 'ACC: buyurtmachi to''lovni o''zi tasdiqladi';
  exception when sqlstate '42501' then null;
  end;
  v_r := public.t2_tomon_tolov_qaror_v1(v_up, v_p, v_t, 'tasdiq', null);
  if not (v_r->>'ok')::boolean then raise exception 'ACC: tasdiq bajarilmadi: %', v_r; end if;
  select count(*) into v_n from public.t2_tolov where kompaniya_id = v_p and manba = 'zakazchik_xabar' and summa = 250 and shartnoma_id = v_sh;
  if v_n <> 1 then raise exception 'ACC: t2_tolov ga bitta qator kutilgan, bor: %', v_n; end if;
  v_r := public.t2_tomon_tolov_qaror_v1(v_up, v_p, v_t, 'tasdiq', null);
  if (v_r->>'ok')::boolean then raise exception 'ACC: ikkinchi tasdiq o''tdi (ikki marta sanalgan bo''lardi)'; end if;
  v_ob := public.t2_zakazchik_bugun_v1(v_uz, v_z)->'obyektlar'->0;
  if (v_ob->>'qarz')::numeric <> 50 or (v_ob->>'xabar_kutilmoqda')::numeric <> 0 then raise exception 'ACC: tasdiqdan keyin qarz 50 kutilgan: %', v_ob; end if;

  -- 2.6 Rad etish: sabab majburiy; bekor qilish faqat qaror chiqmaguncha
  v_r := public.t2_zakazchik_tolov_yoz_v1(v_uz, v_z, v_o, null, 10, current_date, null, null, gen_random_uuid());
  v_t2 := (v_r->>'id')::bigint;
  v_r := public.t2_tomon_tolov_qaror_v1(v_up, v_p, v_t2, 'rad', null);
  if (v_r->>'ok')::boolean then raise exception 'ACC: sababsiz rad o''tdi'; end if;
  v_r := public.t2_tomon_tolov_qaror_v1(v_up, v_p, v_t2, 'rad', 'summa mos emas');
  if not (v_r->>'ok')::boolean then raise exception 'ACC: rad bajarilmadi: %', v_r; end if;
  v_r := public.t2_zakazchik_tolov_bekor_v1(v_uz, v_z, v_t2);
  if (v_r->>'ok')::boolean then raise exception 'ACC: qaror chiqqan xabar bekor qilindi'; end if;

  -- 2.7 Grant qaytarilsa: F3/to'lov/qarz yashiriladi (NULL), to'lov xabari yozilmaydi
  update public.t2_tomon_grant set holat = 'bekor' where aloqa_id = v_al and resurs = 'tolov_holati';
  v_ob := public.t2_zakazchik_bugun_v1(v_uz, v_z)->'obyektlar'->0;
  if jsonb_typeof(v_ob->'f3') <> 'null' or jsonb_typeof(v_ob->'tolangan') <> 'null' or jsonb_typeof(v_ob->'qarz') <> 'null' then
    raise exception 'ACC: grantsiz F3/tolangan/qarz ko''rindi: %', v_ob;
  end if;
  v_r := public.t2_zakazchik_tolov_yoz_v1(v_uz, v_z, v_o, null, 10, current_date, null, null, gen_random_uuid());
  if (v_r->>'ok')::boolean or v_r->>'code' <> 'OBYEKT_YOPIQ' then raise exception 'ACC: grantsiz to''lov xabari yozildi: %', v_r; end if;

  -- 2.8 Ro'yxat ikki tomonga ko'rinadi: buyurtmachi 'mendan', pudratchi 'menga'
  if jsonb_array_length(public.t2_tomon_tolov_royxat_v1(v_uz, v_z, 'mendan', null, 50)) < 2 then raise exception 'ACC: buyurtmachi ro''yxati'; end if;
  if jsonb_array_length(public.t2_tomon_tolov_royxat_v1(v_up, v_p, 'menga', null, 50)) < 2 then raise exception 'ACC: pudratchi ro''yxati'; end if;

  -- 2.9 Jadval cheklovi: summa > 0
  begin
    insert into public.t2_tomon_tolov (aloqa_id, tolovchi_kompaniya_id, oluvchi_kompaniya_id, obyekt_id, summa, sana, actor_id) values (v_al, v_z, v_p, v_o, 0, current_date, v_uz);
    raise exception 'ACC: summa 0 jadvalga yozildi';
  exception when check_violation then null;
  end;
end $$;

rollback;
