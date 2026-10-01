-- T2-FAKT-SMETADAN-TASHQARI-001 — fakt kiritishning o'zida qo'shimcha ish / zamena, smetasiz obyekt
-- (egasi, 2026-10-01): "faktni kiritish jarayonini o'zida zamena material yoki ish turini zamena
-- qilishga imkoniyati bo'lsa ... f2 ga ham birato'la faktda qilingan ish o'tardi. smetasi yo'q
-- obyektda ham fakt qilingan ishlar va resurslar kiritilib borilganda unda ham tayyor f2".
--
-- Yangi ombor/qoida YO'Q — mavjud kanonik mexanizm ustiga bitta atomar buyruq:
--   1) smetasiz obyekt (yoki bo'lim tanlanmagan qo'shimcha ish) → obyektda bitta
--      "СМЕТАДАН ТАШҚАРИ ИШЛАР" bo'limi (rz) avtomatik topiladi/yaratiladi;
--   2) t2_addrepl_execute_v1 — QO'SHIMCHA (yangi bl, replaces=null) yoki ZAMENA (yangi qator eski
--      qatorga ishora qiladi, eski o'zgarmaydi) + t2_smeta_ozgarish yozuvi (BUSINESS_RULES);
--   3) ixtiyoriy resurslar (mat/ob) yangi ish ostiga — addrepl 'resource';
--   4) t2_fakt_yoz_v2 — ish va resurslarning bajarilgan hajmi BITTA chaqiruvda → F2 qoldig'i;
--   5) ixtiyoriy: t2_ish_turi katalogiga saqlash.
-- Hammasi bitta tranzaksiyada (biror qadam yiqilsa — hech narsa yozilmaydi). Idempotent: addrepl
-- operation_id bo'yicha; resurs/fakt operation_id lari undan deterministik hosil qilinadi.
-- Narx bu yerda YOZILMAYDI — F2 narxi F2 tayyorlashda (hujjat narxi) kiritiladi.

begin;

drop function if exists public.t2_f2_smetadan_tashqari_v1(bigint, bigint, bigint, text, bigint, bigint, text, text, text, numeric, date, text, bigint, boolean, uuid, integer);

create or replace function public.t2_fakt_smetadan_tashqari_v1(
  p_actor_id bigint, p_kompaniya_id bigint, p_obyekt_id bigint, p_command text,
  p_ota_qator_id bigint, p_almashtirilayotgan_qator_id bigint,
  p_nom text, p_birlik text, p_kod text, p_hajm numeric, p_sana date, p_sabab text,
  p_resurslar jsonb, p_ish_turi_id bigint, p_katalogga_saqla boolean, p_operation_id uuid, p_kutilgan_versiya integer)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_req jsonb; v_add jsonb; v_fakt jsonb; v_qator_id bigint; v_kind text; v_ish_turi_id bigint := p_ish_turi_id;
  v_tur public.t2_ish_turi%rowtype; v_nom text := p_nom; v_birlik text := p_birlik; v_kod text := p_kod;
  v_ota bigint := p_ota_qator_id; v_versiya integer := p_kutilgan_versiya; v_rol text;
  v_res jsonb; v_res_add jsonb; v_i integer := 0; v_fakt_qatorlar jsonb := '[]'::jsonb; v_res_ids bigint[] := '{}';
  v_takror boolean;
begin
  if p_command not in ('additional', 'replacement') then return jsonb_build_object('ok', false, 'code', 'COMMAND_INVALID'); end if;
  if p_hajm is null or p_hajm <= 0 then return jsonb_build_object('ok', false, 'code', 'FAKT_HAJM_REQUIRED'); end if;
  if p_sana is null then return jsonb_build_object('ok', false, 'code', 'FAKT_DATE_REQUIRED'); end if;
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  if p_resurslar is not null and (jsonb_typeof(p_resurslar) <> 'array' or jsonb_array_length(p_resurslar) > 50) then
    return jsonb_build_object('ok', false, 'code', 'RESURSLAR_0_50');
  end if;
  v_rol := public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  if v_rol not in ('admin', 'superadmin', 'boss', 'director', 'pto') then
    return jsonb_build_object('ok', false, 'code', 'WRITE_ROLE_REQUIRED');
  end if;
  -- Takroriy so'rov: asosiy operatsiya bajarilgan bo'lsa (qator+resurs+fakt bitta tranzaksiyada yozilgan) — natijani qaytaramiz.
  select true, response into v_takror, v_add from public.t2_addrepl_command where operation_id = p_operation_id;
  if found then return jsonb_build_object('ok', true, 'takror', true, 'qator_id', v_add->'qator_id', 'change_id', v_add->'change_id'); end if;
  v_takror := false;

  if v_ish_turi_id is not null then
    select * into v_tur from public.t2_ish_turi where id = v_ish_turi_id and kompaniya_id = p_kompaniya_id;
    if not found then return jsonb_build_object('ok', false, 'code', 'ISH_TURI_NOT_FOUND'); end if;
    v_nom := coalesce(nullif(btrim(v_nom), ''), v_tur.nomi);
    v_birlik := coalesce(nullif(btrim(v_birlik), ''), v_tur.birligi);
    v_kod := coalesce(nullif(btrim(v_kod), ''), v_tur.kod);
  end if;

  -- Smetasiz obyekt / bo'lim tanlanmagan qo'shimcha ish → "СМЕТАДАН ТАШҚАРИ ИШЛАР" bo'limi.
  if p_command = 'additional' and v_ota is null then
    perform 1 from public.t2_obyekt where id = p_obyekt_id and kompaniya_id = p_kompaniya_id for update;
    if not found then return jsonb_build_object('ok', false, 'code', 'OBJECT_ACCESS_DENIED'); end if;
    select id, versiya into v_ota, v_versiya from public.t2_qator
     where obyekt_id = p_obyekt_id and tur = 'rz' and ota_id is null and nom = 'СМЕТАДАН ТАШҚАРИ ИШЛАР'
     order by id limit 1;
    if v_ota is null then
      insert into public.t2_qator(obyekt_id, kompaniya_id, ota_id, daraja, tartib, tur, nom, qoshimcha, change_type)
        values (p_obyekt_id, p_kompaniya_id, null, 0,
                (select coalesce(max(tartib), 0) + 1 from public.t2_qator where obyekt_id = p_obyekt_id),
                'rz', 'СМЕТАДАН ТАШҚАРИ ИШЛАР', true, 'ADDITIONAL')
        returning id, versiya into v_ota, v_versiya;
    end if;
  end if;
  if v_ota is null then return jsonb_build_object('ok', false, 'code', 'PARENT_REQUIRED'); end if;

  v_req := jsonb_strip_nulls(jsonb_build_object(
    'command', p_command, 'kompaniya_id', p_kompaniya_id, 'actor_id', p_actor_id, 'obyekt_id', p_obyekt_id,
    'ota_qator_id', v_ota, 'almashtirilayotgan_qator_id', p_almashtirilayotgan_qator_id,
    'nom', v_nom, 'birlik', v_birlik, 'hajm', p_hajm, 'kod', nullif(btrim(v_kod), ''),
    'sabab', p_sabab, 'operation_id', p_operation_id, 'kutilgan_versiya', v_versiya));
  v_add := public.t2_addrepl_execute_v1(v_req);   -- xato → exception → butun tranzaksiya qaytadi
  v_qator_id := (v_add->>'qator_id')::bigint;
  if v_qator_id is null then return jsonb_build_object('ok', false, 'code', 'LINE_NOT_CREATED', 'natija', v_add); end if;
  select tur into v_kind from public.t2_qator where id = v_qator_id;
  if v_kind not in ('bl', 'mat', 'ob') then
    raise exception 'RS_FAKT_YOQ: RS qatori norma orqali hisoblanadi — zamenani ish yoki material qatorida qiling';
  end if;
  if v_kind = 'ob' then update public.t2_qator set kat = 'ОБ' where id = v_qator_id; end if;
  v_fakt_qatorlar := v_fakt_qatorlar || jsonb_build_array(jsonb_build_object('qator_id', v_qator_id, 'hajm', p_hajm));

  -- Resurslar faqat ISH (bl) ostiga.
  if p_resurslar is not null and jsonb_array_length(p_resurslar) > 0 then
    if v_kind <> 'bl' then raise exception 'RESURS_FAQAT_ISH_OSTIGA'; end if;
    for v_res in select value from jsonb_array_elements(p_resurslar) loop
      v_i := v_i + 1;
      if coalesce(v_res->>'tur', '') not in ('mat', 'ob') or nullif(btrim(v_res->>'nom'), '') is null
         or nullif(btrim(v_res->>'birlik'), '') is null or coalesce((v_res->>'hajm')::numeric, 0) <= 0 then
        raise exception 'RESURS_INVALID: % (tur mat/ob, nom, birlik, hajm > 0)', v_i;
      end if;
      v_res_add := public.t2_addrepl_execute_v1(jsonb_strip_nulls(jsonb_build_object(
        'command', 'resource', 'tur', v_res->>'tur', 'kompaniya_id', p_kompaniya_id, 'actor_id', p_actor_id,
        'obyekt_id', p_obyekt_id, 'ota_qator_id', v_qator_id, 'nom', btrim(v_res->>'nom'), 'birlik', btrim(v_res->>'birlik'),
        'hajm', (v_res->>'hajm')::numeric, 'kod', nullif(btrim(v_res->>'kod'), ''), 'sabab', p_sabab,
        'operation_id', md5(p_operation_id::text || ':res:' || v_i)::uuid,
        'kutilgan_versiya', (select versiya from public.t2_qator where id = v_qator_id))));
      v_res_ids := v_res_ids || (v_res_add->>'qator_id')::bigint;
      -- t2_kat_birlik uskunani bilmaydi: ob qatori kategoriyasi — ОБ.
      if v_res->>'tur' = 'ob' then update public.t2_qator set kat = 'ОБ' where id = (v_res_add->>'qator_id')::bigint; end if;
      v_fakt_qatorlar := v_fakt_qatorlar || jsonb_build_array(jsonb_build_object(
        'qator_id', (v_res_add->>'qator_id')::bigint, 'hajm', (v_res->>'hajm')::numeric));
    end loop;
  end if;

  v_fakt := public.t2_fakt_yoz_v2(p_obyekt_id, p_sana, v_fakt_qatorlar, p_actor_id,
    md5(p_operation_id::text || ':fakt')::uuid, left('Smetadan tashqari: ' || coalesce(p_sabab, ''), 500), null, 'actor:' || p_actor_id);
  if coalesce((v_fakt->>'ok')::boolean, false) is not true then
    raise exception 'FAKT_NOT_WRITTEN: %', coalesce(v_fakt->>'code', v_fakt->>'error', v_fakt::text);
  end if;

  if coalesce(p_katalogga_saqla, false) and v_ish_turi_id is null then
    select id into v_ish_turi_id from public.t2_ish_turi
     where kompaniya_id = p_kompaniya_id and lower(btrim(nomi)) = lower(btrim(v_nom)) and lower(btrim(birligi)) = lower(btrim(v_birlik))
     limit 1;
    if v_ish_turi_id is null then
      insert into public.t2_ish_turi(kompaniya_id, kod, nomi, birligi, kategoriya)
        values (p_kompaniya_id, coalesce(nullif(btrim(v_kod), ''), 'ИТ-' || p_operation_id::text), btrim(v_nom), btrim(v_birlik), 'smetadan_tashqari')
        on conflict (kompaniya_id, kod) do nothing
        returning id into v_ish_turi_id;
      if v_ish_turi_id is not null and nullif(btrim(v_kod), '') is null then
        update public.t2_ish_turi set kod = 'ИТ-' || v_ish_turi_id where id = v_ish_turi_id;
      end if;
    end if;
  end if;

  if not v_takror then
    perform public.t2_audit_yoz(p_kompaniya_id, 'fakt_smetadan_tashqari', 'fakt', p_obyekt_id,
      format('qator=%s tur=%s hajm=%s resurs=%s ish_turi=%s', v_qator_id, p_command, p_hajm, cardinality(v_res_ids), coalesce(v_ish_turi_id::text, '-')),
      'actor:' || p_actor_id, null);
  end if;
  return jsonb_build_object('ok', true, 'qator_id', v_qator_id, 'resurs_ids', to_jsonb(v_res_ids), 'bolim_id', v_ota,
    'change_id', v_add->'change_id', 'ish_turi_id', v_ish_turi_id, 'takror', v_takror);
end $$;

/* Ish turlari katalogi — yozish (yangi yoki tahrir). O'qish: /api/sb allowlist (t2_ish_turi). */
create or replace function public.t2_ish_turi_saqla_v1(
  p_actor_id bigint, p_kompaniya_id bigint, p_id bigint, p_kod text, p_nomi text, p_birligi text,
  p_narx numeric, p_norma numeric, p_kategoriya text, p_kutilgan_versiya integer)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_rol text; v_row public.t2_ish_turi%rowtype;
begin
  v_rol := public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  if v_rol not in ('admin', 'superadmin', 'boss', 'director', 'pto') then
    return jsonb_build_object('ok', false, 'code', 'WRITE_ROLE_REQUIRED');
  end if;
  if nullif(btrim(p_kod), '') is null or nullif(btrim(p_nomi), '') is null or nullif(btrim(p_birligi), '') is null then
    return jsonb_build_object('ok', false, 'code', 'KOD_NOM_BIRLIK_REQUIRED');
  end if;
  if p_narx is not null and p_narx < 0 then return jsonb_build_object('ok', false, 'code', 'NARX_INVALID'); end if;
  if p_id is null then
    if exists (select 1 from public.t2_ish_turi where kompaniya_id = p_kompaniya_id and kod = btrim(p_kod)) then
      return jsonb_build_object('ok', false, 'code', 'KOD_BAND');
    end if;
    insert into public.t2_ish_turi(kompaniya_id, kod, nomi, birligi, narx, norma, kategoriya)
      values (p_kompaniya_id, btrim(p_kod), btrim(p_nomi), btrim(p_birligi), coalesce(p_narx, 0), coalesce(p_norma, 0), nullif(btrim(p_kategoriya), ''))
      returning * into v_row;
  else
    update public.t2_ish_turi set kod = btrim(p_kod), nomi = btrim(p_nomi), birligi = btrim(p_birligi),
        narx = coalesce(p_narx, 0), norma = coalesce(p_norma, 0), kategoriya = nullif(btrim(p_kategoriya), ''), versiya = versiya + 1
     where id = p_id and kompaniya_id = p_kompaniya_id and versiya = p_kutilgan_versiya
     returning * into v_row;
    if not found then return jsonb_build_object('ok', false, 'code', 'STALE_OR_NOT_FOUND'); end if;
  end if;
  perform public.t2_audit_yoz(p_kompaniya_id, 'ish_turi_saqla', 'katalog', null, 'ish_turi:' || v_row.id || ' ' || v_row.kod, 'actor:' || p_actor_id, null);
  return jsonb_build_object('ok', true, 'id', v_row.id, 'versiya', v_row.versiya);
end $$;

revoke all on function public.t2_fakt_smetadan_tashqari_v1(bigint, bigint, bigint, text, bigint, bigint, text, text, text, numeric, date, text, jsonb, bigint, boolean, uuid, integer) from public, anon, authenticated;
grant execute on function public.t2_fakt_smetadan_tashqari_v1(bigint, bigint, bigint, text, bigint, bigint, text, text, text, numeric, date, text, jsonb, bigint, boolean, uuid, integer) to service_role;
revoke all on function public.t2_ish_turi_saqla_v1(bigint, bigint, bigint, text, text, text, numeric, numeric, text, integer) from public, anon, authenticated;
grant execute on function public.t2_ish_turi_saqla_v1(bigint, bigint, bigint, text, text, text, numeric, numeric, text, integer) to service_role;

commit;
