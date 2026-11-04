-- T2-BUXGALTERIYA-001 (1/2) - Buxgalteriya MVP v1: sxema (hisoblar rejasi, moslik, o'zgarmas jurnal, davr yopish).
-- Dizayn: docs/architecture/BUXGALTERIYA_V1.md. DUBLIKAT YASALMAYDI: hujjatlar (t2_forma3, t2_tolov, t2_qarz_asos, t2_shartnoma,
-- t2_kontragent) o'z joyida qoladi; jurnal faqat manba id si bilan murojaat qiladi (hujjat mazmuni nusxalanmaydi - baza hajmi chegarada).
-- Qoidalar: summa QQS bilan keladi, jurnalda asosiy + QQS qismlari; minus ruxsat (storno); NULL summa provodka bermaydi (NULL != 0).
begin;

-- 1. Hisoblar rejasi (kompaniya darajasi, tahrirlanadi)
create table if not exists public.t2_bux_hisob (
  kompaniya_id bigint not null references public.t2_kompaniya(id) on delete cascade,
  kod text not null check (kod ~ '^[0-9]{4}$'),
  nom_uz text not null,
  nom_ru text not null,
  tur text not null check (tur in ('aktiv', 'passiv', 'aktiv_passiv', 'daromad', 'xarajat', 'balansdan_tashqari')),
  kontragent_analitika boolean not null default false,
  faol boolean not null default true,
  standart boolean not null default false,
  yangilandi timestamptz not null default now(),
  primary key (kompaniya_id, kod)
);
comment on table public.t2_bux_hisob is 'Hisoblar rejasi (НСБУ № 21 asosida namuna, kompaniya o''zi tahrirlaydi). Kod o''zgarmaydi; ishlatilgan hisob o''chirilmaydi, faqat faolsizlanadi.';
comment on column public.t2_bux_hisob.kontragent_analitika is 'true - bu hisob kontragent bo''yicha yuritiladi (4010, 6010 ...): «Kontragent bilan hisob-kitob» shu hisoblardan.';

-- 2. Provodka qoidalari (hujjat turi -> Dt/Kt), buxgalter o'zgartira oladi
create table if not exists public.t2_bux_moslik (
  kompaniya_id bigint not null references public.t2_kompaniya(id) on delete cascade,
  kalit text not null check (kalit ~ '^[a-z0-9_]+\.[a-z0-9_]+$'),
  dt_kod text,
  kt_kod text,
  qiymat numeric,
  izoh text,
  yangilandi timestamptz not null default now(),
  primary key (kompaniya_id, kalit)
);
comment on table public.t2_bux_moslik is 'Avto-provodka qoidalari: kalit (sotuv.realizatsiya, tolov.kirim, ...) -> Dt/Kt hisob; param.* qatorlarda qiymat (masalan param.nds_foiz).';

-- 3. Jurnal (O'ZGARMAS: faqat INSERT; tuzatish - storno / yangi provodka)
create table if not exists public.t2_bux_provodka (
  id bigint generated always as identity primary key,
  kompaniya_id bigint not null references public.t2_kompaniya(id) on delete cascade,
  sana date not null,
  dt_kod text not null,
  kt_kod text not null,
  summa numeric(18, 2) not null check (summa <> 0),
  kontragent_id bigint,
  shartnoma_id bigint,
  obyekt_id bigint,
  manba_tur text not null,
  manba_id bigint,
  qism text not null default 'asosiy' check (qism in ('asosiy', 'nds_sotuv', 'nds_xarid')),
  tur text not null check (tur in ('avto', 'qolda', 'storno')),
  storno_id bigint references public.t2_bux_provodka(id),
  izoh text,
  aktor_id bigint,
  yaratildi timestamptz not null default now(),
  check (dt_kod <> kt_kod),
  check (dt_kod ~ '^[0-9]{4}$' and kt_kod ~ '^[0-9]{4}$')
);
comment on table public.t2_bux_provodka is 'Provodkalar jurnali (o''zgarmas). Dt/Kt + summa (minus = storno) + analitika; hujjat faqat manba_tur+manba_id orqali.';
create index if not exists t2_bux_provodka_sana_idx on public.t2_bux_provodka(kompaniya_id, sana);
create index if not exists t2_bux_provodka_manba_idx on public.t2_bux_provodka(kompaniya_id, manba_tur, manba_id);
create index if not exists t2_bux_provodka_kontragent_idx on public.t2_bux_provodka(kompaniya_id, kontragent_id, sana) where kontragent_id is not null;
create unique index if not exists t2_bux_provodka_storno_uq on public.t2_bux_provodka(storno_id) where storno_id is not null;

create or replace function public._t2_bux_provodka_ozgarmas() returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  -- kompaniya o'chirilganda (FK cascade) o'chirishga ruxsat; qolgan har qanday UPDATE/DELETE - taqiq.
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then return old; end if;
  raise exception 'BUX_PROVODKA_OZGARMAS: provodka tahrirlanmaydi yoki o''chirilmaydi - storno qiling' using errcode = '42501';
end $$;
drop trigger if exists t2_bux_provodka_ozgarmas_trg on public.t2_bux_provodka;
create trigger t2_bux_provodka_ozgarmas_trg before update or delete on public.t2_bux_provodka
  for each row execute function public._t2_bux_provodka_ozgarmas();

-- 4. Davr yopish (ogohlantirish asosida; qat'iy blok yo'q)
create table if not exists public.t2_bux_davr (
  kompaniya_id bigint not null references public.t2_kompaniya(id) on delete cascade,
  oy date not null check (oy = date_trunc('month', oy)::date),
  holat text not null default 'yopiq' check (holat in ('yopiq', 'ochiq')),
  aktor_id bigint,
  izoh text,
  yangilandi timestamptz not null default now(),
  primary key (kompaniya_id, oy)
);
comment on table public.t2_bux_davr is 'Oylik davr holati. yopiq oyga provodka tushsa - ogohlantirish (bloklanmaydi).';

-- 5. t2_tolov.manba: bank ko'chirma importi qiymati
alter table public.t2_tolov drop constraint if exists t2_tolov_manba_check;
alter table public.t2_tolov add constraint t2_tolov_manba_check check (manba is null or manba in ('qolda', 'sverka_1c', 'bank_import'));
comment on column public.t2_tolov.manba is 'qolda - qo''lda kiritilgan; sverka_1c - 1C akt-sverka importi; bank_import - bank ko''chirmasi importi (Buxgalteriya).';

alter table public.t2_bux_hisob enable row level security;
alter table public.t2_bux_moslik enable row level security;
alter table public.t2_bux_provodka enable row level security;
alter table public.t2_bux_davr enable row level security;
revoke all on public.t2_bux_hisob, public.t2_bux_moslik, public.t2_bux_provodka, public.t2_bux_davr from anon, authenticated;
revoke all on sequence public.t2_bux_provodka_id_seq from anon, authenticated;

-- 6. Standart reja (MA'LUMOT) va standart moslik - kompaniyaga ko'chiriladi, keyin tahrirlanadi. Kodlar buxgalter tomonidan rasmiy reja bilan tasdiqlanadi.
create or replace function public._t2_bux_hisob_seed(p_kompaniya_id bigint) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_n integer;
begin
  insert into public.t2_bux_hisob(kompaniya_id, kod, nom_uz, nom_ru, tur, kontragent_analitika, standart)
  select p_kompaniya_id, v.kod, v.nom_uz, v.nom_ru, v.tur, v.ka, true
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

create or replace function public._t2_bux_moslik_seed(p_kompaniya_id bigint) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_n integer;
begin
  insert into public.t2_bux_moslik(kompaniya_id, kalit, dt_kod, kt_kod, qiymat, izoh)
  select p_kompaniya_id, v.kalit, v.dt, v.kt, v.q, v.izoh
    from (values
      ('sotuv.realizatsiya', '4010', '9010', null::numeric, 'Forma-3 (счёт-фактура): realizatsiya, QQS siz'),
      ('sotuv.nds', '4010', '6410', null, 'Forma-3: chiqarilgan QQS'),
      ('xarid.ombor', '1010', '6010', null, 'Ombor kirimi (yetkazib berish), QQS siz'),
      ('xarid.ish', '2010', '6010', null, 'Subpudrat / xizmat dalolatnomasi, QQS siz'),
      ('xarid.nds', '4410', '6010', null, 'Xarid QQS i (hisobga olinadigan)'),
      ('tolov.kirim', '5110', '4010', null, 'Buyurtmachidan kelgan to''lov'),
      ('tolov.chiqim', '6010', '5110', null, 'Kontragentga to''langan to''lov'),
      ('boshlangich.kreditor', '8810', '6010', null, 'Kreditor boshlang''ich qoldig''i'),
      ('ish_haqi.hisoblash', '2010', '6710', null, 'KADRLAR (kelajak): ish haqi hisoblandi'),
      ('ish_haqi.tolash', '6710', '5110', null, 'KADRLAR (kelajak): ish haqi to''landi'),
      ('param.nds_foiz', null, null, 12::numeric, 'QQS stavkasi (%), hujjatda foiz bo''lmasa shu')
    ) as v(kalit, dt, kt, q, izoh)
  on conflict (kompaniya_id, kalit) do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

revoke all on function public._t2_bux_provodka_ozgarmas() from public, anon, authenticated;
revoke all on function public._t2_bux_hisob_seed(bigint) from public, anon, authenticated;
revoke all on function public._t2_bux_moslik_seed(bigint) from public, anon, authenticated;

commit;
