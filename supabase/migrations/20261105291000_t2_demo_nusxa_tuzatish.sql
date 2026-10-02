-- Tuzatish (2026-10-02): _t2_demo_nusxa generated ustunlarga (nom_key, birlik_key) qiymat yozardi —
-- demo manba tanlangach har bir o'zi ro'yxat / Google kirish xato bilan tugardi. Generated ustunlar o'zi hisoblanadi.
begin;

create or replace function public._t2_demo_nusxa(p_kompaniya_id bigint, p_manba_obyekt_id bigint) returns bigint
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_loyiha bigint; v_obyekt bigint; v_nom text;
begin
  select nom into v_nom from public.t2_obyekt where id = p_manba_obyekt_id;
  if v_nom is null then return null; end if;
  insert into public.t2_loyiha(kompaniya_id, nom, izoh) values (p_kompaniya_id, 'Demo loyiha', 'Sinash uchun namuna') returning id into v_loyiha;
  insert into public.t2_obyekt(nom, kompaniya_id, loyiha_id, izoh) values ('DEMO — ' || v_nom, p_kompaniya_id, v_loyiha, 'Namuna smeta: bemalol sinab ko''ring') returning id into v_obyekt;
  drop table if exists pg_temp._demo_map;
  create temp table _demo_map on commit drop as
    select q.id eski, nextval(pg_get_serial_sequence('public.t2_qator', 'id')) yangi from public.t2_qator q where q.obyekt_id = p_manba_obyekt_id;
  insert into public.t2_qator(id, obyekt_id, kompaniya_id, ota_id, daraja, tartib, tur, kod, nom, birlik, hajm, narx, kat, summa, narx_usul, d1, d2, d3, norma, raqam)
  overriding system value
  select m.yangi, v_obyekt, p_kompaniya_id, mo.yangi, q.daraja, q.tartib, q.tur, q.kod, q.nom, q.birlik, q.hajm, q.narx, q.kat, q.summa, q.narx_usul, q.d1, q.d2, q.d3, q.norma, q.raqam
    from public.t2_qator q join _demo_map m on m.eski = q.id left join _demo_map mo on mo.eski = q.ota_id
   where q.obyekt_id = p_manba_obyekt_id and q.qoshimcha is not true
   order by q.daraja, q.id;
  return v_obyekt;
end $$;
revoke all on function public._t2_demo_nusxa(bigint, bigint) from public, anon, authenticated;

commit;
