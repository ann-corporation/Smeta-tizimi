-- 20261116400000_t2_obyekt_paket_v1 — OBYEKT PAKETI (ADR docs/architecture/OBYEKT_PAKET_OFFLINE_DESKTOP_V1.md §1.2, PR1).
--
-- Bitta chaqiruvda butun obyekt (faqat FAOL smeta versiyasi): qatorlar (t2_daraxt ustunlari) + holat (t2_qator_holat
-- ning xom ustunlari) + F2 ro'yxati + meta (nakrutka, versiyalar). USTUNLI JSON: har maydon — tartib bo'yicha massiv,
-- takrorlanuvchi matnlar (nom/kod/birlik/kat) lug'at indeksi. Hosila ustunlar (smeta_*, qoldiq_*, f2_mumkin_*, f2_narx,
-- fakt_narx, f2_narx_farq_foiz) YUBORILMAYDI — mijoz yadrosi hisoblaydi.
--
-- Hisob manbai bitta: holat qiymatlari aynan `t2_qator_holat` view'idan, nakrutka — `t2_obyekt_nakrutka_v1` dan
-- (parallel formula yozilmaydi).
--
-- Kodlash (mijoz: frontend/src/ombor/paket.ts):
--   * massivlar `tartib, id` bo'yicha; NULL — null (0 emas);
--   * q.tur — lugat.tur indeksi; q.nom/kod/birlik/kat — lug'at indeksi yoki null;
--   * q.qoshimcha/zamena, h.fakt_manbasi — 0/1 (fakt_manbasi: 0 DIRECT, 1 BL_NORMA);
--   * q.xom_qator, h.almashtirilgan_hajm/summa — siyrak obyekt {id: qiymat} (yo'q kalit — null / 0 / 0);
--   * qaytish turi `json` (jsonb emas): massivlar bo'sh joysiz chiqadi — 26k qatorli obyektda ~20% kam bayt.
--     Boshida rev/meta_rev turadi — shlyuz birinchi bo'lakdan o'qiydi (JSON parse qilmasdan).

create or replace function public.t2_obyekt_paket_v1(p_obyekt_id bigint, p_actor_id bigint)
returns json
language plpgsql stable security definer
set search_path to 'public', 'pg_temp'
set work_mem to '32MB'
as $$
declare
  v_komp bigint; v_nom text; v_r public.t2_obyekt_rev; v_nk jsonb; v_meta json; v_f2 json; v_asos record;
begin
  if p_obyekt_id is null or p_obyekt_id <= 0 then raise exception 'obyekt_id majburiy' using errcode = '22023'; end if;
  select o.kompaniya_id, o.nom into v_komp, v_nom from public.t2_obyekt o where o.id = p_obyekt_id;
  if v_komp is null then raise exception 'obyekt topilmadi' using errcode = 'P0002'; end if;
  perform public.t2_actor_kompaniya_azo_tekshir(v_komp, p_actor_id);

  -- STABLE funksiya: barcha so'rovlar bitta snapshot'da — rev va ma'lumot o'zaro mos.
  select * into v_r from public.t2_obyekt_rev where obyekt_id = p_obyekt_id;

  with q as (
    select q.id, q.ota_id, q.daraja, q.tartib, q.tur, q.kat, q.kod, q.nom, q.birlik, q.hajm, q.narx, q.summa, q.norma,
           q.narx_usul, q.versiya, q.qoshimcha, q.zamena, q.xom_qator,
           h.fakt_hajm, h.fakt_summa, h.f2_hajm, h.f2_summa, h.f2_summa_nomalum, h.direct_fakt_hajm, h.fakt_manbasi,
           h.almashtirilgan_hajm, h.almashtirilgan_summa
      from public.t2_qator q
      join public.t2_qator_holat h on h.id = q.id and h.obyekt_id = p_obyekt_id
     where q.obyekt_id = p_obyekt_id and q.versiya_holat = 'faol'
  ), ln as (select v, (row_number() over (order by v)) - 1 i from (select distinct nom v from q where nom is not null) s),
     lk as (select v, (row_number() over (order by v)) - 1 i from (select distinct kod v from q where kod is not null) s),
     lb as (select v, (row_number() over (order by v)) - 1 i from (select distinct birlik v from q where birlik is not null) s),
     lc as (select v, (row_number() over (order by v)) - 1 i from (select distinct kat v from q where kat is not null) s),
  qx as (
    select q.*, ln.i nom_i, lk.i kod_i, lb.i birlik_i, lc.i kat_i,
           array_position(array['rz','bl','rs','mat','ob'], q.tur) - 1 tur_i
      from q left join ln on ln.v = q.nom left join lk on lk.v = q.kod
             left join lb on lb.v = q.birlik left join lc on lc.v = q.kat
  )
  select
    count(*) soni,
    json_build_object(
      'nom', (select coalesce(array_to_json(array_agg(v order by i)), '[]'::json) from ln),
      'kod', (select coalesce(array_to_json(array_agg(v order by i)), '[]'::json) from lk),
      'birlik', (select coalesce(array_to_json(array_agg(v order by i)), '[]'::json) from lb),
      'tur', json_build_array('rz','bl','rs','mat','ob'),
      'kat', (select coalesce(array_to_json(array_agg(v order by i)), '[]'::json) from lc)) lugat,
    json_build_object(
      'id', coalesce(array_to_json(array_agg(id order by tartib, id)), '[]'::json),
      'ota_id', coalesce(array_to_json(array_agg(ota_id order by tartib, id)), '[]'::json),
      'daraja', coalesce(array_to_json(array_agg(daraja order by tartib, id)), '[]'::json),
      'tartib', coalesce(array_to_json(array_agg(tartib order by tartib, id)), '[]'::json),
      'tur', coalesce(array_to_json(array_agg(tur_i order by tartib, id)), '[]'::json),
      'kat', coalesce(array_to_json(array_agg(kat_i order by tartib, id)), '[]'::json),
      'kod', coalesce(array_to_json(array_agg(kod_i order by tartib, id)), '[]'::json),
      'nom', coalesce(array_to_json(array_agg(nom_i order by tartib, id)), '[]'::json),
      'birlik', coalesce(array_to_json(array_agg(birlik_i order by tartib, id)), '[]'::json),
      'hajm', coalesce(array_to_json(array_agg(hajm order by tartib, id)), '[]'::json),
      'narx', coalesce(array_to_json(array_agg(narx order by tartib, id)), '[]'::json),
      'summa', coalesce(array_to_json(array_agg(summa order by tartib, id)), '[]'::json),
      'norma', coalesce(array_to_json(array_agg(norma order by tartib, id)), '[]'::json),
      'narx_usul', coalesce(array_to_json(array_agg(narx_usul order by tartib, id)), '[]'::json),
      'versiya', coalesce(array_to_json(array_agg(versiya order by tartib, id)), '[]'::json),
      'qoshimcha', coalesce(array_to_json(array_agg(qoshimcha::int order by tartib, id)), '[]'::json),
      'zamena', coalesce(array_to_json(array_agg(zamena::int order by tartib, id)), '[]'::json),
      'xom_qator', coalesce(json_object_agg(id, xom_qator) filter (where xom_qator is not null), '{}'::json)) q,
    json_build_object(
      'fakt_hajm', coalesce(array_to_json(array_agg(fakt_hajm order by tartib, id)), '[]'::json),
      'fakt_summa', coalesce(array_to_json(array_agg(fakt_summa order by tartib, id)), '[]'::json),
      'f2_hajm', coalesce(array_to_json(array_agg(f2_hajm order by tartib, id)), '[]'::json),
      'f2_summa', coalesce(array_to_json(array_agg(f2_summa order by tartib, id)), '[]'::json),
      'f2_summa_nomalum', coalesce(array_to_json(array_agg(f2_summa_nomalum order by tartib, id)), '[]'::json),
      'direct_fakt_hajm', coalesce(array_to_json(array_agg(direct_fakt_hajm order by tartib, id)), '[]'::json),
      'fakt_manbasi', coalesce(array_to_json(array_agg((fakt_manbasi = 'BL_NORMA')::int order by tartib, id)), '[]'::json),
      'almashtirilgan_hajm', coalesce(json_object_agg(id, almashtirilgan_hajm) filter (where almashtirilgan_hajm <> 0), '{}'::json),
      'almashtirilgan_summa', coalesce(json_object_agg(id, almashtirilgan_summa) filter (where almashtirilgan_summa is distinct from 0), '{}'::json)) h
  into v_asos
  from qx;

  -- F2 ro'yxati (server ustun). muhr_xesh — akt qatorlari (id:versiya) izi: eksport aynan shu holatni muhrlaydi.
  select coalesce(json_agg(json_build_object(
           'akt_id', a.id, 'raqam', a.raqam, 'oy', a.oy, 'holat', a.holat, 'lifecycle_status', a.lifecycle_status,
           'versiya', a.versiya, 'hujjat_jami', a.hujjat_jami, 'muhr_xesh', m.x) order by a.oy, a.id), '[]'::json)
    into v_f2
    from public.t2_akt a
    left join lateral (select md5(string_agg(aq.id::text || ':' || aq.versiya::text, ',' order by aq.id)) x
                         from public.t2_akt_qator aq where aq.akt_id = a.id) m on true
   where a.obyekt_id = p_obyekt_id and a.tur = 'f2';

  -- Meta: nakrutka — yagona manbadan (t2_obyekt_nakrutka_v1), versiyalar, svod yaxlit qatorlari.
  v_nk := public.t2_obyekt_nakrutka_v1(p_obyekt_id, p_actor_id, null);
  v_meta := json_build_object(
    'podval', (select json_build_object('id', p.id, 'nom', p.nom, 'versiya', p.versiya, 'qatorlar', p.qatorlar)
                 from public.t2_nakrutka_podval p
                where p.obyekt_id = p_obyekt_id and p.kompaniya_id = v_komp and p.faol order by p.id desc limit 1),
    'koeffitsientlar', v_nk->'koeffitsientlar',
    'nk_manba', v_nk->>'nk_manba',
    'shartnoma_id', v_nk->'shartnoma_id',
    'nakrutka_podval_id', v_nk->'nakrutka_podval_id',
    'cats', v_nk->'cats',
    'cats_kaskad', v_nk->'cats_kaskad',
    'svod_yaxlit', (select coalesce(json_agg(json_build_object('id', y.id, 'qator_id', y.qator_id, 'svod_summa', y.svod_summa,
                                      'qqs_stavka', y.qqs_stavka, 'turi', y.turi, 'versiya', y.versiya) order by y.id), '[]'::json)
                      from public.t2_svod_yaxlit y where y.obyekt_id = p_obyekt_id and y.faol),
    'svod_yaxlit_jami', v_nk->'svod_yaxlit',
    'versiyalar', (select coalesce(json_agg(json_build_object('id', v.id, 'nom', v.nom, 'tur', v.tur, 'holat', v.holat,
                                      'manba_sana', v.manba_sana, 'yaratildi', v.yaratildi) order by v.id), '[]'::json)
                     from public.t2_smeta_versiya v where v.obyekt_id = p_obyekt_id));

  return json_build_object(
    'rev', coalesce(v_r.rev, 0), 'meta_rev', coalesce(v_r.meta_rev, 0), 'toliq_rev', coalesce(v_r.toliq_rev, 0),
    'format', 't2-paket/1', 'obyekt_id', p_obyekt_id, 'obyekt_nom', v_nom, 'kompaniya_id', v_komp,
    'soni', v_asos.soni, 'lugat', v_asos.lugat, 'q', v_asos.q, 'h', v_asos.h, 'f2', v_f2, 'meta', v_meta);
end $$;
comment on function public.t2_obyekt_paket_v1(bigint, bigint) is
  'Obyekt paketi (ADR OBYEKT_PAKET §1.2): faqat faol versiya qatorlari + t2_qator_holat xom ustunlari + F2 ro''yxati + meta, ustunli JSON. A''zolik t2_actor_kompaniya_azo_tekshir; faqat service_role (shlyuz /api/obyekt-paket).';

-- Arzon probe: shlyuz ETag ("rev.meta_rev") va mijoz sinxroni uchun.
create or replace function public.t2_obyekt_rev_v1(p_obyekt_id bigint, p_actor_id bigint)
returns json
language plpgsql stable security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_komp bigint; v_r public.t2_obyekt_rev;
begin
  if p_obyekt_id is null or p_obyekt_id <= 0 then raise exception 'obyekt_id majburiy' using errcode = '22023'; end if;
  select o.kompaniya_id into v_komp from public.t2_obyekt o where o.id = p_obyekt_id;
  if v_komp is null then raise exception 'obyekt topilmadi' using errcode = 'P0002'; end if;
  perform public.t2_actor_kompaniya_azo_tekshir(v_komp, p_actor_id);
  select * into v_r from public.t2_obyekt_rev where obyekt_id = p_obyekt_id;
  return json_build_object('rev', coalesce(v_r.rev, 0), 'meta_rev', coalesce(v_r.meta_rev, 0),
    'toliq_rev', coalesce(v_r.toliq_rev, 0), 'min_rev', coalesce(v_r.min_rev, 0),
    'obyekt_id', p_obyekt_id, 'kompaniya_id', v_komp);
end $$;
comment on function public.t2_obyekt_rev_v1(bigint, bigint) is 'Obyekt reviziyasi probe: {rev, meta_rev, toliq_rev, min_rev}. A''zolik tekshiriladi; faqat service_role.';

revoke all on function public.t2_obyekt_paket_v1(bigint, bigint) from public, anon, authenticated;
revoke all on function public.t2_obyekt_rev_v1(bigint, bigint) from public, anon, authenticated;
grant execute on function public.t2_obyekt_paket_v1(bigint, bigint) to service_role;
grant execute on function public.t2_obyekt_rev_v1(bigint, bigint) to service_role;
