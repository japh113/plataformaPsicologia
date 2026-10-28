const { chromium } = require('/review/node_modules/playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const results = [], errors = [], objectiveWrites = [];
async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--host-resolver-rules=MAP frontend.localhost ' + process.env.FRONTEND_IP] });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'es-MX' });
    await context.route(url => url.pathname.startsWith('/api/'), route => {
      const url = new URL(route.request().url());
      return route.continue({ url: 'http://api:5000' + url.pathname + url.search });
    });
    const page = await context.newPage();
    page.on('pageerror', () => errors.push('pageerror'));
    page.on('request', request => {
      if (/\/objectives\//.test(new URL(request.url()).pathname) && request.method() === 'PATCH') objectiveWrites.push(request.url());
    });
    page.on('response', response => {
      const path = new URL(response.url()).pathname;
      if (path.startsWith('/api/') && response.status() >= 400) errors.push(response.status() + ' ' + path);
    });
    async function login(email) {
      await page.goto('http://frontend.localhost:5173');
      await page.getByRole('button', { name: 'Iniciar sesion', exact: true }).click();
      const form = page.locator('form').filter({ has: page.getByRole('button', { name: 'Entrar', exact: true }) });
      await form.locator('[name=email]').fill(email);
      await form.locator('[name=password]').fill('Episode-Demo-Only-284!');
      const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/auth/login');
      await form.getByRole('button', { name: 'Entrar', exact: true }).click();
      assert.equal((await response).status(), 200);
      await page.getByRole('button', { name: 'Cerrar sesion', exact: true }).waitFor();
      await page.waitForLoadState('networkidle');
    }
    async function objectives(professional) {
      if (professional) {
        await page.locator('aside').getByRole('button', { name: 'Mis Pacientes', exact: true }).click();
        await page.getByRole('button', { name: 'Expediente', exact: true }).click();
      } else {
        await page.getByRole('button', { name: 'Ver detalle', exact: true }).click();
      }
      await page.getByRole('button', { name: 'Objetivos', exact: true }).click();
    }
    async function shot(name) {
      await page.screenshot({ path: '/work/' + name + '.png', fullPage: true,
        mask: [page.locator('input[name=email]'), page.locator('input[name=password]'), page.getByText(/@|Password demo:/)],
        maskColor: '#475569' });
    }
    async function toggle(name, completed) {
      const wait = page.waitForResponse(r => /\/objectives\//.test(new URL(r.url()).pathname) && r.request().method() === 'PATCH');
      await page.getByRole('checkbox', { name: 'Cumplimiento de ' + name, exact: true }).click();
      const response = await wait;
      assert.equal(response.status(), 200);
      assert.equal((await response.json()).data.completed, completed);
      await page.waitForLoadState('networkidle');
    }
    await login('a@episodes.invalid');
    await objectives(true);
    assert.equal(await page.getByRole('checkbox').count(), 1);
    await toggle('Synthetic legacy objective', true);
    await toggle('Synthetic legacy objective', false);
    await page.getByRole('button', { name: 'Agregar objetivo', exact: true }).click();
    await page.getByPlaceholder('Ej. Reducir evitacion social o establecer una rutina de sueno mas estable...').fill('Fictional completed objective');
    const created = page.waitForResponse(r => /\/objectives$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Guardar objetivo', exact: true }).click();
    assert.equal((await created).status(), 201);
    await toggle('Fictional completed objective', true);
    await page.getByText('Avance 50%', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Retirar objetivo (se conserva el registro)', exact: true }).count(), 2);
    await shot('psychologist-objectives');
    results.push('professional create, complete/unmark, retirement controls, and 50% progress: PASS');
    await page.getByRole('button', { name: 'Cerrar sesion', exact: true }).click();

    await login('p@episodes.invalid');
    await objectives(false);
    const writesBefore = objectiveWrites.length;
    await page.getByText('Avance 50%', { exact: true }).waitFor();
    assert.equal(await page.getByRole('checkbox').count(), 0);
    assert.equal(await page.getByRole('button', { name: /Agregar objetivo|Retirar objetivo/ }).count(), 0);
    assert.equal(await page.locator('main textarea').count(), 0);
    await page.getByText('Synthetic legacy objective', { exact: true }).last().click();
    await page.getByText('Fictional completed objective', { exact: true }).last().click();
    await page.locator('div.group').filter({ hasText: 'Fictional completed objective' }).getByText('Completado', { exact: true }).waitFor();
    await page.locator('div.group').filter({ hasText: 'Synthetic legacy objective' }).getByText('En proceso', { exact: true }).waitFor();
    await page.getByText('Consulta tus objetivos y su avance. Tu psicologo actualiza su cumplimiento.', { exact: true }).waitFor();
    await page.waitForLoadState('networkidle');
    assert.equal(objectiveWrites.length, writesBefore);
    await shot('patient-objectives');
    results.push('patient pending/completed status, 50% progress, no editable controls or objective PATCH: PASS');

    await page.locator('aside').getByRole('button', { name: 'Tablero', exact: true }).click();
    const task = page.locator('label').filter({ hasText: 'Synthetic legacy task' }).getByRole('checkbox');
    for (const completed of [true, false]) {
      const wait = page.waitForResponse(r => /\/tasks\//.test(new URL(r.url()).pathname) && r.request().method() === 'PATCH');
      await task.click();
      const response = await wait;
      assert.equal(response.status(), 200);
      const body = await response.json();
      assert.equal(body.data.completed, completed);
      assert.ok(!Object.hasOwn(body.data, 'clinicalNoteObjective'));
      await page.waitForLoadState('networkidle');
      assert.equal(await task.isChecked(), completed);
    }
    assert.equal(objectiveWrites.length, writesBefore);
    await shot('patient-tasks');
    results.push('patient completes/unmarks tasks, private note objective absent, no objective PATCH: PASS');
    assert.deepEqual(errors, []);
    fs.writeFileSync('/work/browser-result.json', JSON.stringify({ results, errors, runtime: {
      node: process.version, playwright: require('/review/node_modules/playwright/package.json').version,
      chromium: browser.version() } }, null, 2));
    console.log(JSON.stringify({ results, errors }));
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
