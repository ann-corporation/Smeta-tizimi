-- 20270121000101_t2_hujjat_yangila_ol_v2
-- «Hujjat doim tayyor» navbati: F-2 BIRINCHI va tur filtri (egasi 2026-11-21: paket tayyor F-2 ni Diskdan olishi kerak).
-- Prod: og'ir ostatka/slichitelniy qatorlari (eski keyingi_vaqt) navbat boshida turib, tez F-2 larni to'sardi; fon ishlovchi
-- (functions/_shared/hujjat-fon.ts, javobdan keyin waitUntil) faqat F-2 ni oladi. v1 o'zgarmaydi (cron/paket ishlovchilari).
-- Additive: yangi funksiya. Faqat service_role. Fayl ichida begin/commit yo'q (L0 ROLLBACK sinovi bilan qo'llaydi).
create or replace function public.t2_hujjat_yangila_ol_v2(p_limit integer default 5, p_kompaniya bigint default null, p_turlar text[] default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $fn$
declare v_res jsonb;
begin
  update public.t2_hujjat_yangila_navbat set holat = 'kutmoqda', keyingi_vaqt = now()
   where holat = 'ishlanmoqda' and boshlandi < now() - interval '15 minutes' and (p_kompaniya is null or kompaniya_id = p_kompaniya);
  with t as (
    select id from public.t2_hujjat_yangila_navbat
     where holat = 'kutmoqda' and keyingi_vaqt <= now() and tur <> '_backfill'
       and (p_kompaniya is null or kompaniya_id = p_kompaniya)
       and (p_turlar is null or tur = any(p_turlar))
     order by (tur = 'f2') desc, keyingi_vaqt
     limit least(greatest(coalesce(p_limit, 5), 1), 50) for update skip locked
  ), u as (
    update public.t2_hujjat_yangila_navbat n set holat = 'ishlanmoqda', boshlandi = now(), urinish = n.urinish + 1, qayta = false
      from t where n.id = t.id returning n.*
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'tur', u.tur, 'manba_id', u.manba_id, 'kompaniya_id', u.kompaniya_id, 'obyekt_id', u.obyekt_id,
           'urinish', u.urinish, 'aktor_id', public._t2_hujjat_yangila_aktor_v1(u.kompaniya_id)) order by u.id), '[]'::jsonb) into v_res from u;
  return jsonb_build_object('ok', true, 'qatorlar', v_res);
end $fn$;

revoke all on function public.t2_hujjat_yangila_ol_v2(integer, bigint, text[]) from public, anon, authenticated;
grant execute on function public.t2_hujjat_yangila_ol_v2(integer, bigint, text[]) to service_role;
