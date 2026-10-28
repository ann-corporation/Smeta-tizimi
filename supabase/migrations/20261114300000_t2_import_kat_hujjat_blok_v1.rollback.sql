-- Teskari patch: kat_hujjat_blok_v1 post-update blokini ikkala import yakunlovchidan olib tashlaydi (avvalgi xatti-harakat).
-- Ma'lumot o'zgarmaydi (allaqachon import qilingan qatorlar kat'i o'z holida qoladi).
begin;
do $mig$
declare
  d text; i int; j int; fn text;
  marker text := '  -- kat_hujjat_blok_v1:';
  oxir text := E'   where q.id = h.new_id and q.kat is distinct from h.kat;\n';
begin
  foreach fn in array array['t2_smeta_import_yakunla_unlocked_v1','t2_smeta_paket_import_yakunla_unlocked_v1'] loop
    select pg_get_functiondef(p.oid) into d from pg_proc p where p.pronamespace='public'::regnamespace and p.proname=fn;
    i := position(marker in d);
    if d is null or i = 0 then raise exception 'ROLLBACK_ANCHOR_MISSING: %', fn; end if;
    j := position(oxir in substr(d, i));
    if j = 0 then raise exception 'ROLLBACK_END_MISSING: %', fn; end if;
    -- marker oldidagi bo'sh qator (bolakli variantda) ham olib tashlanadi
    if substr(d, i - 1, 1) = E'\n' and substr(d, i - 2, 1) = E'\n' then i := i - 1; end if;
    d := substr(d, 1, i - 1) || substr(d, i + j - 1 + length(oxir));
    execute d;
  end loop;
end
$mig$;
commit;
