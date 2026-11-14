-- 20261218500000 acceptance (AI ISHCHILAR). Faqat tranzaksiya + ROLLBACK ichida; sintetik ma'lumot (real nom/INN/summa yo'q).
-- Tekshiradi: navbat -> SQL «quruq» qadamlar -> natija inbox; o'chiq ishchi ishlamaydi; idempotent operation_id; limit (token yechilmaydi, quruq natija chiqadi);
-- begona kompaniya ko'rmaydi; agent ruxsati kengaymaydi (a'zolik bekor bo'lsa ish to'xtaydi); internet manba allowlist (navbatdan tashqari id rad);
-- jadval (cron) bitta marta navbatga qo'yadi; retention. Xato: AI qadam [<n> <nom>]: <xato>.
set local statement_timeout = '300s';

create or replace function pg_temp.ai_assert(p_cond boolean, p_msg text) returns void language plpgsql as $f$
begin if p_cond is not true then raise exception 'ASSERT: %', p_msg; end if; end $f$;
create or replace function pg_temp.ai_ok(p_r jsonb, p_what text) returns void language plpgsql as $f$
begin if p_r is null or coalesce((p_r->>'ok')::boolean, false) is not true then raise exception 'RPC % returned %', p_what, left(coalesce(p_r::text, 'NULL'), 500); end if; end $f$;

do $ai$
declare
  v_n integer := 0; v_name text := 'init'; v_tag text := substr(md5(random()::text || clock_timestamp()::text), 1, 8);
  v_plat bigint; v_S bigint; v_B bigint; v_U bigint; v_X bigint; v_k1 bigint; v_k2 bigint; v_loy bigint; v_o1 bigint; v_o2 bigint; v_sess bigint;
  v_M1 bigint; v_M3 bigint; v_f2 bigint; v_r jsonb; v_id bigint; v_id2 bigint; v_nid bigint; v_op uuid; v_cnt integer; v_cnt2 integer; v_kz bigint; v_tok numeric;
begin
  v_n := 0; v_name := 'tayyorgarlik (kompaniya, a''zolar, obyekt, smeta, F2 qoralama, limit, hamyon)';
  insert into public.t2_kompaniya(nom, kod, faol) values ('AI PLATFORMA ' || v_tag, 'AIP' || v_tag, true) returning id into v_plat;
  insert into public.t2_foydalanuvchi(login, ism, holat) values ('ai_s_' || v_tag, 'AI Superadmin', 'faol') returning id into v_S;
  insert into public.t2_azolik(foydalanuvchi_id, kompaniya_id, rol, holat) values (v_S, v_plat, 'superadmin', 'faol');
  insert into public.t2_foydalanuvchi(login, ism, holat) values ('ai_x_' || v_tag, 'AI Stranger', 'faol') returning id into v_X;
  v_r := public.t2_kompaniya_yarat_v1(v_S, 'AI Bir ' || v_tag, null, null, gen_random_uuid()); perform pg_temp.ai_ok(v_r, 'kompaniya 1'); v_k1 := (v_r->>'kompaniya_id')::bigint;
  v_r := public.t2_kompaniya_yarat_v1(v_S, 'AI Ikki ' || v_tag, null, null, gen_random_uuid()); perform pg_temp.ai_ok(v_r, 'kompaniya 2'); v_k2 := (v_r->>'kompaniya_id')::bigint;
  insert into public.t2_foydalanuvchi(login, ism, holat) values ('ai_b_' || v_tag, 'AI Boss', 'faol') returning id into v_B;
  insert into public.t2_azolik(foydalanuvchi_id, kompaniya_id, rol, holat) values (v_B, v_k1, 'boss', 'faol');
  insert into public.t2_foydalanuvchi(login, ism, holat) values ('ai_u_' || v_tag, 'AI Usta', 'faol') returning id into v_U;
  insert into public.t2_azolik(foydalanuvchi_id, kompaniya_id, rol, holat) values (v_U, v_k1, 'usta', 'faol');
  v_r := public.t2_loyiha_yarat(v_S, v_k1, 'AI Loyiha ' || v_tag); perform pg_temp.ai_ok(v_r, 'loyiha'); v_loy := (v_r->>'id')::bigint;
  v_r := public.t2_obyekt_yarat_v1(v_k1, v_S, v_loy, 'AI Obyekt ' || v_tag, gen_random_uuid()); perform pg_temp.ai_ok(v_r, 'obyekt'); v_o1 := (v_r->>'obyekt_id')::bigint;
  v_r := public.t2_loyiha_yarat(v_S, v_k2, 'AI Loyiha2 ' || v_tag); perform pg_temp.ai_ok(v_r, 'loyiha 2');
  v_r := public.t2_obyekt_yarat_v1(v_k2, v_S, (v_r->>'id')::bigint, 'AI Obyekt2 ' || v_tag, gen_random_uuid()); perform pg_temp.ai_ok(v_r, 'obyekt 2'); v_o2 := (v_r->>'obyekt_id')::bigint;
  v_r := public.t2_smeta_import_boshla_v1(v_k1, v_S, v_o1, gen_random_uuid(), null); perform pg_temp.ai_ok(v_r, 'import boshla'); v_sess := (v_r->>'sessiya_id')::bigint;
  v_r := public.t2_smeta_import_bolak_v1(v_k1, v_S, v_sess, 0, jsonb_build_array(
    jsonb_build_object('local_id', 'S1', 'tur', 'rz', 'kod', 'AI-S1', 'nom', 'Section'),
    jsonb_build_object('local_id', 'M1', 'parent_local_id', 'S1', 'tur', 'mat', 'kod', 'AI-M1', 'nom', 'Mat one', 'birlik', 'm3', 'hajm', 10, 'narx', 100000, 'summa', 1000000),
    jsonb_build_object('local_id', 'M3', 'parent_local_id', 'S1', 'tur', 'mat', 'kod', 'AI-M3', 'nom', 'Mat three', 'birlik', 'm3', 'hajm', 4)));
  perform pg_temp.ai_ok(v_r, 'import bolak');
  perform pg_temp.ai_ok(public.t2_smeta_import_yakunla_v1(v_k1, v_S, v_sess), 'import yakunla');
  drop table if exists pg_temp.t2_imp_qator;
  update public.t2_obyekt set tur = 'obyekt' where id in (v_o1, v_o2);
  select q.id into v_M1 from public.t2_qator q where q.obyekt_id = v_o1 and q.kod = 'AI-M1';
  select q.id into v_M3 from public.t2_qator q where q.obyekt_id = v_o1 and q.kod = 'AI-M3';
  -- F2 qoralama: M1 12 (smeta hajmi 10 dan OSHGAN), tasdiqlanmaydi
  v_r := public.t2_akt_yarat(v_o1, 'f2', current_date, jsonb_build_array(jsonb_build_object('qator_id', v_M1, 'hajm', 12)), 'AI-F2-' || v_tag, gen_random_uuid(), 'frontend', 'actor:' || v_S);
  perform pg_temp.ai_ok(v_r, 'F2 qoralama'); v_f2 := (v_r->>'akt_id')::bigint;
  -- platforma limiti ochiq, kompaniya hamyoni to'ldirilgan (AI yo'li uchun); keyin limit sinaladi
  if exists (select 1 from public.t2_agent_byudjet where kompaniya_id is null) then update public.t2_agent_byudjet set oylik_limit_usd = 1000000, faol = true where kompaniya_id is null;
  else insert into public.t2_agent_byudjet(kompaniya_id, oylik_limit_usd, ogohlantirish_foiz, faol, actor_id) values (null, 1000000, 80, true, v_S); end if;
  insert into public.t2_token_harakat(kompaniya_id, foydalanuvchi_id, miqdor, tur, amal, operation_id) values (v_k1, v_S, 100000, 'toldirish', 'ai_test', gen_random_uuid());

  v_n := 1; v_name := 'ishchi ta''riflari bor, HAMMASI sukut bo''yicha o''chiq';
  perform pg_temp.ai_assert((select count(*) from public.t2_ai_ishchi where faol) >= 5, 'kamida 5 ta ishchi ta''rifi kerak');
  perform pg_temp.ai_assert(not exists (select 1 from public.t2_ai_sozlama where yoqilgan), 'sukut bo''yicha hech bir ishchi yoqilmagan bo''lishi kerak');
  perform pg_temp.ai_assert(not exists (select 1 from public.t2_ai_ishchi where doira = 'kompaniya' and 'pul' = any (vositalar)), 'vositalarda yozish/pul yo''q');

  v_n := 2; v_name := 'O''CHIQ ishchi ishlamaydi';
  v_r := public.t2_ai_ish_navbat_v1(v_B, v_k1, 'kunlik_nazoratchi', '{}'::jsonb, gen_random_uuid());
  perform pg_temp.ai_assert(v_r->>'code' = 'ISHCHI_OCHIQ', 'o''chiq ishchi navbatga qo''yilmasligi kerak: ' || v_r::text);

  v_n := 3; v_name := 'ruxsat: begona, usta, boshqa kompaniya, tizim ishchisi';
  v_r := public.t2_ai_sozlama_saqla_v1(v_X, v_k1, 'kunlik_nazoratchi', true, 'qolda', 1, true, 3000, '{}'::jsonb, gen_random_uuid());
  perform pg_temp.ai_assert(v_r->>'code' = 'COMPANY_ACCESS_DENIED', 'a''zo bo''lmagan yoqa olmaydi: ' || v_r::text);
  v_r := public.t2_ai_sozlama_saqla_v1(v_U, v_k1, 'kunlik_nazoratchi', true, 'qolda', 1, true, 3000, '{}'::jsonb, gen_random_uuid());
  perform pg_temp.ai_assert(v_r->>'code' = 'WRITE_ROLE_REQUIRED', 'usta yoqa olmaydi: ' || v_r::text);
  v_r := public.t2_ai_sozlama_saqla_v1(v_B, v_k2, 'kunlik_nazoratchi', true, 'qolda', 1, true, 3000, '{}'::jsonb, gen_random_uuid());
  perform pg_temp.ai_assert(v_r->>'code' = 'COMPANY_ACCESS_DENIED', 'boshqa kompaniyani yoqa olmaydi: ' || v_r::text);
  v_r := public.t2_ai_sozlama_saqla_v1(v_B, null, 'tizim_sogligi', true, 'qolda', 1, true, 3000, '{}'::jsonb, gen_random_uuid());
  perform pg_temp.ai_assert(v_r->>'code' = 'GLOBAL_SCOPE_DENIED', 'boss tizim ishchisini yoqa olmaydi: ' || v_r::text);
  v_r := public.t2_ai_sozlama_saqla_v1(v_B, null, 'kunlik_nazoratchi', true, 'qolda', 1, true, 3000, '{}'::jsonb, gen_random_uuid());
  perform pg_temp.ai_assert(v_r->>'code' = 'DOIRA_MOS_EMAS', 'kompaniya ishchisi tizim doirasida yoqilmaydi: ' || v_r::text);

  v_n := 4; v_name := 'boss yoqadi (idempotent), superadmin tizim ishchilarini yoqadi';
  v_op := gen_random_uuid();
  perform pg_temp.ai_ok(public.t2_ai_sozlama_saqla_v1(v_B, v_k1, 'kunlik_nazoratchi', true, 'qolda', 1, true, 3000, '{}'::jsonb, v_op), 'yoqish');
  v_r := public.t2_ai_sozlama_saqla_v1(v_B, v_k1, 'kunlik_nazoratchi', true, 'qolda', 1, true, 3000, '{}'::jsonb, v_op);
  perform pg_temp.ai_ok(v_r, 'yoqish takror');
  perform pg_temp.ai_assert((select count(*) from public.t2_ai_sozlama where kompaniya_id = v_k1 and ishchi_kod = 'kunlik_nazoratchi') = 1, 'sozlama bitta bo''lishi kerak');
  perform pg_temp.ai_ok(public.t2_ai_sozlama_saqla_v1(v_B, v_k1, 'hujjat_tekshiruvchi', true, 'qolda', 1, true, 3000, '{}'::jsonb, gen_random_uuid()), 'hujjat yoqish');
  perform pg_temp.ai_ok(public.t2_ai_sozlama_saqla_v1(v_B, v_k1, 'narx_kuzatuvchi', true, 'qolda', 1, true, 3000, '{}'::jsonb, gen_random_uuid()), 'narx yoqish');
  perform pg_temp.ai_ok(public.t2_ai_sozlama_saqla_v1(v_S, null, 'tizim_sogligi', true, 'qolda', 1, true, 3000, '{}'::jsonb, gen_random_uuid()), 'tizim yoqish');
  perform pg_temp.ai_ok(public.t2_ai_sozlama_saqla_v1(v_S, null, 'internet_kuzatuvchi', true, 'qolda', 1, true, 3000, '{}'::jsonb, gen_random_uuid()), 'internet yoqish');

  v_n := 5; v_name := 'navbat: idempotent operation_id, qo''sh bosish yangi ish ochmaydi';
  v_op := gen_random_uuid();
  v_r := public.t2_ai_ish_navbat_v1(v_B, v_k1, 'kunlik_nazoratchi', '{}'::jsonb, v_op); perform pg_temp.ai_ok(v_r, 'navbat'); v_id := (v_r->>'id')::bigint;
  perform pg_temp.ai_assert(v_r->>'holat' = 'navbatda', 'holat navbatda bo''lishi kerak: ' || v_r::text);
  v_r := public.t2_ai_ish_navbat_v1(v_B, v_k1, 'kunlik_nazoratchi', '{}'::jsonb, v_op);
  perform pg_temp.ai_assert((v_r->>'id')::bigint = v_id and (v_r->>'takror')::boolean, 'bir xil operation_id takror ish ochmasligi kerak');
  v_r := public.t2_ai_ish_navbat_v1(v_B, v_k1, 'kunlik_nazoratchi', '{}'::jsonb, gen_random_uuid());
  perform pg_temp.ai_assert((v_r->>'id')::bigint = v_id and (v_r->>'takror')::boolean, 'faol ish bor — yangi operation_id ham yangi ish ochmasligi kerak');

  v_n := 6; v_name := 'SQL «quruq» qadam: LLMsiz natija inbox''ka tushadi';
  v_r := public.t2_ai_ish_yur_v1(v_id); perform pg_temp.ai_ok(v_r, 'yur');
  perform pg_temp.ai_assert(v_r->>'holat' = 'tugadi' and v_r->>'ai_holat' = 'kutilmoqda', 'ish tugadi, AI navbatda bo''lishi kerak: ' || v_r::text);
  select id into v_nid from public.t2_ai_natija where ish_id = v_id and kompaniya_id = v_k1 and quruq;
  perform pg_temp.ai_assert(v_nid is not null, 'quruq natija yo''q');
  perform pg_temp.ai_assert(exists (select 1 from public.t2_ai_natija n, jsonb_array_elements(n.bandlar) b where n.id = v_nid and b->>'tur' = 'fakt_yoq'), 'fakt kiritilmagan obyekt bandi topilmadi');
  v_r := public.t2_ai_ish_yur_v1(v_id);
  perform pg_temp.ai_assert((v_r->>'takror')::boolean, 'tugagan ishni qayta bajarib bo''lmaydi');
  perform pg_temp.ai_assert((select count(*) from public.t2_ai_natija where ish_id = v_id) = 1, 'natija bitta bo''lishi kerak');

  v_n := 7; v_name := 'AI qadami: token faqat AI yozilgach (sarf mavjud aiHisobli orqali), quruq matn AI bilan almashadi';
  v_r := public.t2_ai_ish_ai_ol_v1(v_id); perform pg_temp.ai_ok(v_r, 'ai_ol');
  perform pg_temp.ai_assert(jsonb_typeof(v_r->'faktlar') = 'array' and (v_r->>'max_token')::integer = 3000, 'AI kirishi: faktlar + token chegarasi');
  perform pg_temp.ai_ok(public.t2_ai_ish_ai_yoz_v1(v_id, true, 'AI xulosa (sintetik)', 120, 80, 0.000100, 'test/model'), 'ai_yoz');
  perform pg_temp.ai_assert((select quruq from public.t2_ai_natija where id = v_nid) = false and (select ai_holat from public.t2_ai_ish where id = v_id) = 'tayyor', 'natija AI bilan to''ldirilmadi');
  perform pg_temp.ai_assert((select faktlar from public.t2_ai_ish where id = v_id) = '[]'::jsonb, 'faktlar tozalanishi kerak (baza hajmi)');

  v_n := 8; v_name := 'LIMIT: hamyon bo''sh — ish `limit` holatiga o''tadi, token YECHILMAYDI, quruq natija baribir chiqadi';
  select coalesce(sum(miqdor), 0) into v_tok from public.t2_token_harakat where kompaniya_id = v_k1;
  insert into public.t2_token_harakat(kompaniya_id, foydalanuvchi_id, miqdor, tur, amal, operation_id) values (v_k1, v_S, -v_tok, 'tuzatish', 'ai_test', gen_random_uuid());
  select count(*) into v_cnt from public.t2_token_harakat where kompaniya_id = v_k1;
  select count(*) into v_cnt2 from public.t2_agent_sarf where kompaniya_id = v_k1;
  v_r := public.t2_ai_ish_navbat_v1(v_B, v_k1, 'kunlik_nazoratchi', '{}'::jsonb, gen_random_uuid()); perform pg_temp.ai_ok(v_r, 'navbat limit'); v_id2 := (v_r->>'id')::bigint;
  v_r := public.t2_ai_ish_yur_v1(v_id2); perform pg_temp.ai_ok(v_r, 'yur limit');
  perform pg_temp.ai_assert(v_r->>'holat' = 'limit' and v_r->>'ai_holat' = 'limit', 'limitda ish `limit` holatiga o''tishi kerak: ' || v_r::text);
  perform pg_temp.ai_assert(exists (select 1 from public.t2_ai_natija where ish_id = v_id2 and quruq and jsonb_array_length(bandlar) > 0), 'limitda ham quruq fakt ro''yxati chiqishi kerak');
  perform pg_temp.ai_assert((select count(*) from public.t2_token_harakat where kompaniya_id = v_k1) = v_cnt and (select count(*) from public.t2_agent_sarf where kompaniya_id = v_k1) = v_cnt2, 'limitda token yechilmasligi kerak');
  v_r := public.t2_ai_ish_ai_ol_v1(v_id2);
  perform pg_temp.ai_assert(v_r->>'code' = 'AI_NAVBATDA_EMAS', 'limit holatidagi ish AI ga o''tmasligi kerak: ' || v_r::text);

  v_n := 9; v_name := 'AI qadamida limit tugasa: ai_ol rad, ish `limit`';
  insert into public.t2_token_harakat(kompaniya_id, foydalanuvchi_id, miqdor, tur, amal, operation_id) values (v_k1, v_S, 100000, 'toldirish', 'ai_test', gen_random_uuid());
  v_r := public.t2_ai_ish_navbat_v1(v_B, v_k1, 'kunlik_nazoratchi', '{}'::jsonb, gen_random_uuid()); perform pg_temp.ai_ok(v_r, 'navbat 3'); v_id2 := (v_r->>'id')::bigint;
  perform pg_temp.ai_assert((public.t2_ai_ish_yur_v1(v_id2)->>'ai_holat') = 'kutilmoqda', 'ish AI navbatida bo''lishi kerak');
  select coalesce(sum(miqdor), 0) into v_tok from public.t2_token_harakat where kompaniya_id = v_k1;
  insert into public.t2_token_harakat(kompaniya_id, foydalanuvchi_id, miqdor, tur, amal, operation_id) values (v_k1, v_S, -v_tok, 'tuzatish', 'ai_test', gen_random_uuid());
  v_r := public.t2_ai_ish_ai_ol_v1(v_id2);
  perform pg_temp.ai_assert((v_r->>'ok')::boolean is false and (v_r->>'limit')::boolean, 'AI qadamida limit rad etilishi kerak: ' || v_r::text);
  perform pg_temp.ai_assert((select holat from public.t2_ai_ish where id = v_id2) = 'limit', 'ish `limit` holatiga o''tishi kerak');

  v_n := 10; v_name := 'hujjat tekshiruvchi: F2 qoralamasida smeta hajmidan oshgan qator (bloklamaydi)';
  v_r := public.t2_ai_ish_navbat_v1(v_B, v_k1, 'hujjat_tekshiruvchi', jsonb_build_object('akt_id', v_f2), gen_random_uuid()); perform pg_temp.ai_ok(v_r, 'hujjat navbat'); v_id := (v_r->>'id')::bigint;
  perform pg_temp.ai_ok(public.t2_ai_ish_yur_v1(v_id), 'hujjat yur');
  perform pg_temp.ai_assert(exists (select 1 from public.t2_ai_natija n, jsonb_array_elements(n.bandlar) b where n.ish_id = v_id and b->>'tur' = 'f2_kamchilik'
                              and (b->'royxat'->'hajm_oshgan'->>'soni')::integer >= 1), 'hajm_oshgan kamchiligi topilmadi');
  perform pg_temp.ai_assert((select holat from public.t2_akt where id = v_f2) = 'qoralama', 'tekshiruvchi hujjatni o''zgartirmasligi kerak');

  v_n := 11; v_name := 'narx kuzatuvchi: narxsiz resurs uchun band (taklif yo''q bo''lsa ham, o''zi narx yozmaydi)';
  v_r := public.t2_ai_ish_navbat_v1(v_B, v_k1, 'narx_kuzatuvchi', '{}'::jsonb, gen_random_uuid()); perform pg_temp.ai_ok(v_r, 'narx navbat'); v_id := (v_r->>'id')::bigint;
  perform pg_temp.ai_ok(public.t2_ai_ish_yur_v1(v_id), 'narx yur');
  perform pg_temp.ai_assert(exists (select 1 from public.t2_ai_natija n, jsonb_array_elements(n.bandlar) b where n.ish_id = v_id and b->>'tur' = 'narx'), 'narxsiz band topilmadi');
  perform pg_temp.ai_assert((select narx from public.t2_qator where id = v_M3) is null, 'narx kuzatuvchi smeta narxini yozmasligi kerak (NULL qoladi)');

  v_n := 12; v_name := 'tenant: begona kompaniya/obyekt/natija ko''rinmaydi';
  v_r := public.t2_ai_ish_navbat_v1(v_B, v_k1, 'narx_kuzatuvchi', jsonb_build_object('obyekt_id', v_o2), gen_random_uuid());
  perform pg_temp.ai_assert(v_r->>'code' in ('OBYEKT_BEGONA') or (v_r->>'takror')::boolean, 'begona obyekt rad etilishi kerak: ' || v_r::text);
  perform pg_temp.ai_assert(public.t2_ai_ol_v1(v_B, v_k2, 'inbox', '{}'::jsonb)->>'code' = 'COMPANY_ACCESS_DENIED', 'boss boshqa kompaniya inbox''ini ko''ra olmaydi');
  perform pg_temp.ai_assert(public.t2_ai_ol_v1(v_X, v_k1, 'inbox', '{}'::jsonb)->>'code' = 'COMPANY_ACCESS_DENIED', 'a''zo bo''lmagan inbox''ni ko''ra olmaydi');
  perform pg_temp.ai_assert(public.t2_ai_ol_v1(v_B, null, 'manbalar', '{}'::jsonb)->>'code' = 'GLOBAL_SCOPE_DENIED', 'boss tizim manbalarini ko''ra olmaydi');
  perform pg_temp.ai_assert(jsonb_array_length(public.t2_ai_ol_v1(v_S, v_k2, 'inbox', '{}'::jsonb)->'royxat') = 0, '2-kompaniya inbox''i bo''sh bo''lishi kerak');
  perform pg_temp.ai_assert(jsonb_array_length(public.t2_ai_ol_v1(v_B, v_k1, 'inbox', '{}'::jsonb)->'royxat') >= 3, 'boss o''z inbox''ini ko''radi');
  v_r := public.t2_ai_natija_holat_v1(v_X, v_nid, 'oqildi', gen_random_uuid());
  perform pg_temp.ai_assert(v_r->>'code' = 'COMPANY_ACCESS_DENIED', 'begona natija holatini o''zgartira olmaydi: ' || v_r::text);
  perform pg_temp.ai_ok(public.t2_ai_natija_holat_v1(v_B, v_nid, 'oqildi', gen_random_uuid()), 'natija oqildi');

  v_n := 13; v_name := 'ruxsat KENGAYMAYDI: a''zolik bekor bo''lsa navbatdagi ish xato bilan to''xtaydi';
  update public.t2_ai_sozlama set actor_id = v_U where kompaniya_id = v_k1 and ishchi_kod = 'kunlik_nazoratchi';
  update public.t2_ai_ish set holat = 'tugadi' where kompaniya_id = v_k1 and holat in ('navbatda', 'ishlayapti');
  insert into public.t2_ai_ish (operation_id, kompaniya_id, ishchi_kod, actor_id, bolaklar, qadam_soni) values (gen_random_uuid(), v_k1, 'kunlik_nazoratchi', v_U, '["*"]'::jsonb, 1) returning id into v_id;
  v_r := public.t2_ai_ish_yur_v1(v_id);
  perform pg_temp.ai_assert(v_r->>'code' = 'RUXSAT_YOQ' and (select holat from public.t2_ai_ish where id = v_id) = 'xato', 'usta aktori bilan ish ishlamasligi kerak (ruxsat bossnikidan keng emas): ' || v_r::text);

  v_n := 14; v_name := 'tizim sog''ligi: kompaniyasiz natija, faqat superadmin ko''radi';
  v_r := public.t2_ai_ish_navbat_v1(v_S, null, 'tizim_sogligi', '{}'::jsonb, gen_random_uuid()); perform pg_temp.ai_ok(v_r, 'tizim navbat'); v_id := (v_r->>'id')::bigint;
  perform pg_temp.ai_ok(public.t2_ai_ish_yur_v1(v_id), 'tizim yur');
  perform pg_temp.ai_assert(exists (select 1 from public.t2_ai_natija where ish_id = v_id and kompaniya_id is null), 'tizim natijasi kompaniyasiz bo''lishi kerak');
  perform pg_temp.ai_ok(public.t2_ai_tizim_taklif_v1(v_id, jsonb_build_array(jsonb_build_object('kod', 'ai_' || v_tag, 'sarlavha', 'Sintetik taklif', 'matn', 'Sintetik matn (test)'))), 'tizim taklif');
  perform pg_temp.ai_assert(exists (select 1 from public.t2_osuvchi_taklif where tur = 'tizim' and kalit like '%ai_' || v_tag), 'tizim taklifi egasi navbatiga tushmadi');
  perform pg_temp.ai_assert(jsonb_array_length(public.t2_ai_ol_v1(v_S, null, 'inbox', '{}'::jsonb)->'royxat') >= 1, 'superadmin tizim inbox''ini ko''radi');

  v_n := 15; v_name := 'internet: faqat ro''yxatdagi manba (navbatdan tashqari id rad), natija TAKLIF (qoidaga aylanmaydi)';
  update public.t2_agent_kuzatuv_url set faol = false;   -- prod'dagi boshqa manbalar bo'lakka kirmasin (rollback ichida)
  insert into public.t2_agent_kuzatuv_url(url, domen, nom, maqsad, faol, tasdiqladi) values ('https://ai' || v_tag || '.example.org/a', 'ai' || v_tag || '.example.org', 'AI Sintetik manba', 'sinov', true, v_S) returning id into v_kz;
  v_r := public.t2_ai_ish_navbat_v1(v_S, null, 'internet_kuzatuvchi', '{}'::jsonb, gen_random_uuid()); perform pg_temp.ai_ok(v_r, 'internet navbat'); v_id := (v_r->>'id')::bigint;
  perform pg_temp.ai_assert((select bolaklar::text from public.t2_ai_ish where id = v_id) like '%"' || v_kz || '"%', 'manba bo''lakda bo''lishi kerak');
  v_r := public.t2_ai_ish_yur_v1(v_id); perform pg_temp.ai_ok(v_r, 'internet egallash');
  perform pg_temp.ai_assert((v_r->>'tashqi')::boolean, 'internet ishi tashqi (tarmoq) qadam bo''lishi kerak');
  v_r := public.t2_ai_ish_qadam_yoz_v1(v_id, jsonb_build_object('id', (v_kz + 999999)::text, 'holat', 'ozgardi', 'sha', 'abc'));
  perform pg_temp.ai_assert(v_r->>'code' = 'BOLAK_MOS_EMAS', 'ro''yxatdan tashqari manba rad etilishi kerak: ' || v_r::text);
  v_r := public.t2_ai_ish_qadam_yoz_v1(v_id, jsonb_build_object('id', v_kz::text, 'nom', 'AI Sintetik manba', 'url', 'https://ai' || v_tag || '.example.org/a', 'holat', 'ozgardi', 'sha', 'deadbeef' || v_tag,
    'xulosa', 'Sintetik o''zgarish xulosasi', 'modul', 'smeta', 'taklif', 'Sintetik taklif', 'kt', 100, 'ct', 50));
  perform pg_temp.ai_assert(coalesce((v_r->>'ok')::boolean, false) and v_r->>'holat' = 'tugadi', 'internet ishi tugashi kerak: ' || v_r::text);
  perform pg_temp.ai_assert(exists (select 1 from public.t2_osuvchi_taklif where tur = 'internet' and kalit like 'u' || v_kz || ':%' and holat = 'yangi' and qiymat like 'Sintetik o''zgarish%'), 'egasi navbatiga taklif tushmadi');
  perform pg_temp.ai_assert((select kirish_token from public.t2_ai_ish where id = v_id) = 100, 'internet tokenlari ishga yozilmadi');
  perform pg_temp.ai_ok(public.t2_ai_internet_belgila_v1(v_kz, 'deadbeef', 'ozgardi', 'sinov', 'Sintetik o''zgarish xulosasi'), 'manba belgilash');
  perform pg_temp.ai_assert(coalesce((public.t2_ai_manba_saqla_v1(v_B, v_kz, false, 'meyor', 24, gen_random_uuid())->>'ok')::boolean, false) is false, 'boss manbani boshqara olmaydi');
  perform pg_temp.ai_ok(public.t2_ai_manba_saqla_v1(v_S, v_kz, true, 'yangilik', 12, gen_random_uuid()), 'superadmin manbani boshqaradi');

  v_n := 16; v_name := 'jadval (cron): bitta marta navbatga qo''yadi, qayta ishga tushirish takrorlamaydi; retention';
  update public.t2_ai_ish set holat = 'tugadi' where holat in ('navbatda', 'ishlayapti');
  insert into public.t2_token_harakat(kompaniya_id, foydalanuvchi_id, miqdor, tur, amal, operation_id) values (v_k1, v_S, 100000, 'toldirish', 'ai_test', gen_random_uuid());
  update public.t2_ai_sozlama set jadval = 'kunlik', soat = 0, actor_id = v_B where kompaniya_id = v_k1 and ishchi_kod = 'kunlik_nazoratchi';
  v_r := public.t2_ai_jadval_v1();
  perform pg_temp.ai_assert((v_r->>'navbatga')::integer >= 1, 'jadval navbatga qo''ymadi: ' || v_r::text);
  perform pg_temp.ai_assert(exists (select 1 from public.t2_ai_ish where kompaniya_id = v_k1 and manba = 'jadval' and holat = 'tugadi' and ishchi_kod = 'kunlik_nazoratchi'), 'jadval ishi SQL qadam bilan tugamadi');
  select count(*) into v_cnt from public.t2_ai_ish where manba = 'jadval';
  v_r := public.t2_ai_jadval_v1();
  perform pg_temp.ai_assert((select count(*) from public.t2_ai_ish where manba = 'jadval') = v_cnt, 'jadval qayta ishga tushirilganda takror ish ochmasligi kerak');
  update public.t2_ai_ish set yaratildi = now() - interval '50 days' where id = v_id;
  v_r := public.t2_ai_jadval_v1();
  perform pg_temp.ai_assert(not exists (select 1 from public.t2_ai_ish where id = v_id), '45 kundan eski ish o''chirilishi kerak');
  perform pg_temp.ai_assert(exists (select 1 from public.t2_ai_ish where kompaniya_id = v_k1), 'yangi ishlar saqlanishi kerak');

  v_n := 17; v_name := 'fon ishchilar ulushi: chat uchun zaxira doim qoladi (fon_foiz)';
  perform pg_temp.ai_assert(public.t2_ai_fon_foiz_saqla_v1(v_B, 10, gen_random_uuid())->>'code' = 'GLOBAL_SCOPE_DENIED', 'boss fon ulushini o''zgartira olmaydi');
  perform pg_temp.ai_assert(public.t2_ai_fon_foiz_saqla_v1(v_S, 95, gen_random_uuid())->>'code' = 'FOIZ_INVALID', 'ulush 0..90 bo''lishi kerak');
  v_op := gen_random_uuid();
  perform pg_temp.ai_ok(public.t2_ai_fon_foiz_saqla_v1(v_S, 0, v_op), 'ulush 0');
  perform pg_temp.ai_ok(public.t2_ai_fon_foiz_saqla_v1(v_S, 0, v_op), 'ulush 0 takror');
  insert into public.t2_token_harakat(kompaniya_id, foydalanuvchi_id, miqdor, tur, amal, operation_id) values (v_k1, v_S, 100000, 'toldirish', 'ai_test', gen_random_uuid());
  update public.t2_ai_ish set holat = 'tugadi' where holat in ('navbatda', 'ishlayapti');
  perform pg_temp.ai_assert(public.t2_ai_fon_limit_v1()->>'code' = 'FON_BYUDJET_TUGADI', 'ulush 0 % da fon limiti tugagan bo''lishi kerak');
  perform pg_temp.ai_ok(public.t2_agent_sarf_tekshir_v1(v_B, v_k1), 'chat (Jarvis) limiti fon ulushidan mustaqil - zaxira qoladi');
  v_r := public.t2_ai_ish_navbat_v1(v_B, v_k1, 'kunlik_nazoratchi', '{}'::jsonb, gen_random_uuid()); perform pg_temp.ai_ok(v_r, 'navbat fon'); v_id2 := (v_r->>'id')::bigint;
  v_r := public.t2_ai_ish_yur_v1(v_id2); perform pg_temp.ai_ok(v_r, 'yur fon');
  perform pg_temp.ai_assert(v_r->>'holat' = 'limit' and (select xato_kod from public.t2_ai_ish where id = v_id2) = 'FON_BYUDJET_TUGADI', 'fon ulushi tugaganda ish limit holatiga o''tishi kerak: ' || v_r::text);
  perform pg_temp.ai_assert(exists (select 1 from public.t2_ai_natija where ish_id = v_id2 and quruq), 'fon limitida ham quruq natija chiqishi kerak');
  perform pg_temp.ai_ok(public.t2_ai_fon_foiz_saqla_v1(v_S, 90, gen_random_uuid()), 'ulush 90');
  perform pg_temp.ai_ok(public.t2_ai_fon_limit_v1(), 'ulush 90 da fon limiti ochiq');

  raise notice 'AI ISHCHILAR OK: 17 qadam (o''chiq ishchi, ruxsat, idempotentlik, quruq qadam, AI, limit, tenant, internet allowlist, cron, retention).';
exception when others then
  raise exception 'AI qadam [% %]: %', v_n, v_name, sqlerrm;
end
$ai$;
