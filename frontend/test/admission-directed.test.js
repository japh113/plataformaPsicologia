import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import React,{act} from 'react';
import { transformWithOxc } from 'vite';
import { installReactDomHost,elements } from './helpers/reactDomHost.js';
const document=installReactDomHost();document.oninput=null;
const createElement=document.createElement.bind(document);
document.createElement=name=>{const element=createElement(name);Object.defineProperty(element,'disabled',{get:()=>element.getAttribute('disabled')!==null,set:v=>{if(v)element.setAttribute('disabled','');else element.removeAttribute('disabled');}});if(name==='input')Object.defineProperty(element,'type',{get:()=>element.getAttribute('type')||'text',set:v=>{element.setAttribute('type',v);}});return element;};
const {createRoot}=await import('react-dom/client');
const url=new URL('../src/components/DirectedAdmission.jsx',import.meta.url).href;
const assessment=new URL('../src/components/AdmissionAssessment.jsx',import.meta.url).href;
const compiled=new Map();for(const target of [url,assessment])compiled.set(target,(await transformWithOxc(await readFile(new URL(target),'utf8'),new URL(target).pathname,{jsx:{runtime:'classic'}})).code);
const api='data:text/javascript,'+encodeURIComponent('export const apiRequest=(...args)=>globalThis.__directedApi(...args);');
const hook=registerHooks({resolve(specifier,context,next){if(compiled.has(context.parentURL)&&specifier==='../api/client')return {url:api,shortCircuit:true};if(context.parentURL===url&&specifier==='./AdmissionAssessment')return {url:assessment,shortCircuit:true};return next(specifier,context);},load(target,context,next){if(compiled.has(target))return {format:'module',source:"import React from 'react';\n"+compiled.get(target),shortCircuit:true};return next(target,context);}});
const {default:Directed}=await import(url);hook.deregister();
const detail=(id='a',extra={})=>({id,mode:'directed',episodeId:'101',professionalName:'Profesional ficticio',state:'accepted',version:3,reviewState:'awaiting_document',latestDocument:0,attestation:{recordedAt:'2026-11-18T12:00:00Z'},documents:[],requests:[],validations:[],template:{questions:[{id:'reason',label:'Motivo ficticio',maxLength:1000},{id:'context',label:'Contexto declarado',maxLength:1000}]},...extra});
async function fixture(){
  const calls=[],container=document.createElement('div');document.body.appendChild(container);const root=createRoot(container);
  globalThis.__directedApi=(path,options={})=>new Promise((resolve,reject)=>calls.push({path,options,resolve,reject}));
  const all=tag=>elements(container).filter(n=>n.localName===tag),button=label=>all('button').find(n=>n.textContent===label);
  return {calls,button,text:()=>container.textContent,values:()=>all('textarea').map(n=>n.value),
    render:async(id='a',professional=true)=>act(async()=>root.render(React.createElement(Directed,{key:id,id,professional}))),
    resolve:async(i,data)=>act(async()=>calls[i].resolve({data})),reject:async(i,status)=>act(async()=>calls[i].reject(Object.assign(new Error('Fallo controlado'),{status}))),
    edit:async()=>act(async()=>{for(const [i,n]of all('textarea').entries()){n.value=['LOCAL_REASON','LOCAL_CONTEXT'][i];n.dispatchEvent(new Event('input',{bubbles:true}));}}),
    confirm:async()=>act(async()=>{const n=all('input').at(-1);assert.equal(n.disabled,false);n.checked=true;n.click();}),
    click:async label=>act(async()=>{assert.equal(button(label).disabled,false);button(label).click();}),
    close:async()=>{await act(async()=>root.unmount());document.body.removeChild(container);delete globalThis.__directedApi;}};
}
for(const status of [409,503])test(`directed document ${status} retains local declarations requires refresh and releases busy`,async()=>{
  const h=await fixture();try{
    await h.render();await h.resolve(0,detail());await h.edit();await h.confirm();await h.click('Incorporar versión dirigida');
    const p=JSON.parse(h.calls[1].options.body);assert.deepEqual(p.declarations,{reason:'LOCAL_REASON',context:'LOCAL_CONTEXT'});assert.equal(p.expectedDocumentRevision,0);
    await h.reject(1,status);assert.deepEqual(h.values(),['LOCAL_REASON','LOCAL_CONTEXT']);assert.equal(h.button('Actualizar entrevista y conservar texto').disabled,false);assert.equal(h.button('Incorporar versión dirigida').disabled,true);
    await h.click('Actualizar entrevista y conservar texto');await h.resolve(2,detail());assert.deepEqual(h.values(),['LOCAL_REASON','LOCAL_CONTEXT']);await h.confirm();await h.click('Incorporar versión dirigida');
    assert.notEqual(JSON.parse(h.calls[3].options.body).operationId,p.operationId);await h.resolve(3,{saved:true});await h.resolve(4,detail());
  }finally{await h.close();}
});
for(const status of [200,409,503])test(`directed late write ${status} after selection change cannot restore former document or error`,async()=>{
  const h=await fixture();try{
    await h.render();await h.resolve(0,detail());await h.edit();await h.confirm();await h.click('Incorporar versión dirigida');
    await h.render('b');await h.resolve(2,detail('b',{episodeId:'202',professionalName:'OTRO_PROFESIONAL'}));
    if(status===200)await h.resolve(1,{saved:true});else await h.reject(1,status);
    assert.match(h.text(),/OTRO_PROFESIONAL/);assert.doesNotMatch(h.text(),/Fallo controlado|LOCAL_REASON|LOCAL_CONTEXT/);assert.equal(h.button('Actualizar entrevista y conservar texto').disabled,false);
  }finally{await h.close();}
});
test('directed own read after revocation presents incorporated provenance and correction decision without editable forms',async()=>{
  const h=await fixture();try{
    await h.render('a',false);await h.resolve(0,detail('a',{state:'revoked',readOnly:true,latestDocument:1,documents:[{revision:1,declarations:{reason:'OWN_RECORDED',context:'OWN_CONTEXT'},authorId:'psi',subjectId:'pac',recordedAt:'2026-11-18T12:00:00Z'}],requests:[{id:'r',documentRevision:1,reason:'OWN_CORRECTION',authorId:'pac',recordedAt:'2026-11-18T12:00:00Z',resolution:{decision:'reject',explanation:'EXPLANATION',documentRevision:1,authorId:'psi',recordedAt:'2026-11-18T13:00:00Z'}}]}));
    assert.match(h.text(),/OWN_RECORDED|EXPLANATION/);assert.match(h.text(),/No son respuestas escritas, enviadas ni ratificadas/);assert.deepEqual(h.values(),[]);assert.equal(h.calls.length,1);assert.equal(h.button('Solicitar corrección de esta versión'),undefined);
  }finally{await h.close();}
});
