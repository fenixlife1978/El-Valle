import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, updateDoc } from 'firebase/firestore';
import { memoryCache } from './memory-cache';

const key=(condoId:string,ownerId:string)=>'extra_debts_'+condoId+'_'+ownerId;

export const getExtraordinaryDebts = async (condoId:string,ownerId:string) => {
  try {
    const q=query(collection(db,'condominios',condoId,'owner_extraordinary_debts'),
      where('ownerId','==',ownerId),where('status','==','pending'));
    const snapshot=await getDocs(q);
    const debts=snapshot.docs.map((item:any)=>({id:item.id,...item.data()}));
    memoryCache.set(key(condoId,ownerId),debts,300);
    return debts;
  } catch(error) {
    const cached=memoryCache.get(key(condoId,ownerId));
    if(cached!==undefined&&cached!==null)return cached;
    throw error;
  }
};

export const markExtraordinaryDebtAsPaid = async (condoId:string,debtId:string,ownerId:string,paymentData:any) => {
  const debtRef=doc(db,'condominios',condoId,'owner_extraordinary_debts',debtId);
  await updateDoc(debtRef,{status:'paid',paidAt:paymentData.paidAt,paymentId:paymentData.paymentId});
  memoryCache.delete(key(condoId,ownerId));
  return true;
};
