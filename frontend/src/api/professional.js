import {apiRequest,API_BASE_URL,beginSessionRequest,clearAuthToken} from './client';
export const getProfile=async()=> (await apiRequest('/professional-profile/me')).data;
export const createProfile=async()=> (await apiRequest('/professional-profile/me',{method:'POST',body:'{}'})).data;
export const updateProfile=async body=>(await apiRequest('/professional-profile/me',{method:'PATCH',body:JSON.stringify(body)})).data;
export const getPublication=async()=>(await apiRequest('/professional-profile/me/publication')).data;
export const updatePublication=async body=>(await apiRequest('/professional-profile/me/publication',{method:'PATCH',body:JSON.stringify(body)})).data;
export const getCredentials=async()=>(await apiRequest('/professional-profile/me/credentials')).data;
export const submitProposal=async body=>(await apiRequest('/professional-profile/me/credential-proposals',{method:'POST',body:JSON.stringify(body)})).data;
export const listReviews=async()=>(await apiRequest('/professional-reviews/pending')).data;
export const getReview=async(owner,version)=>(await apiRequest(`/professional-reviews/${encodeURIComponent(owner)}/${encodeURIComponent(version)}`)).data;
export const decideReview=async(owner,version,body)=>(await apiRequest(`/professional-reviews/${encodeURIComponent(owner)}/${encodeURIComponent(version)}/decision`,{method:'POST',body:JSON.stringify(body)})).data;
const media=async(read,options={},suffix='')=>{
  const {token,ensureCurrent}=beginSessionRequest();
  const response=await fetch(API_BASE_URL+'/professional-profile/me/photo'+suffix,{...options,headers:{...options.headers,Authorization:`Bearer ${token}`}});
  ensureCurrent();
  const body=await (response.ok?read(response):response.json());
  ensureCurrent();
  if(!response.ok){
    if(response.status===401&&token){
      clearAuthToken();
      window.dispatchEvent(new Event('psicopanel-session-ended'));
    }
    throw new Error(body.message||'Fotografía no disponible.');
  }
  return body;
};
export const uploadPhoto=async(file,version,{publish=false}={})=>(await media(response=>response.json(),{
  method:'POST',headers:{'Content-Type':file.type,'If-Match':version},body:file,
},publish?'/public':'')).data;
export const loadPhoto=async(id)=> media(response=>response.blob(),id?{headers:{'If-Match':id}}:{});
export const retirePhoto=async rowVersion=>(await apiRequest('/professional-profile/me/photo',{method:'DELETE',body:JSON.stringify({rowVersion})})).data;
export const recoverUploads=async rowVersion=>(await apiRequest('/professional-profile/me/photo/recover',{method:'POST',body:JSON.stringify({rowVersion})})).data;
// Restricted endpoints never read or write the ordinary session store.
const restrictedRequest=async(path,token,{signal,data}={})=>{
  const response=await fetch(API_BASE_URL+path,{
    headers:{Authorization:`Bearer ${token}`,...(data ? {'Content-Type':'application/json'} : {})},
    signal,
    method:data ? 'POST' : 'GET',
    body:data ? JSON.stringify(data) : undefined,
  });
  const body=await response.json();
  if(!response.ok)throw Object.assign(new Error(response.status===401
    ? 'La sesión restringida terminó o el estado cambió. Inicia sesión de nuevo.'
    : body.message||'No pudimos completar la operación.'),{status:response.status});
  return body.data;
};
export const restrictedStatus=(token,signal)=>restrictedRequest('/professional-status/me',token,{signal});
export const getAccreditation=async(token,signal)=>token
  ? restrictedRequest('/professional-status/me/accreditation',token,{signal})
  : (await apiRequest('/professional-profile/me/accreditation',{signal})).data;
export const submitAccreditation=async(token,data)=>token
  ? restrictedRequest('/professional-status/me/accreditation',token,{data})
  : (await apiRequest('/professional-profile/me/accreditation',{method:'POST',body:JSON.stringify(data)})).data;
export const listRevalidations=async()=> (await apiRequest('/professional-reviews/revalidation')).data;
const reviewPath=(owner,version)=>`/professional-reviews/${encodeURIComponent(owner)}/${encodeURIComponent(version)}`;
export const getRevalidation=async(owner,version)=>(await apiRequest(reviewPath(owner,version)+'/revalidation')).data;
export const decideManualReview=async(review,body)=>(await apiRequest(
  reviewPath(review.ownerId,review.pending.version)+(review.mode==='revalidation'?'/revalidation':'/manual-decision'),
  {method:'POST',body:JSON.stringify(body)}
)).data;
