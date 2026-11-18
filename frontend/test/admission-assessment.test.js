import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import React,{act} from 'react';
import { transformWithOxc } from 'vite';
import { installReactDomHost,elements } from './helpers/reactDomHost.js';
const document=installReactDomHost();
document.oninput=null;
// Select collections are browser host behavior required by the actual ReactDOM renderer.
const createElement=document.createElement.bind(document);
document.createElement=name=>{const element=createElement(name);Object.defineProperty(element,'disabled',{get:()=>element.getAttribute('disabled')!==null,set:v=>{if(v)element.setAttribute('disabled','');else element.removeAttribute('disabled');}});if(name==='select')Object.defineProperty(element,'options',{get:()=>elements(element).filter(n=>n.localName==='option')});if(name==='input')Object.defineProperty(element,'type',{get:()=>element.getAttribute('type')||'text',set:v=>{element.setAttribute('type',v);}});return element;};
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
  const calls=[],container=document.createElement('div');document.body.appendChild(container);const root=createRoot(container);let unavailable=0;let props={id:'a',version:3,submission:1,reviewState:'submitted'};
  globalThis.__assessmentApi=(path,options={})=>{const d=defer();calls.push({path,options,settled:false,...d});return d.promise;};
  const onUnavailable=()=>{unavailable++;};
  const find=tag=>elements(container).find(n=>n.localName===tag);
  const button=label=>elements(container).find(n=>n.localName==='button'&&n.textContent===label);
  return {calls,button,find,text:()=>container.textContent,unavailable:()=>unavailable,
    render:async(id,changes={})=>act(async()=>{props={...props,id,...changes};root.render(React.createElement(Assessment,{key:id,...props,onUnavailable}));}),
    edit:async(text,risk)=>act(async()=>{const textarea=find('textarea');textarea.value=text;textarea.dispatchEvent(new Event('input',{bubbles:true}));const select=find('select');select.value=risk;select.dispatchEvent(new Event('change',{bubbles:true}));}),
    confirm:async()=>act(async()=>{const checkbox=find('input');assert.equal(checkbox.disabled,false);checkbox.checked=true;checkbox.click();}),
    submit:async()=>act(async()=>find('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))),
    click:async label=>act(async()=>{assert.equal(button(label).disabled,false);button(label).click();}),
    resolve:async(index,data)=>act(async()=>{calls[index].settled=true;calls[index].resolve({data});}),
    reject:async(index,status)=>act(async()=>{calls[index].settled=true;calls[index].resolve(Promise.reject(Object.assign(new Error('Sin autorización'),{status})));}),
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
const stored={revision:2,submission:1,riskLevel:'high',context:'HISTORY_PRIOR',authorId:'psi',recordedAt:'2026-11-18T12:00:00Z'};
const loaded=(version=3,submission=1,extra={})=>({...empty('101'),version,submission,expectedRevision:2,current:stored,history:[stored],...extra});
const detail=(version,submission=1,reviewState='validated')=>({version,latestSubmission:submission,reviewState});
const refreshLabel='Actualizar referencias y conservar texto';
const saveLabel='Registrar valoración privada';
function localPreserved(h){assert.equal(h.find('textarea').value,'DRAFT_LOCAL');assert.equal(h.find('select').value,'medium');}
async function beginWrite(h){await h.edit('DRAFT_LOCAL','medium');await h.confirm();await h.submit();assert.equal(h.calls[1].options.method,'POST');assert.equal(JSON.parse(h.calls[1].options.body).context,'DRAFT_LOCAL');assert.equal(JSON.parse(h.calls[1].options.body).riskLevel,'medium');}
async function finishWrite(h,index,version,submission){
  await h.resolve(index,{saved:true,revision:3});await h.resolve(index+1,detail(version,submission,'submitted'));
  await h.resolve(index+2,loaded(version,submission,{expectedRevision:3,current:{...stored,revision:3,submission,context:'DRAFT_LOCAL',riskLevel:'medium'},history:[stored]}));
  assert.equal(h.button(refreshLabel).disabled,false);assert.ok(h.calls.every(c=>c.settled));
}
for(const status of [200,409,503])test(`P2-A: pending save then detail validation releases busy after late ${status} without applying stale results`,async()=>{
  const h=await fixture();try{
    await h.render('a');await h.resolve(0,loaded());await beginWrite(h);
    await h.render('a',{version:4,reviewState:'validated'});assert.ok(h.calls[2].path.endsWith('/record'));await h.resolve(2,loaded(4));
    if(status===200)await h.resolve(1,{saved:true,revision:3});else await h.reject(1,status);
    assert.ok(h.calls.every(c=>c.settled),'All concurrent requests finished');
    assert.equal(h.button(refreshLabel).disabled,false,'A stale completion must release its own busy state');localPreserved(h);
    assert.equal(h.calls.filter(c=>c.options.method==='POST').length,1);assert.doesNotMatch(h.text(),/Sin autorización|Contexto vigente: DRAFT_LOCAL/);
    await h.click(refreshLabel);await h.resolve(3,detail(4));await h.resolve(4,loaded(4));localPreserved(h);
    await h.confirm();await h.submit();const next=JSON.parse(h.calls[5].options.body),prior=JSON.parse(h.calls[1].options.body);
    assert.equal(next.expectedVersion,4);assert.equal(next.context,'DRAFT_LOCAL');assert.equal(next.riskLevel,'medium');assert.notEqual(next.operationId,prior.operationId);
    await finishWrite(h,5,4,1);
  }finally{await h.close();}
});
for(const failure of [false,true])test(`P2-B: correction invalidates current values immediately during ${failure?'503':'pending'} reload and preserves draft and history`,async()=>{
  const h=await fixture();try{
    await h.render('a');await h.resolve(0,loaded());await h.edit('DRAFT_LOCAL','medium');await h.confirm();
    await h.render('a',{version:4,reviewState:'correction_requested'});
    assert.doesNotMatch(h.text(),/Contexto vigente:/,'Correction is known before the record reload returns');
    assert.match(h.text(),/Riesgo: NO EVALUADO/);assert.match(h.text(),/HISTORY_PRIOR/);localPreserved(h);
    assert.equal(h.find('input').disabled,true);assert.equal(h.button(saveLabel).disabled,true);
    await h.submit();assert.equal(h.calls.filter(c=>c.options.method==='POST').length,0,'Handler also rejects an ineligible write');
    if(failure)await h.reject(1,503);else await h.resolve(1,loaded(4,1,{canAssess:false,current:null}));
    assert.doesNotMatch(h.text(),/Contexto vigente:/);assert.equal(h.find('input').disabled,true);localPreserved(h);
    await h.render('a',{version:5,submission:2,reviewState:'submitted'});assert.equal(h.find('input').disabled,true);
    await h.resolve(2,loaded(5,2,{current:null}));assert.doesNotMatch(h.text(),/Sin autorización/);assert.equal(h.find('input').disabled,false);assert.equal(h.button(saveLabel).disabled,true);localPreserved(h);
    await h.confirm();await h.submit();const payload=JSON.parse(h.calls[3].options.body);assert.equal(payload.submission,2);assert.equal(payload.expectedVersion,5);
    await finishWrite(h,3,5,2);
  }finally{await h.close();}
});
test('P2-B: an old-version response cannot revive eligibility after a new submitted interview; deliberate refresh recovers',async()=>{
  const h=await fixture();try{
    await h.render('a');await h.resolve(0,loaded());await h.edit('DRAFT_LOCAL','medium');
    await h.render('a',{version:5,submission:2,reviewState:'submitted'});await h.resolve(1,loaded(3));
    assert.doesNotMatch(h.text(),/Contexto vigente:/);assert.equal(h.find('input').disabled,true);localPreserved(h);
    await h.click(refreshLabel);await h.resolve(2,detail(5,2,'submitted'));await h.resolve(3,loaded(5,2,{current:null}));
    assert.equal(h.find('input').disabled,false);assert.equal(h.button(saveLabel).disabled,true);localPreserved(h);assert.match(h.text(),/HISTORY_PRIOR/);
    assert.ok(h.calls.every(c=>c.settled));
  }finally{await h.close();}
});
