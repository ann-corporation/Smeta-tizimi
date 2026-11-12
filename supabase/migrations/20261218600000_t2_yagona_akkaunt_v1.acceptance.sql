-- Acceptance: yagona akkaunt (20261218600000). BEGIN ... ROLLBACK — hech narsa saqlanmaydi.
-- Har qadam xatosi `AKKAUNT qadam [n nom]: ...` bilan ko'tariladi. Sintetik ma'lumotlar (AKKAUNT-*), real nom/email/telefon YO'Q.
-- 20261217200000 (Telegram nonce RPC lari) qo'llangan bo'lishi kerak.
begin;
set local statement_timeout = '300s';

create or replace function pg_temp._k(p_ok boolean, p_n int, p_qadam text, p_tafsilot text default '') returns void language plpgsql as $$
begin
  if p_ok is distinct from true then raise exception 'AKKAUNT qadam [% %]: %', p_n, p_qadam, p_tafsilot; end if;
end $$;
create or replace function pg_temp._h(p text) returns text language sql immutable as $$ select encode(sha256(convert_to(p, 'UTF8')), 'hex') $$;

do $t$
declare
  n int := 0; q text := 'tayyorlov'; v_cnt int; v_op2 uuid;
  k1 bigint; k2 bigint; a bigint; b bigint; c bigint; d bigint; e bigint; f bigint; g bigint; s1 bigint; s2 bigint; s3 bigint; s4 bigint;
  r jsonb; r2 jsonb; v_tid uuid; v_op uuid := gen_random_uuid(); v_x bigint; v_nonce text; v_br text; v_tgu bigint := 800000000001;
  v_sub text := 'akkaunt-google-sub-1';
begin
  insert into public.t2_kompaniya (nom, kod) values ('AKKAUNT k1', 'AKKAUNT-1-' || floor(random() * 1e9)::text) returning id into k1;
  insert into public.t2_kompaniya (nom, kod) values ('AKKAUNT k2', 'AKKAUNT-2-' || floor(random() * 1e9)::text) returning id into k2;

  n := 1; q := 'tuzilma';
  perform pg_temp._k(to_regclass('public.t2_kirish_usul') is not null and (select relrowsecurity from pg_class where oid = 'public.t2_kirish_usul'::regclass), n, q, 'jadval/RLS');
  perform pg_temp._k((select count(*) from pg_trigger where tgname in ('t2_usul_sinxron_foyd', 't2_usul_sinxron_tg')) = 2, n, q, 'triggerlar');
  perform pg_temp._k(not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and (p.proname like 't2_usul%' or p.proname in ('t2_kirish_usullari_v1', 't2_hisob_birlashtir_v2', 't2_email_kod_dokaz_v1', 't2_google_dokaz_v1', '_t2_usul_sinxron_v1'))
    and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute') or not has_function_privilege('service_role', p.oid, 'execute'))), n, q, 'grantlar');

  n := 2; q := 'sinxron_va_yagonalik';
  insert into public.t2_foydalanuvchi (login, email, ism, holat, google_sub, email_tasdiqlandi_at, parol_hash) values ('akkaunt-a@example.invalid', 'akkaunt-a@example.invalid', 'AKKAUNT a', 'faol', 'akkaunt-sub-a', now(), extensions.crypt('Akkaunt-Parol-1', extensions.gen_salt('bf'))) returning id into a;
  perform pg_temp._k((select count(*) from public.t2_kirish_usul where foydalanuvchi_id = a) = 3
    and exists (select 1 from public.t2_kirish_usul where foydalanuvchi_id = a and tur = 'google' and tasdiqlangan)
    and exists (select 1 from public.t2_kirish_usul where foydalanuvchi_id = a and tur = 'email' and tasdiqlangan)
    and exists (select 1 from public.t2_kirish_usul where foydalanuvchi_id = a and tur = 'parol'), n, q, 'ustunlardan usullar hosil bo''lmadi');
  update public.t2_foydalanuvchi set google_sub = null where id = a;
  perform pg_temp._k(not exists (select 1 from public.t2_kirish_usul where foydalanuvchi_id = a and tur = 'google'), n, q, 'ustun tozalanganda usul qolib ketdi');
  update public.t2_foydalanuvchi set google_sub = 'akkaunt-sub-a' where id = a;
  begin
    insert into public.t2_kirish_usul (foydalanuvchi_id, tur, tashqi_id) values (a, 'google', 'akkaunt-sub-a');
    perform pg_temp._k(false, n, q, 'bir usul ikki marta yozildi');
  exception when unique_violation then null; end;
  insert into public.t2_foydalanuvchi (login, ism, holat) values ('akkaunt-b@example.invalid', 'AKKAUNT b', 'faol') returning id into b;
  update public.t2_foydalanuvchi set email = 'akkaunt-a@example.invalid' where id = b;
  perform pg_temp._k(not exists (select 1 from public.t2_kirish_usul where foydalanuvchi_id = b and tur = 'email'), n, q, 'boshqa hisobning usuli ikkinchisiga yozildi (jim egallash)');

  n := 3; q := 'google_avto_ulanish_tasdiqlangan_email';
  insert into public.t2_foydalanuvchi (login, email, ism, holat) values ('akkaunt-c@example.invalid', 'akkaunt-c@example.invalid', 'AKKAUNT c', 'faol') returning id into c;  -- admin qo'shgan, parolsiz, ro'yxatdan o'tish jurnalida yo'q
  r := public.t2_google_kirish_v1('Akkaunt-C@example.invalid', 'AKKAUNT c', v_sub, 'akkaunt-ip-1', gen_random_uuid());
  perform pg_temp._k(r->>'ok' = 'true' and (r->>'foydalanuvchi_id')::bigint = c and r->>'yangi' = 'false' and r->>'ulandi' = 'true', n, q, 'mavjud hisobga ulanmadi: ' || r::text);
  perform pg_temp._k(exists (select 1 from public.t2_kirish_usul where foydalanuvchi_id = c and tur = 'google' and tashqi_id = v_sub)
    and (select email_tasdiqlandi_at is not null from public.t2_foydalanuvchi where id = c), n, q, 'usul yozilmadi / email tasdiqlanmadi');
  r := public.t2_google_kirish_v1('akkaunt-c@example.invalid', 'AKKAUNT c', v_sub, 'akkaunt-ip-1', gen_random_uuid());
  perform pg_temp._k(r->>'ulandi' = 'false' and (r->>'foydalanuvchi_id')::bigint = c, n, q, 'ikkinchi kirish yana "ulandi" dedi yoki boshqa hisob');
  r := public.t2_google_kirish_v1('akkaunt-yangi@example.invalid', 'AKKAUNT yangi', 'akkaunt-sub-yangi', 'akkaunt-ip-2', gen_random_uuid());
  perform pg_temp._k(r->>'yangi' = 'true' and (select email_tasdiqlandi_at is not null from public.t2_foydalanuvchi where id = (r->>'foydalanuvchi_id')::bigint), n, q, 'mos hisob yo''q — yangi hisob ochilishi kerak edi: ' || r::text);

  n := 4; q := 'google_tasdiqlanmagan_oz_royxat_ulanmaydi';
  insert into public.t2_foydalanuvchi (login, email, ism, holat, parol_hash) values ('akkaunt-d@example.invalid', 'akkaunt-d@example.invalid', 'AKKAUNT d', 'faol', extensions.crypt('Akkaunt-Parol-2', extensions.gen_salt('bf'))) returning id into d;
  insert into public.t2_ozi_royxat_log (ip_belgi, foydalanuvchi_id, kompaniya_id, operation_id) values ('akkaunt-ip-3', d, null, gen_random_uuid());
  r := public.t2_google_kirish_v1('akkaunt-d@example.invalid', 'AKKAUNT d', 'akkaunt-sub-d', 'akkaunt-ip-3', gen_random_uuid());
  perform pg_temp._k(r->>'code' = 'EMAIL_PAROL_BILAN' and (select google_sub is null from public.t2_foydalanuvchi where id = d), n, q, 'tasdiqlanmagan o''zi ro''yxatdan o''tgan hisobga Google ulandi: ' || r::text);

  n := 5; q := 'telegram_tasdiqlanmagan_telefon_avto_ulanmaydi';
  insert into public.t2_foydalanuvchi (login, ism, holat, telefon, telefon_e164, telefon_manba, telefon_tasdiqlangan) values ('+998901239901', 'AKKAUNT e', 'faol', '+998901239901', '+998901239901', 'admin', false) returning id into e;
  v_nonce := pg_temp._h('akk-nonce-1'); v_br := pg_temp._h('akk-br-1');
  perform public.t2_tg_kirish_boshla_v1(v_nonce, v_br, '1234', 'AKKAUNT tg', 'akkaunt-ip-t1');
  perform public.t2_tg_kirish_start_v1(v_nonce, v_tgu, 700, 'uz');
  perform public.t2_tg_kirish_kontakt_v1(v_tgu, v_tgu, '+998 90 123 99 01', 700);
  r := public.t2_tg_kirish_holat_v1(v_nonce, v_br, 'akkaunt-ip-t1', gen_random_uuid());
  perform pg_temp._k(r->>'code' = 'TELEFON_HISOB_BOR' and not exists (select 1 from public.t2_telegram_ulanish where telegram_user_id = v_tgu), n, q, 'admin telefoniga Telegram avto-ulandi: ' || r::text);

  n := 6; q := 'telegram_tasdiqlangan_telefon_ulanadi';
  insert into public.t2_foydalanuvchi (login, ism, holat, telefon, telefon_e164, telefon_manba, telefon_tasdiqlangan) values ('+998901239902', 'AKKAUNT f', 'faol', '+998901239902', '+998901239902', 'telegram', true) returning id into f;
  v_nonce := pg_temp._h('akk-nonce-2'); v_br := pg_temp._h('akk-br-2');
  perform public.t2_tg_kirish_boshla_v1(v_nonce, v_br, '1235', 'AKKAUNT tg', 'akkaunt-ip-t2');
  perform public.t2_tg_kirish_start_v1(v_nonce, v_tgu + 1, 701, 'uz');
  perform public.t2_tg_kirish_kontakt_v1(v_tgu + 1, v_tgu + 1, '+998 90 123 99 02', 701);
  r := public.t2_tg_kirish_holat_v1(v_nonce, v_br, 'akkaunt-ip-t2', gen_random_uuid());
  perform pg_temp._k(r->>'ok' = 'true' and (r->>'foydalanuvchi_id')::bigint = f and r->>'yangi' = 'false', n, q, 'tasdiqlangan telefonli hisobga ulanmadi: ' || r::text);
  perform pg_temp._k(exists (select 1 from public.t2_kirish_usul where foydalanuvchi_id = f and tur = 'telegram' and tashqi_id = (v_tgu + 1)::text), n, q, 'telegram usuli yozilmadi');
  perform pg_temp._k((select count(*) from public.t2_foydalanuvchi where telefon_e164 = '+998901239902') = 1, n, q, 'dublikat hisob ochildi');

  n := 7; q := 'dokaz_email_kod';
  v_tid := gen_random_uuid();
  insert into public.t2_royxat_email_tasdiq (id, email, kod_xesh, tugaydi, yuborildi_at, maqsad) values (v_tid, 'akkaunt-c@example.invalid', pg_temp._h('kod-ok'), now() + interval '10 minutes', now(), 'kirish');
  r := public.t2_email_kod_dokaz_v1(v_tid, pg_temp._h('kod-xato'), 'akkaunt-c@example.invalid');
  perform pg_temp._k(r->>'code' = 'KOD_YAROQSIZ' and (select urinishlar from public.t2_royxat_email_tasdiq where id = v_tid) = 1, n, q, 'noto''g''ri kod: ' || r::text);
  r := public.t2_email_kod_dokaz_v1(v_tid, pg_temp._h('kod-ok'), 'boshqa@example.invalid');
  perform pg_temp._k(r->>'code' = 'KOD_YAROQSIZ', n, q, 'boshqa email uchun kod qabul qilindi');
  r := public.t2_email_kod_dokaz_v1(v_tid, pg_temp._h('kod-ok'), 'akkaunt-c@example.invalid');
  perform pg_temp._k(r->>'ok' = 'true' and (r->>'foydalanuvchi_id')::bigint = c, n, q, 'to''g''ri kod: ' || r::text);
  r := public.t2_email_kod_dokaz_v1(v_tid, pg_temp._h('kod-ok'), 'akkaunt-c@example.invalid');
  perform pg_temp._k(r->>'code' = 'KOD_YAROQSIZ', n, q, 'kod ikki marta ishlatildi');
  update public.t2_royxat_email_tasdiq set tugaydi = now() - interval '1 minute', ishlatildi_at = null where id = v_tid;
  r := public.t2_email_kod_dokaz_v1(v_tid, pg_temp._h('kod-ok'), 'akkaunt-c@example.invalid');
  perform pg_temp._k(r->>'code' = 'KOD_YAROQSIZ', n, q, 'muddati o''tgan kod qabul qilindi');

  n := 8; q := 'birlashtirish';
  -- asosiy: g (Google, k1 da 'pto'); ikkinchi: e2 (email-kod, k1 da 'boss', k2 da 'usta', Telegram ulangan)
  insert into public.t2_foydalanuvchi (login, email, ism, holat, google_sub, email_tasdiqlandi_at) values ('akkaunt-g@example.invalid', 'akkaunt-g@example.invalid', 'AKKAUNT g', 'faol', 'akkaunt-sub-g', now()) returning id into g;
  insert into public.t2_foydalanuvchi (login, email, ism, holat, email_tasdiqlandi_at) values ('akkaunt-h@example.invalid', 'akkaunt-h@example.invalid', 'AKKAUNT h', 'faol', now()) returning id into v_x;
  insert into public.t2_azolik (foydalanuvchi_id, kompaniya_id, rol, holat) values (g, k1, 'pto', 'faol'), (v_x, k1, 'boss', 'faol'), (v_x, k2, 'usta', 'faol');
  insert into public.t2_telegram_ulanish (foydalanuvchi_id, telegram_user_id, chat_id) values (v_x, v_tgu + 50, 900);
  perform pg_temp._k(exists (select 1 from public.t2_kirish_usul where foydalanuvchi_id = v_x and tur = 'telegram'), n, q, 'tayyorlov: telegram usuli sinxronlanmadi');
  r := public.t2_hisob_birlashtir_v2(g, v_x, 'email', v_op);
  perform pg_temp._k(r->>'ok' = 'true', n, q, 'birlashtirilmadi: ' || r::text);
  perform pg_temp._k((select rol from public.t2_azolik where foydalanuvchi_id = g and kompaniya_id = k1 and holat = 'faol') = 'boss', n, q, 'rol to''qnashuvi: yuqori rol (boss) saqlanmadi');
  perform pg_temp._k((select rol from public.t2_azolik where foydalanuvchi_id = g and kompaniya_id = k2 and holat = 'faol') = 'usta', n, q, 'ikkinchi kompaniya a''zoligi ko''chmadi');
  perform pg_temp._k(not exists (select 1 from public.t2_azolik where foydalanuvchi_id = v_x and holat = 'faol'), n, q, 'ikkinchi hisobda faol a''zolik qoldi');
  perform pg_temp._k((select holat = 'birlashtirildi' and birlashgan_id = g from public.t2_foydalanuvchi where id = v_x), n, q, 'ikkinchi hisob o''chirildi yoki ishora yo''q');
  perform pg_temp._k(public._t2_hisob_oxirgi(v_x) = g, n, q, 'ikkinchi hisob bilan kirish asosiyga olib bormaydi');
  perform pg_temp._k(exists (select 1 from public.t2_telegram_ulanish where foydalanuvchi_id = g and holat = 'faol' and telegram_user_id = v_tgu + 50), n, q, 'telegram ulanishi ko''chmadi');
  perform pg_temp._k(exists (select 1 from public.t2_kirish_usul where foydalanuvchi_id = g and tur = 'email' and tashqi_id = 'akkaunt-h@example.invalid')
    and not exists (select 1 from public.t2_kirish_usul where foydalanuvchi_id = v_x), n, q, 'usullar asosiyga yo''naltirilmadi');
  perform pg_temp._k((select count(*) from public.t2_foydalanuvchi where login = 'akkaunt-h@example.invalid') = 1, n, q, 'ikkinchi hisob qatori o''chirildi');
  r2 := public.t2_hisob_birlashtir_v2(g, v_x, 'email', v_op);
  perform pg_temp._k(r2->>'takror' = 'true' and (select count(*) from public.t2_azolik where foydalanuvchi_id = g and holat = 'faol') = 2, n, q, 'idempotent emas: ' || r2::text);
  r2 := public.t2_hisob_birlashtir_v2(g, v_x, 'email', gen_random_uuid());
  perform pg_temp._k(r2->>'allaqachon' = 'true', n, q, 'qayta birlashtirish xato berdi: ' || r2::text);
  r2 := public.t2_hisob_birlashtir_v2(c, v_x, 'email', gen_random_uuid());
  perform pg_temp._k(r2->>'code' = 'HISOB_YOQ', n, q, 'boshqa odam allaqachon birlashtirilgan hisobni oldi: ' || r2::text);
  r2 := public.t2_hisob_birlashtir_v2(g, g, 'email', gen_random_uuid());
  perform pg_temp._k(r2->>'code' = 'OZI', n, q, 'o''zini o''zi birlashtirdi');
  -- isbot turi: oq ro'yxatdan tashqari (noma'lum / null / bo'sh / katta-kichik harf) HAMMASI DOKAZ_NOTOGRI va hech narsa yozilmaydi
  for v_cnt in 1..5 loop
    v_op2 := gen_random_uuid();
    r2 := public.t2_hisob_birlashtir_v2(g, c, case v_cnt when 1 then 'noma_lum' when 2 then null when 3 then '' when 4 then 'GOOGLE' else 'parol' end, v_op2);
    perform pg_temp._k(r2->>'code' = 'DOKAZ_NOTOGRI', n, q, 'noma''lum isbot turi #' || v_cnt || ' qabul qilindi: ' || r2::text);
    perform pg_temp._k(not exists (select 1 from public.t2_onboarding_command_log where operation_id = v_op2) and (select holat from public.t2_foydalanuvchi where id = c) = 'faol', n, q, 'rad etilgan isbotda yozuv paydo bo''ldi #' || v_cnt);
  end loop;
  r2 := public.t2_hisob_birlashtir_v2(g, c, 'google', v_op);
  perform pg_temp._k(r2->>'code' = 'OPERATION_CONFLICT' or r2->>'takror' = 'true', n, q, 'operation_id boshqa so''rovga qayta ishlatildi: ' || r2::text);

  n := 9; q := 'superadmin_qoidasi';
  insert into public.t2_foydalanuvchi (login, ism, holat) values ('akkaunt-s1@example.invalid', 'AKKAUNT s1', 'faol') returning id into s1;
  insert into public.t2_foydalanuvchi (login, ism, holat) values ('akkaunt-s2@example.invalid', 'AKKAUNT s2', 'faol') returning id into s2;
  insert into public.t2_foydalanuvchi (login, ism, holat) values ('akkaunt-s3@example.invalid', 'AKKAUNT s3', 'faol') returning id into s3;
  insert into public.t2_foydalanuvchi (login, ism, holat) values ('akkaunt-s4@example.invalid', 'AKKAUNT s4', 'faol') returning id into s4;
  insert into public.t2_azolik (foydalanuvchi_id, kompaniya_id, rol, holat) values (s1, k1, 'superadmin', 'faol');
  r := public.t2_hisob_birlashtir_v2(s2, s1, 'email', gen_random_uuid());
  perform pg_temp._k(r->>'code' = 'SUPERADMIN_FARQI', n, q, 'superadmin belgisi oddiy hisobga o''tdi: ' || r::text);
  r := public.t2_hisob_birlashtir_v2(s1, s2, 'email', gen_random_uuid());
  perform pg_temp._k(r->>'code' = 'SUPERADMIN_FARQI', n, q, 'oddiy hisob superadmin hisobga qo''shildi (belgi o''zgarishi): ' || r::text);
  perform pg_temp._k(public.t2_platforma_superadmin(s1) and not public.t2_platforma_superadmin(s2), n, q, 'superadmin belgisi o''zgardi');
  insert into public.t2_azolik (foydalanuvchi_id, kompaniya_id, rol, holat) values (s3, k2, 'superadmin', 'faol'), (s4, k2, 'superadmin', 'faol');
  r := public.t2_hisob_birlashtir_v2(s3, s4, 'email', gen_random_uuid());
  perform pg_temp._k(r->>'ok' = 'true' and public.t2_platforma_superadmin(s3) and (select count(*) from public.t2_azolik where foydalanuvchi_id = s3 and rol = 'superadmin' and holat = 'faol') = 1, n, q, 'ikkala superadmin: belgi bitta qolishi kerak: ' || r::text);

  n := 10; q := 'usul_uzish';
  insert into public.t2_foydalanuvchi (login, email, ism, holat, google_sub, email_tasdiqlandi_at) values ('akkaunt-u1@example.invalid', 'akkaunt-u1@example.invalid', 'AKKAUNT u1', 'faol', 'akkaunt-sub-u1', now()) returning id into v_x;
  r := public.t2_kirish_usullari_v1(v_x);
  perform pg_temp._k(r->>'ok' = 'true' and jsonb_array_length(r->'usullar') = 2 and r::text not like '%akkaunt-u1@example.invalid%', n, q, 'ro''yxat yoki niqob: ' || r::text);
  r := public.t2_usul_uz_v1(v_x, (select id from public.t2_kirish_usul where foydalanuvchi_id = v_x and tur = 'email'), gen_random_uuid());
  perform pg_temp._k(r->>'code' = 'EMAIL_LOGIN', n, q, 'login bo''lgan emailni uzib bo''ldi: ' || r::text);
  insert into public.t2_foydalanuvchi (login, ism, holat, google_sub) values ('akkaunt-u2', 'AKKAUNT u2', 'faol', 'akkaunt-sub-u2') returning id into d;
  r := public.t2_usul_uz_v1(d, (select id from public.t2_kirish_usul where foydalanuvchi_id = d and tur = 'google'), gen_random_uuid());
  perform pg_temp._k(r->>'code' = 'OXIRGI_USUL' and exists (select 1 from public.t2_kirish_usul where foydalanuvchi_id = d and tur = 'google'), n, q, 'oxirgi usul uzildi: ' || r::text);
  update public.t2_foydalanuvchi set parol_hash = extensions.crypt('Akkaunt-Parol-3', extensions.gen_salt('bf')) where id = d;
  r := public.t2_usul_uz_v1(v_x, (select id from public.t2_kirish_usul where foydalanuvchi_id = d and tur = 'google'), gen_random_uuid());
  perform pg_temp._k(r->>'code' = 'USUL_TOPILMADI', n, q, 'boshqa hisobning usulini uzdi: ' || r::text);
  r := public.t2_usul_uz_v1(d, (select id from public.t2_kirish_usul where foydalanuvchi_id = d and tur = 'google'), gen_random_uuid());
  perform pg_temp._k(r->>'ok' = 'true' and (select google_sub is null from public.t2_foydalanuvchi where id = d) and exists (select 1 from public.t2_kirish_usul where foydalanuvchi_id = d and tur = 'parol'), n, q, 'parol bor — google uzilishi kerak edi: ' || r::text);

  n := 11; q := 'rol_darajasi';
  perform pg_temp._k(public._t2_rol_daraja_v1('superadmin') > public._t2_rol_daraja_v1('boss') and public._t2_rol_daraja_v1('boss') > public._t2_rol_daraja_v1('admin')
    and public._t2_rol_daraja_v1('admin') > public._t2_rol_daraja_v1('pto') and public._t2_rol_daraja_v1('pto') > public._t2_rol_daraja_v1('usta') and public._t2_rol_daraja_v1('noma_lum') = 10, n, q, 'tartib');
  n := 12; q := 'telegram_dokaz';
  insert into public.t2_foydalanuvchi (login, ism, holat) values ('akkaunt-t', 'AKKAUNT t', 'faol') returning id into v_x;
  insert into public.t2_telegram_ulanish (foydalanuvchi_id, telegram_user_id, chat_id) values (v_x, v_tgu + 60, 960);
  v_nonce := pg_temp._h('akk-dokaz-nonce'); v_br := pg_temp._h('akk-dokaz-br');
  r := public.t2_tg_dokaz_boshla_v1(a, v_nonce, v_br, '4321', 'akkaunt-ip-d1');
  perform pg_temp._k(r->>'ok' = 'true', n, q, 'dokaz boshlanmadi: ' || r::text);
  r := public.t2_tg_dokaz_boshla_v1(null, pg_temp._h('x1'), v_br, '4321', 'akkaunt-ip-d1');
  perform pg_temp._k(r->>'code' = 'ACTOR_NOT_FOUND', n, q, 'actor siz dokaz boshlandi');
  r := public.t2_tg_kirish_holat_v1(v_nonce, v_br, 'akkaunt-ip-d1', gen_random_uuid());
  perform pg_temp._k(r->>'code' = 'TOPILMADI' and r->>'foydalanuvchi_id' is null, n, q, 'isbot nonce i oddiy KIRISH yo''lida ishladi: ' || r::text);
  perform public.t2_tg_kirish_start_v1(v_nonce, v_tgu + 60, 960, 'uz');
  perform public.t2_tg_kirish_kontakt_v1(v_tgu + 60, v_tgu + 60, '+998 90 123 99 03', 960);
  r := public.t2_tg_dokaz_holat_v1(c, v_nonce, v_br);
  perform pg_temp._k(r->>'code' = 'TOPILMADI', n, q, 'boshqa actor isbot nonce ini oldi: ' || r::text);
  r := public.t2_tg_dokaz_holat_v1(a, v_nonce, pg_temp._h('boshqa-sir'));
  perform pg_temp._k(r->>'code' = 'TOPILMADI', n, q, 'brauzer sirisiz isbot berildi');
  r := public.t2_tg_dokaz_holat_v1(a, v_nonce, v_br);
  perform pg_temp._k(r->>'ok' = 'true' and (r->>'foydalanuvchi_id')::bigint = v_x, n, q, 'isbot hisobi: ' || r::text);
  r := public.t2_tg_dokaz_holat_v1(a, v_nonce, v_br);
  perform pg_temp._k(r->>'code' = 'TOPILMADI', n, q, 'isbot nonce ikki marta sarflandi');
  r := public.t2_hisob_birlashtir_v2(a, v_x, 'telegram', gen_random_uuid());
  perform pg_temp._k(r->>'ok' = 'true' and public._t2_hisob_oxirgi(v_x) = a
    and exists (select 1 from public.t2_telegram_ulanish where foydalanuvchi_id = a and holat = 'faol' and telegram_user_id = v_tgu + 60), n, q, 'telegram bilan birlashtirish: ' || r::text);
  v_nonce := pg_temp._h('akk-dokaz-nonce-2'); v_br := pg_temp._h('akk-dokaz-br-2');
  perform public.t2_tg_dokaz_boshla_v1(c, v_nonce, v_br, '4322', 'akkaunt-ip-d2');
  perform public.t2_tg_kirish_start_v1(v_nonce, v_tgu + 61, 961, 'uz');
  perform public.t2_tg_kirish_kontakt_v1(v_tgu + 61, v_tgu + 61, '+998 90 123 99 04', 961);
  r := public.t2_tg_dokaz_holat_v1(c, v_nonce, v_br);
  perform pg_temp._k(r->>'code' = 'TELEGRAM_HISOB_YOQ', n, q, 'hech qaysi hisobga ulanmagan Telegram isbot bo''ldi: ' || r::text);

  n := 13; q := 'qoshimcha_ruxsatlar_birlashadi';
  insert into public.t2_foydalanuvchi (login, ism, holat) values ('akkaunt-x1', 'AKKAUNT x1', 'faol') returning id into d;
  insert into public.t2_foydalanuvchi (login, ism, holat) values ('akkaunt-x2', 'AKKAUNT x2', 'faol') returning id into e;
  insert into public.t2_azolik (foydalanuvchi_id, kompaniya_id, rol, holat) values (d, k2, 'pto', 'faol'), (e, k2, 'pto', 'faol');
  insert into public.t2_azolik_ruxsat_qoshimcha (azolik_id, ruxsat, berilgan) select id, 'document.write', true from public.t2_azolik where foydalanuvchi_id = d and kompaniya_id = k2;
  insert into public.t2_azolik_ruxsat_qoshimcha (azolik_id, ruxsat, berilgan) select id, 'financial.read', true from public.t2_azolik where foydalanuvchi_id = e and kompaniya_id = k2;
  insert into public.t2_azolik_ruxsat_qoshimcha (azolik_id, ruxsat, berilgan) select id, 'document.write', false from public.t2_azolik where foydalanuvchi_id = e and kompaniya_id = k2;
  r := public.t2_hisob_birlashtir_v2(d, e, 'email', gen_random_uuid());
  perform pg_temp._k(r->>'ok' = 'true', n, q, 'birlashmadi: ' || r::text);
  perform pg_temp._k((select count(*) from public.t2_azolik_ruxsat_qoshimcha x join public.t2_azolik z on z.id = x.azolik_id where z.foydalanuvchi_id = d and z.kompaniya_id = k2 and z.holat = 'faol') = 2
    and (select berilgan from public.t2_azolik_ruxsat_qoshimcha x join public.t2_azolik z on z.id = x.azolik_id where z.foydalanuvchi_id = d and z.kompaniya_id = k2 and z.holat = 'faol' and x.ruxsat = 'document.write')
    and exists (select 1 from public.t2_azolik_ruxsat_qoshimcha x join public.t2_azolik z on z.id = x.azolik_id where z.foydalanuvchi_id = d and z.kompaniya_id = k2 and z.holat = 'faol' and x.ruxsat = 'financial.read'), n, q, 'qo''shimcha ruxsatlar birlashmasi emas');

  n := 14; q := 'oxirgi_kirish_yoziladi';
  insert into public.t2_foydalanuvchi (login, ism, holat, parol_hash) values ('akkaunt-y', 'AKKAUNT y', 'faol', extensions.crypt('Akkaunt-Parol-4', extensions.gen_salt('bf'))) returning id into f;
  perform public.t2_kirish_royxatga_ol('akkaunt-y', 'pto', null, null);
  perform pg_temp._k((select oxirgi_kirish_at is not null from public.t2_kirish_usul where foydalanuvchi_id = f and tur = 'parol'), n, q, 'parol kirishi yozilmadi');
  insert into public.t2_foydalanuvchi (login, ism, holat) values ('akkaunt-z', 'AKKAUNT z', 'faol') returning id into g;
  insert into public.t2_telegram_ulanish (foydalanuvchi_id, telegram_user_id, chat_id) values (g, v_tgu + 70, 970);
  r := public.t2_telegram_kirish_v1(v_tgu + 70, gen_random_uuid());
  perform pg_temp._k(r->>'ok' = 'true' and (select oxirgi_kirish_at is not null from public.t2_kirish_usul where foydalanuvchi_id = g and tur = 'telegram'), n, q, 'telegram Mini App kirishi yozilmadi: ' || r::text);
  insert into public.t2_foydalanuvchi (login, email, ism, holat) values ('akkaunt-w@example.invalid', 'akkaunt-w@example.invalid', 'AKKAUNT w', 'faol') returning id into s1;
  v_tid := gen_random_uuid();
  insert into public.t2_royxat_email_tasdiq (id, email, kod_xesh, tugaydi, yuborildi_at, maqsad) values (v_tid, 'akkaunt-w@example.invalid', pg_temp._h('kod-w'), now() + interval '10 minutes', now(), 'kirish');
  r := public.t2_email_kod_kirish_v1(v_tid, pg_temp._h('kod-w'), 'akkaunt-w@example.invalid', null, 'akkaunt-ip-w', gen_random_uuid());
  perform pg_temp._k(r->>'ok' = 'true' and (select oxirgi_kirish_at is not null from public.t2_kirish_usul where foydalanuvchi_id = s1 and tur = 'email'), n, q, 'email-kod kirishi yozilmadi: ' || r::text);
exception when others then
  if sqlerrm like 'AKKAUNT qadam%' then raise; end if;
  raise exception 'AKKAUNT qadam [% %]: kutilmagan xato: % (%)', n, q, sqlerrm, sqlstate;
end $t$;

rollback;
