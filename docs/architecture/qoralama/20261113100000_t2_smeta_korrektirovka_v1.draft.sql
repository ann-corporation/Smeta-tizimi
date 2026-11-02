-- QORALAMA (PRODGA EMAS, supabase/migrations ga KO'CHIRILMAGAN) — 20261113100000 SMETA KORREKTIROVKASI (B).
-- Dizayn: docs/architecture/SMETA_CONST_KORREKTIROVKA.md §3. Egasining §4 savollariga javobdan keyin yakunlanadi,
-- .rollback.sql + .acceptance.sql (BEGIN..ROLLBACK, Stella 152 nusxasida) bilan alohida PR.
--
-- G'OYA: korrektirovka = #157 versiyasi (tur='korrektirovka') + moslik → BITTA t2_smeta_ozgarish (tur='korrektirovka')
-- → mavjud t2_smeta_ozgarish_tasdiqlash_v1 (t2_qator yangilanadi, revision seq N = amaldagi) → muhr bosqich N.
-- qator_id BARQAROR: tasdiqlangan F2 (t2_akt_qator.qator_id, revision_id) va fakt o'z joyida qoladi; nakopitelniy
-- «oldingi olingan» va qoldiq avtomatik to'g'ri; kesilgan hajm (qoldiq < 0) → da'vo/pereraschet ro'yxati.
begin;

-- 1. Sxema kengaytmasi (additive).
alter table public.t2_smeta_ozgarish drop constraint t2_smeta_ozgarish_tur_check;
alter table public.t2_smeta_ozgarish add constraint t2_smeta_ozgarish_tur_check check (tur = any (array[
  'almashtirish','qoshimcha_ish','olib_tashlash','hajm_ozgarish','yangi_bolim','yangi_ish','resurs_almashtirish','boshqa','korrektirovka']));
alter table public.t2_smeta_ozgarish add column if not exists versiya_id bigint references public.t2_smeta_versiya(id);
alter table public.t2_smeta_ozgarish_qator add column if not exists moslik_id bigint references public.t2_smeta_versiya_moslik(id);
alter table public.t2_smeta_versiya add column if not exists natija_ozgarish_id bigint references public.t2_smeta_ozgarish(id);

-- 2. Reja (faqat o'qish): moslikdan → o'zgarish qatorlari. Hech narsa yozmaydi; UI «Amaldagi qilish» oldidan ko'rsatadi.
--    ozgarmagan → yo'q | kamaygan/oshgan → amal 'hajm' (eski_hajm = joriy, yangi_hajm = versiya)
--    ochirilgan → amal 'olib_tashlash' (hajm 0, sabab majburiy) | almashtirilgan → 'olib_tashlash' eski + 'qoshish' yangi
--    (replaces_line_id = eski) | yangi → 'qoshish' (ota = moslik bo'yicha bo'lim; narx — §4 savol 3) | noaniq/kutilmoqda → BLOK.
--    F2 ta'siri: har qator uchun Σ tasdiqlangan F2 (t2_akt_qator, holat=tasdiqlangan) va yangi hajm → «kesilgan» (F2 > yangi).
create or replace function public.t2_smeta_korrektirovka_reja_v1(p_kompaniya_id bigint, p_actor_id bigint, p_versiya_id bigint)
returns jsonb language plpgsql stable security definer set search_path to 'public', 'pg_temp' as $function$
declare v_v public.t2_smeta_versiya; v_rev bigint; v_res jsonb;
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  select * into v_v from public.t2_smeta_versiya where id = p_versiya_id and kompaniya_id = p_kompaniya_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'VERSIYA_TOPILMADI'); end if;
  if v_v.tur <> 'korrektirovka' or v_v.holat <> 'tayyor' then return jsonb_build_object('ok', false, 'code', 'VERSIYA_KORREKTIROVKA_EMAS'); end if;
  if exists (select 1 from public.t2_smeta_versiya_moslik m where m.versiya_id = p_versiya_id and (m.holat = 'noaniq' or m.tasdiq = 'kutilmoqda')) then
    return jsonb_build_object('ok', false, 'code', 'NOANIQ_MOSLIK_BOR');
  end if;
  select id into v_rev from public.t2_smeta_revision where obyekt_id = v_v.obyekt_id order by seq desc limit 1;
  with f2 as (
    select aq.qator_id, sum(aq.hajm) as f2_hajm
      from public.t2_akt_qator aq join public.t2_akt a on a.id = aq.akt_id
     where a.obyekt_id = v_v.obyekt_id and a.tur = 'f2' and a.holat = 'tasdiqlangan' group by aq.qator_id)
  select jsonb_build_object('ok', true, 'kutilgan_revision_id', v_rev, 'qatorlar', coalesce(jsonb_agg(jsonb_build_object(
           'moslik_id', m.id, 'holat', m.holat, 'qator_id', m.qator_id, 'eski_hajm', q.hajm, 'yangi_hajm', p.hajm,
           'f2_hajm', f2.f2_hajm,
           'kesilgan', case when f2.f2_hajm is null or p.hajm is null then null else greatest(f2.f2_hajm - p.hajm, 0) end)
         order by p.tartib nulls last), '[]'::jsonb))
    into v_res
    from public.t2_smeta_versiya_moslik m
    left join public.t2_smeta_versiya_pozitsiya p on p.id = m.pozitsiya_id
    left join public.t2_qator q on q.id = m.qator_id
    left join f2 on f2.qator_id = m.qator_id
   where m.versiya_id = p_versiya_id and m.holat <> 'ozgarmagan';
  return v_res;
end $function$;

-- 3. Qo'llash: reja → t2_smeta_ozgarish (+_qator) → mavjud tasdiqlash → muhr bosqich N.
--    Shartlar: operation_id idempotent; p_kutilgan_revision_id = amaldagi (aks holda REVISION_ZIDDIYAT);
--    qo'llashdan oldin snapshot.obyekt_snapshot (favqulodda rollback); rol — §4 savol 5.
--    TODO (egasi javobidan keyin): almashtirishda replaces_line_id/change_type='REPLACEMENT' va zamena=true
--    (hozirgi tasdiqlash buni faqat o.tur ∈ almashtirish da qiladi — korrektirovka uchun qator darajasida kengaytiriladi);
--    yangi pozitsiya narxi; ekspertizagacha bo'limlar (savol 4).
create or replace function public.t2_smeta_korrektirovka_qolla_v1(
  p_kompaniya_id bigint, p_actor_id bigint, p_versiya_id bigint, p_kutilgan_revision_id bigint, p_sabab text, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
begin
  -- QORALAMA: 1) reja := t2_smeta_korrektirovka_reja_v1(...); ok emas → qaytar.
  --           2) revision ziddiyati: (select id ... order by seq desc limit 1) <> p_kutilgan_revision_id → REVISION_ZIDDIYAT.
  --           3) insert t2_smeta_ozgarish (tur='korrektirovka', versiya_id, sabab, baseline_snapshot = joriy qatorlar+versiya, operation_id).
  --           4) insert t2_smeta_ozgarish_qator — rejadagi har qator (moslik_id bilan).
  --           5) perform t2_smeta_ozgarish_tasdiqlash_v1(ozgarish_id, actor, versiya, operation_id) → natija_revision_id (seq N).
  --           6) insert t2_qator_muhr (bosqich = seq N, manba='korrektirovka', revision_id = natija) — tegilgan va yangi qatorlar.
  --           7) update t2_smeta_versiya set natija_ozgarish_id; t2_audit_yoz; command log.
  raise exception 'QORALAMA: t2_smeta_korrektirovka_qolla_v1 hali yakunlanmagan (egasi qarorlari kutilmoqda)';
end $function$;

-- 4. Rollback (teskari amal): mavjud t2_smeta_ozgarish_qaytar_v1 + korrektirovkadan keyin tasdiqlangan F2 bo'lsa rad
--    (F2_KORREKTIROVKADAN_KEYIN); muhr bosqich N yopiladi (yopilish_sabab = 'korrektirovka bekor qilindi').

revoke all on function public.t2_smeta_korrektirovka_reja_v1(bigint, bigint, bigint) from public, anon, authenticated;
revoke all on function public.t2_smeta_korrektirovka_qolla_v1(bigint, bigint, bigint, bigint, text, uuid) from public, anon, authenticated;
grant execute on function public.t2_smeta_korrektirovka_reja_v1(bigint, bigint, bigint) to service_role;
grant execute on function public.t2_smeta_korrektirovka_qolla_v1(bigint, bigint, bigint, bigint, text, uuid) to service_role;
rollback;  -- QORALAMA: ataylab commit yo'q.
