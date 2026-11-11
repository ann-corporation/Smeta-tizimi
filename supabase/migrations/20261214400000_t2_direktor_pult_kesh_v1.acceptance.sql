-- Acceptance t2_direktor_pult_kesh_v1: haqiqiy ma'lumot, BEGIN..ROLLBACK (yozuv qolmaydi). Migratsiyadan KEYIN ishlaydi.
-- Kesh cron bilan to'lgach (migratsiyadan ~10 daqiqa keyin) ishga tushiring. Kutiladi: hamma tekshiruv `bad = 0`.
-- Asosiy talab: HAR toza obyekt uchun kesh == jonli hisob (smeta / fakt / f2 / f2_qoralama / joriy oy F2) — farq 0.
-- Vaqt: jonli hisob butun kompaniya uchun ~35 s (4 o'lchov) + oy ~11 s; umumiy < 3 daqiqa.
begin;
set local statement_timeout = '300s';

-- 0) Triggerlar: 8 jadval x 3 hodisa = 24.
select 'trigger_soni' as tekshiruv, case when count(*) = 24 then 0 else 1 end as bad
  from pg_trigger t where t.tgname like 't2\_kesh\_%' and not t.tgisinternal;

-- 1) Kesh to'lganmi (cron ishlagan).
select 'kesh_toldirilgan' as tekshiruv, case when count(*) > 0 then 0 else 1 end as bad from public.t2_obyekt_kesh;

-- 2) PROYEKSIYA == JONLI HISOB, har toza obyekt uchun.
create temp table _ac_toza on commit drop as
select k.* from public.t2_obyekt_kesh k
 where k.hisoblandi > now() - interval '3 days'
   and not exists (select 1 from public.t2_obyekt_kesh_iflos i where i.obyekt_id = k.obyekt_id);

create temp table _ac_jonli on commit drop as
select 'smeta'::text as o, p.obyekt_id, p.paket from public._t2_summa_paket_v1(array(select obyekt_id from _ac_toza), 'smeta') p
union all
select 'fakt', p.obyekt_id, p.paket from public._t2_summa_paket_v1(array(select obyekt_id from _ac_toza), 'fakt') p
union all
select 'f2', p.obyekt_id, p.paket from public._t2_summa_paket_v1(array(select obyekt_id from _ac_toza), 'f2') p
union all
select 'f2_qoralama', p.obyekt_id, p.paket from public._t2_summa_paket_v1(array(select obyekt_id from _ac_toza), 'f2_qoralama') p
union all
select 'oy', p.obyekt_id, p.paket
  from public._t2_summa_paket_v1(array(select obyekt_id from _ac_toza), 'f2', null,
         date_trunc('month', (now() at time zone 'Asia/Tashkent')::date)::date,
         (date_trunc('month', (now() at time zone 'Asia/Tashkent')::date) + interval '1 month')::date - 1) p;

select 'farq_' || j.o as tekshiruv, count(*) as bad
  from _ac_jonli j join _ac_toza t on t.obyekt_id = j.obyekt_id
 where j.paket is distinct from case j.o when 'smeta' then t.smeta when 'fakt' then t.fakt when 'f2' then t.f2 when 'f2_qoralama' then t.f2_qoralama
         else t.f2_oy->to_char((now() at time zone 'Asia/Tashkent')::date, 'YYYY-MM') end
 group by j.o
union all
select 'farq_jami', 0 where not exists (select 1 from _ac_jonli);

-- Obyektda jonli paket bor, keshda yo'q (yoki aksincha) — ham farq.
select 'paket_yoqolgan' as tekshiruv, count(*) as bad
  from _ac_toza t
 where (t.smeta is null) <> not exists (select 1 from _ac_jonli j where j.o = 'smeta' and j.obyekt_id = t.obyekt_id);

-- 3) O'qish funksiyasi == jonli (toza obyektlar keshdan, qolganlari jonli): to'liq natija to'plami teng.
select 'oqish_funksiyasi_farq' as tekshiruv, count(*) as bad
  from (select 'smeta' as o, p.obyekt_id, p.paket from public._t2_summa_paket_kesh_v1(array(select id from public.t2_obyekt), 'smeta') p) x
  full join (select p.obyekt_id, p.paket from public._t2_summa_paket_v1(array(select id from public.t2_obyekt), 'smeta') p) y on y.obyekt_id = x.obyekt_id
 where x.paket is distinct from y.paket;

-- 4) Iflos mexanizmi (rolled back tranzaksiya ichida): bog yozuvi o'zgarsa obyekt iflos bo'ladi, o'qish jonlida qoladi.
create temp table _ac_bog on commit drop as
select b.obyekt_id from public.t2_shartnoma_bog b join _ac_toza t on t.obyekt_id = b.obyekt_id order by b.obyekt_id limit 1;
update public.t2_shartnoma_bog set holat = holat where obyekt_id = (select obyekt_id from _ac_bog);
select 'iflos_belgilandi' as tekshiruv,
       case when not exists (select 1 from _ac_bog) then 0
            when exists (select 1 from public.t2_obyekt_kesh_iflos i where i.obyekt_id = (select obyekt_id from _ac_bog)) then 0 else 1 end as bad;
select 'iflos_jonli_oqiydi' as tekshiruv, count(*) as bad
  from (select p.paket from public._t2_summa_paket_kesh_v1(array(select obyekt_id from _ac_bog), 'fakt') p) x
  full join (select p.paket from public._t2_summa_paket_v1(array(select obyekt_id from _ac_bog), 'fakt') p) y on true
 where x.paket is distinct from y.paket;

-- 5) Eng kichik obyekt: hisoblash funksiyasi o'zi (kesh qatori yaratadi) jonlidan farq qilmaydi; iflos versiyasi poygasi.
create temp table _ac_kichik on commit drop as
select o.id from public.t2_obyekt o order by (select count(*) from public.t2_qator q where q.obyekt_id = o.id), o.id limit 1;
select public._t2_kesh_hisobla_v1(id) from _ac_kichik;
select 'hisobla_smeta_farq' as tekshiruv, count(*) as bad
  from public.t2_obyekt_kesh k join _ac_kichik c on c.id = k.obyekt_id
 where k.smeta is distinct from (select p.paket from public._t2_summa_paket_v1(array[c.id], 'smeta') p)
    or k.fakt  is distinct from (select p.paket from public._t2_summa_paket_v1(array[c.id], 'fakt') p)
    or k.f2    is distinct from (select p.paket from public._t2_summa_paket_v1(array[c.id], 'f2') p)
    or k.f2_qoralama is distinct from (select p.paket from public._t2_summa_paket_v1(array[c.id], 'f2_qoralama') p);
delete from public.t2_obyekt_kesh_iflos where obyekt_id = (select id from _ac_kichik);
select public._t2_kesh_belgila_v1(array[(select id from _ac_kichik)], 'acceptance');
select public._t2_kesh_belgila_v1(array[(select id from _ac_kichik)], 'acceptance');
select 'versiya_oshadi' as tekshiruv, case when i.versiya = 2 then 0 else 1 end as bad
  from public.t2_obyekt_kesh_iflos i where i.obyekt_id = (select id from _ac_kichik);

-- 6) Direktor pulti: a'zo + financial.read bo'lgan birinchi aktor uchun ok, 6 blok bor.
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
