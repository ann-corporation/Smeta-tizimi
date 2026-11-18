-- Qabul (BEGIN..ROLLBACK): 20270104000000 qo'llangandan KEYIN. Hech narsa saqlanmaydi, sun'iy ma'lumot yaratmaydi (faqat mavjudni o'qiydi).
-- Muvaffaqiyat: NOTICE 'F2_MUMKIN_ISHORALI_PASS'. To'liq zanjir (smeta -> fakt -> F2 qoralama) — supabase/tests/t2_f2_minus_qator_contract.sql.
begin;
set local statement_timeout = '300s';
do $acc$
declare
  v_ob bigint; v_bad bigint; v_n bigint; v_neg bigint;
begin
  -- 1) yordamchi funksiyalar: haqiqat jadvali.
  if public._t2_f2_manfiy_v1(-5, null, null) is not true or public._t2_f2_manfiy_v1(5, -1, -1) is not false
     or public._t2_f2_manfiy_v1(0, -1, 0) is not true or public._t2_f2_manfiy_v1(null, 0, -2) is not true
     or public._t2_f2_manfiy_v1(null, 3, 0) is not false or public._t2_f2_manfiy_v1(null, null, null) is not false then
    raise exception 'F2_MUMKIN_ISHORALI: _t2_f2_manfiy_v1 haqiqat jadvali buzilgan';
  end if;
  if public._t2_f2_mumkin_v1(-5, true) is distinct from -5 or public._t2_f2_mumkin_v1(3, true) is distinct from 0
     or public._t2_f2_mumkin_v1(-5, false) is distinct from 0 or public._t2_f2_mumkin_v1(5, false) is distinct from 5
     or public._t2_f2_mumkin_v1(null, true) is distinct from 0 or public._t2_f2_mumkin_v1(null, false) is distinct from 0 then
    raise exception 'F2_MUMKIN_ISHORALI: _t2_f2_mumkin_v1 haqiqat jadvali buzilgan';
  end if;

  -- 2) ta'riflar yangi ifodani o'z ichiga oladi (view + funksiya), eskisi yo'q.
  if position('_t2_f2_mumkin_v1(' in pg_get_viewdef('public.t2_qator_holat'::regclass)) = 0
     or position('GREATEST(e.fakt_hajm - d.f2_hajm' in pg_get_viewdef('public.t2_qator_holat'::regclass)) > 0 then
    raise exception 'F2_MUMKIN_ISHORALI: t2_qator_holat view yamoqsiz';
  end if;
  if position('_t2_f2_mumkin_v1(' in pg_get_functiondef('public._t2_qator_holat_v2(bigint[])'::regprocedure)) = 0 then
    raise exception 'F2_MUMKIN_ISHORALI: _t2_qator_holat_v2 yamoqsiz';
  end if;

  -- 3) MINUS qatorli obyekt: (a) plyus qatorlarda f2_mumkin eski formula (GREATEST(fakt-f2,0)) bilan AYNAN teng,
  --    (b) MINUS qatorda f2_mumkin <= 0 va |f2_mumkin| <= |fakt - f2|, hech qachon musbat emas,
  --    (c) bor MINUS qatorlarning kamida bittasi fakt bilan manfiy mumkin beradi (aks holda tekshiruv ma'nosiz — NOTICE).
  select q.obyekt_id into v_ob from public.t2_qator q where q.hajm < 0 and q.versiya_holat = 'faol' and q.tur in ('rs', 'mat', 'ob', 'bl')
   group by q.obyekt_id order by count(*) desc limit 1;
  if v_ob is null then
    raise notice 'F2_MUMKIN_ISHORALI SKIP: bazada MINUS qator yo''q (funksiya/ta''rif tekshiruvi o''tdi)';
  else
    select count(*) into v_bad
      from public.t2_qator_holat h join public.t2_qator q on q.id = h.qator_id
     where h.obyekt_id = v_ob and q.versiya_holat = 'faol' and h.tur in ('bl', 'rs', 'mat', 'ob')
       and q.hajm >= 0 and h.f2_mumkin_hajm is distinct from greatest(h.fakt_hajm - h.f2_hajm, 0::numeric);
    if v_bad <> 0 then raise exception 'F2_MUMKIN_ISHORALI: obyekt % da % plyus qatorda f2_mumkin eski formuladan farq qiladi', v_ob, v_bad; end if;
    select count(*) into v_n from public.t2_qator_holat h join public.t2_qator q on q.id = h.qator_id
     where h.obyekt_id = v_ob and q.hajm < 0 and q.versiya_holat = 'faol' and h.tur in ('bl', 'rs', 'mat', 'ob') and (h.f2_mumkin_hajm > 0 or h.f2_mumkin_hajm is null);
    if v_n <> 0 then raise exception 'F2_MUMKIN_ISHORALI: obyekt % da % MINUS qatorda f2_mumkin musbat/NULL', v_ob, v_n; end if;
    select count(*) into v_neg from public.t2_qator_holat h join public.t2_qator q on q.id = h.qator_id
     where h.obyekt_id = v_ob and q.hajm < 0 and q.versiya_holat = 'faol' and h.fakt_hajm < 0 and h.f2_hajm = 0;
    select count(*) into v_n from public.t2_qator_holat h join public.t2_qator q on q.id = h.qator_id
     where h.obyekt_id = v_ob and q.hajm < 0 and q.versiya_holat = 'faol' and h.fakt_hajm < 0 and h.f2_hajm = 0 and h.f2_mumkin_hajm = h.fakt_hajm;
    if v_n <> v_neg then raise exception 'F2_MUMKIN_ISHORALI: obyekt % da faktli, F2 siz MINUS qatorlar % ta, ularning mumkin = fakt faqat % ta', v_ob, v_neg, v_n; end if;
    raise notice 'F2_MUMKIN_ISHORALI obyekt %: faktli F2siz MINUS qator % ta — hammasi mumkin = fakt', v_ob, v_neg;
  end if;
  raise notice 'F2_MUMKIN_ISHORALI_PASS';
end
$acc$;
rollback;
