-- 2026-10-01 (egasi ruxsati bilan, production'da qo'llangan):
-- 1) 20261105210000 (БЕЗСКЛАД qoida + trigger + backfill) production'ga qo'llandi.
-- 2) 2026-09-10 kategoriya registridagi "МАТ" yozuvlari (БЕЗСКЛАД kategoriyasi hali YO'Q paytda
--    qo'yilgan) egasi qoidasiga mos kelganlari (beton/rastvor + м³, asfaltobeton т/м³) БЕЗСКЛАД'ga
--    o'tkazildi: 12 registr yozuvi; jami 3417 qator / 28 obyekt БЕЗСКЛАД (F2 aktidagi 19 qator — o'zgarmagan).
--    Qum, shag'al, aralashma kabi 7 ta "МАТ" registr yozuvi o'zgarmagan.
-- 3) Ombor agenti istisno nazoratiga o'tkazildi (20261105210000 dagi tana), t2_bez_sklad_nomzodmi olib tashlandi.
-- 4) Suniy Ko'l (84): supabase/manual/20261001_suniy_kol_84_dublikat_tuzatish.sql qo'llandi —
--    2411 qator (147 831 682 357 so'm) t2_qator_zaxira_suniy_kol_84 ga ko'chirildi va o'chirildi.

begin;

do $$
declare v_reg int; rec record;
begin
  with u as (
    update public.t2_resurs_kategoriya rk set kategoriya = 'БЕЗСКЛАД', yangilandi = now(), versiya = rk.versiya + 1
     where rk.kategoriya = 'МАТ'
       and exists (select 1 from public.t2_qator q
                    where q.kompaniya_id = rk.kompaniya_id and public.t2_resurs_nom_kalit(q.nom) = rk.nom_key
                      and public.t2_resurs_birlik_kalit(q.birlik) = rk.birlik_key and public.t2_bez_sklad_qoida(q.nom, q.birlik))
    returning 1)
  select count(*) into v_reg from u;

  for rec in
    with o as (
      update public.t2_qator q set kat = 'БЕЗСКЛАД'
       where q.kat = 'МАТ' and q.tur in ('rs', 'mat')
         and public.t2_bez_sklad_qoida(q.nom, q.birlik)
         and not public.t2_bez_sklad_operator_rad(q.kompaniya_id, q.nom, q.birlik)
         and not exists (select 1 from public.t2_akt_qator a where a.qator_id = q.id)
      returning q.kompaniya_id, q.obyekt_id)
    select kompaniya_id, count(*) n, count(distinct obyekt_id) ob from o group by kompaniya_id
  loop
    perform public.t2_audit_yoz(rec.kompaniya_id, 'bez_sklad_registr_backfill', 'resurs_kategoriya', null,
      format('registr=%s qator=%s obyekt=%s', v_reg, rec.n, rec.ob), 'system:migration', null);
  end loop;
end $$;

commit;
