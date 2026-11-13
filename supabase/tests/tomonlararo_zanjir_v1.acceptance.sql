-- TOMONLARARO ZANJIR v1 -- cross-party workflows end to end with the system's REAL RPCs.
-- Run ONLY inside a caller-provided transaction that is ROLLED BACK. Synthetic data only (no real names / INN / sums).
-- Companies: contractor P, customer Z, technical supervision T, designer L, laboratory B, supplier Y, subcontractor S,
-- carrier C, stranger X. Every company has its OWN ordinary users (no superadmin); the role-specific user performs the step,
-- and if the permission system refuses it (42501 / role code) the step is retried with the company boss and a
--   NOTICE 'UZILISH [n]: ...'  is recorded (a link that is broken for that party/role).
-- Failures that are NOT permission gaps raise:  TOMON qadam [<n> <name>]: <sqlerrm>.
-- UZILISH notices (missing RPC / broken hand-off) are collected and printed at the end; they are findings, not failures.
-- The import temp table guard (drop table if exists pg_temp.t2_imp_qator) is not needed here (no smeta import).

set local statement_timeout = '300s';

create temp table if not exists tz_uzilish(n integer, matn text) on commit drop;

create or replace function pg_temp.tz_uz(p_n integer, p_matn text) returns void language plpgsql as $f$
begin
  insert into pg_temp.tz_uzilish(n, matn) values (p_n, p_matn);
  raise notice 'UZILISH [%]: %', p_n, p_matn;
end $f$;

create or replace function pg_temp.tz_assert(p_cond boolean, p_msg text) returns void language plpgsql as $f$
begin if p_cond is not true then raise exception 'ASSERT: %', p_msg; end if; end $f$;

create or replace function pg_temp.tz_ok(p_r jsonb, p_what text) returns void language plpgsql as $f$
begin
  if p_r is null or coalesce((p_r->>'ok')::boolean, false) is not true then
    raise exception 'RPC % returned %', p_what, left(coalesce(p_r::text, 'NULL'), 500);
  end if;
end $f$;

-- Role step: template with $A for the actor. Role user first; on a permission refusal -> UZILISH + retry with the boss.
create or replace function pg_temp.tz_try(p_n integer, p_label text, p_tmpl text, p_role bigint, p_boss bigint) returns jsonb language plpgsql as $f$
declare r jsonb;
begin
  if p_role is distinct from p_boss then
    begin
      execute 'select to_jsonb(' || replace(p_tmpl, '$A', p_role::text) || ')' into r;
      if not (r is not null and jsonb_typeof(r) = 'object' and (r->>'ok') = 'false' and coalesce(r->>'code', '') ~ 'ROL|ROLE|DENIED|FORBIDDEN|RUXSAT') then return r; end if;
      perform pg_temp.tz_uz(p_n, p_label || ': rol bilan rad (' || coalesce(r->>'code', '?') || ') - kompaniya boss bilan davom');
    exception when insufficient_privilege then
      perform pg_temp.tz_uz(p_n, p_label || ': rol bilan 42501 (' || left(sqlerrm, 120) || ') - kompaniya boss bilan davom');
    end;
  end if;
  execute 'select to_jsonb(' || replace(p_tmpl, '$A', p_boss::text) || ')' into r;
  return r;
end $f$;

create or replace function pg_temp.tz_arr(j jsonb) returns jsonb language sql immutable as $f$
  select case when j is null then '[]'::jsonb when jsonb_typeof(j) = 'array' then j
              else coalesce(j->'qatorlar', j->'royxat', j->'items', j->'natija', '[]'::jsonb) end
$f$;

-- is row with this id in the list (key id / taqdim_id / murojaat_id)?
create or replace function pg_temp.tz_has(j jsonb, p_id bigint) returns boolean language sql immutable as $f$
  select exists (select 1 from jsonb_array_elements(pg_temp.tz_arr(j)) e
                  where coalesce(e->>'id', e->>'taqdim_id', e->>'murojaat_id') = p_id::text)
$f$;

create or replace function pg_temp.tz_row(j jsonb, p_id bigint) returns jsonb language sql immutable as $f$
  select e from jsonb_array_elements(pg_temp.tz_arr(j)) e where coalesce(e->>'id', e->>'taqdim_id', e->>'murojaat_id') = p_id::text limit 1
$f$;

-- true when the call is HIDDEN/DENIED for the caller: 42501 or ok=false or empty list or code TOPILMADI.
create or replace function pg_temp.tz_hidden(p_sql text) returns boolean language plpgsql as $f$
declare r jsonb;
begin
  begin
    execute 'select to_jsonb(' || p_sql || ')' into r;
  exception when insufficient_privilege or raise_exception then return true;
  end;
  if r is null then return true; end if;
  if jsonb_typeof(r) = 'array' then return jsonb_array_length(r) = 0; end if;
  return coalesce((r->>'ok')::boolean, true) is false or r->>'code' in ('TOPILMADI', 'NOT_FOUND', 'DOCUMENT_FORBIDDEN');
end $f$;

create or replace function pg_temp.tz_aloqa(p_boss bigint, p_komp bigint, q_boss bigint, q_komp bigint, p_turi text, p_qabul_rol text)
returns bigint language plpgsql as $f$
declare r jsonb; v_inn text; v_id bigint;
begin
  select inn into v_inn from public.t2_kompaniya where id = q_komp;
  r := public.t2_tomon_taklif_v1(p_boss, p_komp, q_komp, v_inn, null, 'pudratchi', p_qabul_rol, p_turi, 'TZ aloqa', null, null, gen_random_uuid());
  perform pg_temp.tz_ok(r, 'tomon_taklif ' || p_qabul_rol); v_id := (r->>'id')::bigint;
  r := public.t2_tomon_javob_v1(q_boss, q_komp, v_id, 'qabul', null);
  perform pg_temp.tz_ok(r, 'tomon_javob ' || p_qabul_rol);
  return v_id;
end $f$;

create or replace function pg_temp.tz_aloqa2(p_boss bigint, p_komp bigint, q_boss bigint, q_komp bigint, p_turi text, p_rol text, p_qabul_rol text)
returns bigint language plpgsql as $f$
declare r jsonb; v_inn text; v_id bigint;
begin
  select inn into v_inn from public.t2_kompaniya where id = q_komp;
  r := public.t2_tomon_taklif_v1(p_boss, p_komp, q_komp, v_inn, null, p_rol, p_qabul_rol, p_turi, 'TZ aloqa', null, null, gen_random_uuid());
  perform pg_temp.tz_ok(r, 'tomon_taklif2 ' || p_qabul_rol); v_id := (r->>'id')::bigint;
  r := public.t2_tomon_javob_v1(q_boss, q_komp, v_id, 'qabul', null);
  perform pg_temp.tz_ok(r, 'tomon_javob2 ' || p_qabul_rol);
  return v_id;
end $f$;
create or replace function pg_temp.tz_user(p_login text, p_komp bigint, p_rol text) returns bigint language plpgsql as $f$
declare v_id bigint;
begin
  insert into public.t2_foydalanuvchi(login, ism, holat) values (p_login, 'TZ ' || p_rol, 'faol') returning id into v_id;
  insert into public.t2_azolik(foydalanuvchi_id, kompaniya_id, rol, holat) values (v_id, p_komp, p_rol, 'faol');
  return v_id;
end $f$;

create or replace function pg_temp.tz_komp(p_nom text, p_tag text) returns bigint language plpgsql as $f$
declare v_id bigint;
begin
  insert into public.t2_kompaniya(nom, kod, inn, faol)
  values ('TZ ' || p_nom || ' ' || p_tag, 'TZ' || substr(md5(p_nom || p_tag), 1, 10), '9' || lpad((floor(random() * 100000000))::bigint::text, 8, '0'), true) returning id into v_id;
  return v_id;
end $f$;

create or replace function pg_temp.tz_doc(p_komp bigint, p_obyekt bigint, p_tur text, p_tag text) returns bigint language plpgsql as $f$
declare v_id bigint;
begin
  insert into public.t2_document_registry(kompaniya_id, obyekt_id, document_type, status, canonical_storage_status, r2_key, original_filename, mime_type, size_bytes, sha256, finalized_at)
  values (p_komp, p_obyekt, p_tur, 'active', 'stored', 'tz/' || p_tag || '/' || p_tur || '.pdf', p_tur || '.pdf', 'application/pdf', 10, repeat('c', 64), now()) returning id into v_id;
  return v_id;
end $f$;

-- outbox: did the step produce an outbox row addressed to this company (after marker)?
create or replace function pg_temp.tz_ob(p_n integer, p_label text, p_after bigint, p_komp bigint) returns void language plpgsql as $f$
begin
  if not exists (select 1 from public.t2_outbox o where o.id > p_after and p_komp = any(o.qabul_kompaniya_idlar)) then
    perform pg_temp.tz_uz(p_n, p_label || ': outbox yozuvi yo''q (qabul qiluvchi kompaniya xabar olmaydi)');
  end if;
end $f$;

do $tz$
declare
  v_n integer := 0; v_name text := 'init'; v_tag text := substr(md5(random()::text || clock_timestamp()::text), 1, 8);
  P bigint; Z bigint; T bigint; L bigint; B bigint; Y bigint; S bigint; C bigint; X bigint;
  p_boss bigint; p_pto bigint; p_prorab bigint; p_usta bigint; z_boss bigint; z_user bigint; z_obs bigint; t_boss bigint; t_user bigint;
  l_boss bigint; l_user bigint; b_boss bigint; y_boss bigint; y_user bigint; s_boss bigint; c_user bigint; x_boss bigint;
  o1 bigint; o2 bigint; ox bigint;
  a_pz bigint; a_pt bigint; a_pl bigint; a_pb bigint; a_py bigint; a_ps bigint;
  akt_a bigint; akt_b bigint; tq_a bigint; tq_a2 bigint; tq_b bigint; v_ob bigint;
  r jsonb; m1 bigint; m2 bigint; m3 bigint; v_i integer; v_doc_p bigint; v_doc_b bigint; v_doc_l bigint; v_gid bigint;
  v_top bigint; v_rev bigint; v_tqc bigint; lab bigint;
  rfq bigint; rfq2 bigint; q1 bigint; tk bigint; ver integer; byu bigint; byu_v integer;
  b_sub bigint; b_nar bigint; t_sub bigint; sakt bigint; stq bigint; nid bigint; nver integer; l1 bigint; v_oy date := date_trunc('month', current_date)::date;
  y_yuk bigint; y_ver integer; y_tk bigint; y_bron bigint; y_t jsonb;
  v_list text; v_ob0 bigint; v_aosr bigint; v_tqa bigint;
  Z2 bigint; T2 bigint; z2_boss bigint; z2_tex bigint; t2b_boss bigint; t2b_user bigint; p_ichki bigint; o3 bigint; o4 bigint; a_pz2 bigint; a_z2t2 bigint;
  akt_c bigint; akt_d bigint; akt_e bigint; akt_f bigint; akt_g bigint; akt_h bigint; akt_i bigint; tq_c bigint; tq_d bigint; tq_e bigint; tq_f bigint; tq_g bigint; tq_h bigint; v_aosr2 bigint; tq_ao bigint; v_ob10 bigint; v_vk bigint; v_sorov bigint;
begin
  -- ===================================================================
  v_n := 0; v_name := 'tayyorgarlik: kompaniyalar, foydalanuvchilar, obyektlar, aloqalar (RPC), grantlar';
  select coalesce(max(id), 0) into v_ob0 from public.t2_outbox;
  P := pg_temp.tz_komp('Pudratchi', v_tag); Z := pg_temp.tz_komp('Buyurtmachi', v_tag); T := pg_temp.tz_komp('Texnadzor', v_tag);
  L := pg_temp.tz_komp('Loyihachi', v_tag); B := pg_temp.tz_komp('Laboratoriya', v_tag); Y := pg_temp.tz_komp('Yetkazuvchi', v_tag);
  S := pg_temp.tz_komp('Subpudratchi', v_tag); C := pg_temp.tz_komp('Tashuvchi', v_tag); X := pg_temp.tz_komp('Begona', v_tag);
  p_boss := pg_temp.tz_user('tz_pb_' || v_tag, P, 'boss'); p_pto := pg_temp.tz_user('tz_pp_' || v_tag, P, 'pto');
  p_prorab := pg_temp.tz_user('tz_pr_' || v_tag, P, 'prorab'); p_usta := pg_temp.tz_user('tz_pu_' || v_tag, P, 'usta');
  z_boss := pg_temp.tz_user('tz_zb_' || v_tag, Z, 'boss'); z_user := pg_temp.tz_user('tz_zu_' || v_tag, Z, 'buyurtmachi'); z_obs := pg_temp.tz_user('tz_zo_' || v_tag, Z, 'kuzatuvchi');
  t_boss := pg_temp.tz_user('tz_tb_' || v_tag, T, 'boss'); t_user := pg_temp.tz_user('tz_tu_' || v_tag, T, 'inspektor');
  l_boss := pg_temp.tz_user('tz_lb_' || v_tag, L, 'boss'); l_user := pg_temp.tz_user('tz_lu_' || v_tag, L, 'loyihachi');
  b_boss := pg_temp.tz_user('tz_bb_' || v_tag, B, 'boss');
  y_boss := pg_temp.tz_user('tz_yb_' || v_tag, Y, 'boss'); y_user := pg_temp.tz_user('tz_yu_' || v_tag, Y, 'taminotchi');
  s_boss := pg_temp.tz_user('tz_sb_' || v_tag, S, 'boss'); c_user := pg_temp.tz_user('tz_cu_' || v_tag, C, 'boss'); x_boss := pg_temp.tz_user('tz_xb_' || v_tag, X, 'boss');
  insert into public.t2_obyekt(nom, kompaniya_id) values ('TZ P-obyekt-1 ' || v_tag, P) returning id into o1;
  insert into public.t2_obyekt(nom, kompaniya_id) values ('TZ P-obyekt-2 ' || v_tag, P) returning id into o2;
  insert into public.t2_obyekt(nom, kompaniya_id) values ('TZ X-obyekt ' || v_tag, X) returning id into ox;
  a_pz := pg_temp.tz_aloqa(p_boss, P, z_boss, Z, 'shartnoma', 'buyurtmachi');
  a_pt := pg_temp.tz_aloqa(p_boss, P, t_boss, T, 'nazorat', 'texnadzor');
  a_pl := pg_temp.tz_aloqa(p_boss, P, l_boss, L, 'loyiha', 'loyihachi');
  a_pb := pg_temp.tz_aloqa(p_boss, P, b_boss, B, 'nazorat', 'laboratoriya');
  a_py := pg_temp.tz_aloqa(p_boss, P, y_boss, Y, 'kontakt', 'yetkazuvchi');
  a_ps := pg_temp.tz_aloqa(p_boss, P, s_boss, S, 'subpudrat', 'subpudratchi');
  -- grants P gives (o2 is never granted; Y gets nothing)
  perform pg_temp.tz_ok(public.t2_tomon_grant_saqla_v1(p_boss, P, a_pz, jsonb_build_array(
    jsonb_build_object('resurs', 'obyekt_holat', 'amallar', jsonb_build_array('korish'), 'obyekt_id', o1),
    jsonb_build_object('resurs', 'f2', 'amallar', jsonb_build_array('korish', 'tafsilot'), 'obyekt_id', o1),
    jsonb_build_object('resurs', 'lab_natija', 'amallar', jsonb_build_array('korish'), 'obyekt_id', o1))), 'grant Z');
  perform pg_temp.tz_ok(public.t2_tomon_grant_saqla_v1(p_boss, P, a_pt, jsonb_build_array(
    jsonb_build_object('resurs', 'obyekt_holat', 'amallar', jsonb_build_array('korish'), 'obyekt_id', o1),
    jsonb_build_object('resurs', 'aosr', 'amallar', jsonb_build_array('korish', 'izoh', 'qaror'), 'obyekt_id', o1),
    jsonb_build_object('resurs', 'lab_natija', 'amallar', jsonb_build_array('korish'), 'obyekt_id', o1))), 'grant T');
  perform pg_temp.tz_ok(public.t2_tomon_grant_saqla_v1(p_boss, P, a_pl, jsonb_build_array(jsonb_build_object('resurs', 'obyekt_holat', 'amallar', jsonb_build_array('korish'), 'obyekt_id', o1))), 'grant L');
  perform pg_temp.tz_ok(public.t2_tomon_grant_saqla_v1(p_boss, P, a_pb, jsonb_build_array(jsonb_build_object('resurs', 'obyekt_holat', 'amallar', jsonb_build_array('korish'), 'obyekt_id', o1))), 'grant B');
  v_doc_p := pg_temp.tz_doc(P, o1, 'foto', v_tag); v_doc_b := pg_temp.tz_doc(B, null, 'protokol', v_tag); v_doc_l := pg_temp.tz_doc(L, o1, 'chizma', v_tag);
  insert into public.t2_akt(obyekt_id, kompaniya_id, tur, raqam, oy, hujjat_jami, holat, lifecycle_status) values (o1, P, 'f2', 'TZ-1-' || v_tag, date '2026-09-01', 1000, 'tasdiqlangan', 'approved') returning id into akt_a;
  insert into public.t2_akt(obyekt_id, kompaniya_id, tur, raqam, oy, hujjat_jami, holat, lifecycle_status) values (o1, P, 'f2', 'TZ-2-' || v_tag, date '2026-10-01', 500, 'tasdiqlangan', 'approved') returning id into akt_b;

  -- ===================================================================
  v_n := 1; v_name := 'pudratchi hujjat yuboradi -> buyurtmachi ko''radi -> tuzatish -> qayta yuborish -> qabul; alohida hujjat -> rad';
  select coalesce(max(id), 0) into v_ob from public.t2_outbox;
  r := pg_temp.tz_try(1, 'pudratchi PTO taqdim yubordi', format('public.t2_tomon_taqdim_yarat_v1($A, %s, %s, ''f2'', %s, ''TZ F2-1'', gen_random_uuid())', P, a_pz, akt_a), p_pto, p_boss);
  perform pg_temp.tz_ok(r, 'taqdim_yarat A'); tq_a := (r->>'id')::bigint;
  perform pg_temp.tz_ob(1, 'taqdim -> buyurtmachi', v_ob, Z);
  r := public.t2_tomon_taqdimlar_v1(z_user, Z, 'kelgan', null, null, 50);
  perform pg_temp.tz_assert(pg_temp.tz_has(r, tq_a), 'buyurtmachi yuborilgan taqdimni ro''yxatda ko''rmadi: ' || left(r::text, 300));
  r := pg_temp.tz_try(1, 'buyurtmachi tuzatish so''radi', format('public.t2_tomon_qaror_v1($A, %s, %s, ''tuzatish'', ''TZ izoh: 12-qator narxi'')', Z, tq_a), z_user, z_boss);
  perform pg_temp.tz_assert(r->>'holat' = 'tuzatish', 'tuzatish holati: ' || r::text);
  -- both sides see the same state and the same comment
  perform pg_temp.tz_assert(position('TZ izoh: 12-qator narxi' in public.t2_tomon_taqdim_tafsilot_v1(z_boss, Z, tq_a)::text) > 0
                            and position('TZ izoh: 12-qator narxi' in public.t2_tomon_taqdim_tafsilot_v1(p_boss, P, tq_a)::text) > 0, 'ikkala tomon tuzatish izohini bir xil ko''rishi kerak');
  perform pg_temp.tz_assert((select holat from public.t2_tomon_taqdim where id = tq_a) = 'tuzatish', 'taqdim holati tuzatish');
  r := pg_temp.tz_try(1, 'pudratchi qayta yubordi', format('public.t2_tomon_taqdim_yarat_v1($A, %s, %s, ''f2'', %s, ''TZ F2-1 tuzatilgan'', gen_random_uuid())', P, a_pz, akt_a), p_pto, p_boss);
  perform pg_temp.tz_ok(r, 'taqdim qayta'); tq_a2 := (r->>'id')::bigint;
  perform pg_temp.tz_assert(exists (select 1 from public.t2_tomon_taqdim where id = tq_a2 and oldingi_taqdim_id = tq_a), 'qayta yuborish oldingi taqdimga bog''lanishi kerak');
  r := pg_temp.tz_try(1, 'buyurtmachi qabul qildi', format('public.t2_tomon_qaror_v1($A, %s, %s, ''qabul'', ''TZ ok'')', Z, tq_a2), z_user, z_boss);
  perform pg_temp.tz_assert(r->>'holat' = 'qabul', 'qabul: ' || r::text);
  perform pg_temp.tz_assert((select holat from public.t2_tomon_taqdim where id = tq_a2) = 'qabul', 'qabul holati yozilishi kerak');
  perform pg_temp.tz_ob(1, 'qaror -> pudratchi', v_ob, P);
  -- separate document -> reject (comment mandatory)
  r := public.t2_tomon_taqdim_yarat_v1(p_boss, P, a_pz, 'f2', akt_b, 'TZ F2-2', gen_random_uuid()); perform pg_temp.tz_ok(r, 'taqdim B'); tq_b := (r->>'id')::bigint;
  r := public.t2_tomon_qaror_v1(z_boss, Z, tq_b, 'rad', null);
  perform pg_temp.tz_assert(r->>'code' = 'IZOH_KERAK', 'izohsiz rad etib bo''lmaydi: ' || r::text);
  r := pg_temp.tz_try(1, 'buyurtmachi rad etdi', format('public.t2_tomon_qaror_v1($A, %s, %s, ''rad'', ''TZ rad sababi'')', Z, tq_b), z_user, z_boss);
  perform pg_temp.tz_assert(r->>'holat' = 'rad', 'rad: ' || r::text);
  perform pg_temp.tz_assert(position('TZ rad sababi' in public.t2_tomon_taqdim_tafsilot_v1(p_boss, P, tq_b)::text) > 0
                            and position('TZ rad sababi' in public.t2_tomon_taqdim_tafsilot_v1(z_boss, Z, tq_b)::text) > 0
                            and (select holat from public.t2_tomon_taqdim where id = tq_b) = 'rad', 'rad: ikkala tomon bir xil holat va izohni ko''radi');

  -- ===================================================================
  v_n := 2; v_name := 'texnadzor: ko''rsatma (predpisaniya) -> pudratchi javobi -> yopish';
  select coalesce(max(id), 0) into v_ob from public.t2_outbox;
  r := pg_temp.tz_try(2, 'texnadzor ko''rsatma yozdi', format('public.t2_tomon_murojaat_yarat_v1($A, %s, %s, ''predpisaniya'', ''TZ ko''''rsatma'', ''armatura qoplami'', ''yuqori'', current_date + 5, %s, ''2-qavat'', gen_random_uuid())', T, a_pt, o1), t_user, t_boss);
  perform pg_temp.tz_ok(r, 'murojaat predpisaniya'); m1 := (r->>'id')::bigint;
  perform pg_temp.tz_ob(2, 'predpisaniya -> pudratchi', v_ob, P);
  perform pg_temp.tz_assert(pg_temp.tz_has(public.t2_tomon_murojaat_royxat_v1(p_prorab, P, 'menga', null, null, 50), m1), 'pudratchi (prorab) ko''rsatmani "menga" ro''yxatida ko''rishi kerak');
  r := pg_temp.tz_try(2, 'pudratchi javob berdi', format('public.t2_tomon_murojaat_javob_v1($A, %s, %s, ''Qoplama tuzatildi, foto ilova'', array[%s]::bigint[])', P, m1, v_doc_p), p_prorab, p_boss);
  perform pg_temp.tz_assert(r->>'holat' = 'bajarildi', 'javob: ' || r::text);
  r := pg_temp.tz_try(2, 'texnadzor yopdi', format('public.t2_tomon_murojaat_qaror_v1($A, %s, %s, ''yopish'', ''Qabul'')', T, m1), t_user, t_boss);
  perform pg_temp.tz_assert(r->>'holat' = 'yopildi', 'yopish: ' || r::text);
  perform pg_temp.tz_assert((select holat from public.t2_tomon_murojaat where id = m1) = 'yopildi'
                            and pg_temp.tz_row(public.t2_tomon_murojaat_royxat_v1(t_boss, T, 'mendan', null, null, 50), m1)->>'holat' = 'yopildi'
                            and pg_temp.tz_row(public.t2_tomon_murojaat_royxat_v1(p_boss, P, 'menga', null, null, 50), m1)->>'holat' = 'yopildi', 'ikkala tomon yopilgan holatni ko''radi');
  -- AOSR inspection act: contractor sends (aosr resource) -> supervisor decides (aosr[qaror]) -> act becomes approved
  insert into public.t2_aosr(kompaniya_id, obyekt_id, raqam, ish_nomi, holat, tur, blank_varianti, komissiya, sana)
  values (P, o1, 'TZ-AOSR-' || v_tag, 'TZ armatura montaji', 'yangi', 'aosr', 'subpudratchisiz', '[]'::jsonb, current_date) returning id into v_aosr;
  r := pg_temp.tz_try(2, 'pudratchi AOSR yubordi', format('public.t2_tomon_taqdim_yarat_v1($A, %s, %s, ''aosr'', %s, ''TZ AOSR'', gen_random_uuid())', P, a_pt, v_aosr), p_pto, p_boss);
  perform pg_temp.tz_ok(r, 'taqdim aosr'); v_tqa := (r->>'id')::bigint;
  perform pg_temp.tz_assert(pg_temp.tz_has(public.t2_tomon_taqdimlar_v1(t_user, T, 'kelgan', null, null, 50), v_tqa), 'texnadzor AOSR taqdimini kelgan ro''yxatda ko''rishi kerak');
  r := pg_temp.tz_try(2, 'texnadzor AOSR qarori', format('public.t2_tomon_qaror_v1($A, %s, %s, ''qabul'', ''TZ AOSR ok'')', T, v_tqa), t_user, t_boss);
  perform pg_temp.tz_assert(r->>'holat' = 'qabul', 'AOSR qarori: ' || r::text);
  if (select holat from public.t2_aosr where id = v_aosr) is distinct from 'tasdiqlangan' then
    perform pg_temp.tz_uz(2, 'texnadzor AOSR taqdimini qabul qildi, lekin t2_aosr.holat = ' || coalesce((select holat from public.t2_aosr where id = v_aosr), '?') || ' (tasdiqlangan emas; tasdiq_taqdim_id=' || coalesce((select tasdiq_taqdim_id::text from public.t2_aosr where id = v_aosr), 'NULL') || ')');
  end if;
  -- ===================================================================
  v_n := 3; v_name := 'loyihachi: chizma/o''zgartirish yuboradi -> pudratchida ko''rinadi';
  select coalesce(max(id), 0) into v_ob from public.t2_outbox;
  r := pg_temp.tz_try(3, 'loyihachi to''plam yaratdi', format('public.t2_chizma_toplam_saqla_v1($A, %s, %s, %s, ''RD'', ''AR-TZ'', ''1'', ''TZ reja'', gen_random_uuid())', L, a_pl, o1), l_user, l_boss);
  perform pg_temp.tz_ok(r, 'chizma_toplam'); v_top := (r->>'id')::bigint;
  r := pg_temp.tz_try(3, 'loyihachi revizya yaratdi', format('public.t2_chizma_revizya_yarat_v1($A, %s, %s, %s, ''TZ o''''zgarish'', ''TZ ta''''sir'', gen_random_uuid())', L, v_top, v_doc_l), l_user, l_boss);
  perform pg_temp.tz_ok(r, 'chizma_revizya'); v_rev := coalesce((r->>'id')::bigint, (r->>'revizya_id')::bigint);
  r := pg_temp.tz_try(3, 'loyihachi chiqardi', format('public.t2_chizma_chiqar_v1($A, %s, %s, array[%s]::bigint[], ''TZ chiqdi'')', L, v_rev, a_pl), l_user, l_boss);
  perform pg_temp.tz_ok(r, 'chizma_chiqar');
  select id into v_tqc from public.t2_tomon_taqdim where aloqa_id = a_pl and resurs = 'chizma' order by id desc limit 1;
  perform pg_temp.tz_assert(v_tqc is not null, 'chizma taqdimi yaratilmadi');
  perform pg_temp.tz_ob(3, 'chizma -> pudratchi', v_ob, P);
  r := public.t2_tomon_taqdimlar_v1(p_pto, P, 'kelgan', null, null, 50);
  perform pg_temp.tz_assert(pg_temp.tz_has(r, v_tqc), 'pudratchi (PTO) chizmani kelgan taqdimlarda ko''rishi kerak: ' || left(r::text, 300));
  r := pg_temp.tz_try(3, 'pudratchi chizmaga qaror berdi', format('public.t2_chizma_qaror_v1($A, %s, %s, ''qabul'', ''TZ ko''''rildi'')', P, v_tqc), p_pto, p_boss);
  perform pg_temp.tz_ok(r, 'chizma_qaror');

  -- ===================================================================
  v_n := 4; v_name := 'laboratoriya: sinov natijasi -> pudratchi va texnadzorda ko''rinishi';
  select coalesce(max(id), 0) into v_ob from public.t2_outbox;
  r := pg_temp.tz_try(4, 'pudratchi sinov so''radi', format('public.t2_lab_sorov_yarat_v1($A, %s, %s, ''beton_kub'', %s, null, null, ''Fundament'', ''A-B'', 3, null, null, true, null, gen_random_uuid())', P, a_pb, o1), p_prorab, p_boss);
  perform pg_temp.tz_ok(r, 'lab_sorov_yarat'); lab := coalesce((r->>'id')::bigint, (r->>'murojaat_id')::bigint);
  perform pg_temp.tz_ob(4, 'sinov so''rovi -> laboratoriya', v_ob, B);
  perform pg_temp.tz_assert(pg_temp.tz_has(public.t2_lab_sorov_royxat_v1(b_boss, B, 'kelgan', null, null, null, 50), lab), 'laboratoriya kelgan so''rovni ko''rishi kerak');
  r := public.t2_lab_sorov_natija_v1(b_boss, B, lab, 1, jsonb_build_object('natija', 'mos', 'protokol_raqam', 'TZ-P1', 'maydon', jsonb_build_object('marka_sinf', 'B25', 'yosh_kun', 28, 'olchangan_mpa', 30, 'talab_mpa', 25)), array[v_doc_b]);
  perform pg_temp.tz_ok(r, 'lab_sorov_natija');
  perform pg_temp.tz_ob(4, 'natija -> pudratchi', v_ob, P);
  r := public.t2_lab_sorov_tafsilot_v1(p_boss, P, lab);
  perform pg_temp.tz_assert((r->>'ok')::boolean and position('TZ-P1' in r::text) > 0, 'pudratchi lab natijasini ko''rishi kerak: ' || left(r::text, 300));
  perform pg_temp.tz_ob(4, 'natija -> texnadzor (granti bor uchinchi tomon)', v_ob, T);
  -- third parties with an ACTIVE lab_natija grant read (list + detail); nobody else; nobody writes
  perform pg_temp.tz_assert(pg_temp.tz_has(public.t2_lab_natija_royxat_v1(t_user, T, o1, 50), lab), 'texnadzor (granti bor) laboratoriya natijasini royxatda korishi kerak');
  perform pg_temp.tz_assert((public.t2_lab_natija_tafsilot_v1(z_user, Z, lab)->>'ok')::boolean and position('TZ-P1' in public.t2_lab_natija_tafsilot_v1(z_user, Z, lab)::text) > 0, 'buyurtmachi (granti bor) natija tafsilotini korishi kerak');
  perform pg_temp.tz_assert(position('summa' in public.t2_lab_natija_tafsilot_v1(t_user, T, lab)::text) = 0, 'uchinchi tomonga hisob/summa berilmasligi kerak');
  -- the protocol FILE follows the same grant (t2_tomon_hujjat_ol_v1)
  perform pg_temp.tz_assert((public.t2_tomon_hujjat_ol_v1(t_user, v_doc_b)->>'ok')::boolean and (public.t2_tomon_hujjat_ol_v1(z_user, v_doc_b)->>'ok')::boolean, 'granti bor texnadzor va buyurtmachi lab protokol faylini ola olishi kerak: ' || public.t2_tomon_hujjat_ol_v1(t_user, v_doc_b)::text);
  perform pg_temp.tz_assert(public.t2_tomon_hujjat_ol_v1(l_boss, v_doc_b)->>'code' = 'DOCUMENT_FORBIDDEN' and public.t2_tomon_hujjat_ol_v1(x_boss, v_doc_b)->>'code' = 'DOCUMENT_FORBIDDEN', 'grantsiz loyihachi va begona protokol faylini ololmasligi kerak');
  perform pg_temp.tz_assert(pg_temp.tz_hidden(format('public.t2_lab_natija_tafsilot_v1(%s, %s, %s)', l_boss, L, lab)), 'grantsiz loyihachi natijani ko''rmasligi kerak');
  perform pg_temp.tz_assert(pg_temp.tz_hidden(format('public.t2_lab_natija_tafsilot_v1(%s, %s, %s)', x_boss, X, lab)), 'begona kompaniya natijani ko''rmasligi kerak');
  perform pg_temp.tz_assert(pg_temp.tz_hidden(format('public.t2_lab_sorov_natija_v1(%s, %s, %s, 2, ''{}''::jsonb, array[%s]::bigint[])', t_user, T, lab, v_doc_b)), 'texnadzor natijani yoza olmasligi kerak');
  perform pg_temp.tz_assert(pg_temp.tz_hidden(format('public.t2_lab_sorov_natija_v1(%s, %s, %s, 2, ''{}''::jsonb, array[%s]::bigint[])', z_user, Z, lab, v_doc_b)), 'buyurtmachi natijani yoza olmasligi kerak');
  for v_gid in select id from public.t2_tomon_grant where aloqa_id = a_pt and resurs = 'lab_natija' and holat = 'faol' loop
    perform pg_temp.tz_ok(public.t2_tomon_grant_bekor_v1(p_boss, P, v_gid), 'grant_bekor lab_natija');
  end loop;
  perform pg_temp.tz_assert(not pg_temp.tz_has(public.t2_lab_natija_royxat_v1(t_user, T, o1, 50), lab), 'grant bekor qilingach texnadzor natijani kormasligi kerak');
  perform pg_temp.tz_assert(public.t2_tomon_hujjat_ol_v1(t_user, v_doc_b)->>'code' = 'DOCUMENT_FORBIDDEN', 'grant bekor qilingach protokol fayli yopilishi kerak');
  -- ===================================================================
  v_n := 5; v_name := 'yetkazuvchi: tender taklif -> g''olib -> buyurtma; bozor (ochiq) e''loni';
  select coalesce(max(id), 0) into v_ob from public.t2_outbox;
  r := pg_temp.tz_try(5, 'pudratchi tender e''lon qildi', format('public.t2_tender_elon_v1($A, %s, gen_random_uuid(), ''material'', ''taklif'', array[%s]::bigint[], %s, now() + interval ''3 days'', %L::jsonb, %L::jsonb)',
    P, Y, o1, '[{"nom":"Sement TZ","birlik":"tonna","miqdor":10}]', '{"sarlavha":"TZ tender","yetkazish_manzil":"Navoiy"}'), p_pto, p_boss);
  perform pg_temp.tz_ok(r, 'tender_elon'); rfq := (r->>'id')::bigint;
  perform pg_temp.tz_ob(5, 'tender -> yetkazuvchi', v_ob, Y);
  select id into q1 from public.t2_birja_rfq_qator where rfq_id = rfq and qator_no = 1;
  perform pg_temp.tz_assert(pg_temp.tz_has(public.t2_tenderlar_v1(y_user, Y, 'menga', null, 50, null), rfq), 'yetkazuvchi chaqirilgan tenderni ko''rishi kerak');
  r := pg_temp.tz_try(5, 'yetkazuvchi narx taklif qildi', format('public.t2_tender_taklif_ber_v1($A, %s, gen_random_uuid(), %s, jsonb_build_array(jsonb_build_object(''rfq_qator_id'', %s, ''narx'', 1300000, ''muddat_kun'', 3)), ''TZ taklif'', null)', Y, rfq, q1), y_user, y_boss);
  perform pg_temp.tz_ok(r, 'tender_taklif_ber'); tk := (r->>'id')::bigint;
  select versiya into ver from public.t2_birja_rfq where id = rfq;
  r := public.t2_tender_golib_v1(p_boss, P, gen_random_uuid(), rfq, ver, tk, array[q1]);
  perform pg_temp.tz_ok(r, 'tender_golib');
  select id, versiya into byu, byu_v from public.t2_buyurtma where rfq_id = rfq order by id limit 1;
  perform pg_temp.tz_assert(byu is not null, 'g''olib tanlangach buyurtma yaratilishi kerak');
  r := pg_temp.tz_try(5, 'yetkazuvchi buyurtmani qabul qildi', format('public.t2_buyurtma_otish_v1($A, %s, gen_random_uuid(), %s, %s, ''qabul_qilindi'', null, null, null)', Y, byu, byu_v), y_user, y_boss);
  perform pg_temp.tz_ok(r, 'buyurtma_otish');
  perform pg_temp.tz_assert((public.t2_buyurtma_tafsilot_v1(p_boss, P, byu)->>'ok')::boolean and (public.t2_buyurtma_tafsilot_v1(y_boss, Y, byu)->>'ok')::boolean, 'buyurtmani ikkala tomon ko''radi');
  -- open market. (a) t2_tender_elon_v1 with doira 'ochiq' creates a v1 lot (protsess_v2 = false): is it in the public open list?
  r := public.t2_tender_elon_v1(p_boss, P, gen_random_uuid(), 'material', 'ochiq', null, o1, now() + interval '3 days', '[{"nom":"Qum TZ","birlik":"m3","miqdor":5}]'::jsonb, '{"sarlavha":"TZ ochiq lot v1"}'::jsonb);
  perform pg_temp.tz_assert(r->>'code' = 'OCHIQ_V2_KERAK', 'v1 ochiq doira yagona v2 yoliga yonaltirilishi (rad) kerak: ' || r::text);  -- (b) the v2 path: lot from smeta rows -> draft -> tasdiqlashda -> elon -> public list
  insert into public.t2_qator(obyekt_id, kompaniya_id, tur, kod, nom, birlik, hajm, narx, summa, tartib) values (o1, P, 'bl', 'TZ-B3-' || v_tag, 'TZ ochiq lot ish', 'm2', 20, 1000, 20000, 903);
  r := pg_temp.tz_try(5, 'pudratchi ochiq lot (smetadan)', format('public.t2_tn_lot_smetadan_v1(%s, $A, gen_random_uuid(), %L::jsonb)', P,
    jsonb_build_object('obyekt_id', o1, 'tur', 'subpudrat', 'doira', 'ochiq', 'nom', 'TZ ochiq lot v2', 'muddat', (now() + interval '3 days')::text)::text), p_pto, p_boss);
  perform pg_temp.tz_ok(r, 'tn_lot_smetadan'); rfq2 := (r->>'id')::bigint;
  r := public.t2_tender_otish_v1(p_boss, P, gen_random_uuid(), rfq2, (select versiya from public.t2_birja_rfq where id = rfq2), 'tasdiqlashda', null);
  perform pg_temp.tz_ok(r, 'tender_otish tasdiqlashda');
  r := public.t2_tender_otish_v1(p_boss, P, gen_random_uuid(), rfq2, (select versiya from public.t2_birja_rfq where id = rfq2), 'elon', null);
  perform pg_temp.tz_ok(r, 'tender_otish elon');
  perform pg_temp.tz_assert(exists (select 1 from jsonb_array_elements(public.t2_tn_ochiq_royxat_v1('{}'::jsonb)->'lotlar') e where (e->>'id')::bigint = rfq2),
    'v2 ochiq lot kirmasdan oqish royxatida korinishi kerak (holat elon, protsess_v2)');
  perform pg_temp.tz_assert(position('"narx"' in public.t2_tn_ochiq_royxat_v1('{}'::jsonb)::text) = 0, 'ochiq royxatda narx korinmasligi kerak');
  -- ===================================================================
  v_n := 6; v_name := 'subpudratchi: topshirish -> akt -> qabul; usta naryad: bajardim -> prorab qabul';
  select coalesce(max(id), 0) into v_ob from public.t2_outbox;
  insert into public.t2_qator(obyekt_id, kompaniya_id, tur, kod, nom, birlik, hajm, narx, summa, tartib) values (o1, P, 'bl', 'TZ-B1-' || v_tag, 'TZ sub ish', 'm2', 50, 1000, 50000, 901) returning id into b_sub;
  insert into public.t2_qator(obyekt_id, kompaniya_id, tur, kod, nom, birlik, hajm, narx, summa, tartib) values (o1, P, 'bl', 'TZ-B2-' || v_tag, 'TZ naryad ish', 'm2', 40, 1000, 40000, 902) returning id into b_nar;
  r := pg_temp.tz_try(6, 'pudratchi ish topshirdi', format('public.t2_sub_topshir_v1($A, %s, %s, %s, jsonb_build_array(jsonb_build_object(''qator_id'', %s, ''hajm'', 50, ''narx'', 800)))', P, a_ps, o1, b_sub), p_pto, p_boss);
  perform pg_temp.tz_ok(r, 'sub_topshir');
  perform pg_temp.tz_ob(6, 'topshiriq -> subpudratchi', v_ob, S);
  select id into t_sub from public.t2_sub_topshiriq where qator_id = b_sub and holat = 'faol';
  perform pg_temp.tz_assert(t_sub is not null, 'subpudratchi topshirig''i yaratilmadi');
  perform pg_temp.tz_assert(jsonb_array_length(pg_temp.tz_arr(public.t2_sub_ishlarim_v1(s_boss, S))) >= 1 or position(t_sub::text in public.t2_sub_ishlarim_v1(s_boss, S)::text) > 0, 'subpudratchi o''z ishlarini ko''rishi kerak');
  r := public.t2_sub_akt_yoz_v1(s_boss, S, a_ps, o1, v_oy, jsonb_build_array(jsonb_build_object('topshiriq_id', t_sub, 'hajm', 30)), null, 'TZ-A1', null, gen_random_uuid());
  perform pg_temp.tz_ok(r, 'sub_akt_yoz'); sakt := (r->>'id')::bigint;
  r := public.t2_sub_akt_yubor_v1(s_boss, S, sakt, 'TZ bajarildi', gen_random_uuid()); perform pg_temp.tz_ok(r, 'sub_akt_yubor');
  stq := coalesce((r->>'taqdim_id')::bigint, (r->>'id')::bigint);
  perform pg_temp.tz_ob(6, 'sub akt -> pudratchi', v_ob, P);
  r := pg_temp.tz_try(6, 'pudratchi sub aktni qabul qildi', format('public.t2_sub_akt_qaror_v1($A, %s, %s, ''qabul'', null)', P, stq), p_pto, p_boss);
  perform pg_temp.tz_ok(r, 'sub_akt_qaror');
  -- accepted sub act must create the main-contractor fakt document and the cost row (chain link sub akt -> fakt -> xarajat)
  perform pg_temp.tz_assert(r->>'fakt_akt_id' is not null and r->>'xarajat_id' is not null, 'sub akt qabulidan keyin fakt va xarajat yozuvi yaratilishi kerak: ' || r::text);
  perform pg_temp.tz_assert((public.t2_sub_akt_tafsilot_v1(p_boss, P, sakt)->>'ok')::boolean and (public.t2_sub_akt_tafsilot_v1(s_boss, S, sakt)->>'ok')::boolean, 'sub akt tafsilotini ikkala tomon ko''radi');
  -- usta naryad
  r := pg_temp.tz_try(6, 'PTO naryad yaratdi', format('public.t2_naryad_yoz_v1(%s, $A, gen_random_uuid(), ''yarat'', null, null, %L::jsonb)', P,
    jsonb_build_object('obyekt_id', o1, 'usta_nom', 'TZ usta', 'usta_foydalanuvchi_id', p_usta, 'qatorlar', jsonb_build_array(
      jsonb_build_object('qator_id', b_nar, 'hajm', 10, 'kat', U&'\0427\0415\041B', 'usta_birlik', 'm2', 'koef', 1, 'usta_narx_birlik', 500, 'fakt_boshida', 0, 'smeta_mehnat_birlik', 1000))))::text, p_pto, p_boss);
  perform pg_temp.tz_ok(r, 'naryad yarat'); nid := (r->>'id')::bigint; nver := (r->>'versiya')::int;
  select id into l1 from public.t2_naryad_qator where naryad_id = nid and tartib = 1;
  r := public.t2_naryad_usta_bajarildi_v1(P, p_usta, gen_random_uuid(), nid, nver, jsonb_build_array(jsonb_build_object('id', l1, 'bajarilgan_hajm', 10)), true, 'TZ bajardim');
  perform pg_temp.tz_assert((r->>'ok')::boolean, 'usta "bajardim" o''tmadi (usta roli self.work.write): ' || left(r::text, 300));
  nver := (r->>'versiya')::int;
  perform pg_temp.tz_assert((select holat from public.t2_naryad where id = nid) = 'bajarildi', 'naryad holati bajarildi bo''lishi kerak');
  r := pg_temp.tz_try(6, 'prorab naryadni qabul qildi', format('public.t2_naryad_yoz_v1(%s, $A, gen_random_uuid(), ''qabul'', %s, %s, %L::jsonb)', P, nid, nver,
    jsonb_build_object('qatorlar', jsonb_build_array(jsonb_build_object('id', l1, 'qabul_hajm', 10, 'fakt_hozir', 0)))::text), p_prorab, p_boss);
  perform pg_temp.tz_ok(r, 'naryad qabul');

  -- ===================================================================
  v_n := 7; v_name := 'logistika: yuk -> tashuvchi taklif -> qabul -> yuklash -> yetkazish dalili -> tasdiq';
  select coalesce(max(id), 0) into v_ob from public.t2_outbox;
  r := public.t2_yb_yuk_saqla_v1(P, p_boss, gen_random_uuid(), jsonb_build_object('nom', 'TZ sement', 'a_nom', 'Toshkent', 'b_nom', 'Navoiy', 'b_obyekt_id', o1, 'masofa_km', 420, 'tonna', 10,
    'sana_dan', current_date + 1, 'sana_gacha', current_date + 3, 'tolov_shakli', 'naqd', 'escrow', false));
  perform pg_temp.tz_ok(r, 'yb_yuk_saqla'); y_yuk := (r->>'id')::bigint; y_ver := (r->>'versiya')::int;
  -- link to the supplier order BEFORE publishing (only a draft yuk accepts buyurtma_id; state machine: qoralama -> elon -> bron -> yolda -> yetkazildi -> yopildi)
  r := public.t2_yb_p1_yuk_qosh_v1(P, p_boss, gen_random_uuid(), jsonb_build_object('yuk_id', y_yuk, 'buyurtma_id', byu));
  perform pg_temp.tz_ok(r, 'yb_p1_yuk_qosh (buyurtma -> yuk)');
  perform pg_temp.tz_assert((select buyurtma_id from public.t2_yb_yuk where id = y_yuk) = byu, 'yuk buyurtmaga bog''lanishi kerak');
  r := public.t2_yb_yuk_elon_v1(P, p_boss, gen_random_uuid(), jsonb_build_object('id', y_yuk, 'versiya', y_ver)); perform pg_temp.tz_ok(r, 'yb_yuk_elon');
  r := public.t2_yb_tashuvchi_saqla_v1(c_user, gen_random_uuid(), '{"ism":"TZ haydovchi","telefon":"+998900000099","davlat_raqami":"01Z999ZZ","turi":"tent","yuk_t":25}'::jsonb);
  perform pg_temp.tz_ok(r, 'yb_tashuvchi_saqla');
  r := public.t2_yb_taklif_ber_v1(c_user, gen_random_uuid(), jsonb_build_object('yuk_id', y_yuk, 'narx_qqs_siz', 900000));
  perform pg_temp.tz_ok(r, 'yb_taklif_ber'); y_tk := coalesce((r->>'id')::bigint, (r->>'taklif_id')::bigint);
  r := public.t2_yb_yuk_javob_v1(P, p_boss, gen_random_uuid(), jsonb_build_object('yuk_id', y_yuk, 'taklif_id', y_tk, 'harakat', 'qabul'));
  perform pg_temp.tz_ok(r, 'yb_yuk_javob qabul');
  select id into y_bron from public.t2_yb_bron where yuk_id = y_yuk order by id desc limit 1;
  perform pg_temp.tz_assert(y_bron is not null, 'taklif qabul qilingach bron yaratilishi kerak');
  r := public.t2_yb_dalil_qosh_v1(c_user, gen_random_uuid(), jsonb_build_object('bron_id', y_bron, 'tur', 'yuklash', 'r2_kalit', 'tz/' || v_tag || '/yuklash.jpg', 'sha256', repeat('a', 64)));
  perform pg_temp.tz_ok(r, 'yb_dalil_qosh yuklash');
  r := public.t2_yb_yuritish_v1(c_user, gen_random_uuid(), jsonb_build_object('bron_id', y_bron, 'harakat', 'yukladim')); perform pg_temp.tz_ok(r, 'yb_yuritish yukladim');
  r := public.t2_yb_dalil_qosh_v1(c_user, gen_random_uuid(), jsonb_build_object('bron_id', y_bron, 'tur', 'yetkazish', 'r2_kalit', 'tz/' || v_tag || '/yetkazish.jpg', 'sha256', repeat('b', 64)));
  perform pg_temp.tz_ok(r, 'yb_dalil_qosh yetkazish');
  perform pg_temp.tz_assert(exists (select 1 from public.t2_yb_dalil where bron_id = y_bron and tur = 'yetkazish'), 'yetkazish dalili saqlanishi kerak');
  r := public.t2_yb_yuritish_v1(c_user, gen_random_uuid(), jsonb_build_object('bron_id', y_bron, 'harakat', 'yetkazdim')); perform pg_temp.tz_ok(r, 'yb_yuritish yetkazdim');
  r := public.t2_yb_yuk_tasdiq_v1(P, p_boss, gen_random_uuid(), jsonb_build_object('yuk_id', y_yuk)); perform pg_temp.tz_ok(r, 'yb_yuk_tasdiq');
  if not exists (select 1 from public.t2_outbox o where o.id > v_ob and (o.foydalanuvchi_idlar @> array[c_user] or o.kompaniya_id = C or C = any(o.qabul_kompaniya_idlar))) then
    perform pg_temp.tz_uz(7, 'logistika: tashuvchi (c_user) uchun outbox/bildirishnoma yozuvi yoq - taklif qabul qilingani tashuvchiga xabar qilinmaydi');
  end if;
  -- ===================================================================
  v_n := 8; v_name := 'murojaat/xabar ikki tomonlama; bildirishnoma/outbox to''g''ri qabul qiluvchiga';
  select coalesce(max(id), 0) into v_ob from public.t2_outbox;
  r := pg_temp.tz_try(8, 'buyurtmachi remark yozdi', format('public.t2_tomon_murojaat_yarat_v1($A, %s, %s, ''remark'', ''TZ remark'', ''beton sifati'', ''yuqori'', current_date + 3, %s, null, gen_random_uuid())', Z, a_pz, o1), z_user, z_boss);
  perform pg_temp.tz_ok(r, 'murojaat Z->P'); m2 := (r->>'id')::bigint;
  perform pg_temp.tz_ob(8, 'murojaat Z->P', v_ob, P);
  r := pg_temp.tz_try(8, 'pudratchi hujjat so''radi', format('public.t2_tomon_murojaat_yarat_v1($A, %s, %s, ''hujjat_sorovi'', ''TZ hujjat so''''rovi'', ''sertifikat kerak'', ''oddiy'', current_date + 7, null, null, gen_random_uuid())', P, a_pz), p_pto, p_boss);
  perform pg_temp.tz_ok(r, 'murojaat P->Z'); m3 := (r->>'id')::bigint;
  perform pg_temp.tz_assert(pg_temp.tz_has(public.t2_tomon_murojaat_royxat_v1(p_pto, P, 'menga', null, null, 50), m2) and pg_temp.tz_has(public.t2_tomon_murojaat_royxat_v1(z_user, Z, 'menga', null, null, 50), m3),
    'murojaat ikki tomonlama: har tomon o''ziga qaratilganini "menga" da ko''radi');
  r := pg_temp.tz_try(8, 'buyurtmachi javob berdi', format('public.t2_tomon_murojaat_javob_v1($A, %s, %s, ''Sertifikat ilova qilindi'', null)', Z, m3), z_user, z_boss);
  perform pg_temp.tz_ok(r, 'murojaat javob Z');
  r := pg_temp.tz_try(8, 'izoh (xabar)', format('public.t2_tomon_izoh_v1($A, %s, null, %s, ''TZ xabar: rahmat'')', Z, tq_a2), z_user, z_boss);
  perform pg_temp.tz_ok(r, 'tomon_izoh');
  perform pg_temp.tz_assert(position('TZ xabar: rahmat' in public.t2_tomon_taqdim_tafsilot_v1(p_boss, P, tq_a2)::text) > 0, 'xabar ikkinchi tomonda ko''rinishi kerak');
  -- outbox addressing for the F2 flow of step 1 (the only flow that must always notify)
  perform pg_temp.tz_assert(exists (select 1 from public.t2_outbox o where o.mavzu = 'tomon.taqdim' and Z = any(o.qabul_kompaniya_idlar)), 'tomon.taqdim outbox qabul qiluvchisi buyurtmachi bo''lishi kerak');
  perform pg_temp.tz_assert(exists (select 1 from public.t2_outbox o where o.mavzu = 'tomon.qaror' and P = any(o.qabul_kompaniya_idlar)), 'tomon.qaror outbox qabul qiluvchisi pudratchi bo''lishi kerak');
  perform pg_temp.tz_assert(not exists (select 1 from public.t2_outbox o where o.mavzu in ('tomon.taqdim', 'tomon.qaror') and (X = any(o.qabul_kompaniya_idlar) or Y = any(o.qabul_kompaniya_idlar))), 'begona/yetkazuvchi kompaniyaga taqdim/qaror xabari ketmasligi kerak');
  -- The cron job 't2-outbox-bildirishnoma' (*/2) calls t2_outbox_ishlov_v1('bildirishnoma', 500); cron does not run inside a transaction -> call it directly.
  -- It skips outbox rows younger than 60 s (all rows share the transaction start time), so backdate this test's own rows first.
  begin
    update public.t2_outbox set yaratildi = now() - interval '10 minutes' where id > v_ob0;
  exception when others then perform pg_temp.tz_uz(8, 'outbox yozuvlarini eskirtirib bolmadi (dispetcher sinovi): ' || left(sqlerrm, 120));
  end;
  r := public.t2_outbox_ishlov_v1('bildirishnoma', 2000);
  perform pg_temp.tz_ok(r, 't2_outbox_ishlov_v1');
  perform pg_temp.tz_assert(exists (select 1 from public.t2_bildirishnoma n where n.kompaniya_id = Z and n.foydalanuvchi_id = z_boss and n.outbox_id in (select id from public.t2_outbox where id > v_ob0 and mavzu = 'tomon.taqdim')),
    'taqdim haqida buyurtmachi boss ga bildirishnoma yozilishi kerak (dispetcher ishlagandan keyin)');
  perform pg_temp.tz_assert(not exists (select 1 from public.t2_bildirishnoma n where n.outbox_id > v_ob0 and n.kompaniya_id in (X)), 'begona kompaniyaga bildirishnoma ketmasligi kerak');
  for v_gid, v_list in select x.k, x.nom from (values (T, 'texnadzor'), (B, 'laboratoriya'), (Y, 'yetkazuvchi'), (S, 'subpudratchi'), (L, 'loyihachi'), (P, 'pudratchi'), (Z, 'buyurtmachi')) x(k, nom) loop
    if not exists (select 1 from public.t2_bildirishnoma n where n.outbox_id > v_ob0 and n.kompaniya_id = v_gid) then
      perform pg_temp.tz_uz(8, v_list || ' tomoni (kompaniya boss/pto) butun zanjirda birorta bildirishnoma olmadi');
    end if;
  end loop;
  raise notice 'TOMON OBSERVED [8]: bildirishnomalar (mavzu: soni) = %', (select jsonb_object_agg(mavzu, n) from (select mavzu, count(*) n from public.t2_bildirishnoma where outbox_id > v_ob0 group by 1) z);
  -- role-based recipients: capability (not a fixed role list) decides who is notified
  perform pg_temp.tz_assert(exists (select 1 from public.t2_bildirishnoma n where n.foydalanuvchi_id = z_user and n.outbox_id in (select id from public.t2_outbox where id > v_ob0 and mavzu = 'tomon.taqdim')),
    'buyurtmachi roli (z_user) taqdim haqida bildirishnoma olishi kerak');
  perform pg_temp.tz_assert(exists (select 1 from public.t2_bildirishnoma n where n.foydalanuvchi_id = t_user and n.outbox_id in (select id from public.t2_outbox where id > v_ob0 and mavzu = 'lab.natija')),
    'inspektor roli (t_user) lab natijasi haqida bildirishnoma olishi kerak');
  perform pg_temp.tz_assert(exists (select 1 from public.t2_bildirishnoma n where n.foydalanuvchi_id = y_user and n.outbox_id in (select id from public.t2_outbox where id > v_ob0 and mavzu = 'tender.elon')),
    'taminotchi roli (y_user) tender e''loni haqida bildirishnoma olishi kerak');
  perform pg_temp.tz_assert(not exists (select 1 from public.t2_bildirishnoma n where n.outbox_id > v_ob0 group by n.foydalanuvchi_id, n.outbox_id having count(*) > 1), 'bir hodisa bir odamga bir martadan ortiq yozilmasligi kerak');
  perform pg_temp.tz_assert(not exists (select 1 from public.t2_bildirishnoma n where n.outbox_id > v_ob0 and n.foydalanuvchi_id = x_boss), 'begona kompaniya foydalanuvchisiga bildirishnoma ketmasligi kerak');
  -- ===================================================================
  v_n := 9; v_name := 'IZOLYATSIYA: faqat grant berilgan ko''rinadi; begona/rolga zid rad; grant bekori ko''rinishni yo''q qiladi';
  -- 9a. granted object only
  perform pg_temp.tz_assert(jsonb_array_length(public.t2_zakazchik_obyektlar_v1(z_boss, Z)) = 1 and (public.t2_zakazchik_obyektlar_v1(z_boss, Z)->0->>'obyekt_id')::bigint = o1, 'buyurtmachi faqat grant berilgan o1 ni ko''radi (o2 yopiq)');
  perform pg_temp.tz_assert(public.t2_tomon_ruxsat_bor(Z, P, 'obyekt_holat', 'korish', o1) and not public.t2_tomon_ruxsat_bor(Z, P, 'obyekt_holat', 'korish', o2), 'buyurtmachi: o1 ha, o2 yo''q');
  perform pg_temp.tz_assert(public.t2_tomon_ruxsat_bor(T, P, 'aosr', 'qaror', o1) and not public.t2_tomon_ruxsat_bor(T, P, 'f2', 'korish', o1), 'texnadzor: aosr qaror ha, F2 ko''rish yo''q');
  perform pg_temp.tz_assert(not public.t2_tomon_ruxsat_bor(Y, P, 'obyekt_holat', 'korish', o1) and not public.t2_tomon_ruxsat_bor(Y, P, 'f2', 'korish', o1), 'grantsiz yetkazuvchi hech narsa ko''rmaydi');
  perform pg_temp.tz_assert(not public.t2_tomon_ruxsat_bor(X, P, 'obyekt_holat', 'korish', o1) and not public.t2_tomon_ruxsat_bor(L, P, 'f2', 'korish', o1), 'begona kompaniya va loyihachi F2 ni ko''rmaydi');
  -- 9b. stranger (X) cannot read other parties' documents
  perform pg_temp.tz_assert(pg_temp.tz_hidden(format('public.t2_tomon_taqdim_tafsilot_v1(%s, %s, %s)', x_boss, X, tq_a2)), 'begona taqdimni ko''rmasligi kerak');
  perform pg_temp.tz_assert(pg_temp.tz_hidden(format('public.t2_tomon_murojaat_tafsilot_v1(%s, %s, %s)', x_boss, X, m1)), 'begona murojaatni ko''rmasligi kerak');
  perform pg_temp.tz_assert(pg_temp.tz_hidden(format('public.t2_lab_sorov_tafsilot_v1(%s, %s, %s)', x_boss, X, lab)), 'begona lab so''rovini ko''rmasligi kerak');
  perform pg_temp.tz_assert(pg_temp.tz_hidden(format('public.t2_sub_akt_tafsilot_v1(%s, %s, %s)', x_boss, X, sakt)), 'begona sub aktni ko''rmasligi kerak');
  perform pg_temp.tz_assert(pg_temp.tz_hidden(format('public.t2_tender_tafsilot_v1(%s, %s, %s)', x_boss, X, rfq)), 'chaqirilmagan begona yopiq tenderni ko''rmasligi kerak');
  perform pg_temp.tz_assert(pg_temp.tz_hidden(format('public.t2_buyurtma_tafsilot_v1(%s, %s, %s)', x_boss, X, byu)), 'begona buyurtmani ko''rmasligi kerak');
  perform pg_temp.tz_assert(pg_temp.tz_hidden(format('public.t2_tomon_hujjat_ol_v1(%s, %s)', x_boss, v_doc_p)), 'begona pudratchi hujjat faylini ololmasligi kerak');
  perform pg_temp.tz_assert(pg_temp.tz_hidden(format('public.t2_tomon_murojaat_royxat_v1(%s, %s, null, null, null, 50)', x_boss, X)), 'begona murojaat ro''yxati bo''sh');
  -- a party sees only ITS OWN documents: supplier / carrier / designer cannot read the F2 taqdim or customer remark
  perform pg_temp.tz_assert(pg_temp.tz_hidden(format('public.t2_tomon_taqdim_tafsilot_v1(%s, %s, %s)', y_boss, Y, tq_a2)), 'yetkazuvchi F2 taqdimini ko''rmasligi kerak');
  perform pg_temp.tz_assert(pg_temp.tz_hidden(format('public.t2_tomon_murojaat_tafsilot_v1(%s, %s, %s)', l_boss, L, m2)), 'loyihachi buyurtmachi remarkini ko''rmasligi kerak');
  -- 9c. role-contradicting actions
  perform pg_temp.tz_assert(pg_temp.tz_hidden(format('public.t2_akt_lifecycle_transition_v1(%s, %s, ''cancelled'', %s, 1, gen_random_uuid(), ''x'')', P, akt_a, z_user)), 'buyurtmachi pudratchi F2 sini bekor/tasdiqlay olmasligi kerak (a''zo emas)');
  perform pg_temp.tz_assert(pg_temp.tz_hidden(format('public.t2_akt_lifecycle_transition_v1(%s, %s, ''approved'', %s, 1, gen_random_uuid(), null)', Z, akt_a, z_boss)), 'buyurtmachi o''z kompaniyasi nomidan pudratchi F2 sini tasdiqlay olmasligi kerak (AKT_NOT_FOUND)');
  perform pg_temp.tz_assert(pg_temp.tz_hidden(format('public.t2_moliya_tahlil_v1(%s, %s, null)', P, y_user)), 'yetkazuvchi pudratchi moliya/smeta ma''lumotini o''qiy olmasligi kerak');
  perform pg_temp.tz_assert(pg_temp.tz_hidden(format('public.t2_moliya_tahlil_v1(%s, %s, %s)', Y, y_boss, o1)), 'yetkazuvchi o''z kompaniyasi nomidan pudratchi obyektini o''qiy olmasligi kerak');
  perform pg_temp.tz_assert(pg_temp.tz_hidden(format('public.t2_smeta_import_boshla_v1(%s, %s, %s, gen_random_uuid(), null)', P, y_user, o1)), 'yetkazuvchi pudratchi smetasini yoza olmasligi kerak');
  perform pg_temp.tz_assert(pg_temp.tz_hidden(format('public.t2_tomon_qaror_v1(%s, %s, %s, ''qabul'', null)', z_obs, Z, tq_b)), 'kuzatuvchi rol qaror chiqara olmasligi kerak');
  perform pg_temp.tz_assert(pg_temp.tz_hidden(format('public.t2_tomon_qaror_v1(%s, %s, %s, ''qabul'', null)', p_boss, P, tq_b)), 'pudratchi o''z taqdimiga qaror chiqara olmasligi kerak');
  perform pg_temp.tz_assert(pg_temp.tz_hidden(format('public.t2_tomon_grant_saqla_v1(%s, %s, %s, jsonb_build_array(jsonb_build_object(''resurs'', ''obyekt_holat'', ''amallar'', jsonb_build_array(''korish''), ''obyekt_id'', %s)))', z_boss, Z, a_pz, o2)), 'buyurtmachi pudratchi obyektini o''zi ochib ololmaydi');
  -- 9d. revoke -> visibility disappears
  for v_gid in select id from public.t2_tomon_grant where aloqa_id = a_pz and beruvchi_kompaniya_id = P and holat = 'faol' loop
    perform pg_temp.tz_ok(public.t2_tomon_grant_bekor_v1(p_boss, P, v_gid), 'grant_bekor');
  end loop;
  perform pg_temp.tz_assert(jsonb_array_length(public.t2_zakazchik_obyektlar_v1(z_boss, Z)) = 0 and not public.t2_tomon_ruxsat_bor(Z, P, 'obyekt_holat', 'korish', o1), 'grant bekor qilingach buyurtmachi hech narsa ko''rmasligi kerak');
  r := public.t2_tomon_murojaat_yarat_v1(z_boss, Z, a_pz, 'remark', 'TZ yopiq', null, null, null, o1, null, gen_random_uuid());
  perform pg_temp.tz_assert(r->>'code' = 'OBYEKT_YOPIQ', 'grantsiz obyektga murojaat yozib bo''lmaydi: ' || r::text);
  v_i := 0;
  -- aloqa pause hides everything for the customer as well
  perform pg_temp.tz_ok(public.t2_tomon_holat_v1(p_boss, P, a_pt, 'toxtatish', null), 'aloqa toxtatish');
  perform pg_temp.tz_assert(not public.t2_tomon_ruxsat_bor(T, P, 'aosr', 'qaror', o1), 'to''xtatilgan aloqada texnadzor ruxsati yo''q');

  -- ===================================================================
  v_n := 10; v_name := 'NAZORAT = funksiya: (A) buyurtmachi xodimi, (B) buyurtmachi vakili (pudratchi aloqasiz), (C) ichki nazorat, (D) mustaqil; izolyatsiya';
  select coalesce(max(id), 0) into v_ob10 from public.t2_outbox;
  Z2 := pg_temp.tz_komp('Buyurtmachi2', v_tag); T2 := pg_temp.tz_komp('Autsorsing texnadzor', v_tag);
  z2_boss := pg_temp.tz_user('tz_z2b_' || v_tag, Z2, 'boss'); z2_tex := pg_temp.tz_user('tz_z2t_' || v_tag, Z2, 'inspektor');
  t2b_boss := pg_temp.tz_user('tz_t2b_' || v_tag, T2, 'boss'); t2b_user := pg_temp.tz_user('tz_t2u_' || v_tag, T2, 'inspektor');
  p_ichki := pg_temp.tz_user('tz_pi_' || v_tag, P, 'inspektor');
  insert into public.t2_obyekt(nom, kompaniya_id) values ('TZ P-obyekt-3 ' || v_tag, P) returning id into o3;
  insert into public.t2_obyekt(nom, kompaniya_id) values ('TZ P-obyekt-4 ' || v_tag, P) returning id into o4;
  a_pz2 := pg_temp.tz_aloqa(p_boss, P, z2_boss, Z2, 'shartnoma', 'buyurtmachi');                    -- pudratchi <-> buyurtmachi
  a_z2t2 := pg_temp.tz_aloqa2(z2_boss, Z2, t2b_boss, T2, 'nazorat', 'buyurtmachi', 'texnadzor');    -- buyurtmachi <-> texnadzor (pudratchi bu aloqada YO'Q)
  perform pg_temp.tz_assert(not exists (select 1 from public.t2_tomon_aloqa a where (a.taklif_kompaniya_id = P and a.qabul_kompaniya_id = T2) or (a.taklif_kompaniya_id = T2 and a.qabul_kompaniya_id = P)), 'pudratchi va autsorsing texnadzor orasida aloqa bo''lmasligi kerak');
  perform pg_temp.tz_ok(public.t2_tomon_grant_saqla_v1(p_boss, P, a_pz2, jsonb_build_array(
    jsonb_build_object('resurs', 'obyekt_holat', 'amallar', jsonb_build_array('korish'), 'obyekt_id', o3),
    jsonb_build_object('resurs', 'f2', 'amallar', jsonb_build_array('korish', 'tafsilot'), 'obyekt_id', o3),
    jsonb_build_object('resurs', 'lab_natija', 'amallar', jsonb_build_array('korish'), 'obyekt_id', o3))), 'grant Z2');
  insert into public.t2_akt(obyekt_id, kompaniya_id, tur, raqam, oy, hujjat_jami, holat, lifecycle_status) values (o3, P, 'f2', 'TZ-C-' || v_tag, date '2026-09-01', 100, 'tasdiqlangan', 'approved') returning id into akt_c;
  insert into public.t2_akt(obyekt_id, kompaniya_id, tur, raqam, oy, hujjat_jami, holat, lifecycle_status) values (o3, P, 'f2', 'TZ-D-' || v_tag, date '2026-10-01', 100, 'tasdiqlangan', 'approved') returning id into akt_d;
  insert into public.t2_akt(obyekt_id, kompaniya_id, tur, raqam, oy, hujjat_jami, holat, lifecycle_status) values (o3, P, 'f2', 'TZ-E-' || v_tag, date '2026-11-01', 100, 'tasdiqlangan', 'approved') returning id into akt_e;
  insert into public.t2_akt(obyekt_id, kompaniya_id, tur, raqam, oy, hujjat_jami, holat, lifecycle_status) values (o3, P, 'f2', 'TZ-F-' || v_tag, date '2026-12-01', 100, 'tasdiqlangan', 'approved') returning id into akt_f;
  insert into public.t2_akt(obyekt_id, kompaniya_id, tur, raqam, oy, hujjat_jami, holat, lifecycle_status) values (o3, P, 'f2', 'TZ-G-' || v_tag, date '2027-01-01', 100, 'tasdiqlangan', 'approved') returning id into akt_g;
  insert into public.t2_akt(obyekt_id, kompaniya_id, tur, raqam, oy, hujjat_jami, holat, lifecycle_status) values (o4, P, 'f2', 'TZ-H-' || v_tag, date '2027-02-01', 100, 'tasdiqlangan', 'approved') returning id into akt_h;

  insert into public.t2_akt(obyekt_id, kompaniya_id, tur, raqam, oy, hujjat_jami, holat, lifecycle_status) values (o3, P, 'f2', 'TZ-I-' || v_tag, date '2027-03-01', 100, 'tasdiqlangan', 'approved') returning id into akt_i;

  -- (D) mustaqil (eskicha): step 2 AOSR was decided by the direct supervisor company
  perform pg_temp.tz_assert((select nazorat_turi from public.t2_tomon_taqdim where id = v_tqa) = 'mustaqil' and (select nomidan_kompaniya_id from public.t2_tomon_taqdim where id = v_tqa) = T, '(D) mustaqil: eski pudratchi<->texnadzor qarori nazorat_turi=mustaqil, nomidan=texnadzor bo''lishi kerak');

  -- (A) buyurtmachining o'z xodimi: tayinlangach buyurtmachi qabuli oldidan texnik qaror shart
  r := public.t2_tomon_taqdim_yarat_v1(p_boss, P, a_pz2, 'f2', akt_c, 'TZ A-0', gen_random_uuid()); perform pg_temp.tz_ok(r, 'taqdim C'); tq_c := (r->>'id')::bigint;
  r := public.t2_tomon_qaror_v1(z2_boss, Z2, tq_c, 'qabul', 'TZ ok');
  perform pg_temp.tz_assert(r->>'holat' = 'qabul' and r->>'nazorat_turi' is null, '(A) tayinlanmagan: buyurtmachi qabuli oldingidek ishlaydi (nazorat_turi bo''sh): ' || r::text);
  perform pg_temp.tz_ok(public.t2_nazorat_tayinlash_v1(z2_boss, Z2, o3, z2_tex, gen_random_uuid()), 'nazorat_tayinlash');
  r := public.t2_tomon_taqdim_yarat_v1(p_boss, P, a_pz2, 'f2', akt_d, 'TZ A-1', gen_random_uuid()); perform pg_temp.tz_ok(r, 'taqdim D'); tq_d := (r->>'id')::bigint;
  r := public.t2_tomon_qaror_v1(z2_boss, Z2, tq_d, 'qabul', 'TZ ok');
  perform pg_temp.tz_assert(r->>'code' = 'TEXNIK_QAROR_KERAK', '(A) texnik nazorat tayinlangach texnik qarorsiz buyurtmachi qabul qila olmaydi: ' || r::text);
  r := public.t2_nazorat_qaror_v1(z2_tex, Z2, tq_d, 'qabul', 'TZ texnik ok');
  perform pg_temp.tz_assert((r->>'ok')::boolean and r->>'nazorat_turi' = 'buyurtmachi_xodimi' and (r->>'nomidan_kompaniya_id')::bigint = Z2, '(A) texnik qaror buyurtmachi xodimi nomidan: ' || r::text);
  perform pg_temp.tz_assert(pg_temp.tz_hidden(format('public.t2_nazorat_qaror_v1(%s, %s, %s, ''qabul'', null)', y_boss, Y, tq_d)), '(A) begona kompaniya texnik qaror chiqara olmaydi');
  r := public.t2_tomon_qaror_v1(z2_boss, Z2, tq_d, 'qabul', 'TZ yakuniy');
  perform pg_temp.tz_assert(r->>'holat' = 'qabul', '(A) texnik qarordan keyin buyurtmachi qabuli: ' || r::text);
  r := public.t2_nazorat_holat_v1(p_boss, P, tq_d);
  perform pg_temp.tz_assert((r->>'ok')::boolean and (r->'texnik'->0->>'nazorat_turi') = 'buyurtmachi_xodimi' and (r->'texnik'->0->>'nomidan_nom') is not null and (r->'yakuniy'->>'nomidan_kompaniya_id')::bigint = Z2,
    '(A) pudratchi qarorda "kim nomidan" ni ko''radi: ' || r::text);
  perform pg_temp.tz_assert(position('Texnik nazorat' in public.t2_tomon_taqdim_tafsilot_v1(p_boss, P, tq_d)::text) > 0, '(A) qaror yozuvida "Texnik nazorat, <buyurtmachi>" bo''lishi kerak');

  -- (B) autsorsing texnadzor, BUYURTMACHI yollagan: vakolat doirasi = buyurtmachi grantlari kesishmasi
  r := public.t2_tomon_vakolat_ber_v1(z2_boss, Z2, a_z2t2, o3, array['f2', 'chizma'], array['korish', 'qaror'], gen_random_uuid());
  perform pg_temp.tz_assert(r->>'code' = 'DOIRA_KENG', '(B) buyurtmachi o''zida yo''q resursni (chizma) vakolat qila olmaydi: ' || r::text);
  r := public.t2_tomon_vakolat_ber_v1(z2_boss, Z2, a_z2t2, o3, array['f2', 'lab_natija'], array['korish', 'qaror'], gen_random_uuid());
  perform pg_temp.tz_ok(r, 'vakolat_ber'); v_vk := (r->>'id')::bigint;
  r := public.t2_tomon_vakolat_ber_v1(t2b_boss, T2, a_z2t2, o3, array['f2'], array['korish'], gen_random_uuid());
  perform pg_temp.tz_assert(coalesce((r->>'ok')::boolean, false) is false, '(B) vakil qayta vakolat bera olmaydi (chuqurlik 1): ' || r::text);
  r := public.t2_tomon_taqdim_yarat_v1(p_boss, P, a_pz2, 'f2', akt_e, 'TZ B-1', gen_random_uuid()); perform pg_temp.tz_ok(r, 'taqdim E'); tq_e := (r->>'id')::bigint;
  r := public.t2_tomon_taqdim_yarat_v1(p_boss, P, a_pz2, 'f2', akt_h, 'TZ B-obyekt4', gen_random_uuid()); tq_h := (r->>'id')::bigint;
  perform pg_temp.tz_assert(pg_temp.tz_has(public.t2_tomon_taqdimlar_v1(t2b_user, T2, 'kelgan', null, null, 50), tq_e), '(B) vakil buyurtmachiga kelgan hujjatni (pudratchi texnadzor bilan aloqasiz) ko''rishi kerak');
  perform pg_temp.tz_assert(tq_h is null or not pg_temp.tz_has(public.t2_tomon_taqdimlar_v1(t2b_user, T2, 'kelgan', null, null, 50), tq_h), '(B) vakil vakolat berilmagan obyekt (o4) hujjatini ko''rmasligi kerak');
  perform pg_temp.tz_assert((public.t2_tomon_taqdim_tafsilot_v1(t2b_user, T2, tq_e)->>'ok')::boolean, '(B) vakil tafsilotni ko''rishi kerak');
  perform pg_temp.tz_assert(public.t2_tomon_ruxsat_bor(T2, P, 'lab_natija', 'korish', o3) and not public.t2_tomon_ruxsat_bor(T2, P, 'lab_natija', 'korish', o4)
                            and not public.t2_tomon_ruxsat_bor(T2, P, 'obyekt_holat', 'korish', o3), '(B) vakil faqat vakolat doirasidagini (lab_natija@o3) ko''radi, obyekt_holat va o4 emas');
  perform pg_temp.tz_assert(jsonb_array_length(public.t2_nazorat_tayinlar_v1(p_boss, P)->'kim_tekshiradi') >= 1, '(B) pudratchi kim tekshirayotganini ko''radi');
  r := public.t2_tomon_qaror_v1(t2b_user, T2, tq_e, 'qabul', 'TZ vakil qarori');
  perform pg_temp.tz_assert(r->>'holat' = 'qabul' and r->>'nazorat_turi' = 'vakil' and (r->>'nomidan_kompaniya_id')::bigint = Z2, '(B) vakil buyurtmachi nomidan qaror chiqardi: ' || r::text);
  r := public.t2_nazorat_holat_v1(p_boss, P, tq_e);
  perform pg_temp.tz_assert((r->'yakuniy'->>'nazorat_turi') = 'vakil' and (r->'yakuniy'->>'nomidan_kompaniya_id')::bigint = Z2 and (r->'yakuniy'->>'qaror_kompaniya_id')::bigint = T2, '(B) pudratchi: kim nomidan = buyurtmachi, qaror chiqargan = autsorsing: ' || r::text);
  -- vakolat bekor -> darhol yopiladi
  r := public.t2_tomon_taqdim_yarat_v1(p_boss, P, a_pz2, 'f2', akt_f, 'TZ B-2', gen_random_uuid()); perform pg_temp.tz_ok(r, 'taqdim F'); tq_f := (r->>'id')::bigint;
  perform pg_temp.tz_ok(public.t2_tomon_vakolat_bekor_v1(z2_boss, Z2, v_vk), 'vakolat_bekor');
  perform pg_temp.tz_assert(not pg_temp.tz_has(public.t2_tomon_taqdimlar_v1(t2b_user, T2, 'kelgan', null, null, 50), tq_f)
                            and pg_temp.tz_hidden(format('public.t2_tomon_qaror_v1(%s, %s, %s, ''qabul'', null)', t2b_user, T2, tq_f))
                            and pg_temp.tz_hidden(format('public.t2_tomon_taqdim_tafsilot_v1(%s, %s, %s)', t2b_user, T2, tq_f))
                            and not public.t2_tomon_ruxsat_bor(T2, P, 'lab_natija', 'korish', o3), '(B) vakolat bekor qilingach vakil hech narsa ko''rmaydi va qaror chiqara olmaydi');
  perform pg_temp.tz_assert(pg_temp.tz_hidden(format('public.t2_nazorat_holat_v1(%s, %s, %s)', x_boss, X, tq_e)), 'begona kompaniya nazorat holatini ko''rmasligi kerak');

  -- (C) pudratchining ichki nazorati: sukut O'CHIQ (bloklamaydi); yoqilsa ichki qabulsiz tashqariga yuborilmaydi
  r := public.t2_nazorat_sozlama_ol_v1(p_boss, P);
  perform pg_temp.tz_assert((r->>'ichki_majburiy')::boolean is false, '(C) ichki nazorat sukut o''chiq bo''lishi kerak');
  perform pg_temp.tz_ok(public.t2_nazorat_sozlama_saqla_v1(p_boss, P, true, null, gen_random_uuid()), 'nazorat_sozlama yoq');
  r := public.t2_tomon_taqdim_yarat_v1(p_pto, P, a_pz2, 'f2', akt_g, 'TZ C-1', gen_random_uuid());
  perform pg_temp.tz_assert(r->>'code' = 'ICHKI_NAZORAT_KERAK', '(C) ichki nazoratsiz tashqariga yuborib bo''lmaydi: ' || r::text);
  perform pg_temp.tz_ok(public.t2_nazorat_ichki_sorov_v1(p_pto, P, 'f2', akt_g, 'TZ ichki tekshiring', gen_random_uuid()), 'ichki_sorov');
  perform pg_temp.tz_assert(jsonb_array_length(public.t2_nazorat_ichki_navbat_v1(p_ichki, P)) >= 1, '(C) ichki nazoratchi navbatda so''rovni ko''radi');
  perform pg_temp.tz_assert(pg_temp.tz_hidden(format('public.t2_nazorat_ichki_qaror_v1(%s, %s, ''f2'', %s, ''qabul'', null, gen_random_uuid())', p_prorab, P, akt_g)), '(C) quality.decide ruxsatisiz prorab ichki qaror chiqara olmaydi');
  r := public.t2_nazorat_ichki_qaror_v1(p_ichki, P, 'f2', akt_g, 'rad', 'TZ ichki rad', gen_random_uuid()); perform pg_temp.tz_ok(r, 'ichki rad');
  r := public.t2_tomon_taqdim_yarat_v1(p_pto, P, a_pz2, 'f2', akt_g, 'TZ C-2', gen_random_uuid());
  perform pg_temp.tz_assert(r->>'code' = 'ICHKI_NAZORAT_KERAK', '(C) ichki rad etilgan hujjat yuborilmaydi: ' || r::text);
  r := public.t2_nazorat_ichki_qaror_v1(p_ichki, P, 'f2', akt_g, 'qabul', 'TZ ichki ok', gen_random_uuid()); perform pg_temp.tz_ok(r, 'ichki qabul');
  r := public.t2_tomon_taqdim_yarat_v1(p_pto, P, a_pz2, 'f2', akt_g, 'TZ C-3', gen_random_uuid()); perform pg_temp.tz_ok(r, 'taqdim G (ichki otgan)'); tq_g := (r->>'id')::bigint;
  r := public.t2_nazorat_holat_v1(z2_boss, Z2, tq_g);
  perform pg_temp.tz_assert((r->'ichki'->>'otdi')::boolean is true and (r->'ichki'->>'kim') is not null and (r->'ichki'->>'vaqt') is not null, '(C) tashqi tomon "ichki nazoratdan o''tgan: ha, kim, qachon" ni ko''radi: ' || r::text);
  perform pg_temp.tz_assert(position('izoh' in (r->'ichki')::text) = 0 and position('TZ ichki' in r::text) = 0, '(C) ichki izoh tashqariga chiqmasligi kerak (faqat ha/yo''q, kim, qachon)');
  perform pg_temp.tz_ok(public.t2_nazorat_sozlama_saqla_v1(p_boss, P, false, null, gen_random_uuid()), 'nazorat_sozlama o''chir');
  r := public.t2_tomon_taqdim_yarat_v1(p_pto, P, a_pz2, 'f2', akt_i, 'TZ C-4', gen_random_uuid()); perform pg_temp.tz_ok(r, 'taqdim H (ichki o''chiq)');
  perform pg_temp.tz_assert((select ichki_otdi from public.t2_tomon_taqdim where id = (r->>'id')::bigint) is null, '(C) ichki o''chiq: ichki_otdi bo''sh (ichki nazorat bo''lmagan)');

  -- bildirishnoma: vakilga va ichki nazoratchiga tegishli hodisalar yetadi
  -- ALL of this test's rows (ids > v_ob0), not only step 10's: fresh step-9 rows would otherwise set the dispatcher's 60-second boundary below step 10's rows
  begin update public.t2_outbox set yaratildi = now() - interval '10 minutes' where id > v_ob0;
  exception when others then perform pg_temp.tz_uz(10, 'outbox eskirtirib bo''lmadi: ' || left(sqlerrm, 100)); end;
  perform pg_temp.tz_ok(public.t2_outbox_ishlov_v1('bildirishnoma', 2000), 't2_outbox_ishlov_v1 (10)');
  perform pg_temp.tz_assert(exists (select 1 from public.t2_bildirishnoma n where n.foydalanuvchi_id = t2b_user and n.outbox_id in (select id from public.t2_outbox where id > v_ob10 and mavzu = 'tomon.taqdim')), '(5) vakil (texnadzor) buyurtmachiga kelgan hujjat haqida bildirishnoma olishi kerak');
  perform pg_temp.tz_assert(exists (select 1 from public.t2_bildirishnoma n where n.foydalanuvchi_id = t2b_user and n.outbox_id in (select id from public.t2_outbox where id > v_ob10 and mavzu = 'nazorat.vakolat')), '(5) vakil vakolat berilgani haqida xabar olishi kerak');
  perform pg_temp.tz_assert(exists (select 1 from public.t2_bildirishnoma n where n.foydalanuvchi_id = p_ichki and n.outbox_id in (select id from public.t2_outbox where id > v_ob10 and mavzu = 'nazorat.ichki_sorov')), '(5) ichki nazoratchi ichki tekshiruv so''rovi haqida xabar olishi kerak');
  perform pg_temp.tz_assert(exists (select 1 from public.t2_bildirishnoma n where n.foydalanuvchi_id = p_pto and n.outbox_id in (select id from public.t2_outbox where id > v_ob10 and mavzu = 'nazorat.ichki_qaror')), '(5) so''rovchi ichki qaror haqida xabar olishi kerak');
  raise notice 'TOMON OBSERVED [10]: texnik bosqich sozlamasi sukut «avto»: faqat texnik nazorat tayinlangan (xodim yoki texnik_qaror vakolati) bo''lsa buyurtmachi qabuli oldidan texnik qaror shart.';
  select string_agg('[' || n || '] ' || matn, E'\n' order by n) into v_list from pg_temp.tz_uzilish;
  raise notice E'TOMON OK: 10 qadam o''tdi. UZILISHLAR (%):\n%', (select count(*) from pg_temp.tz_uzilish), coalesce(v_list, '(yo''q)');
exception when others then
  raise exception 'TOMON qadam [% %]: %', v_n, v_name, sqlerrm;
end
$tz$;
