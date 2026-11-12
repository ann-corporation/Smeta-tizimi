-- 20261217100000 - SOLISHTIRUV (reconciliation engine) v1.
-- Egasi talabi: har modul alohida sinalgan, ZANJIR (smeta->fakt->F2->Forma 3->to'lov->xarajat->buxgalteriya->foyda) hech kim isbotlamagan.
-- Bu yerda: (1) tekshiruvlar DATA sifatida (t2_solishtiruv_qoida: nom, domen jufti, SQL, jiddiylik, tavsiya, havola),
-- (2) BITTA navbat (t2_solishtiruv_istisno: ochiq / tushuntirildi / tuzatildi + sabab) — farq HECH QACHON yashirilmaydi,
-- ammo qonuniy farq (avans, qisman to'lov, hali kiritilmagan) sabab bilan TUSHUNTIRILADI, (3) bitta o'qish RPC t2_solishtiruv_v1,
-- (4) yangilash RPC (qayta ishga tushirilganda ALMASHTIRADI, qo'shmaydi) + kechasi cron.
-- Nega t2_signal emas: u ishlab chiqaruvchi triggerlar boshqaradigan open/resolved holatli umumiy oqim (24 881 qator, 3 tur); unga
-- «tushuntirildi + sabab» holatini qo'shish boshqa modullarning ishlab chiqaruvchilariga tegadi. Audit (t2_audit_yoz) qayta ishlatiladi.
-- Faqat additiv. Tenant: har RPC birinchi qatorda a'zolik + financial.read/write. Pul: dalil ichida QQS bilan raqam (ekran SummaJuft/hisob-yadro orqali).
-- Narx (har tekshiruv ENG KO'P `max_qator` qator qaytaradi, obyekt/shartnoma bo'yicha guruhlangan; indekslar: t2_xarajat(kompaniya,obyekt),
-- t2_tolov(shartnoma), t2_bux_provodka(kompaniya,manba)); o'lchanmagan - birinchi ishga tushirishda statement_timeout 150s bilan himoyalangan.
-- versiya: tarix/texnik — t2_qator ga to'g'ridan-to'g'ri murojaat faqat podval_yoq tekshiruvida (versiya_holat = 'faol').
-- Amalga oshirilmagan (v1): 7 (sklad/M-29), 8 (naryad), 9 (subpudrat), 11 (taqdim->qaror), 12 (kesh); ular t2_solishtiruv_qoida ga keyin qator qo'shish bilan ulanadi.

create table if not exists public.t2_solishtiruv_qoida (
  kod text primary key check (kod ~ '^[a-z0-9_]{3,60}$'),
  nom text not null,
  domen_a text not null,
  domen_b text not null,
  jiddiylik text not null check (jiddiylik in ('high', 'medium', 'low')),
  tavsif text not null,
  tavsiya text not null,
  havola text not null,
  chegara jsonb not null default '{}'::jsonb,
  max_qator integer not null default 200 check (max_qator between 1 and 1000),
  faol boolean not null default true,
  sql_matn text not null,
  narx_izoh text not null default '',
  yangilandi timestamptz not null default now()
);
alter table public.t2_solishtiruv_qoida enable row level security;
revoke all on table public.t2_solishtiruv_qoida from public, anon, authenticated;
grant select on table public.t2_solishtiruv_qoida to service_role;

create table if not exists public.t2_solishtiruv_istisno (
  id bigint generated always as identity primary key,
  kompaniya_id bigint not null references public.t2_kompaniya(id),
  qoida_kod text not null references public.t2_solishtiruv_qoida(kod),
  kalit text not null,
  obyekt_id bigint,
  shartnoma_id bigint,
  entity_type text,
  entity_id text,
  dalil jsonb not null default '{}'::jsonb,
  holat text not null default 'ochiq' check (holat in ('ochiq', 'tushuntirildi', 'tuzatildi')),
  sabab text,
  tushuntirgan_id bigint,
  tushuntirilgan_at timestamptz,
  tushuntirilgan_dalil jsonb,
  birinchi_at timestamptz not null default now(),
  oxirgi_at timestamptz not null default now(),
  tuzatildi_at timestamptz,
  versiya integer not null default 1,
  constraint t2_solishtiruv_istisno_uq unique (kompaniya_id, qoida_kod, kalit),
  constraint t2_solishtiruv_istisno_sabab_ck check (holat <> 'tushuntirildi' or length(btrim(coalesce(sabab, ''))) >= 3)
);
create index if not exists ix_t2_solishtiruv_istisno_ochiq on public.t2_solishtiruv_istisno (kompaniya_id, holat, qoida_kod);
create index if not exists ix_t2_solishtiruv_istisno_obyekt on public.t2_solishtiruv_istisno (kompaniya_id, obyekt_id) where obyekt_id is not null;
alter table public.t2_solishtiruv_istisno enable row level security;
revoke all on table public.t2_solishtiruv_istisno from public, anon, authenticated;
grant select on table public.t2_solishtiruv_istisno to service_role;

-- Tekshiruv SQL shartnomasi: $1 kompaniya_id, $2 obyekt_id (NULL = hammasi), $3 chegara jsonb ->
-- ustunlar (kalit text, obyekt_id bigint, shartnoma_id bigint, entity_type text, entity_id text, dalil jsonb).
-- sql_matn faqat migratsiya/service_role yozadi (jadvalga authenticated yozuv huquqi YO'Q).
insert into public.t2_solishtiruv_qoida (kod, nom, domen_a, domen_b, jiddiylik, tavsif, tavsiya, havola, chegara, max_qator, sql_matn, narx_izoh) values
('forma3_f2_yigindi', 'Forma 3 summasi ≠ uning F2 aktlari yig''indisi', 'forma3', 'f2', 'high',
 'Forma 3 ning bajarilgan summasi unga kirgan tasdiqlangan F2 aktlari (tasdiq summasi) yig''indisiga teng emas yoki akt keyin bekor qilingan.',
 'Forma 3 ni ochib aktlar ro''yxatini tekshiring; kerak bo''lsa Forma 3 ni qayta yarating.', '/admin/nakopitelniy', '{}'::jsonb, 200,
 $q$select f.id::text, f.obyekt_id, f.shartnoma_id, 'forma3'::text, f.id::text,
       jsonb_build_object('forma3_summa', f.bajarilgan_f2_summa, 'f2_summa', x.s, 'farq', round(f.bajarilgan_f2_summa - x.s, 2), 'bekor_f2_soni', x.bekor, 'raqam', f.raqam)
  from public.t2_forma3 f
 cross join lateral (
   select coalesce(sum(coalesce(aq.certified_amount, aq.summa)) filter (where a.holat = 'tasdiqlangan'), 0) as s,
          count(distinct a.id) filter (where a.holat = 'bekor') as bekor
     from public.t2_forma3_akt fa join public.t2_akt a on a.id = fa.akt_id
     left join public.t2_akt_qator aq on aq.akt_id = a.id
    where fa.forma3_id = f.id) x
 where f.kompaniya_id = $1 and ($2::bigint is null or f.obyekt_id = $2) and f.manba = 'f2' and f.holat <> 'bekor'
   and f.bajarilgan_f2_summa is not null and (abs(f.bajarilgan_f2_summa - x.s) > 0.01 or x.bekor > 0)
 order by f.id desc$q$,
 'Forma 3 soni x akt qatorlari; forma3(kompaniya) va t2_akt_qator(akt_id) indekslari. ~ms..soniya.'),
('f2_hajm_smetadan_oshgan', 'Tasdiqlangan F2 hajmi smeta hajmidan ortiq', 'f2', 'smeta', 'high',
 'Obyektda F2 da tasdiqlangan hajm smeta (joriy) hajmidan oshgan qatorlar bor — zamena/qo''shimcha ish rasmiylashtirilmagan bo''lishi mumkin.',
 'Qatorni ochib zamena yoki qo''shimcha ish rasmiylashtiring yoki F2 hajmini tuzating.', '/admin/f2', '{}'::jsonb, 200,
 $q$select o.id::text, o.id, null::bigint, 'obyekt'::text, o.id::text, jsonb_build_object('qator_soni', z.n, 'namuna', z.namuna)
  from public.t2_obyekt o
 cross join lateral (
   select count(*) as n,
          (select jsonb_agg(t) from (select h2.qator_id, h2.kod, h2.smeta_hajm, h2.f2_hajm from public.t2_qator_holat h2
             where h2.obyekt_id = o.id and h2.tur in ('bl', 'mat', 'ob', 'rs') and h2.f2_hajm > coalesce(h2.smeta_hajm, 0) + 0.000001
             order by h2.f2_hajm - coalesce(h2.smeta_hajm, 0) desc limit 5) t) as namuna
     from public.t2_qator_holat h
    where h.obyekt_id = o.id and h.tur in ('bl', 'mat', 'ob', 'rs') and h.f2_hajm > coalesce(h.smeta_hajm, 0) + 0.000001) z
 where o.kompaniya_id = $1 and ($2::bigint is null or o.id = $2) and o.holat = 'faol' and z.n > 0
   and exists (select 1 from public.t2_akt a where a.obyekt_id = o.id and a.tur = 'f2' and a.holat = 'tasdiqlangan')
 order by z.n desc$q$,
 't2_qator_holat ko''rinishi obyekt bo''yicha; faqat tasdiqlangan F2 bor obyektlar. Katta obyekt uchun soniyalar (o''lchanmagan).'),
('f2_fakt_dan_ortiq', 'Tasdiqlangan F2 fakt dan ortiq (tekshiring)', 'f2', 'fakt', 'low',
 'F2 da tasdiqlangan hajm kiritilgan fakt hajmidan katta. Egasi qoidasi: bu xato emas, «tekshiring» ogohlantirishi.',
 'Faktni to''ldiring yoki izoh bilan tushuntiring.', '/admin/fakt', '{}'::jsonb, 200,
 $q$select o.id::text, o.id, null::bigint, 'obyekt'::text, o.id::text, jsonb_build_object('qator_soni', z.n, 'namuna', z.namuna)
  from public.t2_obyekt o
 cross join lateral (
   select count(*) as n,
          (select jsonb_agg(t) from (select h2.qator_id, h2.kod, h2.fakt_hajm, h2.f2_hajm from public.t2_qator_holat h2
             where h2.obyekt_id = o.id and h2.tur in ('bl', 'mat', 'ob', 'rs') and h2.f2_hajm > coalesce(h2.fakt_hajm, 0) + 0.000001
             order by h2.f2_hajm - coalesce(h2.fakt_hajm, 0) desc limit 5) t) as namuna
     from public.t2_qator_holat h
    where h.obyekt_id = o.id and h.tur in ('bl', 'mat', 'ob', 'rs') and h.f2_hajm > coalesce(h.fakt_hajm, 0) + 0.000001) z
 where o.kompaniya_id = $1 and ($2::bigint is null or o.id = $2) and o.holat = 'faol' and z.n > 0
   and exists (select 1 from public.t2_akt a where a.obyekt_id = o.id and a.tur = 'f2' and a.holat = 'tasdiqlangan')
 order by z.n desc$q$,
 'f2_hajm_smetadan_oshgan bilan bir xil narx.'),
('tolov_forma3', 'To''lov ↔ Forma 3: ortiqcha to''langan / muddati o''tgan to''lanmagan', 'tolov', 'forma3', 'medium',
 'Shartnoma bo''yicha to''lovlar Forma 3 jamisidan ortiq (avans bo''lishi mumkin) yoki Forma 3 N kundan ortiq to''lanmagan. Teng bo''lishi SHART EMAS.',
 'Avans/qisman to''lov bo''lsa «tushuntirish» ni bosing; aks holda to''lovni tekshiring.', '/admin/moliya', '{"kechikish_kun": 30}'::jsonb, 200,
 $q$with f3 as (
   select f.shartnoma_id, sum(p.q) as vsego, min(coalesce(f.davr_oxiri, f.yaratildi::date)) as eng_eski
     from (select * from public.t2_forma3 f0 where f0.kompaniya_id = $1 and f0.shartnoma_id is not null and f0.manba = 'f2' and f0.holat <> 'bekor'
              and f0.yaratildi > now() - interval '400 days' order by f0.id desc limit 60) f
     join public.t2_forma3_akt fa on fa.forma3_id = f.id
     join public.t2_akt a on a.id = fa.akt_id and a.holat = 'tasdiqlangan'
    cross join lateral (select coalesce((r.paket->>'qqs_bilan')::numeric, 0) as q from public._t2_summa_paket_v1(array[a.obyekt_id], 'aktlar', array[a.id]) r limit 1) p
    group by f.shartnoma_id),
 tl as (
   select t.shartnoma_id, sum(case when t.tur = 'qaytarim' then -abs(t.summa) else t.summa end) as tolangan
     from public.t2_tolov t where t.kompaniya_id = $1 and t.holat <> 'bekor' group by t.shartnoma_id)
 select 'ortiqcha:' || f3.shartnoma_id, null::bigint, f3.shartnoma_id, 'shartnoma'::text, f3.shartnoma_id::text,
        jsonb_build_object('tur', 'ortiqcha_tolangan', 'forma3_jami_qqs_bilan', round(f3.vsego, 2), 'tolangan', round(tl.tolangan, 2), 'farq', round(tl.tolangan - f3.vsego, 2))
   from f3 join tl on tl.shartnoma_id = f3.shartnoma_id
  where ($2::bigint is null or exists (select 1 from public.t2_shartnoma_bog b where b.shartnoma_id = f3.shartnoma_id and b.obyekt_id = $2 and b.holat = 'faol'))
    and tl.tolangan > f3.vsego + 0.01
 union all
 select 'qarz:' || f3.shartnoma_id, null::bigint, f3.shartnoma_id, 'shartnoma'::text, f3.shartnoma_id::text,
        jsonb_build_object('tur', 'muddati_otgan_tolanmagan', 'forma3_jami_qqs_bilan', round(f3.vsego, 2), 'tolangan', round(coalesce(tl.tolangan, 0), 2),
                           'qoldiq', round(f3.vsego - coalesce(tl.tolangan, 0), 2), 'eng_eski_forma3', f3.eng_eski)
   from f3 left join tl on tl.shartnoma_id = f3.shartnoma_id
  where ($2::bigint is null or exists (select 1 from public.t2_shartnoma_bog b where b.shartnoma_id = f3.shartnoma_id and b.obyekt_id = $2 and b.holat = 'faol'))
    and f3.vsego - coalesce(tl.tolangan, 0) > 0.01
    and f3.eng_eski < current_date - coalesce((($3::jsonb)->>'kechikish_kun')::integer, 30)$q$,
 'Eng ko''pi 60 ta so''nggi Forma 3 x akt uchun summa yadrosi (_t2_summa_paket_v1) — eng og''ir tekshiruv, soniyalar (o''lchanmagan); cron kechasi.'),
('xarajat_taqsimlanmagan', 'Xarajat obyekt/shartnomasiz (taqsimlanmagan)', 'xarajat', 'obyekt', 'medium',
 'Obyekt ham, shartnoma ham ko''rsatilmagan xarajat yozuvlari — foyda/zarar hisobiga tushmaydi.',
 'Xarajatni ochib obyektga/shartnomaga biriktiring.', '/admin/moliya', '{}'::jsonb, 50,
 $q$select 'kompaniya'::text, null::bigint, null::bigint, 'xarajat'::text, null::text,
        jsonb_build_object('soni', count(*), 'jami', round(sum(x.summa), 2),
          'namuna', (select jsonb_agg(s.id) from (select id from public.t2_xarajat where kompaniya_id = $1 and holat <> 'bekor' and obyekt_id is null and shartnoma_id is null order by id desc limit 5) s))
  from public.t2_xarajat x
 where x.kompaniya_id = $1 and x.holat <> 'bekor' and x.obyekt_id is null and x.shartnoma_id is null and $2::bigint is null
having count(*) > 0$q$,
 'ix_t2_xarajat_obyekt/shartnoma; bitta yig''ma satr. ms.'),
('buxgalteriya_manba', 'Buxgalteriya jurnali ↔ manba hujjatlar', 'buxgalteriya', 'xarajat', 'high',
 'Provodkasiz xarajat; manbasi yo''q (o''chgan/bekor) provodka; noto''g''ri provodka (summa<=0, bir xil hisob). Hisoblar rejasi ochilgan kompaniyalar uchun.',
 'Buxgalteriya -> «Hujjatlardan yangilash»; manbasiz provodkani storno qiling.', '/admin/buxgalteriya', '{"kutish_soat": 24}'::jsonb, 20,
 $q$select 'xarajat_provodkasiz'::text, null::bigint, null::bigint, 'xarajat'::text, null::text,
        jsonb_build_object('tur', 'xarajat_provodkasiz', 'soni', count(*), 'jami', round(sum(x.summa), 2),
          'izoh', 'ЧЕЛ + tasdiqlangan oylik bo''lsa provodka ataylab o''tkazilmasligi mumkin — tushuntiring',
          'namuna', (select jsonb_agg(s.id) from (select x2.id from public.t2_xarajat x2 where x2.kompaniya_id = $1 and x2.holat = 'faol' and x2.summa <> 0
              and not exists (select 1 from public.t2_bux_provodka p where p.kompaniya_id = x2.kompaniya_id and p.manba_tur = 'xarajat' and p.manba_id = x2.id)
              and x2.yaratildi < now() - make_interval(hours => coalesce((($3::jsonb)->>'kutish_soat')::integer, 24)) order by x2.id desc limit 5) s))
  from public.t2_xarajat x
 where x.kompaniya_id = $1 and x.holat = 'faol' and x.summa <> 0 and $2::bigint is null
   and exists (select 1 from public.t2_bux_hisob h where h.kompaniya_id = $1)
   and not exists (select 1 from public.t2_bux_provodka p where p.kompaniya_id = x.kompaniya_id and p.manba_tur = 'xarajat' and p.manba_id = x.id)
   and x.yaratildi < now() - make_interval(hours => coalesce((($3::jsonb)->>'kutish_soat')::integer, 24))
having count(*) > 0
union all
select 'provodka_manbasiz'::text, null::bigint, null::bigint, 'provodka'::text, null::text,
       jsonb_build_object('tur', 'provodka_manbasiz', 'soni', count(*), 'namuna', (select jsonb_agg(s.id) from (select p2.id from public.t2_bux_provodka p2
          where p2.kompaniya_id = $1 and p2.manba_tur = 'xarajat' and p2.storno_id is null and p2.tur is distinct from 'storno'
            and not exists (select 1 from public.t2_xarajat x where x.id = p2.manba_id and x.holat <> 'bekor')
            and not exists (select 1 from public.t2_bux_provodka s2 where s2.storno_id = p2.id) order by p2.id desc limit 5) s))
  from public.t2_bux_provodka p
 where p.kompaniya_id = $1 and p.manba_tur = 'xarajat' and p.storno_id is null and p.tur is distinct from 'storno' and $2::bigint is null
   and not exists (select 1 from public.t2_xarajat x where x.id = p.manba_id and x.holat <> 'bekor')
   and not exists (select 1 from public.t2_bux_provodka s2 where s2.storno_id = p.id)
having count(*) > 0
union all
select 'provodka_notogri'::text, null::bigint, null::bigint, 'provodka'::text, null::text,
       jsonb_build_object('tur', 'provodka_notogri', 'soni', count(*))
  from public.t2_bux_provodka p
 where p.kompaniya_id = $1 and p.tur is distinct from 'storno' and $2::bigint is null
   and (p.summa <= 0 or p.dt_kod is null or p.kt_kod is null or p.dt_kod = p.kt_kod)
having count(*) > 0$q$,
 't2_bux_provodka(kompaniya,manba) va t2_xarajat(kompaniya) indekslari; bitta kompaniya uchun ms..soniya.'),
('smeta_podval_yoq', 'Smeta podvali yo''q (nakrutka = 0 % qoidasi)', 'smeta', 'nakrutka', 'medium',
 'Obyektda smeta qatorlari bor, lekin smeta podvali yo''q: ustamali summa tizim defoltlari bilan ko''rsatiladi. Egasi ko''rib chiqishi kerak.',
 'Smeta podvalini kiriting (Nakrutka → Podval).', '/admin/nakrutka', '{}'::jsonb, 200,
 $q$select o.id::text, o.id, null::bigint, 'obyekt'::text, o.id::text, jsonb_build_object('nk_manba', 'defolt')
  from public.t2_obyekt o
 where o.kompaniya_id = $1 and ($2::bigint is null or o.id = $2) and o.holat = 'faol'
   and exists (select 1 from public.t2_qator q where q.obyekt_id = o.id and q.versiya_holat = 'faol')
   and not exists (select 1 from public.t2_nakrutka_podval p where p.obyekt_id = o.id and p.kompaniya_id = o.kompaniya_id and p.faol)
 order by o.id$q$,
 'exists(t2_qator obyekt bo''yicha) + podval; obyekt soni x ms.')
on conflict (kod) do update set nom = excluded.nom, domen_a = excluded.domen_a, domen_b = excluded.domen_b, jiddiylik = excluded.jiddiylik,
  tavsif = excluded.tavsif, tavsiya = excluded.tavsiya, havola = excluded.havola, chegara = excluded.chegara, max_qator = excluded.max_qator,
  sql_matn = excluded.sql_matn, narx_izoh = excluded.narx_izoh, yangilandi = now();

-- Ichki ishga tushiruvchi: har faol tekshiruv; almashtiradi (upsert), topilmaganlar -> tuzatildi, tushuntirilgan holat SAQLANADI.
create or replace function public._t2_solishtiruv_yangila_ich(p_kompaniya_id bigint, p_obyekt_id bigint default null)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $fn$
declare r record; x record; v_kalit text[]; v_n integer; v_xato jsonb := '[]'::jsonb; v_jami jsonb := '{}'::jsonb; v_tuz integer;
begin
  for r in select * from public.t2_solishtiruv_qoida where faol order by kod loop
    v_kalit := '{}'; v_n := 0;
    begin
      for x in execute format('select * from (%s) q(kalit, obyekt_id, shartnoma_id, entity_type, entity_id, dalil) limit %s', r.sql_matn, r.max_qator) using p_kompaniya_id, p_obyekt_id, r.chegara loop
        v_n := v_n + 1; v_kalit := v_kalit || x.kalit::text;
        insert into public.t2_solishtiruv_istisno (kompaniya_id, qoida_kod, kalit, obyekt_id, shartnoma_id, entity_type, entity_id, dalil)
        values (p_kompaniya_id, r.kod, x.kalit, x.obyekt_id, x.shartnoma_id, x.entity_type, x.entity_id, coalesce(x.dalil, '{}'::jsonb))
        on conflict (kompaniya_id, qoida_kod, kalit) do update set
          dalil = excluded.dalil, obyekt_id = excluded.obyekt_id, shartnoma_id = excluded.shartnoma_id, oxirgi_at = now(),
          holat = case when t2_solishtiruv_istisno.holat = 'tuzatildi' then 'ochiq' else t2_solishtiruv_istisno.holat end,
          sabab = case when t2_solishtiruv_istisno.holat = 'tuzatildi' then null else t2_solishtiruv_istisno.sabab end,
          tushuntirilgan_dalil = case when t2_solishtiruv_istisno.holat = 'tuzatildi' then null else t2_solishtiruv_istisno.tushuntirilgan_dalil end,
          tuzatildi_at = null;
      end loop;
      -- topilmagan = tuzatilgan (faqat kesilmagan natijada; obyekt bo'yicha ishlaganda faqat shu obyekt qatorlari)
      if v_n < r.max_qator then
        update public.t2_solishtiruv_istisno i set holat = 'tuzatildi', tuzatildi_at = now(), oxirgi_at = now()
         where i.kompaniya_id = p_kompaniya_id and i.qoida_kod = r.kod and i.holat in ('ochiq', 'tushuntirildi')
           and (p_obyekt_id is null or i.obyekt_id = p_obyekt_id) and not (i.kalit = any(v_kalit));
        get diagnostics v_tuz = row_count;
      else v_tuz := 0; end if;
      v_jami := v_jami || jsonb_build_object(r.kod, jsonb_build_object('topildi', v_n, 'tuzatildi', v_tuz, 'kesilgan', v_n >= r.max_qator));
    exception when others then
      v_xato := v_xato || jsonb_build_array(jsonb_build_object('qoida', r.kod, 'xato', left(sqlerrm, 300)));
    end;
  end loop;
  return jsonb_build_object('ok', true, 'qoidalar', v_jami, 'xatolar', v_xato);
end $fn$;
revoke all on function public._t2_solishtiruv_yangila_ich(bigint, bigint) from public, anon, authenticated;
grant execute on function public._t2_solishtiruv_yangila_ich(bigint, bigint) to service_role;

-- Yozuv: yangilash (financial.write). Qayta ishga tushirilganda ALMASHTIRADI.
create or replace function public.t2_solishtiruv_yangila_v1(p_actor_id bigint, p_kompaniya_id bigint, p_obyekt_id bigint, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $fn$
declare v_res jsonb;
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'financial.write');
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  if p_obyekt_id is not null and not exists (select 1 from public.t2_obyekt where id = p_obyekt_id and kompaniya_id = p_kompaniya_id) then
    return jsonb_build_object('ok', false, 'code', 'OBYEKT_SCOPE_MISMATCH');
  end if;
  v_res := public._t2_solishtiruv_yangila_ich(p_kompaniya_id, p_obyekt_id);
  perform public.t2_audit_yoz(p_kompaniya_id, 'solishtiruv_yangila', 'solishtiruv', p_obyekt_id, 'qoidalar=' || (v_res->'qoidalar')::text, 'actor:' || p_actor_id, null);
  return v_res;
end $fn$;
revoke all on function public.t2_solishtiruv_yangila_v1(bigint, bigint, bigint, uuid) from public, anon, authenticated;
grant execute on function public.t2_solishtiruv_yangila_v1(bigint, bigint, bigint, uuid) to service_role;

-- Yozuv: tushuntirish / qayta ochish (financial.write). Sabab majburiy (>= 3 belgi). Idempotent: bir xil holat takror -> xato emas.
create or replace function public.t2_solishtiruv_tushuntir_v1(p_actor_id bigint, p_kompaniya_id bigint, p_istisno_id bigint, p_holat text, p_sabab text, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $fn$
declare v_i public.t2_solishtiruv_istisno%rowtype; v_sabab text := nullif(left(btrim(coalesce(p_sabab, '')), 500), '');
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'financial.write');
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  if p_holat is null or p_holat not in ('tushuntirildi', 'ochiq') then return jsonb_build_object('ok', false, 'code', 'HOLAT_INVALID'); end if;
  select * into v_i from public.t2_solishtiruv_istisno where id = p_istisno_id and kompaniya_id = p_kompaniya_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'ISTISNO_NOT_FOUND'); end if;
  if v_i.holat = 'tuzatildi' then return jsonb_build_object('ok', false, 'code', 'ALLAQACHON_TUZATILGAN'); end if;
  if p_holat = 'tushuntirildi' and (v_sabab is null or length(v_sabab) < 3) then return jsonb_build_object('ok', false, 'code', 'SABAB_REQUIRED'); end if;
  if v_i.holat = p_holat and (p_holat = 'ochiq' or v_i.sabab is not distinct from v_sabab) then return jsonb_build_object('ok', true, 'takror', true, 'id', v_i.id, 'holat', v_i.holat); end if;
  update public.t2_solishtiruv_istisno set holat = p_holat, versiya = versiya + 1,
         sabab = case when p_holat = 'tushuntirildi' then v_sabab else null end,
         tushuntirgan_id = case when p_holat = 'tushuntirildi' then p_actor_id else null end,
         tushuntirilgan_at = case when p_holat = 'tushuntirildi' then now() else null end,
         tushuntirilgan_dalil = case when p_holat = 'tushuntirildi' then dalil else null end
   where id = v_i.id;
  perform public.t2_audit_yoz(p_kompaniya_id, 'solishtiruv_' || p_holat, 'solishtiruv', v_i.obyekt_id,
    format('istisno=%s qoida=%s sabab=%s', v_i.id, v_i.qoida_kod, coalesce(v_sabab, '-')), 'actor:' || p_actor_id, null);
  return jsonb_build_object('ok', true, 'takror', false, 'id', v_i.id, 'holat', p_holat);
end $fn$;
revoke all on function public.t2_solishtiruv_tushuntir_v1(bigint, bigint, bigint, text, text, uuid) from public, anon, authenticated;
grant execute on function public.t2_solishtiruv_tushuntir_v1(bigint, bigint, bigint, text, text, uuid) to service_role;

-- O'qish: bitta navbat, jiddiylik bo'yicha tartiblangan; ochiq yuqori jiddiylik soni direktor paneli uchun.
create or replace function public.t2_solishtiruv_v1(p_kompaniya_id bigint, p_actor_id bigint, p_obyekt_id bigint default null)
returns jsonb language plpgsql stable security definer set search_path to 'public', 'pg_temp' as $fn$
declare v_royxat jsonb; v_hisob jsonb;
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'financial.read');
  if p_obyekt_id is not null and not exists (select 1 from public.t2_obyekt where id = p_obyekt_id and kompaniya_id = p_kompaniya_id) then
    return jsonb_build_object('ok', false, 'code', 'OBYEKT_SCOPE_MISMATCH');
  end if;
  select jsonb_build_object(
           'yuqori_ochiq', count(*) filter (where i.holat = 'ochiq' and q.jiddiylik = 'high'),
           'ochiq', count(*) filter (where i.holat = 'ochiq'),
           'tushuntirildi', count(*) filter (where i.holat = 'tushuntirildi'),
           'tuzatildi', count(*) filter (where i.holat = 'tuzatildi'))
    into v_hisob
    from public.t2_solishtiruv_istisno i join public.t2_solishtiruv_qoida q on q.kod = i.qoida_kod
   where i.kompaniya_id = p_kompaniya_id and (p_obyekt_id is null or i.obyekt_id = p_obyekt_id);
  select coalesce(jsonb_agg(z.j order by z.rk, z.holat_rk, z.id desc), '[]'::jsonb) into v_royxat
    from (select i.id, case q.jiddiylik when 'high' then 0 when 'medium' then 1 else 2 end as rk,
                 case i.holat when 'ochiq' then 0 else 1 end as holat_rk,
                 jsonb_build_object('id', i.id, 'qoida', q.kod, 'nom', q.nom, 'domen_a', q.domen_a, 'domen_b', q.domen_b, 'jiddiylik', q.jiddiylik,
                   'tavsif', q.tavsif, 'tavsiya', q.tavsiya, 'havola', q.havola, 'holat', i.holat, 'sabab', i.sabab,
                   'ozgargan', i.holat = 'tushuntirildi' and i.tushuntirilgan_dalil is distinct from i.dalil,
                   'obyekt_id', i.obyekt_id, 'obyekt_nom', o.nom, 'shartnoma_id', i.shartnoma_id, 'entity_type', i.entity_type, 'entity_id', i.entity_id,
                   'dalil', i.dalil, 'birinchi_at', i.birinchi_at, 'oxirgi_at', i.oxirgi_at) as j
            from public.t2_solishtiruv_istisno i join public.t2_solishtiruv_qoida q on q.kod = i.qoida_kod
            left join public.t2_obyekt o on o.id = i.obyekt_id
           where i.kompaniya_id = p_kompaniya_id and i.holat in ('ochiq', 'tushuntirildi') and (p_obyekt_id is null or i.obyekt_id = p_obyekt_id)
           order by 2, 3, i.id desc limit 300) z;
  return jsonb_build_object('ok', true, 'generated_at', now(), 'hisob', v_hisob, 'royxat', v_royxat);
end $fn$;
revoke all on function public.t2_solishtiruv_v1(bigint, bigint, bigint) from public, anon, authenticated;
grant execute on function public.t2_solishtiruv_v1(bigint, bigint, bigint) to service_role;

-- Kechasi jadval: har kompaniya alohida xato izolyatsiyasi bilan.
create or replace function public.t2_solishtiruv_cron_v1()
returns integer language plpgsql security definer set search_path to 'public', 'pg_temp' as $fn$
declare k record; v_n integer := 0;
begin
  for k in select c.id from public.t2_kompaniya c where c.faol and exists (select 1 from public.t2_obyekt o where o.kompaniya_id = c.id) order by c.id loop
    begin perform public._t2_solishtiruv_yangila_ich(k.id, null); v_n := v_n + 1;
    exception when others then raise warning 't2_solishtiruv_cron_v1 kompaniya %: %', k.id, sqlerrm; end;
  end loop;
  return v_n;
end $fn$;
revoke all on function public.t2_solishtiruv_cron_v1() from public, anon, authenticated;
grant execute on function public.t2_solishtiruv_cron_v1() to service_role;

do $cron$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 't2_solishtiruv_tungi') then perform cron.unschedule('t2_solishtiruv_tungi'); end if;
    perform cron.schedule('t2_solishtiruv_tungi', '40 22 * * *', 'set statement_timeout = ''600s''; select public.t2_solishtiruv_cron_v1()');
  else
    raise warning 'pg_cron yo''q — t2_solishtiruv_cron_v1 ni boshqa rejalashtiruvchi bilan chaqiring';
  end if;
end $cron$;
