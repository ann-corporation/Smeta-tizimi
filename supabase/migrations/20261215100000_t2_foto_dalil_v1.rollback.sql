-- rollback 20261215100000_t2_foto_dalil_v1
-- Diqqat: t2_foto_dalil dagi bog'lanishlar yo'qoladi; fayllar (t2_document_registry/R2) tegilmaydi.
-- versiya: texnik
drop function if exists public.t2_foto_dalil_royxat_v1(bigint, bigint, bigint, bigint, text, bigint, date, date, integer, bigint);
drop function if exists public.t2_foto_dalil_ochir_v1(bigint, bigint, bigint);
drop function if exists public.t2_foto_dalil_yangila_v1(bigint, bigint, bigint, text, text, jsonb, boolean, text, bigint);
drop function if exists public.t2_foto_dalil_bogla_v1(bigint, bigint, bigint, bigint, text, bigint, date, numeric, numeric, text, uuid);
drop function if exists public._t2_foto_manba_tekshir(bigint, bigint, text, bigint);
drop table if exists public.t2_foto_dalil;
