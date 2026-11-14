-- acceptance 20261215100000_t2_foto_dalil_v1 — BEGIN..ROLLBACK ichida migratsiyadan keyin ishga tushiriladi.
-- versiya: texnik
begin;
set local statement_timeout = '300s';
do $$
declare v_komp bigint; v_obj bigint; v_act bigint; v_doc bigint; v_qator bigint; r jsonb; r2 jsonb; v_id bigint; v_op uuid := gen_random_uuid();
begin
  select o.kompaniya_id, o.id into v_komp, v_obj from public.t2_obyekt o
   where exists (select 1 from public.t2_qator q where q.obyekt_id = o.id and q.tur = 'bl') order by o.id limit 1;
  if v_obj is null then raise notice 'SKIP: obyekt yo''q'; return; end if;
  select z.foydalanuvchi_id into v_act from public.t2_azolik z where z.kompaniya_id = v_komp and z.holat = 'faol' and z.rol in ('boss','superadmin','rahbar','pto','admin') limit 1;
  if v_act is null then raise notice 'SKIP: ruxsatli aktor yo''q'; return; end if;
  select q.id into v_qator from public.t2_qator q where q.obyekt_id = v_obj and q.tur = 'bl' order by q.id limit 1;

  -- sinov foto hujjati (reyestr qatori; bayt R2 da emas — faqat bog'lash qatlami tekshiriladi)
  insert into public.t2_document_registry (kompaniya_id, obyekt_id, provider, document_type, revision_seq, original_filename, mime_type,
      expected_size_bytes, size_bytes, sha256, r2_bucket, canonical_storage_status, status, versiya, created_by, actor_id, operation_id, drive_sync_status)
  values (v_komp, v_obj, 'cloudflare_r2', 'foto_dalil', 1, 'acc.jpg', 'image/jpeg', 10, 10, repeat('a', 64), 'canonical', 'stored', 'active', 1, 't2-acc', v_act, gen_random_uuid(), 'not_configured')
  returning id into v_doc;

  r := public.t2_foto_dalil_bogla_v1(v_act, v_komp, v_obj, v_doc, 'qator', v_qator, current_date, 41.3, 69.2, 'sinov', v_op);
  if not coalesce((r->>'ok')::boolean, false) then raise exception 'FAIL bogla: %', r; end if;
  v_id := (r->>'id')::bigint;
  r2 := public.t2_foto_dalil_bogla_v1(v_act, v_komp, v_obj, v_doc, 'qator', v_qator, current_date, null, null, null, v_op);
  if (r2->>'id')::bigint <> v_id or not coalesce((r2->>'qayta')::boolean, false) then raise exception 'FAIL idempotent: %', r2; end if;

  -- begona manba / begona obyekt rad etiladi
  r2 := public.t2_foto_dalil_bogla_v1(v_act, v_komp, v_obj, v_doc, 'qator', -1, current_date, null, null, null, gen_random_uuid());
  if (r2->>'code') is distinct from 'MANBA_TOPILMADI' then raise exception 'FAIL begona manba: %', r2; end if;
  r2 := public.t2_foto_dalil_bogla_v1(v_act, v_komp, -1, v_doc, 'umumiy', null, current_date, null, null, null, gen_random_uuid());
  if (r2->>'code') is distinct from 'OBYEKT_BEGONA' then raise exception 'FAIL begona obyekt: %', r2; end if;

  -- ro'yxat: foto ko'rinadi, xulosa to'ldirilgan
  r := public.t2_foto_dalil_royxat_v1(v_act, v_komp, v_obj, null, null, null, null, null, 50, null);
  if not coalesce((r->>'ok')::boolean, false) or (r->>'jami')::bigint < 1 or jsonb_array_length(r->'sanalar') < 1 then raise exception 'FAIL royxat: %', r; end if;

  -- AI taklifi faqat saqlanadi (manba o'zgarmaydi), tasdiq — qayta_bogla orqali
  r := public.t2_foto_dalil_yangila_v1(v_act, v_komp, v_id, null, 'beton quyish', jsonb_build_object('manba_turi', 'umumiy'), false, null, null);
  if not coalesce((r->>'ok')::boolean, false) then raise exception 'FAIL yangila ai: %', r; end if;
  if (select manba_turi from public.t2_foto_dalil where id = v_id) <> 'qator' then raise exception 'FAIL: AI taklifi manbani o''zgartirdi'; end if;
  r := public.t2_foto_dalil_yangila_v1(v_act, v_komp, v_id, null, null, null, true, 'umumiy', null);
  if (select manba_turi from public.t2_foto_dalil where id = v_id) <> 'umumiy' then raise exception 'FAIL: manba tasdiqda o''zgarmadi'; end if;

  r := public.t2_foto_dalil_ochir_v1(v_act, v_komp, v_id);
  if not coalesce((r->>'ok')::boolean, false) then raise exception 'FAIL ochir: %', r; end if;
  if (select count(*) from public.t2_foto_dalil where id = v_id and holat = 'faol') <> 0 then raise exception 'FAIL: ochirilmadi'; end if;
  raise notice 'PASS foto_dalil: obyekt % foto %', v_obj, v_id;
end $$;
rollback;
