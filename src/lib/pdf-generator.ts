
'use client';

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import JsBarcode from 'jsbarcode';

const formatCurrency = (num: number) => {
    if (typeof num !== 'number' || isNaN(num)) return '0,00';
    return num.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

/**
 * Motor de Generación de Recibos EFAS CondoSys
 * Diseñado para descarga instantánea en PC y compartir en Dispositivos Móviles.
 */
export const generatePaymentReceipt = async (paymentData: any, condoLogoUrl: string | null, outputType: 'download' | 'blob' = 'download'): Promise<Blob | null> => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });
  
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;

  // 1. Encabezado Premium (Slate-900)
  doc.setFillColor(15, 23, 42); 
  doc.rect(0, 0, 210, 25, 'F');

  // 2. Logo e Identidad
  if (condoLogoUrl) {
    try {
      // Intentamos añadir el logo. Si falla (formato no soportado), continuamos sin romper el PDF.
      doc.addImage(condoLogoUrl, 'JPEG', 14, 6.5, 12, 12);
    } catch (e) {
      console.warn("No se pudo cargar el logo en el PDF:", e);
    }
  }

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(paymentData.condoName.toUpperCase(), 35, 12);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(`RIF: ${paymentData.rif}`, 35, 17);

  // 3. Título y Código de Barras
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('RECIBO DE PAGO OFICIAL', 105, 45, { align: 'center' });

  const barcodeValue = paymentData.receiptNumber || `REC-${Date.now()}`;
  try {
      const canvas = document.createElement('canvas');
      JsBarcode(canvas, barcodeValue, {
          format: "CODE128", height: 40, width: 1, displayValue: false, margin: 0,
      });
      const barcodeDataUrl = canvas.toDataURL("image/png");
      doc.addImage(barcodeDataUrl, 'PNG', pageWidth - margin - 50, 35, 45, 12);
  } catch (e) {
      console.error("Fallo al generar código de barras:", e);
  }
  
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text(`CONTROL N°: ${barcodeValue}`, 196, 52, { align: 'right' });

  // 4. Datos de la Transacción
  doc.setFontSize(9);
  let currentY = 65;
  
  const details = [
    { label: 'Beneficiario:', value: paymentData.ownerName.toUpperCase() },
    { label: 'Método de pago:', value: paymentData.method.toUpperCase() },
    { label: 'Banco Emisor:', value: paymentData.bank.toUpperCase() },
    { label: 'N° de Referencia:', value: paymentData.reference },
    { label: 'Fecha de Operación:', value: paymentData.date },
    { label: 'Tasa BCV Aplicada:', value: `Bs. ${paymentData.rate}` }
  ];

  details.forEach(item => {
    doc.setFont('helvetica', 'bold');
    doc.text(item.label, 15, currentY);
    doc.setFont('helvetica', 'normal');
    doc.text(String(item.value), 60, currentY);
    currentY += 6;
  });

  // 5. Tabla de Liquidación Cronológica
  autoTable(doc, {
    startY: 105,
    head: [['PERÍODO', 'CONCEPTO / DESCRIPCIÓN', 'MONTO ($)', 'MONTO (BS)']],
    body: paymentData.concepts,
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold' },
    styles: { fontSize: 8, cellPadding: 3 },
    columnStyles: { 
        2: { halign: 'right' }, 
        3: { halign: 'right' } 
    }
  });

  // 6. Resumen Financiero
  let finalY = (doc as any).lastAutoTable.finalY + 10;
  const totalX = 196;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`MONTO RECIBIDO:`, totalX - 40, finalY, { align: 'right' });
  doc.text(`Bs. ${paymentData.receivedAmount}`, totalX, finalY, { align: 'right' });
  
  finalY += 6;
  doc.setFont('helvetica', 'bold');
  doc.setFillColor(241, 245, 249);
  doc.rect(15, finalY, 181, 10, 'F');
  doc.text(`TOTAL LIQUIDADO EN CUOTAS:`, totalX - 40, finalY + 6.5, { align: 'right' });
  doc.text(`Bs. ${paymentData.totalDebtPaid}`, totalX, finalY + 6.5, { align: 'right' });

  // 7. Pie de Página y Seguridad
  const footerY = 265;
  doc.setFontSize(7);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(100, 116, 139);
  doc.text(`Observaciones: ${paymentData.observations}`, 15, footerY);
  doc.setFont('helvetica', 'bold');
  doc.text('DOCUMENTO GENERADO POR EFAS CONDOSYS - VALIDEZ DIGITAL SIN FIRMA MANUSCRITA', 105, footerY + 8, { align: 'center' });

  // 8. Salida
  if (outputType === 'blob') {
    return doc.output('blob');
  } else {
    doc.save(`Recibo_EFAS_${paymentData.ownerName.replace(/ /g, '_')}_${barcodeValue}.pdf`);
    return null;
  }
};
