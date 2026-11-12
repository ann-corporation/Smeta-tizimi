-- Acceptance: emailsiz kirish (20261217200000). BEGIN ... ROLLBACK — hech narsa saqlanmaydi.
-- Har qadam xatosi `KIRISH qadam [<nom>]` bilan ko'tariladi. Soxta ma'lumotlar (KIRISH-AKC-*), haqiqiy telefon/ism YO'Q.
begin;
set local statement_timeout = '300s';

create or replace function pg_temp._k(p_ok boolean, p_qadam text, p_tafsilot text default '') returns void language plpgsql as $$
begin
  if p_ok is distinct from true then raise exception 'KIRISH qadam [%] %', p_qadam, p_tafsilot; end if;
end $$;
create or replace function pg_temp._h(p text) returns text language sql immutable as $$ select encode(sha256(convert_to(p, 'UTF8')), 'hex') $$;

do $t$
declare
  q text := 'tayyorlov';
  v_komp bigint; v_boss bigint; v_kadr bigint; v_pto bigint; v_mavjud bigint; v_x bigint;
  r jsonb; r2 jsonb; i int; v_n int; v_rol text; v_id bigint; v_tg_u bigint := 900000000001;
  v_tel text := '+998901230001'; v_tel2 text := '+998901230002'; v_tel3 text := '+998901230003'; v_tel4 text := '+998901230004';
  v_ip text := 'kirish-akc-ip-1'; v_nonce text; v_br text; v_hash_before text; v_op uuid;
begin
  insert into public.t2_kompaniya (nom, kod) values ('KIRISH-AKC', 'KIRISH-AKC-' || floor(random() * 1e9)::text) returning id into v_komp;
  insert into public.t2_foydalanuvchi (login, ism, holat) values ('kirish-akc-boss', 'KIRISH-AKC boss', 'faol') returning id into v_boss;
  insert into public.t2_foydalanuvchi (login, ism, holat) values ('kirish-akc-kadr', 'KIRISH-AKC kadr', 'faol') returning id into v_kadr;
  insert into public.t2_foydalanuvchi (login, ism, holat) values ('kirish-akc-pto', 'KIRISH-AKC pto', 'faol') returning id into v_pto;
  insert into public.t2_azolik (foydalanuvchi_id, kompaniya_id, rol, holat) values (v_boss, v_komp, 'boss', 'faol'), (v_kadr, v_komp, 'kadr', 'faol'), (v_pto, v_komp, 'pto', 'faol');

  -- ── qurilma ──
  q := 'tuzilma';
  perform pg_temp._k(to_regclass('public.t2_kirish_taklif') is not null and to_regclass('public.t2_kirish_nonce') is not null and to_regclass('public.t2_kirish_limit') is not null, q, 'jadval yo''q');
  perform pg_temp._k((select bool_and(relrowsecurity) from pg_class where oid in ('public.t2_kirish_taklif'::regclass, 'public.t2_kirish_nonce'::regclass, 'public.t2_kirish_limit'::regclass)), q, 'RLS yoqilmagan');
  perform pg_temp._k(to_regclass('public.t2_foydalanuvchi_telefon_e164_uq') is not null, q, 'telefon_e164 unikal indeksi yo''q');
  select count(*) into v_n from pg_proc p where p.pronamespace = 'public'::regnamespace and (p.proname like 't2_kirish_taklif%' or p.proname like 't2_tg_kirish%' or p.proname in ('t2_kirish_tel_limit_v1', 't2_telefon_norm_v1', '_t2_kirish_limit_v1'))
    and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute') or not has_function_privilege('service_role', p.oid, 'execute'));
  perform pg_temp._k(v_n = 0, 'grantlar', 'anon/authenticated ijro huquqi yoki service_role yo''q: ' || v_n);

  -- ── telefon normallashtirish ──
  q := 'telefon_norm';
  perform pg_temp._k(public.t2_telefon_norm_v1('+998 90 123-45-67') = '+998901234567', q, 'xalqaro shakl');
  perform pg_temp._k(public.t2_telefon_norm_v1('90 123 45 67') = '+998901234567', q, 'mahalliy 9 raqam');
  perform pg_temp._k(public.t2_telefon_norm_v1('998901234567') = '+998901234567', q, '+ siz');
  perform pg_temp._k(public.t2_telefon_norm_v1('+1 202 555 0100') is null and public.t2_telefon_norm_v1('abc') is null and public.t2_telefon_norm_v1('+998 10 123 45 67') is null and public.t2_telefon_norm_v1('') is null and public.t2_telefon_norm_v1(null) is null, q, 'yaroqsiz kirish qabul qilindi');

  -- ── telefon yagonaligi ──
  q := 'telefon_yagonalik';
  insert into public.t2_foydalanuvchi (login, ism, holat, telefon_e164, telefon_manba) values (v_tel4, 'KIRISH-AKC yagona', 'faol', v_tel4, 'admin') returning id into v_x;
  begin
    insert into public.t2_foydalanuvchi (login, ism, holat, telefon_e164, telefon_manba) values ('kirish-akc-dubl', 'KIRISH-AKC dubl', 'faol', v_tel4, 'admin');
    perform pg_temp._k(false, q, 'bir telefon ikki hisobga yozildi');
  exception when unique_violation then null; end;
  delete from public.t2_foydalanuvchi where id = v_x;

  -- ── taklif yaratish: rol ruxsatlari ──
  q := 'rol_katalog_superadmin';
  r := public.t2_kirish_taklif_yarat_v1(v_boss, v_komp, 'Sinov Odam', v_tel, 'superadmin', pg_temp._h('k1'), pg_temp._h('t1'), 72, gen_random_uuid());
  perform pg_temp._k(r->>'ok' = 'false' and r->>'code' = 'ROL_NOTOGRI', q, 'superadmin taklif qilindi: ' || r::text);
  r := public.t2_kirish_taklif_yarat_v1(v_boss, v_komp, 'Sinov Odam', v_tel, 'admin', pg_temp._h('k1'), pg_temp._h('t1'), 72, gen_random_uuid());
  perform pg_temp._k(r->>'code' = 'ROL_NOTOGRI', q, 'admin taklif qilindi');
  r := public.t2_kirish_taklif_yarat_v1(v_boss, v_komp, 'Sinov Odam', v_tel, 'boss', pg_temp._h('k1'), pg_temp._h('t1'), 72, gen_random_uuid());
  perform pg_temp._k(r->>'code' = 'ROL_NOTOGRI', q, 'boss taklif qilindi');
  r := public.t2_kirish_taklif_yarat_v1(v_boss, v_komp, 'Sinov Odam', v_tel, 'yoq_rol_xyz', pg_temp._h('k1'), pg_temp._h('t1'), 72, gen_random_uuid());
  perform pg_temp._k(r->>'code' = 'ROL_NOTOGRI', q, 'katalogda yo''q rol qabul qilindi');
  q := 'rol_ko_tarilmaydi';
  r := public.t2_kirish_taklif_yarat_v1(v_kadr, v_komp, 'Sinov Odam', v_tel, 'rahbar', pg_temp._h('k1'), pg_temp._h('t1'), 72, gen_random_uuid());
  perform pg_temp._k(r->>'code' = 'ROL_NOTOGRI', q, 'kadr rahbar rolini taklif qildi: ' || r::text);
  r := public.t2_kirish_taklif_yarat_v1(v_pto, v_komp, 'Sinov Odam', v_tel, 'usta', pg_temp._h('k1'), pg_temp._h('t1'), 72, gen_random_uuid());
  perform pg_temp._k(r->>'code' = 'RUXSAT_YOQ', q, 'huquqsiz a''zo taklif qildi: ' || r::text);
  r := public.t2_kirish_taklif_yarat_v1(null, v_komp, 'Sinov Odam', v_tel, 'usta', pg_temp._h('k1'), pg_temp._h('t1'), 72, gen_random_uuid());
  perform pg_temp._k(r->>'code' = 'RUXSAT_YOQ', q, 'actor siz taklif');
  r := public.t2_kirish_taklif_yarat_v1(v_boss, v_komp, 'Sinov Odam', 'telefon emas', 'usta', pg_temp._h('k1'), pg_temp._h('t1'), 72, gen_random_uuid());
  perform pg_temp._k(r->>'code' = 'TELEFON_NOTOGRI', q, 'yaroqsiz telefon');
  r := public.t2_kirish_taklif_yarat_v1(v_boss, v_komp, 'Sinov Odam', v_tel, 'usta', 'ochiq-kod-123456', pg_temp._h('t1'), 72, gen_random_uuid());
  perform pg_temp._k(r->>'code' = 'KOD_NOTOGRI', q, 'xeshsiz (ochiq) kod qabul qilindi');
  perform pg_temp._k((select count(*) from public.t2_kirish_taklif where kompaniya_id = v_komp) = 0, q, 'rad etilgan takliflar jadvalga tushdi');

  -- ── ochiq saqlanmaslik + kadr dala roli ──
  q := 'maxfiy_saqlanmaydi';
  r := public.t2_kirish_taklif_yarat_v1(v_kadr, v_komp, 'Sinov Odam', v_tel, 'usta', pg_temp._h('kod-A'), pg_temp._h('tok-A'), 72, gen_random_uuid());
  perform pg_temp._k(r->>'ok' = 'true', q, 'kadr dala roli (usta) taklif qila olmadi: ' || r::text);
  perform pg_temp._k((select kod_xesh <> '12345678' and kod_xesh <> 'kod-A' and token_xesh <> 'tok-A' and kod_xesh = pg_temp._h('kod-A') and telefon_e164 = v_tel and rol = 'usta' from public.t2_kirish_taklif where id = (r->>'taklif_id')::bigint), q, 'saqlangan qiymat xesh emas');
  perform pg_temp._k(r::text not like '%' || v_tel || '%', q, 'javobda to''liq telefon');

  -- ── noto'g'ri kod N marta → bloklanadi ──
  q := 'kod_bloklanadi';
  for i in 1..5 loop
    r2 := public.t2_kirish_taklif_qabul_v1(null, v_tel, pg_temp._h('NOTOGRI-' || i), 'Parol-123456', v_ip, gen_random_uuid());
    perform pg_temp._k(r2->>'code' = 'TAKLIF_RAD', q, 'noto''g''ri kod ' || i || ': ' || r2::text);
  end loop;
  r2 := public.t2_kirish_taklif_qabul_v1(null, v_tel, pg_temp._h('kod-A'), 'Parol-123456', v_ip, gen_random_uuid());
  perform pg_temp._k(r2->>'code' = 'TAKLIF_RAD', q, 'bloklangan taklif to''g''ri kod bilan ochildi');
  perform pg_temp._k((select urinishlar >= 5 from public.t2_kirish_taklif where id = (r->>'taklif_id')::bigint), q, 'urinish hisobi o''smadi');
  perform pg_temp._k(not exists (select 1 from public.t2_foydalanuvchi where login = v_tel), q, 'bloklangan taklifdan hisob ochildi');
  perform pg_temp._k((public.t2_kirish_taklif_royxat_v1(v_boss, v_komp)->'takliflar'->0->>'holat') = 'bloklangan', q, 'royxatda holat bloklangan emas');

  -- ── muddati o'tgan ──
  q := 'muddat_otgan';
  r := public.t2_kirish_taklif_yarat_v1(v_boss, v_komp, 'Sinov Odam', v_tel, 'usta', pg_temp._h('kod-B'), pg_temp._h('tok-B'), 72, gen_random_uuid());
  perform pg_temp._k(r->>'ok' = 'true', q, 'qayta taklif: ' || r::text);
  perform pg_temp._k((select holat from public.t2_kirish_taklif where kod_xesh = pg_temp._h('kod-A')) = 'bekor', q, 'eski kutayotgan taklif bekor bo''lmadi');
  update public.t2_kirish_taklif set tugaydi = now() - interval '1 minute' where id = (r->>'taklif_id')::bigint;
  r2 := public.t2_kirish_taklif_qabul_v1(pg_temp._h('tok-B'), null, null, 'Parol-123456', 'kirish-akc-ip-2', gen_random_uuid());
  perform pg_temp._k(r2->>'code' = 'TAKLIF_RAD', q, 'muddati o''tgan havola qabul qilindi');
  perform pg_temp._k(not exists (select 1 from public.t2_foydalanuvchi where login = v_tel), q, 'muddati o''tgan taklifdan hisob ochildi');

  -- ── bir marta ishlatiladi, rol aynan, parol siyosati ──
  q := 'qabul_va_ikki_marta';
  r := public.t2_kirish_taklif_yarat_v1(v_boss, v_komp, 'Sinov Odam', v_tel, 'brigadir', pg_temp._h('kod-C'), pg_temp._h('tok-C'), 72, gen_random_uuid());
  r2 := public.t2_kirish_taklif_qabul_v1(pg_temp._h('tok-C'), null, null, '1234567', 'kirish-akc-ip-3', gen_random_uuid());
  perform pg_temp._k(r2->>'code' = 'PAROL_QISQA', q, 'qisqa parol qabul qilindi: ' || r2::text);
  r2 := public.t2_kirish_taklif_qabul_v1(pg_temp._h('tok-C'), null, null, 'abc' || right(v_tel, 9) || 'x', 'kirish-akc-ip-3', gen_random_uuid());
  perform pg_temp._k(r2->>'code' = 'PAROL_TELEFON', q, 'telefonni o''z ichiga olgan parol qabul qilindi: ' || r2::text);
  perform pg_temp._k((select holat from public.t2_kirish_taklif where id = (r->>'taklif_id')::bigint) = 'kutmoqda', q, 'parol rad etilganda taklif sarflandi');
  r2 := public.t2_kirish_taklif_qabul_v1(pg_temp._h('tok-C'), null, null, 'Yaxshi-Parol-77', 'kirish-akc-ip-3', gen_random_uuid());
  perform pg_temp._k(r2->>'ok' = 'true' and r2->>'rol' = 'brigadir' and r2->>'login' = v_tel and (r2->>'yangi') = 'true', q, 'qabul: ' || r2::text);
  v_x := (r2->>'foydalanuvchi_id')::bigint;
  select rol into v_rol from public.t2_azolik where foydalanuvchi_id = v_x and kompaniya_id = v_komp and holat = 'faol';
  perform pg_temp._k(v_rol = 'brigadir' and (select count(*) from public.t2_azolik where foydalanuvchi_id = v_x) = 1, q, 'rol/a''zolik soni: ' || coalesce(v_rol, '-'));
  perform pg_temp._k((select parol_hash <> 'Yaxshi-Parol-77' and parol_hash = extensions.crypt('Yaxshi-Parol-77', parol_hash) and telefon_manba = 'admin' and telefon_tasdiqlangan = false and telefon_e164 = v_tel and email is null from public.t2_foydalanuvchi where id = v_x), q, 'parol xeshi / telefon manbasi (admin) / tasdiqlanmagan belgisi');
  r2 := public.t2_kirish_taklif_qabul_v1(pg_temp._h('tok-C'), null, null, 'Yaxshi-Parol-77', 'kirish-akc-ip-3', gen_random_uuid());
  perform pg_temp._k(r2->>'code' = 'TAKLIF_RAD', q, 'ikkinchi marta ishlatildi');
  perform pg_temp._k((select count(*) from public.t2_foydalanuvchi where login = v_tel) = 1, q, 'dublikat hisob');
  perform pg_temp._k((select holat from public.t2_kirish_taklif where id = (r->>'taklif_id')::bigint) = 'ishlatildi', q, 'holat ishlatildi emas');
  perform pg_temp._k(exists (select 1 from public.t2_audit_log where kompaniya_id = v_komp and amal_turi = 'kirish_taklif_ishlatildi'), q, 'audit yozuvi yo''q');
  q := 'mijoz_rolni_kotara_olmaydi';
  perform pg_temp._k(not exists (select 1 from pg_proc where proname in ('t2_kirish_taklif_qabul_v1', 't2_kirish_taklif_ulash_v1') and pg_get_function_identity_arguments(oid) ~* 'rol'), q, 'qabul/ulash imzosida rol parametri bor');

  -- ── mavjud hisobni egallab olish rad etiladi ──
  q := 'mavjud_hisob_jim_ulanmaydi';
  insert into public.t2_foydalanuvchi (login, email, ism, holat, parol_hash, telefon_e164, telefon_manba)
    values ('kirish-akc-mavjud@example.invalid', 'kirish-akc-mavjud@example.invalid', 'KIRISH-AKC mavjud', 'faol', extensions.crypt('Mavjud-Parol-1', extensions.gen_salt('bf')), v_tel2, 'admin') returning id into v_mavjud;
  r := public.t2_kirish_taklif_yarat_v1(v_boss, v_komp, 'Mavjud Odam', v_tel2, 'usta', pg_temp._h('kod-D'), pg_temp._h('tok-D'), 72, gen_random_uuid());
  perform pg_temp._k(r->>'ok' = 'true', q, 'mavjud hisob telefoniga taklif: ' || r::text);
  r2 := public.t2_kirish_taklif_qabul_v1(pg_temp._h('tok-D'), null, null, 'Boshqa-Parol-99', 'kirish-akc-ip-4', gen_random_uuid());
  perform pg_temp._k(r2->>'code' = 'HISOB_BOR', q, 'mavjud hisobga yangi hisob/a''zolik berildi: ' || r2::text);
  perform pg_temp._k(not exists (select 1 from public.t2_azolik where foydalanuvchi_id = v_mavjud and kompaniya_id = v_komp), q, 'mavjud hisob jim a''zo qilindi');
  perform pg_temp._k((select parol_hash = extensions.crypt('Mavjud-Parol-1', parol_hash) from public.t2_foydalanuvchi where id = v_mavjud), q, 'mavjud hisob paroli o''zgardi');
  perform pg_temp._k((select holat from public.t2_kirish_taklif where kod_xesh = pg_temp._h('kod-D')) = 'kutmoqda', q, 'rad etilganda taklif sarflandi');
  q := 'ulash_sessiyasiz_yoq';
  r2 := public.t2_kirish_taklif_ulash_v1(null, pg_temp._h('tok-D'), null, null, 'kirish-akc-ip-4', gen_random_uuid());
  perform pg_temp._k(r2->>'code' = 'AUTH_REQUIRED', q, 'actor siz ulandi: ' || r2::text);
  r2 := public.t2_kirish_taklif_ulash_v1(-5, pg_temp._h('tok-D'), null, null, 'kirish-akc-ip-4', gen_random_uuid());
  perform pg_temp._k(r2->>'code' = 'AUTH_REQUIRED', q, 'yaroqsiz actor ulandi');
  r2 := public.t2_kirish_taklif_ulash_v1(v_mavjud, pg_temp._h('NOTOGRI-TOKEN'), null, null, 'kirish-akc-ip-4', gen_random_uuid());
  perform pg_temp._k(r2->>'code' = 'TAKLIF_RAD', q, 'noto''g''ri token bilan ulandi');
  q := 'ulash_sessiya_bilan';
  r2 := public.t2_kirish_taklif_ulash_v1(v_mavjud, pg_temp._h('tok-D'), null, null, 'kirish-akc-ip-4', gen_random_uuid());
  perform pg_temp._k(r2->>'ok' = 'true' and r2->>'rol' = 'usta' and (r2->>'yangi') = 'false', q, 'autentifikatsiyalangan ulash: ' || r2::text);
  perform pg_temp._k((select rol from public.t2_azolik where foydalanuvchi_id = v_mavjud and kompaniya_id = v_komp and holat = 'faol') = 'usta', q, 'a''zolik taklif roli bilan emas');
  r2 := public.t2_kirish_taklif_ulash_v1(v_mavjud, pg_temp._h('tok-D'), null, null, 'kirish-akc-ip-4', gen_random_uuid());
  perform pg_temp._k(r2->>'code' = 'TAKLIF_RAD', q, 'ulash ikki marta ishlatildi');

  -- ── bekor qilish ──
  q := 'bekor';
  r := public.t2_kirish_taklif_yarat_v1(v_boss, v_komp, 'Bekor Odam', v_tel3, 'haydovchi', pg_temp._h('kod-E'), pg_temp._h('tok-E'), 72, gen_random_uuid());
  v_id := (r->>'taklif_id')::bigint;
  r2 := public.t2_kirish_taklif_bekor_v1(v_pto, v_komp, v_id);
  perform pg_temp._k(r2->>'code' = 'RUXSAT_YOQ', q, 'huquqsiz bekor qildi');
  r2 := public.t2_kirish_taklif_bekor_v1(v_boss, v_komp, v_id);
  perform pg_temp._k(r2->>'ok' = 'true', q, 'bekor: ' || r2::text);
  r2 := public.t2_kirish_taklif_qabul_v1(pg_temp._h('tok-E'), null, null, 'Yaxshi-Parol-77', 'kirish-akc-ip-5', gen_random_uuid());
  perform pg_temp._k(r2->>'code' = 'TAKLIF_RAD', q, 'bekor qilingan taklif ishladi');
  perform pg_temp._k(exists (select 1 from public.t2_audit_log where kompaniya_id = v_komp and amal_turi = 'kirish_taklif_bekor'), q, 'bekor auditi yo''q');

  -- ── javoblar telefon/hisob bor-yo'qligini bildirmaydi (token bilmasdan) ──
  q := 'bir_xil_javob';
  r := public.t2_kirish_taklif_qabul_v1(null, '+998901239999', pg_temp._h('x'), 'Yaxshi-Parol-77', 'kirish-akc-ip-6', gen_random_uuid());
  r2 := public.t2_kirish_taklif_qabul_v1(null, v_tel2, pg_temp._h('x'), 'Yaxshi-Parol-77', 'kirish-akc-ip-6', gen_random_uuid());
  perform pg_temp._k(r = r2 and r->>'code' = 'TAKLIF_RAD', q, 'mavjud/mavjud emas telefon javobi farq qildi: ' || r::text || ' vs ' || r2::text);

  -- ── limitlar ──
  q := 'limit_taklif';
  for i in 1..10 loop
    r := public.t2_kirish_taklif_yarat_v1(v_boss, v_komp, 'Limit Odam', '+998901230099', 'usta', pg_temp._h('kl' || i), pg_temp._h('tl' || i), 72, gen_random_uuid());
  end loop;
  r := public.t2_kirish_taklif_yarat_v1(v_boss, v_komp, 'Limit Odam', '+998901230099', 'usta', pg_temp._h('kl-x'), pg_temp._h('tl-x'), 72, gen_random_uuid());
  perform pg_temp._k(r->>'code' = 'LIMIT', q, 'bir telefonga sutkalik limit ishlamadi: ' || r::text);
  q := 'limit_tel_parol';
  for i in 1..8 loop perform public.t2_kirish_tel_limit_v1(v_tel3, 'kirish-akc-ip-7', true); end loop;
  perform pg_temp._k(public.t2_kirish_tel_limit_v1(v_tel3, 'kirish-akc-ip-8', false)->>'code' = 'LIMIT', q, 'telefon+parol xato limiti ishlamadi');
  perform pg_temp._k(public.t2_kirish_tel_limit_v1('+998901230098', 'kirish-akc-ip-9', false)->>'ok' = 'true', q, 'boshqa telefon bloklandi');

  -- ═════════ B) Telegram ═════════
  q := 'tg_oqim';
  v_nonce := pg_temp._h('nonce-1'); v_br := pg_temp._h('brauzer-1');
  r := public.t2_tg_kirish_boshla_v1(v_nonce, v_br, '4821', 'Sinov Foydalanuvchi', 'kirish-akc-ip-t1');
  perform pg_temp._k(r->>'ok' = 'true', q, 'boshla: ' || r::text);
  perform pg_temp._k((select nonce_xesh <> 'nonce-1' and brauzer_xesh <> 'brauzer-1' from public.t2_kirish_nonce where nonce_xesh = v_nonce), q, 'nonce ochiq saqlandi');
  r := public.t2_tg_kirish_start_v1(pg_temp._h('nonce-yoq'), v_tg_u, 555, 'uz');
  perform pg_temp._k(r->>'code' = 'NONCE_RAD', q, 'noma''lum nonce qabul qilindi');
  r := public.t2_tg_kirish_holat_v1(v_nonce, v_br, 'kirish-akc-ip-t1', gen_random_uuid());
  perform pg_temp._k(r->>'holat' = 'kutmoqda', q, 'boshlang''ich holat: ' || r::text);
  r := public.t2_tg_kirish_start_v1(v_nonce, v_tg_u, 555, 'uz');
  perform pg_temp._k(r->>'ok' = 'true' and r->>'belgi' = '4821', q, 'start: ' || r::text);
  r := public.t2_tg_kirish_start_v1(v_nonce, v_tg_u + 1, 556, 'uz');
  perform pg_temp._k(r->>'code' = 'NONCE_RAD', q, 'nonce ikkinchi Telegram ga bog''landi');
  q := 'tg_kontakt_boshqaniki';
  r := public.t2_tg_kirish_kontakt_v1(v_tg_u, v_tg_u + 7, v_tel3, 555);
  perform pg_temp._k(r->>'code' = 'KONTAKT_BOSHQANIKI', q, 'boshqa odam kontakti qabul qilindi: ' || r::text);
  r := public.t2_tg_kirish_kontakt_v1(v_tg_u, null, v_tel3, 555);
  perform pg_temp._k(r->>'code' = 'KONTAKT_BOSHQANIKI', q, 'user_id siz kontakt qabul qilindi');
  perform pg_temp._k((select holat from public.t2_kirish_nonce where nonce_xesh = v_nonce) = 'kontakt_kutmoqda', q, 'rad etilgan kontakt nonce holatini o''zgartirdi');
  q := 'tg_brauzer_siri';
  r := public.t2_tg_kirish_kontakt_v1(v_tg_u, v_tg_u, '+998 90 123 00 05', 555);
  perform pg_temp._k(r->>'ok' = 'true', q, 'o''z kontakti: ' || r::text);
  r := public.t2_tg_kirish_holat_v1(v_nonce, pg_temp._h('boshqa-sir'), 'kirish-akc-ip-t2', gen_random_uuid());
  perform pg_temp._k(r->>'code' = 'TOPILMADI' and not exists (select 1 from public.t2_foydalanuvchi where login = '+998901230005'), q, 'faqat havola bilan (brauzer siri yo''q) sessiya/hisob berildi: ' || r::text);
  q := 'tg_yangi_hisob';
  r := public.t2_tg_kirish_holat_v1(v_nonce, v_br, 'kirish-akc-ip-t1', gen_random_uuid());
  perform pg_temp._k(r->>'ok' = 'true' and r->>'holat' = 'tayyor' and (r->>'yangi') = 'true' and r->>'login' = '+998901230005', q, 'tayyor: ' || r::text);
  v_x := (r->>'foydalanuvchi_id')::bigint;
  perform pg_temp._k((select count(*) from public.t2_azolik where foydalanuvchi_id = v_x) = 0 and jsonb_array_length(r->'azoliklar') = 0, q, 'o''zi ro''yxatdan o''tgan hisobda a''zolik bor (email yo''li bilan bir xil: yo''q bo''lishi kerak)');
  perform pg_temp._k((select telefon_manba = 'telegram' and telefon_tasdiqlangan and ism = 'Sinov Foydalanuvchi' and parol_hash is null from public.t2_foydalanuvchi where id = v_x), q, 'manba/tasdiq/ism formadan');
  perform pg_temp._k(exists (select 1 from public.t2_telegram_ulanish where foydalanuvchi_id = v_x and telegram_user_id = v_tg_u and holat = 'faol'), q, 'umumiy telegram ulanish jadvaliga yozilmadi');
  perform pg_temp._k(exists (select 1 from public.t2_telegram_hodisa where foydalanuvchi_id = v_x and amal = 'telefon_kirish'), q, 'audit hodisasi yo''q');
  q := 'tg_bir_martalik';
  r := public.t2_tg_kirish_holat_v1(v_nonce, v_br, 'kirish-akc-ip-t1', gen_random_uuid());
  perform pg_temp._k(r->>'code' = 'TOPILMADI', q, 'nonce ikkinchi marta sarflandi: ' || r::text);
  r := public.t2_tg_kirish_start_v1(v_nonce, v_tg_u, 555, 'uz');
  perform pg_temp._k(r->>'code' = 'NONCE_RAD', q, 'ishlatilgan nonce qayta boshlandi');

  -- muddat
  q := 'tg_muddat';
  v_nonce := pg_temp._h('nonce-2'); v_br := pg_temp._h('brauzer-2');
  perform public.t2_tg_kirish_boshla_v1(v_nonce, v_br, '1111', 'Muddat', 'kirish-akc-ip-t3');
  perform public.t2_tg_kirish_start_v1(v_nonce, v_tg_u + 20, 600, 'ru');
  perform public.t2_tg_kirish_kontakt_v1(v_tg_u + 20, v_tg_u + 20, '+998 90 123 00 06', 600);
  update public.t2_kirish_nonce set tugaydi = now() - interval '1 second' where nonce_xesh = v_nonce;
  r := public.t2_tg_kirish_holat_v1(v_nonce, v_br, 'kirish-akc-ip-t3', gen_random_uuid());
  perform pg_temp._k(r->>'code' = 'MUDDATI_OTGAN' and not exists (select 1 from public.t2_foydalanuvchi where login = '+998901230006'), q, 'muddati o''tgan nonce ishladi: ' || r::text);
  v_nonce := pg_temp._h('nonce-2b');
  perform public.t2_tg_kirish_boshla_v1(v_nonce, v_br, '1112', 'Muddat', 'kirish-akc-ip-t3');
  update public.t2_kirish_nonce set tugaydi = now() - interval '1 second' where nonce_xesh = v_nonce;
  r := public.t2_tg_kirish_start_v1(v_nonce, v_tg_u + 21, 601, 'en');
  perform pg_temp._k(r->>'code' = 'NONCE_RAD', q, 'muddati o''tgan nonce start qilindi');

  -- mavjud parolli/emailli hisob: telefon uning hisobiga BOG'LANMAYDI, Telegram hisobini egallab bo'lmaydi
  q := 'tg_egallab_olish_yoq';
  insert into public.t2_foydalanuvchi (login, email, ism, holat, parol_hash, email_tasdiqlandi_at, telefon)
    values ('kirish-akc-parolli@example.invalid', 'kirish-akc-parolli@example.invalid', 'KIRISH-AKC parolli', 'faol', extensions.crypt('Parolli-Hisob-1', extensions.gen_salt('bf')), now(), '+998901230007') returning id into v_x;
  select parol_hash into v_hash_before from public.t2_foydalanuvchi where id = v_x;
  v_nonce := pg_temp._h('nonce-3'); v_br := pg_temp._h('brauzer-3');
  perform public.t2_tg_kirish_boshla_v1(v_nonce, v_br, '2222', 'Boshqa Ism', 'kirish-akc-ip-t4');
  perform public.t2_tg_kirish_start_v1(v_nonce, v_tg_u + 30, 700, 'uz');
  perform public.t2_tg_kirish_kontakt_v1(v_tg_u + 30, v_tg_u + 30, '+998 90 123 00 07', 700);
  r := public.t2_tg_kirish_holat_v1(v_nonce, v_br, 'kirish-akc-ip-t4', gen_random_uuid());
  perform pg_temp._k(r->>'ok' = 'true' and (r->>'foydalanuvchi_id')::bigint <> v_x, q, 'parolli hisobga kirildi / bog''landi: ' || r::text);
  perform pg_temp._k((select parol_hash = v_hash_before and telefon_e164 is null and telefon_manba is null from public.t2_foydalanuvchi where id = v_x)
    and not exists (select 1 from public.t2_telegram_ulanish where foydalanuvchi_id = v_x), q, 'parolli hisob o''zgardi yoki Telegram ulandi');
  -- admin aytgan (tasdiqlanmagan) telefonli hisob (v_mavjud, v_tel2): Telegram kontakti bilan KIRIB BO'LMAYDI
  q := 'tg_admin_telefon_hisobi';
  v_nonce := pg_temp._h('nonce-4'); v_br := pg_temp._h('brauzer-4');
  perform public.t2_tg_kirish_boshla_v1(v_nonce, v_br, '3333', 'Boshqa Ism', 'kirish-akc-ip-t5');
  perform public.t2_tg_kirish_start_v1(v_nonce, v_tg_u + 40, 800, 'uz');
  perform public.t2_tg_kirish_kontakt_v1(v_tg_u + 40, v_tg_u + 40, v_tel2, 800);
  r := public.t2_tg_kirish_holat_v1(v_nonce, v_br, 'kirish-akc-ip-t5', gen_random_uuid());
  perform pg_temp._k(r->>'code' = 'KIRISH_RAD' and r->>'foydalanuvchi_id' is null, q, 'admin-telefon hisobiga Telegram bilan kirildi: ' || r::text);
  perform pg_temp._k(not exists (select 1 from public.t2_telegram_ulanish where telegram_user_id = v_tg_u + 40), q, 'rad etilganda Telegram ulandi');
  -- Telegram tasdiqlagan hisob keyingi safar ham o'sha hisobga kiradi (bitta hisob, dublikat yo'q)
  q := 'tg_qayta_kirish';
  v_nonce := pg_temp._h('nonce-5'); v_br := pg_temp._h('brauzer-5');
  perform public.t2_tg_kirish_boshla_v1(v_nonce, v_br, '4444', 'Boshqa Ism', 'kirish-akc-ip-t6');
  perform public.t2_tg_kirish_start_v1(v_nonce, v_tg_u, 555, 'uz');
  perform public.t2_tg_kirish_kontakt_v1(v_tg_u, v_tg_u, '+998 90 123 00 05', 555);
  r := public.t2_tg_kirish_holat_v1(v_nonce, v_br, 'kirish-akc-ip-t6', gen_random_uuid());
  perform pg_temp._k(r->>'ok' = 'true' and (r->>'yangi') = 'false' and r->>'login' = '+998901230005', q, 'qayta kirish: ' || r::text);
  perform pg_temp._k((select count(*) from public.t2_foydalanuvchi where telefon_e164 = '+998901230005') = 1, q, 'telefon bo''yicha dublikat hisob');
  q := 'tg_chet_el_raqam';
  v_nonce := pg_temp._h('nonce-6'); v_br := pg_temp._h('brauzer-6');
  perform public.t2_tg_kirish_boshla_v1(v_nonce, v_br, '5555', 'X', 'kirish-akc-ip-t7');
  perform public.t2_tg_kirish_start_v1(v_nonce, v_tg_u + 50, 900, 'uz');
  r := public.t2_tg_kirish_kontakt_v1(v_tg_u + 50, v_tg_u + 50, '+1 202 555 0100', 900);
  perform pg_temp._k(r->>'code' = 'TELEFON_NOTOGRI', q, '+998 bo''lmagan raqam qabul qilindi');

  -- limit: bir qurilmadan nonce yaratish (12/soat)
  q := 'limit_tg_boshla';
  for i in 1..12 loop perform public.t2_tg_kirish_boshla_v1(pg_temp._h('lim-' || i), pg_temp._h('limb-' || i), '1234', null, 'kirish-akc-ip-t9'); end loop;
  r := public.t2_tg_kirish_boshla_v1(pg_temp._h('lim-x'), pg_temp._h('limb-x'), '1234', null, 'kirish-akc-ip-t9');
  perform pg_temp._k(r->>'code' = 'LIMIT', q, 'nonce yaratish limiti ishlamadi: ' || r::text);

  -- 5 ta noto'g'ri brauzer siri → nonce o'ladi
  q := 'tg_brauzer_siri_limiti';
  v_nonce := pg_temp._h('nonce-7'); v_br := pg_temp._h('brauzer-7');
  perform public.t2_tg_kirish_boshla_v1(v_nonce, v_br, '6666', 'X', 'kirish-akc-ip-t8');
  for i in 1..5 loop perform public.t2_tg_kirish_holat_v1(v_nonce, pg_temp._h('xato' || i), 'kirish-akc-ip-t8', gen_random_uuid()); end loop;
  r := public.t2_tg_kirish_holat_v1(v_nonce, v_br, 'kirish-akc-ip-t8', gen_random_uuid());
  perform pg_temp._k(r->>'code' = 'TOPILMADI', q, 'brauzer siri 5 marta xato bo''lgach nonce o''lmadi: ' || r::text);
exception when others then
  if sqlerrm like 'KIRISH qadam%' then raise; end if;
  raise exception 'KIRISH qadam [%] kutilmagan xato: % (%)', q, sqlerrm, sqlstate;
end $t$;

rollback;
