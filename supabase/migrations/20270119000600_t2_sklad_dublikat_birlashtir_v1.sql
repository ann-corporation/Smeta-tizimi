-- EGASI TASDIQLASHI KERAK. Kompaniya 123: dublikat omborlarni birlashtirish.
-- Qoladi: 18 «NEW TIMES BUILDINGS MCHJ — Navoiy bog' skladi» (9101 ta harakat shu yerda). Ketadi: 9 «Navoiy bog'» (1 harakat + 9 obyekt bog').
-- Harakat jurnali append-only (t2_sklad_c11_append_only_guard_v1): 9 dagi bitta qatorni ko'chirish uchun trigger BIR TRANZAKSIYA ichida vaqtincha o'chiriladi.
do $$
declare v_keep bigint := 18; v_drop bigint := 9; v_k bigint := 123; v_n int;
begin
  if (select count(*) from public.t2_sklad_royxat where kompaniya_id = v_k and id in (v_keep, v_drop)) <> 2 then
    raise exception 'SKLAD_BIRLASHTIR: ikkala ombor kompaniya 123 da topilmadi'; end if;
  -- 1. obyekt bog'lari: 9 -> 18 (18 da allaqachon bor bo'lsa takror yaratilmaydi)
  update public.t2_sklad_bog b set sklad_id = v_keep
   where b.sklad_id = v_drop and not exists (select 1 from public.t2_sklad_bog x where x.sklad_id = v_keep and x.obyekt_id = b.obyekt_id and x.holat = 'faol');
  delete from public.t2_sklad_bog where sklad_id = v_drop;
  -- 2. harakat jurnali (append-only guard vaqtincha o'chiriladi, shu tranzaksiyada qayta yoqiladi)
  alter table public.t2_sklad_harakat disable trigger t2_sklad_c11_append_only_guard_v1;
  update public.t2_sklad_harakat set c11_sklad_id = v_keep where kompaniya_id = v_k and c11_sklad_id = v_drop;
  alter table public.t2_sklad_harakat enable trigger t2_sklad_c11_append_only_guard_v1;
  -- 3. boshqa havolalar
  update public.t2_tr_bekat set sklad_id = v_keep where sklad_id = v_drop;
  -- 4. obyektlar jsonb (ko'rinish uchun) 18 ga ko'chadi
  update public.t2_sklad_royxat k set obyektlar = coalesce((select jsonb_agg(distinct e) from public.t2_sklad_royxat s, jsonb_array_elements(s.obyektlar) e where s.id in (v_keep, v_drop)), '[]'::jsonb), versiya = k.versiya + 1 where k.id = v_keep;
  -- 5. eski ombor o'chiriladi (hech qanday havola qolmaganini tekshirib)
  select count(*) into v_n from public.t2_sklad_harakat where c11_sklad_id = v_drop;
  if v_n <> 0 then raise exception 'SKLAD_BIRLASHTIR: 9 da % harakat qoldi', v_n; end if;
  delete from public.t2_sklad_royxat where id = v_drop and kompaniya_id = v_k;
end $$;
