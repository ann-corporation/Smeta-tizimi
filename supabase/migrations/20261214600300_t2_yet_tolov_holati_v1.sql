-- YETKAZUVCHI TOMONI: yetkazuvchi o'z qarzining TO'LOV HOLATINI ko'radi (egasi 2026-11-12) - faqat xaridor (pudratchi) grant bergan bo'lsa.
-- Yangi jadval YO'Q. Manba: xaridor tenantidagi t2_qarz_asos (buyurtma qatorlari bo'yicha) + t2_tolov (shartnoma bo'yicha) - qarzdorlik hisobi bilan bir xil qoida.
-- Ruxsat: t2_tomon_ruxsat_bor(yetkazuvchi, xaridor, 'tolov_holati', 'korish', obyekt) - deny-by-default; resurs 'tolov_holati' ni faollashtirish
--   20261214000000 (buyurtmachi tomoni, PR #362) da: u qo'llangach xaridor shu resursni yetkazuvchiga obyekt bo'yicha GRANT qiladi.
-- Grant yo'q -> ruxsat=false va pul maydonlari NULL (0 emas). To'lov summasi shartnoma darajasida (to'lov buyurtmaga emas, shartnomaga yoziladi):
--   qabul (buyurtma) = shu buyurtma qarz asoslari yig'indisi, QQS bilan; tolangan/qarz = shartnoma bo'yicha (boshlang'ich + qabul - to'langan).
--   holat: tolangan (qarz <= 0) | qisman (to'langan > 0) | tolanmagan | NULL (qarz asosi yo'q yoki noma'lum).
create or replace function public.t2_yet_tolov_holati_v1(p_actor_id bigint, p_kompaniya_id bigint)
returns jsonb language plpgsql stable security definer set search_path to 'public', 'pg_temp' as $fn$
declare v jsonb;
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public._t2_yet_azo(p_actor_id, p_kompaniya_id, 'korish');
  select coalesce(jsonb_agg(r order by (r->>'buyurtma_id')::bigint desc), '[]'::jsonb) into v from (
    select jsonb_build_object(
      'buyurtma_id', z.id, 'xaridor_kompaniya_id', z.kompaniya_id, 'xaridor_nom', z.nom, 'obyekt_id', z.obyekt_id, 'holat', z.holat,
      'ruxsat', z.ruxsat,
      'shartnoma_id', case when z.ruxsat then z.sh end,
      'qabul_qqs_bilan', case when z.ruxsat then z.qabul_b end,
      'tolangan_qqs_bilan', case when z.ruxsat and z.sh is not null then z.tolangan end,
      'qarz_qqs_bilan', case when z.ruxsat and z.sh is not null and (z.boshl is not null or z.qabul_sh is not null or z.tolangan is not null)
                             then coalesce(z.boshl, 0) + coalesce(z.qabul_sh, 0) - coalesce(z.tolangan, 0) end,
      'tolov_holati', case when not z.ruxsat or z.sh is null or (z.boshl is null and z.qabul_sh is null and z.tolangan is null) then null
                           when coalesce(z.boshl, 0) + coalesce(z.qabul_sh, 0) - coalesce(z.tolangan, 0) <= 0.005 then 'tolangan'
                           when coalesce(z.tolangan, 0) > 0 then 'qisman' else 'tolanmagan' end) as r
    from (
      select b.id, b.kompaniya_id, k.nom, b.obyekt_id, b.holat,
             public.t2_tomon_ruxsat_bor(p_kompaniya_id, b.kompaniya_id, 'tolov_holati', 'korish', b.obyekt_id) as ruxsat,
             s.sh, s.qabul_b, a.boshl, a.qabul_sh, (case when a.tolov_asos is null and t.tolov_t2 is null then null else coalesce(a.tolov_asos, 0) + coalesce(t.tolov_t2, 0) end) as tolangan
        from (select * from public.t2_buyurtma
               where ijrochi_kompaniya_id = p_kompaniya_id and holat in ('qabul_qilindi_yakuniy', 'qisman')
               order by id desc limit 100) b
        join public.t2_kompaniya k on k.id = b.kompaniya_id
        left join lateral (
          select max(q.shartnoma_id) as sh, sum(q.summa) as qabul_b
            from public.t2_qarz_asos q
           where q.kompaniya_id = b.kompaniya_id and q.holat = 'faol'
             and q.buyurtma_qator_id in (select bq.id from public.t2_buyurtma_qator bq where bq.buyurtma_id = b.id)) s on true
        left join lateral (
          select sum(q.summa) filter (where q.tur = 'boshlangich_qoldiq') as boshl,
                 sum(q.summa) filter (where q.tur in ('yetkazib_berish', 'bajarilgan_ish')) as qabul_sh,
                 sum(q.summa) filter (where q.tur = 'tolov' and q.tolov_id is null) as tolov_asos
            from public.t2_qarz_asos q where q.kompaniya_id = b.kompaniya_id and q.holat = 'faol' and q.shartnoma_id = s.sh) a on true
        left join lateral (
          select sum(case when tl.tur = 'qaytarim' then -tl.summa else tl.summa end) as tolov_t2
            from public.t2_tolov tl where tl.kompaniya_id = b.kompaniya_id and tl.holat <> 'bekor' and tl.shartnoma_id = s.sh) t on true
    ) z
  ) y;
  return jsonb_build_object('ok', true, 'qatorlar', v);
end $fn$;
revoke all on function public.t2_yet_tolov_holati_v1(bigint, bigint) from public, anon, authenticated;
grant execute on function public.t2_yet_tolov_holati_v1(bigint, bigint) to service_role;
