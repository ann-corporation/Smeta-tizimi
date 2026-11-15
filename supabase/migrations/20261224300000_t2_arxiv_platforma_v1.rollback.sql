-- Rollback 20261224100000. Arxivlangan ma'lumot R2 da qoladi (o'chirilmaydi); manifest jadvali o'chirilsa R2 obyektlari yetim bo'ladi -
-- shuning uchun avval t2_arxiv_tikla_v1 bilan kerakli partiyalarni tiklang yoki manifestni saqlab qoling.
drop function if exists public.t2_arxiv_ogohlantir_v1(text, jsonb);
drop function if exists public.t2_arxiv_holat_v1();
drop function if exists public.t2_arxiv_jurnal_yoz_v1(text, text, bigint, bigint, text);
drop function if exists public.t2_arxiv_snap_sovut_v1(text, text, text, bigint);
drop function if exists public.t2_arxiv_snap_oqi_v1(text);
drop function if exists public.t2_arxiv_snap_nomzod_v1(integer, integer);
drop function if exists public.t2_arxiv_tikla_v1(text, text, jsonb);
drop function if exists public.t2_arxiv_ochir_v1(text, text, text[]);
drop function if exists public.t2_arxiv_yoz_v1(text, text, text, integer, text, bigint);
drop function if exists public.t2_arxiv_batch_v1(text, integer, text);
-- Jadvallar: faqat t2_arxiv_bolak bo'sh bo'lsa o'chiriladi.
do $$ begin
  if exists (select 1 from public.t2_arxiv_bolak) then raise exception 'rollback: t2_arxiv_bolak bo''sh emas - avval partiyalarni tiklang'; end if;
end $$;
drop table if exists public.t2_arxiv_ish_jurnal;
drop table if exists public.t2_arxiv_bolak;
drop table if exists public.t2_arxiv_siyosat;
