-- Qabul: 20261222400000_t2_akt_reestr_muhr_farq_kesh_v1 qo'llangandan KEYIN (tashqi tranzaksiya ichida; o'zgarishlar tashqarida bekor qilinadi).
-- 1) Grantlar yopiq. 2) Kompaniya 123 HAR obyekti uchun: keshdan o'qilgan == jonli == view'dan to'g'ridan-to'g'ri (massivlar tartibsiz solishtiriladi).
-- 3) Kompaniya darajasidagi funksiya (f2 / fakt / hammasi) == view. 4) Har manba jadvaliga yozuv obyektni iflos qiladi (ins/del/upd triggerlar mavjud + upd amalda).
create or replace function pg_temp.jnorm(j jsonb) returns jsonb language sql immutable as $f$
  select case jsonb_typeof(j)
    when 'object' then (select coalesce(jsonb_object_agg(k, pg_temp.jnorm(v)), '{}'::jsonb) from jsonb_each(j) e(k, v))
    when 'array'  then (select coalesce(jsonb_agg(x order by x::text), '[]'::jsonb) from (select pg_temp.jnorm(v) x from jsonb_array_elements(j) a(v)) s)
    else j end
$f$;
do $test$
declare
  r record; v_actor bigint; v_n int; v_o bigint; v_w text; v_a jsonb; v_b jsonb; v_c jsonb; v_tur text;
  v_tbl text; v_tg text;
begin
  if has_function_privilege('anon', 'public.t2_akt_reestr_obyekt_v1(bigint,bigint,text)', 'execute')
     or has_function_privilege('authenticated', 'public.t2_akt_reestr_kompaniya_v1(bigint,bigint,text)', 'execute')
     or has_function_privilege('authenticated', 'public.t2_qator_muhr_farq_obyekt_v1(bigint,bigint)', 'execute')
     or has_function_privilege('authenticated', 'public._t2_akt_reestr_hisob_v1(bigint)', 'execute')
     or has_function_privilege('authenticated', 'public._t2_qator_muhr_farq_hisob_v1(bigint)', 'execute')
     or has_function_privilege('authenticated', 'public._t2_kesh_natija_oqi_v1(bigint,text)', 'execute') then
    raise exception 'A0: grantlar ochiq';
  end if;

  -- A1: triggerlar mavjudligi (har manba jadval: ins/del/upd yoki mos hodisa)
  for v_tbl, v_tg in values ('t2_akt','t2_kesh_t2_akt_ins'),('t2_akt','t2_kesh_t2_akt_del'),('t2_akt','t2_kesh_t2_akt_upd'),
      ('t2_akt_qator','t2_kesh_t2_akt_qator_ins'),('t2_akt_qator','t2_kesh_t2_akt_qator_del'),('t2_akt_qator','t2_kesh_t2_akt_qator_upd'),
      ('t2_qator','t2_kesh_t2_qator_ins'),('t2_qator','t2_kesh_t2_qator_del'),('t2_qator','t2_kesh_t2_qator_upd'),
      ('t2_qator_muhr','t2_kesh_t2_qator_muhr_ins'),('t2_qator_muhr','t2_kesh_t2_qator_muhr_del'),('t2_qator_muhr','t2_kesh_t2_qator_muhr_upd'),
      ('t2_ozgarish','t2_kesh_t2_ozgarish_ins'),('t2_ozgarish','t2_kesh_t2_ozgarish_del'),('t2_ozgarish','t2_kesh_t2_ozgarish_upd'),
      ('t2_obyekt','t2_kesh_t2_obyekt_nom') loop
    if not exists (select 1 from pg_trigger t where t.tgrelid = ('public.' || v_tbl)::regclass and t.tgname = v_tg and not t.tgisinternal and t.tgenabled <> 'D') then
      raise exception 'A1: trigger yo''q: % on %', v_tg, v_tbl;
    end if;
  end loop;

  select a.foydalanuvchi_id into v_actor from public.t2_azolik a join public.t2_foydalanuvchi f on f.id = a.foydalanuvchi_id and f.holat = 'faol'
   where a.kompaniya_id = 123 and a.holat = 'faol' order by a.foydalanuvchi_id limit 1;
  if v_actor is null then raise notice 'A2 o''tkazildi: kompaniya 123 faol a''zosi yo''q'; return; end if;

  -- A2: har obyekt: kesh == jonli == view
  for r in select id from public.t2_obyekt where kompaniya_id = 123 order by id loop
    delete from public.t2_obyekt_kesh_iflos where obyekt_id = r.id;
    perform public._t2_obyekt_natija_kesh_hisobla_v1(r.id);
    if public._t2_kesh_natija_oqi_v1(r.id, 'akt_reestr') is null or public._t2_kesh_natija_oqi_v1(r.id, 'muhr_farq') is null then
      raise exception 'A2: kesh toza emas/yo''q (obyekt %)', r.id;
    end if;
    -- akt reestri: ochiq funksiya (kesh) vs view
    v_a := public.t2_akt_reestr_obyekt_v1(r.id, v_actor);
    select jsonb_build_object('ok', true, 'qatorlar', coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)) into v_b from public.t2_akt_reestr x where x.obyekt_id = r.id;
    if pg_temp.jnorm(v_a) is distinct from pg_temp.jnorm(v_b) then raise exception 'A2: akt_reestr kesh != view (obyekt %)', r.id; end if;
    foreach v_tur in array array['f2', 'fakt'] loop
      v_a := public.t2_akt_reestr_obyekt_v1(r.id, v_actor, v_tur);
      select jsonb_build_object('ok', true, 'qatorlar', coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)) into v_b from public.t2_akt_reestr x where x.obyekt_id = r.id and x.tur = v_tur;
      if pg_temp.jnorm(v_a) is distinct from pg_temp.jnorm(v_b) then raise exception 'A2: akt_reestr(%) kesh != view (obyekt %)', v_tur, r.id; end if;
    end loop;
    -- muhr farqi
    v_a := public.t2_qator_muhr_farq_obyekt_v1(r.id, v_actor);
    select jsonb_build_object('ok', true, 'qatorlar', coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)) into v_b from public.t2_qator_muhr_farq x where x.obyekt_id = r.id;
    if pg_temp.jnorm(v_a) is distinct from pg_temp.jnorm(v_b) then raise exception 'A2: muhr_farq kesh != view (obyekt %)', r.id; end if;
  end loop;

  -- A3: kompaniya darajasi (hammasi toza keshdan) == view
  foreach v_tur in array array['f2', 'fakt'] loop
    v_a := public.t2_akt_reestr_kompaniya_v1(123, v_actor, v_tur);
    select jsonb_build_object('ok', true, 'qatorlar', coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)) into v_b from public.t2_akt_reestr x where x.kompaniya_id = 123 and x.tur = v_tur;
    if pg_temp.jnorm(v_a) is distinct from pg_temp.jnorm(v_b) then raise exception 'A3: kompaniya akt_reestr(%) kesh != view', v_tur; end if;
  end loop;
  v_a := public.t2_akt_reestr_kompaniya_v1(123, v_actor);
  select jsonb_build_object('ok', true, 'qatorlar', coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)) into v_b from public.t2_akt_reestr x where x.kompaniya_id = 123;
  if pg_temp.jnorm(v_a) is distinct from pg_temp.jnorm(v_b) then raise exception 'A3: kompaniya akt_reestr(hammasi) kesh != view'; end if;
  -- aralash: bitta obyekt iflos (jonli), qolgani keshdan - natija baribir view bilan bir xil
  select min(id) into v_o from public.t2_obyekt where kompaniya_id = 123;
  insert into public.t2_obyekt_kesh_iflos(obyekt_id, kompaniya_id, sabab) select id, kompaniya_id, 'qabul' from public.t2_obyekt where id = v_o on conflict (obyekt_id) do nothing;
  v_c := public.t2_akt_reestr_kompaniya_v1(123, v_actor);
  if pg_temp.jnorm(v_c) is distinct from pg_temp.jnorm(v_b) then raise exception 'A3: aralash (iflos+kesh) != view'; end if;
  delete from public.t2_obyekt_kesh_iflos where obyekt_id = v_o;

  -- A4: yozuvlar iflos qiladi (har manba jadval; upd amalda)
  -- t2_akt
  select a.id, a.obyekt_id into r from public.t2_akt a join public.t2_obyekt o on o.id = a.obyekt_id and o.kompaniya_id = 123 order by a.id limit 1;
  if r.id is not null then
    delete from public.t2_obyekt_kesh_iflos where obyekt_id = r.obyekt_id;
    update public.t2_akt set izoh = izoh where id = r.id;
    select count(*) into v_n from public.t2_obyekt_kesh_iflos where obyekt_id = r.obyekt_id;
    if v_n <> 1 then raise exception 'A4: t2_akt iflos qilmadi'; end if;
    if public._t2_kesh_natija_oqi_v1(r.obyekt_id, 'akt_reestr') is not null then raise exception 'A4: iflos obyekt keshi o''qildi'; end if;
  end if;
  -- t2_akt_qator
  select aq.id, a.obyekt_id into r from public.t2_akt_qator aq join public.t2_akt a on a.id = aq.akt_id join public.t2_obyekt o on o.id = a.obyekt_id and o.kompaniya_id = 123 order by aq.id limit 1;
  if r.id is not null then
    delete from public.t2_obyekt_kesh_iflos where obyekt_id = r.obyekt_id;
    update public.t2_akt_qator set hajm = hajm where id = r.id;
    select count(*) into v_n from public.t2_obyekt_kesh_iflos where obyekt_id = r.obyekt_id;
    if v_n <> 1 then raise exception 'A4: t2_akt_qator iflos qilmadi'; end if;
  end if;
  -- t2_qator
  select q.id, q.obyekt_id into r from public.t2_qator q where q.kompaniya_id = 123 order by q.id limit 1;
  if r.id is not null then
    delete from public.t2_obyekt_kesh_iflos where obyekt_id = r.obyekt_id;
    update public.t2_qator set nom = nom where id = r.id;
    select count(*) into v_n from public.t2_obyekt_kesh_iflos where obyekt_id = r.obyekt_id;
    if v_n <> 1 then raise exception 'A4: t2_qator iflos qilmadi'; end if;
  end if;
  -- t2_qator_muhr (const trigger: o'zgarmagan qiymatli yozuv ruxsat)
  select m.id, m.obyekt_id into r from public.t2_qator_muhr m where m.kompaniya_id = 123 order by m.id limit 1;
  if r.id is not null then
    delete from public.t2_obyekt_kesh_iflos where obyekt_id = r.obyekt_id;
    update public.t2_qator_muhr set tur = tur where id = r.id;
    select count(*) into v_n from public.t2_obyekt_kesh_iflos where obyekt_id = r.obyekt_id;
    if v_n <> 1 then raise exception 'A4: t2_qator_muhr iflos qilmadi'; end if;
  end if;
  -- t2_ozgarish (jadval = t2_qator)
  select z.id, coalesce(z.obyekt_id, q.obyekt_id) as obyekt_id into r from public.t2_ozgarish z left join public.t2_qator q on q.id = z.qator_id
   where z.jadval = 't2_qator' and z.kompaniya_id = 123 and coalesce(z.obyekt_id, q.obyekt_id) is not null order by z.id limit 1;
  if r.id is not null then
    delete from public.t2_obyekt_kesh_iflos where obyekt_id = r.obyekt_id;
    update public.t2_ozgarish set izoh = izoh where id = r.id;
    select count(*) into v_n from public.t2_obyekt_kesh_iflos where obyekt_id = r.obyekt_id;
    if v_n <> 1 then raise exception 'A4: t2_ozgarish iflos qilmadi'; end if;
  end if;
  -- t2_obyekt.nom
  select id into v_o from public.t2_obyekt where kompaniya_id = 123 order by id limit 1;
  if v_o is not null then
    delete from public.t2_obyekt_kesh_iflos where obyekt_id = v_o;
    update public.t2_obyekt set nom = nom || ' ' where id = v_o;
    select count(*) into v_n from public.t2_obyekt_kesh_iflos where obyekt_id = v_o;
    if v_n <> 1 then raise exception 'A4: t2_obyekt.nom iflos qilmadi'; end if;
  end if;
end
$test$;
