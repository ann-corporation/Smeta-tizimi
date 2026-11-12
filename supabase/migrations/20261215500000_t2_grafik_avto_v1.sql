-- 20261215500000 - P6 GRAFIK (avto Gantt) + P7 CASHFLOW prognoz uchun baza qatlami (ekotizim V3).
-- Yangi hujjat/inbox jadvali YO'Q. Mavjud t2_grafik_qator (qo'lda ish qatorlari) o'zgarmaydi.
--   1. t2_grafik_sozlama: faqat OVERRIDE jadvali (obyekt sukutlari: razdel_id = 0; razdel override: razdel_id = rz.id).
--      Grafikning o'zi saqlanmaydi - smetadan har safar hisoblanadi (chel-soat / brigada / smena).
--   2. _t2_grafik_json_v1(obyekt): razdellar (o'z mehnati chel-soat, ustamasiz vazn, fakt summa va fakt sanalari),
--      SMETA/FAKT summa paketi (yagona yadro _t2_summa_paket_v1), shartnoma sanasi, F2 reestr oylari (QQS bilan),
--      to'lov oylari, override'lar.
--   3. t2_grafik_reja_v1 (pudratchi a'zosi), t2_tomon_grafik_v1 (buyurtmachi: grant resurs 'grafik' / 'korish'),
--      t2_grafik_sozlama_saqla_v1 (yozish: boss/admin/pto/prorab).
--   4. t2_tomon_resurs.grafik -> faol (jonli ko'rish; taqdim/snapshot emas).
-- DB hajmi: override qatorlari ~ 100 bayt; obyekt boshiga o'nlab qator -> << 1 MB/oy.
-- Kirill harflari U& escape bilan (CHEL = 0427 0415 041B).

create table if not exists public.t2_grafik_sozlama (
  id bigint generated always as identity primary key,
  kompaniya_id bigint not null references public.t2_kompaniya(id) on delete cascade,
  obyekt_id bigint not null references public.t2_obyekt(id) on delete cascade,
  razdel_id bigint not null default 0 check (razdel_id >= 0),
  brigada integer check (brigada is null or brigada between 1 and 1000),
  smena_soat numeric(4,1) check (smena_soat is null or (smena_soat > 0 and smena_soat <= 24)),
  boshlanish_sana date,
  kun integer check (kun is null or kun between 1 and 3650),
  versiya integer not null default 1,
  yangilandi timestamptz not null default now(),
  kim bigint,
  constraint t2_grafik_sozlama_uq unique (obyekt_id, razdel_id)
);
create index if not exists t2_grafik_sozlama_komp_idx on public.t2_grafik_sozlama (kompaniya_id);
alter table public.t2_grafik_sozlama enable row level security;

create or replace function public._t2_grafik_json_v1(p_obyekt_id bigint) returns jsonb
language plpgsql stable set search_path = public, pg_temp as $$
declare
  v_o record; v_smeta jsonb; v_fakt jsonb; v_rz jsonb; v_sana date; v_f2 jsonb; v_tolov jsonb; v_soz jsonb;
begin
  select o.id, o.nom, o.kompaniya_id, o.loyiha_id into v_o from public.t2_obyekt o where o.id = p_obyekt_id;
  if v_o.id is null then raise exception 'obyekt topilmadi' using errcode = 'P0002'; end if;

  select s.paket into v_smeta from public._t2_summa_paket_v1(array[p_obyekt_id], 'smeta') s limit 1;
  select s.paket into v_fakt from public._t2_summa_paket_v1(array[p_obyekt_id], 'fakt') s limit 1;

  with recursive
  rz as (select q.id, q.ota_id, q.daraja, q.tartib, q.nom, q.kod from public.t2_qator q
          where q.obyekt_id = p_obyekt_id and q.tur = 'rz' and q.versiya_holat = 'faol'),
  ch as (select distinct c.ota_id from public.t2_qator c
          where c.obyekt_id = p_obyekt_id and c.ota_id is not null and c.versiya_holat = 'faol'),
  sub(rz_id, qid) as (
    select rz.id, rz.id from rz
    union all
    select s.rz_id, c.id from sub s
      join public.t2_qator c on c.ota_id = s.qid and c.obyekt_id = p_obyekt_id and c.tur <> 'rz' and c.versiya_holat = 'faol'),
  leaf as (
    select s.rz_id, q.id, q.tur, q.kat, q.birlik, q.hajm, q.summa
      from sub s join public.t2_qator q on q.id = s.qid
      left join ch on ch.ota_id = q.id
     where q.tur <> 'rz' and ch.ota_id is null and public.t2_qator_asl_v1(q.change_type, q.qoshimcha, q.zamena)),
  ag as (
    select l.rz_id,
           coalesce(sum(l.hajm) filter (where l.kat = U&'\0427\0415\041B'
                      and coalesce(l.birlik, '') ~ U&'^(\0427\0415\041B|\0447\0435\043B|\0427\0435\043B)'), 0) as chel_soat,
           sum(l.summa) as summa,
           count(*) filter (where l.summa is null and l.tur in ('rs', 'mat', 'ob')) as narxsiz
      from leaf l group by l.rz_id),
  fs as (
    select l.rz_id, sum(h.fakt_summa) as fakt_summa
      from public._t2_fakt_olchov_v1(array[p_obyekt_id]) h
      join leaf l on l.id = h.qator_id
     group by l.rz_id),
  fd as (
    select s.rz_id, min(coalesce(a.sana, a.oy, aq.yaratildi::date)) as birinchi, max(coalesce(a.sana, a.oy, aq.yaratildi::date)) as oxirgi
      from public.t2_akt a
      join public.t2_akt_qator aq on aq.akt_id = a.id
      join sub s on s.qid = aq.qator_id
     where a.obyekt_id = p_obyekt_id and a.tur = 'fakt' and a.holat <> 'bekor' and coalesce(aq.hajm, 0) <> 0
     group by s.rz_id)
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', rz.id, 'ota_id', rz.ota_id, 'daraja', rz.daraja, 'tartib', rz.tartib, 'nom', rz.nom, 'kod', rz.kod,
           'chel_soat', coalesce(ag.chel_soat, 0), 'summa', ag.summa, 'narxsiz', coalesce(ag.narxsiz, 0),
           'fakt_summa', fs.fakt_summa, 'fakt_birinchi', fd.birinchi, 'fakt_oxirgi', fd.oxirgi)
         order by rz.tartib, rz.id), '[]'::jsonb)
    into v_rz
    from rz left join ag on ag.rz_id = rz.id left join fs on fs.rz_id = rz.id left join fd on fd.rz_id = rz.id;

  select min(s.sana) into v_sana from public.t2_shartnoma s
   where s.sana is not null and s.id in (select b.shartnoma_id from public.t2_shartnoma_bog b where b.obyekt_id = p_obyekt_id and b.holat = 'faol');

  -- Haqiqiy hisoblangan (F2 reestri, QQS bilan). Aktga bog'lanmagan qator - faqat shartnoma shu obyektdan iborat bo'lsa.
  select coalesce(jsonb_agg(jsonb_build_object('oy', x.oy, 'qqs_bilan', x.qqs_bilan, 'soni', x.soni, 'f3_qqs_bilan', x.f3, 'nomalum', x.nomalum) order by x.oy), '[]'::jsonb)
    into v_f2
    from (select date_trunc('month', r.oy)::date as oy,
                 sum(r.qqs_bilan) as qqs_bilan, count(*) as soni,
                 sum(r.qqs_bilan) filter (where r.forma3_id is not null) as f3,
                 count(*) filter (where r.qqs_bilan is null) as nomalum
            from public.t2_f2_reestr_jami r
            left join public.t2_akt a on a.id = r.akt_id
           where r.holat = 'faol' and r.oy is not null
             and (a.obyekt_id = p_obyekt_id
                  or (r.akt_id is null and exists (select 1 from public._t2_shartnoma_obyektlari_v1(r.shartnoma_id) y where y.obyekt_id = p_obyekt_id)
                      and not exists (select 1 from public._t2_shartnoma_obyektlari_v1(r.shartnoma_id) y where y.obyekt_id <> p_obyekt_id)))
           group by 1) x;

  select coalesce(jsonb_agg(jsonb_build_object('oy', x.oy, 'summa', x.summa) order by x.oy), '[]'::jsonb)
    into v_tolov
    from (select date_trunc('month', t.sana)::date as oy, sum(case when t.tur = 'qaytarim' then -t.summa else t.summa end) as summa
            from public.t2_tolov t
           where t.holat = 'faol'
             and (t.obyekt_id = p_obyekt_id
                  or (t.obyekt_id is null and exists (select 1 from public._t2_shartnoma_obyektlari_v1(t.shartnoma_id) y where y.obyekt_id = p_obyekt_id)
                      and not exists (select 1 from public._t2_shartnoma_obyektlari_v1(t.shartnoma_id) y where y.obyekt_id <> p_obyekt_id)))
           group by 1) x;

  select coalesce(jsonb_agg(jsonb_build_object('razdel_id', g.razdel_id, 'brigada', g.brigada, 'smena_soat', g.smena_soat,
           'boshlanish_sana', g.boshlanish_sana, 'kun', g.kun, 'versiya', g.versiya) order by g.razdel_id), '[]'::jsonb)
    into v_soz from public.t2_grafik_sozlama g where g.obyekt_id = p_obyekt_id;

  return jsonb_build_object(
    'ok', true, 'bugun', current_date,
    'obyekt', jsonb_build_object('id', v_o.id, 'nom', v_o.nom, 'kompaniya_id', v_o.kompaniya_id),
    'razdellar', v_rz, 'paket_smeta', v_smeta, 'paket_fakt', v_fakt, 'shartnoma_sana', v_sana,
    'f2_oylik', v_f2, 'tolov_oylik', v_tolov, 'sozlama', v_soz);
end $$;
revoke all on function public._t2_grafik_json_v1(bigint) from public, anon, authenticated;

create or replace function public.t2_grafik_reja_v1(p_actor_id bigint, p_kompaniya_id bigint, p_obyekt_id bigint) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  if p_obyekt_id is null or p_obyekt_id <= 0
     or not exists (select 1 from public.t2_obyekt o where o.id = p_obyekt_id and o.kompaniya_id = p_kompaniya_id) then
    raise exception 'obyekt bu kompaniyaniki emas' using errcode = '22023';
  end if;
  return public._t2_grafik_json_v1(p_obyekt_id) || jsonb_build_object('tomon', false);
end $$;

create or replace function public.t2_tomon_grafik_v1(p_actor_id bigint, p_kompaniya_id bigint, p_beruvchi_kompaniya_id bigint, p_obyekt_id bigint) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  if not public.t2_tomon_ruxsat_bor(p_kompaniya_id, p_beruvchi_kompaniya_id, 'grafik', 'korish', p_obyekt_id) then
    raise exception 'TOMON_RUXSAT_YOQ' using errcode = '42501';
  end if;
  -- Tomon ko'rinishi: override jadvali (ichki sozlama) berilmaydi.
  return (public._t2_grafik_json_v1(p_obyekt_id) - 'sozlama') || jsonb_build_object('tomon', true, 'sozlama', '[]'::jsonb);
end $$;

create or replace function public.t2_grafik_sozlama_saqla_v1(
  p_actor_id bigint, p_kompaniya_id bigint, p_obyekt_id bigint, p_razdel_id bigint,
  p_brigada integer, p_smena_soat numeric, p_boshlanish_sana date, p_kun integer,
  p_kutilgan_versiya integer, p_tozala boolean default false) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_rol text; v_ver integer;
begin
  v_rol := public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  if v_rol not in ('superadmin', 'boss', 'admin', 'pto', 'prorab') then
    raise exception 'GRAFIK_RUXSAT_YOQ' using errcode = '42501';
  end if;
  if p_obyekt_id is null or not exists (select 1 from public.t2_obyekt o where o.id = p_obyekt_id and o.kompaniya_id = p_kompaniya_id) then
    raise exception 'obyekt bu kompaniyaniki emas' using errcode = '22023';
  end if;
  if p_razdel_id is null or p_razdel_id < 0 or (p_razdel_id > 0 and not exists
      (select 1 from public.t2_qator q where q.id = p_razdel_id and q.obyekt_id = p_obyekt_id and q.tur = 'rz')) then
    raise exception 'razdel bu obyektniki emas' using errcode = '22023';
  end if;
  select g.versiya into v_ver from public.t2_grafik_sozlama g where g.obyekt_id = p_obyekt_id and g.razdel_id = p_razdel_id for update;
  if v_ver is not null and p_kutilgan_versiya is distinct from v_ver then
    return jsonb_build_object('ok', false, 'code', 'VERSIYA_ESKI', 'versiya', v_ver);
  end if;
  if coalesce(p_tozala, false) then
    delete from public.t2_grafik_sozlama where obyekt_id = p_obyekt_id and razdel_id = p_razdel_id;
    return jsonb_build_object('ok', true, 'versiya', null);
  end if;
  if v_ver is null then
    insert into public.t2_grafik_sozlama (kompaniya_id, obyekt_id, razdel_id, brigada, smena_soat, boshlanish_sana, kun, kim)
    values (p_kompaniya_id, p_obyekt_id, p_razdel_id, p_brigada, p_smena_soat, p_boshlanish_sana, p_kun, p_actor_id);
    return jsonb_build_object('ok', true, 'versiya', 1);
  end if;
  update public.t2_grafik_sozlama
     set brigada = p_brigada, smena_soat = p_smena_soat, boshlanish_sana = p_boshlanish_sana, kun = p_kun,
         versiya = versiya + 1, yangilandi = now(), kim = p_actor_id
   where obyekt_id = p_obyekt_id and razdel_id = p_razdel_id;
  return jsonb_build_object('ok', true, 'versiya', v_ver + 1);
end $$;

revoke all on function public.t2_grafik_reja_v1(bigint, bigint, bigint) from public, anon, authenticated;
revoke all on function public.t2_tomon_grafik_v1(bigint, bigint, bigint, bigint) from public, anon, authenticated;
revoke all on function public.t2_grafik_sozlama_saqla_v1(bigint, bigint, bigint, bigint, integer, numeric, date, integer, integer, boolean) from public, anon, authenticated;
grant execute on function public.t2_grafik_reja_v1(bigint, bigint, bigint) to service_role;
grant execute on function public.t2_tomon_grafik_v1(bigint, bigint, bigint, bigint) to service_role;
grant execute on function public.t2_grafik_sozlama_saqla_v1(bigint, bigint, bigint, bigint, integer, numeric, date, integer, integer, boolean) to service_role;

-- Resurs katalogi: grafik jonli ko'rish (korish) uchun faol; hujjat taqdimi (snapshot) emas.
update public.t2_tomon_resurs
   set faol = true, izoh = 'Ish grafigi va oylik hisob prognozi: smetadan avtomatik, faqat ko''rish (jonli)'
 where kalit = 'grafik';

comment on function public.t2_grafik_sozlama_saqla_v1(bigint, bigint, bigint, bigint, integer, numeric, date, integer, integer, boolean) is 'Grafik override saqlash. versiya: texnik - t2_qator faqat razdel (tur=rz) shu obyektniki ekanini tekshiradi, smeta qiymati o''qilmaydi.';
