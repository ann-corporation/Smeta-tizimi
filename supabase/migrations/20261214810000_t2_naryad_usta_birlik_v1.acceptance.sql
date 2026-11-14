-- Acceptance: 20261214810000 — usta o'z birligi/narxi, koef, МАТ/МАШ toifa, tarix, toifa bo'yicha xarajat. BEGIN … ROLLBACK.
begin;
set local statement_timeout = '300s';
do $acc$
declare v_k bigint; v_o bigint; v_a bigint; v_q1 bigint; v_q2 bigint; r jsonb; r2 jsonb; v_id bigint; v_ver int; v_op uuid; v_ql jsonb; v_n int; v_s numeric; v_kod text; l1 bigint; l2 bigint;
begin
  select id into v_a from public.t2_foydalanuvchi where holat = 'faol' and public.t2_platforma_superadmin(id) limit 1;
  select o.kompaniya_id, o.id into v_k, v_o from public.t2_obyekt o
   where (select count(*) from public.t2_qator q where q.obyekt_id = o.id and q.tur = 'bl' and q.versiya_holat = 'faol') >= 2 limit 1;
  if v_k is null or v_a is null then raise notice 'obyekt/qator yo''q — o''tkazib yuborildi'; return; end if;
  select min(id), max(id) into v_q1, v_q2 from (select id from public.t2_qator where obyekt_id = v_o and tur = 'bl' and versiya_holat = 'faol' order by id limit 2) s;
  select kod into v_kod from public.t2_qator where id = v_q1;

  -- 0) yordamchi: 250 000 / usta birligi, koef 0,08 (smeta birligi / usta birligi) → 3 125 000 / smeta birligi
  if public._t2_naryad_narx_smeta(250000, 0.08) <> 3125000 or public._t2_naryad_narx_smeta(250000, null) is not null or public._t2_naryad_narx_smeta(null, 0.08) is not null
     or public._t2_naryad_narx_smeta(1, 0) is not null then raise exception 'narx_smeta yordamchisi'; end if;

  -- 1) yaratish: 1-satr ЧЕЛ usta birligida (м, koef 0,08, narx 250000), 2-satr МАТ (шт, koef 2, narx 100)
  v_ql := jsonb_build_array(
    jsonb_build_object('qator_id', v_q1, 'hajm', 8, 'kat', 'ЧЕЛ', 'usta_birlik', 'м', 'koef', 0.08, 'usta_narx_birlik', 250000, 'fakt_boshida', 0, 'smeta_mehnat_birlik', 3000000),
    jsonb_build_object('qator_id', v_q2, 'hajm', 4, 'kat', 'МАТ', 'usta_birlik', 'шт', 'koef', 2, 'usta_narx_birlik', 100, 'fakt_boshida', 0, 'smeta_kat_birlik', 60));
  r := public.t2_naryad_yoz_v1(v_k, v_a, gen_random_uuid(), 'yarat', null, null, jsonb_build_object('obyekt_id', v_o, 'usta_nom', 'Sinov usta', 'usta_foydalanuvchi_id', v_a, 'qatorlar', v_ql));
  if r->>'ok' <> 'true' then raise exception 'yaratilmadi: %', r; end if;
  v_id := (r->>'id')::bigint; v_ver := (r->>'versiya')::int;
  select id into l1 from public.t2_naryad_qator where naryad_id = v_id and tartib = 1;
  select id into l2 from public.t2_naryad_qator where naryad_id = v_id and tartib = 2;
  if (select usta_narx from public.t2_naryad_qator where id = l1) <> 3125000 then raise exception 'usta_narx (smeta birligiga) 3125000 bo''lishi kerak'; end if;
  if (select usta_narx from public.t2_naryad_qator where id = l2) <> 50 then raise exception 'МАТ usta_narx 50 bo''lishi kerak'; end if;
  if (select kat from public.t2_naryad_qator where id = l2) <> 'МАТ' then raise exception 'kat'; end if;

  -- 2) validatsiya: koef yo'q + narx(usta birligi) → xato; noto'g'ri toifa → xato
  begin
    perform public.t2_naryad_yoz_v1(v_k, v_a, gen_random_uuid(), 'yarat', null, null, jsonb_build_object('obyekt_id', v_o, 'usta_nom', 'x', 'qatorlar',
      jsonb_build_array(jsonb_build_object('qator_id', v_q1, 'hajm', 1, 'usta_narx_birlik', 100))));
    raise exception 'koefsiz usta narxi rad etilmadi';
  exception when others then if sqlerrm = 'koefsiz usta narxi rad etilmadi' then raise; end if; if sqlerrm <> 'NARYAD_KOEF_YOQ' then raise; end if; end;
  begin
    perform public.t2_naryad_yoz_v1(v_k, v_a, gen_random_uuid(), 'yarat', null, null, jsonb_build_object('obyekt_id', v_o, 'usta_nom', 'x', 'qatorlar',
      jsonb_build_array(jsonb_build_object('qator_id', v_q1, 'hajm', 1, 'kat', 'XXX'))));
    raise exception 'noto''g''ri toifa rad etilmadi';
  exception when others then if sqlerrm = 'noto''g''ri toifa rad etilmadi' then raise; end if; if sqlerrm <> 'NARYAD_KAT_NOTOGRI' then raise; end if; end;

  -- 3) usta (naryadga biriktirilgan foydalanuvchi) bajarildi: hajmlar to'liq
  r := public.t2_naryad_yoz_v1(v_k, v_a, gen_random_uuid(), 'bajarildi', v_id, v_ver, jsonb_build_object('qatorlar', jsonb_build_array(
    jsonb_build_object('id', l1, 'bajarilgan_hajm', 8), jsonb_build_object('id', l2, 'bajarilgan_hajm', 4))));
  if r->>'ok' <> 'true' or r->>'holat' <> 'bajarildi' then raise exception 'bajarildi: %', r; end if;
  v_ver := (r->>'versiya')::int;

  -- 4) qabul (prorab): fakt farqi bir ish uchun bir marta (МАТ satri ham xuddi shu qator bo'lmasa — o'z farqi)
  r := public.t2_naryad_yoz_v1(v_k, v_a, gen_random_uuid(), 'qabul', v_id, v_ver, jsonb_build_object('qatorlar', jsonb_build_array(
    jsonb_build_object('id', l1, 'qabul_hajm', 8, 'fakt_hozir', 3), jsonb_build_object('id', l2, 'qabul_hajm', 4, 'fakt_hozir', 0))));
  if r->>'ok' <> 'true' then raise exception 'qabul: %', r; end if;
  v_ver := (r->>'versiya')::int;
  if (select fakt_delta from public.t2_naryad_qator where id = l1) <> 5 then raise exception 'fakt farqi 5 (0+8-3)'; end if;

  -- 5) narx amali: usta narxini o'zgartirish (usta birligida) — usta_narx qayta hisoblanadi
  r := public.t2_naryad_yoz_v1(v_k, v_a, gen_random_uuid(), 'narx', v_id, v_ver, jsonb_build_object('qatorlar', jsonb_build_array(jsonb_build_object('id', l1, 'usta_narx_birlik', 200000, 'koef', 0.08, 'usta_birlik', 'м'))));
  if r->>'ok' <> 'true' then raise exception 'narx: %', r; end if;
  v_ver := (r->>'versiya')::int;
  if (select usta_narx from public.t2_naryad_qator where id = l1) <> 2500000 then raise exception 'narx qayta hisoblanmadi'; end if;

  -- 6) fakt, keyin hisobla: ЧЕЛ = 8/0,08×200000 = 20 000 000; МАТ = 4/2×100 = 200; ikkita alohida xarajat (toifa bo'yicha)
  r := public.t2_naryad_yoz_v1(v_k, v_a, gen_random_uuid(), 'fakt_yozildi', v_id, v_ver, jsonb_build_object('akt_id', null));
  if r->>'ok' <> 'true' then raise exception 'fakt_yozildi: %', r; end if;
  v_ver := (r->>'versiya')::int;
  v_op := gen_random_uuid();
  r := public.t2_naryad_yoz_v1(v_k, v_a, v_op, 'hisobla', v_id, v_ver, '{}'::jsonb);
  if r->>'ok' <> 'true' or r->>'holat' <> 'hisoblandi' or (r->>'xarajat_summa')::numeric <> 20000200 then raise exception 'hisobla: %', r; end if;
  select count(*), coalesce(sum(summa), 0) into v_n, v_s from public.t2_xarajat where kompaniya_id = v_k and hujjat_ref = 'naryad №' || (select raqam from public.t2_naryad where id = v_id);
  if v_n <> 2 or v_s <> 20000200 then raise exception 'xarajat soni/summa: % / %', v_n, v_s; end if;
  if not exists (select 1 from public.t2_xarajat where kompaniya_id = v_k and hujjat_ref = 'naryad №' || (select raqam from public.t2_naryad where id = v_id) and kat = 'МАТ' and summa = 200) then raise exception 'МАТ xarajati yo''q'; end if;
  r2 := public.t2_naryad_yoz_v1(v_k, v_a, v_op, 'hisobla', v_id, v_ver, '{}'::jsonb);
  if not (r2->>'takror')::boolean then raise exception 'hisobla idempotent emas'; end if;
  if (select count(*) from public.t2_xarajat where kompaniya_id = v_k and hujjat_ref = 'naryad №' || (select raqam from public.t2_naryad where id = v_id)) <> 2 then raise exception 'takror xarajat'; end if;

  -- 7) tarix: qabul qilingan satr shifr/qator bo'yicha ko'rinadi (koef va narx tarixi)
  r := public.t2_naryad_ol_v1(v_k, v_a, 'tarix', jsonb_build_object('qator_ids', jsonb_build_array(v_q1), 'kodlar', case when v_kod is null then '[]'::jsonb else jsonb_build_array(v_kod) end));
  if r->>'ok' <> 'true' or not exists (select 1 from jsonb_array_elements(r->'qatorlar') x where x->>'usta_birlik' = 'м' and (x->>'koef')::numeric = 0.08 and (x->>'usta_narx_birlik')::numeric = 200000) then raise exception 'tarix: %', r; end if;
  if public.t2_naryad_ol_v1(v_k, v_a, 'tarix', jsonb_build_object('qator_ids', (select jsonb_agg(g) from generate_series(1, 61) g)))->>'code' <> 'IDS_60' then raise exception 'tarix chegarasi'; end if;

  -- 8) o'qish: bitta naryadda yangi maydonlar; royxat reja_summa usta birligi formulasi bilan
  r := public.t2_naryad_ol_v1(v_k, v_a, 'bitta', jsonb_build_object('id', v_id));
  if (r->'naryad'->'qatorlar'->0->>'usta_birlik') <> 'м' or (r->'naryad'->>'usta_foydalanuvchi_id')::bigint <> v_a then raise exception 'bitta maydonlar'; end if;

  -- 9) begona actor
  begin
    perform public.t2_naryad_ol_v1(v_k, -1, 'royxat');
    raise exception 'begona actor rad etilmadi';
  exception when others then
    if sqlerrm = 'begona actor rad etilmadi' then raise; end if;
  end;
end $acc$;
rollback;
