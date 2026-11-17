-- Jarvis -> smeta MCP yozuvlari uchun SERVER DRY-RUN (egasi 2026-11-18: «har yozuv ikki qadam: dry_run preview + ROLLBACK, so'ng tasdiq»).
-- MCP (mcp/smeta-mcp) dry_run ni tranzaksiya ROLLBACK bilan qiladi; Cloudflare Functions faqat REST/RPC ko'radi, shuning uchun shu
-- vazifa bazada: oq ro'yxatdagi NOMLI yozuv RPC larini ichki sub-tranzaksiyada ishga tushiradi, "oldin/keyin" holatni o'qiydi va
-- ROLLBACK qiladi (hech narsa saqlanmaydi). Summa — yagona yadro `_t2_summa_paket_v1` dan (qayta hisoblanmaydi).
--
-- Xavfsizlik: faqat service_role (Pages Function, aktor sessiyadan). a'zolik + obyekt<->kompaniya tekshiruvi shu yerda; har ichki RPC
-- o'z ruxsatini (t2_require_permission_v2 / WRITE_ROLE) p_actor_id bilan o'zi tekshiradi — p_actor_id bu yerda MAJBURAN almashtiriladi.
-- Faqat oq ro'yxat: yangi yozuv RPC kerak bo'lsa shu ro'yxatga sabab bilan qo'shiladi.
-- QO'LLANMAGAN: bu fayl faqat repoda; prodga qo'llashdan oldin ROLLBACK sinovi (acceptance fayl) majburiy.
create or replace function public.t2_jarvis_dry_run_v1(
  p_actor_id bigint, p_kompaniya_id bigint, p_obyekt_id bigint, p_chaqiruvlar jsonb,
  p_olchov text default 'fakt', p_akt_id bigint default null, p_qator_idlar bigint[] default '{}'::bigint[])
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  c_ruxsat constant text[] := array['t2_fakt_yoz_v2', 't2_f2_qoralama_yangila_v1', 't2_ish_abc_saqla_v1', 't2_zamena_ish_yarat_v1',
    't2_bajarilmadi_belgila_v1', 't2_bajarilmadi_bekor_v1', 't2_qator_tahrir'];
  v_oldin jsonb; v_keyin jsonb; v_natijalar jsonb := '[]'::jsonb;
  v_item jsonb; v_rpc text; v_args jsonb; v_arglar text; v_res jsonb;
  v_names text[]; v_types oid[]; v_detail text;
begin
  if p_actor_id is null or p_kompaniya_id is null or p_obyekt_id is null or p_chaqiruvlar is null
     or jsonb_typeof(p_chaqiruvlar) <> 'array' or jsonb_array_length(p_chaqiruvlar) not between 1 and 50
     or p_olchov not in ('smeta', 'fakt', 'f2', 'f2_qoralama', 'aktlar') then
    raise exception 'JDR_ARGUMENT' using errcode = '22023';
  end if;
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id => p_kompaniya_id, p_actor_id => p_actor_id);
  if not exists (select 1 from public.t2_obyekt o where o.id = p_obyekt_id and o.kompaniya_id = p_kompaniya_id) then
    raise exception 'JDR_OBYEKT' using errcode = '42501';
  end if;
  if p_akt_id is not null and not exists (select 1 from public.t2_akt a where a.id = p_akt_id and a.obyekt_id = p_obyekt_id) then
    raise exception 'JDR_AKT' using errcode = '42501';
  end if;

  begin
    select jsonb_build_object(
      'paket', (select x.paket from public._t2_summa_paket_v1(array[p_obyekt_id], p_olchov, case when p_akt_id is null then null else array[p_akt_id] end) x limit 1),
      'qatorlar', coalesce((select jsonb_agg(to_jsonb(h)) from public.t2_qator_holat h where h.obyekt_id = p_obyekt_id and h.qator_id = any(p_qator_idlar)), '[]'::jsonb),
      'akt_qatorlar', case when p_akt_id is null then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object('qator_id', aq.qator_id, 'hajm', aq.hajm, 'narx', aq.narx,
        'summa', aq.summa, 'certified_quantity', aq.certified_quantity, 'certified_unit_price', aq.certified_unit_price, 'certified_amount', aq.certified_amount) order by aq.id)
        from public.t2_akt_qator aq where aq.akt_id = p_akt_id), '[]'::jsonb) end)
      into v_oldin;

    for v_item in select e from jsonb_array_elements(p_chaqiruvlar) as t(e) loop
      v_rpc := v_item->>'rpc';
      v_args := coalesce(v_item->'args', '{}'::jsonb);
      if v_rpc is null or not (v_rpc = any(c_ruxsat)) or jsonb_typeof(v_args) <> 'object' then
        raise exception 'JDR_RPC_RUXSAT' using errcode = '42501';
      end if;
      select p.proargnames, string_to_array(p.proargtypes::text, ' ')::oid[] into v_names, v_types
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = v_rpc and p.proargnames is not null
         and not exists (select 1 from jsonb_object_keys(v_args) as ks(k) where k <> all(p.proargnames))
       order by p.pronargs desc limit 1;
      if v_names is null then raise exception 'JDR_RPC_IMZO' using errcode = '22023'; end if;
      -- aktor MAJBURAN sessiyadan (chaqiruvchi yuborgan qiymat e'tiborsiz)
      if 'p_actor_id' = any(v_names) then v_args := v_args || jsonb_build_object('p_actor_id', p_actor_id); end if;
      select string_agg(format('%I => %s', ks.k,
               case when format_type(v_types[array_position(v_names, ks.k)], null) = 'jsonb' then format('nullif($1->%L, ''null''::jsonb)', ks.k)
                    else format('(($1->>%L)::%s)', ks.k, format_type(v_types[array_position(v_names, ks.k)], null)) end), ', ')
        into v_arglar from jsonb_object_keys(v_args) as ks(k);
      execute 'select to_jsonb(public.' || quote_ident(v_rpc) || '(' || coalesce(v_arglar, '') || '))' into v_res using v_args;
      v_natijalar := v_natijalar || jsonb_build_array(jsonb_build_object('rpc', v_rpc, 'natija', v_res));
    end loop;

    select jsonb_build_object(
      'paket', (select x.paket from public._t2_summa_paket_v1(array[p_obyekt_id], p_olchov, case when p_akt_id is null then null else array[p_akt_id] end) x limit 1),
      'qatorlar', coalesce((select jsonb_agg(to_jsonb(h)) from public.t2_qator_holat h where h.obyekt_id = p_obyekt_id and h.qator_id = any(p_qator_idlar)), '[]'::jsonb),
      'akt_qatorlar', case when p_akt_id is null then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object('qator_id', aq.qator_id, 'hajm', aq.hajm, 'narx', aq.narx,
        'summa', aq.summa, 'certified_quantity', aq.certified_quantity, 'certified_unit_price', aq.certified_unit_price, 'certified_amount', aq.certified_amount) order by aq.id)
        from public.t2_akt_qator aq where aq.akt_id = p_akt_id), '[]'::jsonb) end)
      into v_keyin;

    -- Sub-tranzaksiyani ataylab buzamiz: shu blok ichidagi hamma yozuv ROLLBACK bo'ladi; natija DETAIL orqali qaytadi.
    raise exception 'jarvis_dry_run' using errcode = 'JDR01', detail = jsonb_build_object('oldin', v_oldin, 'keyin', v_keyin, 'natijalar', v_natijalar)::text;
  exception when sqlstate 'JDR01' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return jsonb_build_object('ok', true, 'dry_run', true) || v_detail::jsonb;
  end;
end;
$$;
revoke all on function public.t2_jarvis_dry_run_v1(bigint, bigint, bigint, jsonb, text, bigint, bigint[]) from public, anon, authenticated;
grant execute on function public.t2_jarvis_dry_run_v1(bigint, bigint, bigint, jsonb, text, bigint, bigint[]) to service_role;
comment on function public.t2_jarvis_dry_run_v1(bigint, bigint, bigint, jsonb, text, bigint, bigint[]) is
  'Jarvis dry_run: oq ro''yxatdagi yozuv RPC larini sub-tranzaksiyada ishga tushirib, oldin/keyin holat (+ yagona summa paketi) bilan ROLLBACK qiladi. Hech narsa saqlanmaydi.';
