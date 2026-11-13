-- T2-BUXGALTERIYA-005 - Buxgalteriya 4-bosqich (ADR §11). 20261216200000/210000/220000 ustiga.
--   1) BANK: ko'chirma qatorlari navbati (t2_bux_bank_qator) + har qatorga TAKLIF (shartnoma raqami maqsadda, STIR/nom, ochiq qarz summasi) + bir bosishda qabul:
--      to'lov (t2_tolov, V1 bilan bir xil operation_id) bog'lanadi va BIR MARTA yoziladi; ish haqi to'lovi tasdiqlangan oylikka bog'lanadi (Dt 6710 / Kt 5110, ish_haqi.tolash).
--   2) KASSA: kirim/chiqim orderlari (yil bo'yicha raqamlash, tur bo'yicha), provodka, kunlik kassa kitobi (jurnaldan).
--   3) Ish beruvchi badallari: tahrirlanadigan stavka (param.ish_beruvchi_foiz, NULL = o'chirilgan) + qoida, ish haqi bilan birga yoziladi.
--   4) Ish haqini obyektlarga TAQSIMLASH: aniq ulush jadvali; sukut - taqsimlanmagan (kompaniya darajasi).
-- Hamma funksiya security definer, a'zolik + accounting.* tekshiruvi, faqat service_role. T - tekshirilsin (buxgalter).

-- 1. Jadvallar
create table if not exists public.t2_bux_bank_qator (
  id bigint generated always as identity primary key,
  kompaniya_id bigint not null references public.t2_kompaniya(id) on delete cascade,
  kalit text not null,
  sana date not null,
  summa numeric(18, 2) not null check (summa > 0),
  yonalish text not null check (yonalish in ('kirim', 'chiqim')),
  hujjat_raqam text,
  izoh text,
  inn text,
  kontragent text,
  holat text not null default 'kutmoqda' check (holat in ('kutmoqda', 'qabul', 'rad')),
  tolov_id bigint references public.t2_tolov(id),
  oylik_id bigint,
  provodka_id bigint,
  yaratildi timestamptz not null default now(),
  unique (kompaniya_id, kalit)
);
create unique index if not exists t2_bux_bank_qator_oylik_uq on public.t2_bux_bank_qator (oylik_id) where oylik_id is not null and holat = 'qabul';
create index if not exists t2_bux_bank_qator_holat_idx on public.t2_bux_bank_qator (kompaniya_id, holat, sana);
comment on table public.t2_bux_bank_qator is 'Bank ko''chirmasi qatorlari navbati: kutmoqda -> qabul (to''lovga yoki oylikka bog''langan) / rad. V1 bank importi bilan bir xil dedupe kaliti (operation_id = md5(kompaniya:kalit)).';

create table if not exists public.t2_bux_kassa_order (
  id bigint generated always as identity primary key,
  kompaniya_id bigint not null references public.t2_kompaniya(id) on delete cascade,
  yil integer not null,
  tur text not null check (tur in ('kirim', 'chiqim')),
  raqam integer not null check (raqam > 0),
  sana date not null,
  summa numeric(18, 2) not null check (summa > 0),
  qarshi_hisob text not null check (qarshi_hisob ~ '^[0-9]{4}$'),
  kontragent_id bigint,
  shartnoma_id bigint,
  obyekt_id bigint,
  asos text,
  holat text not null default 'faol' check (holat in ('faol', 'bekor')),
  aktor_id bigint,
  yaratildi timestamptz not null default now(),
  unique (kompaniya_id, yil, tur, raqam)
);
comment on table public.t2_bux_kassa_order is 'Kassa orderlari (kirim/chiqim). Raqam kompaniya + yil + tur bo''yicha ketma-ket (T - tekshirilsin). Provodka manba_tur=kassa.';

create table if not exists public.t2_bux_ish_haqi_taqsim (
  kompaniya_id bigint not null references public.t2_kompaniya(id) on delete cascade,
  kadr_id bigint not null,
  obyekt_id bigint not null references public.t2_obyekt(id) on delete cascade,
  ulush numeric(5, 2) not null check (ulush > 0 and ulush <= 100),
  primary key (kompaniya_id, kadr_id, obyekt_id)
);
comment on table public.t2_bux_ish_haqi_taqsim is 'Ish haqini obyektlarga taqsimlash ulushlari (%). Yig''indi <= 100; qolgan qism taqsimlanmagan (kompaniya darajasi, obyektsiz).';

alter table public.t2_bux_bank_qator enable row level security;
alter table public.t2_bux_kassa_order enable row level security;
alter table public.t2_bux_ish_haqi_taqsim enable row level security;
revoke all on public.t2_bux_bank_qator, public.t2_bux_kassa_order, public.t2_bux_ish_haqi_taqsim from anon, authenticated;
revoke all on sequence public.t2_bux_bank_qator_id_seq, public.t2_bux_kassa_order_id_seq from anon, authenticated;

-- 2. Qoidalar (pudratchi shabloni; mavjud kompaniyalarga ham ko'chiriladi). Stavka NULL = o'chirilgan (soxta qonuniy qiymat yo'q).
insert into public.t2_bux_shablon(shablon, kalit, dt_kod, kt_kod, qiymat, izoh)
values ('pudratchi', 'ish_haqi.ish_beruvchi', '2010', '6410', null, 'Ish beruvchi badallari (ijtimoiy soliq va h.k.). Hisob T - tekshirilsin'),
       ('pudratchi', 'param.ish_beruvchi_foiz', null, null, null, 'Ish beruvchi badali stavkasi (%) - buxgalter kiritadi; bo''sh = hisoblanmaydi. T'),
       ('pudratchi', 'kassa.hisob', '5010', null, null, 'Kassa hisobi (dt_kod). T')
on conflict (shablon, kalit) do nothing;
insert into public.t2_bux_moslik(kompaniya_id, kalit, dt_kod, kt_kod, qiymat, izoh)
select z.kompaniya_id, h.kalit, h.dt_kod, h.kt_kod, h.qiymat, h.izoh
  from (select distinct m.kompaniya_id from public.t2_bux_moslik m where m.kalit = 'ish_haqi.hisoblash') z
  join public.t2_bux_shablon h on h.shablon = 'pudratchi' and h.kalit in ('ish_haqi.ish_beruvchi', 'param.ish_beruvchi_foiz', 'kassa.hisob')
on conflict (kompaniya_id, kalit) do nothing;

-- 3. Ish haqi provodkalari (v3 o'rami): ish haqini obyektlarga taqsimlash + ish beruvchi badali. Eski v3 -> _asos.
alter function public._t2_bux_kerak_v3(bigint) rename to _t2_bux_kerak_v3_asos;
create or replace function public._t2_bux_kerak_v3(p_kompaniya_id bigint) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_asos jsonb; v_ish jsonb := '[]'::jsonb; v_h_dt text; v_h_kt text; v_n_dt text; v_n_kt text; v_i_dt text; v_i_kt text; v_e_dt text; v_e_kt text; v_foiz numeric;
begin
  v_asos := public._t2_bux_kerak_v3_asos(p_kompaniya_id);
  select m.dt_kod, m.kt_kod into v_h_dt, v_h_kt from public.t2_bux_moslik m where m.kompaniya_id = p_kompaniya_id and m.kalit = 'ish_haqi.hisoblash' and m.dt_kod is not null and m.kt_kod is not null;
  if v_h_dt is null then return v_asos; end if;
  select m.dt_kod, m.kt_kod into v_n_dt, v_n_kt from public.t2_bux_moslik m where m.kompaniya_id = p_kompaniya_id and m.kalit = 'ish_haqi.ndfl' and m.dt_kod is not null and m.kt_kod is not null;
  select m.dt_kod, m.kt_kod into v_i_dt, v_i_kt from public.t2_bux_moslik m where m.kompaniya_id = p_kompaniya_id and m.kalit = 'ish_haqi.inps' and m.dt_kod is not null and m.kt_kod is not null;
  select m.dt_kod, m.kt_kod into v_e_dt, v_e_kt from public.t2_bux_moslik m where m.kompaniya_id = p_kompaniya_id and m.kalit = 'ish_haqi.ish_beruvchi' and m.dt_kod is not null and m.kt_kod is not null;
  select m.qiymat into v_foiz from public.t2_bux_moslik m where m.kompaniya_id = p_kompaniya_id and m.kalit = 'param.ish_beruvchi_foiz';
  select coalesce(jsonb_agg(to_jsonb(q)), '[]'::jsonb) into v_ish from (
    -- hisoblash: taqsimlangan ulushlar obyektga, qolgani (yoki taqsim yo'q bo'lsa hammasi) obyektsiz
    select 'ish_haqi'::text as manba_tur, y.id as manba_id, 'asosiy'::text as qism, (y.oy + interval '1 month' - interval '1 day')::date as sana, v_h_dt as dt_kod, v_h_kt as kt_kod,
           round(y.hisoblangan * s.ulush / 100, 2) as summa, null::bigint as kontragent_id, null::bigint as shartnoma_id, s.obyekt_id
      from public.t2_hr_oylik y join public.t2_bux_ish_haqi_taqsim s on s.kompaniya_id = y.kompaniya_id and s.kadr_id = y.kadr_id
     where y.kompaniya_id = p_kompaniya_id and y.holat = 'tasdiqlangan' and y.hisoblangan is not null and y.hisoblangan <> 0 and round(y.hisoblangan * s.ulush / 100, 2) <> 0
    union all
    select 'ish_haqi', y.id, 'asosiy', (y.oy + interval '1 month' - interval '1 day')::date, v_h_dt, v_h_kt,
           y.hisoblangan - coalesce((select sum(round(y.hisoblangan * s.ulush / 100, 2)) from public.t2_bux_ish_haqi_taqsim s where s.kompaniya_id = y.kompaniya_id and s.kadr_id = y.kadr_id), 0), null, null, null
      from public.t2_hr_oylik y
     where y.kompaniya_id = p_kompaniya_id and y.holat = 'tasdiqlangan' and y.hisoblangan is not null and y.hisoblangan <> 0
       and y.hisoblangan - coalesce((select sum(round(y.hisoblangan * s.ulush / 100, 2)) from public.t2_bux_ish_haqi_taqsim s where s.kompaniya_id = y.kompaniya_id and s.kadr_id = y.kadr_id), 0) <> 0
    union all
    select 'ish_haqi', y.id, 'asosiy', (y.oy + interval '1 month' - interval '1 day')::date, v_n_dt, v_n_kt, y.ndfl, null, null, null
      from public.t2_hr_oylik y where v_n_dt is not null and y.kompaniya_id = p_kompaniya_id and y.holat = 'tasdiqlangan' and y.ndfl is not null and y.ndfl <> 0
    union all
    select 'ish_haqi', y.id, 'asosiy', (y.oy + interval '1 month' - interval '1 day')::date, v_i_dt, v_i_kt, y.inps, null, null, null
      from public.t2_hr_oylik y where v_i_dt is not null and y.kompaniya_id = p_kompaniya_id and y.holat = 'tasdiqlangan' and y.inps is not null and y.inps <> 0
    union all
    select 'ish_haqi', y.id, 'asosiy', (y.oy + interval '1 month' - interval '1 day')::date, v_e_dt, v_e_kt, round(y.hisoblangan * v_foiz / 100, 2), null, null, null
      from public.t2_hr_oylik y where v_e_dt is not null and coalesce(v_foiz, 0) > 0 and y.kompaniya_id = p_kompaniya_id and y.holat = 'tasdiqlangan'
       and y.hisoblangan is not null and round(y.hisoblangan * v_foiz / 100, 2) <> 0
  ) q;
  return (select coalesce(jsonb_agg(e), '[]'::jsonb) from jsonb_array_elements(v_asos) e where e ->> 'manba_tur' <> 'ish_haqi') || v_ish;
end $$;

-- YOZISH: bitta xodimning obyektlar bo'yicha ulushlarini almashtirish (bo'sh massiv = taqsimlanmagan)
create or replace function public.t2_bux_taqsim_saqla_v1(p_actor_id bigint, p_kompaniya_id bigint, p_kadr_id bigint, p_qatorlar jsonb, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_prev jsonb; v_sum numeric; v_res jsonb;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select natija into v_prev from public.t2_onboarding_command_log where operation_id = p_operation_id;
  if found then return v_prev; end if;
  perform public._t2_bux_ruxsat(p_kompaniya_id, p_actor_id, 'accounting.approve');
  if p_kadr_id is null or not exists (select 1 from public.t2_kadr_mustaqil k where k.id = p_kadr_id and k.kompaniya_id = p_kompaniya_id) then return jsonb_build_object('ok', false, 'code', 'KADR_YOQ'); end if;
  if p_qatorlar is null or jsonb_typeof(p_qatorlar) <> 'array' or jsonb_array_length(p_qatorlar) > 50 then return jsonb_build_object('ok', false, 'code', 'QATORLAR_NOTOGRI'); end if;
  if exists (select 1 from jsonb_array_elements(p_qatorlar) e where coalesce(e ->> 'ulush', '') !~ '^[0-9]+(\.[0-9]+)?$' or coalesce(e ->> 'obyekt_id', '') !~ '^[0-9]+$'
                or (e ->> 'ulush')::numeric <= 0 or (e ->> 'ulush')::numeric > 100
                or not exists (select 1 from public.t2_obyekt o where o.id = (e ->> 'obyekt_id')::bigint and o.kompaniya_id = p_kompaniya_id)) then
    return jsonb_build_object('ok', false, 'code', 'QATOR_NOTOGRI');
  end if;
  select coalesce(sum((e ->> 'ulush')::numeric), 0) into v_sum from jsonb_array_elements(p_qatorlar) e;
  if v_sum > 100 or (select count(distinct e ->> 'obyekt_id') from jsonb_array_elements(p_qatorlar) e) <> jsonb_array_length(p_qatorlar) then return jsonb_build_object('ok', false, 'code', 'ULUSH_100_DAN_KO_P'); end if;
  delete from public.t2_bux_ish_haqi_taqsim where kompaniya_id = p_kompaniya_id and kadr_id = p_kadr_id;
  insert into public.t2_bux_ish_haqi_taqsim(kompaniya_id, kadr_id, obyekt_id, ulush)
  select p_kompaniya_id, p_kadr_id, (e ->> 'obyekt_id')::bigint, (e ->> 'ulush')::numeric from jsonb_array_elements(p_qatorlar) e;
  perform public.t2_audit_yoz(p_kompaniya_id, 'bux_taqsim_saqla', 'buxgalteriya', null, format('kadr=%s ulush=%s', p_kadr_id, v_sum), 'actor:' || p_actor_id, null);
  v_res := jsonb_build_object('ok', true, 'kadr_id', p_kadr_id, 'ulush_jami', v_sum, 'taqsimlanmagan', 100 - v_sum);
  insert into public.t2_onboarding_command_log(operation_id, actor_id, command, natija) values (p_operation_id, p_actor_id, 'bux_taqsim_saqla_v1', v_res);
  return v_res;
end $$;

-- 4. BANK: ko'chirma qatorlarini navbatga yuklash (takror qatorlar o'tkaziladi)
create or replace function public.t2_bux_bank_yuklash_v1(p_actor_id bigint, p_kompaniya_id bigint, p_qatorlar jsonb, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_prev jsonb; e record; v_yangi integer := 0; v_takror integer := 0; v_xato integer := 0; v_summa numeric; v_tid bigint; v_res jsonb;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select natija into v_prev from public.t2_onboarding_command_log where operation_id = p_operation_id;
  if found then return v_prev; end if;
  perform public._t2_bux_ruxsat(p_kompaniya_id, p_actor_id, 'accounting.write');
  if p_qatorlar is null or jsonb_typeof(p_qatorlar) <> 'array' or jsonb_array_length(p_qatorlar) = 0 or jsonb_array_length(p_qatorlar) > 500 then return jsonb_build_object('ok', false, 'code', 'QATORLAR_1_500'); end if;
  for e in select x.j from jsonb_array_elements(p_qatorlar) as x(j) loop
    if coalesce(e.j ->> 'sana', '') !~ '^\d{4}-\d{2}-\d{2}$' or coalesce(e.j ->> 'summa', '') !~ '^[0-9]+(\.[0-9]+)?$' or coalesce(e.j ->> 'yonalish', '') not in ('kirim', 'chiqim') or coalesce(e.j ->> 'kalit', '') = '' then
      v_xato := v_xato + 1; continue;
    end if;
    v_summa := round((e.j ->> 'summa')::numeric, 2);
    if v_summa <= 0 then v_xato := v_xato + 1; continue; end if;
    select t.id into v_tid from public.t2_tolov t where t.operation_id = md5(p_kompaniya_id::text || ':' || (e.j ->> 'kalit'))::uuid;
    insert into public.t2_bux_bank_qator(kompaniya_id, kalit, sana, summa, yonalish, hujjat_raqam, izoh, inn, kontragent, holat, tolov_id)
    values (p_kompaniya_id, e.j ->> 'kalit', (e.j ->> 'sana')::date, v_summa, e.j ->> 'yonalish', nullif(left(btrim(coalesce(e.j ->> 'hujjat_raqam', '')), 60), ''),
            nullif(left(coalesce(e.j ->> 'izoh', ''), 500), ''), nullif(left(btrim(coalesce(e.j ->> 'inn', '')), 20), ''), nullif(left(btrim(coalesce(e.j ->> 'kontragent', '')), 200), ''),
            case when v_tid is null then 'kutmoqda' else 'qabul' end, v_tid)
    on conflict (kompaniya_id, kalit) do nothing;
    if found then v_yangi := v_yangi + 1; else v_takror := v_takror + 1; end if;
  end loop;
  perform public.t2_audit_yoz(p_kompaniya_id, 'bux_bank_yuklash', 'buxgalteriya', null, format('yangi=%s takror=%s xato=%s', v_yangi, v_takror, v_xato), 'actor:' || p_actor_id, null);
  v_res := jsonb_build_object('ok', true, 'yangi', v_yangi, 'takror', v_takror, 'xato', v_xato);
  insert into public.t2_onboarding_command_log(operation_id, actor_id, command, natija) values (p_operation_id, p_actor_id, 'bux_bank_yuklash_v1', v_res);
  return v_res;
end $$;

-- ICHKI: shartnoma bu yo'nalishga mosmi (pudratchi: kirim = asosiy shartnoma, chiqim = kontragent shartnomasi; buyurtmachi: hammasi chiqim)
create or replace function public._t2_bux_bank_mos(p_kompaniya_id bigint, p_asosiy boolean, p_yonalish text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select case when coalesce((select s.shablon from public.t2_bux_sozlama s where s.kompaniya_id = p_kompaniya_id), 'pudratchi') = 'buyurtmachi' then p_yonalish = 'chiqim'
              else (p_yonalish = 'kirim') = p_asosiy end
$$;

-- O'QISH: navbatdagi (kutmoqda) qatorlar + har biriga TAKLIFLAR (ball + oddiy sabab) va ish haqi nomzodlari
create or replace function public.t2_bux_bank_taklif_v1(p_kompaniya_id bigint, p_actor_id bigint, p_limit integer default 200)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_lim integer := least(greatest(coalesce(p_limit, 200), 1), 500); v_q jsonb := '[]'::jsonb; l record; v_t jsonb; v_o jsonb; v_norm text;
begin
  perform public._t2_bux_ruxsat(p_kompaniya_id, p_actor_id, 'accounting.read');
  for l in select * from public.t2_bux_bank_qator b where b.kompaniya_id = p_kompaniya_id and b.holat = 'kutmoqda' order by b.sana, b.id limit v_lim loop
    v_norm := regexp_replace(lower(coalesce(l.izoh, '') || ' ' || coalesce(l.hujjat_raqam, '')), '\s+', '', 'g');
    select coalesce(jsonb_agg(jsonb_build_object('shartnoma_id', t.id, 'raqam', t.raqam, 'kontragent', t.knom, 'ball', t.ball, 'sabab', to_jsonb(t.sabab)) order by t.ball desc, t.id), '[]'::jsonb) into v_t from (
      select z.* from (
        select c.*, array_remove(array[
                 case when c.nr <> '' and length(c.nr) >= 3 and position(c.nr in v_norm) > 0 then 'Shartnoma raqami to''lov maqsadida' end,
                 case when l.inn is not null and c.kinn is not null and l.inn = c.kinn then 'STIR mos' when c.kinn is not null and position(c.kinn in v_norm) > 0 then 'STIR maqsadda' end,
                 case when l.kontragent is not null and c.knom is not null and (lower(l.kontragent) = lower(c.knom) or lower(l.kontragent) like '%' || lower(c.knom) || '%') then 'Kontragent nomi mos' end,
                 case when abs(c.ochiq - l.summa) < 0.005 then 'Summa ochiq qarzga teng' when c.ochiq > l.summa then 'Summa ochiq qarz doirasida' end]::text[], null) as sabab,
               (case when c.nr <> '' and length(c.nr) >= 3 and position(c.nr in v_norm) > 0 then 50 else 0 end)
               + (case when l.inn is not null and c.kinn is not null and l.inn = c.kinn then 25 when c.kinn is not null and position(c.kinn in v_norm) > 0 then 20 else 0 end)
               + (case when l.kontragent is not null and c.knom is not null and (lower(l.kontragent) = lower(c.knom) or lower(l.kontragent) like '%' || lower(c.knom) || '%') then 10 else 0 end)
               + (case when abs(c.ochiq - l.summa) < 0.005 then 20 when c.ochiq > l.summa then 5 else 0 end) as ball
          from (
            select s.id, s.raqam, s.asosiy, regexp_replace(lower(coalesce(s.raqam, '')), '\s+', '', 'g') as nr, k.nom as knom, nullif(btrim(k.inn), '') as kinn,
                   coalesce((select sum(case when p.dt_kod = '4010' then p.summa when p.kt_kod = '4010' then -p.summa else 0 end) from public.t2_bux_provodka p where p.kompaniya_id = p_kompaniya_id and p.shartnoma_id = s.id), 0)
                     * case when l.yonalish = 'kirim' then 1 else 0 end
                   + coalesce((select sum(case when p.kt_kod = '6010' then p.summa when p.dt_kod = '6010' then -p.summa else 0 end) from public.t2_bux_provodka p where p.kompaniya_id = p_kompaniya_id and p.shartnoma_id = s.id), 0)
                     * case when l.yonalish = 'chiqim' then 1 else 0 end as ochiq
              from public.t2_shartnoma s
              left join public.t2_kontragent k on k.id = public._t2_bux_sh_kontragent(s.id) and k.kompaniya_id = p_kompaniya_id
             where s.kompaniya_id = p_kompaniya_id and s.holat <> 'bekor' and public._t2_bux_bank_mos(p_kompaniya_id, s.asosiy, l.yonalish)) c) z
       where z.ball >= 20 order by z.ball desc limit 3) t;
    select coalesce(jsonb_agg(jsonb_build_object('oylik_id', y.id, 'kadr_id', y.kadr_id, 'oy', y.oy, 'sof', y.sof, 'ball', 60 + case when l.izoh ~* '(oylik|ish haqi|ish haqqi|зарплат|заработн|salary|wage)' then 10 else 0 end,
              'sabab', jsonb_build_array('Xodim oyligi (sof) summasi mos')) order by y.oy), '[]'::jsonb) into v_o
      from public.t2_hr_oylik y
     where l.yonalish = 'chiqim' and y.kompaniya_id = p_kompaniya_id and y.holat = 'tasdiqlangan' and y.sof is not null and abs(y.sof - l.summa) < 0.005
       and y.oy <= l.sana and y.oy >= (l.sana - interval '4 months')::date
       and not exists (select 1 from public.t2_bux_bank_qator b2 where b2.oylik_id = y.id and b2.holat = 'qabul');
    v_q := v_q || jsonb_build_array(jsonb_build_object('id', l.id, 'sana', l.sana, 'summa', l.summa, 'yonalish', l.yonalish, 'hujjat_raqam', l.hujjat_raqam, 'izoh', l.izoh,
                                    'inn', l.inn, 'kontragent', l.kontragent, 'takliflar', v_t, 'oylik', v_o,
                                    'aniqlanmagan', jsonb_array_length(v_t) = 0 and jsonb_array_length(v_o) = 0));
  end loop;
  return jsonb_build_object('ok', true, 'qatorlar', v_q,
    'jami', jsonb_build_object('kutmoqda', (select count(*) from public.t2_bux_bank_qator b where b.kompaniya_id = p_kompaniya_id and b.holat = 'kutmoqda'),
                               'qabul', (select count(*) from public.t2_bux_bank_qator b where b.kompaniya_id = p_kompaniya_id and b.holat = 'qabul')));
end $$;

-- YOZISH: taklifni qabul qilish (bir bosish). To'lov (t2_tolov, V1 bilan bir xil operation_id) yoki tasdiqlangan oylik; bir marta yoziladi.
create or replace function public.t2_bux_bank_qabul_v1(p_actor_id bigint, p_kompaniya_id bigint, p_qator_id bigint, p_shartnoma_id bigint, p_oylik_id bigint, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_prev jsonb; b public.t2_bux_bank_qator%rowtype; s public.t2_shartnoma%rowtype; y public.t2_hr_oylik%rowtype; v_tid bigint; v_tur text; v_dt text; v_kt text; v_pid bigint; v_res jsonb;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select natija into v_prev from public.t2_onboarding_command_log where operation_id = p_operation_id;
  if found then return v_prev; end if;
  perform public._t2_bux_ruxsat(p_kompaniya_id, p_actor_id, 'accounting.write');
  if (p_shartnoma_id is null) = (p_oylik_id is null) then return jsonb_build_object('ok', false, 'code', 'BITTA_NISHON_KERAK'); end if;
  perform pg_advisory_xact_lock(hashtextextended('t2_bux_sync:' || p_kompaniya_id, 0));
  select * into b from public.t2_bux_bank_qator where id = p_qator_id and kompaniya_id = p_kompaniya_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'QATOR_YOQ'); end if;
  if b.holat = 'qabul' then return jsonb_build_object('ok', true, 'takror', true, 'tolov_id', b.tolov_id, 'oylik_id', b.oylik_id); end if;
  if b.holat <> 'kutmoqda' then return jsonb_build_object('ok', false, 'code', 'HOLAT_YARAMAYDI'); end if;
  if p_shartnoma_id is not null then
    select * into s from public.t2_shartnoma where id = p_shartnoma_id and kompaniya_id = p_kompaniya_id and holat <> 'bekor';
    if not found then return jsonb_build_object('ok', false, 'code', 'SHARTNOMA_YOQ'); end if;
    if not public._t2_bux_bank_mos(p_kompaniya_id, s.asosiy, b.yonalish) then return jsonb_build_object('ok', false, 'code', 'YONALISH_MOS_EMAS', 'xabar', 'Qator yo''nalishi shartnoma turiga mos emas.'); end if;
    v_tur := 'tolov';
    select t.id into v_tid from public.t2_tolov t where t.operation_id = md5(p_kompaniya_id::text || ':' || b.kalit)::uuid;
    if v_tid is null then
      insert into public.t2_tolov(kompaniya_id, shartnoma_id, sana, summa, tur, izoh, operation_id, kim, hujjat_raqam, manba)
      values (p_kompaniya_id, s.id, b.sana, b.summa, v_tur, nullif(left(coalesce(b.izoh, ''), 500), ''), md5(p_kompaniya_id::text || ':' || b.kalit)::uuid, 'actor:' || p_actor_id, b.hujjat_raqam, 'bank_import')
      returning id into v_tid;
    end if;
    update public.t2_bux_bank_qator set holat = 'qabul', tolov_id = v_tid where id = b.id;
    -- to'lov provodkasi shu zahoti (bir marta; sinxron idempotent)
    perform public._t2_bux_sync(p_kompaniya_id, p_actor_id, public._t2_bux_turlar(), public._t2_bux_kerak_v3(p_kompaniya_id), false);
  else
    if b.yonalish <> 'chiqim' then return jsonb_build_object('ok', false, 'code', 'YONALISH_MOS_EMAS'); end if;
    select * into y from public.t2_hr_oylik where id = p_oylik_id and kompaniya_id = p_kompaniya_id and holat = 'tasdiqlangan';
    if not found or y.sof is null or abs(y.sof - b.summa) >= 0.005 then return jsonb_build_object('ok', false, 'code', 'OYLIK_MOS_EMAS'); end if;
    if exists (select 1 from public.t2_bux_bank_qator x where x.oylik_id = y.id and x.holat = 'qabul') then return jsonb_build_object('ok', false, 'code', 'OYLIK_TOLANGAN'); end if;
    perform public._t2_bux_qoida_kafolat(p_kompaniya_id, 'ish_haqi.tolash');
    select m.dt_kod, m.kt_kod into v_dt, v_kt from public.t2_bux_moslik m where m.kompaniya_id = p_kompaniya_id and m.kalit = 'ish_haqi.tolash' and m.dt_kod is not null and m.kt_kod is not null;
    if v_dt is null then return jsonb_build_object('ok', false, 'code', 'QOIDA_OCHIRILGAN', 'xabar', 'ish_haqi.tolash qoidasi yo''q yoki o''chirilgan.'); end if;
    insert into public.t2_bux_provodka(kompaniya_id, sana, dt_kod, kt_kod, summa, manba_tur, manba_id, qism, tur, izoh, aktor_id)
    values (p_kompaniya_id, b.sana, v_dt, v_kt, b.summa, 'bank_ish_haqi', b.id, 'asosiy', 'qolda', 'Ish haqi to''lovi (bank ko''chirmasi)', p_actor_id) returning id into v_pid;
    update public.t2_bux_bank_qator set holat = 'qabul', oylik_id = y.id, provodka_id = v_pid where id = b.id;
  end if;
  perform public.t2_audit_yoz(p_kompaniya_id, 'bux_bank_qabul', 'buxgalteriya', null, format('qator=%s shartnoma=%s oylik=%s', p_qator_id, p_shartnoma_id, p_oylik_id), 'actor:' || p_actor_id, null);
  v_res := jsonb_build_object('ok', true, 'tolov_id', v_tid, 'oylik_id', p_oylik_id, 'provodka_id', v_pid);
  insert into public.t2_onboarding_command_log(operation_id, actor_id, command, natija) values (p_operation_id, p_actor_id, 'bux_bank_qabul_v1', v_res);
  return v_res;
end $$;

-- 5. KASSA
create or replace function public.t2_bux_kassa_yoz_v1(p_actor_id bigint, p_kompaniya_id bigint, p_tur text, p_sana date, p_summa numeric, p_qarshi text, p_kontragent_id bigint, p_shartnoma_id bigint,
                                                      p_obyekt_id bigint, p_asos text, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_prev jsonb; v_kassa text; v_yil integer; v_raqam integer; v_id bigint; v_dt text; v_kt text; v_qoldiq numeric; v_res jsonb;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select natija into v_prev from public.t2_onboarding_command_log where operation_id = p_operation_id;
  if found then return v_prev; end if;
  perform public._t2_bux_ruxsat(p_kompaniya_id, p_actor_id, 'accounting.write');
  if p_tur is null or p_tur not in ('kirim', 'chiqim') or p_sana is null or p_summa is null or p_summa <= 0 then return jsonb_build_object('ok', false, 'code', 'KASSA_MAYDON'); end if;
  select coalesce((select m.dt_kod from public.t2_bux_moslik m where m.kompaniya_id = p_kompaniya_id and m.kalit = 'kassa.hisob' and m.dt_kod is not null), '5010') into v_kassa;
  if p_qarshi is null or p_qarshi = v_kassa or (select count(*) from public.t2_bux_hisob h where h.kompaniya_id = p_kompaniya_id and h.faol and h.kod in (v_kassa, p_qarshi)) <> 2 then return jsonb_build_object('ok', false, 'code', 'HISOB_NOTOGRI'); end if;
  if (p_kontragent_id is not null and not exists (select 1 from public.t2_kontragent k where k.id = p_kontragent_id and k.kompaniya_id = p_kompaniya_id))
     or (p_shartnoma_id is not null and not exists (select 1 from public.t2_shartnoma s where s.id = p_shartnoma_id and s.kompaniya_id = p_kompaniya_id))
     or (p_obyekt_id is not null and not exists (select 1 from public.t2_obyekt o where o.id = p_obyekt_id and o.kompaniya_id = p_kompaniya_id)) then return jsonb_build_object('ok', false, 'code', 'ANALITIKA_NOTOGRI'); end if;
  perform pg_advisory_xact_lock(hashtextextended('t2_bux_kassa:' || p_kompaniya_id, 0));
  v_yil := extract(year from p_sana)::integer;
  select coalesce(max(o.raqam), 0) + 1 into v_raqam from public.t2_bux_kassa_order o where o.kompaniya_id = p_kompaniya_id and o.yil = v_yil and o.tur = p_tur;
  insert into public.t2_bux_kassa_order(kompaniya_id, yil, tur, raqam, sana, summa, qarshi_hisob, kontragent_id, shartnoma_id, obyekt_id, asos, aktor_id)
  values (p_kompaniya_id, v_yil, p_tur, v_raqam, p_sana, round(p_summa, 2), p_qarshi, p_kontragent_id, p_shartnoma_id, p_obyekt_id, nullif(left(btrim(coalesce(p_asos, '')), 300), ''), p_actor_id) returning id into v_id;
  v_dt := case when p_tur = 'kirim' then v_kassa else p_qarshi end; v_kt := case when p_tur = 'kirim' then p_qarshi else v_kassa end;
  insert into public.t2_bux_provodka(kompaniya_id, sana, dt_kod, kt_kod, summa, kontragent_id, shartnoma_id, obyekt_id, manba_tur, manba_id, qism, tur, izoh, aktor_id)
  values (p_kompaniya_id, p_sana, v_dt, v_kt, round(p_summa, 2), p_kontragent_id, p_shartnoma_id, p_obyekt_id, 'kassa', v_id, 'asosiy', 'qolda', nullif(left(btrim(coalesce(p_asos, '')), 300), ''), p_actor_id);
  select coalesce(sum(case when p.dt_kod = v_kassa then p.summa when p.kt_kod = v_kassa then -p.summa else 0 end), 0) into v_qoldiq
    from public.t2_bux_provodka p where p.kompaniya_id = p_kompaniya_id and p.sana <= p_sana;
  perform public.t2_audit_yoz(p_kompaniya_id, 'bux_kassa_yoz', 'buxgalteriya', p_obyekt_id, format('order=%s %s №%s/%s', v_id, p_tur, v_raqam, v_yil), 'actor:' || p_actor_id, null);
  v_res := jsonb_build_object('ok', true, 'id', v_id, 'yil', v_yil, 'raqam', v_raqam, 'tur', p_tur, 'manfiy_qoldiq', v_qoldiq < 0, 'qoldiq', v_qoldiq);
  insert into public.t2_onboarding_command_log(operation_id, actor_id, command, natija) values (p_operation_id, p_actor_id, 'bux_kassa_yoz_v1', v_res);
  return v_res;
end $$;

create or replace function public.t2_bux_kassa_bekor_v1(p_actor_id bigint, p_kompaniya_id bigint, p_order_id bigint, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_prev jsonb; o public.t2_bux_kassa_order%rowtype; v_n integer; v_res jsonb;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select natija into v_prev from public.t2_onboarding_command_log where operation_id = p_operation_id;
  if found then return v_prev; end if;
  perform public._t2_bux_ruxsat(p_kompaniya_id, p_actor_id, 'accounting.write');
  select * into o from public.t2_bux_kassa_order where id = p_order_id and kompaniya_id = p_kompaniya_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'ORDER_YOQ'); end if;
  if o.holat = 'bekor' then return jsonb_build_object('ok', false, 'code', 'ALLAQACHON_BEKOR'); end if;
  insert into public.t2_bux_provodka(kompaniya_id, sana, dt_kod, kt_kod, summa, kontragent_id, shartnoma_id, obyekt_id, manba_tur, manba_id, qism, tur, storno_id, izoh, aktor_id)
  select p.kompaniya_id, p.sana, p.dt_kod, p.kt_kod, -p.summa, p.kontragent_id, p.shartnoma_id, p.obyekt_id, p.manba_tur, p.manba_id, p.qism, 'storno', p.id, 'Kassa order bekor', p_actor_id
    from public.t2_bux_provodka p where p.kompaniya_id = p_kompaniya_id and p.manba_tur = 'kassa' and p.manba_id = o.id and p.tur = 'qolda' and not exists (select 1 from public.t2_bux_provodka s where s.storno_id = p.id);
  get diagnostics v_n = row_count;
  update public.t2_bux_kassa_order set holat = 'bekor' where id = o.id;
  perform public.t2_audit_yoz(p_kompaniya_id, 'bux_kassa_bekor', 'buxgalteriya', o.obyekt_id, format('order=%s', o.id), 'actor:' || p_actor_id, null);
  v_res := jsonb_build_object('ok', true, 'storno', v_n);
  insert into public.t2_onboarding_command_log(operation_id, actor_id, command, natija) values (p_operation_id, p_actor_id, 'bux_kassa_bekor_v1', v_res);
  return v_res;
end $$;

-- O'QISH: kunlik kassa kitobi (jurnaldagi kassa hisobi harakati = yagona manba) + orderlar ro'yxati
create or replace function public.t2_bux_kassa_kitob_v1(p_kompaniya_id bigint, p_actor_id bigint, p_dan date default null, p_gacha date default null)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_dan date := coalesce(p_dan, date_trunc('month', current_date)::date); v_gacha date := coalesce(p_gacha, current_date); v_kassa text; v_och numeric; v_kunlar jsonb; v_orderlar jsonb;
begin
  perform public._t2_bux_ruxsat(p_kompaniya_id, p_actor_id, 'accounting.read');
  select coalesce((select m.dt_kod from public.t2_bux_moslik m where m.kompaniya_id = p_kompaniya_id and m.kalit = 'kassa.hisob' and m.dt_kod is not null), '5010') into v_kassa;
  select coalesce(sum(case when p.dt_kod = v_kassa then p.summa when p.kt_kod = v_kassa then -p.summa else 0 end), 0) into v_och from public.t2_bux_provodka p where p.kompaniya_id = p_kompaniya_id and p.sana < v_dan;
  select coalesce(jsonb_agg(jsonb_build_object('sana', d.sana, 'kirim', d.kirim, 'chiqim', d.chiqim, 'qoldiq', v_och + d.yurish) order by d.sana), '[]'::jsonb) into v_kunlar from (
    select g.sana, g.kirim, g.chiqim, sum(g.kirim - g.chiqim) over (order by g.sana) as yurish from (
      select p.sana, coalesce(sum(p.summa) filter (where p.dt_kod = v_kassa), 0) as kirim, coalesce(sum(p.summa) filter (where p.kt_kod = v_kassa), 0) as chiqim
        from public.t2_bux_provodka p where p.kompaniya_id = p_kompaniya_id and p.sana >= v_dan and p.sana <= v_gacha and (p.dt_kod = v_kassa or p.kt_kod = v_kassa) group by p.sana) g) d;
  select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'tur', o.tur, 'yil', o.yil, 'raqam', o.raqam, 'sana', o.sana, 'summa', o.summa, 'qarshi_hisob', o.qarshi_hisob, 'asos', o.asos,
                                               'kontragent', k.nom, 'holat', o.holat) order by o.sana, o.id), '[]'::jsonb) into v_orderlar
    from public.t2_bux_kassa_order o left join public.t2_kontragent k on k.id = o.kontragent_id and k.kompaniya_id = p_kompaniya_id
   where o.kompaniya_id = p_kompaniya_id and o.sana >= v_dan and o.sana <= v_gacha;
  return jsonb_build_object('ok', true, 'kassa_hisob', v_kassa, 'dan', v_dan, 'gacha', v_gacha, 'ochilish', v_och, 'kunlar', v_kunlar, 'orderlar', v_orderlar,
    'yopilish', v_och + coalesce((select sum((e ->> 'kirim')::numeric - (e ->> 'chiqim')::numeric) from jsonb_array_elements(v_kunlar) e), 0));
end $$;

revoke all on function public._t2_bux_kerak_v3(bigint) from public, anon, authenticated;
revoke all on function public._t2_bux_kerak_v3_asos(bigint) from public, anon, authenticated;
revoke all on function public._t2_bux_bank_mos(bigint, boolean, text) from public, anon, authenticated;
revoke all on function public.t2_bux_taqsim_saqla_v1(bigint, bigint, bigint, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.t2_bux_bank_yuklash_v1(bigint, bigint, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.t2_bux_bank_taklif_v1(bigint, bigint, integer) from public, anon, authenticated;
revoke all on function public.t2_bux_bank_qabul_v1(bigint, bigint, bigint, bigint, bigint, uuid) from public, anon, authenticated;
revoke all on function public.t2_bux_kassa_yoz_v1(bigint, bigint, text, date, numeric, text, bigint, bigint, bigint, text, uuid) from public, anon, authenticated;
revoke all on function public.t2_bux_kassa_bekor_v1(bigint, bigint, bigint, uuid) from public, anon, authenticated;
revoke all on function public.t2_bux_kassa_kitob_v1(bigint, bigint, date, date) from public, anon, authenticated;
grant execute on function public.t2_bux_taqsim_saqla_v1(bigint, bigint, bigint, jsonb, uuid) to service_role;
grant execute on function public.t2_bux_bank_yuklash_v1(bigint, bigint, jsonb, uuid) to service_role;
grant execute on function public.t2_bux_bank_taklif_v1(bigint, bigint, integer) to service_role;
grant execute on function public.t2_bux_bank_qabul_v1(bigint, bigint, bigint, bigint, bigint, uuid) to service_role;
grant execute on function public.t2_bux_kassa_yoz_v1(bigint, bigint, text, date, numeric, text, bigint, bigint, bigint, text, uuid) to service_role;
grant execute on function public.t2_bux_kassa_bekor_v1(bigint, bigint, bigint, uuid) to service_role;
grant execute on function public.t2_bux_kassa_kitob_v1(bigint, bigint, date, date) to service_role;
