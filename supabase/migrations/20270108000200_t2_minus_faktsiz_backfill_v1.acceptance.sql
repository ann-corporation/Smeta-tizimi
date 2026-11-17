-- Qabul (FAQAT O'QISH, hech narsa yozmaydi; BEGIN/COMMIT/ROLLBACK yo'q): 20270108000000/100/200 qo'llangandan KEYIN.
-- Muvaffaqiyat: NOTICE 'MINUS_JUFT_ACCEPTANCE_PASS'. To'liq yozish zanjiri — supabase/tests/t2_minus_fakt_ergashish_contract.sql (chaqiruvchi o'raydi).
do $acc$
declare
  v_ob bigint; v_bad bigint; v_n bigint; v_aniq bigint; v_noaniq bigint; v_juftsiz bigint;
begin
  -- 1) kod/havola normallashtirish: haqiqat jadvali.
  if public._t2_norma_kalit_v1('E15-2-19-12 SHNK K=7') is distinct from '15-2-19-12'
     or public._t2_norma_kalit_v1(U&'\0415' || '1502-019-11 K=7') is distinct from '15-2-19-11'
     or public._t2_norma_kalit_v1('E6-1-97-1') is distinct from '6-1-97-1'
     or public._t2_norma_kalit_v1(null) is not null or public._t2_norma_kalit_v1('C124-22') is not null then
    raise exception 'MINUS_JUFT_ACCEPTANCE: _t2_norma_kalit_v1 haqiqat jadvali buzilgan';
  end if;
  if public._t2_norma_havolalar_v1('K 15-02-19-07: ZA 7') is distinct from array['15-2-19-7']
     or cardinality(public._t2_norma_havolalar_v1('USTANOVKA')) <> 0 then
    raise exception 'MINUS_JUFT_ACCEPTANCE: _t2_norma_havolalar_v1 haqiqat jadvali buzilgan';
  end if;

  -- 2) Eng ko'p MINUS qatorli obyektda juftlash invariantlari.
  select q.obyekt_id into v_ob from public.t2_qator q where q.tur = 'bl' and q.hajm < 0 and q.versiya_holat = 'faol' group by q.obyekt_id order by count(*) desc limit 1;
  if v_ob is null then
    raise notice 'MINUS_JUFT_ACCEPTANCE SKIP: bazada MINUS BL qator yo''q (funksiya/ta''rif tekshiruvi o''tdi)';
  else
    select count(*) filter (where holat = 'aniq'), count(*) filter (where holat = 'noaniq'), count(*) filter (where holat = 'juftsiz'), count(*)
      into v_aniq, v_noaniq, v_juftsiz, v_n from public.t2_fakt_minus_juft_v1(v_ob);
    if v_n <> (select count(*) from public.t2_qator q where q.obyekt_id = v_ob and q.tur = 'bl' and q.hajm < 0 and q.versiya_holat = 'faol') then
      raise exception 'MINUS_JUFT_ACCEPTANCE: obyekt % — har MINUS qator aynan bitta satr berishi kerak', v_ob;
    end if;
    select count(*) into v_bad
      from public.t2_fakt_minus_juft_v1(v_ob) j join public.t2_qator m on m.id = j.minus_id left join public.t2_qator b on b.id = j.baza_id
     where j.holat = 'aniq' and (b.id is null or b.hajm <= 0 or b.tur <> 'bl' or b.obyekt_id <> v_ob or b.ota_id is distinct from m.ota_id
                                 or b.tartib >= m.tartib or b.versiya_holat <> 'faol');
    if v_bad <> 0 then raise exception 'MINUS_JUFT_ACCEPTANCE: obyekt % da % ta aniq juft invariantni buzadi (asos musbat BL, shu bo''lim, oldin, faol)', v_ob, v_bad; end if;
    select count(*) into v_bad from public.t2_fakt_minus_juft_v1(v_ob) j where (j.holat = 'aniq') <> (j.baza_id is not null) or (j.holat = 'noaniq' and cardinality(j.nomzodlar) < 2);
    if v_bad <> 0 then raise exception 'MINUS_JUFT_ACCEPTANCE: obyekt % da holat/baza_id nomuvofiq', v_ob; end if;

    -- 3) Ko'rish funksiyasi faqat yetishmaydigan (magnituda oshadigan) qismni qaytaradi va yozmaydi.
    select count(*) into v_bad from public.t2_fakt_minus_korik_v1(v_ob) k where k.farq * k.smeta_hajm <= 0 or k.farq = 0;
    if v_bad <> 0 then raise exception 'MINUS_JUFT_ACCEPTANCE: obyekt % da ko''rishda % ta qator yetishmayotgan emas', v_ob, v_bad; end if;
    raise notice 'MINUS_JUFT_ACCEPTANCE obyekt %: MINUS % ta (aniq %, noaniq %, juftsiz %), faktsiz juft qatorlar %',
      v_ob, v_n, v_aniq, v_noaniq, v_juftsiz, (select count(*) from public.t2_fakt_minus_korik_v1(v_ob));
  end if;

  -- 4) t2_fakt_yoz MINUS juft ilgagini o'z ichiga oladi.
  if position('_t2_fakt_minus_ergash_v1(' in pg_get_functiondef('public.t2_fakt_yoz(bigint,date,jsonb,text,uuid,text,text)'::regprocedure)) = 0 then
    raise exception 'MINUS_JUFT_ACCEPTANCE: t2_fakt_yoz MINUS juft ilgagi yo''q (20270108000100 qo''llanganmi?)';
  end if;
  raise notice 'MINUS_JUFT_ACCEPTANCE_PASS';
end
$acc$;
