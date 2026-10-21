-- Ombor M-29 orqali kamayadi (egasi qarori 2026-10-21, ADR-3: «bajarilayotgan M-29 hujjati orqali kamayishi kerak»).
-- Audit ARC-06: Fakt kiritish omborni avtomatik kamaytirardi (trg_akt_sklad_sync, 198 yozuv manba='trigger') — Fakt ish
-- hajmi ≠ fizik chiqim; M-29 dagi «norma va haqiqiy» solishtiruvi ma'nosini yo'qotardi.
--
-- Endi:
--   * t2_m29_hujjat — obyekt + davr (YYYY-MM) bo'yicha bajarilgan M-29 (bitta faol hujjat; bekor qilish mumkin).
--   * t2_m29_bajar_v1 — M-29 materiallari (miqdorni foydalanuvchi tasdiqlaydi) ombordan chiqim qilinadi (manba='m29').
--     Qoldiq yetmasa — ro'yxat qaytadi, faqat aniq ruxsat bilan (p_manfiyga_ruxsat) minusga yoziladi.
--     Shu davrda Fakt triggeri yozgan eski chiqimlar bo'lsa — ro'yxat qaytadi; p_trigger_bekor=true bo'lsa ular O'CHIRILMAYDI,
--     holat='bekor' qilinadi va ularning sof ta'siri (chiqim − kirim) qoldiqqa qaytariladi (ikki marta yechilmaydi).
--   * t2_m29_bekor_v1 — bajarilgan M-29 ni bekor qilish (chiqimlari 'bekor', qoldiq qaytadi).
--   * Fakt → ombor triggerlari (INSERT va DELETE) o'chiriladi; funksiyalar qoladi (rollback qayta ulaydi).
-- Ruxsat: fakt.write (katalogda alohida ombor ruxsati yo'q).

create table if not exists public.t2_m29_hujjat (
  id bigint generated always as identity primary key,
  kompaniya_id bigint not null references public.t2_kompaniya(id),
  obyekt_id bigint not null references public.t2_obyekt(id),
  davr text not null check (davr ~ '^\d{4}-\d{2}$'),
  holat text not null default 'bajarildi' check (holat in ('bajarildi', 'bekor')),
  qator_soni integer not null default 0,
  manfiy_qoldiq boolean not null default false,
  trigger_bekor_soni integer not null default 0,
  operation_id uuid not null unique,
  bajardi bigint not null,
  bajarildi timestamptz not null default now(),
  bekor_qildi bigint,
  bekor_vaqt timestamptz,
  bekor_sabab text
);
create unique index if not exists t2_m29_hujjat_faol_uq on public.t2_m29_hujjat(obyekt_id, davr) where holat = 'bajarildi';
alter table public.t2_m29_hujjat enable row level security;
revoke all on public.t2_m29_hujjat from public, anon, authenticated;

alter table public.t2_sklad_harakat add column if not exists m29_hujjat_id bigint references public.t2_m29_hujjat(id);
create index if not exists t2_sklad_harakat_m29_ix on public.t2_sklad_harakat(m29_hujjat_id) where m29_hujjat_id is not null;

create or replace function public.t2_m29_bajar_v1(p_actor_id bigint, p_kompaniya_id bigint, p_obyekt_id bigint, p_davr text,
  p_qatorlar jsonb, p_operation_id uuid, p_manfiyga_ruxsat boolean default false, p_trigger_bekor boolean default false)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare h public.t2_m29_hujjat; v_id bigint; v_sana date; v_yetmaydi jsonb; v_trigger jsonb; v_tsoni int := 0; v_soni int := 0; r record;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select * into h from public.t2_m29_hujjat where operation_id = p_operation_id;
  if found then return jsonb_build_object('ok', true, 'takror', true, 'hujjat_id', h.id, 'qator_soni', h.qator_soni); end if;

  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'fakt.write');
  if not exists (select 1 from public.t2_obyekt where id = p_obyekt_id and kompaniya_id = p_kompaniya_id) then
    return jsonb_build_object('ok', false, 'code', 'OBYEKT_BEGONA'); end if;
  if p_davr is null or p_davr !~ '^\d{4}-\d{2}$' then return jsonb_build_object('ok', false, 'code', 'DAVR_NOTOGRI'); end if;
  if jsonb_typeof(p_qatorlar) <> 'array' or jsonb_array_length(p_qatorlar) = 0 or jsonb_array_length(p_qatorlar) > 3000 then
    return jsonb_build_object('ok', false, 'code', 'QATORLAR_NOTOGRI'); end if;

  perform pg_advisory_xact_lock(hashtextextended('m29:' || p_obyekt_id || ':' || p_davr, 0));
  select * into h from public.t2_m29_hujjat where obyekt_id = p_obyekt_id and davr = p_davr and holat = 'bajarildi';
  if found then return jsonb_build_object('ok', false, 'code', 'DAVR_BAJARILGAN', 'hujjat_id', h.id); end if;

  -- Kirish: bir material bir marta (nomi + birlik), miqdor > 0.
  create temp table if not exists _m29_q (nomi text, birligi text, miqdor numeric) on commit drop;
  truncate _m29_q;
  insert into _m29_q
    select btrim(x->>'nomi'), nullif(btrim(coalesce(x->>'birligi', '')), ''), sum((x->>'miqdor')::numeric)
      from jsonb_array_elements(p_qatorlar) x
     where nullif(btrim(coalesce(x->>'nomi', '')), '') is not null and (x->>'miqdor') ~ '^-?\d+(\.\d+)?$'
     group by 1, 2 having sum((x->>'miqdor')::numeric) > 0;
  if not exists (select 1 from _m29_q) then return jsonb_build_object('ok', false, 'code', 'QATORLAR_NOTOGRI'); end if;

  -- Shu davrdagi eski Fakt-trigger yozuvlari (sof ta'sir: chiqim − kirim).
  select coalesce(jsonb_agg(jsonb_build_object('nomi', nomi, 'birligi', birligi, 'sof', sof) order by nomi), '[]'::jsonb), count(*)
    into v_trigger, v_tsoni
    from (select nomi, max(birligi) birligi, sum(case when operatsiya = 'rasxod' then obyomi else -obyomi end) sof
            from public.t2_sklad_harakat
           where obyekt_id = p_obyekt_id and manba = 'trigger' and coalesce(holat, 'faol') = 'faol' and to_char(sana, 'YYYY-MM') = p_davr
           group by nomi) t;
  if v_tsoni > 0 and not coalesce(p_trigger_bekor, false) then
    return jsonb_build_object('ok', false, 'code', 'TRIGGER_CHIQIM_BOR', 'trigger', v_trigger);
  end if;

  -- Qoldiq tekshiruvi (trigger yozuvlari bekor qilinsa — ularning sof ta'siri qaytgandan keyingi qoldiq bilan).
  perform 1 from public.t2_sklad_qoldiq where obyekt_id = p_obyekt_id and nomi in (select nomi from _m29_q) for update;
  select coalesce(jsonb_agg(jsonb_build_object('nomi', q.nomi, 'birligi', q.birligi, 'kerak', q.miqdor,
           'bor', coalesce(s.qoldiq, 0) + coalesce(tr.sof, 0)) order by q.nomi), '[]'::jsonb)
    into v_yetmaydi
    from _m29_q q
    left join public.t2_sklad_qoldiq s on s.obyekt_id = p_obyekt_id and s.nomi = q.nomi
    left join (select nomi, sum(case when operatsiya = 'rasxod' then obyomi else -obyomi end) sof
                 from public.t2_sklad_harakat
                where obyekt_id = p_obyekt_id and manba = 'trigger' and coalesce(holat, 'faol') = 'faol' and to_char(sana, 'YYYY-MM') = p_davr
                group by nomi) tr on tr.nomi = q.nomi
   where coalesce(s.qoldiq, 0) + coalesce(tr.sof, 0) < q.miqdor;
  if jsonb_array_length(v_yetmaydi) > 0 and not coalesce(p_manfiyga_ruxsat, false) then
    return jsonb_build_object('ok', false, 'code', 'QOLDIQ_YETMAYDI', 'yetmaydi', v_yetmaydi);
  end if;

  insert into public.t2_m29_hujjat(kompaniya_id, obyekt_id, davr, operation_id, bajardi, manfiy_qoldiq, trigger_bekor_soni)
    values (p_kompaniya_id, p_obyekt_id, p_davr, p_operation_id, p_actor_id, jsonb_array_length(v_yetmaydi) > 0, 0)
    returning id into v_id;

  -- Eski trigger yozuvlari: o'chirilmaydi — 'bekor' + sof ta'siri qoldiqqa qaytadi.
  if v_tsoni > 0 then
    for r in select nomi, sum(case when operatsiya = 'rasxod' then obyomi else -obyomi end) sof
               from public.t2_sklad_harakat
              where obyekt_id = p_obyekt_id and manba = 'trigger' and coalesce(holat, 'faol') = 'faol' and to_char(sana, 'YYYY-MM') = p_davr
              group by nomi loop
      update public.t2_sklad_qoldiq set qoldiq = qoldiq + r.sof, versiya = versiya + 1, oxirgi_harakat = now()
       where obyekt_id = p_obyekt_id and nomi = r.nomi;
    end loop;
    update public.t2_sklad_harakat
       set holat = 'bekor', izoh = left(coalesce(izoh, '') || ' | M-29 #' || v_id || ' bilan almashtirildi', 1000)
     where obyekt_id = p_obyekt_id and manba = 'trigger' and coalesce(holat, 'faol') = 'faol' and to_char(sana, 'YYYY-MM') = p_davr;
    get diagnostics v_tsoni = row_count;
  end if;

  -- Chiqim: davr oxiri (kelajak bo'lsa — bugun).
  v_sana := least((to_date(p_davr || '-01', 'YYYY-MM-DD') + interval '1 month - 1 day')::date, current_date);
  for r in select * from _m29_q loop
    insert into public.t2_sklad_qoldiq (kompaniya_id, obyekt_id, turi, nomi, birligi, qoldiq)
      values (p_kompaniya_id, p_obyekt_id, 'mat', r.nomi, r.birligi, 0 - r.miqdor)
      on conflict (obyekt_id, nomi) do update
      set qoldiq = t2_sklad_qoldiq.qoldiq - r.miqdor, versiya = t2_sklad_qoldiq.versiya + 1, oxirgi_harakat = now();
    insert into public.t2_sklad_harakat (kompaniya_id, obyekt_id, operatsiya, turi, sana, nomi, birligi, obyomi, izoh, manba, m29_hujjat_id, kim)
      values (p_kompaniya_id, p_obyekt_id, 'rasxod', 'mat', v_sana, r.nomi, r.birligi, r.miqdor, 'M-29 ' || p_davr || ' (hujjat #' || v_id || ')', 'm29', v_id, 'actor:' || p_actor_id);
    v_soni := v_soni + 1;
  end loop;

  update public.t2_m29_hujjat set qator_soni = v_soni, trigger_bekor_soni = v_tsoni where id = v_id;
  perform public.t2_audit_yoz(p_kompaniya_id, 'm29_bajarildi', 'sklad', p_obyekt_id,
    format('hujjat_id=%s; davr=%s; qator=%s; trigger_bekor=%s; manfiy=%s; actor_id=%s', v_id, p_davr, v_soni, v_tsoni,
      jsonb_array_length(v_yetmaydi) > 0, p_actor_id), 'actor:' || p_actor_id, null);
  return jsonb_build_object('ok', true, 'hujjat_id', v_id, 'qator_soni', v_soni, 'trigger_bekor_soni', v_tsoni,
    'manfiy', v_yetmaydi);
end $function$;

create or replace function public.t2_m29_bekor_v1(p_actor_id bigint, p_kompaniya_id bigint, p_hujjat_id bigint, p_sabab text)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare h public.t2_m29_hujjat; r record; v_sabab text := nullif(btrim(coalesce(p_sabab, '')), '');
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'fakt.write');
  if v_sabab is null then return jsonb_build_object('ok', false, 'code', 'SABAB_KERAK'); end if;
  select * into h from public.t2_m29_hujjat where id = p_hujjat_id and kompaniya_id = p_kompaniya_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'HUJJAT_TOPILMADI'); end if;
  if h.holat = 'bekor' then return jsonb_build_object('ok', true, 'takror', true); end if;
  for r in select nomi, sum(obyomi) s from public.t2_sklad_harakat where m29_hujjat_id = h.id and coalesce(holat, 'faol') = 'faol' group by nomi loop
    update public.t2_sklad_qoldiq set qoldiq = qoldiq + r.s, versiya = versiya + 1, oxirgi_harakat = now()
     where obyekt_id = h.obyekt_id and nomi = r.nomi;
  end loop;
  update public.t2_sklad_harakat set holat = 'bekor' where m29_hujjat_id = h.id;
  update public.t2_m29_hujjat set holat = 'bekor', bekor_qildi = p_actor_id, bekor_vaqt = now(), bekor_sabab = left(v_sabab, 1000) where id = h.id;
  perform public.t2_audit_yoz(p_kompaniya_id, 'm29_bekor', 'sklad', h.obyekt_id,
    format('hujjat_id=%s; davr=%s; sabab=%s; actor_id=%s', h.id, h.davr, v_sabab, p_actor_id), 'actor:' || p_actor_id, null);
  return jsonb_build_object('ok', true, 'hujjat_id', h.id);
end $function$;

revoke all on function public.t2_m29_bajar_v1(bigint, bigint, bigint, text, jsonb, uuid, boolean, boolean) from public, anon, authenticated;
grant execute on function public.t2_m29_bajar_v1(bigint, bigint, bigint, text, jsonb, uuid, boolean, boolean) to service_role;
revoke all on function public.t2_m29_bekor_v1(bigint, bigint, bigint, text) from public, anon, authenticated;
grant execute on function public.t2_m29_bekor_v1(bigint, bigint, bigint, text) to service_role;

-- Fakt endi omborni kamaytirmaydi (ADR-3). Eski yozuvlar o'chirilmaydi.
drop trigger if exists trg_akt_sklad_sync on public.t2_akt_qator;
drop trigger if exists trg_akt_sklad_sync_del on public.t2_akt_qator;
