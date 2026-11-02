-- F2 reestr N+1 ni yo'qotish (2026-11-08). Faqat O'QISH ko'rinishlari; jadval/ma'lumot o'zgarmaydi.
--  (1) t2_akt_reestr oxiriga: manba, import_job_id, hujjat_id, manba_bor — har aktning birinchi t2_akt_qator qatori
--      raw_snapshot'idan (frontend manbaAniqla() o'qiydigan kalitlar: import_job_id, hujjat_id, manba). Qator yo'q bo'lsa manba_bor=false.
--  (2) t2_shartnoma_bog_kompaniya: t2_shartnoma_bog + kompaniya_id (t2_obyekt orqali) — kompaniya bo'yicha bitta o'qish.
-- Indeks: t2_akt_qator_akt_idx (akt_id) mavjud (LATERAL shuni ishlatadi). Ruxsatlar avvalgidek (postgres/service_role).
begin;

create or replace view public.t2_akt_reestr as
 SELECT r.id, r.obyekt_id, r.kompaniya_id, r.obyekt, r.tur, r.raqam, r.oy, r.holat, r.fayl_id, r.izoh, r.yaratildi,
    r.hujjat_jami, r.yozilgan_jami, r.qator_soni, r.narxsiz_qator, r.manfiy_qator, r.farq, r.reestr_holat, r.versiya,
    a.lifecycle_status,
    m.manba_xom AS manba,
    CASE WHEN m.job ~ '^\d+$' THEN m.job::bigint END AS import_job_id,
    CASE WHEN m.huj ~ '^\d+$' THEN m.huj::bigint END AS hujjat_id,
    (m.q_id IS NOT NULL) AS manba_bor
   FROM ( SELECT a_1.id, a_1.obyekt_id, a_1.kompaniya_id, o.nom AS obyekt, a_1.tur, a_1.raqam, a_1.oy, a_1.holat, a_1.fayl_id, a_1.izoh, a_1.yaratildi,
            a_1.hujjat_jami,
            COALESCE(r_1.yozilgan, 0::numeric) AS yozilgan_jami,
            r_1.qator_soni, r_1.narxsiz_qator, r_1.manfiy_qator,
                CASE
                    WHEN a_1.hujjat_jami IS NULL THEN NULL::numeric
                    ELSE a_1.hujjat_jami - COALESCE(r_1.yozilgan, 0::numeric)
                END AS farq,
                CASE
                    WHEN a_1.hujjat_jami IS NULL THEN 'jami_nomalum'::text
                    WHEN abs(a_1.hujjat_jami - COALESCE(r_1.yozilgan, 0::numeric)) <= GREATEST(1::numeric, abs(a_1.hujjat_jami) * 0.0001) THEN 'mos'::text
                    ELSE 'farq'::text
                END AS reestr_holat,
            a_1.versiya
           FROM t2_akt a_1
             JOIN t2_obyekt o ON o.id = a_1.obyekt_id
             LEFT JOIN LATERAL ( SELECT sum(aq.summa) AS yozilgan,
                    count(*) AS qator_soni,
                    count(*) FILTER (WHERE aq.narx IS NULL) AS narxsiz_qator,
                    count(*) FILTER (WHERE aq.hajm < 0::numeric) AS manfiy_qator
                   FROM t2_akt_qator aq
                  WHERE aq.akt_id = a_1.id) r_1 ON true) r
     JOIN t2_akt a ON a.id = r.id
     LEFT JOIN LATERAL ( SELECT q.id AS q_id,
            q.raw_snapshot ->> 'manba' AS manba_xom,
            q.raw_snapshot ->> 'import_job_id' AS job,
            q.raw_snapshot ->> 'hujjat_id' AS huj
           FROM t2_akt_qator q
          WHERE q.akt_id = a.id
          ORDER BY q.id
         LIMIT 1) m ON true;

create or replace view public.t2_shartnoma_bog_kompaniya as
 select b.id, b.obyekt_id, b.shartnoma_id, b.holat, o.kompaniya_id
   from public.t2_shartnoma_bog b
   join public.t2_obyekt o on o.id = b.obyekt_id;
revoke all on public.t2_shartnoma_bog_kompaniya from public, anon, authenticated;
grant select on public.t2_shartnoma_bog_kompaniya to service_role;

commit;