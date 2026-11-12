-- 20261217800000 - Buyurtmachi kabineti tezligi (/api/tomon): "Bugun" va "Obyektlar" 10-15 s -> < 1 s.
--
-- O'LCHOV (prod, FAQAT O'QISH, EXPLAIN ANALYZE, kompaniya 433 / aloqa 91 / qarshi 123: 36 faol obyekt, 60 tasdiqlangan F2 akti):
--   t2_zakazchik_bugun_v1     14 468 ms  (36 obyekt x 3 ta _t2_summa_paket_v1 = jonli yadro; obyekt 153 bittasi 2,3 s)
--   t2_zakazchik_obyektlar_v1  4 162 ms  (har F2 aktiga _t2_f2_ustamali ~0,2-4,7 s; ro'yxat uni ISHLATMAYDI)
--   t2_tomon_aloqalar_v1          58 ms,  t2_tomon_taqdimlar_v1  7 ms (muammo emas)
--   shlyuz (functions/api/tomon.ts): bitta sessiya tekshiruvi + bitta RPC - ketma-ket chaqiruv yo'q.
-- SABAB: (1) bugun portfeli har obyekt uchun hisob YADROSINI jonli ishlatadi, vaholanki tayyor hisoblar keshi (t2_obyekt_kesh,
--   20261214400000) bor va to'liq to'lgan; (2) obyektlar ro'yxati har akt uchun og'ir ustamali podval hisobini qiladi - uni faqat
--   bitta obyekt sahifasi (ObyektPortali) ko'radi.
-- YECHIM (formula YANGI YOZILMAYDI):
--   A) _t2_zakazchik_paket_v1: _t2_summa_paket_v1 -> _t2_summa_paket_kesh_v1 (shakl bir xil; iflos/eskirgan obyekt uchun kesh
--      O'ZI jonli hisobga o'tadi - raqam hech qachon eskirmaydi).
--   B) t2_zakazchik_obyektlar_v2(actor, kompaniya, obyekt_id, ustama): ustama=false (standart) - ustamali podval hisobsiz tez ro'yxat;
--      ustama=true + obyekt_id - avvalgi v1 bilan AYNAN bir xil to'liq javob (bitta obyekt uchun). v1 O'ZGARMAYDI (orqaga mosligi).
-- Ruxsat/grant tekshiruvi o'zgarmaydi (_t2_tomon_azo, t2_tomon_ruxsat_bor har obyekt uchun). Jadval/indeks YO'Q.

create or replace function public._t2_zakazchik_paket_v1(p_men bigint, p_qarshi bigint, p_obyekt_id bigint, p_resurs text, p_olchov text)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v jsonb;
begin
  if p_olchov not in ('smeta', 'fakt', 'f2') then return null; end if;
  if not public.t2_tomon_ruxsat_bor(p_men, p_qarshi, p_resurs, 'korish', p_obyekt_id) then return null; end if;
  if not exists (select 1 from public.t2_obyekt o where o.id = p_obyekt_id and o.kompaniya_id = p_qarshi) then return null; end if;
  select x.paket into v from public._t2_summa_paket_kesh_v1(array[p_obyekt_id], p_olchov) x where x.obyekt_id = p_obyekt_id;
  if v is null or coalesce((v->>'qator_soni')::integer, 0) = 0 then return null; end if;
  return jsonb_build_object('qqs_bilan', v->'qqs_bilan', 'ustamali', v->'ustamali', 'ustamasiz', v->'ustamasiz',
                            'narxsiz_soni', coalesce((v->>'narxsiz_soni')::integer, 0), 'qator_soni', (v->>'qator_soni')::integer);
end $$;
revoke all on function public._t2_zakazchik_paket_v1(bigint, bigint, bigint, text, text) from public, anon, authenticated;
grant execute on function public._t2_zakazchik_paket_v1(bigint, bigint, bigint, text, text) to service_role;

create or replace function public.t2_zakazchik_obyektlar_v2(p_actor_id bigint, p_kompaniya_id bigint, p_obyekt_id bigint default null, p_ustama boolean default false)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v jsonb;
begin
  perform public._t2_tomon_azo(p_actor_id, p_kompaniya_id, 'korish');
  select coalesce(jsonb_agg(x order by x->>'qarshi_nom', x->>'obyekt_nom'), '[]'::jsonb) into v from (
    select jsonb_build_object(
      'aloqa_id', a.id, 'qarshi_kompaniya_id', c.id, 'qarshi_nom', c.nom, 'qarshi_rol', case when a.taklif_kompaniya_id = p_kompaniya_id then a.qabul_rol else a.taklif_rol end,
      'obyekt_id', o.id, 'obyekt_nom', o.nom,
      'shartnoma', case when public.t2_tomon_ruxsat_bor(p_kompaniya_id, c.id, 'shartnoma_xulosa', 'korish', o.id) then (
          select jsonb_build_object('raqam', s.raqam, 'nom', s.nom, 'summa_bez_nds', s.summa_bez_nds, 'jami_nds_bilan', s.jami_nds_bilan)
            from public.t2_shartnoma s join public.t2_shartnoma_bog b on b.shartnoma_id = s.id and b.holat = 'faol'
           where b.obyekt_id = o.id and s.holat = 'faol' order by s.asosiy desc nulls last, s.id limit 1) end,
      'f2', case when public.t2_tomon_ruxsat_bor(p_kompaniya_id, c.id, 'f2', 'korish', o.id) then (
          select jsonb_build_object('soni', count(*), 'jami', coalesce(sum(t.hujjat_jami), 0), 'oxirgi_oy', max(t.oy),
                 'royxat', coalesce(jsonb_agg(jsonb_build_object('akt_id', t.id, 'raqam', t.raqam, 'oy', t.oy, 'jami', t.hujjat_jami)
                              || case when p_ustama then jsonb_build_object('ustama', public._t2_f2_ustamali(c.id, coalesce(t.shartnoma_id, (select b2.shartnoma_id from public.t2_shartnoma_bog b2 where b2.obyekt_id = o.id and b2.holat = 'faol' order by b2.shartnoma_id limit 1)), array[t.id])) else '{}'::jsonb end
                              order by t.oy desc nulls last, t.id desc), '[]'::jsonb))
                 || case when p_ustama and count(*) > 0 then jsonb_build_object('ustama_jami', public._t2_f2_ustamali(c.id, (select b3.shartnoma_id from public.t2_shartnoma_bog b3 where b3.obyekt_id = o.id and b3.holat = 'faol' order by b3.shartnoma_id limit 1), array_agg(t.id))) else '{}'::jsonb end
            from public.t2_akt t where t.obyekt_id = o.id and t.kompaniya_id = c.id and t.tur = 'f2' and t.lifecycle_status = 'approved') end,
      'kutayotgan_taqdim', (select count(*) from public.t2_tomon_taqdim q where q.obyekt_id = o.id and q.qabul_qiluvchi_kompaniya_id = p_kompaniya_id and q.holat in ('yuborilgan','ko_rilmoqda'))
    ) x
      from public.t2_tomon_aloqa a
      join public.t2_kompaniya c on c.id = public._t2_tomon_qarshi(a, p_kompaniya_id)
      join public.t2_obyekt o on o.kompaniya_id = c.id and o.holat = 'faol' and (p_obyekt_id is null or o.id = p_obyekt_id)
     where a.holat = 'faol' and (a.taklif_kompaniya_id = p_kompaniya_id or a.qabul_kompaniya_id = p_kompaniya_id)
       and public.t2_tomon_ruxsat_bor(p_kompaniya_id, c.id, 'obyekt_holat', 'korish', o.id)
  ) s;
  return v;
end $$;
revoke all on function public.t2_zakazchik_obyektlar_v2(bigint, bigint, bigint, boolean) from public, anon, authenticated;
grant execute on function public.t2_zakazchik_obyektlar_v2(bigint, bigint, bigint, boolean) to service_role;
comment on function public.t2_zakazchik_obyektlar_v2(bigint, bigint, bigint, boolean) is 'Buyurtmachi obyektlari: ustama=false tez ro''yxat; ustama=true + obyekt_id = v1 bilan bir xil to''liq javob.';
