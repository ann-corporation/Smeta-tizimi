-- Acceptance: 20261114100000 — Telegram bot + Mini App poydevori. SINTETIK yozuvlar (o'zi yaratadi). BEGIN … ROLLBACK.
-- Avval asosiy migratsiya qo'llangan bo'lishi kerak (shu tranzaksiyada yoki prodda). Real foydalanuvchi ma'lumoti o'qilmaydi.
-- S1 jadvallar RLS + yopiq; RPC faqat service_role.  S2 kod: yaratish, format, avvalgisi bekor.
-- S3 ulash: bir martalik (ikkinchi marta KOD_ISHLATILGAN), muddati o'tgan rad, boshqa hisobdagi Telegram rad.
-- S4 aniqla/kirish: ulangan → foydalanuvchi + a'zoliklar (rol bazadan); ulanmagan → ULANMAGAN; bloklangan hisob → rad.
-- S5 sozlama whitelist + manzil opt-in.  S6 update idempotent + limit.  S7 uzish (bot/web) + audit.  S8 statistika faqat superadmin.
begin;
do $acc$
declare
  v_a bigint; v_b bigint; v_k bigint; r jsonb; v_tg bigint := 900000000000 + (random() * 1000000)::bigint;
  v_x1 text := repeat('a', 63) || '1'; v_x2 text := repeat('b', 63) || '2'; v_x3 text := repeat('c', 63) || '3'; v_x4 text := repeat('d', 63) || '4';
  f text;
begin
  -- S1
  foreach f in array array['t2_telegram_ulanish','t2_telegram_ulash_kod','t2_telegram_update','t2_telegram_hodisa'] loop
    if to_regclass('public.' || f) is null then raise exception 'ACCEPT_FAIL: % yo''q', f; end if;
    if not (select relrowsecurity from pg_class where oid = ('public.' || f)::regclass) then raise exception 'ACCEPT_FAIL: % RLS yoqilmagan', f; end if;
    if has_table_privilege('anon', 'public.' || f, 'select') or has_table_privilege('authenticated', 'public.' || f, 'select')
       or has_table_privilege('authenticated', 'public.' || f, 'insert') then raise exception 'ACCEPT_FAIL: % ochiq', f; end if;
  end loop;
  foreach f in array array['t2_telegram_kod_yarat_v1(bigint,text)','t2_telegram_ulash_v1(text,bigint,bigint,text,uuid)','t2_telegram_uz_v1(bigint,bigint,text,uuid)',
      't2_telegram_aniqla_v1(bigint)','t2_telegram_kirish_v1(bigint,uuid)','t2_telegram_holat_v1(bigint)','t2_telegram_sozlama_v1(bigint,jsonb)',
      't2_telegram_manzil_v1(bigint,text)','t2_telegram_update_qabul_v1(bigint,bigint)','t2_telegram_statistika_v1(bigint)'] loop
    if to_regprocedure('public.' || f) is null then raise exception 'ACCEPT_FAIL: % yo''q', f; end if;
    if has_function_privilege('anon', 'public.' || f, 'execute') or has_function_privilege('authenticated', 'public.' || f, 'execute') then raise exception 'ACCEPT_FAIL: % ochiq', f; end if;
    if not has_function_privilege('service_role', 'public.' || f, 'execute') then raise exception 'ACCEPT_FAIL: % service_role ga yopiq', f; end if;
    if not (select prosecdef from pg_proc where oid = to_regprocedure('public.' || f)) then raise exception 'ACCEPT_FAIL: % SECURITY DEFINER emas', f; end if;
  end loop;

  -- Sintetik foydalanuvchilar va kompaniya
  insert into public.t2_foydalanuvchi (login, ism, holat) values ('tg-acc-a-' || gen_random_uuid() || '@sinov.invalid', 'Sinov A', 'faol') returning id into v_a;
  insert into public.t2_foydalanuvchi (login, ism, holat) values ('tg-acc-b-' || gen_random_uuid() || '@sinov.invalid', 'Sinov B', 'faol') returning id into v_b;
  insert into public.t2_kompaniya (nom, kod) values ('TG SINOV', 'tgacc' || substr(md5(random()::text), 1, 8)) returning id into v_k;
  insert into public.t2_azolik (foydalanuvchi_id, kompaniya_id, rol, holat) values (v_a, v_k, 'pto', 'faol');

  -- S2
  r := public.t2_telegram_kod_yarat_v1(v_a, 'qisqa');
  if r->>'code' <> 'KOD_FORMAT' then raise exception 'ACCEPT_FAIL: S2 format: %', r; end if;
  r := public.t2_telegram_kod_yarat_v1(v_a, v_x1);
  if r->>'ok' <> 'true' then raise exception 'ACCEPT_FAIL: S2 yarat: %', r; end if;
  r := public.t2_telegram_kod_yarat_v1(v_a, v_x2); -- birinchisi bekor bo'ladi
  r := public.t2_telegram_ulash_v1(v_x1, v_tg, v_tg, 'uz', gen_random_uuid());
  if r->>'code' <> 'KOD_TOPILMADI' then raise exception 'ACCEPT_FAIL: S2 eski kod bekor qilinmadi: %', r; end if;

  -- S3
  r := public.t2_telegram_ulash_v1(v_x2, v_tg, v_tg, 'uz', null);
  if r->>'code' <> 'OPERATION_ID_REQUIRED' then raise exception 'ACCEPT_FAIL: S3 op: %', r; end if;
  r := public.t2_telegram_ulash_v1(v_x2, v_tg, v_tg, 'uz', gen_random_uuid());
  if r->>'ok' <> 'true' or (r->>'foydalanuvchi_id')::bigint <> v_a then raise exception 'ACCEPT_FAIL: S3 ulash: %', r; end if;
  r := public.t2_telegram_ulash_v1(v_x2, v_tg, v_tg, 'uz', gen_random_uuid());
  if r->>'code' <> 'KOD_ISHLATILGAN' then raise exception 'ACCEPT_FAIL: S3 kod ikki marta ishladi: %', r; end if;
  insert into public.t2_telegram_ulash_kod (foydalanuvchi_id, kod_xesh, tugaydi) values (v_b, v_x3, now() - interval '1 second');
  r := public.t2_telegram_ulash_v1(v_x3, v_tg + 1, v_tg + 1, 'ru', gen_random_uuid());
  if r->>'code' <> 'KOD_MUDDATI_OTGAN' then raise exception 'ACCEPT_FAIL: S3 muddat: %', r; end if;
  r := public.t2_telegram_kod_yarat_v1(v_b, v_x4);
  r := public.t2_telegram_ulash_v1(v_x4, v_tg, v_tg, 'ru', gen_random_uuid());
  if r->>'code' <> 'TELEGRAM_BOSHQA_HISOBDA' then raise exception 'ACCEPT_FAIL: S3 boshqa hisob: %', r; end if;
  if not exists (select 1 from public.t2_audit_log where kompaniya_id = v_k and amal_turi = 'telegram_ulandi' and kim = 'actor:' || v_a) then
    raise exception 'ACCEPT_FAIL: S3 audit yozilmadi';
  end if;

  -- S4
  r := public.t2_telegram_aniqla_v1(v_tg);
  if not (r->>'ulangan')::boolean or (r->>'foydalanuvchi_id')::bigint <> v_a then raise exception 'ACCEPT_FAIL: S4 aniqla: %', r; end if;
  r := public.t2_telegram_kirish_v1(v_tg, gen_random_uuid());
  if r->>'ok' <> 'true' or (r->>'foydalanuvchi_id')::bigint <> v_a
     or not exists (select 1 from jsonb_array_elements(r->'azoliklar') a where (a->>'kompaniya_id')::bigint = v_k and a->>'rol' = 'pto') then
    raise exception 'ACCEPT_FAIL: S4 kirish: %', r;
  end if;
  r := public.t2_telegram_kirish_v1(v_tg + 2, gen_random_uuid());
  if r->>'code' <> 'ULANMAGAN' then raise exception 'ACCEPT_FAIL: S4 ulanmagan: %', r; end if;
  update public.t2_foydalanuvchi set holat = 'bekor' where id = v_a;
  r := public.t2_telegram_kirish_v1(v_tg, gen_random_uuid());
  if r->>'ok' = 'true' then raise exception 'ACCEPT_FAIL: S4 bloklangan hisob kirdi: %', r; end if;
  r := public.t2_telegram_manzil_v1(v_a, 'topshiriq');
  if (r->>'yuborish')::boolean then raise exception 'ACCEPT_FAIL: S4 bloklanganga xabar: %', r; end if;
  update public.t2_foydalanuvchi set holat = 'faol' where id = v_a;

  -- S5
  r := public.t2_telegram_manzil_v1(v_a, 'topshiriq');
  if not (r->>'yuborish')::boolean or (r->>'chat_id')::bigint <> v_tg then raise exception 'ACCEPT_FAIL: S5 standart opt-in: %', r; end if;
  r := public.t2_telegram_sozlama_v1(v_a, '{"topshiriq": "ha"}'::jsonb);
  if r->>'code' <> 'SOZLAMA_NOTOGRI' then raise exception 'ACCEPT_FAIL: S5 boolean emas qabul qilindi: %', r; end if;
  r := public.t2_telegram_sozlama_v1(v_a, '{"topshiriq": false, "begona": true}'::jsonb);
  if r->>'ok' <> 'true' or r->'bildirishnoma' ? 'begona' then raise exception 'ACCEPT_FAIL: S5 whitelist: %', r; end if;
  r := public.t2_telegram_manzil_v1(v_a, 'topshiriq');
  if (r->>'yuborish')::boolean then raise exception 'ACCEPT_FAIL: S5 opt-out hurmat qilinmadi: %', r; end if;
  r := public.t2_telegram_manzil_v1(v_a, 'noma''lum');
  if (r->>'yuborish')::boolean then raise exception 'ACCEPT_FAIL: S5 noma''lum tur'; end if;

  -- S6
  r := public.t2_telegram_update_qabul_v1(v_tg * 10, v_tg);
  if not (r->>'yangi')::boolean then raise exception 'ACCEPT_FAIL: S6 yangi: %', r; end if;
  r := public.t2_telegram_update_qabul_v1(v_tg * 10, v_tg);
  if (r->>'yangi')::boolean then raise exception 'ACCEPT_FAIL: S6 takror yangi deb olindi'; end if;
  for i in 1..21 loop r := public.t2_telegram_update_qabul_v1(v_tg * 10 + i, v_tg); end loop;
  if not (r->>'limit')::boolean then raise exception 'ACCEPT_FAIL: S6 limit ishlamadi: %', r; end if;

  -- S7
  r := public.t2_telegram_uz_v1(v_a, v_tg, 'web', gen_random_uuid());
  if r->>'code' <> 'BITTA_TOMON_KERAK' then raise exception 'ACCEPT_FAIL: S7 ikki tomon: %', r; end if;
  r := public.t2_telegram_uz_v1(null, v_tg, 'bot', gen_random_uuid());
  if not (r->>'uzildi')::boolean then raise exception 'ACCEPT_FAIL: S7 bot uzish: %', r; end if;
  r := public.t2_telegram_aniqla_v1(v_tg);
  if (r->>'ulangan')::boolean then raise exception 'ACCEPT_FAIL: S7 uzilgandan keyin ham ulangan'; end if;
  r := public.t2_telegram_uz_v1(v_a, null, 'web', gen_random_uuid());
  if r->>'ok' <> 'true' or (r->>'uzildi')::boolean then raise exception 'ACCEPT_FAIL: S7 takror uzish: %', r; end if;
  if not exists (select 1 from public.t2_audit_log where kompaniya_id = v_k and amal_turi = 'telegram_uzildi') then raise exception 'ACCEPT_FAIL: S7 audit'; end if;
  r := public.t2_telegram_holat_v1(v_a);
  if (r->>'ulangan')::boolean then raise exception 'ACCEPT_FAIL: S7 holat'; end if;

  -- S8
  r := public.t2_telegram_statistika_v1(v_a);
  if r->>'code' <> 'SUPERADMIN_KERAK' then raise exception 'ACCEPT_FAIL: S8 oddiy foydalanuvchi statistikani ko''rdi: %', r; end if;

  raise notice 'T2_TELEGRAM_V1 acceptance: OK';
end
$acc$;
rollback;
