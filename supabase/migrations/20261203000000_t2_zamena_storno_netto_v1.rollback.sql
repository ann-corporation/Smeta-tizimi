-- ROLLBACK: 20261203000000_t2_zamena_storno_netto_v1.sql — zamena progressi yana faqat tasdiqlangan F2 (qoralama storno hisobga olinmaydi).
begin;

do $do$
declare d text; n text;
  eski constant text := 'FILTER (WHERE a.tur = ''f2''::text AND a.holat = ''tasdiqlangan''::text)';
  yangi constant text := 'FILTER (WHERE a.tur = ''f2''::text AND (a.holat = ''tasdiqlangan''::text OR (a.holat <> ALL (ARRAY[''bekor''::text, ''rad''::text]) AND COALESCE(a.lifecycle_status, ''draft''::text) <> ALL (ARRAY[''cancelled''::text, ''rejected''::text, ''superseded''::text]) AND (aq.raw_snapshot ->> ''source''::text) = ''storno''::text)))';
begin
  d := pg_get_viewdef('public.t2_zamena_qoplash'::regclass, true);
  if position(yangi in d) = 0 then raise exception 'ZAMENA_STORNO ROLLBACK: yangi langar topilmadi'; end if;
  n := replace(d, yangi, eski);
  execute 'create or replace view public.t2_zamena_qoplash as ' || n;
end $do$;

commit;
