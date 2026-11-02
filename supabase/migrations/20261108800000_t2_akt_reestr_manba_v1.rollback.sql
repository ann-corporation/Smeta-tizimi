-- ROLLBACK: 20261108800000_t2_akt_reestr_manba_v1.sql
-- create or replace view ustun kamaytira olmaydi -> t2_akt_reestr drop+create (avvalgi 20 ustun, lifecycle_status gacha), ruxsatlar qayta beriladi.
begin;
drop view if exists public.t2_shartnoma_bog_kompaniya;
drop view public.t2_akt_reestr;
create view public.t2_akt_reestr as
 SELECT r.id, r.obyekt_id, r.kompaniya_id, r.obyekt, r.tur, r.raqam, r.oy, r.holat, r.fayl_id, r.izoh, r.yaratildi,
    r.hujjat_jami, r.yozilgan_jami, r.qator_soni, r.narxsiz_qator, r.manfiy_qator, r.farq, r.reestr_holat, r.versiya,
    a.lifecycle_status
   FROM ( SELECT a_1.id, a_1.obyekt_id, a_1.kompaniya_id, o.nom AS obyekt, a_1.tur, a_1.raqam, a_1.oy, a_1.holat, a_1.fayl_id, a_1.izoh, a_1.yaratildi,
            a_1.hujjat_jami,
            COALESCE(r_1.yozilgan, 0::numeric) AS yozilgan_jami,
            r_1.qator_soni, r_1.narxsiz_qator, r_1.manfiy_qator,
                CASE WHEN a_1.hujjat_jami IS NULL THEN NULL::numeric ELSE a_1.hujjat_jami - COALESCE(r_1.yozilgan, 0::numeric) END AS farq,
                CASE WHEN a_1.hujjat_jami IS NULL THEN 'jami_nomalum'::text
                     WHEN abs(a_1.hujjat_jami - COALESCE(r_1.yozilgan, 0::numeric)) <= GREATEST(1::numeric, abs(a_1.hujjat_jami) * 0.0001) THEN 'mos'::text
                     ELSE 'farq'::text END AS reestr_holat,
            a_1.versiya
           FROM t2_akt a_1
             JOIN t2_obyekt o ON o.id = a_1.obyekt_id
             LEFT JOIN LATERAL ( SELECT sum(aq.summa) AS yozilgan, count(*) AS qator_soni,
                    count(*) FILTER (WHERE aq.narx IS NULL) AS narxsiz_qator,
                    count(*) FILTER (WHERE aq.hajm < 0::numeric) AS manfiy_qator
                   FROM t2_akt_qator aq WHERE aq.akt_id = a_1.id) r_1 ON true) r
     JOIN t2_akt a ON a.id = r.id;
revoke all on public.t2_akt_reestr from public, anon, authenticated;
grant all on public.t2_akt_reestr to service_role;
commit;