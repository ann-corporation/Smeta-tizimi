-- Acceptance: 20261217400000 — O'rganish halqasi. BEGIN ... ROLLBACK (hech narsa saqlanmaydi). Fixture shu tranzaksiya ichida yaratiladi.
-- Har qadam xatosi qadam nomi bilan qayta ko'tariladi (RAISE). Tekshiriladi: N tasdiqdan keyin taklif; tuzatish eskisini siqib chiqaradi;
-- user darajasi boshqa userga, kompaniya darajasi boshqa kompaniyaga sizmaydi; tizim taklifida kompaniya id/nom yo'q;
-- ishqalanish sanagichi partiya bo'yicha idempotent va kardinallik chegarasiga bo'ysunadi; retention eski chelaklarni siqadi; foydalanuvchi o'z tajribasini o'chira oladi.
begin;
set local statement_timeout = '300s';
do $acc$
declare
  v_qadam text := 'boshlash';
  k1 bigint; k2 bigint; u1 bigint; u2 bigint; u3 bigint; u5 bigint; u6 bigint; su bigint;
  r jsonb; n integer; i integer; op uuid; v_kod text := 'T' || to_char(clock_timestamp(), 'HH24MISSUS');
  v_lot jsonb; v_rad boolean;
begin
  v_qadam := 'fixture';
  insert into public.t2_kompaniya (nom, kod) values ('OSUVCHI-SINOV-1 ' || v_kod, 'OS1' || v_kod) returning id into k1;
  insert into public.t2_kompaniya (nom, kod) values ('OSUVCHI-SINOV-2 ' || v_kod, 'OS2' || v_kod) returning id into k2;
  insert into public.t2_foydalanuvchi (login, holat) values ('os_u1_' || v_kod, 'faol') returning id into u1;
  insert into public.t2_foydalanuvchi (login, holat) values ('os_u2_' || v_kod, 'faol') returning id into u2;
  insert into public.t2_foydalanuvchi (login, holat) values ('os_u3_' || v_kod, 'faol') returning id into u3;
  insert into public.t2_foydalanuvchi (login, holat) values ('os_u5_' || v_kod, 'faol') returning id into u5;
  insert into public.t2_foydalanuvchi (login, holat) values ('os_u6_' || v_kod, 'faol') returning id into u6;
  insert into public.t2_azolik (foydalanuvchi_id, kompaniya_id, rol) values (u1, k1, 'pto'), (u2, k1, 'pto'), (u5, k1, 'pto'), (u6, k1, 'rahbar'), (u3, k2, 'pto');
  select id into su from public.t2_foydalanuvchi where holat = 'faol' and coalesce(public.t2_platforma_superadmin(id), false) limit 1;

  v_qadam := '1 sozlama sukut: oqish=true, hissa=false';
  r := public.t2_osuvchi_ol_v1(k1, u1, 'sozlama', '{}'::jsonb);
  if not ((r ->> 'oqish')::boolean and not (r ->> 'hissa')::boolean) then raise exception 'sozlama sukuti noto''g''ri: %', r; end if;

  v_qadam := '2 taklif N=2 tasdiqdan keyin paydo bo''ladi (1 tasdiq — yo''q)';
  r := public.t2_osuvchi_yoz_v1(k1, u1, gen_random_uuid(), 'tajriba_yoz', jsonb_build_object('domen', 'lugat', 'kalit', 'shpaklevka', 'qiymat', 'ШПАКЛЕВКА', 'natija', 'tasdiq'));
  if r -> 'taklif' ->> 'daraja' is not null then raise exception '1 tasdiqda taklif chiqmasligi kerak: %', r; end if;
  op := gen_random_uuid();
  r := public.t2_osuvchi_yoz_v1(k1, u1, op, 'tajriba_yoz', jsonb_build_object('domen', 'lugat', 'kalit', 'shpaklevka', 'qiymat', 'ШПАКЛЕВКА', 'natija', 'tasdiq'));
  if r -> 'taklif' ->> 'daraja' <> 'user' or r -> 'taklif' ->> 'qiymat' <> 'ШПАКЛЕВКА' then raise exception '2 tasdiqda user taklifi chiqishi kerak: %', r; end if;

  v_qadam := '2b takroriy operation_id sanalmaydi (idempotent)';
  r := public.t2_osuvchi_yoz_v1(k1, u1, op, 'tajriba_yoz', jsonb_build_object('domen', 'lugat', 'kalit', 'shpaklevka', 'qiymat', 'ШПАКЛЕВКА', 'natija', 'tasdiq'));
  if not coalesce((r ->> 'takror')::boolean, false) then raise exception 'takror belgilanmadi: %', r; end if;
  select tasdiq into n from public.t2_tajriba where foydalanuvchi_id = u1 and kalit = 'shpaklevka';
  if n <> 2 then raise exception 'tasdiq soni 2 bo''lishi kerak, % bo''ldi', n; end if;

  v_qadam := '3 tuzatish eskisini darhol siqib chiqaradi, yangisi 2 tasdiqdan keyin taklif bo''ladi';
  r := public.t2_osuvchi_yoz_v1(k1, u1, gen_random_uuid(), 'tajriba_yoz', jsonb_build_object('domen', 'lugat', 'kalit', 'shpaklevka', 'qiymat', 'ШПАТЛЕВКА', 'natija', 'tuzatish', 'taklif_qiymat', 'ШПАКЛЕВКА'));
  if r -> 'taklif' ->> 'daraja' is not null then raise exception 'tuzatishdan keyin eski taklif qolmasligi kerak: %', r; end if;
  r := public.t2_osuvchi_yoz_v1(k1, u1, gen_random_uuid(), 'tajriba_yoz', jsonb_build_object('domen', 'lugat', 'kalit', 'shpaklevka', 'qiymat', 'ШПАТЛЕВКА', 'natija', 'tasdiq'));
  if r -> 'taklif' ->> 'daraja' <> 'user' or r -> 'taklif' ->> 'qiymat' <> 'ШПАТЛЕВКА' then raise exception 'yangi qiymat taklif bo''lishi kerak: %', r; end if;

  v_qadam := '4 user darajasi boshqa userga sizmaydi';
  r := public.t2_osuvchi_ol_v1(k1, u2, 'taklif', jsonb_build_object('domen', 'lugat', 'kalit', 'shpaklevka'));
  if r -> 'taklif' ->> 'daraja' is not null then raise exception 'u2 u1 tajribasini ko''rdi: %', r; end if;
  r := public.t2_osuvchi_ol_v1(k1, u2, 'mening', '{}'::jsonb);
  if jsonb_array_length(r -> 'royxat') <> 0 then raise exception 'u2 ro''yxatida begona qator: %', r; end if;

  v_qadam := '5 kompaniya darajasi: 2 foydalanuvchi, >=3 tasdiq; boshqa kompaniyaga sizmaydi';
  perform public.t2_osuvchi_yoz_v1(k1, u2, gen_random_uuid(), 'tajriba_yoz', jsonb_build_object('domen', 'lugat', 'kalit', 'shpaklevka', 'qiymat', 'ШПАТЛЕВКА', 'natija', 'tasdiq'));
  r := public.t2_osuvchi_ol_v1(k1, u5, 'taklif', jsonb_build_object('domen', 'lugat', 'kalit', 'shpaklevka'));
  if r -> 'taklif' ->> 'daraja' is distinct from 'kompaniya' or (r -> 'taklif' ->> 'foydalanuvchi_soni')::integer <> 2 then raise exception 'kompaniya taklifi kutilgan: %', r; end if;
  if r::text ~ ('"' || u1::text || '"') or (r -> 'taklif') ? 'foydalanuvchi_id' then raise exception 'kompaniya taklifida foydalanuvchi kimligi bor: %', r; end if;
  r := public.t2_osuvchi_ol_v1(k2, u3, 'taklif', jsonb_build_object('domen', 'lugat', 'kalit', 'shpaklevka'));
  if r -> 'taklif' ->> 'daraja' is not null then raise exception 'k2 k1 tajribasini ko''rdi: %', r; end if;

  v_qadam := '6 oqish=false bo''lsa yozilmaydi va taklif chiqmaydi';
  insert into public.t2_tajriba_sozlama (kompaniya_id, oqish, hissa) values (k2, false, false);
  r := public.t2_osuvchi_yoz_v1(k2, u3, gen_random_uuid(), 'tajriba_yoz', jsonb_build_object('domen', 'lugat', 'kalit', 'qq', 'qiymat', 'x', 'natija', 'tasdiq'));
  if not coalesce((r ->> 'otkazildi')::boolean, false) or exists (select 1 from public.t2_tajriba where kompaniya_id = k2) then raise exception 'oqish=false hurmat qilinmadi: %', r; end if;
  update public.t2_tajriba_sozlama set oqish = true, hissa = true where kompaniya_id = k2;
  insert into public.t2_tajriba_sozlama (kompaniya_id, oqish, hissa) values (k1, true, true) on conflict (kompaniya_id) do update set hissa = true;

  v_qadam := '7 maxfiy qiymat (uzun raqam, e-pochta) saqlanmaydi';
  r := public.t2_osuvchi_yoz_v1(k1, u1, gen_random_uuid(), 'tajriba_yoz', jsonb_build_object('domen', 'lugat', 'kalit', 'abc', 'qiymat', '12345678901', 'natija', 'tasdiq'));
  if r ->> 'code' is distinct from 'MAXFIY_QIYMAT' then raise exception 'uzun raqam rad etilmadi: %', r; end if;
  r := public.t2_osuvchi_yoz_v1(k1, u1, gen_random_uuid(), 'tajriba_yoz', jsonb_build_object('domen', 'summa', 'kalit', 'abc', 'qiymat', 'x', 'natija', 'tasdiq'));
  if r ->> 'code' is distinct from 'DOMEN_NOTOGRI' then raise exception 'summa domeni rad etilmadi: %', r; end if;

  v_qadam := '8 tizim taklifi: 2 kompaniya, anonim; kompaniya id/nom yo''q';
  perform public.t2_osuvchi_yoz_v1(k1, u1, gen_random_uuid(), 'tajriba_yoz', jsonb_build_object('domen', 'lugat', 'kalit', 'beton', 'qiymat', 'БЕТОН', 'natija', 'tasdiq'));
  perform public.t2_osuvchi_yoz_v1(k1, u1, gen_random_uuid(), 'tajriba_yoz', jsonb_build_object('domen', 'lugat', 'kalit', 'beton', 'qiymat', 'БЕТОН', 'natija', 'tasdiq'));
  perform public.t2_osuvchi_yoz_v1(k2, u3, gen_random_uuid(), 'tajriba_yoz', jsonb_build_object('domen', 'lugat', 'kalit', 'beton', 'qiymat', 'БЕТОН', 'natija', 'tasdiq'));
  perform public.t2_osuvchi_yoz_v1(k2, u3, gen_random_uuid(), 'tajriba_yoz', jsonb_build_object('domen', 'lugat', 'kalit', 'beton', 'qiymat', 'БЕТОН', 'natija', 'tasdiq'));
  -- faqat bitta kompaniyada o'rganilgan so'z (shpaklevka) 2 kompaniya shartini bajarmaydi
  if su is null then
    raise notice 'platforma egasi yo''q — 8-9 qadamlar o''tkazib yuborildi';
  else
    r := public.t2_osuvchi_yoz_v1(k1, su, gen_random_uuid(), 'taklif_yigish', '{}'::jsonb);
    if not (r ->> 'ok')::boolean then raise exception 'taklif_yigish: %', r; end if;
    r := public.t2_osuvchi_platforma_ol_v1(su, 'taklif', '{}'::jsonb);
    if not exists (select 1 from jsonb_array_elements(r -> 'royxat') x where x ->> 'kalit' = 'beton' and x ->> 'qiymat' = 'БЕТОН' and x ->> 'tur' = 'tajriba') then raise exception 'beton taklifi yo''q: %', r; end if;
    if exists (select 1 from jsonb_array_elements(r -> 'royxat') x where x ->> 'kalit' = 'shpaklevka') then raise exception 'bitta kompaniya so''zi tizim taklifiga chiqdi'; end if;
    if r::text ~* '(kompaniya_id|OSUVCHI-SINOV)' or exists (select 1 from jsonb_array_elements(r -> 'royxat') x where x -> 'dalil' ? 'kompaniya_id') then raise exception 'tizim taklifida kompaniya kimligi bor'; end if;
    v_qadam := '9 faqat egasi qaror qiladi; qabul tizim qoidasini yaratadi va u 3-kompaniya foydalanuvchisiga taklif bo''ladi';
    r := public.t2_osuvchi_yoz_v1(k1, u1, gen_random_uuid(), 'taklif_yigish', '{}'::jsonb);
    if r ->> 'code' is distinct from 'RUXSAT' then raise exception 'oddiy foydalanuvchi taklif_yigish ni chaqira oldi: %', r; end if;
    select id into n from public.t2_osuvchi_taklif where tur = 'tajriba' and kalit = 'beton';
    r := public.t2_osuvchi_yoz_v1(k1, su, gen_random_uuid(), 'taklif_qaror', jsonb_build_object('id', n, 'qaror', 'qabul'));
    if not (r ->> 'ok')::boolean then raise exception 'qaror: %', r; end if;
    r := public.t2_osuvchi_ol_v1(k1, u5, 'taklif', jsonb_build_object('domen', 'lugat', 'kalit', 'beton'));
    if r -> 'taklif' ->> 'daraja' is distinct from 'tizim' or r -> 'taklif' ->> 'qiymat' <> 'БЕТОН' then raise exception 'tizim darajasi chiqmadi: %', r; end if;
  end if;

  v_qadam := '10 ishqalanish: partiya idempotent';
  op := gen_random_uuid();
  v_lot := jsonb_build_array(jsonb_build_object('s', 'f2-import', 'a', 'yuklash', 'h', 'boshlandi', 'n', 3, 'o', 1),
                             jsonb_build_object('s', 'f2-import', 'a', 'yuklash', 'h', 'tashlandi', 'n', 2, 'o', 1),
                             jsonb_build_object('s', 'f2-import', 'a', 'yuklash', 'h', 'xato', 'k', 'VAROQ_YOQ', 'n', 1, 'o', 1));
  perform public.t2_osuvchi_yoz_v1(k1, u1, op, 'friksiya_yubor', jsonb_build_object('qatorlar', v_lot));
  perform public.t2_osuvchi_yoz_v1(k1, u1, op, 'friksiya_yubor', jsonb_build_object('qatorlar', v_lot));
  select soni into n from public.t2_friksiya where kompaniya_id = k1 and sahifa = 'f2-import' and hodisa = 'tashlandi';
  if n <> 2 then raise exception 'partiya ikki marta sanaldi: %', n; end if;
  -- nol qidiruv: kod normallashadi, uzun raqamli so'z tashlanadi
  perform public.t2_osuvchi_yoz_v1(k1, u1, gen_random_uuid(), 'friksiya_yubor', jsonb_build_object('qatorlar', jsonb_build_array(
    jsonb_build_object('s', 'qidiruv', 'a', 'lugat', 'h', 'nol_qidiruv', 'k', '  Gipsokarton  <b>', 'n', 1, 'o', 1),
    jsonb_build_object('s', 'qidiruv', 'a', 'lugat', 'h', 'nol_qidiruv', 'k', 'inn 123456789012', 'n', 1, 'o', 1))));
  if not exists (select 1 from public.t2_friksiya where kompaniya_id = k1 and hodisa = 'nol_qidiruv' and kod = 'gipsokarton b')
     or exists (select 1 from public.t2_friksiya where kompaniya_id = k1 and hodisa = 'nol_qidiruv' and kod ~ '[0-9]{5,}') then raise exception 'nol qidiruv normallashuvi noto''g''ri'; end if;

  v_qadam := '11 kardinallik chegarasi: kompaniya-kun boshiga <=100 kalit (+ * to''lib-toshish)';
  for i in 1..3 loop
    v_lot := (select jsonb_agg(jsonb_build_object('s', 'sahifa' || (i * 100 + g), 'a', 'amal', 'h', 'boshlandi', 'n', 1, 'o', 0)) from generate_series(1, 55) g);
    perform public.t2_osuvchi_yoz_v1(k2, u3, gen_random_uuid(), 'friksiya_yubor', jsonb_build_object('qatorlar', v_lot));
  end loop;
  select count(*) into n from public.t2_friksiya where kompaniya_id = k2 and kun = current_date;
  if n > 101 then raise exception 'kardinallik chegarasi buzildi: % qator', n; end if;
  if not exists (select 1 from public.t2_friksiya where kompaniya_id = k2 and sahifa = '*') then raise exception 'to''lib-toshish (*) qatori yo''q'; end if;

  v_qadam := '12 retention: eski kunlik chelaklar haftalikka siqiladi, eski op o''chadi';
  insert into public.t2_friksiya (kun, kompaniya_id, rol, sahifa, amal, hodisa, kod, soni, odam)
  values (current_date - 20, k1, 'pto', 'eski-sahifa', 'amal', 'tashlandi', '', 4, 2), (current_date - 19, k1, 'pto', 'eski-sahifa', 'amal', 'tashlandi', '', 5, 1);
  insert into public.t2_osuvchi_op (op_id, kun) values (gen_random_uuid(), current_date - 10);
  r := public._t2_friksiya_tozala();
  if exists (select 1 from public.t2_friksiya where kun < current_date - 7) then raise exception 'eski kunlik qatorlar qoldi'; end if;
  select coalesce(sum(soni), 0) into n from public.t2_friksiya_hafta where kompaniya_id = k1 and sahifa = 'eski-sahifa';
  if n <> 9 then raise exception 'haftalik yig''ma 9 bo''lishi kerak, % bo''ldi', n; end if;
  if exists (select 1 from public.t2_osuvchi_op where kun < current_date - 3) then raise exception 'eski op o''chmadi'; end if;

  v_qadam := '13 reyting: ball = odam x nuqson; kompaniya ko''rinishi faqat control.company.read (rahbar) uchun';
  r := public.t2_osuvchi_ol_v1(k1, u6, 'friksiya', '{}'::jsonb);
  if not exists (select 1 from jsonb_array_elements(r -> 'royxat') x where x ->> 'sahifa' = 'f2-import' and (x ->> 'ball')::numeric > 0) then raise exception 'f2-import reytingda yo''q: %', r; end if;
  v_rad := false;
  begin
    perform public.t2_osuvchi_ol_v1(k1, u1, 'friksiya', '{}'::jsonb);
  exception when others then v_rad := true; end;
  if not v_rad then raise exception 'pto friksiya ko''rinishini ocha oldi'; end if;

  v_qadam := '14 foydalanuvchi o''z tajribasini o''chira oladi (boshqaniki — yo''q)';
  r := public.t2_osuvchi_yoz_v1(k1, u1, gen_random_uuid(), 'tajriba_unut', jsonb_build_object('hammasi', true));
  if (r ->> 'ochirildi')::integer < 1 then raise exception 'o''chirilmadi: %', r; end if;
  if exists (select 1 from public.t2_tajriba where foydalanuvchi_id = u1) then raise exception 'u1 qatorlari qoldi'; end if;
  if not exists (select 1 from public.t2_tajriba where foydalanuvchi_id = u2) then raise exception 'u2 qatorlari ham o''chib ketdi'; end if;
  r := public.t2_osuvchi_ol_v1(k1, u5, 'taklif', jsonb_build_object('domen', 'lugat', 'kalit', 'shpaklevka'));
  if r -> 'taklif' ->> 'daraja' is not null then raise exception 'o''chirilgandan keyin kompaniya darajasi qolmasligi kerak (1 foydalanuvchi): %', r; end if;

  raise notice 'OSUVCHI acceptance: hammasi o''tdi';
exception when others then
  raise exception 'OSUVCHI acceptance QADAM [%]: %', v_qadam, sqlerrm;
end $acc$;
rollback;
