import { memoryCache } from './memory-cache';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

const offline=()=>typeof navigator!=='undefined'&&!navigator.onLine;

export const getCachedSettings=async(condoId:string)=>{
  const key='settings_'+condoId;
  const cached=memoryCache.get(key);
  if(offline()&&cached!==null)return cached;
  try{
    const snap=await getDoc(doc(db,'condominios',condoId,'config','mainSettings'));
    if(!snap.exists()){memoryCache.delete(key);return undefined;}
    const settings=snap.data();
    memoryCache.set(key,settings,600);
    return settings;
  }catch(error){if(cached!==null)return cached;throw error;}
};

export const getCachedOwner=async(condoId:string,ownerId:string)=>{
  const key='owner_'+condoId+'_'+ownerId;
  const cached=memoryCache.get(key);
  if(offline()&&cached!==null)return cached;
  try{
    for(const ownersCol of ['owners','propietarios']){
      const snap=await getDoc(doc(db,'condominios',condoId,ownersCol,ownerId));
      if(snap.exists()){
        const owner=snap.data();
        memoryCache.set(key,owner,300);
        return owner;
      }
    }
    memoryCache.delete(key);
    return undefined;
  }catch(error){if(cached!==null)return cached;throw error;}
};
