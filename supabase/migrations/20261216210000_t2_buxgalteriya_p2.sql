-- T2-BUXGALTERIYA-003 - Buxgalteriya 2-bosqich (ADR docs/architecture/BUXGALTERIYA_1C_ORNIGA.md §5 P2). 20261216200000 ustiga.
--   * t2_bux_pul_korinish_v1   - pul ko'rinishlari JURNALDAN: obyekt/shartnoma kesimida daromad, xarajat (toifa bo'yicha), tushgan, qarz, kreditor, pul
--   * t2_bux_hisobot_qator + t2_bux_hisobot_v1 - balans va foyda-zarar: qator -> hisoblar xaritasi MA'LUMOT (kompaniya o'zgartira oladi), hammasi T
--   * t2_bux_saldo_import_v1 / t2_bux_saldo_bekor_v1 - 1C ОСВ eksportidan boshlang'ich qoldiq: ko'rik (dry) + bitta idempotent partiya + storno
--   * t2_bux_tannarx_v1        - davr yopishda obyekt xarajati (2010) -> sotilgan tannarx (9110): qoida ma'lumot, ko'rik, delta (storno = bekor)
-- Hamma funksiya security definer, a'zolik + accounting.* tekshiruvi, faqat service_role. Pul hisobi: V1 dagi jami/ayirma; yangi mahalliy yaxlitlash yo'q.
-- T - tekshirilsin (buxgalter): balans/foyda-zarar qatorlari xaritasi, tannarx usuli, qarshi hisob (8810).

-- 1. Hisobot qatorlari xaritasi (kompaniya_id NULL = standart shablon; kompaniyaning o'z qatorlari bo'lsa shu forma uchun faqat ular ishlatiladi)
create table if not exists public.t2_bux_hisobot_qator (
  id integer generated always as identity primary key,
  kompaniya_id bigint references public.t2_kompaniya(id) on delete cascade,
  forma text not null check (forma in ('balans', 'foyda_zarar')),
  kod text not null check (kod ~ '^[A-Z0-9_]{1,20}$'),
  tartib integer not null,
  nom_uz text not null,
  nom_ru text not null,
  tur text not null check (tur in ('hisob', 'jami')),
  hisoblar text[] not null default '{}',
  jami_kodlar text[] not null default '{}',
  ishora smallint not null default 1 check (ishora in (1, -1)),
  tekshirilsin boolean not null default true
);
create unique index if not exists t2_bux_hisobot_qator_uq on public.t2_bux_hisobot_qator (coalesce(kompaniya_id, 0::bigint), forma, kod);
comment on table public.t2_bux_hisobot_qator is 'Balans / foyda-zarar qatori: tur=hisob -> ishora x sum(Dt-Kt) shu hisoblar bo''yicha; tur=jami -> ko''rsatilgan qatorlar yig''indisi. kompaniya_id NULL = standart (T - tekshirilsin).';
alter table public.t2_bux_hisobot_qator enable row level security;
revoke all on public.t2_bux_hisobot_qator from anon, authenticated;

insert into public.t2_bux_hisobot_qator(forma, kod, tartib, nom_uz, nom_ru, tur, hisoblar, jami_kodlar, ishora)
select v.forma, v.kod, v.tartib, v.nom_uz, v.nom_ru, v.tur, string_to_array(v.hisoblar, ','), string_to_array(v.jami, ','), v.ishora
  from (values
    ('balans', 'A1', 10, 'Asosiy vositalar (sof)', 'Основные средства (нетто)', 'hisob', '0100,0200', '', 1),
    ('balans', 'A2', 20, 'Kapital qo''yilmalar', 'Капитальные вложения', 'hisob', '0800', '', 1),
    ('balans', 'A3', 30, 'Zaxiralar (materiallar, tayyor mahsulot)', 'Запасы (материалы, готовая продукция)', 'hisob', '1010,1090,2810', '', 1),
    ('balans', 'A4', 40, 'Tugallanmagan ishlab chiqarish (obyekt xarajatlari)', 'Незавершённое производство', 'hisob', '2010,2510', '', 1),
    ('balans', 'A5', 50, 'Debitorlar va berilgan avanslar', 'Дебиторы и выданные авансы', 'hisob', '4010,4310,4410', '', 1),
    ('balans', 'A6', 60, 'Pul mablag''lari', 'Денежные средства', 'hisob', '5010,5110,5210', '', 1),
    ('balans', 'A_JAMI', 70, 'AKTIV JAMI', 'ИТОГО АКТИВ', 'jami', '', 'A1,A2,A3,A4,A5,A6', 1),
    ('balans', 'P1', 110, 'Yetkazuvchi va pudratchilarga qarz', 'Задолженность поставщикам и подрядчикам', 'hisob', '6010', '', -1),
    ('balans', 'P2', 120, 'Olingan avanslar', 'Полученные авансы', 'hisob', '6310', '', -1),
    ('balans', 'P3', 130, 'Byudjetga qarz (QQS)', 'Задолженность бюджету (НДС)', 'hisob', '6410', '', -1),
    ('balans', 'P4', 140, 'Ish haqi bo''yicha qarz', 'Задолженность по оплате труда', 'hisob', '6710', '', -1),
    ('balans', 'P5', 150, 'Qisqa muddatli kreditlar', 'Краткосрочные кредиты', 'hisob', '6810', '', -1),
    ('balans', 'P6', 160, 'Ustav kapitali', 'Уставный капитал', 'hisob', '8310', '', -1),
    ('balans', 'P7', 170, 'Taqsimlanmagan foyda', 'Нераспределённая прибыль', 'hisob', '8810', '', -1),
    ('balans', 'P8', 180, 'Joriy davr moliyaviy natijasi', 'Финансовый результат текущего периода', 'hisob', '9010,9110,9410,9420,9810,9910', '', -1),
    ('balans', 'P_JAMI', 190, 'PASSIV JAMI', 'ИТОГО ПАССИВ', 'jami', '', 'P1,P2,P3,P4,P5,P6,P7,P8', 1),
    ('foyda_zarar', 'R1', 10, 'Realizatsiyadan daromad', 'Доходы от реализации', 'hisob', '9010', '', -1),
    ('foyda_zarar', 'R2', 20, 'Sotilgan ishlar tannarxi', 'Себестоимость реализованных работ', 'hisob', '9110', '', -1),
    ('foyda_zarar', 'R3', 30, 'YALPI FOYDA', 'ВАЛОВАЯ ПРИБЫЛЬ', 'jami', '', 'R1,R2', 1),
    ('foyda_zarar', 'R4', 40, 'Sotish xarajatlari', 'Расходы по реализации', 'hisob', '9410', '', -1),
    ('foyda_zarar', 'R5', 50, 'Ma''muriy xarajatlar', 'Административные расходы', 'hisob', '9420', '', -1),
    ('foyda_zarar', 'R6', 60, 'ASOSIY FAOLIYAT FOYDASI', 'ПРИБЫЛЬ ОТ ОСНОВНОЙ ДЕЯТЕЛЬНОСТИ', 'jami', '', 'R3,R4,R5', 1),
    ('foyda_zarar', 'R7', 70, 'Foyda solig''i', 'Налог на прибыль', 'hisob', '9810', '', -1),
    ('foyda_zarar', 'R8', 80, 'SOF FOYDA', 'ЧИСТАЯ ПРИБЫЛЬ', 'jami', '', 'R6,R7', 1)
  ) as v(forma, kod, tartib, nom_uz, nom_ru, tur, hisoblar, jami, ishora)
on conflict (coalesce(kompaniya_id, 0::bigint), forma, kod) do nothing;

-- Tannarx qoidasi (pudratchi shabloni): Dt - sotilgan tannarx, Kt - obyekt xarajati hisobi. dt/kt NULL qilinsa qadam o'chiriladi.
insert into public.t2_bux_shablon(shablon, kalit, dt_kod, kt_kod, qiymat, izoh)
values ('pudratchi', 'tannarx.yopish', '9110', '2010', null, 'Davr yopishda: daromad tan olingan obyektning 2010 qoldig''i -> sotilgan tannarx. T - usul (hammasi/ulushli) buxgalter bilan')
on conflict (shablon, kalit) do nothing;

-- ICHKI: kompaniya moslikida kalit yo'q bo'lsa, shablonidan ko'chiradi (eski kompaniyalar uchun)
create or replace function public._t2_bux_qoida_kafolat(p_kompaniya_id bigint, p_kalit text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.t2_bux_moslik(kompaniya_id, kalit, dt_kod, kt_kod, qiymat, izoh)
  select p_kompaniya_id, h.kalit, h.dt_kod, h.kt_kod, h.qiymat, h.izoh
    from public.t2_bux_shablon h
   where h.kalit = p_kalit and h.shablon = coalesce((select s.shablon from public.t2_bux_sozlama s where s.kompaniya_id = p_kompaniya_id), 'pudratchi')
  on conflict (kompaniya_id, kalit) do nothing;
end $$;

-- 2. O'QISH: pul ko'rinishi JURNALDAN (Foyda/zarar, qarzdorlik, pul oqimi uchun yagona manba)
create or replace function public.t2_bux_pul_korinish_v1(p_kompaniya_id bigint, p_actor_id bigint, p_dan date default null, p_gacha date default null)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_dan date := coalesce(p_dan, date '1900-01-01'); v_gacha date := coalesce(p_gacha, date '9999-12-31'); v_bor boolean; v_q jsonb; v_j jsonb;
begin
  perform public._t2_bux_ruxsat(p_kompaniya_id, p_actor_id, 'accounting.read');
  v_bor := exists (select 1 from public.t2_bux_provodka where kompaniya_id = p_kompaniya_id);
  with p as (
    select pr.obyekt_id, pr.shartnoma_id, pr.sana, pr.dt_kod, pr.kt_kod, pr.summa, pr.qism, pr.manba_tur,
           case when pr.dt_kod = '2010' then pr.summa when pr.kt_kod = '2010' and pr.manba_tur <> 'tannarx' then -pr.summa else 0::numeric end as xar,
           case when pr.manba_tur = 'xarajat' then x.kat when pr.manba_tur = 'qarz_ish' then 'SUB' end as kat
      from public.t2_bux_provodka pr
      left join public.t2_xarajat x on pr.manba_tur = 'xarajat' and x.id = pr.manba_id and x.kompaniya_id = p_kompaniya_id
     where pr.kompaniya_id = p_kompaniya_id and pr.sana <= v_gacha
  ), g as (
    select p.obyekt_id, p.shartnoma_id,
      coalesce(sum(case when p.kt_kod = '9010' then p.summa when p.dt_kod = '9010' then -p.summa else 0 end) filter (where p.sana >= v_dan), 0) as daromad,
      coalesce(sum(case when p.kt_kod = '6410' and p.qism = 'nds_sotuv' then p.summa else 0 end) filter (where p.sana >= v_dan), 0) as daromad_qqs,
      coalesce(sum(p.xar) filter (where p.sana >= v_dan), 0) as xarajat,
      coalesce(sum(p.xar) filter (where p.sana >= v_dan and p.kat = 'ЧЕЛ'), 0) as xarajat_chel,
      coalesce(sum(p.xar) filter (where p.sana >= v_dan and p.kat = 'МАТ'), 0) as xarajat_mat,
      coalesce(sum(p.xar) filter (where p.sana >= v_dan and p.kat = 'МАШ'), 0) as xarajat_mash,
      coalesce(sum(p.xar) filter (where p.sana >= v_dan and p.kat = 'ОБ'), 0) as xarajat_ob,
      coalesce(sum(p.xar) filter (where p.sana >= v_dan and p.kat = 'SUB'), 0) as xarajat_sub,
      coalesce(sum(case when p.dt_kod = '9110' then p.summa when p.kt_kod = '9110' then -p.summa else 0 end) filter (where p.sana >= v_dan), 0) as tannarx,
      coalesce(sum(case when p.dt_kod in ('9410', '9420') then p.summa when p.kt_kod in ('9410', '9420') then -p.summa else 0 end) filter (where p.sana >= v_dan), 0) as davr_xarajat,
      coalesce(sum(p.summa) filter (where p.sana >= v_dan and p.kt_kod = '4010' and p.manba_tur = 'tolov'), 0) as tushgan,
      coalesce(sum(case when p.dt_kod = '4010' then p.summa when p.kt_kod = '4010' then -p.summa else 0 end), 0) as qarz,
      coalesce(sum(case when p.kt_kod = '6010' then p.summa when p.dt_kod = '6010' then -p.summa else 0 end), 0) as kreditor,
      coalesce(sum(case when p.dt_kod in ('5010', '5110') then p.summa when p.kt_kod in ('5010', '5110') then -p.summa else 0 end), 0) as pul
      from p group by p.obyekt_id, p.shartnoma_id
  )
  select coalesce(jsonb_agg(to_jsonb(g) order by g.obyekt_id nulls last, g.shartnoma_id nulls last), '[]'::jsonb),
         jsonb_build_object('daromad', coalesce(sum(g.daromad), 0), 'xarajat', coalesce(sum(g.xarajat), 0), 'tannarx', coalesce(sum(g.tannarx), 0),
           'davr_xarajat', coalesce(sum(g.davr_xarajat), 0), 'tushgan', coalesce(sum(g.tushgan), 0), 'qarz', coalesce(sum(g.qarz), 0),
           'kreditor', coalesce(sum(g.kreditor), 0), 'pul', coalesce(sum(g.pul), 0))
    into v_q, v_j from g;
  return jsonb_build_object('ok', true, 'manba', 'jurnal', 'bor', v_bor, 'dan', p_dan, 'gacha', p_gacha, 'qatorlar', v_q, 'jami', v_j);
end $$;

-- 3. O'QISH: balans / foyda-zarar jurnaldan (qatorlar xaritasi ma'lumot)
create or replace function public.t2_bux_hisobot_v1(p_kompaniya_id bigint, p_actor_id bigint, p_dan date default null, p_gacha date default null, p_forma text default 'balans')
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_forma text := coalesce(p_forma, 'balans'); v_dan date := coalesce(p_dan, date '1900-01-01'); v_gacha date := coalesce(p_gacha, current_date);
        v_oz boolean; v_net jsonb; v_val jsonb := '{}'::jsonb; v_q jsonb := '[]'::jsonb; v_x numeric; r record; v_xar text[]; v_map text[] := array[]::text[]; v_tek numeric;
begin
  perform public._t2_bux_ruxsat(p_kompaniya_id, p_actor_id, 'accounting.read');
  if v_forma not in ('balans', 'foyda_zarar') then return jsonb_build_object('ok', false, 'code', 'FORMA_NOTOGRI'); end if;
  v_oz := exists (select 1 from public.t2_bux_hisobot_qator q where q.kompaniya_id = p_kompaniya_id and q.forma = v_forma);
  select coalesce(jsonb_object_agg(z.kod, z.net), '{}'::jsonb) into v_net from (
    select a.kod, sum(a.d) as net from (
      select pr.dt_kod as kod, pr.summa as d from public.t2_bux_provodka pr
       where pr.kompaniya_id = p_kompaniya_id and pr.sana <= v_gacha and (v_forma = 'balans' or pr.sana >= v_dan)
      union all
      select pr.kt_kod, -pr.summa from public.t2_bux_provodka pr
       where pr.kompaniya_id = p_kompaniya_id and pr.sana <= v_gacha and (v_forma = 'balans' or pr.sana >= v_dan)
    ) a group by a.kod) z;
  for r in select * from public.t2_bux_hisobot_qator q
            where q.forma = v_forma and ((v_oz and q.kompaniya_id = p_kompaniya_id) or (not v_oz and q.kompaniya_id is null)) order by q.tartib loop
    if r.tur = 'hisob' then
      v_x := r.ishora * coalesce((select sum((v_net ->> h)::numeric) from unnest(r.hisoblar) h), 0);
      v_map := v_map || r.hisoblar;
    else
      v_x := coalesce((select sum((v_val ->> c)::numeric) from unnest(r.jami_kodlar) c), 0);
    end if;
    v_val := v_val || jsonb_build_object(r.kod, v_x);
    v_q := v_q || jsonb_build_array(jsonb_build_object('kod', r.kod, 'nom_uz', r.nom_uz, 'nom_ru', r.nom_ru, 'tur', r.tur, 'hisoblar', to_jsonb(r.hisoblar),
                                    'summa', v_x, 'tekshirilsin', r.tekshirilsin));
  end loop;
  select coalesce(array_agg(e.key order by e.key), array[]::text[]) into v_xar from jsonb_each_text(v_net) e where e.value::numeric <> 0 and not (e.key = any (v_map));
  if v_forma = 'balans' and v_val ? 'A_JAMI' and v_val ? 'P_JAMI' then v_tek := (v_val ->> 'A_JAMI')::numeric - (v_val ->> 'P_JAMI')::numeric; end if;
  return jsonb_build_object('ok', true, 'manba', 'jurnal', 'forma', v_forma, 'dan', case when v_forma = 'balans' then null else v_dan end, 'gacha', v_gacha,
    'oz_xarita', v_oz, 'qatorlar', v_q, 'xaritalanmagan', to_jsonb(v_xar), 'tekshiruv', v_tek);
end $$;

-- YOZISH: hisobot qatorlari xaritasini almashtirish (kompaniyaning o'zi uchun). Bo'sh massiv = standartga qaytish.
create or replace function public.t2_bux_hisobot_saqla_v1(p_actor_id bigint, p_kompaniya_id bigint, p_forma text, p_qatorlar jsonb, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_prev jsonb; v_n integer := 0; v_res jsonb;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select natija into v_prev from public.t2_onboarding_command_log where operation_id = p_operation_id;
  if found then return v_prev; end if;
  perform public._t2_bux_ruxsat(p_kompaniya_id, p_actor_id, 'accounting.approve');
  if p_forma is null or p_forma not in ('balans', 'foyda_zarar') then return jsonb_build_object('ok', false, 'code', 'FORMA_NOTOGRI'); end if;
  if p_qatorlar is not null and (jsonb_typeof(p_qatorlar) <> 'array' or jsonb_array_length(p_qatorlar) > 100) then return jsonb_build_object('ok', false, 'code', 'QATORLAR_NOTOGRI'); end if;
  if exists (select 1 from jsonb_array_elements(coalesce(p_qatorlar, '[]'::jsonb)) e
              where coalesce(e ->> 'kod', '') !~ '^[A-Z0-9_]{1,20}$' or coalesce(e ->> 'tur', '') not in ('hisob', 'jami')
                 or exists (select 1 from jsonb_array_elements_text(coalesce(e -> 'hisoblar', '[]'::jsonb)) h where h !~ '^[0-9]{4}$')) then
    return jsonb_build_object('ok', false, 'code', 'QATOR_NOTOGRI');
  end if;
  delete from public.t2_bux_hisobot_qator where kompaniya_id = p_kompaniya_id and forma = p_forma;
  insert into public.t2_bux_hisobot_qator(kompaniya_id, forma, kod, tartib, nom_uz, nom_ru, tur, hisoblar, jami_kodlar, ishora, tekshirilsin)
  select p_kompaniya_id, p_forma, e ->> 'kod', coalesce((e ->> 'tartib')::integer, 0), left(coalesce(nullif(e ->> 'nom_uz', ''), e ->> 'kod'), 200),
         left(coalesce(nullif(e ->> 'nom_ru', ''), e ->> 'kod'), 200), e ->> 'tur',
         array(select jsonb_array_elements_text(coalesce(e -> 'hisoblar', '[]'::jsonb))), array(select jsonb_array_elements_text(coalesce(e -> 'jami_kodlar', '[]'::jsonb))),
         case when (e ->> 'ishora') = '-1' then -1 else 1 end, false
    from jsonb_array_elements(coalesce(p_qatorlar, '[]'::jsonb)) e;
  get diagnostics v_n = row_count;
  perform public.t2_audit_yoz(p_kompaniya_id, 'bux_hisobot_saqla', 'buxgalteriya', null, format('forma=%s n=%s', p_forma, v_n), 'actor:' || p_actor_id, null);
  v_res := jsonb_build_object('ok', true, 'forma', p_forma, 'qator', v_n);
  insert into public.t2_onboarding_command_log(operation_id, actor_id, command, natija) values (p_operation_id, p_actor_id, 'bux_hisobot_saqla_v1', v_res);
  return v_res;
end $$;

-- 4. YOZISH: boshlang'ich qoldiq importi (ko'rik + bitta partiya). qatorlar: [{hisob, dt, kt, kontragent_id?, shartnoma_id?, obyekt_id?}] (ustun moslash - mijozda)
create or replace function public.t2_bux_saldo_import_v1(p_actor_id bigint, p_kompaniya_id bigint, p_sana date, p_qarshi text, p_qatorlar jsonb, p_dry boolean, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_prev jsonb; v_qarshi text := coalesce(nullif(btrim(p_qarshi), ''), '8810'); v_err jsonb := '[]'::jsonb; v_ok jsonb := '[]'::jsonb; v_n integer := 0; v_skip integer := 0;
  v_dt numeric := 0; v_kt numeric := 0; e record; v_d numeric; v_k numeric; v_net numeric; v_h text; v_res jsonb; v_ins integer; v_ogoh integer := 0;
  v_kid bigint; v_sid bigint; v_oid bigint;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  if not coalesce(p_dry, false) then
    select natija into v_prev from public.t2_onboarding_command_log where operation_id = p_operation_id;
    if found then return v_prev; end if;
  end if;
  perform public._t2_bux_ruxsat(p_kompaniya_id, p_actor_id, case when coalesce(p_dry, false) then 'accounting.write' else 'accounting.approve' end);
  if p_sana is null then return jsonb_build_object('ok', false, 'code', 'SANA_KERAK'); end if;
  if p_qatorlar is null or jsonb_typeof(p_qatorlar) <> 'array' or jsonb_array_length(p_qatorlar) = 0 or jsonb_array_length(p_qatorlar) > 2000 then
    return jsonb_build_object('ok', false, 'code', 'QATORLAR_1_2000');
  end if;
  if (select count(*) from public.t2_bux_hisob h where h.kompaniya_id = p_kompaniya_id and h.faol and h.kod = v_qarshi) <> 1 then
    return jsonb_build_object('ok', false, 'code', 'QARSHI_HISOB_YOQ', 'xabar', 'Qarshi hisob (muvozanat hisobi) rejada faol bo''lishi kerak.');
  end if;
  for e in select x.j, x.n from jsonb_array_elements(p_qatorlar) with ordinality as x(j, n) loop
    v_h := btrim(coalesce(e.j ->> 'hisob', ''));
    if (coalesce(e.j ->> 'dt', '') <> '' and (e.j ->> 'dt') !~ '^-?[0-9]+(\.[0-9]+)?$') or (coalesce(e.j ->> 'kt', '') <> '' and (e.j ->> 'kt') !~ '^-?[0-9]+(\.[0-9]+)?$') then
      if jsonb_array_length(v_err) < 50 then v_err := v_err || jsonb_build_array(jsonb_build_object('qator', e.n, 'kod', 'SUMMA_NOTOGRI')); end if; continue;
    end if;
    v_d := coalesce(nullif(e.j ->> 'dt', '')::numeric, 0); v_k := coalesce(nullif(e.j ->> 'kt', '')::numeric, 0);
    v_net := round(v_d - v_k, 2);
    if v_net = 0 then v_skip := v_skip + 1; continue; end if;
    if not exists (select 1 from public.t2_bux_hisob h where h.kompaniya_id = p_kompaniya_id and h.faol and h.kod = v_h) then
      if jsonb_array_length(v_err) < 50 then v_err := v_err || jsonb_build_array(jsonb_build_object('qator', e.n, 'kod', 'HISOB_YOQ', 'hisob', v_h)); end if; continue;
    end if;
    if v_h = v_qarshi then
      if jsonb_array_length(v_err) < 50 then v_err := v_err || jsonb_build_array(jsonb_build_object('qator', e.n, 'kod', 'QARSHI_HISOBNING_OZI', 'hisob', v_h)); end if; continue;
    end if;
    v_kid := nullif(e.j ->> 'kontragent_id', '')::bigint; v_sid := nullif(e.j ->> 'shartnoma_id', '')::bigint; v_oid := nullif(e.j ->> 'obyekt_id', '')::bigint;
    if (v_kid is not null and not exists (select 1 from public.t2_kontragent k where k.id = v_kid and k.kompaniya_id = p_kompaniya_id))
       or (v_sid is not null and not exists (select 1 from public.t2_shartnoma s where s.id = v_sid and s.kompaniya_id = p_kompaniya_id))
       or (v_oid is not null and not exists (select 1 from public.t2_obyekt o where o.id = v_oid and o.kompaniya_id = p_kompaniya_id)) then
      if jsonb_array_length(v_err) < 50 then v_err := v_err || jsonb_build_array(jsonb_build_object('qator', e.n, 'kod', 'ANALITIKA_NOTOGRI')); end if; continue;
    end if;
    if v_net > 0 then v_dt := v_dt + v_net; else v_kt := v_kt - v_net; end if;
    v_n := v_n + 1;
    v_ok := v_ok || jsonb_build_array(jsonb_build_object('hisob', v_h, 'net', v_net, 'kontragent_id', v_kid, 'shartnoma_id', v_sid, 'obyekt_id', v_oid));
  end loop;
  v_res := jsonb_build_object('ok', jsonb_array_length(v_err) = 0 and v_dt = v_kt and v_n > 0, 'dry', coalesce(p_dry, false), 'yozilishi', v_n, 'otkazildi', v_skip,
                              'jami_dt', v_dt, 'jami_kt', v_kt, 'farq', v_dt - v_kt, 'xatolar', v_err, 'qarshi', v_qarshi);
  if jsonb_array_length(v_err) > 0 then return v_res || jsonb_build_object('code', 'TEKSHIRUV_XATO'); end if;
  if v_n = 0 then return v_res || jsonb_build_object('code', 'QATOR_YOQ'); end if;
  if v_dt <> v_kt then return v_res || jsonb_build_object('code', 'MUVOZANAT_YOQ', 'xabar', 'Jami Debet jami Kreditga teng bo''lishi kerak.'); end if;
  if coalesce(p_dry, false) then return v_res; end if;
  if exists (select 1 from public.t2_bux_provodka p where p.kompaniya_id = p_kompaniya_id and p.manba_tur = 'boshlangich_saldo' and p.tur = 'qolda'
               and not exists (select 1 from public.t2_bux_provodka s where s.storno_id = p.id)) then
    return jsonb_build_object('ok', false, 'code', 'SALDO_ALLAQACHON', 'xabar', 'Boshlang''ich qoldiq allaqachon yozilgan. Avval uni bekor qiling.');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('t2_bux_saldo:' || p_kompaniya_id, 0));
  insert into public.t2_bux_provodka(kompaniya_id, sana, dt_kod, kt_kod, summa, kontragent_id, shartnoma_id, obyekt_id, manba_tur, manba_id, qism, tur, izoh, aktor_id)
  select p_kompaniya_id, p_sana, case when x.net > 0 then x.hisob else v_qarshi end, case when x.net > 0 then v_qarshi else x.hisob end, abs(x.net),
         x.kontragent_id, x.shartnoma_id, x.obyekt_id, 'boshlangich_saldo', null, 'asosiy', 'qolda', 'Boshlang''ich qoldiq', p_actor_id
    from jsonb_to_recordset(v_ok) as x(hisob text, net numeric, kontragent_id bigint, shartnoma_id bigint, obyekt_id bigint);
  get diagnostics v_ins = row_count;
  perform public.t2_audit_yoz(p_kompaniya_id, 'bux_saldo_import', 'buxgalteriya', null, format('n=%s dt=%s', v_ins, v_dt), 'actor:' || p_actor_id, null);
  v_res := v_res || jsonb_build_object('yozildi', v_ins);
  insert into public.t2_onboarding_command_log(operation_id, actor_id, command, natija) values (p_operation_id, p_actor_id, 'bux_saldo_import_v1', v_res);
  return v_res;
end $$;

create or replace function public.t2_bux_saldo_bekor_v1(p_actor_id bigint, p_kompaniya_id bigint, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_prev jsonb; v_n integer; v_res jsonb;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select natija into v_prev from public.t2_onboarding_command_log where operation_id = p_operation_id;
  if found then return v_prev; end if;
  perform public._t2_bux_ruxsat(p_kompaniya_id, p_actor_id, 'accounting.approve');
  insert into public.t2_bux_provodka(kompaniya_id, sana, dt_kod, kt_kod, summa, kontragent_id, shartnoma_id, obyekt_id, manba_tur, manba_id, qism, tur, storno_id, izoh, aktor_id)
  select p.kompaniya_id, p.sana, p.dt_kod, p.kt_kod, -p.summa, p.kontragent_id, p.shartnoma_id, p.obyekt_id, p.manba_tur, p.manba_id, p.qism, 'storno', p.id,
         'Boshlang''ich qoldiq bekor', p_actor_id
    from public.t2_bux_provodka p
   where p.kompaniya_id = p_kompaniya_id and p.manba_tur = 'boshlangich_saldo' and p.tur = 'qolda' and not exists (select 1 from public.t2_bux_provodka s where s.storno_id = p.id);
  get diagnostics v_n = row_count;
  perform public.t2_audit_yoz(p_kompaniya_id, 'bux_saldo_bekor', 'buxgalteriya', null, format('n=%s', v_n), 'actor:' || p_actor_id, null);
  v_res := jsonb_build_object('ok', true, 'storno', v_n);
  insert into public.t2_onboarding_command_log(operation_id, actor_id, command, natija) values (p_operation_id, p_actor_id, 'bux_saldo_bekor_v1', v_res);
  return v_res;
end $$;

-- 5. YOZISH: tannarx (obyekt xarajati -> sotilgan tannarx). Usul (T): daromad tan olingan obyektning butun xarajati. amal: yop | bekor (bekor = qaytarish, storno).
create or replace function public.t2_bux_tannarx_v1(p_actor_id bigint, p_kompaniya_id bigint, p_oy date, p_amal text, p_dry boolean, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_prev jsonb; v_oy date; v_son date; v_dt text; v_kt text; v_dar text; v_q jsonb; v_jami numeric; v_n integer; v_res jsonb;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  if not coalesce(p_dry, false) then
    select natija into v_prev from public.t2_onboarding_command_log where operation_id = p_operation_id;
    if found then return v_prev; end if;
  end if;
  perform public._t2_bux_ruxsat(p_kompaniya_id, p_actor_id, case when coalesce(p_dry, false) then 'accounting.read' else 'accounting.approve' end);
  if p_oy is null or p_amal is null or p_amal not in ('yop', 'bekor') then return jsonb_build_object('ok', false, 'code', 'TANNARX_AMAL'); end if;
  v_oy := date_trunc('month', p_oy)::date; v_son := (v_oy + interval '1 month' - interval '1 day')::date;
  perform public._t2_bux_qoida_kafolat(p_kompaniya_id, 'tannarx.yopish');
  perform public._t2_bux_qoida_kafolat(p_kompaniya_id, 'sotuv.realizatsiya');
  select m.dt_kod, m.kt_kod into v_dt, v_kt from public.t2_bux_moslik m where m.kompaniya_id = p_kompaniya_id and m.kalit = 'tannarx.yopish';
  select m.kt_kod into v_dar from public.t2_bux_moslik m where m.kompaniya_id = p_kompaniya_id and m.kalit = 'sotuv.realizatsiya';
  if v_dt is null or v_kt is null or v_dar is null then
    return jsonb_build_object('ok', false, 'code', 'QOIDA_OCHIRILGAN', 'xabar', 'Tannarx qoidasi (tannarx.yopish) yoki daromad qoidasi (sotuv.realizatsiya) yo''q yoki o''chirilgan.');
  end if;
  if exists (select 1 from public.t2_bux_provodka p where p.kompaniya_id = p_kompaniya_id and p.manba_tur = 'tannarx' and p.sana > v_son) then
    return jsonb_build_object('ok', false, 'code', 'KEYINGI_OY_BOR', 'xabar', 'Keyingi oyga tannarx yozilgan: avval o''sha oyni bekor qiling (oxirgidan boshlab).');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('t2_bux_tannarx:' || p_kompaniya_id, 0));
  select coalesce(jsonb_agg(jsonb_build_object('obyekt_id', z.obyekt_id, 'xarajat', z.xarajat, 'daromad', z.daromad, 'avval', z.avval, 'farq', z.farq) order by z.obyekt_id), '[]'::jsonb)
    into v_q
    from (
      select a.obyekt_id, a.xarajat, a.daromad, a.avval, (case when p_amal = 'yop' and a.daromad > 0 then greatest(a.xarajat, 0) else 0 end) - a.avval as farq
        from (
          select p.obyekt_id,
                 coalesce(sum(case when p.dt_kod = v_kt then p.summa when p.kt_kod = v_kt and p.manba_tur <> 'tannarx' then -p.summa else 0 end), 0) as xarajat,
                 coalesce(sum(case when p.kt_kod = v_dar then p.summa when p.dt_kod = v_dar then -p.summa else 0 end), 0) as daromad,
                 coalesce(sum(case when p.manba_tur = 'tannarx' and p.dt_kod = v_dt then p.summa else 0 end), 0) as avval
            from public.t2_bux_provodka p
           where p.kompaniya_id = p_kompaniya_id and p.obyekt_id is not null and p.sana <= v_son
           group by p.obyekt_id) a) z
   where z.farq <> 0;
  v_n := jsonb_array_length(v_q);
  v_jami := coalesce((select sum((e ->> 'farq')::numeric) from jsonb_array_elements(v_q) e), 0);
  v_res := jsonb_build_object('ok', true, 'dry', coalesce(p_dry, false), 'oy', v_oy, 'amal', p_amal, 'soni', v_n, 'jami', v_jami, 'qatorlar', v_q, 'dt', v_dt, 'kt', v_kt);
  if coalesce(p_dry, false) then return v_res; end if;
  insert into public.t2_bux_provodka(kompaniya_id, sana, dt_kod, kt_kod, summa, obyekt_id, manba_tur, manba_id, qism, tur, izoh, aktor_id)
  select p_kompaniya_id, v_son, v_dt, v_kt, x.farq, x.obyekt_id, 'tannarx', x.obyekt_id, 'asosiy', 'avto', 'Tannarx ' || to_char(v_oy, 'YYYY-MM'), p_actor_id
    from jsonb_to_recordset(v_q) as x(obyekt_id bigint, farq numeric);
  perform public.t2_audit_yoz(p_kompaniya_id, 'bux_tannarx', 'buxgalteriya', null, format('oy=%s amal=%s n=%s', v_oy, p_amal, v_n), 'actor:' || p_actor_id, null);
  insert into public.t2_onboarding_command_log(operation_id, actor_id, command, natija) values (p_operation_id, p_actor_id, 'bux_tannarx_v1', v_res);
  return v_res;
end $$;

revoke all on function public._t2_bux_qoida_kafolat(bigint, text) from public, anon, authenticated;
revoke all on function public.t2_bux_pul_korinish_v1(bigint, bigint, date, date) from public, anon, authenticated;
revoke all on function public.t2_bux_hisobot_v1(bigint, bigint, date, date, text) from public, anon, authenticated;
revoke all on function public.t2_bux_hisobot_saqla_v1(bigint, bigint, text, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.t2_bux_saldo_import_v1(bigint, bigint, date, text, jsonb, boolean, uuid) from public, anon, authenticated;
revoke all on function public.t2_bux_saldo_bekor_v1(bigint, bigint, uuid) from public, anon, authenticated;
revoke all on function public.t2_bux_tannarx_v1(bigint, bigint, date, text, boolean, uuid) from public, anon, authenticated;
grant execute on function public.t2_bux_pul_korinish_v1(bigint, bigint, date, date) to service_role;
grant execute on function public.t2_bux_hisobot_v1(bigint, bigint, date, date, text) to service_role;
grant execute on function public.t2_bux_hisobot_saqla_v1(bigint, bigint, text, jsonb, uuid) to service_role;
grant execute on function public.t2_bux_saldo_import_v1(bigint, bigint, date, text, jsonb, boolean, uuid) to service_role;
grant execute on function public.t2_bux_saldo_bekor_v1(bigint, bigint, uuid) to service_role;
grant execute on function public.t2_bux_tannarx_v1(bigint, bigint, date, text, boolean, uuid) to service_role;
