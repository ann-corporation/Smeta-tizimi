-- TUNGI OG'IR KESH: BOSQICHLI (db-yengil, 2026-11-17). Qo'llashdan oldin egasi ruxsati kerak (cron o'zgaradi). Migratsiya ichida BEGIN/COMMIT yo'q.
-- SABAB (cron.job_run_details, job 42, 15.11 tun): 18 urinishdan 15 tasi "statement timeout" (60 s), 3 tasi bo'sh o'tdi.
--   t2_kesh_ogir_yangila_v1 bitta chaqiruvda (bitta tranzaksiya) obyekt x 4 kalitni ketma-ket hisoblardi; vaqt budjeti (25 s) faqat obyektlar ORASIDA
--   tekshirilardi. Katta obyektning bitta kaliti (muhr_farq / qatlam / price_control) o'zi 30-60 s+ bo'lsa, butun chaqiruv 60 s da bekor bo'lardi va
--   shu chaqiruvdagi BARCHA yozuvlar (avvalgi obyektlar ham) ROLLBACK bo'lardi. Navbat "order by o.id" bo'lgani uchun har 10 daqiqada aynan shu
--   obyektlar qayta urinilar, kesh faqat 2/38 obyektda to'lardi.
-- YECHIM (hisob funksiyalari va pul mantig'i O'ZGARMAYDI): ish BOSQICH = (obyekt, kalit) birligiga bo'linadi va 2 bosqichli cron bilan yuritiladi:
--   1) TANLA (t2_kesh_qadam_tanla_v1, <1 s): eng dolzarb bitta bosqichni tanlab t2_kesh_qadam jadvalida 'ishlamoqda' deb BELGILAYDI (alohida
--      tranzaksiya, commit bo'ladi). Tanlov: toza (iflos emas), keshi yo'q / eskirgan (>2 kun) / xato belgili bosqichlar; avval akt_reestr (F2 reestr),
--      keyin price_control, muhr_farq, qatlam; ichida eng eski/yo'q, keyin id. O'zgarmagan obyektlar (kesh yangi, iflos belgisi yo'q) QAYTA hisoblanmaydi.
--   2) BAJAR (t2_kesh_qadam_bajar_v1): tanlangan BITTA bosqichni hisoblaydi (1 daqiqadan keyin). Timeout bo'lsa faqat shu bosqich bekor bo'ladi,
--      lekin 1-bosqichdagi belgi saqlanib qoladi -> keyingi TANLA eskirgan belgini "xato" deb urinish sonini oshiradi va navbatdagisiga o'tadi
--      (bir obyekt butun navbatni to'sib qo'ymaydi, bitta kalit alohida ajraladi).
--   3) Og'ir bosqich: 2 ta oddiy urinish (60 s) muvaffaqiyatsiz bo'lsa 'katta' darajaga o'tadi: tunda kuniga ~8 ta slot, statement_timeout 170 s.
--      4 ta urinishdan keyin 20 soat dam oladi (t2_kesh_holat_v1 da 'ogir' ko'rinadi) - qayta-qayta IO yemaydi. Ochiq funksiyalar shu paytda JONLI hisoblaydi.
--   4) Idempotent: hisoblangan bosqich keshi yangi ekan, boshqa hech narsa qilinmaydi. Umumiy advisory lock yengil kesh joblari bilan bir xil.
--   5) IO: har chaqiruvda bitta bosqich; bo'sh navbat = bitta engil select. Oyna: UTC 20:00-00:59 (Toshkent 01:00-05:59), har 2 daqiqada 1 bosqich.
-- Eslatma: plpgsql ichidagi SET LOCAL statement_timeout joriy (yuqori darajadagi) so'rov taymerini qayta o'rnatmaydi, shuning uchun
--   statement_timeout cron buyrug'ida beriladi (tanla 20 s, bajar 60 s, katta 170 s); funksiya ichida lock_timeout='3s' o'rnatiladi.
-- ROLLBACK: 20261231000000_kesh_ogir_bosqichli.rollback.sql (joblar o'chiriladi, eski 't2_kesh_ogir_tungi' job tiklanadi, funksiyalar/jadval drop).

create table if not exists public.t2_kesh_qadam (
  obyekt_id bigint not null references public.t2_obyekt (id) on delete cascade,
  kalit text not null,
  holat text not null default 'kutmoqda' check (holat in ('kutmoqda', 'ishlamoqda', 'tayyor', 'xato')),
  urinish integer not null default 0,
  oxirgi_urinish timestamptz,
  tanlandi timestamptz,
  muddat_s integer not null default 60,
  daraja text not null default 'oddiy' check (daraja in ('oddiy', 'katta')),
  tugadi timestamptz,
  ms integer,
  primary key (obyekt_id, kalit)
);
alter table public.t2_kesh_qadam enable row level security;
revoke all on table public.t2_kesh_qadam from public, anon, authenticated;
comment on table public.t2_kesh_qadam is 'versiya: texnik. Tungi og''ir kesh bosqichlari (obyekt x kalit) holati; faqat cron funksiyalari yozadi.';

-- 1) TANLA: bitta bosqichni belgilaydi (tez, kichik tranzaksiya, commit bo'ladi).
create or replace function public.t2_kesh_qadam_tanla_v1(p_daraja text default 'oddiy', p_yosh_kun integer default 2)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_obyekt bigint; v_kalit text; v_eff integer;
  v_muddat integer := case when p_daraja = 'katta' then 170 else 55 end;
begin
  perform set_config('lock_timeout', '3s', true);
  if not pg_try_advisory_xact_lock(hashtext('t2_kesh_qadam_tanla')) then
    return jsonb_build_object('ok', true, 'o_tkazildi', 'band');
  end if;
  -- Eskirgan belgi (bajar timeout bilan o'ldi): xato deb olinadi, urinish soni tanla vaqtida allaqachon oshirilgan.
  update public.t2_kesh_qadam
     set holat = 'xato'
   where holat = 'ishlamoqda' and tanlandi + make_interval(secs => muddat_s + 30) < now();
  if exists (select 1 from public.t2_kesh_qadam where holat = 'ishlamoqda') then
    return jsonb_build_object('ok', true, 'o_tkazildi', 'band_qadam');
  end if;
  select c.obyekt_id, c.kalit, c.eff into v_obyekt, v_kalit, v_eff
    from (
      select o.id as obyekt_id, kk.kalit, kk.rank_n,
             case when s.oxirgi_urinish is null or s.oxirgi_urinish < now() - interval '20 hours' then 0 else s.urinish end as eff,
             nk.hisoblandi
        from public.t2_obyekt o
        join public.t2_obyekt_kesh yk on yk.obyekt_id = o.id   -- yengil kesh bor obyektlar (yo'qlarini yengil job to'ldiradi)
       cross join (values ('akt_reestr', 1), ('price_control', 2), ('muhr_farq', 3), ('smeta_ozgarish_qatlam', 4)) kk(kalit, rank_n)
        left join public.t2_obyekt_natija_kesh nk on nk.obyekt_id = o.id and nk.kalit = kk.kalit
        left join public.t2_kesh_qadam s on s.obyekt_id = o.id and s.kalit = kk.kalit
       where not exists (select 1 from public.t2_obyekt_kesh_iflos i where i.obyekt_id = o.id)   -- iflosni yengil job avval yangilaydi
         and not (kk.kalit = 'smeta_ozgarish_qatlam' and yk.smeta is not null and yk.smeta_joriy is null)   -- qatlam smeta_joriy ga tayanadi
         and (nk.obyekt_id is null or nk.hisoblandi <= now() - make_interval(days => greatest(coalesce(p_yosh_kun, 2), 1)) or nk.natija ? '_xato')
    ) c
   where (p_daraja = 'katta' and c.eff between 2 and 3) or (p_daraja <> 'katta' and c.eff < 2)
   order by c.eff, c.rank_n, c.hisoblandi nulls first, c.obyekt_id
   limit 1;
  if v_obyekt is null then
    return jsonb_build_object('ok', true, 'navbat', 'bo_sh', 'daraja', p_daraja);
  end if;
  insert into public.t2_kesh_qadam as s (obyekt_id, kalit, holat, urinish, oxirgi_urinish, tanlandi, muddat_s, daraja, tugadi)
  values (v_obyekt, v_kalit, 'ishlamoqda', v_eff + 1, now(), now(), v_muddat, case when p_daraja = 'katta' then 'katta' else 'oddiy' end, null)
  on conflict (obyekt_id, kalit) do update
    set holat = 'ishlamoqda', urinish = excluded.urinish, oxirgi_urinish = excluded.oxirgi_urinish, tanlandi = excluded.tanlandi,
        muddat_s = excluded.muddat_s, daraja = excluded.daraja, tugadi = null;
  return jsonb_build_object('ok', true, 'tanlandi', jsonb_build_object('obyekt_id', v_obyekt, 'kalit', v_kalit, 'urinish', v_eff + 1), 'daraja', p_daraja);
end $function$;

-- 2) BAJAR: tanlangan bitta bosqichni hisoblaydi (eski _t2_obyekt_natija_kesh_hisobla_v1 dagi aynan shu chaqiruvlar, bittadan).
create or replace function public.t2_kesh_qadam_bajar_v1(p_daraja text default 'oddiy')
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_obyekt bigint; v_kalit text; v_t0 timestamptz := clock_timestamp(); v_r jsonb; v_sm jsonb; v_sj jsonb; v_xato boolean := false;
begin
  perform set_config('lock_timeout', '3s', true);
  -- Yengil kesh joblari bilan umumiy lock (bir vaqtda ishlamaydi). Band bo'lsa belgi tegilmaydi (o'zi eskirsa tanla xato deb oladi).
  if not pg_try_advisory_xact_lock(hashtext('t2_kesh_yangila_umumiy')) then
    return jsonb_build_object('ok', true, 'o_tkazildi', 'band');
  end if;
  select s.obyekt_id, s.kalit into v_obyekt, v_kalit
    from public.t2_kesh_qadam s
   where s.holat = 'ishlamoqda' and s.daraja = case when p_daraja = 'katta' then 'katta' else 'oddiy' end
   order by s.tanlandi desc limit 1;
  if v_obyekt is null then
    return jsonb_build_object('ok', true, 'o_tkazildi', 'tanlanmagan');
  end if;
  if not exists (select 1 from public.t2_obyekt o where o.id = v_obyekt) then
    delete from public.t2_kesh_qadam where obyekt_id = v_obyekt;
    return jsonb_build_object('ok', true, 'o_tkazildi', 'obyekt_yoq');
  end if;
  begin
    if v_kalit = 'smeta_ozgarish_qatlam' then
      select k.smeta, k.smeta_joriy into v_sm, v_sj from public.t2_obyekt_kesh k where k.obyekt_id = v_obyekt;
      v_r := public._t2_smeta_ozgarish_qatlam_hisob_v1(v_obyekt, v_sm, v_sj);
    elsif v_kalit = 'price_control' then
      v_r := public._t2_price_control_hisob_v1(v_obyekt);
    elsif v_kalit = 'akt_reestr' then
      v_r := public._t2_akt_reestr_hisob_v1(v_obyekt);
    elsif v_kalit = 'muhr_farq' then
      v_r := public._t2_qator_muhr_farq_hisob_v1(v_obyekt);
    else
      v_r := jsonb_build_object('_xato', true);
    end if;
  exception when others then
    v_xato := true;
    v_r := jsonb_build_object('_xato', true);
  end;
  insert into public.t2_obyekt_natija_kesh as n (obyekt_id, kalit, natija, hisoblandi)
  values (v_obyekt, v_kalit, coalesce(v_r, jsonb_build_object('_xato', true)), now())
  on conflict (obyekt_id, kalit) do update set natija = excluded.natija, hisoblandi = excluded.hisoblandi;
  update public.t2_kesh_qadam
     set holat = case when v_xato or v_r is null then 'xato' else 'tayyor' end,
         urinish = case when v_xato or v_r is null then urinish else 0 end,
         tugadi = now(), ms = (extract(epoch from clock_timestamp() - v_t0) * 1000)::int
   where obyekt_id = v_obyekt and kalit = v_kalit;
  return jsonb_build_object('ok', true, 'obyekt_id', v_obyekt, 'kalit', v_kalit, 'xato', v_xato,
                            'ms', (extract(epoch from clock_timestamp() - v_t0) * 1000)::int);
end $function$;

-- Holat: egasi/agent uchun qisqa ko'rinish (kichik jadvallar, arzon).
create or replace function public.t2_kesh_holat_v1(p_yosh_kun integer default 3)
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $f$
  select jsonb_build_object(
    'obyektlar', (select count(*) from public.t2_obyekt),
    'toza_kalitlar', (select coalesce(jsonb_object_agg(x.kalit, x.n), '{}'::jsonb) from (
        select nk.kalit, count(*) n from public.t2_obyekt_natija_kesh nk
         where nk.hisoblandi > now() - make_interval(days => p_yosh_kun) and not (nk.natija ? '_xato') group by nk.kalit) x),
    'ogir_qadamlar', (select coalesce(jsonb_agg(jsonb_build_object('obyekt_id', s.obyekt_id, 'kalit', s.kalit, 'urinish', s.urinish, 'ms', s.ms)), '[]'::jsonb)
        from public.t2_kesh_qadam s where s.urinish >= 2 and s.holat <> 'tayyor'),
    'ishlamoqda', (select count(*) from public.t2_kesh_qadam where holat = 'ishlamoqda'));
$f$;

revoke all on function public.t2_kesh_qadam_tanla_v1(text, integer), public.t2_kesh_qadam_bajar_v1(text), public.t2_kesh_holat_v1(integer)
  from public, anon, authenticated;
comment on function public.t2_kesh_qadam_tanla_v1(text, integer) is 'versiya: texnik. Tungi cron 1-bosqich: bitta (obyekt, kalit) bosqichni belgilaydi (eng dolzarb, o''zgarmaganlarni o''tkazadi).';
comment on function public.t2_kesh_qadam_bajar_v1(text) is 'versiya: texnik. Tungi cron 2-bosqich: belgilangan bitta bosqichni hisoblab natija keshiga yozadi.';
comment on function public.t2_kesh_holat_v1(integer) is 'versiya: texnik. Og''ir kesh to''lish holati (kalit bo''yicha toza soni, og''ir bosqichlar).';

-- Cron (nomlar bo'yicha, idempotent). UTC 20:00-00:59 = Toshkent 01:00-05:59.
do $cron$
declare n text;
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    foreach n in array array['t2_kesh_ogir_tungi', 't2_kesh_ogir_tanla', 't2_kesh_ogir_bajar', 't2_kesh_ogir_katta_tanla', 't2_kesh_ogir_katta_bajar'] loop
      if exists (select 1 from cron.job where jobname = n) then perform cron.unschedule(n); end if;
    end loop;
    perform cron.schedule('t2_kesh_ogir_tanla', '*/2 20-23,0 * * *',
      $c$set statement_timeout = '20s'; select public.t2_kesh_qadam_tanla_v1('oddiy', 2)$c$);
    perform cron.schedule('t2_kesh_ogir_bajar', '1-59/2 20-23,0 * * *',
      $c$set statement_timeout = '60s'; select public.t2_kesh_qadam_bajar_v1('oddiy')$c$);
    -- Og'ir (2 marta timeout bergan) bosqichlar: kuniga 8 slot, 170 s.
    perform cron.schedule('t2_kesh_ogir_katta_tanla', '21,23,51,53 22,23 * * *',
      $c$set statement_timeout = '20s'; select public.t2_kesh_qadam_tanla_v1('katta', 2)$c$);
    perform cron.schedule('t2_kesh_ogir_katta_bajar', '22,24,52,54 22,23 * * *',
      $c$set statement_timeout = '170s'; select public.t2_kesh_qadam_bajar_v1('katta')$c$);
  end if;
end $cron$;
