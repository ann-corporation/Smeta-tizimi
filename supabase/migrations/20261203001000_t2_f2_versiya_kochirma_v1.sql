-- 20261203001000 — ESKI VERSIYA F2 → YANGI FAOL QATOR KO'CHIRMASI (faqat O'QISH modeli).
-- (Avvalgi WIP: branch claude/f2-versiya-kochirish, 20261117000000 — qayta raqamlandi, zanjir va mat/ob resurslari qo'shildi.)
--
-- MUAMMO: t2_smeta_versiya_faollashtir_v1 (20261114700000) dan keyin tasdiqlangan F2 faqat ESKI ('almashtirilgan')
-- qatorlarda qoladi (to'g'ri: tarix, obyekt jamisida bir marta). Lekin ekranlar (fakt jurnali, F2 tayyorlash) faqat
-- 'faol' qatorlarni ko'rsatadi (shlyuz sukuti, 20261114900000) — yangi qatorda «F2 olingan» 0, F2 qoldig'i to'liq smeta:
-- foydalanuvchi uchun F2 «yo'qoladi».
--
-- YECHIM (faqat O'QISH; t2_akt / t2_akt_qator / certified qiymatlar / t2_qator_holat O'ZGARMAYDI, yangi akt yaratilmaydi):
--   t2_f2_versiya_kochirma_v1(p_obyekt_id, p_actor_id) — har faol qator uchun mos eski qatorlardagi tasdiqlangan F2
--   («F2 avvalgi versiyadan») va yangi smetaga moslanmagan eski F2 qatorlari ro'yxati (sababi bilan).
--
-- Nega t2_qator_holat da emas: view hamma jami/qoldiq/eksport/F2 tayyorlash manbai (tezlik migratsiyalari bilan
--   optimallashtirilgan). Eski F2 ni yangi qatorga ham qo'shish obyekt/bo'lim jamilarida IKKI MARTA sanashga olib keladi
--   (eski qator ham F2 ni beradi) va moslik tasdig'i (kutilmoqda/rad) hisobga kirib qoladi. Shuning uchun alohida qatlam.
--
-- Tomonlar (faollashtir_v1 ma'nosi): pozitsiya = ESKI (manba.qator_id — eski bl / rz ostidagi mustaqil mat/ob),
--   moslik.qator_id = YANGI faol qator. Faqat shu obyektni faollashtirgan versiyalar (t2_qator.almashtirgan_versiya_id).
--   (t2_akt_qator.replaces_line_id — zamena akt qatori bog'i, versiya bog'i EMAS.)
-- ZANJIR: versiya bir necha marta faollashtirilgan bo'lsa (A → B → C), moslik nishoni o'zi almashtirilgan bo'lsa keyingi
--   versiya pozitsiyasi (manba.qator_id = nishon) orqali davom etadi (eng ko'pi 20 qadam); eng yomon tasdiq holati olinadi.
--
-- QABUL QILINGAN moslik (F2 ko'chadi):
--   qator_id bor, holat NOT IN ('ochirilgan','noaniq') VA (tasdiq = 'tasdiqlandi' YOKI (tasdiq = 'avto' VA birlik_farq = false)).
--   tasdiq 'kutilmoqda' / holat 'noaniq' / 'avto' + birlik farqi → «tasdiq_kutilmoqda» (ko'chmaydi, ro'yxatda nomzod bilan);
--   'rad' → 'rad_etilgan'; 'ochirilgan' / moslik yo'q → 'yangi_smetada_yoq'.
-- Daraja: eski bl / mustaqil mat/ob F2 → moslikdagi yangi qator; eski ish ichidagi rs/mat/ob F2 (ota = pozitsiya bl) →
--   yangi bl ostidagi resurs (normallashtirilgan nom + birlik; takrorlar tartib bo'yicha juftlanadi; shifr bazalar orasida
--   farq qiladi, shuning uchun kalitga kirmaydi).
-- F2 qiymati t2_qator_holat bilan bir xil: hajm = COALESCE(certified_quantity, hajm), summa = COALESCE(certified_amount, summa),
--   faqat t2_akt tur='f2' holat='tasdiqlangan' (bekor qilingan F2 avtomatik chiqadi); ishorali (storno/chegirma) SUM.
--   Sof 0 bo'lgan eski qator (hajm 0, summa 0, noma'lum summa yo'q) ro'yxatga kirmaydi. NULL ≠ 0: summasi noma'lum qatorlar alohida sanaladi.
-- IKKI MARTA SANALMAYDI: bu model hech qanday jamiga qo'shilmaydi — eski F2 obyekt jamisida eski qatorda BIR marta.
--   «jami» invarianti: kochdi + kutilmoqda + moslanmagan = eski F2 jami (soni va summasi).
-- Xavfsizlik: SECURITY DEFINER, search_path qat'iy; obyekt → kompaniya, t2_actor_kompaniya_azo_tekshir + f2.read;
--   faqat service_role (BFF /api/sb 'obyekt_actor' — p_actor_id sessiyadan). versiya: versiya (C toifa — aniq versiya obyekti).
begin;

create or replace function public.t2_f2_versiya_kochirma_v1(p_obyekt_id bigint, p_actor_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_k bigint; v_res jsonb;
begin
  select o.kompaniya_id into v_k from public.t2_obyekt o where o.id = p_obyekt_id;
  if v_k is null then return jsonb_build_object('ok', false, 'code', 'OBYEKT_NOT_FOUND'); end if;
  perform public.t2_actor_kompaniya_azo_tekshir(v_k, p_actor_id);
  perform public.t2_require_permission_v2(v_k, p_actor_id, 'f2.read');

  with recursive vers as (       -- obyektni faollashtirgan versiyalar
    select distinct q.almashtirgan_versiya_id id from public.t2_qator q
     where q.obyekt_id = p_obyekt_id and q.versiya_holat = 'almashtirilgan'
  ), f2 as (           -- eski qatorlardagi tasdiqlangan F2 (qator bo'yicha, ishorali)
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
    having coalesce(sum(coalesce(aq.certified_quantity, aq.hajm)), 0) <> 0
        or coalesce(sum(coalesce(aq.certified_amount, aq.summa)), 0) <> 0
        or count(*) filter (where coalesce(aq.certified_amount, aq.summa) is null) > 0
  ), poz as (          -- eski pozitsiya ↔ moslik; daraja: 0 qabul, 1 tasdiq kutilmoqda, 2 moslanmagan
    select p.id pozitsiya_id, p.versiya_id, (p.manba->>'qator_id')::bigint eski_id,
           m.id moslik_id, m.versiya moslik_versiya, m.qator_id yangi_id, m.holat, m.ishonch, m.tasdiq, m.birlik_farq,
           case
             when m.id is null or m.tasdiq = 'rad' or m.holat = 'ochirilgan' or m.qator_id is null then 2
             when m.holat = 'noaniq' or m.tasdiq = 'kutilmoqda' or (m.tasdiq = 'avto' and m.birlik_farq) then 1
             else 0 end daraja
      from public.t2_smeta_versiya_pozitsiya p
      join vers v on v.id = p.versiya_id
      left join public.t2_smeta_versiya_moslik m on m.versiya_id = p.versiya_id and m.pozitsiya_id = p.id
     where p.kompaniya_id = v_k and p.manba ? 'qator_id'
  ), f2p as (          -- F2 qatori → boshlang'ich pozitsiya (o'zi yoki ota ishi)
    select f.*, coalesce(po.pozitsiya_id, pr.pozitsiya_id) pozitsiya_id,
           (po.pozitsiya_id is null and pr.pozitsiya_id is not null) resurs_daraja
      from f2 f
      left join poz po on po.eski_id = f.qator_id and po.versiya_id = f.vid
      left join poz pr on po.pozitsiya_id is null and f.tur in ('rs','mat','ob')
                      and pr.eski_id = f.ota_id and pr.versiya_id = f.vid
  ), zanjir(pozitsiya_id, qadam, joriy_id, daraja, rad, moslik_id) as (   -- A → B → C: nishon almashtirilgan bo'lsa davom
    select p.pozitsiya_id, 1, p.yangi_id, p.daraja, coalesce(p.tasdiq = 'rad', false), p.moslik_id
      from poz p where p.pozitsiya_id in (select f.pozitsiya_id from f2p f where f.pozitsiya_id is not null)
    union all
    select z.pozitsiya_id, z.qadam + 1, p2.yangi_id, greatest(z.daraja, p2.daraja), z.rad or coalesce(p2.tasdiq = 'rad', false), p2.moslik_id
      from zanjir z
      join public.t2_qator t on t.id = z.joriy_id and t.obyekt_id = p_obyekt_id and t.versiya_holat = 'almashtirilgan'
      join poz p2 on p2.eski_id = t.id and p2.versiya_id = t.almashtirgan_versiya_id
     where z.qadam < 20 and z.daraja < 2
  ), oxiri as (
    select distinct on (z.pozitsiya_id) z.* from zanjir z order by z.pozitsiya_id, z.qadam desc
  ), eski_res as (     -- eski ish ichidagi resurslar (barchasi — takror tartibi to'g'ri bo'lishi uchun)
    select r.id qator_id, public.t2_resurs_nom_kalit(r.nom) nk, public.t2_resurs_birlik_kalit(r.birlik) bk,
           row_number() over (partition by r.ota_id, public.t2_resurs_nom_kalit(r.nom), public.t2_resurs_birlik_kalit(r.birlik)
                              order by r.tartib, r.id) rn
      from public.t2_qator r
     where r.obyekt_id = p_obyekt_id and r.versiya_holat = 'almashtirilgan' and r.tur in ('rs','mat','ob')
       and r.ota_id in (select f.ota_id from f2p f where f.resurs_daraja)
  ), yangi_res as (    -- yangi (oxirgi) ish ostidagi faol resurslar
    select r.id, r.ota_id, public.t2_resurs_nom_kalit(r.nom) nk, public.t2_resurs_birlik_kalit(r.birlik) bk,
           row_number() over (partition by r.ota_id, public.t2_resurs_nom_kalit(r.nom), public.t2_resurs_birlik_kalit(r.birlik)
                              order by r.tartib, r.id) rn
      from public.t2_qator r
     where r.obyekt_id = p_obyekt_id and r.versiya_holat = 'faol' and r.tur in ('rs','mat','ob')
       and r.ota_id in (select o.joriy_id from oxiri o where o.joriy_id is not null)
  ), nishon as (       -- har eski F2 qatori uchun natija
    select f.*, p.versiya_id, p.moslik_id, p.moslik_versiya, p.holat, p.ishonch, p.tasdiq, p.birlik_farq,
           o.joriy_id, o.qadam, o.daraja,
           case when f.resurs_daraja then yr.id else o.joriy_id end nishon_id,
           case
             when f.pozitsiya_id is null then 'pozitsiya_yoq'
             when o.daraja = 2 then case when o.rad then 'rad_etilgan' else 'yangi_smetada_yoq' end
             when t.id is null then 'nishon_faol_emas'
             when f.resurs_daraja and yr.id is null then 'resurs_topilmadi'
             when o.daraja = 1 then 'tasdiq_kutilmoqda'
             else null end sabab
      from f2p f
      left join poz p on p.pozitsiya_id = f.pozitsiya_id
      left join oxiri o on o.pozitsiya_id = f.pozitsiya_id
      left join public.t2_qator t on t.id = o.joriy_id and t.obyekt_id = p_obyekt_id and t.versiya_holat = 'faol'
      left join eski_res er on f.resurs_daraja and er.qator_id = f.qator_id
      left join yangi_res yr on f.resurs_daraja and yr.ota_id = o.joriy_id and yr.nk = er.nk and yr.bk = er.bk and yr.rn = er.rn
  ), kochdi as (
    select n.nishon_id qator_id,
           sum(n.hajm) hajm, sum(n.summa) summa, sum(n.summa_nomalum) summa_nomalum, count(*) eski_soni,
           (select array_agg(distinct a order by a) from nishon n2 cross join lateral unnest(n2.aktlar) a
             where n2.sabab is null and n2.nishon_id = n.nishon_id) aktlar,
           array_agg(n.qator_id order by n.qator_id) eski_idlar,
           min(n.moslik_id) moslik_id, max(n.qadam) zanjir_qadam
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
        'moslik_id', k.moslik_id, 'zanjir_qadam', k.zanjir_qadam) order by k.qator_id) from kochdi k), '[]'::jsonb),
    'moslanmagan', coalesce((select jsonb_agg(jsonb_build_object(
        'eski_qator_id', n.qator_id, 'tur', n.tur, 'kod', n.kod, 'nom', n.nom, 'birlik', n.birlik,
        'f2_hajm', n.hajm, 'f2_summa', n.summa, 'f2_summa_nomalum', n.summa_nomalum, 'akt_idlar', to_jsonb(n.aktlar),
        'sabab', n.sabab, 'versiya_id', n.versiya_id, 'pozitsiya_id', n.pozitsiya_id,
        'moslik_id', n.moslik_id, 'moslik_versiya', n.moslik_versiya, 'holat', n.holat, 'ishonch', n.ishonch, 'tasdiq', n.tasdiq,
        'nomzod_qator_id', case when n.sabab in ('tasdiq_kutilmoqda','resurs_topilmadi') then coalesce(n.nishon_id, n.joriy_id) end)
        order by n.tartib, n.qator_id) from nishon n where n.sabab is not null), '[]'::jsonb),
    'jami', (select jsonb_build_object(
        'eski_soni', count(*), 'eski_summa', coalesce(sum(n.summa), 0), 'eski_summa_nomalum', coalesce(sum(n.summa_nomalum), 0),
        'kochdi_soni', count(*) filter (where n.sabab is null), 'kochdi_summa', coalesce(sum(n.summa) filter (where n.sabab is null), 0),
        'kutilmoqda_soni', count(*) filter (where n.sabab = 'tasdiq_kutilmoqda'),
        'kutilmoqda_summa', coalesce(sum(n.summa) filter (where n.sabab = 'tasdiq_kutilmoqda'), 0),
        'moslanmagan_soni', count(*) filter (where n.sabab is not null and n.sabab <> 'tasdiq_kutilmoqda'),
        'moslanmagan_summa', coalesce(sum(n.summa) filter (where n.sabab is not null and n.sabab <> 'tasdiq_kutilmoqda'), 0),
        'sabablar', coalesce((select jsonb_object_agg(s, c) from (select coalesce(n3.sabab, 'kochdi') s, count(*) c from nishon n3 group by 1) x), '{}'::jsonb))
      from nishon n))
  into v_res;
  return v_res;
end $$;

comment on function public.t2_f2_versiya_kochirma_v1(bigint, bigint) is
  'F2 versiya ko''chirmasi (o''qish): eski (almashtirilgan) qatorlardagi tasdiqlangan F2 → qabul qilingan moslik (zanjir bilan) bo''yicha faol qatorga; moslanmaganlar sababi bilan. Hech qanday jamiga qo''shilmaydi (eski F2 obyekt jamisida bir marta). versiya: versiya';
revoke all on function public.t2_f2_versiya_kochirma_v1(bigint, bigint) from public, anon, authenticated;
grant execute on function public.t2_f2_versiya_kochirma_v1(bigint, bigint) to service_role;

commit;
