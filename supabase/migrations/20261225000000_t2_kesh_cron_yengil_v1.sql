-- IO YENGIL (db-yengil, 2026-11-15). Sabab: 20261222300000/400000 dan keyin har daqiqalik cron (job 20) 40 gacha iflos obyektning OG'IR natijalarini
-- (muhr_farq 13-18 s, qatlam ~8 s, price_control ~4 s) qayta hisoblab diskka yozdi -> Supabase free disk IO budjeti tugadi.
-- Yechim (yangi pul mantig'i YO'Q, hisob funksiyalari o'zgarmaydi):
--  1) YENGIL yangilash (jami/ustama uchun kesh: smeta/fakt/f2/f2_oy + jami_kesh): har 2 daqiqada, <=5 obyekt, vaqt budjeti obyektlar ORASIDA tekshiriladi,
--     "tinch" shart (iflos belgi >=20 s eski: faol tahrir paytida qayta hisoblanmaydi), umumiy advisory lock (yengil va og'ir hech qachon bir vaqtda emas).
--  2) OG'IR kalitlar (smeta_ozgarish_qatlam, price_control, akt_reestr, muhr_farq) daqiqalikda YANGILANMAYDI. Obyekt iflos bo'lib yengil yangilanganda uning
--     og'ir kesh qatorlari O'CHIRILADI -> ochiq funksiyalar (mavjud fallback) jonli hisoblaydi (natija har doim to'g'ri). Kesh qatori yo'q = iflos.
--  3) TUNGI og'ir yangilash (Toshkent 02:00-05:00 = UTC 21:00-00:00): keshi yo'q/2 kundan eski/xato obyektlar, budjet 25 s (+ bitta og'ir obyekt <= ~30 s < 60 s timeout).
--  4) Hamma joblarda statement_timeout <= 60 s. Eski job 20 (o'chirilgan) va job 21 (tungi 'hammasi', 900 s) olib tashlanadi.
-- Eski t2_obyekt_kesh_yangila_v1 / _t2_kesh_hisobla_v1 O'ZGARMAYDI (qo'lda chaqirish va rollback uchun qoladi), faqat cron endi ularni chaqirmaydi.
-- Qo'llashdan oldin: egasi ruxsati (cron o'zgarishi). Qo'llangach yangi joblar FAOL.

-- Yengil hisob: _t2_kesh_hisobla_v1 dan faqat oxirgi qator (natija keshi) olib tashlangan nusxa.
create or replace function public._t2_kesh_yengil_hisobla_v1(p_obyekt_id bigint)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_komp bigint; v_t0 timestamptz := clock_timestamp(); v_oy jsonb := '{}'::jsonb; m date;
  v_bugun date := (now() at time zone 'Asia/Tashkent')::date;
begin
  select o.kompaniya_id into v_komp from public.t2_obyekt o where o.id = p_obyekt_id;
  if v_komp is null then
    delete from public.t2_obyekt_kesh where obyekt_id = p_obyekt_id;
    delete from public.t2_obyekt_jami_kesh where obyekt_id = p_obyekt_id;
    return;
  end if;
  foreach m in array array[date_trunc('month', v_bugun)::date, (date_trunc('month', v_bugun) - interval '1 month')::date] loop
    v_oy := v_oy || jsonb_build_object(to_char(m, 'YYYY-MM'), public._t2_kesh_oy_paket_v1(p_obyekt_id, m));
  end loop;
  insert into public.t2_obyekt_kesh as k (obyekt_id, kompaniya_id, smeta, smeta_joriy, fakt, f2, f2_qoralama, f2_oy, hisoblandi, hisob_ms)
  values (p_obyekt_id, v_komp,
          (select p.paket from public._t2_summa_paket_v1(array[p_obyekt_id], 'smeta') p),
          public._t2_kesh_joriy_v1(p_obyekt_id),
          (select p.paket from public._t2_summa_paket_v1(array[p_obyekt_id], 'fakt') p),
          (select p.paket from public._t2_summa_paket_v1(array[p_obyekt_id], 'f2') p),
          (select p.paket from public._t2_summa_paket_v1(array[p_obyekt_id], 'f2_qoralama') p),
          v_oy, now(), (extract(epoch from clock_timestamp() - v_t0) * 1000)::int)
  on conflict (obyekt_id) do update
    set kompaniya_id = excluded.kompaniya_id, smeta = excluded.smeta, smeta_joriy = excluded.smeta_joriy, fakt = excluded.fakt, f2 = excluded.f2,
        f2_qoralama = excluded.f2_qoralama, f2_oy = excluded.f2_oy, hisoblandi = excluded.hisoblandi, hisob_ms = excluded.hisob_ms;
  perform public._t2_obyekt_jami_kesh_hisobla_v1(p_obyekt_id);
end $function$;

create or replace function public.t2_kesh_yengil_yangila_v1(p_max integer default 5, p_byudjet_s integer default 20, p_tinch_s integer default 20)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  r record; v_t0 timestamptz := clock_timestamp(); v_soni int := 0; v_xato int := 0;
  v_kalit text := to_char((now() at time zone 'Asia/Tashkent')::date, 'YYYY-MM');
begin
  -- Umumiy lock: yengil va og'ir bir vaqtda ishlamaydi (tranzaksiya oxirida o'zi bo'shaydi, xato bo'lsa ham).
  if not pg_try_advisory_xact_lock(hashtext('t2_kesh_yangila_umumiy')) then
    return jsonb_build_object('ok', true, 'o_tkazildi', 'band');
  end if;
  for r in
    select o.id as obyekt_id, i.versiya
      from public.t2_obyekt o
      left join public.t2_obyekt_kesh_iflos i on i.obyekt_id = o.id
      left join public.t2_obyekt_kesh k on k.obyekt_id = o.id
     where (i.obyekt_id is not null and i.vaqt <= clock_timestamp() - make_interval(secs => greatest(coalesce(p_tinch_s, 0), 0)))
        or k.obyekt_id is null
        or (k.smeta is not null and k.smeta_joriy is null)
        or jsonb_typeof(k.f2_oy->v_kalit) is distinct from 'object'
     order by i.vaqt nulls last, o.id
     limit greatest(coalesce(p_max, 5), 1)
  loop
    -- Vaqt budjeti obyektlar ORASIDA (bitta obyekt o'rtacha ~1 s, eng katta ~14 s).
    exit when extract(epoch from clock_timestamp() - v_t0) >= p_byudjet_s;
    begin
      perform public._t2_kesh_yengil_hisobla_v1(r.obyekt_id);
      if r.versiya is not null then
        -- Og'ir kesh eskirdi: qatorlari o'chiriladi, ochiq funksiyalar jonli hisoblaydi, tunda qayta to'ldiriladi.
        delete from public.t2_obyekt_natija_kesh where obyekt_id = r.obyekt_id;
        delete from public.t2_obyekt_kesh_iflos where obyekt_id = r.obyekt_id and versiya = r.versiya;
      end if;
      v_soni := v_soni + 1;
    exception when others then
      v_xato := v_xato + 1;
      -- Xatoli obyekt navbat boshida qotib qolmasin: vaqtini yangilab oxiriga suramiz.
      update public.t2_obyekt_kesh_iflos set vaqt = clock_timestamp() where obyekt_id = r.obyekt_id;
    end;
  end loop;
  return jsonb_build_object('ok', true, 'hisoblandi', v_soni, 'xato', v_xato);
end $function$;

create or replace function public.t2_kesh_ogir_yangila_v1(p_byudjet_s integer default 25, p_max_yosh_kun integer default 2)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  r record; v_t0 timestamptz := clock_timestamp(); v_soni int := 0; v_qoldi int := 0; v_xato int := 0;
begin
  if not pg_try_advisory_xact_lock(hashtext('t2_kesh_yangila_umumiy')) then
    return jsonb_build_object('ok', true, 'o_tkazildi', 'band');
  end if;
  for r in
    select o.id as obyekt_id
      from public.t2_obyekt o
      join public.t2_obyekt_kesh k on k.obyekt_id = o.id   -- yengil kesh bor obyektlar (yo'qlarini avval yengil yangilaydi)
     where not exists (select 1 from public.t2_obyekt_kesh_iflos i where i.obyekt_id = o.id)   -- iflosni avval yengil yangilaydi (qatlam kesh smeta_joriy ga tayanadi)
       and (select count(*) from public.t2_obyekt_natija_kesh nk
             where nk.obyekt_id = o.id and nk.kalit in ('smeta_ozgarish_qatlam', 'price_control', 'akt_reestr', 'muhr_farq')
               and nk.hisoblandi > now() - make_interval(days => p_max_yosh_kun) and not (nk.natija ? '_xato')) < 4
     order by o.id
  loop
    if extract(epoch from clock_timestamp() - v_t0) >= p_byudjet_s then v_qoldi := v_qoldi + 1; continue; end if;
    begin
      perform public._t2_obyekt_natija_kesh_hisobla_v1(r.obyekt_id);
      v_soni := v_soni + 1;
    exception when others then v_xato := v_xato + 1;
    end;
  end loop;
  return jsonb_build_object('ok', true, 'hisoblandi', v_soni, 'qoldi', v_qoldi, 'xato', v_xato);
end $function$;

revoke all on function public._t2_kesh_yengil_hisobla_v1(bigint), public.t2_kesh_yengil_yangila_v1(integer, integer, integer),
  public.t2_kesh_ogir_yangila_v1(integer, integer) from public, anon, authenticated;
comment on function public.t2_kesh_yengil_yangila_v1(integer, integer, integer) is 'versiya: texnik. Cron: har 2 daq, <=5 iflos obyektning yengil keshi (jami/ustama), og''ir natija qatorlarini o''chiradi (jonli fallback).';
comment on function public.t2_kesh_ogir_yangila_v1(integer, integer) is 'versiya: texnik. Tungi cron: og''ir natija kalitlari (qatlam, price_control, akt_reestr, muhr_farq) budjet bilan.';

-- Cron: eski joblar o'rniga. Nomlar bo'yicha (jobid emas) — idempotent.
do $cron$
declare n text;
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    foreach n in array array['t2_obyekt_kesh_yangila', 't2_obyekt_kesh_tungi', 't2_kesh_yengil', 't2_kesh_ogir_tungi'] loop
      if exists (select 1 from cron.job where jobname = n) then perform cron.unschedule(n); end if;
    end loop;
    perform cron.schedule('t2_kesh_yengil', '*/2 * * * *',
      $c$set statement_timeout = '60s'; select public.t2_kesh_yengil_yangila_v1(5, 20, 20)$c$);
    -- UTC 21:00-00:00 = Toshkent 02:00-05:00. Har 10 daq (~18 ishga tushish; iflos bo'lmasa bir zumda tugaydi).
    perform cron.schedule('t2_kesh_ogir_tungi', '*/10 21-23 * * *',
      $c$set statement_timeout = '60s'; select public.t2_kesh_ogir_yangila_v1(25, 2)$c$);
    -- Ustama (job 37): daqiqalikdan 2 daqiqaga, timeout 150 s -> 60 s, budjet 40 -> 20 s. Funksiya o'zgarmaydi.
    if exists (select 1 from cron.job where jobname = 't2_obyekt_ustama_yangila') then
      perform cron.alter_job((select jobid from cron.job where jobname = 't2_obyekt_ustama_yangila'),
        schedule := '1-59/2 * * * *',
        command := $c$set statement_timeout = '60s'; select public.t2_obyekt_ustama_yangila_v1(20)$c$);
    end if;
  end if;
end $cron$;

