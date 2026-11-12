-- 20261217600000 - LOYIHA TAHRIRLARI FARQI va «SMETA ESKIRGAN» belgisi.
-- Egasi: «loyihada o'zgarish ko'p». Chizma to'plamining har yangi tahriri (masalan «ekspertiza 2026-01-28») alohida nomlanadi; varaq belgisi bo'yicha
-- eski tahrir bilan farq (o'zgargan / olingan / yangi varaq; spetsifikatsiya miqdorlari, foiz), smeta qaysi tahrirga asoslangani saqlanadi,
-- yangiroq tahrirda smeta bo'limlari eskirgani ko'rsatiladi va har farq uchun QAROR yoziladi (smetaga ko'chirish / pereraschet / qoldirish).
-- Qayta ishlatiladi (dublikat jadval YO'Q): miqdorlar - mavjud t2_loyiha_miqdor (faqat nullable `tahrir_id` qo'shiladi), smeta qatoriga bog'lanish -
-- t2_loyiha_moslik. Asl smeta (t2_qator) HECH QACHON o'zgarmaydi; bu yerda faqat qaror yoziladi (ko'chirish/pereraschet - mavjud oqimlar).
-- DB hajmi (500 MB chegarasi, ~466 MB band): PDF matni/koordinata/xom JSON bazaga YOZILMAYDI (R2 da). Tahrir qatori ~0.1 KB; har tahrirdagi miqdor qatorlari
-- ~0.3 KB (varaq x element): 200 varaq x 3 element ~ 600 qator ~ 0.2 MB/tahrir; qaror ~0.2 KB. 100 obyekt x 5 tahrir ~ 100 MB EMAS, ~ 100 MB gacha
-- eng yomon holat; real: obyekt boshiga 2-3 tahrir ~ 0.5 MB. Pul bu yerda hisoblanmaydi (faqat miqdor va bog'langan qator narxi); summa - frontend hisob-yadro.
-- Faqat additiv. Rollback/acceptance - yonidagi fayllar.

create table if not exists public.t2_loyiha_tahrir (
  id bigint generated always as identity primary key,
  kompaniya_id bigint not null references public.t2_kompaniya(id),
  obyekt_id bigint not null references public.t2_obyekt(id),
  nom text not null check (length(btrim(nom)) between 1 and 80),
  sana date,
  smeta_asosi boolean not null default false,                                  -- smeta shu tahrirga asoslangan (obyektda bittagina)
  actor_id bigint not null,
  yaratildi timestamptz not null default now(),
  unique (obyekt_id, nom)
);
create unique index if not exists t2_loyiha_tahrir_asos_uq on public.t2_loyiha_tahrir (obyekt_id) where smeta_asosi;
create index if not exists t2_loyiha_tahrir_obyekt_idx on public.t2_loyiha_tahrir (kompaniya_id, obyekt_id);
alter table public.t2_loyiha_tahrir enable row level security;
revoke all on table public.t2_loyiha_tahrir from anon, authenticated;

alter table public.t2_loyiha_miqdor add column if not exists tahrir_id bigint references public.t2_loyiha_tahrir(id);
create index if not exists t2_loyiha_miqdor_tahrir_idx on public.t2_loyiha_miqdor (tahrir_id) where tahrir_id is not null;

create table if not exists public.t2_loyiha_tahrir_qaror (
  id bigint generated always as identity primary key,
  kompaniya_id bigint not null references public.t2_kompaniya(id),
  obyekt_id bigint not null references public.t2_obyekt(id),
  eski_tahrir_id bigint not null references public.t2_loyiha_tahrir(id),
  yangi_tahrir_id bigint not null references public.t2_loyiha_tahrir(id),
  varaq text not null check (length(btrim(varaq)) between 1 and 40),
  kalit text not null check (length(kalit) <= 400),                            -- tur|belgi|nom (miqdor qatori kaliti)
  qaror text not null check (qaror in ('smetaga_kochir', 'pereraschet', 'qoldir')),
  sabab text check (sabab is null or length(sabab) <= 500),
  actor_id bigint not null,
  yaratildi timestamptz not null default now(),
  unique (obyekt_id, eski_tahrir_id, yangi_tahrir_id, varaq, kalit)
);
alter table public.t2_loyiha_tahrir_qaror enable row level security;
revoke all on table public.t2_loyiha_tahrir_qaror from anon, authenticated;

create or replace function public._t2_lm_tahrir_yarat_ich(p_kompaniya_id bigint, p_obyekt_id bigint, p_nom text, p_sana date, p_actor_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id bigint;
begin
  if not exists (select 1 from public.t2_obyekt where id = p_obyekt_id and kompaniya_id = p_kompaniya_id) then
    return jsonb_build_object('ok', false, 'code', 'OBYEKT', 'error', 'Obyekt sizning kompaniyangizniki emas');
  end if;
  if length(btrim(coalesce(p_nom, ''))) < 1 then return jsonb_build_object('ok', false, 'code', 'NOM', 'error', 'Tahrir nomi kerak'); end if;
  select id into v_id from public.t2_loyiha_tahrir where obyekt_id = p_obyekt_id and nom = btrim(p_nom);
  if found then return jsonb_build_object('ok', true, 'id', v_id, 'qayta', true); end if;
  insert into public.t2_loyiha_tahrir (kompaniya_id, obyekt_id, nom, sana, actor_id) values (p_kompaniya_id, p_obyekt_id, btrim(p_nom), p_sana, p_actor_id) returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'qayta', false);
end $$;

-- Varaq miqdorlarini yozadi (mavjud _t2_lm_yoz_ich) va ularni tahrirga biriktiradi.
create or replace function public._t2_lm_tahrir_yoz_ich(p_kompaniya_id bigint, p_obyekt_id bigint, p_tahrir_id bigint, p_varaq text, p_revizya integer, p_toplam_id bigint,
  p_items jsonb, p_actor_id bigint, p_op uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare r jsonb;
begin
  if p_op is null then return jsonb_build_object('ok', false, 'code', 'OP', 'error', 'operation_id kerak'); end if;
  if not exists (select 1 from public.t2_loyiha_tahrir where id = p_tahrir_id and kompaniya_id = p_kompaniya_id and obyekt_id = p_obyekt_id) then
    return jsonb_build_object('ok', false, 'code', 'TAHRIR', 'error', 'Tahrir topilmadi');
  end if;
  r := public._t2_lm_yoz_ich(p_kompaniya_id, p_obyekt_id, p_varaq, p_revizya, p_toplam_id, p_items, p_actor_id, p_op);
  if (r->>'ok')::boolean then
    update public.t2_loyiha_miqdor set tahrir_id = p_tahrir_id where kompaniya_id = p_kompaniya_id and obyekt_id = p_obyekt_id and operation_id = p_op and tahrir_id is null;
  end if;
  return r;
end $$;

create or replace function public._t2_lm_tahrir_asos_ich(p_kompaniya_id bigint, p_obyekt_id bigint, p_tahrir_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not exists (select 1 from public.t2_loyiha_tahrir where id = p_tahrir_id and kompaniya_id = p_kompaniya_id and obyekt_id = p_obyekt_id) then
    return jsonb_build_object('ok', false, 'code', 'TAHRIR', 'error', 'Tahrir topilmadi');
  end if;
  update public.t2_loyiha_tahrir set smeta_asosi = false where obyekt_id = p_obyekt_id and kompaniya_id = p_kompaniya_id and smeta_asosi and id <> p_tahrir_id;
  update public.t2_loyiha_tahrir set smeta_asosi = true where id = p_tahrir_id;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public._t2_lm_tahrir_royxat_ich(p_kompaniya_id bigint, p_obyekt_id bigint)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('ok', true, 'tahrirlar', coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id, 'nom', t.nom, 'sana', t.sana, 'smeta_asosi', t.smeta_asosi, 'yaratildi', t.yaratildi,
    'varaq_soni', (select count(distinct upper(m.varaq)) from public.t2_loyiha_miqdor m where m.tahrir_id = t.id),
    'element_soni', (select count(*) from public.t2_loyiha_miqdor m where m.tahrir_id = t.id)
  ) order by t.yaratildi, t.id), '[]'::jsonb))
  from public.t2_loyiha_tahrir t where t.kompaniya_id = p_kompaniya_id and t.obyekt_id = p_obyekt_id
$$;

-- Ikki tahrir farqi (varaq belgisi + element kaliti bo'yicha). Faqat o'zgargan/olingan/yangi elementlar qaytadi; har biriga eski (yoki yangi) tahrirdagi
-- tasdiqlangan bog'lanish: smeta qatori (joriy versiya) va uning bo'limi - pul ta'siri hisob-yadro orqali frontendda hisoblanadi.
create or replace function public._t2_lm_tahrir_farq_ich(p_kompaniya_id bigint, p_obyekt_id bigint, p_eski bigint, p_yangi bigint)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_items jsonb; v_varaq jsonb; v_qaror jsonb;
begin
  if not exists (select 1 from public.t2_loyiha_tahrir where id = p_eski and kompaniya_id = p_kompaniya_id and obyekt_id = p_obyekt_id)
     or not exists (select 1 from public.t2_loyiha_tahrir where id = p_yangi and kompaniya_id = p_kompaniya_id and obyekt_id = p_obyekt_id) then
    return jsonb_build_object('ok', false, 'code', 'TAHRIR', 'error', 'Tahrir topilmadi');
  end if;
  with j as (
  select coalesce(a.varaq, b.varaq) as varaq, coalesce(a.kalit, b.kalit) as kalit, a.id as a_id, b.id as b_id, coalesce(b.nom, a.nom) as nom, coalesce(b.tur, a.tur) as tur, coalesce(b.belgi, a.belgi) as belgi,
    a.birlik as a_birlik, b.birlik as b_birlik, a.miqdor as a_miq, b.miqdor as b_miq,
    case when a.id is null then 'yangi' when b.id is null then 'olingan'
         when a.miqdor is not distinct from b.miqdor and lower(a.birlik) = lower(b.birlik) then 'ayni' else 'ozgargan' end as holat
    from (select * from public.t2_loyiha_miqdor where kompaniya_id = p_kompaniya_id and obyekt_id = p_obyekt_id and tahrir_id = p_eski and holat <> 'rad') a
    full join (select * from public.t2_loyiha_miqdor where kompaniya_id = p_kompaniya_id and obyekt_id = p_obyekt_id and tahrir_id = p_yangi and holat <> 'rad') b
      on upper(a.varaq) = upper(b.varaq) and a.kalit = b.kalit
  )
  select coalesce((select jsonb_agg(x.o order by x.o->>'varaq', x.o->>'nom') from (
    select jsonb_build_object(
      'varaq', j.varaq, 'kalit', j.kalit, 'nom', j.nom, 'tur', j.tur, 'belgi', j.belgi, 'holat', j.holat,
      'eski_birlik', j.a_birlik, 'yangi_birlik', j.b_birlik, 'eski_miqdor', j.a_miq, 'yangi_miqdor', j.b_miq,
      'eski_norm', public._t2_lm_norm(j.a_miq, j.a_birlik), 'yangi_norm', public._t2_lm_norm(j.b_miq, j.b_birlik),
      'foiz', case when public._t2_lm_norm(j.a_miq, j.a_birlik) > 0 and public._t2_lm_norm(j.b_miq, j.b_birlik) is not null
                   then round((public._t2_lm_norm(j.b_miq, j.b_birlik) - public._t2_lm_norm(j.a_miq, j.a_birlik)) / public._t2_lm_norm(j.a_miq, j.a_birlik) * 100, 2) end,
      'boglar', coalesce((select jsonb_agg(distinct jsonb_build_object('qator_id', q.id, 'kod', q.kod, 'nom', q.nom, 'birlik', q.birlik, 'hajm', q.hajm, 'narx', q.narx, 'kat', q.kat,
                   'bolim_id', q.ota_id, 'bolim_nom', (select p.nom from public.t2_qator p where p.id = q.ota_id)))
                 from public.t2_loyiha_moslik mo join public.t2_qator q on q.id = mo.qator_id
                 where mo.miqdor_id in (j.a_id, j.b_id) and q.versiya_holat = 'faol' and q.kompaniya_id = p_kompaniya_id), '[]'::jsonb)
    ) as o from j where j.holat <> 'ayni'
  ) x), '[]'::jsonb),
  coalesce((select jsonb_agg(jsonb_build_object('varaq', s.varaq, 'eski_soni', s.a, 'yangi_soni', s.b, 'ozgargan', s.oz, 'olingan', s.ol, 'yangi', s.ya, 'ayni', s.ay,
    'holat', case when s.b = 0 then 'olingan_varaq' when s.a = 0 then 'yangi_varaq' when s.oz + s.ol + s.ya > 0 then 'ozgargan' else 'ayni' end) order by s.varaq) from (
    select varaq, count(a_id) a, count(b_id) b, count(*) filter (where holat = 'ozgargan') oz, count(*) filter (where holat = 'olingan') ol,
           count(*) filter (where holat = 'yangi') ya, count(*) filter (where holat = 'ayni') ay from j group by varaq
  ) s), '[]'::jsonb) into v_items, v_varaq;

  select coalesce(jsonb_agg(jsonb_build_object('varaq', q.varaq, 'kalit', q.kalit, 'qaror', q.qaror, 'sabab', q.sabab, 'yaratildi', q.yaratildi)), '[]'::jsonb) into v_qaror
    from public.t2_loyiha_tahrir_qaror q where q.kompaniya_id = p_kompaniya_id and q.obyekt_id = p_obyekt_id and q.eski_tahrir_id = p_eski and q.yangi_tahrir_id = p_yangi;
  return jsonb_build_object('ok', true, 'eski_id', p_eski, 'yangi_id', p_yangi, 'varaqlar', v_varaq, 'items', v_items, 'qarorlar', v_qaror);
end $$;

create or replace function public._t2_lm_tahrir_qaror_ich(p_kompaniya_id bigint, p_obyekt_id bigint, p_eski bigint, p_yangi bigint, p_varaq text, p_kalit text, p_qaror text, p_sabab text, p_actor_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not exists (select 1 from public.t2_loyiha_tahrir where id = p_eski and kompaniya_id = p_kompaniya_id and obyekt_id = p_obyekt_id)
     or not exists (select 1 from public.t2_loyiha_tahrir where id = p_yangi and kompaniya_id = p_kompaniya_id and obyekt_id = p_obyekt_id) then
    return jsonb_build_object('ok', false, 'code', 'TAHRIR', 'error', 'Tahrir topilmadi');
  end if;
  if p_qaror not in ('smetaga_kochir', 'pereraschet', 'qoldir') then return jsonb_build_object('ok', false, 'code', 'QAROR', 'error', 'Qaror turi noto''g''ri'); end if;
  if p_qaror = 'qoldir' and length(btrim(coalesce(p_sabab, ''))) < 3 then return jsonb_build_object('ok', false, 'code', 'SABAB', 'error', 'Qoldirish uchun sabab yozing'); end if;
  insert into public.t2_loyiha_tahrir_qaror (kompaniya_id, obyekt_id, eski_tahrir_id, yangi_tahrir_id, varaq, kalit, qaror, sabab, actor_id)
  values (p_kompaniya_id, p_obyekt_id, p_eski, p_yangi, btrim(p_varaq), left(p_kalit, 400), p_qaror, left(p_sabab, 500), p_actor_id)
  on conflict (obyekt_id, eski_tahrir_id, yangi_tahrir_id, varaq, kalit) do update set qaror = excluded.qaror, sabab = excluded.sabab, actor_id = excluded.actor_id, yaratildi = now();
  return jsonb_build_object('ok', true);
end $$;

-- Ochiq (actor tekshiruvli) RPC lar
create or replace function public.t2_loyiha_tahrir_yarat_v1(p_actor_id bigint, p_kompaniya_id bigint, p_obyekt_id bigint, p_nom text, p_sana date)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'smeta.write');
  return public._t2_lm_tahrir_yarat_ich(p_kompaniya_id, p_obyekt_id, p_nom, p_sana, p_actor_id);
end $$;
create or replace function public.t2_loyiha_tahrir_yoz_v1(p_actor_id bigint, p_kompaniya_id bigint, p_obyekt_id bigint, p_tahrir_id bigint, p_varaq text, p_revizya integer, p_toplam_id bigint, p_items jsonb, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'smeta.write');
  return public._t2_lm_tahrir_yoz_ich(p_kompaniya_id, p_obyekt_id, p_tahrir_id, p_varaq, p_revizya, p_toplam_id, p_items, p_actor_id, p_operation_id);
end $$;
create or replace function public.t2_loyiha_tahrir_asos_v1(p_actor_id bigint, p_kompaniya_id bigint, p_obyekt_id bigint, p_tahrir_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'smeta.write');
  return public._t2_lm_tahrir_asos_ich(p_kompaniya_id, p_obyekt_id, p_tahrir_id);
end $$;
create or replace function public.t2_loyiha_tahrir_royxat_v1(p_actor_id bigint, p_kompaniya_id bigint, p_obyekt_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'smeta.read');
  return public._t2_lm_tahrir_royxat_ich(p_kompaniya_id, p_obyekt_id);
end $$;
create or replace function public.t2_loyiha_tahrir_farq_v1(p_actor_id bigint, p_kompaniya_id bigint, p_obyekt_id bigint, p_eski bigint, p_yangi bigint)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'smeta.read');
  return public._t2_lm_tahrir_farq_ich(p_kompaniya_id, p_obyekt_id, p_eski, p_yangi);
end $$;
create or replace function public.t2_loyiha_tahrir_qaror_v1(p_actor_id bigint, p_kompaniya_id bigint, p_obyekt_id bigint, p_eski bigint, p_yangi bigint, p_varaq text, p_kalit text, p_qaror text, p_sabab text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'smeta.write');
  return public._t2_lm_tahrir_qaror_ich(p_kompaniya_id, p_obyekt_id, p_eski, p_yangi, p_varaq, p_kalit, p_qaror, p_sabab, p_actor_id);
end $$;

do $g$
declare f text;
begin
  foreach f in array array[
    '_t2_lm_tahrir_yarat_ich(bigint,bigint,text,date,bigint)', '_t2_lm_tahrir_yoz_ich(bigint,bigint,bigint,text,integer,bigint,jsonb,bigint,uuid)',
    '_t2_lm_tahrir_asos_ich(bigint,bigint,bigint)', '_t2_lm_tahrir_royxat_ich(bigint,bigint)', '_t2_lm_tahrir_farq_ich(bigint,bigint,bigint,bigint)',
    '_t2_lm_tahrir_qaror_ich(bigint,bigint,bigint,bigint,text,text,text,text,bigint)',
    't2_loyiha_tahrir_yarat_v1(bigint,bigint,bigint,text,date)', 't2_loyiha_tahrir_yoz_v1(bigint,bigint,bigint,bigint,text,integer,bigint,jsonb,uuid)',
    't2_loyiha_tahrir_asos_v1(bigint,bigint,bigint,bigint)', 't2_loyiha_tahrir_royxat_v1(bigint,bigint,bigint)', 't2_loyiha_tahrir_farq_v1(bigint,bigint,bigint,bigint,bigint)',
    't2_loyiha_tahrir_qaror_v1(bigint,bigint,bigint,bigint,bigint,text,text,text,text)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $g$;

comment on function public._t2_lm_tahrir_farq_ich(bigint,bigint,bigint,bigint) is 'versiya: versiya - bog''langan smeta qatori faqat versiya_holat = faol; narx birlik narxi (QQS siz), summa hisoblanmaydi.';
comment on function public.t2_loyiha_tahrir_farq_v1(bigint,bigint,bigint,bigint,bigint) is 'versiya: versiya - faqat faol smeta qatorlari bog''lanish orqali o''qiladi.';
comment on function public._t2_lm_tahrir_yoz_ich(bigint,bigint,bigint,text,integer,bigint,jsonb,bigint,uuid) is 'versiya: texnik - t2_qator o''qilmaydi; faqat loyiha miqdorlari tahrirga biriktiriladi.';
comment on function public._t2_lm_tahrir_qaror_ich(bigint,bigint,bigint,bigint,text,text,text,text,bigint) is 'versiya: texnik - faqat qaror yozuvi; t2_qator o''qilmaydi va o''zgarmaydi.';
comment on function public._t2_lm_tahrir_royxat_ich(bigint,bigint) is 'versiya: texnik - faqat tahrir va miqdor sanoqlari; t2_qator o''qilmaydi.';
comment on function public.t2_loyiha_tahrir_royxat_v1(bigint,bigint,bigint) is 'versiya: texnik - faqat tahrir va miqdor sanoqlari; t2_qator o''qilmaydi.';
