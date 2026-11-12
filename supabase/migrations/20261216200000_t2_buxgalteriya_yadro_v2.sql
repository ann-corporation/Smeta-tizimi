-- T2-BUXGALTERIYA-002 - Buxgalteriya yadrosi (1C o'rniga) 1-bosqich: V1 ustiga universal qatlam. Dizayn: docs/architecture/BUXGALTERIYA_1C_ORNIGA.md
-- DUBLIKAT YASALMAYDI: V1 jadvallari (t2_bux_hisob/moslik/provodka/davr) o'z joyida. Qo'shiladi:
--   * t2_bux_shablon  - provodka qoidalari SHABLONLARI (tomon turi bo'yicha: pudratchi, buyurtmachi; qolganlari keyingi bosqich) - MA'LUMOT
--   * t2_bux_sozlama  - kompaniya: tanlangan shablon + davrni qat'iy bloklash (sukut: bloklanadi)
--   * t2_bux_hisob.tekshirilsin - hisob kodi buxgalter tomonidan hali tasdiqlanmagan (T)
--   * qat'iy davr bloki (trigger), t2_xarajat va qabul qilingan taqdim (t2_tomon_taqdim) manbalari, hisob kartochkasi, sozlama RPC lari.
-- Har kompaniya O'Z daftarida yuritadi (kompaniya_id); boshqa tomon daftari hech qachon o'qilmaydi: taqdim faqat qabul qiluvchi kompaniya daftariga yoziladi.
-- Provodka modeli: bir qator = bitta Dt + bitta Kt + bitta summa (tuzilish bo'yicha muvozanatli); murakkab yozuv = bir manbadan bir nechta qator.
-- Pul: summa QQS bilan keladi; asos/QQS ajratish V1 dagidek ayirma bilan (jami = asos + QQS). T - tekshirilsin (buxgalter/yurist).

-- 1. Hisob tasdig'i belgisi
alter table public.t2_bux_hisob add column if not exists tekshirilsin boolean not null default true;
comment on column public.t2_bux_hisob.tekshirilsin is 'T - kod/nom rasmiy reja bilan buxgalter tomonidan hali tasdiqlanmagan. Seed faqat ishonchli hisoblarni false qiladi.';

-- 2. Kompaniya sozlamasi
create table if not exists public.t2_bux_sozlama (
  kompaniya_id bigint primary key references public.t2_kompaniya(id) on delete cascade,
  shablon text not null default 'pudratchi',
  davr_blok boolean not null default true,
  yangilandi timestamptz not null default now()
);
comment on table public.t2_bux_sozlama is 'Buxgalteriya sozlamasi: qoida shabloni (tomon turi) va yopiq davrga provodka tushishini qat''iy bloklash (davr_blok=true: rad, false: faqat ogohlantirish).';

-- 3. Qoida shablonlari (global ma'lumotnoma, tomon turi bo'yicha)
create table if not exists public.t2_bux_shablon (
  shablon text not null check (shablon ~ '^[a-z_]{3,30}$'),
  kalit text not null check (kalit ~ '^[a-z0-9_]+\.[a-z0-9_]+$'),
  dt_kod text check (dt_kod is null or dt_kod ~ '^[0-9]{4}$'),
  kt_kod text check (kt_kod is null or kt_kod ~ '^[0-9]{4}$'),
  qiymat numeric,
  izoh text,
  primary key (shablon, kalit)
);
comment on table public.t2_bux_shablon is 'Provodka qoidalari shablonlari (tomon turi -> kalit -> Dt/Kt). dt/kt NULL = qoida o''chirilgan (ma''lumot tayyor, provodka yo''q). Kompaniya tanlagach t2_bux_moslik ga ko''chiriladi va tahrirlanadi.';

alter table public.t2_bux_sozlama enable row level security;
alter table public.t2_bux_shablon enable row level security;
revoke all on public.t2_bux_sozlama, public.t2_bux_shablon from anon, authenticated;

insert into public.t2_bux_shablon(shablon, kalit, dt_kod, kt_kod, qiymat, izoh) values
  -- PUDRATCHI (sotuvchi: realizatsiya = daromad + xaridor qarzi)
  ('pudratchi', 'sotuv.realizatsiya', '4010', '9010', null, 'Forma-3 (счёт-фактура): realizatsiya, QQS siz'),
  ('pudratchi', 'sotuv.nds', '4010', '6410', null, 'Forma-3: chiqarilgan QQS'),
  ('pudratchi', 'xarid.ombor', '1010', '6010', null, 'Ombor kirimi (yetkazib berish), QQS siz'),
  ('pudratchi', 'xarid.ish', '2010', '6010', null, 'Subpudrat / xizmat dalolatnomasi, QQS siz'),
  ('pudratchi', 'xarid.nds', '4410', '6010', null, 'Xarid QQS i (hisobga olinadigan)'),
  ('pudratchi', 'tolov.kirim', '5110', '4010', null, 'Buyurtmachidan kelgan to''lov'),
  ('pudratchi', 'tolov.chiqim', '6010', '5110', null, 'Kontragentga to''langan to''lov'),
  ('pudratchi', 'boshlangich.kreditor', '8810', '6010', null, 'Kreditor boshlang''ich qoldig''i'),
  ('pudratchi', 'ish_haqi.hisoblash', '2010', '6710', null, 'KADRLAR (kelajak): ish haqi hisoblandi'),
  ('pudratchi', 'ish_haqi.tolash', '6710', '5110', null, 'KADRLAR (kelajak): ish haqi to''landi'),
  ('pudratchi', 'param.nds_foiz', null, null, 12, 'QQS stavkasi (%), hujjatda foiz bo''lmasa shu. T - tekshirilsin'),
  ('pudratchi', 'xarajat.chel', '2010', '6710', null, 'Xarajat ЧЕЛ (mehnat) obyektga. Kadrlar ilgagi yoqilsa - bu qoidani o''chiring (ikki marta sanalmasin). T'),
  ('pudratchi', 'xarajat.mash', '2010', '6010', null, 'Xarajat МАШ (mexanizm) obyektga. T'),
  ('pudratchi', 'xarajat.ob', '2010', '6010', null, 'Xarajat ОБ (uskuna) obyektga. T'),
  ('pudratchi', 'xarajat.mat', null, null, null, 'O''CHIRILGAN: МАТ ombor kirimi + M-29 bilan ikki marta sanalmasligi uchun (2-bosqich)'),
  ('pudratchi', 'xarajat.sub', null, null, null, 'O''CHIRILGAN: SUB subpudrat aktlari (xarid.ish) bilan ikki marta sanalmasligi uchun'),
  ('pudratchi', 'xarajat.otk', null, null, null, 'O''CHIRILGAN: OTK hisobi buxgalter tasdig''ini kutadi. T'),
  -- BUYURTMACHI (xaridor: qabul qilingan F2 = kapital qo'yilma + yetkazuvchiga qarz)
  ('buyurtmachi', 'taqdim.f2', '0800', '6010', null, 'Qabul qilingan Forma-2 (taqdim): kapital qo''yilma, QQS siz. T'),
  ('buyurtmachi', 'taqdim.nds', '4410', '6010', null, 'Qabul qilingan Forma-2: kiruvchi QQS. T'),
  ('buyurtmachi', 'tolov.chiqim', '6010', '5110', null, 'Pudratchiga to''langan to''lov (hamma to''lov chiqim)'),
  ('buyurtmachi', 'boshlangich.kreditor', '8810', '6010', null, 'Kreditor boshlang''ich qoldig''i'),
  ('buyurtmachi', 'param.nds_foiz', null, null, 12, 'QQS stavkasi (%). T - tekshirilsin')
on conflict (shablon, kalit) do nothing;

-- 4. Standart reja: ishonchli hisoblar tasdiqlangan, qolgani T (tekshirilsin)
create or replace function public._t2_bux_hisob_seed(p_kompaniya_id bigint) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_n integer;
begin
  insert into public.t2_bux_hisob(kompaniya_id, kod, nom_uz, nom_ru, tur, kontragent_analitika, standart, tekshirilsin)
  select p_kompaniya_id, v.kod, v.nom_uz, v.nom_ru, v.tur, v.ka, true,
         v.kod not in ('0100', '0200', '1010', '2010', '4010', '5010', '5110', '6010', '6710', '8310', '9010', '9110', '9410', '9420', '9810', '9910')
    from (values
      ('0100', 'Asosiy vositalar', 'Основные средства', 'aktiv', false),
      ('0200', 'Asosiy vositalar eskirishi', 'Износ основных средств', 'passiv', false),
      ('0800', 'Kapital qo''yilmalar', 'Капитальные вложения', 'aktiv', false),
      ('1010', 'Xom ashyo va materiallar', 'Сырьё и материалы', 'aktiv', false),
      ('1090', 'Boshqa materiallar', 'Прочие материалы', 'aktiv', false),
      ('2010', 'Asosiy ishlab chiqarish (qurilish ishlari)', 'Основное производство (строительные работы)', 'aktiv', false),
      ('2510', 'Umumishlab chiqarish xarajatlari', 'Общепроизводственные расходы', 'aktiv', false),
      ('2810', 'Tayyor mahsulot', 'Готовая продукция', 'aktiv', false),
      ('4010', 'Xaridor va buyurtmachilardan olinadigan hisoblar', 'Счета к получению от покупателей и заказчиков', 'aktiv', true),
      ('4310', 'Yetkazuvchi va pudratchilarga berilgan avanslar', 'Авансы, выданные поставщикам и подрядчикам', 'aktiv', true),
      ('4410', 'Byudjetga avans to''lovlar va QQS (hisobga olinadigan)', 'Авансовые платежи в бюджет, НДС к зачёту', 'aktiv', false),
      ('5010', 'Kassa (so''m)', 'Касса в национальной валюте', 'aktiv', false),
      ('5110', 'Hisob-kitob schyoti', 'Расчётный счёт', 'aktiv', false),
      ('5210', 'Valyuta schyoti', 'Валютный счёт', 'aktiv', false),
      ('6010', 'Yetkazuvchi va pudratchilarga to''lanadigan hisoblar', 'Счета к оплате поставщикам и подрядчикам', 'passiv', true),
      ('6310', 'Xaridor va buyurtmachilardan olingan avanslar', 'Авансы, полученные от покупателей и заказчиков', 'passiv', true),
      ('6410', 'Byudjetga to''lovlar bo''yicha qarz (QQS)', 'Задолженность по платежам в бюджет (НДС)', 'passiv', false),
      ('6710', 'Ish haqi bo''yicha qarz', 'Задолженность по оплате труда', 'passiv', false),
      ('6810', 'Qisqa muddatli kreditlar', 'Краткосрочные кредиты', 'passiv', false),
      ('8310', 'Ustav kapitali', 'Уставный капитал', 'passiv', false),
      ('8810', 'Taqsimlanmagan foyda (qoplanmagan zarar)', 'Нераспределённая прибыль (непокрытый убыток)', 'aktiv_passiv', false),
      ('9010', 'Realizatsiyadan daromad', 'Доходы от реализации', 'daromad', false),
      ('9110', 'Sotilgan mahsulot (ish) tannarxi', 'Себестоимость реализованной продукции (работ)', 'xarajat', false),
      ('9410', 'Sotish xarajatlari', 'Расходы по реализации', 'xarajat', false),
      ('9420', 'Ma''muriy xarajatlar', 'Административные расходы', 'xarajat', false),
      ('9810', 'Foyda solig''i', 'Налог на прибыль', 'xarajat', false),
      ('9910', 'Yakuniy moliyaviy natija', 'Итоговый финансовый результат', 'aktiv_passiv', false)
    ) as v(kod, nom_uz, nom_ru, tur, ka)
  on conflict (kompaniya_id, kod) do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- Boshlash: kompaniyaning shabloni (sozlama yo'q bo'lsa pudratchi) qoidalarini ko'chiradi
create or replace function public._t2_bux_moslik_seed(p_kompaniya_id bigint) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_n integer; v_sh text;
begin
  v_sh := coalesce((select s.shablon from public.t2_bux_sozlama s where s.kompaniya_id = p_kompaniya_id), 'pudratchi');
  insert into public.t2_bux_moslik(kompaniya_id, kalit, dt_kod, kt_kod, qiymat, izoh)
  select p_kompaniya_id, h.kalit, h.dt_kod, h.kt_kod, h.qiymat, h.izoh from public.t2_bux_shablon h where h.shablon = v_sh
  on conflict (kompaniya_id, kalit) do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- 5. Qat'iy davr bloki: yopiq oyga provodka yozilmaydi (davr_blok=true, sukut). Barcha yozish yo'llari (auto, qo'lda, storno, bank, HR) shu triggerdan o'tadi.
create or replace function public._t2_bux_davr_blok_trg() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if coalesce((select s.davr_blok from public.t2_bux_sozlama s where s.kompaniya_id = new.kompaniya_id), true)
     and exists (select 1 from public.t2_bux_davr z where z.kompaniya_id = new.kompaniya_id and z.holat = 'yopiq' and z.oy = date_trunc('month', new.sana)::date) then
    raise exception 'BUX_DAVR_YOPIQ: % oyi yopilgan - provodka yozilmaydi (davrni qayta oching yoki keyingi oyga yozing)', to_char(new.sana, 'YYYY-MM') using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists t2_bux_provodka_davr_blok_trg on public.t2_bux_provodka;
create trigger t2_bux_provodka_davr_blok_trg before insert on public.t2_bux_provodka
  for each row execute function public._t2_bux_davr_blok_trg();

-- 6. Sinxron: yopiq oyga (qat'iy rejimda) delta yozilmaydi, "otkazildi" deb sanaladi
create or replace function public._t2_bux_sync(p_kompaniya_id bigint, p_actor_id bigint, p_turlar text[], p_kerak jsonb, p_dry boolean)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_yangi integer; v_storno integer; v_yopiq integer; v_otk integer; v_oylar text[]; v_blok boolean;
begin
  v_blok := coalesce((select s.davr_blok from public.t2_bux_sozlama s where s.kompaniya_id = p_kompaniya_id), true);
  with d0 as (
    select * from jsonb_to_recordset(coalesce(p_kerak, '[]'::jsonb))
      as x(manba_tur text, manba_id bigint, qism text, sana date, dt_kod text, kt_kod text, summa numeric, kontragent_id bigint, shartnoma_id bigint, obyekt_id bigint)
  ), d as (
    select manba_tur, manba_id, qism, sana, dt_kod, kt_kod, coalesce(kontragent_id, 0) as k0, coalesce(shartnoma_id, 0) as s0, coalesce(obyekt_id, 0) as o0, sum(summa) as summa
      from d0 group by 1, 2, 3, 4, 5, 6, 7, 8, 9
  ), c as (
    select manba_tur, manba_id, qism, sana, dt_kod, kt_kod, coalesce(kontragent_id, 0) as k0, coalesce(shartnoma_id, 0) as s0, coalesce(obyekt_id, 0) as o0, sum(summa) as summa
      from public.t2_bux_provodka where kompaniya_id = p_kompaniya_id and manba_tur = any (p_turlar) group by 1, 2, 3, 4, 5, 6, 7, 8, 9
  ), delta0 as (
    select coalesce(d.manba_tur, c.manba_tur) as manba_tur, coalesce(d.manba_id, c.manba_id) as manba_id, coalesce(d.qism, c.qism) as qism,
           coalesce(d.sana, c.sana) as sana, coalesce(d.dt_kod, c.dt_kod) as dt_kod, coalesce(d.kt_kod, c.kt_kod) as kt_kod,
           nullif(coalesce(d.k0, c.k0), 0) as kontragent_id, nullif(coalesce(d.s0, c.s0), 0) as shartnoma_id, nullif(coalesce(d.o0, c.o0), 0) as obyekt_id,
           coalesce(d.summa, 0) - coalesce(c.summa, 0) as farq
      from d full join c on d.manba_tur = c.manba_tur and d.manba_id = c.manba_id and d.qism = c.qism and d.sana = c.sana
                        and d.dt_kod = c.dt_kod and d.kt_kod = c.kt_kod and d.k0 = c.k0 and d.s0 = c.s0 and d.o0 = c.o0
     where coalesce(d.summa, 0) <> coalesce(c.summa, 0)
  ), delta as (
    select x.*, exists (select 1 from public.t2_bux_davr z where z.kompaniya_id = p_kompaniya_id and z.holat = 'yopiq' and z.oy = date_trunc('month', x.sana)::date) as yopiq
      from delta0 x
  ), ins as (
    insert into public.t2_bux_provodka(kompaniya_id, sana, dt_kod, kt_kod, summa, kontragent_id, shartnoma_id, obyekt_id, manba_tur, manba_id, qism, tur, aktor_id)
    select p_kompaniya_id, sana, dt_kod, kt_kod, farq, kontragent_id, shartnoma_id, obyekt_id, manba_tur, manba_id, qism, 'avto', p_actor_id
      from delta where not p_dry and not (v_blok and yopiq)
    returning 1
  )
  select count(*) filter (where farq > 0 and not (v_blok and yopiq)), count(*) filter (where farq < 0 and not (v_blok and yopiq)),
         count(*) filter (where yopiq and not v_blok), count(*) filter (where yopiq and v_blok),
         coalesce(array_agg(distinct to_char(date_trunc('month', delta.sana), 'YYYY-MM')), array[]::text[])
    into v_yangi, v_storno, v_yopiq, v_otk, v_oylar
    from delta;
  return jsonb_build_object('yangi', v_yangi, 'storno', v_storno, 'yopiq_davr_ogohlantirish', v_yopiq, 'yopiq_davr_otkazildi', v_otk, 'oylar', to_jsonb(v_oylar));
end $$;

-- 7. Hujjat yorlig'i (drill-down): xarajat va qabul qilingan taqdim qo'shildi (faqat o'z kompaniyasi)
create or replace function public._t2_bux_hujjat_nomi(p_kompaniya_id bigint, p_tur text, p_id bigint) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select case
    when p_id is null then null
    when p_tur = 'forma3' then (select coalesce(nullif(btrim(coalesce(f.raqam, '')), ''), '#' || f.id) from public.t2_forma3 f where f.id = p_id and f.kompaniya_id = p_kompaniya_id)
    when p_tur = 'tolov' then (select coalesce(nullif(btrim(coalesce(t.hujjat_raqam, '')), ''), '#' || t.id) from public.t2_tolov t where t.id = p_id and t.kompaniya_id = p_kompaniya_id)
    when p_tur in ('ombor_kirim', 'qarz_yetkazish', 'qarz_ish', 'qarz_tolov', 'qarz_boshlangich') then
      (select coalesce(nullif(btrim(coalesce(a.hujjat_raqam, '')), ''), nullif(btrim(coalesce(a.nomi, '')), ''), '#' || a.id) from public.t2_qarz_asos a where a.id = p_id and a.kompaniya_id = p_kompaniya_id)
    when p_tur = 'xarajat' then (select coalesce(nullif(btrim(coalesce(x.hujjat_ref, '')), ''), '#' || x.id) from public.t2_xarajat x where x.id = p_id and x.kompaniya_id = p_kompaniya_id)
    when p_tur = 'taqdim' then (select coalesce(nullif(btrim(coalesce(q.nom, '')), ''), '#' || q.id) from public.t2_tomon_taqdim q where q.id = p_id and q.qabul_qiluvchi_kompaniya_id = p_kompaniya_id)
    else '#' || p_id end;
$$;

-- 8. Bo'lishi kerak to'plami (v2): V1 manbalari + xarajat + qabul qilingan taqdim. Qoidalar MA'LUMOT: kalit yo'q yoki Dt/Kt NULL bo'lsa provodka chiqmaydi.
create or replace function public._t2_bux_kerak_v2(p_kompaniya_id bigint) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_sh text; v_foiz numeric; v_base jsonb; v_x jsonb; v_t jsonb; v_tol jsonb := '[]'::jsonb;
begin
  v_sh := coalesce((select s.shablon from public.t2_bux_sozlama s where s.kompaniya_id = p_kompaniya_id), 'pudratchi');
  select qiymat into v_foiz from public.t2_bux_moslik where kompaniya_id = p_kompaniya_id and kalit = 'param.nds_foiz';
  v_foiz := coalesce(v_foiz, 12);
  v_base := public._t2_bux_kerak_avto(p_kompaniya_id);
  if v_sh = 'buyurtmachi' then
    -- xaridor tomon: o'z to'lovlari doim chiqim (V1 mantig'i asosiy shartnomani kirim deb oladi - bu pudratchi uchun)
    select coalesce(jsonb_agg(e), '[]'::jsonb) into v_base from jsonb_array_elements(v_base) e where e->>'manba_tur' <> 'tolov';
    select coalesce(jsonb_agg(to_jsonb(q)), '[]'::jsonb) into v_tol from (
      select 'tolov'::text as manba_tur, t.id as manba_id, 'asosiy'::text as qism, t.sana, m.dt_kod, m.kt_kod,
             case when t.tur = 'qaytarim' then -t.summa else t.summa end as summa,
             (select tm.kontragent_id from public.t2_shartnoma_tomon tm where tm.shartnoma_id = t.shartnoma_id and tm.kontragent_id is not null order by tm.tartib, tm.id limit 1) as kontragent_id,
             t.shartnoma_id, coalesce(t.obyekt_id, public._t2_bux_sh_obyekt(t.shartnoma_id)) as obyekt_id
        from public.t2_tolov t
        join public.t2_bux_moslik m on m.kompaniya_id = p_kompaniya_id and m.kalit = 'tolov.chiqim' and m.dt_kod is not null and m.kt_kod is not null
       where t.kompaniya_id = p_kompaniya_id and t.holat <> 'bekor' and t.summa is not null and t.summa <> 0) q;
  end if;
  select coalesce(jsonb_agg(to_jsonb(q)), '[]'::jsonb) into v_x from (
    select 'xarajat'::text as manba_tur, x.id as manba_id, 'asosiy'::text as qism, x.sana, m.dt_kod, m.kt_kod, x.summa,
           null::bigint as kontragent_id, x.shartnoma_id, x.obyekt_id
      from public.t2_xarajat x
      join public.t2_bux_moslik m on m.kompaniya_id = p_kompaniya_id and m.dt_kod is not null and m.kt_kod is not null
       and m.kalit = case x.kat when 'ЧЕЛ' then 'xarajat.chel' when 'МАШ' then 'xarajat.mash' when 'МАТ' then 'xarajat.mat'
                                when 'ОБ' then 'xarajat.ob' when 'SUB' then 'xarajat.sub' when 'OTK' then 'xarajat.otk' end
     where x.kompaniya_id = p_kompaniya_id and x.holat = 'faol' and x.summa is not null and x.summa <> 0) q;
  -- qabul qilingan taqdim (boshqa tomon tasdiqlagan Forma-2): FAQAT qabul qiluvchining o'z daftariga; shartnoma/obyekt (boshqa tenant id si) YOZILMAYDI
  with tq as (
    select q.id, coalesce(q.qaror_vaqti, q.taqdim_vaqti)::date as sana, q.summa as jami, round(q.summa / (1 + v_foiz / 100), 2) as net,
           (select kk.id from public.t2_kontragent kk join public.t2_kompaniya ke on ke.id = q.taqdim_etuvchi_kompaniya_id
             where kk.kompaniya_id = p_kompaniya_id and kk.inn is not null and kk.inn = ke.inn order by kk.id limit 1) as kid
      from public.t2_tomon_taqdim q
     where q.qabul_qiluvchi_kompaniya_id = p_kompaniya_id and q.holat = 'qabul' and q.resurs = 'f2' and q.summa is not null and q.summa <> 0
       and not exists (select 1 from public.t2_tomon_taqdim n where n.oldingi_taqdim_id = q.id and n.holat = 'qabul')
  ), qq as (
    select 'taqdim'::text as manba_tur, tq.id as manba_id, 'asosiy'::text as qism, tq.sana, m.dt_kod, m.kt_kod, tq.net as summa, tq.kid as kontragent_id,
           null::bigint as shartnoma_id, null::bigint as obyekt_id
      from tq join public.t2_bux_moslik m on m.kompaniya_id = p_kompaniya_id and m.kalit = 'taqdim.f2' and m.dt_kod is not null and m.kt_kod is not null where tq.net <> 0
    union all
    select 'taqdim', tq.id, 'nds_xarid', tq.sana, m.dt_kod, m.kt_kod, tq.jami - tq.net, tq.kid, null, null
      from tq join public.t2_bux_moslik m on m.kompaniya_id = p_kompaniya_id and m.kalit = 'taqdim.nds' and m.dt_kod is not null and m.kt_kod is not null where tq.jami - tq.net <> 0
  )
  select coalesce(jsonb_agg(to_jsonb(qq)), '[]'::jsonb) into v_t from qq;
  return v_base || v_tol || v_x || v_t;
end $$;

-- 9. Avto-provodka (v2 manbalar) va davr yopish: V1 imzosi o'zgarmaydi
create or replace function public.t2_bux_avto_provodka_v1(p_actor_id bigint, p_kompaniya_id bigint, p_dry boolean, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_prev jsonb; v_sync jsonb; v_res jsonb; v_f3 bigint; v_asos bigint; v_kat bigint;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  if not coalesce(p_dry, false) then
    select natija into v_prev from public.t2_onboarding_command_log where operation_id = p_operation_id;
    if found then return v_prev; end if;
  end if;
  perform public._t2_bux_ruxsat(p_kompaniya_id, p_actor_id, case when coalesce(p_dry, false) then 'accounting.read' else 'accounting.write' end);
  if not exists (select 1 from public.t2_bux_hisob where kompaniya_id = p_kompaniya_id) then
    return jsonb_build_object('ok', false, 'code', 'BOSHLANMAGAN', 'xabar', 'Avval hisoblar rejasini yarating (Boshlash).');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('t2_bux_sync:' || p_kompaniya_id, 0));
  v_sync := public._t2_bux_sync(p_kompaniya_id, p_actor_id,
    array['forma3', 'tolov', 'ombor_kirim', 'qarz_yetkazish', 'qarz_ish', 'qarz_tolov', 'qarz_boshlangich', 'xarajat', 'taqdim'], public._t2_bux_kerak_v2(p_kompaniya_id), coalesce(p_dry, false));
  select count(*) into v_f3 from public.t2_forma3 f where f.kompaniya_id = p_kompaniya_id and f.holat in ('tayyor', 'imzolangan') and f.sotuv_summa is null;
  select count(*) into v_asos from public.t2_qarz_asos a where a.kompaniya_id = p_kompaniya_id and a.holat = 'faol' and a.summa is null and not (a.tur = 'tolov' and a.tolov_id is not null);
  select count(*) into v_kat from public.t2_xarajat x where x.kompaniya_id = p_kompaniya_id and x.holat = 'faol' and x.summa is not null and x.kat is null;
  v_res := jsonb_build_object('ok', true, 'dry', coalesce(p_dry, false)) || v_sync
           || jsonb_build_object('f3_summasiz', v_f3, 'asos_summasiz', v_asos, 'xarajat_kategoriyasiz', v_kat);
  if not coalesce(p_dry, false) then
    perform public.t2_audit_yoz(p_kompaniya_id, 'bux_avto_provodka', 'buxgalteriya', null,
      format('yangi=%s storno=%s yopiq=%s otkazildi=%s', v_sync->>'yangi', v_sync->>'storno', v_sync->>'yopiq_davr_ogohlantirish', v_sync->>'yopiq_davr_otkazildi'), 'actor:' || p_actor_id, null);
    insert into public.t2_onboarding_command_log(operation_id, actor_id, command, natija) values (p_operation_id, p_actor_id, 'bux_avto_provodka_v1', v_res);
  end if;
  return v_res;
end $$;

create or replace function public.t2_bux_davr_v1(p_actor_id bigint, p_kompaniya_id bigint, p_oy date, p_amal text, p_tasdiq boolean, p_izoh text, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_prev jsonb; v_oy date; v_og jsonb := '[]'::jsonb; v_sync jsonb; v_res jsonb;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select natija into v_prev from public.t2_onboarding_command_log where operation_id = p_operation_id;
  if found then return v_prev; end if;
  perform public._t2_bux_ruxsat(p_kompaniya_id, p_actor_id, 'accounting.approve');
  if p_oy is null or p_amal is null or p_amal not in ('yop', 'och') then return jsonb_build_object('ok', false, 'code', 'DAVR_AMAL'); end if;
  v_oy := date_trunc('month', p_oy)::date;
  if p_amal = 'yop' then
    v_sync := public._t2_bux_sync(p_kompaniya_id, p_actor_id, array['forma3', 'tolov', 'ombor_kirim', 'qarz_yetkazish', 'qarz_ish', 'qarz_tolov', 'qarz_boshlangich', 'xarajat', 'taqdim'],
                                  public._t2_bux_kerak_v2(p_kompaniya_id), true);
    if to_char(v_oy, 'YYYY-MM') in (select jsonb_array_elements_text(v_sync->'oylar')) then
      v_og := v_og || jsonb_build_array(jsonb_build_object('kod', 'PROVODKASIZ_HUJJAT', 'xabar', 'Bu oyda hali provodkaga aylanmagan hujjatlar bor (Hujjatlardan yangilash).'));
    end if;
    if exists (select 1 from public.t2_bux_provodka p where p.kompaniya_id = p_kompaniya_id and p.sana < v_oy
                 and not exists (select 1 from public.t2_bux_davr z where z.kompaniya_id = p_kompaniya_id and z.holat = 'yopiq' and z.oy = date_trunc('month', p.sana)::date)) then
      v_og := v_og || jsonb_build_array(jsonb_build_object('kod', 'OLDINGI_OY_OCHIQ', 'xabar', 'Oldingi oylardan yopilmagani bor.'));
    end if;
    if jsonb_array_length(v_og) > 0 and not coalesce(p_tasdiq, false) then
      return jsonb_build_object('ok', false, 'code', 'OGOHLANTIRISH', 'ogohlantirishlar', v_og);
    end if;
  end if;
  insert into public.t2_bux_davr(kompaniya_id, oy, holat, aktor_id, izoh) values (p_kompaniya_id, v_oy, case when p_amal = 'yop' then 'yopiq' else 'ochiq' end, p_actor_id, nullif(left(btrim(coalesce(p_izoh, '')), 300), ''))
  on conflict (kompaniya_id, oy) do update set holat = excluded.holat, aktor_id = excluded.aktor_id, izoh = excluded.izoh, yangilandi = now();
  perform public.t2_audit_yoz(p_kompaniya_id, 'bux_davr', 'buxgalteriya', null, format('oy=%s amal=%s ogohlantirish=%s', v_oy, p_amal, jsonb_array_length(v_og)), 'actor:' || p_actor_id, null);
  v_res := jsonb_build_object('ok', true, 'oy', v_oy, 'holat', case when p_amal = 'yop' then 'yopiq' else 'ochiq' end, 'ogohlantirishlar', v_og);
  insert into public.t2_onboarding_command_log(operation_id, actor_id, command, natija) values (p_operation_id, p_actor_id, 'bux_davr_v1', v_res);
  return v_res;
end $$;

-- 10. Yangi RPC lar
-- O'QISH: sozlama (shablon, blok, T soni, mavjud shablonlar)
create or replace function public.t2_bux_sozlama_v1(p_kompaniya_id bigint, p_actor_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public._t2_bux_ruxsat(p_kompaniya_id, p_actor_id, 'accounting.read');
  return jsonb_build_object('ok', true,
    'shablon', coalesce((select s.shablon from public.t2_bux_sozlama s where s.kompaniya_id = p_kompaniya_id), 'pudratchi'),
    'davr_blok', coalesce((select s.davr_blok from public.t2_bux_sozlama s where s.kompaniya_id = p_kompaniya_id), true),
    'tekshirilsin', (select count(*) from public.t2_bux_hisob h where h.kompaniya_id = p_kompaniya_id and h.tekshirilsin),
    'shablonlar', (select coalesce(jsonb_agg(jsonb_build_object('shablon', x.shablon, 'qoidalar', x.n, 'yoqilgan', x.y) order by x.shablon), '[]'::jsonb)
                    from (select h.shablon, count(*) as n, count(*) filter (where h.dt_kod is not null) as y from public.t2_bux_shablon h group by h.shablon) x));
end $$;

-- O'QISH: hisob kartochkasi (карточка счёта): bitta hisob, davr, har provodka + yuruvchi saldo (Dt - Kt)
create or replace function public.t2_bux_kartochka_v1(p_kompaniya_id bigint, p_actor_id bigint, p_dan date default null, p_gacha date default null,
  p_kontragent_id bigint default null, p_shartnoma_id bigint default null, p_hisob text default null, p_limit integer default 500)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_dan date := coalesce(p_dan, date_trunc('month', current_date)::date); v_gacha date := coalesce(p_gacha, current_date);
        v_lim integer := least(greatest(coalesce(p_limit, 500), 1), 2000); v_och numeric; v_dt numeric; v_kt numeric; v_n bigint; v_q jsonb; v_h jsonb;
begin
  perform public._t2_bux_ruxsat(p_kompaniya_id, p_actor_id, 'accounting.read');
  if p_hisob is null or p_hisob !~ '^[0-9]{4}$' then return jsonb_build_object('ok', false, 'code', 'HISOB_KERAK'); end if;
  select jsonb_build_object('kod', h.kod, 'nom_uz', h.nom_uz, 'nom_ru', h.nom_ru, 'tur', h.tur) into v_h from public.t2_bux_hisob h where h.kompaniya_id = p_kompaniya_id and h.kod = p_hisob;
  select coalesce(sum(case when p.dt_kod = p_hisob then p.summa else -p.summa end) filter (where p.sana < v_dan), 0),
         coalesce(sum(p.summa) filter (where p.sana >= v_dan and p.dt_kod = p_hisob), 0),
         coalesce(sum(p.summa) filter (where p.sana >= v_dan and p.kt_kod = p_hisob), 0),
         count(*) filter (where p.sana >= v_dan)
    into v_och, v_dt, v_kt, v_n
    from public.t2_bux_provodka p
   where p.kompaniya_id = p_kompaniya_id and p.sana <= v_gacha and (p.dt_kod = p_hisob or p.kt_kod = p_hisob)
     and (p_kontragent_id is null or p.kontragent_id = p_kontragent_id) and (p_shartnoma_id is null or p.shartnoma_id = p_shartnoma_id);
  select coalesce(jsonb_agg(x.j order by x.sana, x.id), '[]'::jsonb) into v_q from (
    select r.id, r.sana, jsonb_build_object('id', r.id, 'sana', r.sana, 'korr', r.korr, 'dt', r.dt, 'kt', r.kt, 'saldo', v_och + r.yurish,
             'kontragent_id', r.kontragent_id, 'kontragent', k.nom, 'shartnoma_id', r.shartnoma_id, 'shartnoma_raqam', s.raqam,
             'manba_tur', r.manba_tur, 'manba_id', r.manba_id, 'hujjat', public._t2_bux_hujjat_nomi(p_kompaniya_id, r.manba_tur, r.manba_id),
             'qism', r.qism, 'tur', r.tur, 'izoh', r.izoh) as j
      from (
        select p.*, case when p.dt_kod = p_hisob then p.kt_kod else p.dt_kod end as korr,
               case when p.dt_kod = p_hisob then p.summa else 0::numeric end as dt, case when p.kt_kod = p_hisob then p.summa else 0::numeric end as kt,
               sum(case when p.dt_kod = p_hisob then p.summa else -p.summa end) over (order by p.sana, p.id) as yurish
          from public.t2_bux_provodka p
         where p.kompaniya_id = p_kompaniya_id and p.sana >= v_dan and p.sana <= v_gacha and (p.dt_kod = p_hisob or p.kt_kod = p_hisob)
           and (p_kontragent_id is null or p.kontragent_id = p_kontragent_id) and (p_shartnoma_id is null or p.shartnoma_id = p_shartnoma_id)
      ) r
      left join public.t2_kontragent k on k.id = r.kontragent_id and k.kompaniya_id = p_kompaniya_id
      left join public.t2_shartnoma s on s.id = r.shartnoma_id and s.kompaniya_id = p_kompaniya_id
     order by r.sana, r.id limit v_lim) x;
  return jsonb_build_object('ok', true, 'hisob', v_h, 'dan', v_dan, 'gacha', v_gacha, 'ochilish', v_och, 'dt', v_dt, 'kt', v_kt, 'yopilish', v_och + v_dt - v_kt,
                            'jami', v_n, 'limit', v_lim, 'qatorlar', v_q);
end $$;

-- YOZISH: shablon tanlash (qoidalar ko'chiriladi; mavjud qoidalar tegilmaydi)
create or replace function public.t2_bux_shablon_tanla_v1(p_actor_id bigint, p_kompaniya_id bigint, p_shablon text, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_prev jsonb; v_n integer; v_res jsonb;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select natija into v_prev from public.t2_onboarding_command_log where operation_id = p_operation_id;
  if found then return v_prev; end if;
  perform public._t2_bux_ruxsat(p_kompaniya_id, p_actor_id, 'accounting.approve');
  if p_shablon is null or not exists (select 1 from public.t2_bux_shablon h where h.shablon = p_shablon) then return jsonb_build_object('ok', false, 'code', 'SHABLON_YOQ'); end if;
  insert into public.t2_bux_sozlama(kompaniya_id, shablon) values (p_kompaniya_id, p_shablon)
  on conflict (kompaniya_id) do update set shablon = excluded.shablon, yangilandi = now();
  if exists (select 1 from public.t2_bux_hisob where kompaniya_id = p_kompaniya_id) then v_n := public._t2_bux_moslik_seed(p_kompaniya_id); else v_n := 0; end if;
  perform public.t2_audit_yoz(p_kompaniya_id, 'bux_shablon_tanla', 'buxgalteriya', null, format('shablon=%s qoshildi=%s', p_shablon, v_n), 'actor:' || p_actor_id, null);
  v_res := jsonb_build_object('ok', true, 'shablon', p_shablon, 'moslik_qoshildi', v_n);
  insert into public.t2_onboarding_command_log(operation_id, actor_id, command, natija) values (p_operation_id, p_actor_id, 'bux_shablon_tanla_v1', v_res);
  return v_res;
end $$;

-- YOZISH: yopiq davrga provodkani qat'iy bloklash yoqish/o'chirish
create or replace function public.t2_bux_davr_blok_v1(p_actor_id bigint, p_kompaniya_id bigint, p_blok boolean, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_prev jsonb; v_res jsonb;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select natija into v_prev from public.t2_onboarding_command_log where operation_id = p_operation_id;
  if found then return v_prev; end if;
  perform public._t2_bux_ruxsat(p_kompaniya_id, p_actor_id, 'accounting.approve');
  if p_blok is null then return jsonb_build_object('ok', false, 'code', 'BLOK_KERAK'); end if;
  insert into public.t2_bux_sozlama(kompaniya_id, davr_blok) values (p_kompaniya_id, p_blok)
  on conflict (kompaniya_id) do update set davr_blok = excluded.davr_blok, yangilandi = now();
  perform public.t2_audit_yoz(p_kompaniya_id, 'bux_davr_blok', 'buxgalteriya', null, format('blok=%s', p_blok), 'actor:' || p_actor_id, null);
  v_res := jsonb_build_object('ok', true, 'davr_blok', p_blok);
  insert into public.t2_onboarding_command_log(operation_id, actor_id, command, natija) values (p_operation_id, p_actor_id, 'bux_davr_blok_v1', v_res);
  return v_res;
end $$;

-- YOZISH: hisoblarni tasdiqlash (T belgisini olib tashlash) - buxgalter rasmiy reja bilan solishtirgach
create or replace function public.t2_bux_hisob_tasdiq_v1(p_actor_id bigint, p_kompaniya_id bigint, p_kodlar text[], p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_prev jsonb; v_n integer; v_res jsonb;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select natija into v_prev from public.t2_onboarding_command_log where operation_id = p_operation_id;
  if found then return v_prev; end if;
  perform public._t2_bux_ruxsat(p_kompaniya_id, p_actor_id, 'accounting.approve');
  if p_kodlar is null or cardinality(p_kodlar) = 0 or cardinality(p_kodlar) > 200 then return jsonb_build_object('ok', false, 'code', 'KODLAR_KERAK'); end if;
  update public.t2_bux_hisob set tekshirilsin = false, yangilandi = now() where kompaniya_id = p_kompaniya_id and kod = any (p_kodlar) and tekshirilsin;
  get diagnostics v_n = row_count;
  perform public.t2_audit_yoz(p_kompaniya_id, 'bux_hisob_tasdiq', 'buxgalteriya', null, format('n=%s', v_n), 'actor:' || p_actor_id, null);
  v_res := jsonb_build_object('ok', true, 'tasdiqlandi', v_n);
  insert into public.t2_onboarding_command_log(operation_id, actor_id, command, natija) values (p_operation_id, p_actor_id, 'bux_hisob_tasdiq_v1', v_res);
  return v_res;
end $$;

-- Grantlar (V1 dagidek: faqat service_role)
revoke all on function public._t2_bux_davr_blok_trg() from public, anon, authenticated;
revoke all on function public._t2_bux_kerak_v2(bigint) from public, anon, authenticated;
revoke all on function public.t2_bux_sozlama_v1(bigint, bigint) from public, anon, authenticated;
revoke all on function public.t2_bux_kartochka_v1(bigint, bigint, date, date, bigint, bigint, text, integer) from public, anon, authenticated;
revoke all on function public.t2_bux_shablon_tanla_v1(bigint, bigint, text, uuid) from public, anon, authenticated;
revoke all on function public.t2_bux_davr_blok_v1(bigint, bigint, boolean, uuid) from public, anon, authenticated;
revoke all on function public.t2_bux_hisob_tasdiq_v1(bigint, bigint, text[], uuid) from public, anon, authenticated;
grant execute on function public.t2_bux_sozlama_v1(bigint, bigint) to service_role;
grant execute on function public.t2_bux_kartochka_v1(bigint, bigint, date, date, bigint, bigint, text, integer) to service_role;
grant execute on function public.t2_bux_shablon_tanla_v1(bigint, bigint, text, uuid) to service_role;
grant execute on function public.t2_bux_davr_blok_v1(bigint, bigint, boolean, uuid) to service_role;
grant execute on function public.t2_bux_hisob_tasdiq_v1(bigint, bigint, text[], uuid) to service_role;

