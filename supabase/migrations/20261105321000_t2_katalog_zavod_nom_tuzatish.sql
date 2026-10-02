-- Tuzatish: _t2_katalog_zavod nomni ochko'z kesardi (Postgres ARE: birinchi kvantor ochko'z bo'lsa butun ifoda ochko'z) —
-- 'ООО "Нукус ТББЗ". (НДС 12%) Руководитель: …' to'liq nom bo'lib qolardi. Endi nom birinchi ". (", ". Руковод",
-- " Руковод" yoki ". Адрес" gacha kesiladi; mahsulot guruhi sarlavhasiga ham QQS izohi beriladi. Eski katalog qayta boyitiladi.
begin;

create or replace function public._t2_katalog_zavod(p text) returns jsonb language plpgsql immutable as $$
declare t text := regexp_replace(coalesce(p, ''), '\s+', ' ', 'g'); v_rest text; v_nom text; v_nds text; v_adr text; v_hudud text; v_kes int; v_p int; v_belgi text;
begin
  if t !~ '^\s*\d+\.\s' or t !~* '(ООО|OOO|ОАО|АО|АЖ|ЧП|ИП|СП|ХК|ДП|УП|ГУП|МЧЖ|QK|XK|AJ|ЧФ|ФХ|Корхона|Компания|завод|комбинат)' then return null; end if;
  v_rest := regexp_replace(t, '^\s*\d+\.\s*', '');
  v_kes := length(v_rest) + 1;
  foreach v_belgi in array array['. (', '. Руковод', ' Руковод', '. Адрес', ' Адрес:', '. Тел'] loop
    v_p := strpos(v_rest, v_belgi);
    if v_p > 0 and v_p < v_kes then v_kes := v_p; end if;
  end loop;
  v_nom := btrim(left(v_rest, v_kes - 1), ' .');
  v_nds := substring(t from '\(((?:без )?НДС[^)]*)\)');
  v_adr := substring(t from 'Адрес:\s*([^Т]*)');
  v_adr := regexp_replace(coalesce(v_adr, ''), '\s*Тел.*$', '');
  v_hudud := coalesce(
    'г. ' || btrim(substring(v_adr from 'г\.\s*([А-ЯЁA-Z][^,.]*)')),
    btrim(substring(v_adr from '([^,.]*район)')),
    btrim(substring(v_adr from '([^,.]*обл[^,.]*)')),
    btrim(substring(v_adr from '([^,.]*(?:Каракалпак|Ташкент)[^,.]*)')));
  return jsonb_build_object('nom', nullif(v_nom, ''), 'nds', v_nds, 'hudud', v_hudud);
end $$;

-- Eski katalog (izoh JSON siz): qayta boyitish.
do $$
declare m record; r record; v_z jsonb; v_zavod text; v_nds text; v_hudud text; v_guruh text;
begin
  for m in select distinct mq.manba_id from public.t2_narx_manba_qator mq join public.t2_narx_manba nm on nm.id = mq.manba_id
            where nm.tur = 'katalog' and mq.izoh is null loop
    v_zavod := null; v_nds := null; v_hudud := null; v_guruh := null;
    for r in select id, nom, narx from public.t2_narx_manba_qator where manba_id = m.manba_id order by tartib, id loop
      v_z := public._t2_katalog_zavod(r.nom);
      if v_z is not null and r.narx is null then
        v_zavod := v_z->>'nom'; v_nds := v_z->>'nds'; v_hudud := v_z->>'hudud'; v_guruh := null;
        update public.t2_narx_manba_qator set sarlavha = true, ishlab_chiqaruvchi = v_zavod, nds_izoh = v_nds, hudud = v_hudud, guruh = null where id = r.id;
      elsif r.narx is null then
        v_guruh := btrim(regexp_replace(r.nom, '\s+', ' ', 'g'));
        update public.t2_narx_manba_qator set sarlavha = true, guruh = v_guruh, ishlab_chiqaruvchi = v_zavod, nds_izoh = v_nds, hudud = v_hudud where id = r.id;
      else
        update public.t2_narx_manba_qator set ishlab_chiqaruvchi = v_zavod, nds_izoh = v_nds, hudud = coalesce(v_hudud, hudud), guruh = v_guruh where id = r.id;
      end if;
    end loop;
  end loop;
end $$;

-- Yangi import yo'li (izoh JSON dagi guruh) — zavod nomi qayta.
update public.t2_narx_manba_qator q set
  ishlab_chiqaruvchi = public._t2_katalog_zavod(s.j->>'guruh')->>'nom',
  nds_izoh = coalesce(public._t2_katalog_zavod(s.j->>'guruh')->>'nds', q.nds_izoh)
from (select id, public._t2_json_xavfsiz(izoh) j from public.t2_narx_manba_qator) s
where s.id = q.id and s.j is not null and public._t2_katalog_zavod(s.j->>'guruh') is not null;

commit;
