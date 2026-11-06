-- 20261203001600_t2_qator_holat_tezlik_v1
--
-- MAQSAD: t2_qator_holat ni katta obyektlarda tezlashtirish (Sun'iy ko'l = 153, 26 475 qator; Amfiteatr = 151).
-- Ustunlar, turlar, tartib va QIYMATLAR o'zgarmaydi (asos: 20261203001500_t2_f2_tuzatish_v1 dagi prod ta'rifi,
-- md5 f10fe2bc9f04601eedd1b32fd934c870).
--
-- Tashxis (prod, obyekt 153, EXPLAIN ANALYZE timing off):
--   * akt agregatlari (d, bl) — LATERAL, ≈0.42 s. Set-based (GROUP BY) varianti sinab ko'rildi: ≈0.44 s — bu
--     hajmda yutuq yo'q, aksincha akt-join iste'molchilari (t2_akt_tasdiqlash, t2_f2_qoralama_yangila_v1,
--     t2_fakt_belgila*) uchun parametrlanish yo'qoladi. Shuning uchun d/bl O'ZGARMADI (aynan asl matn).
--   * Asosiy sabab — al.v (zamena hajmi): u view tanasida 8 joyga inline bo'lib, t2_almashtirilgan_hajm()
--     bir qatorga bir necha marta chaqirilardi (faqat zamena ustunlari ≈0.8 s), ichki plpgsql so'rovlari esa
--     plan_cache_mode=auto da ba'zan har chaqiruvda qayta planlanardi (custom plan): xuddi shu so'rov 0.7 s
--     yoki 3–18 s.
--
-- Yangi shakl:
--   * zm — zamenaga aloqador qatorlar (z.id yoki z.ota_id replaces_line_id to'plamida) alohida filtrlangan skan,
--     funksiya qatorga BIR marta. al.v = CASE WHEN zm.id IS NOT NULL THEN zm.v ELSE 0 END — asl
--     CASE WHEN EXISTS(..q.id) OR EXISTS(..q.ota_id) THEN f(q.id) ELSE 0 END bilan aynan bir xil
--     (q.ota_id NULL → IN NULL → qator zm ga kirmaydi → 0, asl EXISTS false → 0). obyekt_id / id sharti
--     ekvivalentlik orqali zm ichiga tushadi.
--   * t2_almashtirilgan_hajm / t2_almashtirilgan_oz_hajm: SET plan_cache_mode = force_generic_plan.
-- versiya: tarix — view filtrsiz (asl ta'rif kabi), versiya_holat ustuni va 'almashtirilgan' qoidasi saqlangan.
-- Grant va izoh CREATE OR REPLACE da saqlanadi. Ekvivalentlik isboti: .acceptance.sql (EXCEPT ALL ikki tomon = 0).
-- Eslatma: t2_obyekt_paket_muhr_v1 view/funksiya md5 ni muhrlaydi — qo'llangach mavjud paket muhrlari
-- «eskirgan» bo'ladi (har view o'zgarishidagi kabi, masalan 20261203001500).

begin;

do $pre$
begin
  if md5(pg_get_viewdef('public.t2_qator_holat'::regclass)) <> 'f10fe2bc9f04601eedd1b32fd934c870' then
    raise exception 'HOLAT_TEZLIK: t2_qator_holat 20261203001500 ta''rifida emas (md5 mos emas) — rollback ni yangilamasdan qo''llanmaydi';
  end if;
end $pre$;

create or replace view public.t2_qator_holat as
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
     LEFT JOIN ( SELECT z.obyekt_id,
            z.id,
            t2_almashtirilgan_hajm(z.id) AS v
           FROM t2_qator z
          WHERE (z.id IN ( SELECT zz.replaces_line_id
                   FROM t2_qator zz
                  WHERE zz.replaces_line_id IS NOT NULL)) OR (z.ota_id IN ( SELECT zz.replaces_line_id
                   FROM t2_qator zz
                  WHERE zz.replaces_line_id IS NOT NULL))) zm ON zm.id = q.id AND zm.obyekt_id = q.obyekt_id
     CROSS JOIN LATERAL ( SELECT
                CASE
                    WHEN zm.id IS NOT NULL THEN zm.v
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

-- Zamena funksiyalari: ichki so'rovlar har chaqiruvda qayta planlanmasin (natijaga ta'sir qilmaydi — faqat plan).
alter function public.t2_almashtirilgan_hajm(bigint) set plan_cache_mode = force_generic_plan;
alter function public.t2_almashtirilgan_oz_hajm(bigint) set plan_cache_mode = force_generic_plan;

commit;