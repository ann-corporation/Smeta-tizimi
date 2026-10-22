-- T2-ISH-JOYLARIM («Telegram modeli» markazi, egasi 2026-10-22: «yanada qulay va kreativ — muhitlar o'rtasida inqilob»).
-- Bitta chaqiruvda: foydalanuvchining BARCHA ish joylari (Telegram chatlar ro'yxati kabi) — tur, rol, obyektlar, a'zolar,
-- oxirgi faollik va «sizni kutmoqda» soni; hamda barcha ish joylaridan yig'ilgan «Mening ishlarim» (almashtirmasdan).
-- Faqat o'qish (stable); faqat foydalanuvchining FAOL a'zoliklari; har ish joyidagi ishlar shu a'zolikning ruxsatiga qarab.
begin;

create index if not exists t2_akt_komp_tur_lc_idx on public.t2_akt (kompaniya_id, tur, lifecycle_status);

create or replace function public.t2_ish_joylarim_v1(p_actor_id bigint)
 returns jsonb language plpgsql stable security definer set search_path to 'public', 'pg_temp'
as $function$
declare v_joylar jsonb; v_ishlar jsonb;
begin
  if p_actor_id is null or p_actor_id <= 0 or not exists (select 1 from public.t2_foydalanuvchi where id = p_actor_id and holat = 'faol') then
    return jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED');
  end if;

  with az as (
    select a.rol, k.id kid, k.nom, k.turi, public.t2_azolik_permissions_v2(a.id) perms
      from public.t2_azolik a join public.t2_kompaniya k on k.id = a.kompaniya_id
     where a.foydalanuvchi_id = p_actor_id and a.holat = 'faol' and k.faol
  ), ish as (
    -- Sizni kutayotgan F2: tasdiqlash huquqi bo'lsa — yuborilgan/tekshirilgan; tayyorlash huquqi bo'lsa — qoralama.
    select az.kid, x.id akt_id, x.obyekt_id, o.nom obyekt_nom, x.oy, x.lifecycle_status, x.hujjat_jami, x.yangilandi,
           case when x.lifecycle_status in ('submitted', 'checked') then 'f2_tasdiq' else 'f2_qoralama' end tur
      from az join public.t2_akt x on x.kompaniya_id = az.kid and x.tur = 'f2'
      join public.t2_obyekt o on o.id = x.obyekt_id
     where (x.lifecycle_status in ('submitted', 'checked') and 'f2.approve' = any(az.perms))
        or (x.lifecycle_status = 'draft' and x.holat = 'qoralama' and 'f2.prepare' = any(az.perms))
  ), joy as (
    select jsonb_build_object(
        'kompaniya_id', az.kid, 'nom', az.nom, 'turi', az.turi, 'rol', az.rol,
        'obyektlar', (select count(*) from public.t2_obyekt o where o.kompaniya_id = az.kid and coalesce(o.holat, '') <> 'bekor'),
        'azolar', (select count(*) from public.t2_azolik b where b.kompaniya_id = az.kid and b.holat = 'faol'),
        'f2_tasdiq', (select count(*) from ish where ish.kid = az.kid and ish.tur = 'f2_tasdiq'),
        'f2_qoralama', (select count(*) from ish where ish.kid = az.kid and ish.tur = 'f2_qoralama'),
        'kutmoqda', (select count(*) from ish where ish.kid = az.kid),
        'oxirgi_faollik', (select max(l.yaratilgan_vaqt) from public.t2_audit_log l where l.kompaniya_id = az.kid)) j
      from az
  ), top as (
    select ish.*, az.nom kompaniya_nom from ish join az on az.kid = ish.kid
     order by (ish.tur = 'f2_tasdiq') desc, ish.yangilandi desc limit 50
  )
  select
    (select coalesce(jsonb_agg(j order by (j->>'kutmoqda')::int desc, j->>'oxirgi_faollik' desc nulls last), '[]'::jsonb) from joy),
    (select coalesce(jsonb_agg(jsonb_build_object(
        'kompaniya_id', t.kid, 'kompaniya_nom', t.kompaniya_nom, 'tur', t.tur, 'akt_id', t.akt_id, 'obyekt_id', t.obyekt_id,
        'obyekt_nom', t.obyekt_nom, 'oy', to_char(t.oy, 'YYYY-MM'), 'holat', t.lifecycle_status, 'summa', t.hujjat_jami, 'yangilandi', t.yangilandi)
        order by (t.tur = 'f2_tasdiq') desc, t.yangilandi desc), '[]'::jsonb) from top t)
    into v_joylar, v_ishlar;

  return jsonb_build_object('ok', true, 'ish_joylari', v_joylar, 'ishlarim', v_ishlar);
end $function$;

revoke all on function public.t2_ish_joylarim_v1(bigint) from public, anon, authenticated;
grant execute on function public.t2_ish_joylarim_v1(bigint) to service_role;

commit;
