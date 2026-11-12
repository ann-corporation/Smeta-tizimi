-- Acceptance: 20261214800000 — naryad hayot sikli, fakt farqi (ikki marta yozilmaydi), xarajat (ЧЕЛ, idempotent), lug'at. BEGIN … ROLLBACK.
begin;
set local statement_timeout = '300s';
do $acc$
declare v_k bigint; v_o bigint; v_a bigint; v_q1 bigint; v_q2 bigint; r jsonb; r2 jsonb; v_id bigint; v_ver int; v_op uuid; v_ql jsonb; v_x0 int; v_s numeric; v_d numeric;
begin
  select id into v_a from public.t2_foydalanuvchi where holat = 'faol' and public.t2_platforma_superadmin(id) limit 1;
  select o.kompaniya_id, o.id into v_k, v_o from public.t2_obyekt o
   where (select count(*) from public.t2_qator q where q.obyekt_id = o.id and q.tur = 'bl' and q.versiya_holat = 'faol') >= 2 limit 1;
  if v_k is null or v_a is null then raise notice 'obyekt/qator yo''q — o''tkazib yuborildi'; return; end if;
  select min(id), max(id) into v_q1, v_q2 from (select id from public.t2_qator where obyekt_id = v_o and tur = 'bl' and versiya_holat = 'faol' order by id limit 2) s;
  select count(*) into v_x0 from public.t2_xarajat where kompaniya_id = v_k and obyekt_id = v_o and kat = 'ЧЕЛ';

  -- 1) yaratish (+ idempotent)
  v_op := gen_random_uuid();
  v_ql := jsonb_build_array(
    jsonb_build_object('qator_id', v_q1, 'hajm', 10, 'usta_narx', 1000, 'fakt_boshida', 2, 'norma_chel_soat', 5),
    jsonb_build_object('qator_id', v_q2, 'hajm', 4, 'usta_narx', null, 'fakt_boshida', 0));
  r := public.t2_naryad_yoz_v1(v_k, v_a, v_op, 'yarat', null, null, jsonb_build_object('obyekt_id', v_o, 'usta_nom', 'Sinov usta', 'qatorlar', v_ql));
  if r->>'ok' <> 'true' or r->>'holat' <> 'berildi' then raise exception 'yaratilmadi: %', r; end if;
  v_id := (r->>'id')::bigint; v_ver := (r->>'versiya')::int;
  r2 := public.t2_naryad_yoz_v1(v_k, v_a, v_op, 'yarat', null, null, jsonb_build_object('obyekt_id', v_o, 'usta_nom', 'Sinov usta', 'qatorlar', v_ql));
  if not (r2->>'takror')::boolean or (r2->>'id')::bigint <> v_id then raise exception 'yarat idempotent emas'; end if;
  if (select count(*) from public.t2_naryad where id = v_id) <> 1 then raise exception 'takror naryad'; end if;

  -- 2) validatsiya
  if public.t2_naryad_yoz_v1(v_k, v_a, gen_random_uuid(), 'yarat', null, null, jsonb_build_object('obyekt_id', -1, 'usta_nom', 'x', 'qatorlar', v_ql))->>'code' <> 'OBYEKT_SCOPE_MISMATCH' then raise exception 'scope'; end if;
  if public.t2_naryad_yoz_v1(v_k, v_a, gen_random_uuid(), 'yarat', null, null, jsonb_build_object('obyekt_id', v_o, 'usta_nom', ' ', 'qatorlar', v_ql))->>'code' <> 'USTA_KERAK' then raise exception 'usta'; end if;
  if public.t2_naryad_yoz_v1(v_k, v_a, gen_random_uuid(), 'yarat', null, null, jsonb_build_object('obyekt_id', v_o, 'usta_nom', 'x', 'qatorlar', '[]'::jsonb))->>'code' <> 'QATORLAR_1_200' then raise exception 'qatorlar'; end if;

  -- 3) bajarildi (hajm to'liq emas — rad), keyin to'liq
  r := public.t2_naryad_yoz_v1(v_k, v_a, gen_random_uuid(), 'bajarildi', v_id, v_ver, '{}'::jsonb);
  if r->>'code' <> 'BAJARILGAN_TOLIQ_EMAS' then raise exception 'bajarilgan toliq emas tekshiruvi: %', r; end if;
  -- (xato holati qaytdi, lekin yozuv o'zgarmaganini tekshiramiz)
  if (select holat from public.t2_naryad where id = v_id) <> 'berildi' then raise exception 'holat o''zgardi'; end if;

  -- 4) qabul: farq = boshida + qabul − hozirgi fakt (hozir 5: ikkinchi marta yozilmasin)
  r := public.t2_naryad_yoz_v1(v_k, v_a, gen_random_uuid(), 'qabul', v_id, v_ver, jsonb_build_object('qatorlar', jsonb_build_array(
    jsonb_build_object('id', (select id from public.t2_naryad_qator where naryad_id = v_id and tartib = 1), 'qabul_hajm', 10, 'fakt_hozir', 5),
    jsonb_build_object('id', (select id from public.t2_naryad_qator where naryad_id = v_id and tartib = 2), 'qabul_hajm', 4, 'fakt_hozir', 0))));
  if r->>'ok' <> 'true' or r->>'holat' <> 'qabul' then raise exception 'qabul: %', r; end if;
  v_ver := (r->>'versiya')::int;
  select fakt_delta into v_d from public.t2_naryad_qator where naryad_id = v_id and tartib = 1;
  if v_d <> 7 then raise exception 'fakt farqi 7 bo''lishi kerak (2+10-5): %', v_d; end if;
  select fakt_delta into v_d from public.t2_naryad_qator where naryad_id = v_id and tartib = 2;
  if v_d <> 4 then raise exception 'fakt farqi 4: %', v_d; end if;

  -- 5) hisoblash fakt yozilmaguncha rad; usta narxi yo'q qator bilan ham rad
  r := public.t2_naryad_yoz_v1(v_k, v_a, gen_random_uuid(), 'hisobla', v_id, v_ver, '{}'::jsonb);
  if r->>'code' <> 'FAKT_YOZILMAGAN' then raise exception 'FAKT_YOZILMAGAN kutilgan: %', r; end if;
  r := public.t2_naryad_yoz_v1(v_k, v_a, gen_random_uuid(), 'fakt_yozildi', v_id, v_ver, jsonb_build_object('akt_id', null));
  if r->>'ok' <> 'true' then raise exception 'fakt_yozildi: %', r; end if;
  v_ver := (r->>'versiya')::int;
  r := public.t2_naryad_yoz_v1(v_k, v_a, gen_random_uuid(), 'hisobla', v_id, v_ver, '{}'::jsonb);
  if r->>'code' <> 'USTA_NARX_YOQ' then raise exception 'USTA_NARX_YOQ kutilgan (NULL != 0): %', r; end if;
  update public.t2_naryad_qator set usta_narx = 500 where naryad_id = v_id and tartib = 2;

  -- 6) hisoblash: summa = 10*1000 + 4*500 = 12000; xarajat ЧЕЛ yaratiladi; qayta (xuddi shu operation) ikkinchi xarajat yaratmaydi
  v_op := gen_random_uuid();
  r := public.t2_naryad_yoz_v1(v_k, v_a, v_op, 'hisobla', v_id, v_ver, '{}'::jsonb);
  if r->>'ok' <> 'true' or r->>'holat' <> 'hisoblandi' or (r->>'xarajat_summa')::numeric <> 12000 then raise exception 'hisobla: %', r; end if;
  r2 := public.t2_naryad_yoz_v1(v_k, v_a, v_op, 'hisobla', v_id, v_ver, '{}'::jsonb);
  if not (r2->>'takror')::boolean then raise exception 'hisobla idempotent emas'; end if;
  select count(*), coalesce(sum(summa), 0) into v_x0, v_s from public.t2_xarajat where kompaniya_id = v_k and hujjat_ref = 'naryad №' || (select raqam from public.t2_naryad where id = v_id) and kat = 'ЧЕЛ';
  if v_x0 <> 1 or v_s <> 12000 then raise exception 'xarajat soni/summa: % / %', v_x0, v_s; end if;

  -- 7) hisoblangan naryad bekor qilinmaydi
  r := public.t2_naryad_yoz_v1(v_k, v_a, gen_random_uuid(), 'bekor', v_id, (select versiya from public.t2_naryad where id = v_id), '{}'::jsonb);
  if r->>'code' <> 'BEKOR_MUMKIN_EMAS' then raise exception 'bekor: %', r; end if;

  -- 8) eskirgan versiya
  r := public.t2_naryad_yoz_v1(v_k, v_a, gen_random_uuid(), 'bekor', v_id, 1, '{}'::jsonb);
  if r->>'code' <> 'STALE_VERSION' then raise exception 'STALE: %', r; end if;

  -- 9) o'qish
  r := public.t2_naryad_ol_v1(v_k, v_a, 'royxat', jsonb_build_object('obyekt_id', v_o));
  if not exists (select 1 from jsonb_array_elements(r->'naryadlar') x where (x->>'id')::bigint = v_id) then raise exception 'royxatda yo''q'; end if;
  r := public.t2_naryad_ol_v1(v_k, v_a, 'bitta', jsonb_build_object('id', v_id));
  if jsonb_array_length(r->'naryad'->'qatorlar') <> 2 then raise exception 'qatorlar soni'; end if;

  -- 10) lug'at: saqlash / o'qish / o'chirish
  r := public.t2_naryad_yoz_v1(v_k, v_a, gen_random_uuid(), 'lugat_saqla', null, null, jsonb_build_object('qiymat', jsonb_build_object('sinonim', jsonb_build_array(jsonb_build_object('kalit', 'gisht', 'soz', 'sinov'))))) ;
  if r->>'ok' <> 'true' then raise exception 'lugat: %', r; end if;
  r := public.t2_naryad_ol_v1(v_k, v_a, 'lugat');
  if r->'qiymat'->'sinonim'->0->>'soz' <> 'sinov' then raise exception 'lugat oqilmadi'; end if;
  r := public.t2_naryad_yoz_v1(v_k, v_a, gen_random_uuid(), 'lugat_saqla', null, null, jsonb_build_object('qiymat', to_jsonb('matn'::text)));
  if r->>'code' <> 'LUGAT_NOTOGRI' then raise exception 'lugat tur: %', r; end if;

  -- 11) begona actor
  begin
    perform public.t2_naryad_ol_v1(v_k, -1, 'royxat');
    raise exception 'begona actor rad etilmadi';
  exception when others then
    if sqlerrm = 'begona actor rad etilmadi' then raise; end if;
  end;
end $acc$;
rollback;
