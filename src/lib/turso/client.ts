'use client';
import { enqueueOfflineOperation } from '@/lib/offline-outbox';
type CachedDoc={key:string;condoId:string;userId:string;collection:string;id:string;data:any;updatedAt:string};
const CACHE_DB='efas-turso-cache';
function identity(){return {condoId:typeof localStorage!=='undefined'?(localStorage.getItem('activeCondoId')||localStorage.getItem('workingCondoId')||''):'',userId:typeof localStorage!=='undefined'?(localStorage.getItem('efasUserId')||''):'anonymous'};}
function openCache():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{const r=indexedDB.open(CACHE_DB,1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains('documents'))r.result.createObjectStore('documents',{keyPath:'key'});};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error||new Error('No se pudo abrir la caché local.'));});}
function cacheKey(c:string,id:string){const x=identity();return x.condoId+'|'+x.userId+'|'+c+'|'+id;}
async function cachePut(collection:string,id:string,data:any){if(typeof indexedDB==='undefined')return;const db=await openCache();try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction('documents','readwrite');tx.objectStore('documents').put({key:cacheKey(collection,id),...identity(),collection,id,data,updatedAt:new Date().toISOString()} satisfies CachedDoc);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});}finally{db.close();}}
async function cacheDelete(collection:string,id:string){if(typeof indexedDB==='undefined')return;const db=await openCache();try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction('documents','readwrite');tx.objectStore('documents').delete(cacheKey(collection,id));tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});}finally{db.close();}}
async function cacheRead(collection:string,id?:string){if(typeof indexedDB==='undefined')return [];const db=await openCache();try{const all=await new Promise<CachedDoc[]>((resolve,reject)=>{const r=db.transaction('documents','readonly').objectStore('documents').getAll();r.onsuccess=()=>resolve(r.result as CachedDoc[]);r.onerror=()=>reject(r.error);});const who=identity();return all.filter(x=>x.condoId===who.condoId&&x.userId===who.userId&&x.collection===collection&&(!id||x.id===id)).map(x=>({id:x.id,data:x.data,updatedAt:x.updatedAt}));}finally{db.close();}}
export async function tursoRequest(method:'GET'|'POST'|'DELETE',collection:string,body?:any,action:'create'|'update'|'delete'='create'){
 const who=identity();const params=new URLSearchParams({collection});if(who.condoId)params.set('condoId',who.condoId);if(method==='GET'&&body?.id)params.set('id',body.id);
 if(method==='GET'&&typeof navigator!=='undefined'&&!navigator.onLine)return {documents:await cacheRead(collection,body?.id)};
 try{
  const response=await fetch('/api/data/documents?'+params.toString(),{method,credentials:'same-origin',headers:{'Content-Type':'application/json'},...(method==='GET'?{}:{body:JSON.stringify(method==='POST'?{...(body||{}),action}:body||{})}),cache:'no-store'});
  const result=await response.json().catch(()=>({}));if(!response.ok)throw Object.assign(new Error(result.error||'No se pudo acceder a los datos de Turso.'),{status:response.status});
  if(method==='GET'){for(const d of result.documents||[])await cachePut(collection,d.id,d.data);return result;}
  if(method==='POST'){await cachePut(collection,result.id||body.id,body.data);return result;}
  if(method==='DELETE'){await cacheDelete(collection,body.id);return result;}
  return result;
 }catch(error:any){
  if(error?.status)throw error;
  if(method==='GET'){const cached=await cacheRead(collection,body?.id);if(cached.length||typeof navigator!=='undefined'&&!navigator.onLine)return {documents:cached};throw error;}
  if(!who.condoId)throw error;
  if(method==='DELETE'){await enqueueOfflineOperation({condoId:who.condoId,userId:who.userId,entity:collection,action:'delete',payload:{id:body.id}});await cacheDelete(collection,body.id);return {ok:true,id:body.id,offline:true};}
  if(method==='POST'){const id=body?.id;if(!id)throw error;await enqueueOfflineOperation({condoId:who.condoId,userId:who.userId,entity:collection,action:action,payload:{id,data:body.data}});await cachePut(collection,id,body.data);return {ok:true,id,offline:true};}
  throw error;
 }
}

export async function tursoBatchRequest(operations:any[]) {
 const who=identity();const params=new URLSearchParams();if(who.condoId)params.set('condoId',who.condoId);
 try{const r=await fetch('/api/data/batch?'+params.toString(),{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({operations}),cache:'no-store'});const d=await r.json().catch(()=>({}));if(!r.ok)throw Object.assign(new Error(d.error||'No se pudo confirmar el lote en Turso.'),{status:r.status});for(const op of operations){if(op.action==='delete')await cacheDelete(op.collection,op.id);else if(op.data)await cachePut(op.collection,op.id,op.data);}return d;}catch(error:any){if(error?.status||!who.condoId)throw error;await enqueueOfflineOperation({condoId:who.condoId,userId:who.userId,entity:'batch',action:'batch',payload:{operations}});for(const op of operations){if(op.action==='delete')await cacheDelete(op.collection,op.id);else if(op.data)await cachePut(op.collection,op.id,op.data);}return {ok:true,offline:true};}
}
