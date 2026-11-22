-- Hujjat navbati: fonda uzilib qolgan (Worker CPU/vaqt chegarasi — xato yozilmaydi) hujjat cheksiz qayta olinmasin.
-- Eskirgan «ishlanmoqda» (15 daqiqa) tiklanganda: urinish >= 5 bo'lsa 6 soatga kechiktiriladi va sababi oxirgi_xato ga yoziladi
-- (har urinish sayt isolate ini o'ldirib, foydalanuvchiga 503 berishi mumkin edi). Qolgan mantiq v2 bilan AYNAN bir xil.
create or replace function public.t2_hujjat_yangila_ol_v2(p_limit integer default 5, p_kompaniya bigint default null, p_turlar text[] default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_res jsonb;
begin
  update public.t2_hujjat_yangila_navbat
     set holat = 'kutmoqda',
         keyingi_vaqt = case when urinish >= 5 then now() + interval '6 hours' else now() end,
         oxirgi_xato = case when urinish >= 5
                            then 'FON_UZILDI: ' || urinish || ' marta fonda yakunlanmadi (vaqt/CPU chegarasi) — 6 soatdan keyin qayta; zarur bo''lsa saytdan qo''lda yasang'
                            else oxirgi_xato end
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
end $function$;
