'use client';
import React,{useState,useEffect,createContext,useContext} from 'react';
import {onAuthStateChanged,type User} from 'firebase/auth';
import {auth,db} from '@/lib/firebase';
import {doc,getDoc} from 'firebase/firestore';
interface AuthContextType{user:User|null;ownerData:any|null;userProfile:any|null;companyInfo:any|null;loading:boolean;role:string|null;isSuperAdmin:boolean;activeCondoId:string|null;workingCondoId:string|null;}
const AuthContext=createContext<AuthContextType|undefined>(undefined);
export function AuthProvider({children}:{children:React.ReactNode}){
 const [user,setUser]=useState<User|null>(null);const [ownerData,setOwnerData]=useState<any|null>(null);const [companyInfo,setCompanyInfo]=useState<any|null>(null);const [loading,setLoading]=useState(true);const [role,setRole]=useState<string|null>(null);const [activeCondoId,setActiveCondoId]=useState<string|null>(null);const [workingCondoId,setWorkingCondoId]=useState<string|null>(null);const isSuperAdmin=role==='super-admin';
 useEffect(()=>{let cancelled=false;const unsub=onAuthStateChanged(auth,async(authUser)=>{if(cancelled)return;try{if(!authUser){setUser(null);setOwnerData(null);setCompanyInfo(null);setRole(null);setActiveCondoId(null);setWorkingCondoId(null);setLoading(false);return;}
 const response=await fetch('/api/auth/session',{credentials:'same-origin',cache:'no-store'});const session=await response.json();if(!response.ok||!session.authenticated)throw new Error('Sesión no válida');const s=session.user;const condo=s.condoId||(typeof localStorage!=='undefined'?localStorage.getItem('activeCondoId'):null)||null;
 setUser(authUser);setRole(s.role);setActiveCondoId(condo);setWorkingCondoId(condo);if(condo){localStorage.setItem('activeCondoId',condo);localStorage.setItem('workingCondoId',condo);}localStorage.setItem('userRole',s.role);localStorage.setItem('efasUserId',s.userId);
 let profile:any={uid:authUser.uid,email:authUser.email,role:s.role,name:authUser.displayName||authUser.email};
 if(condo&&s.role==='owner'){for(const leaf of ['owners','propietarios']){try{const snap=await getDoc(doc(db,'condominios',condo,leaf,s.userId));if(snap.exists()){profile={...profile,...snap.data()};break;}}catch{}}}
 setOwnerData(profile);
 if(condo){try{const settings=await getDoc(doc(db,'condominios',condo,'config','mainSettings'));if(settings.exists())setCompanyInfo(settings.data().companyInfo||settings.data());else{const c=await getDoc(doc(db,'condominios',condo));setCompanyInfo(c.exists()?c.data():null);}}catch{setCompanyInfo(null);}}else setCompanyInfo(null);
 }catch{setUser(null);setOwnerData(null);setRole(null);setActiveCondoId(null);setWorkingCondoId(null);}finally{if(!cancelled)setLoading(false);}});
 return()=>{cancelled=true;unsub();};},[]);
 return <AuthContext.Provider value={{user,ownerData,userProfile:ownerData,companyInfo,loading,role,isSuperAdmin,activeCondoId,workingCondoId}}>{!loading?children:<div className='h-screen flex flex-col items-center justify-center bg-[#1A1D23] font-montserrat'><div className='text-center'><div className='h-14 w-14 border-4 border-[#F28705]/10 border-t-[#F28705] rounded-full animate-spin mx-auto mb-6'/><p className='text-[10px] font-black uppercase tracking-[0.5em] text-white/40 animate-pulse'>EFASCondoSys: VERIFICANDO CREDENCIALES</p></div></div>}</AuthContext.Provider>;
}
export const useAuth=()=>{const c=useContext(AuthContext);if(!c)throw new Error('useAuth must be used within an AuthProvider');return c;};
