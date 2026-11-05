-- T2 HUJJAT ESLATMA CRON v1 — muddat eslatmalari va bildirishnomalarni DAVRIY ishga tushirish + Telegram yetkazish navbati.
-- Holat: QO'LLANMAGAN (egasi sinab, o'zi qo'llaydi). Faqat qo'shimcha: yangi jadval, 2 RPC, 4 pg_cron job. Mavjud funksiyalarga tegilmaydi.
--
-- Nega pg_cron: prodda pg_cron 1.6 allaqachon yoqilgan va ishlatiladi (t2-obyekt-snapshot-kunlik, 20261109300000). Bu ishlar faqat
-- baza ichida (SQL → SQL), tashqi tarmoq/sir kerak emas — eng sodda va ishonchli yo'l. Cloudflare Pages Functions cron'ni qo'llamaydi,
-- alohida Worker esa yangi deploy birligi bo'lardi. Telegram yuborish (tashqi HTTP + bot tokeni) bazadan qilinmaydi (pg_net yoqilmagan,
-- token bazaga yozilmaydi): uni GitHub Actions (.github/workflows/bildirishnoma-yetkaz.yml) → /api/bildirishnoma-yetkaz qiladi,
-- shu fayldagi navbat RPC lari orqali.
--
-- Joblar (pg_cron vaqti UTC; Toshkent = UTC+5):
--   t2-hujjat-eslatma-kunlik   03:00 UTC (08:00 Toshkent)  t2_hujjat_eslatma_v1(2)  — xat/murojaat/zanjir muddati yaqin/o'tdi → t2_outbox
--   t2-yb-muddat-kunlik        00:05 UTC (05:05 Toshkent)  t2_yb_muddat_v1()        — yuk birjasi: muddati o'tgan e'lon, avto-tasdiq
--   t2-outbox-bildirishnoma    har 2 daqiqa               t2_outbox_ishlov_v1()    — t2_outbox → t2_bildirishnoma (ilova ichidagi qo'ng'iroqcha)
--   t2-bildirishnoma-tg-tozala har kuni 02:30 UTC          90 kundan eski yakuniy Telegram holat yozuvlari o'chiriladi (faqat yetkazish jurnali)
-- Hammasi idempotent: eslatma operation_id = md5(kalit||mavzu||sana); outbox ishlovi kursor + unique(foydalanuvchi, outbox).

begin;

-- ───────────────────────── 1. Telegram yetkazish holati (bildirishnoma boshiga bitta qator) ─────────────────────────
-- Holat mashinasi: navbat → yuborilmoqda → yuborildi | xato (qayta urinish) | xato_yakuniy | otkazildi (ulanmagan/rozi emas/o'qilgan)
--                  yuborilmoqda 30 daqiqadan oshsa → nomalum (natija noma'lum: QAYTA YUBORILMAYDI — takror xabardan ko'ra yo'qotish afzal).
create table if not exists public.t2_bildirishnoma_tg (
  bildirishnoma_id bigint primary key references public.t2_bildirishnoma(id) on delete cascade,
  holat            text   not null default 'navbat'
                   check (holat in ('navbat','yuborilmoqda','yuborildi','xato','xato_yakuniy','otkazildi','nomalum')),
  urinish          integer not null default 0 check (urinish between 0 and 10),
  oxirgi_xato      text   check (oxirgi_xato is null or length(oxirgi_xato) <= 200),
  yaratildi        timestamptz not null default now(),
  yangilandi       timestamptz not null default now()
);
create index if not exists t2_bildirishnoma_tg_ochiq_idx on public.t2_bildirishnoma_tg (holat, bildirishnoma_id)
  where holat in ('navbat','xato','yuborilmoqda');
alter table public.t2_bildirishnoma_tg enable row level security;
revoke all on table public.t2_bildirishnoma_tg from anon, authenticated;

-- ───────────────────────── 2. Navbatdan olish (claim) ─────────────────────────
-- Faqat hujjat.* bildirishnomalari (topshiriq.* allaqachon topshiriq.ts dan darhol yuboriladi — takror bo'lmasin).
-- Faqat oxirgi 3 kun va o'qilmaganlar (birinchi ishga tushishda eski tarix yuborilmaydi). FOR UPDATE SKIP LOCKED — parallel chaqiriq bir
-- qatorni ikki marta olmaydi; olingan qator darhol «yuborilmoqda» bo'ladi va faqat natija RPC si uni yopadi.
create or replace function public.t2_bildirishnoma_tg_navbat_v1(p_limit integer default 50, p_max_urinish integer default 3)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_lim integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_max integer := least(greatest(coalesce(p_max_urinish, 3), 1), 10);
  v_yangi integer; v_otkaz integer; v_nomalum integer; v jsonb;
begin
  insert into public.t2_bildirishnoma_tg (bildirishnoma_id)
  select b.id from public.t2_bildirishnoma b
   where b.mavzu like 'hujjat.%' and b.oqildi is null and b.yaratildi >= now() - interval '3 days'
  on conflict (bildirishnoma_id) do nothing;
  get diagnostics v_yangi = row_count;

  -- Ilovada o'qilgan yoki kompaniyadan chiqqan odamga endi Telegram kerak emas.
  update public.t2_bildirishnoma_tg g set holat = 'otkazildi', oxirgi_xato = 'OQILGAN_YOKI_AZO_EMAS', yangilandi = now()
    from public.t2_bildirishnoma b
   where b.id = g.bildirishnoma_id and g.holat in ('navbat', 'xato')
     and (b.oqildi is not null or (b.kompaniya_id is not null and not exists (
           select 1 from public.t2_azolik a where a.foydalanuvchi_id = b.foydalanuvchi_id and a.kompaniya_id = b.kompaniya_id and a.holat = 'faol')));
  get diagnostics v_otkaz = row_count;

  update public.t2_bildirishnoma_tg set holat = 'nomalum', oxirgi_xato = 'NATIJA_KELMADI', yangilandi = now()
   where holat = 'yuborilmoqda' and yangilandi < now() - interval '30 minutes';
  get diagnostics v_nomalum = row_count;

  with tanlov as (
    select g.bildirishnoma_id from public.t2_bildirishnoma_tg g
     where g.holat in ('navbat', 'xato') and g.urinish < v_max
     order by g.bildirishnoma_id
     limit v_lim
     for update skip locked
  ), olindi as (
    update public.t2_bildirishnoma_tg g set holat = 'yuborilmoqda', urinish = g.urinish + 1, yangilandi = now()
      from tanlov t where g.bildirishnoma_id = t.bildirishnoma_id
    returning g.bildirishnoma_id, g.urinish
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'foydalanuvchi_id', b.foydalanuvchi_id, 'mavzu', b.mavzu,
                                               'parametrlar', b.parametrlar, 'urinish', o.urinish) order by b.id), '[]'::jsonb)
    into v
    from olindi o join public.t2_bildirishnoma b on b.id = o.bildirishnoma_id;

  return jsonb_build_object('ok', true, 'qatorlar', v, 'navbatga', v_yangi, 'otkazildi', v_otkaz, 'nomalum', v_nomalum);
end $$;

-- ───────────────────────── 3. Natijani yozish ─────────────────────────
-- Faqat «yuborilmoqda» qatorlar yopiladi: yuborildi/otkazildi/nomalum qayta ochilmaydi → hech qachon qayta yuborilmaydi.
-- xato + urinish >= p_max_urinish → xato_yakuniy (boshqa urinilmaydi). nomalum — so'rov ketgan, javob kelmagan: qayta yuborilmaydi.
create or replace function public.t2_bildirishnoma_tg_natija_v1(p_natijalar jsonb, p_max_urinish integer default 3)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_max integer := least(greatest(coalesce(p_max_urinish, 3), 1), 10); v_n integer;
begin
  if p_natijalar is null or jsonb_typeof(p_natijalar) <> 'array' or jsonb_array_length(p_natijalar) > 500 then
    return jsonb_build_object('ok', false, 'code', 'ROYXAT');
  end if;
  with n as (
    select distinct on ((e ->> 'id')::bigint) (e ->> 'id')::bigint as id, e ->> 'holat' as holat, left(e ->> 'xato', 200) as xato
      from jsonb_array_elements(p_natijalar) e
     where jsonb_typeof(e) = 'object' and (e ->> 'id') ~ '^[0-9]{1,18}$' and (e ->> 'holat') in ('yuborildi', 'xato', 'otkazildi', 'nomalum')
     order by (e ->> 'id')::bigint
  )
  update public.t2_bildirishnoma_tg g
     set holat = case when n.holat = 'xato' and g.urinish >= v_max then 'xato_yakuniy' else n.holat end,
         oxirgi_xato = case when n.holat = 'yuborildi' then null else n.xato end,
         yangilandi = now()
    from n
   where g.bildirishnoma_id = n.id and g.holat = 'yuborilmoqda';
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', true, 'yangilandi', v_n);
end $$;

revoke all on function public.t2_bildirishnoma_tg_navbat_v1(integer, integer) from public, anon, authenticated;
revoke all on function public.t2_bildirishnoma_tg_natija_v1(jsonb, integer) from public, anon, authenticated;
grant execute on function public.t2_bildirishnoma_tg_navbat_v1(integer, integer) to service_role;
grant execute on function public.t2_bildirishnoma_tg_natija_v1(jsonb, integer) to service_role;

-- ───────────────────────── 4. pg_cron joblari ─────────────────────────
do $cron$
declare j record;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise warning 'pg_cron yoqilmagan — eslatma/outbox joblari yaratilmadi; tashqi scheduler chaqirishi kerak';
    return;
  end if;
  for j in select * from (values
      ('t2-hujjat-eslatma-kunlik',   '0 3 * * *',   'select public.t2_hujjat_eslatma_v1(2)',                    'public.t2_hujjat_eslatma_v1(integer)'),
      ('t2-yb-muddat-kunlik',        '5 0 * * *',   'select public.t2_yb_muddat_v1()',                          'public.t2_yb_muddat_v1()'),
      ('t2-outbox-bildirishnoma',    '*/2 * * * *', 'select public.t2_outbox_ishlov_v1(''bildirishnoma'', 500)', 'public.t2_outbox_ishlov_v1(text,integer)'),
      ('t2-bildirishnoma-tg-tozala', '30 2 * * *',
       'delete from public.t2_bildirishnoma_tg where holat in (''yuborildi'',''xato_yakuniy'',''otkazildi'',''nomalum'') and yangilandi < now() - interval ''90 days''',
       'public.t2_bildirishnoma_tg_navbat_v1(integer,integer)')
    ) as v(nom, jadval, buyruq, funksiya) loop
    if to_regprocedure(j.funksiya) is null then
      raise warning 'Funksiya % yo''q — % job yaratilmadi', j.funksiya, j.nom;
      continue;
    end if;
    if exists (select 1 from cron.job where jobname = j.nom) then perform cron.unschedule(j.nom); end if;
    perform cron.schedule(j.nom, j.jadval, j.buyruq);
  end loop;
end $cron$;

commit;
