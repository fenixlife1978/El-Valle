import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, updateDoc } from 'firebase/firestore';
import { memoryCache } from './memory-cache';

const key=(condoId:string,ownerId:string)=>'debts_'+condoId+'_'+ownerId;

// Legacy name retained for callers; Turso is the only persisted source of truth.
export const syncDebtsToRealtime = async (condoId:string,ownerId:string) => {
  const q=query(collection(db,'condominios',condoId,'debts'),where('ownerId','==',ownerId));
  const snapshot=await getDocs(q);
  const debts=snapshot.docs.map((item:any)=>({id:item.id,...item.data()}));
  memoryCache.set(key(condoId,ownerId),debts,300);
  return debts;
};

export const getDebts = async (condoId:string,ownerId:string) => {
  try { return await syncDebtsToRealtime(condoId,ownerId); }
  catch(error) { const cached=memoryCache.get(key(condoId,ownerId)); if(cached!==undefined&&cached!==null)return cached; throw error; }
};

export const updateDebt = async (condoId:string,debtId:string,ownerId:string,data:any) => {
  const debtRef=doc(db,'condominios',condoId,'debts',debtId);
  await updateDoc(debtRef,data);
  memoryCache.delete(key(condoId,ownerId));
  return true;
};
