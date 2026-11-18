-- T2-SINOV-BOSHLASH-V1 (2026-11-17, egasi qarori): o'zi ro'yxatdan o'tgan YANGI foydalanuvchi 1000 token bilan tizimni sinab ko'ra oladi.
--
-- Tarix (qaror zanjiri): 20261111460000 (egasi 2026-10-26 «faqat so'rov orqali») — ro'yxatda kompaniya/tarif/demo berilmadi, begona odam
-- «kuzatuvchi» bo'lib qoldi; 20261217210000 (2026-11-13) — bitta qadamda O'Z kompaniyasini ochish (t2_kompaniya_ozi_och_v1) qaytdi, lekin
-- demo obyekt va «sinab ko'rish» yo'li yo'q, bonus 500. Endi: nom/STIR so'ramasdan BIR TUGMA bilan shaxsiy sinov ish joyi + 1000 token.
--
-- Nima qiladi:
--  1) t2_sinov_boshlash_v1   — shaxsiy «Sinov» ish joyi (turi=shaxsiy, o'zi boss) + bepul obuna + 1000 token (t2_token_harakat, tur=bonus,
--                              amal/izoh='sinov_boshlangich', operation_id = md5('sinov_boshlangich:'||foydalanuvchi) → har foydalanuvchiga FAQAT BIR MARTA).
--  2) t2_sinov_demo_v1       — ixtiyoriy, FAQAT bosilganda: demo namuna smeta (≈13 qator) foydalanuvchining O'Z kompaniyasiga nusxalanadi (tarqatilmaydi:
--                              kompaniyalararo ulashilgan obyekt YO'Q → ma'lumot izolyatsiyasi buzilmaydi; DB hajmi: foydalanuvchiga ≈13 qator, faqat so'rasa).
--  3) t2_sinov_holat_v1      — faqat o'qish: balans, sinov kompaniyasi, demo obyekt (qo'llanma ekrani uchun).
--  4) t2_kompaniya_ozi_och_v1 — sinov ish joyi bor foydalanuvchi uchun YANGI kompaniya ochmaydi, sinov ish joyini HAQIQIYGA aylantiradi (nom/STIR),
--                              qo'shimcha bonus bermaydi (bonus farm yo'q); sinovsiz yo'l o'zgarmadi.
--  5) t2_token_sozlama.royxat_bonus_token = 1000 (sinovsiz t2_kompaniya_ozi_och_v1 yo'li uchun ham).
-- Himoyalar SAQLANADI: ro'yxatdagi IP-xesh limiti (sutkasiga 5) + bu yerda YANGI: bitta foydalanuvchi — bitta sinov; a'zoligi bor hisobga berilmaydi
-- (taklif orqali kelganlar bonus ololmaydi); sutkasiga umumiy chegara 300 sinov / 200 demo nusxa (DB hajmi 500 MB chegarasi yaqin); IP-xesh bo'yicha
-- sutkasiga 5 ta sinov; audit; operation_id idempotent. Superadmin huquqi BERILMAYDI. Faqat service_role. BEGIN/COMMIT yo'q.
-- Eslatma: ro'yxat tanalari (email kod / Google / Telegram) O'ZGARMAYDI — sinov har kanal uchun bir xil, birinchi kirishdagi tugma orqali (lazy).
set local statement_timeout = '300s';

update public.t2_token_sozlama set royxat_bonus_token = 1000, yangilandi = now() where id = 1;

-- ═══ Demo namuna smeta (bitta, tizim kompaniyasida; a'zosiz — hech kim ko'rmaydi, faqat nusxa manbasi) ═══
do $seed$
declare v_manba bigint; v_k bigint; v_o bigint; v_r0 bigint; v_r1 bigint; v_b bigint; v_i int := 0;
begin
  select obyekt_id into v_manba from public.t2_demo_manba where id = 1;
  if v_manba is not null then return; end if;  -- egasi o'z demo manbasini belgilagan — tegilmaydi
  insert into public.t2_kompaniya (nom, kod, faol) values ('QURAI NAMUNA (tizim)', 'QURAI-NAMUNA', false) returning id into v_k;
  insert into public.t2_obyekt (nom, kompaniya_id, izoh) values ('Namuna obyekt (kichik smeta)', v_k, 'Sinash uchun uydirma namuna ma''lumot') returning id into v_o;
  insert into public.t2_qator (obyekt_id, kompaniya_id, daraja, tartib, tur, kod, nom, birlik) values (v_o, v_k, 0, 1, 'rz', 'NAMUNA', 'НАМУНА ОБЪЕКТ — СМЕТА ДЛЯ ОЗНАКОМЛЕНИЯ', null) returning id into v_r0;
  -- (bo'lim, ish nomi, birlik, hajm, [(kat, resurs, birlik, miqdor, narx)])
  declare
    ish jsonb := '[
      {"rz":"ЗЕМЛЯНЫЕ РАБОТЫ","bl":"Разработка грунта в котловане","b":"м3","h":100,"rs":[["ЧЕЛ","Затраты труда рабочих","чел-ч",40,10000],["МАШ","Экскаватор","маш-ч",8,150000]]},
      {"rz":"БЕТОННЫЕ РАБОТЫ","bl":"Устройство бетонной подготовки","b":"м3","h":20,"rs":[["ЧЕЛ","Затраты труда рабочих","чел-ч",30,10000],["МАТ","Бетон класса B7.5","м3",20.4,600000]]},
      {"rz":"КРОВЕЛЬНЫЕ РАБОТЫ","bl":"Устройство кровли из профнастила","b":"м2","h":50,"rs":[["ЧЕЛ","Затраты труда рабочих","чел-ч",25,10000],["МАТ","Профнастил","м2",55,70000]]}
    ]'::jsonb;
    e jsonb; r jsonb;
  begin
    for e in select * from jsonb_array_elements(ish) loop
      v_i := v_i + 1;
      insert into public.t2_qator (obyekt_id, kompaniya_id, ota_id, daraja, tartib, tur, kod, nom, birlik)
      values (v_o, v_k, v_r0, 1, v_i, 'rz', 'Р' || v_i, e->>'rz', null) returning id into v_r1;
      insert into public.t2_qator (obyekt_id, kompaniya_id, ota_id, daraja, tartib, tur, kod, nom, birlik, hajm)
      values (v_o, v_k, v_r1, 2, 1, 'bl', 'Б' || v_i, e->>'bl', e->>'b', (e->>'h')::numeric) returning id into v_b;
      for r in select * from jsonb_array_elements(e->'rs') loop
        insert into public.t2_qator (obyekt_id, kompaniya_id, ota_id, daraja, tartib, tur, kod, nom, birlik, hajm, narx, kat, summa)
        values (v_o, v_k, v_b, 3, 1, 'rs', 'R' || v_i, r->>1, r->>2, (r->>3)::numeric, (r->>4)::numeric, r->>0, (r->>3)::numeric * (r->>4)::numeric);
      end loop;
      update public.t2_qator set summa = (select sum(summa) from public.t2_qator where ota_id = v_b) where id = v_b;
      update public.t2_qator set summa = (select sum(summa) from public.t2_qator where ota_id = v_r1) where id = v_r1;
    end loop;
    update public.t2_qator set summa = (select sum(summa) from public.t2_qator where ota_id = v_r0) where id = v_r0;
  end;
  update public.t2_demo_manba set obyekt_id = v_o, yangilandi = now() where id = 1;
end $seed$;

-- ═══ 1. Sinovni boshlash ═══
create or replace function public.t2_sinov_boshlash_v1(p_actor_id bigint, p_operation_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $f$
declare v_prev public.t2_onboarding_command_log%rowtype; v_ism text; v_k jsonb; v_kid bigint; v_res jsonb; v_bonus numeric; v_ip text; v_old jsonb;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select * into v_prev from public.t2_onboarding_command_log where operation_id = p_operation_id;
  if found then
    if v_prev.actor_id <> p_actor_id or v_prev.command <> 'sinov_boshlash' then return jsonb_build_object('ok', false, 'code', 'OPERATION_CONFLICT'); end if;
    return v_prev.natija || '{"takror":true}'::jsonb;
  end if;
  if p_actor_id is null or p_actor_id <= 0 then return jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED'); end if;
  select ism into v_ism from public.t2_foydalanuvchi where id = p_actor_id and holat = 'faol';
  if not found then return jsonb_build_object('ok', false, 'code', 'ACTOR_NOT_FOUND'); end if;
  perform pg_advisory_xact_lock(hashtextextended('t2_sinov_boshlash:' || p_actor_id, 0));
  -- Bir foydalanuvchi — bir sinov (boshqa operation_id bilan qayta chaqirilsa ham: oldingi natija, bonus qayta berilmaydi).
  select natija into v_old from public.t2_onboarding_command_log where actor_id = p_actor_id and command = 'sinov_boshlash' order by created_at limit 1;
  if v_old is not null then return v_old || '{"takror":true}'::jsonb; end if;
  if exists (select 1 from public.t2_azolik where foydalanuvchi_id = p_actor_id and holat = 'faol')
     or exists (select 1 from public.t2_onboarding_command_log where actor_id = p_actor_id and command = 'kompaniya_ozi_och') then
    return jsonb_build_object('ok', false, 'code', 'SINOV_KERAKMAS', 'xato', 'Sizda allaqachon ish joyi bor.');
  end if;
  -- Suiiste'mol chegarasi: umumiy sutkalik (DB hajmi) va IP-xesh bo'yicha (ro'yxat jurnalidagi belgi).
  perform pg_advisory_xact_lock(hashtextextended('t2_sinov_limit', 0));
  if (select count(*) from public.t2_onboarding_command_log where command = 'sinov_boshlash' and created_at > now() - interval '24 hours') >= 300 then
    return jsonb_build_object('ok', false, 'code', 'LIMIT', 'xato', 'Bugungi sinov joylari tugadi. Ertaga urinib ko''ring yoki kompaniya so''rovini yuboring.');
  end if;
  select ip_belgi into v_ip from public.t2_ozi_royxat_log where foydalanuvchi_id = p_actor_id and ip_belgi is not null order by id limit 1;
  if v_ip is not null and (select count(*) from public.t2_onboarding_command_log c join public.t2_ozi_royxat_log r on r.foydalanuvchi_id = c.actor_id
        where c.command = 'sinov_boshlash' and c.created_at > now() - interval '24 hours' and r.ip_belgi = v_ip) >= 5 then
    return jsonb_build_object('ok', false, 'code', 'LIMIT', 'xato', 'Bu qurilmadan bugun sinov limiti tugadi. Ertaga urinib ko''ring.');
  end if;

  v_k := public._t2_kompaniya_yarat_asosiy(p_actor_id, 'Sinov — ' || coalesce(nullif(btrim(left(v_ism, 80)), ''), 'foydalanuvchi'), null, null);
  if coalesce((v_k->>'ok')::boolean, false) is not true then return v_k; end if;
  v_kid := (v_k->>'kompaniya_id')::bigint;
  update public.t2_kompaniya set turi = 'shaxsiy' where id = v_kid;
  insert into public.t2_obuna (kompaniya_id, tarif_kod, boshlandi, tugaydi, kim) values (v_kid, 'free', current_date, (current_date + interval '1 month')::date, 'sinov');
  select coalesce(nullif(royxat_bonus_token, 0), 1000) into v_bonus from public.t2_token_sozlama where id = 1;
  v_bonus := coalesce(v_bonus, 1000);
  insert into public.t2_token_harakat (kompaniya_id, foydalanuvchi_id, miqdor, tur, amal, izoh, meta, operation_id)
  values (v_kid, p_actor_id, v_bonus, 'bonus', 'sinov_boshlangich', 'sinov_boshlangich', jsonb_build_object('sabab', 'sinov_boshlangich'),
          md5('sinov_boshlangich:' || p_actor_id)::uuid)
  on conflict (operation_id) do nothing;
  perform public.t2_audit_yoz(v_kid, 'sinov_boshlash', 'onboarding', null, format('kompaniya=%s bonus=%s (bir martalik, sinov_boshlangich)', v_kid, v_bonus), 'actor:' || p_actor_id, v_ip);
  v_res := jsonb_build_object('ok', true, 'kompaniya_id', v_kid, 'kod', v_k->>'kod', 'rol', 'boss', 'bonus_token', v_bonus, 'balans', public.t2_token_balans(v_kid));
  insert into public.t2_onboarding_command_log (operation_id, actor_id, command, natija) values (p_operation_id, p_actor_id, 'sinov_boshlash', v_res);
  return v_res;
end $f$;
revoke all on function public.t2_sinov_boshlash_v1(bigint, uuid) from public, anon, authenticated;
grant execute on function public.t2_sinov_boshlash_v1(bigint, uuid) to service_role;

-- ═══ 2. Demo obyektni o'z sinov ish joyiga nusxalash (faqat so'ralganda, bir marta) ═══
create or replace function public.t2_sinov_demo_v1(p_actor_id bigint, p_operation_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $f$
declare v_prev public.t2_onboarding_command_log%rowtype; v_kid bigint; v_manba bigint; v_demo bigint; v_res jsonb; v_old jsonb;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select * into v_prev from public.t2_onboarding_command_log where operation_id = p_operation_id;
  if found then
    if v_prev.actor_id <> p_actor_id or v_prev.command <> 'sinov_demo' then return jsonb_build_object('ok', false, 'code', 'OPERATION_CONFLICT'); end if;
    return v_prev.natija || '{"takror":true}'::jsonb;
  end if;
  if p_actor_id is null or p_actor_id <= 0 then return jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED'); end if;
  perform pg_advisory_xact_lock(hashtextextended('t2_sinov_demo:' || p_actor_id, 0));
  select natija into v_old from public.t2_onboarding_command_log where actor_id = p_actor_id and command = 'sinov_demo' order by created_at limit 1;
  if v_old is not null then return v_old || '{"takror":true}'::jsonb; end if;
  -- Faqat o'zining sinov ish joyi (boss a'zoligi shart) — boshqa kompaniyaga nusxa YOZILMAYDI.
  select (natija->>'kompaniya_id')::bigint into v_kid from public.t2_onboarding_command_log where actor_id = p_actor_id and command = 'sinov_boshlash' order by created_at limit 1;
  if v_kid is null or not exists (select 1 from public.t2_azolik where foydalanuvchi_id = p_actor_id and kompaniya_id = v_kid and holat = 'faol' and rol = 'boss') then
    return jsonb_build_object('ok', false, 'code', 'SINOV_YOQ', 'xato', 'Avval sinovni boshlang.');
  end if;
  select obyekt_id into v_manba from public.t2_demo_manba where id = 1;
  if v_manba is null then return jsonb_build_object('ok', false, 'code', 'DEMO_YOQ', 'xato', 'Namuna obyekt hozircha yo''q.'); end if;
  perform pg_advisory_xact_lock(hashtextextended('t2_sinov_limit', 0));
  if (select count(*) from public.t2_onboarding_command_log where command = 'sinov_demo' and created_at > now() - interval '24 hours') >= 200 then
    return jsonb_build_object('ok', false, 'code', 'LIMIT', 'xato', 'Bugungi namuna nusxalari tugadi. Ertaga urinib ko''ring.');
  end if;
  v_demo := public._t2_demo_nusxa(v_kid, v_manba);
  if v_demo is null then return jsonb_build_object('ok', false, 'code', 'DEMO_YOQ', 'xato', 'Namuna obyekt hozircha yo''q.'); end if;
  perform public.t2_audit_yoz(v_kid, 'sinov_demo', 'obyekt', v_demo, format('demo nusxa obyekt=%s', v_demo), 'actor:' || p_actor_id, null);
  v_res := jsonb_build_object('ok', true, 'kompaniya_id', v_kid, 'demo_obyekt_id', v_demo);
  insert into public.t2_onboarding_command_log (operation_id, actor_id, command, natija) values (p_operation_id, p_actor_id, 'sinov_demo', v_res);
  return v_res;
end $f$;
revoke all on function public.t2_sinov_demo_v1(bigint, uuid) from public, anon, authenticated;
grant execute on function public.t2_sinov_demo_v1(bigint, uuid) to service_role;

-- ═══ 3. Holat (faqat o'qish) ═══
create or replace function public.t2_sinov_holat_v1(p_actor_id bigint) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $f$
declare v_kid bigint; v_demo bigint; v_haqiqiy boolean; v_bor boolean;
begin
  if p_actor_id is null or p_actor_id <= 0 then return jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED'); end if;
  select (natija->>'kompaniya_id')::bigint into v_kid from public.t2_onboarding_command_log where actor_id = p_actor_id and command = 'sinov_boshlash' order by created_at limit 1;
  select (natija->>'demo_obyekt_id')::bigint into v_demo from public.t2_onboarding_command_log where actor_id = p_actor_id and command = 'sinov_demo' order by created_at limit 1;
  v_haqiqiy := exists (select 1 from public.t2_onboarding_command_log where actor_id = p_actor_id and command = 'kompaniya_ozi_och');
  v_bor := exists (select 1 from public.t2_azolik where foydalanuvchi_id = p_actor_id and holat = 'faol');
  return jsonb_build_object('ok', true,
    'boshlangan', v_kid is not null,
    'kompaniya_id', v_kid,
    'haqiqiy', v_haqiqiy,
    'boshlash_mumkin', v_kid is null and not v_bor and not v_haqiqiy,
    'demo_obyekt_id', v_demo,
    'demo_mavjud', exists (select 1 from public.t2_demo_manba where id = 1 and obyekt_id is not null),
    'balans', case when v_kid is null then null else public.t2_token_balans(v_kid) end);
end $f$;
revoke all on function public.t2_sinov_holat_v1(bigint) from public, anon, authenticated;
grant execute on function public.t2_sinov_holat_v1(bigint) to service_role;

-- ═══ 4. Haqiqiy kompaniya: sinov ish joyi bor bo'lsa — uni HAQIQIYGA aylantirish (yangisi ochilmaydi, bonus qayta berilmaydi) ═══
create or replace function public.t2_kompaniya_ozi_och_v1(p_actor_id bigint, p_nom text, p_inn text, p_telefon text, p_operation_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $f$
declare v_prev public.t2_onboarding_command_log%rowtype; v_nom text := btrim(coalesce(p_nom, '')); v_inn text := nullif(btrim(coalesce(p_inn, '')), '');
  v_tel text := nullif(btrim(left(coalesce(p_telefon, ''), 40)), ''); v_k jsonb; v_kid bigint; v_res jsonb; v_sinov bigint;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select * into v_prev from public.t2_onboarding_command_log where operation_id = p_operation_id;
  if found then
    if v_prev.actor_id <> p_actor_id or v_prev.command <> 'kompaniya_ozi_och' then return jsonb_build_object('ok', false, 'code', 'OPERATION_CONFLICT'); end if;
    return v_prev.natija || '{"takror":true}'::jsonb;
  end if;
  if p_actor_id is null or p_actor_id <= 0 then return jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED'); end if;
  if not exists (select 1 from public.t2_foydalanuvchi where id = p_actor_id and holat = 'faol') then return jsonb_build_object('ok', false, 'code', 'ACTOR_NOT_FOUND'); end if;
  perform pg_advisory_xact_lock(hashtextextended('t2_kompaniya_ozi_och:' || p_actor_id, 0));
  if exists (select 1 from public.t2_onboarding_command_log where actor_id = p_actor_id and command = 'kompaniya_ozi_och') then
    return jsonb_build_object('ok', false, 'code', 'OZI_OCHILGAN', 'xato', 'Siz allaqachon o''zingiz kompaniya ochgansiz. Qo''shimcha kompaniya — so''rov orqali (STIR bilan).');
  end if;
  if length(v_nom) < 2 or length(v_nom) > 200 then return jsonb_build_object('ok', false, 'code', 'COMPANY_NAME_REQUIRED'); end if;
  if v_inn is not null and v_inn !~ '^[0-9]{9}$' then return jsonb_build_object('ok', false, 'code', 'INN_INVALID', 'xato', 'STIR 9 ta raqam'); end if;
  if v_inn is not null then
    perform pg_advisory_xact_lock(hashtextextended('t2_kompaniya_inn:' || v_inn, 0));
    if exists (select 1 from public.t2_kompaniya where inn = v_inn)
       or exists (select 1 from public.t2_kompaniya_royxat where inn = v_inn and holat = 'kutilmoqda') then
      return jsonb_build_object('ok', false, 'code', 'INN_BAND', 'xato', 'Bu kompaniya tizimda mavjud. Uning egasidan taklif so''rang.');
    end if;
  end if;
  -- Sinov ish joyi bor (va hali o'zi boss) — YANGI kompaniya ochilmaydi: sinov kompaniyasi haqiqiyga aylanadi (tokenlar, demo saqlanadi).
  select (natija->>'kompaniya_id')::bigint into v_sinov from public.t2_onboarding_command_log where actor_id = p_actor_id and command = 'sinov_boshlash' order by created_at limit 1;
  if v_sinov is not null and exists (select 1 from public.t2_azolik where foydalanuvchi_id = p_actor_id and kompaniya_id = v_sinov and holat = 'faol' and rol = 'boss') then
    update public.t2_kompaniya set nom = v_nom, inn = v_inn, telefon = coalesce(v_tel, telefon), kod = public.t2_kompaniya_kod_yasa(v_nom, v_sinov) where id = v_sinov;
    perform public.t2_audit_yoz(v_sinov, 'kompaniya_ozi_och', 'onboarding', null, format('kompaniya=%s sinovdan haqiqiyga (bonus qayta berilmadi)', v_sinov), 'actor:' || p_actor_id, null);
    v_res := jsonb_build_object('ok', true, 'kompaniya_id', v_sinov, 'kod', (select kod from public.t2_kompaniya where id = v_sinov), 'rol', 'boss', 'sinovdan', true);
    insert into public.t2_onboarding_command_log (operation_id, actor_id, command, natija) values (p_operation_id, p_actor_id, 'kompaniya_ozi_och', v_res);
    return v_res;
  end if;
  v_k := public._t2_kompaniya_yarat_asosiy(p_actor_id, v_nom, v_inn, v_tel);
  if coalesce((v_k->>'ok')::boolean, false) is not true then return v_k; end if;
  v_kid := (v_k->>'kompaniya_id')::bigint;
  insert into public.t2_obuna (kompaniya_id, tarif_kod, boshlandi, tugaydi, kim) values (v_kid, 'free', current_date, (current_date + interval '1 month')::date, 'ozi_och');
  perform public._t2_sinov_bonus(v_kid, p_actor_id);
  perform public.t2_audit_yoz(v_kid, 'kompaniya_ozi_och', 'onboarding', null, format('kompaniya=%s boss=azolik:%s (tasdiqsiz, 1-kompaniya)', v_kid, v_k->>'azolik_id'), 'actor:' || p_actor_id, null);
  v_res := jsonb_build_object('ok', true, 'kompaniya_id', v_kid, 'kod', v_k->>'kod', 'rol', 'boss', 'azolik_id', (v_k->>'azolik_id')::bigint);
  insert into public.t2_onboarding_command_log (operation_id, actor_id, command, natija) values (p_operation_id, p_actor_id, 'kompaniya_ozi_och', v_res);
  return v_res;
end $f$;
revoke all on function public.t2_kompaniya_ozi_och_v1(bigint, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.t2_kompaniya_ozi_och_v1(bigint, text, text, text, uuid) to service_role;
notify pgrst, 'reload schema';
