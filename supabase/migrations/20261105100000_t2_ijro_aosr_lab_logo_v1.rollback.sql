-- Rollback: T2-IJRO-AOSR-LAB-001. Yangi obyektlarni olib tashlaydi.
-- ⚠️ t2_lab_protokol / t2_kompaniya_logo dagi yozuvlar yo'qoladi — rollbackdan
-- oldin eksport qiling. t2_aosr ga qo'shilgan ustunlar ham olib tashlanadi.
begin;
drop function if exists public.t2_kompaniya_logo_saqla_v1(bigint, text, text, text, text);
drop function if exists public.t2_lab_protokol_bog_saqla_v1(bigint, bigint, bigint[], bigint[]);
drop function if exists public.t2_lab_protokol_bekor_v1(bigint, bigint, integer);
drop function if exists public.t2_lab_protokol_yoz_v1(bigint, bigint, jsonb, bigint, integer, uuid, text);
drop function if exists public.t2_aosr_yoz_v2(bigint, bigint, jsonb, bigint, integer, uuid, text);
drop view if exists public.t2_lab_protokol_reestr;
drop view if exists public.t2_aosr_reestr_v2;
drop table if exists public.t2_kompaniya_logo;
drop table if exists public.t2_lab_protokol_bog;
drop table if exists public.t2_lab_protokol;
-- 'laboratoriya' rolidagi kontragentlar bo'lsa, constraint qaytarilishidan oldin
-- ularning roli NULL qilinadi (aks holda constraint qo'yilmaydi).
update public.t2_kontragent set mavqe = null where mavqe = 'laboratoriya';
alter table public.t2_kontragent drop constraint if exists t2_kontragent_mavqe_check;
alter table public.t2_kontragent add constraint t2_kontragent_mavqe_check
  check (mavqe is null or mavqe in ('buyurtmachi', 'pudratchi', 'subpudratchi', 'loyihachi', 'taminotchi'));
drop index if exists public.t2_aosr_obyekt_tur_raqam_uq;
alter table public.t2_aosr drop constraint if exists t2_aosr_komissiya_array_check;
alter table public.t2_aosr drop constraint if exists t2_aosr_blank_varianti_check;
alter table public.t2_aosr drop constraint if exists t2_aosr_tur_check;
alter table public.t2_aosr
  drop column if exists sana, drop column if exists komissiya, drop column if exists keyingi_ishlar,
  drop column if exists chetlanishlar, drop column if exists materiallar, drop column if exists loyiha_hujjati,
  drop column if exists loyiha_tashkiloti, drop column if exists ish_tavsifi,
  drop column if exists blank_varianti, drop column if exists tur;
commit;
