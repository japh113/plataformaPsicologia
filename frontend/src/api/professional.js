import {apiRequest,API_BASE_URL,getAuthToken,clearAuthToken} from './client';
export const getProfile=async()=> (await apiRequest('/professional-profile/me')).data;
export const createProfile=async()=> (await apiRequest('/professional-profile/me',{method:'POST',body:'{}'})).data;
export const updateProfile=async body=>(await apiRequest('/professional-profile/me',{method:'PATCH',body:JSON.stringify(body)})).data;
export const getCredentials=async()=>(await apiRequest('/professional-profile/me/credentials')).data;
export const submitProposal=async body=>(await apiRequest('/professional-profile/me/credential-proposals',{method:'POST',body:JSON.stringify(body)})).data;
export const listReviews=async()=>(await apiRequest('/professional-reviews/pending')).data;
export const getReview=async(owner,version)=>(await apiRequest(`/professional-reviews/${encodeURIComponent(owner)}/${encodeURIComponent(version)}`)).data;
export const decideReview=async(owner,version,body)=>(await apiRequest(`/professional-reviews/${encodeURIComponent(owner)}/${encodeURIComponent(version)}/decision`,{method:'POST',body:JSON.stringify(body)})).data;
const media=async(options={})=>{
  const token=getAuthToken();const response=await fetch(API_BASE_URL+'/professional-profile/me/photo',{...options,headers:{...options.headers,Authorization:`Bearer ${token}`}});
  if(!response.ok){if(response.status===401&&getAuthToken()===token){clearAuthToken();window.dispatchEvent(new Event('psicopanel-session-ended'));}
    const body=await response.json();throw new Error(body.message||'Fotografía no disponible.');}return response;
};
export const uploadPhoto=async(file,version)=>(await(await media({method:'POST',headers:{'Content-Type':file.type,'If-Match':version},body:file})).json()).data;
export const loadPhoto=async()=> (await media()).blob();
export const retirePhoto=async rowVersion=>(await apiRequest('/professional-profile/me/photo',{method:'DELETE',body:JSON.stringify({rowVersion})})).data;
export const recoverUploads=async rowVersion=>(await apiRequest('/professional-profile/me/photo/recover',{method:'POST',body:JSON.stringify({rowVersion})})).data;
// Fixed operation; no general path argument and no access to ordinary storage.
export const restrictedStatus=async(token,signal)=>{
  const response=await fetch(API_BASE_URL+'/professional-status/me',{headers:{Authorization:`Bearer ${token}`},signal});
  const body=await response.json();if(!response.ok)throw new Error('La sesión restringida terminó o el estado cambió. Inicia sesión de nuevo.');return body.data;
};
