-- T2_TRANSPORT_BELGILA_V1: material qatorlariga transport usulini belgilash (foiz | tkm | narx_ichida). Yozuvchi RPC (SECURITY DEFINER):
-- kompaniya a'zoligi + `smeta.write` ruxsati (t2_require_permission_v2). Faqat shu obyektning FAOL material qatorlari
-- (tur rs/mat/ob, material kat; t·km qatorining o'zi emas). `foiz` = NULL (sukut). Idempotent (holat qayta qo'yilsa o'zgarish 0).
-- tkm: t·km qatori alohida (transport_manba_qator_id) - qator yo'q materiallar javobda `tkm_qatori_yoq` da (audit ham ko'rsatadi).
-- foiz / narx_ichida: faol t·km qatori bor material rad (aks holda transport ham, %-baza ham olinardi).
-- Snapshot/audit/dry_run - MCP `transport_belgila` tooli tomonida (xuddi boshqa yozuvchi toollar kabi).

create or replace function public.t2_qator_transport_belgila_v1(p_actor_id bigint, p_obyekt_id bigint, p_qator_idlar bigint[], p_usul text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_komp bigint; v_yaroqsiz bigint[]; v_tkm_bor bigint[]; v_tkm_yoq bigint[]; v_n integer;
begin
  select o.kompaniya_id into v_komp from public.t2_obyekt o where o.id = p_obyekt_id;
  if v_komp is null then return jsonb_build_object('ok', false, 'code', 'OBYEKT_YOQ', 'error', 'Obyekt topilmadi'); end if;
  perform public.t2_require_permission_v2(v_komp, p_actor_id, 'smeta.write');
  if p_usul is null or p_usul not in ('foiz', 'tkm', 'narx_ichida') then
    return jsonb_build_object('ok', false, 'code', 'USUL_NOTOGRI', 'error', 'usul: foiz | tkm | narx_ichida');
  end if;
  if p_qator_idlar is null or coalesce(array_length(p_qator_idlar, 1), 0) = 0 or array_length(p_qator_idlar, 1) > 5000 then
    return jsonb_build_object('ok', false, 'code', 'QATOR_IDLAR', 'error', 'qator_idlar: 1..5000 ta');
  end if;

  select coalesce(array_agg(x.id order by x.id), '{}') into v_yaroqsiz
    from unnest(p_qator_idlar) as x(id)
   where not exists (select 1 from public.t2_qator q
                      where q.id = x.id and q.obyekt_id = p_obyekt_id and q.versiya_holat = 'faol'
                        and q.tur in ('rs', 'mat', 'ob') and q.kat in ('МАТ', 'М/К', 'КАБ', 'БЕЗСКЛАД', 'ОБ')
                        and q.transport_manba_qator_id is null);
  if coalesce(array_length(v_yaroqsiz, 1), 0) > 0 then
    return jsonb_build_object('ok', false, 'code', 'QATOR_YARAMAYDI', 'error', 'Faol material qatori emas (yoki boshqa obyekt / t·km qatori)', 'qator_idlar', to_jsonb(v_yaroqsiz[1:50]));
  end if;

  if p_usul <> 'tkm' then
    select coalesce(array_agg(distinct c.transport_manba_qator_id order by c.transport_manba_qator_id), '{}') into v_tkm_bor
      from public.t2_qator c where c.transport_manba_qator_id = any (p_qator_idlar) and c.versiya_holat = 'faol';
    if coalesce(array_length(v_tkm_bor, 1), 0) > 0 then
      return jsonb_build_object('ok', false, 'code', 'TKM_QATOR_BOR', 'error', 'Faol t·km qatori bor material - avval t·km qatorini olib tashlang', 'qator_idlar', to_jsonb(v_tkm_bor[1:50]));
    end if;
  end if;

  update public.t2_qator q set transport_usul = case when p_usul = 'foiz' then null else p_usul end
   where q.id = any (p_qator_idlar) and q.obyekt_id = p_obyekt_id
     and q.transport_usul is distinct from case when p_usul = 'foiz' then null else p_usul end;
  get diagnostics v_n = row_count;

  if p_usul = 'tkm' then
    select coalesce(array_agg(x.id order by x.id), '{}') into v_tkm_yoq
      from unnest(p_qator_idlar) as x(id)
     where not exists (select 1 from public.t2_qator c where c.transport_manba_qator_id = x.id and c.versiya_holat = 'faol');
  end if;
  return jsonb_build_object('ok', true, 'obyekt_id', p_obyekt_id, 'usul', p_usul, 'qator_soni', array_length(p_qator_idlar, 1), 'ozgardi', v_n,
    'tkm_qatori_yoq_soni', coalesce(array_length(v_tkm_yoq, 1), 0), 'tkm_qatori_yoq', to_jsonb(coalesce(v_tkm_yoq[1:50], '{}')));
end $fn$;
revoke all on function public.t2_qator_transport_belgila_v1(bigint, bigint, bigint[], text) from public, anon, authenticated;
grant execute on function public.t2_qator_transport_belgila_v1(bigint, bigint, bigint[], text) to service_role;