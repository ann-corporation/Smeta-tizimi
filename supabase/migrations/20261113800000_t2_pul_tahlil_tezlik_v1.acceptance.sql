-- Qabul: migratsiya qo'llangandan KEYIN (BEGIN..ROLLBACK, hech narsa yozilmaydi).
-- Yangi t2_pul_tahlil_v2 natijasi eski nusxa (t2_pul_tahlil_v2_eski -> t2_pul_tahlil_v1_eski = migratsiyadan oldingi
-- prod ta'rifi) bilan obyekt 151, 152, 153, kompaniya 123 (hamma obyekt) va bitta shartnoma bo'yicha, turli davr/dalil
-- parametrlarida jsonb tengligida solishtiriladi (faqat generated_at chiqarib tashlanadi). Farq bo'lsa EXCEPTION.
-- t2_akt_reestr: yangi (akt_id, id) indeksi rejada ishlatilishi tekshiriladi. Vaqtlar NOTICE da (oldin/keyin).
begin;
set local statement_timeout = '600s';
do $test$
declare
  aktor bigint; sh bigint; ob bigint; e jsonb; y jsonb; t0 timestamptz; t_e interval; t_y interval;
  p record; q record; n int := 0; v_plan text; v_cnt int;
begin
  if position('v_cfmap' in pg_get_functiondef('public.t2_pul_tahlil_v1(bigint,bigint,bigint,bigint,date,date,text)'::regprocedure)) = 0
     or position('left join lateral (' in split_part(pg_get_functiondef('public.t2_pul_tahlil_v1(bigint,bigint,bigint,bigint,date,date,text)'::regprocedure), 'group by q.obyekt_id, q.kk', 1)) > 0 then
    raise exception 'T0: t2_pul_tahlil_v1 yangilanmagan';
  end if;
  if has_function_privilege('authenticated', 'public.t2_pul_tahlil_v2_eski(bigint,bigint,bigint,bigint,date,date,text,text)', 'execute')
     or has_function_privilege('anon', 'public.t2_pul_tahlil_v1_eski(bigint,bigint,bigint,bigint,date,date,text)', 'execute') then
    raise exception 'T0: eski nusxa ochiq';
  end if;

  select z.foydalanuvchi_id into aktor from public.t2_azolik z join public.t2_foydalanuvchi f on f.id = z.foydalanuvchi_id and f.holat = 'faol'
   where z.kompaniya_id = 123 and z.holat = 'faol' order by (z.foydalanuvchi_id = 201) desc, z.foydalanuvchi_id limit 1;
  if aktor is null then raise exception 'kompaniya 123: faol a''zo topilmadi'; end if;
  select b.shartnoma_id into sh from public.t2_shartnoma_bog b join public.t2_obyekt o on o.id = b.obyekt_id
   where o.kompaniya_id = 123 and b.holat = 'faol' group by b.shartnoma_id order by count(*) desc, b.shartnoma_id limit 1;

  -- Isitish (iliq kesh solishtiruvi uchun).
  perform public.t2_pul_tahlil_v2(123, aktor, null);

  for p in
    select * from (values
      (151::bigint, null::bigint, null::date, null::date, null::text, null::text),
      (152, null, null, null, null, null),
      (153, null, null, null, null, null),
      (null, null, null, null, null, null),
      (null, null, date '2026-06-15', null, null, null),
      (null, null, date '2026-09-30', date '2026-01-01', null, null),
      (151, null, date '2026-03-31', null, null, null),
      (153, null, null, date '2026-05-01', null, null),
      (null, sh, null, null, null, null),
      (151, null, null, null, 'МАТ', null),
      (null, null, null, null, 'ЧЕЛ', null),
      (153, null, null, null, 'ЧЕЛ', 'xarajat')
    ) v(o, s, gacha, dan, kat, turi)
  loop
    t0 := clock_timestamp(); e := public.t2_pul_tahlil_v2_eski(123, aktor, p.o, p.s, p.gacha, p.dan, p.kat, p.turi); t_e := clock_timestamp() - t0;
    t0 := clock_timestamp(); y := public.t2_pul_tahlil_v2(123, aktor, p.o, p.s, p.gacha, p.dan, p.kat, p.turi);      t_y := clock_timestamp() - t0;
    if (e ->> 'ok')::boolean is not true then raise exception 'P: % eski ok emas: %', row_to_json(p), e; end if;
    if (e - 'generated_at') is distinct from (y - 'generated_at') then
      raise exception 'P: % farq (jami eski=% yangi=%)', row_to_json(p), e -> 'jami', y -> 'jami';
    end if;
    n := n + 1;
    raise notice 'pul_tahlil obyekt=% shartnoma=% gacha=% dan=% kat=% turi=%: eski % ms, yangi % ms',
      coalesce(p.o::text, 'K123'), p.s, p.gacha, p.dan, p.kat, p.turi,
      round(extract(epoch from t_e) * 1000), round(extract(epoch from t_y) * 1000);
  end loop;
  if n < 11 then raise exception 'P: kam holat solishtirildi (%)', n; end if;

  -- t2_akt_reestr: indeks rejada; vaqt.
  v_plan := '';
  for q in execute 'explain (format text) select * from public.t2_akt_reestr where kompaniya_id = 123 and tur = ''f2'' order by oy desc limit 5000' loop
    v_plan := v_plan || q."QUERY PLAN" || E'\n';
  end loop;
  if to_regclass('public.t2_akt_qator_akt_id_id_idx') is null then raise exception 'R: t2_akt_qator_akt_id_id_idx yo''q'; end if;
  if position('t2_akt_qator_akt_id_id_idx' in v_plan) = 0 then raise notice 'R OGOH: t2_akt_reestr rejasida yangi indeks ko''rinmadi:%', v_plan; end if;
  t0 := clock_timestamp();
  select count(*) into v_cnt from (select * from public.t2_akt_reestr where kompaniya_id = 123 and tur = 'f2' order by oy desc limit 5000) s;
  raise notice 't2_akt_reestr kompaniya 123 f2: % akt, % ms', v_cnt, round(extract(epoch from clock_timestamp() - t0) * 1000);
  raise notice 'QABUL OK: % holat jsonb teng', n;
end $test$;
rollback;
