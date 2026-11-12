-- YETKAZUVCHI TOMONI: qabul -> sklad + qarz + NARX MANBASI. t2_buyurtma_qabul_yakunla_v1 (20261211100000) kengaytiriladi (create or replace, imzo o'sha).
-- Ikki tuzatish/qo'shimcha:
--  1) QARZ QQS BILAN: t2_qarz_asos.narx/summa "QQS bilan" (20261118000000, qarzdorlik hisobi shunga tayanadi), buyurtma narxi esa NDS siz.
--     Avval qarz qatori NDS siz yozilgan edi -> qarz 12 % kam chiqardi. Endi: narx_qqs = narx * (1 + qqs_foiz/100), qqs_foiz bo'sh bo'lsa 12.
--     (Prodda t2_qarz_asos bo'sh - eski qatorlarni tuzatish kerak emas.)
--  2) NARX MANBASI: g'olib taklif narxi F2 narxlash uchun "xarid narxi" manbasi bo'ladi (egasi: narx = max(smeta, xarid), QQS siz).
--     Mavjud t2_narx_manba (tur 'kp' = tijorat taklifi, nds_siz) + t2_narx_manba_qator; bitta buyurtma = bitta manba (operation_id = md5 'yet_narx_manba:'||id,
--     qayta chaqirish takror yozmaydi). Narxsiz qator kirmaydi (NULL != 0). Hajm: ~1 manba + qatorlari / buyurtma (buyurtma boshiga ~1 KB).
-- Sklad/qarz mantiqi o'zgarmagan (per-qator idempotent). Prodga: AVVAL SQL (acceptance bilan), KEYIN PR merge.
create or replace function public.t2_buyurtma_qabul_yakunla_v1(
  p_actor_id bigint, p_kompaniya_id bigint, p_operation_id uuid, p_buyurtma_id bigint, p_shartnoma_id bigint default null)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $fn$
declare
  v_b public.t2_buyurtma; v_q record; v_ijrochi text; v_sh bigint := null; v_n integer;
  v_h bigint; v_r jsonb; v_yangi_h integer := 0; v_eski_h integer := 0; v_qarz integer := 0; v_qarz_kutilmoqda integer := 0;
  v_narxsiz boolean := false; v_ogoh text[] := '{}'; v_kim text; v_k numeric; v_narx_qqs numeric;
  v_mq jsonb; v_manba jsonb := null;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_KERAK'); end if;
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public._t2_yet_azo(p_actor_id, p_kompaniya_id, 'qabul');
  v_kim := 'actor:' || p_actor_id::text;
  select * into v_b from public.t2_buyurtma where id = p_buyurtma_id and kompaniya_id = p_kompaniya_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'TOPILMADI'); end if;
  if v_b.holat not in ('qabul_qilindi_yakuniy', 'qisman') then
    return jsonb_build_object('ok', false, 'code', 'HOLAT', 'holat', v_b.holat);
  end if;
  if v_b.tur <> 'material' then
    return jsonb_build_object('ok', true, 'otkazildi', 'TUR_MATERIAL_EMAS', 'sklad_soni', 0, 'qarz_soni', 0);
  end if;
  if v_b.obyekt_id is null then return jsonb_build_object('ok', false, 'code', 'OBYEKT_YOQ'); end if;
  if not exists (select 1 from public.t2_obyekt where id = v_b.obyekt_id and kompaniya_id = p_kompaniya_id) then
    return jsonb_build_object('ok', false, 'code', 'OBYEKT_BEGONA');
  end if;
  select nom into v_ijrochi from public.t2_kompaniya where id = v_b.ijrochi_kompaniya_id;
  v_k := 1 + coalesce(v_b.qqs_foiz, 12) / 100;      -- QQS koeffitsiyenti (qarz QQS bilan yoziladi)

  if p_shartnoma_id is not null then
    select id into v_sh from public.t2_shartnoma where id = p_shartnoma_id and kompaniya_id = p_kompaniya_id and asosiy = false and holat = 'faol';
    if v_sh is null then return jsonb_build_object('ok', false, 'code', 'SHARTNOMA_NOTOGRI'); end if;
  elsif v_ijrochi is not null then
    select count(*) into v_n from public.t2_shartnoma
     where kompaniya_id = p_kompaniya_id and asosiy = false and holat = 'faol' and lower(btrim(coalesce(taraf, ''))) = lower(btrim(v_ijrochi));
    if v_n = 1 then
      select id into v_sh from public.t2_shartnoma
       where kompaniya_id = p_kompaniya_id and asosiy = false and holat = 'faol' and lower(btrim(coalesce(taraf, ''))) = lower(btrim(v_ijrochi));
    end if;
  end if;

  for v_q in
    select * from public.t2_buyurtma_qator
     where buyurtma_id = v_b.id and coalesce(qabul_miqdor, 0) > 0 and coalesce(qabul_holat, 'butun') <> 'shikast'
     order by qator_no for update
  loop
    if v_q.narx is null then v_narxsiz := true; end if;
    select id into v_h from public.t2_sklad_harakat where buyurtma_qator_id = v_q.id and holat = 'faol';
    if v_h is not null then
      v_eski_h := v_eski_h + 1;
    else
      v_r := public.t2_skladga_yozish(p_kompaniya_id, 'prixod', v_b.obyekt_id, 'mat', current_date, v_q.nom, v_q.birlik, v_q.qabul_miqdor,
               v_ijrochi, null, null, 'buyurtma #' || v_b.id::text || ' qator #' || v_q.qator_no::text,
               md5('buyurtma_qabul_sklad:' || v_q.id::text)::uuid, 'buyurtma_qabul_v1', v_kim);
      if coalesce(v_r->>'ok', 'false') <> 'true' then raise exception 'SKLAD_YOZISH_RAD: %', v_r::text using errcode = 'P0001'; end if;
      v_h := (v_r->>'harakat_id')::bigint;
      update public.t2_sklad_harakat set narx = v_q.narx, buyurtma_id = v_b.id, buyurtma_qator_id = v_q.id
       where id = v_h and kompaniya_id = p_kompaniya_id and buyurtma_qator_id is null;
      v_yangi_h := v_yangi_h + 1;
    end if;
    if v_sh is null then
      v_qarz_kutilmoqda := v_qarz_kutilmoqda + 1;
    elsif not exists (select 1 from public.t2_qarz_asos where buyurtma_qator_id = v_q.id and holat = 'faol') then
      v_narx_qqs := case when v_q.narx is null then null else round(v_q.narx * v_k, 2) end;     -- QQS bilan birlik narxi
      insert into public.t2_qarz_asos (kompaniya_id, shartnoma_id, tur, hujjat_raqam, sana, nomi, birlik, hajm, narx, summa, sklad_harakat_id, tartib, operation_id, kim, buyurtma_qator_id)
      values (p_kompaniya_id, v_sh, 'yetkazib_berish', 'buyurtma #' || v_b.id::text, current_date, v_q.nom, v_q.birlik, v_q.qabul_miqdor, v_narx_qqs,
              case when v_q.narx is null then null else round(v_q.qabul_miqdor * v_q.narx * v_k, 2) end,
              v_h, v_q.qator_no, md5('buyurtma_qabul_qarz:' || v_q.id::text)::uuid, v_kim, v_q.id);
      v_qarz := v_qarz + 1;
    end if;
  end loop;

  -- NARX MANBASI: g'olib/buyurtma narxlari (QQS siz), bitta buyurtma = bitta manba; takror chaqiruv yangi manba yaratmaydi.
  select coalesce(jsonb_agg(jsonb_build_object('kod', q.resurs_kodi, 'nom', q.nom, 'birlik', q.birlik, 'narx', q.narx) order by q.qator_no), '[]'::jsonb)
    into v_mq from public.t2_buyurtma_qator q where q.buyurtma_id = v_b.id and q.narx is not null;
  if jsonb_array_length(v_mq) > 0 then
    v_manba := public.t2_narx_manba_yoz_v1(p_kompaniya_id,
      jsonb_build_object('tur', 'kp', 'nom', left('Buyurtma #' || v_b.id::text || coalesce(' - ' || v_ijrochi, ''), 200), 'raqam', 'buyurtma #' || v_b.id::text,
                         'sana', current_date::text, 'yetkazuvchi', v_ijrochi, 'nds_holati', 'nds_siz',
                         'izoh', 'Yetkazuvchi taklifi (buyurtma #' || v_b.id::text || '): xarid narxi, QQS siz'),
      v_mq, 'almashtir', null, null, md5('yet_narx_manba:' || v_b.id::text)::uuid, v_kim);
    if coalesce(v_manba->>'ok', 'false') <> 'true' then v_ogoh := array_append(v_ogoh, 'NARX_MANBA_YOZILMADI'::text); end if;
  end if;

  if v_qarz_kutilmoqda > 0 then v_ogoh := array_append(v_ogoh, 'SHARTNOMA_YOQ'::text); end if;
  if v_narxsiz then v_ogoh := array_append(v_ogoh, 'NARX_YOQ'::text); end if;
  perform public.t2_audit_yoz(p_kompaniya_id, 'buyurtma_qabul_yakunla', 'taminot', v_b.obyekt_id,
    'buyurtma #' || v_b.id::text || ': sklad ' || v_yangi_h::text || ' yangi/' || v_eski_h::text || ' mavjud, qarz ' || v_qarz::text, v_kim, null);
  return jsonb_build_object('ok', true, 'takror', (v_yangi_h = 0 and v_qarz = 0), 'sklad_soni', v_yangi_h, 'sklad_mavjud', v_eski_h, 'qarz_soni', v_qarz,
    'qarz_kutilmoqda', v_qarz_kutilmoqda, 'shartnoma_id', v_sh, 'narx_manba_id', case when v_manba is null then null else (v_manba->>'id')::bigint end,
    'ogohlantirish', to_jsonb(v_ogoh));
end $fn$;

revoke all on function public.t2_buyurtma_qabul_yakunla_v1(bigint, bigint, uuid, bigint, bigint) from public, anon, authenticated;
grant execute on function public.t2_buyurtma_qabul_yakunla_v1(bigint, bigint, uuid, bigint, bigint) to service_role;
