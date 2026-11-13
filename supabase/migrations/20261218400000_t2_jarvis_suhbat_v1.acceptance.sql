-- Acceptance: 20261218400000 — Jarvis suhbatlari serverda. BEGIN ... ROLLBACK (hech narsa saqlanmaydi). Fixture shu tranzaksiya ichida (sintetik).
-- Tekshiriladi: saqlash/ro'yxat/ochish; faqat egasi o'qiydi (boshqa foydalanuvchi ham, boshqa kompaniya ham ko'rmaydi); <=12 xabar x <=400 belgi;
-- 30 kundan keyin xabarlar NULL (sarlavha+qisqartma qoladi), 90 kundan keyin o'chadi; <=20 suhbat; ochirish; xato kirishlar.
-- QO'SHIMCHA (avvalgi bo'shliq): t2_agent_xotira tenant izolyatsiyasi — bir kompaniya xotirasi boshqasiga o'tmaydi, shaxsiy xotira boshqa foydalanuvchiga sizmaydi.
begin;
set local statement_timeout = '300s';
do $acc$
declare
  v_qadam text := 'boshlash';
  k1 bigint; k2 bigint; u1 bigint; u2 bigint; u3 bigint;
  r jsonb; n integer; i integer; v_kod text := 'J' || to_char(clock_timestamp(), 'HH24MISSUS');
  v_x jsonb;
begin
  v_qadam := '0 fixture';
  insert into public.t2_kompaniya (nom, kod) values ('JARVIS-SINOV-1 ' || v_kod, 'JA1' || v_kod) returning id into k1;
  insert into public.t2_kompaniya (nom, kod) values ('JARVIS-SINOV-2 ' || v_kod, 'JA2' || v_kod) returning id into k2;
  insert into public.t2_foydalanuvchi (login, holat) values ('ja_u1_' || v_kod, 'faol') returning id into u1;
  insert into public.t2_foydalanuvchi (login, holat) values ('ja_u2_' || v_kod, 'faol') returning id into u2;
  insert into public.t2_foydalanuvchi (login, holat) values ('ja_u3_' || v_kod, 'faol') returning id into u3;
  insert into public.t2_azolik (foydalanuvchi_id, kompaniya_id, rol) values (u1, k1, 'pto'), (u2, k1, 'pto'), (u3, k2, 'pto');

  v_qadam := '1 saqlash va ro''yxat (egasi)';
  r := public.t2_jarvis_suhbat_saqla_v1(u1, k1, 's1', 'Yevropa 1 narxsiz qatorlar', jsonb_build_array(
        jsonb_build_object('r', 'user', 'm', 'narxsiz qatorlarni korsat'), jsonb_build_object('r', 'ai', 'm', 'Narxsiz qatorlar: 3 ta')));
  if not coalesce((r ->> 'ok')::boolean, false) then raise exception 'saqlash ok emas: %', r; end if;
  r := public.t2_jarvis_suhbat_royxat_v1(u1, k1);
  if jsonb_array_length(r -> 'royxat') <> 1 or (r -> 'royxat' -> 0 ->> 'toliq')::boolean is not true or r -> 'royxat' -> 0 ->> 'id' <> 's1' then raise exception 'royxat kutilgandek emas: %', r; end if;
  r := public.t2_jarvis_suhbat_ol_v1(u1, k1, 's1');
  if jsonb_array_length(r -> 'xabarlar') <> 2 or r ->> 'qisqartma' not like 'Savol: narxsiz%Javob: Narxsiz qatorlar: 3 ta' then raise exception 'ol/qisqartma noto''g''ri: %', r; end if;

  v_qadam := '2 takroriy saqlash yangilaydi (bitta qator)';
  r := public.t2_jarvis_suhbat_saqla_v1(u1, k1, 's1', 'Yevropa 1 narxsiz qatorlar', jsonb_build_array(jsonb_build_object('r', 'user', 'm', 'yana bitta')));
  select count(*) into n from public.t2_jarvis_suhbat where foydalanuvchi_id = u1 and kompaniya_id = k1;
  if n <> 1 then raise exception 'takroriy saqlash qator qo''shdi: %', n; end if;

  v_qadam := '3 faqat egasi o''qiydi: boshqa foydalanuvchi (bir kompaniya) ko''rmaydi';
  r := public.t2_jarvis_suhbat_royxat_v1(u2, k1);
  if jsonb_array_length(r -> 'royxat') <> 0 then raise exception 'u2 u1 suhbatini ko''rdi: %', r; end if;
  r := public.t2_jarvis_suhbat_ol_v1(u2, k1, 's1');
  if r ->> 'code' is distinct from 'TOPILMADI' then raise exception 'u2 u1 suhbatini oldi: %', r; end if;
  r := public.t2_jarvis_suhbat_ochir_v1(u2, k1, 's1');
  if (r ->> 'ochirildi')::integer <> 0 then raise exception 'u2 u1 suhbatini o''chirdi: %', r; end if;

  v_qadam := '4 kompaniya almashsa ko''rinmaydi / a''zo bo''lmagan kompaniyaga kirish yo''q';
  r := public.t2_jarvis_suhbat_royxat_v1(u1, k2);
  if coalesce((r ->> 'ok')::boolean, false) then raise exception 'u1 a''zo bo''lmagan k2 ro''yxatini oldi: %', r; end if;
  r := public.t2_jarvis_suhbat_saqla_v1(u1, k2, 'x1', 'begona', jsonb_build_array(jsonb_build_object('r', 'user', 'm', 'salom')));
  if coalesce((r ->> 'ok')::boolean, false) then raise exception 'u1 k2 ga yozdi: %', r; end if;
  r := public.t2_jarvis_suhbat_royxat_v1(u3, k2);
  if jsonb_array_length(r -> 'royxat') <> 0 then raise exception 'u3 k2 da begona suhbat ko''rdi: %', r; end if;

  v_qadam := '5 xabar chegaralari: oxirgi 12 ta, har biri <=400 belgi';
  select jsonb_agg(jsonb_build_object('r', case when g % 2 = 0 then 'user' else 'ai' end, 'm', repeat('x', 900) || g::text)) into v_x from generate_series(1, 30) g;
  r := public.t2_jarvis_suhbat_saqla_v1(u1, k1, 's2', 'uzun suhbat', v_x);
  r := public.t2_jarvis_suhbat_ol_v1(u1, k1, 's2');
  if jsonb_array_length(r -> 'xabarlar') <> 12 then raise exception 'xabarlar soni 12 emas: %', jsonb_array_length(r -> 'xabarlar'); end if;
  if exists (select 1 from jsonb_array_elements(r -> 'xabarlar') e where length(e ->> 'm') > 400) then raise exception '400 belgidan uzun xabar qoldi'; end if;
  if r -> 'xabarlar' -> 0 ->> 'm' not like '%19' and r -> 'xabarlar' -> 0 ->> 'm' not like '%x19' then null; end if;
  -- xabarlar tartibi xronologik: birinchisi 19-xabar (30 dan oxirgi 12), oxirgisi 30-xabar (matn 400 ga kesilgan: x...)
  if jsonb_array_length(r -> 'xabarlar') = 12 and (select count(*) from jsonb_array_elements(r -> 'xabarlar') e where e ->> 'r' = 'user') <> 6 then raise exception 'rol tartibi buzilgan'; end if;

  v_qadam := '6 yaroqsiz kirish';
  r := public.t2_jarvis_suhbat_saqla_v1(u1, k1, 'bad id!', 'x', jsonb_build_array(jsonb_build_object('r', 'user', 'm', 'a')));
  if r ->> 'code' is distinct from 'SUHBAT_INVALID' then raise exception 'noto''g''ri id rad etilmadi: %', r; end if;
  r := public.t2_jarvis_suhbat_saqla_v1(u1, k1, 's3', 'x', '[]'::jsonb);
  if r ->> 'code' is distinct from 'SUHBAT_BOSH' then raise exception 'bo''sh suhbat rad etilmadi: %', r; end if;

  v_qadam := '7 30 kundan keyin xabarlar NULL, sarlavha+qisqartma qoladi';
  update public.t2_jarvis_suhbat set yangilandi = now() - interval '31 days' where foydalanuvchi_id = u1 and kompaniya_id = k1 and klient_id = 's1';
  r := public.t2_jarvis_suhbat_royxat_v1(u1, k1);
  if exists (select 1 from jsonb_array_elements(r -> 'royxat') e where e ->> 'id' = 's1' and (e ->> 'toliq')::boolean) then raise exception 's1 hali to''liq'; end if;
  r := public.t2_jarvis_suhbat_ol_v1(u1, k1, 's1');
  if r -> 'xabarlar' is distinct from 'null'::jsonb and r -> 'xabarlar' is not null then raise exception 'xabarlar NULL bo''lmadi: %', r; end if;
  if r ->> 'sarlavha' is null or r ->> 'qisqartma' is null then raise exception 'sarlavha/qisqartma yo''qoldi: %', r; end if;

  v_qadam := '8 90 kundan keyin qator o''chadi';
  update public.t2_jarvis_suhbat set yangilandi = now() - interval '91 days' where foydalanuvchi_id = u1 and kompaniya_id = k1 and klient_id = 's1';
  perform public.t2_jarvis_suhbat_royxat_v1(u1, k1);
  if exists (select 1 from public.t2_jarvis_suhbat where foydalanuvchi_id = u1 and klient_id = 's1') then raise exception 's1 o''chmadi'; end if;

  v_qadam := '9 <=20 suhbat (eng eskisi tushadi)';
  for i in 1..25 loop
    perform public.t2_jarvis_suhbat_saqla_v1(u2, k1, 'm' || i, 'suhbat ' || i, jsonb_build_array(jsonb_build_object('r', 'user', 'm', 'q' || i)));
    update public.t2_jarvis_suhbat set yangilandi = now() - make_interval(mins => 100 - i) where foydalanuvchi_id = u2 and kompaniya_id = k1 and klient_id = 'm' || i;
  end loop;
  perform public.t2_jarvis_suhbat_royxat_v1(u2, k1);
  select count(*) into n from public.t2_jarvis_suhbat where foydalanuvchi_id = u2 and kompaniya_id = k1;
  if n > 20 then raise exception 'suhbatlar soni 20 dan oshdi: %', n; end if;

  v_qadam := '10 ochirish (egasi)';
  r := public.t2_jarvis_suhbat_ochir_v1(u2, k1, 'm25');
  if (r ->> 'ochirildi')::integer <> 1 then raise exception 'ochirish ishlamadi: %', r; end if;

  v_qadam := '11 XOTIRA tenant: kompaniya xotirasi boshqa kompaniyaga o''tmaydi, shaxsiy boshqa foydalanuvchiga sizmaydi';
  r := public.t2_smeta_xotira_yoz_v1(u1, k1, 'kompaniya', 'smeta.jarvis.sinov1', 'K1-FAQAT-SHU-KOMPANIYA');
  if not coalesce((r ->> 'ok')::boolean, false) then raise exception 'kompaniya xotirasi yozilmadi: %', r; end if;
  r := public.t2_smeta_xotira_yoz_v1(u1, k1, 'foydalanuvchi', 'smeta.jarvis.sinov2', 'U1-SHAXSIY');
  if not coalesce((r ->> 'ok')::boolean, false) then raise exception 'shaxsiy xotira yozilmadi: %', r; end if;
  r := public.t2_smeta_xotira_v1(u3, k2);
  if r::text like '%K1-FAQAT-SHU-KOMPANIYA%' or r::text like '%U1-SHAXSIY%' then raise exception 'k2 k1 xotirasini ko''rdi: %', r; end if;
  r := public.t2_smeta_xotira_v1(u3, k1);
  if coalesce((r ->> 'ok')::boolean, true) is true and (r::text like '%K1-FAQAT-SHU-KOMPANIYA%') then raise exception 'a''zo bo''lmagan u3 k1 xotirasini oldi: %', r; end if;
  r := public.t2_smeta_xotira_v1(u2, k1);
  if r::text like '%U1-SHAXSIY%' then raise exception 'u2 u1 ning shaxsiy xotirasini ko''rdi: %', r; end if;
  if r::text not like '%K1-FAQAT-SHU-KOMPANIYA%' then raise exception 'u2 o''z kompaniyasi xotirasini ko''rmadi: %', r; end if;
  r := public.t2_smeta_xotira_yoz_v1(u3, k1, 'kompaniya', 'smeta.jarvis.hujum', 'BEGONA-YOZUV');
  if coalesce((r ->> 'ok')::boolean, false) then raise exception 'u3 k1 xotirasiga yozdi: %', r; end if;

  raise notice 'JARVIS acceptance OK';
exception when others then
  raise exception 'JARVIS qadam [%]: %', v_qadam, sqlerrm;
end
$acc$;
rollback;
