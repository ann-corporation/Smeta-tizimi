-- ACCEPTANCE for 20261106480000_t2_qoshilgan_boshqaruv_v1.sql — BEGIN … ROLLBACK ichida (hech narsa saqlanmaydi).
-- Real ma'lumot: obyekt 8, kompaniya 1, actor 3; resurs 39048 «СМЕСЬ ПЕСЧАНО-ГРАВИЙНАЯ ПРИРОДНАЯ» (ish 38609, bo'lim 38533).
-- Kutiladigan natija: P0001 QOSHILGAN_BOSHQARUV_ACCEPTANCE_PASS.
do $acc$
declare
  v jsonb; v2 jsonb; v_ids bigint[]; v_a bigint; v_b bigint; v_asl jsonb; v_asl2 jsonb; v_t_w int; v_t_a int; v_cnt int;
  v_ishlar jsonb := jsonb_build_array(
    jsonb_build_object('ish', jsonb_build_object('kod', 'Е1-23-3', 'nom', 'РАЗРАБОТКА ГРУНТА В КАРЬЕРЕ', 'birlik', 'М3', 'hajm', 120),
      'resurslar', jsonb_build_array(jsonb_build_object('kat', 'МАШ', 'nom', 'ЭКСКАВАТОР 1 М3', 'birlik', 'МАШ-Ч', 'hajm', 6, 'narx', 400000))),
    jsonb_build_object('ish', jsonb_build_object('kod', 'С310-2013', 'nom', 'ПЕРЕВОЗКА ГРУЗА 5 КМ', 'birlik', 'Т', 'hajm', 216),
      'resurslar', jsonb_build_array(jsonb_build_object('kat', 'МАШ', 'nom', 'АВТОСАМОСВАЛ', 'birlik', 'МАШ-Ч', 'hajm', 9, 'narx', 300000))));
begin
  select jsonb_build_object('nom', nom, 'hajm', hajm, 'versiya', versiya, 'ota', ota_id) into v_asl from t2_qator where id = 39048;

  -- 1) Asl smeta resursi o'rniga 2 ish (o'z resurslari bilan).
  v := t2_resurs_ish_zamena_v1(3, 1, 8, 39048, v_ishlar, 'ГПС ни хокимият карьери берди', 'a0000000-0000-4000-8000-000000000001');
  if not coalesce((v->>'ok')::boolean, false) then raise exception 'RISH_YIQILDI %', v; end if;
  select array_agg(x::bigint) into v_ids from jsonb_array_elements_text(v->'qator_idlar') x;
  if cardinality(v_ids) <> 2 then raise exception 'ISH_SONI %', v; end if;
  v_a := v_ids[1]; v_b := v_ids[2];
  select count(*) into v_cnt from t2_qator where id = any(v_ids) and tur = 'bl' and ota_id = 38533 and qoshimcha and zamena
     and change_type = 'REPLACEMENT' and replaces_line_id = 39048;
  if v_cnt <> 2 then raise exception 'ISH_BELGILARI_NOTOGRI'; end if;
  if (select count(*) from t2_qator where ota_id = v_a and tur in ('rs','mat','ob')) <> 1 then raise exception 'RESURS_YOQ'; end if;
  -- asl resurs o'zgarmagan
  select jsonb_build_object('nom', nom, 'hajm', hajm, 'versiya', versiya, 'ota', ota_id) into v_asl2 from t2_qator where id = 39048;
  if v_asl2 is distinct from v_asl then raise exception 'ASL_RESURS_OZGARDI % %', v_asl, v_asl2; end if;
  -- joyi: resursning ishidan keyin (ish tartibidan kichik emas)
  select tartib into v_t_w from t2_qator where id = 38609; select tartib into v_t_a from t2_qator where id = v_a;
  if v_t_a < v_t_w then raise exception 'JOY_NOTOGRI % < %', v_t_a, v_t_w; end if;
  if (select tur from t2_smeta_ozgarish where id = (select change_id from t2_qator where id = v_a)) <> 'resurs_almashtirish' then raise exception 'OZGARISH_TURI'; end if;

  -- 2) Idempotent: xuddi shu operation_id — yangi qator yaratilmaydi.
  v2 := t2_resurs_ish_zamena_v1(3, 1, 8, 39048, v_ishlar, 'ГПС ни хокимият карьери берди', 'a0000000-0000-4000-8000-000000000001');
  if not coalesce((v2->>'takror')::boolean, false) or (select count(*) from t2_qator where replaces_line_id = 39048) <> 2 then raise exception 'TAKROR %', v2; end if;

  -- 3) Himoyalar: asl smeta qatori (ish 38609) ko'chirilmaydi; qo'shilgan resursni yana almashtirib bo'lmaydi.
  v2 := t2_qoshilgan_kochir_v1(3, 1, 8, 38609, 38533, null, 'a0000000-0000-4000-8000-000000000002');
  if v2->>'code' <> 'SMETA_QATORI_OZGARMAS' then raise exception 'ASL_KOCHDI %', v2; end if;
  v2 := t2_resurs_ish_zamena_v1(3, 1, 8, (select id from t2_qator where ota_id = v_a limit 1), v_ishlar, 'x', 'a0000000-0000-4000-8000-000000000003');
  if v2->>'code' <> 'RESURS_QOSHILGAN' then raise exception 'QOSHILGAN_RESURS %', v2; end if;
  -- zamena boshqa bo'limga ko'chirilmaydi
  v2 := t2_qoshilgan_kochir_v1(3, 1, 8, v_a, (select id from t2_qator where obyekt_id = 8 and tur = 'rz' and id <> 38533 limit 1), null, 'a0000000-0000-4000-8000-000000000004');
  if v2->>'code' <> 'ZAMENA_JOYI' then raise exception 'ZAMENA_KOCHDI %', v2; end if;

  -- 4) Zamena bo'lim ichida tartibini o'zgartiradi: B ni A dan keyin emas, bo'lim boshiga.
  v2 := t2_qoshilgan_kochir_v1(3, 1, 8, v_b, 38533, 38533, 'a0000000-0000-4000-8000-000000000005');
  if not coalesce((v2->>'ok')::boolean, false) or (select tartib from t2_qator where id = v_b) <> (select tartib from t2_qator where id = 38533) then raise exception 'TARTIB %', v2; end if;

  -- 5) Tahrirlash: A ni yangi ish bilan almashtirish (eskisi arxivga).
  v2 := t2_resurs_ish_zamena_v1(3, 1, 8, 39048, jsonb_build_array(v_ishlar->0 || jsonb_build_object('ish', jsonb_build_object('nom', 'РАЗРАБОТКА ГРУНТА В КАРЬЕРЕ ЭКСКАВАТОРОМ', 'birlik', 'М3', 'hajm', 130))),
        'hajm aniqlashtirildi', 'a0000000-0000-4000-8000-000000000006', v_a);
  if not coalesce((v2->>'ok')::boolean, false) or exists (select 1 from t2_qator where id = v_a) then raise exception 'TAHRIR %', v2; end if;
  if not exists (select 1 from t2_qator_ochirilgan where ildiz_qator_id = v_a) then raise exception 'ARXIV_YOQ'; end if;
  if (select hajm from t2_qator where id = (v2->>'qator_id')::bigint) <> 130 then raise exception 'TAHRIR_HAJM'; end if;

  -- 6) O'chirish (mavjud t2_ish_abc_ochir_v1): B o'chadi, asl resurs joyida.
  v2 := t2_ish_abc_ochir_v1(3, 1, 8, v_b, 'xato qo''shilgan', 'a0000000-0000-4000-8000-000000000007');
  if not coalesce((v2->>'ok')::boolean, false) or exists (select 1 from t2_qator where id = v_b) then raise exception 'OCHIR %', v2; end if;
  if not exists (select 1 from t2_qator where id = 39048) then raise exception 'ASL_OCHDI'; end if;

  raise exception 'QOSHILGAN_BOSHQARUV_ACCEPTANCE_PASS';
end $acc$;
