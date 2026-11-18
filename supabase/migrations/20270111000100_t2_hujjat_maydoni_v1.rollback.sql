-- Orqaga qaytarish: Hujjat maydoni. DIQQAT: foydalanuvchi fayllari metama'lumoti o'chadi (R2 baytlari alohida tozalanadi).
-- t2_token_holat_v1 asl ko'rinishiga qaytariladi.
create or replace function public.t2_token_holat_v1(p_kompaniya_id bigint, p_actor_id bigint)
 returns jsonb language plpgsql stable security definer set search_path to 'public', 'pg_temp' as $function$
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  return jsonb_build_object(
    'balans', public.t2_token_balans(p_kompaniya_id),
    'obuna', (select jsonb_build_object('tarif', o.tarif_kod, 'nom', t.nom, 'oylik_token', t.oylik_token, 'boshlandi', o.boshlandi, 'tugaydi', o.tugaydi)
                from public.t2_obuna o join public.t2_tarif t on t.kod = o.tarif_kod
               where o.kompaniya_id = p_kompaniya_id and o.holat = 'faol' order by o.id desc limit 1),
    'tariflar', (select coalesce(jsonb_agg(jsonb_build_object('kod', kod, 'nom', nom, 'oylik_token', oylik_token, 'narx_som', narx_som) order by tartib), '[]'::jsonb) from public.t2_tarif where faol),
    'narxlar', (select coalesce(jsonb_agg(jsonb_build_object('amal', amal, 'nom', nom, 'tur', tur, 'narx', narx, 'birlik', birlik, 'minimum', minimum,
        'asos_som', asos_som, 'birlik_som', birlik_som, 'min_som', min_som, 'max_som', max_som, 'foyda_foiz', foyda_foiz, 'izoh', izoh, 'faol', faol) order by amal), '[]'::jsonb) from public.t2_token_narx),
    'sozlama', (select jsonb_build_object('token_som', token_som, 'foyda_foiz', foyda_foiz, 'royxat_bonus_token', royxat_bonus_token, 'usd_kurs', usd_kurs, 'tolov_rekvizit', tolov_rekvizit) from public.t2_token_sozlama where id = 1),
    'paketlar', (select coalesce(jsonb_agg(jsonb_build_object('kod', kod, 'nom', nom, 'token', token, 'narx_som', narx_som) order by tartib), '[]'::jsonb) from public.t2_token_paket where faol),
    'sorovlar', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'vaqt', yaratildi, 'paket', paket_kod, 'token', token, 'summa_som', summa_som, 'usul', usul, 'holat', holat, 'sabab', sabab) order by id desc), '[]'::jsonb)
                   from (select * from public.t2_tolov_sorov where kompaniya_id = p_kompaniya_id order by id desc limit 20) s),
    'harakatlar', (select coalesce(jsonb_agg(x order by (x->>'id')::bigint desc), '[]'::jsonb) from (
        select jsonb_build_object('id', h.id, 'miqdor', h.miqdor, 'tur', h.tur, 'amal', h.amal, 'birlik_soni', h.birlik_soni, 'izoh', h.izoh, 'yaratildi', h.yaratildi,
            'meta', h.meta, 'kim', f.login, 'qaytarilgan', exists (select 1 from public.t2_token_harakat q where q.tur = 'qaytarish' and q.bogliq_operation_id = h.operation_id)) x
          from public.t2_token_harakat h left join public.t2_foydalanuvchi f on f.id = h.foydalanuvchi_id
         where h.kompaniya_id = p_kompaniya_id order by h.id desc limit 200) q),
    'superadmin', public.t2_platforma_superadmin(p_actor_id),
    'demo_obyekt_id', (select obyekt_id from public.t2_demo_manba where id = 1));
end $function$;

do $d$ declare r record; begin
  for r in select p.oid::regprocedure s from pg_proc p where p.pronamespace = 'public'::regnamespace and (p.proname like 't2\_hm\_%' or p.proname like '\_t2\_hm\_%') loop
    execute 'drop function ' || r.s;
  end loop;
end $d$;

drop table if exists public.t2_hm_hisob, public.t2_hm_trafik, public.t2_hm_reja, public.t2_hm_tg_kutish, public.t2_hm_sozlama, public.t2_hm_faoliyat,
  public.t2_hm_izoh, public.t2_hm_ulashish, public.t2_hm_versiya, public.t2_hm_fayl;
delete from public.t2_token_narx where amal in ('hujjat_xotira', 'hujjat_trafik');
delete from public.t2_tarif where tur = 'disk';
alter table public.t2_tarif drop constraint if exists t2_tarif_tur_chk;
alter table public.t2_tarif drop column if exists disk_bayt, drop column if exists tur;
alter table public.t2_token_sozlama drop column if exists disk_bepul_kompaniya_bayt, drop column if exists disk_bepul_shaxsiy_bayt,
  drop column if exists trafik_bepul_oylik_bayt, drop column if exists disk_ortiqcha_max_bayt;
-- Shaxsiy papkalar (egasi_foydalanuvchi_id) bo'lsa kompaniya_id not null tiklanmaydi - avval ularni o'chiring.
delete from public.t2_fayl_papka where egasi_foydalanuvchi_id is not null;
alter table public.t2_fayl_papka drop constraint if exists t2_fayl_papka_egasi_chk;
drop index if exists public.t2_fayl_papka_shaxsiy_nom_uq;
alter table public.t2_fayl_papka drop column if exists egasi_foydalanuvchi_id;
alter table public.t2_fayl_papka alter column kompaniya_id set not null;