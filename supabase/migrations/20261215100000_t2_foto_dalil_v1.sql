-- 20261215100000_t2_foto_dalil_v1  (ekotizim V3, paket P2 «Foto-dalil»)
-- Maqsad: smeta qatori / fakt yozuvi / АОСР / predpisaniya (murojaat) / umumiy obyekt uchun FOTO-DALIL.
-- Fayl o'zi mavjud kanonik yo'ldan o'tadi (t2_document_registry: reserve -> R2 put -> finalize, document_type='foto_dalil');
-- bu migratsiya faqat BOG'LASH qatlamini qo'shadi: qaysi hujjat (foto) qaysi ishga/qatorga/aktga, qachon, qaysi razdelga tegishli.
-- Bazada faqat kalit/sha/meta (document_id orqali) — baytlar R2 da. Parallel hujjat jadvali YO'Q.
-- DB hajmi: ~300 bayt/qator + indeks ~ 0.5 KB; oyiga 10 000 foto ≈ 5 MB (baytlar R2 da).
-- AI: taklif (ai_izoh, ai_taklif) faqat TAKLIF; manba foydalanuvchi tasdiqlagandagina o'zgaradi (qayta_bogla).
-- versiya: texnik

create table if not exists public.t2_foto_dalil (
  id bigint generated always as identity primary key,
  kompaniya_id bigint not null references public.t2_kompaniya(id),
  obyekt_id bigint not null references public.t2_obyekt(id),
  document_id bigint not null references public.t2_document_registry(id),
  manba_turi text not null default 'umumiy' check (manba_turi ~ '^[a-z][a-z0-9_]{1,30}$'),
  manba_id bigint,
  razdel_id bigint,
  razdel_nom text check (razdel_nom is null or length(razdel_nom) <= 300),
  sana date not null default current_date,
  lat numeric(9,6) check (lat is null or lat between -90 and 90),
  lng numeric(9,6) check (lng is null or lng between -180 and 180),
  izoh text check (izoh is null or length(izoh) <= 500),
  ai_izoh text check (ai_izoh is null or length(ai_izoh) <= 500),
  ai_taklif jsonb,
  ai_tasdiq boolean not null default false,
  holat text not null default 'faol' check (holat in ('faol','ochirildi')),
  actor_id bigint not null,
  operation_id uuid,
  yaratildi timestamptz not null default now(),
  yangilandi timestamptz not null default now(),
  check ((manba_turi = 'umumiy') = (manba_id is null))
);
create unique index if not exists t2_foto_dalil_op_uq on public.t2_foto_dalil (kompaniya_id, operation_id) where operation_id is not null;
create unique index if not exists t2_foto_dalil_manba_uq on public.t2_foto_dalil (kompaniya_id, document_id, manba_turi, coalesce(manba_id, 0)) where holat = 'faol';
create index if not exists t2_foto_dalil_obyekt_idx on public.t2_foto_dalil (obyekt_id, sana desc, id desc) where holat = 'faol';
create index if not exists t2_foto_dalil_manba_idx on public.t2_foto_dalil (obyekt_id, manba_turi, manba_id) where holat = 'faol';
alter table public.t2_foto_dalil enable row level security;
revoke all on table public.t2_foto_dalil from anon, authenticated;

-- Manba tekshiruvi: bilingan turlar kompaniya/obyekt doirasida bo'lishi shart; razdel (eng yuqori «rz» ota) aniqlanadi.
create or replace function public._t2_foto_manba_tekshir(p_kompaniya_id bigint, p_obyekt_id bigint, p_turi text, p_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_qator bigint; v_nom text; v_rid bigint; v_rnom text;
begin
  if p_turi = 'umumiy' then
    return jsonb_build_object('ok', true);
  end if;
  if p_id is null then return jsonb_build_object('ok', false, 'code', 'MANBA_ID_KERAK'); end if;
  if p_turi = 'qator' then
    select q.id, coalesce(nullif(btrim(coalesce(q.kod,'') || ' ' || coalesce(q.nom,'')), ''), '#' || q.id) into v_qator, v_nom
      from public.t2_qator q join public.t2_obyekt o on o.id = q.obyekt_id
     where q.id = p_id and q.obyekt_id = p_obyekt_id and o.kompaniya_id = p_kompaniya_id;
  elsif p_turi = 'fakt' then
    select aq.qator_id, '#' || aq.id into v_qator, v_nom
      from public.t2_akt_qator aq
     where aq.id = p_id and aq.obyekt_id = p_obyekt_id and aq.kompaniya_id = p_kompaniya_id;
    if found then
      select coalesce(nullif(btrim(coalesce(q.kod,'') || ' ' || coalesce(q.nom,'')), ''), v_nom) into v_nom from public.t2_qator q where q.id = v_qator;
    end if;
  elsif p_turi = 'aosr' then
    select coalesce(nullif(btrim(coalesce(a.raqam,'') || ' ' || coalesce(a.ish_nomi,'')), ''), '#' || a.id) into v_nom
      from public.t2_aosr a where a.id = p_id and a.obyekt_id = p_obyekt_id and a.kompaniya_id = p_kompaniya_id;
  elsif p_turi in ('predpisaniya', 'murojaat') then
    select m.sarlavha into v_nom from public.t2_tomon_murojaat m
     where m.id = p_id and (m.beruvchi_kompaniya_id = p_kompaniya_id or m.ijrochi_kompaniya_id = p_kompaniya_id)
       and (m.obyekt_id is null or m.obyekt_id = p_obyekt_id);
  else
    -- boshqa tomon agentlari (texnadzor, usta, loyihachi, sinov...) o'z ob'ektiga ko'rsatgich: obyekt/kompaniya doirasi yetarli.
    return jsonb_build_object('ok', true, 'manba_nom', null);
  end if;
  if not found then return jsonb_build_object('ok', false, 'code', 'MANBA_TOPILMADI'); end if;
  if v_qator is not null then
    with recursive yol as (
      select q.id, q.ota_id, q.tur, q.nom, 0 as d from public.t2_qator q where q.id = v_qator
      union all
      select p.id, p.ota_id, p.tur, p.nom, y.d + 1 from public.t2_qator p join yol y on p.id = y.ota_id where y.d < 30
    )
    select y.id, y.nom into v_rid, v_rnom from yol y where y.tur = 'rz' order by y.d desc limit 1;
  end if;
  return jsonb_build_object('ok', true, 'manba_nom', v_nom, 'razdel_id', v_rid, 'razdel_nom', v_rnom);
end $$;
revoke all on function public._t2_foto_manba_tekshir(bigint, bigint, text, bigint) from public, anon, authenticated;

create or replace function public.t2_foto_dalil_bogla_v1(
  p_actor_id bigint, p_kompaniya_id bigint, p_obyekt_id bigint, p_document_id bigint,
  p_manba_turi text, p_manba_id bigint, p_sana date, p_lat numeric, p_lng numeric, p_izoh text, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_rol text; v_turi text := coalesce(nullif(btrim(p_manba_turi), ''), 'umumiy'); v_old public.t2_foto_dalil; v_m jsonb; v_id bigint; v_sana date;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  v_rol := public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  if v_rol in ('kuzatuvchi') then return jsonb_build_object('ok', false, 'code', 'ROL_YETARLI_EMAS', 'error', 'Foto biriktirish uchun rolingiz yetarli emas'); end if;
  select * into v_old from public.t2_foto_dalil where kompaniya_id = p_kompaniya_id and operation_id = p_operation_id;
  if found then return jsonb_build_object('ok', true, 'id', v_old.id, 'qayta', true); end if;
  if v_turi !~ '^[a-z][a-z0-9_]{1,30}$' then return jsonb_build_object('ok', false, 'code', 'MANBA_TURI'); end if;
  if not exists (select 1 from public.t2_obyekt o where o.id = p_obyekt_id and o.kompaniya_id = p_kompaniya_id) then
    return jsonb_build_object('ok', false, 'code', 'OBYEKT_BEGONA');
  end if;
  if not exists (select 1 from public.t2_document_registry d where d.id = p_document_id and d.kompaniya_id = p_kompaniya_id
                  and d.canonical_storage_status = 'stored' and d.document_type = 'foto_dalil'
                  and (d.obyekt_id is null or d.obyekt_id = p_obyekt_id)) then
    return jsonb_build_object('ok', false, 'code', 'DALIL_BEGONA', 'error', 'Foto fayli sizning kompaniyangizniki emas yoki hali saqlanmagan');
  end if;
  v_m := public._t2_foto_manba_tekshir(p_kompaniya_id, p_obyekt_id, v_turi, case when v_turi = 'umumiy' then null else p_manba_id end);
  if not coalesce((v_m->>'ok')::boolean, false) then return v_m; end if;
  v_sana := least(coalesce(p_sana, current_date), current_date + 1);
  begin
    insert into public.t2_foto_dalil (kompaniya_id, obyekt_id, document_id, manba_turi, manba_id, razdel_id, razdel_nom, sana, lat, lng, izoh, actor_id, operation_id)
    values (p_kompaniya_id, p_obyekt_id, p_document_id, v_turi, case when v_turi = 'umumiy' then null else p_manba_id end,
            nullif(v_m->>'razdel_id', '')::bigint, left(v_m->>'razdel_nom', 300), v_sana, p_lat, p_lng, left(nullif(btrim(coalesce(p_izoh, '')), ''), 500), p_actor_id, p_operation_id)
    returning id into v_id;
  exception when unique_violation then
    select id into v_id from public.t2_foto_dalil where kompaniya_id = p_kompaniya_id and document_id = p_document_id and manba_turi = v_turi
       and coalesce(manba_id, 0) = coalesce(case when v_turi = 'umumiy' then null else p_manba_id end, 0) and holat = 'faol';
    return jsonb_build_object('ok', true, 'id', v_id, 'qayta', true);
  end;
  perform public.t2_audit_yoz(p_kompaniya_id, 'foto_dalil_bogla', 'foto', p_obyekt_id,
    format('foto_id=%s document_id=%s manba=%s:%s', v_id, p_document_id, v_turi, coalesce(p_manba_id::text, '-')), 'actor:' || p_actor_id, null);
  return jsonb_build_object('ok', true, 'id', v_id, 'razdel_id', nullif(v_m->>'razdel_id', '')::bigint, 'razdel_nom', v_m->>'razdel_nom', 'manba_nom', v_m->>'manba_nom');
end $$;

create or replace function public.t2_foto_dalil_yangila_v1(
  p_actor_id bigint, p_kompaniya_id bigint, p_id bigint, p_izoh text, p_ai_izoh text, p_ai_taklif jsonb,
  p_manba_ozgar boolean, p_manba_turi text, p_manba_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_rol text; f public.t2_foto_dalil; v_m jsonb; v_turi text := coalesce(nullif(btrim(p_manba_turi), ''), 'umumiy');
begin
  v_rol := public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  if v_rol in ('kuzatuvchi') then return jsonb_build_object('ok', false, 'code', 'ROL_YETARLI_EMAS'); end if;
  select * into f from public.t2_foto_dalil where id = p_id and kompaniya_id = p_kompaniya_id and holat = 'faol' for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'TOPILMADI', 'error', 'Foto topilmadi'); end if;
  if coalesce(p_manba_ozgar, false) then
    if v_turi !~ '^[a-z][a-z0-9_]{1,30}$' then return jsonb_build_object('ok', false, 'code', 'MANBA_TURI'); end if;
    v_m := public._t2_foto_manba_tekshir(p_kompaniya_id, f.obyekt_id, v_turi, case when v_turi = 'umumiy' then null else p_manba_id end);
    if not coalesce((v_m->>'ok')::boolean, false) then return v_m; end if;
    update public.t2_foto_dalil set manba_turi = v_turi, manba_id = case when v_turi = 'umumiy' then null else p_manba_id end,
      razdel_id = nullif(v_m->>'razdel_id', '')::bigint, razdel_nom = left(v_m->>'razdel_nom', 300),
      ai_tasdiq = (f.ai_taklif is not null and (f.ai_taklif->>'manba_turi') = v_turi and nullif(f.ai_taklif->>'manba_id', '')::bigint is not distinct from p_manba_id),
      yangilandi = now()
     where id = f.id;
  end if;
  update public.t2_foto_dalil set
    izoh = case when p_izoh is null then izoh else left(nullif(btrim(p_izoh), ''), 500) end,
    ai_izoh = case when p_ai_izoh is null then ai_izoh else left(nullif(btrim(p_ai_izoh), ''), 500) end,
    ai_taklif = case when p_ai_taklif is null then ai_taklif else p_ai_taklif end,
    yangilandi = now()
   where id = f.id;
  return jsonb_build_object('ok', true, 'id', f.id);
end $$;

create or replace function public.t2_foto_dalil_ochir_v1(p_actor_id bigint, p_kompaniya_id bigint, p_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_rol text; f public.t2_foto_dalil;
begin
  v_rol := public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  select * into f from public.t2_foto_dalil where id = p_id and kompaniya_id = p_kompaniya_id and holat = 'faol' for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'TOPILMADI', 'error', 'Foto topilmadi'); end if;
  -- o'z fotosini muallif, qolganini rahbariyat/PTO ochiradi
  if f.actor_id <> p_actor_id and v_rol not in ('superadmin', 'admin', 'boss', 'rahbar', 'pto') then
    return jsonb_build_object('ok', false, 'code', 'ROL_YETARLI_EMAS', 'error', 'Faqat o‘zingiz yuklagan fotoni olib tashlay olasiz');
  end if;
  update public.t2_foto_dalil set holat = 'ochirildi', yangilandi = now() where id = f.id;
  perform public.t2_audit_yoz(p_kompaniya_id, 'foto_dalil_ochir', 'foto', f.obyekt_id, format('foto_id=%s document_id=%s', f.id, f.document_id), 'actor:' || p_actor_id, null);
  return jsonb_build_object('ok', true, 'id', f.id);
end $$;

-- O'qish: obyekt bo'yicha lenta (sana/razdel/manba filtri) + sanalar va razdellar xulosasi. Keyset (p_keyin_id) bo'yicha sahifalanadi.
create or replace function public.t2_foto_dalil_royxat_v1(
  p_actor_id bigint, p_kompaniya_id bigint, p_obyekt_id bigint, p_razdel_id bigint, p_manba_turi text, p_manba_id bigint,
  p_dan date, p_gacha date, p_limit integer, p_keyin_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_lim integer := least(greatest(coalesce(p_limit, 120), 1), 500); v_items jsonb; v_sanalar jsonb; v_razdellar jsonb; v_jami bigint;
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  if not exists (select 1 from public.t2_obyekt o where o.id = p_obyekt_id and o.kompaniya_id = p_kompaniya_id) then
    return jsonb_build_object('ok', false, 'code', 'OBYEKT_BEGONA');
  end if;
  select coalesce(jsonb_agg(x order by x.sana desc, x.id desc), '[]'::jsonb) into v_items from (
    select f.id, f.document_id, f.manba_turi, f.manba_id, f.razdel_id, f.razdel_nom, f.sana, f.lat, f.lng, f.izoh, f.ai_izoh, f.ai_taklif, f.ai_tasdiq,
           f.actor_id, f.yaratildi, d.original_filename, d.size_bytes, d.mime_type,
           case f.manba_turi
             when 'qator' then (select btrim(coalesce(q.kod,'') || ' ' || coalesce(q.nom,'')) from public.t2_qator q where q.id = f.manba_id)
             when 'fakt' then (select btrim(coalesce(q.kod,'') || ' ' || coalesce(q.nom,'')) from public.t2_akt_qator aq join public.t2_qator q on q.id = aq.qator_id where aq.id = f.manba_id)
             when 'aosr' then (select btrim(coalesce(a.raqam,'') || ' ' || coalesce(a.ish_nomi,'')) from public.t2_aosr a where a.id = f.manba_id)
             when 'predpisaniya' then (select m.sarlavha from public.t2_tomon_murojaat m where m.id = f.manba_id)
             when 'murojaat' then (select m.sarlavha from public.t2_tomon_murojaat m where m.id = f.manba_id)
             else null end as manba_nom
      from public.t2_foto_dalil f join public.t2_document_registry d on d.id = f.document_id
     where f.kompaniya_id = p_kompaniya_id and f.obyekt_id = p_obyekt_id and f.holat = 'faol'
       and (p_razdel_id is null or f.razdel_id = p_razdel_id)
       and (p_manba_turi is null or f.manba_turi = p_manba_turi)
       and (p_manba_id is null or f.manba_id = p_manba_id)
       and (p_dan is null or f.sana >= p_dan) and (p_gacha is null or f.sana <= p_gacha)
       and (p_keyin_id is null or f.id < p_keyin_id)
     order by f.id desc limit v_lim) x;
  select count(*) into v_jami from public.t2_foto_dalil f
   where f.kompaniya_id = p_kompaniya_id and f.obyekt_id = p_obyekt_id and f.holat = 'faol'
     and (p_razdel_id is null or f.razdel_id = p_razdel_id) and (p_manba_turi is null or f.manba_turi = p_manba_turi)
     and (p_manba_id is null or f.manba_id = p_manba_id) and (p_dan is null or f.sana >= p_dan) and (p_gacha is null or f.sana <= p_gacha);
  select coalesce(jsonb_agg(jsonb_build_object('sana', s.sana, 'soni', s.n) order by s.sana desc), '[]'::jsonb) into v_sanalar
    from (select f.sana, count(*) n from public.t2_foto_dalil f where f.kompaniya_id = p_kompaniya_id and f.obyekt_id = p_obyekt_id and f.holat = 'faol' group by f.sana order by f.sana desc limit 400) s;
  select coalesce(jsonb_agg(jsonb_build_object('razdel_id', r.razdel_id, 'nom', r.nom, 'soni', r.n) order by r.n desc), '[]'::jsonb) into v_razdellar
    from (select f.razdel_id, max(f.razdel_nom) nom, count(*) n from public.t2_foto_dalil f where f.kompaniya_id = p_kompaniya_id and f.obyekt_id = p_obyekt_id and f.holat = 'faol' group by f.razdel_id limit 200) r;
  return jsonb_build_object('ok', true, 'jami', v_jami, 'fotolar', v_items, 'sanalar', v_sanalar, 'razdellar', v_razdellar);
end $$;

-- Versiya qo'riqchisi (AGENTS.md §2c): t2_qator o'qiydigan yangi funksiyalar izohi.
comment on function public._t2_foto_manba_tekshir(bigint, bigint, text, bigint) is 'versiya: texnik - foto manbasi ko''rsatgichi (qator id bo''yicha tekshiruv va razdel nomi); smeta summasi/hajmi hisoblanmaydi, eski (faol bo''lmagan) qatorga ham foto bog''lanishi mumkin.';
comment on function public.t2_foto_dalil_royxat_v1(bigint, bigint, bigint, bigint, text, bigint, date, date, integer, bigint) is 'versiya: texnik - foto lentasi; t2_qator faqat manba nomini ko''rsatish uchun id bo''yicha o''qiladi, hajm/summa hisoblanmaydi.';

do $$ declare fn text; begin
  foreach fn in array array[
    'public.t2_foto_dalil_bogla_v1(bigint,bigint,bigint,bigint,text,bigint,date,numeric,numeric,text,uuid)',
    'public.t2_foto_dalil_yangila_v1(bigint,bigint,bigint,text,text,jsonb,boolean,text,bigint)',
    'public.t2_foto_dalil_ochir_v1(bigint,bigint,bigint)',
    'public.t2_foto_dalil_royxat_v1(bigint,bigint,bigint,bigint,text,bigint,date,date,integer,bigint)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;
