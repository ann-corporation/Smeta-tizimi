-- Rollback: usta «Bugun». Qoralama ma'lumot yo'qoladi (haqiqiy fakt aktlari t2_akt da qoladi).
drop function if exists public.t2_usta_zayavka_v1(bigint,bigint,bigint,text,numeric,text,date,text,uuid);
drop function if exists public.t2_usta_fakt_qaror_v1(bigint,bigint,bigint[],text,text,uuid);
drop function if exists public.t2_usta_fakt_qoralama_v1(bigint,bigint,bigint,date,jsonb,text,bigint,uuid);
drop table if exists public.t2_usta_fakt_qoralama;
