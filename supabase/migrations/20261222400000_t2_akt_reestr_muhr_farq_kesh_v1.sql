-- TEZLIK 5 (egasi: byudjet yo'q, bepul optimizatsiya). pg_stat_statements: view t2_akt_reestr (~339 chaqiruv, o'rtacha 1,8 s; kompaniya bo'yicha F2 reestri
-- tinch bazada 1,7 s) va view t2_qator_muhr_farq (~143 chaqiruv, o'rtacha 5,3 s; eng katta obyektda 13 s). Ikkalasi har chaqiruvda qayta hisoblanadi.
-- Yechim #504/#513 bilan bir xil: natija t2_obyekt_natija_kesh da (kalit 'akt_reestr' va 'muhr_farq'), "tayyor hisoblar" mexanizmi (t2_obyekt_kesh_iflos +
-- _t2_kesh_hisobla_v1 + pg_cron) yangilaydi. Obyekt iflos / keshda yo'q / 3 kundan eski / xato belgili bo'lsa - ochiq funksiya O'SHA obyekt uchun
-- view ni JONLI o'qiydi. View'lar O'ZGARMAYDI (jonli hisob aynan view'dan olinadi), shuning uchun yangi pul/hisob mantig'i YO'Q.
-- Yangi ochiq funksiyalar (frontend /api/sb {soro}): t2_akt_reestr_obyekt_v1, t2_akt_reestr_kompaniya_v1 (har obyekt keshidan yig'iladi), t2_qator_muhr_farq_obyekt_v1.
-- Avtorizatsiya: a'zolik (t2_actor_kompaniya_azo_tekshir) + view bilan bir xil ruxsat (f2.read / smeta.read).
-- Iflos belgilovchi triggerlar: t2_akt, t2_akt_qator, t2_qator uchun MAVJUD; yetishmagan: t2_qator_muhr (ins/upd/del), t2_ozgarish (jurnal, jadval='t2_qator'), t2_obyekt.nom.
-- Dastlabki to'ldirish: migratsiya ichida emas; cron (t2_obyekt_kesh_yangila_v1) keshi yo'q obyektlarni budjet bilan to'ldiradi (shu paytgacha jonli).
-- Eslatma: TRUNCATE triggeri yo'q (barcha mavjud kesh triggerlari kabi); ommaviy TRUNCATE dan keyin t2_obyekt_kesh_yangila_v1(40,'hammasi') chaqiring.

-- Toza (yangi, 3 kundan eski emas, xatosiz, iflos emas) kesh natijasi; aks holda NULL (chaqiruvchi jonli hisoblaydi).
create or replace function public._t2_kesh_natija_oqi_v1(p_obyekt_id bigint, p_kalit text)
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select k.natija from public.t2_obyekt_natija_kesh k
   where k.obyekt_id = p_obyekt_id and k.kalit = p_kalit and k.hisoblandi > now() - interval '3 days'
     and not (k.natija ? '_xato')
     and not exists (select 1 from public.t2_obyekt_kesh_iflos i where i.obyekt_id = p_obyekt_id)
$function$;

-- Jonli hisob: view'dan aynan o'qiydi (avtorizatsiyasiz, ichki).
create or replace function public._t2_akt_reestr_hisob_v1(p_obyekt_id bigint)
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select jsonb_build_object('ok', true, 'qatorlar', coalesce(jsonb_agg(to_jsonb(r) order by r.oy desc, r.id desc), '[]'::jsonb))
    from public.t2_akt_reestr r where r.obyekt_id = p_obyekt_id
$function$;

create or replace function public._t2_qator_muhr_farq_hisob_v1(p_obyekt_id bigint)
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select jsonb_build_object('ok', true, 'qatorlar', coalesce(jsonb_agg(to_jsonb(f) order by f.qator_id), '[]'::jsonb))
    from public.t2_qator_muhr_farq f where f.obyekt_id = p_obyekt_id
$function$;

revoke all on function public._t2_kesh_natija_oqi_v1(bigint, text), public._t2_akt_reestr_hisob_v1(bigint), public._t2_qator_muhr_farq_hisob_v1(bigint) from public, anon, authenticated;

-- Keshga yozish: avvalgi ikki natijaga qo'shimcha ikkita kalit (xato bo'lsa '_xato' belgisi — o'qish jonliga tushadi).
create or replace function public._t2_obyekt_natija_kesh_hisobla_v1(p_obyekt_id bigint)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_sm jsonb; v_sj jsonb; v_r jsonb;
begin
  if not exists (select 1 from public.t2_obyekt o where o.id = p_obyekt_id) then
    delete from public.t2_obyekt_natija_kesh where obyekt_id = p_obyekt_id;
    return;
  end if;
  select k.smeta, k.smeta_joriy into v_sm, v_sj from public.t2_obyekt_kesh k where k.obyekt_id = p_obyekt_id;
  begin
    v_r := public._t2_smeta_ozgarish_qatlam_hisob_v1(p_obyekt_id, v_sm, v_sj);
  exception when others then v_r := jsonb_build_object('_xato', true);
  end;
  insert into public.t2_obyekt_natija_kesh as n (obyekt_id, kalit, natija, hisoblandi) values (p_obyekt_id, 'smeta_ozgarish_qatlam', coalesce(v_r, jsonb_build_object('_xato', true)), now())
  on conflict (obyekt_id, kalit) do update set natija = excluded.natija, hisoblandi = excluded.hisoblandi;
  begin
    v_r := public._t2_price_control_hisob_v1(p_obyekt_id);
  exception when others then v_r := jsonb_build_object('_xato', true);
  end;
  insert into public.t2_obyekt_natija_kesh as n (obyekt_id, kalit, natija, hisoblandi) values (p_obyekt_id, 'price_control', coalesce(v_r, jsonb_build_object('_xato', true)), now())
  on conflict (obyekt_id, kalit) do update set natija = excluded.natija, hisoblandi = excluded.hisoblandi;
  begin
    v_r := public._t2_akt_reestr_hisob_v1(p_obyekt_id);
  exception when others then v_r := jsonb_build_object('_xato', true);
  end;
  insert into public.t2_obyekt_natija_kesh as n (obyekt_id, kalit, natija, hisoblandi) values (p_obyekt_id, 'akt_reestr', coalesce(v_r, jsonb_build_object('_xato', true)), now())
  on conflict (obyekt_id, kalit) do update set natija = excluded.natija, hisoblandi = excluded.hisoblandi;
  begin
    v_r := public._t2_qator_muhr_farq_hisob_v1(p_obyekt_id);
  exception when others then v_r := jsonb_build_object('_xato', true);
  end;
  insert into public.t2_obyekt_natija_kesh as n (obyekt_id, kalit, natija, hisoblandi) values (p_obyekt_id, 'muhr_farq', coalesce(v_r, jsonb_build_object('_xato', true)), now())
  on conflict (obyekt_id, kalit) do update set natija = excluded.natija, hisoblandi = excluded.hisoblandi;
end $function$;

-- Cron: yangi kalitlar yo'q obyektlar ham to'ldiriladi (faqat shart kengaytirildi; qolgani prod ta'rifi bilan bir xil).
CREATE OR REPLACE FUNCTION public.t2_obyekt_kesh_yangila_v1(p_byudjet_s integer DEFAULT 40, p_rejim text DEFAULT 'iflos'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  r record; v_t0 timestamptz := clock_timestamp(); v_soni int := 0; v_qoldi int := 0;
  v_kalit text := to_char((now() at time zone 'Asia/Tashkent')::date, 'YYYY-MM');
begin
  if not pg_try_advisory_xact_lock(hashtext('t2_obyekt_kesh_yangila_v1')) then
    return jsonb_build_object('ok', true, 'o_tkazildi', 'band');
  end if;
  for r in
    select o.id as obyekt_id, i.versiya
      from public.t2_obyekt o
      left join public.t2_obyekt_kesh_iflos i on i.obyekt_id = o.id
      left join public.t2_obyekt_kesh k on k.obyekt_id = o.id
     where p_rejim = 'hammasi' or i.obyekt_id is not null or k.obyekt_id is null or (k.smeta is not null and k.smeta_joriy is null) or (select count(*) from public.t2_obyekt_natija_kesh nk where nk.obyekt_id = o.id and nk.kalit in ('smeta_ozgarish_qatlam', 'price_control', 'akt_reestr', 'muhr_farq')) < 4 or jsonb_typeof(k.f2_oy->v_kalit) is distinct from 'object'
     order by i.vaqt nulls last, o.id
  loop
    if extract(epoch from clock_timestamp() - v_t0) >= p_byudjet_s then v_qoldi := v_qoldi + 1; continue; end if;
    perform public._t2_kesh_hisobla_v1(r.obyekt_id);
    if r.versiya is not null then
      delete from public.t2_obyekt_kesh_iflos where obyekt_id = r.obyekt_id and versiya = r.versiya;
    end if;
    v_soni := v_soni + 1;
  end loop;
  return jsonb_build_object('ok', true, 'hisoblandi', v_soni, 'qoldi', v_qoldi);
end $function$;

-- Ochiq funksiyalar (avtorizatsiya birinchi, keyin toza keshdan yoki jonli). p_tur: 'f2' | 'fakt' | NULL (hammasi).
create or replace function public.t2_akt_reestr_obyekt_v1(p_obyekt_id bigint, p_actor_id bigint, p_tur text default null)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_k bigint; v_n jsonb;
begin
  select o.kompaniya_id into v_k from public.t2_obyekt o where o.id = p_obyekt_id;
  if v_k is null then return jsonb_build_object('ok', false, 'code', 'OBYEKT_NOT_FOUND'); end if;
  perform public.t2_actor_kompaniya_azo_tekshir(v_k, p_actor_id);
  perform public.t2_require_permission_v2(v_k, p_actor_id, 'f2.read');
  v_n := coalesce(public._t2_kesh_natija_oqi_v1(p_obyekt_id, 'akt_reestr'), public._t2_akt_reestr_hisob_v1(p_obyekt_id));
  if p_tur is null then return v_n; end if;
  return jsonb_build_object('ok', true, 'qatorlar', coalesce((select jsonb_agg(t.e order by t.n) from jsonb_array_elements(v_n->'qatorlar') with ordinality t(e, n) where t.e->>'tur' = p_tur), '[]'::jsonb));
end $function$;

create or replace function public.t2_akt_reestr_kompaniya_v1(p_kompaniya_id bigint, p_actor_id bigint, p_tur text default null)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'f2.read');
  -- Har obyekt: toza keshdan, aks holda jonli (coalesce jonlini faqat kerak bo'lsa hisoblaydi). Akt kompaniyasi bo'yicha filtr (view bilan bir xil).
  return jsonb_build_object('ok', true, 'qatorlar', coalesce((
    select jsonb_agg(x.e order by (x.e->>'oy') desc, (x.e->>'id')::bigint desc)
      from public.t2_obyekt o
      cross join lateral jsonb_array_elements(coalesce(public._t2_kesh_natija_oqi_v1(o.id, 'akt_reestr'), public._t2_akt_reestr_hisob_v1(o.id))->'qatorlar') x(e)
     where o.kompaniya_id = p_kompaniya_id and (x.e->>'kompaniya_id')::bigint = p_kompaniya_id and (p_tur is null or x.e->>'tur' = p_tur)), '[]'::jsonb));
end $function$;

create or replace function public.t2_qator_muhr_farq_obyekt_v1(p_obyekt_id bigint, p_actor_id bigint)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_k bigint;
begin
  select o.kompaniya_id into v_k from public.t2_obyekt o where o.id = p_obyekt_id;
  if v_k is null then return jsonb_build_object('ok', false, 'code', 'OBYEKT_NOT_FOUND'); end if;
  perform public.t2_actor_kompaniya_azo_tekshir(v_k, p_actor_id);
  perform public.t2_require_permission_v2(v_k, p_actor_id, 'smeta.read');
  return coalesce(public._t2_kesh_natija_oqi_v1(p_obyekt_id, 'muhr_farq'), public._t2_qator_muhr_farq_hisob_v1(p_obyekt_id));
end $function$;

revoke all on function public.t2_akt_reestr_obyekt_v1(bigint, bigint, text), public.t2_akt_reestr_kompaniya_v1(bigint, bigint, text), public.t2_qator_muhr_farq_obyekt_v1(bigint, bigint) from public, anon, authenticated;
grant execute on function public.t2_akt_reestr_obyekt_v1(bigint, bigint, text), public.t2_akt_reestr_kompaniya_v1(bigint, bigint, text), public.t2_qator_muhr_farq_obyekt_v1(bigint, bigint) to service_role;

-- Iflos belgilovchi triggerlar (mavjud _t2_kesh_belgila_v1; statement-darajali, o'tkazma jadvallari).
create or replace function public._t2_kesh_t2_qator_muhr_ins() returns trigger language plpgsql security definer set search_path to 'public','pg_temp' as $f$
begin perform public._t2_kesh_belgila_v1(array(select s.x from (select t.obyekt_id from yangi t) s(x) where s.x is not null), 't2_qator_muhr'); return null; end $f$;
create or replace function public._t2_kesh_t2_qator_muhr_del() returns trigger language plpgsql security definer set search_path to 'public','pg_temp' as $f$
begin perform public._t2_kesh_belgila_v1(array(select s.x from (select t.obyekt_id from eski t) s(x) where s.x is not null), 't2_qator_muhr'); return null; end $f$;
create or replace function public._t2_kesh_t2_qator_muhr_upd() returns trigger language plpgsql security definer set search_path to 'public','pg_temp' as $f$
begin perform public._t2_kesh_belgila_v1(array(select s.x from (select t.obyekt_id from yangi t union select t.obyekt_id from eski t) s(x) where s.x is not null), 't2_qator_muhr'); return null; end $f$;
-- Jurnal (t2_ozgarish) faqat jadval='t2_qator' yozuvlari muhr ko'rinishiga kiradi; obyekt_id bo'sh bo'lsa qator orqali topiladi.
create or replace function public._t2_kesh_t2_ozgarish_ins() returns trigger language plpgsql security definer set search_path to 'public','pg_temp' as $f$
begin perform public._t2_kesh_belgila_v1(array(select s.x from (select coalesce(t.obyekt_id, q.obyekt_id) from yangi t left join public.t2_qator q on q.id = t.qator_id where t.jadval = 't2_qator') s(x) where s.x is not null), 't2_ozgarish'); return null; end $f$;
create or replace function public._t2_kesh_t2_ozgarish_del() returns trigger language plpgsql security definer set search_path to 'public','pg_temp' as $f$
begin perform public._t2_kesh_belgila_v1(array(select s.x from (select coalesce(t.obyekt_id, q.obyekt_id) from eski t left join public.t2_qator q on q.id = t.qator_id where t.jadval = 't2_qator') s(x) where s.x is not null), 't2_ozgarish'); return null; end $f$;
create or replace function public._t2_kesh_t2_ozgarish_upd() returns trigger language plpgsql security definer set search_path to 'public','pg_temp' as $f$
begin perform public._t2_kesh_belgila_v1(array(
  select s.x from (select coalesce(t.obyekt_id, q.obyekt_id) from yangi t left join public.t2_qator q on q.id = t.qator_id where t.jadval = 't2_qator'
                   union select coalesce(t.obyekt_id, q.obyekt_id) from eski t left join public.t2_qator q on q.id = t.qator_id where t.jadval = 't2_qator') s(x) where s.x is not null), 't2_ozgarish'); return null; end $f$;
-- Obyekt nomi akt reestrida (obyekt ustuni) ko'rinadi.
create or replace function public._t2_kesh_t2_obyekt_nom() returns trigger language plpgsql security definer set search_path to 'public','pg_temp' as $f$
begin perform public._t2_kesh_belgila_v1(array[new.id], 't2_obyekt'); return null; end $f$;
revoke all on function public._t2_kesh_t2_qator_muhr_ins(), public._t2_kesh_t2_qator_muhr_del(), public._t2_kesh_t2_qator_muhr_upd(),
  public._t2_kesh_t2_ozgarish_ins(), public._t2_kesh_t2_ozgarish_del(), public._t2_kesh_t2_ozgarish_upd(), public._t2_kesh_t2_obyekt_nom() from public, anon, authenticated;

drop trigger if exists t2_kesh_t2_qator_muhr_ins on public.t2_qator_muhr;
create trigger t2_kesh_t2_qator_muhr_ins after insert on public.t2_qator_muhr referencing new table as yangi for each statement execute function public._t2_kesh_t2_qator_muhr_ins();
drop trigger if exists t2_kesh_t2_qator_muhr_del on public.t2_qator_muhr;
create trigger t2_kesh_t2_qator_muhr_del after delete on public.t2_qator_muhr referencing old table as eski for each statement execute function public._t2_kesh_t2_qator_muhr_del();
drop trigger if exists t2_kesh_t2_qator_muhr_upd on public.t2_qator_muhr;
create trigger t2_kesh_t2_qator_muhr_upd after update on public.t2_qator_muhr referencing old table as eski new table as yangi for each statement execute function public._t2_kesh_t2_qator_muhr_upd();
drop trigger if exists t2_kesh_t2_ozgarish_ins on public.t2_ozgarish;
create trigger t2_kesh_t2_ozgarish_ins after insert on public.t2_ozgarish referencing new table as yangi for each statement execute function public._t2_kesh_t2_ozgarish_ins();
drop trigger if exists t2_kesh_t2_ozgarish_del on public.t2_ozgarish;
create trigger t2_kesh_t2_ozgarish_del after delete on public.t2_ozgarish referencing old table as eski for each statement execute function public._t2_kesh_t2_ozgarish_del();
drop trigger if exists t2_kesh_t2_ozgarish_upd on public.t2_ozgarish;
create trigger t2_kesh_t2_ozgarish_upd after update on public.t2_ozgarish referencing old table as eski new table as yangi for each statement execute function public._t2_kesh_t2_ozgarish_upd();
drop trigger if exists t2_kesh_t2_obyekt_nom on public.t2_obyekt;
create trigger t2_kesh_t2_obyekt_nom after update of nom on public.t2_obyekt for each row when (old.nom is distinct from new.nom) execute function public._t2_kesh_t2_obyekt_nom();

comment on function public._t2_kesh_natija_oqi_v1(bigint, text) is 'versiya: texnik. Toza (iflos emas, 3 kundan eski emas, xatosiz) kesh natijasi yoki NULL.';
comment on function public._t2_akt_reestr_hisob_v1(bigint) is 'versiya: texnik. t2_akt_reestr view ining obyekt bo''yicha jonli jsonb nusxasi (ichki).';
comment on function public._t2_qator_muhr_farq_hisob_v1(bigint) is 'versiya: texnik. t2_qator_muhr_farq view ining obyekt bo''yicha jonli jsonb nusxasi (ichki).';
comment on function public.t2_akt_reestr_obyekt_v1(bigint, bigint, text) is 'versiya: tarix. Obyekt akt reestri: toza keshdan yoki jonli (view o''zgarmagan). p_tur: f2|fakt|NULL.';
comment on function public.t2_akt_reestr_kompaniya_v1(bigint, bigint, text) is 'versiya: tarix. Kompaniya akt reestri: har obyekt toza keshdan yoki jonli. p_tur: f2|fakt|NULL.';
comment on function public.t2_qator_muhr_farq_obyekt_v1(bigint, bigint) is 'versiya: tarix. Obyekt muhr farqi: toza keshdan yoki jonli (view o''zgarmagan).';

-- versiya qo'riqchisi (AGENTS.md 2c): iflos triggerlari faqat obyekt_id topish uchun t2_qator ga qaraydi, qator versiyasi ahamiyatsiz.
comment on function public._t2_kesh_t2_ozgarish_ins() is 'Natija keshi iflos belgisi (t2_ozgarish). versiya: texnik';
comment on function public._t2_kesh_t2_ozgarish_del() is 'Natija keshi iflos belgisi (t2_ozgarish). versiya: texnik';
comment on function public._t2_kesh_t2_ozgarish_upd() is 'Natija keshi iflos belgisi (t2_ozgarish). versiya: texnik';
comment on function public._t2_kesh_t2_qator_muhr_upd() is 'Natija keshi iflos belgisi (t2_qator_muhr). versiya: texnik';
comment on function public._t2_kesh_t2_obyekt_nom() is 'Natija keshi iflos belgisi (t2_obyekt.nom). versiya: texnik';
