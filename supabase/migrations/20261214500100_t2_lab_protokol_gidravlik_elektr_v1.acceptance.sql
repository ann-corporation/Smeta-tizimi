-- ACCEPTANCE: 20261214500100 (gidravlik/elektr protokol turlari) - BEGIN..ROLLBACK, FAQAT sintetik fixture.
begin;
set local statement_timeout = '300s';

do $acc$
declare k bigint; o bigint; r jsonb; v_id bigint;
begin
  insert into public.t2_kompaniya (nom, kod, faol) values ('_TEST_LABT_', gen_random_uuid()::text, true) returning id into k;
  insert into public.t2_obyekt (nom, kompaniya_id) values ('_TEST_LABT_O_', k) returning id into o;
  if (select mirror_turi from public.t2_lab_sinov_turi where kalit = 'gidravlik') <> 'gidravlik' or (select mirror_turi from public.t2_lab_sinov_turi where kalit = 'elektr') <> 'elektr' then
    raise exception 'ACCT1: katalog mirror_turi yangilanmadi';
  end if;
  r := public.t2_lab_protokol_yoz_v1(k, o, jsonb_build_object('raqam', 'G-1', 'sinov_turi', 'gidravlik', 'natija', 'mos'), null, null, gen_random_uuid(), 'acc');
  if not (r->>'ok')::boolean then raise exception 'ACCT2: gidravlik qabul qilinmadi %', r; end if;
  r := public.t2_lab_protokol_yoz_v1(k, o, jsonb_build_object('raqam', 'E-1', 'sinov_turi', 'elektr', 'natija', 'mos'), null, null, gen_random_uuid(), 'acc');
  if not (r->>'ok')::boolean then raise exception 'ACCT3: elektr qabul qilinmadi %', r; end if;
  r := public.t2_lab_protokol_yoz_v1(k, o, jsonb_build_object('raqam', 'X-1', 'sinov_turi', 'noma_lum'), null, null, gen_random_uuid(), 'acc');
  if (r->>'ok')::boolean then raise exception 'ACCT4: noto''g''ri tur qabul qilindi'; end if;
  raise notice 'ACCEPTANCE OK: gidravlik/elektr protokol turlari';
end
$acc$;

rollback;