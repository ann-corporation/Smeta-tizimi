-- T2-HR-KPI-001 (2/2) - HR + KPI RPC lari (security definer, a'zolik + hr.* / payroll.* ruxsat, faqat service_role).
-- O'QISH (stable): t2_hr_xodimlar_v1, t2_hr_oy_v1, t2_hr_kpi_v1, t2_hr_oylik_buxgalteriya_v1
-- YOZISH (operation_id idempotent): t2_hr_xodim_saqla_v1, t2_hr_sxema_saqla_v1, t2_hr_kalendar_saqla_v1, t2_hr_tabel_saqla_v1,
--   t2_hr_tuzatma_saqla_v1, t2_hr_tuzatma_qaror_v1, t2_hr_oylik_hisobla_v1 (hisobla | tasdiqla | qaytar)
-- Formulalar: docs/architecture/HR_KPI_V1.md §3. Pul round(x,2) (yarim noldan uzoqqa) = frontend yaxlit2. NULL != 0.
begin;

create or replace function public._t2_hr_ruxsat_v1(p_kompaniya_id bigint, p_actor_id bigint, p_perms text[])
returns text language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_rol text; p text;
begin
  v_rol := public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  foreach p in array p_perms loop
    if public.t2_permission_allowed_v2(p_kompaniya_id, p_actor_id, p) then return v_rol; end if;
  end loop;
  raise exception 'PERMISSION_DENIED: %', array_to_string(p_perms, '|') using errcode = '42501';
end $$;

create or replace function public._t2_hr_oy_v1(p_oy text)
returns date language plpgsql immutable set search_path = public, pg_temp as $$
begin
  if p_oy is null or p_oy !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'OY_INVALID: YYYY-MM kerak' using errcode = '22023'; end if;
  return (p_oy || '-01')::date;
end $$;

create or replace function public._t2_hr_log_v1(p_op uuid, p_actor bigint, p_cmd text, p_res jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.t2_onboarding_command_log(operation_id, actor_id, command, natija) values (p_op, p_actor, p_cmd, p_res);
  return p_res;
end $$;

-- Oy kunlari: istisno (kalendar) bo'lsa shu, aks holda hafta kuni bo'yicha (5 kunlik: Du-Ju; 6 kunlik: Du-Sh).
create or replace function public._t2_hr_kunlar_v1(p_kompaniya_id bigint, p_oy date)
returns table(sana date, hafta smallint, tur5 text, tur6 text, nom text)
language sql stable security definer set search_path = public, pg_temp as $$
  select d::date, extract(isodow from d)::smallint,
         coalesce(k.tur, case when extract(isodow from d) <= 5 then 'ish' else 'dam' end),
         coalesce(k.tur, case when extract(isodow from d) <= 6 then 'ish' else 'dam' end),
         k.nom
    from generate_series(p_oy::timestamp, (p_oy + interval '1 month' - interval '1 day')::timestamp, interval '1 day') d
    left join public.t2_hr_kalendar k on k.kompaniya_id = p_kompaniya_id and k.sana = d::date
   order by 1
$$;

-- Yagona hisob: har xodim uchun oylik tasviri (jsonb massiv). Faqat ichki; ruxsatni chaqiruvchi tekshiradi.
create or replace function public._t2_hr_hisob_v1(p_kompaniya_id bigint, p_oy date, p_kadr_ids bigint[] default null)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_oxir date := (p_oy + interval '1 month')::date;
  v_soz public.t2_hr_sozlama%rowtype;
  v_n5 int; v_n6 int; v_norma int; v_soat numeric;
  r record; v_out jsonb := '[]'::jsonb;
  v_tk jsonb; v_th text; v_k int; v_n int; v_o int; v_b int; v_d int; v_ish int;
  v_akt jsonb; v_akt_n int; v_akt_nom int; v_kpi numeric; v_f2s numeric;
  v_baza numeric; v_bonus numeric; v_jarima numeric; v_tz_nom int; v_tz jsonb; v_kutil int;
  v_hisob numeric; v_s numeric; v_ndfl numeric; v_inps numeric; v_sof numeric; v_toliq boolean; v_og text[];
begin
  select * into v_soz from public.t2_hr_sozlama where kompaniya_id = p_kompaniya_id;
  v_soat := coalesce(v_soz.kun_soat, 8);
  select count(*) filter (where tur5 = 'ish'), count(*) filter (where tur6 = 'ish') into v_n5, v_n6
    from public._t2_hr_kunlar_v1(p_kompaniya_id, p_oy);
  for r in
    select x.kadr_id, k.ism_sharif, k.lavozim, k.foydalanuvchi_id, x.rol, x.grafik, x.baza_turi, x.baza_summa, x.sxema_id,
           s.nom as sxema_nom, s.f2_foiz, s.f2_baza, s.f2_rejim
      from public.t2_hr_xodim x
      join public.t2_kadr_mustaqil k on k.id = x.kadr_id
      left join public.t2_hr_sxema s on s.id = x.sxema_id
     where x.kompaniya_id = p_kompaniya_id and coalesce(k.holat, 'faol') <> 'bekor'
       and (x.bosh_sana is null or x.bosh_sana >= p_oy) and (x.qabul_sana is null or x.qabul_sana < v_oxir)
       and (p_kadr_ids is null or x.kadr_id = any(p_kadr_ids))
     order by k.ism_sharif, x.kadr_id
  loop
    v_og := array[]::text[];
    v_norma := case when r.grafik = 6 then v_n6 else v_n5 end;

    -- tabel
    v_tk := null; v_th := null; v_ish := null; v_k := null; v_n := null; v_o := null; v_b := null; v_d := null;
    select t.kunlar, t.holat into v_tk, v_th from public.t2_hr_tabel t where t.kadr_id = r.kadr_id and t.oy = p_oy;
    if v_tk is null then
      v_og := array_append(v_og, 'tabel_yoq');
    else
      select count(*) filter (where e.value = 'K'), count(*) filter (where e.value = 'N'), count(*) filter (where e.value = 'O'),
             count(*) filter (where e.value = 'B'), count(*) filter (where e.value = 'D')
        into v_k, v_n, v_o, v_b, v_d from jsonb_each_text(v_tk) e;
      v_ish := v_k;
      if v_th <> 'tasdiqlangan' then v_og := array_append(v_og, 'tabel_tasdiqlanmagan'); end if;
      if v_norma > 0 and v_ish > v_norma then v_og := array_append(v_og, 'ish_kun_norma_dan_oshdi'); end if;
    end if;

    -- baza
    v_baza := case when r.baza_summa is null or v_ish is null then null
                   when r.baza_turi = 'kunlik' then round(r.baza_summa * v_ish, 2)
                   when v_norma > 0 then round(r.baza_summa * v_ish / v_norma, 2)
                   else null end;
    if r.baza_summa is null then v_og := array_append(v_og, 'baza_nomalum'); end if;

    -- F2 KPI
    v_akt := '[]'::jsonb; v_akt_n := 0; v_akt_nom := 0; v_kpi := null; v_f2s := null;
    if r.f2_foiz is not null then
      with ak as (
        select a.id, a.raqam, a.obyekt_id, o.nom as obyekt_nom, a.t_sana,
               case when r.f2_rejim = 'muallif' then (case when a.kim = 'actor:' || r.foydalanuvchi_id then 100::numeric end)
                    else (select b.ulush_foiz from public.t2_kadr_bog b
                           where b.kadr_id = r.kadr_id and b.obyekt_id = a.obyekt_id and b.holat = 'faol'
                             and (b.dan is null or b.dan <= a.t_sana) and (b.gacha is null or b.gacha >= a.t_sana)
                           order by b.id limit 1) end as ulush,
               case when r.f2_baza = 'ustamali' then
                      coalesce((select case when bool_or(p.itogo4 is null) then null else sum(p.itogo4) end
                                  from public.t2_akt_podval p where p.akt_id = a.id having count(*) > 0), a.hujjat_jami)
                    else (select case when count(*) = 0 or bool_or(q.summa is null) then null else sum(q.summa) end
                            from public.t2_akt_qator q where q.akt_id = a.id) end as asumma,
               case when r.f2_baza = 'ustamali' then
                      (case when exists (select 1 from public.t2_akt_podval p where p.akt_id = a.id) then 'podval' else 'reestr' end)
                    else 'qatorlar' end as manba
          from (select t.*, (coalesce(t.lifecycle_approved_at, t.yangilandi) at time zone 'Asia/Tashkent')::date as t_sana
                  from public.t2_akt t
                 where t.kompaniya_id = p_kompaniya_id and t.tur = 'f2' and t.holat in ('tasdiqlangan', 'yakunlangan')
                   and coalesce(t.lifecycle_status, 'approved') = 'approved') a
          join public.t2_obyekt o on o.id = a.obyekt_id
         where a.t_sana >= p_oy and a.t_sana < v_oxir
      ), az as (select ak.*, round(ak.asumma * r.f2_foiz / 100 * ak.ulush / 100, 2) as kpi from ak where ak.ulush is not null)
      select coalesce(jsonb_agg(jsonb_build_object('akt_id', az.id, 'raqam', az.raqam, 'obyekt_id', az.obyekt_id, 'obyekt', az.obyekt_nom,
               'sana', az.t_sana, 'ulush', az.ulush, 'summa', az.asumma, 'manba', az.manba, 'kpi', az.kpi) order by az.t_sana, az.id), '[]'::jsonb),
             count(*)::int, (count(*) filter (where az.asumma is null))::int,
             sum(az.kpi), sum(round(az.asumma * az.ulush / 100, 2))
        into v_akt, v_akt_n, v_akt_nom, v_kpi, v_f2s
        from az;
      if v_akt_n = 0 then v_kpi := 0; v_f2s := 0;
      elsif v_akt_nom = v_akt_n then v_kpi := null; end if;
      if v_akt_nom > 0 then v_og := array_append(v_og, 'f2_summa_nomalum'); end if;
    end if;

    -- qo'lda bonus / jarima (faqat tasdiqlangan)
    select coalesce(sum(z.m) filter (where z.tur = 'bonus'), 0), coalesce(sum(z.m) filter (where z.tur = 'jarima'), 0),
           (count(*) filter (where z.m is null))::int,
           coalesce(jsonb_agg(jsonb_build_object('id', z.id, 'tur', z.tur, 'sabab', z.sabab, 'summa', z.m, 'foiz', z.foiz,
             'obyekt_id', z.obyekt_id, 'akt_id', z.akt_id, 'sifat_id', z.sifat_id, 'izoh', z.izoh) order by z.id), '[]'::jsonb)
      into v_bonus, v_jarima, v_tz_nom, v_tz
      from (select t.*, coalesce(t.summa, case when v_baza is null then null else round(v_baza * t.foiz / 100, 2) end) as m
              from public.t2_hr_tuzatma t where t.kadr_id = r.kadr_id and t.oy = p_oy and t.holat = 'tasdiqlangan') z;
    if v_tz_nom > 0 then v_og := array_append(v_og, 'tuzatma_nomalum'); end if;
    select count(*)::int into v_kutil from public.t2_hr_tuzatma t where t.kadr_id = r.kadr_id and t.oy = p_oy and t.holat = 'qoralama';
    if v_kutil > 0 then v_og := array_append(v_og, 'tuzatma_kutilmoqda'); end if;

    -- hisoblangan va ushlanmalar
    v_hisob := case when v_baza is null then null else round(v_baza + coalesce(v_kpi, 0) + v_bonus - v_jarima, 2) end;
    v_s := case when v_hisob is null then null else greatest(v_hisob, 0) end;
    v_ndfl := case when v_s is null or v_soz.ndfl_foiz is null then null else round(v_s * v_soz.ndfl_foiz / 100, 2) end;
    v_inps := case when v_s is null or v_soz.inps_foiz is null then null else round(v_s * v_soz.inps_foiz / 100, 2) end;
    v_sof := case when v_hisob is null or v_ndfl is null or v_inps is null then null else round(v_hisob - v_ndfl - v_inps, 2) end;
    if v_soz.ndfl_foiz is null or v_soz.inps_foiz is null then v_og := array_append(v_og, 'stavka_kiritilmagan'); end if;
    if v_hisob is not null and v_hisob < 0 then v_og := array_append(v_og, 'manfiy'); end if;
    v_toliq := v_baza is not null and not (r.f2_foiz is not null and v_kpi is null) and v_akt_nom = 0 and v_tz_nom = 0
               and v_soz.ndfl_foiz is not null and v_soz.inps_foiz is not null;

    v_out := v_out || jsonb_build_object(
      'kadr_id', r.kadr_id, 'ism', r.ism_sharif, 'lavozim', r.lavozim, 'rol', r.rol, 'grafik', r.grafik,
      'sxema_id', r.sxema_id, 'sxema', r.sxema_nom, 'f2_foiz', r.f2_foiz, 'f2_baza', r.f2_baza, 'f2_rejim', r.f2_rejim,
      'norma_kun', v_norma, 'norma_soat', round(v_norma * v_soat, 2),
      'kun_ishlagan', v_ish, 'kun_kelmadi', v_n, 'kun_otpusk', v_o, 'kun_kasal', v_b, 'kun_otgul', v_d, 'tabel_holat', v_th,
      'baza_turi', r.baza_turi, 'baza_summa', r.baza_summa, 'baza', v_baza,
      'kpi_f2', v_kpi, 'f2_summa', v_f2s, 'f2_soni', v_akt_n, 'f2_nomalum_soni', v_akt_nom, 'aktlar', v_akt,
      'bonus', v_bonus, 'jarima', v_jarima, 'tuzatmalar', v_tz, 'tuzatma_kutilmoqda', v_kutil,
      'hisoblangan', v_hisob, 'ndfl_foiz', v_soz.ndfl_foiz, 'inps_foiz', v_soz.inps_foiz,
      'ndfl', v_ndfl, 'inps', v_inps, 'sof', v_sof, 'toliq', v_toliq, 'ogohlantirish', to_jsonb(v_og));
  end loop;
  return v_out;
end $$;

-- ===================== O'QISH =====================

create or replace function public.t2_hr_xodimlar_v1(p_kompaniya_id bigint, p_actor_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_maosh boolean; v_pii boolean; v_res jsonb;
begin
  perform public._t2_hr_ruxsat_v1(p_kompaniya_id, p_actor_id, array['hr.read', 'payroll.read']);
  v_maosh := public.t2_permission_allowed_v2(p_kompaniya_id, p_actor_id, 'payroll.read')
          or public.t2_permission_allowed_v2(p_kompaniya_id, p_actor_id, 'hr.write');
  v_pii := public.t2_permission_allowed_v2(p_kompaniya_id, p_actor_id, 'hr.pii.read');
  select jsonb_build_object('ok', true, 'maosh_yopiq', not v_maosh, 'pii_yopiq', not v_pii,
    'xodimlar', coalesce((select jsonb_agg(jsonb_build_object(
        'kadr_id', k.id, 'ism', k.ism_sharif, 'lavozim', k.lavozim, 'holat', k.holat, 'foydalanuvchi_id', k.foydalanuvchi_id,
        'hr_bor', x.kadr_id is not null, 'rol', x.rol, 'grafik', x.grafik, 'baza_turi', x.baza_turi,
        'baza_summa', case when v_maosh then x.baza_summa end, 'sxema_id', x.sxema_id,
        'qabul_sana', x.qabul_sana, 'bosh_sana', x.bosh_sana, 'versiya', x.versiya,
        'obyektlar', coalesce((select jsonb_agg(jsonb_build_object('obyekt_id', b.obyekt_id, 'obyekt', o.nom, 'ulush_foiz', b.ulush_foiz,
                       'rol', b.rol, 'dan', b.dan, 'gacha', b.gacha) order by o.nom)
                      from public.t2_kadr_bog b join public.t2_obyekt o on o.id = b.obyekt_id
                     where b.kadr_id = k.id and b.holat = 'faol'), '[]'::jsonb),
        'pii', case when v_pii then (select jsonb_build_object('pinfl', p.pinfl, 'pasport', p.pasport, 'telefon', p.telefon, 'manzil', p.manzil)
                                       from public.t2_hr_xodim_pii p where p.kadr_id = k.id) end
      ) order by k.ism_sharif, k.id)
      from public.t2_kadr_mustaqil k left join public.t2_hr_xodim x on x.kadr_id = k.id
     where k.kompaniya_id = p_kompaniya_id and coalesce(k.holat, 'faol') <> 'bekor'), '[]'::jsonb),
    'sxemalar', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'nom', s.nom, 'f2_foiz', s.f2_foiz, 'f2_baza', s.f2_baza,
        'f2_rejim', s.f2_rejim, 'izoh', s.izoh, 'faol', s.faol, 'versiya', s.versiya) order by s.nom)
        from public.t2_hr_sxema s where s.kompaniya_id = p_kompaniya_id), '[]'::jsonb),
    'sozlama', (select jsonb_build_object('ndfl_foiz', z.ndfl_foiz, 'inps_foiz', z.inps_foiz, 'kun_soat', z.kun_soat, 'versiya', z.versiya)
                  from public.t2_hr_sozlama z where z.kompaniya_id = p_kompaniya_id),
    'obyektlar', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'nom', o.nom) order by o.nom)
        from public.t2_obyekt o where o.kompaniya_id = p_kompaniya_id and o.holat <> 'bekor'), '[]'::jsonb)
  ) into v_res;
  return v_res;
end $$;

create or replace function public.t2_hr_oy_v1(p_kompaniya_id bigint, p_actor_id bigint, p_oy text)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_oy date; v_oxir date; v_soat numeric; v_res jsonb;
begin
  perform public._t2_hr_ruxsat_v1(p_kompaniya_id, p_actor_id, array['hr.read', 'hr.tabel.write']);
  v_oy := public._t2_hr_oy_v1(p_oy); v_oxir := (v_oy + interval '1 month')::date;
  select coalesce(z.kun_soat, 8) into v_soat from (select 1) d left join public.t2_hr_sozlama z on z.kompaniya_id = p_kompaniya_id;
  select jsonb_build_object('ok', true, 'oy', p_oy, 'kun_soat', v_soat,
    'kunlar', (select coalesce(jsonb_agg(jsonb_build_object('sana', sana, 'hafta', hafta, 'tur5', tur5, 'tur6', tur6, 'nom', nom) order by sana), '[]'::jsonb)
                 from public._t2_hr_kunlar_v1(p_kompaniya_id, v_oy)),
    'norma', (select jsonb_build_object(
                '5', jsonb_build_object('kun', count(*) filter (where tur5 = 'ish'), 'soat', round((count(*) filter (where tur5 = 'ish')) * v_soat, 2)),
                '6', jsonb_build_object('kun', count(*) filter (where tur6 = 'ish'), 'soat', round((count(*) filter (where tur6 = 'ish')) * v_soat, 2)))
                from public._t2_hr_kunlar_v1(p_kompaniya_id, v_oy)),
    'istisnolar', (select coalesce(jsonb_agg(jsonb_build_object('sana', k.sana, 'tur', k.tur, 'nom', k.nom) order by k.sana), '[]'::jsonb)
                     from public.t2_hr_kalendar k where k.kompaniya_id = p_kompaniya_id and k.sana >= v_oy and k.sana < v_oxir),
    'tabel', (select coalesce(jsonb_agg(jsonb_build_object('kadr_id', t.kadr_id, 'kunlar', t.kunlar, 'holat', t.holat, 'versiya', t.versiya,
                'yopiq', exists (select 1 from public.t2_hr_oylik y where y.kadr_id = t.kadr_id and y.oy = v_oy and y.holat = 'tasdiqlangan'))), '[]'::jsonb)
                from public.t2_hr_tabel t where t.kompaniya_id = p_kompaniya_id and t.oy = v_oy),
    'tatillar', (select coalesce(jsonb_agg(jsonb_build_object('id', h.id, 'kadr_id', h.kadr_id, 'tur', h.tur, 'dan', h.dan, 'gacha', h.gacha,
                'holat', h.holat, 'izoh', h.izoh) order by h.dan, h.id), '[]'::jsonb)
                from public.t2_hr_tatil h where h.kompaniya_id = p_kompaniya_id and h.holat <> 'bekor' and h.dan < v_oxir and h.gacha >= v_oy),
    'tuzatmalar', (select coalesce(jsonb_agg(jsonb_build_object('id', z.id, 'kadr_id', z.kadr_id, 'tur', z.tur, 'sabab', z.sabab, 'izoh', z.izoh,
                'summa', z.summa, 'foiz', z.foiz, 'obyekt_id', z.obyekt_id, 'akt_id', z.akt_id, 'sifat_id', z.sifat_id, 'fayl_id', z.fayl_id,
                'holat', z.holat, 'yaratgan', z.yaratgan, 'qaror_kim', z.qaror_kim, 'qaror_izoh', z.qaror_izoh, 'versiya', z.versiya) order by z.id), '[]'::jsonb)
                from public.t2_hr_tuzatma z where z.kompaniya_id = p_kompaniya_id and z.oy = v_oy and z.holat <> 'bekor')
  ) into v_res;
  return v_res;
end $$;

create or replace function public.t2_hr_kpi_v1(p_kompaniya_id bigint, p_actor_id bigint, p_oy text)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_oy date;
begin
  perform public._t2_hr_ruxsat_v1(p_kompaniya_id, p_actor_id, array['payroll.read']);
  v_oy := public._t2_hr_oy_v1(p_oy);
  return jsonb_build_object('ok', true, 'oy', p_oy, 'generated_at', now(),
    'qatorlar', public._t2_hr_hisob_v1(p_kompaniya_id, v_oy, null),
    'saqlangan', (select coalesce(jsonb_agg(jsonb_build_object('kadr_id', y.kadr_id, 'holat', y.holat, 'hisoblangan', y.hisoblangan, 'sof', y.sof,
                  'toliq', y.toliq, 'provodka_holat', y.provodka_holat, 'vaqt', y.hisoblangan_vaqt)), '[]'::jsonb)
                  from public.t2_hr_oylik y where y.kompaniya_id = p_kompaniya_id and y.oy = v_oy));
end $$;

-- Buxgalteriya ilgagi: tasdiqlangan ish haqi qatorlari (provodka yozuvini buxgalteriya moduli yaratadi; v1 da bu yerda yozilmaydi).
create or replace function public.t2_hr_oylik_buxgalteriya_v1(p_kompaniya_id bigint, p_actor_id bigint, p_oy text)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_oy date;
begin
  perform public._t2_hr_ruxsat_v1(p_kompaniya_id, p_actor_id, array['payroll.read']);
  v_oy := public._t2_hr_oy_v1(p_oy);
  return jsonb_build_object('ok', true, 'oy', p_oy, 'qatorlar', (
    select coalesce(jsonb_agg(jsonb_build_object('oylik_id', y.id, 'kadr_id', y.kadr_id, 'hisoblangan', y.hisoblangan, 'ndfl', y.ndfl,
             'inps', y.inps, 'sof', y.sof, 'provodka_holat', y.provodka_holat, 'provodka_id', y.provodka_id) order by y.kadr_id), '[]'::jsonb)
      from public.t2_hr_oylik y where y.kompaniya_id = p_kompaniya_id and y.oy = v_oy and y.holat = 'tasdiqlangan'));
end $$;

-- ===================== YOZISH =====================

create or replace function public.t2_hr_xodim_saqla_v1(p_actor_id bigint, p_kompaniya_id bigint, p_kadr_id bigint, p_profil jsonb,
  p_pii jsonb, p_obyektlar jsonb, p_kutilgan_versiya integer, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_prev jsonb; v_kadr bigint := p_kadr_id; v_x public.t2_hr_xodim%rowtype; v_has boolean; v_e jsonb; v_oid bigint; v_ul numeric;
  v_sx bigint; v_rol text; v_graf smallint; v_bt text; v_bs numeric; v_ver int; v_n int := 0;
  v_ids bigint[] := array[]::bigint[]; v_uid bigint;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select natija into v_prev from public.t2_onboarding_command_log where operation_id = p_operation_id;
  if found then return v_prev; end if;
  perform public._t2_hr_ruxsat_v1(p_kompaniya_id, p_actor_id, array['hr.write']);
  p_profil := coalesce(p_profil, '{}'::jsonb);
  if jsonb_typeof(p_profil) <> 'object' then return jsonb_build_object('ok', false, 'code', 'PROFIL_INVALID'); end if;
  if p_pii is not null then
    if jsonb_typeof(p_pii) <> 'object' then return jsonb_build_object('ok', false, 'code', 'PII_INVALID'); end if;
    perform public._t2_hr_ruxsat_v1(p_kompaniya_id, p_actor_id, array['hr.pii.write']);
  end if;
  if p_obyektlar is not null and (jsonb_typeof(p_obyektlar) <> 'array' or jsonb_array_length(p_obyektlar) > 200) then
    return jsonb_build_object('ok', false, 'code', 'OBYEKTLAR_0_200');
  end if;
  v_uid := nullif(p_profil->>'foydalanuvchi_id', '')::bigint;
  if v_uid is not null and not exists (select 1 from public.t2_azolik a where a.kompaniya_id = p_kompaniya_id and a.foydalanuvchi_id = v_uid and a.holat = 'faol') then
    return jsonb_build_object('ok', false, 'code', 'FOYDALANUVCHI_AZO_EMAS');
  end if;

  if v_kadr is null then
    if nullif(btrim(coalesce(p_profil->>'ism', '')), '') is null then return jsonb_build_object('ok', false, 'code', 'ISM_KERAK'); end if;
    insert into public.t2_kadr_mustaqil (kompaniya_id, ism_sharif, lavozim, foydalanuvchi_id)
    values (p_kompaniya_id, btrim(p_profil->>'ism'), coalesce(nullif(btrim(coalesce(p_profil->>'lavozim', '')), ''), 'xodim'), v_uid)
    returning id into v_kadr;
  else
    perform 1 from public.t2_kadr_mustaqil where id = v_kadr and kompaniya_id = p_kompaniya_id for update;
    if not found then return jsonb_build_object('ok', false, 'code', 'KADR_NOT_FOUND'); end if;
    update public.t2_kadr_mustaqil set
      ism_sharif = coalesce(nullif(btrim(coalesce(p_profil->>'ism', '')), ''), ism_sharif),
      lavozim = coalesce(nullif(btrim(coalesce(p_profil->>'lavozim', '')), ''), lavozim),
      foydalanuvchi_id = case when p_profil ? 'foydalanuvchi_id' then v_uid else foydalanuvchi_id end
     where id = v_kadr;
  end if;

  select * into v_x from public.t2_hr_xodim where kadr_id = v_kadr for update;
  v_has := found;
  if v_has and p_kutilgan_versiya is not null and v_x.versiya <> p_kutilgan_versiya then
    return jsonb_build_object('ok', false, 'code', 'STALE_VERSION', 'versiya', v_x.versiya);
  end if;
  v_rol := coalesce(nullif(p_profil->>'rol', ''), case when v_has then v_x.rol else 'ishchi' end);
  v_graf := coalesce(nullif(p_profil->>'grafik', '')::smallint, case when v_has then v_x.grafik else 5::smallint end);
  v_bt := coalesce(nullif(p_profil->>'baza_turi', ''), case when v_has then v_x.baza_turi else 'oylik' end);
  v_bs := case when p_profil ? 'baza_summa' then nullif(p_profil->>'baza_summa', '')::numeric when v_has then v_x.baza_summa else null end;
  v_sx := case when p_profil ? 'sxema_id' then nullif(p_profil->>'sxema_id', '')::bigint when v_has then v_x.sxema_id else null end;
  if v_sx is not null and not exists (select 1 from public.t2_hr_sxema s where s.id = v_sx and s.kompaniya_id = p_kompaniya_id) then
    return jsonb_build_object('ok', false, 'code', 'SXEMA_NOT_FOUND');
  end if;
  insert into public.t2_hr_xodim (kadr_id, kompaniya_id, rol, grafik, baza_turi, baza_summa, sxema_id, qabul_sana, bosh_sana, kim)
  values (v_kadr, p_kompaniya_id, v_rol, v_graf, v_bt, v_bs, v_sx,
    case when p_profil ? 'qabul_sana' then nullif(p_profil->>'qabul_sana', '')::date when v_has then v_x.qabul_sana end,
    case when p_profil ? 'bosh_sana' then nullif(p_profil->>'bosh_sana', '')::date when v_has then v_x.bosh_sana end,
    'actor:' || p_actor_id)
  on conflict (kadr_id) do update set rol = excluded.rol, grafik = excluded.grafik, baza_turi = excluded.baza_turi, baza_summa = excluded.baza_summa,
    sxema_id = excluded.sxema_id, qabul_sana = excluded.qabul_sana, bosh_sana = excluded.bosh_sana,
    versiya = public.t2_hr_xodim.versiya + 1, yangilandi = now(), kim = excluded.kim
  returning versiya into v_ver;

  if p_pii is not null then
    insert into public.t2_hr_xodim_pii (kadr_id, pinfl, pasport, telefon, manzil, kim)
    values (v_kadr, nullif(btrim(coalesce(p_pii->>'pinfl', '')), ''), nullif(btrim(coalesce(p_pii->>'pasport', '')), ''),
            nullif(btrim(coalesce(p_pii->>'telefon', '')), ''), nullif(btrim(coalesce(p_pii->>'manzil', '')), ''), 'actor:' || p_actor_id)
    on conflict (kadr_id) do update set
      pinfl = case when p_pii ? 'pinfl' then excluded.pinfl else public.t2_hr_xodim_pii.pinfl end,
      pasport = case when p_pii ? 'pasport' then excluded.pasport else public.t2_hr_xodim_pii.pasport end,
      telefon = case when p_pii ? 'telefon' then excluded.telefon else public.t2_hr_xodim_pii.telefon end,
      manzil = case when p_pii ? 'manzil' then excluded.manzil else public.t2_hr_xodim_pii.manzil end,
      versiya = public.t2_hr_xodim_pii.versiya + 1, yangilandi = now(), kim = excluded.kim;
  end if;

  if p_obyektlar is not null then
    for v_e in select value from jsonb_array_elements(p_obyektlar) loop
      v_oid := nullif(v_e->>'obyekt_id', '')::bigint;
      if v_oid is null or not exists (select 1 from public.t2_obyekt o where o.id = v_oid and o.kompaniya_id = p_kompaniya_id) then
        raise exception 'OBYEKT_NOT_FOUND: %', coalesce(v_oid::text, 'null');
      end if;
      v_ul := coalesce(nullif(v_e->>'ulush_foiz', '')::numeric, 100);
      if v_ul <= 0 or v_ul > 100 then raise exception 'ULUSH_INVALID: %', v_ul; end if;
      v_ids := v_ids || v_oid;
      update public.t2_kadr_bog set holat = 'faol', ulush_foiz = v_ul, rol = nullif(btrim(coalesce(v_e->>'rol', '')), ''),
             dan = nullif(v_e->>'dan', '')::date, gacha = nullif(v_e->>'gacha', '')::date
       where kadr_id = v_kadr and obyekt_id = v_oid;
      if not found then
        insert into public.t2_kadr_bog (kadr_id, obyekt_id, holat, ulush_foiz, rol, dan, gacha)
        values (v_kadr, v_oid, 'faol', v_ul, nullif(btrim(coalesce(v_e->>'rol', '')), ''), nullif(v_e->>'dan', '')::date, nullif(v_e->>'gacha', '')::date);
      end if;
      v_n := v_n + 1;
    end loop;
    update public.t2_kadr_bog set holat = 'bekor' where kadr_id = v_kadr and holat = 'faol' and not (obyekt_id = any(v_ids));
  end if;

  perform public.t2_audit_yoz(p_kompaniya_id, 'hr_xodim_saqla', 'hr', null,
    format('kadr=%s pii=%s obyekt=%s', v_kadr, (p_pii is not null), v_n), 'actor:' || p_actor_id, null);
  return public._t2_hr_log_v1(p_operation_id, p_actor_id, 'hr_xodim_saqla_v1',
    jsonb_build_object('ok', true, 'kadr_id', v_kadr, 'versiya', v_ver, 'obyekt_soni', v_n));
end $$;

create or replace function public.t2_hr_sxema_saqla_v1(p_actor_id bigint, p_kompaniya_id bigint, p_sxema jsonb, p_sozlama jsonb, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_prev jsonb; v_id bigint; v_nom text; v_s public.t2_hr_sxema%rowtype; v_res jsonb;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select natija into v_prev from public.t2_onboarding_command_log where operation_id = p_operation_id;
  if found then return v_prev; end if;
  perform public._t2_hr_ruxsat_v1(p_kompaniya_id, p_actor_id, array['payroll.write']);
  v_res := jsonb_build_object('ok', true);
  if p_sxema is not null then
    if jsonb_typeof(p_sxema) <> 'object' then return jsonb_build_object('ok', false, 'code', 'SXEMA_INVALID'); end if;
    v_id := nullif(p_sxema->>'id', '')::bigint;
    v_nom := nullif(btrim(coalesce(p_sxema->>'nom', '')), '');
    if v_id is null then
      if v_nom is null then return jsonb_build_object('ok', false, 'code', 'NOM_KERAK'); end if;
      insert into public.t2_hr_sxema (kompaniya_id, nom, f2_foiz, f2_baza, f2_rejim, izoh, faol, kim)
      values (p_kompaniya_id, v_nom, nullif(p_sxema->>'f2_foiz', '')::numeric, coalesce(nullif(p_sxema->>'f2_baza', ''), 'ustamasiz'),
              coalesce(nullif(p_sxema->>'f2_rejim', ''), 'obyekt'), nullif(btrim(coalesce(p_sxema->>'izoh', '')), ''),
              coalesce((p_sxema->>'faol')::boolean, true), 'actor:' || p_actor_id) returning id into v_id;
    else
      select * into v_s from public.t2_hr_sxema where id = v_id and kompaniya_id = p_kompaniya_id for update;
      if not found then return jsonb_build_object('ok', false, 'code', 'SXEMA_NOT_FOUND'); end if;
      update public.t2_hr_sxema set nom = coalesce(v_nom, nom),
        f2_foiz = case when p_sxema ? 'f2_foiz' then nullif(p_sxema->>'f2_foiz', '')::numeric else f2_foiz end,
        f2_baza = coalesce(nullif(p_sxema->>'f2_baza', ''), f2_baza), f2_rejim = coalesce(nullif(p_sxema->>'f2_rejim', ''), f2_rejim),
        izoh = case when p_sxema ? 'izoh' then nullif(btrim(coalesce(p_sxema->>'izoh', '')), '') else izoh end,
        faol = coalesce((p_sxema->>'faol')::boolean, faol), versiya = versiya + 1, yangilandi = now(), kim = 'actor:' || p_actor_id
       where id = v_id;
    end if;
    v_res := v_res || jsonb_build_object('sxema_id', v_id);
  end if;
  if p_sozlama is not null then
    if jsonb_typeof(p_sozlama) <> 'object' then return jsonb_build_object('ok', false, 'code', 'SOZLAMA_INVALID'); end if;
    insert into public.t2_hr_sozlama (kompaniya_id, ndfl_foiz, inps_foiz, kun_soat, kim)
    values (p_kompaniya_id, nullif(p_sozlama->>'ndfl_foiz', '')::numeric, nullif(p_sozlama->>'inps_foiz', '')::numeric,
            coalesce(nullif(p_sozlama->>'kun_soat', '')::numeric, 8), 'actor:' || p_actor_id)
    on conflict (kompaniya_id) do update set
      ndfl_foiz = case when p_sozlama ? 'ndfl_foiz' then excluded.ndfl_foiz else public.t2_hr_sozlama.ndfl_foiz end,
      inps_foiz = case when p_sozlama ? 'inps_foiz' then excluded.inps_foiz else public.t2_hr_sozlama.inps_foiz end,
      kun_soat = case when p_sozlama ? 'kun_soat' then excluded.kun_soat else public.t2_hr_sozlama.kun_soat end,
      versiya = public.t2_hr_sozlama.versiya + 1, yangilandi = now(), kim = excluded.kim;
  end if;
  perform public.t2_audit_yoz(p_kompaniya_id, 'hr_sxema_saqla', 'hr', null,
    format('sxema=%s sozlama=%s', coalesce(v_id::text, '-'), (p_sozlama is not null)), 'actor:' || p_actor_id, null);
  return public._t2_hr_log_v1(p_operation_id, p_actor_id, 'hr_sxema_saqla_v1', v_res);
end $$;

create or replace function public.t2_hr_kalendar_saqla_v1(p_actor_id bigint, p_kompaniya_id bigint, p_kunlar jsonb, p_tatillar jsonb, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_prev jsonb; v_e jsonb; v_tur text; v_sana date; v_id bigint; v_kadr bigint; v_nk int := 0; v_nt int := 0; v_dan date; v_gacha date;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select natija into v_prev from public.t2_onboarding_command_log where operation_id = p_operation_id;
  if found then return v_prev; end if;
  perform public._t2_hr_ruxsat_v1(p_kompaniya_id, p_actor_id, array['hr.write']);
  if (p_kunlar is not null and (jsonb_typeof(p_kunlar) <> 'array' or jsonb_array_length(p_kunlar) > 400))
     or (p_tatillar is not null and (jsonb_typeof(p_tatillar) <> 'array' or jsonb_array_length(p_tatillar) > 200)) then
    return jsonb_build_object('ok', false, 'code', 'QATORLAR_LIMIT');
  end if;
  for v_e in select value from jsonb_array_elements(coalesce(p_kunlar, '[]'::jsonb)) loop
    v_sana := (v_e->>'sana')::date; v_tur := nullif(v_e->>'tur', '');
    if v_tur is null then
      delete from public.t2_hr_kalendar where kompaniya_id = p_kompaniya_id and sana = v_sana;
    else
      if v_tur not in ('bayram', 'dam', 'ish') then raise exception 'KUN_TUR_INVALID: %', v_tur; end if;
      insert into public.t2_hr_kalendar (kompaniya_id, sana, tur, nom) values (p_kompaniya_id, v_sana, v_tur, nullif(btrim(coalesce(v_e->>'nom', '')), ''))
      on conflict (kompaniya_id, sana) do update set tur = excluded.tur, nom = excluded.nom, yangilandi = now();
    end if;
    v_nk := v_nk + 1;
  end loop;
  for v_e in select value from jsonb_array_elements(coalesce(p_tatillar, '[]'::jsonb)) loop
    v_kadr := (v_e->>'kadr_id')::bigint; v_id := nullif(v_e->>'id', '')::bigint;
    v_dan := (v_e->>'dan')::date; v_gacha := (v_e->>'gacha')::date;
    if not exists (select 1 from public.t2_kadr_mustaqil k where k.id = v_kadr and k.kompaniya_id = p_kompaniya_id) then raise exception 'KADR_NOT_FOUND: %', v_kadr; end if;
    v_tur := v_e->>'tur';
    if v_tur not in ('otpusk', 'otgul', 'kasal') then raise exception 'TATIL_TUR_INVALID: %', v_tur; end if;
    if v_gacha < v_dan then raise exception 'TATIL_SANA_INVALID'; end if;
    if v_id is null then
      insert into public.t2_hr_tatil (kompaniya_id, kadr_id, tur, dan, gacha, holat, izoh, kim)
      values (p_kompaniya_id, v_kadr, v_tur, v_dan, v_gacha, coalesce(nullif(v_e->>'holat', ''), 'reja'), nullif(btrim(coalesce(v_e->>'izoh', '')), ''), 'actor:' || p_actor_id);
    else
      update public.t2_hr_tatil set kadr_id = v_kadr, tur = v_tur, dan = v_dan, gacha = v_gacha, holat = coalesce(nullif(v_e->>'holat', ''), holat),
             izoh = nullif(btrim(coalesce(v_e->>'izoh', '')), ''), versiya = versiya + 1, yangilandi = now(), kim = 'actor:' || p_actor_id
       where id = v_id and kompaniya_id = p_kompaniya_id;
      if not found then raise exception 'TATIL_NOT_FOUND: %', v_id; end if;
    end if;
    v_nt := v_nt + 1;
  end loop;
  perform public.t2_audit_yoz(p_kompaniya_id, 'hr_kalendar_saqla', 'hr', null, format('kun=%s tatil=%s', v_nk, v_nt), 'actor:' || p_actor_id, null);
  return public._t2_hr_log_v1(p_operation_id, p_actor_id, 'hr_kalendar_saqla_v1', jsonb_build_object('ok', true, 'kun_soni', v_nk, 'tatil_soni', v_nt));
end $$;

create or replace function public.t2_hr_tabel_saqla_v1(p_actor_id bigint, p_kompaniya_id bigint, p_oy text, p_qatorlar jsonb, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_prev jsonb; v_oy date; v_kun int; v_e jsonb; v_kadr bigint; v_kunlar jsonb; v_holat text; v_can_hr boolean; v_old public.t2_hr_tabel%rowtype;
  v_n int := 0; v_kalit text; v_val text; v_yopiq bigint[] := array[]::bigint[];
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select natija into v_prev from public.t2_onboarding_command_log where operation_id = p_operation_id;
  if found then return v_prev; end if;
  perform public._t2_hr_ruxsat_v1(p_kompaniya_id, p_actor_id, array['hr.tabel.write', 'hr.write']);
  v_can_hr := public.t2_permission_allowed_v2(p_kompaniya_id, p_actor_id, 'hr.write');
  v_oy := public._t2_hr_oy_v1(p_oy);
  v_kun := extract(day from (v_oy + interval '1 month' - interval '1 day'))::int;
  if p_qatorlar is null or jsonb_typeof(p_qatorlar) <> 'array' or jsonb_array_length(p_qatorlar) > 500 then
    return jsonb_build_object('ok', false, 'code', 'QATORLAR_0_500');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('t2_hr_tabel:' || p_kompaniya_id || ':' || p_oy, 0));
  for v_e in select value from jsonb_array_elements(p_qatorlar) loop
    v_kadr := (v_e->>'kadr_id')::bigint; v_kunlar := coalesce(v_e->'kunlar', '{}'::jsonb);
    if not exists (select 1 from public.t2_kadr_mustaqil k where k.id = v_kadr and k.kompaniya_id = p_kompaniya_id) then raise exception 'KADR_NOT_FOUND: %', v_kadr; end if;
    if jsonb_typeof(v_kunlar) <> 'object' then raise exception 'KUNLAR_INVALID'; end if;
    for v_kalit, v_val in select key, value from jsonb_each_text(v_kunlar) loop
      if v_kalit !~ '^\d{1,2}$' or v_kalit::int < 1 or v_kalit::int > v_kun or v_val not in ('K', 'N', 'O', 'B', 'D') then
        raise exception 'KUN_INVALID: % = %', v_kalit, v_val;
      end if;
    end loop;
    if exists (select 1 from public.t2_hr_oylik y where y.kadr_id = v_kadr and y.oy = v_oy and y.holat = 'tasdiqlangan') then
      v_yopiq := v_yopiq || v_kadr; continue;
    end if;
    v_holat := coalesce(nullif(v_e->>'holat', ''), 'qoralama');
    if v_holat not in ('qoralama', 'tasdiqlangan') then raise exception 'TABEL_HOLAT_INVALID: %', v_holat; end if;
    select * into v_old from public.t2_hr_tabel where kadr_id = v_kadr and oy = v_oy for update;
    if (v_holat = 'tasdiqlangan' or (found and v_old.holat = 'tasdiqlangan')) and not v_can_hr then
      raise exception 'PERMISSION_DENIED: tabel tasdiqlash/tasdiqlangan tabelni o''zgartirish hr.write talab qiladi' using errcode = '42501';
    end if;
    insert into public.t2_hr_tabel (kadr_id, oy, kompaniya_id, kunlar, holat, kim)
    values (v_kadr, v_oy, p_kompaniya_id, v_kunlar, v_holat, 'actor:' || p_actor_id)
    on conflict (kadr_id, oy) do update set kunlar = excluded.kunlar, holat = excluded.holat, versiya = public.t2_hr_tabel.versiya + 1,
      yangilandi = now(), kim = excluded.kim;
    v_n := v_n + 1;
  end loop;
  perform public.t2_audit_yoz(p_kompaniya_id, 'hr_tabel_saqla', 'hr', null, format('oy=%s qator=%s yopiq=%s', p_oy, v_n, coalesce(array_length(v_yopiq, 1), 0)), 'actor:' || p_actor_id, null);
  return public._t2_hr_log_v1(p_operation_id, p_actor_id, 'hr_tabel_saqla_v1',
    jsonb_build_object('ok', true, 'saqlandi', v_n, 'yopiq_kadrlar', to_jsonb(v_yopiq)));
end $$;

create or replace function public.t2_hr_tuzatma_saqla_v1(p_actor_id bigint, p_kompaniya_id bigint, p_tuzatma jsonb, p_kutilgan_versiya integer, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_prev jsonb; v_id bigint; v_t public.t2_hr_tuzatma%rowtype; v_oy date; v_kadr bigint; v_tur text; v_sabab text; v_summa numeric; v_foiz numeric;
  v_ob bigint; v_akt bigint; v_sifat bigint; v_can_pay boolean; v_can_hr boolean;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select natija into v_prev from public.t2_onboarding_command_log where operation_id = p_operation_id;
  if found then return v_prev; end if;
  perform public._t2_hr_ruxsat_v1(p_kompaniya_id, p_actor_id, array['hr.tabel.write', 'hr.write']);
  v_can_hr := public.t2_permission_allowed_v2(p_kompaniya_id, p_actor_id, 'hr.write');
  v_can_pay := public.t2_permission_allowed_v2(p_kompaniya_id, p_actor_id, 'payroll.write');
  if p_tuzatma is null or jsonb_typeof(p_tuzatma) <> 'object' then return jsonb_build_object('ok', false, 'code', 'TUZATMA_INVALID'); end if;
  v_id := nullif(p_tuzatma->>'id', '')::bigint;

  if v_id is not null and coalesce((p_tuzatma->>'bekor')::boolean, false) then
    select * into v_t from public.t2_hr_tuzatma where id = v_id and kompaniya_id = p_kompaniya_id for update;
    if not found then return jsonb_build_object('ok', false, 'code', 'TUZATMA_NOT_FOUND'); end if;
    if p_kutilgan_versiya is not null and v_t.versiya <> p_kutilgan_versiya then return jsonb_build_object('ok', false, 'code', 'STALE_VERSION', 'versiya', v_t.versiya); end if;
    if v_t.holat = 'bekor' then return jsonb_build_object('ok', true, 'id', v_id, 'holat', 'bekor'); end if;
    if v_t.holat <> 'qoralama' and not v_can_pay then
      raise exception 'PERMISSION_DENIED: tasdiqlangan yozuvni bekor qilish payroll.write talab qiladi' using errcode = '42501';
    end if;
    if v_t.holat = 'qoralama' and v_t.yaratgan is distinct from p_actor_id and not v_can_hr then
      raise exception 'PERMISSION_DENIED: boshqa odam yozuvini bekor qilish hr.write talab qiladi' using errcode = '42501';
    end if;
    if exists (select 1 from public.t2_hr_oylik y where y.kadr_id = v_t.kadr_id and y.oy = v_t.oy and y.holat = 'tasdiqlangan') then
      return jsonb_build_object('ok', false, 'code', 'ISH_HAQI_TASDIQLANGAN');
    end if;
    update public.t2_hr_tuzatma set holat = 'bekor', versiya = versiya + 1, yangilandi = now() where id = v_id;
    perform public.t2_audit_yoz(p_kompaniya_id, 'hr_tuzatma_bekor', 'hr', v_t.obyekt_id, format('id=%s', v_id), 'actor:' || p_actor_id, null);
    return public._t2_hr_log_v1(p_operation_id, p_actor_id, 'hr_tuzatma_saqla_v1', jsonb_build_object('ok', true, 'id', v_id, 'holat', 'bekor'));
  end if;

  v_oy := public._t2_hr_oy_v1(p_tuzatma->>'oy'); v_kadr := (p_tuzatma->>'kadr_id')::bigint;
  v_tur := p_tuzatma->>'tur'; v_sabab := coalesce(nullif(p_tuzatma->>'sabab', ''), 'boshqa');
  v_summa := nullif(p_tuzatma->>'summa', '')::numeric; v_foiz := nullif(p_tuzatma->>'foiz', '')::numeric;
  v_ob := nullif(p_tuzatma->>'obyekt_id', '')::bigint; v_akt := nullif(p_tuzatma->>'akt_id', '')::bigint; v_sifat := nullif(p_tuzatma->>'sifat_id', '')::bigint;
  if v_tur is null or v_tur not in ('jarima', 'bonus') then return jsonb_build_object('ok', false, 'code', 'TUR_INVALID'); end if;
  if (v_summa is null) = (v_foiz is null) then return jsonb_build_object('ok', false, 'code', 'SUMMA_YOKI_FOIZ'); end if;
  if v_tur = 'jarima' and nullif(btrim(coalesce(p_tuzatma->>'izoh', '')), '') is null then return jsonb_build_object('ok', false, 'code', 'SABAB_IZOH_KERAK'); end if;
  if not exists (select 1 from public.t2_kadr_mustaqil k where k.id = v_kadr and k.kompaniya_id = p_kompaniya_id) then return jsonb_build_object('ok', false, 'code', 'KADR_NOT_FOUND'); end if;
  if v_ob is not null and not exists (select 1 from public.t2_obyekt o where o.id = v_ob and o.kompaniya_id = p_kompaniya_id) then return jsonb_build_object('ok', false, 'code', 'OBYEKT_NOT_FOUND'); end if;
  if v_akt is not null and not exists (select 1 from public.t2_akt a where a.id = v_akt and a.kompaniya_id = p_kompaniya_id) then return jsonb_build_object('ok', false, 'code', 'AKT_NOT_FOUND'); end if;
  if v_sifat is not null and not exists (select 1 from public.t2_erp_sifat s where s.id = v_sifat and s.kompaniya_id = p_kompaniya_id) then return jsonb_build_object('ok', false, 'code', 'SIFAT_NOT_FOUND'); end if;
  if exists (select 1 from public.t2_hr_oylik y where y.kadr_id = v_kadr and y.oy = v_oy and y.holat = 'tasdiqlangan') then
    return jsonb_build_object('ok', false, 'code', 'ISH_HAQI_TASDIQLANGAN');
  end if;

  if v_id is null then
    insert into public.t2_hr_tuzatma (kompaniya_id, kadr_id, oy, tur, sabab, izoh, summa, foiz, obyekt_id, akt_id, sifat_id, fayl_id, yaratgan, operation_id)
    values (p_kompaniya_id, v_kadr, v_oy, v_tur, v_sabab, nullif(btrim(coalesce(p_tuzatma->>'izoh', '')), ''), v_summa, v_foiz, v_ob, v_akt, v_sifat,
            nullif(btrim(coalesce(p_tuzatma->>'fayl_id', '')), ''), p_actor_id, p_operation_id) returning id into v_id;
  else
    select * into v_t from public.t2_hr_tuzatma where id = v_id and kompaniya_id = p_kompaniya_id for update;
    if not found then return jsonb_build_object('ok', false, 'code', 'TUZATMA_NOT_FOUND'); end if;
    if p_kutilgan_versiya is not null and v_t.versiya <> p_kutilgan_versiya then return jsonb_build_object('ok', false, 'code', 'STALE_VERSION', 'versiya', v_t.versiya); end if;
    if v_t.holat <> 'qoralama' then return jsonb_build_object('ok', false, 'code', 'FAQAT_QORALAMA_TAHRIR'); end if;
    if v_t.yaratgan is distinct from p_actor_id and not v_can_hr then
      raise exception 'PERMISSION_DENIED: boshqa odam yozuvini tahrirlash hr.write talab qiladi' using errcode = '42501';
    end if;
    update public.t2_hr_tuzatma set kadr_id = v_kadr, oy = v_oy, tur = v_tur, sabab = v_sabab, izoh = nullif(btrim(coalesce(p_tuzatma->>'izoh', '')), ''),
      summa = v_summa, foiz = v_foiz, obyekt_id = v_ob, akt_id = v_akt, sifat_id = v_sifat, fayl_id = nullif(btrim(coalesce(p_tuzatma->>'fayl_id', '')), ''),
      versiya = versiya + 1, yangilandi = now() where id = v_id;
  end if;
  perform public.t2_audit_yoz(p_kompaniya_id, 'hr_tuzatma_saqla', 'hr', v_ob, format('id=%s tur=%s kadr=%s', v_id, v_tur, v_kadr), 'actor:' || p_actor_id, null);
  return public._t2_hr_log_v1(p_operation_id, p_actor_id, 'hr_tuzatma_saqla_v1', jsonb_build_object('ok', true, 'id', v_id, 'holat', 'qoralama'));
end $$;

create or replace function public.t2_hr_tuzatma_qaror_v1(p_actor_id bigint, p_kompaniya_id bigint, p_id bigint, p_qaror text, p_izoh text,
  p_kutilgan_versiya integer, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_prev jsonb; v_t public.t2_hr_tuzatma%rowtype; v_rol text;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select natija into v_prev from public.t2_onboarding_command_log where operation_id = p_operation_id;
  if found then return v_prev; end if;
  v_rol := public._t2_hr_ruxsat_v1(p_kompaniya_id, p_actor_id, array['payroll.write']);
  if p_qaror is null or p_qaror not in ('tasdiqlangan', 'rad') then return jsonb_build_object('ok', false, 'code', 'QAROR_INVALID'); end if;
  select * into v_t from public.t2_hr_tuzatma where id = p_id and kompaniya_id = p_kompaniya_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'TUZATMA_NOT_FOUND'); end if;
  if p_kutilgan_versiya is not null and v_t.versiya <> p_kutilgan_versiya then return jsonb_build_object('ok', false, 'code', 'STALE_VERSION', 'versiya', v_t.versiya); end if;
  if v_t.holat <> 'qoralama' then return jsonb_build_object('ok', false, 'code', 'QORALAMA_EMAS', 'holat', v_t.holat); end if;
  if v_t.yaratgan = p_actor_id and coalesce(v_rol, '') not in ('admin', 'superadmin', 'boss') then
    return jsonb_build_object('ok', false, 'code', 'OZ_YOZUVINI_TASDIQLAMAYDI');
  end if;
  if exists (select 1 from public.t2_hr_oylik y where y.kadr_id = v_t.kadr_id and y.oy = v_t.oy and y.holat = 'tasdiqlangan') then
    return jsonb_build_object('ok', false, 'code', 'ISH_HAQI_TASDIQLANGAN');
  end if;
  update public.t2_hr_tuzatma set holat = p_qaror, qaror_kim = p_actor_id, qaror_vaqt = now(), qaror_izoh = nullif(btrim(coalesce(p_izoh, '')), ''),
         versiya = versiya + 1, yangilandi = now() where id = p_id;
  perform public.t2_audit_yoz(p_kompaniya_id, 'hr_tuzatma_qaror', 'hr', v_t.obyekt_id, format('id=%s qaror=%s', p_id, p_qaror), 'actor:' || p_actor_id, null);
  return public._t2_hr_log_v1(p_operation_id, p_actor_id, 'hr_tuzatma_qaror_v1', jsonb_build_object('ok', true, 'id', p_id, 'holat', p_qaror));
end $$;

create or replace function public.t2_hr_oylik_hisobla_v1(p_actor_id bigint, p_kompaniya_id bigint, p_oy text, p_amal text, p_kadr_ids jsonb, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_prev jsonb; v_oy date; v_ids bigint[]; v_rows jsonb; v_e jsonb; v_old public.t2_hr_oylik%rowtype; v_n int := 0; v_skip int := 0;
  v_rad jsonb := '[]'::jsonb; v_kid bigint;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select natija into v_prev from public.t2_onboarding_command_log where operation_id = p_operation_id;
  if found then return v_prev; end if;
  perform public._t2_hr_ruxsat_v1(p_kompaniya_id, p_actor_id, array['payroll.write']);
  v_oy := public._t2_hr_oy_v1(p_oy);
  if p_amal is null or p_amal not in ('hisobla', 'tasdiqla', 'qaytar') then return jsonb_build_object('ok', false, 'code', 'AMAL_INVALID'); end if;
  if p_kadr_ids is not null then
    if jsonb_typeof(p_kadr_ids) <> 'array' or jsonb_array_length(p_kadr_ids) > 1000 then return jsonb_build_object('ok', false, 'code', 'KADR_IDS_INVALID'); end if;
    select coalesce(array_agg((e)::bigint), array[]::bigint[]) into v_ids from jsonb_array_elements_text(p_kadr_ids) e;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('t2_hr_oylik:' || p_kompaniya_id || ':' || p_oy, 0));

  if p_amal = 'qaytar' then
    for v_old in select * from public.t2_hr_oylik y where y.kompaniya_id = p_kompaniya_id and y.oy = v_oy and y.holat = 'tasdiqlangan'
                    and (v_ids is null or y.kadr_id = any(v_ids)) for update loop
      if v_old.provodka_holat <> 'yoq' then
        v_rad := v_rad || jsonb_build_object('kadr_id', v_old.kadr_id, 'sabab', 'PROVODKA_YOZILGAN');
      else
        update public.t2_hr_oylik set holat = 'qoralama', versiya = versiya + 1, kim = 'actor:' || p_actor_id where id = v_old.id;
        v_n := v_n + 1;
      end if;
    end loop;
  else
    v_rows := public._t2_hr_hisob_v1(p_kompaniya_id, v_oy, v_ids);
    for v_e in select value from jsonb_array_elements(v_rows) loop
      v_kid := (v_e->>'kadr_id')::bigint;
      select * into v_old from public.t2_hr_oylik where kadr_id = v_kid and oy = v_oy for update;
      if found and v_old.holat = 'tasdiqlangan' then v_skip := v_skip + 1; continue; end if;
      if p_amal = 'tasdiqla' and not (v_e->>'toliq')::boolean then
        v_rad := v_rad || jsonb_build_object('kadr_id', v_kid, 'sabab', 'TOLIQ_EMAS', 'ogohlantirish', v_e->'ogohlantirish');
        continue;
      end if;
      insert into public.t2_hr_oylik (kompaniya_id, kadr_id, oy, holat, norma_kun, kun_ishlagan, baza, kpi_f2, bonus, jarima, hisoblangan, ndfl, inps, sof, toliq, tafsilot, kim)
      values (p_kompaniya_id, v_kid, v_oy, case when p_amal = 'tasdiqla' then 'tasdiqlangan' else 'qoralama' end,
              nullif(v_e->>'norma_kun', '')::int, nullif(v_e->>'kun_ishlagan', '')::int, nullif(v_e->>'baza', '')::numeric, nullif(v_e->>'kpi_f2', '')::numeric,
              nullif(v_e->>'bonus', '')::numeric, nullif(v_e->>'jarima', '')::numeric, nullif(v_e->>'hisoblangan', '')::numeric,
              nullif(v_e->>'ndfl', '')::numeric, nullif(v_e->>'inps', '')::numeric, nullif(v_e->>'sof', '')::numeric,
              (v_e->>'toliq')::boolean, v_e, 'actor:' || p_actor_id)
      on conflict (kadr_id, oy) do update set holat = excluded.holat, norma_kun = excluded.norma_kun, kun_ishlagan = excluded.kun_ishlagan,
        baza = excluded.baza, kpi_f2 = excluded.kpi_f2, bonus = excluded.bonus, jarima = excluded.jarima, hisoblangan = excluded.hisoblangan,
        ndfl = excluded.ndfl, inps = excluded.inps, sof = excluded.sof, toliq = excluded.toliq, tafsilot = excluded.tafsilot,
        versiya = public.t2_hr_oylik.versiya + 1, hisoblangan_vaqt = now(), kim = excluded.kim;
      v_n := v_n + 1;
    end loop;
  end if;
  perform public.t2_audit_yoz(p_kompaniya_id, 'hr_oylik_' || p_amal, 'hr', null, format('oy=%s qator=%s otkazildi=%s', p_oy, v_n, v_skip), 'actor:' || p_actor_id, null);
  return public._t2_hr_log_v1(p_operation_id, p_actor_id, 'hr_oylik_hisobla_v1',
    jsonb_build_object('ok', true, 'amal', p_amal, 'qator_soni', v_n, 'otkazildi', v_skip, 'rad_etilgan', v_rad));
end $$;

do $grants$
declare f text;
begin
  foreach f in array array[
    'public._t2_hr_ruxsat_v1(bigint, bigint, text[])', 'public._t2_hr_oy_v1(text)', 'public._t2_hr_log_v1(uuid, bigint, text, jsonb)',
    'public._t2_hr_kunlar_v1(bigint, date)', 'public._t2_hr_hisob_v1(bigint, date, bigint[])',
    'public.t2_hr_xodimlar_v1(bigint, bigint)', 'public.t2_hr_oy_v1(bigint, bigint, text)', 'public.t2_hr_kpi_v1(bigint, bigint, text)',
    'public.t2_hr_oylik_buxgalteriya_v1(bigint, bigint, text)',
    'public.t2_hr_xodim_saqla_v1(bigint, bigint, bigint, jsonb, jsonb, jsonb, integer, uuid)',
    'public.t2_hr_sxema_saqla_v1(bigint, bigint, jsonb, jsonb, uuid)',
    'public.t2_hr_kalendar_saqla_v1(bigint, bigint, jsonb, jsonb, uuid)',
    'public.t2_hr_tabel_saqla_v1(bigint, bigint, text, jsonb, uuid)',
    'public.t2_hr_tuzatma_saqla_v1(bigint, bigint, jsonb, integer, uuid)',
    'public.t2_hr_tuzatma_qaror_v1(bigint, bigint, bigint, text, text, integer, uuid)',
    'public.t2_hr_oylik_hisobla_v1(bigint, bigint, text, text, jsonb, uuid)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $grants$;

commit;
