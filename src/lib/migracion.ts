import { db } from './firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

export const migrarConfiguracionCompleta = async () => {
  try {
    console.log("Iniciando copia de configuración...");
    
    // 1. Referencia a la fuente (lo viejo)
    const viejaRef = doc(db, 'config', 'mainSettings');
    const docSnap = await getDoc(viejaRef);

    if (docSnap.exists()) {
      const todaLaData = docSnap.data();

      // 2. Referencia al destino (lo nuevo)
      const nuevaRef = doc(db, 'condominios', 'condo_01', 'config', 'settings');
      
      // 3. Copiamos TODO sin dejarnos nada
      await setDoc(nuevaRef, todaLaData);
      
      alert("¡Éxito! Se han migrado todas las tasas BCV, cuentas bancarias y datos de empresa al condo_01.");
    } else {
      alert("No se encontró el documento original en config/mainSettings");
    }
  } catch (error) {
    console.error("Error migrando configuración:", error);
    alert("Hubo un error al copiar los datos.");
  }
};
