import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source=await readFile(new URL('../src/screens/NotesScreen.jsx',import.meta.url),'utf8');
function callback(name,context){
  const a=source.indexOf('  const '+name+' ='),match=/^ {2}};/m.exec(source.slice(a));
  assert.ok(a>=0&&match,name);
  return vm.runInNewContext('(()=>{'+source.slice(a,a+match.index+match[0].length)+String.fromCharCode(10)+'return '+name+';})()',context);
}
function editor(){
  const state={closed:0,writes:0,forms:[],opens:0};
  const context={
    sessionWriteBlocked:true,recordPending:true,isSavingSession:false,
    sessionForm:{citaId:'appointment',contenido:'OLD_CONTENT',tareas:[]},selectedSession:{id:'note'},
    draftRecordVersion:0,sessionEditorEpoch:{current:0},clinicalRecordSync:{version:1,pending:true},patient:{tareas:[]},
    onUpdateSession:async()=>{state.writes++;return {status:'blocked'};},
    onCreateSession:async()=>{state.writes++;return {status:'blocked'};},
    closeSessionModal:()=>{state.closed++;},onDismissSessionActionError:()=>{state.opens++;},
    setSelectedSessionId:()=>{},setSessionTaskText:()=>{},setSessionForm:value=>state.forms.push(value),
    setShowSessionModal:()=>{state.opens++;},setDraftRecordVersion:()=>{},
    appointmentSessionsMap:new Map(),onOpenAppointmentSession:()=>assert.fail('blocked agenda must not invoke callback'),
  };
  return {context,state};
}
test('clinical editor: pending or obsolete draft sends no payload and preserves the local form',async()=>{
  const {context,state}=editor(),form=context.sessionForm;
  await callback('handleSaveSession',context)();
  assert.equal(state.writes,0);assert.equal(state.closed,0);assert.equal(context.sessionForm,form);
  for(const name of ['handleEditSession','openNewSessionModal','handleOpenSessionFromRecord']){
    await callback(name,context)({id:'note'});
    assert.equal(state.opens,0);assert.equal(state.forms.length,0);
  }
});
test('clinical editor: blocked App result never closes modal; older save continuation cannot close a newer editor',async()=>{
  const {context,state}=editor();context.sessionWriteBlocked=false;
  await callback('handleSaveSession',context)();
  assert.equal(state.writes,1);assert.equal(state.closed,0);
  let resolve;context.onUpdateSession=()=>new Promise(r=>{resolve=r;});
  const pending=callback('handleSaveSession',context)();
  context.sessionEditorEpoch.current++;resolve(true);await pending;
  assert.equal(state.closed,0);
  context.onUpdateSession=async(id,payload,version)=>{
    assert.equal(version,0);assert.equal(payload.content,'OLD_CONTENT');assert.deepEqual(Array.from(payload.tasks),[]);
    return true;
  };
  await callback('handleSaveSession',context)();assert.equal(state.closed,1);
});
