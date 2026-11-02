-- ROLLBACK: 20261108000000_t2_ekotizim_f1_yadro_v1.sql
-- Faqat shu migratsiya yaratgan obyektlarni olib tashlaydi. Mavjud jadval/RPC larga tegmaydi.
-- DIQQAT: yangi jadvallardagi ma'lumot (bildirishnoma, outbox, yo'nalishlar, baho) yo'qoladi — qo'llashdan oldin
-- kerak bo'lsa eksport qiling. t2_kontragent.tomon_kompaniya_id / t2_kadr_mustaqil.foydalanuvchi_id / telefon /
-- obyekt joylashuvi ustunlaridagi qiymatlar ham yo'qoladi.

begin;

drop trigger if exists t2_tomon_hodisa_outbox_trg on public.t2_tomon_hodisa;

drop function if exists public.t2_tomon_grant_shablon_v1(bigint,bigint,text,text);
drop function if exists public.t2_kontragent_tomon_bog_v1(bigint,bigint,bigint,bigint,integer,uuid);
drop function if exists public.t2_katalog_qidir_v1(bigint,text,text,text,text,integer,text);
drop function if exists public.t2_kompaniya_faoliyat_saqla_v1(bigint,bigint,jsonb,uuid);
drop function if exists public.t2_shaxs_yonalish_saqla_v1(bigint,jsonb,uuid);
drop function if exists public._t2_obyekt_doira_ok(bigint,bigint,bigint);
drop function if exists public.t2_bildirishnoma_oqildi_v1(bigint,bigint[]);
drop function if exists public.t2_bildirishnomalar_v1(bigint,boolean,integer,bigint);
drop function if exists public.t2_outbox_ishlov_v1(text,integer);
drop function if exists public._t2_tomon_hodisa_outbox();
drop function if exists public.t2_outbox_yoz(bigint,text,text,bigint,jsonb,bigint,uuid,bigint,bigint,bigint[],bigint[]);

drop table if exists public.t2_baho;
drop table if exists public.t2_primitiv_dalil;
drop table if exists public.t2_bosqich_katalog;
drop table if exists public.t2_primitiv_tur;
drop table if exists public.t2_bildirishnoma;
drop table if exists public.t2_outbox_kursor;
drop table if exists public.t2_outbox;
drop table if exists public.t2_tomon_grant_shablon;
drop table if exists public.t2_shaxs_yonalish;
drop table if exists public.t2_kompaniya_faoliyat;
drop table if exists public.t2_yonalish;

alter table public.t2_obyekt drop constraint if exists t2_obyekt_joylashuv_check;
alter table public.t2_obyekt drop column if exists geokod_manba;
alter table public.t2_obyekt drop column if exists chegara_r2_key;
alter table public.t2_obyekt drop column if exists chegara_geojson;
alter table public.t2_obyekt drop column if exists geozona_radius_m;
alter table public.t2_obyekt drop column if exists manzil;

alter table public.t2_foydalanuvchi drop constraint if exists t2_foydalanuvchi_telefon_check;
alter table public.t2_foydalanuvchi drop column if exists telefon_tasdiqlangan;
alter table public.t2_foydalanuvchi drop column if exists telefon;

drop index if exists public.t2_kadr_mustaqil_foydalanuvchi_idx;
alter table public.t2_kadr_mustaqil drop column if exists foydalanuvchi_id;
drop index if exists public.t2_kontragent_tomon_kompaniya_idx;
alter table public.t2_kontragent drop column if exists tomon_kompaniya_id;

commit;
