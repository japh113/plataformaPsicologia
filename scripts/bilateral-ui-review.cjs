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
  return document.documentElement.scrollWidth <= innerWidth && main.scrollWidth <= main.clientWidth &&
    document.documentElement.scrollHeight <= innerHeight;
}));

async function assertContrast(locator, property, minimum) {
  const ratio = await locator.evaluate((node, property) => {
    const context = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    const computed = getComputedStyle(node);
    const paint = color => {
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
    };
    const luminance = () => {
      const [r, g, b] = Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3).map(channel => {
        const value = channel / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    paint('white');
    paint(computed.backgroundColor);
    const background = luminance();
    paint(computed[property]);
    const foreground = luminance();
    return (Math.max(background, foreground) + 0.05) / (Math.min(background, foreground) + 0.05);
  }, property);
  assert.ok(ratio >= minimum, `${property} contrast ${ratio} below ${minimum}`);
}

async function verifyNavigation(page, width, label) {
  const mobile = width < 768;
  const brand = page.locator(mobile ? 'main > header' : 'aside');
  assert.ok(await brand.getByText('PsicoPanel', { exact: true }).isVisible());
  assert.ok(await brand.locator('svg.lucide-sparkles').isVisible());
  assert.equal(await brand.getByText('P', { exact: true }).count(), 0);

  const nav = page.getByRole('navigation', { name: mobile ? 'Navegación móvil' : 'Navegación principal' });
  const home = button(nav, 'Inicio');
  const entry = button(nav, label);
  await home.focus();
  await page.keyboard.press('Tab');
  assert.ok(await entry.evaluate(node => node === document.activeElement));
  assert.equal(await entry.getAttribute('aria-current'), 'page');
  assert.ok(await entry.evaluate(node => {
    const { outlineStyle, outlineWidth } = getComputedStyle(node);
    return outlineStyle === 'solid' && parseFloat(outlineWidth) >= 2;
  }));
  await assertContrast(entry, 'outlineColor', 3);
  await assertContrast(entry, 'color', 4.5);
  await assertContrast(home, 'color', 4.5);
  await assertNoOverflow(page);
}

function watch(page) {
  activePage = page;
  page.on('pageerror', () => events.push({ scenario: current, type: 'pageerror', expected: false }));
  page.on('response', response => {
    if (response.status() >= 400) events.push({ scenario: current, type: 'http', status: response.status(), expected: allowed.has(response.status()) });
  });
}

async function shot(id, page = activePage || psy) {
  if (page.isClosed()) page = psy;
  const searchesEmpty = await page.locator('input[type=search]').evaluateAll(fields => fields.every(field => !field.value));
  await page.screenshot({
    path: out + '/screenshots/' + id + '.png', fullPage: true, animations: 'disabled',
    mask: [page.locator(searchesEmpty ? 'input:not([type=search])' : 'input'), page.locator('textarea'), page.getByText(/@|Password demo:/)], maskColor: '#475569',
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

async function submitLogin(page, id) {
  await page.locator('input[name=email]').fill(id + '@bilateral.invalid');
  await page.locator('input[name=password]').fill('Episode-Demo-Only-284!');
  await button(page, 'Entrar').click();
}

async function login(id, mobile = true) {
  const context = await browser.newContext({
    viewport: mobile ? { width: 375, height: 812 } : { width: 1280, height: 900 }, locale: 'es-MX',
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  const page = await context.newPage();
  watch(page);
  await page.goto(base);
  await submitLogin(page, id);
  const nav = page.getByRole('navigation', { name: mobile ? 'Navegación móvil' : 'Navegación principal' });
  const professional = id.startsWith('bp');
  const label = professional ? 'Mis pacientes' : 'Mi atención';
  const entry = button(nav, label);
  await entry.waitFor();
  await entry.click();
  await heading(page, label).waitFor();
  assert.equal(await entry.getAttribute('aria-current'), 'page');
  if (mobile) {
    assert.equal(await nav.getByRole('button').count(), professional ? 5 : 4);
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

async function controlInboxReads(page) {
  await page.addInitScript(() => {
    const fetch = window.fetch.bind(window);
    const held = window.heldInboxReads = {};
    const released = window.releasedInboxReads = {};
    window.fetch = async (...args) => {
      const path = new URL(String(args[0]), window.location.href).pathname.split('/').at(-1);
      const delay = held[path] === true;
      if (delay) held[path] = false;
      const response = await fetch(...args);
      if (delay) {
        const read = response.json.bind(response);
        response.json = async () => {
          const body = await read();
          await new Promise(resolve => { held[path] = resolve; });
          released[path] = true;
          return body;
        };
      }
      return response;
    };
  });
}

async function holdInboxReads(page, ...paths) {
  await page.evaluate(names => names.forEach(name => {
    window.heldInboxReads[name] = true;
    window.releasedInboxReads[name] = false;
  }), paths);
}

async function waitForHeldInboxReads(page, ...paths) {
  await page.waitForFunction(names => names.every(name => typeof window.heldInboxReads[name] === 'function'), paths);
}

async function releaseInboxReads(page, ...paths) {
  await page.evaluate(names => names.forEach(name => window.heldInboxReads[name]()), paths);
  await page.waitForFunction(names => names.every(name => window.releasedInboxReads[name]), paths);
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
    await pac.setViewportSize({ width: 1280, height: 900 });
    await verifyNavigation(pac, 1280, 'Mi atención');
    await shot('VIN02-patient-desktop', pac);
    await pac.setViewportSize({ width: 320, height: 750 });
    await verifyNavigation(pac, 320, 'Mi atención');
    assert.equal(await pac.locator('#mobile-invitation-count').count(), 0);
    await shot('VIN02-patient-320', pac);
    const mobile = pac.getByRole('navigation', { name: 'Navegación móvil' });
    await button(mobile, 'Inicio').click();
    assert.equal(await heading(pac, 'Tienes 1 invitación pendiente').count(), 0);
    await pac.getByText(/Consulta las invitaciones bilaterales en/).waitFor();
    await shot('VIN02-inicio-sin-pendientes', pac);
    await button(mobile, 'Mi atención').click();
    await pac.setViewportSize({ width: 375, height: 812 });
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
    const mobile = pac.getByRole('navigation', { name: 'Navegación móvil' });
    assert.equal(await button(mobile, 'Mi atención').getAttribute('aria-describedby'), 'mobile-invitation-count');
    await pac.setViewportSize({ width: 320, height: 750 });
    await assertNoOverflow(pac);
    await shot('VIN03-mi-atencion-pendiente-320', pac);
    await button(mobile, 'Inicio').click();
    await heading(pac, 'Tienes 1 invitación pendiente').waitFor();
    await assertNoOverflow(pac);
    await shot('VIN03-inicio-pendiente-320', pac);
    await pac.setViewportSize({ width: 1280, height: 900 });
    const desktop = pac.getByRole('navigation', { name: 'Navegación principal' });
    assert.equal(await button(desktop, 'Mi atención').getAttribute('aria-describedby'), 'desktop-invitation-count');
    await shot('VIN03-inicio-pendiente-desktop', pac);
    await button(pac, 'Revisar invitación').click();
    await heading(pac, 'Mi atención').waitFor();
    await shot('VIN03-mi-atencion-pendiente-desktop', pac);
    await pac.setViewportSize({ width: 375, height: 812 });
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
    assert.equal(await pac.locator('#mobile-invitation-count').count(), 0);
    assert.equal((await json(pac, '/agreements')).data[0].admissionAuthorization, 'not_granted');
    await button(psy, 'Pacientes vinculados').click();
    await heading(psy, 'Lucía García').waitFor();
    await psy.getByRole('searchbox', { name: 'Buscar por nombre' }).fill('garcia');
    const index = psy.getByRole('region', { name: 'Pacientes vinculados' });
    const status = index.getByText('Vinculación completada', { exact: true });
    await status.waitFor();
    await assertContrast(status, 'color', 4.5);
    assert.equal(await index.getByText('Admisión pendiente', { exact: true }).count(), 0);
    await psy.getByRole('searchbox', { name: 'Buscar por nombre' }).fill('Sin coincidencia');
    await psy.getByText('No hay coincidencias para ese nombre.', { exact: true }).waitFor();
    await psy.getByRole('searchbox', { name: 'Buscar por nombre' }).fill('lucia');
    await status.waitFor();
    await psy.getByRole('searchbox', { name: 'Buscar por nombre' }).clear();
    await psy.setViewportSize({ width: 320, height: 750 });
    await verifyNavigation(psy, 320, 'Mis pacientes');
    const search = index.getByRole('searchbox', { name: 'Buscar por nombre' });
    await search.focus();
    await psy.keyboard.press('Tab');
    assert.ok(await button(index, 'Actualizar pacientes').evaluate(node => node === document.activeElement));
    await psy.keyboard.press('Shift+Tab');
    assert.ok(await search.evaluate(node => node === document.activeElement && getComputedStyle(node).outlineStyle === 'solid'));
    await shot('VIN04-mobile-list', psy);
    await psy.setViewportSize({ width: 1536, height: 900 });
    await verifyNavigation(psy, 1536, 'Mis pacientes');
    await assertContrast(button(psy, 'Invitar paciente'), 'color', 4.5);
    await shot('VIN04-desktop-list', psy);
  }, [404]);
  await scenario('VIN05', async () => {
    await button(pac, 'Volver a Mi atención').click();
    const mobile = pac.getByRole('navigation', { name: 'Navegación móvil' });
    const before = (await json(pac, '/notices')).data;
    await button(mobile, 'Inicio').click();
    await button(psy, 'Abrir atención de Lucía García').click();
    await psy.locator('summary').filter({ hasText: /^Gestionar vinculación$/ }).click();
    await button(psy, 'Terminar vinculación').click();
    await psy.getByRole('dialog', { name: 'Terminar vinculación', exact: true }).getByRole('button', { name: 'Confirmar' }).click();
    await heading(psy, 'Acuerdo terminado').waitFor();
    const [notices] = await Promise.all([
      pac.waitForResponse(response => response.url().endsWith('/notices') && response.request().method() === 'GET'),
      button(mobile, 'Mi atención').click(),
    ]);
    assert.equal(notices.status(), 200);
    const newNotices = (await notices.json()).data.filter(item => !before.some(previous => previous.id === item.id));
    assert.equal(newNotices.length, 1);
    assert.equal(newNotices[0].message, 'Hay una acción disponible en tu cuenta');
    await pac.getByRole('status').filter({ hasText: /^Hay novedades en tu bandeja\.$/ }).waitFor();
    await pac.locator('summary').filter({ hasText: /^Historial$/ }).click();
    await pac.getByRole('heading', { name: /Acuerdo terminado/ }).waitFor();
    assert.equal(await pac.locator('#mobile-invitation-count').count(), 0);
    await shot('VIN05-aviso-neutral', pac);
    await button(psy, 'Volver a Mis pacientes').click();
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
    assert.equal(await page.locator('#mobile-invitation-count').count(), 0);
    await page.getByRole('status').filter({ hasText: 'Esta propuesta quedó cerrada.' }).waitFor();
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
    await psy.getByText(/El acuse no confirma que se haya emitido o entregado/).waitFor();
    assert.equal((await json(page, '/received')).data[0].expiresAt, before.expiresAt);
    psy.once('dialog', dialog => dialog.accept());
    await button(receipt, 'Retirar solicitud').click();
    await heading(psy, 'Retirada').waitFor();
    await button(page, 'Actualizar bandeja').click();
    await page.locator('summary').filter({ hasText: /^Historial$/ }).click();
    await page.getByText(/Retirada · Vence/).waitFor();
    await page.context().close();
  });
  await scenario('VIN09', async () => {
    const context = await browser.newContext({ viewport: { width: 320, height: 750 }, locale: 'es-MX' });
    const page = await context.newPage();
    watch(page);
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    const fixture = (professionalName, status, acceptanceAvailable, expiry = expiresAt) =>
      ({ id: randomUUID(), professionalName, status, acceptanceAvailable, expiresAt: expiry });
    let rows = [
      fixture('Fixture histórico', 'accepted', false),
      fixture('Fixture vencido', 'pending', true, '2000-01-01T00:00:00Z'),
      fixture('Fixture suspendido', 'pending', false),
      fixture('Fixture rechazado', 'declined', false),
      fixture('Fixture retirado', 'withdrawn', false),
      fixture('Fixture pendiente A', 'pending', true),
      fixture('Fixture pendiente B', 'pending', true),
    ];
    let notices = [];
    await page.route('**/bilateral-invitations/received', route => route.request().method() === 'GET'
      ? route.fulfill({ json: { success: true, data: rows }, headers: { 'access-control-allow-origin': '*' } })
      : route.continue());
    await page.route('**/bilateral-invitations/notices', route => route.request().method() === 'GET'
      ? route.fulfill({ json: { success: true, data: notices }, headers: { 'access-control-allow-origin': '*' } })
      : route.continue());
    await controlInboxReads(page);
    try {
      await page.goto(base);
      await submitLogin(page, 'bq6');
      await heading(page, 'Tienes 2 invitaciones pendientes').waitFor();
      assert.equal(await page.locator('#mobile-invitation-count').textContent(), '2 invitaciones pendientes');
      await button(page, 'Revisar invitaciones').click();
      const inbox = page.getByRole('region', { name: 'Invitaciones por responder', exact: true });
      await heading(inbox, 'Fixture pendiente B').waitFor();
      const names = await inbox.getByRole('heading', { level: 3 }).allTextContents();
      assert.deepEqual(names.slice(0, 2), ['Fixture pendiente A', 'Fixture pendiente B']);
      notices = [{ id: randomUUID(), message: 'Hay una acción disponible en tu cuenta' }];
      await holdInboxReads(page, 'received', 'notices');
      await button(page, 'Actualizar bandeja').click();
      await waitForHeldInboxReads(page, 'received', 'notices');
      rows = [];
      notices = [];
      await button(page, 'Cuenta').click();
      await button(page, 'Cerrar sesión').click();
      await button(page, 'Entrar').waitFor();
      assert.equal(await page.locator('#mobile-invitation-count').count(), 0);
      await submitLogin(page, 'bq7');
      await button(page, 'Mi atención').click();
      await page.getByText('No tienes invitaciones disponibles.', { exact: true }).waitFor();
      await releaseInboxReads(page, 'received', 'notices');
      assert.equal(await page.locator('#mobile-invitation-count').count(), 0);
      assert.equal(await page.getByText(/Fixture pendiente/).count(), 0);
      assert.equal(await page.getByText('Hay novedades en tu bandeja.', { exact: true }).count(), 0);
      await button(page.getByRole('navigation', { name: 'Navegación móvil' }), 'Inicio').click();
      assert.equal(await page.getByRole('heading', { name: /invitaci[oó]n(es)? pendiente/i }).count(), 0);
      await shot('VIN09-inicio-sin-pendientes', page);
    } finally {
      await context.close();
    }
  });
  await scenario('VIN10', async () => {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 }, locale: 'es-MX' });
    const page = await context.newPage();
    watch(page);
    const pending = () => ({
      id: randomUUID(), professionalName: 'Profesional ficticio', status: 'pending', acceptanceAvailable: true,
      expiresAt: new Date(Date.now() + 60_000).toISOString(), version: 1, conditionsVersion: 'fictional-individual-v2',
      conditionsHash: 'fixture', conditionsText: 'Condiciones ficticias para la regresión.',
    });
    const withdrawn = item => ({ ...item, status: 'withdrawn', version: 2, acceptanceAvailable: false });
    let rows = [];
    await page.route('**/bilateral-invitations/received', route => route.request().method() === 'GET'
      ? route.fulfill({ json: { success: true, data: rows }, headers: { 'access-control-allow-origin': '*' } })
      : route.continue());
    await page.route('**/bilateral-invitations/notices', route => route.request().method() === 'GET'
      ? route.fulfill({ status: 503, json: { message: 'Avisos no disponibles.' }, headers: { 'access-control-allow-origin': '*' } })
      : route.continue());
    await page.route(/\/bilateral-invitations\/[^/]+\/(accept|decline)$/, route => {
      if (route.request().method() !== 'POST') return route.continue();
      rows = [withdrawn(rows[0])];
      return route.fulfill({ status: 409, json: { message: 'La invitación cambió.' }, headers: { 'access-control-allow-origin': '*' } });
    });
    await controlInboxReads(page);
    try {
      const mobile = page.getByRole('navigation', { name: 'Navegación móvil' });
      const count = page.locator('#mobile-invitation-count');
      const homeCard = page.getByRole('heading', { name: /Tienes .* invitaci[oó]n/ });
      const firstRead = page.waitForResponse(response => response.url().endsWith('/received') && response.request().method() === 'GET');
      await page.goto(base);
      await submitLogin(page, 'bq7');
      assert.deepEqual((await (await firstRead).json()).data, []);
      const first = pending();
      rows = [first];
      await button(mobile, 'Mi atención').click();
      await page.getByText('Pendiente de respuesta', { exact: false }).waitFor();
      await page.getByText('No tienes vinculaciones vigentes.', { exact: true }).waitFor();
      assert.equal(await count.textContent(), '1 invitación pendiente');

      await holdInboxReads(page, 'received');
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await waitForHeldInboxReads(page, 'received');
      rows = [withdrawn(first)];
      await button(page, 'Actualizar bandeja').click();
      await page.locator('summary').filter({ hasText: /^Historial$/ }).click();
      await page.getByText(/Retirada · Vence/).waitFor();
      await releaseInboxReads(page, 'received');
      assert.equal(await page.getByText('Pendiente de respuesta', { exact: false }).count(), 0);
      assert.equal(await count.count(), 0);
      await button(mobile, 'Inicio').click();
      assert.equal(await homeCard.count(), 0);

      for (const action of ['Aceptar vinculación', 'Rechazar invitación']) {
        rows = [pending()];
        await button(mobile, 'Mi atención').click();
        await page.getByText('Pendiente de respuesta', { exact: false }).waitFor();
        assert.equal(await count.textContent(), '1 invitación pendiente');
        await button(page, 'Ver invitación').click();
        if (action === 'Aceptar vinculación') await page.getByLabel(/Acepto expresamente/).check();
        else page.once('dialog', dialog => dialog.accept());
        await holdInboxReads(page, 'received');
        await button(page, action).click();
        await waitForHeldInboxReads(page, 'received');
        await page.getByRole('alert').filter({ hasText: 'La invitación cambió.' }).waitFor();
        await count.waitFor({ state: 'detached' });
        await releaseInboxReads(page, 'received');
        await page.getByText('Vinculación individual · Retirada', { exact: true }).waitFor();
        assert.equal(await count.count(), 0);
        await button(mobile, 'Inicio').click();
        assert.equal(await homeCard.count(), 0);
      }
      await button(mobile, 'Mi atención').click();
      await page.locator('summary').filter({ hasText: /^Historial$/ }).click();
      await page.getByText(/Retirada · Vence/).waitFor();
      assert.equal(await count.count(), 0);
      await shot('VIN10-bandeja-revalidada', page);
    } finally {
      await context.close();
    }
  }, [409, 503]);
  await scenario('VIN11', async () => {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 }, locale: 'es-MX' });
    const page = await context.newPage();
    watch(page);
    const expiry = Date.now() + 24 * 60 * 60 * 1000;
    const terms = 'Condiciones originales de la invitación ficticia.';
    const invitation = {
      id: randomUUID(), professionalName: 'Profesional ficticio', status: 'pending', acceptanceAvailable: true,
      expiresAt: new Date(expiry).toISOString(), version: 1, conditionsVersion: 'fictional-individual-v2',
      conditionsHash: 'fixture', conditionsText: terms,
    };
    let item = invitation;
    await page.route('**/bilateral-invitations/received', route => route.request().method() === 'GET'
      ? route.fulfill({ json: { success: true, data: [item] }, headers: { 'access-control-allow-origin': '*' } })
      : route.continue());
    try {
      await page.clock.install();
      await page.goto(base);
      await submitLogin(page, 'bq7');
      await heading(page, 'Tienes 1 invitación pendiente').waitFor();
      await button(page, 'Revisar invitación').click();
      await button(page, 'Ver invitación').click();
      const accept = button(page, 'Aceptar vinculación');
      const decline = button(page, 'Rechazar invitación');
      const count = page.locator('#mobile-invitation-count');
      const state = label => page.getByText('Vinculación individual · ' + label, { exact: true });
      await page.getByLabel(/Acepto expresamente/).check();
      await page.clock.pauseAt(expiry - 1);
      assert.equal(await count.textContent(), '1 invitación pendiente');
      assert.ok(await state('Pendiente').isVisible());
      assert.ok(await accept.isEnabled());
      assert.ok(await decline.isEnabled());

      await page.clock.runFor(1);
      await state('Vencida').waitFor();
      assert.ok(await heading(page, 'Invitación de vinculación').isVisible());
      assert.equal(await count.count(), 0);
      assert.equal(await accept.count(), 0);
      assert.equal(await decline.count(), 0);
      assert.ok(await page.getByText(terms, { exact: true }).isVisible());
      assert.ok(await page.getByText('Versión fictional-individual-v2', { exact: true }).isVisible());
      await page.clock.resume();
      await shot('VIN11-detalle-vencido', page);

      for (const [status, label] of [['declined', 'Rechazada'], ['accepted', 'Aceptada'], ['withdrawn', 'Retirada'], ['invalidated', 'No disponible']]) {
        item = { ...invitation, status, acceptanceAvailable: false, version: 2 };
        await button(page, 'Actualizar bandeja').click();
        await state(label).waitFor();
        assert.equal(await count.count(), 0);
        assert.ok(await page.getByText(terms, { exact: true }).isVisible());
      }

      const laterExpiry = expiry + 60_000;
      item = { ...invitation, acceptanceAvailable: false, expiresAt: new Date(laterExpiry).toISOString() };
      await button(page, 'Actualizar bandeja').click();
      await state('Pendiente').waitFor();
      assert.ok(await accept.isDisabled());
      assert.ok(await decline.isEnabled());
      await page.clock.pauseAt(laterExpiry);
      await state('Vencida').waitFor();
      assert.equal(await decline.count(), 0);
      await page.clock.resume();
      await button(page.getByRole('navigation', { name: 'Navegación móvil' }), 'Inicio').click();
      assert.equal(await heading(page, 'Tienes 1 invitación pendiente').count(), 0);
    } finally {
      await context.close();
    }
  });
  assert.equal(events.filter(event => !event.expected).length, 0);
  save();
  await browser.close();
}

main().catch(async () => { save(); if (browser) await browser.close(); process.exitCode = 1; });
