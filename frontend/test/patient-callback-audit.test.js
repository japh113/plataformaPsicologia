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
  write.resolve(item('o',true));await patch;read.resolve(raw);assert.equal((await get).status,'conflict');
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
    assert.equal(result,true);assert.equal(writes,1);assert.match(h.state.warnings[0],/se guardó.*No se pudo actualizar/);
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


// Controlled reads reproduce a confirmed note whose first detail response loses
// its revision race. Definitive note/task IDs always come from the server DTO.
const noteNames=['createSession','updateSession'];
const noteArgs=name=>name==='createSession'?[{content:'submitted',tasks:[{text:'submitted task'}]}]:['old-note',{content:'submitted',tasks:[{text:'submitted task'}]}];
function noteSnapshot(name) {
  const id=name==='createSession'?'confirmed-note':'old-note';
  return {...raw,objectives:[item('o',true),item('recent-objective',true)],
    clinicalNotes:[...(name==='createSession'?raw.clinicalNotes:[]),{id,content:'AUTHORITATIVE_NOTE_CONTENT'}],
    tasks:[...raw.tasks,{...item('confirmed-task'),clinicalNoteId:id},{...item('recent-task'),clinicalNoteId:'other-note'}]};
}
function retainedNote(h,name) {
  const first=deferred(),firstStarted=deferred(),second=deferred(),secondStarted=deferred();
  const counts={writes:0,reads:0,objectives:0};
  h.context[name==='createSession'?'createPatientClinicalNote':'updatePatientClinicalNote']=async()=>{counts.writes++;return {id:'write-result-without-task-contract'};};
  h.context.updatePatientObjective=async()=>{counts.objectives++;return item('o',true);};
  h.context.getPatient=()=>{
    counts.reads++;
    assert.ok(counts.reads<=2,'recovery must be bounded to one additional GET');
    if(counts.reads===1){firstStarted.resolve();return first.promise;}
    secondStarted.resolve();return second.promise;
  };
  const pending=h.invoke(name,...noteArgs(name));
  return {first,firstStarted,second,secondStarted,counts,pending};
}
async function recoveryStarted(r) {
  const outcome=await Promise.race([r.secondStarted.promise.then(()=>'reading'),r.pending.then(()=>'finished')]);
  assert.equal(outcome,'reading','a confirmed note conflict must initiate a new GET before reporting success');
}
function assertConfirmedVisible(h,name) {
  const id=name==='createSession'?'confirmed-note':'old-note';
  assert.equal(h.state.selected.sesiones.find(n=>n.id===id).contenido,'AUTHORITATIVE_NOTE_CONTENT');
  assert.equal(h.state.selected.tareas.find(t=>t.id==='confirmed-task').sesionId,id);
  assert.equal(h.state.selected.tareas.some(t=>t.id==='recent-task'),true);
  assert.equal(h.state.selected.objetivos.find(o=>o.id==='o').completada,true);
  synced(h);
}

test('note recovery P2: create/edit confirmed -> old GET -> objective PATCH -> one fresh GET exposes note AND linked task',async()=>{
  for(const name of noteNames){
    const h=professional(),r=retainedNote(h,name);
    await r.firstStarted.promise;
    await h.invoke('toggleObjective','o');
    r.first.resolve({...noteSnapshot(name),objectives:raw.objectives});
    await recoveryStarted(r);
    r.second.resolve(noteSnapshot(name));
    assert.equal(await r.pending,true);assertConfirmedVisible(h,name);
    assert.deepEqual(r.counts,{writes:1,reads:2,objectives:1});
    assert.match(h.state.success.at(-1),/Nota clinica (creada|actualizada) correctamente/);
    assert.equal(h.state.warnings.length,0);
  }
});

test('note recovery P2: repeated revision conflict is bounded and preserves removeTask/addObjective/toggleObjective state',async()=>{
  for(const name of noteNames)for(const op of operations.filter(o=>o.name!=='removeObjective')){
    const h=professional(),r=retainedNote(h,name);
    h.context[op.api]=async()=>op.reply;
    await r.firstStarted.promise;await h.invoke(op.name,...op.args);
    const firstCurrent=h.state.selected;
    r.first.resolve(raw);await recoveryStarted(r);
    assert.equal(h.state.selected,firstCurrent);
    // A genuinely later read can contain activities absent from both held DTOs.
    const current={...h.state.selected,notas:'LATEST_FILE',tareas:[...h.state.selected.tareas,{id:'later-task',texto:'Latest',completada:false}]};
    h.state.patients=[current];h.state.selected=current;
    h.context.updatePatientObjective=async(patientId,id,payload)=>item(id,payload.completed);
    await h.invoke('toggleObjective','o');
    const latest=h.state.selected;
    r.second.resolve(noteSnapshot(name));assert.equal(await r.pending,true);
    assert.equal(h.state.selected,latest);
    if(op.name==='toggleObjective')assert.equal(latest.objetivos.find(o=>o.id==='o').completada,false);
    else op.check(latest);
    synced(h);
    assert.equal(r.counts.writes,1);assert.equal(r.counts.reads,2);
    assert.equal(h.state.selected.tareas.some(t=>t.id==='confirmed-task'),false,'do not invent tasks when no read was applied');
    assert.match(h.state.warnings.at(-1),/se guardó.*pendiente.*recarga/i);
    assert.equal(h.state.success.some(m=>/^Nota clinica/.test(m)),false);
  }
});

test('note recovery P2: HTTP 500 on the new GET confirms persistence, warns and never repeats POST/PATCH',async()=>{
  for(const name of noteNames){
    const h=professional(),r=retainedNote(h,name);
    await r.firstStarted.promise;await h.invoke('toggleObjective','o');
    const current=h.state.selected;r.first.resolve(raw);await recoveryStarted(r);
    r.second.reject(error(500));assert.equal(await r.pending,true);
    assert.equal(h.state.selected,current);assert.equal(h.state.selected.objetivos[0].completada,true);synced(h);
    assert.deepEqual(r.counts,{writes:1,reads:2,objectives:1});
    assert.match(h.state.warnings.at(-1),/se guardó.*actualizar.*recarga/i);
    assert.equal(h.state.success.length,0);assert.equal(h.state.errors.length,0);
  }
});

test('note recovery P2: 401/403/404 or logout before/inside recovery cannot retry or repopulate another session',async()=>{
  for(const name of noteNames)for(const stage of ['first','recovery'])for(const boundary of [401,403,404,'logout']){
    const h=professional(),r=retainedNote(h,name);
    await r.firstStarted.promise;
    if(stage==='recovery'){
      await h.invoke('toggleObjective','o');r.first.resolve(raw);await recoveryStarted(r);
    }
    const held=stage==='first'?r.first:r.second;
    if(boundary==='logout'){
      h.reset();h.state.token='new-patient';h.context.currentUser={id:'p',role:'patient',patientId:'p'};
      const current=mapBackendPatientToUiPatient({id:'p',fullName:'Current patient'});
      h.state.patients=[current];h.state.selected=current;h.state.GuardandoSesion=true;h.state.form={new:true};
      held.resolve(noteSnapshot(name));
    }else held.reject(error(boundary));
    assert.equal(await r.pending,false);
    assert.equal(r.counts.reads,stage==='first'?1:2);assert.equal(r.counts.writes,1);
    assert.equal(h.state.success.length,0);assert.equal(h.state.warnings.length,0);assert.equal(h.state.errors.length,0);
    if(boundary==='logout'){
      assert.equal(h.state.selected.nombre,'Current patient');assert.equal(h.state.selected.sesiones.length,0);
      assert.equal(h.state.GuardandoSesion,true);assert.deepEqual(h.state.form,{new:true});synced(h);
    }else{assert.equal(h.state.patients.length,0);assert.equal(h.state.selected,null);assert.equal(h.context.clinicalAccess.current.denied,true);}
  }
});

test('note recovery P2: chained saves keep the newer authoritative file despite an older independent detail response',async()=>{
  const h=professional(),r=retainedNote(h,'createSession');
  await r.firstStarted.promise;await h.invoke('toggleObjective','o');r.first.resolve(raw);await recoveryStarted(r);
  r.second.resolve(noteSnapshot('createSession'));assert.equal(await r.pending,true);
  const old=deferred();h.context.getPatient=()=>old.promise;const stale=h.selected('p');
  let writes=0;
  h.context.updatePatientClinicalNote=async()=>{writes++;return {id:'confirmed-note'};};
  const newer={...noteSnapshot('createSession'),clinicalNotes:[...raw.clinicalNotes,{id:'confirmed-note',content:'SECOND_CONFIRMED_CONTENT'}],
    tasks:[...noteSnapshot('createSession').tasks,{...item('second-task'),clinicalNoteId:'confirmed-note'}]};
  h.context.getPatient=async()=>newer;
  assert.equal(await h.invoke('updateSession','confirmed-note',{content:'second'}),true);
  const current=h.state.selected;old.resolve(raw);await stale;
  assert.equal(h.state.selected,current);assert.equal(current.sesiones.find(n=>n.id==='confirmed-note').contenido,'SECOND_CONFIRMED_CONTENT');
  assert.equal(current.tareas.some(t=>t.id==='confirmed-task'),true);assert.equal(current.tareas.some(t=>t.id==='second-task'),true);
  assert.equal(current.objetivos[0].completada,true);assert.equal(writes,1);synced(h);
});

async function loadProfessionalSuccessfully(h) {
  await h.load();
  assert.equal(h.state.error,'','unexpected load exceptions must fail the professional success oracle');
  assert.equal(h.state.loading,false);
}

test('professional harness P3: successful real cargarDatos maps nonempty waitlist with no hidden catch',async()=>{
  const h=professional(),waitlist=[{id:'w',patientId:'p',scheduledDate:'2026-04-08',scheduledTime:'11:00:00',priority:1}];
  h.context.getAppointmentWaitlist=async()=>waitlist;
  h.context.setAppointmentWaitlist=rows=>{h.state.waitlist=rows;};
  await loadProfessionalSuccessfully(h);
  assert.equal(h.state.error,'','a swallowed ReferenceError must fail this success assertion');
  assert.equal(h.state.loading,false);assert.equal(h.state.patients[0].id,'p');assert.equal(h.state.selected.id,'p');
  assert.equal(h.state.appointments.length,1);assert.equal(h.state.waitlist[0].id,'w');
  assert.equal(h.state.waitlist[0].pacienteId,'p');
});


test('professional harness P3: an unexpected mapper exception fails the success oracle, while denied load still clears data',async()=>{
  const bad=professional();
  bad.context.getAppointmentWaitlist=async()=>[{id:'w'}];
  bad.context.mapBackendWaitlistToUiWaitlistEntry=()=>{throw new ReferenceError('intentional mapper exception');};
  await assert.rejects(()=>loadProfessionalSuccessfully(bad),assert.AssertionError);
  assert.equal(bad.state.error,'intentional mapper exception');
  for(const status of [403,404]){
    const h=professional();h.context.getPatients=async()=>{throw error(status);};
    await h.load();assert.equal(h.state.patients.length,0);assert.equal(h.state.selected,null);
    assert.equal(h.context.clinicalAccess.current.denied,true);
  }
});


test('clinical integrity P2: another success and closing feedback cannot allow old content/tasks [] to be written',async()=>{
  const h=professional(),r=retainedNote(h,'updateSession');
  await r.firstStarted.promise;await h.invoke('toggleObjective','o');r.first.resolve(raw);await recoveryStarted(r);
  r.second.reject(error(500));assert.equal(await r.pending,true);
  assert.equal(h.state.selected.sesiones[0].contenido,raw.clinicalNotes[0].content,'known stale file after confirmed PATCH');
  h.context.deletePatientObjective=async()=>{};
  await h.invoke('removeObjective','o');
  assert.equal(h.state.success.at(-1),'Objetivo retirado; su registro se conserva.');
  h.context.setUiFeedback(null);
  let staleWrites=0;
  h.context.updatePatientClinicalNote=async()=>{staleWrites++;return {id:'old-note'};};
  h.context.getPatient=async()=>{throw error(500);};
  const blocked=await h.invoke('updateSession','old-note',{content:raw.clinicalNotes[0].content,tasks:[]});
  assert.equal(staleWrites,0,'an obsolete editor must never send old content and tasks [] after a confirmed write');
  assert.equal(blocked.status,'blocked');
});


async function pendingRecord(h=professional(),name='updateSession'){
  const r=retainedNote(h,name);await r.firstStarted.promise;
  await h.invoke('toggleObjective','o');r.first.resolve(raw);await recoveryStarted(r);
  r.second.reject(error(500));assert.equal(await r.pending,true);
  assert.equal(h.state.recordSync.p.pending,true);assert.equal(h.state.recordSync.p.status,'pending');
  return h;
}

test('clinical integrity: pending metadata survives feedback and unrelated activity; only a current detail read resolves it',async()=>{
  const h=await pendingRecord(),entry=h.state.recordSync.p;
  assert.deepEqual(Object.keys(entry).sort(),['access','patientId','pending','session','status','version']);
  assert.equal(JSON.stringify(entry).includes('AUTHORITATIVE'),false);
  h.context.deletePatientObjective=async()=>{};
  await h.invoke('removeObjective','o');h.context.showErrorFeedback('Unrelated error');h.context.setUiFeedback(null);
  assert.equal(h.state.recordSync.p,entry);
  h.context.getPatient=async()=>{throw error(500);};
  assert.equal(await h.invoke('refreshClinicalRecord','p'),false);
  assert.equal(h.state.recordSync.p.pending,true);
  const held=deferred(),started=deferred();
  h.context.getPatient=()=>{started.resolve();return held.promise;};
  const recovery=h.invoke('refreshClinicalRecord','p');await started.promise;
  assert.equal(h.state.recordSync.p.status,'refreshing');
  h.context.createPatientObjective=async()=>item('manual-objective',true);
  await h.invoke('addObjective','Manual objective');
  const current=h.state.selected;
  held.resolve(noteSnapshot('updateSession'));assert.equal(await recovery,false);
  assert.equal(h.state.selected,current);assert.equal(h.state.recordSync.p.pending,true);
  const authoritative={...noteSnapshot('updateSession'),objectives:[item('manual-objective',true)]};
  h.context.getPatient=async()=>authoritative;
  assert.equal(await h.invoke('refreshClinicalRecord','p'),true);
  assert.equal(h.state.recordSync.p.pending,false);assert.equal(h.state.recordSync.p.status,'current');
  assert.equal(h.state.selected.sesiones.find(n=>n.id==='old-note').contenido,'AUTHORITATIVE_NOTE_CONTENT');
  assert.equal(h.state.selected.tareas.find(t=>t.id==='confirmed-task').sesionId,'old-note');
  assert.equal(h.state.selected.objetivos[0].id,'manual-objective');synced(h);
  let writes=0;h.context.updatePatientClinicalNote=async()=>{writes++;return {};};
  assert.equal((await h.invoke('updateSession','old-note',{content:'obsolete',tasks:[]},0)).status,'blocked');
  assert.equal(writes,0,'an old draft remains blocked after recovery until explicitly reopened');
  assert.equal(await h.invoke('updateSession','old-note',{content:'AUTHORITATIVE_NOTE_CONTENT',tasks:[{id:'confirmed-task',text:'Fictional confirmed-task'}]},1),true);
  assert.equal(writes,1,'an explicitly reopened current editor can write again');
  assert.equal(h.state.recordSync.p.pending,false);assert.equal(h.state.recordSync.p.version,2);
});

test('clinical integrity: definitive create/update guards are immediate, record-specific and independent of disabled UI',async()=>{
  const h=await pendingRecord();let writes=0;
  h.context.createPatientClinicalNote=async()=>{writes++;return {};};
  h.context.updatePatientClinicalNote=async()=>{writes++;return {};};
  for(const name of noteNames){
    const result=await h.invoke(name,...noteArgs(name));
    assert.equal(result.status,'blocked');
  }
  assert.equal(writes,0);
  const q=mapBackendPatientToUiPatient({...raw,id:'q'});
  h.state.patients=[...h.state.patients,q];h.state.selected=q;h.context.getPatient=async()=>({...raw,id:'q'});
  assert.equal(await h.invoke('createSession',{content:'Q current',tasks:[]}),true);
  assert.equal(writes,1);assert.equal(h.state.recordSync.p.pending,true);
  assert.equal(h.state.recordSync.q.pending,false);assert.equal(h.state.selected.id,'q');
  assert.deepEqual(h.state.patients.find(p=>p.id==='q'),h.state.selected);
});

test('clinical integrity: manual 401/403/404 and logout purge pending metadata and ignore old recovery replies',async()=>{
  for(const boundary of [401,403,404,'logout-p','logout-q']){
    const h=await pendingRecord(),held=deferred(),started=deferred();
    h.context.getPatient=()=>{started.resolve();return held.promise;};
    const recovery=h.invoke('refreshClinicalRecord','p');await started.promise;
    const before={success:h.state.success.length,errors:h.state.errors.length,warnings:h.state.warnings.length};
    if(typeof boundary==='number')held.reject(error(boundary));
    else{
      h.reset();const id=boundary==='logout-p'?'p':'q';
      h.context.currentUser={id,role:'patient',patientId:id};h.state.token='new-session';
      const next=mapBackendPatientToUiPatient({id,fullName:'New session'});
      h.state.patients=[next];h.state.selected=next;h.state.form={current:true};
      held.resolve(noteSnapshot('updateSession'));
    }
    assert.equal(await recovery,false);
    assert.equal(h.context.clinicalRecordSyncRef.current.size,0);
    assert.deepEqual(Object.keys(h.state.recordSync),[]);
    assert.deepEqual({success:h.state.success.length,errors:h.state.errors.length,warnings:h.state.warnings.length},before);
    if(typeof boundary==='number'){assert.equal(h.state.selected,null);assert.equal(h.state.patients.length,0);}
    else {assert.equal(h.state.selected.nombre,'New session');assert.deepEqual(h.state.form,{current:true});}
  }
});

test('clinical integrity: a later confirmed write during recovery cannot be cleared by the earlier read',async()=>{
  const h=professional(),write1=deferred(),write2=deferred(),reads=[deferred(),deferred(),deferred()],started=reads.map(()=>deferred());
  let writes=0,readCount=0;
  h.context.updatePatientClinicalNote=()=>++writes===1?write1.promise:write2.promise;
  h.context.getPatient=()=>{const index=readCount++;started[index].resolve();return reads[index].promise;};
  h.context.updatePatientObjective=async()=>item('o',true);
  const save1=h.invoke('updateSession','old-note',{content:'First',tasks:[]});
  const save2=h.invoke('updateSession','old-note',{content:'Second',tasks:[]});
  write1.resolve({id:'old-note'});await started[0].promise;
  assert.equal(h.state.recordSync.p.version,1);
  await h.invoke('toggleObjective','o');reads[0].resolve(raw);await started[1].promise;
  write2.resolve({id:'old-note'});await started[2].promise;
  assert.equal(h.state.recordSync.p.version,2);assert.equal(h.state.recordSync.p.pending,true);
  reads[1].resolve(noteSnapshot('updateSession'));assert.equal(await save1,true);
  assert.equal(h.state.recordSync.p.version,2);assert.equal(h.state.recordSync.p.pending,true);
  assert.equal(h.state.selected.sesiones[0].contenido,raw.clinicalNotes[0].content);
  const latest={...noteSnapshot('updateSession'),clinicalNotes:[{id:'old-note',content:'SECOND_CONFIRMED'}]};
  reads[2].resolve(latest);assert.equal(await save2,true);
  assert.equal(writes,2);assert.equal(readCount,3);
  assert.equal(h.state.recordSync.p.pending,false);assert.equal(h.state.recordSync.p.version,2);
  assert.equal(h.state.selected.sesiones[0].contenido,'SECOND_CONFIRMED');synced(h);
});

test('clinical integrity: a list HTTP 200 or wrong-patient detail cannot acknowledge a pending confirmed note',async()=>{
  const h=await pendingRecord();
  h.context.getPatients=async()=>[noteSnapshot('updateSession')];await loadProfessionalSuccessfully(h);
  assert.equal(h.state.recordSync.p.pending,true,'list acceptance alone cannot acknowledge a confirmed note');
  h.context.getPatient=async()=>({...noteSnapshot('updateSession'),id:'q'});
  assert.equal(await h.invoke('refreshClinicalRecord','p'),false);
  assert.equal(h.state.recordSync.p.pending,true);assert.equal(h.state.recordSync.p.status,'pending');
  let opened=0,appointments=0;
  h.context.abrirNotas=()=>{opened++;};
  h.context.handleUpdateAppointment=async()=>{appointments++;return true;};
  assert.equal(await h.invoke('handleOpenSessionFromAppointment',{id:'a',estado:'pendiente',fecha:'2026-04-01'},h.state.selected),false);
  assert.equal(opened,1,'open read-only record with persistent recovery action');
  assert.equal(appointments,0,'do not complete an appointment as part of a blocked note-opening flow');
});
