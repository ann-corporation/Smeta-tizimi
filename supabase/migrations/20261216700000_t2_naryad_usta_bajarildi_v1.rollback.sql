-- Rollback: usta qisman «Bajardim». Usta izohlari yo'qoladi.
drop function if exists public.t2_naryad_usta_bajarildi_v1(bigint,bigint,uuid,bigint,integer,jsonb,boolean,text);

create or replace function public._t2_naryad_json(p_id bigint)
 returns jsonb
 language sql
 stable
 set search_path to 'public', 'pg_temp'
as $function$
  select jsonb_build_object(
    'id', n.id, 'obyekt_id', n.obyekt_id, 'obyekt_nom', o.nom, 'raqam', n.raqam, 'davr_dan', n.davr_dan, 'davr_gacha', n.davr_gacha,
    'usta_nom', n.usta_nom, 'usta_kontragent_id', n.usta_kontragent_id, 'usta_foydalanuvchi_id', n.usta_foydalanuvchi_id, 'brigada', n.brigada, 'holat', n.holat, 'izoh', n.izoh,
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

alter table public.t2_naryad drop column if exists usta_izoh;
