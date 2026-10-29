import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { harness } from './helpers/followUpAppHarness.js';
import { mapBackendPatientToUiPatient } from '../src/mappers/patients.js';

const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const error=status=>Object.assign(new Error('Fictional failure'),{status});
const item=(id,completed=false,text='Fictional '+id)=>({id,text,completed});
const raw={id:'p',fullName:'Fictional P',notes:'FICTIONAL_PRIVATE_CURRENT',riskLevel:'low',status:'active',
  tasks:[item('t')],objectives:[item('o')],clinicalNotes:[{id:'old-note',content:'FICTIONAL_PRIVATE_NOTE'}]};
const fresh={...raw,notes:'FICTIONAL_PRIVATE_FRESH',riskLevel:'medium',tasks:[item('t',false,'Fresh task'),item('u')],
  objectives:[item('o',false,'Fresh objective'),item('new',true)],
  clinicalNotes:[{id:'new-note',content:'FICTIONAL_PRIVATE_NEW_NOTE'}]};
function professional(){
  const h=harness({previous:mapBackendPatientToUiPatient(raw)});
  h.context.currentUser={id:'a',role:'psychologist'};
  h.state.token='professional-session';return h;
}
function synced(h){assert.deepEqual(h.state.patients[0],h.state.selected);}
const operations=[
  {name:'addObjective',api:'createPatientObjective',args:['New objective'],reply:item('new'),
    check:p=>{assert.equal(p.objetivos.filter(o=>o.id==='new').length,1);}},
  {name:'toggleObjective',api:'updatePatientObjective',args:['o'],reply:item('o',true,'Old response text'),
    check:p=>assert.equal(p.objetivos.find(o=>o.id==='o').completada,true)},
  {name:'removeObjective',api:'deletePatientObjective',args:['o'],reply:null,
    check:p=>assert.equal(p.objetivos.some(o=>o.id==='o'),false)},
  {name:'removeTask',api:'deletePatientTask',args:['t'],reply:null,
    check:p=>assert.equal(p.tareas.some(t=>t.id==='t'),false)},
];

test('final P2-01: retained professional profile response cannot contaminate a patient session of the same ID',async()=>{
  const h=professional(),held=deferred();let writes=0,maps=0,payload;
  h.context.updatePatient=async(id,body)=>{writes++;payload=body;return held.promise;};
  h.context.mapBackendPatientToUiPatient=dto=>{maps++;return mapBackendPatientToUiPatient(dto);};
  const pending=h.invoke('actualizarPerfilPaciente',{riesgo:'alto',estado:'activo',motivo:'Fictional new reason'});
  assert.equal(typeof payload,'object');assert.notEqual(payload,false);
  assert.deepEqual(Object.keys(payload).sort(),['reasonForConsultation','riskLevel','status']);
  h.reset();h.context.currentUser={id:'p',role:'patient',patientId:'p'};h.state.token='patient-session';
  const patient=mapBackendPatientToUiPatient({id:'p',fullName:'Patient session',tasks:[item('t')],clinicalNotes:[]});
  h.state.patients=[patient];h.state.selected=patient;h.state.form={value:'current patient form'};
  h.state.savingProfile=true;h.state.success=[];h.state.errors=[];
  held.resolve({...raw,notes:'FICTIONAL_PRIVATE_OBSOLETE',riskLevel:'high',clinicalNotes:[{id:'secret',content:'FICTIONAL_PRIVATE_SECRET'}]});
  assert.equal(await pending,false,'false authorizes no UI effect; HTTP update itself was confirmed');
  assert.equal(writes,1);assert.equal(maps,0);assert.equal(h.state.selected,patient);assert.equal(h.state.patients[0],patient);
  assert.equal(h.state.savingProfile,true);assert.equal(h.state.form.value,'current patient form');
  assert.equal(h.state.success.length,0);assert.equal(h.state.errors.length,0);
  assert.equal(JSON.stringify(h.state.patients).includes('FICTIONAL_PRIVATE'),false);
  assert.equal(h.state.selected.notas,'');assert.equal(h.state.selected.riesgo,'sin riesgo');assert.equal(h.state.selected.sesiones.length,0);
});

test('final P2-01: current profile confirmation merges only submitted fields and preserves newer professional notes/activity',async()=>{
  const h=professional(),held=deferred();
  h.context.updatePatient=()=>held.promise;
  const pending=h.invoke('actualizarPerfilPaciente',{riesgo:'alto',estado:'en pausa',motivo:'new reason'});
  const current=mapBackendPatientToUiPatient(fresh);h.state.patients=[current];h.state.selected=current;
  held.resolve({...raw,riskLevel:'high',status:'paused',reasonForConsultation:'new reason'});
  assert.equal(await pending,true);assert.equal(h.state.selected.riesgo,'alto');assert.equal(h.state.selected.estado,'en pausa');
  assert.equal(h.state.selected.motivo,'new reason');assert.equal(h.state.selected.notas,current.notas);
  assert.equal(h.state.selected.sesiones,current.sesiones);assert.equal(h.state.selected.tareas,current.tareas);
  assert.equal(h.state.success[0],'Ficha del paciente actualizada.');assert.equal(h.state.savingProfile,false);synced(h);
});

test('final P2-02: old detail/main GET cannot overwrite any confirmed objective/task mutation',async()=>{
  for(const op of operations)for(const kind of ['detail','main']){
    const h=professional(),read=deferred();h.context[kind==='detail'?'getPatient':'getPatients']=()=>read.promise;
    const pending=kind==='detail'?h.selected('p'):h.load();
    h.context[op.api]=async()=>op.reply;await h.invoke(op.name,...op.args);
    const before=h.state.selected;
    read.resolve(kind==='detail'?raw:[raw]);await pending;
    op.check(h.state.selected);assert.equal(h.state.selected,before,op.name+'/'+kind);synced(h);
  }
});

test('final P2-02: pending mutations preserve newer GET additions, text, and a created objective already visible once',async()=>{
  for(const op of operations){
    const h=professional(),write=deferred();h.context[op.api]=()=>write.promise;
    const pending=h.invoke(op.name,...op.args);
    h.context.getPatient=async()=>fresh;await h.selected('p');
    write.resolve(op.reply);await pending;
    op.check(h.state.selected);
    assert.equal(h.state.selected.tareas.some(t=>t.id==='u'),true);
    assert.equal(h.state.selected.objetivos.some(o=>o.id==='new'),true);
    assert.equal(h.state.selected.objetivos.find(o=>o.id==='new').completada,true,'do not replace newer visible creation with its older POST DTO');
    if(op.name==='toggleObjective')assert.equal(h.state.selected.objetivos.find(o=>o.id==='o').texto,'Fresh objective');
    assert.equal(h.state.selected.notas,fresh.notes);synced(h);
  }
});

test('final P2-02: a GET started while objective PATCH is pending is discarded if delivered after confirmation',async()=>{
  const h=professional(),write=deferred(),read=deferred();
  h.context.updatePatientObjective=()=>write.promise;const patch=h.invoke('toggleObjective','o');
  h.context.getPatient=()=>read.promise;const get=h.selected('p');
  write.resolve(item('o',true));await patch;read.resolve(raw);assert.equal(await get,null);
  assert.equal(h.state.selected.objetivos[0].completada,true);synced(h);
});

test('callback audit: real activity write failures retain new items, report error, and permit a fresh authoritative read',async()=>{
  for(const op of operations){
    const h=professional(),write=deferred();h.context[op.api]=()=>write.promise;
    const pending=h.invoke(op.name,...op.args);h.context.getPatient=async()=>fresh;await h.selected('p');
    const before=h.state.selected;write.reject(error(500));await pending;
    assert.equal(h.state.selected,before);assert.equal(h.state.errors.length,1);assert.equal(h.state.success.length,0);
    h.context.getPatient=async()=>({...fresh,objectives:[item('o',true),item('new',true)]});await h.selected('p');
    assert.equal(h.state.selected.objetivos[0].completada,true);synced(h);
  }
});

test('callback audit: creating/updating notes coordinates their task mutations with older whole-file reads',async()=>{
  for(const name of ['createSession','updateSession']){
    const h=professional(),read=deferred();let count=0;
    h.context.getPatient=()=>++count===1?read.promise:Promise.resolve(fresh);
    const old=h.selected('p');
    h.context[name==='createSession'?'createPatientClinicalNote':'updatePatientClinicalNote']=async()=>({id:'new-note'});
    await h.invoke(name,...(name==='createSession'?[{tasks:[item('u')]}]:['old-note',{tasks:[item('u')]}]));
    const current=h.state.selected;read.resolve(raw);await old;
    assert.equal(h.state.selected,current);assert.equal(h.state.selected.sesiones[0].id,'new-note');
    assert.equal(h.state.selected.tareas.some(t=>t.id==='u'),true);synced(h);
  }
});

test('callback audit: confirmed note save with failed secondary GET is not a failed write or automatic retry',async()=>{
  for(const name of ['createSession','updateSession']){
    const h=professional();let writes=0;
    h.context[name==='createSession'?'createPatientClinicalNote':'updatePatientClinicalNote']=async()=>{writes++;return {id:'new-note'};};
    h.context.getPatient=async()=>{throw error(500);};
    const result=await h.invoke(name,...(name==='createSession'?[{}]:['old-note',{}]));
    assert.equal(result,true);assert.equal(writes,1);assert.match(h.state.success[0],/se guardó.*No se pudo actualizar/);
    const bad=professional();bad.context[name==='createSession'?'createPatientClinicalNote':'updatePatientClinicalNote']=async()=>{throw error(500);};
    assert.equal(await bad.invoke(name,...(name==='createSession'?[{}]:['old-note',{}])),false);
    assert.equal(bad.state.success.length,0);assert.ok(bad.state.SessionActionError);
  }
});

test('callback audit: general notes response preserves newer draft, profile, and clinical notes; old GET cannot revert confirmed notes',async()=>{
  const h=professional(),read=deferred(),write=deferred();h.state.draft='submitted note';
  h.context.getPatient=()=>read.promise;const get=h.selected('p');
  h.context.updatePatient=()=>write.promise;const save=h.invoke('guardarNotas');
  const current=mapBackendPatientToUiPatient(fresh);h.state.patients=[current];h.state.selected=current;
  h.state.draft='new draft';write.resolve({...raw,notes:'confirmed note'});await save;
  assert.equal(h.state.selected.notas,'confirmed note');assert.equal(h.state.selected.riesgo,current.riesgo);
  assert.equal(h.state.selected.sesiones,current.sesiones);assert.equal(h.state.draft,'new draft');
  read.resolve(raw);await get;assert.equal(h.state.selected.notas,'confirmed note');synced(h);
});

test('callback audit: old GET cannot undo an interview confirmation or a newer complete professional snapshot',async()=>{
  for(const kind of ['detail','main']){
    const h=harness({previous:mapBackendPatientToUiPatient(raw)}),held=deferred();
    h.context[kind==='detail'?'getPatient':'getPatients']=()=>held.promise;
    const old=kind==='detail'?h.selected('p'):h.load();
    const optional=deferred();h.context.getPatientFollowUp=()=>optional.promise;
    await h.saveInterview('p',{});held.resolve(kind==='detail'?raw:[raw]);await old;
    assert.equal(h.state.selected.entrevistaCompleta,true);synced(h);
    optional.resolve({consultations:[],unassignedTasks:[]});await nextTurn();
  }
  const h=professional(),old=deferred();
  h.context.getPatient=()=>old.promise;const first=h.selected('p');
  h.context.getPatient=async()=>fresh;await h.selected('p');const newer=h.state.selected;
  old.resolve(raw);await first;assert.equal(h.state.selected,newer);assert.equal(h.state.selected.notas,fresh.notes);synced(h);
});

test('callback audit: denial/session reset fences every affected professional write and its finally',async()=>{
  const extra=[
    {name:'actualizarPerfilPaciente',api:'updatePatient',args:[{}],reply:raw},
    {name:'guardarNotas',api:'updatePatient',args:[],reply:raw},
    {name:'createSession',api:'createPatientClinicalNote',args:[{}],reply:{id:'note'}},
    {name:'updateSession',api:'updatePatientClinicalNote',args:['old-note',{}],reply:{id:'note'}},
  ];
  for(const op of [...operations,...extra])for(const boundary of [403,404,'logout']){
    const h=professional(),held=deferred();h.context[op.api]=()=>held.promise;
    const pending=h.invoke(op.name,...op.args);
    if(boundary==='logout'){
      h.reset();h.context.currentUser={id:'p',role:'patient',patientId:'p'};h.state.token='new-patient-session';
      const current=mapBackendPatientToUiPatient({id:'p',fullName:'new session',clinicalNotes:[]});
      h.state.patients=[current];h.state.selected=current;h.state.savingProfile=true;
    }else h.invalidateClinicalAccess();
    const before=h.state.selected;held.resolve(op.reply);await pending;
    assert.equal(h.state.selected,before);assert.equal(h.state.success.length,0);assert.equal(h.state.errors.length,0);
    if(boundary==='logout')assert.equal(h.state.savingProfile,true);
    else {assert.equal(h.state.patients.length,0);assert.equal(h.context.clinicalAccess.current.denied,true);}
  }
});

test('callback audit: identity consumer is bound to its render session, while current identity remains available during clinical denial',()=>{
  const h=harness({previous:mapBackendPatientToUiPatient({id:'p',fullName:'P'})});
  h.state.user=h.context.currentUser;
  h.context.setCurrentUser=value=>{h.state.user=typeof value==='function'?value(h.state.user):value;};
  const old=h.capture('handleIdentityUpdated');
  h.reset();h.context.currentUser={id:'q',role:'patient',patientId:'q'};h.state.token='q-session';
  h.state.user=h.context.currentUser;
  const q=mapBackendPatientToUiPatient({id:'q',fullName:'Q'});h.state.patients=[q];h.state.selected=q;
  old({firstName:'old P',lastName:'private'});assert.equal(h.state.user.fullName,undefined);assert.equal(h.state.selected,q);
  h.context.clinicalAccess.current.denied=true;
  h.invoke('handleIdentityUpdated',{firstName:'Current',lastName:'Q'});
  assert.equal(h.state.user.fullName,'Current Q');assert.equal(h.state.selected.nombre,'Current Q');
});

test('callback audit: appointment-to-note consumer opens a fresh file rather than its pre-await patient capture',async()=>{
  const h=professional(),pending=deferred();
  h.context.abrirNotas=h.capture('abrirNotas');
  h.context.handleUpdateAppointment=()=>pending.promise;
  h.context.getPatient=async()=>fresh;
  const opening=h.invoke('handleOpenSessionFromAppointment',{id:'appointment',estado:'pendiente',fecha:'2026-04-01'},h.state.selected);
  pending.resolve(true);assert.equal(await opening,true);
  assert.equal(h.state.selected.notas,fresh.notes);
  assert.equal(h.state.selected.sesiones[0].id,'new-note');
  assert.equal(h.state.selected.tareas.some(t=>t.id==='u'),true);synced(h);
  for (const boundary of ['current',403,'logout']) {
    const failed=professional(),held=deferred();
    failed.context.getPatient=()=>held.promise;
    const before=failed.state.selected;
    const opening=failed.invoke('handleOpenSessionFromAppointment',{id:'appointment',estado:'completada',fecha:'2026-04-01'},before);
    if(boundary===403)failed.invalidateClinicalAccess();
    if(boundary==='logout'){failed.reset();failed.state.token='new-session';}
    const expected=failed.state.selected;
    failed.state.AppointmentActionError='new session message';
    held.reject(Object.assign(new Error('fresh file unavailable'),{status:500}));
    assert.equal(await opening,false);
    assert.equal(failed.state.selected,expected);
    assert.equal(failed.state.AppointmentActionError,boundary==='current'?'fresh file unavailable':'new session message');
  }
});
