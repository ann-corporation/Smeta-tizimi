-- Teskari: t2_fakt_yoz asl tanasi (MINUS juft qo'shishsiz) tiklanadi, yordamchi funksiyalar olinadi. BEGIN/COMMIT yo'q.
create or replace function public.t2_fakt_yoz(p_obyekt_id bigint, p_sana date, p_qatorlar jsonb, p_kim text default null::text,
  p_operation_id uuid default null::uuid, p_izoh text default null::text, p_raqam text default null::text)
returns jsonb language plpgsql set search_path to 'public', 'pg_temp' as $function$
declare v_r jsonb; v_akt bigint; v_raqam text; v_n int;
begin
  if p_sana is null then
    return jsonb_build_object('ok',false,'xabar','Sana ko''rsatilmagan');
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
           p_obyekt_id, 'fakt', date_trunc('month', p_sana)::date, p_qatorlar,
           v_raqam, p_operation_id, 'fakt_kiritish', p_kim);

  if coalesce((v_r->>'ok')::boolean, false) and not coalesce((v_r->>'takror')::boolean,false) then
    v_akt := (v_r->>'akt_id')::bigint;
    update t2_akt
       set sana = p_sana,
           izoh = trim(both ' |' from coalesce(izoh,'') ||
                       case when p_izoh is not null then ' | '||p_izoh else '' end)
     where id = v_akt;
    v_r := v_r || jsonb_build_object('sana', p_sana, 'raqam', v_raqam);
  end if;

  return v_r;
end $function$;
drop function if exists public._t2_fakt_minus_ergash_v1(bigint, jsonb);
drop function if exists public._t2_fakt_minus_hisob_v1(bigint, jsonb, boolean);
