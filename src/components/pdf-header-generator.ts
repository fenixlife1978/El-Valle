interface PDFHeaderProps {
    companyInfo: {
        nombre: string;
        rif: string;
        logo?: string;
    };
    title: string;
    subtitle?: string;
}

export const generatePDFHeader = ({ companyInfo, title, subtitle }: PDFHeaderProps): string => {
    const logoUrl = companyInfo?.logo || "/logos/efascondosys-logo.png";
    const nombre = companyInfo?.nombre || "CONDOMINIO";
    const rif = companyInfo?.rif || "";

    return `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 2px solid #e2e8f0;">
            <div style="display: flex; align-items: center; gap: 12px;">
                <div style="width: 60px; height: 60px; border-radius: 50%; overflow: hidden; background: #FFFFFF; border: 3px solid #F5A623; display: flex; align-items: center; justify-content: center;">
                    <img src="${logoUrl}" style="width: 100%; height: 100%; object-fit: cover;" alt="${nombre}" />
                </div>
                <div>
                    <div style="font-size: 14px; font-weight: 900; color: #1A1D23; text-transform: uppercase;">${nombre}</div>
                    <div style="font-size: 10px; color: #64748b; font-weight: 600;">RIF: ${rif}</div>
                </div>
            </div>
            <div>
                <img src="/logos/efascondosys-logo.png" style="height: 45px; width: auto; object-fit: contain;" alt="EFASCondoSys" />
            </div>
        </div>
        <div style="text-align: center; margin-bottom: 20px;">
            <h1 style="color: #1e293b; font-size: 20px; font-weight: 900; text-transform: uppercase;">${title}</h1>
            ${subtitle ? `<p style="color: #64748b; font-size: 11px; margin-top: 5px;">${subtitle}</p>` : ''}
        </div>
    `;
};
