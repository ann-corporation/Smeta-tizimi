-- 20261117000000 — ESKI VERSIYA F2 → YANGI FAOL QATOR KO'CHIRMASI (o'qish modeli, egasi 2026-10-31).
--
-- MUAMMO: t2_smeta_versiya_faollashtir_v1 dan keyin tasdiqlangan F2 faqat ESKI ('almashtirilgan') qatorlarda qoladi;
-- ekranlar faqat 'faol' qatorni ko'rsatadi → F2 daraxt, qoldiq va eksportlardan «yo'qoladi» (obyekt jamisida esa
-- eski qatorda bir marta sanaladi).
--
-- YECHIM (faqat O'QISH; t2_akt / t2_akt_qator / certified qiymatlar O'ZGARMAYDI, yangi F2 akt yaratilmaydi):
--   t2_f2_versiya_kochirma_v1(p_obyekt_id, p_actor_id) — har faol qator uchun mos eski qatorlardagi tasdiqlangan F2
--   («F2 avvalgi versiyadan») va yangi smetaga moslanmagan eski F2 qatorlari ro'yxati (sababi bilan).
--
-- Tomonlar (faollashtir_v1 ma'nosi): pozitsiya = ESKI (manba.qator_id — eski bl / rz ostidagi mat/ob qatori),
--   moslik.qator_id = YANGI faol qator. Faqat obyektni faollashtirgan versiyalar (t2_qator.almashtirgan_versiya_id).
--   (t2_akt_qator.replaces_line_id — zamena akt qatori bog'i, versiya bog'i EMAS.)
--
-- QABUL QILINGAN moslik (F2 ko'chadi):
--   qator_id bor, holat NOT IN ('ochirilgan','noaniq') VA (tasdiq = 'tasdiqlandi' YOKI (tasdiq = 'avto' VA birlik_farq = false)).
--   tasdiq 'kutilmoqda' / holat 'noaniq' / 'avto' + birlik farqi → «tasdiq kutilmoqda» (ko'chmaydi, ro'yxatda);
--   'rad' / 'ochirilgan' → moslanmagan.
-- Daraja: eski bl/mat/ob F2 → moslikdagi yangi qator; eski rs F2 (ota = pozitsiya bl) → yangi bl ostidagi rs
--   (normallashtirilgan nom + birlik, takrorlar tartib bo'yicha juftlanadi; shifr bazalar orasida farq qiladi).
-- F2 qiymati t2_qator_holat bilan bir xil: hajm = COALESCE(certified_quantity, hajm), summa = COALESCE(certified_amount, summa),
--   faqat t2_akt tur='f2' holat='tasdiqlangan'. NULL ≠ 0: summasi noma'lum qatorlar alohida sanaladi.
-- IKKI MARTA SANALMAYDI: bu model hech qanday jamiga qo'shilmaydi — eski F2 obyekt jamisida eski qatorda BIR marta.
--   Natija «jami» bloki invarianti: kochirildi + kutilmoqda + moslanmagan = eski F2 jami (summa va soni).
begin;

create or replace function public.t2_f2_versiya_kochirma_v1(p_obyekt_id bigint, p_actor_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_k bigint; v_res jsonb;
begin
  v_k := public.t2_obyekt_kompaniya_azo(p_obyekt_id, p_actor_id);
  perform public.t2_require_permission_v2(v_k, p_actor_id, 'f2.read');

  with vers as (       -- obyektni faollashtirgan versiyalar
    select distinct q.almashtirgan_versiya_id id from public.t2_qator q
     where q.obyekt_id = p_obyekt_id and q.versiya_holat = 'almashtirilgan'
  ), f2 as (           -- eski qatorlardagi tasdiqlangan F2 (qator bo'yicha)
    select q.id qator_id, q.tur, q.ota_id, q.kod, q.nom, q.birlik, q.tartib, q.almashtirgan_versiya_id vid,
           sum(coalesce(aq.certified_quantity, aq.hajm)) hajm,
           sum(coalesce(aq.certified_amount, aq.summa)) summa,
           count(*) filter (where coalesce(aq.certified_amount, aq.summa) is null) summa_nomalum,
           array_agg(distinct a.id order by a.id) aktlar
      from public.t2_qator q
      join public.t2_akt_qator aq on aq.qator_id = q.id
      join public.t2_akt a on a.id = aq.akt_id and a.tur = 'f2' and a.holat = 'tasdiqlangan'
     where q.obyekt_id = p_obyekt_id and q.versiya_holat = 'almashtirilgan'
     group by q.id
  ), poz as (          -- eski pozitsiya ↔ moslik
    select p.id pozitsiya_id, p.versiya_id, (p.manba->>'qator_id')::bigint eski_id,
           m.id moslik_id, m.versiya moslik_versiya, m.qator_id yangi_id, m.holat, m.ishonch, m.tasdiq, m.birlik_farq,
           case
             when m.id is null or m.tasdiq = 'rad' or m.holat = 'ochirilgan' or m.qator_id is null then 'moslanmagan'
             when m.holat = 'noaniq' or m.tasdiq = 'kutilmoqda' or (m.tasdiq = 'avto' and m.birlik_farq) then 'kutilmoqda'
             else 'qabul' end hal
      from public.t2_smeta_versiya_pozitsiya p
      join vers v on v.id = p.versiya_id
      left join public.t2_smeta_versiya_moslik m on m.versiya_id = p.versiya_id and m.pozitsiya_id = p.id
     where p.manba ? 'qator_id'
  ), f2p as (          -- F2 qatori → pozitsiyasi (o'zi yoki rs otasi)
    select f.*, coalesce(po.pozitsiya_id, pr.pozitsiya_id) pozitsiya_id,
           (po.pozitsiya_id is null and pr.pozitsiya_id is not null) rs_daraja
      from f2 f
      left join poz po on po.eski_id = f.qator_id and po.versiya_id = f.vid
      left join poz pr on f.tur = 'rs' and pr.eski_id = f.ota_id and pr.versiya_id = f.vid
  ), eski_rs as (      -- eski rs: juftlash kaliti
    select f.qator_id, f.pozitsiya_id,
           public.t2_resurs_nom_kalit(f.nom) || '|' || public.t2_resurs_birlik_kalit(f.birlik) k,
           row_number() over (partition by f.pozitsiya_id, public.t2_resurs_nom_kalit(f.nom), public.t2_resurs_birlik_kalit(f.birlik)
                              order by f.tartib, f.qator_id) rn
      from f2p f where f.rs_daraja
  ), yangi_rs as (     -- yangi bl ostidagi faol rs
    select r.id, r.ota_id,
           public.t2_resurs_nom_kalit(r.nom) || '|' || public.t2_resurs_birlik_kalit(r.birlik) k,
           row_number() over (partition by r.ota_id, public.t2_resurs_nom_kalit(r.nom), public.t2_resurs_birlik_kalit(r.birlik)
                              order by r.tartib, r.id) rn
      from public.t2_qator r
     where r.obyekt_id = p_obyekt_id and r.versiya_holat = 'faol' and r.tur = 'rs'
       and r.ota_id in (select yangi_id from poz where yangi_id is not null)
  ), nishon as (       -- har eski F2 qatori uchun natija
    select f.*, p.moslik_id, p.moslik_versiya, p.versiya_id, p.holat, p.ishonch, p.tasdiq, p.birlik_farq, p.yangi_id moslik_qator_id,
           case when f.pozitsiya_id is null then null
                when f.rs_daraja then yr.id else p.yangi_id end nishon_id,
           case when f.pozitsiya_id is null then 'pozitsiya_yoq'
                when p.hal = 'moslanmagan' then case when p.tasdiq = 'rad' then 'rad_etilgan' else 'yangi_smetada_yoq' end
                when f.rs_daraja and yr.id is null then 'resurs_topilmadi'
                when not exists (select 1 from public.t2_qator t where t.id = case when f.rs_daraja then yr.id else p.yangi_id end
                                   and t.obyekt_id = p_obyekt_id and t.versiya_holat = 'faol') then 'nishon_faol_emas'
                when p.hal = 'kutilmoqda' then 'tasdiq_kutilmoqda'
                else null end sabab
      from f2p f
      left join poz p on p.pozitsiya_id = f.pozitsiya_id
      left join eski_rs er on er.qator_id = f.qator_id
      left join yangi_rs yr on f.rs_daraja and yr.ota_id = p.yangi_id and yr.k = er.k and yr.rn = er.rn
  ), kochdi as (
    select n.nishon_id qator_id,
           sum(n.hajm) hajm, sum(n.summa) summa, sum(n.summa_nomalum) summa_nomalum, count(*) eski_soni,
           (select array_agg(distinct a order by a) from nishon n2 cross join lateral unnest(n2.aktlar) a
             where n2.sabab is null and n2.nishon_id = n.nishon_id) aktlar,
           array_agg(n.qator_id order by n.qator_id) eski_idlar,
           min(n.moslik_id) moslik_id, min(n.holat) holat, min(n.ishonch) ishonch, min(n.tasdiq) tasdiq
      from nishon n
     where n.sabab is null
     group by n.nishon_id
  )
  select jsonb_build_object(
    'ok', true, 'obyekt_id', p_obyekt_id,
    'versiyalar', coalesce((select jsonb_agg(id order by id) from vers), '[]'::jsonb),
    'qatorlar', coalesce((select jsonb_agg(jsonb_build_object(
        'qator_id', k.qator_id, 'f2_avvalgi_hajm', k.hajm, 'f2_avvalgi_summa', k.summa,
        'f2_avvalgi_summa_nomalum', k.summa_nomalum, 'eski_soni', k.eski_soni,
        'akt_idlar', to_jsonb(k.aktlar), 'eski_qator_idlar', to_jsonb(k.eski_idlar),
        'moslik_id', k.moslik_id, 'holat', k.holat, 'ishonch', k.ishonch, 'tasdiq', k.tasdiq) order by k.qator_id) from kochdi k), '[]'::jsonb),
    'moslanmagan', coalesce((select jsonb_agg(jsonb_build_object(
        'eski_qator_id', n.qator_id, 'tur', n.tur, 'kod', n.kod, 'nom', n.nom, 'birlik', n.birlik,
        'f2_hajm', n.hajm, 'f2_summa', n.summa, 'f2_summa_nomalum', n.summa_nomalum, 'akt_idlar', to_jsonb(n.aktlar),
        'sabab', n.sabab, 'versiya_id', n.versiya_id, 'pozitsiya_id', n.pozitsiya_id,
        'moslik_id', n.moslik_id, 'moslik_versiya', n.moslik_versiya, 'holat', n.holat, 'ishonch', n.ishonch, 'tasdiq', n.tasdiq,
        'nomzod_qator_id', case when n.sabab in ('tasdiq_kutilmoqda','resurs_topilmadi') then n.moslik_qator_id end)
        order by n.tartib, n.qator_id) from nishon n where n.sabab is not null), '[]'::jsonb),
    'jami', (select jsonb_build_object(
        'eski_soni', count(*), 'eski_summa', coalesce(sum(n.summa), 0), 'eski_summa_nomalum', coalesce(sum(n.summa_nomalum), 0),
        'kochdi_soni', count(*) filter (where n.sabab is null), 'kochdi_summa', coalesce(sum(n.summa) filter (where n.sabab is null), 0),
        'kutilmoqda_soni', count(*) filter (where n.sabab = 'tasdiq_kutilmoqda'),
        'kutilmoqda_summa', coalesce(sum(n.summa) filter (where n.sabab = 'tasdiq_kutilmoqda'), 0),
        'moslanmagan_soni', count(*) filter (where n.sabab is not null and n.sabab <> 'tasdiq_kutilmoqda'),
        'moslanmagan_summa', coalesce(sum(n.summa) filter (where n.sabab is not null and n.sabab <> 'tasdiq_kutilmoqda'), 0),
        'sabablar', coalesce((select jsonb_object_agg(s, c) from (select coalesce(sabab, 'kochdi') s, count(*) c from nishon group by 1) x), '{}'::jsonb))
      from nishon n))
  into v_res;
  return v_res;
end $$;

comment on function public.t2_f2_versiya_kochirma_v1(bigint, bigint) is
  'F2 versiya ko''chirmasi (o''qish): eski (almashtirilgan) qatorlardagi tasdiqlangan F2 → qabul qilingan moslik bo''yicha faol qatorga; moslanmaganlar sababi bilan. Hech qanday jamiga qo''shilmaydi (eski F2 obyekt jamisida bir marta).';
revoke all on function public.t2_f2_versiya_kochirma_v1(bigint, bigint) from public, anon, authenticated;
grant execute on function public.t2_f2_versiya_kochirma_v1(bigint, bigint) to service_role;

commit;
