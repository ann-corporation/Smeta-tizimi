-- T2-ICHKI-QARZ-001 (A1) - Qarz svodi: debitor (buyurtmachi) va kreditor (yetkazuvchi/pudratchi/subpudrat) shartnoma va obyekt kesimida.
-- FAQAT O'QISH: yangi jadval yo'q, mavjud t2_shartnoma / t2_shartnoma_ds / t2_forma3 (manba='sotuv') / t2_tolov / t2_akt / t2_shartnoma_tomon o'qiladi.
-- Qoidalar: NULL != 0 (summa noma'lum bo'lsa null); hamma summa QQS bilan (shartnoma/F3/to'lov); F2 (nakrutkasiz) alohida ustun - ayirilmaydi.
--  * asosiy shartnoma  -> yonalish='debitor':  qarz = F3(sotuv) - to'lov  (+ buyurtmachi qarzi, - ishlanmagan avans)
--  * qolgan shartnoma  -> yonalish='kreditor': biz to'laymiz; akt/F3 bazasi tizimda yo'q, shuning uchun qarz=null,
--                         qoldiq_shartnoma = joriy shartnoma summasi - to'langan (null agar summa noma'lum).
begin;

create or replace function public.t2_qarz_svod_v1(p_kompaniya_id bigint, p_actor_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_res jsonb;
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'f2.read');
  select jsonb_build_object('ok', true, 'generated_at', now(), 'qatorlar', coalesce(jsonb_agg(x.j order by x.yonalish, x.raqam, x.id), '[]'::jsonb))
    into v_res
    from (
      select s.id, s.raqam, case when s.asosiy then 'debitor' else 'kreditor' end as yonalish, jsonb_build_object(
        'shartnoma_id', s.id, 'raqam', s.raqam, 'nom', s.nom, 'holat', s.holat, 'turi', s.turi,
        'yonalish', case when s.asosiy then 'debitor' else 'kreditor' end,
        'kontragent', (select t.nom from public.t2_shartnoma_tomon t where t.shartnoma_id = s.id order by t.tartib, t.id limit 1),
        'kontragent_rol', (select t.rol from public.t2_shartnoma_tomon t where t.shartnoma_id = s.id order by t.tartib, t.id limit 1),
        'obyektlar', (select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'nom', o.nom) order by o.nom), '[]'::jsonb)
                        from (select b.obyekt_id from public.t2_shartnoma_bog b where b.shartnoma_id = s.id and b.holat = 'faol'
                              union select q.obyekt_id from public.t2_shartnoma_qoshimcha_bog q where q.shartnoma_id = s.id and q.holat = 'faol') u
                        join public.t2_obyekt o on o.id = u.obyekt_id),
        'shartnoma_summa', coalesce((select d.jami_nds_bilan from public.t2_shartnoma_ds d where d.shartnoma_id = s.id and d.holat = 'faol'
                                      order by d.sana desc, d.id desc limit 1), s.jami_nds_bilan),
        'f3_sotuv', case when s.asosiy then (select coalesce(sum(f.sotuv_summa), 0) from public.t2_forma3 f
                          where f.shartnoma_id = s.id and f.kompaniya_id = p_kompaniya_id and f.manba = 'sotuv' and f.holat <> 'bekor') end,
        'tolangan', (select coalesce(sum(case when t.tur = 'qaytarim' then -t.summa else t.summa end), 0)
                       from public.t2_tolov t where t.shartnoma_id = s.id and t.holat <> 'bekor'),
        'f2_nakrutkasiz', (select sum(a.hujjat_jami) from public.t2_akt a
                            left join public.t2_shartnoma_bog b on b.obyekt_id = a.obyekt_id and b.holat = 'faol'
                           where a.tur = 'f2' and a.holat = 'tasdiqlangan' and coalesce(a.shartnoma_id, b.shartnoma_id) = s.id
                             and (a.kompaniya_id = p_kompaniya_id or a.kompaniya_id is null)),
        'oxirgi_tolov_sana', (select max(t.sana) from public.t2_tolov t where t.shartnoma_id = s.id and t.holat <> 'bekor')
      ) || jsonb_build_object(
        'qarz', case when s.asosiy then
            (select coalesce(sum(f.sotuv_summa), 0) from public.t2_forma3 f
              where f.shartnoma_id = s.id and f.kompaniya_id = p_kompaniya_id and f.manba = 'sotuv' and f.holat <> 'bekor')
            - (select coalesce(sum(case when t.tur = 'qaytarim' then -t.summa else t.summa end), 0)
                 from public.t2_tolov t where t.shartnoma_id = s.id and t.holat <> 'bekor')
          end
      ) j
      from public.t2_shartnoma s
     where s.kompaniya_id = p_kompaniya_id and s.holat <> 'bekor'
    ) x;
  return v_res;
end $$;

revoke all on function public.t2_qarz_svod_v1(bigint, bigint) from public, anon, authenticated;
grant execute on function public.t2_qarz_svod_v1(bigint, bigint) to service_role;

commit;