-- Rollback 20261217800000: v2 funksiyani olib tashlaydi, _t2_zakazchik_paket_v1 ni jonli yadroga qaytaradi (sekin, lekin to'g'ri).
drop function if exists public.t2_zakazchik_obyektlar_v2(bigint, bigint, bigint, boolean);

create or replace function public._t2_zakazchik_paket_v1(p_men bigint, p_qarshi bigint, p_obyekt_id bigint, p_resurs text, p_olchov text)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v jsonb;
begin
  if p_olchov not in ('smeta', 'fakt', 'f2') then return null; end if;
  if not public.t2_tomon_ruxsat_bor(p_men, p_qarshi, p_resurs, 'korish', p_obyekt_id) then return null; end if;
  if not exists (select 1 from public.t2_obyekt o where o.id = p_obyekt_id and o.kompaniya_id = p_qarshi) then return null; end if;
  select x.paket into v from public._t2_summa_paket_v1(array[p_obyekt_id], p_olchov) x where x.obyekt_id = p_obyekt_id;
  if v is null or coalesce((v->>'qator_soni')::integer, 0) = 0 then return null; end if;
  return jsonb_build_object('qqs_bilan', v->'qqs_bilan', 'ustamali', v->'ustamali', 'ustamasiz', v->'ustamasiz',
                            'narxsiz_soni', coalesce((v->>'narxsiz_soni')::integer, 0), 'qator_soni', (v->>'qator_soni')::integer);
end $$;
revoke all on function public._t2_zakazchik_paket_v1(bigint, bigint, bigint, text, text) from public, anon, authenticated;
grant execute on function public._t2_zakazchik_paket_v1(bigint, bigint, bigint, text, text) to service_role;
