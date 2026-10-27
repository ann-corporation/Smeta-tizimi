-- C) B dan keyin: o'chgan qatorlar egallagan diskni qaytarish (har biri alohida, tranzaksiyasiz ishga tushiring).
-- Jadval bir necha soniya-daqiqa band bo'ladi. Oxirgi qator — yangi hajm.
vacuum full analyze public.t2_qator_muhr;
vacuum full analyze public.t2_qator;
vacuum full analyze public.t2_akt_qator;
vacuum full analyze public.t2_ozgarish;
vacuum full analyze public.t2_f2_import_draft_qator;
vacuum full analyze public.t2_signal;
vacuum full analyze public.t2_xom;
select pg_size_pretty(pg_database_size(current_database())) as yangi_hajm;
