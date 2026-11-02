-- T2-EMAIL-KOD-PRECLAIM-HIMOYA-V1 acceptance (faqat o'qish; BEGIN..ROLLBACK). Migratsiyadan KEYIN ishga tushiriladi.
-- 1) email kod funksiyasida himoya bloki bor va u email_tasdiqlandi_at o'rnatishdan OLDIN turadi;
-- 2) Google kirishdagi EMAIL_PAROL_BILAN himoyasi joyida; 3) ruxsatlar: faqat service_role (+ egasi);
-- 4) SECURITY DEFINER + search_path saqlangan. Xulq-atvor testi: supabase/tests/t2_email_kod_preclaim_contract.sql.
begin;
do $$
declare f text; g text; p_guard int; p_set int; acl text;
begin
  select p.prosrc, p.proacl::text into f, acl from pg_proc p
  where p.oid = to_regprocedure('public.t2_email_kod_kirish_v1(uuid,text,text,text,text,uuid)');
  if f is null then raise exception 'FN_MISSING'; end if;
  p_guard := position('EMAIL_TASDIQLANMAGAN_PAROLLI_HISOB' in f);
  p_set := position('email_tasdiqlandi_at = coalesce(email_tasdiqlandi_at, now())' in f);
  if p_guard = 0 then raise exception 'GUARD_MISSING'; end if;
  if p_set = 0 or p_guard > p_set then raise exception 'GUARD_AFTER_VERIFY'; end if;
  if position('t2_ozi_royxat_log where foydalanuvchi_id = v_u.id' in f) = 0 or position('v_u.parol_hash is not null' in f) = 0 then
    raise exception 'GUARD_CONDITION_CHANGED';
  end if;
  if acl is distinct from '{postgres=X/postgres,service_role=X/postgres}' then raise exception 'ACL_CHANGED: %', acl; end if;
  if not (select prosecdef from pg_proc where oid = to_regprocedure('public.t2_email_kod_kirish_v1(uuid,text,text,text,text,uuid)')) then
    raise exception 'NOT_SECURITY_DEFINER';
  end if;
  if not exists (select 1 from pg_proc where oid = to_regprocedure('public.t2_email_kod_kirish_v1(uuid,text,text,text,text,uuid)')
                 and proconfig::text like '%search_path=public, pg_temp%') then
    raise exception 'SEARCH_PATH_CHANGED';
  end if;
  select p.prosrc into g from pg_proc p where p.oid = to_regprocedure('public.t2_google_kirish_v1(text,text,text,text,uuid)');
  if g is null or position('EMAIL_PAROL_BILAN' in g) = 0 then raise exception 'GOOGLE_GUARD_MISSING'; end if;
  raise notice 'T2_EMAIL_KOD_PRECLAIM acceptance OK';
end $$;
rollback;
