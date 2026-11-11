-- ACCEPTANCE: 20261214500000 (laboratoriya sinov so'rovi) - migratsiya qo'llangan bazada; BEGIN..ROLLBACK, FAQAT sintetik fixture.
-- Tekshiradi: katalog, so'rov yaratish (rol, lab-emas aloqa), natija (maydon tekshiruvi, mos emas -> predpisaniya + ko'zgu protokol + bog),
-- АОСР qorovuli (taqdim bloklanadi), qayta sinov mos -> predpisaniya yopiladi va qorovul ochiladi, begona kompaniya ko'ra olmaydi.
begin;
set local statement_timeout = '300s';

do $acc$
declare
  kp bigint; kl bigint; kx bigint; up bigint; ul bigint; ux bigint; o bigint; aloqa bigint; aosr bigint; qat bigint; doc bigint;
  r jsonb; r2 jsonb; s1 bigint; s2 bigint; pred bigint; v jsonb; bloklandi boolean := false; royxat jsonb;
begin
  insert into public.t2_kompaniya (nom, kod, faol) values ('_TEST_LAB_PUD_', gen_random_uuid()::text, true) returning id into kp;
  insert into public.t2_kompaniya (nom, kod, faol) values ('_TEST_LAB_LAB_', gen_random_uuid()::text, true) returning id into kl;
  insert into public.t2_kompaniya (nom, kod, faol) values ('_TEST_LAB_BEGONA_', gen_random_uuid()::text, true) returning id into kx;
  insert into public.t2_obyekt (nom, kompaniya_id) values ('_TEST_LAB_O_', kp) returning id into o;
  insert into public.t2_foydalanuvchi (login, ism, holat) values ('tlab_pto_' || kp, 'pto', 'faol') returning id into up;
  insert into public.t2_foydalanuvchi (login, ism, holat) values ('tlab_lab_' || kp, 'lab', 'faol') returning id into ul;
  insert into public.t2_foydalanuvchi (login, ism, holat) values ('tlab_x_' || kp, 'x', 'faol') returning id into ux;
  insert into public.t2_azolik (foydalanuvchi_id, kompaniya_id, rol, holat) values (up, kp, 'pto', 'faol'), (ul, kl, 'inspektor', 'faol'), (ux, kx, 'inspektor', 'faol');
  insert into public.t2_tomon_aloqa (taklif_kompaniya_id, qabul_kompaniya_id, taklif_rol, qabul_rol, holat, taklif_actor_id)
    values (kp, kl, 'pudratchi', 'laboratoriya', 'faol', up) returning id into aloqa;
  insert into public.t2_aosr (kompaniya_id, obyekt_id, ish_nomi, holat) values (kp, o, 'TEST akt', 'yangi') returning id into aosr;
  insert into public.t2_qator (kompaniya_id, obyekt_id, tur) values (kp, o, 'bl') returning id into qat;
  insert into public.t2_document_registry (kompaniya_id, document_type, status, canonical_storage_status) values (kl, 'lab_protokol', 'active', 'stored') returning id into doc;

  -- 1. Katalog
  if jsonb_array_length(public.t2_lab_sinov_turlari_v1(up, kp)) < 6 then raise exception 'ACC1: katalog to''liq emas'; end if;

  -- 2. Rol: laboratoriya so'rov yubora olmaydi
  begin
    perform public.t2_lab_sorov_yarat_v1(ul, kl, aloqa, 'beton_kub', o, aosr, qat, 'T', null, 3, null, null, true, null, gen_random_uuid());
    raise exception 'ACC2: lab so''rov yuborib yubordi';
  exception when sqlstate '42501' then null; end;

  -- 3. So'rov yaratish + takror (operation_id)
  r := public.t2_lab_sorov_yarat_v1(up, kp, aloqa, 'beton_kub', o, aosr, qat, 'Fundament', 'o''q A-B', 3, null, null, true, null, '00000000-0000-4000-8000-0000000000a1');
  if not (r->>'ok')::boolean then raise exception 'ACC3: % ', r; end if;
  s1 := (r->>'id')::bigint;
  r2 := public.t2_lab_sorov_yarat_v1(up, kp, aloqa, 'beton_kub', o, aosr, qat, 'Fundament', null, 3, null, null, true, null, '00000000-0000-4000-8000-0000000000a1');
  if (r2->>'id')::bigint <> s1 then raise exception 'ACC3b: takror'; end if;

  -- 4. Laboratoriya kelgan ro'yxatda ko'radi, begona kompaniya ko'rmaydi
  royxat := public.t2_lab_sorov_royxat_v1(ul, kl, 'kelgan', null, null, null, 50);
  if jsonb_array_length(royxat) <> 1 then raise exception 'ACC4: lab inbox'; end if;
  if (public.t2_lab_sorov_tafsilot_v1(ux, kx, s1)->>'ok')::boolean then raise exception 'ACC4b: begona kompaniya ko''rdi'; end if;

  -- 5. Maydon tekshiruvi: majburiy maydon yo'q
  r := public.t2_lab_sorov_natija_v1(ul, kl, s1, 1, jsonb_build_object('natija', 'mos', 'protokol_raqam', 'P-1', 'maydon', '{}'::jsonb), array[doc]);
  if (r->>'ok')::boolean or r->>'code' <> 'MAYDON' then raise exception 'ACC5: %', r; end if;

  -- 6. Mos emas: ko'zgu protokol, bog, predpisaniya, qorovul
  r := public.t2_lab_sorov_natija_v1(ul, kl, s1, 1, jsonb_build_object('natija', 'mos_emas', 'protokol_raqam', 'P-1', 'protokol_sana', '2026-01-10', 'xulosa', 'Mustahkamlik yetmadi',
    'summa', 1000, 'maydon', jsonb_build_object('marka_sinf', 'B25', 'yosh_kun', 28, 'olchangan_mpa', 20, 'talab_mpa', 25)), array[doc]);
  if not (r->>'ok')::boolean then raise exception 'ACC6: %', r; end if;
  pred := (r->>'predpisaniya_id')::bigint;
  if pred is null then raise exception 'ACC6b: predpisaniya yo''q'; end if;
  if not exists (select 1 from public.t2_tomon_murojaat where id = pred and turi = 'predpisaniya' and ijrochi_kompaniya_id = kp and beruvchi_kompaniya_id = kl) then raise exception 'ACC6c'; end if;
  if (select count(*) from public.t2_lab_protokol p join public.t2_lab_protokol_bog b on b.protokol_id = p.id
       where p.kompaniya_id = kp and p.natija = 'mos_emas' and (b.aosr_id = aosr or b.qator_id = qat)) <> 2 then raise exception 'ACC6d: ko''zgu/bog'; end if;
  if not (public.t2_lab_sorov_aosr_holat_v1(up, kp, o)->'aktlar'->0->>'bloklangan')::boolean then raise exception 'ACC6e: bloklanmadi'; end if;

  -- 7. АОСР qarshi tomonga yuborilmaydi
  begin
    insert into public.t2_tomon_taqdim (aloqa_id, taqdim_etuvchi_kompaniya_id, qabul_qiluvchi_kompaniya_id, resurs, manba_jadval, manba_id, obyekt_id, nom, taqdim_actor_id)
      values (aloqa, kp, kl, 'aosr', 't2_aosr', aosr, o, 'TEST', up);
  exception when others then bloklandi := sqlerrm like 'LAB_MOS_EMAS%'; end;
  if not bloklandi then raise exception 'ACC7: qorovul ishlamadi'; end if;

  -- 8. Qayta sinov mos -> predpisaniya yopiladi, qorovul ochiladi
  r := public.t2_lab_sorov_yarat_v1(up, kp, aloqa, null, null, null, null, null, null, null, null, null, true, s1, gen_random_uuid());
  if not (r->>'ok')::boolean then raise exception 'ACC8: %', r; end if;
  s2 := (r->>'id')::bigint;
  r := public.t2_lab_sorov_natija_v1(ul, kl, s2, 1, jsonb_build_object('natija', 'mos', 'protokol_raqam', 'P-2', 'maydon', jsonb_build_object('marka_sinf', 'B25', 'yosh_kun', 28, 'olchangan_mpa', 30, 'talab_mpa', 25)), array[doc]);
  if not (r->>'ok')::boolean then raise exception 'ACC8b: %', r; end if;
  if (select holat from public.t2_tomon_murojaat where id = pred) <> 'yopildi' then raise exception 'ACC8c: predpisaniya yopilmadi'; end if;
  if (public.t2_lab_sorov_aosr_holat_v1(up, kp, o)->'aktlar'->0->>'bloklangan')::boolean then raise exception 'ACC8d: hamon bloklangan'; end if;
  insert into public.t2_tomon_taqdim (aloqa_id, taqdim_etuvchi_kompaniya_id, qabul_qiluvchi_kompaniya_id, resurs, manba_jadval, manba_id, obyekt_id, nom, taqdim_actor_id)
    values (aloqa, kp, kl, 'aosr', 't2_aosr', aosr, o, 'TEST', up);

  raise notice 'ACCEPTANCE OK: laboratoriya sinov so''rovi';
end
$acc$;

rollback;
