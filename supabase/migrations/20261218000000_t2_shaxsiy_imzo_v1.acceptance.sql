-- Acceptance: shaxsiy imzo (20261218000000). BEGIN ... ROLLBACK - hech narsa saqlanmaydi.
-- Har qadam xatosi `IMZO qadam [<nom>]` bilan ko'tariladi. Sintetik ma'lumotlar (IMZO-AKC-*); real ism/INN/summa YO'Q.
-- Kriptografik tekshiruv bu yerda EMAS (Pages Function, frontend/functions/_shared/imzo.test.ts); SQL yaxlitlikni tekshiradi.
begin;
set local statement_timeout = '300s';

create or replace function pg_temp._k(p_ok boolean, p_qadam text, p_tafsilot text default '') returns void language plpgsql as $$
begin
  if p_ok is distinct from true then raise exception 'IMZO qadam [%] %', p_qadam, p_tafsilot; end if;
end $$;
-- SQL xatosini matn sifatida qaytaradi (xato bo'lmasa 'OK')
create or replace function pg_temp._xato(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'OK'; exception when others then return sqlerrm; end $$;
create or replace function pg_temp._tok() returns text language sql as $$ select substr(md5(random()::text || clock_timestamp()::text), 1, 22) $$;
create or replace function pg_temp._h() returns text language sql as $$ select md5(random()::text || clock_timestamp()::text) || md5(clock_timestamp()::text || random()::text) $$;
create or replace function pg_temp._pk(p text) returns text language sql immutable as $$ select repeat('A', 87 - length(p)) || p $$;
-- bitta imzo yozish: manbalarni olib, shlyuz kabi chaqiradi
create or replace function pg_temp._yoz(p_actor bigint, p_hujjat bigint, p_kalit uuid, p_prev text default null, p_vaqt text default null,
  p_skomp bigint default null, p_tomon text default 'pudratchi', p_nomidan bigint default null) returns jsonb language plpgsql as $$
declare m jsonb;
begin
  m := public.t2_imzo_manba_v1(p_actor, p_hujjat, p_kalit, p_skomp, p_tomon, p_nomidan);
  if (m->>'ok')::boolean is not true then return m; end if;
  return public.t2_imzo_yoz_v1(p_actor, pg_temp._tok(), p_hujjat, p_kalit, p_skomp, p_tomon, p_nomidan,
    coalesce(p_vaqt, to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')), pg_temp._tok(), pg_temp._h(),
    coalesce(p_prev, m->>'oldingi_xesh'), m->>'hujjat_sha256', m->>'imzolovchi', m->>'rol', m->>'imzolovchi_kompaniya', m->>'nomidan_kompaniya', pg_temp._h(), repeat('B', 86));
end $$;
do $t$
declare
  q text := 'tayyorlov';
  v_a bigint; v_b bigint; v_u1 bigint; v_u2 bigint; v_u3 bigint; v_u4 bigint; v_u5 bigint;
  v_d1 bigint; v_d2 bigint; v_dB bigint;
  r jsonb; r2 jsonb; i int; v_n int; v_k1 uuid; v_k2 uuid; v_k3 uuid; v_kb uuid; v_tok text; v_prev text; v_x text;
begin
  insert into public.t2_kompaniya (nom, kod) values ('IMZO-AKC A', 'IMZO-AKC-A-' || floor(random() * 1e9)::text) returning id into v_a;
  insert into public.t2_kompaniya (nom, kod) values ('IMZO-AKC B', 'IMZO-AKC-B-' || floor(random() * 1e9)::text) returning id into v_b;
  insert into public.t2_foydalanuvchi (login, ism, holat, parol_hash) values ('imzo-akc-u1', 'IMZO-AKC Bir', 'faol', extensions.crypt('imzo-akc-sinov-parol', extensions.gen_salt('bf'))) returning id into v_u1;
  insert into public.t2_foydalanuvchi (login, ism, holat) values ('imzo-akc-u2', 'IMZO-AKC Ikki', 'faol') returning id into v_u2;
  insert into public.t2_foydalanuvchi (login, ism, holat) values ('imzo-akc-u3', 'IMZO-AKC Uch', 'faol') returning id into v_u3;
  insert into public.t2_foydalanuvchi (login, ism, holat) values ('imzo-akc-u4', 'IMZO-AKC Tort', 'bekor') returning id into v_u4;
  insert into public.t2_foydalanuvchi (login, ism, holat) values ('imzo-akc-u5', 'IMZO-AKC Besh', 'faol') returning id into v_u5;
  insert into public.t2_azolik (foydalanuvchi_id, kompaniya_id, rol, holat) values (v_u1, v_a, 'pto', 'faol'), (v_u2, v_a, 'boss', 'faol'), (v_u3, v_b, 'pto', 'faol'), (v_u4, v_a, 'pto', 'faol');
  insert into public.t2_document_registry (kompaniya_id, document_type, status, provider, external_file_id, r2_key, original_filename, mime_type, size_bytes, sha256, sha256_verified, canonical_storage_status, revision)
    values (v_a, 'imzo_akc_hujjat', 'active', 'cloudflare_r2', 'imzo-akc-' || v_a || '-1', 'imzo-akc/' || v_a || '/1', 'imzo-akc-1.xlsx', 'application/octet-stream', 100, repeat('a', 64), true, 'stored', '1') returning id into v_d1;
  insert into public.t2_document_registry (kompaniya_id, document_type, status, provider, external_file_id, r2_key, original_filename, mime_type, size_bytes, sha256, sha256_verified, canonical_storage_status, revision)
    values (v_a, 'imzo_akc_hujjat', 'active', 'cloudflare_r2', 'imzo-akc-' || v_a || '-2', 'imzo-akc/' || v_a || '/2', 'imzo-akc-2.xlsx', 'application/octet-stream', 100, repeat('c', 64), true, 'stored', '1') returning id into v_d2;
  insert into public.t2_document_registry (kompaniya_id, document_type, status, provider, external_file_id, r2_key, original_filename, mime_type, size_bytes, sha256, sha256_verified, canonical_storage_status, revision)
    values (v_b, 'imzo_akc_hujjat', 'active', 'cloudflare_r2', 'imzo-akc-' || v_b || '-1', 'imzo-akc/' || v_b || '/1', 'imzo-akc-B.xlsx', 'application/octet-stream', 100, repeat('d', 64), true, 'stored', '1') returning id into v_dB;

  -- 1 tuzilma
  q := 'tuzilma';
  perform pg_temp._k(to_regclass('public.t2_imzo') is not null and to_regclass('public.t2_imzo_kalit') is not null, q, 'jadval yo''q');
  perform pg_temp._k((select bool_and(relrowsecurity) from pg_class where oid in ('public.t2_imzo'::regclass, 'public.t2_imzo_kalit'::regclass)), q, 'RLS yoqilmagan');
  perform pg_temp._k(not has_table_privilege('anon', 'public.t2_imzo', 'select') and not has_table_privilege('authenticated', 'public.t2_imzo', 'select')
    and not has_table_privilege('anon', 'public.t2_imzo_kalit', 'select') and not has_table_privilege('authenticated', 'public.t2_imzo_kalit', 'select'), q, 'anon/authenticated jadvalni o''qiy oladi');
  select count(*) into v_n from pg_proc p where p.pronamespace = 'public'::regnamespace and (p.proname like 't2\_imzo\_%' or p.proname like '\_t2\_imzo\_%')
    and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute') or not has_function_privilege('service_role', p.oid, 'execute'));
  perform pg_temp._k(v_n = 0, q, 'anon/authenticated ijro huquqi yoki service_role yo''q: ' || v_n);
  select count(*) into v_n from pg_trigger where tgrelid in ('public.t2_imzo'::regclass, 'public.t2_imzo_kalit'::regclass) and not tgisinternal;
  perform pg_temp._k(v_n = 4, q, 'append-only triggerlar soni: ' || v_n);

  -- 2 kalit ro'yxatdan o'tkazish (qayta autentifikatsiya)
  q := 'kalit_yarat';
  r := public.t2_imzo_kalit_yarat_v1(v_u1, 'Noutbuk', pg_temp._pk('k1'), null, true);
  perform pg_temp._k(r->>'code' = 'PAROL_XATO', q, 'parolli hisob paroldan SIZ kalit yaratdi: ' || r::text);
  r := public.t2_imzo_kalit_yarat_v1(v_u1, 'Noutbuk', pg_temp._pk('k1'), 'noto''g''ri', true);
  perform pg_temp._k(r->>'code' = 'PAROL_XATO', q, 'noto''g''ri parol o''tdi');
  r := public.t2_imzo_kalit_yarat_v1(v_u1, 'Noutbuk', pg_temp._pk('k1'), 'imzo-akc-sinov-parol', false);
  perform pg_temp._k((r->>'ok')::boolean, q, 'to''g''ri parol bilan yaratilmadi: ' || r::text);
  v_k1 := (r->>'id')::uuid;
  r := public.t2_imzo_kalit_yarat_v1(v_u2, 'Telefon', pg_temp._pk('k2'), null, false);
  perform pg_temp._k(r->>'code' = 'QAYTA_KIRISH_KERAK', q, 'parolsiz hisob eski sessiya bilan kalit yaratdi: ' || r::text);
  r := public.t2_imzo_kalit_yarat_v1(v_u2, 'Telefon', pg_temp._pk('k2'), null, true);
  perform pg_temp._k((r->>'ok')::boolean, q, 'parolsiz hisob yangi kirish bilan yaratolmadi: ' || r::text);
  v_k2 := (r->>'id')::uuid;
  r := public.t2_imzo_kalit_yarat_v1(v_u3, 'Boshqa', pg_temp._pk('k3'), null, true);
  v_k3 := (r->>'id')::uuid;
  perform pg_temp._k(public.t2_imzo_kalit_yarat_v1(v_u5, 'Takror', pg_temp._pk('k1'), null, true)->>'code' = 'KALIT_BAND', q, 'bir xil ochiq kalit ikki marta ro''yxatdan o''tdi');
  perform pg_temp._k(public.t2_imzo_kalit_yarat_v1(v_u5, 'Qisqa', 'qisqa', null, true)->>'code' = 'KALIT_NOTOGRI', q, 'noto''g''ri uzunlikdagi kalit o''tdi');
  perform pg_temp._k(public.t2_imzo_kalit_yarat_v1(v_u5, '   ', pg_temp._pk('k5'), null, true)->>'code' = 'QURILMA_NOTOGRI', q, 'bo''sh qurilma nomi o''tdi');
  perform pg_temp._k(public.t2_imzo_kalit_yarat_v1(v_u4, 'Bekor', pg_temp._pk('k4'), null, true)->>'code' = 'ACTOR_NOT_FOUND', q, 'o''chirilgan foydalanuvchi kalit yaratdi');
  for i in 1..4 loop r := public.t2_imzo_kalit_yarat_v1(v_u5, 'Q' || i, pg_temp._pk('l' || i), null, true); perform pg_temp._k((r->>'ok')::boolean, q, 'limit: ' || i || ' ' || r::text); end loop;
  r := public.t2_imzo_kalit_yarat_v1(v_u5, 'Q5', pg_temp._pk('l5'), null, true);
  perform pg_temp._k((r->>'ok')::boolean, q, '5-kalit yaratilmadi');
  perform pg_temp._k(public.t2_imzo_kalit_yarat_v1(v_u5, 'Q6', pg_temp._pk('l6'), null, true)->>'code' = 'KALIT_LIMIT', q, '6-faol kalit o''tdi');

  -- 3 ro'yxat: faqat o'zi
  q := 'royxat';
  r := public.t2_imzo_kalit_royxat_v1(v_u1);
  perform pg_temp._k(jsonb_array_length(r->'kalitlar') = 1 and (r->'kalitlar'->0->>'id')::uuid = v_k1, q, 'u1 o''z kalitini ko''rmadi/begona ko''rdi: ' || r::text);
  perform pg_temp._k(not (r::text like '%' || v_k2::text || '%') and not (r::text like '%' || v_k3::text || '%'), q, 'begona kalit ro''yxatda');
  perform pg_temp._k(public.t2_imzo_kalit_royxat_v1(v_u4)->>'code' = 'ACTOR_NOT_FOUND', q, 'o''chirilgan foydalanuvchi ro''yxat oldi');

  -- 4 imzo qo'yish
  q := 'imzo_yoz';
  r := pg_temp._yoz(v_u1, v_d1, v_k1);
  perform pg_temp._k((r->>'ok')::boolean, q, 'o''z kaliti bilan imzo yozilmadi: ' || r::text);
  v_tok := r->>'token';
  perform pg_temp._k(pg_temp._yoz(v_u1, v_d1, v_k2)->>'code' = 'KALIT_YOQ', q, 'begona kalit bilan imzo o''tdi (admin/boshqa nomidan imzo)');
  perform pg_temp._k(pg_temp._yoz(v_u1, v_dB, v_k1)->>'code' = 'HUJJAT_TOPILMADI', q, 'begona kompaniya hujjatiga imzo o''tdi');
  perform pg_temp._k(pg_temp._yoz(v_u1, -1, v_k1)->>'code' = 'HUJJAT_TOPILMADI', q, 'mavjud bo''lmagan hujjat javobi boshqa');
  perform pg_temp._k(pg_temp._yoz(v_u5, v_d1, v_k1)->>'code' = 'KALIT_YOQ', q, 'a''zo bo''lmagan odam begona kalit bilan');
  perform pg_temp._k(pg_temp._yoz(v_u4, v_d1, v_k1)->>'code' in ('ACTOR_NOT_FOUND'), q, 'o''chirilgan foydalanuvchi imzo qo''ydi');
  r := public.t2_imzo_manba_v1(v_u1, v_d1, v_k1, null, 'pudratchi', null);
  perform pg_temp._k(r->>'rol' = 'pto' and r->>'imzolovchi' = 'IMZO-AKC Bir' and (r->>'kompaniya_id')::bigint = v_a, q, 'manba ism/rol/kompaniya noto''g''ri');
  perform pg_temp._k(pg_temp._yoz(v_u1, v_d1, v_k1, null, '2020-01-01T00:00:00.000Z')->>'code' = 'VAQT_OYNASI', q, 'eski vaqtli imzo o''tdi (replay)');
  perform pg_temp._k(pg_temp._yoz(v_u1, v_d1, v_k1, null, to_char((now() + interval '10 minutes') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))->>'code' = 'VAQT_OYNASI', q, 'kelajak vaqtli imzo o''tdi');
  perform pg_temp._k(pg_temp._yoz(v_u1, v_d1, v_k1, null, '2026-12-18 09:30')->>'code' = 'TALAB_NOTOGRI', q, 'noto''g''ri vaqt formati o''tdi');

  -- 5 zanjir (hujjat bo'yicha chiziqli)
  q := 'zanjir';
  select xesh into v_prev from public.t2_imzo where hujjat_id = v_d1 order by id desc limit 1;
  perform pg_temp._k(public.t2_imzo_manba_v1(v_u2, v_d1, v_k2, null, 'pudratchi', null)->>'oldingi_xesh' = v_prev, q, 'manba oldingi xeshni bermadi');
  perform pg_temp._k(pg_temp._yoz(v_u2, v_d1, v_k2, repeat('0', 64))->>'code' = 'ZANJIR_YANGILANDI', q, 'eskirgan oldingi xesh bilan imzo o''tdi (fork)');
  r := pg_temp._yoz(v_u2, v_d1, v_k2);
  perform pg_temp._k((r->>'ok')::boolean, q, 'ikkinchi imzo zanjirga qo''shilmadi: ' || r::text);
  select count(distinct oldingi_xesh) into v_n from public.t2_imzo where hujjat_id = v_d1;
  perform pg_temp._k(v_n = 2, q, 'zanjirda bir xil oldingi xesh takrorlangan');
  perform pg_temp._k(pg_temp._xato(format($f$insert into public.t2_imzo (token, kompaniya_id, hujjat_id, hujjat_sha256, mazmun_xesh, kalit_id, foydalanuvchi_id, imzolovchi, rol, tomon, imzolovchi_kompaniya_id, imzolovchi_kompaniya, vaqt, nonce, oldingi_xesh, xesh, imzo)
    values (pg_temp._tok(), %s, %s, repeat('a',64), repeat('1',64), %L, %s, 'x', 'y', 'pudratchi', %s, 'x', now(), pg_temp._tok(), %L, repeat('2',64), repeat('B',86))$f$, v_a, v_d1, v_k1, v_u1, v_a, v_prev)) <> 'OK', q, 'bir oldingi xeshdan ikki davom (fork) o''tdi');
  r := pg_temp._yoz(v_u1, v_d2, v_k1);
  perform pg_temp._k((r->>'ok')::boolean and public.t2_imzo_manba_v1(v_u1, v_d2, v_k1, null, 'pudratchi', null)->>'oldingi_xesh' <> repeat('0', 64), q, 'boshqa hujjat zanjiri alohida bo''lishi kerak');
  select count(*) into v_n from public.t2_imzo where hujjat_id = v_d2 and oldingi_xesh = repeat('0', 64);
  perform pg_temp._k(v_n = 1, q, 'yangi hujjat zanjiri boshi 0 emas');

  -- 6 append-only
  q := 'append_only';
  perform pg_temp._k(pg_temp._xato('update public.t2_imzo set rol = ''boss''') like 'IMZO_YOZUV_OZGARMAYDI%', q, 'UPDATE rad etilmadi');
  perform pg_temp._k(pg_temp._xato('update public.t2_imzo set imzo = repeat(''C'', 86)') like 'IMZO_YOZUV_OZGARMAYDI%', q, 'imzoni almashtirish rad etilmadi');
  perform pg_temp._k(pg_temp._xato('delete from public.t2_imzo') like 'IMZO_YOZUV_OZGARMAYDI%', q, 'DELETE rad etilmadi');
  perform pg_temp._k(pg_temp._xato('truncate public.t2_imzo') like 'IMZO_YOZUV_OZGARMAYDI%', q, 'TRUNCATE rad etilmadi');
  perform pg_temp._k(pg_temp._xato('delete from public.t2_imzo_kalit') like 'IMZO_KALIT_OCHIRILMAYDI%', q, 'kalit DELETE rad etilmadi');
  perform pg_temp._k(pg_temp._xato('update public.t2_imzo_kalit set ochiq_kalit = repeat(''Z'', 87)') like 'IMZO_KALIT_OZGARMAYDI%', q, 'ochiq kalitni almashtirish rad etilmadi (kalit almashtirish)');
  perform pg_temp._k(pg_temp._xato('update public.t2_imzo_kalit set foydalanuvchi_id = foydalanuvchi_id + 1') like 'IMZO_KALIT_OZGARMAYDI%', q, 'kalit egasini o''zgartirish rad etilmadi');
  perform pg_temp._k(pg_temp._xato('delete from public.t2_document_registry where id = ' || v_d1) <> 'OK', q, 'imzolangan hujjat reestrdan o''chirildi');

  -- 7 hujjat o'zgarsa
  q := 'hujjat_ozgardi';
  r := public.t2_imzo_hujjat_royxat_v1(v_u1, v_d1);
  perform pg_temp._k(jsonb_array_length(r->'imzolar') = 2 and (select bool_and(x->>'hujjat_holat' = 'ozgarmagan') from jsonb_array_elements(r->'imzolar') x), q, 'o''zgarmagan hujjat holati noto''g''ri: ' || r::text);
  update public.t2_document_registry set sha256 = repeat('e', 64) where id = v_d1;
  r := public.t2_imzo_hujjat_royxat_v1(v_u1, v_d1);
  perform pg_temp._k((select bool_and(x->>'hujjat_holat' = 'ozgargan') from jsonb_array_elements(r->'imzolar') x), q, 'hujjat xeshi o''zgargach imzo yaroqsiz ko''rinmadi: ' || r::text);
  perform pg_temp._k(public.t2_imzo_manba_v1(v_u1, v_d1, v_k1, null, 'pudratchi', null)->>'hujjat_sha256' = repeat('e', 64), q, 'yangi tahrirga yangi imzo: manba yangi xeshni bermadi');
  update public.t2_document_registry set sha256 = repeat('a', 64), status = 'superseded' where id = v_d1;
  perform pg_temp._k((select bool_and(x->>'hujjat_holat' = 'almashtirilgan') from jsonb_array_elements(public.t2_imzo_hujjat_royxat_v1(v_u1, v_d1)->'imzolar') x), q, 'almashtirilgan holat ko''rinmadi');
  perform pg_temp._k(pg_temp._yoz(v_u1, v_d1, v_k1)->>'code' = 'HUJJAT_TAYYOR_EMAS', q, 'almashtirilgan hujjatga imzo o''tdi');
  update public.t2_document_registry set status = 'active' where id = v_d1;
  perform pg_temp._k(public.t2_imzo_hujjat_royxat_v1(v_u3, v_d1)->>'code' = 'HUJJAT_TOPILMADI', q, 'begona kompaniya hujjat imzolarini ko''rdi');

  -- 8 mening imzolarim
  q := 'mening';
  r := public.t2_imzo_mening_v1(v_u1, 50);
  perform pg_temp._k(jsonb_array_length(r->'imzolar') = 3 and (select bool_and((x->>'foydalanuvchi_id')::bigint = v_u1) from jsonb_array_elements(r->'imzolar') x), q, 'mening imzolarim: begona yoki yetishmaydi');

  -- 9 ochiq tekshiruv
  q := 'ochiq';
  r := public.t2_imzo_ochiq_v1(v_tok);
  perform pg_temp._k((r->>'ok')::boolean, q, 'ochiq tekshiruv tokenni topmadi');
  perform pg_temp._k((select array_agg(k order by k) from jsonb_object_keys(r) k) = array['hujjat', 'imzolar', 'ok', 'token'], q, 'ochiq javob yuqori daraja kalitlari: ' || (select string_agg(k, ',') from jsonb_object_keys(r) k));
  perform pg_temp._k((select array_agg(k order by k) from jsonb_object_keys(r->'hujjat') k) = array['kompaniya', 'sana', 'tahrir', 'turi'], q, 'hujjat kalitlari kutilganidan farq qiladi');
  perform pg_temp._k(not exists (select 1 from jsonb_array_elements(r->'imzolar') x, jsonb_object_keys(x) k where k in ('fayl_nomi', 'summa', 'r2_obyekt', 'r2_key', 'size_bytes', 'hajm', 'foydalanuvchi_id_maxfiy')), q, 'ochiq javobda maxfiy maydon bor');
  perform pg_temp._k(r->'hujjat'->>'kompaniya' = 'IMZO-AKC A' and r->'hujjat'->>'turi' = 'imzo_akc_hujjat', q, 'hujjat ma''lumoti noto''g''ri');
  perform pg_temp._k(not (r::text like '%imzo-akc-1.xlsx%') and not (r::text like '%imzo-akc/%'), q, 'fayl nomi/R2 kaliti ochiq javobda');
  perform pg_temp._k(public.t2_imzo_ochiq_v1(pg_temp._tok()) = '{"ok": false, "code": "TOPILMADI"}'::jsonb, q, 'topilmagan token boshqacha javob');
  perform pg_temp._k(public.t2_imzo_ochiq_v1('qisqa') = public.t2_imzo_ochiq_v1(pg_temp._tok()) and public.t2_imzo_ochiq_v1(null) = public.t2_imzo_ochiq_v1(pg_temp._tok()), q, 'noto''g''ri shakldagi token boshqacha javob');
  perform pg_temp._k(not exists (select 1 from public.t2_imzo where token = pg_temp._tok()), q, 'tasodifiy token bazada bor');

  -- 10 kirgan odam hujjatni ochishi
  q := 'ruxsat';
  perform pg_temp._k((public.t2_imzo_hujjat_ruxsat_v1(v_u2, v_tok)->>'hujjat_id')::bigint = v_d1, q, 'a''zo hujjatni ocholmadi');
  perform pg_temp._k(public.t2_imzo_hujjat_ruxsat_v1(v_u3, v_tok) = public.t2_imzo_hujjat_ruxsat_v1(v_u3, pg_temp._tok()), q, 'begona kompaniya odamiga topilmagan token bilan farqli javob (mavjudlik sezildi)');
  perform pg_temp._k(public.t2_imzo_hujjat_ruxsat_v1(v_u3, v_tok)->>'code' = 'RUXSAT_YOQ', q, 'begona kompaniya hujjatni ochdi');

  -- 10b tomon modeli: imzolovchi kompaniyasi, «nomidan», usul
  q := 'tomon';
  select count(*) into v_n from public.t2_imzo where usul = 'tizim' and tomon is not null and imzolovchi_kompaniya_id is not null;
  perform pg_temp._k(v_n = (select count(*) from public.t2_imzo), q, 'usul/tomon/kompaniya to''ldirilmagan imzo bor');
  perform pg_temp._k(pg_temp._xato('update public.t2_imzo set usul = ''eri''') like 'IMZO_YOZUV_OZGARMAYDI%', q, 'usulni o''zgartirish rad etilmadi');
  perform pg_temp._k(pg_temp._xato('insert into public.t2_imzo (token, kompaniya_id, hujjat_id, hujjat_sha256, mazmun_xesh, kalit_id, foydalanuvchi_id, imzolovchi, rol, usul, tomon, imzolovchi_kompaniya_id, imzolovchi_kompaniya, vaqt, nonce, oldingi_xesh, xesh, imzo) values (pg_temp._tok(), '
    || v_a || ', ' || v_d2 || ', repeat(''a'',64), repeat(''1'',64), ''' || v_k2 || ''', ' || v_u2 || ', ''x'', ''y'', ''noma''''lum'', ''pudratchi'', ' || v_a || ', ''x'', now(), pg_temp._tok(), repeat(''7'',64), repeat(''8'',64), repeat(''B'',86))') <> 'OK', q, 'noma''lum usul o''tdi');
  perform pg_temp._k(pg_temp._yoz(v_u2, v_d2, v_k2, null, null, null, 'kimdir')->>'code' = 'TOMON_NOTOGRI', q, 'noma''lum tomon o''tdi');
  -- buyurtmachi (B) hali hujjat egasi bilan aloqada emas
  perform pg_temp._k(pg_temp._yoz(v_u3, v_d2, v_k3, null, null, v_b, 'buyurtmachi')->>'code' = 'HUJJAT_TOPILMADI', q, 'aloqasiz begona kompaniya hujjatga imzo qo''ydi');
  insert into public.t2_tomon_aloqa (taklif_kompaniya_id, qabul_kompaniya_id, taklif_rol, qabul_rol, taklif_actor_id, holat) values (v_a, v_b, 'pudratchi', 'buyurtmachi', v_u1, 'faol') returning id into v_n;
  perform pg_temp._k(pg_temp._yoz(v_u3, v_d2, v_k3, null, null, v_b, 'buyurtmachi')->>'code' = 'HUJJAT_TOPILMADI', q, 'aloqa bor, lekin hujjat taqdim qilinmagan - imzo o''tdi');
  insert into public.t2_tomon_taqdim (aloqa_id, taqdim_etuvchi_kompaniya_id, qabul_qiluvchi_kompaniya_id, resurs, manba_jadval, manba_id, nom, taqdim_actor_id)
    values (v_n, v_a, v_b, (select kalit from public.t2_tomon_resurs limit 1), 't2_document_registry', v_d2, 'IMZO-AKC taqdim', v_u1);
  r := pg_temp._yoz(v_u3, v_d2, v_k3, null, null, v_b, 'buyurtmachi');
  perform pg_temp._k((r->>'ok')::boolean, q, 'taqdim qilingan hujjatga buyurtmachi imzo qo''yolmadi: ' || r::text);
  perform pg_temp._k(public.t2_imzo_manba_v1(v_u3, v_d2, v_k3, v_b, 'buyurtmachi', null)->>'imzolovchi_kompaniya' = 'IMZO-AKC B', q, 'imzolovchi kompaniyasi nomi noto''g''ri');
  perform pg_temp._k(public.t2_imzo_manba_v1(v_u3, v_d2, v_k3, v_a, 'buyurtmachi', null)->>'code' = 'HUJJAT_TOPILMADI', q, 'a''zo bo''lmagan kompaniya nomidan (imzolovchi kompaniyasi) imzo qo''yildi');
  -- «nomidan»: B nomidan A... faqat faol aloqa bo'lsa; o'z nomidan emas
  perform pg_temp._k(public.t2_imzo_manba_v1(v_u3, v_d2, v_k3, v_b, 'texnadzor', v_b)->>'code' = 'VAKOLAT_YOQ', q, 'kompaniya o''zi nomidan (nomidan = o''zi) o''tdi');
  perform pg_temp._k(public.t2_imzo_manba_v1(v_u3, v_d2, v_k3, v_b, 'texnadzor', v_a)->>'nomidan_kompaniya' = 'IMZO-AKC A' and public.t2_imzo_manba_v1(v_u3, v_d2, v_k3, v_b, 'texnadzor', v_a)->>'ok' = 'true', q, 'aloqali kompaniya nomidan imzo ruxsat etilmadi');
  perform pg_temp._k(public.t2_imzo_manba_v1(v_u3, v_d2, v_k3, v_b, 'texnadzor', v_u5)->>'code' = 'VAKOLAT_YOQ', q, 'aloqasiz kompaniya nomidan imzo o''tdi (mavjud bo''lmagan id)');
  r := pg_temp._yoz(v_u3, v_d2, v_k3, null, null, v_b, 'texnadzor', v_a);
  perform pg_temp._k((r->>'ok')::boolean, q, 'nomidan imzo yozilmadi: ' || r::text);
  perform pg_temp._k((select nomidan_kompaniya = 'IMZO-AKC A' and imzolovchi_kompaniya = 'IMZO-AKC B' and tomon = 'texnadzor' from public.t2_imzo where token = r->>'token'), q, 'nomidan/imzolovchi kompaniya saqlanmadi');
  perform pg_temp._k(public.t2_imzo_ochiq_v1(r->>'token')->'imzolar'->-1->>'tomon' = 'texnadzor' and public.t2_imzo_ochiq_v1(r->>'token')->'imzolar'->-1->>'nomidan_kompaniya' = 'IMZO-AKC A', q, 'ochiq javobda tomon yo''q');
  -- 11 kalit bekor qilish
  q := 'bekor';
  perform pg_temp._k(public.t2_imzo_kalit_bekor_v1(v_u1, v_k2, 'sabab bor', null)->>'code' = 'KALIT_YOQ', q, 'begona kalitni bekor qildi');
  perform pg_temp._k(public.t2_imzo_kalit_bekor_v1(v_u1, v_k1, 'x', null)->>'code' = 'SABAB_KERAK', q, 'sababsiz bekor o''tdi');
  perform pg_temp._k(public.t2_imzo_kalit_bekor_v1(v_u1, v_k1, 'qurilma yo''qoldi', now() + interval '1 day')->>'code' = 'VAQT_NOTOGRI', q, 'kelajak shubhali vaqt o''tdi');
  r := public.t2_imzo_kalit_bekor_v1(v_u1, v_k1, 'qurilma yo''qoldi', now());
  perform pg_temp._k((r->>'ok')::boolean, q, 'o''z kalitini bekor qilolmadi: ' || r::text);
  perform pg_temp._k(public.t2_imzo_kalit_bekor_v1(v_u1, v_k1, 'qayta bekor', null)->>'code' = 'KALIT_BEKOR', q, 'bekor kalit qayta bekor qilindi');
  perform pg_temp._k(pg_temp._yoz(v_u1, v_d1, v_k1)->>'code' = 'KALIT_BEKOR', q, 'bekor qilingan kalit bilan imzo o''tdi');
  perform pg_temp._k(pg_temp._xato('update public.t2_imzo_kalit set bekor_vaqt = null, bekor_sabab = null where id = ''' || v_k1 || '''') like 'IMZO_KALIT_OZGARMAYDI%', q, 'bekor qilingan kalit qayta faollashdi');
  r := public.t2_imzo_hujjat_royxat_v1(v_u1, v_d1);
  perform pg_temp._k(exists (select 1 from jsonb_array_elements(r->'imzolar') x where x->>'kalit_bekor_vaqt' is not null and x->>'shubhali_dan' is not null), q, 'bekor qilingan kalit imzolarida bekor/shubhali belgisi yo''q');
  perform pg_temp._k(public.t2_imzo_kalit_royxat_v1(v_u1)->'kalitlar'->0->>'bekor_sabab' is not null, q, 'ro''yxatda bekor sababi yo''q');
  -- 12 nashr (manba QR)
  q := 'nashr';
  perform pg_temp._k(to_regclass('public.t2_nashr') is not null and (select relrowsecurity from pg_class where oid = 'public.t2_nashr'::regclass), q, 't2_nashr yo''q yoki RLS yoqilmagan');
  perform pg_temp._k(not has_table_privilege('anon', 'public.t2_nashr', 'select') and not has_table_privilege('authenticated', 'public.t2_nashr', 'select'), q, 'anon/authenticated nashrni o''qiy oladi');
  v_x := pg_temp._h();
  r := public.t2_nashr_tayyor_v1(v_u1, v_a, null, 'f2', 'F2 sinov 2026-10', v_x, pg_temp._tok());
  perform pg_temp._k((r->>'ok')::boolean and (r->>'yangi')::boolean and r->>'hujjat_id' is null, q, 'yangi nashr ochilmadi: ' || r::text);
  v_tok := r->>'token';
  r2 := public.t2_nashr_tayyor_v1(v_u2, v_a, null, 'f2', 'F2 sinov 2026-10', v_x, pg_temp._tok());
  perform pg_temp._k(r2->>'token' = v_tok and not (r2->>'yangi')::boolean, q, 'bir xil mazmun yangi nashr ochdi (token qayta ishlatilishi kerak): ' || r2::text);
  select count(*) into v_n from public.t2_nashr where kompaniya_id = v_a and mazmun_xesh = v_x;
  perform pg_temp._k(v_n = 1, q, 'bir xil mazmun uchun bir nechta nashr');
  perform pg_temp._k(public.t2_nashr_tayyor_v1(v_u3, v_a, null, 'f2', 'x', pg_temp._h(), pg_temp._tok())->>'code' = 'RUXSAT_YOQ', q, 'begona kompaniya odami nashr ochdi');
  perform pg_temp._k(public.t2_nashr_tayyor_v1(v_u1, v_a, null, 'f2', 'x', 'xyz', pg_temp._tok())->>'code' = 'TALAB_NOTOGRI', q, 'noto''g''ri xesh o''tdi');
  perform pg_temp._k(public.t2_nashr_nusxa_v1(v_u3, v_tok, v_d1)->>'code' = 'RUXSAT_YOQ', q, 'begona odam nusxa biriktirdi');
  perform pg_temp._k(public.t2_nashr_nusxa_v1(v_u1, v_tok, v_dB)->>'code' = 'HUJJAT_TAYYOR_EMAS', q, 'begona kompaniya hujjati nusxa sifatida biriktirildi');
  r := public.t2_nashr_nusxa_v1(v_u1, v_tok, v_d1);
  perform pg_temp._k((r->>'ok')::boolean and (r->>'yangi')::boolean, q, 'nusxa biriktirilmadi: ' || r::text);
  perform pg_temp._k(not (public.t2_nashr_nusxa_v1(v_u1, v_tok, v_d2)->>'yangi')::boolean and (public.t2_nashr_nusxa_v1(v_u1, v_tok, v_d2)->>'hujjat_id')::bigint = v_d1, q, 'nusxa ikkinchi marta almashtirildi');
  r := public.t2_nashr_ochiq_v1(v_tok);
  perform pg_temp._k((select array_agg(k order by k) from jsonb_object_keys(r) k) = array['imzolar', 'nashr', 'ok', 'token'], q, 'nashr ochiq javobi kalitlari: ' || (select string_agg(k, ',') from jsonb_object_keys(r) k));
  perform pg_temp._k((select array_agg(k order by k) from jsonb_object_keys(r->'nashr') k) = array['joriy', 'joriy_token', 'kompaniya', 'mazmun_xesh', 'sana', 'turi'], q, 'nashr kalitlari kutilganidan farq qiladi');
  perform pg_temp._k(not (r::text like '%F2 sinov%') and not (r::text like '%imzo-akc-1.xlsx%') and not (r::text like '%mazmun_xesh%' and false), q, 'nashr ochiq javobida atama/fayl nomi bor');
  perform pg_temp._k((r->'nashr'->>'joriy')::boolean and jsonb_array_length(r->'imzolar') >= 1, q, 'joriy belgisi yoki imzolar (nusxa imzolangan) yo''q');
  perform pg_temp._k(public.t2_nashr_ochiq_v1(pg_temp._tok()) = '{"ok": false, "code": "TOPILMADI"}'::jsonb and public.t2_nashr_ochiq_v1('qisqa') = public.t2_nashr_ochiq_v1(null), q, 'topilmagan nashr tokeni boshqacha javob');
  -- eskirgan: bir xil atama, yangi mazmun
  r2 := public.t2_nashr_tayyor_v1(v_u1, v_a, null, 'f2', 'F2 sinov 2026-10', pg_temp._h(), pg_temp._tok());
  r := public.t2_nashr_ochiq_v1(v_tok);
  perform pg_temp._k(not (r->'nashr'->>'joriy')::boolean and r->'nashr'->>'joriy_token' = r2->>'token', q, 'eski nashr eskirgan deb belgilanmadi: ' || r::text);
  perform pg_temp._k((public.t2_nashr_ochiq_v1(r2->>'token')->'nashr'->>'joriy')::boolean, q, 'yangi nashr joriy emas');
  -- ruxsat
  perform pg_temp._k((public.t2_nashr_ruxsat_v1(v_u2, v_tok)->>'hujjat_id')::bigint = v_d1, q, 'a''zo nashrni ocholmadi');
  perform pg_temp._k(public.t2_nashr_ruxsat_v1(v_u3, v_tok) = public.t2_nashr_ruxsat_v1(v_u3, pg_temp._tok()), q, 'begona odamga mavjud/mavjud emas token farqli javob');
  perform pg_temp._k(public.t2_nashr_ruxsat_v1(v_u3, v_tok)->>'code' = 'RUXSAT_YOQ', q, 'begona odam nashrni ochdi');
  -- append-only va tozalash
  perform pg_temp._k(pg_temp._xato('delete from public.t2_nashr') like 'NASHR_OCHIRILMAYDI%', q, 'nashr DELETE rad etilmadi');
  perform pg_temp._k(pg_temp._xato('update public.t2_nashr set turi = ''boshqa''') like 'NASHR_OZGARMAYDI%', q, 'nashr turini o''zgartirish rad etilmadi');
  perform pg_temp._k(pg_temp._xato('update public.t2_nashr set mazmun_xesh = repeat(''9'', 64)') like 'NASHR_OZGARMAYDI%', q, 'nashr xeshini o''zgartirish rad etilmadi');
  perform pg_temp._k(pg_temp._xato('truncate public.t2_nashr') like 'NASHR_OZGARMAYDI%' or pg_temp._xato('truncate public.t2_nashr') like 'NASHR_OCHIRILMAYDI%', q, 'nashr TRUNCATE rad etilmadi');
  perform pg_temp._k(public.t2_nashr_tozala_v1(1) = 0, q, 'yangi nashrlar tozalandi');
  perform pg_temp._k(pg_temp._xato('select public.t2_nashr_tozala_v1(0)') <> 'OK', q, 'noto''g''ri muddat qabul qilindi');
  select count(*) into v_n from pg_proc p where p.pronamespace = 'public'::regnamespace and (p.proname like 't2\_nashr\_%' or p.proname like '\_t2\_nashr\_%')
    and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute') or not has_function_privilege('service_role', p.oid, 'execute'));
  perform pg_temp._k(v_n = 0, q, 'nashr funksiyalari anon/authenticated ga ochiq');end $t$;

rollback;
