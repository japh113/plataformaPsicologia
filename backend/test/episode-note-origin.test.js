import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvePrivateNoteOrigin } from '../src/modules/episodes/episode.note-origin.js';
const tuple = { noteId: '11', episodeId: '1', subjectPatientId: 'p', authorUserId: 'a' };
test('origin resolver: strict single boolean evidence and independent operational denial', async () => {
  for (const rows of [[],null,[null],[{recognized:false}],[{recognized:'true'}],[{recognized:1}],
    [{recognized:true},{recognized:true}],[{recognized:true}]]) {
    const result = await resolvePrivateNoteOrigin({ async query(sql,params) {
      assert.match(sql,/SELECT public.recognize_private_note_origin_v1/);
      assert.deepEqual(params,['11','1','p','a']); return { rows };
    } },tuple);
    assert.equal(result.originVerified, rows?.length === 1 && rows[0]?.recognized === true);
    assert.equal(result.allowed,false);assert.equal(result.audienceVerified,false);assert.ok(Object.isFrozen(result));
    assert.deepEqual(Object.keys(result).sort(),['allowed','audienceVerified','contractVersion','origin','originVerified','registrationKind']);
  }
});
test('origin resolver: invalid tuples avoid SQL and client evidence is ignored', async () => {
  for (const change of [{noteId:'01'},{episodeId:'0'},{subjectPatientId:''},{authorUserId:null}]) {
    const result=await resolvePrivateNoteOrigin({query(){assert.fail('Unexpected SQL');}},{...tuple,...change});
    assert.equal(result.originVerified,false);
  }
  const input={...tuple};
  for(const key of ['origin','audience','audienceVerified','contractVersion','registrationKind','allowed','originVerified','registeredByUserId']) {
    Object.defineProperty(input,key,{get(){assert.fail('Client claim read');}});
  }
  assert.equal((await resolvePrivateNoteOrigin({async query(){return {rows:[{recognized:false}]};}},input)).originVerified,false);
});
test('origin resolver: query failures propagate without a permissive result', async () => {
  for(const code of ['42501','42883','57014','08006']) {
    await assert.rejects(resolvePrivateNoteOrigin({async query(){throw Object.assign(new Error('Synthetic failure'),{code});}},tuple),{code});
  }
});
