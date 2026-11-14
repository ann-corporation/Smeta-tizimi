-- Acceptance t2_direktor_pult_kesh_v1: haqiqiy ma'lumot, BEGIN..ROLLBACK (yozuv qolmaydi). Forward fayldan KEYIN, XUDDI SHU tranzaksiyada ishlashi mumkin.
-- Cron kutilmaydi: tanlama (eng katta kompaniyaning 1 ta eng katta + 4 ta tasodifiy obyekti) kesh funksiyasi bilan TO'G'RIDAN-TO'G'RI hisoblanadi,
-- so'ng kesh == jonli hisob solishtiriladi. Kutiladi: hamma tekshiruv `bad = 0`. Umumiy vaqt < 3 daqiqa.
begin;
set local statement_timeout = '300s';

-- 0) Triggerlar: 9 jadval x 3 hodisa = 27.
select 'trigger_soni' as tekshiruv, case when count(*) = 27 then 0 else 1 end as bad
  from pg_trigger t where t.tgname like 't2\_kesh\_%' and not t.tgisinternal;

-- 1) Tanlama.
create temp table _ac_komp on commit drop as
select o.kompaniya_id as id from public.t2_obyekt o where o.holat <> 'bekor' group by o.kompaniya_id order by count(*) desc, o.kompaniya_id limit 1;
create temp table _ac_ob on commit drop as
select x.id from (
  select o.id,
         row_number() over (order by (select count(*) from public.t2_qator q where q.obyekt_id = o.id) desc, o.id) as rn,
         row_number() over (order by md5(o.id::text)) as rr
    from public.t2_obyekt o join _ac_komp k on k.id = o.kompaniya_id where o.holat <> 'bekor') x
 where x.rn <= 1 or x.rr <= 4;

-- 2) Kesh funksiyasi tanlamani hisoblaydi (cron o'rniga).
select public._t2_kesh_hisobla_v1(id) from _ac_ob;
select 'kesh_toldirildi' as tekshiruv, case when (select count(*) from public.t2_obyekt_kesh k join _ac_ob b on b.id = k.obyekt_id) = (select count(*) from _ac_ob) then 0 else 1 end as bad;

-- 3) PROYEKSIYA == JONLI HISOB (tanlamadagi har obyekt, 5 o'lchov).
create temp table _ac_jonli on commit drop as
select 'smeta'::text as o, p.obyekt_id, p.paket from public._t2_summa_paket_v1(array(select id from _ac_ob), 'smeta') p
union all
select 'fakt', p.obyekt_id, p.paket from public._t2_summa_paket_v1(array(select id from _ac_ob), 'fakt') p
union all
select 'f2', p.obyekt_id, p.paket from public._t2_summa_paket_v1(array(select id from _ac_ob), 'f2') p
union all
select 'f2_qoralama', p.obyekt_id, p.paket from public._t2_summa_paket_v1(array(select id from _ac_ob), 'f2_qoralama') p
union all
select 'oy', p.obyekt_id, p.paket
  from public._t2_summa_paket_v1(array(select id from _ac_ob), 'f2', null,
         date_trunc('month', (now() at time zone 'Asia/Tashkent')::date)::date,
         (date_trunc('month', (now() at time zone 'Asia/Tashkent')::date) + interval '1 month')::date - 1) p;

select 'farq_' || j.o as tekshiruv, count(*) as bad
  from _ac_jonli j join public.t2_obyekt_kesh t on t.obyekt_id = j.obyekt_id
 where j.paket is distinct from case j.o when 'smeta' then t.smeta when 'fakt' then t.fakt when 'f2' then t.f2 when 'f2_qoralama' then t.f2_qoralama
         else t.f2_oy->to_char((now() at time zone 'Asia/Tashkent')::date, 'YYYY-MM') end
 group by j.o
union all
select 'farq_jami', case when exists (select 1 from _ac_jonli) then 0 else 1 end;

-- Kesh o'qish funksiyasi (kesh keshdan, qolgani jonli) == jonli: tanlama bo'yicha.
-- Hisoblangan obyektlar iflos emas (iflos belgisi tozalanadi), shuning uchun haqiqatan keshdan o'qiladi.
delete from public.t2_obyekt_kesh_iflos where obyekt_id in (select id from _ac_ob);
select 'oqish_funksiyasi_farq' as tekshiruv, count(*) as bad
  from (select p.obyekt_id, p.paket from public._t2_summa_paket_kesh_v1(array(select id from _ac_ob), 'smeta') p) x
  full join (select j.obyekt_id, j.paket from _ac_jonli j where j.o = 'smeta') y on y.obyekt_id = x.obyekt_id
 where x.paket is distinct from y.paket;
select 'oqish_oy_farq' as tekshiruv, count(*) as bad
  from (select p.obyekt_id, p.paket from public._t2_summa_paket_kesh_v1(array(select id from _ac_ob), 'f2',
          date_trunc('month', (now() at time zone 'Asia/Tashkent')::date)::date,
          (date_trunc('month', (now() at time zone 'Asia/Tashkent')::date) + interval '1 month')::date - 1) p) x
  full join (select j.obyekt_id, j.paket from _ac_jonli j where j.o = 'oy') y on y.obyekt_id = x.obyekt_id
 where x.paket is distinct from y.paket;

-- 4) Iflos mexanizmi: bog yozuvi o'zgarsa obyekt iflos bo'ladi (statement trigger), o'qish jonlida qoladi.
create temp table _ac_bog on commit drop as
select b.obyekt_id from public.t2_shartnoma_bog b join _ac_ob t on t.id = b.obyekt_id order by b.obyekt_id limit 1;
update public.t2_shartnoma_bog set holat = holat where obyekt_id = (select obyekt_id from _ac_bog);
select 'iflos_belgilandi' as tekshiruv,
       case when not exists (select 1 from _ac_bog) then 0
            when exists (select 1 from public.t2_obyekt_kesh_iflos i where i.obyekt_id = (select obyekt_id from _ac_bog)) then 0 else 1 end as bad;
select 'iflos_jonli_oqiydi' as tekshiruv, count(*) as bad
  from (select p.paket from public._t2_summa_paket_kesh_v1(array(select obyekt_id from _ac_bog), 'smeta') p) x
  full join (select j.paket from _ac_jonli j where j.o = 'smeta' and j.obyekt_id in (select obyekt_id from _ac_bog)) y on true
 where x.paket is distinct from y.paket;

-- 5) Iflos versiyasi: ikki marta belgilansa versiya 2.
create temp table _ac_kichik on commit drop as
select o.id from public.t2_obyekt o order by (select count(*) from public.t2_qator q where q.obyekt_id = o.id), o.id limit 1;
delete from public.t2_obyekt_kesh_iflos where obyekt_id = (select id from _ac_kichik);
select public._t2_kesh_belgila_v1(array[(select id from _ac_kichik)], 'acceptance');
select public._t2_kesh_belgila_v1(array[(select id from _ac_kichik)], 'acceptance');
select 'versiya_oshadi' as tekshiruv, case when i.versiya = 2 then 0 else 1 end as bad
  from public.t2_obyekt_kesh_iflos i where i.obyekt_id = (select id from _ac_kichik);

-- 6) Direktor pulti: a'zo + financial.read bo'lgan birinchi aktor uchun ok va 6 blok bor.
do $t$
declare r record; v jsonb; v_ok boolean := false;
begin
  for r in select a.kompaniya_id, a.foydalanuvchi_id from public.t2_azolik a
            where a.holat = 'faol' order by a.kompaniya_id, a.id limit 30 loop
    begin
      v := public.t2_rahbar_pult_v1(r.kompaniya_id, r.foydalanuvchi_id);
      if (v->>'ok') = 'true' and v ? 'portfel' and v ? 'bajarildi_oy' and v ? 'hujjat' and v ? 'qarz' and v ? 'kechikkan' and v ? 'xavfli' then
        v_ok := true; exit;
      end if;
    exception when others then null;
    end;
  end loop;
  create temp table _ac_pult on commit drop as select case when v_ok then 0 else 1 end as bad;
end $t$;
select 'pult_ok' as tekshiruv, bad from _ac_pult;

rollback;
