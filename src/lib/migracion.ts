import { db } from '@/lib/firebase';
import { collection, getDocs, updateDoc, doc, writeBatch } from 'firebase/firestore';

export const migrateDataToCondo = async (targetCondoId: string) => {
  const collectionsToMigrate = ['payments', 'owners', 'billboard_announcements', 'app_feedback'];
  
  for (const colName of collectionsToMigrate) {
    const colRef = collection(db, colName);
    const snapshot = await getDocs(colRef);
    const batch = writeBatch(db);
    
    snapshot.docs.forEach((document) => {
      const data = document.data();
      // Si el documento no tiene condominioId, lo asignamos a condo_01
      if (!data.condominioId) {
        const docRef = doc(db, colName, document.id);
        batch.update(docRef, { condominioId: targetCondoId });
      }
    });
    
    await batch.commit();
    console.log(`Migración completada para: ${colName}`);
  }
};
