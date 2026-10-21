-- T2-MODUL-KATALOG («Telegram modeli», egasi 2026-10-21; BOSH_REJA §3): kompaniya o'ziga kerak modullarni yoqadi,
-- o'chirilgan modul menyuda ko'rinmaydi (keyinroq obuna/narx ham shunga ulanadi). Yangi jadval YO'Q — mavjud
-- t2_capability + t2_capability_override (scope='company') ishlatiladi; o'zgartirish — mavjud
-- t2_capability_override_set_v1 (boss/superadmin, versiya, audit, idempotent).
-- Sukut 'on' — hech bir mavjud kompaniya hech narsani yo'qotmaydi. PTO yadrosi (obyekt, smeta, Fakt, F2, Nakop, M-29)
-- modul emas — doim yoqilgan.
begin;

alter table public.t2_capability drop constraint if exists t2_capability_turi_check;
alter table public.t2_capability add constraint t2_capability_turi_check
  check (turi = any (array['capability'::text, 'command'::text, 'job'::text, 'integration'::text, 'module'::text]));

insert into public.t2_capability (kod, nom, izoh, turi, default_holat, owner_domain, kill_switch, versiya)
values
  ('module.narx',   'Narx va oferta',            'RES narxlash, tender oferta, narx manbalari, narx dalili, nakrutka, narx nazorati', 'module', 'on', 'modul', false, 1),
  ('module.loyiha', 'Loyiha, shartnoma va tomonlar', 'Loyihalar, shartnomalar, hujjatlar, ishtirokchilar, kontragentlar, buyurtmachi kabineti', 'module', 'on', 'modul', false, 1),
  ('module.erp',    'Kompaniya boshqaruvi (ERP)', 'Rahbar paneli, moliya, ta''minot va sklad, zayavkalar, kadrlar va texnika, mindmap', 'module', 'on', 'modul', false, 1),
  ('module.aosr',   'АОСР va laboratoriya',      'Yashirin ishlar dalolatnomalari va laboratoriya protokollari', 'module', 'on', 'modul', false, 1)
on conflict (kod) do nothing;

-- Har a'zo uchun (menyu shu bilan quriladi): kompaniyadagi modullar holati. Faqat o'qish; a'zolik ichida tekshiriladi.
create or replace function public.t2_modul_holat_v1(p_kompaniya_id bigint, p_actor_id bigint)
 returns jsonb language plpgsql stable security definer set search_path to 'public', 'pg_temp'
as $function$
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  return jsonb_build_object('ok', true, 'modullar', coalesce((
    select jsonb_agg(jsonb_build_object('kod', c.kod, 'nom', c.nom, 'izoh', c.izoh,
             'holat', e->>'holat', 'manba', e->>'manba', 'versiya', (e->>'versiya')::int) order by c.kod)
      from public.t2_capability c
      cross join lateral public.t2_capability_effective_v1(c.kod, p_kompaniya_id, null) e
     where c.turi = 'module'), '[]'::jsonb));
end $function$;

revoke all on function public.t2_modul_holat_v1(bigint, bigint) from public, anon, authenticated;
grant execute on function public.t2_modul_holat_v1(bigint, bigint) to service_role;

commit;
