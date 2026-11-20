-- T2_TRANSPORT_YOY_V1: (1) transport xatolarini aktorsiz hisoblovchi ichki funksiya (audit shuni chaqiradi - bitta manba);
-- (2) F-2 TASDIQLASH himoyasi: transport xatosi bor obyektda F-2 ni 'tasdiqlangan' qilib bo'lmaydi (qoralama ruxsat; ogohlantirish MCP da);
-- (3) t2_qator_transport_yoy_v1: «Расчёт затрат транспорта» varag'idan t·km qatorlarini tizim O'ZI yoyadi (preview/yozish).

-- ===== 1. Ichki hisob =====
create or replace function public._t2_qator_transport_xato_v1(p_obyekt_id bigint)
 returns jsonb
 language plpgsql
 stable
 set search_path to 'public', 'pg_temp'
as $fn$
declare v_xul jsonb; v_mat jsonb; v_xato jsonb;
begin
  with m as (
    select q.id, q.kod, q.nom, q.kat, coalesce(q.transport_usul, 'foiz') as usul
      from public.t2_qator q
     where q.obyekt_id = p_obyekt_id and q.versiya_holat = 'faol'
       and q.tur in ('rs', 'mat', 'ob') and q.kat in ('МАТ', 'М/К', 'КАБ', 'БЕЗСКЛАД', 'ОБ')
       and q.transport_manba_qator_id is null
  ),
  tr as (
    select q.id, q.transport_manba_qator_id as m_id, q.kat, q.nom, q.summa, q.transport_zichlik, q.transport_km
      from public.t2_qator q
     where q.obyekt_id = p_obyekt_id and q.versiya_holat = 'faol' and q.transport_manba_qator_id is not null
  ),
  mt as (
    select m.*, coalesce((select jsonb_agg(t.id order by t.id) from tr t where t.m_id = m.id), '[]'::jsonb) as tr_idlar,
           (select count(*) from tr t where t.m_id = m.id) as tr_soni
      from m
  ),
  f as (
    select 'TKM_TRANSPORT_YOQ'::text as kod, mt.id as qator_id, 'tkm materialning t·km transport qatori yo''q'::text as xabar
      from mt where mt.usul = 'tkm' and mt.tr_soni = 0
    union all
    select 'TRANSPORT_MATERIAL_YOQ', t.id, 't·km qatori faol material qatoriga bog''lanmagan (material topilmadi yoki material emas)'
      from tr t where not exists (select 1 from m where m.id = t.m_id)
    union all
    select 'TKM_VA_FOIZ', t.id, 'material ' || m.id || ' t·km bilan tashilgan, lekin usuli ' || m.usul || ' - ikki marta transport xavfi'
      from tr t join m on m.id = t.m_id where m.usul <> 'tkm'
    union all
    select 'IKKITA_TRANSPORT', mt.id, 'bitta materialga ' || mt.tr_soni || ' ta faol t·km qatori'
      from mt where mt.tr_soni > 1
    union all
    select 'TRANSPORT_KAT', t.id, 't·km qatori kategoriyasi МАШ emas'
      from tr t where t.kat is distinct from 'МАШ'
  )
  select
    jsonb_build_object('material_soni', (select count(*) from m),
                       'foiz', (select count(*) from m where usul = 'foiz'),
                       'tkm', (select count(*) from m where usul = 'tkm'),
                       'narx_ichida', (select count(*) from m where usul = 'narx_ichida'),
                       'tkm_qator_soni', (select count(*) from tr),
                       'xato_soni', (select count(*) from f)),
    coalesce((select jsonb_agg(jsonb_build_object('qator_id', mt.id, 'kod', mt.kod, 'nom', mt.nom, 'kat', mt.kat, 'usul', mt.usul,
                'foiz_bazada', mt.usul = 'foiz', 'tkm_qatorlar', mt.tr_idlar) order by mt.id)
                from mt where mt.usul <> 'foiz' or mt.tr_soni > 0), '[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object('kod', f.kod, 'qator_id', f.qator_id, 'xabar', f.xabar) order by f.kod, f.qator_id) from f), '[]'::jsonb)
    into v_xul, v_mat, v_xato;
  return jsonb_build_object('xulosa', v_xul, 'materiallar', v_mat, 'xatolar', v_xato);
end $fn$;
revoke all on function public._t2_qator_transport_xato_v1(bigint) from public, anon, authenticated;
grant execute on function public._t2_qator_transport_xato_v1(bigint) to service_role;

create or replace function public.t2_qator_transport_audit_v1(p_actor_id bigint, p_obyekt_id bigint)
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to 'public', 'pg_temp'
as $fn$
declare v_komp bigint; v jsonb;
begin
  select o.kompaniya_id into v_komp from public.t2_obyekt o where o.id = p_obyekt_id;
  if v_komp is null then
    return jsonb_build_object('ok', false, 'code', 'OBYEKT_YOQ', 'error', 'Obyekt topilmadi');
  end if;
  perform public.t2_actor_kompaniya_azo_tekshir(v_komp, p_actor_id);
  v := public._t2_qator_transport_xato_v1(p_obyekt_id);
  return jsonb_build_object('ok', true, 'obyekt_id', p_obyekt_id, 'xulosa', v->'xulosa', 'materiallar', v->'materiallar', 'xatolar', v->'xatolar');
end $fn$;

-- ===== 2. F-2 tasdiqlash himoyasi =====
create or replace function public._t2_akt_transport_guard_v1() returns trigger
 language plpgsql
 set search_path to 'public', 'pg_temp'
as $fn$
declare v jsonb; n int;
begin
  if new.tur = 'f2' and new.holat = 'tasdiqlangan' and old.holat is distinct from 'tasdiqlangan' then
    v := public._t2_qator_transport_xato_v1(new.obyekt_id);
    n := coalesce((v->'xulosa'->>'xato_soni')::int, 0);
    if n > 0 then
      raise exception 'TRANSPORT_XATO: obyektda % ta transport xatosi bor (transport_tekshir) - F-2 tasdiqlanmaydi: %', n, left((v->'xatolar')::text, 300)
        using errcode = '23514';
    end if;
  end if;
  return new;
end $fn$;
drop trigger if exists t2_akt_transport_guard_trg on public.t2_akt;
create trigger t2_akt_transport_guard_trg
  before update of holat on public.t2_akt
  for each row when (new.holat = 'tasdiqlangan' and old.holat is distinct from new.holat)
  execute function public._t2_akt_transport_guard_v1();

-- ===== 3. Yoyish =====
-- p_qatorlar: [{material, birlik, miqdor, zichlik, km, hisob_tkm, kodlar?: [text], nom_pattern?: text (ILIKE)}]
-- Qidiruv: p_rz_id ostidagi FAOL material qatorlari (rs/mat; МАТ, М/К, БЕЗСКЛАД), kod (aniq yoki harfli old qo'shimchasiz) yoki nom ILIKE.
-- Har guruh: topilgan qatorlar soni, ОЗ miqdori vs hisob miqdori, t·km vs hisob t·km, so'mdagi farq. Farq > 0.5% / topilmadi / qisman
-- (bir qismi allaqachon tkm) - BLOKLANADI (p_majburiy:=true bilan o'tadi; topilmagan guruh baribir o'tkaziladi). Allaqachon bog'langan material
-- qayta yaratilmaydi (idempotent). p_yoz:=false - faqat preview. Yozish: material.transport_usul='tkm' + t·km rs (kod «Т·КМ», kat МАШ, birlik «Т·КМ»,
-- norma/hajm = material x zichlik x km, narx = p_tkm_narx), shu bl ostida material yonida (tartib = materialniki, id bo'yicha keyin).
create or replace function public.t2_qator_transport_yoy_v1(p_actor_id bigint, p_obyekt_id bigint, p_rz_id bigint, p_tkm_narx numeric,
  p_qatorlar jsonb, p_majburiy boolean default false, p_yoz boolean default false)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_komp bigint; g jsonb; v_guruhlar jsonb := '[]'::jsonb; v_reja jsonb := '[]'::jsonb; v_bloklangan boolean := false;
  v_kodlar text[]; v_pat text; v_z numeric; v_km numeric; v_miq numeric; v_hisob numeric; v_nom text;
  v_ids bigint[]; v_yangi int; v_bor int; v_sum_m numeric; v_sum_t numeric; v_fm numeric; v_ft numeric; v_holat text; v_sabab text;
  m public.t2_qator; v_id bigint; v_h numeric; v_s numeric; v_yaratildi int := 0; v_tol constant numeric := 0.005;
begin
  select o.kompaniya_id into v_komp from public.t2_obyekt o where o.id = p_obyekt_id;
  if v_komp is null then return jsonb_build_object('ok', false, 'code', 'OBYEKT_YOQ', 'error', 'Obyekt topilmadi'); end if;
  perform public.t2_require_permission_v2(v_komp, p_actor_id, 'smeta.write');
  if not exists (select 1 from public.t2_qator q where q.id = p_rz_id and q.obyekt_id = p_obyekt_id) then
    return jsonb_build_object('ok', false, 'code', 'RZ_YOQ', 'error', 'rz_id shu obyektda topilmadi');
  end if;
  if p_tkm_narx is null or p_tkm_narx < 0 then return jsonb_build_object('ok', false, 'code', 'NARX_YOQ', 'error', 'tkm_narx (so''m / t·km) kerak'); end if;
  if p_qatorlar is null or jsonb_typeof(p_qatorlar) <> 'array' or jsonb_array_length(p_qatorlar) not between 1 and 500 then
    return jsonb_build_object('ok', false, 'code', 'QATORLAR', 'error', 'qatorlar: 1..500 ta element');
  end if;

  for g in select e.value from jsonb_array_elements(p_qatorlar) e loop
    v_nom := coalesce(g->>'material', '?');
    v_z := nullif(g->>'zichlik', '')::numeric; v_km := nullif(g->>'km', '')::numeric;
    v_miq := nullif(g->>'miqdor', '')::numeric; v_hisob := nullif(g->>'hisob_tkm', '')::numeric;
    v_kodlar := coalesce(array(select upper(btrim(x)) from jsonb_array_elements_text(coalesce(g->'kodlar', '[]'::jsonb)) x), '{}');
    v_pat := nullif(btrim(coalesce(g->>'nom_pattern', '')), '');
    v_ids := '{}'; v_yangi := 0; v_bor := 0; v_sum_m := 0; v_sum_t := 0; v_fm := null; v_ft := null; v_sabab := null;
    if v_z is null or v_z <= 0 or v_km is null or v_km < 0 then
      v_holat := 'xato'; v_sabab := 'zichlik (>0) va km (>=0) kerak';
    elsif cardinality(v_kodlar) = 0 and v_pat is null then
      v_holat := 'xato'; v_sabab := 'kodlar yoki nom_pattern kerak';
    else
      with recursive sub as (
        select q.id from public.t2_qator q where q.id = p_rz_id
        union all
        select c.id from public.t2_qator c join sub on c.ota_id = sub.id where c.obyekt_id = p_obyekt_id
      ), mos as (
        select q.id, q.hajm,
               exists (select 1 from public.t2_qator c where c.transport_manba_qator_id = q.id and c.versiya_holat = 'faol') as bor
          from public.t2_qator q join sub on sub.id = q.id
         where q.versiya_holat = 'faol' and q.tur in ('rs', 'mat') and q.kat in ('МАТ', 'М/К', 'БЕЗСКЛАД') and q.transport_manba_qator_id is null
           and ((cardinality(v_kodlar) > 0 and (upper(btrim(q.kod)) = any (v_kodlar) or regexp_replace(upper(btrim(q.kod)), '^[A-ZА-Я]+[-. ]*', '') = any (v_kodlar)))
                or (v_pat is not null and q.nom ilike v_pat))
      )
      select coalesce(array_agg(mos.id order by mos.id) filter (where not mos.bor and mos.hajm is not null), '{}'),
             count(*) filter (where not mos.bor and mos.hajm is not null), count(*) filter (where mos.bor),
             coalesce(sum(mos.hajm) filter (where not mos.bor and mos.hajm is not null), 0)
        into v_ids, v_yangi, v_bor, v_sum_m from mos;
      v_sum_t := v_sum_m * v_z * v_km;
      if v_miq is not null and v_miq <> 0 then v_fm := (v_sum_m - v_miq) / v_miq; end if;
      if v_hisob is not null and v_hisob <> 0 then v_ft := (v_sum_t - v_hisob) / v_hisob; end if;
      if v_yangi = 0 and v_bor = 0 then v_holat := 'topilmadi'; v_sabab := 'material qatori topilmadi (kod / nom)';
      elsif v_yangi = 0 then v_holat := 'allaqachon';
      elsif v_bor > 0 then v_holat := 'qisman'; v_sabab := 'bir qismi allaqachon tkm - qolganlari yoyiladi';
      elsif abs(coalesce(v_fm, 0)) > v_tol or abs(coalesce(v_ft, 0)) > v_tol then v_holat := 'chetlanish'; v_sabab := 'miqdor yoki t·km hisobdan 0.5% dan ortiq farq qiladi';
      else v_holat := 'tayyor'; end if;
    end if;
    if v_holat in ('xato', 'topilmadi', 'qisman', 'chetlanish') then v_bloklangan := true; end if;
    v_guruhlar := v_guruhlar || jsonb_build_array(jsonb_build_object(
      'material', v_nom, 'holat', v_holat, 'sabab', v_sabab, 'topilgan_soni', v_yangi, 'allaqachon_soni', v_bor,
      'miqdor_hisob', v_miq, 'miqdor_tizim', v_sum_m, 'farq_miqdor_foiz', trunc(v_fm * 100, 4),
      'tkm_hisob', v_hisob, 'tkm_tizim', v_sum_t, 'farq_tkm_foiz', trunc(v_ft * 100, 4),
      'farq_som', case when v_hisob is null then null else trunc((v_sum_t - v_hisob) * p_tkm_narx, 2) end));
    if v_holat in ('tayyor', 'chetlanish', 'qisman') then
      v_reja := v_reja || jsonb_build_array(jsonb_build_object('ids', to_jsonb(v_ids), 'z', v_z, 'km', v_km));
    end if;
  end loop;

  if p_yoz and v_bloklangan and not coalesce(p_majburiy, false) then
    return jsonb_build_object('ok', false, 'code', 'TASDIQ_KERAK', 'error', 'Guruhlarda farq/topilmadi bor - ko''rib chiqing, kerak bo''lsa majburiy:true',
      'bloklangan', true, 'yozildi', false, 'guruhlar', v_guruhlar);
  end if;

  if p_yoz then
    for g in select e.value from jsonb_array_elements(v_reja) e loop
      v_z := (g->>'z')::numeric; v_km := (g->>'km')::numeric;
      for v_id in select (x.value)::bigint from jsonb_array_elements_text(g->'ids') x loop
        select * into m from public.t2_qator q where q.id = v_id;
        continue when m.id is null or m.hajm is null;
        update public.t2_qator set transport_usul = 'tkm' where id = m.id;
        v_h := m.hajm * v_z * v_km; v_s := v_h * p_tkm_narx;
        insert into public.t2_qator (obyekt_id, kompaniya_id, ota_id, tur, kod, nom, birlik, kat, hajm, norma, narx, summa, tartib, daraja,
                                     transport_manba_qator_id, transport_zichlik, transport_km)
          values (m.obyekt_id, m.kompaniya_id, m.ota_id, 'rs', 'Т·КМ', '↳ ТРАНСПОРТ: ' || left(m.nom, 60), 'Т·КМ', 'МАШ', v_h,
                  case when m.norma is null then null else m.norma * v_z * v_km end, p_tkm_narx, v_s, m.tartib, m.daraja, m.id, v_z, v_km);
        update public.t2_qator p set summa = p.summa + v_s where p.id = m.ota_id and p.tur = 'bl' and p.summa is not null;
        v_yaratildi := v_yaratildi + 1;
      end loop;
    end loop;
  end if;

  return jsonb_build_object('ok', true, 'obyekt_id', p_obyekt_id, 'yozildi', p_yoz and (not v_bloklangan or coalesce(p_majburiy, false)),
    'bloklangan', v_bloklangan, 'yaratildi', v_yaratildi, 'guruhlar', v_guruhlar);
end $fn$;
revoke all on function public.t2_qator_transport_yoy_v1(bigint, bigint, bigint, numeric, jsonb, boolean, boolean) from public, anon, authenticated;
grant execute on function public.t2_qator_transport_yoy_v1(bigint, bigint, bigint, numeric, jsonb, boolean, boolean) to service_role;