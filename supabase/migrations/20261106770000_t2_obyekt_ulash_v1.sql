-- T5 «Telegram modeli» (egasi 2026-10-22): obyektni bitta havola bilan tashqi odamga/kompaniyaga ULASHISH.
-- Mavjud «Tomonlar» poydevori ustida: yangi aloqa turi `obyekt:<id>`, taklif kodi (shlyuzda yaratiladi, bazada xesh)
-- va KUTILGAN grantlar. Kod qabul qilinganda grantlar o'sha zahoti faollashadi — qabul qiluvchi obyektni
-- Zakazchik kabinetida ko'radi. Har odamning shaxsiy ish joyi bor (T1), shuning uchun «odamga ulashish» = uning
-- ish joyiga grant. Ko'rinish faqat sanab o'tilgan resurslar (obyekt holati, shartnoma xulosasi, tasdiqlangan F2).
-- To'xtatish — mavjud `t2_tomon_holat_v1` (bekor / yopish) barcha grantlarni bekor qiladi.

alter table public.t2_tomon_aloqa add column if not exists kutilgan_grantlar jsonb;

-- Ulashish havolasini yaratadi. Faqat boshqaruvchi rol; obyekt shu kompaniyaniki va faol bo'lishi shart.
create or replace function public.t2_obyekt_ulash_v1(
  p_actor_id bigint, p_kompaniya_id bigint, p_obyekt_id bigint, p_resurslar text[], p_kod_xesh text, p_izoh text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_obyekt public.t2_obyekt; v_res text[]; v_grantlar jsonb; v_id bigint; v_son integer;
begin
  perform public._t2_tomon_azo(p_actor_id, p_kompaniya_id, 'boshqarish');
  select * into v_obyekt from public.t2_obyekt where id = p_obyekt_id and kompaniya_id = p_kompaniya_id and holat = 'faol';
  if not found then return jsonb_build_object('ok', false, 'code', 'OBYEKT_YOQ', 'error', 'Obyekt topilmadi'); end if;
  if p_kod_xesh is null or length(p_kod_xesh) < 32 then return jsonb_build_object('ok', false, 'code', 'KOD_KERAK', 'error', 'Kod kerak'); end if;
  -- Obyekt holati har doim; qolganlari faqat ruxsat etilganlar ichidan.
  select array_agg(distinct x order by x) into v_res
    from unnest(array['obyekt_holat'] || coalesce(p_resurslar, array[]::text[])) x
   where x in ('obyekt_holat', 'shartnoma_xulosa', 'f2');
  select coalesce(jsonb_agg(jsonb_build_object('resurs', r, 'amallar', to_jsonb(array['korish']), 'obyekt_id', p_obyekt_id) order by r), '[]'::jsonb)
    into v_grantlar from unnest(v_res) r;
  -- Spamga qarshi: bir kompaniya bir kunda 50 tadan ortiq ulashish havolasi yaratmaydi.
  select count(*) into v_son from public.t2_tomon_aloqa
   where taklif_kompaniya_id = p_kompaniya_id and turi like 'obyekt:%' and yaratildi > now() - interval '1 day';
  if v_son >= 50 then return jsonb_build_object('ok', false, 'code', 'KOP_SOROV', 'error', 'Bugun juda ko''p havola yaratildi'); end if;
  insert into public.t2_tomon_aloqa (taklif_kompaniya_id, qabul_kompaniya_id, taklif_rol, qabul_rol, turi, nom, kod_xesh, kod_muddati, holat, taklif_actor_id, izoh, kutilgan_grantlar)
  values (p_kompaniya_id, null, 'pudratchi', 'mehmon', 'obyekt:' || p_obyekt_id, left(v_obyekt.nom, 200), p_kod_xesh, now() + interval '7 days', 'taklif', p_actor_id,
          nullif(btrim(coalesce(left(p_izoh, 1000), '')), ''), v_grantlar)
  returning id into v_id;
  perform public._t2_tomon_hodisa_yoz(v_id, null, p_kompaniya_id, p_actor_id, 'taklif', p_izoh, jsonb_build_object('obyekt_id', p_obyekt_id, 'resurslar', to_jsonb(v_res)));
  return jsonb_build_object('ok', true, 'id', v_id, 'holat', 'taklif', 'kod_kerak', true, 'resurslar', to_jsonb(v_res));
end $$;

-- Obyekt ulashlari ro'yxati (egasi tomoni): kutilayotgan havolalar va faol ulashlar.
create or replace function public.t2_obyekt_ulashlar_v1(p_actor_id bigint, p_kompaniya_id bigint, p_obyekt_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v jsonb;
begin
  perform public._t2_tomon_azo(p_actor_id, p_kompaniya_id, 'boshqarish');
  select coalesce(jsonb_agg(jsonb_build_object(
           'aloqa_id', a.id, 'holat', a.holat, 'yaratildi', a.yaratildi, 'kod_muddati', a.kod_muddati,
           'oluvchi', case when c.id is null then null else jsonb_build_object('id', c.id, 'nom', c.nom, 'turi', c.turi) end,
           'qabul_vaqti', a.javob_vaqti,
           'resurslar', coalesce((select jsonb_agg(distinct g.resurs) from public.t2_tomon_grant g where g.aloqa_id = a.id and g.holat = 'faol'),
                                 (select jsonb_agg(e->>'resurs') from jsonb_array_elements(coalesce(a.kutilgan_grantlar, '[]'::jsonb)) e))
         ) order by a.id desc), '[]'::jsonb)
    into v
    from public.t2_tomon_aloqa a
    left join public.t2_kompaniya c on c.id = a.qabul_kompaniya_id
   where a.taklif_kompaniya_id = p_kompaniya_id and a.turi = 'obyekt:' || p_obyekt_id
     and (a.holat = 'faol' or (a.holat = 'taklif' and a.kod_muddati > now()));
  return jsonb_build_object('ok', true, 'ulashlar', v);
end $$;

-- Kod orqali qabul: oldingi xatti-harakat saqlanadi + kutilgan grantlar faollashadi.
create or replace function public.t2_tomon_kod_qabul_v1(p_actor_id bigint, p_kompaniya_id bigint, p_kod_xesh text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare a public.t2_tomon_aloqa; v_xato integer; e jsonb; v_obyekt bigint; v_son integer := 0;
begin
  perform public._t2_tomon_azo(p_actor_id, p_kompaniya_id, 'boshqarish');
  select count(*) into v_xato from public.t2_tomon_hodisa where actor_id = p_actor_id and tur = 'kod_xato' and vaqt > now() - interval '1 hour';
  if v_xato >= 10 then return jsonb_build_object('ok', false, 'code', 'KOP_XATO', 'error', 'Juda ko''p noto''g''ri urinish — bir soatdan keyin qayta urining'); end if;
  select * into a from public.t2_tomon_aloqa
   where kod_xesh = p_kod_xesh and holat = 'taklif' and qabul_kompaniya_id is null and kod_muddati > now() for update;
  if not found or a.taklif_kompaniya_id = p_kompaniya_id then
    perform public._t2_tomon_hodisa_yoz(null, null, p_kompaniya_id, p_actor_id, 'kod_xato', null);
    return jsonb_build_object('ok', false, 'code', 'KOD_NOTOGRI', 'error', 'Kod noto''g''ri yoki muddati o''tgan');
  end if;
  if exists (select 1 from public.t2_tomon_aloqa x
              where x.id <> a.id and x.holat in ('taklif','faol','toxtatilgan') and x.qabul_kompaniya_id is not null
                and least(x.taklif_kompaniya_id, x.qabul_kompaniya_id) = least(a.taklif_kompaniya_id, p_kompaniya_id)
                and greatest(x.taklif_kompaniya_id, x.qabul_kompaniya_id) = greatest(a.taklif_kompaniya_id, p_kompaniya_id)
                and lower(x.turi) = lower(a.turi) and lower(x.taklif_rol) = lower(a.taklif_rol) and lower(x.qabul_rol) = lower(a.qabul_rol)) then
    return jsonb_build_object('ok', false, 'code', 'ALLAQACHON', 'error', 'Bu ish joyida shu aloqa allaqachon bor');
  end if;
  update public.t2_tomon_aloqa
     set qabul_kompaniya_id = p_kompaniya_id, holat = 'faol', javob_actor_id = p_actor_id, javob_vaqti = now(), kod_xesh = null, kod_muddati = null, versiya = versiya + 1, yangilandi = now()
   where id = a.id;
  perform public._t2_tomon_hodisa_yoz(a.id, null, p_kompaniya_id, p_actor_id, 'qabul', 'Taklif kodi orqali qabul qilindi');
  -- Ulashish havolasi: kutilgan grantlar (obyekt hali beruvchiniki va faol bo'lsa).
  for e in select * from jsonb_array_elements(coalesce(a.kutilgan_grantlar, '[]'::jsonb)) loop
    v_obyekt := nullif(e->>'obyekt_id', '')::bigint;
    continue when v_obyekt is null or not exists (select 1 from public.t2_obyekt o where o.id = v_obyekt and o.kompaniya_id = a.taklif_kompaniya_id and o.holat = 'faol');
    continue when not exists (select 1 from public.t2_tomon_resurs r where r.kalit = e->>'resurs' and r.faol and 'korish' = any (r.amallar));
    insert into public.t2_tomon_grant (aloqa_id, beruvchi_kompaniya_id, oluvchi_kompaniya_id, resurs, amallar, obyekt_id, berdi_actor_id)
    values (a.id, a.taklif_kompaniya_id, p_kompaniya_id, e->>'resurs', array['korish'], v_obyekt, a.taklif_actor_id)
    on conflict do nothing;
    v_son := v_son + 1;
  end loop;
  if v_son > 0 then
    update public.t2_tomon_aloqa set kutilgan_grantlar = null where id = a.id;
    perform public._t2_tomon_hodisa_yoz(a.id, null, a.taklif_kompaniya_id, a.taklif_actor_id, 'grant', 'Ulashish havolasi qabul qilindi', jsonb_build_object('grantlar', v_son));
  end if;
  return jsonb_build_object('ok', true, 'id', a.id, 'holat', 'faol', 'ulashish', a.turi like 'obyekt:%', 'nom', a.nom);
end $$;

revoke all on function public.t2_obyekt_ulash_v1(bigint, bigint, bigint, text[], text, text) from public, anon, authenticated;
revoke all on function public.t2_obyekt_ulashlar_v1(bigint, bigint, bigint) from public, anon, authenticated;
revoke all on function public.t2_tomon_kod_qabul_v1(bigint, bigint, text) from public, anon, authenticated;
grant execute on function public.t2_obyekt_ulash_v1(bigint, bigint, bigint, text[], text, text) to service_role;
grant execute on function public.t2_obyekt_ulashlar_v1(bigint, bigint, bigint) to service_role;
grant execute on function public.t2_tomon_kod_qabul_v1(bigint, bigint, text) to service_role;
