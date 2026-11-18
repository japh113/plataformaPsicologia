import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveEpisodeResource } from '../src/modules/episodes/episode.resource.js';
import { authorizeEpisodeOperation } from '../src/modules/episodes/episode.policy.js';
import { projectEpisodeResource } from '../src/modules/episodes/episode.projections.js';
const episode={id:'7',modality:'individual',responsibleUserId:'a',participants:[{patientId:'p',slot:1}]};
const row={resource_id:'7',episode_id:'7',patient_id:'p',responsible_user_id:'a'};
test('private clinical record resolves only structural identity and never infers clinical authorship',async()=>{
  const client={query:async(sql,args)=>{
    assert.deepEqual(args,['7','7']);assert.doesNotMatch(sql,/risk_level|professional_context|versions|care_relationships|psychologist_patient_access/);
    return {rows:[row]};
  }};
  const descriptor={type:'clinical_record',id:'7',get authorUserId(){throw Error('untrusted');},get audience(){throw Error('untrusted');}};
  const resource=await resolveEpisodeResource(client,episode,descriptor);
  assert.equal(resource.authorUserId,null);assert.equal(resource.responsibleUserId,'a');assert.equal(resource.audienceVerified,false);
  assert.ok(Object.isFrozen(resource));assert.equal(authorizeEpisodeOperation({resource}).allowed,false);
  const secret=new Proxy({},{get(){throw Error('content read');},ownKeys(){throw Error('content enumerated');}});
  assert.throws(()=>projectEpisodeResource({resource},secret),{status:403});
});
test('private clinical record rejects crossed identity composition duplicate and SQL errors without fallback',async()=>{
  for(const rows of [[],[row,row],[{...row,patient_id:'q'}],[{...row,episode_id:'8'}],[{...row,resource_id:'8'}],[{...row,responsible_user_id:'b'}]]){
    assert.equal(await resolveEpisodeResource({query:async()=>({rows})},episode,{type:'clinical_record',id:'7'}),null);
  }
  assert.equal(await resolveEpisodeResource({query:async()=>({rows:[row]})},{...episode,modality:'couple'},{type:'clinical_record',id:'7'}),null);
  await assert.rejects(resolveEpisodeResource({query:async()=>{throw Error('ACL denied');}},episode,{type:'clinical_record',id:'7'}),/ACL denied/);
});
