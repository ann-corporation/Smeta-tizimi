-- Qabul: migratsiya qo'llangandan KEYIN (BEGIN..ROLLBACK, hech narsa yozilmaydi).
-- Yangi t2_nakopitelniy_v2 natijasi eski nusxa (t2_nakopitelniy_v2_eski — migratsiyadan oldingi prod ta'rifi) bilan
-- 151 Amfiteatr, 152 Stella, 153 Sun'iy ko'l va 161 (kichik) obyektlarining BARCHA sahifalari bo'yicha jsonb tengligida
-- solishtiriladi (faqat generated_at chiqarib tashlanadi). Farq bo'lsa EXCEPTION. Vaqtlar NOTICE da (oldin/keyin).
begin;
set local statement_timeout = '600s';
do $test$
declare
  ob bigint; aktor bigint; off int; e jsonb; y jsonb; t0 timestamptz; t_eski interval; t_yangi interval;
  rejim boolean; davr date; n int := 0; q record;
begin
  -- Tuzilish: yangi funksiyalar plpgsql, eski nusxalar sql; ruxsat PUBLIC/anon/authenticated ga yo'q.
  if (select l.lanname from pg_proc p join pg_language l on l.oid = p.prolang where p.oid = 'public.t2_almashtirilgan_hajm(bigint)'::regprocedure) <> 'plpgsql'
     or (select l.lanname from pg_proc p join pg_language l on l.oid = p.prolang where p.oid = 'public.t2_almashtirilgan_oz_hajm(bigint)'::regprocedure) <> 'plpgsql' then
    raise exception 'T0: almashtirilgan funksiyalar plpgsql emas';
  end if;
  if has_function_privilege('authenticated', 'public.t2_nakopitelniy_v2_eski(bigint,bigint,date,integer,boolean,integer)', 'execute')
     or has_function_privilege('anon', 'public.t2_almashtirilgan_hajm_eski(bigint)', 'execute') then
    raise exception 'T0: eski nusxa ochiq';
  end if;
  if position('with pa as (' in pg_get_functiondef('public.t2_nakopitelniy_v2(bigint,bigint,date,integer,boolean,integer)'::regprocedure)) = 0 then
    raise exception 'T0: t2_nakopitelniy_v2 yangilanmagan';
  end if;

  foreach ob in array array[151, 152, 153, 161]::bigint[] loop
    if not exists (select 1 from public.t2_obyekt where id = ob) then raise notice 'obyekt % yo''q — o''tkazildi', ob; continue; end if;
    select z.foydalanuvchi_id into aktor from public.t2_azolik z
     where z.kompaniya_id = (select kompaniya_id from public.t2_obyekt where id = ob)
     order by (z.foydalanuvchi_id = 183) desc, z.foydalanuvchi_id limit 1;
    if aktor is null then raise exception 'obyekt %: a''zo topilmadi', ob; end if;

    -- 1) almashtirilgan_hajm: zamenaga aloqador barcha qatorlar + 1500 ta oddiy qator.
    for q in
      select o.id from public.t2_qator o where o.obyekt_id = ob
         and (exists (select 1 from public.t2_qator zz where zz.replaces_line_id = o.id)
              or exists (select 1 from public.t2_qator zz where zz.replaces_line_id = o.ota_id))
      union all
      (select o.id from public.t2_qator o where o.obyekt_id = ob order by o.id limit 1500)
    loop
      if public.t2_almashtirilgan_hajm(q.id) is distinct from public.t2_almashtirilgan_hajm_eski(q.id)
         or public.t2_almashtirilgan_oz_hajm(q.id) is distinct from public.t2_almashtirilgan_oz_hajm_eski(q.id) then
        raise exception 'A: obyekt % qator % almashtirilgan_hajm farq: % <> %', ob, q.id,
          public.t2_almashtirilgan_hajm(q.id), public.t2_almashtirilgan_hajm_eski(q.id);
      end if;
    end loop;

    -- 2) Nakopitelniy: (faqat_faol=false, davr=null) barcha sahifalar; (faqat_faol=true) barcha sahifalar;
    --    (eng birinchi F2 oyi, faqat_faol=false) 1-sahifa — oldingi/joriy bo'linishi boshqa.
    foreach rejim in array array[false, true] loop
      off := 0; t_eski := interval '0'; t_yangi := interval '0';
      loop
        t0 := clock_timestamp(); e := public.t2_nakopitelniy_v2_eski(ob, aktor, null, 5000, rejim, off); t_eski := t_eski + (clock_timestamp() - t0);
        t0 := clock_timestamp(); y := public.t2_nakopitelniy_v2(ob, aktor, null, 5000, rejim, off);      t_yangi := t_yangi + (clock_timestamp() - t0);
        if (e ->> 'ok')::boolean is not true then raise exception 'N: obyekt % eski ok emas: %', ob, e; end if;
        if (e - 'generated_at') is distinct from (y - 'generated_at') then
          raise exception 'N: obyekt % faqat_faol=% offset % farq (jami eski=% yangi=%)', ob, rejim, off, e -> 'jami', y -> 'jami';
        end if;
        n := n + 1;
        exit when (y ->> 'keyingi_offset') is null;
        off := (y ->> 'keyingi_offset')::int;
      end loop;
      raise notice 'obyekt % faqat_faol=%: eski % / yangi % (barcha sahifalar)', ob, rejim, t_eski, t_yangi;
    end loop;
    select min(a.oy) into davr from public.t2_akt a where a.obyekt_id = ob and a.tur = 'f2' and a.holat = 'tasdiqlangan';
    if davr is not null then
      e := public.t2_nakopitelniy_v2_eski(ob, aktor, davr, 5000, false, 0);
      y := public.t2_nakopitelniy_v2(ob, aktor, davr, 5000, false, 0);
      if (e - 'generated_at') is distinct from (y - 'generated_at') then raise exception 'N: obyekt % davr % farq', ob, davr; end if;
      n := n + 1;
    end if;
  end loop;
  if n < 8 then raise exception 'N: juda kam sahifa solishtirildi (%)', n; end if;
  raise notice 'NAK_TEZLIK qabul: % sahifa — natija AYNAN bir xil', n;
end $test$;
rollback;
