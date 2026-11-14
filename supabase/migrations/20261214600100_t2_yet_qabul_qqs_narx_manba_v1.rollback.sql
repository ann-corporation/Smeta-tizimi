-- Rollback: t2_buyurtma_qabul_yakunla_v1 ni 20261211100000 dagi eski ta'rifga qaytaradi (NDS siz qarz, narx manbasi yo'q).
-- Allaqachon yozilgan t2_narx_manba qatorlari (izoh: 'Yetkazuvchi taklifi (buyurtma #...)') qoladi - kerak bo'lsa qo'lda bekor qiling (t2_narx_manba_bekor_v1).
create or replace function public.t2_buyurtma_qabul_yakunla_v1(
  p_actor_id bigint, p_kompaniya_id bigint, p_operation_id uuid, p_buyurtma_id bigint, p_shartnoma_id bigint default null)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $fn$
declare
  v_b public.t2_buyurtma; v_q record; v_ijrochi text; v_sh bigint := null; v_n integer;
  v_h bigint; v_r jsonb; v_yangi_h integer := 0; v_eski_h integer := 0; v_qarz integer := 0; v_qarz_kutilmoqda integer := 0;
  v_narxsiz boolean := false; v_ogoh text[] := '{}'; v_kim text;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_KERAK'); end if;
  -- tenant + actor (qo'shni RPC lar bilan bir xil): faol a'zo, so'ng 'qabul' ruxsati (warehouse.receive YOKI procurement.write)
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public._t2_yet_azo(p_actor_id, p_kompaniya_id, 'qabul');
  v_kim := 'actor:' || p_actor_id::text;
  -- faqat XARIDOR tenanti (obyekt skladi va qarz xaridorniki); begona tenant uchun mavjudlik oshkor qilinmaydi
  select * into v_b from public.t2_buyurtma where id = p_buyurtma_id and kompaniya_id = p_kompaniya_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'TOPILMADI'); end if;
  if v_b.holat not in ('qabul_qilindi_yakuniy', 'qisman') then
    return jsonb_build_object('ok', false, 'code', 'HOLAT', 'holat', v_b.holat);          -- topshirilmagan / nizo / bekor: sklad yozilmaydi
  end if;
  if v_b.tur <> 'material' then
    return jsonb_build_object('ok', true, 'otkazildi', 'TUR_MATERIAL_EMAS', 'sklad_soni', 0, 'qarz_soni', 0);   -- xizmat/transport: sklad kirimi yo'q
  end if;
  if v_b.obyekt_id is null then return jsonb_build_object('ok', false, 'code', 'OBYEKT_YOQ'); end if;
  if not exists (select 1 from public.t2_obyekt where id = v_b.obyekt_id and kompaniya_id = p_kompaniya_id) then
    return jsonb_build_object('ok', false, 'code', 'OBYEKT_BEGONA');
  end if;
  select nom into v_ijrochi from public.t2_kompaniya where id = v_b.ijrochi_kompaniya_id;

  -- shartnoma (qarz uchun): berilgan bo'lsa AYNAN shu tenantning yetkazuvchi (asosiy=false) shartnomasi; berilmasa tarafi yetkazuvchi nomiga
  -- aynan teng YAGONA faol shartnoma; aks holda NULL (shartnoma o'ylab topilmaydi, qarz qatorlari yaratilmaydi).
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
     where buyurtma_id = v_b.id and coalesce(qabul_miqdor, 0) > 0 and coalesce(qabul_holat, 'butun') <> 'shikast'   -- shikastlangan kirimga kirmaydi
     order by qator_no for update
  loop
    if v_q.narx is null then v_narxsiz := true; end if;
    -- (a) sklad kirimi: mavjud bo'lsa qayta yozilmaydi
    select id into v_h from public.t2_sklad_harakat where buyurtma_qator_id = v_q.id and holat = 'faol';
    if v_h is not null then
      v_eski_h := v_eski_h + 1;
    else
      v_r := public.t2_skladga_yozish(p_kompaniya_id, 'prixod', v_b.obyekt_id, 'mat', current_date, v_q.nom, v_q.birlik, v_q.qabul_miqdor,
               v_ijrochi, null, null, 'buyurtma #' || v_b.id::text || ' qator #' || v_q.qator_no::text,
               md5('buyurtma_qabul_sklad:' || v_q.id::text)::uuid, 'buyurtma_qabul_v1', v_kim);
      if coalesce(v_r->>'ok', 'false') <> 'true' then raise exception 'SKLAD_YOZISH_RAD: %', v_r::text using errcode = 'P0001'; end if;   -- butun RPC qaytadi
      v_h := (v_r->>'harakat_id')::bigint;
      update public.t2_sklad_harakat set narx = v_q.narx, buyurtma_id = v_b.id, buyurtma_qator_id = v_q.id
       where id = v_h and kompaniya_id = p_kompaniya_id and buyurtma_qator_id is null;
      v_yangi_h := v_yangi_h + 1;
    end if;
    -- (b) qarz asosi: faqat shartnoma ma'lum bo'lsa; qator bo'yicha bitta
    if v_sh is null then
      v_qarz_kutilmoqda := v_qarz_kutilmoqda + 1;
    elsif not exists (select 1 from public.t2_qarz_asos where buyurtma_qator_id = v_q.id and holat = 'faol') then
      insert into public.t2_qarz_asos (kompaniya_id, shartnoma_id, tur, hujjat_raqam, sana, nomi, birlik, hajm, narx, summa, sklad_harakat_id, tartib, operation_id, kim, buyurtma_qator_id)
      values (p_kompaniya_id, v_sh, 'yetkazib_berish', 'buyurtma #' || v_b.id::text, current_date, v_q.nom, v_q.birlik, v_q.qabul_miqdor, v_q.narx,
              case when v_q.narx is null then null else round(v_q.qabul_miqdor * v_q.narx, 2) end,
              v_h, v_q.qator_no, md5('buyurtma_qabul_qarz:' || v_q.id::text)::uuid, v_kim, v_q.id);
      v_qarz := v_qarz + 1;
    end if;
  end loop;

  if v_qarz_kutilmoqda > 0 then v_ogoh := array_append(v_ogoh, 'SHARTNOMA_YOQ'::text); end if;
  if v_narxsiz then v_ogoh := array_append(v_ogoh, 'NARX_YOQ'::text); end if;
  perform public.t2_audit_yoz(p_kompaniya_id, 'buyurtma_qabul_yakunla', 'taminot', v_b.obyekt_id,
    'buyurtma #' || v_b.id::text || ': sklad ' || v_yangi_h::text || ' yangi/' || v_eski_h::text || ' mavjud, qarz ' || v_qarz::text, v_kim, null);
  return jsonb_build_object('ok', true, 'takror', (v_yangi_h = 0 and v_qarz = 0), 'sklad_soni', v_yangi_h, 'sklad_mavjud', v_eski_h, 'qarz_soni', v_qarz,
    'qarz_kutilmoqda', v_qarz_kutilmoqda, 'shartnoma_id', v_sh, 'ogohlantirish', to_jsonb(v_ogoh));
end $fn$;

revoke all on function public.t2_buyurtma_qabul_yakunla_v1(bigint, bigint, uuid, bigint, bigint) from public, anon, authenticated;
grant execute on function public.t2_buyurtma_qabul_yakunla_v1(bigint, bigint, uuid, bigint, bigint) to service_role;
