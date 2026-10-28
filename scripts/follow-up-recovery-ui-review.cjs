const { chromium } = require('/review/node_modules/playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const results = [], pageErrors = [], events = [], unexpectedApi = [];
async function main() {
  const browser = await chromium.launch({ headless: true,args: ['--host-resolver-rules=MAP frontend.localhost ' + process.env.FRONTEND_IP] });
  try {
    const context = await browser.newContext({ viewport: { width: 1440,height: 1000 },locale: 'es-MX' });
    let mode = 'network',putMode = 'pass';
    const counts = new Map();
    await context.route(url => url.pathname.startsWith('/api/'),async route => {
      const url = new URL(route.request().url()),path = url.pathname;
      const key = route.request().method() + ' ' + path;
      counts.set(key,(counts.get(key) || 0) + 1);
      if (path.endsWith('/follow-up') && mode !== 'pass') {
        events.push({ kind: 'follow-up',mode,expected: true });
        if (mode === 'network') return route.abort('failed');
        return route.fulfill({ status: Number(mode),contentType: 'application/json',body: JSON.stringify({ success: false,message: 'Fictional follow-up failure' }) });
      }
      if (path.endsWith('/interview') && route.request().method() === 'PUT' && putMode !== 'pass') {
        events.push({ kind: 'interview',mode: putMode,expected: true });
        return route.fulfill({ status: 500,contentType: 'application/json',body: JSON.stringify({ success: false,message: 'Fictional interview save failure' }) });
      }
      return route.continue({ url: 'http://api:5000' + path + url.search });
    });
    const page = await context.newPage();
    page.on('pageerror',() => pageErrors.push('pageerror'));
    page.on('response',response => {
      const path = new URL(response.url()).pathname;
      if (!path.startsWith('/api/') || response.status() < 400) return;
      const expected = (path.endsWith('/follow-up') && response.status() === Number(mode)) ||
        (path.endsWith('/interview') && response.status() === Number(putMode));
      if (!expected) unexpectedApi.push({ path,status: response.status() });
    });
    async function login(id) {
      await page.goto('http://frontend.localhost:5173');
      await page.getByRole('button',{ name: 'Iniciar sesion',exact: true }).click();
      const form = page.locator('form').filter({ has: page.getByRole('button',{ name: 'Entrar',exact: true }) });
      await form.locator('[name=email]').fill(id + '@episodes.invalid');
      await form.locator('[name=password]').fill('Episode-Demo-Only-284!');
      await form.getByRole('button',{ name: 'Entrar',exact: true }).click();
      if (mode !== '401') await page.getByRole('button',{ name: 'Cerrar sesion',exact: true }).waitFor();
      await page.waitForLoadState('networkidle');
    }
    const logout = () => page.getByRole('button',{ name: 'Cerrar sesion',exact: true }).click();
    const timeline = () => page.getByRole('region',{ name: 'Mi seguimiento',exact: true });
    async function detail() {
      await page.getByRole('button',{ name: 'Ver detalle',exact: true }).click();
      await page.getByRole('button',{ name: 'Mi seguimiento',exact: true }).click();
    }
    async function shot(name) {
      const section = timeline();
      if (await section.count()) await section.evaluate(el => el.scrollIntoView({ block: 'start' }));
      await page.screenshot({ path: '/work/' + name + '.png',fullPage: true,animations: 'disabled',
        mask: [page.locator('input[name=email]'),page.locator('input[name=password]'),page.getByText(/@|Password demo:/)],maskColor: '#475569' });
    }
    function mainCounts() {
      return [...counts].filter(([key]) => key.startsWith('GET ') && !key.includes('/follow-up')).sort();
    }
    await login('p');
    await page.getByText('Seguimiento temporalmente no disponible. Tus otras secciones siguen disponibles.',{ exact: true }).waitFor();
    assert.equal(await page.getByText('No pudimos cargar la informacion',{ exact: true }).count(),0);
    await page.getByRole('heading',{ name: 'Tareas entre consultas',exact: true }).waitFor();
    await page.getByText('Fictional April 1 task A',{ exact: true }).waitFor();
    await page.locator('aside').getByRole('button',{ name: 'Mis Citas',exact: true }).click();
    assert.equal(await page.getByText('No pudimos cargar la informacion',{ exact: true }).count(),0);
    await page.locator('aside').getByRole('button',{ name: 'Tablero',exact: true }).click();
    await detail();
    assert.equal(await timeline().locator('article').count(),0);
    assert.equal(await timeline().getByText('Todavía no tienes consultas realizadas',{ exact: true }).count(),0);
    const task = timeline().getByRole('checkbox',{ name: 'Fictional April 1 task A',exact: true });
    const patch = page.waitForResponse(r => r.request().method() === 'PATCH' && /\/tasks\//.test(new URL(r.url()).pathname));
    await task.click();assert.equal((await patch).status(),200);
    await shot('network-unavailable-main-functions');
    let before = mainCounts();
    mode = '500';
    await timeline().getByRole('button',{ name: 'Reintentar seguimiento',exact: true }).click();
    await timeline().getByRole('alert').waitFor();
    assert.deepEqual(mainCounts(),before);
    mode = 'pass';
    await timeline().getByRole('button',{ name: 'Reintentar seguimiento',exact: true }).click();
    await timeline().locator('article').nth(2).waitFor();
    assert.equal(await timeline().locator('article').count(),3);
    assert.deepEqual(mainCounts(),before);
    results.push('P2-01: network/500 keep primary data, agenda/navigation and task PATCH; retry only GET follow-up restores 3 visits: PASS');

    async function interview(id,refreshMode,saveMode = 'pass') {
      mode = 'pass';putMode = 'pass';
      await login(id);await detail();
      const oldVisits = await timeline().locator('article').count();
      await page.getByRole('button',{ name: 'Entrevista',exact: true }).click();
      await page.getByRole('button',{ name: 'Completar entrevista',exact: true }).first().click();
      const modal = page.locator('div.fixed').filter({ has: page.getByRole('heading',{ name: 'Entrevista inicial',exact: true }) });
      // Existing interview controls are filled below using their stable names.
      await modal.waitFor();
      mode = refreshMode;putMode = saveMode;
      return { modal,oldVisits };
    }
    await logout();
    for (const [id,refreshMode] of [['p','network'],['q','500']]) {
      const { modal,oldVisits } = await interview(id,refreshMode);
      await fillInterview(modal);
      const key = 'PUT /api/patients/' + id + '/interview',prior = counts.get(key) || 0;
      if (id === 'p') {
        putMode = '500';
        const failed = page.waitForResponse(r => r.request().method() === 'PUT' && new URL(r.url()).pathname.endsWith('/interview'));
        await modal.getByRole('button',{ name: /Guardar entrevista/ }).click();
        assert.equal((await failed).status(),500);
        await page.getByText('Fictional interview save failure',{ exact: true }).waitFor();
        assert.equal(await modal.isVisible(),true);
        assert.equal(await page.getByText('Entrevista guardada correctamente.',{ exact: true }).count(),0);
        putMode = 'pass';
      }
      const put = page.waitForResponse(r => r.request().method() === 'PUT' && new URL(r.url()).pathname.endsWith('/interview'));
      await modal.getByRole('button',{ name: /Guardar entrevista/ }).click();
      assert.equal((await put).status(),200);
      await modal.waitFor({ state: 'hidden' });
      await page.getByText('Entrevista guardada correctamente.',{ exact: true }).waitFor();
      await page.getByRole('button',{ name: 'Mi seguimiento',exact: true }).click();
      if (refreshMode !== 'pass') {
        await timeline().getByText('No se pudo actualizar el seguimiento. Se muestra la última información cargada.',{ exact: true }).waitFor();
        assert.equal(await timeline().locator('article').count(),oldVisits);
        await shot('saved-interview-' + refreshMode);
        before = mainCounts();mode = 'pass';
        await timeline().getByRole('button',{ name: 'Reintentar seguimiento',exact: true }).click();
        await timeline().getByRole('alert').waitFor({ state: 'hidden' });
        assert.deepEqual(mainCounts(),before);
      }
      assert.equal(counts.get(key),prior + (id === 'p' ? 2 : 1));
      await page.getByRole('button',{ name: 'Entrevista',exact: true }).click();
      assert.equal(await page.getByRole('button',{ name: 'Completar entrevista',exact: true }).count(),0);
      await logout();
    }
    results.push('P2-02: real PUT 500 keeps modal/no false success; PUT 200 + network/500 updates file, closes modal, keeps success and prior projection; retry makes no second PUT: PASS');

    mode = '401';await login('p');
    await page.getByRole('button',{ name: 'Iniciar sesion',exact: true }).waitFor();
    assert.equal(await page.evaluate(() => localStorage.getItem('psicopanel_auth_token')),null);
    assert.equal(await page.getByText('Fictional April 1 task A',{ exact: true }).count(),0);
    results.push('Auth: follow-up 401 invalidates the real session and removes protected UI: PASS');

    for (const status of ['403','404']) {
      mode = 'network';await login('p');await detail();
      mode = 'pass';
      await timeline().getByRole('button',{ name: 'Reintentar seguimiento',exact: true }).click();
      await timeline().locator('article').nth(2).waitFor();
      await logout();mode = status;await login('p');
      await page.getByText('Ya no tienes acceso a este expediente. Vuelve a comprobar tu sesión.',{ exact: true }).waitFor();
      assert.equal(await page.getByText('Fictional April 1 task A',{ exact: true }).count(),0);
      assert.equal(await page.getByRole('button',{ name: 'Mi seguimiento',exact: true }).count(),0);
      await logout();
    }
    results.push('Auth: 403/404 discard protected file/agenda, never use transient fallback; independent sessions do not reuse projections: PASS');
    mode = 'pass';await login('r');await detail();
    await timeline().getByText('Todavía no tienes consultas realizadas',{ exact: true }).waitFor();
    assert.equal(await timeline().getByRole('alert').count(),0);
    results.push('Empty: valid consultations [] is empty, not unavailable: PASS');
    assert.deepEqual(pageErrors,[]);
    assert.deepEqual(unexpectedApi,[]);
    fs.writeFileSync('/work/recovery-browser-result.json',JSON.stringify({ results,pageErrors,unexpectedApi,events,runtime: {
      node: process.version,playwright: require('/review/node_modules/playwright/package.json').version,chromium: browser.version(),
    } },null,2));
    console.log(JSON.stringify({ results,pageErrors,unexpectedApi }));
  } finally { await browser.close(); }
}
async function fillInterview(modal) {
  // Filled according to the existing form, without changing its validation.
  await modal.locator('input[type=date]').fill('1990-01-01');
  const fields = await modal.locator('input[type=text], textarea').all();
  for (const input of fields) await input.fill('Fictional answer');
}
main().catch(error => { console.error(error.stack);process.exitCode = 1; });
