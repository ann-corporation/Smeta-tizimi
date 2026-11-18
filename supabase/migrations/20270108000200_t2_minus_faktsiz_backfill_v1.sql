-- MINUS juft faktini to'ldirish (backfill): oldindan ko'rish (faqat o'qiydi) + obyekt bo'yicha qo'llash (dry_run standart TRUE).
-- Ko'rish: asosi faktli, lekin MINUS jufti (va MAT/OB bolalari) yetarli faktsiz qatorlar — faqat MAGNITUDA OSHADIGAN (yetishmayotgan) qismi;
--   qo'lda kiritilgan ortiqcha faktni kamaytirmaydi. Qo'llash: t2_fakt_yoz_v2 orqali BITTA fakt akti (izoh 'minus juft'), operator obyektma-obyekt ishga tushiradi.
-- Bu migratsiya MA'LUMOT YOZMAYDI (faqat funksiyalar). BEGIN/COMMIT/ROLLBACK yo'q.

create or replace function public.t2_fakt_minus_korik_v1(p_obyekt_id bigint default null)
returns table(obyekt_id bigint, qator_id bigint, minus_id bigint, baza_id bigint, tur text, qoida text, kod text, nom text, birlik text,
              smeta_hajm numeric, joriy_fakt numeric, kerakli_fakt numeric, farq numeric)
language sql stable set search_path = public, pg_temp as $f$
  select q.obyekt_id, h.qator_id, h.minus_id, h.baza_id, h.tur, h.qoida, q.kod, left(q.nom, 120), q.birlik,
         h.smeta_hajm, h.joriy_fakt, h.kerakli_fakt, h.farq
    from (select distinct z.obyekt_id as oid from public.t2_qator z
           where z.tur = 'bl' and z.hajm < 0 and z.versiya_holat = 'faol' and (p_obyekt_id is null or z.obyekt_id = p_obyekt_id)) o
   cross join lateral public._t2_fakt_minus_hisob_v1(o.oid, '{}'::jsonb, false) h
    join public.t2_qator q on q.id = h.qator_id
   where h.farq * h.smeta_hajm > 0
   order by q.obyekt_id, h.minus_id, h.qator_id
$f$;
comment on function public.t2_fakt_minus_korik_v1(bigint) is
  'Faktsiz qolgan MINUS juft qatorlar (asosi faktli) — faqat ko''rish, hech narsa yozmaydi. Qo''llash: t2_fakt_minus_qollash_v1.';
revoke all on function public.t2_fakt_minus_korik_v1(bigint) from public, anon, authenticated;
grant execute on function public.t2_fakt_minus_korik_v1(bigint) to service_role;

create or replace function public.t2_fakt_minus_qollash_v1(p_actor_id bigint, p_kompaniya_id bigint, p_obyekt_id bigint,
  p_sana date default null, p_dry_run boolean default true, p_operation_id uuid default null)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $f$
declare v_qat jsonb; v_n int; v_noaniq int; v_res jsonb; v_korik jsonb;
begin
  if not exists (select 1 from public.t2_obyekt o where o.id = p_obyekt_id and o.kompaniya_id = p_kompaniya_id) then
    return jsonb_build_object('ok', false, 'code', 'OBYEKT_SCOPE_MISMATCH');
  end if;
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'fakt.write');

  select coalesce(jsonb_agg(jsonb_build_object('qator_id', x.qator_id, 'hajm', x.farq, 'izoh', 'minus juft (backfill)', 'minus_juft', false) order by x.minus_id, x.qator_id), '[]'::jsonb),
         count(*),
         coalesce(jsonb_agg(jsonb_build_object('qator_id', x.qator_id, 'minus_id', x.minus_id, 'baza_id', x.baza_id, 'tur', x.tur, 'qoida', x.qoida, 'kod', x.kod,
                    'smeta_hajm', x.smeta_hajm, 'joriy_fakt', x.joriy_fakt, 'kerakli_fakt', x.kerakli_fakt, 'farq', x.farq) order by x.minus_id, x.qator_id), '[]'::jsonb)
    into v_qat, v_n, v_korik
    from public.t2_fakt_minus_korik_v1(p_obyekt_id) x;
  select count(*) into v_noaniq from public.t2_fakt_minus_juft_v1(p_obyekt_id) j where j.holat <> 'aniq';

  if coalesce(p_dry_run, true) then
    return jsonb_build_object('ok', true, 'dry_run', true, 'qator_soni', v_n, 'aniqlanmagan_juft', v_noaniq,
      'qatorlar', case when v_n > 500 then (select jsonb_agg(e) from (select e from jsonb_array_elements(v_korik) e limit 500) s) else v_korik end);
  end if;

  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  if v_n = 0 then return jsonb_build_object('ok', true, 'dry_run', false, 'qator_soni', 0, 'aniqlanmagan_juft', v_noaniq, 'izoh', 'Yetishmayotgan MINUS juft fakti yo''q.'); end if;

  v_res := public.t2_fakt_yoz_v2(p_obyekt_id, coalesce(p_sana, current_date), v_qat, p_actor_id, p_operation_id, 'minus juft backfill', null, 'minus-backfill');
  return v_res || jsonb_build_object('dry_run', false, 'qator_soni', v_n, 'aniqlanmagan_juft', v_noaniq);
end $f$;
comment on function public.t2_fakt_minus_qollash_v1(bigint, bigint, bigint, date, boolean, uuid) is
  'MINUS juft faktini obyekt bo''yicha to''ldirish (t2_fakt_yoz_v2 orqali bitta akt). p_dry_run standart TRUE — faqat ro''yxat qaytaradi.';
revoke all on function public.t2_fakt_minus_qollash_v1(bigint, bigint, bigint, date, boolean, uuid) from public, anon, authenticated;
grant execute on function public.t2_fakt_minus_qollash_v1(bigint, bigint, bigint, date, boolean, uuid) to service_role;
