const { chromium } = require('/review/node_modules/playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const results = [], errors = [], objectiveRequests = [];
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
      if (/\/objectives(?:\/|$)/.test(new URL(request.url()).pathname)) objectiveRequests.push(request.method());
    });
    page.on('response', response => {
      const path = new URL(response.url()).pathname;
      if (path.startsWith('/api/') && response.status() >= 400) errors.push(response.status() + ' ' + path);
    });
    async function request(path, method = 'GET', data) {
      return page.request.fetch('http://api:5000/api' + path, {
        method, ...(data === undefined ? {} : { data }),
        headers: { Authorization: 'Bearer ' + await page.evaluate(() => localStorage.getItem('psicopanel_auth_token')) },
      });
    }
    async function login(id) {
      await page.goto('http://frontend.localhost:5173');
      await page.getByRole('button', { name: 'Iniciar sesion', exact: true }).click();
      const form = page.locator('form').filter({ has: page.getByRole('button', { name: 'Entrar', exact: true }) });
      await form.locator('[name=email]').fill(id + '@episodes.invalid');
      await form.locator('[name=password]').fill('Episode-Demo-Only-284!');
      await form.getByRole('button', { name: 'Entrar', exact: true }).click();
      await page.getByRole('button', { name: 'Cerrar sesion', exact: true }).waitFor();
    }
    async function absentGoals() {
      await page.waitForLoadState('networkidle');
      assert.equal(await page.getByRole('button', { name: 'Objetivos', exact: true }).count(), 0);
      assert.equal(await page.getByRole('button', { name: /Agregar objetivo|Retirar objetivo|Guardar objetivo/ }).count(), 0);
      assert.equal(await page.getByText(/Avance \d+%|Mis objetivos|Objetivos del proceso|Todavia no hay objetivos/).count(), 0);
      const response = await request('/patients/p');
      assert.equal(response.status(), 200);
      const body = await response.json();
      assert.equal(Object.hasOwn(body.data, 'objectives'), false);
      assert.doesNotMatch(JSON.stringify(body), /FICTIONAL_EPISODE_OBJECTIVE_|Synthetic legacy objective/);
      for (const [path, method, data] of [
        ['/patients/p/objectives', 'POST', { text: 'Unpermitted' }],
        ['/patients/p/objectives/1', 'PATCH', { completed: true }],
        ['/patients/p/objectives/1', 'DELETE'],
      ]) assert.equal((await request(path, method, data)).status(), 404);
      return body.data;
    }
    async function shot(name) {
      await page.screenshot({ path: '/work/' + name + '.png', fullPage: true, animations: 'disabled',
        mask: [page.locator('input[name=email]'), page.locator('input[name=password]'), page.getByText(/@|Password demo:/)], maskColor: '#475569' });
    }
    await login('a');
    await page.locator('aside').getByRole('button', { name: 'Mis Pacientes', exact: true }).click();
    await page.getByRole('button', { name: 'Expediente', exact: true }).click();
    const detail = await absentGoals();
    assert.equal(detail.clinicalNotes[0].clinicalNoteObjective, 'FICTIONAL_NOTE_OBJECTIVE_p');
    await shot('psychologist-objectives');
    results.push('PSI: no global goals, controls, progress or DTO, retired endpoints 404, E1/E2 hidden: PASS');

    const created = await request('/patients/p/tasks', 'POST', { text: 'Fictional retained task', clinicalNoteId: detail.tasks[0].clinicalNoteId });
    assert.equal(created.status(), 201);
    const task = (await created.json()).data;
    assert.equal(task.clinicalNoteObjective, 'FICTIONAL_NOTE_OBJECTIVE_p');
    const edited = await request('/patients/p/tasks/' + task.id, 'PATCH', { text: 'Fictional edited task', completed: true });
    assert.equal(edited.status(), 200);
    assert.equal((await edited.json()).data.completed, true);
    assert.equal((await request('/patients/p/tasks/' + task.id, 'DELETE')).status(), 200);
    results.push('PSI: retained task creation/edit/retirement and clinical note narrative objective: PASS');
    await page.getByRole('button', { name: 'Cerrar sesion', exact: true }).click();
    await login('p');
    await page.getByRole('button', { name: 'Ver detalle', exact: true }).click();
    await absentGoals();
    await shot('patient-objectives');
    await page.locator('aside').getByRole('button', { name: 'Tablero', exact: true }).click();
    const checkbox = page.locator('label').filter({ hasText: 'Synthetic legacy task' }).getByRole('checkbox');
    for (const completed of [true, false]) {
      const wait = page.waitForResponse(r => /\/tasks\//.test(new URL(r.url()).pathname) && r.request().method() === 'PATCH');
      await checkbox.click();
      const response = await wait;
      assert.equal(response.status(), 200);
      const body = await response.json();
      assert.equal(body.data.completed, completed);
      assert.equal(Object.hasOwn(body.data, 'clinicalNoteObjective'), false);
      await page.waitForLoadState('networkidle');
      assert.equal(await checkbox.isChecked(), completed);
    }
    await shot('patient-tasks');
    assert.deepEqual(objectiveRequests, []);
    assert.deepEqual(errors, []);
    results.push('PAC: no global goals/progress or objective requests, retained task completion and privacy: PASS');
    fs.writeFileSync('/work/browser-result.json', JSON.stringify({ results, errors, objectiveRequests, runtime: {
      node: process.version, playwright: require('/review/node_modules/playwright/package.json').version, chromium: browser.version(),
    } }, null, 2));
    console.log(JSON.stringify({ results, errors, objectiveRequests }));
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
