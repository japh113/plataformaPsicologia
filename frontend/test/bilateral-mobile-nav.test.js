import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import { transformWithOxc } from 'vite';
import { renderToStaticMarkup } from 'react-dom/server';

async function componentUrl(name, flags, imports = {}) {
  let source = await readFile(new URL(`../src/components/layout/${name}.jsx`, import.meta.url), 'utf8');
  source = source.replaceAll('import.meta.env', JSON.stringify(flags))
    .replace("from 'react'", "from '" + import.meta.resolve('react') + "'")
    .replace("from 'lucide-react'", "from '" + import.meta.resolve('lucide-react') + "'");
  for (const [specifier, url] of Object.entries(imports)) source = source.replace(`from '${specifier}'`, `from '${url}'`);
  const { code } = await transformWithOxc(source, name + '.jsx', { jsx: { runtime: 'classic' } });
  return 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
}

async function navigation(flags, role, selected = 'dashboard') {
  const { default: MobileNav } = await import(await componentUrl('MobileNav', flags));
  const actions = [];
  const element = MobileNav({ currentUser: { role }, vistaActiva: selected, setVistaActiva: v => actions.push(v), onLogout: () => {} });
  return { element, actions, html: renderToStaticMarkup(element) };
}

test('bilateral navigation is role-specific and requires the flag', async () => {
  for (const enabled of ['true', 'false', undefined]) {
    for (const role of ['patient', 'psychologist', 'support', 'admin', 'superadmin', undefined]) {
      const { html } = await navigation({ VITE_BILATERAL_ENABLED: enabled }, role);
      assert.equal(html.includes('Mis pacientes'), enabled === 'true' && role === 'psychologist');
      assert.equal(html.includes('Mi atención'), enabled === 'true' && role === 'patient');
    }
  }
});

test('desktop keeps the original wordmark and role-specific routes with either flag value', async () => {
  const brandUrl = await componentUrl('PsicoPanelBrand', {});
  const { default: Brand } = await import(brandUrl);
  const wordmark = renderToStaticMarkup(Brand());
  assert.match(wordmark, /lucide-sparkles/);
  assert.match(wordmark, /Psico<span class="text-indigo-600">Panel<\/span>/);
  for (const enabled of ['true', 'false']) {
    const { default: Sidebar } = await import(await componentUrl('Sidebar', { VITE_BILATERAL_ENABLED: enabled }, {
      './PsicoPanelBrand': brandUrl,
    }));
    for (const role of ['psychologist', 'patient', 'support', 'admin', 'superadmin']) {
      const html = renderToStaticMarkup(Sidebar({ currentUser: { role }, vistaActiva: 'dashboard' }));
      assert.ok(html.includes(wordmark));
      const professional = enabled === 'true' && role === 'psychologist';
      assert.equal(html.includes('Mis pacientes'), professional);
      assert.equal(html.includes('Agenda'), professional);
      assert.equal(html.includes('Mi atención'), enabled === 'true' && role === 'patient');
      assert.doesNotMatch(html, /Vinculación bilateral/);
    }
  }
});

test('Mis pacientes and Mi atención open their own views and keep related navigation selected', async () => {
  const flags = { VITE_BILATERAL_ENABLED: 'true', VITE_D2_ENABLED: 'true', VITE_ADMISSION_ENABLED: 'true' };
  for (const [role, related, target, columns] of [
    ['psychologist', 'legacy-patients', 'my-patients', 6],
    ['patient', 'admissions', 'my-care', 3],
  ]) {
    const { element, actions, html } = await navigation(flags, role, related);
    const entry = element.props.children.find(child => child.props['aria-current'] === 'page');
    entry.props.onClick();
    assert.deepEqual(actions, [target]);
    assert.match(html, new RegExp('repeat\\(' + columns + ', minmax\\(0, 1fr\\)\\)'));
  }
});
