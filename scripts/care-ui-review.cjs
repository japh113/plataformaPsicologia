const assert = require('node:assert/strict');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
const { chromium } = require('playwright');

const root = process.env.REVIEW_BASE;
const results = [], events = [], screenshots = [];
let browser, professional, patient, current, expected, selectedPage, preparedId;
const button = (scope, name) => scope.getByRole('button', { name, exact: true });
const heading = (scope, name) => scope.getByRole('heading', { name, exact: true });
const nav = (page, desktop = false) => page.getByRole('navigation', { name: 'Navegación ' + (desktop ? 'principal' : 'móvil') });
const save = () => fs.writeFileSync('/control/results.json', JSON.stringify({ results, events, screenshots }, null, 2));
const interview = page => page.locator('details').filter({ has: page.locator('summary').filter({ hasText: /^Entrevista y versiones$/ }) });

async function screenshot(id, page) {
  const file = 'screenshots/' + id + '.png';
  await page.screenshot({
    path: '/evidence/' + file, fullPage: true, animations: 'disabled', maskColor: '#475569',
    mask: [page.locator('input, textarea'), page.getByText(/@|Password demo:/)],
  });
  screenshots.push({ file, scenario: current, secretsMasked: true });
}

async function scenario(id, work, statuses = []) {
  current = id;
  expected = new Set(statuses);
  try {
    await work();
    await screenshot(id, selectedPage);
    results.push({ id, status: 'PASS' });
  } catch (error) {
    fs.writeFileSync('/control/browser-failure.txt', error.stack || error.message);
    results.push({ id, status: 'FAIL', failureCategory: error.name === 'TimeoutError' ? 'timeout' : 'assertion' });
    if (selectedPage) await screenshot(id + '-failure', selectedPage).catch(() => {});
    throw error;
  } finally {
    save();
  }
  console.log(id + ' PASS');
}

async function login(who, width) {
  const context = await browser.newContext({ viewport: { width, height: 800 }, locale: 'es-MX' });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.on('pageerror', () => events.push({ scenario: current, type: 'pageerror', expected: false }));
  page.on('response', response => {
    if (response.status() >= 400) events.push({ scenario: current, type: 'http', status: response.status(), expected: expected.has(response.status()) });
  });
  await page.goto(root);
  await page.getByLabel(/correo/i).first().fill(who + '@bilateral.invalid');
  await page.locator('input[name=password]').fill('Episode-Demo-Only-284!');
  await button(page, 'Entrar').click();
  await nav(page, width >= 768).waitFor();
  return page;
}

async function bilateral(page, path, data) {
  return page.evaluate(async ({ path, data }) => {
    const response = await fetch('http://api:5000/api/bilateral-invitations' + path, {
      method: data ? 'POST' : 'GET',
      headers: { Authorization: 'Bearer ' + localStorage.getItem('psicopanel_auth_token'), 'Content-Type': 'application/json' },
      ...(data ? { body: JSON.stringify(data) } : {}),
    });
    return { status: response.status, data: (await response.json()).data };
  }, { path, data });
}

async function openProfessional() {
  await button(nav(professional, true), 'Mis pacientes').click();
  await button(professional, 'Pacientes vinculados').click();
  await button(professional, 'Ver acuerdo de bq2').click();
  await heading(professional, 'bq2').waitFor();
}

async function openPatient() {
  await button(nav(patient), 'Mi atención').click();
  await button(patient, 'Ver atención').click();
  await heading(patient, 'Profesional ficticio bp2').waitFor();
}

async function assign(mode, template, question) {
  await professional.getByLabel('Modalidad', { exact: true }).selectOption(mode);
  await professional.getByLabel('Plantilla', { exact: true }).selectOption(template);
  await professional.getByText(question, { exact: true }).waitFor();
  await button(professional, 'Asignar entrevista').click();
  await professional.getByText('Entrevista asignada', { exact: true }).waitFor();
}

async function main() {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox',
    '--host-resolver-rules=MAP frontend.localhost ' + process.env.REVIEW_FRONTEND_IP] });
  fs.writeFileSync('/control/runtime.json', JSON.stringify({
    playwright: require('playwright/package.json').version, chromium: browser.version(), node: process.version,
    revision: process.env.REVIEW_REVISION, headless: true,
  }));

  await scenario('CARE01', async () => {
    professional = await login('bp2', 1280);
    patient = await login('bq2', 320);
    selectedPage = patient;
    const first = await bilateral(professional, '/professional-reference', { operationId: randomUUID() });
    assert.equal(first.status, 200);
    const directed = await bilateral(patient, '/recipient-reference', {
      operationId: randomUUID(), professionalReference: first.data.reference, confirmed: true,
    });
    assert.equal(directed.status, 200);
    await button(nav(professional, true), 'Mis pacientes').click();
    await button(professional, 'Invitar paciente').click();
    await button(professional, 'Ya recibí el código del paciente').press('Enter');
    await professional.getByLabel('Código del paciente', { exact: true }).fill(directed.data.reference);
    await professional.getByLabel('Correo conocido de la persona', { exact: true }).fill('bq2@bilateral.invalid');
    const terms = (await bilateral(professional, '/terms')).data;
    await professional.getByLabel(terms.declarationText, { exact: true }).check();
    await professional.getByLabel(/Propongo expresamente/).check();
    await button(professional, 'Registrar solicitud').click();
    await professional.getByRole('status').filter({ hasText: 'Solicitud registrada' }).waitFor();
    await button(nav(patient), 'Mi atención').click();
    for (let attempt = 0; attempt < 8 && !(await button(patient, 'Ver invitación').count()); attempt++) {
      await button(patient, 'Actualizar bandeja').click();
      await button(patient, 'Ver invitación').waitFor({ timeout: 1500 }).catch(() => {});
    }
    await button(patient, 'Ver invitación').click();
    await patient.getByLabel(/Acepto expresamente/).check();
    await button(patient, 'Aceptar vinculación').click();
    await button(patient, 'Continuar a mi atención').click();
    await patient.getByText('Tu profesional está preparando la admisión.', { exact: true }).waitFor();
    await button(patient, 'Volver a Mi atención').click();
    await button(patient, 'Ver atención').waitFor();
    assert.equal(await button(patient, 'Ver atención').count(), 1);
    assert.equal(await button(patient, 'Ver invitación').count(), 0);
    assert.equal(await button(nav(patient), 'Admisión').count(), 0);
    assert.ok(await nav(patient).evaluate(node => node.scrollWidth <= node.clientWidth));
  });

  await scenario('CARE02', async () => {
    selectedPage = professional;
    await openProfessional();
    const path = '**/api/admissions/prepare-current';
    await professional.route(path, async route => {
      const response = await route.fetch();
      assert.equal(response.status(), 200);
      preparedId = (await response.json()).data.episodeId;
      await route.fulfill({ response, status: 503, json: { success: false, message: 'Respuesta ficticia perdida' } });
    });
    await button(professional, 'Preparar episodio individual').press('Enter');
    await heading(professional, 'Elegir entrevista').waitFor();
    await professional.unroute(path);
    await professional.reload();
    await openProfessional();
    await heading(professional, 'Elegir entrevista').waitFor();
    assert.equal(await button(professional, 'Preparar episodio individual').count(), 0);
    const templates = professional.getByLabel('Plantilla', { exact: true }).locator('option');
    await templates.nth(3).waitFor({ state: 'attached' });
    assert.equal(await templates.count(), 4);
    await assign('self', 'fictional-initial-interview-v1', '¿Qué te gustaría conversar en este espacio?');

    await openPatient();
    await patient.getByLabel(/Acepto específicamente esta asignación/).check();
    await button(patient, 'Aceptar asignación').click();
    await heading(patient, 'Borrador privado').waitFor();
    for (const field of await patient.locator('textarea').all()) await field.fill('Respuesta ficticia CARE02');
    await button(patient, 'Guardar borrador privado').click();
    await patient.getByLabel(/Confirmo enviar esta versión guardada/).check();
    await button(patient, 'Enviar versión inmutable').click();
    await patient.getByText('Envío 1', { exact: true }).waitFor();
    await button(professional, 'Actualizar atención').click();
    await professional.getByText('Envío 1', { exact: true }).waitFor();
    await professional.getByLabel('Mensaje destinado al paciente para corregir').fill('Precisión de ensayo');
    await button(professional, 'Solicitar corrección').click();
    await professional.getByText('Corrección pendiente', { exact: true }).waitFor();
    await button(patient, 'Actualizar atención').click();
    await patient.getByText('Corrección del envío 1: Precisión de ensayo', { exact: true }).waitFor();
    await patient.locator('textarea').first().fill('Respuesta ficticia corregida');
    await button(patient, 'Guardar borrador privado').click();
    await patient.getByLabel(/Confirmo enviar esta versión guardada/).check();
    await button(patient, 'Enviar versión inmutable').click();
    await patient.getByText('Envío 2', { exact: true }).waitFor();
    await button(professional, 'Actualizar atención').click();
    await professional.getByLabel(/Registro expresamente la validación profesional/).check();
    await button(professional, 'Registrar validación exacta').click();
    await professional.getByText('Entrevista validada', { exact: true }).waitFor();
  }, [503]);

  await scenario('CARE03', async () => {
    selectedPage = patient;
    await professional.getByLabel(/Declaro suficiente para este ensayo/).check();
    await button(professional, 'Declarar suficiencia').click();
    await professional.getByText('Suficiencia confirmada', { exact: true }).waitFor();
    await button(patient, 'Actualizar atención').click();
    await patient.getByLabel(/He leído y acepto el consentimiento de tratamiento/).check();
    await button(patient, 'Aceptar tratamiento ficticio').click();
    await patient.getByText('Consentimiento de tratamiento vigente', { exact: true }).waitFor();
    await button(professional, 'Actualizar atención').click();
    await button(professional, 'Activar episodio ficticio').click();
    const date = new Date(Date.now() - 48 * 3600 * 1000).toISOString().slice(0, 10);
    await professional.getByLabel('Fecha de la primera cita').fill(date);
    await professional.getByLabel('Hora de inicio').selectOption('10:00');
    await button(professional, 'Reservar cita de 60 minutos').click();
    await button(professional, 'Completar cita').click();
    await professional.getByLabel('Nota profesional privada').fill('Original ficticio reservado CARE03');
    await button(professional, 'Registrar nota privada').click();
    await professional.getByText('Original ficticio reservado CARE03', { exact: true }).waitFor();
    await button(nav(patient), 'Mis citas').press('Enter');
    assert.equal(await button(nav(patient), 'Mis citas').getAttribute('aria-current'), 'page');
    assert.equal(await button(nav(patient), 'Mi atención').getAttribute('aria-current'), null);
    await button(patient, 'Ver detalle de primera cita').click();
    const detail = patient.getByRole('region', { name: 'Detalle de primera cita' });
    await detail.getByText(/10:00 · 60 minutos · Completada/).waitFor();
    assert.doesNotMatch(await detail.innerText(), /Original ficticio reservado|Nota profesional privada/i);
  });

  await scenario('CARE04', async () => {
    selectedPage = professional;
    await professional.locator('summary').filter({ hasText: /^Preparar otro episodio$/ }).click();
    await button(professional, 'Preparar episodio individual').click();
    const select = professional.getByLabel('Episodio de atención', { exact: true });
    await select.locator('option').nth(2).waitFor({ state: 'attached' });
    const options = await select.locator('option').evaluateAll(elements => elements.map(option => option.value));
    const secondId = options.find(value => value && value !== preparedId);
    assert.ok(secondId);
    await select.selectOption(secondId);
    await assign('directed', 'fictional-daily-wellbeing-v1', '¿Qué situaciones te han generado estrés últimamente?');

    await openPatient();
    const patientSelect = patient.getByLabel('Episodio de atención', { exact: true });
    await patientSelect.selectOption(secondId);
    await patient.getByLabel(/Confirmo expresamente la acción y la versión/).check();
    await button(patient, 'Aceptar entrevista dirigida').click();
    await patient.getByText('Consentimiento de admisión aceptado', { exact: true }).waitFor();
    await button(professional, 'Actualizar atención').click();
    await select.selectOption(secondId);
    await professional.getByLabel(/Confirmo expresamente la acción y la versión/).check();
    await button(professional, 'Declaro que realicé la entrevista').click();
    await heading(professional, 'Declaraciones para incorporar').waitFor();
    for (const field of await professional.locator('textarea').all()) await field.fill('Declaración ficticia CARE04');
    await professional.getByLabel(/Confirmo expresamente la acción y la versión/).check();
    await button(professional, 'Incorporar versión dirigida').click();
    await professional.getByText('Entrevista documentada', { exact: true }).waitFor();
    await professional.getByLabel(/Confirmo expresamente la acción y la versión/).check();
    await button(professional, 'Validar expresamente esta versión ficticia').click();
    await professional.getByLabel(/Declaro suficiente para este ensayo/).waitFor();

    // Delay an authorized detail, switch episodes, then release the old response.
    await button(patient, 'Actualizar atención').click();
    await patientSelect.selectOption(preparedId);
    const delayed = await patient.evaluate(async episodeId => {
      const headers = { Authorization: 'Bearer ' + localStorage.getItem('psicopanel_auth_token') };
      const base = 'http://api:5000/api/admissions';
      const list = await (await fetch(base, { headers })).json();
      const target = list.data.find(item => item.episodeId === episodeId);
      const response = await fetch(base + '/' + target.id, { headers });
      return { id: target.id, body: await response.json() };
    }, secondId);
    assert.equal(delayed.body.data.episodeId, secondId);
    let deliver, started, timeout;
    const pending = new Promise(resolve => { started = resolve; });
    const gate = new Promise(resolve => { deliver = resolve; });
    const deadline = new Promise((_, reject) => {
      timeout = setTimeout(() => reject(new Error('No se inició la lectura dirigida retenida')), 12000);
    });
    const path = '**/api/admissions/' + delayed.id;
    await patient.route(path, async route => {
      if (route.request().method() !== 'GET') return route.continue();
      started();
      await gate;
      await route.fulfill({ json: delayed.body, headers: { 'access-control-allow-origin': '*' } }).catch(() => {});
    });
    try {
      await patientSelect.selectOption(secondId);
      await Promise.race([pending, deadline]);
      await patientSelect.selectOption(preparedId);
    } finally {
      clearTimeout(timeout);
      deliver();
      await patient.unrouteAll({ behavior: 'wait' });
    }
    if ((await interview(patient).getAttribute('open')) === null) await interview(patient).locator('summary').click();
    await heading(patient, 'Entrevista inicial general').waitFor();
    assert.equal(await patient.getByText(/Declaración ficticia CARE04/).count(), 0);
  }, [429]);
  assert.equal(events.filter(event => !event.expected).length, 0);
}

main().catch(() => { process.exitCode = 1; }).finally(async () => {
  save();
  if (browser) await browser.close();
});
