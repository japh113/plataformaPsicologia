import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import { transformWithOxc } from 'vite';
import { renderToStaticMarkup } from 'react-dom/server';

async function navigation(flags, role, selected = 'dashboard') {
  let source = await readFile(new URL('../src/components/layout/MobileNav.jsx', import.meta.url), 'utf8');
  source = source.replaceAll('import.meta.env', JSON.stringify(flags))
    .replace("from 'react'", "from '" + import.meta.resolve('react') + "'")
    .replace("from 'lucide-react'", "from '" + import.meta.resolve('lucide-react') + "'");
  const { code } = await transformWithOxc(source, 'MobileNav.jsx', { jsx: { runtime: 'classic' } });
  const { default: MobileNav } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
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
