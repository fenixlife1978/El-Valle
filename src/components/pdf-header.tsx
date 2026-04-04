'use client';

import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface PDFHeaderProps {
  condoId: string;
}

// Componente para usar dentro del PDF (se renderiza y luego se captura)
export const PDFHeaderComponent = ({ condoId }: PDFHeaderProps) => {
  const [condominioData, setCondominioData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      if (!condoId || condoId === "[condoId]") {
        setLoading(false);
        return;
      }
      
      try {
        // Leer DIRECTAMENTE de /condominios/condo_01
        const docRef = doc(db, 'condominios', condoId);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          setCondominioData(docSnap.data());
          console.log("Datos del condominio cargados:", docSnap.data());
        } else {
          console.error("No se encontró el documento en:", 'condominios', condoId);
        }
      } catch (error) {
        console.error("Error:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [condoId]);

  const systemLogo = "/logos/efascondosys-logo.png";
  
  if (loading) {
    return <div style={{ padding: "20px", textAlign: "center", fontSize: "12px" }}>Cargando...</div>;
  }

  const nombre = condominioData?.nombre || condominioData?.name || "CONJUNTO RESIDENCIAL EL VALLE";
  const rif = condominioData?.rif || "J-40587208-0";
  const logo = condominioData?.logo || "";

  return (
    <div style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: "20px",
      paddingBottom: "15px",
      borderBottom: "2px solid #e2e8f0"
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <div style={{
          width: "65px",
          height: "65px",
          borderRadius: "50%",
          overflow: "hidden",
          background: "#FFFFFF",
          border: "3px solid #F5A623",
          display: "flex",
          alignItems: "center",
          justifyContent: "center"
        }}>
          {logo ? (
            <img 
              src={logo} 
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
              alt={nombre}
            />
          ) : (
            <div style={{ fontSize: "32px" }}>��</div>
          )}
        </div>
        <div>
          <div style={{ fontSize: "12px", fontWeight: "900", color: "#1A1D23", textTransform: "uppercase" }}>
            {nombre}
          </div>
          <div style={{ fontSize: "9px", color: "#64748b", fontWeight: "600" }}>
            RIF: {rif}
          </div>
        </div>
      </div>

      <div>
        <img 
          src={systemLogo} 
          style={{ height: "50px", width: "auto", objectFit: "contain" }}
          alt="EFASCondoSys"
        />
      </div>
    </div>
  );
};

// Función simple para generar el HTML (usada en el PDF)
export const PDFHeader = (condoId: string, condominioData?: any) => {
  const systemLogo = "/logos/efascondosys-logo.png";
  const nombre = condominioData?.nombre || condominioData?.name || "CONJUNTO RESIDENCIAL EL VALLE";
  const rif = condominioData?.rif || "J-40587208-0";
  const logo = condominioData?.logo || "";

  return `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 2px solid #e2e8f0;">
      <div style="display: flex; align-items: center; gap: 12px;">
        <div style="width: 65px; height: 65px; border-radius: 50%; overflow: hidden; background: #FFFFFF; border: 3px solid #F5A623; display: flex; align-items: center; justify-content: center;">
          ${logo ? `<img src="${logo}" style="width: 100%; height: 100%; object-fit: cover;" alt="${nombre}"/>` : '<div style="font-size: 32px;">🏢</div>'}
        </div>
        <div>
          <div style="font-size: 12px; font-weight: 900; color: #1A1D23; text-transform: uppercase;">${nombre}</div>
          <div style="font-size: 9px; color: #64748b; font-weight: 600;">RIF: ${rif}</div>
        </div>
      </div>
      <div><img src="${systemLogo}" style="height: 50px; width: auto; object-fit: contain;" alt="EFASCondoSys"/></div>
    </div>
  `;
};
