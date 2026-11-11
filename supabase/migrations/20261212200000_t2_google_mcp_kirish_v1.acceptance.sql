-- T2-MCP-GOOGLE-001 acceptance (faqat o'qish; BEGIN..ROLLBACK). Migratsiyadan KEYIN ishga tushiriladi.
-- 1) funksiya bor, SECURITY DEFINER, search_path qotirilgan; 2) ACL faqat service_role (+ egasi);
-- 3) manbada INSERT yo'q (foydalanuvchi/kompaniya yaratmaydi); 4) himoya qoidalari joyida;
-- 5) noto'g'ri kirish va ulanmagan email - yozuvsiz rad (google_sub o'zgarmaydi).
begin;
do $$
declare f text; acl text; r jsonb; n_oldin bigint; n_keyin bigint;
begin
  select p.prosrc, p.proacl::text into f, acl from pg_proc p where p.oid = to_regprocedure('public.t2_google_mcp_kirish_v1(text,text)');
  if f is null then raise exception 'FN_MISSING'; end if;
  if not (select prosecdef from pg_proc where oid = to_regprocedure('public.t2_google_mcp_kirish_v1(text,text)')) then raise exception 'NOT_SECURITY_DEFINER'; end if;
  if not exists (select 1 from pg_proc where oid = to_regprocedure('public.t2_google_mcp_kirish_v1(text,text)') and proconfig::text like '%search_path=public, pg_temp%') then raise exception 'SEARCH_PATH'; end if;
  if acl is distinct from '{postgres=X/postgres,service_role=X/postgres}' then raise exception 'ACL_CHANGED: %', acl; end if;
  if position('insert into' in lower(f)) > 0 then raise exception 'FN_CREATES_ROWS'; end if;
  if position('EMAIL_PAROL_BILAN' in f) = 0 or position('EMAIL_NOANIQ' in f) = 0 or position('GOOGLE_ULANMAGAN' in f) = 0 then raise exception 'GUARD_MISSING'; end if;
  select count(*) into n_oldin from public.t2_foydalanuvchi where google_sub is not null;
  r := public.t2_google_mcp_kirish_v1('bunday.foydalanuvchi.yoq@example.invalid', 'acceptance-sub-yoq');
  if r->>'code' is distinct from 'GOOGLE_ULANMAGAN' then raise exception 'UNLINKED_NOT_REJECTED: %', r; end if;
  r := public.t2_google_mcp_kirish_v1('noto''g''ri', 'x');
  if r->>'code' is distinct from 'GOOGLE_MALUMOT_NOTOGRI' then raise exception 'BAD_INPUT_NOT_REJECTED: %', r; end if;
  select count(*) into n_keyin from public.t2_foydalanuvchi where google_sub is not null;
  if n_oldin <> n_keyin then raise exception 'GOOGLE_SUB_CHANGED'; end if;
  raise notice 'T2_GOOGLE_MCP acceptance OK';
end $$;
rollback;
