-- T2-HR-ISHGA-001 - HR + KPI «ishga tushirish»: xodim o'z oyligi/KPI sini ko'radi, naryad donabay puli ish haqida takror to'lanmaydi,
-- KPI rol bo'yicha (faqat KO'RSATISH; pulga ta'sir sozlamasi sukut bo'yicha O'CHIQ). Dizayn: docs/architecture/HR_KPI_V1.md (§8).
-- Mavjud 20261125000000/100 ustiga quriladi; yangi jadval faqat bitta: t2_hr_kpi_qoida (rol -> ko'rsatkich -> og'irlik). Yangi xodim jadvali YO'Q:
-- xodimning yagona manbai t2_kadr_mustaqil + t2_hr_xodim (1:1 kadr_id).
-- Qarorlar (egasi o'zgartirishi mumkin, har biri BITTA joyda):
--   D1 maosh turi: baza_turi 'donabay' (naryad bo'yicha) | 'oylik' | 'kunlik'       -> t2_hr_xodim.baza_turi (+ frontend lib/hr/qarorlar.ts HR_ROL_BAZA_TURI)
--   D2 KPI rol bo'yicha: _t2_hr_kpi_qoida_v1 (sukut qiymatlar) + t2_hr_kpi_qoida (kompaniya o'zgartirishi)
--   D3 KPI pulga ta'siri: t2_hr_sozlama.kpi_pulga_tasir (sukut false)
-- NULL = noma'lum (0 emas). Pul round(x,2) (yarim noldan uzoq) = frontend yaxlit2. Lokal yaxlitlash faqat SQL ichida (hisob yagona manbasi).

-- 1. Sozlama + cheklovlar ---------------------------------------------------------------------------------------------------------
alter table public.t2_hr_sozlama add column if not exists kpi_pulga_tasir boolean not null default false;
comment on column public.t2_hr_sozlama.kpi_pulga_tasir is 'D3: true bo''lsa F2 foizli KPI bonusi ish haqiga qo''shiladi; false (sukut) - KPI faqat ko''rsatiladi, pulga ta''sir qilmaydi.';

alter table public.t2_hr_xodim drop constraint if exists t2_hr_xodim_baza_turi_check;
alter table public.t2_hr_xodim add constraint t2_hr_xodim_baza_turi_check check (baza_turi in ('oylik', 'kunlik', 'donabay'));
alter table public.t2_hr_xodim drop constraint if exists t2_hr_xodim_rol_check;
alter table public.t2_hr_xodim add constraint t2_hr_xodim_rol_check check (rol in ('prorab', 'brigadir', 'usta', 'ishchi', 'muhandis', 'pto', 'boshqa'));
comment on column public.t2_hr_xodim.baza_turi is 'oylik: oklad | kunlik: kunlik stavka | donabay: baza 0, pul naryad (t2_naryad -> t2_xarajat) orqali to''lanadi, tabel bilan takror to''lanmaydi.';

-- Naryad usta bog'i (PR naryad-usta-birlik bilan bir xil ta'rif; idempotent). Jadval yo'q bo'lsa - o'tkazib yuboriladi.
do $naryad$
begin
  if to_regclass('public.t2_naryad') is not null then
    execute 'alter table public.t2_naryad add column if not exists usta_foydalanuvchi_id bigint references public.t2_foydalanuvchi(id) on delete set null';
  end if;
end $naryad$;

-- 2. KPI qoidalari jadvali (kompaniya sukutni almashtiradi) -----------------------------------------------------------------------
create table if not exists public.t2_hr_kpi_qoida (
  id bigserial primary key,
  kompaniya_id bigint not null references public.t2_kompaniya(id) on delete cascade,
  rol text not null check (rol in ('prorab', 'brigadir', 'usta', 'ishchi', 'muhandis', 'pto', 'boshqa')),
  korsatkich text not null check (korsatkich in ('f2_hajm', 'f2_vaqtida', 'aosr_vaqtida', 'naryad_qabul', 'davomat')),
  ogirlik numeric(6,2) not null check (ogirlik >= 0 and ogirlik <= 100),
  maqsad numeric check (maqsad is null or maqsad > 0),
  chegara_kun integer check (chegara_kun is null or (chegara_kun between 1 and 90)),
  yangilandi timestamptz not null default now(),
  kim text,
  unique (kompaniya_id, rol, korsatkich)
);
comment on table public.t2_hr_kpi_qoida is 'KPI qoidasi: rol -> ko''rsatkich -> og''irlik. Rol uchun qator bo''lmasa _t2_hr_kpi_qoida_v1 sukut qiymatlari ishlaydi. maqsad NULL = ball hisoblanmaydi (faqat qiymat ko''rsatiladi).';
alter table public.t2_hr_kpi_qoida enable row level security;
revoke all on public.t2_hr_kpi_qoida from anon, authenticated;
revoke all on sequence public.t2_hr_kpi_qoida_id_seq from anon, authenticated;

-- 3. Yordamchilar -----------------------------------------------------------------------------------------------------------------
create or replace function public._t2_hr_naryad_bor_v1()
returns boolean language sql stable set search_path = public, pg_temp as $$
  select to_regclass('public.t2_naryad') is not null
     and exists (select 1 from pg_attribute where attrelid = to_regclass('public.t2_naryad') and attname = 'usta_foydalanuvchi_id' and not attisdropped)
$$;

-- Sukut qoidalar (D2). Kompaniya shu rol uchun o'z qatorini yozgan bo'lsa - faqat uniki.
create or replace function public._t2_hr_kpi_qoida_v1(p_kompaniya_id bigint)
returns table(rol text, korsatkich text, ogirlik numeric, maqsad numeric, chegara_kun integer, manba text)
language sql stable security definer set search_path = public, pg_temp as $$
  with sukut(rol, korsatkich, ogirlik, maqsad, chegara_kun) as (values
    ('prorab'::text, 'f2_hajm'::text, 70::numeric, null::numeric, null::integer),
    ('prorab', 'davomat', 30, 100, null),
    ('pto', 'f2_vaqtida', 40, 100, 10),
    ('pto', 'aosr_vaqtida', 40, 100, 10),
    ('pto', 'davomat', 20, 100, null),
    ('brigadir', 'naryad_qabul', 70, null, null),
    ('brigadir', 'davomat', 30, 100, null),
    ('usta', 'davomat', 100, 100, null),
    ('ishchi', 'davomat', 100, 100, null),
    ('muhandis', 'davomat', 100, 100, null),
    ('boshqa', 'davomat', 100, 100, null))
  select c.rol, c.korsatkich, c.ogirlik, c.maqsad, c.chegara_kun, 'kompaniya'::text
    from public.t2_hr_kpi_qoida c where c.kompaniya_id = p_kompaniya_id
  union all
  select s.rol, s.korsatkich, s.ogirlik, s.maqsad, s.chegara_kun, 'sukut'::text
    from sukut s where not exists (select 1 from public.t2_hr_kpi_qoida c where c.kompaniya_id = p_kompaniya_id and c.rol = s.rol)
$$;

-- Oy ichida to'langan naryad (t2_xarajat, kat = mehnat) - xodim foydalanuvchisi bo'yicha. Yangi xarajat QATORI yaratilmaydi: faqat o'qiladi.
create or replace function public._t2_hr_naryad_oy_v1(p_kompaniya_id bigint, p_oy date)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_res jsonb := '{}'::jsonb; v_oxir date := (p_oy + interval '1 month')::date;
begin
  if not public._t2_hr_naryad_bor_v1() then return v_res; end if;
  select coalesce(jsonb_object_agg(z.uid::text, jsonb_build_object('summa', z.summa, 'soni', z.soni, 'davrlar', z.davrlar)), '{}'::jsonb)
    into v_res
    from (
      select n.usta_foydalanuvchi_id as uid, sum(x.summa) as summa, count(distinct n.id)::int as soni,
             coalesce(jsonb_agg(distinct jsonb_build_array(n.davr_dan, n.davr_gacha)) filter (where n.davr_dan is not null and n.davr_gacha is not null), '[]'::jsonb) as davrlar
        from public.t2_naryad n
        join public.t2_xarajat x on x.kompaniya_id = n.kompaniya_id
                                and x.hujjat_ref = 'naryad ' || chr(8470) || n.raqam
                                and x.kat = U&'\0427\0415\041B' and x.holat = 'faol'
       where n.kompaniya_id = p_kompaniya_id and n.usta_foydalanuvchi_id is not null and n.holat <> 'bekor'
         and x.sana >= p_oy and x.sana < v_oxir
       group by n.usta_foydalanuvchi_id) z;
  return v_res;
end $$;

-- 4. KPI ko'rsatkichlari: BITTA batch (barcha xodimlar), mavjud jadvallardan. Noma'lum = NULL (0 emas). Faqat ko'rsatish.
create or replace function public._t2_hr_kpi_hisob_v1(p_kompaniya_id bigint, p_oy date, p_hisob jsonb)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_oxir date := (p_oy + interval '1 month')::date; v_nar jsonb := '{}'::jsonb; v_bor boolean; v_res jsonb;
begin
  v_bor := public._t2_hr_naryad_bor_v1();
  if v_bor then
    select coalesce(jsonb_object_agg(z.uid::text, z.n), '{}'::jsonb) into v_nar
      from (select n.usta_foydalanuvchi_id as uid, count(*)::int as n from public.t2_naryad n
             where n.kompaniya_id = p_kompaniya_id and n.usta_foydalanuvchi_id is not null and n.holat in ('qabul', 'hisoblandi')
               and (n.qabul_sana at time zone 'Asia/Tashkent')::date >= p_oy and (n.qabul_sana at time zone 'Asia/Tashkent')::date < v_oxir
             group by n.usta_foydalanuvchi_id) z;
  end if;

  with h as (
    select (e->>'kadr_id')::bigint as kadr_id, e->>'rol' as rol, nullif(e->>'kun_ishlagan', '')::numeric as kun, nullif(e->>'norma_kun', '')::numeric as norma
      from jsonb_array_elements(p_hisob) e),
  x as (select h.*, k.foydalanuvchi_id as uid from h join public.t2_kadr_mustaqil k on k.id = h.kadr_id),
  q as (select * from public._t2_hr_kpi_qoida_v1(p_kompaniya_id)),
  ind as (
    select x.kadr_id, q.korsatkich, q.ogirlik, q.maqsad,
      case q.korsatkich
        when 'davomat' then
          case when x.kun is null or coalesce(x.norma, 0) = 0 then null else round(x.kun * 100 / x.norma, 1) end
        when 'f2_hajm' then (
          select case when not exists (select 1 from public.t2_kadr_bog b0 where b0.kadr_id = x.kadr_id and b0.holat = 'faol') then null
                      when count(s.id) = 0 then 0::numeric
                      when count(s.id) filter (where s.summa is not null) = 0 then null
                      else sum(round(s.summa * b.ulush_foiz / 100, 2)) end
            from public.t2_kadr_bog b
            left join lateral (
              select a.id,
                     (select case when count(*) = 0 or bool_or(q2.summa is null) then null else sum(q2.summa) end from public.t2_akt_qator q2 where q2.akt_id = a.id) as summa
                from public.t2_akt a
               where a.kompaniya_id = p_kompaniya_id and a.obyekt_id = b.obyekt_id and a.tur = 'f2' and a.holat in ('tasdiqlangan', 'yakunlangan')
                 and coalesce(a.lifecycle_status, 'approved') = 'approved'
                 and (coalesce(a.lifecycle_approved_at, a.yangilandi) at time zone 'Asia/Tashkent')::date >= p_oy
                 and (coalesce(a.lifecycle_approved_at, a.yangilandi) at time zone 'Asia/Tashkent')::date < v_oxir
                 and (b.dan is null or b.dan <= (coalesce(a.lifecycle_approved_at, a.yangilandi) at time zone 'Asia/Tashkent')::date)
                 and (b.gacha is null or b.gacha >= (coalesce(a.lifecycle_approved_at, a.yangilandi) at time zone 'Asia/Tashkent')::date)
            ) s on true
           where b.kadr_id = x.kadr_id and b.holat = 'faol')
        when 'f2_vaqtida' then (
          select case when count(*) = 0 then null
                      else round(100.0 * count(*) filter (where coalesce(a.lifecycle_approved_at, a.yangilandi) <= a.yaratildi + make_interval(days => coalesce(q.chegara_kun, 10))) / count(*), 1) end
            from public.t2_akt a
           where x.uid is not null and a.kompaniya_id = p_kompaniya_id and a.tur = 'f2' and a.kim = 'actor:' || x.uid
             and a.holat in ('tasdiqlangan', 'yakunlangan') and coalesce(a.lifecycle_status, 'approved') = 'approved'
             and (coalesce(a.lifecycle_approved_at, a.yangilandi) at time zone 'Asia/Tashkent')::date >= p_oy
             and (coalesce(a.lifecycle_approved_at, a.yangilandi) at time zone 'Asia/Tashkent')::date < v_oxir)
        when 'aosr_vaqtida' then (
          select case when count(*) = 0 then null
                      else round(100.0 * count(*) filter (where r.tasdiq_vaqti <= r.yaratildi + make_interval(days => coalesce(q.chegara_kun, 10))) / count(*), 1) end
            from public.t2_aosr r
           where x.uid is not null and r.kompaniya_id = p_kompaniya_id and r.kim = 'actor:' || x.uid and r.holat = 'tasdiqlangan' and r.tasdiq_vaqti is not null
             and (r.tasdiq_vaqti at time zone 'Asia/Tashkent')::date >= p_oy and (r.tasdiq_vaqti at time zone 'Asia/Tashkent')::date < v_oxir)
        when 'naryad_qabul' then
          case when x.uid is null or not v_bor then null else coalesce((v_nar->>(x.uid::text))::numeric, 0) end
      end as qiymat,
      case q.korsatkich when 'f2_hajm' then 'som' when 'naryad_qabul' then 'ta' else '%' end as birlik,
      case q.korsatkich when 'davomat' then 't2_hr_tabel' when 'aosr_vaqtida' then 't2_aosr' when 'naryad_qabul' then 't2_naryad' else 't2_akt' end as manba
      from x join q on q.rol = x.rol),
  bl as (select i.*, case when i.qiymat is null or i.maqsad is null then null else round(least(i.qiymat * 100 / i.maqsad, 100), 1) end as ball from ind i)
  select coalesce(jsonb_object_agg(g.kadr_id::text, g.obj), '{}'::jsonb) into v_res
    from (
      select b.kadr_id,
             jsonb_build_object(
               'korsatkichlar', jsonb_agg(jsonb_build_object('kod', b.korsatkich, 'ogirlik', b.ogirlik, 'qiymat', b.qiymat, 'maqsad', b.maqsad,
                                  'ball', b.ball, 'birlik', b.birlik, 'manba', b.manba) order by b.ogirlik desc, b.korsatkich),
               'ball', case when coalesce(sum(b.ogirlik) filter (where b.ball is not null), 0) > 0
                            then round(sum(b.ball * b.ogirlik) filter (where b.ball is not null) / sum(b.ogirlik) filter (where b.ball is not null), 1) end,
               'qamrov', round(100 * coalesce(sum(b.ogirlik) filter (where b.ball is not null), 0) / nullif(sum(b.ogirlik), 0), 0)) as obj
        from bl b group by b.kadr_id) g;
  return v_res;
end $$;

-- 5. Yagona hisob (kengaytirilgan). Eski funksiya ASOS bo'lib qoladi; shu qatlam: baza (naryad kunlari chiqarib), KPI pulga ta'siri (D3),
--    naryad donabay qismi, KPI ko'rsatkichlari. Chaqiruvchilar (kpi_v1, oylik_hisobla_v1) o'zgarmaydi.
do $rename$
begin
  if to_regprocedure('public._t2_hr_hisob_asos_v1(bigint, date, bigint[])') is null then
    alter function public._t2_hr_hisob_v1(bigint, date, bigint[]) rename to _t2_hr_hisob_asos_v1;
  end if;
end $rename$;

create or replace function public._t2_hr_hisob_v1(p_kompaniya_id bigint, p_oy date, p_kadr_ids bigint[] default null)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_asos jsonb; v_kp jsonb; v_nr jsonb; v_bor boolean; v_tasir boolean; v_out jsonb := '[]'::jsonb;
  e jsonb; v_kid bigint; v_uid bigint; v_tk jsonb; v_nk int; v_nsum numeric; v_nsoni int;
  v_turi text; v_bs numeric; v_kun int; v_norma int; v_baza numeric; v_kpi numeric; v_kpiq numeric; v_bonus numeric; v_jarima numeric;
  v_hisob numeric; v_s numeric; v_ndfl numeric; v_inps numeric; v_sof numeric; v_toliq boolean; v_og text[]; v_nf numeric; v_if numeric;
  v_soz public.t2_hr_sozlama%rowtype;
begin
  v_asos := public._t2_hr_hisob_asos_v1(p_kompaniya_id, p_oy, p_kadr_ids);
  if jsonb_array_length(v_asos) = 0 then return v_asos; end if;
  select * into v_soz from public.t2_hr_sozlama where kompaniya_id = p_kompaniya_id;
  v_tasir := coalesce(v_soz.kpi_pulga_tasir, false);
  v_bor := public._t2_hr_naryad_bor_v1();
  v_nr := public._t2_hr_naryad_oy_v1(p_kompaniya_id, p_oy);
  v_kp := public._t2_hr_kpi_hisob_v1(p_kompaniya_id, p_oy, v_asos);

  for e in select value from jsonb_array_elements(v_asos) loop
    v_kid := (e->>'kadr_id')::bigint;
    select k.foydalanuvchi_id into v_uid from public.t2_kadr_mustaqil k where k.id = v_kid;
    v_turi := e->>'baza_turi'; v_bs := nullif(e->>'baza_summa', '')::numeric;
    v_kun := nullif(e->>'kun_ishlagan', '')::int; v_norma := coalesce(nullif(e->>'norma_kun', '')::int, 0);
    v_kpi := nullif(e->>'kpi_f2', '')::numeric; v_bonus := coalesce(nullif(e->>'bonus', '')::numeric, 0); v_jarima := coalesce(nullif(e->>'jarima', '')::numeric, 0);
    v_nf := nullif(e->>'ndfl_foiz', '')::numeric; v_if := nullif(e->>'inps_foiz', '')::numeric;
    v_og := array(select jsonb_array_elements_text(coalesce(e->'ogohlantirish', '[]'::jsonb)));

    -- naryad (donabay) qismi: shu oyda t2_xarajat ga yozilgan mehnat puli. Tizim yo'q bo'lsa - NULL (noma'lum), 0 emas.
    v_nsum := null; v_nsoni := null; v_nk := 0; v_tk := null;
    if v_bor then
      if v_uid is not null then
        v_nsum := coalesce((v_nr->(v_uid::text)->>'summa')::numeric, 0);
        v_nsoni := coalesce((v_nr->(v_uid::text)->>'soni')::int, 0);
        select t.kunlar into v_tk from public.t2_hr_tabel t where t.kadr_id = v_kid and t.oy = p_oy;
        if v_tk is not null and v_nr ? (v_uid::text) then
          -- takror to'lov YO'Q: naryad davri ichidagi tabel kunlari baza hisobiga kirmaydi
          select count(*)::int into v_nk from jsonb_each_text(v_tk) t
           where t.value = 'K' and exists (
             select 1 from jsonb_array_elements(v_nr->(v_uid::text)->'davrlar') d
              where make_date(extract(year from p_oy)::int, extract(month from p_oy)::int, t.key::int) between (d->>0)::date and (d->>1)::date);
        end if;
      else
        v_nsum := 0; v_nsoni := 0;
      end if;
    end if;

    v_baza := case when v_turi = 'donabay' then 0
                   when v_bs is null or v_kun is null then null
                   when v_turi = 'kunlik' then round(v_bs * greatest(v_kun - v_nk, 0), 2)
                   when v_norma > 0 then round(v_bs * greatest(v_kun - v_nk, 0) / v_norma, 2)
                   else null end;
    v_kpiq := case when v_tasir then coalesce(v_kpi, 0) else 0 end;
    v_hisob := case when v_baza is null then null else round(v_baza + v_kpiq + v_bonus - v_jarima, 2) end;
    v_s := case when v_hisob is null then null else greatest(v_hisob, 0) end;
    v_ndfl := case when v_s is null or v_nf is null then null else round(v_s * v_nf / 100, 2) end;
    v_inps := case when v_s is null or v_if is null then null else round(v_s * v_if / 100, 2) end;
    v_sof := case when v_hisob is null or v_ndfl is null or v_inps is null then null else round(v_hisob - v_ndfl - v_inps, 2) end;

    v_og := array_remove(array_remove(v_og, 'manfiy'), case when v_tasir then null else 'f2_summa_nomalum' end);
    if v_turi = 'donabay' then v_og := array_remove(array_remove(array_remove(v_og, 'baza_nomalum'), 'tabel_yoq'), 'tabel_tasdiqlanmagan'); end if;
    if v_nk > 0 then v_og := array_append(v_og, 'naryad_kunlari_chiqarildi'); end if;
    if v_hisob is not null and v_hisob < 0 then v_og := array_append(v_og, 'manfiy'); end if;
    v_toliq := v_baza is not null
               and (not v_tasir or (not (e->>'f2_foiz' is not null and v_kpi is null) and coalesce((e->>'f2_nomalum_soni')::int, 0) = 0))
               and not ('tuzatma_nomalum' = any(v_og)) and v_nf is not null and v_if is not null;

    v_out := v_out || (e || jsonb_build_object(
      'baza', v_baza, 'kpi_pulga_tasir', v_tasir, 'kpi_f2_qollandi', v_kpiq,
      'hisoblangan', v_hisob, 'ndfl', v_ndfl, 'inps', v_inps, 'sof', v_sof, 'toliq', v_toliq, 'ogohlantirish', to_jsonb(v_og),
      'naryad_summa', v_nsum, 'naryad_soni', v_nsoni, 'naryad_kun', v_nk,
      'jami_daromad', case when v_hisob is null then null else round(v_hisob + coalesce(v_nsum, 0), 2) end,
      'qolga', v_sof, 'kpi', v_kp->(v_kid::text)));
  end loop;
  return v_out;
end $$;

-- ===================== O'QISH =====================

-- Xodim FAQAT o'z qatorini ko'radi (foydalanuvchi_id = actor). Boshqa xodim parametri YO'Q. Ruxsat: kompaniya a'zoligi (hr.* shart emas).
create or replace function public.t2_hr_men_v1(p_kompaniya_id bigint, p_actor_id bigint, p_oy text default null)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_kadr bigint; v_oy date; v_oy_t text; v_rows jsonb; v_qator jsonb; v_saq public.t2_hr_oylik%rowtype; v_saq_bor boolean := false; v_oylar jsonb;
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  v_oy_t := coalesce(p_oy, to_char(now() at time zone 'Asia/Tashkent', 'YYYY-MM'));
  v_oy := public._t2_hr_oy_v1(v_oy_t);
  select k.id into v_kadr from public.t2_kadr_mustaqil k
   where k.kompaniya_id = p_kompaniya_id and k.foydalanuvchi_id = p_actor_id and coalesce(k.holat, 'faol') <> 'bekor' order by k.id limit 1;
  if v_kadr is null then
    return jsonb_build_object('ok', true, 'oy', v_oy_t, 'bog_langan', false, 'hr_karta', false, 'oylar', jsonb_build_array(v_oy_t));
  end if;
  select coalesce(jsonb_agg(m.oy_t order by m.oy_t desc), '[]'::jsonb) into v_oylar
    from (select distinct to_char(z.oy, 'YYYY-MM') as oy_t
            from (select t.oy from public.t2_hr_tabel t where t.kadr_id = v_kadr
                  union select y.oy from public.t2_hr_oylik y where y.kadr_id = v_kadr and y.holat = 'tasdiqlangan'
                  union select date_trunc('month', now() at time zone 'Asia/Tashkent')::date
                  union select v_oy) z
           order by 1 desc limit 13) m;
  select * into v_saq from public.t2_hr_oylik y where y.kadr_id = v_kadr and y.oy = v_oy and y.holat = 'tasdiqlangan';
  v_saq_bor := found;
  if v_saq_bor then
    v_qator := v_saq.tafsilot;
  else
    v_rows := public._t2_hr_hisob_v1(p_kompaniya_id, v_oy, array[v_kadr]);
    v_qator := v_rows->0;
  end if;
  -- moliyaviy tafsilot (F2 aktlari, F2 summasi) xodimga berilmaydi: faqat o'z KPI ko'rsatkichi va ish haqi.
  if v_qator is not null then v_qator := v_qator - 'aktlar' - 'f2_summa' - 'sxema_id' - 'f2_foiz' - 'f2_baza' - 'f2_rejim'; end if;
  return jsonb_build_object('ok', true, 'oy', v_oy_t, 'bog_langan', true, 'hr_karta', v_qator is not null,
    'holat', case when v_saq_bor then 'tasdiqlangan' else 'taxminiy' end, 'oylar', v_oylar, 'qator', v_qator);
end $$;

-- Sozlama ekrani uchun: KPI qoidalari (samarali), KPI pulga ta'siri, tizim foydalanuvchilari (faqat hr.write; xodimni foydalanuvchiga ulash uchun).
create or replace function public.t2_hr_qoida_v1(p_kompaniya_id bigint, p_actor_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_yoz boolean;
begin
  perform public._t2_hr_ruxsat_v1(p_kompaniya_id, p_actor_id, array['hr.read', 'payroll.read', 'hr.write']);
  v_yoz := public.t2_permission_allowed_v2(p_kompaniya_id, p_actor_id, 'hr.write');
  return jsonb_build_object('ok', true,
    'kpi_pulga_tasir', coalesce((select z.kpi_pulga_tasir from public.t2_hr_sozlama z where z.kompaniya_id = p_kompaniya_id), false),
    'qoidalar', coalesce((select jsonb_agg(jsonb_build_object('rol', q.rol, 'korsatkich', q.korsatkich, 'ogirlik', q.ogirlik, 'maqsad', q.maqsad,
                 'chegara_kun', q.chegara_kun, 'manba', q.manba) order by q.rol, q.ogirlik desc, q.korsatkich)
                 from public._t2_hr_kpi_qoida_v1(p_kompaniya_id) q), '[]'::jsonb),
    'azolar', case when v_yoz then coalesce((select jsonb_agg(jsonb_build_object('foydalanuvchi_id', f.id, 'ism', coalesce(nullif(btrim(f.ism), ''), f.login), 'rol', a.rol,
                 'kadr_id', (select k.id from public.t2_kadr_mustaqil k where k.kompaniya_id = p_kompaniya_id and k.foydalanuvchi_id = f.id and coalesce(k.holat, 'faol') <> 'bekor' order by k.id limit 1))
                 order by f.ism, f.id)
                 from public.t2_azolik a join public.t2_foydalanuvchi f on f.id = a.foydalanuvchi_id
                where a.kompaniya_id = p_kompaniya_id and a.holat = 'faol'), '[]'::jsonb) end);
end $$;

-- ===================== YOZISH =====================

create or replace function public.t2_hr_kpi_qoida_saqla_v1(p_actor_id bigint, p_kompaniya_id bigint, p_qoidalar jsonb, p_kpi_pulga boolean, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_prev jsonb; v_e jsonb; v_rol text; v_roller text[] := array[]::text[]; v_n int := 0;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select natija into v_prev from public.t2_onboarding_command_log where operation_id = p_operation_id;
  if found then return v_prev; end if;
  perform public._t2_hr_ruxsat_v1(p_kompaniya_id, p_actor_id, array['payroll.write']);
  if p_qoidalar is null and p_kpi_pulga is null then return jsonb_build_object('ok', false, 'code', 'BOSH_SOROV'); end if;
  if p_qoidalar is not null and (jsonb_typeof(p_qoidalar) <> 'array' or jsonb_array_length(p_qoidalar) > 60) then
    return jsonb_build_object('ok', false, 'code', 'QOIDALAR_0_60');
  end if;
  for v_e in select value from jsonb_array_elements(coalesce(p_qoidalar, '[]'::jsonb)) loop
    v_rol := v_e->>'rol';
    if v_rol is null or v_rol not in ('prorab', 'brigadir', 'usta', 'ishchi', 'muhandis', 'pto', 'boshqa') then raise exception 'ROL_INVALID: %', coalesce(v_rol, 'null'); end if;
    if not (v_rol = any(v_roller)) then
      delete from public.t2_hr_kpi_qoida where kompaniya_id = p_kompaniya_id and rol = v_rol;
      v_roller := v_roller || v_rol;
    end if;
    if coalesce((v_e->>'qayta_sukut')::boolean, false) then continue; end if;
    if coalesce(v_e->>'korsatkich', '') not in ('f2_hajm', 'f2_vaqtida', 'aosr_vaqtida', 'naryad_qabul', 'davomat') then raise exception 'KORSATKICH_INVALID: %', v_e->>'korsatkich'; end if;
    insert into public.t2_hr_kpi_qoida (kompaniya_id, rol, korsatkich, ogirlik, maqsad, chegara_kun, kim)
    values (p_kompaniya_id, v_rol, v_e->>'korsatkich', (v_e->>'ogirlik')::numeric, nullif(v_e->>'maqsad', '')::numeric, nullif(v_e->>'chegara_kun', '')::int, 'actor:' || p_actor_id)
    on conflict (kompaniya_id, rol, korsatkich) do update set ogirlik = excluded.ogirlik, maqsad = excluded.maqsad, chegara_kun = excluded.chegara_kun,
      yangilandi = now(), kim = excluded.kim;
    v_n := v_n + 1;
  end loop;
  if p_kpi_pulga is not null then
    insert into public.t2_hr_sozlama (kompaniya_id, kpi_pulga_tasir, kim) values (p_kompaniya_id, p_kpi_pulga, 'actor:' || p_actor_id)
    on conflict (kompaniya_id) do update set kpi_pulga_tasir = excluded.kpi_pulga_tasir, versiya = public.t2_hr_sozlama.versiya + 1, yangilandi = now(), kim = excluded.kim;
  end if;
  perform public.t2_audit_yoz(p_kompaniya_id, 'hr_kpi_qoida_saqla', 'hr', null, format('qoida=%s rol=%s pulga=%s', v_n, coalesce(array_length(v_roller, 1), 0), coalesce(p_kpi_pulga::text, '-')), 'actor:' || p_actor_id, null);
  return public._t2_hr_log_v1(p_operation_id, p_actor_id, 'hr_kpi_qoida_saqla_v1', jsonb_build_object('ok', true, 'qoida_soni', v_n, 'rol_soni', coalesce(array_length(v_roller, 1), 0)));
end $$;

-- Grantlar: sibling t2_hr_* RPC lari bilan bir xil (faqat service_role).
do $grants$
declare f text;
begin
  foreach f in array array[
    'public._t2_hr_naryad_bor_v1()', 'public._t2_hr_kpi_qoida_v1(bigint)', 'public._t2_hr_naryad_oy_v1(bigint, date)',
    'public._t2_hr_kpi_hisob_v1(bigint, date, jsonb)', 'public._t2_hr_hisob_asos_v1(bigint, date, bigint[])', 'public._t2_hr_hisob_v1(bigint, date, bigint[])',
    'public.t2_hr_men_v1(bigint, bigint, text)', 'public.t2_hr_qoida_v1(bigint, bigint)',
    'public.t2_hr_kpi_qoida_saqla_v1(bigint, bigint, jsonb, boolean, uuid)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $grants$;
