import { db } from '@/lib/firebase';
import { addDoc, collection, doc, getDocs, limit, onSnapshot, orderBy, query, setDoc, where } from 'firebase/firestore';
import { memoryCache } from './memory-cache';

const tenant=(condoId:string)=>['condominios',condoId];
const activeCondo=()=>typeof localStorage!=='undefined'?(localStorage.getItem('activeCondoId')||localStorage.getItem('workingCondoId')||''):'';

export const saveAuditLog=async(condoId:string,logData:any)=>{
  if(!condoId)throw new Error('Falta el condominio para registrar auditoría.');
  return addDoc(collection(db,...tenant(condoId),'audit_logs'),{...logData,timestamp:Date.now()});
};

export const saveNotification=async(condoId:string,userId:string,notification:any)=>{
  if(!condoId||!userId)throw new Error('Falta el destinatario de la notificación.');
  return addDoc(collection(db,...tenant(condoId),'notifications'),{...notification,ownerId:userId,userId,read:false,createdAt:Date.now()});
};

export const getUserNotifications=(condoId:string,userId:string,callback:(notifications:any[])=>void)=>{
  const q=query(collection(db,...tenant(condoId),'notifications'),where('ownerId','==',userId),orderBy('createdAt','desc'),limit(50));
  return onSnapshot(q,(snapshot:any)=>{
    const notifications=snapshot.docs.map((item:any)=>({id:item.id,...item.data()}));
    callback(notifications);
  },()=>callback([]));
};

export const archivePayment=async(condoId:string,payment:any)=>{
  if(!condoId)throw new Error('Falta el condominio para archivar el pago.');
  return addDoc(collection(db,...tenant(condoId),'archived_payments'),{...payment,archivedAt:Date.now()});
};

export const getArchivedPayments=async(condoId:string,maxItems:number=100)=>{
  const q=query(collection(db,...tenant(condoId),'archived_payments'),orderBy('archivedAt','desc'),limit(Math.max(1,Math.min(1000,maxItems))));
  const snapshot=await getDocs(q);
  return snapshot.docs.map((item:any)=>({id:item.id,...item.data()}));
};

export const saveUserSession=async(userId:string,sessionData:any)=>{
  const condoId=activeCondo();
  if(!condoId||!userId)return;
  await setDoc(doc(db,...tenant(condoId),'sessions',userId),{...sessionData,lastActive:Date.now()});
};

export const cacheQueryResult=async(cacheKey:string,data:any,ttlSeconds:number=300)=>{
  memoryCache.set('query_'+cacheKey,data,Math.max(1,ttlSeconds));
};

export const getCachedQueryResult=async(cacheKey:string)=>{
  return memoryCache.get('query_'+cacheKey)??null;
};
