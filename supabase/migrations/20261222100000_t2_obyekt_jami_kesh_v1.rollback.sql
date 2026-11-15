-- Rollback: 20261222100000_t2_obyekt_jami_kesh_v1 (oldingi md5(prosrc _t2_kesh_hisobla_v1)=ea69d54ae3979be4307d638ccaf050b3). View'ni jonli agregatga va _t2_kesh_hisobla_v1 ni oldingi ta'rifga qaytaradi, kesh jadvalini o'chiradi.
begin;

CREATE OR REPLACE VIEW public.t2_obyekt_jami AS
 SELECT o.id,
    o.nom,
    o.tur,
    COALESCE(a.qator_soni, 0::bigint) AS qator_soni,
    COALESCE(a.razdel, 0::bigint) AS razdel,
    COALESCE(a.ish, 0::bigint) AS ish,
    COALESCE(a.resurs, 0::bigint) AS resurs,
    a.barg_asl AS jami,
    COALESCE(a.narxsiz, 0::bigint) AS narxsiz,
    a.chel,
    a.mash,
    a.mat,
    a.ob,
    o.yangilandi,
    o.kompaniya_id,
    o.lat,
    o.lng,
    o.versiya,
    o.loyiha_id
   FROM t2_obyekt o
     LEFT JOIN LATERAL ( SELECT count(*) AS qator_soni,
            count(*) FILTER (WHERE q.tur = 'rz'::text) AS razdel,
            count(*) FILTER (WHERE q.tur = 'bl'::text) AS ish,
            count(*) FILTER (WHERE q.tur = 'rs'::text) AS resurs,
            sum(q.summa) FILTER (WHERE ch.ota_id IS NULL AND t2_qator_asl_v1(q.change_type, q.qoshimcha, q.zamena)) AS barg_asl,
            count(DISTINCT ROW(upper(btrim(COALESCE(q.nom, ''::text))), COALESCE(q.birlik, ''::text))) FILTER (WHERE (q.tur = ANY (ARRAY['rs'::text, 'mat'::text, 'ob'::text])) AND q.narx IS NULL AND COALESCE(q.nom, ''::text) !~* 'ЗАТРАТЫ\s+ТРУДА\s+МАШИНИСТ'::text) AS narxsiz,
            sum(q.summa) FILTER (WHERE (q.tur = ANY (ARRAY['rs'::text, 'mat'::text, 'ob'::text])) AND q.kat = 'ЧЕЛ'::text AND t2_qator_asl_v1(q.change_type, q.qoshimcha, q.zamena)) AS chel,
            sum(q.summa) FILTER (WHERE (q.tur = ANY (ARRAY['rs'::text, 'mat'::text, 'ob'::text])) AND q.kat = 'МАШ'::text AND t2_qator_asl_v1(q.change_type, q.qoshimcha, q.zamena)) AS mash,
            sum(q.summa) FILTER (WHERE (q.tur = ANY (ARRAY['rs'::text, 'mat'::text, 'ob'::text])) AND q.kat = 'МАТ'::text AND t2_qator_asl_v1(q.change_type, q.qoshimcha, q.zamena)) AS mat,
            sum(q.summa) FILTER (WHERE (q.tur = ANY (ARRAY['rs'::text, 'mat'::text, 'ob'::text])) AND q.kat = 'ОБ'::text AND t2_qator_asl_v1(q.change_type, q.qoshimcha, q.zamena)) AS ob
           FROM t2_qator q
             LEFT JOIN ( SELECT DISTINCT c.ota_id
                   FROM t2_qator c
                  WHERE c.obyekt_id = o.id AND c.ota_id IS NOT NULL) ch ON ch.ota_id = q.id
          WHERE q.obyekt_id = o.id AND q.versiya_holat = 'faol'::text) a ON true
  WHERE o.holat <> 'bekor'::text;

CREATE OR REPLACE FUNCTION public._t2_kesh_hisobla_v1(p_obyekt_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_komp bigint; v_t0 timestamptz := clock_timestamp(); v_oy jsonb := '{}'::jsonb; m date;
  v_bugun date := (now() at time zone 'Asia/Tashkent')::date;
begin
  select o.kompaniya_id into v_komp from public.t2_obyekt o where o.id = p_obyekt_id;
  if v_komp is null then
    delete from public.t2_obyekt_kesh where obyekt_id = p_obyekt_id;
    return;
  end if;
  foreach m in array array[date_trunc('month', v_bugun)::date, (date_trunc('month', v_bugun) - interval '1 month')::date] loop
    v_oy := v_oy || jsonb_build_object(to_char(m, 'YYYY-MM'), public._t2_kesh_oy_paket_v1(p_obyekt_id, m));
  end loop;
  insert into public.t2_obyekt_kesh as k (obyekt_id, kompaniya_id, smeta, smeta_joriy, fakt, f2, f2_qoralama, f2_oy, hisoblandi, hisob_ms)
  values (p_obyekt_id, v_komp,
          (select p.paket from public._t2_summa_paket_v1(array[p_obyekt_id], 'smeta') p),
          public._t2_kesh_joriy_v1(p_obyekt_id),
          (select p.paket from public._t2_summa_paket_v1(array[p_obyekt_id], 'fakt') p),
          (select p.paket from public._t2_summa_paket_v1(array[p_obyekt_id], 'f2') p),
          (select p.paket from public._t2_summa_paket_v1(array[p_obyekt_id], 'f2_qoralama') p),
          v_oy, now(), (extract(epoch from clock_timestamp() - v_t0) * 1000)::int)
  on conflict (obyekt_id) do update
    set kompaniya_id = excluded.kompaniya_id, smeta = excluded.smeta, smeta_joriy = excluded.smeta_joriy, fakt = excluded.fakt, f2 = excluded.f2,
        f2_qoralama = excluded.f2_qoralama, f2_oy = excluded.f2_oy, hisoblandi = excluded.hisoblandi, hisob_ms = excluded.hisob_ms;
end $function$;

drop function if exists public._t2_obyekt_jami_kesh_hisobla_v1(bigint);
drop table if exists public.t2_obyekt_jami_kesh;

commit;
