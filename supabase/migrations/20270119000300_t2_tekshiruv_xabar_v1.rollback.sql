-- Orqaga qaytarish: xabarnoma triggerlari va Excel import RPC. Jadvallarga tegilmaydi.
drop trigger if exists t2_f2_tekshiruv_akt_outbox_trg on public.t2_akt;
drop trigger if exists t2_f2_tekshiruv_qaror_outbox_trg on public.t2_f2_tekshiruv_taklif;
drop trigger if exists t2_f2_tekshiruv_holat_outbox_trg on public.t2_f2_tekshiruv;
drop function if exists public._t2_f2_tekshiruv_akt_outbox();
drop function if exists public._t2_f2_tekshiruv_qaror_outbox();
drop function if exists public._t2_f2_tekshiruv_holat_outbox();
drop function if exists public.t2_f2_tekshiruv_excel_import_v1(bigint, bigint, bigint, jsonb, text);
