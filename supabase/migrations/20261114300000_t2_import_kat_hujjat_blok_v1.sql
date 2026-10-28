-- T2-IMPORT-KAT-HUJJAT-BLOK-001 (L0 qarori 2026-10-29, PR #194): ekspertiza «ALL» RES blok kategoriyasi
-- (hujjat podvali isbotlagan: МАТ / М/К / КАБ / ОБ / БЕЗСКЛАД) import qatorida `kat` + `kat_manba='hujjat_blok'`
-- bo'lib keladi va shu IMPORT qatorlari uchun registr (kompaniya bo'yicha nom+birlik) va beton/rastvor м³
-- trigger'idan (t2_qator_zz_bez_sklad) ustun bo'ladi.
--
-- Nima uchun post-update: trigger `BEFORE INSERT OR UPDATE OF nom, birlik` — insertda hujjat МАТ (zagotli blokdagi
-- beton м³) ni БЕЗСКЛАД qiladi. Faqat `kat` ustunini yangilash trigger'ni ishga tushirmaydi, shuning uchun insertdan
-- so'ng (rollup'dan OLDIN) hujjat kategoriyasi qo'yiladi. Registr o'zgarmaydi — boshqa obyektlarga ta'sir yo'q.
-- `kat_manba` bo'lmagan qatorlar (eski klient, boshqa formatlar) — xatti-harakat AYNAN avvalgidek.
-- Backfill yo'q (faqat yangi importlar). Ruxsat etilgan qiymatlar: МАТ, М/К, КАБ, ОБ, БЕЗСКЛАД (ЧЕЛ/МАШ — yo'q).
begin;
do $mig$
declare
  d text;
  eski1 text := $e$  from t2_imp_qator order by ordinal;
$e$;
  yangi1 text := $y$  from t2_imp_qator order by ordinal;

  -- kat_hujjat_blok_v1: hujjat (ALL RES) blok kategoriyasi registr va beton trigger'idan ustun — faqat shu import qatorlari.
  update public.t2_qator q set kat = h.kat
    from (select m.new_id, x->>'kat' as kat
            from public.t2_smeta_import_bolak b
            cross join lateral jsonb_array_elements(b.qatorlar) x
            join t2_imp_qator m on m.local_id = x->>'local_id'
           where b.sessiya_id = p_sessiya_id and x->>'kat_manba' = 'hujjat_blok'
             and m.tur in ('rs','mat','ob') and x->>'kat' in ('МАТ','М/К','КАБ','ОБ','БЕЗСКЛАД')) h
   where q.id = h.new_id and q.kat is distinct from h.kat;
$y$;
  eski2 text := $e$  from t2_pkg_imp_qator order by ordinal;
$e$;
  yangi2 text := $y$  from t2_pkg_imp_qator order by ordinal;
  -- kat_hujjat_blok_v1: hujjat (ALL RES) blok kategoriyasi registr va beton trigger'idan ustun — faqat shu import qatorlari.
  update public.t2_qator q set kat = h.kat
    from (select m.new_id, x->>'kat' as kat
            from public.t2_smeta_paket_import_bolak b
            cross join lateral jsonb_array_elements(b.qatorlar) x
            join t2_pkg_imp_qator m on m.local_id = x->>'local_id'
           where b.sessiya_id = p_sessiya_id and x->>'kat_manba' = 'hujjat_blok'
             and m.tur in ('rs','mat','ob') and x->>'kat' in ('МАТ','М/К','КАБ','ОБ','БЕЗСКЛАД')) h
   where q.id = h.new_id and q.kat is distinct from h.kat;
$y$;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p where p.pronamespace='public'::regnamespace and p.proname='t2_smeta_import_yakunla_unlocked_v1';
  if d is null or position('kat_hujjat_blok_v1' in d) > 0 or (length(d) - length(replace(d, eski1, ''))) <> length(eski1) then
    raise exception 'ANCHOR_NOT_FOUND_ONCE: t2_smeta_import_yakunla_unlocked_v1';
  end if;
  execute replace(d, eski1, yangi1);

  select pg_get_functiondef(p.oid) into d from pg_proc p where p.pronamespace='public'::regnamespace and p.proname='t2_smeta_paket_import_yakunla_unlocked_v1';
  if d is null or position('kat_hujjat_blok_v1' in d) > 0 or (length(d) - length(replace(d, eski2, ''))) <> length(eski2) then
    raise exception 'ANCHOR_NOT_FOUND_ONCE: t2_smeta_paket_import_yakunla_unlocked_v1';
  end if;
  execute replace(d, eski2, yangi2);
end
$mig$;
commit;
