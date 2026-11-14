-- ACCEPTANCE: 20261216510000 (tender ochiq P1) - BEGIN..ROLLBACK, FAQAT sintetik fixture. Avval 20261216500000 qo'llangan bo'lishi shart.
-- Tekshiradi: muhr (xaridor muddatgacha VA ochilgunga qadar narxni o'qiy olmaydi, to'g'ridan-to'g'ri RPC bilan ham); muddatdan keyingi taklif rad; ochish idempotent va auditda bitta hodisa;
-- ochilgach taqqos; qaytarib olingan taklif o'rtachaga kirmaydi; material g'olibi -> aynan bitta buyurtma va bitta o'rtacha narx manbasi (takrorda yangi yozuv yo'q);
-- ish lot smeta bo'limidan (faqat hajm) -> bitta aloqa + topshiriqlar to'plami (takrorda ko'paymaydi) + shartnoma havolasi; faqat-taklif lotni begona kompaniya ko'rmaydi; ochiq o'qishda narx/smeta yo'q.
begin;
set local statement_timeout = '300s';
do $acc$
declare
  k bigint; b1 bigint; b2 bigint; b3 bigint; b4 bigint; f bigint; ak bigint; a1 bigint; a2 bigint; a3 bigint; a4 bigint; af bigint; ob bigint; sec bigint;
  res jsonb; rid bigint; ver int; q1 bigint; q2 bigint; q3 bigint; t1 bigint; t2 bigint; t3 bigint; t4 bigint; n int; al bigint; m1 bigint; rid2 bigint; wid bigint; qq bigint[]; rid3 bigint; tq3 bigint;
begin
  insert into public.t2_kompaniya (nom, kod, faol) values ('_TN_K', gen_random_uuid()::text, true) returning id into k;
  insert into public.t2_kompaniya (nom, kod, faol) values ('_TN_B1', gen_random_uuid()::text, true) returning id into b1;
  insert into public.t2_kompaniya (nom, kod, faol) values ('_TN_B2', gen_random_uuid()::text, true) returning id into b2;
  insert into public.t2_kompaniya (nom, kod, faol) values ('_TN_B3', gen_random_uuid()::text, true) returning id into b3;
  insert into public.t2_kompaniya (nom, kod, faol) values ('_TN_B4', gen_random_uuid()::text, true) returning id into b4;
  insert into public.t2_kompaniya (nom, kod, faol) values ('_TN_F', gen_random_uuid()::text, true) returning id into f;
  insert into public.t2_foydalanuvchi (ism, login, email) values ('_ak', 'tn_ak_' || gen_random_uuid(), 'tn_ak_' || gen_random_uuid() || '@t.invalid') returning id into ak;
  insert into public.t2_foydalanuvchi (ism, login, email) values ('_a1', 'tn_a1_' || gen_random_uuid(), 'tn_a1_' || gen_random_uuid() || '@t.invalid') returning id into a1;
  insert into public.t2_foydalanuvchi (ism, login, email) values ('_a2', 'tn_a2_' || gen_random_uuid(), 'tn_a2_' || gen_random_uuid() || '@t.invalid') returning id into a2;
  insert into public.t2_foydalanuvchi (ism, login, email) values ('_a3', 'tn_a3_' || gen_random_uuid(), 'tn_a3_' || gen_random_uuid() || '@t.invalid') returning id into a3;
  insert into public.t2_foydalanuvchi (ism, login, email) values ('_a4', 'tn_a4_' || gen_random_uuid(), 'tn_a4_' || gen_random_uuid() || '@t.invalid') returning id into a4;
  insert into public.t2_foydalanuvchi (ism, login, email) values ('_af', 'tn_af_' || gen_random_uuid(), 'tn_af_' || gen_random_uuid() || '@t.invalid') returning id into af;
  insert into public.t2_azolik (kompaniya_id, foydalanuvchi_id, rol, holat) values (k, ak, 'admin', 'faol'), (b1, a1, 'admin', 'faol'), (b2, a2, 'admin', 'faol'), (b3, a3, 'admin', 'faol'), (b4, a4, 'admin', 'faol'), (f, af, 'admin', 'faol');
  insert into public.t2_obyekt (nom, kompaniya_id) values ('_TN_OB', k) returning id into ob;

  -- 1. Grantlar
  if has_function_privilege('anon', 'public.t2_tn_ochiq_royxat_v1(jsonb)', 'execute') or has_function_privilege('authenticated', 'public.t2_tn_bayonnoma_v1(bigint,bigint,bigint)', 'execute')
     or not has_function_privilege('service_role', 'public.t2_tn_ochiq_lot_v1(bigint)', 'execute') then raise exception 'FAIL grant'; end if;

  -- 2. Material lot (ochiq): e'lon
  res := public.t2_tender_saqla_v1(ak, k, gen_random_uuid(), null, null, 'material', 'ochiq', '{}'::bigint[], ob, now() + interval '2 days', jsonb_build_object('sarlavha', '_TN Sement lot'),
    jsonb_build_array(jsonb_build_object('nom', '_Sement', 'birlik', 'tonna', 'miqdor', 10), jsonb_build_object('nom', '_Qum', 'birlik', 'm3', 'miqdor', 20), jsonb_build_object('nom', '_Shagal', 'birlik', 'm3', 'miqdor', 5)));
  if not (res ->> 'ok')::boolean then raise exception 'FAIL saqla: %', res; end if;
  rid := (res ->> 'id')::bigint; ver := (res ->> 'versiya')::int;
  res := public.t2_tender_otish_v1(ak, k, gen_random_uuid(), rid, ver, 'tasdiqlashda'); if not (res ->> 'ok')::boolean then raise exception 'FAIL tasdiqlashda: %', res; end if; ver := (res ->> 'versiya')::int;
  res := public.t2_tender_otish_v1(ak, k, gen_random_uuid(), rid, ver, 'elon'); if not (res ->> 'ok')::boolean then raise exception 'FAIL elon: %', res; end if; ver := (res ->> 'versiya')::int;
  select array_agg(id order by qator_no) into qq from public.t2_birja_rfq_qator where rfq_id = rid; q1 := qq[1]; q2 := qq[2]; q3 := qq[3];

  -- 3. Ochiq o'qish (kirmasdan): lot ko'rinadi, narx/smeta/zayavka/egasi YO'Q
  res := public.t2_tn_ochiq_lot_v1(rid);
  if not (res ->> 'ok')::boolean or jsonb_array_length(res -> 'qatorlar') <> 3 then raise exception 'FAIL ochiq lot: %', res; end if;
  -- OQ RO'YXAT: har kalit alohida tanlangan. byudjet/meyor/savol_muddat/smeta/zayavka/kompaniya/obyekt/narx hech qachon (null sifatida ham) chiqmaydi.
  if exists (select 1 from jsonb_object_keys(res) k2 where k2 <> all (array['ok', 'lot', 'qatorlar'])) then raise exception 'FAIL ochiq lot yuqori kalit: %', res; end if;
  if exists (select 1 from jsonb_object_keys(res -> 'lot') k2 where k2 <> all (array['id', 'raqam', 'nom', 'tur', 'muddat', 'muddat_otgan', 'izoh', 'tolov_sharti', 'valyuta', 'qqs_foiz', 'baholash_usuli', 'takliflar_soni']))
     then raise exception 'FAIL ochiq lot ortiqcha maydon sizdirdi: %', res -> 'lot'; end if;
  if exists (select 1 from jsonb_array_elements(res -> 'qatorlar') x, jsonb_object_keys(x) k2 where k2 <> all (array['qator_no', 'lot_no', 'lot_nom', 'nom', 'birlik', 'miqdor', 'talab_sana', 'yetkazish_joyi', 'spets']))
     then raise exception 'FAIL ochiq lot qatori ortiqcha maydon sizdirdi: %', res -> 'qatorlar'; end if;
  if exists (select 1 from jsonb_array_elements(public.t2_tn_ochiq_royxat_v1('{}') -> 'lotlar') x, jsonb_object_keys(x) k2 where k2 <> all (array['id', 'raqam', 'nom', 'tur', 'muddat', 'valyuta', 'qator_soni', 'takliflar_soni']))
     then raise exception 'FAIL ochiq royxat ortiqcha maydon sizdirdi'; end if;
  if not exists (select 1 from jsonb_array_elements(public.t2_tn_ochiq_royxat_v1('{}') -> 'lotlar') x where (x ->> 'id')::bigint = rid) then raise exception 'FAIL ochiq royxat'; end if;
  -- Egasi nomi sukut bo'yicha YASHIRIN; lot belgisi bilan ko'rinadi (faqat egasi o'zgartiradi), qayta o'chirilsa yana yashirin.
  if (res -> 'lot') ? 'egasi_nom' then raise exception 'FAIL egasi nomi sukutda ochiq'; end if;
  begin perform public.t2_tn_korsatish_v1(k, af, gen_random_uuid(), jsonb_build_object('rfq_id', rid, 'korsat', true)); raise exception 'FAIL_BEGONA_KORSATISH';
  exception when others then if sqlerrm = 'FAIL_BEGONA_KORSATISH' then raise exception 'FAIL begona foydalanuvchi egasi belgisini o''zgartirdi'; end if; end;
  res := public.t2_tn_korsatish_v1(k, ak, gen_random_uuid(), jsonb_build_object('rfq_id', rid, 'korsat', true));
  if not (res ->> 'ok')::boolean or (public.t2_tn_ochiq_lot_v1(rid) -> 'lot' ->> 'egasi_nom') is distinct from '_TN_K' then raise exception 'FAIL egasini korsatish: %', res; end if;
  if (select (x ->> 'egasi_nom') from jsonb_array_elements(public.t2_tn_ochiq_royxat_v1('{}') -> 'lotlar') x where (x ->> 'id')::bigint = rid) is distinct from '_TN_K' then raise exception 'FAIL royxatda egasi nomi'; end if;
  res := public.t2_tn_korsatish_v1(k, ak, gen_random_uuid(), jsonb_build_object('rfq_id', rid, 'korsat', false));
  if (public.t2_tn_ochiq_lot_v1(rid) -> 'lot') ? 'egasi_nom' then raise exception 'FAIL egasi nomi qayta yashirilmadi'; end if;

  -- 4. Takliflar (4 ta; b4 keyin qaytarib oladi). Narxlar QQS siz birlik narxi.
  res := public.t2_tender_taklif_v2(a1, b1, gen_random_uuid(), rid, jsonb_build_array(jsonb_build_object('rfq_qator_id', q1, 'narx', 100), jsonb_build_object('rfq_qator_id', q2, 'narx', 200), jsonb_build_object('rfq_qator_id', q3, 'narx', 300)), 'b1', null);
  if not (res ->> 'ok')::boolean then raise exception 'FAIL taklif b1: %', res; end if; t1 := (res ->> 'id')::bigint;
  res := public.t2_tender_taklif_v2(a2, b2, gen_random_uuid(), rid, jsonb_build_array(jsonb_build_object('rfq_qator_id', q1, 'narx', 110), jsonb_build_object('rfq_qator_id', q2, 'narx', 210), jsonb_build_object('rfq_qator_id', q3, 'narx', 310)), 'b2', null);
  t2 := (res ->> 'id')::bigint;
  res := public.t2_tender_taklif_v2(a3, b3, gen_random_uuid(), rid, jsonb_build_array(jsonb_build_object('rfq_qator_id', q1, 'narx', 120), jsonb_build_object('rfq_qator_id', q2, 'narx', 240), jsonb_build_object('rfq_qator_id', q3, 'narx', 360)), 'b3', null);
  t3 := (res ->> 'id')::bigint;
  res := public.t2_tender_taklif_v2(a4, b4, gen_random_uuid(), rid, jsonb_build_array(jsonb_build_object('rfq_qator_id', q1, 'narx', 90), jsonb_build_object('rfq_qator_id', q2, 'narx', 190), jsonb_build_object('rfq_qator_id', q3, 'narx', 290)), 'b4', null);
  t4 := (res ->> 'id')::bigint;
  if t1 is null or t2 is null or t3 is null or t4 is null then raise exception 'FAIL takliflar yaratilmadi'; end if;

  -- 5. MUHR (muddatgacha): egasi to'g'ridan-to'g'ri RPC bilan narxni o'qiy olmaydi; faqat soni. Boshqa ishtirokchi faqat o'zinikini.
  res := public.t2_tender_tafsilot_v2(ak, k, rid);
  if jsonb_array_length(res -> 'takliflar') <> 0 or (res ->> 'takliflar_soni')::int <> 4 or (res ->> 'ochilgan')::boolean then raise exception 'FAIL muhr muddatgacha: %', res; end if;
  res := public.t2_tender_tafsilot_v2(a1, b1, rid);
  if jsonb_array_length(res -> 'takliflar') <> 1 then raise exception 'FAIL ishtirokchi boshqa taklifni ko''rdi: %', res; end if;
  if (public.t2_tn_ogohlantirish_v1(k, ak, rid) ->> 'code') is distinct from 'MUHRLANGAN' or (public.t2_tn_bayonnoma_v1(k, ak, rid) ->> 'code') is distinct from 'MUHRLANGAN'
     or (public.t2_tn_aloqa_v1(k, ak, gen_random_uuid(), jsonb_build_object('rfq_id', rid, 'taklif_id', t1)) ->> 'code') is distinct from 'MUHRLANGAN' then raise exception 'FAIL muhrlangan hujjat/signal ochiq'; end if;
  res := public.t2_tender_otish_v1(ak, k, gen_random_uuid(), rid, ver, 'baholash');
  if (res ->> 'code') is distinct from 'MUDDAT_OTMAGAN' then raise exception 'FAIL muddatdan oldin ochildi: %', res; end if;

  -- 6. Taklifni qaytarib olish (muddatgacha) — o'rtachaga kirmaydi; sonlar kamayadi
  res := public.t2_tender_taklif_qaytar_v2(a4, b4, gen_random_uuid(), t4, 1);
  if not (res ->> 'ok')::boolean then raise exception 'FAIL qaytarib olish: %', res; end if;
  res := public.t2_tender_tafsilot_v2(ak, k, rid);
  if (res ->> 'takliflar_soni')::int <> 3 then raise exception 'FAIL qaytarilgan taklif hisobda: %', res; end if;

  -- 7. Muddat o'tdi: kech taklif rad; ochilgunga qadar muhr saqlanadi
  update public.t2_birja_rfq set muddat = now() - interval '1 minute', asl_muddat = now() - interval '2 minutes' where id = rid;
  res := public.t2_tender_taklif_v2(a2, b2, gen_random_uuid(), rid, jsonb_build_array(jsonb_build_object('rfq_qator_id', q1, 'narx', 1), jsonb_build_object('rfq_qator_id', q2, 'narx', 1), jsonb_build_object('rfq_qator_id', q3, 'narx', 1)), 'kech', null);
  if (res ->> 'code') is distinct from 'MUDDAT_OTGAN' then raise exception 'FAIL kech taklif qabul qilindi: %', res; end if;
  res := public.t2_tender_tafsilot_v2(ak, k, rid);
  if jsonb_array_length(res -> 'takliflar') <> 0 then raise exception 'FAIL muhr muddatdan keyin ochilishdan oldin buzildi'; end if;
  if (public.t2_tn_ochiq_lot_v1(rid) -> 'lot' ->> 'muddat_otgan') is distinct from 'true' then raise exception 'FAIL ochiq lot muddat belgisi'; end if;

  -- 8. OCHISH: aniq hodisa; takror chaqiruv yangi hodisa yozmaydi
  select versiya into ver from public.t2_birja_rfq where id = rid;
  res := public.t2_tender_otish_v1(ak, k, '11111111-1111-4111-8111-111111111111', rid, ver, 'baholash');
  if not (res ->> 'ok')::boolean then raise exception 'FAIL ochish: %', res; end if;
  res := public.t2_tender_otish_v1(ak, k, '11111111-1111-4111-8111-111111111111', rid, ver, 'baholash');
  if not coalesce((res ->> 'takror')::boolean, false) then raise exception 'FAIL ochish takror: %', res; end if;
  select count(*) into n from public.t2_tender_jurnal where rfq_id = rid and hodisa = 'holat' and payload ->> 'ga' = 'baholash';
  if n <> 1 then raise exception 'FAIL ochish auditi soni %', n; end if;
  if (select ochilgan_vaqt is null or ochgan_actor_id is distinct from ak from public.t2_birja_rfq where id = rid) then raise exception 'FAIL ochish yozuvi'; end if;

  -- 9. Ochilgach taqqos: 3 ta yaroqli taklif narx bilan; kelishuv signali (b1 va b3 narxlari bir xil nisbatda)
  res := public.t2_tender_tafsilot_v2(ak, k, rid);
  if jsonb_array_length(res -> 'takliflar') <> 3 or ((res -> 'takliflar' -> 0 -> 'qatorlar' -> 0) ->> 'narx')::numeric <> 100 then raise exception 'FAIL taqqos: %', res; end if;
  res := public.t2_tn_ogohlantirish_v1(k, ak, rid);
  if not exists (select 1 from jsonb_array_elements(res -> 'ogohlantirishlar') x where x ->> 'tur' = 'bir_xil_nisbat') then raise exception 'FAIL kelishuv signali: %', res; end if;

  -- 10. G'OLIB (material): aloqa -> mavjud golib_v2 -> aynan bitta buyurtma; o'rtacha narx manbasi bitta (qaytarilgan taklifsiz)
  res := public.t2_tn_aloqa_v1(k, ak, gen_random_uuid(), jsonb_build_object('rfq_id', rid, 'taklif_id', t1));
  if not (res ->> 'ok')::boolean then raise exception 'FAIL aloqa: %', res; end if; al := (res ->> 'aloqa_id')::bigint;
  res := public.t2_tn_aloqa_v1(k, ak, gen_random_uuid(), jsonb_build_object('rfq_id', rid, 'taklif_id', t1));
  if not coalesce((res ->> 'takror')::boolean, false) or (res ->> 'aloqa_id')::bigint <> al then raise exception 'FAIL aloqa takror: %', res; end if;
  select versiya into ver from public.t2_birja_rfq where id = rid;
  res := public.t2_tender_golib_v2(ak, k, gen_random_uuid(), rid, ver, jsonb_build_array(jsonb_build_object('taklif_id', t1)), 'Eng past jami narx va talablarga mos', true, null);
  if not (res ->> 'ok')::boolean then raise exception 'FAIL golib: %', res; end if;
  select count(*) into n from public.t2_buyurtma where rfq_id = rid and kompaniya_id = k; if n <> 1 then raise exception 'FAIL buyurtma soni %', n; end if;
  res := public.t2_tn_narx_manba_v1(k, ak, gen_random_uuid(), jsonb_build_object('rfq_id', rid));
  if not (res ->> 'ok')::boolean or (res ->> 'ogohlantirish') is distinct from 'urtacha' then raise exception 'FAIL narx manba: %', res; end if;
  m1 := (res ->> 'narx_manba_id')::bigint;
  res := public.t2_tn_narx_manba_v1(k, ak, gen_random_uuid(), jsonb_build_object('rfq_id', rid));
  if not coalesce((res ->> 'takror')::boolean, false) then raise exception 'FAIL narx manba takror: %', res; end if;
  select count(*) into n from public.t2_narx_manba where kompaniya_id = k and raqam = 'tender #' || rid::text; if n <> 1 then raise exception 'FAIL manba soni %', n; end if;
  if (select array_agg(narx order by tartib) from public.t2_narx_manba_qator where manba_id = m1) is distinct from array[110.00, 216.67, 323.33]::numeric[] then
    raise exception 'FAIL o''rtacha: %', (select array_agg(narx order by tartib) from public.t2_narx_manba_qator where manba_id = m1); end if;

  -- 11. Bayonnoma: faqat ochilgan; xesh barqaror; har chaqiruv auditda
  res := public.t2_tn_bayonnoma_v1(k, ak, rid);
  if not (res ->> 'ok')::boolean or jsonb_array_length(res -> 'takliflar') < 3 or jsonb_array_length(res -> 'jurnal') < 5 then raise exception 'FAIL bayonnoma: %', left(res::text, 300); end if;
  if (select count(*) from public.t2_tender_jurnal where rfq_id = rid and hodisa = 'bayonnoma') <> 1 then raise exception 'FAIL bayonnoma auditi'; end if;
  begin perform public.t2_tn_bayonnoma_v1(f, ak, rid); raise exception 'FAIL begona bayonnoma';
  exception when sqlstate '42501' then null; end;

  -- 12. ISH lot smeta bo'limidan (faqat hajm) -> topshiriq to'plami
  insert into public.t2_qator (obyekt_id, tur, kompaniya_id, nom, birlik, hajm, narx) values (ob, 'rz', k, '_Bolim', null, null, null) returning id into sec;
  insert into public.t2_qator (obyekt_id, tur, kompaniya_id, nom, birlik, hajm, narx, ota_id) values (ob, 'bl', k, '_Ish 1', 'm3', 10, 987654.32, sec), (ob, 'bl', k, '_Ish 2', 'm2', 5, 876543.21, sec);
  res := public.t2_tn_lot_smetadan_v1(k, ak, gen_random_uuid(), jsonb_build_object('obyekt_id', ob, 'bolim_id', sec, 'tur', 'subpudrat', 'doira', 'ochiq', 'muddat', (now() + interval '3 days')::text, 'nom', '_TN Ish lot'));
  if not (res ->> 'ok')::boolean or (res ->> 'qator_soni')::int <> 2 then raise exception 'FAIL lot smetadan: %', res; end if; rid2 := (res ->> 'id')::bigint;
  if exists (select 1 from public.t2_birja_rfq_qator where rfq_id = rid2 and (miqdor not in (10, 5) or smeta_qator_id is null)) then raise exception 'FAIL lot qatorlari'; end if;
  res := public.t2_tn_lot_smetadan_v1(f, af, gen_random_uuid(), jsonb_build_object('obyekt_id', ob, 'bolim_id', sec, 'tur', 'subpudrat', 'muddat', (now() + interval '3 days')::text));
  if (res ->> 'code') is distinct from 'OBYEKT_BEGONA' then raise exception 'FAIL begona obyektdan lot: %', res; end if;
  select versiya into ver from public.t2_birja_rfq where id = rid2;
  res := public.t2_tender_otish_v1(ak, k, gen_random_uuid(), rid2, ver, 'tasdiqlashda'); ver := (res ->> 'versiya')::int;
  res := public.t2_tender_otish_v1(ak, k, gen_random_uuid(), rid2, ver, 'elon'); if not (res ->> 'ok')::boolean then raise exception 'FAIL ish lot elon: %', res; end if;
  res := public.t2_tn_ochiq_lot_v1(rid2);
  if not (res ->> 'ok')::boolean then raise exception 'FAIL ish lot ochiq: %', res; end if;
  -- STRUKTURAVIY tekshiruv (matn qidirmasdan): aniq kalit to'plamlari; hech bir qator maydoni (miqdor va tartib raqamlaridan tashqari) son emas; smeta narx QIYMATLARI hech qayerda yo'q.
  if exists (select 1 from jsonb_object_keys(res) k2 where k2 <> all (array['ok', 'lot', 'qatorlar'])) then raise exception 'FAIL ish lot yuqori kalit: %', res; end if;
  if exists (select 1 from jsonb_object_keys(res -> 'lot') k2 where k2 <> all (array['id', 'raqam', 'nom', 'tur', 'muddat', 'muddat_otgan', 'izoh', 'tolov_sharti', 'valyuta', 'qqs_foiz', 'baholash_usuli', 'takliflar_soni']))
     then raise exception 'FAIL ish lot kalitlari: %', res -> 'lot'; end if;
  if exists (select 1 from jsonb_array_elements(res -> 'qatorlar') x, jsonb_object_keys(x) k2 where k2 <> all (array['qator_no', 'lot_no', 'lot_nom', 'nom', 'birlik', 'miqdor', 'talab_sana', 'yetkazish_joyi', 'spets']))
     then raise exception 'FAIL ish lot qator kalitlari: %', res -> 'qatorlar'; end if;
  if exists (select 1 from jsonb_array_elements(res -> 'qatorlar') x, jsonb_each(x) e where jsonb_typeof(e.value) = 'number' and e.key not in ('miqdor', 'qator_no', 'lot_no'))
     then raise exception 'FAIL ish lot qatorida kutilmagan son: %', res -> 'qatorlar'; end if;
  if exists (select 1 from jsonb_each(res -> 'lot') e where jsonb_typeof(e.value) = 'number' and e.value in ('987654.32'::jsonb, '876543.21'::jsonb, '18500'::jsonb))
     or exists (select 1 from jsonb_array_elements(res -> 'qatorlar') x, jsonb_each(x) e where e.value in ('987654.32'::jsonb, '876543.21'::jsonb))
     then raise exception 'FAIL ish lot smeta narxi qiymati sizdirildi: %', res; end if;
  select array_agg(id order by qator_no) into qq from public.t2_birja_rfq_qator where rfq_id = rid2;
  res := public.t2_tender_taklif_v2(a1, b1, gen_random_uuid(), rid2, jsonb_build_array(jsonb_build_object('rfq_qator_id', qq[1], 'narx', 1200), jsonb_build_object('rfq_qator_id', qq[2], 'narx', 1300)), 'sub1', null);
  t1 := (res ->> 'id')::bigint;
  res := public.t2_tender_taklif_v2(a2, b2, gen_random_uuid(), rid2, jsonb_build_array(jsonb_build_object('rfq_qator_id', qq[1], 'narx', 1250), jsonb_build_object('rfq_qator_id', qq[2], 'narx', 1350)), 'sub2', null);
  update public.t2_birja_rfq set muddat = now() - interval '1 minute', asl_muddat = now() - interval '2 minutes' where id = rid2;
  select versiya into ver from public.t2_birja_rfq where id = rid2;
  res := public.t2_tender_otish_v1(ak, k, gen_random_uuid(), rid2, ver, 'baholash'); if not (res ->> 'ok')::boolean then raise exception 'FAIL ish lot ochish: %', res; end if;
  res := public.t2_tn_aloqa_v1(k, ak, gen_random_uuid(), jsonb_build_object('rfq_id', rid2, 'taklif_id', t1));
  if not (res ->> 'ok')::boolean then raise exception 'FAIL ish aloqa: %', res; end if;
  select count(*) into n from public.t2_tomon_aloqa where taklif_kompaniya_id = k and qabul_kompaniya_id = b1 and lower(qabul_rol) = 'subpudratchi' and holat = 'faol'; if n <> 1 then raise exception 'FAIL aloqa soni %', n; end if;
  select versiya into ver from public.t2_birja_rfq where id = rid2;
  res := public.t2_tender_golib_v2(ak, k, gen_random_uuid(), rid2, ver, jsonb_build_array(jsonb_build_object('taklif_id', t1)), 'Eng past narx va tajriba talabiga mos', true, null);
  if not (res ->> 'ok')::boolean then raise exception 'FAIL ish golib: %', res; end if;
  res := public.t2_tn_ish_qadam_v1(k, ak, gen_random_uuid(), jsonb_build_object('rfq_id', rid2, 'qadam', 'topshiriq'));
  if not (res ->> 'ok')::boolean then raise exception 'FAIL topshiriq: %', res; end if;
  res := public.t2_tn_ish_qadam_v1(k, ak, gen_random_uuid(), jsonb_build_object('rfq_id', rid2, 'qadam', 'topshiriq'));
  if not (res ->> 'ok')::boolean then raise exception 'FAIL topshiriq takror: %', res; end if;
  select count(*) into n from public.t2_sub_topshiriq where kompaniya_id = k and obyekt_id = ob and holat = 'faol'; if n <> 2 then raise exception 'FAIL topshiriq soni %', n; end if;
  if (select count(*) from public.t2_sub_topshiriq where kompaniya_id = k and obyekt_id = ob and holat = 'faol' and narx in (1200, 1300)) <> 2 then raise exception 'FAIL topshiriq narxlari g''olib narxi emas'; end if;
  res := public.t2_tn_ish_qadam_v1(k, ak, gen_random_uuid(), jsonb_build_object('rfq_id', rid2, 'qadam', 'shartnoma'));
  if not (res ->> 'ok')::boolean or (res -> 'shartnoma' ->> 'turi') <> 'subpudrat' or (res -> 'shartnoma' ->> 'summa_bez_nds')::numeric <> 18500 then raise exception 'FAIL shartnoma havolasi: %', res; end if;
  res := public.t2_tn_narx_manba_v1(k, ak, gen_random_uuid(), jsonb_build_object('rfq_id', rid2));
  if (res ->> 'code') is distinct from 'TUR_NOTOGRI' then raise exception 'FAIL ish lot narx manbasi: %', res; end if;

  -- 13. Faqat-taklif lot: begona kompaniya ko'rmaydi (ochiq ro'yxatda ham yo'q); taklif qilingan ko'radi
  insert into public.t2_tomon_aloqa (taklif_kompaniya_id, qabul_kompaniya_id, taklif_rol, qabul_rol, turi, holat, taklif_actor_id, javob_actor_id, javob_vaqti)
  values (k, b3, 'buyurtmachi', 'yetkazuvchi', 'tender', 'faol', ak, a3, now());
  res := public.t2_tender_saqla_v1(ak, k, gen_random_uuid(), null, null, 'material', 'taklif', array[b3], ob, now() + interval '2 days', jsonb_build_object('sarlavha', '_TN yopiq lot'),
    jsonb_build_array(jsonb_build_object('nom', '_Yopiq', 'birlik', 'dona', 'miqdor', 3)));
  if not (res ->> 'ok')::boolean then raise exception 'FAIL yopiq lot: %', res; end if; wid := (res ->> 'id')::bigint; ver := (res ->> 'versiya')::int;
  res := public.t2_tender_otish_v1(ak, k, gen_random_uuid(), wid, ver, 'tasdiqlashda'); ver := (res ->> 'versiya')::int;
  res := public.t2_tender_otish_v1(ak, k, gen_random_uuid(), wid, ver, 'elon'); if not (res ->> 'ok')::boolean then raise exception 'FAIL yopiq lot elon: %', res; end if;
  res := public.t2_tender_tafsilot_v2(af, f, wid);
  if (res ->> 'code') is distinct from 'TOPILMADI' then raise exception 'FAIL begona kompaniya faqat-taklif lotni ko''rdi: %', res; end if;
  if (public.t2_tn_ochiq_lot_v1(wid) ->> 'code') is distinct from 'LOT_TOPILMADI' then raise exception 'FAIL faqat-taklif lot ochiq o''qildi'; end if;
  if exists (select 1 from jsonb_array_elements(public.t2_tn_ochiq_royxat_v1('{}') -> 'lotlar') x where (x ->> 'id')::bigint = wid) then raise exception 'FAIL faqat-taklif lot ochiq royxatda'; end if;
  res := public.t2_tender_tafsilot_v2(a3, b3, wid);
  if not (res ->> 'ok')::boolean then raise exception 'FAIL taklif qilingan kompaniya lotni ko''rmadi: %', res; end if;

  -- 14. ERTA YOPISH MUHRNI OCHMAYDI: 'takliflar_yopildi' yangi takliflarni to'xtatadi, lekin narxlar ASL muddatgacha muhrlangan; ochish SQL da rad etiladi
  res := public.t2_tender_saqla_v1(ak, k, gen_random_uuid(), null, null, 'material', 'ochiq', '{}'::bigint[], ob, now() + interval '2 days', jsonb_build_object('sarlavha', '_TN erta yopish lot'),
    jsonb_build_array(jsonb_build_object('nom', '_Erta', 'birlik', 'dona', 'miqdor', 4)));
  if not (res ->> 'ok')::boolean then raise exception 'FAIL erta lot: %', res; end if; rid3 := (res ->> 'id')::bigint; ver := (res ->> 'versiya')::int;
  res := public.t2_tender_otish_v1(ak, k, gen_random_uuid(), rid3, ver, 'tasdiqlashda'); ver := (res ->> 'versiya')::int;
  res := public.t2_tender_otish_v1(ak, k, gen_random_uuid(), rid3, ver, 'elon'); if not (res ->> 'ok')::boolean then raise exception 'FAIL erta lot elon: %', res; end if; ver := (res ->> 'versiya')::int;
  select id into tq3 from public.t2_birja_rfq_qator where rfq_id = rid3;
  res := public.t2_tender_taklif_v2(a1, b1, gen_random_uuid(), rid3, jsonb_build_array(jsonb_build_object('rfq_qator_id', tq3, 'narx', 555)), 'erta', null);
  if not (res ->> 'ok')::boolean then raise exception 'FAIL erta lot taklifi: %', res; end if;
  res := public.t2_tender_otish_v1(ak, k, gen_random_uuid(), rid3, ver, 'takliflar_yopildi', 'Sinov: muddatdan oldin yopish');
  if not (res ->> 'ok')::boolean then raise exception 'FAIL erta yopish: %', res; end if; ver := (res ->> 'versiya')::int;
  if not (select asl_muddat > now() + interval '1 day' from public.t2_birja_rfq where id = rid3) then raise exception 'FAIL asl muddat saqlanmadi'; end if;
  res := public.t2_tender_taklif_v2(a2, b2, gen_random_uuid(), rid3, jsonb_build_array(jsonb_build_object('rfq_qator_id', tq3, 'narx', 1)), 'kech', null);
  if coalesce((res ->> 'ok')::boolean, false) then raise exception 'FAIL erta yopilgan tenderga taklif qabul qilindi: %', res; end if;
  begin perform public.t2_tender_otish_v1(ak, k, gen_random_uuid(), rid3, ver, 'baholash'); raise exception 'FAIL_ERTA_OCHILDI';
  exception when others then
    if sqlerrm = 'FAIL_ERTA_OCHILDI' then raise exception 'FAIL erta yopilgan tender asl muddatdan oldin ochildi'; end if;
    if sqlerrm <> 'MUDDAT_OTMAGAN' then raise; end if;
  end;
  res := public.t2_tender_tafsilot_v2(ak, k, rid3);
  if jsonb_array_length(res -> 'takliflar') <> 0 or (res ->> 'ochilgan')::boolean or (res ->> 'takliflar_soni')::int <> 1 then raise exception 'FAIL erta yopishdan keyin muhr: %', res; end if;
  if (public.t2_tn_bayonnoma_v1(k, ak, rid3) ->> 'code') is distinct from 'MUHRLANGAN' then raise exception 'FAIL erta yopilgan lot bayonnomasi ochiq'; end if;
  update public.t2_birja_rfq set muddat = now() - interval '1 minute', asl_muddat = now() - interval '1 minute' where id = rid3;
  select versiya into ver from public.t2_birja_rfq where id = rid3;
  res := public.t2_tender_otish_v1(ak, k, gen_random_uuid(), rid3, ver, 'baholash');
  if not (res ->> 'ok')::boolean then raise exception 'FAIL asl muddatdan keyin ochish: %', res; end if;
  res := public.t2_tender_tafsilot_v2(ak, k, rid3);
  if jsonb_array_length(res -> 'takliflar') <> 1 or (res -> 'takliflar' -> 0 -> 'qatorlar' -> 0 ->> 'narx')::numeric <> 555 then raise exception 'FAIL asl muddatdan keyin taqqos: %', res; end if;
end $acc$;
rollback;
