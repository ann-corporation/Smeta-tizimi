-- NAKOPITELNIY TEZLIK v1 (prod 2026-10-27: katta obyektda «keyinroq qayta urinib ko'ring» — 30 s statement timeout).
-- NATIJA O'ZGARMAYDI: faqat hisoblash usuli. Qabul (acceptance) yangi natijani eski nusxa (*_eski) bilan
-- 151/152/153/161 obyektlarining BARCHA sahifalari bo'yicha jsonb tengligida solishtiradi.
--
-- EXPLAIN topilmasi (Sun'iy ko'l 153, 26 475 qator, iliq kesh, 2026-10-27):
--   * 1-sahifa (jami bilan) ~2,2 s; keyingi sahifa ~0,6 s (sovuq keshda 4,6 s gacha).
--   * t2_almashtirilgan_hajm: ~1,4–2,4 ms/chaqiruv. Sabab: SQL funksiya ichidan boshqa SQL funksiya
--     (t2_almashtirilgan_oz_hajm) chaqirilganda PG17 ichki funksiyani HAR chaqiruvda qayta tahlil/rejalaydi
--     (to'g'ridan-to'g'ri oz_hajm: 0,09 ms/chaqiruv). Jami qoldiq_summa 403 qator -> ~1,0 s; har sahifa ~83 qator -> ~0,25 s.
--   * Jami yig'masi: 26 475 qatorga LATERAL (har qatorga indeks probe) ~0,7 s; set-based (GROUP BY + hash join) ~0,11 s.
--   * EXISTS (replaces_line_id = ...) butun t2_qator (90k) ni hash qiladi (~60 ms x2); "is not null" bilan
--     qisman indeks (268 qator) ishlatiladi. Ma'no bir xil (= tengligi NULL ni baribir chiqarib tashlaydi).
-- O'zgarishlar:
--   1) t2_almashtirilgan_oz_hajm / t2_almashtirilgan_hajm: LANGUAGE sql -> plpgsql, SO'ROV MATNI AYNAN prod'dagidek
--      (prosrc dan olinadi). plpgsql rejalari sessiyada keshlanadi -> ichki qayta rejalash yo'q. Barcha chaqiruvchilar
--      (t2_qator_holat, t2_nakopitelniy_v2, ...) tezlashadi.
--   2) t2_nakopitelniy_v2 jami (faqat p_offset=0): LATERAL -> pa CTE (GROUP BY aq.qator_id) + hash join; agregat
--      ifodalari prod ta'rifidan ko'chiriladi (qayta yozilmaydi).
--   3) EXISTS ... replaces_line_id: "and zz.replaces_line_id is not null" (qisman indeks).
-- Eski nusxalar (*_eski) faqat qabul solishtiruvi va rollback uchun; ruxsat faqat postgres/service_role.
-- Langar topilmasa EXCEPTION (jim o'tmaydi).
begin;

-- 0) Eski nusxalar (prod ta'rifidan, nomlari almashtirilgan; eski nakopitelniy eski almashtirilgan_hajm ni chaqiradi).
do $do$
declare d text;
begin
  if to_regprocedure('public.t2_almashtirilgan_oz_hajm_eski(bigint)') is null then
    d := pg_get_functiondef('public.t2_almashtirilgan_oz_hajm(bigint)'::regprocedure);
    if position('LANGUAGE sql' in d) = 0 then raise exception 'NAK_TEZLIK: t2_almashtirilgan_oz_hajm allaqachon sql emas'; end if;
    execute replace(d, 'FUNCTION public.t2_almashtirilgan_oz_hajm(', 'FUNCTION public.t2_almashtirilgan_oz_hajm_eski(');
  end if;
  if to_regprocedure('public.t2_almashtirilgan_hajm_eski(bigint)') is null then
    d := pg_get_functiondef('public.t2_almashtirilgan_hajm(bigint)'::regprocedure);
    if position('LANGUAGE sql' in d) = 0 then raise exception 'NAK_TEZLIK: t2_almashtirilgan_hajm allaqachon sql emas'; end if;
    d := replace(d, 'FUNCTION public.t2_almashtirilgan_hajm(', 'FUNCTION public.t2_almashtirilgan_hajm_eski(');
    d := replace(d, 'public.t2_almashtirilgan_oz_hajm(', 'public.t2_almashtirilgan_oz_hajm_eski(');
    execute d;
  end if;
  if to_regprocedure('public.t2_nakopitelniy_v2_eski(bigint,bigint,date,integer,boolean,integer)') is null then
    d := pg_get_functiondef('public.t2_nakopitelniy_v2(bigint,bigint,date,integer,boolean,integer)'::regprocedure);
    if position('with pa as (' in d) > 0 then raise exception 'NAK_TEZLIK: t2_nakopitelniy_v2 allaqachon yangilangan'; end if;
    d := replace(d, 'FUNCTION public.t2_nakopitelniy_v2(', 'FUNCTION public.t2_nakopitelniy_v2_eski(');
    d := replace(d, 'public.t2_almashtirilgan_hajm(', 'public.t2_almashtirilgan_hajm_eski(');
    execute d;
  end if;
end $do$;
revoke all on function public.t2_almashtirilgan_oz_hajm_eski(bigint) from public, anon, authenticated;
revoke all on function public.t2_almashtirilgan_hajm_eski(bigint) from public, anon, authenticated;
revoke all on function public.t2_nakopitelniy_v2_eski(bigint,bigint,date,integer,boolean,integer) from public, anon, authenticated;
grant execute on function public.t2_almashtirilgan_oz_hajm_eski(bigint) to service_role;
grant execute on function public.t2_almashtirilgan_hajm_eski(bigint) to service_role;
grant execute on function public.t2_nakopitelniy_v2_eski(bigint,bigint,date,integer,boolean,integer) to service_role;

-- 1) sql -> plpgsql (so'rov matni AYNAN prosrc; CREATE OR REPLACE ruxsatlarni saqlaydi).
do $do$
declare f text; s text;
begin
  foreach f in array array['t2_almashtirilgan_oz_hajm', 't2_almashtirilgan_hajm'] loop
    select p.prosrc into s from pg_proc p where p.oid = format('public.%I(bigint)', f)::regprocedure and p.prolang = (select oid from pg_language where lanname = 'sql');
    if s is null then raise exception 'NAK_TEZLIK: % sql funksiya emas yoki topilmadi', f; end if;
    s := rtrim(s, E' \n\t;');
    execute format($f$create or replace function public.%I(p_qator_id bigint) returns numeric
  language plpgsql stable set search_path to 'public', 'pg_temp'
as %L$f$, f, E'begin\n  return (\n' || s || E'\n  );\nend');
  end loop;
end $do$;

-- 2)+3) t2_nakopitelniy_v2: jami set-based, EXISTS qisman indeks.
do $do$
declare d text; n text; i0 int; i1 int; i2 int; lat text; aggs text;
  lat_bosh constant text := E'      left join lateral (\n        select\n          sum(aq.summa) filter (where a.tur=''fakt'') as fakt_summa,';
  lat_oxir constant text := E'      ) x on true\n';
  agg_bosh constant text := E'        from public.t2_akt_qator aq\n';
begin
  d := pg_get_functiondef('public.t2_nakopitelniy_v2(bigint,bigint,date,integer,boolean,integer)'::regprocedure);
  n := d;
  i0 := position(lat_bosh in n);
  if i0 = 0 then raise exception 'NAK_TEZLIK: jami LATERAL langari topilmadi (funksiya ta''rifi o''zgargan)'; end if;
  i1 := i0 + position(lat_oxir in substr(n, i0)) - 1;
  lat := substr(n, i0, i1 - i0 + length(lat_oxir));
  -- Agregat ifodalari: "select\n" dan keyin, "from public.t2_akt_qator aq" gacha (aynan prod matni).
  i2 := position(agg_bosh in lat);
  if i1 < i0 or i2 = 0 or position(E'        where aq.qator_id = q.id\n' in lat) = 0 then
    raise exception 'NAK_TEZLIK: jami LATERAL tuzilishi kutilganidek emas';
  end if;
  aggs := substr(lat, length(E'      left join lateral (\n        select\n') + 1, i2 - length(E'      left join lateral (\n        select\n') - 1);
  n := substr(n, 1, i0 - 1) || E'      left join pa x on x.qator_id = q.id\n' || substr(n, i0 + length(lat));
  if position(E'    with agg as (\n' in n) = 0 then raise exception 'NAK_TEZLIK: "with agg as" langari topilmadi'; end if;
  n := replace(n, E'    with agg as (\n',
    E'    with pa as (\n      select aq.qator_id,\n' || aggs
    || E'      from public.t2_qator q\n      join public.t2_akt_qator aq on aq.qator_id = q.id\n'
    || E'      join public.t2_akt a on a.id = aq.akt_id and a.holat <> ''bekor''\n'
    || E'      where q.obyekt_id = p_obyekt_id\n      group by aq.qator_id\n    ), agg as (\n');
  -- 3) EXISTS: qisman indeks (t2_qator_replaces_line_ix ... where replaces_line_id is not null).
  n := replace(n, 'zz.replaces_line_id = q.id)', 'zz.replaces_line_id = q.id and zz.replaces_line_id is not null)');
  n := replace(n, 'zz.replaces_line_id = q.ota_id)', 'zz.replaces_line_id = q.ota_id and zz.replaces_line_id is not null)');
  n := replace(n, 'zz.replaces_line_id = o.id)', 'zz.replaces_line_id = o.id and zz.replaces_line_id is not null)');
  n := replace(n, 'zz.replaces_line_id = o.ota_id)', 'zz.replaces_line_id = o.ota_id and zz.replaces_line_id is not null)');
  if position('left join pa x on x.qator_id = q.id' in n) = 0 or position('group by aq.qator_id' in n) = 0
     or position('as fakt_summa,' in n) = 0 or position('replaces_line_id = o.ota_id and zz.replaces_line_id is not null' in n) = 0
     or position('replaces_line_id = q.ota_id and zz.replaces_line_id is not null' in n) = 0 then
    raise exception 'NAK_TEZLIK: t2_nakopitelniy_v2 o''zgartirish langarlari to''liq emas';
  end if;
  execute n;
end $do$;

commit;
