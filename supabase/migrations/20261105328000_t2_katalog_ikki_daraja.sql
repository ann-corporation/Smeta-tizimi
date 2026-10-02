-- Katalog 1 kv. 2026 (213 691 qator) haqiqiy tuzilishi: IKKI darajali sarlavha — zavod ("17. ООО "…". (НДС 12%)
-- Руководитель… Адрес: г. Ташкент…") va uning ostida mahsulot guruhi ("Трубы стальные… ГОСТ…"). Parser endi zavod
-- sarlavhasini alohida `zavod` maydonida yuboradi; yozuvchi zavodni undan oladi (bo'lmasa — guruh dan, eski yo'l).
-- Har qator uchun _t2_katalog_zavod 3 marta emas, BIR marta (lateral) — 5000 qatorlik bo'lak ~20 s edi.
-- Lotin yozuvidagi MChJ ("ASILL METALL" MCHJ), LLC, JV ham tashkilot deb taniladi.
begin;

do $$
declare v_def text; r record;
begin
  -- 1) _t2_katalog_zavod: lotincha tashkilot shakllari.
  v_def := pg_get_functiondef('public._t2_katalog_zavod(text)'::regprocedure);
  if (length(v_def) - length(replace(v_def, 'МЧЖ|QK', ''))) / length('МЧЖ|QK') <> 1 then
    raise exception 'KATALOG_IKKI_DARAJA: _t2_katalog_zavod tashkilot ro''yxati topilmadi';
  end if;
  execute replace(v_def, 'МЧЖ|QK', 'МЧЖ|MCHJ|LLC|JV|QK');

  -- 2) _t2_narx_manba_yoz: zavod — `zavod` maydonidan, bir marta hisoblanadi.
  v_def := pg_get_functiondef('public._t2_narx_manba_yoz(bigint, jsonb, jsonb, text, bigint, integer, uuid, text)'::regprocedure);
  for r in select * from (values
    ($a$coalesce(nullif(trim(x.e->>'hudud'), ''), public._t2_katalog_zavod(x.e->>'guruh')->>'hudud'), coalesce(nullif(trim(x.e->>'ishlab_chiqaruvchi'), ''), public._t2_katalog_zavod(x.e->>'guruh')->>'nom'),$a$,
     $b$coalesce(nullif(trim(x.e->>'hudud'), ''), zz.z->>'hudud'), coalesce(nullif(trim(x.e->>'ishlab_chiqaruvchi'), ''), zz.z->>'nom'),$b$),
    ($a$coalesce(nullif(trim(x.e->>'nds_izoh'), ''), public._t2_katalog_zavod(x.e->>'guruh')->>'nds'),$a$,
     $b$coalesce(nullif(trim(x.e->>'nds_izoh'), ''), zz.z->>'nds'),$b$),
    ($a$from jsonb_array_elements(p_qatorlar) with ordinality as x(e, n)$a$,
     $b$from jsonb_array_elements(p_qatorlar) with ordinality as x(e, n)
    cross join lateral (select public._t2_katalog_zavod(coalesce(nullif(trim(x.e->>'zavod'), ''), x.e->>'guruh')) as z) zz$b$)
  ) as t(eski, yangi) loop
    if (length(v_def) - length(replace(v_def, r.eski, ''))) / length(r.eski) <> 1 then
      raise exception 'KATALOG_IKKI_DARAJA: kutilgan matn aniq 1 marta topilmadi: %', left(r.eski, 80);
    end if;
    v_def := replace(v_def, r.eski, r.yangi);
  end loop;
  execute v_def;
end $$;

commit;
