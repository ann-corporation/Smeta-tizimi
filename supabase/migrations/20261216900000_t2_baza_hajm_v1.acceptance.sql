-- Acceptance 20261216900000 (migratsiya QO'LLANGANDAN KEYIN; bitta tranzaksiya, oxirida ROLLBACK -- hech narsa qolmaydi).
-- Yiqilsa: 'ACCEPT[<qadam>] ...' xabari bilan.
begin;
do $$
declare
  v_base public.t2_baza_hajm_tarix%rowtype; v_new public.t2_baza_hajm_tarix%rowtype; v_id bigint;
  v_k text; v_b bigint; v_now bigint; v_plan text; v_line text; v_cnt int := 0;
begin
  -- A1: tuzilma va huquqlar
  if to_regclass('public.t2_baza_hajm_tarix') is null then raise exception 'ACCEPT[A1] jadval yo''q'; end if;
  if not (select relrowsecurity from pg_class where oid = 'public.t2_baza_hajm_tarix'::regclass) then raise exception 'ACCEPT[A1] RLS yoqilmagan'; end if;
  if has_table_privilege('anon', 'public.t2_baza_hajm_tarix', 'select') or has_table_privilege('authenticated', 'public.t2_baza_hajm_tarix', 'select') then
    raise exception 'ACCEPT[A1] jadval anon/authenticated ga ochiq'; end if;
  if has_function_privilege('anon', 'public.t2_baza_hajm_yoz_v1(text)', 'execute') or has_function_privilege('authenticated', 'public.t2_baza_hajm_yoz_v1(text)', 'execute') then
    raise exception 'ACCEPT[A1] funksiya anon/authenticated ga ochiq'; end if;

  -- A2: biznes jadvallar qator soni migratsiyadan OLDINGI asos nuqtadan KAMAYMAGAN
  select * into v_base from public.t2_baza_hajm_tarix where manba = 'migratsiya_oldin' order by id desc limit 1;
  if not found then raise exception 'ACCEPT[A2] asos nuqta (migratsiya_oldin) yo''q'; end if;
  for v_k, v_b in select key, value::bigint from jsonb_each_text(v_base.qator_soni) loop
    execute format('select count(*) from public.%I', v_k) into v_now;
    if v_now < v_b then raise exception 'ACCEPT[A2] % qatorlari kamaygan: % -> %', v_k, v_b, v_now; end if;
    v_cnt := v_cnt + 1;
  end loop;
  if v_cnt < 5 then raise exception 'ACCEPT[A2] asos nuqtada biznes jadvallar juda kam (%)', v_cnt; end if;

  -- A3: ortiqcha indekslar yo'q, saqlovchilari bor va so'rov ularni ishlatadi (FK/qidiruv ishlashi saqlangan)
  if to_regclass('public.t2_akt_qator_akt_idx') is not null or to_regclass('public.t2_f2_import_draft_qator_job_ix') is not null then
    raise exception 'ACCEPT[A3] ortiqcha indeks tushirilmagan'; end if;
  set local enable_seqscan = off;
  v_plan := '';
  for v_line in execute 'explain select id from public.t2_akt_qator where akt_id = 1' loop v_plan := v_plan || v_line; end loop;
  if v_plan not like '%t2_akt_qator_akt_id_id_idx%' then raise exception 'ACCEPT[A3] akt_id qidiruvi saqlovchi indeksni ishlatmayapti: %', v_plan; end if;
  v_plan := '';
  for v_line in execute 'explain select 1 from public.t2_f2_import_draft_qator where job_id = 1' loop v_plan := v_plan || v_line; end loop;
  if v_plan not like '%t2_f2_import_draft_qator_job_id_uid_key%' then raise exception 'ACCEPT[A3] job_id qidiruvi saqlovchi indeksni ishlatmayapti: %', v_plan; end if;
  reset enable_seqscan;

  -- A4: QAYTA QURISH isboti (rollback'dagi aynan shu buyruqlar) -- tranzaksiya oxirida bekor qilinadi
  create index t2_akt_qator_akt_idx on public.t2_akt_qator (akt_id);
  create index t2_f2_import_draft_qator_job_ix on public.t2_f2_import_draft_qator (job_id);
  if (select count(*) from pg_index where indexrelid in ('public.t2_akt_qator_akt_idx'::regclass, 'public.t2_f2_import_draft_qator_job_ix'::regclass) and indisvalid) <> 2 then
    raise exception 'ACCEPT[A4] indekslarni qayta qurib bo''lmadi'; end if;

  -- A5: yozuvchi funksiya: yangi nuqta, bayt > 0, top va qator_soni to'la
  v_id := public.t2_baza_hajm_yoz_v1('acceptance');
  select * into v_new from public.t2_baza_hajm_tarix where id = v_id;
  if v_new.db_bytes <= 0 or (select count(*) from jsonb_object_keys(v_new.jadval_bayt)) < 5 or not (v_new.qator_soni ? 't2_qator') then
    raise exception 'ACCEPT[A5] yozuv to''liq emas'; end if;
  begin perform public.t2_baza_hajm_yoz_v1('  '); raise exception 'ACCEPT[A5] bo''sh manba qabul qilindi';
  exception when others then if sqlerrm not like 'BAZA_HAJM%' then raise; end if; end;

  -- A6: cron (pg_cron bor bo'lsa)
  if to_regnamespace('cron') is not null and not exists (select 1 from cron.job where jobname = 't2-baza-hajm-kunlik' and active) then
    raise exception 'ACCEPT[A6] cron ish yo''q'; end if;
  raise notice 'ACCEPT OK: A1..A6 (asos nuqta % ta jadval, db_bytes=%)', v_cnt, v_new.db_bytes;
end $$;
rollback;