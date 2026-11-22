-- Acceptance (faqat o'qish): bloklovchi kodlar return sifatida qolmagan, ogohlantirishlar qaytariladi.
do $$
declare d text;
begin
  d := pg_get_functiondef('public.t2_akt_lifecycle_transition_v1'::regproc);
  if d ~ $r$return jsonb_build_object\('ok', false, 'code', 'NARXSIZ_QATOR_BOR'$r$ or d ~ $r$return jsonb_build_object\('ok', false, 'code', 'F2_RESURS_TUSHGAN'$r$ then
    raise exception 'lifecycle hali bloklaydi'; end if;
  if position('ogohlantirishlar' in d) = 0 or position('STALE_VERSION' in d) = 0 or position('SOD_TASDIQLOVCHI_TAKRORLANDI' in d) = 0 then
    raise exception 'lifecycle: ogohlantirish yoki texnik himoya yo''q'; end if;
  d := pg_get_functiondef('public.t2_forma3_yarat_v1'::regproc);
  if position('F2_TASDIQLANMAGAN' in d) = 0 or position('FORMA3_AKT_BAND' in d) = 0 or position('FORMA3_F2_TAKROR' in d) = 0 or position('FORMA3_DENIED' in d) = 0 then
    raise exception 'forma3: ogohlantirish yoki texnik himoya yo''q'; end if;
  if d ~ $r$a\.holat <> 'tasdiqlangan'\s+or a\.kompaniya_id$r$ then raise exception 'forma3 hali tasdiqlanganni talab qiladi'; end if;
  d := pg_get_functiondef('public.t2_forma3_shartnoma_aktlar_v1'::regproc);
  if position($q$a.holat <> 'bekor'$q$ in d) = 0 then raise exception 'ro''yxat qoralamani bermaydi'; end if;
end $$;
select 'acceptance OK' as natija;