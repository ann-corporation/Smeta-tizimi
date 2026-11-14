-- ROLLBACK: 20261216510000_t2_tender_ochiq_p1_v1
-- Faqat yangi funksiyalar olib tashlanadi. Mavjud tender jadvallari/RPC lari va yaratilgan buyurtma, aloqa, narx manbasi, jurnal qatorlari QOLADI. BEGIN/COMMIT yo'q.
drop trigger if exists t2_birja_rfq_muddat_muhr on public.t2_birja_rfq;
drop function if exists public._t2_tn_muddat_muhr_trg();
alter table public.t2_birja_rfq drop column if exists asl_muddat;
drop function if exists public.t2_tn_korsatish_v1(bigint, bigint, uuid, jsonb);
drop function if exists public.t2_tn_bayonnoma_v1(bigint, bigint, bigint);
drop function if exists public.t2_tn_ogohlantirish_v1(bigint, bigint, bigint);
drop function if exists public._t2_tn_flaglar(bigint);
drop function if exists public.t2_tn_ish_qadam_v1(bigint, bigint, uuid, jsonb);
drop function if exists public.t2_tn_narx_manba_v1(bigint, bigint, uuid, jsonb);
drop function if exists public.t2_tn_aloqa_v1(bigint, bigint, uuid, jsonb);
drop function if exists public.t2_tn_lot_smetadan_v1(bigint, bigint, uuid, jsonb);
drop function if exists public.t2_tn_ochiq_lot_v1(bigint);
drop function if exists public.t2_tn_ochiq_royxat_v1(jsonb);
drop function if exists public._t2_tn_ochilgan(bigint);
