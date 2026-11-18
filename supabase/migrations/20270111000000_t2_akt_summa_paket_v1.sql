-- Bitta F2 aktning summa paketi (QQS bilan / ustamali QQS siz / ustamasiz) — faqat O'QISH (egasi 2026-11-18: Windows + Android ilovalarida
-- har akt bo'yicha ustamali va QQS bilan jami; summa mijozda HISOBLANMAYDI). Yagona yadro `_t2_summa_paket_v1` (olchov 'aktlar', aktning o'z
-- podvali bilan) natijasi o'zgarishsiz qaytariladi: sayt va MCP `f2` vositasi bilan bir xil raqam.
-- Xavfsizlik: faqat service_role (Pages Function, aktor sessiyadan); a'zolik + f2.read shu yerda tekshiriladi.
-- QO'LLANMAGAN: bu fayl faqat repoda; prodga qo'llashdan oldin ROLLBACK sinovi (acceptance fayl) majburiy.
create or replace function public.t2_akt_summa_paket_v1(p_akt_id bigint, p_actor_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_obyekt bigint; v_komp bigint; v_p jsonb;
begin
  select a.obyekt_id, a.kompaniya_id into v_obyekt, v_komp from public.t2_akt a where a.id = p_akt_id and a.tur in ('f2', 'fakt');
  if v_komp is null then return jsonb_build_object('ok', false, 'code', 'AKT_NOT_FOUND'); end if;
  perform public.t2_actor_kompaniya_azo_tekshir(v_komp, p_actor_id);
  perform public.t2_require_permission_v2(v_komp, p_actor_id, 'f2.read');
  select x.paket into v_p from public._t2_summa_paket_v1(array[v_obyekt], 'aktlar', array[p_akt_id]) x limit 1;
  return jsonb_build_object('ok', true, 'akt_id', p_akt_id, 'paket', v_p);
end;
$$;
revoke all on function public.t2_akt_summa_paket_v1(bigint, bigint) from public, anon, authenticated;
grant execute on function public.t2_akt_summa_paket_v1(bigint, bigint) to service_role;
comment on function public.t2_akt_summa_paket_v1(bigint, bigint) is
  'Bitta akt summa paketi (QQS bilan / ustamali / ustamasiz): yagona yadro _t2_summa_paket_v1 natijasi, faqat o''qish. a''zolik + f2.read.';