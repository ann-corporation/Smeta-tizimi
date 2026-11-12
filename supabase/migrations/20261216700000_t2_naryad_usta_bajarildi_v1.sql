-- Naryad: usta «Bajardim» — xavfsiz QISMAN yuborish + usta izohi (20261216700000).
--
-- Mavjud t2_naryad_yoz_v1 amal 'bajarildi' semantikasi (o'qib aniqlangan):
--   * payload'da yo'q qatorlarga TEGMAYDI (faqat ro'yxatdagi id lar uchun bajarilgan_hajm yoziladi);
--   * lekin siklidan keyin: `if exists (... naryad_id = n.id and bajarilgan_hajm is null) then return {ok:false, code:'BAJARILGAN_TOLIQ_EMAS'}` —
--     ya'ni bitta qatorni yuborsangiz u BAZAGA YOZILIB QOLADI, lekin xato qaytadi, versiya oshmaydi, operatsiya jurnaliga yozilmaydi
--     (yarim saqlangan holat); naryad 'bajarildi' ga faqat HAMMA qatorda qiymat bo'lganda o'tadi;
--   * izoh/ovozli izoh saqlanmaydi (shlyuz yuk maydonlarini oq ro'yxatdan o'tkazadi, RPC faqat qatorlarni o'qiydi).
-- Shu sababli «bitta ish bajarildi» ni mavjud RPC xavfsiz ifodalay olmaydi. Bu migratsiya KICHIK alohida RPC qo'shadi
-- (t2_naryad_yoz_v1 ga tegilmaydi): aniq qisman rejim, tugadi bayrog'i, usta izohi.
-- Forward-only: BEGIN/COMMIT yo'q. Qo'llash — egasi ruxsatidan keyin.

alter table public.t2_naryad add column if not exists usta_izoh text;

-- Usta izohi o'qishda ham chiqadi (mavjud funksiya + bitta kalit).
create or replace function public._t2_naryad_json(p_id bigint)
 returns jsonb
 language sql
 stable
 set search_path to 'public', 'pg_temp'
as $function$
  select jsonb_build_object(
    'id', n.id, 'obyekt_id', n.obyekt_id, 'obyekt_nom', o.nom, 'raqam', n.raqam, 'davr_dan', n.davr_dan, 'davr_gacha', n.davr_gacha,
    'usta_nom', n.usta_nom, 'usta_kontragent_id', n.usta_kontragent_id, 'usta_foydalanuvchi_id', n.usta_foydalanuvchi_id, 'brigada', n.brigada, 'holat', n.holat, 'izoh', n.izoh,
    'usta_izoh', n.usta_izoh,
    'versiya', n.versiya, 'fakt_operation_id', n.fakt_operation_id, 'fakt_holat', n.fakt_holat, 'fakt_akt_id', n.fakt_akt_id,
    'xarajat_id', n.xarajat_id, 'xarajat_summa', n.xarajat_summa, 'yaratildi', n.yaratildi, 'bajarildi_sana', n.bajarildi_sana,
    'qabul_sana', n.qabul_sana, 'hisob_sana', n.hisob_sana,
    'qatorlar', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', q.id, 'qator_id', q.qator_id, 'tartib', q.tartib, 'kod', q.kod, 'nom', q.nom, 'birlik', q.birlik, 'hajm', q.hajm,
        'kat', q.kat, 'usta_birlik', q.usta_birlik, 'koef', q.koef, 'usta_narx_birlik', q.usta_narx_birlik, 'smeta_kat_birlik', q.smeta_kat_birlik,
        'norma_chel_soat', q.norma_chel_soat, 'smeta_mehnat_birlik', q.smeta_mehnat_birlik, 'usta_narx', q.usta_narx,
        'bajarilgan_hajm', q.bajarilgan_hajm, 'qabul_hajm', q.qabul_hajm, 'fakt_boshida', q.fakt_boshida,
        'fakt_delta', q.fakt_delta, 'fakt_yozilgan', q.fakt_yozilgan) order by q.tartib, q.id), '[]'::jsonb)
       from public.t2_naryad_qator q where q.naryad_id = n.id))
  from public.t2_naryad n join public.t2_obyekt o on o.id = n.obyekt_id where n.id = p_id;
$function$;

create or replace function public.t2_naryad_usta_bajarildi_v1(
  p_kompaniya_id bigint, p_actor_id bigint, p_operation_id uuid, p_naryad_id bigint, p_kutilgan_versiya integer,
  p_qatorlar jsonb, p_tugadi boolean, p_izoh text
) returns jsonb
language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare
  v_t jsonb; n public.t2_naryad; v_x jsonb; v_hajm numeric; v_id bigint; v_yoz boolean; v_self boolean; v_toliq boolean; v_r jsonb;
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_REQUIRED'); end if;
  v_yoz := coalesce((public.t2_effective_authorization_v1(p_actor_id, p_kompaniya_id, null, null, 'smeta.write', null) ->> 'allowed')::boolean, false);
  v_self := coalesce((public.t2_effective_authorization_v1(p_actor_id, p_kompaniya_id, null, null, 'self.work.write', null) ->> 'allowed')::boolean, false);
  if not v_yoz and not v_self then perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'smeta.write'); end if;
  v_t := public._t2_naryad_takror(p_kompaniya_id, p_operation_id, 'usta_bajarildi'); if v_t is not null then return v_t; end if;
  if p_qatorlar is null or jsonb_typeof(p_qatorlar) <> 'array' or jsonb_array_length(p_qatorlar) not between 1 and 200 then
    return jsonb_build_object('ok', false, 'code', 'QATORLAR_1_200');
  end if;

  select * into n from public.t2_naryad where id = p_naryad_id and kompaniya_id = p_kompaniya_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if p_kutilgan_versiya is distinct from n.versiya then
    return jsonb_build_object('ok', false, 'code', 'STALE_VERSION', 'sizning_versiya', p_kutilgan_versiya, 'bazadagi_versiya', n.versiya);
  end if;
  if not v_yoz and n.usta_foydalanuvchi_id is distinct from p_actor_id then return jsonb_build_object('ok', false, 'code', 'USTA_EMAS'); end if;
  if n.holat not in ('berildi', 'bajarildi') then return jsonb_build_object('ok', false, 'code', 'HOLAT_NOTOGRI', 'holat', n.holat); end if;

  -- Faqat ro'yxatdagi qatorlar yoziladi; boshqa qatorlarning yuborilgan hajmi O'ZGARMAYDI.
  for v_x in select * from jsonb_array_elements(p_qatorlar) loop
    v_hajm := public._t2_naryad_son(v_x -> 'bajarilgan_hajm');
    v_id := public._t2_naryad_son(v_x -> 'id')::bigint;
    if v_hajm is null or v_hajm < 0 then raise exception 'NARYAD_HAJM_NOTOGRI'; end if;
    update public.t2_naryad_qator set bajarilgan_hajm = v_hajm where id = v_id and naryad_id = n.id;
    if not found then raise exception 'NARYAD_QATOR_TOPILMADI'; end if;
  end loop;

  -- «Tugadi» — usta qolgan (hali yuborilmagan) qatorlar uchun AYAN 0 deydi; aks holda ular bo'sh (null) qoladi va naryad prorabga o'tmaydi.
  if coalesce(p_tugadi, false) then
    update public.t2_naryad_qator set bajarilgan_hajm = 0 where naryad_id = n.id and bajarilgan_hajm is null;
  end if;
  v_toliq := not exists (select 1 from public.t2_naryad_qator where naryad_id = n.id and bajarilgan_hajm is null);

  update public.t2_naryad set
    holat = case when v_toliq then 'bajarildi' else n.holat end,
    bajarildi_sana = case when v_toliq then now() else bajarildi_sana end,
    usta_izoh = coalesce(nullif(left(btrim(coalesce(p_izoh, '')), 500), ''), usta_izoh),
    versiya = versiya + 1, yangilandi = now()
   where id = n.id returning * into n;

  v_r := jsonb_build_object('ok', true, 'id', n.id, 'versiya', n.versiya, 'holat', n.holat, 'toliq', v_toliq);
  return public._t2_naryad_saqla_op(p_kompaniya_id, p_operation_id, 'usta_bajarildi', v_r);
end $function$;

revoke all on function public.t2_naryad_usta_bajarildi_v1(bigint,bigint,uuid,bigint,integer,jsonb,boolean,text) from public, anon, authenticated;
grant execute on function public.t2_naryad_usta_bajarildi_v1(bigint,bigint,uuid,bigint,integer,jsonb,boolean,text) to service_role;

comment on function public.t2_naryad_usta_bajarildi_v1(bigint,bigint,uuid,bigint,integer,jsonb,boolean,text) is
  'versiya: texnik — smeta qatoriga tegmaydi. Usta «Bajardim»: qisman rejim (boshqa qatorlar o''zgarmaydi), tugadi=true qolganlarni 0 qiladi, usta izohi saqlanadi.';
comment on function public._t2_naryad_json(bigint) is
  'versiya: texnik — naryad JSON ko''rinishi (usta_izoh qo''shildi); smeta qatorini o''qimaydi.';
