import { db } from './src/lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

async function migrateConfig(condoId: string) {
  try {
    // 1. Migrar mainSettings (Logo, Empresa, etc)
    const oldMain = await getDoc(doc(db, "config", "mainSettings"));
    if (oldMain.exists()) {
      await setDoc(doc(db, "condominios", condoId, "config", "mainSettings"), oldMain.data());
      console.log("✅ Configuración principal migrada a " + condoId);
    }

    // 2. Migrar PIN de autorización
    const oldAuth = await getDoc(doc(db, "config", "authorization"));
    if (oldAuth.exists()) {
      await setDoc(doc(db, "condominios", condoId, "config", "authorization"), oldAuth.data());
      console.log("✅ PIN de seguridad migrado a " + condoId);
    }
  } catch (e) { console.error("Error:", e); }
}

migrateConfig("condo_01");
