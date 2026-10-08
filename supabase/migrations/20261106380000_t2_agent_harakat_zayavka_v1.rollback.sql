-- Rollback: 20261106380000_t2_agent_harakat_zayavka_v1
delete from public.t2_agent_harakat where amal = 'zayavka_yarat';
update public.t2_agent_kasb set harakatlar = array_remove(harakatlar, 'zayavka_yarat');
alter table public.t2_agent_harakat drop constraint if exists t2_agent_harakat_amal_check;
alter table public.t2_agent_harakat add constraint t2_agent_harakat_amal_check check (amal in ('ombor_kirim','ombor_chiqim','grafik_foiz','eslatma'));
create or replace function public.t2_agent_harakat_taklif_v1(p_actor_id bigint, p_kompaniya_id bigint, p_jurnal bigint, p_amal text, p_param jsonb, p_tushuntirish text, p_aniq boolean)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare g jsonb; k public.t2_agent_kasb%rowtype; sz public.t2_agent_shaxsiy_sozlama%rowtype;
  v_p jsonb; v_xavf text; v_avto boolean := false; v_ogoh text; v_id bigint; v_ob bigint; v_nomi text; v_bir text; v_hajm numeric; v_sana date; v_q numeric; v_gq public.t2_grafik_qator%rowtype; v_foiz numeric; v_kalit text; v_mazmun text;
begin
  if p_kompaniya_id is null then return jsonb_build_object('ok', false, 'code', 'KOMPANIYA_KERAK'); end if;
  g := public.t2_agent_scope_guard_v1(p_actor_id, p_kompaniya_id);
  if not (g->>'ok')::boolean then return g; end if;
  select * into k from t2_agent_kasb where rol = g->>'rol';
  if not found or not (p_amal = any(k.harakatlar)) then return jsonb_build_object('ok', false, 'code', 'HARAKAT_RUXSATSIZ', 'xabar', 'Bu harakat sizning lavozimingiz uchun ruxsat etilmagan'); end if;
  if p_param is null or jsonb_typeof(p_param) <> 'object' then return jsonb_build_object('ok', false, 'code', 'PARAM_INVALID'); end if;
  if p_jurnal is not null and not exists (select 1 from t2_agent_jurnal where id = p_jurnal and actor_id = p_actor_id and kompaniya_id = p_kompaniya_id) then return jsonb_build_object('ok', false, 'code', 'JURNAL_BEGONA'); end if;

  if p_amal in ('ombor_kirim', 'ombor_chiqim') then
    begin v_ob := (p_param->>'obyekt_id')::bigint; v_hajm := (p_param->>'obyomi')::numeric; v_sana := coalesce(nullif(p_param->>'sana', '')::date, current_date);
    exception when others then return jsonb_build_object('ok', false, 'code', 'PARAM_INVALID', 'xabar', 'Qiymatlar noto''g''ri formatda'); end;
    v_nomi := btrim(coalesce(p_param->>'nomi', '')); v_bir := btrim(coalesce(p_param->>'birligi', ''));
    if not exists (select 1 from t2_obyekt where id = v_ob and kompaniya_id = p_kompaniya_id and holat = 'faol') then return jsonb_build_object('ok', false, 'code', 'OBYEKT_BEGONA', 'xabar', 'Obyekt topilmadi'); end if;
    if length(v_nomi) not between 2 and 120 or length(v_bir) not between 1 and 20 or v_hajm is null or v_hajm <= 0 or v_hajm > 10000000 or v_sana < current_date - 60 or v_sana > current_date + 1 then
      return jsonb_build_object('ok', false, 'code', 'PARAM_INVALID', 'xabar', 'Nomi, birligi, miqdori (>0) va sanasi (oxirgi 60 kun) to''g''ri bo''lishi kerak');
    end if;
    v_p := jsonb_build_object('obyekt_id', v_ob, 'turi', coalesce(nullif(btrim(p_param->>'turi'), ''), 'material'), 'nomi', v_nomi, 'birligi', v_bir, 'obyomi', v_hajm, 'sana', v_sana, 'izoh', left(nullif(btrim(coalesce(p_param->>'izoh', '')), ''), 300));
    v_xavf := 'orta';
    if p_amal = 'ombor_chiqim' then
      select coalesce(sum(case when operatsiya = 'prixod' then obyomi else -obyomi end), 0) into v_q from t2_sklad_harakat
       where kompaniya_id = p_kompaniya_id and obyekt_id = v_ob and lower(nomi) = lower(v_nomi) and lower(birligi) = lower(v_bir) and coalesce(holat, 'faol') <> 'bekor';
      if v_hajm > v_q then v_xavf := 'yuqori'; v_ogoh := format('Omborda %s %s qolgan, siz %s %s chiqim qilmoqchisiz — qoldiq manfiy bo''ladi', v_q, v_bir, v_hajm, v_bir); end if;
    end if;
  elsif p_amal = 'grafik_foiz' then
    begin v_foiz := (p_param->>'foiz')::numeric; exception when others then return jsonb_build_object('ok', false, 'code', 'PARAM_INVALID'); end;
    select * into v_gq from t2_grafik_qator where id = nullif(p_param->>'grafik_id', '')::bigint and kompaniya_id = p_kompaniya_id and coalesce(faol, true);
    if not found or v_foiz is null or v_foiz < 0 or v_foiz > 100 then return jsonb_build_object('ok', false, 'code', 'PARAM_INVALID', 'xabar', 'Grafik qatori topilmadi yoki foiz 0–100 emas'); end if;
    v_p := jsonb_build_object('grafik_id', v_gq.id, 'nom', v_gq.nom, 'eski_foiz', v_gq.foiz, 'foiz', v_foiz, 'kutilgan_versiya', v_gq.versiya);
    v_xavf := 'orta';
    if v_foiz < coalesce(v_gq.foiz, 0) then v_ogoh := format('Foiz kamaytirilmoqda: %s → %s', coalesce(v_gq.foiz, 0), v_foiz); end if;
  else
    v_kalit := lower(btrim(coalesce(p_param->>'kalit', ''))); v_mazmun := btrim(coalesce(p_param->>'mazmun', ''));
    if v_kalit !~ '^[a-z0-9_.-]{2,80}$' or length(v_mazmun) not between 1 and 1000 then return jsonb_build_object('ok', false, 'code', 'PARAM_INVALID', 'xabar', 'Eslatma kaliti va matni kerak'); end if;
    v_p := jsonb_build_object('kalit', v_kalit, 'mazmun', v_mazmun);
    v_xavf := 'past';
  end if;

  select * into sz from t2_agent_shaxsiy_sozlama where actor_id = p_actor_id;
  -- Ishonch: 'sora' — hech qachon avto; 'jiddiy' (standart) — faqat past xavf; 'avto' — past va o'rta (faqat aniq so'rovda). Yuqori xavf — HAR DOIM so'raladi.
  v_avto := coalesce(p_aniq, false) and v_ogoh is null and case coalesce(sz.ishonch, 'jiddiy') when 'avto' then v_xavf in ('past', 'orta') when 'jiddiy' then v_xavf = 'past' else false end;
  insert into t2_agent_harakat (jurnal_id, kompaniya_id, actor_id, amal, parametrlar, tushuntirish, xavf, avto, ogohlantirish)
  values (p_jurnal, p_kompaniya_id, p_actor_id, p_amal, v_p, left(p_tushuntirish, 400), v_xavf, v_avto, v_ogoh) returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'amal', p_amal, 'parametrlar', v_p, 'xavf', v_xavf, 'avto', v_avto, 'ogohlantirish', v_ogoh, 'tushuntirish', left(p_tushuntirish, 400));
end $$;
