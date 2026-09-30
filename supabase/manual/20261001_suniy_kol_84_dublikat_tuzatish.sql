-- SUNIY KO'L (obyekt 84) — ortiqcha vedomost qatorlarini olib tashlash (egasi Q8).
-- ⚠️ QO'LDA, EGASI ANIQ TASDIQLAGACH qo'llanadi. Avtomatik migratsiya EMAS.
--
-- Dry-run (2026-10-01, Claude, faqat o'qish):
--   84 va 91 ("Suniy Ko'l 2", to'g'ri import) — ish ichidagi resurslar bir xil (19 838 ta, 54,19 mlrd).
--   84 da bo'limlar (rz) ostidagi mustaqil МАТ/ОБ 2 411 ta ortiqcha — eski import resurs
--   VEDOMOSTINI ham mustaqil material sifatida kiritgan. Ortiqcha summa: 147 831 682 357.
--   Ularning hech biri F2 akt qatorlariga yoki АОСР ga bog'lanmagan.
-- Aniqlash: 84 dagi rz-ostidagi mat/ob qator (tur, nom, birlik, hajm, tartibdagi o'rni) 91 da
-- mos juftiga ega bo'lmasa — ortiqcha. Qatorlar avval ZAXIRA jadvaliga ko'chiriladi (rollback).
-- Yangi importlarda takrorlanmaydi: t2_smeta_import_dublikat_guard_v1 (production'da).

begin;

create table if not exists public.t2_qator_zaxira_suniy_kol_84 (like public.t2_qator including all);

with q as (select * from public.t2_qator where obyekt_id in (84, 91)),
m as (
  select c.obyekt_id, c.id, c.tur, lower(btrim(coalesce(c.nom,''))) nk, lower(btrim(coalesce(c.birlik,''))) bk, c.hajm,
         row_number() over (partition by c.obyekt_id, c.tur, lower(btrim(coalesce(c.nom,''))), lower(btrim(coalesce(c.birlik,''))), c.hajm order by c.tartib, c.id) rn
  from q c join q p on p.id = c.ota_id
  where p.tur = 'rz' and c.tur in ('mat','ob')
),
ortiqcha as (
  select a.id from m a
  where a.obyekt_id = 84
    and not exists (select 1 from m b where b.obyekt_id = 91 and b.tur = a.tur and b.nk = a.nk and b.bk = a.bk
                    and b.hajm is not distinct from a.hajm and b.rn = a.rn)
)
insert into public.t2_qator_zaxira_suniy_kol_84 select q.* from public.t2_qator q join ortiqcha o on o.id = q.id;

do $$
declare n int; s numeric; bogliq int;
begin
  select count(*), round(sum(summa)) into n, s from public.t2_qator_zaxira_suniy_kol_84;
  select count(*) into bogliq from public.t2_qator_zaxira_suniy_kol_84 z
   where exists (select 1 from public.t2_akt_qator aq where aq.qator_id = z.id)
      or exists (select 1 from public.t2_aosr_bog b where b.qator_id = z.id);
  if n <> 2411 or bogliq > 0 then
    raise exception 'TO''XTATILDI: kutilgan 2411 qator va 0 bog''liq edi, topildi % qator, % bog''liq (summa %)', n, bogliq, s;
  end if;
end $$;

delete from public.t2_qator q using public.t2_qator_zaxira_suniy_kol_84 z where q.id = z.id;

commit;

-- ROLLBACK (kerak bo'lsa):
--   begin;
--   insert into public.t2_qator select * from public.t2_qator_zaxira_suniy_kol_84 on conflict (id) do nothing;
--   commit;
