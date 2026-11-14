-- MOSLASH QUTISI (istisnolar qutisi), 2026-11-14. FAQAT O'QISH: bitta RPC, hech narsa yozmaydi va tuzatmaydi.
-- Kunlik avtomat tekshiruvlar natijasi BITTA ro'yxatda (Jarvis va «Bugun» ekranida): har band = obyekt, akt, summa, «ochish» havolasi.
--   (a) tasdiqlangan har F-2: tizim jami (_t2_f2_ustamali -> paket.qqs_bilan) vs akt podvalidagi hujjat jami (t2_akt_podval.hujjat_vsego yig'indisi);
--       farq > 0,02 -> 'f2_podval_farq'; podvali yo'q akt -> 'f2_podval_yoq'.
--   (b) obyekt keshi (t2_obyekt_kesh) vs jonli _t2_summa_paket_v1: qiymat farqi > 1 so'm va obyekt «iflos» deb belgilanmagan -> 'kesh_eskirgan'.
--   (c) fakt < F-2 (ustamasiz, obyekt bo'yicha): 'fakt_kam_f2' — «к снятию» nomzodi (summa = F-2 − fakt).
--   (d) narxsiz qatorlar (smeta + F-2 paketlari narxsiz_soni): 'narxsiz'.
--   (e) F-3 (t2_forma3.sotuv_summa, bekor emas) yig'indisi vs tasdiqlangan F-2 lar yig'indisi (QQS bilan), farq > 1: 'f3_f2_farq'.
-- Xavfsizlik: a'zolik + financial.read (rahbar paneli bilan bir xil); service_role. Natija <= 300 band (summa bo'yicha kamayish tartibida).
-- Migratsiyani EGASI qo'llaydi. Rollback: .rollback.sql. Qabul: .acceptance.sql.

create or replace function public.t2_moslash_qutisi_v1(p_kompaniya_id bigint, p_actor_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $fn$
declare
  v_ob bigint[]; v_sm jsonb; v_fk jsonb; v_f2 jsonb; v_band jsonb; v_soni jsonb;
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'financial.read');

  select coalesce(array_agg(id order by id), '{}') into v_ob from public.t2_obyekt where kompaniya_id = p_kompaniya_id;
  select jsonb_object_agg(p.obyekt_id::text, p.paket) into v_sm from public._t2_summa_paket_v1(v_ob, 'smeta') p;
  select jsonb_object_agg(p.obyekt_id::text, p.paket) into v_fk from public._t2_summa_paket_v1(v_ob, 'fakt') p;
  select jsonb_object_agg(p.obyekt_id::text, p.paket) into v_f2 from public._t2_summa_paket_v1(v_ob, 'f2') p;

  with ob as (
    select o.id, o.nom from public.t2_obyekt o where o.kompaniya_id = p_kompaniya_id
  ), ak as (
    select a.id, a.obyekt_id, a.raqam, a.oy
      from public.t2_akt a
     where a.kompaniya_id = p_kompaniya_id and a.tur = 'f2' and a.holat = 'tasdiqlangan' and a.obyekt_id = any(v_ob)
     order by a.id desc limit 300
  ), pv as (
    select p.akt_id, count(*) as soni, sum(p.hujjat_vsego) as vsego
      from public.t2_akt_podval p where p.kompaniya_id = p_kompaniya_id and p.akt_id in (select id from ak) group by p.akt_id
  ), tz as (
    select ak.*, pv.soni as pv_soni, pv.vsego as pv_vsego,
           (public._t2_f2_ustamali(p_kompaniya_id, null, array[ak.id]) -> 'paket' ->> 'qqs_bilan')::numeric as tizim
      from ak left join pv on pv.akt_id = ak.id
  ), b as (
    -- (a) tizim jami vs podval hujjat jami
    select 'f2_podval_farq'::text as tur, tz.obyekt_id, tz.id as akt_id, tz.raqam as akt_raqam, tz.tizim as summa, (tz.tizim - tz.pv_vsego) as farq,
           'Tizim jami hujjat jamidan farq qiladi'::text as izoh, '/admin/f2-tarix'::text as yol
      from tz where tz.pv_soni > 0 and tz.pv_vsego is not null and tz.tizim is not null and abs(tz.tizim - tz.pv_vsego) > 0.02
    union all
    select 'f2_podval_yoq', tz.obyekt_id, tz.id, tz.raqam, tz.tizim, null, 'Aktning podvali yo''q (hujjat jami solishtirilmadi)', '/admin/f2-tarix'
      from tz where coalesce(tz.pv_soni, 0) = 0
    union all
    -- (b) kesh vs jonli (iflos belgilanmagan = haqiqiy eskirish)
    select 'kesh_eskirgan', k.obyekt_id, null, null, (v_f2 -> (k.obyekt_id::text) ->> 'qqs_bilan')::numeric,
           (abs(coalesce((k.f2 ->> 'qqs_bilan')::numeric, 0) - coalesce((v_f2 -> (k.obyekt_id::text) ->> 'qqs_bilan')::numeric, 0))
               + abs(coalesce((k.smeta ->> 'qqs_bilan')::numeric, 0) - coalesce((v_sm -> (k.obyekt_id::text) ->> 'qqs_bilan')::numeric, 0))
               + abs(coalesce((k.fakt ->> 'qqs_bilan')::numeric, 0) - coalesce((v_fk -> (k.obyekt_id::text) ->> 'qqs_bilan')::numeric, 0))),
           'Obyekt keshi jonli hisobdan farq qiladi', '/admin/holat'
      from public.t2_obyekt_kesh k
     where k.kompaniya_id = p_kompaniya_id and k.obyekt_id = any(v_ob)
       and not exists (select 1 from public.t2_obyekt_kesh_iflos i where i.obyekt_id = k.obyekt_id)
       and (abs(coalesce((k.f2 ->> 'qqs_bilan')::numeric, 0) - coalesce((v_f2 -> (k.obyekt_id::text) ->> 'qqs_bilan')::numeric, 0))
          + abs(coalesce((k.smeta ->> 'qqs_bilan')::numeric, 0) - coalesce((v_sm -> (k.obyekt_id::text) ->> 'qqs_bilan')::numeric, 0))
          + abs(coalesce((k.fakt ->> 'qqs_bilan')::numeric, 0) - coalesce((v_fk -> (k.obyekt_id::text) ->> 'qqs_bilan')::numeric, 0))) > 1
    union all
    -- (c) fakt < F-2 (ustamasiz): к снятию nomzodi
    select 'fakt_kam_f2', o.id, null, null,
           ((v_f2 -> (o.id::text) ->> 'ustamasiz')::numeric - coalesce((v_fk -> (o.id::text) ->> 'ustamasiz')::numeric, 0)), null,
           'F-2 faktdan ko''p: «к снятию» nomzodi (ustamasiz)', '/admin/aosr'
      from ob o where (v_f2 -> (o.id::text) ->> 'ustamasiz')::numeric - coalesce((v_fk -> (o.id::text) ->> 'ustamasiz')::numeric, 0) > 1
    union all
    -- (d) narxsiz qatorlar (summa yo'q — soni izohda)
    select 'narxsiz', o.id, null, null, null, null,
           'Narxsiz qatorlar: ' || (coalesce((v_sm -> (o.id::text) ->> 'narxsiz_soni')::bigint, 0) + coalesce((v_f2 -> (o.id::text) ->> 'narxsiz_soni')::bigint, 0))::text || ' ta',
           '/admin/narxlar'
      from ob o where coalesce((v_sm -> (o.id::text) ->> 'narxsiz_soni')::bigint, 0) + coalesce((v_f2 -> (o.id::text) ->> 'narxsiz_soni')::bigint, 0) > 0
    union all
    -- (e) F-3 vs F-2 lar yig'indisi (QQS bilan)
    select 'f3_f2_farq', o.id, null, null, f3.sotuv, (f3.sotuv - coalesce((v_f2 -> (o.id::text) ->> 'qqs_bilan')::numeric, 0)),
           'F-3 jami F-2 lar yig''indisidan farq qiladi', '/admin/nakopitelniy'
      from ob o
      join (select f.obyekt_id, sum(f.sotuv_summa) as sotuv from public.t2_forma3 f
             where f.kompaniya_id = p_kompaniya_id and f.holat <> 'bekor' group by f.obyekt_id) f3 on f3.obyekt_id = o.id
     where abs(f3.sotuv - coalesce((v_f2 -> (o.id::text) ->> 'qqs_bilan')::numeric, 0)) > 1
  ), z as (
    select b.*, o.nom as obyekt_nom from b left join ob o on o.id = b.obyekt_id
     order by abs(coalesce(b.farq, b.summa, 0)) desc, b.tur limit 300
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'tur', z.tur, 'obyekt_id', z.obyekt_id, 'obyekt_nom', z.obyekt_nom, 'akt_id', z.akt_id, 'akt_raqam', z.akt_raqam,
           'summa', z.summa, 'farq', z.farq, 'izoh', z.izoh,
           'havola', z.yol || case when z.obyekt_id is not null then (case when z.yol = '/admin/holat' then '/' || z.obyekt_id::text else '?obyekt=' || z.obyekt_id::text end) else '' end)
         order by abs(coalesce(z.farq, z.summa, 0)) desc, z.tur), '[]'::jsonb)
    into v_band from z;

  select coalesce(jsonb_object_agg(t.tur, t.n), '{}'::jsonb) into v_soni
    from (select e ->> 'tur' as tur, count(*) as n from jsonb_array_elements(v_band) e group by 1) t;

  return jsonb_build_object('ok', true, 'hisoblandi', now(), 'jami', jsonb_array_length(v_band), 'tur_soni', v_soni, 'bandlar', v_band,
                            'izoh', 'Faqat aniqlaydi: hech narsa o''zgartirilmaydi, tuzatishni inson qiladi.');
end $fn$;
revoke all on function public.t2_moslash_qutisi_v1(bigint, bigint) from public, anon, authenticated;
grant execute on function public.t2_moslash_qutisi_v1(bigint, bigint) to service_role;
comment on function public.t2_moslash_qutisi_v1(bigint, bigint) is 'Moslash qutisi: kunlik avtomat tekshiruvlar (F-2 podval, kesh, fakt<F-2, narxsiz, F-3). Faqat o''qish. financial.read.';
