import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, setDoc, Timestamp } from 'firebase/firestore';
import { subMonths } from 'date-fns';

export const archiveOldPayments = async (condoId:string,monthsOld:number=3) => {
  const cutoff=Timestamp.fromDate(subMonths(new Date(),monthsOld));
  const paymentsQuery=query(collection(db,'condominios',condoId,'payments'),
    where('paymentDate','<',cutoff),where('status','==','aprobado'));
  const snapshot=await getDocs(paymentsQuery);
  const archivedAt=new Date().toISOString();
  for(const item of snapshot.docs) {
    const payment={id:item.id,...item.data()};
    await setDoc(doc(db,'condominios',condoId,'archived_payments',item.id),{...payment,archivedAt});
  }
  return snapshot.size;
};
