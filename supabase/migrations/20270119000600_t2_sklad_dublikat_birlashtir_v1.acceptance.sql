-- Qabul sinovi: FAQAT ROLLBACK ichida (transaksiya oxirida rollback). Birlashtirish mantig'ini sintetik kompaniyada tekshiradi.
begin;
do $$
declare k bigint; a bigint; b bigint; o bigint; h bigint; n int;
begin
  insert into public.t2_kompaniya (nom, kod, faol) values ('ACC SKLAD', 'ACCSK' || floor(random()*1e6), true) returning id into k;
  insert into public.t2_obyekt (nom, kompaniya_id) values ('_ACC_SK_', k) returning id into o;
  insert into public.t2_sklad_royxat (kompaniya_id, nomi) values (k, 'A') returning id into a;
  insert into public.t2_sklad_royxat (kompaniya_id, nomi) values (k, 'B') returning id into b;
  insert into public.t2_sklad_bog (sklad_id, obyekt_id, holat) values (a, o, 'faol');
  -- birlashtirish (a -> b), asosiy migratsiya bilan bir xil qadamlar
  update public.t2_sklad_bog set sklad_id = b where sklad_id = a;
  delete from public.t2_sklad_royxat where id = a and kompaniya_id = k;
  select count(*) into n from public.t2_sklad_bog where sklad_id = b and obyekt_id = o and holat = 'faol';
  if n <> 1 then raise exception 'ACC1 bog 18 ga otmadi'; end if;
  if exists (select 1 from public.t2_sklad_royxat where id = a) then raise exception 'ACC2 eski ombor o''chmadi'; end if;
  -- trigger yoqilgan holatda c11 qator o'zgarmasligi (guard saqlangan)
  if (select tgenabled from pg_trigger where tgname = 't2_sklad_c11_append_only_guard_v1') <> 'O' then raise exception 'ACC3 guard o''chiq qoldi'; end if;
end $$;
rollback;
