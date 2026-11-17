-- Fakt ergashishi: asos (BASE) BL qatorga fakt delta yozilganda, uning 'aniq' MINUS jufti (t2_fakt_minus_juft_v1) va MINUS ning MAT/OB bolalari
-- BIR tranzaksiyada, BIR fakt aktida avtomatik fakt oladi (izoh 'minus juft'). RS bolalar t2_qator_holat da norma orqali BL faktdan hosil bo'ladi — alohida yozilmaydi.
-- Qoida (konvergent, idempotent): kerakli_fakt = ulush x MINUS_smeta_hajm, ulush = clamp((asos_fakt_joriy + delta) / asos_smeta_hajm, 0, 1);
--   yoziladigan delta = kerakli_fakt - MINUS_joriy_fakt (0 bo'lsa yozilmaydi -> takroriy chaqiruv hech narsa qo'shmaydi). Storno (asos faktni kamaytirish) MINUS ni ham orqaga qaytaradi.
-- O'tkaziladi: MINUS (yoki bolasi) shu chaqiruvda qo'lda berilgan; faol «bajarilmadi» belgisi; F2-nusxa (manba_akt_qator_id / narx_manba f2_sertifikat) — F2 hujjatning o'zi qonuniy;
--   qator darajasida "minus_juft": false bilan o'chiriladi. Hamma fakt yo'li t2_fakt_yoz orqali o'tadi (v2, belgila_v2, usta/sub qaror, smetadan_tashqari) — shu yerda ilinadi.
-- BEGIN/COMMIT/ROLLBACK yo'q.

create or replace function public._t2_fakt_minus_hisob_v1(p_obyekt_id bigint, p_delta jsonb, p_faqat_delta boolean)
returns table(qator_id bigint, minus_id bigint, baza_id bigint, tur text, qoida text, smeta_hajm numeric, joriy_fakt numeric, kerakli_fakt numeric, farq numeric, ulush numeric)
language sql stable set search_path = public, pg_temp as $f$
  with j as (select * from public.t2_fakt_minus_juft_v1(p_obyekt_id) x where x.holat = 'aniq'),
  fk as (
    select aq.qator_id, sum(aq.hajm) as fh
      from public.t2_akt_qator aq join public.t2_akt a on a.id = aq.akt_id and a.tur = 'fakt' and a.holat <> 'bekor'
     where aq.obyekt_id = p_obyekt_id group by aq.qator_id),
  baj as (select b.qator_id from public.t2_qator_bajarilmadi b where b.obyekt_id = p_obyekt_id and b.holat = 'faol'),
  u as (
    select j.minus_id, j.baza_id, j.qoida,
           least(greatest((coalesce(fb.fh, 0) + coalesce((p_delta ->> (j.baza_id::text))::numeric, 0)) / bq.hajm, 0::numeric), 1::numeric) as ulush
      from j join public.t2_qator bq on bq.id = j.baza_id and bq.hajm <> 0
      left join fk fb on fb.qator_id = j.baza_id
     where (not p_faqat_delta or (p_delta ? (j.baza_id::text)))),
  r as (
    select m.id as qid, u.minus_id, u.baza_id, m.tur, u.qoida, m.hajm as sh, u.ulush
      from u join public.t2_qator m on m.id = u.minus_id
    union all
    select c.id, u.minus_id, u.baza_id, c.tur, u.qoida, c.hajm, u.ulush
      from u join public.t2_qator c on c.ota_id = u.minus_id and c.tur in ('mat', 'ob') and c.versiya_holat = 'faol' and c.hajm is not null and c.hajm <> 0)
  select r.qid, r.minus_id, r.baza_id, r.tur, r.qoida, r.sh, coalesce(fm.fh, 0), round(r.ulush * r.sh, 6), round(r.ulush * r.sh, 6) - coalesce(fm.fh, 0), r.ulush
    from r left join fk fm on fm.qator_id = r.qid
   where round(r.ulush * r.sh, 6) - coalesce(fm.fh, 0) <> 0
     and not exists (select 1 from baj where baj.qator_id = r.qid or baj.qator_id = r.minus_id)
   order by r.minus_id, r.qid
$f$;
revoke all on function public._t2_fakt_minus_hisob_v1(bigint, jsonb, boolean) from public, anon, authenticated;
grant execute on function public._t2_fakt_minus_hisob_v1(bigint, jsonb, boolean) to service_role;

create or replace function public._t2_fakt_minus_ergash_v1(p_obyekt_id bigint, p_qatorlar jsonb)
returns jsonb language plpgsql stable set search_path = public, pg_temp as $f$
declare v_delta jsonb; v_ids bigint[]; v_out jsonb;
begin
  if p_qatorlar is null or jsonb_typeof(p_qatorlar) <> 'array' or jsonb_array_length(p_qatorlar) = 0 then return '[]'::jsonb; end if;
  if not exists (select 1 from public.t2_qator z where z.obyekt_id = p_obyekt_id and z.tur = 'bl' and z.hajm < 0 and z.versiya_holat = 'faol') then return '[]'::jsonb; end if;
  -- Faqat to'g'ri shakldagi qo'lda qatorlar asos bo'lishi mumkin (nusxa/F2/o'chirilganlar emas).
  select coalesce(jsonb_object_agg(t.k, t.s), '{}'::jsonb) into v_delta
    from (select x ->> 'qator_id' as k, sum((x ->> 'hajm')::numeric) as s
            from jsonb_array_elements(p_qatorlar) x
           where coalesce(x ->> 'qator_id', '') ~ '^[1-9][0-9]*$' and coalesce(x ->> 'hajm', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
             and not (x ? 'manba_akt_qator_id') and coalesce(btrim(x ->> 'narx_manba'), '') <> 'f2_sertifikat'
             and coalesce(x ->> 'minus_juft', 'true') <> 'false'
           group by 1) t;
  if v_delta = '{}'::jsonb then return '[]'::jsonb; end if;
  select coalesce(array_agg((x ->> 'qator_id')::bigint), '{}') into v_ids
    from jsonb_array_elements(p_qatorlar) x where coalesce(x ->> 'qator_id', '') ~ '^[1-9][0-9]*$';
  select coalesce(jsonb_agg(jsonb_build_object('qator_id', h.qator_id, 'hajm', h.farq, 'izoh', 'minus juft', 'minus_juft', false) order by h.minus_id, h.qator_id), '[]'::jsonb)
    into v_out
    from public._t2_fakt_minus_hisob_v1(p_obyekt_id, v_delta, true) h
   where not (h.qator_id = any(v_ids)) and not (h.minus_id = any(v_ids));
  return v_out;
end $f$;
revoke all on function public._t2_fakt_minus_ergash_v1(bigint, jsonb) from public, anon, authenticated;
grant execute on function public._t2_fakt_minus_ergash_v1(bigint, jsonb) to service_role;

-- t2_fakt_yoz: asl tana (prod) o'zgarmagan, faqat MINUS juft qatorlari qo'shiladi.
create or replace function public.t2_fakt_yoz(p_obyekt_id bigint, p_sana date, p_qatorlar jsonb, p_kim text default null::text,
  p_operation_id uuid default null::uuid, p_izoh text default null::text, p_raqam text default null::text)
returns jsonb language plpgsql set search_path to 'public', 'pg_temp' as $function$
declare v_r jsonb; v_akt bigint; v_raqam text; v_n int; v_extra jsonb; v_qat jsonb := p_qatorlar; v_minus int := 0;
begin
  if p_sana is null then
    return jsonb_build_object('ok',false,'xabar','Sana ko''rsatilmagan');
  end if;

  /* MINUS juft: asos qatorga fakt yozilsa, uning «normaga keltirish» (hajm<0) jufti shu aktga ulush bo'yicha qo'shiladi. */
  v_extra := public._t2_fakt_minus_ergash_v1(p_obyekt_id, p_qatorlar);
  if jsonb_array_length(v_extra) > 0 then
    v_qat := p_qatorlar || v_extra;
    v_minus := jsonb_array_length(v_extra);
  end if;

  /* Raqam berilmasa — sanaga bog'langan tartib raqami yasaymiz.
     Bir kunda bir necha kiritish bo'lishi mumkin (ertalab/kechqurun). */
  if coalesce(btrim(p_raqam),'') <> '' then
    v_raqam := btrim(p_raqam);
  else
    select count(*) + 1 into v_n
    from t2_akt
    where obyekt_id = p_obyekt_id and tur = 'fakt' and sana = p_sana;
    v_raqam := 'F' || to_char(p_sana,'YYYYMMDD') || '-' || lpad(v_n::text, 2, '0');
  end if;

  v_r := t2_akt_yarat(
           p_obyekt_id, 'fakt', date_trunc('month', p_sana)::date, v_qat,
           v_raqam, p_operation_id, 'fakt_kiritish', p_kim);

  if coalesce((v_r->>'ok')::boolean, false) and not coalesce((v_r->>'takror')::boolean,false) then
    v_akt := (v_r->>'akt_id')::bigint;
    update t2_akt
       set sana = p_sana,
           izoh = trim(both ' |' from coalesce(izoh,'') ||
                       case when p_izoh is not null then ' | '||p_izoh else '' end ||
                       case when v_minus > 0 then ' | minus juft: '||v_minus||' qator' else '' end)
     where id = v_akt;
    v_r := v_r || jsonb_build_object('sana', p_sana, 'raqam', v_raqam, 'minus_juft_soni', v_minus);
  end if;

  return v_r;
end $function$;
