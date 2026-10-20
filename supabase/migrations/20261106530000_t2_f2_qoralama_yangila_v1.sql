-- T2-F2-IMPORT-QORALAMA-YANGILA (egasi 2026-10-20: «hech narsani bog'lab bo'lmay qoldi»).
-- F2 importida qisman saqlangan QORALAMA akt (masalan Suniy ko'l #279, 2026-07) bor bo'lsa, seansni davom ettirib
-- qayta saqlash t2_akt_kalit_uniq (obyekt+tur+oy+raqam) tufayli imkonsiz edi. Bu funksiya o'sha QORALAMA aktning
-- qatorlarini yangi to'plam bilan almashtiradi: akt id, raqam, oy va tarix saqlanadi; tasdiqlangan/yuborilgan/bekor
-- akt hech qachon o'zgarmaydi. Qator tekshiruvlari t2_akt_yarat_v2 + t2_akt_yarat bilan aynan bir xil (exact source law).
-- Eski qatorlar to'liq JSON sifatida audit va buyruq jurnalida qoladi.
begin;

create or replace function public.t2_f2_qoralama_yangila_v1(
  p_actor_id bigint, p_kompaniya_id bigint, p_akt_id bigint, p_kutilgan_versiya integer,
  p_qatorlar jsonb, p_operation_id uuid, p_manba text default 'frontend_v2')
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_akt public.t2_akt%rowtype; v_prev jsonb; v_request text; v_rev bigint; v_eski jsonb; v_natija jsonb;
  v_soni int; v_narxsiz int; v_buzilish jsonb; v_ogoh int;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'f2.prepare');
  perform pg_advisory_xact_lock(hashtextextended('t2_f2_qoralama:op:' || p_operation_id, 0));
  v_request := md5(jsonb_build_array(p_actor_id, p_kompaniya_id, p_akt_id, p_kutilgan_versiya, p_qatorlar, 'f2_qoralama_yangila')::text);
  select natija into v_prev from public.t2_onboarding_command_log where operation_id = p_operation_id;
  if found then
    if v_prev->>'_request' is distinct from v_request then return jsonb_build_object('ok', false, 'code', 'OPERATION_SCOPE_MISMATCH'); end if;
    return (v_prev - '_request' - 'eski_qatorlar') || jsonb_build_object('takror', true);
  end if;

  select * into v_akt from public.t2_akt where id = p_akt_id for update;
  if not found or v_akt.kompaniya_id is distinct from p_kompaniya_id then return jsonb_build_object('ok', false, 'code', 'AKT_NOT_FOUND'); end if;
  if v_akt.tur <> 'f2' then return jsonb_build_object('ok', false, 'code', 'AKT_TUR_NOTOGRI'); end if;
  if v_akt.holat is distinct from 'qoralama' or coalesce(v_akt.lifecycle_status, 'draft') <> 'draft' then
    return jsonb_build_object('ok', false, 'code', 'AKT_QORALAMA_EMAS',
      'xabar', 'Faqat qoralama F2 yangilanadi. Tasdiqlangan yoki yuborilgan akt tuzatish tartibida o''zgaradi.');
  end if;
  if p_kutilgan_versiya is null then return jsonb_build_object('ok', false, 'code', 'VERSION_REQUIRED'); end if;
  if v_akt.versiya is distinct from p_kutilgan_versiya then return jsonb_build_object('ok', false, 'code', 'STALE_VERSION'); end if;

  -- t2_akt_yarat_v2 bilan bir xil qator tekshiruvlari.
  if p_qatorlar is null or jsonb_typeof(p_qatorlar) <> 'array' or jsonb_array_length(p_qatorlar) = 0 then
    return jsonb_build_object('ok', false, 'code', 'F2_LINES_REQUIRED');
  end if;
  if exists (select 1 from jsonb_array_elements(p_qatorlar) x where nullif(x->>'qator_id', '') is null) then
    return jsonb_build_object('ok', false, 'code', 'QATOR_ID_REQUIRED');
  end if;
  if exists (select 1 from jsonb_array_elements(p_qatorlar) x group by x->>'qator_id' having count(*) > 1) then
    return jsonb_build_object('ok', false, 'code', 'DUPLICATE_F2_SOURCE_LINE');
  end if;
  if exists (select 1 from jsonb_array_elements(p_qatorlar) x where nullif(x->>'certified_quantity', '') is null) then
    return jsonb_build_object('ok', false, 'code', 'CERTIFIED_QTY_INVALID');
  end if;
  if exists (select 1 from jsonb_array_elements(p_qatorlar) x
             where coalesce((x->>'price_intentionally_absent')::boolean, false) is not true
               and (nullif(x->>'certified_unit_price', '') is null or nullif(x->>'certified_amount', '') is null)) then
    return jsonb_build_object('ok', false, 'code', 'MISSING_CERTIFIED_PRICE');
  end if;
  if exists (select 1 from jsonb_array_elements(p_qatorlar) x left join public.t2_qator q
               on q.id = (x->>'qator_id')::bigint and q.obyekt_id = v_akt.obyekt_id where q.id is null) then
    return jsonb_build_object('ok', false, 'code', 'QATOR_SCOPE_INVALID', 'xabar', 'Ba''zi qatorlar bu obyektga tegishli emas.');
  end if;

  select coalesce(jsonb_agg(to_jsonb(aq) order by aq.id), '[]'::jsonb) into v_eski from public.t2_akt_qator aq where aq.akt_id = p_akt_id;
  delete from public.t2_akt_qator where akt_id = p_akt_id;

  select id into v_rev from public.t2_smeta_revision where obyekt_id = v_akt.obyekt_id order by seq desc limit 1;
  insert into public.t2_akt_qator (akt_id, qator_id, obyekt_id, kompaniya_id, hajm, narx, izoh, baseline_narx, baseline_summa,
                                   narx_manba, revision_id)
  select p_akt_id, q.id, v_akt.obyekt_id, v_akt.kompaniya_id, (x->>'certified_quantity')::numeric,
         case when coalesce((x->>'price_intentionally_absent')::boolean, false) then null else (x->>'certified_unit_price')::numeric end,
         nullif(btrim(coalesce(x->>'izoh', '')), ''), q.narx,
         case when q.narx is not null then (x->>'certified_quantity')::numeric * q.narx end,
         case when coalesce((x->>'price_intentionally_absent')::boolean, false) then 'smeta'
              when q.narx is not null and (x->>'certified_unit_price')::numeric <> q.narx then 'qol_nomalum' else 'smeta' end,
         v_rev
  from jsonb_array_elements(p_qatorlar) x join public.t2_qator q on q.id = (x->>'qator_id')::bigint;

  update public.t2_akt_qator aq set
    certified_quantity = (x->>'certified_quantity')::numeric,
    certified_unit_price = case when coalesce((x->>'price_intentionally_absent')::boolean, false) then null else (x->>'certified_unit_price')::numeric end,
    certified_amount = case when coalesce((x->>'price_intentionally_absent')::boolean, false) then null else (x->>'certified_amount')::numeric end,
    certified_source_hash = nullif(x->>'certified_source_hash', ''),
    raw_snapshot = coalesce(x->'raw_snapshot', x),
    provenance_status = case when coalesce((x->>'price_intentionally_absent')::boolean, false) then 'price_intentionally_absent' else 'source_certified' end,
    reference_basis_line_id = (public.t2_price_basis_resolve_v1(aq.qator_id, current_date)->>'basis_line_id')::bigint,
    basis_approved_price_snapshot = (public.t2_price_basis_resolve_v1(aq.qator_id, current_date)->>'approved_price')::numeric
  from jsonb_array_elements(p_qatorlar) x
  where aq.akt_id = p_akt_id and aq.qator_id = (x->>'qator_id')::bigint;

  select count(*), count(*) filter (where summa is null) into v_soni, v_narxsiz from public.t2_akt_qator where akt_id = p_akt_id;
  select jsonb_agg(jsonb_build_object('qator_id', h.id, 'nom', h.nom, 'f2', h.f2_hajm, 'fakt', h.fakt_hajm)), count(*)
    into v_buzilish, v_ogoh
    from public.t2_akt_qator aq join public.t2_qator_holat h on h.id = aq.qator_id and h.obyekt_id = v_akt.obyekt_id
   where aq.akt_id = p_akt_id and h.fakt_hajm is not null
     and (abs(h.f2_hajm) > abs(h.fakt_hajm) + 0.000001 or h.f2_hajm * h.fakt_hajm < 0);
  update public.t2_akt set hujjat_jami = (select sum(q.summa) from public.t2_akt_qator q where q.akt_id = p_akt_id),
         revision_id = coalesce(v_rev, revision_id), manba = coalesce(nullif(btrim(p_manba), ''), manba),
         izoh = left(trim(both ' | ' from coalesce(izoh, '') || ' | F2 import qayta saqlandi: ' || v_soni || ' qator'), 2000)
   where id = p_akt_id;

  perform public.t2_audit_yoz(p_kompaniya_id, 'f2_qoralama_yangila', 'f2', v_akt.obyekt_id,
    format('akt=%s eski=%s yangi=%s', p_akt_id, jsonb_array_length(v_eski), v_soni), 'actor:' || p_actor_id, null);
  v_natija := jsonb_build_object('ok', true, 'akt_id', p_akt_id, 'holat', 'qoralama', 'qator_soni', v_soni, 'narxsiz', v_narxsiz,
    'eski_qator_soni', jsonb_array_length(v_eski), 'ogohlantirish', v_buzilish, 'ogohlantirish_soni', coalesce(v_ogoh, 0),
    'versiya', (select versiya from public.t2_akt where id = p_akt_id), 'contract', 'CERTIFIED_F2_V2');
  insert into public.t2_onboarding_command_log(operation_id, actor_id, command, natija)
    values (p_operation_id, p_actor_id, 'f2_qoralama_yangila', v_natija || jsonb_build_object('_request', v_request, 'eski_qatorlar', v_eski));
  return v_natija;
end $$;
revoke all on function public.t2_f2_qoralama_yangila_v1(bigint, bigint, bigint, integer, jsonb, uuid, text) from public, anon, authenticated;
grant execute on function public.t2_f2_qoralama_yangila_v1(bigint, bigint, bigint, integer, jsonb, uuid, text) to service_role;

commit;
