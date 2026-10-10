'use client';
import React,{useState,useEffect,createContext,useContext} from 'react';
import { useOfflineSync } from '@/hooks/use-offline-sync';
import type { OfflineOperation } from '@/lib/offline-outbox';
import {onAuthStateChanged,type User} from 'firebase/auth';
import {auth,db} from '@/lib/firebase';
import {doc,getDoc} from 'firebase/firestore';
interface AuthContextType{user:User|null;ownerData:any|null;userProfile:any|null;companyInfo:any|null;loading:boolean;role:string|null;isSuperAdmin:boolean;activeCondoId:string|null;workingCondoId:string|null;}
async function sendQueuedOperation(operation: OfflineOperation): Promise<'success'|'conflict'> {
 const response=await fetch('/api/offline/sync',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({
  originUserId:operation.userId,
  condoId:operation.condoId,
  operations:[{id:operation.id,idempotencyKey:operation.idempotencyKey,entity:operation.entity,action:operation.action,payload:operation.payload}]
 })});
 const result=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(typeof result.error==='string'?result.error:'No se pudo sincronizar la operación pendiente.');
 const item=Array.isArray(result.results)?result.results.find((x:any)=>x.id===operation.id):null;
 return item?.status==='success'?'success':'conflict';
}
const AuthContext=createContext<AuthContextType|undefined>(undefined);
export function AuthProvider({children}:{children:React.ReactNode}){
 const [user,setUser]=useState<User|null>(null);const [ownerData,setOwnerData]=useState<any|null>(null);const [companyInfo,setCompanyInfo]=useState<any|null>(null);const [loading,setLoading]=useState(true);const [role,setRole]=useState<string|null>(null);const [activeCondoId,setActiveCondoId]=useState<string|null>(null);const [workingCondoId,setWorkingCondoId]=useState<string|null>(null);const isSuperAdmin=role==='super-admin';
 // La cola IndexedDB se sincroniza automáticamente al recuperar conexión, al abrir y al volver al foco.
 const offlineSync=useOfflineSync(activeCondoId,ownerData?.uid||null,sendQueuedOperation);
 useEffect(()=>{let cancelled=false;const unsub=onAuthStateChanged(auth,async(authUser)=>{if(cancelled)return;try{if(!authUser){setUser(null);setOwnerData(null);setCompanyInfo(null);setRole(null);setActiveCondoId(null);setWorkingCondoId(null);setLoading(false);return;}
 let s:any;try{const response=await fetch('/api/auth/session',{credentials:'same-origin',cache:'no-store'});const session=await response.json().catch(()=>({}));if(response.status===401||response.status===403){localStorage.removeItem('efasSessionUser');throw new Error('Sesión no válida');}if(!response.ok||!session.authenticated)throw new Error('Sesión no disponible');s=session.user;localStorage.setItem('efasSessionUser',JSON.stringify(s));}catch(error){const cached=localStorage.getItem('efasSessionUser');if(!cached)throw error;if(error instanceof Error&&error.message==='Sesión no válida')throw error;s=JSON.parse(cached);}const condo=s.role==='super-admin'?null:(s.condoId||null);
 setUser(authUser);setRole(s.role);setActiveCondoId(condo);setWorkingCondoId(condo);if(condo){localStorage.setItem('activeCondoId',condo);localStorage.setItem('workingCondoId',condo);}else{localStorage.removeItem('activeCondoId');localStorage.removeItem('workingCondoId');}localStorage.setItem('userRole',s.role);localStorage.setItem('efasUserId',s.userId);
 let profile:any={uid:authUser.uid,email:authUser.email,role:s.role,name:authUser.displayName||authUser.email};
 if(condo&&s.role==='owner'){for(const leaf of ['owners','propietarios']){try{const snap=await getDoc(doc(db,'condominios',condo,leaf,s.userId));if(snap.exists()){profile={...profile,...snap.data()};break;}}catch{}}}
 setOwnerData(profile);
 if(condo){try{const settings=await getDoc(doc(db,'condominios',condo,'config','mainSettings'));if(settings.exists())setCompanyInfo(settings.data().companyInfo||settings.data());else{const c=await getDoc(doc(db,'condominios',condo));setCompanyInfo(c.exists()?c.data():null);}}catch{setCompanyInfo(null);}}else setCompanyInfo(null);
 }catch{setUser(null);setOwnerData(null);setRole(null);setActiveCondoId(null);setWorkingCondoId(null);}finally{if(!cancelled)setLoading(false);}});
 return()=>{cancelled=true;unsub();};},[]);
 return <AuthContext.Provider value={{user,ownerData,userProfile:ownerData,companyInfo,loading,role,isSuperAdmin,activeCondoId,workingCondoId}}>{!loading?<>{children}{(offlineSync.pendingCount>0||offlineSync.conflictCount>0||!offlineSync.isOnline)?<div role='status' className='fixed bottom-4 right-4 z-[9999] max-w-[min(92vw,24rem)] rounded-xl border border-white/15 bg-[#1A1D23]/95 px-4 py-3 text-xs text-white shadow-2xl backdrop-blur'><div className='font-bold'>{!offlineSync.isOnline?'SIN CONEXIÓN':offlineSync.isSyncing?'SINCRONIZANDO CON TURSO':'SINCRONIZACIÓN PENDIENTE'}</div><div className='mt-1 text-white/70'>{offlineSync.pendingCount} operación(es) pendiente(s){offlineSync.conflictCount>0?` · ${offlineSync.conflictCount} conflicto(s) requieren revisión`:''}</div>{offlineSync.error?<div className='mt-1 text-amber-300'>{offlineSync.error}</div>:null}</div>:null}</>:<div className='h-screen flex flex-col items-center justify-center bg-[#1A1D23] font-montserrat'><div className='text-center'><div className='h-14 w-14 border-4 border-[#F28705]/10 border-t-[#F28705] rounded-full animate-spin mx-auto mb-6'/><p className='text-[10px] font-black uppercase tracking-[0.5em] text-white/40 animate-pulse'>EFASCondoSys: VERIFICANDO CREDENCIALES</p></div></div>}</AuthContext.Provider>;
}
export const useAuth=()=>{const c=useContext(AuthContext);if(!c)throw new Error('useAuth must be used within an AuthProvider');return c;};
