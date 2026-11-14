import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithOxc } from 'vite';
import { renderToStaticMarkup } from 'react-dom/server';

async function navigation(flags,role,selected='dashboard') {
  let source=await readFile(new URL('../src/components/layout/MobileNav.jsx',import.meta.url),'utf8');
  source=source.replaceAll('import.meta.env',JSON.stringify(flags))
    .replace("from 'react'","from '"+import.meta.resolve('react')+"'")
    .replace("from 'lucide-react'","from '"+import.meta.resolve('lucide-react')+"'");
  const {code}=await transformWithOxc(source,'MobileNav.jsx',{jsx:{runtime:'classic'}});
  const {default:MobileNav}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
  const actions=[];
  const element=MobileNav({currentUser:{role},vistaActiva:selected,setVistaActiva:v=>actions.push(v),onLogout:()=>{}});
  return {element,actions,html:renderToStaticMarkup(element)};
}

test('mobile bilateral entry requires the enabled flag and a patient or psychologist role',async()=>{
  for(const enabled of ['true','false',undefined])for(const role of ['patient','psychologist','support','admin','superadmin',undefined]){
    const {html}=await navigation({VITE_BILATERAL_ENABLED:enabled},role);
    assert.equal(html.includes('aria-label="Vinculación bilateral"'),enabled==='true'&&['patient','psychologist'].includes(role));
  }
});

test('mobile entry opens bilateral and marks the selected view while both optional entries fit one row',async()=>{
  const {element,actions,html}=await navigation({VITE_BILATERAL_ENABLED:'true',VITE_D2_ENABLED:'true'},'psychologist','bilateral');
  const entry=element.props.children.find(child=>child?.props?.['aria-label']==='Vinculación bilateral');
  entry.props.onClick();assert.deepEqual(actions,['bilateral']);
  assert.match(html,/aria-current="page"/);assert.match(html,/repeat\(6, minmax\(0, 1fr\)\)/);
  assert.match(html,/Perfil profesional/);
});
