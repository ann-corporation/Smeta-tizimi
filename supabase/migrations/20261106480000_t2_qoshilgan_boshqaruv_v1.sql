-- T2-F2-IMPORT-TUZATISH-001 — foydalanuvchi QO'SHGAN smeta qatorlarini to'liq boshqarish (egasi, 2026-10-18):
--   "smetadan olingan ma'lumotlar const — o'zgarmas, lekin undan tashqarisi to'liq boshqariluvchan: tahrirlash, joyini
--    o'zgartirish, o'chirish, almashtirish. Resursga ham ish turi zamena qilish mumkin bo'lishi kerak: masalan ГПС ni
--    hokimiyat karyer bergan — ГПС ning o'zini ololmaymiz, lekin qazib olish va tashishni olamiz".
-- O'chirish/tahrirlash mavjud (`t2_ish_abc_ochir_v1` / `t2_ish_abc_tahrir_v1`). Bu migratsiya qo'shadi:
--   1) t2_resurs_ish_zamena_v1 — smeta RESURSI o'rniga bir yoki bir nechta ISH (o'z resurslari bilan), o'sha bo'limda,
--      resursning ishidan keyin; asl resurs o'zgarmaydi; yangi ishlar `zamena=true`, `replaces_line_id = resurs`.
--      `p_eski_qator_id` berilsa — oldingi shunday zamenani arxivlab almashtiradi (tahrirlash).
--   2) t2_qoshilgan_kochir_v1 — qo'shilgan qatorni (bolalari bilan) boshqa joyga ko'chirish.
-- Qonunlar: faqat `qoshimcha=true` qatorlar; asl smeta qatori rad; F2 aktidagi qator ko'chirilmaydi; ruxsat
-- `smeta.write` (rollar konstruktori); idempotent `operation_id`; har amal auditda. Additiv: jadval yo'q, faqat funksiyalar.

begin;

create or replace function public.t2_resurs_ish_zamena_v1(
  p_actor_id bigint, p_kompaniya_id bigint, p_obyekt_id bigint, p_resurs_qator_id bigint,
  p_ishlar jsonb, p_sabab text, p_operation_id uuid, p_eski_qator_id bigint default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_prev jsonb; v_r public.t2_qator%rowtype; v_w public.t2_qator%rowtype; v_z public.t2_qator%rowtype;
  v_eski public.t2_qator%rowtype; v_o jsonb; v_i jsonb; v_n int := 0; v_res jsonb; v_id bigint; v_ids bigint[] := '{}';
  v_resurs jsonb := '[]'::jsonb; v_tartib int; v_natija jsonb;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select natija into v_prev from public.t2_onboarding_command_log where operation_id = p_operation_id;
  if found then return v_prev || jsonb_build_object('takror', true); end if;
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'smeta.write');
  if nullif(btrim(coalesce(p_sabab, '')), '') is null then return jsonb_build_object('ok', false, 'code', 'SABAB_REQUIRED'); end if;
  if p_ishlar is null or jsonb_typeof(p_ishlar) <> 'array' or jsonb_array_length(p_ishlar) not between 1 and 10 then
    return jsonb_build_object('ok', false, 'code', 'ISHLAR_1_10', 'xabar', 'Kamida bitta, ko''pi bilan 10 ta ish kiriting.');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('t2_ish_abc:' || p_obyekt_id, 0));

  select * into v_r from public.t2_qator where id = p_resurs_qator_id and obyekt_id = p_obyekt_id and kompaniya_id = p_kompaniya_id;
  if not found or v_r.tur not in ('rs', 'mat', 'ob') then return jsonb_build_object('ok', false, 'code', 'RESURS_NOT_FOUND'); end if;
  if coalesce(v_r.qoshimcha, false) then
    return jsonb_build_object('ok', false, 'code', 'RESURS_QOSHILGAN', 'xabar', 'Bu resursni o''zingiz qo''shgansiz — uni tahrirlang yoki o''chiring.');
  end if;
  select * into v_w from public.t2_qator where id = v_r.ota_id;
  if not found or v_w.tur <> 'bl' then return jsonb_build_object('ok', false, 'code', 'RESURS_ISHSIZ', 'xabar', 'Resurs ish ichida emas — ish zamenasi uchun bo''lim aniqlanmadi.'); end if;
  select * into v_z from public.t2_qator where id = v_w.ota_id;
  if not found or v_z.tur <> 'rz' then return jsonb_build_object('ok', false, 'code', 'BOLIM_NOT_FOUND'); end if;

  if p_eski_qator_id is not null then
    select * into v_eski from public.t2_qator where id = p_eski_qator_id and obyekt_id = p_obyekt_id and kompaniya_id = p_kompaniya_id;
    if not found or not coalesce(v_eski.zamena, false) or v_eski.replaces_line_id is distinct from v_r.id then
      return jsonb_build_object('ok', false, 'code', 'ESKI_ZAMENA_NOTOGRI', 'xabar', 'Almashtiriladigan eski qator shu resursning ish zamenasi emas.');
    end if;
    v_o := public.t2_ish_abc_ochir_ichki(p_kompaniya_id, p_obyekt_id, p_eski_qator_id, p_actor_id, 'tahrir: ' || p_sabab, p_operation_id);
    if not coalesce((v_o->>'ok')::boolean, false) then return v_o; end if;
  end if;

  -- Yangi ishlar resursning ishidan (va uning resurslaridan) keyin turadi; boshqa qatorlar surilmaydi.
  with recursive t(id, tartib) as (
    select v_w.id, v_w.tartib union all select q.id, q.tartib from public.t2_qator q join t on q.ota_id = t.id)
  select max(t.tartib) into v_tartib from t;

  for v_i in select value from jsonb_array_elements(p_ishlar) loop
    v_n := v_n + 1;
    v_res := public.t2_ish_abc_saqla_v1(p_actor_id, p_kompaniya_id, p_obyekt_id, 'additional', v_z.id, null,
      v_i->'ish', coalesce(v_i->'resurslar', '[]'::jsonb), null, current_date,
      format('Resurs o''rniga ish: «%s» — %s', coalesce(v_r.nom, ''), p_sabab),
      md5(p_operation_id::text || ':rish:' || v_n)::uuid, (select versiya from public.t2_qator where id = v_z.id));
    if not coalesce((v_res->>'ok')::boolean, false) then
      raise exception 'ISH_YARATILMADI: %', coalesce(v_res->>'code', v_res::text);
    end if;
    v_id := (v_res->>'qator_id')::bigint;
    update public.t2_qator set zamena = true, change_type = 'REPLACEMENT', replaces_line_id = v_r.id where id = v_id;
    with recursive t(id) as (select v_id union all select q.id from public.t2_qator q join t on q.ota_id = t.id)
    update public.t2_qator q set tartib = v_tartib from t where q.id = t.id;
    update public.t2_smeta_ozgarish set tur = 'resurs_almashtirish', kind = 'replacement'
     where id = (v_res->>'change_id')::bigint;
    v_ids := v_ids || v_id;
    v_resurs := v_resurs || jsonb_build_array(coalesce(v_res->'resurs_ids', '[]'::jsonb));
  end loop;

  perform public.t2_audit_yoz(p_kompaniya_id, 'resurs_ish_zamena', 'smeta', p_obyekt_id,
    format('resurs=%s ishlar=%s eski=%s sabab=%s', v_r.id, array_to_string(v_ids, ','), coalesce(p_eski_qator_id::text, '-'), left(p_sabab, 200)),
    'actor:' || p_actor_id, null);
  v_natija := jsonb_build_object('ok', true, 'qator_idlar', to_jsonb(v_ids), 'resurs_idlar', v_resurs,
    'qator_id', v_ids[1], 'resurs_id', v_r.id, 'bolim_id', v_z.id, 'eski_ochirildi', v_o->'ochirildi');
  insert into public.t2_onboarding_command_log(operation_id, actor_id, command, natija) values (p_operation_id, p_actor_id, 'resurs_ish_zamena', v_natija);
  return v_natija;
end $$;

create or replace function public.t2_qoshilgan_kochir_v1(
  p_actor_id bigint, p_kompaniya_id bigint, p_obyekt_id bigint, p_qator_id bigint,
  p_yangi_ota_id bigint, p_keyin_qator_id bigint, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_prev jsonb; v_r public.t2_qator%rowtype; v_p public.t2_qator%rowtype; v_ids bigint[]; v_tartib int; v_delta int; v_natija jsonb;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select natija into v_prev from public.t2_onboarding_command_log where operation_id = p_operation_id;
  if found then return v_prev || jsonb_build_object('takror', true); end if;
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'smeta.write');
  perform pg_advisory_xact_lock(hashtextextended('t2_ish_abc:' || p_obyekt_id, 0));

  select * into v_r from public.t2_qator where id = p_qator_id and obyekt_id = p_obyekt_id and kompaniya_id = p_kompaniya_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'QATOR_NOT_FOUND'); end if;
  if not coalesce(v_r.qoshimcha, false) then
    return jsonb_build_object('ok', false, 'code', 'SMETA_QATORI_OZGARMAS', 'xabar', 'Smetaning asl qatori ko''chirilmaydi.');
  end if;
  select * into v_p from public.t2_qator where id = p_yangi_ota_id and obyekt_id = p_obyekt_id and kompaniya_id = p_kompaniya_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'OTA_NOT_FOUND'); end if;
  if (v_r.tur = 'bl' and v_p.tur <> 'rz') or (v_r.tur in ('rs', 'mat', 'ob') and v_p.tur not in ('rz', 'bl')) or v_r.tur = 'rz' then
    return jsonb_build_object('ok', false, 'code', 'TUZILMA_NOTOGRI', 'xabar', 'Ish faqat bo''limga, resurs — ishga yoki bo''limga ko''chiriladi.');
  end if;
  with recursive t(id) as (select p_qator_id union all select q.id from public.t2_qator q join t on q.ota_id = t.id)
  select array_agg(id) into v_ids from t;
  if p_yangi_ota_id = any(v_ids) then return jsonb_build_object('ok', false, 'code', 'TUZILMA_NOTOGRI', 'xabar', 'Qator o''z ichiga ko''chirilmaydi.'); end if;
  if coalesce(v_r.zamena, false) and p_yangi_ota_id is distinct from v_r.ota_id then
    return jsonb_build_object('ok', false, 'code', 'ZAMENA_JOYI', 'xabar', 'Zamena o''zi almashtirgan qator yonida turadi — faqat shu bo''lim ichida tartibini o''zgartirish mumkin.');
  end if;
  if exists (select 1 from unnest(v_ids) x where public.t2_qator_f2da(x)) then
    return jsonb_build_object('ok', false, 'code', 'F2_DA', 'xabar', 'Qator F2 aktida — ko''chirilmaydi (tasdiqlangan hujjat o''zgarmaydi).');
  end if;

  if p_keyin_qator_id is null or p_keyin_qator_id = p_yangi_ota_id then
    v_tartib := v_p.tartib;
  else
    perform 1 from public.t2_qator where id = p_keyin_qator_id and ota_id = p_yangi_ota_id and not (id = any(v_ids));
    if not found then return jsonb_build_object('ok', false, 'code', 'JOY_NOTOGRI', 'xabar', 'Tanlangan joy shu bo''lim/ish ichida emas.'); end if;
    with recursive t(id, tartib) as (
      select q0.id, q0.tartib from public.t2_qator q0 where q0.id = p_keyin_qator_id
      union all select q1.id, q1.tartib from public.t2_qator q1 join t on q1.ota_id = t.id)
    select max(t.tartib) into v_tartib from t;
  end if;
  v_delta := coalesce(v_p.daraja, 0) + 1 - coalesce(v_r.daraja, 0);
  update public.t2_qator set ota_id = p_yangi_ota_id where id = p_qator_id;
  update public.t2_qator set daraja = coalesce(daraja, 0) + v_delta, tartib = v_tartib where id = any(v_ids);
  update public.t2_qator set yangilandi = clock_timestamp() where id in (p_yangi_ota_id, v_r.ota_id);
  perform public.t2_audit_yoz(p_kompaniya_id, 'qoshilgan_kochir', 'smeta', p_obyekt_id,
    format('qator=%s ota %s->%s keyin=%s', p_qator_id, coalesce(v_r.ota_id::text, '-'), p_yangi_ota_id, coalesce(p_keyin_qator_id::text, '-')),
    'actor:' || p_actor_id, null);
  v_natija := jsonb_build_object('ok', true, 'qator_id', p_qator_id, 'kochdi', cardinality(v_ids), 'ota_id', p_yangi_ota_id);
  insert into public.t2_onboarding_command_log(operation_id, actor_id, command, natija) values (p_operation_id, p_actor_id, 'qoshilgan_kochir', v_natija);
  return v_natija;
end $$;

revoke all on function public.t2_resurs_ish_zamena_v1(bigint, bigint, bigint, bigint, jsonb, text, uuid, bigint) from public, anon, authenticated;
revoke all on function public.t2_qoshilgan_kochir_v1(bigint, bigint, bigint, bigint, bigint, bigint, uuid) from public, anon, authenticated;
grant execute on function public.t2_resurs_ish_zamena_v1(bigint, bigint, bigint, bigint, jsonb, text, uuid, bigint) to service_role;
grant execute on function public.t2_qoshilgan_kochir_v1(bigint, bigint, bigint, bigint, bigint, bigint, uuid) to service_role;

commit;
