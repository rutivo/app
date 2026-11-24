// El tiempo del asistente: donde estás (GPS) o el sitio que digas; sin permiso,
// tu ciudad y se avisa. A los servicios solo llegan coordenadas redondeadas.
// Uso: node tests/e2e/tiempo.e2e.cjs
const { chromium } = require('playwright');
const { serveApp } = require('./firebase-falso.cjs');

const res = [];
const ok = (n, c, extra = '') => { res.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (extra ? ' — ' + extra : '')); };
const METEO = { current: { temperature_2m: 9.4, weather_code: 3, wind_speed_10m: 8 }, daily: { weather_code: [3, 61], temperature_2m_min: [4, 5], temperature_2m_max: [13, 12], precipitation_probability_max: [10, 70] } };

async function run(browser, app, { geo, perm }) {
  const ctx = await browser.newContext({ locale: 'es-ES', viewport: { width: 390, height: 844 }, ...(geo ? { geolocation: geo } : {}), permissions: perm });
  const calls = [];
  await ctx.route('**/*', (r) => {
    const u = new URL(r.request().url());
    if (u.pathname.endsWith('/js/config.js')) return r.fulfill({ contentType: 'text/javascript', body: "export const FIREBASE_CONFIG=null;export const FIREBASE_SDK='';export const FLIGHT_API='';export const PUSH_PUBLIC_KEY='';export const APP_CHECK_SITE_KEY='';" });
    const json = (o) => r.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(o) });
    if (u.hostname === 'api.open-meteo.com') { calls.push('meteo ' + u.searchParams.get('latitude') + ',' + u.searchParams.get('longitude')); return json(METEO); }
    if (u.hostname === 'nominatim.openstreetmap.org') { calls.push('nombre ' + u.searchParams.get('lat') + ',' + u.searchParams.get('lon')); return json({ address: { city: 'Madrid' } }); }
    if (u.hostname === 'geocoding-api.open-meteo.com') { const n = u.searchParams.get('name'); calls.push('ciudad ' + n); return json({ results: [{ name: n, latitude: n === 'Sevilla' ? 37.39 : 36.72, longitude: n === 'Sevilla' ? -5.98 : -4.42 }] }); }
    return u.hostname === '127.0.0.1' ? r.continue() : r.abort();
  });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  await page.addInitScript(() => {
    for (const [k, v] of [['tipInstall', '1'], ['legalAcepta', '1'], ['lastBackup', String(Date.now())], ['oyeRutivo', '0'], ['asisOido', '0'], ['asisDictado', '1'], ['asisVoz', '0']]) localStorage.setItem(k, v);
  });
  await page.goto(app.url);
  await page.waitForTimeout(800);
  await page.click('#asisbtn');
  await page.waitForSelector('.siri .siri-orb');
  // El teclado es voluntario: desde que se quitó el dictado automático,
  // las pruebas de consultas escritas deben pulsar el botón ⌨️ explícitamente.
  if (await page.locator('.siri-form').evaluate((el) => el.hidden)) await page.click('[data-skb]');
  await page.waitForSelector('.siri .siri-form:not([hidden])');
  const ask = async (q) => {
    const n = await page.evaluate(() => document.querySelectorAll('.siri-msg.rutivo').length);
    await page.fill('.siri-form input', q);
    await page.press('.siri-form input', 'Enter');
    for (let i = 0; i < 40; i++) {
      await page.waitForTimeout(150);
      const t = await page.evaluate((n) => { const m = document.querySelectorAll('.siri-msg.rutivo')[n]; return m ? m.textContent : ''; }, n);
      if (t && !/Miro el tiempo/.test(t)) return t;
    }
    return '';
  };
  return { ctx, page, ask, calls };
}

(async () => {
  const app = await serveApp();
  const browser = await chromium.launch();
  try {
    // En Madrid, con permiso de ubicación
    let s = await run(browser, app, { geo: { latitude: 40.416775, longitude: -3.703790 }, perm: ['geolocation'] });
    let t = await s.ask('¿Qué tiempo hace?');
    ok('1 · con ubicación, el tiempo es el de donde estás (Madrid), no Málaga', /En Madrid ahora hace 9 °C/.test(t) && !/Málaga/.test(t), t.slice(0, 80));
    ok('2 · a los servicios solo llegan coordenadas redondeadas (~1 km)', s.calls.includes('meteo 40.42,-3.7') && s.calls.includes('nombre 40.42,-3.7') && !s.calls.some((c) => /40\.4167/.test(c)), s.calls.join(' | '));
    t = await s.ask('¿Va a llover mañana en Sevilla?');
    ok('3 · «… en Sevilla»: el tiempo de Sevilla', /Mañana en Sevilla/.test(t) && s.calls.includes('ciudad Sevilla'), t.slice(0, 80));
    ok('4 · sin errores', !s.page.errors.length, s.page.errors.join(' | '));
    await s.ctx.close();

    // Sin permiso de ubicación: tu ciudad (o Málaga) y se avisa
    s = await run(browser, app, { geo: null, perm: [] });
    await s.page.evaluate(() => { navigator.geolocation.getCurrentPosition = (ok, err) => setTimeout(() => err({ code: 1, message: 'denied' }), 50); });
    t = await s.ask('¿Qué tiempo hace?');
    ok('5 · sin permiso: el de tu ciudad, avisando de que no sabe dónde estás y cómo arreglarlo', /En Málaga/.test(t) && /No sé dónde estás/.test(t) && /Localización/.test(t), t.slice(0, 160));
    ok('6 · sin errores', !s.page.errors.length, s.page.errors.join(' | '));
    await s.ctx.close();
  } finally {
    await browser.close();
    app.server.close();
  }
  console.log(res.filter(Boolean).length + '/' + res.length + ' passed');
  process.exit(res.every(Boolean) ? 0 : 1);
})();
