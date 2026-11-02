-- PUL TAHLILI + AKT REESTRI TEZLIK v1 (prod 2026-10-27 10:05 UTC: Nakopitelniy bilan parallel
-- GET rpc/t2_pul_tahlil_v2 32-42 s va GET t2_akt_reestr 38 s -> 500, statement timeout 30 s).
-- NATIJA O'ZGARMAYDI: faqat hisoblash usuli. Qabul (acceptance) yangi t2_pul_tahlil_v2 natijasini eski nusxa
-- (t2_pul_tahlil_v2_eski -> t2_pul_tahlil_v1_eski) bilan 151/152/153 va kompaniya 123 bo'yicha jsonb tengligida solishtiradi.
--
-- EXPLAIN topilmasi (prod, iliq kesh, 2026-10-27; yolg'iz yuklamada):
--   t2_pul_tahlil_v2 kompaniya 123 (27 obyekt, 90 884 t2_qator, 21 196 t2_akt_qator): ~1,7-2,1 s; 151: ~0,13 s
--   (sovuq ~2,1 s); 152: ~0,07 s; 153: ~0,24 s. Kompaniya bo'yicha taqsimot:
--   * F2 cats sikli (obyektlar bo'yicha `select ... into v_cf ... where qq.obyekt_id = v_n and (v_gacha is null or ...)`):
--     dastlabki 5 chaqiruv custom reja (~5-10 ms), 6-dan boshlab plpgsql GENERIC rejaga o'tadi -> ~43 ms/obyekt;
--     27 obyekt ~1,0 s (eng katta qism). Bu qiymatlar asosiy so'rovdagi (obyekt, kk) f2 yig'indisining aynan o'zi
--     (bir xil filtrlar) -> qayta so'rov o'rniga asosiy sikl ichida jsonb xaritada yig'iladi.
--   * Asosiy so'rov: har 90 884 qatorga LATERAL indeks probe (~0,39-0,48 s, 257k buffer) ->
--     t2_akt_qator ni qator_id bo'yicha bir marta GROUP BY + hash join (~0,16-0,26 s). Agregat ifodalari o'zgarmagan.
--   * t2_obyekt_nakrutka_v1 x27 ~0,14 s, t2_xarajat ~1 ms, ruxsatlar ~7 ms (tegilmadi).
--   t2_akt_reestr (kompaniya 123, tur=f2, 60 akt): ~0,30 s, shundan ~0,28 s `manba` LATERAL
--   (`where q.akt_id = a.id order by q.id limit 1`) t2_akt_qator_pkey bo'ylab har aktga ~9 900 qator filtrlaydi
--   (108k buffer); qator soni o'sishi bilan chiziqli sekinlashadi. (akt_id, id) indeksi -> har akt 1 indeks probe.
-- O'zgarishlar:
--   1) t2_pul_tahlil_v1: prod ta'rifidan (md5 tekshiruvi bilan) pozitsion almashtirish: LATERAL -> GROUP BY subquery;
--      F2 cats sikli -> v_cfmap. Qolgan matn aynan saqlanadi. t2_pul_tahlil_v2 o'zgarmaydi (v1 ni chaqiradi).
--   2) Indeks t2_akt_qator(akt_id, id) (view ta'rifi o'zgarmaydi).
-- Eski nusxalar (*_eski) faqat qabul solishtiruvi va rollback uchun; ruxsat faqat postgres/service_role.
-- Langar topilmasa EXCEPTION (jim o'tmaydi).
begin;

do $do$
declare
  d text; p1 int; p2 int; p3 int; p4 int; pc int; v_blk text;
  c_lat constant text := ') x on true';
  c_acc constant text := 'c := v_koefmap -> (r.o_id::text);';
  c_cont constant text := 'continue when c is null;';
  c_z constant text := 'group by 1) z;';
  c_rows constant text := 'v_rows jsonb := ''[]''::jsonb;';
begin
  d := pg_get_functiondef('public.t2_pul_tahlil_v1(bigint,bigint,bigint,bigint,date,date,text)'::regprocedure);
  if position('v_cfmap' in d) > 0 then
    raise notice 'PUL_TEZLIK: t2_pul_tahlil_v1 allaqachon yangilangan - o''tkazildi';
    return;
  end if;
  if (select md5(prosrc) from pg_proc where oid = 'public.t2_pul_tahlil_v1(bigint,bigint,bigint,bigint,date,date,text)'::regprocedure)
     <> 'daac3ad4809a8267b77c75ac1625d3e0' then
    raise exception 'PUL_TEZLIK: t2_pul_tahlil_v1 prod ta''rifi kutilgandan farq qiladi (md5) - qo''lda ko''rib chiqing';
  end if;

  -- 0) Eski nusxalar: v1_eski (aynan prod) va v2_eski (v1_eski ni chaqiradi).
  if to_regprocedure('public.t2_pul_tahlil_v1_eski(bigint,bigint,bigint,bigint,date,date,text)') is null then
    execute replace(d, 'FUNCTION public.t2_pul_tahlil_v1(', 'FUNCTION public.t2_pul_tahlil_v1_eski(');
  end if;
  if to_regprocedure('public.t2_pul_tahlil_v2_eski(bigint,bigint,bigint,bigint,date,date,text,text)') is null then
    v_blk := pg_get_functiondef('public.t2_pul_tahlil_v2(bigint,bigint,bigint,bigint,date,date,text,text)'::regprocedure);
    if position('public.t2_pul_tahlil_v1(' in v_blk) = 0 then raise exception 'PUL_TEZLIK: v2 ichida v1 chaqiruvi topilmadi'; end if;
    v_blk := replace(v_blk, 'FUNCTION public.t2_pul_tahlil_v2(', 'FUNCTION public.t2_pul_tahlil_v2_eski(');
    execute replace(v_blk, 'public.t2_pul_tahlil_v1(', 'public.t2_pul_tahlil_v1_eski(');
  end if;
  revoke all on function public.t2_pul_tahlil_v1_eski(bigint,bigint,bigint,bigint,date,date,text) from public, anon, authenticated;
  revoke all on function public.t2_pul_tahlil_v2_eski(bigint,bigint,bigint,bigint,date,date,text,text) from public, anon, authenticated;
  grant execute on function public.t2_pul_tahlil_v1_eski(bigint,bigint,bigint,bigint,date,date,text) to service_role;
  grant execute on function public.t2_pul_tahlil_v2_eski(bigint,bigint,bigint,bigint,date,date,text,text) to service_role;

  -- 1) F2 cats sikli (oxiridan boshlab almashtiriladi, pozitsiyalar har safar qayta hisoblanadi).
  p3 := position(c_cont in d);
  p4 := position(c_z in d);
  if p3 = 0 or p4 = 0 or p4 < p3 then raise exception 'PUL_TEZLIK: F2 cats sikli langari topilmadi'; end if;
  v_blk := substr(d, p3 + length(c_cont), p4 + length(c_z) - (p3 + length(c_cont)));
  if position('into v_cf' in v_blk) = 0 or position('qq.obyekt_id = v_n' in v_blk) = 0 then
    raise exception 'PUL_TEZLIK: F2 cats bloki kutilgandek emas';
  end if;
  d := substr(d, 1, p3 + length(c_cont) - 1)
    || E'\n    -- PUL_TEZLIK v1: asosiy so''rovdagi (obyekt, kk) f2 yig''indisidan (bir xil filtrlar) - qayta so''rov yo''q.'
    || E'\n    v_cf := jsonb_build_object(''chel'', 0, ''mash'', 0, ''mat'', 0, ''ob'', 0, ''mk'', 0, ''kab'', 0, ''bez'', 0)'
    || E'\n            || coalesce(v_cfmap -> (v_n::text), ''{}''::jsonb);'
    || substr(d, p4 + length(c_z));

  -- 2) Asosiy sikl: har (obyekt, kk) f2 ni v_cfmap ga yig'ish.
  pc := position(c_acc in d);
  if pc = 0 then raise exception 'PUL_TEZLIK: asosiy sikl langari topilmadi'; end if;
  d := substr(d, 1, pc + length(c_acc) - 1)
    || E'\n    for v_cfk in select unnest(case r.kkk when ''ЧЕЛ'' then array[''chel''] when ''МАШ'' then array[''mash'']'
    || E'\n        when ''МАТ_ODDIY'' then array[''mat''] when ''М/К'' then array[''mat'',''mk''] when ''КАБ'' then array[''mat'',''kab'']'
    || E'\n        when ''БЕЗСКЛАД'' then array[''mat'',''bez''] when ''ОБ'' then array[''ob''] else array[]::text[] end) loop'
    || E'\n      v_cfmap := jsonb_set(v_cfmap, array[r.o_id::text], coalesce(v_cfmap -> (r.o_id::text), ''{}''::jsonb)'
    || E'\n        || jsonb_build_object(v_cfk, coalesce((v_cfmap -> (r.o_id::text) ->> v_cfk)::numeric, 0) + r.f2));'
    || E'\n    end loop;'
    || substr(d, pc + length(c_acc));

  -- 3) Asosiy so'rov: LATERAL -> qator_id bo'yicha GROUP BY + hash join (agregat ifodalari aynan).
  p1 := position('from q left join lateral (' in d);
  p2 := position(c_lat in d);
  if p1 = 0 or p2 = 0 or p2 < p1 or p2 > position('group by q.obyekt_id, q.kk' in d) then
    raise exception 'PUL_TEZLIK: asosiy LATERAL langari topilmadi';
  end if;
  v_blk := substr(d, p1, p2 + length(c_lat) - p1);
  if position('where aq.qator_id = q.id' in v_blk) = 0 then raise exception 'PUL_TEZLIK: LATERAL bloki kutilgandek emas'; end if;
  d := substr(d, 1, p1 - 1)
    || E'from q left join (\n'
    || E'      select aq.qator_id, sum(coalesce(aq.certified_amount, aq.summa)) as f2,\n'
    || E'             count(*) filter (where q2.tur not in (''rz'',''bl'') and coalesce(q2.nom,'''') !~* ''ЗАТРАТЫ\\s+ТРУДА\\s+МАШИНИСТ''\n'
    || E'                               and coalesce(aq.certified_amount, aq.summa) is null\n'
    || E'                               and coalesce(aq.certified_quantity, aq.hajm, 0) <> 0) as f2_nom\n'
    || E'        from public.t2_akt_qator aq\n'
    || E'        join public.t2_qator q2 on q2.id = aq.qator_id and q2.obyekt_id = any(v_obyektlar)\n'
    || E'        join public.t2_akt a on a.id = aq.akt_id and a.holat <> ''bekor''\n'
    || E'       where a.tur = ''f2'' and a.holat = ''tasdiqlangan''\n'
    || E'         and (v_gacha is null or a.oy <= v_gacha) and (v_dan is null or a.oy >= v_dan)\n'
    || E'       group by aq.qator_id\n'
    || E'    ) x on x.qator_id = q.id'
    || substr(d, p2 + length(c_lat));

  -- 4) O'zgaruvchilar.
  if position(c_rows in d) = 0 then raise exception 'PUL_TEZLIK: declare langari topilmadi'; end if;
  d := replace(d, c_rows, c_rows || ' v_cfmap jsonb := ''{}''::jsonb; v_cfk text;');

  execute d;
end $do$;

-- 5) t2_akt_reestr `manba` LATERAL (order by q.id limit 1) uchun: har akt 1 indeks probe.
create index if not exists t2_akt_qator_akt_id_id_idx on public.t2_akt_qator (akt_id, id);

commit;
