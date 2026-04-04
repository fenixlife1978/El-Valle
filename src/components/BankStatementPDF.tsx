'use client';

interface Transaction {
  fecha: string;
  descripcion: string;
  referencia: string;
  ingreso?: number;
  egreso?: number;
  saldo: number;
}

interface BankStatementPDFProps {
  transactions: Transaction[];
  companyInfo: {
    nombre: string;
    rif: string;
    logo?: string;
  };
  periodo: string;
  saldoInicial: number;
  bancoInfo?: {
    nombre: string;
    cuenta: string;
  };
}

// Función para generar código de barras en SVG puro (más grande)
const generarCodigoBarrasSVG = (texto: string): string => {
  const chars = texto.split('');
  let patron = '';
  for (let i = 0; i < chars.length; i++) {
    const code = chars[i].charCodeAt(0);
    for (let j = 0; j < 8; j++) {
      patron += ((code >> j) & 1) ? '1' : '0';
    }
  }
  
  const anchoBarra = 3; // Aumentado de 2 a 3
  const alto = 50; // Aumentado de 30 a 50
  let svg = `<svg width="${patron.length * anchoBarra}" height="${alto}" xmlns="http://www.w3.org/2000/svg">`;
  svg += `<rect width="100%" height="100%" fill="white"/>`;
  
  for (let i = 0; i < patron.length; i++) {
    if (patron[i] === '1') {
      svg += `<rect x="${i * anchoBarra}" y="0" width="${anchoBarra}" height="${alto}" fill="black"/>`;
    }
  }
  svg += `</svg>`;
  
  const encodedSVG = encodeURIComponent(svg);
  return `data:image/svg+xml,${encodedSVG}`;
};

const generarNumeroDocumento = () => {
  const fecha = new Date();
  const timestamp = fecha.getTime().toString().slice(-8);
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `EFAS-${timestamp}-${random}`;
};

export const PDFContent = ({
  transactions,
  companyInfo,
  periodo,
  saldoInicial,
  bancoInfo = { nombre: "BANCO DE VENEZUELA", cuenta: "" }
}: BankStatementPDFProps): string => {
  
  let saldoActual = saldoInicial;
  const transactionsWithBalance = transactions.map(t => {
    if (t.ingreso) saldoActual += t.ingreso;
    if (t.egreso) saldoActual -= t.egreso;
    return { ...t, saldoActual: saldoActual };
  });

  const numeroDocumento = generarNumeroDocumento();
  const codigoBarrasSVG = generarCodigoBarrasSVG(numeroDocumento);

  const condominioLogo = companyInfo?.logo || "/logo-condominio-el-valle.png";
  const condominioNombre = companyInfo?.nombre || "CONJUNTO RESIDENCIAL EL VALLE";
  const condominioRif = companyInfo?.rif || "J-40587208-0";

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Estado de Cuenta - ${condominioNombre}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: 'Helvetica', 'Arial', sans-serif;
          margin: 20px;
          padding: 20px;
          background: white;
        }
        .container {
          max-width: 1200px;
          margin: 0 auto;
          background: white;
        }
        .top-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
          padding-bottom: 15px;
          border-bottom: 2px solid #e2e8f0;
        }
        .condominio-section {
          display: flex;
          align-items: center;
          gap: 15px;
        }
        .logo-circle {
          width: 65px;
          height: 65px;
          border-radius: 50%;
          overflow: hidden;
          background: #FFFFFF;
          border: 3px solid #F5A623;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .logo-circle img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .condominio-nombre {
          font-size: 14px;
          font-weight: 900;
          color: #1A1D23;
          text-transform: uppercase;
        }
        .condominio-rif {
          font-size: 10px;
          color: #64748b;
          font-weight: 600;
          margin-top: 3px;
        }
        .system-logo {
          height: 40px;
          width: auto;
          object-fit: contain;
        }
        .account-title {
          text-align: center;
          margin: 15px 0 10px 0;
        }
        .account-title h2 {
          color: #1e293b;
          font-size: 18px;
          font-weight: 900;
        }
        .info-row {
          display: flex;
          align-items: center;
          gap: 20px;
          margin: 20px 0;
        }
        .info-card {
          flex: 1;
          background: #f8fafc;
          padding: 12px;
          border-radius: 8px;
          border-left: 4px solid #F28705;
        }
        .info-card label {
          font-size: 9px;
          font-weight: 700;
          text-transform: uppercase;
          color: #64748b;
          display: block;
          margin-bottom: 5px;
        }
        .info-card value {
          font-size: 14px;
          font-weight: 900;
          color: #1e293b;
        }
        .barcode-box {
          background: #f8fafc;
          padding: 8px 12px;
          border-radius: 8px;
          border-right: 4px solid #F28705;
          text-align: center;
          min-width: 180px;
        }
        .barcode-box img {
          max-width: 180px;
          height: auto;
        }
        .barcode-number {
          font-size: 8px;
          color: #64748b;
          margin-top: 5px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin: 20px 0;
          font-size: 10px;
        }
        th {
          background: #1A1D23;
          color: white;
          padding: 12px 8px;
          font-weight: 700;
          text-transform: uppercase;
          font-size: 9px;
        }
        td {
          padding: 10px 8px;
          border-bottom: 1px solid #e2e8f0;
        }
        .text-right { text-align: right; }
        .text-left { text-align: left; }
        .ingreso { color: #10b981; font-weight: 700; }
        .egreso { color: #ef4444; font-weight: 700; }
        .saldo { font-weight: 900; color: #1e293b; }
        .footer {
          margin-top: 30px;
          padding-top: 15px;
          text-align: center;
          font-size: 8px;
          color: #94a3b8;
          border-top: 1px solid #e2e8f0;
        }
        @media print {
          body { margin: 0; padding: 0; }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="top-header">
          <div class="condominio-section">
            <div class="logo-circle">
              <img src="${condominioLogo}" alt="${condominioNombre}" onerror="this.style.display='none'; this.parentElement.innerHTML='<div style=&quot;font-size:28px;&quot;>🏢</div>'">
            </div>
            <div>
              <div class="condominio-nombre">${condominioNombre}</div>
              <div class="condominio-rif">RIF: ${condominioRif}</div>
            </div>
          </div>
          <div>
            <img class="system-logo" src="/logos/efascondosys-logo.png" alt="EFASCondoSys">
          </div>
        </div>

        <div class="account-title">
          <h2>${bancoInfo.nombre}</h2>
        </div>

        <div class="info-row">
          <div class="info-card">
            <label>Saldo Inicial</label>
            <value>Bs. ${saldoInicial.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</value>
          </div>
          <div class="info-card">
            <label>Período</label>
            <value>${periodo}</value>
          </div>
          <div class="barcode-box">
            <img src="${codigoBarrasSVG}" alt="Código de barras">
            <div class="barcode-number">${numeroDocumento}</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th class="text-left">FECHA</th>
              <th class="text-left">DESCRIPCIÓN</th>
              <th class="text-left">REFERENCIA</th>
              <th class="text-right">INGRESO (Bs)</th>
              <th class="text-right">EGRESO (Bs)</th>
              <th class="text-right">SALDO (Bs)</th>
            </tr>
          </thead>
          <tbody>
            ${transactionsWithBalance.map(t => `
              <tr>
                <td class="text-left">${t.fecha}</td>
                <td class="text-left">${t.descripcion}</td>
                <td class="text-left">${t.referencia}</td>
                <td class="text-right ${t.ingreso ? 'ingreso' : ''}">
                  ${t.ingreso ? t.ingreso.toLocaleString('es-VE', { minimumFractionDigits: 2 }) : '-'}
                </td>
                <td class="text-right ${t.egreso ? 'egreso' : ''}">
                  ${t.egreso ? t.egreso.toLocaleString('es-VE', { minimumFractionDigits: 2 }) : '-'}
                </td>
                <td class="text-right saldo">
                  ${t.saldoActual.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                </td>
              </tr>
            `).join('')}
          </tbody>
          <tfoot>
            <tr style="background: #f1f5f9; font-weight: 900;">
              <td colspan="5" class="text-right">SALDO FINAL:</td>
              <td class="text-right saldo">
                ${transactionsWithBalance[transactionsWithBalance.length - 1]?.saldoActual.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
              </td>
            </tr>
          </tfoot>
        </table>

        <div class="footer">
          <p>Documento generado por <strong>EFASCondoSys</strong> - Sistema de Autogestión de Condominios</p>
        </div>
      </div>
    </body>
    </html>
  `;
};
