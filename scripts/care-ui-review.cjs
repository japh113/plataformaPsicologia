const assert = require('node:assert/strict');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
const { chromium } = require('playwright');

const root = process.env.REVIEW_BASE;
const results = [], events = [], screenshots = [];
let browser, professional, patient, current, expected, selectedPage, selfInterview, directedInterview;
const button = (scope, name) => scope.getByRole('button', { name, exact: true });
const heading = (scope, name) => scope.getByRole('heading', { name, exact: true });
const nav = (page, desktop = false) => page.getByRole('navigation', { name: 'Navegación ' + (desktop ? 'principal' : 'móvil') });
const save = () => fs.writeFileSync('/control/results.json', JSON.stringify({ results, events, screenshots }, null, 2));
const summary = (page, title) => page.locator('summary').filter({ hasText: title });

async function screenshot(id, page) {
  const file = 'screenshots/' + id + '.png';
  const showcase = /^0[1-8]-/.test(id);
  const viewport = page.viewportSize();
  const main = page.getByRole('main');
  const scroll = await main.evaluate(node => ({ top: node.scrollTop, height: node.scrollHeight, width: node.scrollWidth, client: node.clientWidth }));
  if (showcase) {
    assert.ok(scroll.width <= scroll.client, id + ' desborda la ficha');
    await page.setViewportSize({ ...viewport, height: Math.max(viewport.height, scroll.height + 8) });
    await main.evaluate(node => { node.scrollTop = 0; });
  }
  try {
    await page.screenshot({
      path: '/evidence/' + file, fullPage: true, animations: 'disabled', maskColor: '#475569',
      mask: [page.locator('input[type=password]:visible, input[type=email]:visible, textarea:visible'), page.getByText(/@|Password demo:/).filter({ visible: true })],
    });
  } finally {
    if (showcase) {
      await page.setViewportSize(viewport);
      await main.evaluate((node, top) => { node.scrollTop = top; }, scroll.top);
    }
  }
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
  await button(professional, 'Abrir atención de bq2').click();
  await heading(professional, 'bq2').waitFor();
}

async function openPatient() {
  await button(nav(patient), 'Mi atención').click();
  await button(patient, 'Ver atención').click();
  await heading(patient, 'Profesional ficticio bp2').waitFor();
}

async function confirmed(page, path, data) {
  return page.evaluate(async ({ path, data }) => {
    const response = await fetch('http://api:5000/api/admissions' + path, {
      method: data ? 'POST' : 'GET',
      headers: { Authorization: 'Bearer ' + localStorage.getItem('psicopanel_auth_token'), 'Content-Type': 'application/json' },
      ...(data ? { body: JSON.stringify(data) } : {}),
    });
    return { status: response.status, body: await response.json() };
  }, { path, data });
}

const focus = async page => {
  await page.bringToFront();
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
};
const label = (page, text) => page.getByLabel(text, { exact: true });
const statusBox = page => page.getByRole('region', { name: 'Estado de la primera consulta' });
const selector = page => label(page, 'Selecciona la atención que quieres abrir');

function steps() {
  const acts = [];
  return {
    async click(page, name) {
      await button(page, name).click();
      acts.push(name);
    },
    async select(page, name, value) {
      await page.getByLabel(name).selectOption(value);
      acts.push(name);
    },
    async fill(page, name, value) {
      await page.getByLabel(name).fill(value);
      acts.push(name);
    },
    assertCount(expected) { assert.equal(acts.length, expected, acts.join(' · ')); },
  };
}

async function conclude(flow, hour, daysAgo) {
  await focus(professional);
  if (current === 'CARE02') await screenshot('04-entrevista-recibida', professional);
  await flow.click(professional, 'Confirmar entrevista para iniciar la atención');
  await professional.getByRole('heading', { name: 'Entrevista confirmada', exact: true }).waitFor();
  await focus(patient);
  await button(patient, 'Aceptar tratamiento').waitFor();
  if (current === 'CARE02') await screenshot('05-consentimiento-pendiente', patient);
  await flow.click(patient, 'Aceptar tratamiento');
  await patient.getByRole('heading', { name: 'Tratamiento aceptado', exact: true }).waitFor();
  await focus(professional);
  await flow.click(professional, 'Iniciar tratamiento');
  await professional.getByLabel('Fecha de la primera cita').waitFor();
  if (current === 'CARE02') await screenshot('06-tratamiento-iniciado', professional);
  const date = new Date(Date.now() - daysAgo * 24 * 3600 * 1000).toISOString().slice(0, 10);
  await flow.fill(professional, 'Fecha de la primera cita', date);
  const available = professional.getByLabel('Hora de inicio');
  await available.locator(`option[value="${hour}"]`).waitFor({ state: 'attached' });
  assert.equal(await available.locator('option[value="04:00"]').count(), 0);
  await flow.select(professional, 'Hora de inicio', hour);
  await flow.click(professional, 'Reservar primera cita');
  await statusBox(professional).getByText(new RegExp(hour + ' · 60 minutos · Pendiente')).waitFor();
  await focus(patient);
  await statusBox(patient).getByText(new RegExp(hour + ' · 60 minutos · Pendiente')).waitFor({ timeout: 24000 });
  if (current === 'CARE02') {
    await screenshot('07-primera-cita', patient);
    await summary(patient, /^Gestionar atención/).click();
    const withdrawal = button(patient, 'Retirar consentimiento de tratamiento');
    await withdrawal.waitFor();
    const management = patient.locator('details[open]').filter({ has: summary(patient, /^Gestionar atención/) });
    await button(management, 'Retirar consentimiento de entrevista').waitFor();
    await button(management, 'Terminar acuerdo').waitFor();
    await screenshot('08-acciones-sensibles', patient);
    await withdrawal.click();
    const dialog = patient.getByRole('dialog', { name: 'Retirar consentimiento de tratamiento' });
    await dialog.waitFor();
    await patient.keyboard.press('Escape');
    assert.equal(await dialog.isVisible(), false);
    await patient.waitForFunction(() => document.activeElement?.textContent === 'Retirar consentimiento de tratamiento');
    await label(patient, 'Etapas completadas').waitFor();
  }
}

async function timeout(promise, message) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), 10000);
    })]);
  } finally { clearTimeout(timer); }
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
    await patient.getByText('Tu profesional te enviará la entrevista inicial desde esta ficha.', { exact: true }).waitFor();
    assert.equal(await button(patient, 'Continuar a mi atención').count(), 0);
    await button(patient, 'Volver a Mi atención').click();
    await button(patient, 'Ver atención').waitFor();
    assert.equal(await button(patient, 'Ver atención').count(), 1);
    assert.equal(await button(patient, 'Ver invitación').count(), 0);
    assert.equal(await button(nav(patient), 'Admisión').count(), 0);
    assert.ok(await nav(patient).evaluate(node => node.scrollWidth <= node.clientWidth));
  });

  await scenario('CARE02', async () => {
    selectedPage = professional;
    const flow = steps();
    await button(nav(professional, true), 'Mis pacientes').click();
    const linked = professional.getByRole('region', { name: 'Pacientes vinculados' });
    await focus(professional);
    await button(linked, 'Actualizar pacientes').click();
    await linked.getByText('Te toca actuar', { exact: true }).waitFor();
    const listPath = '**/api/admissions';
    await professional.route(listPath, route => route.fulfill({
      status: 403, headers: { 'access-control-allow-origin': '*' }, json: { message: 'Consulta ficticia no autorizada' },
    }));
    await button(linked, 'Actualizar pacientes').click();
    await linked.getByText('Próxima acción por confirmar.', { exact: true }).waitFor();
    assert.equal(await linked.getByText('Te toca actuar', { exact: true }).count(), 0);
    await professional.unroute(listPath);
    await button(linked, 'Actualizar pacientes').click();
    await linked.getByText('Te toca actuar', { exact: true }).waitFor();
    await screenshot('01-mis-pacientes-con-pendientes', professional);
    await nav(professional, true).getByText('1 acción pendiente', { exact: true }).waitFor({ state: 'attached' });
    await button(professional, 'Abrir atención de bq2').click();
    await summary(professional, /^Invitación y vinculación$/).click();
    await professional.getByText(/^Invitación aceptada el/).waitFor();
    await summary(professional, /^Invitación y vinculación$/).click();
    await button(professional, 'Enviar entrevista inicial').waitFor();
    await professional.getByText('1 de 6 completados', { exact: true }).waitFor();
    await screenshot('02-ficha-recien-vinculada', professional);
    await openPatient();
    const path = '**/api/admissions/care-start';
    await professional.route(path, async route => {
      if (route.request().method() !== 'POST') return route.continue();
      const response = await route.fetch();
      assert.equal(response.status(), 200);
      selfInterview = (await response.json()).data;
      await route.fulfill({ response, status: 503, json: { success: false, message: 'Respuesta ficticia perdida' } });
    });
    await flow.click(professional, 'Enviar entrevista inicial');
    await heading(professional, 'Entrevista enviada al paciente').waitFor();
    await professional.unroute(path);
    await professional.reload();
    await openProfessional();
    await heading(professional, 'Entrevista enviada al paciente').waitFor();
    assert.equal(await button(professional, 'Preparar episodio individual').count(), 0);
    await focus(patient);
    await button(patient, 'Aceptar y empezar').waitFor();
    await button(patient, 'Volver a Mi atención').click();
    const ownCare = patient.getByRole('region', { name: 'Vinculaciones actuales' });
    await ownCare.getByText('1 tarea pendiente', { exact: true }).waitFor();
    await nav(patient).getByText('1 acción pendiente', { exact: true }).waitFor({ state: 'attached' });
    const consultationList = '**/api/admissions/consultations';
    await patient.route(consultationList, route => route.fulfill({
      status: 503, headers: { 'access-control-allow-origin': '*' }, json: { message: 'Estado ficticio no disponible' },
    }));
    await button(patient, 'Actualizar bandeja').click();
    await ownCare.getByText('Tareas por confirmar', { exact: true }).waitFor();
    assert.equal(await ownCare.getByText('Sin tareas pendientes', { exact: true }).count(), 0);
    await patient.unroute(consultationList);
    await button(patient, 'Actualizar bandeja').click();
    await ownCare.getByText('1 tarea pendiente', { exact: true }).waitFor();
    await button(ownCare, 'Ver atención').click();
    await button(patient, 'Aceptar y empezar').waitFor();
    await screenshot('03-entrevista-pendiente', patient);
    await flow.click(patient, 'Aceptar y empezar');
    const answers = patient.locator('textarea');
    await answers.first().waitFor();
    for (const field of await answers.all()) await field.fill('Respuesta ficticia de prueba');
    await patient.getByText('Borrador guardado en privado.', { exact: true }).waitFor();
    await patient.reload();
    await openPatient();
    assert.equal(await patient.locator('textarea').first().inputValue(), 'Respuesta ficticia de prueba');
    assert.equal(await professional.getByText('Respuesta ficticia de prueba', { exact: true }).count(), 0);

    let held, deliver;
    const ready = new Promise(resolve => { held = resolve; });
    const gate = new Promise(resolve => { deliver = resolve; });
    const autosave = '**/api/admissions/' + selfInterview.id + '/save';
    await patient.route(autosave, async route => {
      if (route.request().method() !== 'POST') return route.continue();
      const response = await route.fetch();
      held(response.status());
      await gate;
      await route.fulfill({ response }).catch(() => {});
    });
    try {
      await patient.locator('textarea').first().fill('Borrador anterior a la confirmación');
      assert.equal(await timeout(ready, 'No se inició el autoguardado'), 200);
      await patient.locator('textarea').first().fill('Texto exacto confirmado por el paciente');
      await flow.click(patient, 'Enviar mis respuestas a Profesional ficticio bp2');
    } finally {
      deliver();
      await patient.unroute(autosave);
    }
    await patient.getByRole('heading', { name: 'Entrevista en revisión', exact: true }).waitFor();
    await focus(professional);
    await professional.getByText('Texto exacto confirmado por el paciente', { exact: true }).waitFor();
    await conclude(flow, '10:00', 2);
    flow.assertCount(9);
    assert.equal(await professional.locator('input[type=checkbox]').count(), 0);
    assert.equal(await patient.locator('input[type=checkbox]').count(), 0);
  }, [403, 503, 429]);

  await scenario('CARE03', async () => {
    selectedPage = patient;
    await summary(professional, /^Ver entrevista inicial$/).click();
    await professional.getByText('Texto exacto confirmado por el paciente', { exact: true }).waitFor();
    await button(professional, 'Completar cita').click();
    await summary(professional, /^Nota profesional privada$/).click();
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

    const clinician = await login('bp3', 1280);
    const owner = await login('bq3', 320);
    try {
      await button(nav(clinician, true), 'Mis pacientes').click();
      await button(clinician, 'Abrir atención de bq3').click();
      await summary(clinician, /^Pedir una aclaración$/).click();
      const question = clinician.getByLabel('Pregunta que necesita aclaración');
      const focusedLabel = await question.locator('option').nth(2).textContent();
      await question.selectOption({ index: 2 });
      await clinician.getByText(/^Respuesta original · /).waitFor();
      await clinician.getByLabel('Qué necesita aclararse').fill('Describe un ejemplo ficticio');
      await button(clinician, 'Pedir una aclaración').click();
      await clinician.getByRole('heading', { name: 'Corrección pendiente', exact: true }).waitFor();
      await button(nav(owner), 'Mi atención').click();
      await button(owner, 'Ver atención').click();
      const clarification = owner.getByRole('region', { name: 'Aclaración de entrevista' });
      await clarification.getByText('Describe un ejemplo ficticio', { exact: true }).waitFor();
      await clarification.getByText(focusedLabel, { exact: true }).waitFor();
      await owner.getByText('Pregunta señalada en la aclaración', { exact: true }).waitFor();
      await owner.getByRole('textbox', { name: focusedLabel, exact: true }).fill('Aclaración ficticia guardada en la atención');
      await button(owner, 'Enviar mis respuestas a Profesional ficticio bp3').click();
      await focus(clinician);
      await clinician.getByText('Aclaración ficticia guardada en la atención', { exact: true }).waitFor();
      await summary(clinician, /^Comparar respuestas · 1 cambio$/).click();
      const comparison = clinician.getByRole('region', { name: 'Aclaración de entrevista' });
      await comparison.getByText(/^Antes · /).waitFor();
      await comparison.getByText(/^Ahora · Aclaración ficticia guardada en la atención$/).waitFor();
      await summary(clinician, /^Ver versiones anteriores$/).waitFor();
    } finally {
      await clinician.context().close();
      await owner.context().close();
    }
  });

  await scenario('CARE04', async () => {
    selectedPage = professional;
    const flow = steps();
    await summary(professional, /^Iniciar otra atención$/).click();
    await flow.select(professional, 'Modalidad', 'directed');
    const started = professional.waitForResponse(response => response.url().endsWith('/admissions/care-start')
      && response.request().method() === 'POST' && response.status() === 200);
    await flow.click(professional, 'Enviar entrevista inicial');
    directedInterview = (await (await started).json()).data;
    await selector(professional).selectOption(directedInterview.episodeId);

    await openPatient();
    await selector(patient).selectOption(directedInterview.episodeId);
    await flow.click(patient, 'Aceptar entrevista con mi profesional');
    await focus(professional);
    await professional.locator('textarea').first().waitFor();
    for (const field of await professional.locator('textarea').all()) await field.fill('Declaración ficticia CARE04');
    await flow.click(professional, 'Registrar entrevista realizada');
    await conclude(flow, '11:00', 3);
    flow.assertCount(10);
    await summary(professional, /^Ver entrevista inicial$/).click();
    await professional.getByText('Declaración ficticia CARE04', { exact: true }).first().waitFor();

    // Hold the authorized second interview while switching to the first.
    const target = await confirmed(patient, '/' + directedInterview.id);
    assert.equal(target.status, 200);
    await selector(patient).selectOption(selfInterview.episodeId);
    let delivered, entered;
    const enteredGate = new Promise(resolve => { entered = resolve; });
    const deliverGate = new Promise(resolve => { delivered = resolve; });
    const routePath = '**/api/admissions/' + directedInterview.id;
    await patient.route(routePath, async route => {
      if (route.request().method() !== 'GET') return route.continue();
      entered();
      await deliverGate;
      await route.fulfill({ json: target.body, headers: { 'access-control-allow-origin': '*' } }).catch(() => {});
    });
    try {
      await selector(patient).selectOption(directedInterview.episodeId);
      await summary(patient, /^Ver entrevista inicial$/).click();
      await timeout(enteredGate, 'No se inició la lectura del segundo episodio');
      await selector(patient).selectOption(selfInterview.episodeId);
    } finally {
      delivered();
      await patient.unrouteAll({ behavior: 'wait' });
    }
    await summary(patient, /^Ver entrevista inicial$/).click();
    await patient.getByText('Texto exacto confirmado por el paciente', { exact: true }).waitFor();
    assert.equal(await patient.getByText(/Declaración ficticia CARE04/).count(), 0);
  }, [429]);
  assert.equal(events.filter(event => !event.expected).length, 0);
}

main().catch(() => { process.exitCode = 1; }).finally(async () => {
  save();
  if (browser) await browser.close();
});
