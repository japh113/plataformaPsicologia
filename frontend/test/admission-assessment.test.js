import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import React,{act} from 'react';
import { transformWithOxc } from 'vite';
import { installReactDomHost,elements } from './helpers/reactDomHost.js';
const document=installReactDomHost();
// Select collections are browser host behavior required by the actual ReactDOM renderer.
const createElement=document.createElement.bind(document);
document.createElement=name=>{const element=createElement(name);if(name==='select')Object.defineProperty(element,'options',{get:()=>elements(element).filter(n=>n.localName==='option')});return element;};
const {createRoot}=await import('react-dom/client');
const url=new URL('../src/components/AdmissionAssessment.jsx',import.meta.url).href;
const {code}=await transformWithOxc(await readFile(new URL(url),'utf8'),'AdmissionAssessment.jsx',{jsx:{runtime:'classic'}});
const api='data:text/javascript,'+encodeURIComponent('export const apiRequest=(...args)=>globalThis.__assessmentApi(...args);');
const hook=registerHooks({
  resolve(specifier,context,next){if(context.parentURL===url&&specifier==='../api/client')return {url:api,shortCircuit:true};return next(specifier,context);},
  load(target,context,next){if(target===url)return {format:'module',source:"import React from 'react';\n"+code,shortCircuit:true};return next(target,context);}
});
const {default:Assessment}=await import(url);hook.deregister();
const defer=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
const empty=episodeId=>({episodeId,version:3,expectedRevision:1,submission:1,canAssess:true,current:null,history:[]});
async function fixture(){
  const calls=[],container=document.createElement('div');document.body.appendChild(container);const root=createRoot(container);let unavailable=0;
  globalThis.__assessmentApi=path=>{const d=defer();calls.push({path,...d});return d.promise;};
  const onUnavailable=()=>{unavailable++;};
  return {calls,text:()=>container.textContent,unavailable:()=>unavailable,
    render:async id=>act(async()=>root.render(React.createElement(Assessment,{key:id,id,version:3,submission:1,reviewState:'submitted',onUnavailable}))),
    resolve:async(index,data)=>act(async()=>{calls[index].resolve({data});}),
    reject:async(index,status)=>act(async()=>{calls[index].resolve(Promise.reject(Object.assign(new Error('Sin autorización'),{status})));}),
    close:async()=>{await act(async()=>root.unmount());document.body.removeChild(container);delete globalThis.__assessmentApi;}};
}
test('mounted admission assessment starts NO EVALUADO and keeps exact submission separate from history',async()=>{
  const h=await fixture();try{await h.render('a');await h.resolve(0,empty('101'));assert.match(h.text(),/Riesgo: NO EVALUADO/);assert.match(h.text(),/Envío actual: 1/);assert.match(h.text(),/Historial de valoraciones privadas \(0\)/);assert.equal(h.unavailable(),0);}finally{await h.close();}
});
test('mounted admission A B A discards late responses from both previous episode selections',async()=>{
  const h=await fixture();try{await h.render('a');await h.render('b');await h.render('a');
    await h.resolve(2,empty('101'));assert.match(h.text(),/Riesgo: NO EVALUADO/);
    for(const i of [0,1])await h.resolve(i,{...empty('999'),current:{riskLevel:'high',context:'OLD_EPISODE_SECRET'},history:[]});
    assert.doesNotMatch(h.text(),/OLD_EPISODE_SECRET|999/);assert.match(h.text(),/Riesgo: NO EVALUADO/);
  }finally{await h.close();}
});
test('mounted admission unauthorized read invokes removal and never renders professional content',async()=>{
  const h=await fixture();try{await h.render('a');await h.reject(0,404);assert.equal(h.unavailable(),1);assert.doesNotMatch(h.text(),/Contexto vigente|Historial de valoraciones/);}finally{await h.close();}
});
