-- Orqaga qaytarish: «Navoiy bog'» (9) omborini qayta yaratadi va 9 obyekt bog'ini tiklaydi. 1 ta ko'chirilgan harakat (id 11760) 9 ga qaytariladi.
-- Eslatma: id 9 aynan qayta band qilinadi; obyekt ro'yxati (jsonb) 18 da birlashgan holda qoladi.
insert into public.t2_sklad_royxat (id, kompaniya_id, nomi, versiya, obyektlar) values (9, 123, 'Navoiy bog''', 1, '[]'::jsonb) on conflict (id) do nothing;
insert into public.t2_sklad_bog (sklad_id, obyekt_id, holat)
  select 9, o, 'faol' from unnest(array[152,153,155,157,156,161,163,164,166]::bigint[]) o
  where not exists (select 1 from public.t2_sklad_bog x where x.sklad_id = 9 and x.obyekt_id = o and x.holat = 'faol');
delete from public.t2_sklad_bog where sklad_id = 18 and obyekt_id = any(array[152,153,155,157,156,161,163,164,166]::bigint[]);
alter table public.t2_sklad_harakat disable trigger t2_sklad_c11_append_only_guard_v1;
update public.t2_sklad_harakat set c11_sklad_id = 9 where id = 11760 and kompaniya_id = 123;
alter table public.t2_sklad_harakat enable trigger t2_sklad_c11_append_only_guard_v1;
