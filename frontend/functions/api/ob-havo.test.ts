import { describe, expect, it } from 'vitest';
import { ochiMeteoNatija, ochiMeteoUrl } from './ob-havo';

describe('ob-havo shlyuzi', () => {
  it('URL: koordinata 2 xonaga yaxlitlanadi; yaqin sana — prognoz API, 90 kundan eski — arxiv', () => {
    const bugun = new Date('2026-11-12T10:00:00Z');
    const yaqin = ochiMeteoUrl(40.1234, 65.3789, '2026-11-10', bugun);
    expect(yaqin).toContain('api.open-meteo.com/v1/forecast');
    expect(yaqin).toContain('latitude=40.12'); expect(yaqin).toContain('longitude=65.38');
    expect(yaqin).toContain('start_date=2026-11-10');
    expect(ochiMeteoUrl(40, 65, '2026-05-01', bugun)).toContain('archive-api.open-meteo.com/v1/archive');
  });
  it('natija: noma‘lum qiymat null (0 emas); sana mos kelmasa — null', () => {
    const j = { daily: { time: ['2026-11-10'], temperature_2m_max: [11.4], temperature_2m_min: [null], precipitation_sum: [0], wind_speed_10m_max: [18], weather_code: [3] } };
    expect(ochiMeteoNatija(j, '2026-11-10')).toEqual({ ok: true, sana: '2026-11-10', harorat_min: null, harorat_max: 11.4, yogin_mm: 0, shamol_max: 18, kod: 3, manba: 'open-meteo' });
    expect(ochiMeteoNatija(j, '2026-11-11')).toBeNull();
    expect(ochiMeteoNatija(null, '2026-11-10')).toBeNull();
  });
});
