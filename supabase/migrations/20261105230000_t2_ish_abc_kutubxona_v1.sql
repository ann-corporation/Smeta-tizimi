-- T2-ISH-ABC-001 — "kichik ABC4": ish turi va resurs kutubxonalari + ШНК tuzilishida ish qo'shish/zamena
-- (egasi, 2026-10-01). Kutubxona ALOHIDA JADVAL EMAS — yuklangan smetalarning o'zi (t2_qator):
--   * ish turlari  = kompaniya smetalaridagi bl (shifr + nom + birlik) va ularning resurs tarkibi (norma);
--   * resurslar    = smetalardagi rs/mat/ob (ЧЕЛ/МАШ/МАТ/ОБ) va RES narxlari + katalog (t2_narx_manba_qator)
--                    + qo'lda kiritilgan ish turlari (t2_ish_turi).
-- Yangi smeta yuklanishi bilan kutubxona O'ZI kengayadi — sinxronlash, qo'shimcha qadam yo'q.
--
-- O'qish (stable, /api/sb OQISH_RPC orqali GET; a'zolik funksiya ichida):
--   t2_ish_turi_qidir_v1, t2_resurs_qidir_v1, t2_resurs_narx_taklif_v1
-- Yozish (sb-yoz): t2_ish_abc_saqla_v1 — qo'shimcha ish / ish zamenasi / resurs zamenasi;
--   resurs hajmi = norma × ish hajmi, summa = hajm × narx, narx manbasi (SMETA/KATALOG/QOLDA) saqlanadi;
--   ish fakti berilsa — faqat ISHGA yoziladi, resurslar fakti norma orqali avtomatik (BL_NORMA).

begin;

-- Narx/nom moslashtirish uchun indekslar (t2_resurs_*_kalit — immutable).
create index if not exists t2_qator_resurs_kalit_idx on public.t2_qator
  (kompaniya_id, public.t2_resurs_nom_kalit(nom), public.t2_resurs_birlik_kalit(birlik))
  where tur in ('rs', 'mat', 'ob');
create index if not exists t2_qator_bl_komp_idx on public.t2_qator (kompaniya_id) where tur = 'bl';
create index if not exists t2_narx_manba_qator_kalit_idx on public.t2_narx_manba_qator
  (kompaniya_id, public.t2_resurs_nom_kalit(nom), public.t2_resurs_birlik_kalit(birlik));

/* Qidiruv so'zlari: katta harf, 2+ belgili, ko'pi bilan 6 ta. */
create or replace function public.t2_qidiruv_sozlar(p_q text)
returns text[] language sql immutable set search_path = public, pg_temp as $$
  select coalesce(array_agg(t), '{}') from (
    select t from unnest(regexp_split_to_array(upper(replace(coalesce(p_q, ''), 'Ё', 'Е')), '[^0-9A-ZА-ЯЎҚҒҲ.-]+')) t
    where length(t) >= 2 limit 6) s
$$;

/* Obyekt → kompaniya, a'zolik tekshiruvi (a'zo bo'lmasa — exception). */
create or replace function public.t2_obyekt_kompaniya_azo(p_obyekt_id bigint, p_actor_id bigint)
returns bigint language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_k bigint;
begin
  select kompaniya_id into v_k from public.t2_obyekt where id = p_obyekt_id;
  if v_k is null then raise exception 'OBJECT_NOT_FOUND' using errcode = '42501'; end if;
  perform public.t2_actor_kompaniya_azo_tekshir(v_k, p_actor_id);
  return v_k;
end $$;

/* ISH TURLARI: kompaniya smetalaridagi ishlar (shu obyekt birinchi), resurs tarkibi bilan. */
create or replace function public.t2_ish_turi_qidir_v1(p_obyekt_id bigint, p_actor_id bigint, p_q text)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_k bigint; v_t text[]; v_res jsonb;
begin
  v_k := public.t2_obyekt_kompaniya_azo(p_obyekt_id, p_actor_id);
  v_t := public.t2_qidiruv_sozlar(p_q);
  if cardinality(v_t) = 0 then return '[]'::jsonb; end if;
  with b as (
    select q.id, q.obyekt_id, q.kod, q.nom, q.birlik,
           upper(btrim(coalesce(q.kod, ''))) kk, public.t2_resurs_nom_kalit(q.nom) nk, public.t2_resurs_birlik_kalit(q.birlik) bk
      from public.t2_qator q
     where q.kompaniya_id = v_k and q.tur = 'bl' and q.nom is not null
       and not exists (select 1 from unnest(v_t) s where position(s in upper(replace(coalesce(q.kod, '') || ' ' || q.nom, 'Ё', 'Е'))) = 0)
     limit 3000
  ), g as (
    select kk, nk, bk, count(*) n, bool_or(obyekt_id = p_obyekt_id) shu,
           coalesce(max(id) filter (where obyekt_id = p_obyekt_id), max(id)) rep
      from b group by kk, nk, bk
  ), top as (select * from g order by shu desc, n desc, rep desc limit 15)
  select coalesce(jsonb_agg(jsonb_build_object(
      'manba', 'smeta', 'qator_id', r.id, 'kod', r.kod, 'nom', r.nom, 'birlik', r.birlik,
      'soni', top.n, 'shu_obyekt', top.shu,
      'sostav', (select coalesce(jsonb_agg(jsonb_build_object('tur', c.tur, 'kat', c.kat, 'kod', c.kod, 'nom', c.nom,
                    'birlik', c.birlik, 'norma', c.norma, 'narx', nullif(c.narx, 0)) order by c.tartib, c.id), '[]'::jsonb)
                   from public.t2_qator c where c.ota_id = r.id and c.tur in ('rs', 'mat', 'ob')))
      order by top.shu desc, top.n desc), '[]'::jsonb)
    into v_res
  from top join public.t2_qator r on r.id = top.rep;

  -- Qo'lda kiritilgan ish turlari (katalog).
  v_res := v_res || coalesce((select jsonb_agg(jsonb_build_object('manba', 'katalog', 'ish_turi_id', t.id, 'kod', t.kod, 'nom', t.nomi,
              'birlik', t.birligi, 'narx', nullif(t.narx, 0), 'sostav', '[]'::jsonb))
     from (select * from public.t2_ish_turi t where t.kompaniya_id = v_k
              and not exists (select 1 from unnest(v_t) s where position(s in upper(t.kod || ' ' || t.nomi)) = 0)
            order by t.kod limit 5) t), '[]'::jsonb);
  return v_res;
end $$;

/* RESURSLAR: smetalardagi resurslar (RES narxi bilan) + katalog pozitsiyalari. */
create or replace function public.t2_resurs_qidir_v1(p_obyekt_id bigint, p_actor_id bigint, p_q text, p_kat text)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_k bigint; v_t text[]; v_sm jsonb; v_kt jsonb;
begin
  v_k := public.t2_obyekt_kompaniya_azo(p_obyekt_id, p_actor_id);
  v_t := public.t2_qidiruv_sozlar(p_q);
  if cardinality(v_t) = 0 then return '[]'::jsonb; end if;
  with r as (
    select q.id, q.obyekt_id, q.kat, q.kod, q.nom, q.birlik, q.narx,
           public.t2_resurs_nom_kalit(q.nom) nk, public.t2_resurs_birlik_kalit(q.birlik) bk
      from public.t2_qator q
     where q.kompaniya_id = v_k and q.tur in ('rs', 'mat', 'ob') and q.nom is not null
       and (nullif(p_kat, '') is null or q.kat = p_kat)
       and not exists (select 1 from unnest(v_t) s where position(s in upper(replace(coalesce(q.kod, '') || ' ' || q.nom, 'Ё', 'Е'))) = 0)
     limit 4000
  ), g as (
    select kat, nk, bk, count(*) n, bool_or(obyekt_id = p_obyekt_id) shu,
           coalesce(max(id) filter (where obyekt_id = p_obyekt_id and narx > 0), max(id) filter (where narx > 0), max(id)) rep
      from r group by kat, nk, bk
  )
  select coalesce(jsonb_agg(x order by (x->>'shu_obyekt')::boolean desc, (x->>'soni')::int desc), '[]'::jsonb) into v_sm from (
    select jsonb_build_object('manba', 'smeta', 'kat', q.kat, 'kod', q.kod, 'nom', q.nom, 'birlik', q.birlik,
             'narx', nullif(q.narx, 0), 'narx_manba', case when q.obyekt_id = p_obyekt_id then 'smeta_obyekt' else 'smeta' end,
             'soni', g.n, 'shu_obyekt', g.shu) x
      from (select * from g order by shu desc, n desc limit 20) g join public.t2_qator q on q.id = g.rep) s;

  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_kt from (
    select jsonb_build_object('manba', 'katalog', 'kat', null, 'kod', k.kod, 'nom', k.nom, 'birlik', k.birlik, 'narx', k.narx,
             'narx_manba', 'katalog', 'manba_nom', m.nom) x
      from public.t2_narx_manba_qator k join public.t2_narx_manba m on m.id = k.manba_id and m.holat = 'faol'
     where k.kompaniya_id = v_k and k.narx > 0
       and not exists (select 1 from unnest(v_t) s where position(s in upper(replace(coalesce(k.kod, '') || ' ' || k.nom, 'Ё', 'Е'))) = 0)
     order by m.yaratildi desc, k.id limit 10) s;
  return v_sm || v_kt;
end $$;

/* NARX TAKLIFLARI: har resurs uchun — shu obyekt smetasi (RES) → boshqa smetalar → katalog. */
create or replace function public.t2_resurs_narx_taklif_v1(p_obyekt_id bigint, p_actor_id bigint, p_items text)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_k bigint; v_items jsonb; v_res jsonb := '[]'::jsonb; v_i jsonb; v_nk text; v_bk text; v_var jsonb;
begin
  v_k := public.t2_obyekt_kompaniya_azo(p_obyekt_id, p_actor_id);
  v_items := coalesce(p_items, '[]')::jsonb;
  if jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) > 80 then raise exception 'ITEMS_0_80'; end if;
  for v_i in select value from jsonb_array_elements(v_items) loop
    v_nk := public.t2_resurs_nom_kalit(v_i->>'nom'); v_bk := public.t2_resurs_birlik_kalit(v_i->>'birlik');
    select coalesce(jsonb_agg(x), '[]'::jsonb) into v_var from (
      (select jsonb_build_object('manba', 'smeta_obyekt', 'narx', q.narx, 'izoh', 'shu obyekt smetasi (RES)') x
         from public.t2_qator q
        where q.kompaniya_id = v_k and q.obyekt_id = p_obyekt_id and q.tur in ('rs', 'mat', 'ob') and q.narx > 0
          and public.t2_resurs_nom_kalit(q.nom) = v_nk and public.t2_resurs_birlik_kalit(q.birlik) = v_bk
        order by q.id desc limit 1)
      union all
      (select jsonb_build_object('manba', 'smeta', 'narx', q.narx, 'izoh', 'smeta: ' || o.nom) x
         from public.t2_qator q join public.t2_obyekt o on o.id = q.obyekt_id
        where q.kompaniya_id = v_k and q.obyekt_id <> p_obyekt_id and q.tur in ('rs', 'mat', 'ob') and q.narx > 0
          and public.t2_resurs_nom_kalit(q.nom) = v_nk and public.t2_resurs_birlik_kalit(q.birlik) = v_bk
        order by q.id desc limit 1)
      union all
      (select jsonb_build_object('manba', 'katalog', 'narx', k.narx, 'izoh', 'katalog: ' || m.nom) x
         from public.t2_narx_manba_qator k join public.t2_narx_manba m on m.id = k.manba_id and m.holat = 'faol'
        where k.kompaniya_id = v_k and k.narx > 0
          and public.t2_resurs_nom_kalit(k.nom) = v_nk and public.t2_resurs_birlik_kalit(k.birlik) = v_bk
        order by m.yaratildi desc, k.id desc limit 1)
    ) s;
    v_res := v_res || jsonb_build_array(jsonb_build_object('i', v_i->'i', 'variantlar', v_var));
  end loop;
  return v_res;
end $$;

/* YOZISH: qo'shimcha ish / ish zamenasi (resurslari bilan) / resurs zamenasi. */
create or replace function public.t2_ish_abc_saqla_v1(
  p_actor_id bigint, p_kompaniya_id bigint, p_obyekt_id bigint, p_command text,
  p_ota_qator_id bigint, p_almashtirilayotgan_qator_id bigint,
  p_ish jsonb, p_resurslar jsonb, p_fakt_hajm numeric, p_sana date, p_sabab text,
  p_operation_id uuid, p_kutilgan_versiya integer)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_rol text; v_prev jsonb; v_ota bigint := p_ota_qator_id; v_versiya integer := p_kutilgan_versiya;
  v_add jsonb; v_id bigint; v_kind text; v_res jsonb; v_r jsonb; v_rid bigint; v_i integer := 0;
  v_ish_hajm numeric; v_hajm numeric; v_narx numeric; v_kat text; v_ids bigint[] := '{}'; v_eski public.t2_qator%rowtype;
  v_fakt jsonb; v_manba text;
begin
  if p_command not in ('additional', 'replacement', 'resurs_zamena') then return jsonb_build_object('ok', false, 'code', 'COMMAND_INVALID'); end if;
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  if nullif(btrim(coalesce(p_sabab, '')), '') is null then return jsonb_build_object('ok', false, 'code', 'SABAB_REQUIRED'); end if;
  if p_resurslar is not null and (jsonb_typeof(p_resurslar) <> 'array' or jsonb_array_length(p_resurslar) > 60) then
    return jsonb_build_object('ok', false, 'code', 'RESURSLAR_0_60');
  end if;
  v_rol := public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  if v_rol not in ('admin', 'superadmin', 'boss', 'director', 'pto') then return jsonb_build_object('ok', false, 'code', 'WRITE_ROLE_REQUIRED'); end if;
  select response into v_prev from public.t2_addrepl_command where operation_id = p_operation_id;
  if found then return jsonb_build_object('ok', true, 'takror', true, 'qator_id', v_prev->'qator_id'); end if;

  -- ── Resurs zamenasi: ish ichidagi bitta resursni boshqasiga almashtirish ──
  if p_command = 'resurs_zamena' then
    select * into v_eski from public.t2_qator where id = p_almashtirilayotgan_qator_id and obyekt_id = p_obyekt_id and kompaniya_id = p_kompaniya_id;
    if not found or v_eski.tur not in ('rs', 'mat', 'ob') or v_eski.ota_id is null then return jsonb_build_object('ok', false, 'code', 'RESURS_NOT_FOUND'); end if;
    v_r := p_resurslar->0;
    if v_r is null then return jsonb_build_object('ok', false, 'code', 'RESURS_REQUIRED'); end if;
    select hajm, versiya into v_ish_hajm, v_versiya from public.t2_qator where id = v_eski.ota_id;
    v_hajm := case when (v_r->>'norma') is not null and v_ish_hajm is not null then round((v_r->>'norma')::numeric * v_ish_hajm, 6) else nullif(v_r->>'hajm', '')::numeric end;
    v_add := public.t2_addrepl_execute_v1(jsonb_strip_nulls(jsonb_build_object(
      'command', 'replacement', 'kompaniya_id', p_kompaniya_id, 'actor_id', p_actor_id, 'obyekt_id', p_obyekt_id,
      'ota_qator_id', v_eski.ota_id, 'almashtirilayotgan_qator_id', v_eski.id, 'nom', btrim(v_r->>'nom'), 'birlik', btrim(v_r->>'birlik'),
      'hajm', v_hajm, 'kod', nullif(btrim(coalesce(v_r->>'kod', '')), ''), 'sabab', p_sabab, 'operation_id', p_operation_id, 'kutilgan_versiya', v_versiya)));
    v_id := (v_add->>'qator_id')::bigint;
    v_narx := nullif(v_r->>'narx', '')::numeric; if v_narx <= 0 then v_narx := null; end if;
    v_kat := coalesce(nullif(v_r->>'kat', ''), v_eski.kat);
    update public.t2_qator set norma = nullif(v_r->>'norma', '')::numeric, kat = case when v_kat in ('ЧЕЛ','МАШ','МАТ','ОБ','М/К','КАБ','БЕЗСКЛАД') then v_kat else kat end,
           narx = v_narx, summa = case when v_narx is null or v_hajm is null then null else round(v_hajm * v_narx, 2) end,
           narx_usul = upper(coalesce(nullif(v_r->>'narx_manba', ''), 'qolda'))
     where id = v_id;
    perform public.t2_audit_yoz(p_kompaniya_id, 'resurs_zamena', 'smeta', p_obyekt_id, format('yangi=%s eski=%s', v_id, v_eski.id), 'actor:' || p_actor_id, null);
    return jsonb_build_object('ok', true, 'qator_id', v_id, 'change_id', v_add->'change_id');
  end if;

  -- ── Qo'shimcha ish / ish zamenasi ──
  if p_ish is null or nullif(btrim(coalesce(p_ish->>'nom', '')), '') is null or nullif(btrim(coalesce(p_ish->>'birlik', '')), '') is null then
    return jsonb_build_object('ok', false, 'code', 'ISH_NOM_BIRLIK_REQUIRED');
  end if;
  v_ish_hajm := nullif(p_ish->>'hajm', '')::numeric;
  if v_ish_hajm is null or v_ish_hajm <= 0 then return jsonb_build_object('ok', false, 'code', 'ISH_HAJM_REQUIRED'); end if;
  if p_command = 'additional' and v_ota is null then
    perform 1 from public.t2_obyekt where id = p_obyekt_id and kompaniya_id = p_kompaniya_id for update;
    if not found then return jsonb_build_object('ok', false, 'code', 'OBJECT_ACCESS_DENIED'); end if;
    select id, versiya into v_ota, v_versiya from public.t2_qator
     where obyekt_id = p_obyekt_id and tur = 'rz' and ota_id is null and nom = 'СМЕТАДАН ТАШҚАРИ ИШЛАР' order by id limit 1;
    if v_ota is null then
      insert into public.t2_qator(obyekt_id, kompaniya_id, ota_id, daraja, tartib, tur, nom, qoshimcha, change_type)
        values (p_obyekt_id, p_kompaniya_id, null, 0, (select coalesce(max(tartib), 0) + 1 from public.t2_qator where obyekt_id = p_obyekt_id),
                'rz', 'СМЕТАДАН ТАШҚАРИ ИШЛАР', true, 'ADDITIONAL')
        returning id, versiya into v_ota, v_versiya;
    end if;
  end if;
  if v_ota is null then return jsonb_build_object('ok', false, 'code', 'PARENT_REQUIRED'); end if;

  v_add := public.t2_addrepl_execute_v1(jsonb_strip_nulls(jsonb_build_object(
    'command', p_command, 'kompaniya_id', p_kompaniya_id, 'actor_id', p_actor_id, 'obyekt_id', p_obyekt_id,
    'ota_qator_id', v_ota, 'almashtirilayotgan_qator_id', p_almashtirilayotgan_qator_id,
    'nom', btrim(p_ish->>'nom'), 'birlik', btrim(p_ish->>'birlik'), 'hajm', v_ish_hajm,
    'kod', nullif(btrim(coalesce(p_ish->>'kod', '')), ''), 'sabab', p_sabab, 'operation_id', p_operation_id, 'kutilgan_versiya', v_versiya)));
  v_id := (v_add->>'qator_id')::bigint;
  select tur into v_kind from public.t2_qator where id = v_id;

  if p_resurslar is not null and jsonb_array_length(p_resurslar) > 0 then
    if v_kind <> 'bl' then raise exception 'RESURS_FAQAT_ISH_OSTIGA'; end if;
    for v_r in select value from jsonb_array_elements(p_resurslar) loop
      v_i := v_i + 1;
      if nullif(btrim(coalesce(v_r->>'nom', '')), '') is null or nullif(btrim(coalesce(v_r->>'birlik', '')), '') is null
         or coalesce(nullif(v_r->>'norma', '')::numeric, 0) <= 0 then
        raise exception 'RESURS_INVALID: % (nom, birlik, norma > 0)', v_i;
      end if;
      v_hajm := round((v_r->>'norma')::numeric * v_ish_hajm, 6);
      v_res := public.t2_addrepl_execute_v1(jsonb_strip_nulls(jsonb_build_object(
        'command', 'resource', 'tur', 'rs', 'kompaniya_id', p_kompaniya_id, 'actor_id', p_actor_id, 'obyekt_id', p_obyekt_id,
        'ota_qator_id', v_id, 'nom', btrim(v_r->>'nom'), 'birlik', btrim(v_r->>'birlik'), 'hajm', v_hajm,
        'kod', nullif(btrim(coalesce(v_r->>'kod', '')), ''), 'sabab', p_sabab,
        'operation_id', md5(p_operation_id::text || ':abc:' || v_i)::uuid,
        'kutilgan_versiya', (select versiya from public.t2_qator where id = v_id))));
      v_rid := (v_res->>'qator_id')::bigint;
      v_narx := nullif(v_r->>'narx', '')::numeric; if v_narx <= 0 then v_narx := null; end if;
      v_kat := nullif(v_r->>'kat', '');
      v_manba := upper(coalesce(nullif(v_r->>'narx_manba', ''), 'qolda'));
      update public.t2_qator set norma = (v_r->>'norma')::numeric,
             kat = case when v_kat in ('ЧЕЛ','МАШ','МАТ','ОБ','М/К','КАБ','БЕЗСКЛАД') then v_kat else kat end,
             narx = v_narx, summa = case when v_narx is null then null else round(v_hajm * v_narx, 2) end,
             narx_usul = case when v_narx is null then null else v_manba end
       where id = v_rid;
      v_ids := v_ids || v_rid;
    end loop;
    update public.t2_qator set summa = (select sum(summa) from public.t2_qator where ota_id = v_id and tur in ('rs', 'mat', 'ob'))
     where id = v_id;
  end if;

  if coalesce(p_fakt_hajm, 0) > 0 then
    if v_kind not in ('bl', 'mat', 'ob') then raise exception 'FAKT_FAQAT_ISH_YOKI_MATERIAL'; end if;
    v_fakt := public.t2_fakt_yoz_v2(p_obyekt_id, coalesce(p_sana, current_date),
      jsonb_build_array(jsonb_build_object('qator_id', v_id, 'hajm', p_fakt_hajm)), p_actor_id,
      md5(p_operation_id::text || ':abc:fakt')::uuid, left('ABC: ' || p_sabab, 500), null, 'actor:' || p_actor_id);
    if coalesce((v_fakt->>'ok')::boolean, false) is not true then
      raise exception 'FAKT_NOT_WRITTEN: %', coalesce(v_fakt->>'code', v_fakt->>'error', v_fakt::text);
    end if;
  end if;

  perform public.t2_audit_yoz(p_kompaniya_id, 'ish_abc_' || p_command, 'smeta', p_obyekt_id,
    format('qator=%s resurs=%s fakt=%s', v_id, cardinality(v_ids), coalesce(p_fakt_hajm, 0)), 'actor:' || p_actor_id, null);
  return jsonb_build_object('ok', true, 'qator_id', v_id, 'resurs_ids', to_jsonb(v_ids), 'bolim_id', v_ota, 'change_id', v_add->'change_id');
end $$;

revoke all on function public.t2_qidiruv_sozlar(text) from public, anon, authenticated;
revoke all on function public.t2_obyekt_kompaniya_azo(bigint, bigint) from public, anon, authenticated;
revoke all on function public.t2_ish_turi_qidir_v1(bigint, bigint, text) from public, anon, authenticated;
revoke all on function public.t2_resurs_qidir_v1(bigint, bigint, text, text) from public, anon, authenticated;
revoke all on function public.t2_resurs_narx_taklif_v1(bigint, bigint, text) from public, anon, authenticated;
revoke all on function public.t2_ish_abc_saqla_v1(bigint, bigint, bigint, text, bigint, bigint, jsonb, jsonb, numeric, date, text, uuid, integer) from public, anon, authenticated;
grant execute on function public.t2_qidiruv_sozlar(text) to service_role;
grant execute on function public.t2_obyekt_kompaniya_azo(bigint, bigint) to service_role;
grant execute on function public.t2_ish_turi_qidir_v1(bigint, bigint, text) to service_role;
grant execute on function public.t2_resurs_qidir_v1(bigint, bigint, text, text) to service_role;
grant execute on function public.t2_resurs_narx_taklif_v1(bigint, bigint, text) to service_role;
grant execute on function public.t2_ish_abc_saqla_v1(bigint, bigint, bigint, text, bigint, bigint, jsonb, jsonb, numeric, date, text, uuid, integer) to service_role;

commit;
