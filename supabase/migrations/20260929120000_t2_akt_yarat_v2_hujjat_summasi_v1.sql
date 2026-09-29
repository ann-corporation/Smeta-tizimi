-- T2 F2 EXACT SOURCE LAW — pul hujjatning O'Z summasidan (hajm × narx dan emas).
--
-- Egasi sinovi 2026-09-29 (Karting F2, akt #236): «АРМАТУРА ДЛЯ МОНОЛИТНЫХ …» (zamena ~)
-- hujjatda narx 7 936 451, SUMMA 0. certified_amount = 0 to'g'ri yozildi, lekin
-- t2_akt_qator.summa — GENERATED (hajm × narx) = 15 533 598,08; t2_akt.hujjat_jami
-- 2 285 374 765,95 bo'ldi (hujjat qatorlari — 2 269 841 167,87). summa ni Nakopitelniy v2,
-- Forma 3, workbench, reestr view'lari va 20+ funksiya o'qiydi — hujjatda yo'q pul to'lovga
-- kirardi. Egasi: "tizim aynan F2 dagi summani yozishi kerak, o'zicha hisoblab yasamasin".
--
-- Tuzatish (bitta joyda, hamma o'quvchi uchun): generated ifoda
--   summa = coalesce(certified_amount, hajm × narx)      (narx null bo'lsa null — avvalgidek)
--   variance_summa = shu summa − baseline_summa
-- Tekshirildi (2026-09-29): tasdiqlangan 394 qatorda certified_amount ↔ hajm × narx farqi 0 ta —
-- tasdiqlangan tarix o'zgarmaydi; farq faqat qoralama #236 dagi 1 qatorda.
-- t2_akt_yarat_v2: certified yozilgach hujjat_jami = sum(summa) qayta hisoblanadi.

alter table public.t2_akt_qator alter column summa set expression as (
  case when narx is null then null::numeric else coalesce(certified_amount, hajm * narx) end);
alter table public.t2_akt_qator alter column variance_summa set expression as (
  case when narx is null then 0::numeric else coalesce(certified_amount, hajm * narx) end - coalesce(baseline_summa, 0::numeric));

create or replace function public.t2_akt_yarat_v2(p_obyekt_id bigint, p_oy date, p_qatorlar jsonb, p_actor_id bigint, p_raqam text DEFAULT NULL::text, p_operation_id uuid DEFAULT NULL::uuid, p_manba text DEFAULT 'f2_import_v2'::text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_komp bigint; v_result jsonb; v_akt_id bigint;
  v_missing_price jsonb; v_missing_amount jsonb;
begin
  select kompaniya_id into v_komp from public.t2_obyekt where id = p_obyekt_id;
  if v_komp is null then
    return jsonb_build_object('ok', false, 'code', 'OBYEKT_NOT_FOUND');
  end if;
  perform public.t2_actor_kompaniya_azo_tekshir(v_komp, p_actor_id);

  if p_operation_id is null then
    return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED');
  end if;
  if p_qatorlar is null or jsonb_typeof(p_qatorlar) <> 'array' or jsonb_array_length(p_qatorlar) = 0 then
    return jsonb_build_object('ok', false, 'code', 'F2_LINES_REQUIRED');
  end if;
  if exists (select 1 from jsonb_array_elements(p_qatorlar) x where nullif(x->>'qator_id', '') is null) then
    return jsonb_build_object('ok', false, 'code', 'QATOR_ID_REQUIRED');
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_qatorlar) x
    group by x->>'qator_id' having count(*) > 1
  ) then
    return jsonb_build_object('ok', false, 'code', 'DUPLICATE_F2_SOURCE_LINE');
  end if;
  if exists (select 1 from jsonb_array_elements(p_qatorlar) x where nullif(x->>'certified_quantity', '') is null) then
    return jsonb_build_object('ok', false, 'code', 'CERTIFIED_QTY_INVALID',
      'qatorlar', (select jsonb_agg(x->>'qator_id') from jsonb_array_elements(p_qatorlar) x where nullif(x->>'certified_quantity', '') is null));
  end if;
  select jsonb_agg(x->>'qator_id') into v_missing_price from jsonb_array_elements(p_qatorlar) x
    where coalesce((x->>'price_intentionally_absent')::boolean, false) is not true
      and nullif(x->>'certified_unit_price', '') is null;
  if v_missing_price is not null then
    return jsonb_build_object('ok', false, 'code', 'MISSING_CERTIFIED_PRICE',
      'xabar', 'Ba''zi qatorlarda F2 hujjatining o''z narxi yo''q va price_intentionally_absent belgilanmagan -- smeta narxiga jim qaytish YO''Q.',
      'qatorlar', v_missing_price);
  end if;
  select jsonb_agg(x->>'qator_id') into v_missing_amount from jsonb_array_elements(p_qatorlar) x
    where coalesce((x->>'price_intentionally_absent')::boolean, false) is not true
      and nullif(x->>'certified_amount', '') is null;
  if v_missing_amount is not null then
    return jsonb_build_object('ok', false, 'code', 'MISSING_CERTIFIED_AMOUNT',
      'xabar', 'Ba''zi qatorlarda F2 hujjatining o''z summasi yuborilmagan.',
      'qatorlar', v_missing_amount);
  end if;

  select public.t2_akt_yarat(
    p_obyekt_id, 'f2', p_oy,
    (select jsonb_agg(jsonb_build_object(
       'qator_id', (x->>'qator_id')::bigint,
       'hajm', (x->>'certified_quantity')::numeric,
       'narx', case when coalesce((x->>'price_intentionally_absent')::boolean, false) then null
                    else (x->>'certified_unit_price')::numeric end,
       'narx_yoq', coalesce((x->>'price_intentionally_absent')::boolean, false),
       'izoh', x->>'izoh'
     )) from jsonb_array_elements(p_qatorlar) x),
    p_raqam, p_operation_id, p_manba, 'actor:' || p_actor_id, false
  ) into v_result;

  if coalesce((v_result->>'ok')::boolean, false) is not true then
    return v_result;
  end if;
  if (v_result->>'takror')::boolean is true then
    return v_result || jsonb_build_object('contract', 'CERTIFIED_F2_V2');
  end if;
  v_akt_id := (v_result->>'akt_id')::bigint;

  update public.t2_akt_qator aq set
    certified_quantity = (x->>'certified_quantity')::numeric,
    certified_unit_price = case when coalesce((x->>'price_intentionally_absent')::boolean, false) then null
                                 else (x->>'certified_unit_price')::numeric end,
    certified_amount = case when coalesce((x->>'price_intentionally_absent')::boolean, false) then null
                             else (x->>'certified_amount')::numeric end,
    certified_source_hash = nullif(x->>'certified_source_hash', ''),
    raw_snapshot = coalesce(x->'raw_snapshot', x),
    provenance_status = case when coalesce((x->>'price_intentionally_absent')::boolean, false)
                              then 'price_intentionally_absent' else 'source_certified' end,
    -- Price Control (Sections 3-8): snapshot the basis ceiling valid NOW
    -- (F2-creation time) -- frozen from this point on by the trigger.
    -- baseline_narx (the reference itself) is already set by the
    -- delegated t2_akt_yarat call above -- not touched here.
    reference_basis_line_id = (public.t2_price_basis_resolve_v1(aq.qator_id, current_date)->>'basis_line_id')::bigint,
    basis_approved_price_snapshot = (public.t2_price_basis_resolve_v1(aq.qator_id, current_date)->>'approved_price')::numeric
  from jsonb_array_elements(p_qatorlar) x
  where aq.akt_id = v_akt_id and aq.qator_id = (x->>'qator_id')::bigint;

  -- F2 EXACT SOURCE LAW (2026-09-29): summa (generated) endi certified_amount — jami undan.
  update public.t2_akt set hujjat_jami = (select sum(q.summa) from public.t2_akt_qator q where q.akt_id = v_akt_id)
   where id = v_akt_id;

  return v_result || jsonb_build_object('contract', 'CERTIFIED_F2_V2',
    'arithmetic_mismatch_soni', (
      select count(*) from public.t2_akt_qator
      where akt_id = v_akt_id and certified_amount is not null
        and certified_quantity is not null and certified_unit_price is not null
        and abs(certified_quantity * certified_unit_price - certified_amount) > 0.005
    ));
end
$function$;

revoke all on function public.t2_akt_yarat_v2(bigint,date,jsonb,bigint,text,uuid,text) from public, anon, authenticated;
grant execute on function public.t2_akt_yarat_v2(bigint,date,jsonb,bigint,text,uuid,text) to service_role;

-- Mavjud QORALAMA F2 aktlar jamisi yangi summa bo'yicha (tasdiqlanganlarda farq yo'q — tegilmaydi).
update public.t2_akt a set hujjat_jami = x.jami
  from (select akt_id, sum(summa) jami from public.t2_akt_qator group by akt_id) x
 where x.akt_id = a.id and a.tur = 'f2' and a.holat = 'qoralama' and a.hujjat_jami is distinct from x.jami;
