'use client';
import { enqueueOfflineOperation } from '@/lib/offline-outbox';
type CachedDoc={key:string;condoId:string;userId:string;collection:string;id:string;data:any;updatedAt:string;version:number};
const CACHE_DB='efas-turso-cache';
function identity(){return {condoId:typeof localStorage!=='undefined'?(localStorage.getItem('activeCondoId')||localStorage.getItem('workingCondoId')||''):'',userId:typeof localStorage!=='undefined'?(localStorage.getItem('efasUserId')||''):'anonymous',role:typeof localStorage!=='undefined'?(localStorage.getItem('userRole')||''):'',};}
const FINANCIAL_COLLECTIONS=new Set(['payments','debts','owner_extraordinary_debts','owners','propietarios','receipts','balances','cash_movements','main_cash','cash_movements','accounts_payable','accounts_receivable']);
function offlineQueueAllowed(collection:string,body:any,action:string,who:{userId:string;role:string}){const leaf=collection.split('/').pop()||'';const financialName=/(payment|debt|balance|cash|fund|fee|dues|invoice|receipt|expense|income|transaction|ledger|account|billing|charge|credit|refund|deposit|budget|payroll|salary|bank|transfer|revenue|quota|cuota|pago|saldo|caja|fondo|gasto|ingreso|factura|recibo|abono|mora|cobro|movimiento|presupuesto|nomina|banco|transferencia)/i.test(leaf);if(FINANCIAL_COLLECTIONS.has(leaf)||financialName)return who.role==='owner'&&leaf==='payments'&&action==='create'&&body?.data?.status==='pendiente'&&body?.data?.reportedBy===who.userId;return true;}
function openCache():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{const r=indexedDB.open(CACHE_DB,1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains('documents'))r.result.createObjectStore('documents',{keyPath:'key'});};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error||new Error('No se pudo abrir la caché local.'));});}
function cacheKey(c:string,id:string){const x=identity();return x.condoId+'|'+x.userId+'|'+c+'|'+id;}
async function cachePut(collection:string,id:string,data:any,version?:number){if(typeof indexedDB==='undefined')return;const db=await openCache();try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction('documents','readwrite');const store=tx.objectStore('documents');const key=cacheKey(collection,id);const get=store.get(key);get.onsuccess=()=>{const old=get.result as CachedDoc|undefined;store.put({key,...identity(),collection,id,data,version:typeof version==='number'?version:(old?.version||0)+1,updatedAt:new Date().toISOString()} satisfies CachedDoc);};get.onerror=()=>reject(get.error);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});}finally{db.close();}}
async function cacheDelete(collection:string,id:string){if(typeof indexedDB==='undefined')return;const db=await openCache();try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction('documents','readwrite');tx.objectStore('documents').delete(cacheKey(collection,id));tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});}finally{db.close();}}
async function cacheRead(collection:string,id?:string){if(typeof indexedDB==='undefined')return [];const db=await openCache();try{const all=await new Promise<CachedDoc[]>((resolve,reject)=>{const r=db.transaction('documents','readonly').objectStore('documents').getAll();r.onsuccess=()=>resolve(r.result as CachedDoc[]);r.onerror=()=>reject(r.error);});const who=identity();return all.filter(x=>x.condoId===who.condoId&&x.userId===who.userId&&x.collection===collection&&(!id||x.id===id)).map(x=>({id:x.id,data:x.data,updatedAt:x.updatedAt,version:x.version||1}));}finally{db.close();}}
export async function tursoRequest(method:'GET'|'POST'|'DELETE',collection:string,body?:any,action:'create'|'update'|'delete'='create'){
 const who=identity();const params=new URLSearchParams({collection});if(who.condoId)params.set('condoId',who.condoId);if(method==='GET'&&body?.id)params.set('id',body.id);if(method==='GET'&&Number.isInteger(body?.offset)&&body.offset>=0)params.set('offset',String(body.offset));
 if(method==='GET'&&typeof navigator!=='undefined'&&!navigator.onLine)return {documents:await cacheRead(collection,body?.id)};
 try{
  const response=await fetch('/api/data/documents?'+params.toString(),{method,credentials:'same-origin',headers:{'Content-Type':'application/json'},...(method==='GET'?{}:{body:JSON.stringify(method==='POST'?{...(body||{}),action}:body||{})}),cache:'no-store'});
  const result=await response.json().catch(()=>({}));if(!response.ok)throw Object.assign(new Error(result.error||'No se pudo acceder a los datos de Turso.'),{status:response.status});
  if(method==='GET'){for(const d of result.documents||[])await cachePut(collection,d.id,d.data,d.version);return result;}
  if(method==='POST'){await cachePut(collection,result.id||body.id,body.data,result.version);return result;}
  if(method==='DELETE'){await cacheDelete(collection,body.id);return result;}
  return result;
 }catch(error:any){
  if(error?.status)throw error;
  if(method==='GET'&&typeof navigator!=='undefined'&&!navigator.onLine){const cached=await cacheRead(collection,body?.id);return {documents:cached};}
  if(method==='GET')throw error;
  if(!who.condoId||!offlineQueueAllowed(collection,body,action,who))throw error;
  if(method==='DELETE'){await enqueueOfflineOperation({condoId:who.condoId,userId:who.userId,entity:collection,action:'delete',payload:{id:body.id}});await cacheDelete(collection,body.id);return {ok:true,id:body.id,offline:true};}
  if(method==='POST'){const id=body?.id;if(!id)throw error;await enqueueOfflineOperation({condoId:who.condoId,userId:who.userId,entity:collection,action:action,payload:{id,data:body.data,expectedVersion:body.expectedVersion}});await cachePut(collection,id,body.data,typeof body.expectedVersion==='number'?body.expectedVersion+1:undefined);return {ok:true,id,offline:true};}
  throw error;
 }
}

export async function tursoBatchRequest(operations:any[]) {
 const who=identity();const params=new URLSearchParams();if(who.condoId)params.set('condoId',who.condoId);
 try{const r=await fetch('/api/data/batch?'+params.toString(),{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({operations}),cache:'no-store'});const d=await r.json().catch(()=>({}));if(!r.ok)throw Object.assign(new Error(d.error||'No se pudo confirmar el lote en Turso.'),{status:r.status});for(const op of operations){if(op.action==='delete')await cacheDelete(op.collection,op.id);else if(op.data)await cachePut(op.collection,op.id,op.data,typeof op.expectedVersion==='number'?op.expectedVersion+1:undefined);}return d;}catch(error:any){const hasFinancialWrite=operations.some((op:any)=>FINANCIAL_COLLECTIONS.has(String(op.collection||'').split('/').pop()||''));if(error?.status||!who.condoId||hasFinancialWrite)throw error;await enqueueOfflineOperation({condoId:who.condoId,userId:who.userId,entity:'batch',action:'batch',payload:{operations}});for(const op of operations){if(op.action==='delete')await cacheDelete(op.collection,op.id);else if(op.data)await cachePut(op.collection,op.id,op.data);}return {ok:true,offline:true};}
}
