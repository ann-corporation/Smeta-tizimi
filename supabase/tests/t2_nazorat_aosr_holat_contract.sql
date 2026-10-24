-- t2_nazorat_aosr_holat_v1 contract: BEGIN ... ROLLBACK (hech narsa qolmaydi).
-- Migratsiyani qo'llab, shu faylni ishga tushiring; xato bo'lsa EXCEPTION.
begin;

do $$
declare v_cols text[];
begin
  -- 1) view bor va ustunlari to'g'ri
  select array_agg(column_name::text order by ordinal_position) into v_cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 't2_aosr_qator_holat';
  if v_cols is distinct from array['qator_id', 'obyekt_id', 'akt_holat', 'akt_soni'] then
    raise exception 'ustunlar noto''g''ri: %', v_cols;
  end if;
  -- 2) faqat service_role o'qiydi
  if has_table_privilege('anon', 'public.t2_aosr_qator_holat', 'select')
     or has_table_privilege('authenticated', 'public.t2_aosr_qator_holat', 'select') then
    raise exception 'anon/authenticated o''qiy olmasligi kerak';
  end if;
  if not has_table_privilege('service_role', 'public.t2_aosr_qator_holat', 'select') then
    raise exception 'service_role o''qiy olishi kerak';
  end if;
  -- 3) so'rov xatosiz ishlaydi; bekor akt hisobga olinmaydi, akt_holat faqat ruxsat etilgan qiymatlar
  if exists (select 1 from public.t2_aosr_qator_holat where akt_holat not in ('tasdiqlangan', 'yangi')) then
    raise exception 'akt_holat noto''g''ri qiymat';
  end if;
  if exists (
    select 1 from public.t2_aosr_qator_holat v
    where not exists (select 1 from public.t2_aosr_bog b join public.t2_aosr a on a.id = b.aosr_id
                      where b.qator_id = v.qator_id and a.holat <> 'bekor')
  ) then
    raise exception 'bekor aktlar hisobga olinmasligi kerak';
  end if;
end $$;

rollback;
