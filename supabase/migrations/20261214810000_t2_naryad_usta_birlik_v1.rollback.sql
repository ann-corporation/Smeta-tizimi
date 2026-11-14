-- ROLLBACK: 20261214810000 — funksiyalar 20261214800000 dagi ta'rifga qaytariladi, yangi ustunlar/indekslar o'chiriladi.
-- DIQQAT: yangi ustunlardagi ma'lumot (usta birligi, koef, МАТ/МАШ toifasi) yo'qoladi; МАТ/МАШ xarajatlari (t2_xarajat) qoladi.
create or replace function public._t2_naryad_json(p_id bigint) returns jsonb
language sql stable set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'id', n.id, 'obyekt_id', n.obyekt_id, 'obyekt_nom', o.nom, 'raqam', n.raqam, 'davr_dan', n.davr_dan, 'davr_gacha', n.davr_gacha,
    'usta_nom', n.usta_nom, 'usta_kontragent_id', n.usta_kontragent_id, 'brigada', n.brigada, 'holat', n.holat, 'izoh', n.izoh,
    'versiya', n.versiya, 'fakt_operation_id', n.fakt_operation_id, 'fakt_holat', n.fakt_holat, 'fakt_akt_id', n.fakt_akt_id,
    'xarajat_id', n.xarajat_id, 'xarajat_summa', n.xarajat_summa, 'yaratildi', n.yaratildi, 'bajarildi_sana', n.bajarildi_sana,
    'qabul_sana', n.qabul_sana, 'hisob_sana', n.hisob_sana,
    'qatorlar', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', q.id, 'qator_id', q.qator_id, 'tartib', q.tartib, 'kod', q.kod, 'nom', q.nom, 'birlik', q.birlik, 'hajm', q.hajm,
        'norma_chel_soat', q.norma_chel_soat, 'smeta_mehnat_birlik', q.smeta_mehnat_birlik, 'usta_narx', q.usta_narx,
        'bajarilgan_hajm', q.bajarilgan_hajm, 'qabul_hajm', q.qabul_hajm, 'fakt_boshida', q.fakt_boshida,
        'fakt_delta', q.fakt_delta, 'fakt_yozilgan', q.fakt_yozilgan) order by q.tartib, q.id), '[]'::jsonb)
       from public.t2_naryad_qator q where q.naryad_id = n.id))
  from public.t2_naryad n join public.t2_obyekt o on o.id = n.obyekt_id where n.id = p_id;
$$;

-- ───────────────────────── O'qish ─────────────────────────
-- bolim: 'royxat' ({obyekt_id?, holat?, limit?≤200}), 'bitta' ({id}), 'lugat' ({}).
create or replace function public.t2_naryad_ol_v1(p_kompaniya_id bigint, p_actor_id bigint, p_bolim text, p_filtr jsonb default '{}'::jsonb)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_lim integer; v_id bigint; v_l record;
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'smeta.read');
  p_filtr := coalesce(p_filtr, '{}'::jsonb);
  if p_bolim = 'royxat' then
    v_lim := least(greatest(coalesce(public._t2_naryad_son(p_filtr -> 'limit'), 100), 1), 200)::integer;
    return jsonb_build_object('ok', true, 'bolim', 'royxat', 'naryadlar',
      (select coalesce(jsonb_agg(x.j order by x.yaratildi desc, x.id desc), '[]'::jsonb) from (
         select n.id, n.yaratildi, jsonb_build_object(
           'id', n.id, 'obyekt_id', n.obyekt_id, 'raqam', n.raqam, 'usta_nom', n.usta_nom, 'brigada', n.brigada, 'holat', n.holat,
           'versiya', n.versiya, 'davr_dan', n.davr_dan, 'davr_gacha', n.davr_gacha, 'yaratildi', n.yaratildi,
           'fakt_holat', n.fakt_holat, 'xarajat_id', n.xarajat_id, 'xarajat_summa', n.xarajat_summa,
           'qator_soni', (select count(*) from public.t2_naryad_qator q where q.naryad_id = n.id),
           'reja_summa', (select sum(q.hajm * q.usta_narx) from public.t2_naryad_qator q where q.naryad_id = n.id),
           'narxsiz_soni', (select count(*) from public.t2_naryad_qator q where q.naryad_id = n.id and q.usta_narx is null)) as j
           from public.t2_naryad n
          where n.kompaniya_id = p_kompaniya_id
            and (nullif(p_filtr ->> 'obyekt_id', '') is null or n.obyekt_id = (p_filtr ->> 'obyekt_id')::bigint)
            and (nullif(p_filtr ->> 'holat', '') is null or n.holat = p_filtr ->> 'holat')
          order by n.yaratildi desc, n.id desc limit v_lim) x));
  elsif p_bolim = 'bitta' then
    v_id := public._t2_naryad_son(p_filtr -> 'id')::bigint;
    if v_id is null or not exists (select 1 from public.t2_naryad where id = v_id and kompaniya_id = p_kompaniya_id) then
      return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
    end if;
    return jsonb_build_object('ok', true, 'bolim', 'bitta', 'naryad', public._t2_naryad_json(v_id));
  elsif p_bolim = 'lugat' then
    select qiymat, versiya into v_l from public.t2_lugat_kompaniya where kompaniya_id = p_kompaniya_id;
    return jsonb_build_object('ok', true, 'bolim', 'lugat', 'qiymat', coalesce(v_l.qiymat, '{}'::jsonb), 'versiya', v_l.versiya);
  end if;
  return jsonb_build_object('ok', false, 'code', 'BOLIM_NOMALUM');
end $$;

-- ───────────────────────── Yozish ─────────────────────────
-- p_amal: yarat | bajarildi | qabul | narx (kelishilgan usta narxini kiritish/o'zgartirish, hisoblashdan oldin) | fakt_yozildi | hisobla | bekor | lugat_saqla. State amallarida CAS (p_kutilgan_versiya).
create or replace function public.t2_naryad_yoz_v1(p_kompaniya_id bigint, p_actor_id bigint, p_operation_id uuid, p_amal text,
  p_naryad_id bigint, p_kutilgan_versiya integer, p_yuk jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_t jsonb; n public.t2_naryad; v_r jsonb; v_x jsonb; v_q record; v_i integer := 0; v_sana integer; v_raqam text;
  v_obyekt bigint; v_hajm numeric; v_narx numeric; v_summa numeric; v_xr jsonb; v_nom text; v_l public.t2_lugat_kompaniya; v_hozir numeric;
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'smeta.write');
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_REQUIRED'); end if;
  if p_amal is null or p_amal not in ('yarat', 'bajarildi', 'qabul', 'narx', 'fakt_yozildi', 'hisobla', 'bekor', 'lugat_saqla') then
    return jsonb_build_object('ok', false, 'code', 'AMAL_NOMALUM');
  end if;
  v_t := public._t2_naryad_takror(p_kompaniya_id, p_operation_id, p_amal); if v_t is not null then return v_t; end if;
  p_yuk := coalesce(p_yuk, '{}'::jsonb);
  if jsonb_typeof(p_yuk) <> 'object' then return jsonb_build_object('ok', false, 'code', 'YUK_NOTOGRI'); end if;

  if p_amal = 'lugat_saqla' then
    if p_yuk ? 'qiymat' and jsonb_typeof(p_yuk -> 'qiymat') = 'null' then
      delete from public.t2_lugat_kompaniya where kompaniya_id = p_kompaniya_id;
      v_r := jsonb_build_object('ok', true, 'ochirildi', true);
    else
      if jsonb_typeof(p_yuk -> 'qiymat') is distinct from 'object' or length((p_yuk -> 'qiymat')::text) > 20000 then
        return jsonb_build_object('ok', false, 'code', 'LUGAT_NOTOGRI');
      end if;
      insert into public.t2_lugat_kompaniya (kompaniya_id, qiymat, yangilagan_id) values (p_kompaniya_id, p_yuk -> 'qiymat', p_actor_id)
      on conflict (kompaniya_id) do update set qiymat = excluded.qiymat, versiya = public.t2_lugat_kompaniya.versiya + 1,
        yangilagan_id = excluded.yangilagan_id, yangilandi = now()
      returning * into v_l;
      v_r := jsonb_build_object('ok', true, 'versiya', v_l.versiya);
    end if;
    return public._t2_naryad_saqla_op(p_kompaniya_id, p_operation_id, p_amal, v_r);
  end if;

  if p_amal = 'yarat' then
    v_obyekt := public._t2_naryad_son(p_yuk -> 'obyekt_id')::bigint;
    if v_obyekt is null or not exists (select 1 from public.t2_obyekt where id = v_obyekt and kompaniya_id = p_kompaniya_id) then
      return jsonb_build_object('ok', false, 'code', 'OBYEKT_SCOPE_MISMATCH');
    end if;
    v_nom := left(btrim(coalesce(p_yuk ->> 'usta_nom', '')), 200);
    if v_nom = '' then return jsonb_build_object('ok', false, 'code', 'USTA_KERAK'); end if;
    if jsonb_typeof(p_yuk -> 'qatorlar') is distinct from 'array' or jsonb_array_length(p_yuk -> 'qatorlar') not between 1 and 200 then
      return jsonb_build_object('ok', false, 'code', 'QATORLAR_1_200');
    end if;
    perform pg_advisory_xact_lock(hashtext('t2_naryad:' || p_kompaniya_id::text));
    select count(*) + 1 into v_sana from public.t2_naryad where kompaniya_id = p_kompaniya_id and extract(year from yaratildi) = extract(year from now());
    v_raqam := 'N-' || extract(year from now())::int || '-' || lpad(v_sana::text, 4, '0');
    while exists (select 1 from public.t2_naryad where kompaniya_id = p_kompaniya_id and raqam = v_raqam) loop
      v_sana := v_sana + 1; v_raqam := 'N-' || extract(year from now())::int || '-' || lpad(v_sana::text, 4, '0');
    end loop;
    insert into public.t2_naryad (kompaniya_id, obyekt_id, raqam, davr_dan, davr_gacha, usta_nom, usta_kontragent_id, brigada, izoh, yaratuvchi_id)
    values (p_kompaniya_id, v_obyekt, v_raqam, nullif(p_yuk ->> 'davr_dan', '')::date, nullif(p_yuk ->> 'davr_gacha', '')::date, v_nom,
      (select k.id from public.t2_kontragent k where k.id = public._t2_naryad_son(p_yuk -> 'usta_kontragent_id')::bigint and k.kompaniya_id = p_kompaniya_id),
      nullif(left(btrim(coalesce(p_yuk ->> 'brigada', '')), 200), ''), nullif(left(btrim(coalesce(p_yuk ->> 'izoh', '')), 2000), ''), p_actor_id)
    returning * into n;
    for v_x in select * from jsonb_array_elements(p_yuk -> 'qatorlar') loop
      select q.id, q.kod, q.nom, q.birlik into v_q from public.t2_qator q
       where q.id = public._t2_naryad_son(v_x -> 'qator_id')::bigint and q.kompaniya_id = p_kompaniya_id and q.obyekt_id = v_obyekt and q.versiya_holat = 'faol' and q.tur = 'bl';
      if not found then raise exception 'NARYAD_QATOR_TOPILMADI'; end if;
      v_hajm := public._t2_naryad_son(v_x -> 'hajm');
      if v_hajm is null or v_hajm <= 0 then raise exception 'NARYAD_HAJM_NOTOGRI'; end if;
      v_narx := public._t2_naryad_son(v_x -> 'usta_narx');
      if v_narx is not null and v_narx < 0 then raise exception 'NARYAD_NARX_NOTOGRI'; end if;
      v_i := v_i + 1;
      insert into public.t2_naryad_qator (kompaniya_id, naryad_id, qator_id, tartib, kod, nom, birlik, hajm, norma_chel_soat, smeta_mehnat_birlik, usta_narx, fakt_boshida)
      values (p_kompaniya_id, n.id, v_q.id, v_i, left(v_q.kod, 100), left(coalesce(v_q.nom, ''), 500), left(v_q.birlik, 40), v_hajm,
        greatest(public._t2_naryad_son(v_x -> 'norma_chel_soat'), 0), greatest(public._t2_naryad_son(v_x -> 'smeta_mehnat_birlik'), 0), v_narx,
        public._t2_naryad_son(v_x -> 'fakt_boshida'));
    end loop;
    v_r := jsonb_build_object('ok', true, 'id', n.id, 'raqam', n.raqam, 'versiya', n.versiya, 'holat', n.holat, 'fakt_operation_id', n.fakt_operation_id);
    return public._t2_naryad_saqla_op(p_kompaniya_id, p_operation_id, p_amal, v_r);
  end if;

  -- State amallari
  select * into n from public.t2_naryad where id = p_naryad_id and kompaniya_id = p_kompaniya_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if p_kutilgan_versiya is distinct from n.versiya then
    return jsonb_build_object('ok', false, 'code', 'STALE_VERSION', 'sizning_versiya', p_kutilgan_versiya, 'bazadagi_versiya', n.versiya);
  end if;

  if p_amal = 'bajarildi' then
    if n.holat not in ('berildi', 'bajarildi') then return jsonb_build_object('ok', false, 'code', 'HOLAT_NOTOGRI', 'holat', n.holat); end if;
    for v_x in select * from jsonb_array_elements(coalesce(p_yuk -> 'qatorlar', '[]'::jsonb)) loop
      v_hajm := public._t2_naryad_son(v_x -> 'bajarilgan_hajm');
      if v_hajm is null or v_hajm < 0 then raise exception 'NARYAD_HAJM_NOTOGRI'; end if;
      update public.t2_naryad_qator set bajarilgan_hajm = v_hajm where id = public._t2_naryad_son(v_x -> 'id')::bigint and naryad_id = n.id;
    end loop;
    if exists (select 1 from public.t2_naryad_qator where naryad_id = n.id and bajarilgan_hajm is null) then
      return jsonb_build_object('ok', false, 'code', 'BAJARILGAN_TOLIQ_EMAS');
    end if;
    update public.t2_naryad set holat = 'bajarildi', bajarildi_sana = now(), versiya = versiya + 1, yangilandi = now() where id = n.id returning * into n;
  elsif p_amal = 'qabul' then
    if n.holat not in ('berildi', 'bajarildi') then return jsonb_build_object('ok', false, 'code', 'HOLAT_NOTOGRI', 'holat', n.holat); end if;
    for v_q in select * from public.t2_naryad_qator where naryad_id = n.id order by tartib loop
      select x into v_x from jsonb_array_elements(coalesce(p_yuk -> 'qatorlar', '[]'::jsonb)) x where public._t2_naryad_son(x -> 'id') = v_q.id limit 1;
      v_hajm := coalesce(public._t2_naryad_son(v_x -> 'qabul_hajm'), v_q.bajarilgan_hajm);
      if v_hajm is null or v_hajm < 0 then raise exception 'NARYAD_HAJM_NOTOGRI'; end if;
      v_hozir := public._t2_naryad_son(v_x -> 'fakt_hozir');
      update public.t2_naryad_qator set qabul_hajm = v_hajm,
        -- farq: shu naryad bo'yicha kutilgan fakt (boshida + qabul) − hozirgi fakt; hozirgi fakt noma'lum bo'lsa boshidagidan hisoblanadi.
        fakt_delta = greatest(coalesce(fakt_boshida, 0) + v_hajm - coalesce(v_hozir, fakt_boshida, 0), 0)
       where id = v_q.id;
    end loop;
    update public.t2_naryad set holat = 'qabul', qabul_sana = now(), qabul_kim = p_actor_id, versiya = versiya + 1, yangilandi = now() where id = n.id returning * into n;
  elsif p_amal = 'narx' then
    if n.holat not in ('berildi', 'bajarildi', 'qabul') then return jsonb_build_object('ok', false, 'code', 'HOLAT_NOTOGRI', 'holat', n.holat); end if;
    for v_x in select * from jsonb_array_elements(coalesce(p_yuk -> 'qatorlar', '[]'::jsonb)) loop
      v_narx := public._t2_naryad_son(v_x -> 'usta_narx');
      if v_narx is null or v_narx < 0 then raise exception 'NARYAD_NARX_NOTOGRI'; end if;
      update public.t2_naryad_qator set usta_narx = v_narx where id = public._t2_naryad_son(v_x -> 'id')::bigint and naryad_id = n.id;
    end loop;
    update public.t2_naryad set versiya = versiya + 1, yangilandi = now() where id = n.id returning * into n;
  elsif p_amal = 'fakt_yozildi' then
    if n.holat <> 'qabul' then return jsonb_build_object('ok', false, 'code', 'HOLAT_NOTOGRI', 'holat', n.holat); end if;
    if n.fakt_holat = 'yozildi' then return jsonb_build_object('ok', true, 'takror', true, 'id', n.id, 'versiya', n.versiya); end if;
    update public.t2_naryad_qator set fakt_yozilgan = fakt_delta where naryad_id = n.id;
    update public.t2_naryad set fakt_holat = 'yozildi', fakt_akt_id = public._t2_naryad_son(p_yuk -> 'akt_id')::bigint, versiya = versiya + 1, yangilandi = now()
     where id = n.id returning * into n;
  elsif p_amal = 'hisobla' then
    perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'financial.write');
    if n.holat <> 'qabul' then return jsonb_build_object('ok', false, 'code', 'HOLAT_NOTOGRI', 'holat', n.holat); end if;
    if n.fakt_holat is distinct from 'yozildi' and exists (select 1 from public.t2_naryad_qator where naryad_id = n.id and coalesce(fakt_delta, 0) > 0) then
      return jsonb_build_object('ok', false, 'code', 'FAKT_YOZILMAGAN');
    end if;
    if exists (select 1 from public.t2_naryad_qator where naryad_id = n.id and usta_narx is null and coalesce(qabul_hajm, 0) > 0) then
      return jsonb_build_object('ok', false, 'code', 'USTA_NARX_YOQ');
    end if;
    select round(coalesce(sum(qabul_hajm * usta_narx), 0), 2) into v_summa from public.t2_naryad_qator where naryad_id = n.id;
    if v_summa <= 0 then return jsonb_build_object('ok', false, 'code', 'SUMMA_NOL'); end if;
    v_xr := public.t2_xarajat_kirit_v1(p_kompaniya_id, p_actor_id, n.obyekt_id, null, current_date, 'ЧЕЛ', v_summa, 'naryad №' || n.raqam,
      left('Naryad ' || n.raqam || ', usta: ' || n.usta_nom, 1000), n.xarajat_operation_id);
    if coalesce(v_xr ->> 'ok', 'false') <> 'true' then return jsonb_build_object('ok', false, 'code', coalesce(v_xr ->> 'code', 'XARAJAT_YOZILMADI')); end if;
    update public.t2_naryad set holat = 'hisoblandi', hisob_sana = now(), xarajat_id = (v_xr ->> 'xarajat_id')::bigint, xarajat_summa = v_summa,
      versiya = versiya + 1, yangilandi = now() where id = n.id returning * into n;
  elsif p_amal = 'bekor' then
    if n.holat in ('hisoblandi', 'bekor') or n.fakt_holat = 'yozildi' then return jsonb_build_object('ok', false, 'code', 'BEKOR_MUMKIN_EMAS', 'holat', n.holat); end if;
    update public.t2_naryad set holat = 'bekor', versiya = versiya + 1, yangilandi = now() where id = n.id returning * into n;
  end if;

  v_r := jsonb_build_object('ok', true, 'id', n.id, 'versiya', n.versiya, 'holat', n.holat, 'fakt_operation_id', n.fakt_operation_id,
    'xarajat_id', n.xarajat_id, 'xarajat_summa', n.xarajat_summa);
  return public._t2_naryad_saqla_op(p_kompaniya_id, p_operation_id, p_amal, v_r);
end $$;


drop function if exists public._t2_naryad_narx_smeta(numeric, numeric);
drop index if exists public.t2_naryad_qator_tarix_idx;
drop index if exists public.t2_naryad_usta_idx;
alter table public.t2_naryad_qator drop column if exists smeta_kat_birlik, drop column if exists usta_narx_birlik, drop column if exists koef, drop column if exists usta_birlik, drop column if exists kat;
alter table public.t2_naryad drop column if exists usta_foydalanuvchi_id;
