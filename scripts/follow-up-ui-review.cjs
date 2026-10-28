const { chromium } = require('/review/node_modules/playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const results = [], errors = [];
const banned = new Set(['notes','riskLevel','clinicalNoteObjective','clinicalObservations','nextSteps','content',
  'clinicalNotes','clinicalNoteId','clinicalNoteDate','createdAt','updatedAt']);
function privateProjection(body) {
  const visit = value => {
    if (!value || typeof value !== 'object') return;
    for (const [key,child] of Object.entries(value)) { assert.equal(banned.has(key),false,key); visit(child); }
  };
  visit(body);
  assert.equal(JSON.stringify(body).includes('FICTIONAL_PRIVATE'),false);
}
async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--host-resolver-rules=MAP frontend.localhost ' + process.env.FRONTEND_IP] });
  try {
    const context = await browser.newContext({ viewport: { width: 1440,height: 1000 },locale: 'es-MX',timezoneId: 'America/Chihuahua' });
    await context.route(url => url.pathname.startsWith('/api/'),route => {
      const url = new URL(route.request().url());
      return route.continue({ url: 'http://api:5000' + url.pathname + url.search });
    });
    const page = await context.newPage();
    page.on('pageerror',() => errors.push('pageerror'));
    page.on('response',response => {
      const path = new URL(response.url()).pathname;
      if (path.startsWith('/api/') && response.status() >= 400) errors.push(response.status() + ' ' + path);
    });
    async function login(id) {
      await page.goto('http://frontend.localhost:5173');
      await page.getByRole('button',{ name: 'Iniciar sesion',exact: true }).click();
      const form = page.locator('form').filter({ has: page.getByRole('button',{ name: 'Entrar',exact: true }) });
      await form.locator('[name=email]').fill(id + '@episodes.invalid');
      await form.locator('[name=password]').fill('Episode-Demo-Only-284!');
      await form.getByRole('button',{ name: 'Entrar',exact: true }).click();
      await page.getByRole('button',{ name: 'Cerrar sesion',exact: true }).waitFor();
      await page.waitForLoadState('networkidle');
    }
    async function logout() { await page.getByRole('button',{ name: 'Cerrar sesion',exact: true }).click(); }
    async function timeline() {
      await page.getByRole('button',{ name: 'Ver detalle',exact: true }).click();
      await page.getByRole('button',{ name: 'Mi seguimiento',exact: true }).click();
      return page.getByRole('region',{ name: 'Mi seguimiento',exact: true });
    }
    async function shot(name) {
      if (name.startsWith('patient-timeline')) {
        await page.getByRole('region',{ name: 'Mi seguimiento',exact: true }).evaluate(el => el.scrollIntoView({ block: 'start' }));
      }
      await page.screenshot({ path: '/work/' + name + '.png',fullPage: true,animations: 'disabled',
        mask: [page.locator('input[name=email]'),page.locator('input[name=password]'),page.getByText(/@|Password demo:/)],
        maskColor: '#475569' });
    }
    await login('p');
    let section = await timeline();
    const visits = section.locator('article');
    await visits.nth(2).waitFor();
    assert.equal(await visits.count(),3);
    assert.deepEqual(await visits.locator('h3').allTextContents(),['8 de abril de 2026','5 de abril de 2026','1 de abril de 2026']);
    assert.equal(await visits.nth(0).getByRole('checkbox').count(),1);
    assert.equal(await visits.nth(1).getByRole('checkbox').count(),0);
    await visits.nth(1).getByText('Sin tareas asignadas',{ exact: true }).waitFor();
    assert.equal(await visits.nth(2).getByRole('checkbox').count(),2);
    await section.getByRole('heading',{ name: 'Tareas sin consulta identificada',exact: true }).waitFor();
    assert.equal((await section.innerText()).includes('FICTIONAL_PRIVATE'),false);
    assert.equal(await page.getByRole('button',{ name: 'Notas clinicas',exact: true }).count(),0);
    await shot('patient-timeline-desktop');
    results.push('P1: April 8/5/1, 1/0/2 tasks, no-note visit and separate historical task: PASS');
    for (const name of ['Fictional April 1 task A','Fictional historical task']) {
      for (const completed of [true,false]) {
        const wait = page.waitForResponse(r => /\/tasks\//.test(new URL(r.url()).pathname) && r.request().method() === 'PATCH');
        await section.getByRole('checkbox',{ name,exact: true }).click();
        const patch = await wait;
        assert.equal(patch.status(),200);
        assert.equal((await patch.json()).data.completed,completed);
        await page.waitForLoadState('networkidle');
        assert.equal(await section.getByRole('checkbox',{ name,exact: true }).isChecked(),completed);
      }
    }
    await page.reload();
    await page.waitForLoadState('networkidle');
    section = await timeline();
    assert.equal(await section.getByRole('checkbox',{ name: 'Fictional April 1 task A',exact: true }).isChecked(),false);
    results.push('P2: linked/historical complete and unmark, persist after reload: PASS');
    await page.getByRole('button',{ name: 'Objetivos',exact: true }).click();
    assert.equal(await page.getByRole('checkbox').count(),0);
    await page.getByRole('button',{ name: 'Mi seguimiento',exact: true }).click();
    await page.setViewportSize({ width: 390,height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await shot('patient-timeline-mobile');
    for (const completed of [true,false]) {
      const wait = page.waitForResponse(r => /\/tasks\//.test(new URL(r.url()).pathname) && r.request().method() === 'PATCH');
      await section.getByRole('checkbox',{ name: 'Fictional historical task',exact: true }).click();
      assert.equal((await wait).status(),200);
      await page.waitForFunction(value => {
        const input = document.querySelector('input[aria-label="Fictional historical task"]');
        return input && input.checked === value;
      },completed);
    }
    await shot('historical-tasks-mobile');
    await page.setViewportSize({ width: 1440,height: 1000 });
    await page.locator('aside').getByRole('button',{ name: 'Tablero',exact: true }).click();
    await page.getByRole('heading',{ name: 'Tareas entre consultas',exact: true }).waitFor();
    await page.getByRole('heading',{ name: 'Tareas sin consulta identificada',exact: true }).waitFor();
    const dashboardTask = page.locator('label').filter({ hasText: 'Fictional historical task' }).getByRole('checkbox');
    const patched = page.waitForResponse(r => /\/tasks\//.test(new URL(r.url()).pathname) && r.request().method() === 'PATCH');
    await dashboardTask.click();
    assert.equal((await patched).status(),200);
    await page.waitForLoadState('networkidle');
    assert.equal(await dashboardTask.isChecked(),true);
    await shot('patient-dashboard');
    results.push('P3: mobile no overflow, patient objectives read-only, dashboard shares verified groups and toggles after file selection: PASS');
    await logout();

    for (const [id,count,message] of [['q',2,null],['r',0,'Todavía no tienes consultas realizadas'],['s',0,'Tareas sin consulta identificada']]) {
      await login(id);
      section = await timeline();
      if (count) await section.locator('article').nth(count - 1).waitFor();
      assert.equal(await section.locator('article').count(),count);
      if (id === 'q') {
        assert.deepEqual(await section.locator('article h3').allTextContents(),['8 de abril de 2026','8 de abril de 2026']);
        assert.equal(await section.getByText('Sin tareas asignadas',{ exact: true }).count(),2);
        await section.getByText('3:00 PM',{ exact: true }).waitFor();
        await section.getByText('8:00 AM',{ exact: true }).waitFor();
      } else {
        await section.getByText(message,{ exact: true }).waitFor();
      }
      await shot('patient-' + id);
      await logout();
    }
    results.push('P4: same-day visits remain distinct, empty history and history-only tasks: PASS');
    await login('a');
    await page.locator('aside').getByRole('button',{ name: 'Mis Pacientes',exact: true }).click();
    await page.getByRole('button',{ name: 'Expediente',exact: true }).click();
    await page.getByRole('button',{ name: 'Notas clinicas',exact: true }).click();
    assert.equal(await page.getByRole('button',{ name: 'Abrir nota clinica',exact: true }).count(),2);
    await page.getByText('FICTIONAL_PRIVATE_OBJECTIVE',{ exact: false }).first().waitFor();
    await page.getByRole('button',{ name: 'Abrir nota clinica',exact: true }).first().click();
    const modal = page.locator('div.fixed').filter({ has: page.getByRole('heading',{ name: 'Editar nota clinica',exact: true }) });
    await modal.locator('textarea').nth(3).fill('FICTIONAL_PRIVATE_EDITED_CONTENT');
    const edited = page.waitForResponse(r => /\/clinical-notes\//.test(new URL(r.url()).pathname) && r.request().method() === 'PATCH');
    await modal.getByRole('button',{ name: 'Guardar cambios',exact: true }).click();
    assert.equal((await edited).status(),200);
    await page.waitForLoadState('networkidle');
    await page.getByRole('button',{ name: 'Nueva nota clinica',exact: true }).first().click();
    const createModal = page.locator('div.fixed').filter({ has: page.getByRole('heading',{ name: 'Registrar nota clinica',exact: true }) });
    await createModal.locator('select').selectOption({ index: 1 });
    await createModal.locator('textarea').nth(3).fill('FICTIONAL_PRIVATE_NEW_CONTENT');
    const created = page.waitForResponse(r => /\/clinical-notes$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST');
    await createModal.getByRole('button',{ name: 'Guardar nota clinica',exact: true }).click();
    assert.equal((await created).status(),201);
    await createModal.waitFor({ state: 'hidden' });
    await page.getByRole('button',{ name: 'Abrir nota clinica',exact: true }).nth(2).waitFor();
    assert.equal(await page.getByRole('button',{ name: 'Abrir nota clinica',exact: true }).count(),3);
    await shot('psychologist-notes');
    results.push('P5: professional note readers, edit, create and completed-appointment linkage preserved: PASS');
    await logout();
    const projectionWait = page.waitForResponse(r => /\/patients\/p\/follow-up$/.test(new URL(r.url()).pathname));
    await login('p');
    const projection = await projectionWait;
    assert.equal(projection.status(),200);
    const body = await projection.json();
    privateProjection(body);
    assert.equal(body.data.consultations.length,3);
    section = await timeline();
    await section.locator('article').nth(2).waitFor();
    assert.equal(await section.locator('article').count(),3);
    assert.equal((await page.locator('body').innerText()).includes('FICTIONAL_PRIVATE'),false);
    results.push('P6: complete JSON and patient UI stay private after professional edits/creation: PASS');
    assert.deepEqual(errors,[]);
    fs.writeFileSync('/work/browser-result.json',JSON.stringify({ results,errors,runtime: {
      node: process.version,playwright: require('/review/node_modules/playwright/package.json').version,chromium: browser.version(),
    } },null,2));
    console.log(JSON.stringify({ results,errors }));
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
