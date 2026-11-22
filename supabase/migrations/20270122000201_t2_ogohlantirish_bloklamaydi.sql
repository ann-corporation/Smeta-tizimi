-- egasi 2026-11-22: F-3 (va F-2 yuborish/tasdiq) zanjiri biznes tekshiruvi tufayli UZILMAYDI — faqat ogohlantiriladi.
-- NARXSIZ_QATOR_BOR, F2_RESURS_TUSHGAN, F-3 da tasdiqlanmagan F2 / scope / davr tashqarisi -> javobdagi `ogohlantirishlar` ro'yxati.
-- Texnik himoyalar saqlanadi: OPERATION_ID, STALE_VERSION, SoD, DEPENDENTS_EXIST, FORMA3_DENIED, FORMA3_AKT_BAND, FORMA3_F2_TAKROR.
-- F-3 ro'yxati (t2_forma3_shartnoma_aktlar_v1) qoralama F2 ni ham beradi (holat bilan).

CREATE OR REPLACE FUNCTION public.t2_akt_lifecycle_transition_v1(p_kompaniya_id bigint, p_akt_id bigint, p_to_status text, p_actor_id bigint, p_expected_version integer, p_operation_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_akt public.t2_akt;
  v_history public.t2_akt_holat_tarix;
  v_new_version integer;
  v_reason text := nullif(btrim(p_reason), '');
  v_allowed boolean := false;
  v_yuboruvchi bigint;
  v_tekshiruvchi bigint;
  v_ogoh jsonb := '[]'::jsonb;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  if p_expected_version is null then return jsonb_build_object('ok', false, 'code', 'EXPECTED_VERSION_REQUIRED'); end if;
  if p_to_status is null or p_to_status not in ('draft','submitted','checked','approved','rejected','cancelled','superseded') then
    return jsonb_build_object('ok', false, 'code', 'INVALID_LIFECYCLE_STATUS');
  end if;
  if p_to_status in ('rejected','cancelled') and v_reason is null then
    return jsonb_build_object('ok', false, 'code', 'REASON_REQUIRED');
  end if;
  if v_reason is not null and length(v_reason) > 2000 then
    return jsonb_build_object('ok', false, 'code', 'REASON_TOO_LONG');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_operation_id::text, 0));
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id); 
  perform public.t2_require_permission_v2(p_kompaniya_id,p_actor_id,CASE WHEN p_to_status='cancelled' THEN 'f2.cancel' WHEN p_to_status='superseded' THEN 'f2.correct' WHEN p_to_status IN ('draft','submitted') THEN 'f2.prepare' ELSE 'f2.approve' END);

  if exists (
    select 1 from public.t2_akt_holat_tarix h
    where h.operation_id = p_operation_id and h.akt_id <> p_akt_id
  ) then
    return jsonb_build_object('ok', false, 'code', 'OPERATION_REPLAY_CONFLICT');
  end if;

  select * into v_akt
  from public.t2_akt
  where id = p_akt_id and kompaniya_id = p_kompaniya_id
  for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'AKT_NOT_FOUND'); end if;

  select * into v_history
  from public.t2_akt_holat_tarix h
  where h.akt_id = p_akt_id and h.operation_id = p_operation_id
  order by h.id desc limit 1;
  if found then
    if v_history.to_status <> p_to_status then
      return jsonb_build_object('ok', false, 'code', 'OPERATION_REPLAY_CONFLICT');
    end if;
    return jsonb_build_object('ok', true, 'retry', true, 'akt_id', p_akt_id,
      'from_status', v_history.from_status, 'status', v_history.to_status,
      'version', v_akt.versiya, 'history_id', v_history.id);
  end if;

  if v_akt.versiya <> p_expected_version then
    return jsonb_build_object('ok', false, 'code', 'STALE_VERSION', 'version', v_akt.versiya);
  end if;

  v_allowed := (v_akt.lifecycle_status, p_to_status) in (
    ('draft','submitted'), ('draft','cancelled'),
    ('submitted','checked'), ('submitted','cancelled'),
    ('checked','approved'), ('checked','rejected'), ('checked','cancelled'),
    ('rejected','submitted'), ('rejected','cancelled'), ('rejected','draft'),
    ('cancelled','cancelled'), ('superseded','superseded'), ('approved','approved'),
    ('approved','cancelled')
  );
  if not v_allowed then
    return jsonb_build_object('ok', false, 'code', 'INVALID_LIFECYCLE_TRANSITION',
      'from_status', v_akt.lifecycle_status, 'to_status', p_to_status);
  end if;

  -- tasdiqlangan_bekor_v1: tasdiqlangan F2 ni bekor qilish — f2.cancel (yuqorida) + f2.approve.
  if v_akt.lifecycle_status = 'approved' and p_to_status = 'cancelled' then
    perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'f2.approve');
    -- f2_tuzatish_20261203001500 (C-M7): faol storno/pereraschet, Forma-3 yoki davr muhri bo'lsa bekor qilinmaydi.
    if public._t2_f2_akt_bogliq_v1(p_akt_id) is not null then
      return jsonb_build_object('ok', false, 'code', 'DEPENDENTS_EXIST',
        'xabar', 'Bu F2 ga bog''liq hujjatlar bor (storno/pereraschet, Forma-3 yoki davr muhri). Avval ularni bekor qiling.',
        'bogliq', public._t2_f2_akt_bogliq_v1(p_akt_id));
    end if;
  end if;
  -- f2_tuzatish_20261203001500 (egasi 2026-11-06): avto qoralamada narxsiz qoldirilgan qator bor ekan — yuborish/tasdiq yo'q.
  if p_to_status in ('submitted', 'approved') and v_akt.lifecycle_status <> p_to_status
     and public._t2_f2_narxsiz_avto_soni(p_akt_id) > 0 then
    -- egasi 2026-11-22: zanjir uzilmaydi — faqat ogohlantirish (alohida ro'yxat).
    v_ogoh := v_ogoh || jsonb_build_array(jsonb_build_object('code', 'NARXSIZ_QATOR_BOR', 'soni', public._t2_f2_narxsiz_avto_soni(p_akt_id),
      'xabar', 'Avto qoralamada narxsiz qoldirilgan qatorlar bor — narxlang yoki ongli «narxsiz» deb belgilang.'));
  end if;

  -- 20270109000000 (egasi 2026-11-18): F2 da ish (BL) bor-u, uning resurslari (RS/MAT) tushib qolgan bo'lsa —
  -- yuborish/tasdiq yo'q (pul jamiga kirmaydi). Avval resurslarni F2 ga qo'shing.
  if v_akt.tur = 'f2' and p_to_status in ('submitted', 'approved') and v_akt.lifecycle_status <> p_to_status
     and public._t2_f2_resurs_tushgan_soni_v1(p_akt_id) > 0 then
    -- egasi 2026-11-22: zanjir uzilmaydi — faqat ogohlantirish.
    v_ogoh := v_ogoh || jsonb_build_array(jsonb_build_object('code', 'F2_RESURS_TUSHGAN', 'soni', public._t2_f2_resurs_tushgan_soni_v1(p_akt_id),
      'qatorlar', public._t2_f2_resurs_tushgan_v1(p_akt_id, 50),
      'xabar', 'F2 da ish qatori bor, lekin uning resurslari F2 ga tushmagan — summa to''liq emas. Resurslarni qo''shing.'));
  end if;

  -- SoD (audit 2026-10-21, egasi ADR-2): KORPORATIV rejimda tayyorlovchi ≠ tekshiruvchi ≠ tasdiqlovchi — bazada majburiy
  -- (to'g'ridan API chaqiruvida ham). SHAXSIY rejim (yakka smetachi) — bir kishi yakunlaydi; bu «kompaniya tasdiqladi» emas,
  -- interfeys uni tarixdagi aktyorlar bo'yicha «Yakunlangan (shaxsiy)» deb ko'rsatadi.
  if p_to_status in ('checked','approved') and v_akt.lifecycle_status <> p_to_status
     and coalesce((select k.f2_tasdiq_rejimi from public.t2_kompaniya k where k.id = p_kompaniya_id), 'shaxsiy') = 'korporativ' then
    select h.actor_id into v_yuboruvchi from public.t2_akt_holat_tarix h
     where h.akt_id = p_akt_id and h.to_status = 'submitted' order by h.id desc limit 1;
    if p_to_status = 'checked' and v_yuboruvchi = p_actor_id then
      return jsonb_build_object('ok', false, 'code', 'SOD_TEKSHIRUVCHI_YUBORUVCHI');
    end if;
    if p_to_status = 'approved' then
      select h.actor_id into v_tekshiruvchi from public.t2_akt_holat_tarix h
       where h.akt_id = p_akt_id and h.to_status = 'checked' order by h.id desc limit 1;
      if p_actor_id = v_yuboruvchi or p_actor_id = v_tekshiruvchi then
        return jsonb_build_object('ok', false, 'code', 'SOD_TASDIQLOVCHI_TAKRORLANDI');
      end if;
    end if;
  end if;

  -- Same-state approved retry is an audit-safe idempotent acknowledgement;
  -- no UPDATE is issued, so approved immutability is preserved.
  if v_akt.lifecycle_status = p_to_status then
    insert into public.t2_akt_holat_tarix
      (kompaniya_id, akt_id, from_status, to_status, reason, actor_id, operation_id)
    values
      (p_kompaniya_id, p_akt_id, v_akt.lifecycle_status, p_to_status,
       v_reason, p_actor_id, p_operation_id)
    returning * into v_history;
    perform public.t2_audit_yoz(p_kompaniya_id, 'akt_lifecycle_retry', 'f2', v_akt.obyekt_id,
      format('akt_id=%s; from=%s; to=%s; actor_id=%s; operation_id=%s', p_akt_id, v_akt.lifecycle_status, p_to_status, p_actor_id, p_operation_id),
      'actor:' || p_actor_id, null);
    return jsonb_build_object('ok', true, 'retry', true, 'akt_id', p_akt_id,
      'from_status', v_akt.lifecycle_status, 'status', p_to_status,
      'version', v_akt.versiya, 'history_id', v_history.id, 'ogohlantirishlar', v_ogoh);
  end if;

  perform set_config('t2.akt.lifecycle_transition', '1', true);
  perform set_config('t2.akt.actor_id', p_actor_id::text, true);
  perform set_config('t2.akt.operation_id', p_operation_id::text, true);
  perform set_config('t2.akt.reason', coalesce(v_reason, ''), true);

  update public.t2_akt
  set lifecycle_status = p_to_status,
      lifecycle_updated_at = now(),
      lifecycle_updated_by = p_actor_id,
      lifecycle_reason = v_reason,
      lifecycle_submitted_at = case when p_to_status = 'submitted' then coalesce(lifecycle_submitted_at, now()) else lifecycle_submitted_at end,
      lifecycle_checked_at = case when p_to_status = 'checked' then coalesce(lifecycle_checked_at, now()) else lifecycle_checked_at end,
      lifecycle_approved_at = case when p_to_status = 'approved' then coalesce(lifecycle_approved_at, now()) else lifecycle_approved_at end,
      lifecycle_rejected_at = case when p_to_status = 'rejected' then coalesce(lifecycle_rejected_at, now()) else lifecycle_rejected_at end,
      lifecycle_cancelled_at = case when p_to_status = 'cancelled' then coalesce(lifecycle_cancelled_at, now()) else lifecycle_cancelled_at end,
      lifecycle_superseded_at = case when p_to_status = 'superseded' then coalesce(lifecycle_superseded_at, now()) else lifecycle_superseded_at end,
      versiya = versiya + 1,
      yangilandi = now()
  where id = p_akt_id and kompaniya_id = p_kompaniya_id and versiya = p_expected_version
  returning versiya into v_new_version;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'STALE_VERSION');
  end if;

  select * into v_history
  from public.t2_akt_holat_tarix h
  where h.akt_id = p_akt_id and h.operation_id = p_operation_id
  order by h.id desc limit 1;
  perform public.t2_audit_yoz(p_kompaniya_id, 'akt_lifecycle_transition', 'f2', v_akt.obyekt_id,
    format('akt_id=%s; from=%s; to=%s; actor_id=%s; operation_id=%s', p_akt_id, v_akt.lifecycle_status, p_to_status, p_actor_id, p_operation_id),
    'actor:' || p_actor_id, null);
  return jsonb_build_object('ok', true, 'akt_id', p_akt_id,
    'from_status', v_akt.lifecycle_status, 'status', p_to_status,
    'version', v_new_version, 'history_id', v_history.id, 'ogohlantirishlar', v_ogoh)
    || case when v_akt.lifecycle_status = 'approved' and p_to_status = 'cancelled' and public._t2_f2_akt_paket_v1(p_akt_id) is not null
            then jsonb_build_object('ogohlantirish', 'PAKET_TOPSHIRILGAN', 'paketlar', public._t2_f2_akt_paket_v1(p_akt_id))
            else '{}'::jsonb end;
end $function$;

CREATE OR REPLACE FUNCTION public.t2_forma3_yarat_v1(p_actor_id bigint, p_loyiha_id bigint, p_obyekt_id bigint, p_shartnoma_id bigint, p_davr_boshi date, p_davr_oxiri date, p_akt_ids bigint[], p_raqam text, p_operation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_komp bigint; v_rol text; v_id bigint; v_summa numeric := 0; v_n integer := 0; v_nom integer := 0; v_band bigint[]; v_ogoh jsonb := '[]'::jsonb;
        v_shartnoma_rejim boolean := (p_obyekt_id is null and p_shartnoma_id is not null);
        v_sh_loyiha bigint; v_sh_komp bigint;
begin
  if p_operation_id is null then return jsonb_build_object('ok',false,'code','OPERATION_ID_REQUIRED'); end if;
  select id into v_id from public.t2_forma3 where operation_id = p_operation_id;
  if found then return jsonb_build_object('ok',true,'takror',true,'forma3_id',v_id); end if;

  if v_shartnoma_rejim then
    -- Shartnoma rejimi: kompaniya shartnomadan; loyiha — shartnomadagi (bo'lsa).
    select kompaniya_id, loyiha_id into v_sh_komp, v_sh_loyiha
      from public.t2_shartnoma where id = p_shartnoma_id and holat <> 'bekor';
    if v_sh_komp is null then return jsonb_build_object('ok',false,'code','SCOPE_NOT_FOUND'); end if;
    v_komp := v_sh_komp;
    p_loyiha_id := coalesce(p_loyiha_id, v_sh_loyiha);
  elsif p_loyiha_id is not null then
    select kompaniya_id into v_komp from public.t2_loyiha where id = p_loyiha_id;
  elsif p_obyekt_id is not null then
    select kompaniya_id, loyiha_id into v_komp, p_loyiha_id from public.t2_obyekt where id = p_obyekt_id;
  end if;
  if v_komp is null then return jsonb_build_object('ok',false,'code','SCOPE_NOT_FOUND'); end if;
  v_rol := public.t2_actor_kompaniya_azo_tekshir(v_komp, p_actor_id);
  if v_rol not in ('boss','superadmin','rahbar','bugalter') then
    return jsonb_build_object('ok',false,'code','FORMA3_DENIED');
  end if;
  if p_akt_ids is null or array_length(p_akt_ids,1) is null then
    return jsonb_build_object('ok',false,'code','FORMA3_AKT_REQUIRED');
  end if;
  -- Qattiq (texnik) shart: akt mavjud, F2 turi, bekor emas, shu kompaniya.
  if exists (
    select 1 from unnest(p_akt_ids) aid
    left join public.t2_akt a on a.id = aid
    where a.id is null or a.tur <> 'f2' or a.kompaniya_id <> v_komp or a.holat = 'bekor'
  ) then
    return jsonb_build_object('ok',false,'code','FORMA3_AKT_INVALID',
      'xato','Har akt: mavjud, bekor qilinmagan Ф2 va shu kompaniyaniki bo''lishi kerak');
  end if;
  -- egasi 2026-11-22: tasdiqlanmagan F2, scope/davr tashqarisi — zanjir uzilmaydi, alohida ogohlantirish ro'yxati.
  select coalesce(jsonb_agg(jsonb_build_object('code', x.code, 'akt_id', x.id, 'raqam', x.raqam, 'obyekt_id', x.obyekt_id, 'oy', x.oy, 'holat', x.holat) order by x.id, x.code), '[]'::jsonb)
    into v_ogoh
    from (
      select a.id, a.raqam, a.obyekt_id, a.oy, a.holat, c.code
        from public.t2_akt a
        cross join lateral (values
          (case when a.holat <> 'tasdiqlangan' then 'F2_TASDIQLANMAGAN' end),
          (case when (p_obyekt_id is not null and a.obyekt_id <> p_obyekt_id)
                  or (v_shartnoma_rejim and not exists (select 1 from public.t2_shartnoma_bog b
                        where b.shartnoma_id = p_shartnoma_id and b.obyekt_id = a.obyekt_id and b.holat = 'faol'))
                then 'SCOPE_TASHQARI' end),
          (case when a.oy < date_trunc('month', p_davr_boshi) or a.oy > date_trunc('month', p_davr_oxiri) then 'DAVR_TASHQARI' end)
        ) c(code)
       where a.id = any(p_akt_ids) and c.code is not null
    ) x;

  -- bitta_f2_qoidasi_20270116: obyekt x oy da bekor qilinmagan >1 F-2 (korrektirovkadan tashqari) bo'lsa Forma 3 yaratilmaydi.
  if public._t2_f2_oy_takror_v1(null, null, p_akt_ids) <> '[]'::jsonb then
    return jsonb_build_object('ok',false,'code','FORMA3_F2_TAKROR',
      'xato','Bu obyekt/oy uchun bir nechta F-2 bor (taxminiy qoralama bo''lishi mumkin). Avval ortiqcha F-2 ni bekor qiling',
      'takrorlar', public._t2_f2_oy_takror_v1(null, null, p_akt_ids));
  end if;
  -- 20261211000000: bitta F2 ikki marta Forma 3 ga kirmaydi.
  select array_agg(distinct a.id) into v_band
    from public.t2_akt a
   where a.id = any(p_akt_ids)
     and (a.forma3_id is not null
          or exists (select 1 from public.t2_forma3_akt x join public.t2_forma3 f on f.id = x.forma3_id
                      where x.akt_id = a.id and coalesce(f.holat,'') <> 'bekor'));
  if v_band is not null then
    return jsonb_build_object('ok',false,'code','FORMA3_AKT_BAND',
      'xato','Bu F2 aktlar allaqachon boshqa Forma 3 ga kiritilgan', 'akt_ids', to_jsonb(v_band));
  end if;

  select coalesce(sum(coalesce(aq.certified_amount, aq.summa)),0), count(distinct a.id),
         count(*) filter (where q.tur not in ('rz','bl') and coalesce(q.nom,'') !~* 'ЗАТРАТЫ\s+ТРУДА\s+МАШИНИСТ' and coalesce(aq.certified_amount, aq.summa) is null and coalesce(aq.certified_quantity, aq.hajm, 0) <> 0)
    into v_summa, v_n, v_nom
  from public.t2_akt a join public.t2_akt_qator aq on aq.akt_id = a.id
  join public.t2_qator q on q.id = aq.qator_id
  where a.id = any(p_akt_ids);

  insert into public.t2_forma3
    (kompaniya_id, loyiha_id, obyekt_id, shartnoma_id, raqam, davr_boshi, davr_oxiri,
     holat, bajarilgan_f2_summa, qoida_holat, qoida_manba, operation_id, actor_id)
  values (v_komp, p_loyiha_id, p_obyekt_id, p_shartnoma_id, p_raqam, p_davr_boshi, p_davr_oxiri,
     'qoralama', v_summa, 'FORMA3_RULE_MAPPED',
     'EGA_QAROR_B_NAKRUTKA_KASKAD_V1: ВСЕГО К ОПЛАТЕ = nakrutka kaskadi (t2_nakrutka_hisob_v1 bilan aynan: ИТОГО-4 × (1+НДС)); davr ustunlari faqat holat=tasdiqlangan F2 dan; qamrov — loyiha (shartnoma) darajasida; avans kirmaydi; hisob — frontend lib/forma3-export.ts jonli formulalar bilan (tiyingacha nazorat).',
     p_operation_id, p_actor_id)
  returning id into v_id;

  insert into public.t2_forma3_akt (forma3_id, akt_id) select v_id, unnest(p_akt_ids);
  -- Tor istisno: guard faqat forma3_id NULL → qiymatga shu tranzaksiya ichida ruxsat beradi.
  perform set_config('t2.forma3.boglash', '1', true);
  update public.t2_akt set forma3_id = v_id where id = any(p_akt_ids) and forma3_id is null;
  perform set_config('t2.forma3.boglash', '', true);

  perform public.t2_audit_yoz(v_komp, 'forma3_yarat', 'smeta', p_obyekt_id,
    format('forma3_id=%s rejim=%s shartnoma=%s davr=%s..%s aktlar=%s f2_summa=%s nomalum_qator=%s ogoh=%s qoida=EGA_QAROR_B_NAKRUTKA_KASKAD_V1',
           v_id, case when v_shartnoma_rejim then 'shartnoma' else 'obyekt' end, p_shartnoma_id,
           p_davr_boshi, p_davr_oxiri, v_n, round(v_summa,2), v_nom, jsonb_array_length(v_ogoh)),
    'actor:'||p_actor_id, null);

  return jsonb_build_object('ok',true,'takror',false,'forma3_id',v_id,
    'rejim', case when v_shartnoma_rejim then 'shartnoma' else 'obyekt' end,
    'bajarilgan_f2_summa',v_summa,'f2_summa_nomalum',v_nom,'aktlar',v_n,
    'qoida_holat','FORMA3_RULE_MAPPED', 'ogohlantirishlar', v_ogoh,
    'qoida_manba','EGA_QAROR_B_NAKRUTKA_KASKAD_V1',
    'izoh','F3 jami qoidasi eganing B qarori bilan MAPPED: nakrutka kaskadi, ВСЕГО К ОПЛАТЕ = F2 к оплате jamisi (tiyingacha). Hisob hujjat-yozuvchida (lib/forma3-export.ts) jonli formulalar bilan.');
end $function$;

CREATE OR REPLACE FUNCTION public.t2_forma3_shartnoma_aktlar_v1(p_shartnoma_id bigint, p_actor_id bigint, p_davr_boshi date, p_davr_oxiri date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_komp bigint; v_rol text; v_rows jsonb; v_obyektlar jsonb;
begin
  select kompaniya_id into v_komp from public.t2_shartnoma where id = p_shartnoma_id and holat <> 'bekor';
  if v_komp is null then return jsonb_build_object('ok',false,'code','SCOPE_NOT_FOUND'); end if;
  v_rol := public.t2_actor_kompaniya_azo_tekshir(v_komp, p_actor_id);
  if p_davr_boshi is null or p_davr_oxiri is null or p_davr_oxiri < p_davr_boshi then
    return jsonb_build_object('ok',false,'code','DAVR_INVALID');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('obyekt_id', o.id, 'nom', o.nom) order by o.nom), '[]'::jsonb)
    into v_obyektlar
    from public.t2_obyekt o
   where o.id in (select b.obyekt_id from public.t2_shartnoma_bog b where b.shartnoma_id = p_shartnoma_id and b.holat = 'faol');

  select coalesce(jsonb_agg(jsonb_build_object(
           'akt_id', a.id, 'raqam', a.raqam, 'oy', a.oy, 'obyekt_id', a.obyekt_id, 'obyekt_nom', o.nom,
           'hujjat_jami', a.hujjat_jami, 'forma3_id', bf.forma3_id,
           'band', (a.forma3_id is not null or bf.forma3_id is not null), 'holat', a.holat, 'lifecycle_status', a.lifecycle_status
         ) order by o.nom, a.oy, a.id), '[]'::jsonb)
    into v_rows
    from public.t2_akt a
    join public.t2_obyekt o on o.id = a.obyekt_id
    left join lateral (
      select x.forma3_id from public.t2_forma3_akt x join public.t2_forma3 f on f.id = x.forma3_id
       where x.akt_id = a.id and coalesce(f.holat,'') <> 'bekor' order by x.forma3_id limit 1
    ) bf on true
   where a.kompaniya_id = v_komp and a.tur = 'f2' and a.holat <> 'bekor'
     and a.oy >= date_trunc('month', p_davr_boshi) and a.oy <= date_trunc('month', p_davr_oxiri)
     and exists (select 1 from public.t2_shartnoma_bog b
                  where b.shartnoma_id = p_shartnoma_id and b.obyekt_id = a.obyekt_id and b.holat = 'faol');

  return jsonb_build_object('ok',true,'shartnoma_id',p_shartnoma_id,'obyektlar',v_obyektlar,'aktlar',v_rows);
end $function$;

comment on function public.t2_forma3_yarat_v1(bigint, bigint, bigint, bigint, date, date, bigint[], text, uuid) is 'Forma 3 yaratish; biznes tekshiruvlari ogohlantirish (egasi 2026-11-22). versiya: tarix — F2 akt qatorlari (tarixiy hujjat) bo''yicha t2_qator turi o''qiladi.';
comment on function public.t2_forma3_shartnoma_aktlar_v1(bigint, bigint, date, date) is 'Shartnoma F-3 uchun F2 aktlar ro''yxati (qoralama ham, holat bilan). versiya: tarix — F2 aktlari tarixiy hujjat.';
