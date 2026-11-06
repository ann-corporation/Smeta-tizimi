-- Qabul (BEGIN..ROLLBACK): 20261203001600 qo'llangandan KEYIN. Hech narsa saqlanmaydi.
-- Eski ta'rif (rollback dagi aynan matn) temp view sifatida qayta yaratiladi va public.t2_qator_holat bilan
-- 153, 151, 162, 175 + butun jadval bo'yicha EXCEPT ALL (ikki tomon, qator va matn) = 0 bo'lishi shart.
-- Muvaffaqiyat: NOTICE 'HOLAT_TEZLIK_EKVIVALENT_PASS'. Vaqtlar - NOTICE.
begin;
set local statement_timeout = '900s';
do $pre$
begin
  if position('zm.v' in pg_get_viewdef('public.t2_qator_holat'::regclass)) = 0
     or not exists (select 1 from pg_proc where oid = 'public.t2_almashtirilgan_hajm(bigint)'::regprocedure and 'plan_cache_mode=force_generic_plan' = any(proconfig))
     or not exists (select 1 from pg_proc where oid = 'public.t2_almashtirilgan_oz_hajm(bigint)'::regprocedure and 'plan_cache_mode=force_generic_plan' = any(proconfig))
     or md5(pg_get_viewdef('public.t2_qator_holat'::regclass)) = 'f10fe2bc9f04601eedd1b32fd934c870' then
    raise exception 'HOLAT_TEZLIK: migratsiya qo''llanmagan';
  end if;
end $pre$;
create temp view holat_eski_tmp as

 SELECT q.id,
    q.id AS qator_id,
    q.obyekt_id,
    q.tur,
    q.raqam,
    q.kod,
    q.nom,
    q.birlik,
    q.kat,
        CASE
            WHEN q.versiya_holat = 'almashtirilgan'::text THEN 0::numeric
            ELSE q.hajm
        END AS smeta_hajm,
    q.narx AS smeta_narx,
        CASE
            WHEN q.versiya_holat = 'almashtirilgan'::text THEN 0::numeric
            ELSE q.summa
        END AS smeta_summa,
    e.fakt_hajm,
        CASE
            WHEN d.f2_hajm <> 0::numeric AND d.f2_summa_yoq = 0 AND e.fakt_hajm IS NOT NULL AND e.fakt_summa IS NOT NULL THEN _t2_f2_narxda_v1(e.fakt_hajm, d.f2_hajm, d.f2_summa_malum)
            ELSE e.fakt_summa
        END AS fakt_summa,
    d.f2_hajm,
    d.f2_summa_malum AS f2_summa,
        CASE
            WHEN q.versiya_holat = 'almashtirilgan'::text THEN 0::numeric
            ELSE q.hajm - d.f2_hajm - al.v
        END AS qoldiq_hajm,
        CASE
            WHEN q.versiya_holat = 'almashtirilgan'::text THEN 0::numeric
            ELSE q.summa - d.f2_summa_malum - COALESCE(als.s, 0::numeric)
        END AS qoldiq_summa,
    GREATEST(e.fakt_hajm - d.f2_hajm, 0::numeric) AS f2_mumkin_hajm,
    GREATEST(e.fakt_summa - d.f2_summa_malum, 0::numeric) AS f2_mumkin_summa,
        CASE
            WHEN d.f2_hajm <> 0::numeric THEN round(d.f2_summa_malum / d.f2_hajm, 2)
            ELSE NULL::numeric
        END AS f2_narx,
        CASE
            WHEN e.fakt_hajm <> 0::numeric THEN round(e.fakt_summa / e.fakt_hajm, 2)
            ELSE NULL::numeric
        END AS fakt_narx,
        CASE
            WHEN d.f2_hajm <> 0::numeric AND q.narx IS NOT NULL AND q.narx <> 0::numeric THEN round((d.f2_summa_malum / d.f2_hajm - q.narx) / q.narx * 100::numeric, 1)
            ELSE NULL::numeric
        END AS f2_narx_farq_foiz,
    q.ota_id,
    q.norma,
    d.direct_fakt_hajm,
    d.direct_fakt_summa,
    e.fakt_manbasi,
    d.f2_summa_nomalum,
    al.v AS almashtirilgan_hajm,
    als.s AS almashtirilgan_summa,
    q.versiya_holat,
    q.hajm AS asl_smeta_hajm,
    q.summa AS asl_smeta_summa,
    d.f2_summa_yoq,
        CASE
            WHEN e.fakt_manbasi = 'BL_NORMA'::text THEN
            CASE
                WHEN e.fakt_summa IS NULL AND COALESCE(e.fakt_hajm, 0::numeric) <> 0::numeric THEN 1::bigint
                ELSE 0::bigint
            END
            ELSE d.fakt_summa_nomalum
        END AS fakt_summa_nomalum
   FROM t2_qator q
     CROSS JOIN LATERAL ( SELECT
                CASE
                    WHEN (EXISTS ( SELECT 1
                       FROM t2_qator zz
                      WHERE zz.replaces_line_id = q.id AND zz.replaces_line_id IS NOT NULL)) OR (EXISTS ( SELECT 1
                       FROM t2_qator zz
                      WHERE zz.replaces_line_id = q.ota_id AND zz.replaces_line_id IS NOT NULL)) THEN t2_almashtirilgan_hajm(q.id)
                    ELSE 0::numeric
                END AS v) al
     CROSS JOIN LATERAL ( SELECT
                CASE
                    WHEN COALESCE(al.v, 0::numeric) = 0::numeric THEN 0::numeric
                    WHEN q.narx IS NOT NULL THEN al.v * q.narx
                    WHEN q.hajm IS NOT NULL AND q.hajm <> 0::numeric AND q.summa IS NOT NULL THEN al.v * q.summa / q.hajm
                    ELSE NULL::numeric
                END AS s) als
     LEFT JOIN LATERAL ( SELECT COALESCE(sum(aq.hajm) FILTER (WHERE a.tur = 'fakt'::text AND a.holat <> 'bekor'::text), 0::numeric) AS direct_fakt_hajm,
            COALESCE(sum(aq.summa) FILTER (WHERE a.tur = 'fakt'::text AND a.holat <> 'bekor'::text), 0::numeric) AS direct_fakt_summa,
            COALESCE(sum(COALESCE(aq.certified_quantity, aq.hajm)) FILTER (WHERE a.tur = 'f2'::text AND a.holat = 'tasdiqlangan'::text), 0::numeric) AS f2_hajm,
            COALESCE(sum(COALESCE(aq.certified_amount, aq.summa)) FILTER (WHERE a.tur = 'f2'::text AND a.holat = 'tasdiqlangan'::text), 0::numeric) AS f2_summa_malum,
            count(*) FILTER (WHERE a.tur = 'f2'::text AND a.holat = 'tasdiqlangan'::text AND (q.tur <> ALL (ARRAY['rz'::text, 'bl'::text])) AND COALESCE(q.nom, ''::text) !~* 'ЗАТРАТЫ\s+ТРУДА\s+МАШИНИСТ'::text AND COALESCE(aq.certified_amount, aq.summa) IS NULL AND COALESCE(aq.certified_quantity, aq.hajm, 0::numeric) <> 0::numeric) AS f2_summa_nomalum,
            count(*) FILTER (WHERE a.tur = 'f2'::text AND a.holat = 'tasdiqlangan'::text AND COALESCE(aq.certified_amount, aq.summa) IS NULL AND COALESCE(aq.certified_quantity, aq.hajm, 0::numeric) <> 0::numeric) AS f2_summa_yoq,
            count(*) FILTER (WHERE a.tur = 'fakt'::text AND a.holat <> 'bekor'::text AND aq.summa IS NULL AND COALESCE(aq.hajm, 0::numeric) <> 0::numeric) AS fakt_summa_nomalum
           FROM t2_akt_qator aq
             LEFT JOIN t2_akt a ON a.id = aq.akt_id
          WHERE aq.qator_id = q.id) d ON true
     LEFT JOIN LATERAL ( SELECT count(p.id) AS bl_soni,
            COALESCE(sum(paq.hajm) FILTER (WHERE pa.tur = 'fakt'::text AND pa.holat <> 'bekor'::text), 0::numeric) AS fakt_hajm,
            COALESCE(sum(paq.hajm) FILTER (WHERE pa.tur = 'fakt'::text AND pa.holat <> 'bekor'::text AND paq.narx_manba = 'f2_sertifikat'::text), 0::numeric) AS f2s_hajm
           FROM t2_qator p
             LEFT JOIN t2_akt_qator paq ON paq.qator_id = p.id
             LEFT JOIN t2_akt pa ON pa.id = paq.akt_id
          WHERE q.tur = 'rs'::text AND q.norma IS NOT NULL AND p.id = q.ota_id AND p.obyekt_id = q.obyekt_id AND p.tur = 'bl'::text) bl ON true
     CROSS JOIN LATERAL ( SELECT
                CASE
                    WHEN bl.bl_soni > 0 AND d.direct_fakt_hajm = 0::numeric THEN (bl.fakt_hajm - bl.f2s_hajm) * q.norma
                    ELSE d.direct_fakt_hajm
                END AS fakt_hajm,
                CASE
                    WHEN bl.bl_soni > 0 AND d.direct_fakt_hajm = 0::numeric THEN
                    CASE
                        WHEN q.narx IS NULL THEN NULL::numeric
                        ELSE (bl.fakt_hajm - bl.f2s_hajm) * q.norma * q.narx
                    END
                    ELSE d.direct_fakt_summa
                END AS fakt_summa,
                CASE
                    WHEN bl.bl_soni > 0 AND d.direct_fakt_hajm = 0::numeric THEN 'BL_NORMA'::text
                    ELSE 'DIRECT'::text
                END AS fakt_manbasi) e;

do $t$
declare
  ob bigint; t0 timestamptz; ms_e numeric; ms_y numeric; h_e text; h_y text;
  d1 bigint; d2 bigint; d3 bigint; d4 bigint; jami bigint := 0; n bigint; r record; aid bigint; qid bigint;
begin
  -- isitish (plpgsql/plan kesh) - o'lchov adolatli bo'lsin
  perform sum(hashtext(v::text)) from holat_eski_tmp v where obyekt_id = 153;
  perform sum(hashtext(v::text)) from public.t2_qator_holat v where obyekt_id = 153;

  foreach ob in array array[153,151,162,175]::bigint[] loop
    t0 := clock_timestamp();
    select count(*)||':'||coalesce(sum(hashtext(v::text)),0) into h_e from holat_eski_tmp v where obyekt_id = ob;
    ms_e := round(extract(epoch from clock_timestamp() - t0)::numeric * 1000);
    t0 := clock_timestamp();
    select count(*)||':'||coalesce(sum(hashtext(v::text)),0) into h_y from public.t2_qator_holat v where obyekt_id = ob;
    ms_y := round(extract(epoch from clock_timestamp() - t0)::numeric * 1000);
    select count(*) into d1 from (select * from holat_eski_tmp where obyekt_id = ob except all select * from public.t2_qator_holat where obyekt_id = ob) x;
    select count(*) into d2 from (select * from public.t2_qator_holat where obyekt_id = ob except all select * from holat_eski_tmp where obyekt_id = ob) x;
    -- matn ko'rinishida ham (numeric scale, NULL vs 0 farqi ham ushlanadi)
    select count(*) into d3 from (select v::text from holat_eski_tmp v where obyekt_id = ob except all select v::text from public.t2_qator_holat v where obyekt_id = ob) x;
    select count(*) into d4 from (select v::text from public.t2_qator_holat v where obyekt_id = ob except all select v::text from holat_eski_tmp v where obyekt_id = ob) x;
    jami := jami + d1 + d2 + d3 + d4;
    raise notice 'HOLAT obyekt=% | eski % ms | yangi % ms | hash_eski=% hash_yangi=% | farq eski\yangi=% yangi\eski=% | matn farq=% / %',
      ob, ms_e, ms_y, h_e, h_y, d1, d2, d3, d4;
  end loop;

  -- butun jadval (filtrsiz) - barcha obyektlar
  t0 := clock_timestamp();
  select count(*) into n from (select v::text from holat_eski_tmp v) x;
  ms_e := round(extract(epoch from clock_timestamp() - t0)::numeric * 1000);
  t0 := clock_timestamp();
  select count(*) into n from (select v::text from public.t2_qator_holat v) x;
  ms_y := round(extract(epoch from clock_timestamp() - t0)::numeric * 1000);
  select count(*) into d1 from (select v::text from holat_eski_tmp v except all select v::text from public.t2_qator_holat v) x;
  select count(*) into d2 from (select v::text from public.t2_qator_holat v except all select v::text from holat_eski_tmp v) x;
  jami := jami + d1 + d2;
  raise notice 'HOLAT HAMMASI qatorlar=% | eski % ms | yangi % ms | matn farq=% / %', n, ms_e, ms_y, d1, d2;

  -- keyset sahifa (frontend /api/sb: qator_id > N order by qator_id limit 5000)
  select q.id into qid from public.t2_qator q where q.obyekt_id = 153 order by q.id offset 10000 limit 1;
  t0 := clock_timestamp();
  select count(*)||':'||coalesce(sum(hashtext(x::text)),0) into h_e from (select * from holat_eski_tmp v where obyekt_id = 153 and qator_id > qid order by qator_id limit 5000) x;
  ms_e := round(extract(epoch from clock_timestamp() - t0)::numeric * 1000);
  t0 := clock_timestamp();
  select count(*)||':'||coalesce(sum(hashtext(x::text)),0) into h_y from (select * from public.t2_qator_holat v where obyekt_id = 153 and qator_id > qid order by qator_id limit 5000) x;
  ms_y := round(extract(epoch from clock_timestamp() - t0)::numeric * 1000);
  if h_e <> h_y then jami := jami + 1; end if;
  raise notice 'HOLAT KEYSET 153 (qator_id > %, limit 5000) | eski % ms | yangi % ms | hash teng=%', qid, ms_e, ms_y, h_e = h_y;

  -- bitta qator (id = X) va akt-join (t2_akt_tasdiqlash / qoralama_yangila shakli)
  select aq.akt_id, aq.qator_id into aid, qid from public.t2_akt_qator aq join public.t2_akt a on a.id = aq.akt_id
   where a.obyekt_id = 153 order by aq.id desc limit 1;
  t0 := clock_timestamp();
  select coalesce(sum(hashtext(v::text)),0)::text into h_e from holat_eski_tmp v where id = qid;
  ms_e := round(extract(epoch from clock_timestamp() - t0)::numeric * 1000, 1);
  t0 := clock_timestamp();
  select coalesce(sum(hashtext(v::text)),0)::text into h_y from public.t2_qator_holat v where id = qid;
  ms_y := round(extract(epoch from clock_timestamp() - t0)::numeric * 1000, 1);
  if h_e <> h_y then jami := jami + 1; end if;
  raise notice 'HOLAT id=% | eski % ms | yangi % ms | teng=%', qid, ms_e, ms_y, h_e = h_y;
  t0 := clock_timestamp();
  select count(*)||':'||coalesce(sum(hashtext(h::text)),0) into h_e from public.t2_akt_qator aq join holat_eski_tmp h on h.id = aq.qator_id and h.obyekt_id = 153 where aq.akt_id = aid;
  ms_e := round(extract(epoch from clock_timestamp() - t0)::numeric * 1000, 1);
  t0 := clock_timestamp();
  select count(*)||':'||coalesce(sum(hashtext(h::text)),0) into h_y from public.t2_akt_qator aq join public.t2_qator_holat h on h.id = aq.qator_id and h.obyekt_id = 153 where aq.akt_id = aid;
  ms_y := round(extract(epoch from clock_timestamp() - t0)::numeric * 1000, 1);
  if h_e <> h_y then jami := jami + 1; end if;
  raise notice 'HOLAT akt-join akt_id=% (%) | eski % ms | yangi % ms | teng=%', aid, h_y, ms_e, ms_y, h_e = h_y;

  for r in execute 'explain (analyze, timing off, summary on, costs off) select * from public.t2_qator_holat where obyekt_id = 153' loop
    raise notice 'public.t2_qator_holat PLAN: %', r."QUERY PLAN";
  end loop;

  if jami <> 0 then
    raise exception 'HOLAT_TEZLIK: EKVIVALENTLIK BUZILDI - jami farq %', jami;
  end if;
  raise notice 'HOLAT_TEZLIK_EKVIVALENT_PASS (jami farq 0)';
end $t$;
rollback;
