-- ACCEPTANCE: 20261216220000 (buxgalteriya P3) - 200000 + 210000 qo'llangan bazada; BEGIN..ROLLBACK, FAQAT sintetik fixture (haqiqiy summa/INN/nom yo'q).
-- Tekshiradi: (1) ikki kompaniya akt-sverkasi (mos / summa_farq / faqat_ular, izolyatsiya, aloqasiz rad), (2) mehnat: BIR FAKT - BIR MANBA
-- (shtatdagi usta naryadi faqat oylik orqali, shtatsiz usta - pudrat, oylik tasdiqlanmaguncha xarajat yo'qolmaydi, takror = 0, ish haqi provodkalari).
begin;
set local statement_timeout = '300s';

do $acc$
declare
  ka bigint; kb bigint; kl bigint; ua bigint; ub bigint; ul bigint; us bigint; un bigint; kcA bigint; kcB bigint; sh_a bigint; sh_b bigint; al bigint; o bigint; kn bigint;
  km1 bigint; r jsonb; r2 jsonb; rep text[] := array[]::text[]; v_state text; n bigint; a numeric; b numeric; x_s bigint; x_u bigint; x_m bigint; x_s2 bigint;
  v_inn_a text := 'TSTA' || (random() * 1e8)::bigint; v_inn_b text := 'TSTB' || (random() * 1e8)::bigint;
begin
  insert into public.t2_kompaniya (nom, kod, faol, inn) values ('_TEST_BUXP3_A_', gen_random_uuid()::text, true, v_inn_a) returning id into ka;
  insert into public.t2_kompaniya (nom, kod, faol, inn) values ('_TEST_BUXP3_B_', gen_random_uuid()::text, true, v_inn_b) returning id into kb;
  insert into public.t2_kompaniya (nom, kod, faol) values ('_TEST_BUXP3_L_', gen_random_uuid()::text, true) returning id into kl;
  insert into public.t2_foydalanuvchi (login, ism, holat) values ('tp3_a_' || ka, 'bugalter A', 'faol') returning id into ua;
  insert into public.t2_foydalanuvchi (login, ism, holat) values ('tp3_b_' || ka, 'bugalter B', 'faol') returning id into ub;
  insert into public.t2_foydalanuvchi (login, ism, holat) values ('tp3_l_' || ka, 'bugalter L', 'faol') returning id into ul;
  insert into public.t2_foydalanuvchi (login, ism, holat) values ('tp3_s_' || ka, 'shtat usta', 'faol') returning id into us;
  insert into public.t2_foydalanuvchi (login, ism, holat) values ('tp3_n_' || ka, 'shtatsiz usta', 'faol') returning id into un;
  insert into public.t2_azolik (foydalanuvchi_id, kompaniya_id, rol, holat) values (ua, ka, 'bugalter', 'faol'), (ub, kb, 'bugalter', 'faol'), (ul, kl, 'bugalter', 'faol');
  insert into public.t2_obyekt (nom, kompaniya_id) values ('_TEST_BUXP3_O_', kl) returning id into o;

  -- ===== 1. AKT SVERKI: A (pudratchi) va B (buyurtmachi) =====
  perform public.t2_bux_boshlash_v1(ua, ka, gen_random_uuid());
  perform public.t2_bux_shablon_tanla_v1(ub, kb, 'buyurtmachi', gen_random_uuid());
  perform public.t2_bux_boshlash_v1(ub, kb, gen_random_uuid());
  insert into public.t2_kontragent (kompaniya_id, nom, inn) values (ka, 'TEST B KONTRAGENT', v_inn_b) returning id into kcA;
  insert into public.t2_kontragent (kompaniya_id, nom, inn) values (kb, 'TEST A KONTRAGENT', v_inn_a) returning id into kcB;
  set local session_replication_role = replica;
  insert into public.t2_tomon_aloqa (taklif_kompaniya_id, qabul_kompaniya_id, taklif_rol, qabul_rol, turi, holat, taklif_actor_id)
    values (ka, kb, 'pudratchi', 'buyurtmachi', 'shartnoma', 'faol', ua) returning id into al;
  insert into public.t2_shartnoma (kompaniya_id, raqam, asosiy, turi, taraf) values (ka, 'P3-A', true, 'Bosh shartnoma', 'TEST B') returning id into sh_a;
  insert into public.t2_shartnoma_tomon (kompaniya_id, shartnoma_id, rol, kontragent_id, nom, tartib) values (ka, sh_a, 'Zakazchik', kcA, 'TEST B', 1);
  insert into public.t2_shartnoma (kompaniya_id, raqam, asosiy, turi, taraf) values (kb, 'P3-B', true, 'Bosh shartnoma', 'TEST A') returning id into sh_b;
  insert into public.t2_shartnoma_tomon (kompaniya_id, shartnoma_id, rol, kontragent_id, nom, tartib) values (kb, sh_b, 'Pudratchi', kcB, 'TEST A', 1);
  insert into public.t2_forma3 (kompaniya_id, shartnoma_id, davr_boshi, davr_oxiri, holat, manba, sotuv_summa, sotuv_sana, nds_foiz, raqam)
    values (ka, sh_a, '2026-01-01', '2026-01-31', 'tayyor', 'sotuv', 1120, '2026-01-31', 12, 'P3-F3-1'), (ka, sh_a, '2026-02-01', '2026-02-28', 'tayyor', 'sotuv', 560, '2026-02-10', 12, 'P3-F3-2');
  insert into public.t2_tolov (kompaniya_id, shartnoma_id, sana, summa, tur, manba) values (ka, sh_a, '2026-02-05', 500, 'tolov', 'qolda');
  insert into public.t2_tolov (kompaniya_id, shartnoma_id, sana, summa, tur, manba) values (kb, sh_b, '2026-02-05', 500, 'tolov', 'qolda'), (kb, sh_b, '2026-03-01', 40, 'tolov', 'qolda');
  insert into public.t2_tomon_taqdim (aloqa_id, taqdim_etuvchi_kompaniya_id, qabul_qiluvchi_kompaniya_id, resurs, manba_jadval, manba_id, nom, taqdim_actor_id, summa, holat, qaror_vaqti)
    values (al, ka, kb, 'f2', 't2_akt', -11, 'TEST F2 1', ua, 1120, 'qabul', '2026-01-31 10:00:00+00'), (al, ka, kb, 'f2', 't2_akt', -12, 'TEST F2 2', ua, 600, 'qabul', '2026-02-12 10:00:00+00');
  set local session_replication_role = origin;
  perform public.t2_bux_avto_provodka_v1(ua, ka, false, gen_random_uuid());
  perform public.t2_bux_avto_provodka_v1(ub, kb, false, gen_random_uuid());

  r := public.t2_bux_sverka_v1(ka, ua, kb, '2026-01-01', '2026-12-31');
  rep := rep || (case when (r->>'ok')::boolean and jsonb_array_length(r->'qatorlar') = 4 and (r->>'farqli_soni')::int = 2
                       and (select count(*) from jsonb_array_elements(r->'qatorlar') e where e->>'holat' = 'mos') = 2
                       and (select count(*) from jsonb_array_elements(r->'qatorlar') e where e->>'holat' = 'summa_farq' and (e->>'a_summa')::numeric = 560 and (e->>'b_summa')::numeric = 600) = 1
                       and (select count(*) from jsonb_array_elements(r->'qatorlar') e where e->>'holat' = 'faqat_ular' and (e->>'b_summa')::numeric = -40) = 1
                       and (r->>'yopilish_men')::numeric = 1180 and (r->>'yopilish_ular')::numeric = 1180 and jsonb_array_length(r->'ogohlantirish') = 0
                      then 'OK   akt-sverka A: 2 mos, 1 summa_farq (560/600), 1 faqat_ular (-40), saldo 1180/1180' else 'FAIL sverka A: ' || r::text end);
  rep := rep || (case when not exists (select 1 from jsonb_array_elements(r->'qatorlar') e where e->>'holat' = 'faqat_ular' and (e->'hujjat' <> 'null'::jsonb or e->'manba_tur' <> 'null'::jsonb))
                      then 'OK   ikkinchi tomon qatori: faqat sana + summa (hujjat/manba yo''q)' else 'FAIL izolyatsiya: ' || r::text end);
  r2 := public.t2_bux_sverka_v1(kb, ub, ka, '2026-01-01', '2026-12-31');
  rep := rep || (case when (r2->>'ok')::boolean and (r2->>'farqli_soni')::int = 2 and (r2->>'yopilish_men')::numeric = 1180 and (r2->>'yopilish_ular')::numeric = 1180
                       and (select count(*) from jsonb_array_elements(r2->'qatorlar') e where e->>'holat' = 'faqat_men' and (e->>'a_summa')::numeric = 40) = 1
                      then 'OK   akt-sverka B (simmetrik): faqat_men 40, saldo 1180/1180' else 'FAIL sverka B: ' || r2::text end);
  r := public.t2_bux_sverka_v1(ka, ua, kl, '2026-01-01', '2026-12-31');
  rep := rep || (case when r->>'code' = 'ALOQA_YOQ' then 'OK   aloqasiz kompaniya bilan sverka rad (ALOQA_YOQ)' else 'FAIL aloqasiz: ' || r::text end);
  r := public.t2_bux_sverka_tomonlar_v1(ka, ua);
  rep := rep || (case when jsonb_array_length(r->'tomonlar') = 1 and (r->'tomonlar'->0->>'kompaniya_id')::bigint = kb then 'OK   tomonlar ro''yxati: faqat aloqali B' else 'FAIL tomonlar: ' || r::text end);
  begin
    perform public.t2_bux_sverka_v1(ka, ub, kb, null, null);
    rep := rep || 'FAIL B foydalanuvchisi A daftaridan sverka oldi'::text;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    rep := rep || ('OK   B foydalanuvchisi A nomidan sverka ololmaydi (' || v_state || ')');
  end;

  -- ===== 2. MEHNAT: bir fakt - bir manba (kompaniya L) =====
  perform public.t2_bux_boshlash_v1(ul, kl, gen_random_uuid());
  insert into public.t2_kontragent (kompaniya_id, nom) values (kl, 'TEST SHTATSIZ USTA') returning id into kn;
  set local session_replication_role = replica;
  insert into public.t2_kadr_mustaqil (kompaniya_id, ism_sharif, lavozim, foydalanuvchi_id) values (kl, 'TEST SHTAT USTA', 'usta', us) returning id into km1;
  insert into public.t2_hr_xodim (kadr_id, kompaniya_id) values (km1, kl);
  insert into public.t2_hr_oylik (kompaniya_id, kadr_id, oy, holat, hisoblangan, ndfl, inps, sof) values (kl, km1, '2026-03-01', 'tasdiqlangan', 1000, 120, 1, 879);
  insert into public.t2_naryad (kompaniya_id, obyekt_id, raqam, usta_nom, holat, usta_foydalanuvchi_id) values (kl, o, 'N-S1', 'S', 'hisoblandi', us);
  insert into public.t2_naryad (kompaniya_id, obyekt_id, raqam, usta_nom, holat, usta_foydalanuvchi_id, usta_kontragent_id) values (kl, o, 'N-U1', 'U', 'hisoblandi', un, kn);
  insert into public.t2_naryad (kompaniya_id, obyekt_id, raqam, usta_nom, holat, usta_foydalanuvchi_id) values (kl, o, 'N-S2', 'S', 'hisoblandi', us);
  insert into public.t2_xarajat (kompaniya_id, sana, summa, kat, obyekt_id, hujjat_ref) values (kl, '2026-03-10', 400, U&'\0427\0415\041B', o, 'naryad ' || chr(8470) || 'N-S1') returning id into x_s;
  insert into public.t2_xarajat (kompaniya_id, sana, summa, kat, obyekt_id, hujjat_ref) values (kl, '2026-03-12', 300, U&'\0427\0415\041B', o, 'naryad ' || chr(8470) || 'N-U1') returning id into x_u;
  insert into public.t2_xarajat (kompaniya_id, sana, summa, kat, obyekt_id) values (kl, '2026-03-15', 200, U&'\0427\0415\041B', o) returning id into x_m;
  insert into public.t2_xarajat (kompaniya_id, sana, summa, kat, obyekt_id, hujjat_ref) values (kl, '2026-04-10', 150, U&'\0427\0415\041B', o, 'naryad ' || chr(8470) || 'N-S2') returning id into x_s2;
  set local session_replication_role = origin;

  r := public.t2_bux_avto_provodka_v1(ul, kl, false, gen_random_uuid());
  -- mart: shtatdagi usta xarajati (400) provodkada YO'Q (oylik orqali); shtatsiz usta pudrat (Kt 6010, kontragent); qo'lda ЧЕЛ 200; oylik 1000 + ushlanma 121
  select coalesce(sum(summa), 0) into a from public.t2_bux_provodka where kompaniya_id = kl and manba_tur = 'xarajat' and manba_id = x_s;
  select coalesce(sum(summa), 0) into b from public.t2_bux_provodka where kompaniya_id = kl and dt_kod = '2010' and sana >= '2026-03-01' and sana < '2026-04-01';
  rep := rep || (case when a = 0 and b = 1500
                       and (select coalesce(sum(summa), 0) from public.t2_bux_provodka where kompaniya_id = kl and manba_tur = 'xarajat' and manba_id = x_u and kt_kod = '6010' and kontragent_id = kn) = 300
                       and (select coalesce(sum(summa), 0) from public.t2_bux_provodka where kompaniya_id = kl and manba_tur = 'xarajat' and manba_id = x_u and kt_kod = '6710') = 0
                       and (select coalesce(sum(summa), 0) from public.t2_bux_provodka where kompaniya_id = kl and manba_tur = 'xarajat' and manba_id = x_m and dt_kod = '2010' and kt_kod = '6710') = 200
                       and (select coalesce(sum(summa), 0) from public.t2_bux_provodka where kompaniya_id = kl and manba_tur = 'ish_haqi' and dt_kod = '2010' and kt_kod = '6710') = 1000
                       and (select coalesce(sum(summa), 0) from public.t2_bux_provodka where kompaniya_id = kl and manba_tur = 'ish_haqi' and dt_kod = '6710' and kt_kod = '6410') = 121
                      then 'OK   mehnat (mart): shtat naryadi faqat oylikda (400 ikki marta emas), shtatsiz usta pudrat 300 (Kt 6010), ЧЕЛ 200, oylik 1000 + ushlanma 121; 2010 jami 1500'
                      else 'FAIL mehnat mart: a=' || a || ' b=' || b || ' ' || r::text end);
  rep := rep || (case when (r->>'chel_ikki_manba_ogohlantirish')::int = 1 then 'OK   ogohlantirish: oylik oyida naryadsiz qo''lda ЧЕЛ xarajat = 1' else 'FAIL chel ogohlantirish: ' || r::text end);
  -- aprel: oylik hali yo'q -> shtat naryadi (150) xarajat.chel orqali yoziladi (yo'qolmaydi)
  select coalesce(sum(summa), 0) into a from public.t2_bux_provodka where kompaniya_id = kl and manba_tur = 'xarajat' and manba_id = x_s2 and dt_kod = '2010' and kt_kod = '6710';
  rep := rep || (case when a = 150 then 'OK   aprel: oylik tasdiqlanmaguncha shtat naryadi 150 xarajat orqali (xarajat yo''qolmaydi)' else 'FAIL aprel zaxira: ' || a end);
  -- oylik aprelga tasdiqlansa: xarajat provodkasi storno (net 0), oylik 500 yoziladi; takror = 0
  set local session_replication_role = replica;
  insert into public.t2_hr_oylik (kompaniya_id, kadr_id, oy, holat, hisoblangan, ndfl, inps, sof) values (kl, km1, '2026-04-01', 'tasdiqlangan', 500, 60, 0, 440);
  set local session_replication_role = origin;
  r := public.t2_bux_avto_provodka_v1(ul, kl, false, gen_random_uuid());
  r2 := public.t2_bux_avto_provodka_v1(ul, kl, false, gen_random_uuid());
  select coalesce(sum(summa), 0) into a from public.t2_bux_provodka where kompaniya_id = kl and manba_tur = 'xarajat' and manba_id = x_s2;
  select coalesce(sum(summa), 0) into b from public.t2_bux_provodka where kompaniya_id = kl and dt_kod = '2010' and sana >= '2026-04-01' and sana < '2026-05-01';
  rep := rep || (case when a = 0 and b = 500 and (r->>'storno')::int >= 1 and (r2->>'yangi')::int = 0 and (r2->>'storno')::int = 0
                      then 'OK   aprel oylik tasdiqlandi: naryad xarajati storno (net 0), 2010 aprel = 500 (oylik), takror = 0' else 'FAIL aprel almashish: a=' || a || ' b=' || b || ' ' || r::text || r2::text end);
  -- pul ko'rinishi: ish haqi ЧЕЛ toifasida; jami xarajat = 2000 (mart 1500 + aprel 500), hech narsa ikki marta emas
  r := public.t2_bux_pul_korinish_v1(kl, ul, null, null);
  select coalesce(sum((x->>'xarajat_chel')::numeric), 0) into a from jsonb_array_elements(r->'qatorlar') x;
  rep := rep || (case when (r->'jami'->>'xarajat')::numeric = 2000 and a = 2000 then 'OK   pul ko''rinishi: xarajat 2000 = ЧЕЛ 2000 (ish haqi ЧЕЛ toifasida), ikki marta sanalmagan' else 'FAIL pul ko''rinishi: ' || r::text end);
  -- ОСВ: Dt = Kt
  r := public.t2_bux_osv_v1(kl, ul, '2026-01-01', '2026-12-31', null, null, null, 500);
  rep := rep || (case when (r->>'jami_dt')::numeric = (r->>'jami_kt')::numeric then 'OK   ОСВ muvozanatda (Dt = Kt)' else 'FAIL ОСВ: ' || r::text end);

  if exists (select 1 from unnest(rep) x where x like 'FAIL%') then
    raise exception 'ACCEPTANCE_BUXGALTERIYA_P3 FAIL:%', E'\n' || array_to_string(rep, E'\n');
  end if;
  raise notice 'ACCEPTANCE_BUXGALTERIYA_P3 % OK:%', cardinality(rep), E'\n' || array_to_string(rep, E'\n');
end $acc$;

rollback;
