const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');

const base = process.env.REVIEW_BASE;
const api = process.env.REVIEW_API || 'http://api:5000/api';
const control = process.env.REVIEW_CONTROL || '/control';
const out = process.env.REVIEW_OUT || '/evidence';
const results = [], events = [], screenshots = [];
let current = 'SETUP', allowed = new Set(), browser, psy, pac, activePage;
const button = (page, name) => page.getByRole('button', { name, exact: true });
const heading = (page, name) => page.getByRole('heading', { name, exact: true });
const save = () => fs.writeFileSync(control + '/results.json', JSON.stringify({ results, events, screenshots }, null, 2));
const assertNoOverflow = async page => assert.ok(await page.evaluate(() => {
  const main = document.querySelector('main');
  return document.documentElement.scrollWidth <= innerWidth && main.scrollWidth <= main.clientWidth;
}));

function watch(page) {
  activePage = page;
  page.on('pageerror', () => events.push({ scenario: current, type: 'pageerror', expected: false }));
  page.on('response', response => {
    if (response.status() >= 400) events.push({ scenario: current, type: 'http', status: response.status(), expected: allowed.has(response.status()) });
  });
}

async function shot(id, page = activePage || psy) {
  if (page.isClosed()) page = psy;
  await page.screenshot({
    path: out + '/screenshots/' + id + '.png', fullPage: true, animations: 'disabled',
    mask: [page.locator('input'), page.locator('textarea'), page.getByText(/@|Password demo:/)], maskColor: '#475569',
  });
  screenshots.push({ file: 'screenshots/' + id + '.png', scenario: current, secretsMasked: true });
  save();
}

async function scenario(id, fn, statuses = []) {
  current = id;
  allowed = new Set(statuses);
  try {
    await fn();
    await shot(id);
    results.push({ id, status: 'PASS' });
  } catch (error) {
    fs.writeFileSync(control + '/browser-failure.txt', error.stack || error.message);
    results.push({ id, status: 'FAIL', failureCategory: error.name === 'TimeoutError' ? 'timeout' : 'assertion' });
    try { await shot(id + '-failure'); } catch { /* Keep the initial failure. */ }
    save();
    throw Error('Scenario ' + id + ' failed');
  }
  save();
  console.log(id + ' PASS');
}

async function login(id, mobile = true) {
  const context = await browser.newContext({
    viewport: mobile ? { width: 375, height: 812 } : { width: 1280, height: 900 }, locale: 'es-MX',
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  const page = await context.newPage();
  watch(page);
  await page.goto(base);
  await page.locator('input[name=email]').fill(id + '@bilateral.invalid');
  await page.locator('input[name=password]').fill('Episode-Demo-Only-284!');
  await button(page, 'Entrar').click();
  const nav = page.getByRole('navigation', { name: mobile ? 'Navegación móvil' : 'Navegación principal' });
  const professional = id.startsWith('bp');
  const label = professional ? 'Mis pacientes' : 'Mi atención';
  const entry = button(nav, label);
  await entry.waitFor();
  await entry.click();
  await heading(page, label).waitFor();
  assert.equal(await entry.getAttribute('aria-current'), 'page');
  if (mobile) {
    assert.equal(await nav.getByRole('button').count(), professional ? 5 : 3);
    for (const item of await nav.getByRole('button').all()) {
      const rect = await item.boundingBox();
      assert.ok(rect.x >= 0 && rect.x + rect.width <= 375);
    }
  }
  await page.waitForLoadState('networkidle');
  await assertNoOverflow(page);
  return page;
}

async function json(page, path, body) {
  return page.evaluate(async ({ api, path, body }) => {
    const response = await fetch(api + '/bilateral-invitations' + path, {
      method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + localStorage.getItem('psicopanel_auth_token'), 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, data: (await response.json()).data };
  }, { api, path, body });
}

async function copyCode(page, label) {
  assert.equal(await page.getByLabel(label, { exact: true }).count(), 0);
  await button(page, 'Copiar mi referencia').click();
  const code = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(code, /^[a-f0-9-]{36}\.[A-Za-z0-9_-]{43}$/);
  assert.ok(!page.url().includes(code));
  const persisted = await page.evaluate(value => [localStorage, sessionStorage].some(storage =>
    Object.values(storage).some(item => item.includes(value))), code);
  assert.equal(persisted, false);
  return code;
}

async function waitInvitation(page) {
  const item = page.locator('article').filter({ hasText: 'Pendiente' }).first();
  for (let attempt = 0; attempt < 20; attempt++) {
    await Promise.all([
      page.waitForResponse(response => response.url().endsWith('/received') && response.status() === 200),
      button(page, 'Actualizar bandeja').click(),
    ]);
    try {
      await item.waitFor({ timeout: 500 });
      return item;
    } catch (error) {
      if (error.name !== 'TimeoutError') throw error;
    }
  }
  throw Error('Invitation not delivered in simulator');
}

async function propose(page, target, reference) {
  await button(page, 'Invitar paciente').click();
  const advance = button(page, 'Ya recibí el código del paciente');
  await advance.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  assert.equal(await advance.evaluate(node => getComputedStyle(node).outlineStyle), 'solid');
  await advance.press('Enter');
  await page.getByLabel('Código del paciente', { exact: true }).fill(reference);
  await page.getByLabel('Correo conocido de la persona', { exact: true }).fill(target + '@bilateral.invalid');
  const terms = await json(page, '/terms');
  await page.getByText(terms.data.conditionsText, { exact: true }).waitFor();
  const register = button(page, 'Registrar solicitud');
  const declaration = page.getByLabel(terms.data.declarationText, { exact: true });
  const proposal = page.getByLabel(/Propongo expresamente/);
  assert.ok(await register.isDisabled());
  await declaration.check();
  assert.ok(await register.isDisabled());
  await proposal.check();
  const response = page.waitForResponse(r => r.url().endsWith('/bilateral-invitations') && r.status() === 202);
  await register.click();
  await page.getByRole('status').filter({ hasText: 'Solicitud registrada' }).waitFor();
  assert.match(await page.getByRole('status').filter({ hasText: 'Solicitud registrada' }).innerText(), /cuenta.*requisitos.*entregado/i);
  const data = (await (await response).json()).data;
  assert.deepEqual(Object.keys(data).sort(), ['receiptId', 'status']);
  return data.receiptId;
}

async function prepare(target, professionalReference) {
  const page = await login(target);
  const reference = await json(page, '/recipient-reference', { operationId: randomUUID(), professionalReference, confirmed: true });
  assert.equal(reference.status, 200);
  const id = await propose(psy, target, reference.data.reference);
  const item = await waitInvitation(page);
  return { page, item, id };
}

async function main() {
  browser = await chromium.launch({
    headless: true, ...(process.env.REVIEW_EXECUTABLE ? { executablePath: process.env.REVIEW_EXECUTABLE } : {}),
    args: ['--no-sandbox', ...(process.env.REVIEW_FRONTEND_IP ? ['--host-resolver-rules=MAP frontend.localhost ' + process.env.REVIEW_FRONTEND_IP] : [])],
  });
  fs.writeFileSync(control + '/runtime.json', JSON.stringify({
    playwright: require('playwright/package.json').version, chromium: browser.version(), node: process.version,
    revision: process.env.REVIEW_REVISION, headless: true,
  }));
  let professionalReference, recipientReference;

  await scenario('VIN01', async () => {
    psy = await login('bp1', false);
    await button(psy.getByRole('navigation', { name: 'Navegación principal' }), 'Agenda').waitFor();
    await button(psy, 'Invitar paciente').click();
    await button(psy, 'Generar mi referencia').click();
    await heading(psy, 'Tu referencia está lista').waitFor();
    professionalReference = await copyCode(psy, 'Mi referencia profesional');
    await shot('VIN01-code', psy);
    await button(psy, 'Volver a Mis pacientes').click();
    await heading(psy, 'Mis pacientes').waitFor();
    assert.equal(await button(psy, 'Copiar mi referencia').count(), 0);
  });
  await scenario('VIN02', async () => {
    pac = await login('bq1');
    await button(pac, 'Generar mi referencia').click();
    await pac.getByLabel('Referencia profesional recibida', { exact: true }).fill(professionalReference);
    await button(pac, 'Consultar profesional').click();
    await heading(pac, 'Profesional ficticio bp1').waitFor();
    assert.ok(await button(pac, 'Generar mi referencia dirigida').isDisabled());
    await pac.getByLabel(/Confirmo que quiero generar/).check();
    await button(pac, 'Generar mi referencia dirigida').click();
    await heading(pac, 'Tu referencia está lista').waitFor();
    recipientReference = await copyCode(pac, 'Mi referencia dirigida');
    assert.equal((await json(pac, '/agreements')).data.length, 0);
    await assertNoOverflow(pac);
    await shot('VIN02-patient', pac);
    await button(pac, 'Volver a Mi atención').click();
  });
  await scenario('VIN03', async () => {
    assert.deepEqual((await json(psy, '/linked-patients')).data, []);
    await propose(psy, 'bq1', recipientReference);
    const item = await waitInvitation(pac);
    await button(item, 'Ver invitación').click();
    await heading(pac, 'Invitación de vinculación').waitFor();
    assert.ok(await button(pac, 'Aceptar vinculación').isDisabled());
    const invitation = (await json(pac, '/received')).data[0];
    await pac.getByText(invitation.conditionsText, { exact: true }).waitFor();
    assert.deepEqual((await json(psy, '/linked-patients')).data, []);
    const sent = (await json(psy, '/sent')).data;
    assert.doesNotMatch(JSON.stringify(sent), /email|patient|contact|digest|delivery|blocked|Lucía/i);
    await assertNoOverflow(pac);
    await shot('VIN03-review', pac);
  });
  await scenario('VIN04', async () => {
    const other = await login('bq2');
    const item = (await json(pac, '/received')).data[0];
    const acceptance = { operationId: randomUUID(), expectedVersion: item.version, conditionsVersion: item.conditionsVersion, conditionsHash: item.conditionsHash, confirmed: true };
    assert.equal((await json(other, '/' + item.id + '/accept', acceptance)).status, 404);
    await other.context().close();
    await pac.getByLabel(/Acepto expresamente/).check();
    await button(pac, 'Aceptar vinculación').click();
    await pac.getByRole('status').filter({ hasText: 'Acuerdo bilateral completado' }).waitFor();
    assert.equal((await json(pac, '/agreements')).data[0].admissionAuthorization, 'not_granted');
    await button(psy, 'Pacientes vinculados').click();
    await psy.getByRole('rowheader', { name: 'Lucía García' }).waitFor();
    await psy.getByRole('searchbox', { name: 'Buscar por nombre' }).fill('garcia');
    const index = psy.getByRole('region', { name: 'Pacientes vinculados' });
    await index.getByText('Vinculación completada', { exact: true }).waitFor();
    assert.equal(await index.getByText('Admisión pendiente', { exact: true }).count(), 0);
    await psy.getByRole('searchbox', { name: 'Buscar por nombre' }).fill('Sin coincidencia');
    await psy.getByText('No hay coincidencias para ese nombre.', { exact: true }).waitFor();
    await psy.getByRole('searchbox', { name: 'Buscar por nombre' }).fill('lucia');
    await psy.setViewportSize({ width: 320, height: 750 });
    await assertNoOverflow(psy);
    await shot('VIN04-mobile-list', psy);
    await psy.setViewportSize({ width: 1280, height: 900 });
    await shot('VIN04-desktop-list', psy);
  }, [404]);
  await scenario('VIN05', async () => {
    await button(pac, 'Volver a Mi atención').click();
    pac.once('dialog', dialog => dialog.accept());
    await button(pac, 'Terminar acuerdo unilateralmente').click();
    await pac.getByRole('heading', { name: /Acuerdo terminado/ }).waitFor();
    await button(psy, 'Actualizar pacientes').click();
    await psy.getByText('Todavía no hay pacientes vinculados disponibles.', { exact: true }).waitFor();
    await button(psy, 'Invitaciones').click();
    await heading(psy, 'Acuerdo terminado').waitFor();
  });
  await scenario('VIN06', async () => {
    const { page, item } = await prepare('bq3', professionalReference);
    await button(item, 'Ver invitación').click();
    page.once('dialog', dialog => dialog.accept());
    await button(page, 'Rechazar invitación').click();
    await page.getByText(/Vinculación individual · Rechazada/).waitFor();
    await shot('VIN06-declined', page);
    await page.context().close();
  });
  await scenario('VIN07', async () => {
    const { page, item } = await prepare('bq4', professionalReference);
    await button(item, 'Ver invitación').click();
    page.once('dialog', dialog => dialog.accept());
    await button(page, 'Bloquear invitaciones de este profesional').click();
    await page.getByText(/Vinculación individual · No disponible/).waitFor();
    await button(page, 'Volver a Mi atención').click();
    await button(page, 'Desbloquear').click();
    await button(page, 'Desbloquear').waitFor({ state: 'hidden' });
    assert.equal((await json(page, '/received')).data[0].status, 'invalidated');
    await shot('VIN07-block', page);
    await page.context().close();
  });
  await scenario('VIN08', async () => {
    const { page, id } = await prepare('bq5', professionalReference);
    const before = (await json(page, '/received')).data[0];
    assert.equal(before.id, id);
    const receipt = psy.locator('article').filter({ has: heading(psy, 'Solicitud registrada') }).first();
    await button(receipt, 'Solicitar reenvío').click();
    await psy.getByRole('status').filter({ hasText: 'Solicitud de reenvío registrada' }).waitFor();
    assert.equal((await json(page, '/received')).data[0].expiresAt, before.expiresAt);
    psy.once('dialog', dialog => dialog.accept());
    await button(receipt, 'Retirar solicitud').click();
    await heading(psy, 'Retirada').waitFor();
    await button(page, 'Actualizar bandeja').click();
    await page.locator('article').getByText(/Retirada · Vence/).waitFor();
    await page.context().close();
  });
  assert.equal(events.filter(event => !event.expected).length, 0);
  save();
  await browser.close();
}

main().catch(async () => { save(); if (browser) await browser.close(); process.exitCode = 1; });
