
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
 * Diseñado para ser IDÉNTICO a la imagen de referencia.
 */
export const generatePaymentReceipt = async (paymentData: any, condoLogoUrl: string | null, outputType: 'download' | 'blob' = 'download'): Promise<Blob | null> => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });
  
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;

  // 1. Encabezado Institucional (Slate-900)
  doc.setFillColor(28, 35, 51); 
  doc.rect(0, 0, 210, 28, 'F');

  // 2. Logo e Identidad
  if (condoLogoUrl) {
    try {
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(14, 5, 18, 18, 2, 2, 'F');
      doc.addImage(condoLogoUrl, 'JPEG', 15, 6, 16, 16);
    } catch (e) {
      console.warn("No se pudo cargar el logo en el PDF:", e);
    }
  }

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text(paymentData.condoName || 'CONJUNTO RESIDENCIAL EL VALLE', 38, 14);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(`RIF: ${paymentData.rif || 'J-40587208-0'}`, 38, 19);

  // 3. Título y Código de Barras
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('RECIBO DE PAGO', 105, 48, { align: 'center' });

  const barcodeValue = paymentData.receiptNumber || `REC-${Date.now()}`;
  try {
      const canvas = document.createElement('canvas');
      JsBarcode(canvas, barcodeValue, {
          format: "CODE128", height: 40, width: 2, displayValue: false, margin: 0,
      });
      const barcodeDataUrl = canvas.toDataURL("image/png");
      doc.addImage(barcodeDataUrl, 'PNG', pageWidth - margin - 50, 35, 50, 15);
  } catch (e) {
      console.error("Fallo al generar código de barras:", e);
  }
  
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text(`N° de recibo: ${barcodeValue}`, pageWidth - margin, 54, { align: 'right' });

  // 4. Datos de la Transacción
  doc.setFontSize(9);
  let currentY = 70;
  
  const details = [
    { label: 'Beneficiario:', value: paymentData.ownerName },
    { label: 'Método de pago:', value: paymentData.method || 'N/A' },
    { label: 'Banco Emisor:', value: paymentData.bank || 'N/A' },
    { label: 'N° de Referencia Bancaria:', value: paymentData.reference || 'N/A' },
    { label: 'Fecha del pago:', value: paymentData.date },
    { label: 'Tasa de Cambio Aplicada:', value: `Bs. ${paymentData.rate} por USD` }
  ];

  details.forEach(item => {
    doc.setFont('helvetica', 'bold');
    doc.text(item.label, 15, currentY);
    doc.setFont('helvetica', 'normal');
    doc.text(String(item.value), 65, currentY);
    currentY += 6;
  });

  // 5. Tabla de Conceptos (Estilo Azul de la imagen)
  autoTable(doc, {
    startY: 110,
    head: [['Período', 'Concepto (Propiedad)', 'Monto ($)', 'Monto Pagado (Bs)']],
    body: paymentData.concepts,
    headStyles: { 
        fillColor: [30, 80, 220], 
        textColor: 255, 
        fontStyle: 'bold',
        fontSize: 8,
        halign: 'center'
    },
    styles: { fontSize: 8, cellPadding: 3, valign: 'middle' },
    columnStyles: { 
        0: { cellWidth: 30, halign: 'center' },
        2: { halign: 'center' }, 
        3: { halign: 'center' } 
    },
    alternateRowStyles: { fillColor: [245, 248, 255] }
  });

  // 6. Resumen de Saldos (Alineado a la derecha)
  let finalY = (doc as any).lastAutoTable.finalY + 10;
  const rightAlignX = 196;
  const labelX = 150;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  
  const summary = [
    { label: 'Saldo a Favor Anterior:', value: `Bs. ${paymentData.prevBalance || '0,00'}` },
    { label: 'Monto del Pago Recibido:', value: `Bs. ${paymentData.receivedAmount || '0,00'}` },
    { label: 'Total Abonado en Deudas:', value: `Bs. ${paymentData.totalDebtPaid || '0,00'}` },
    { label: 'Saldo a Favor Actual:', value: `Bs. ${paymentData.currentBalance || '0,00'}` }
  ];

  summary.forEach(item => {
    doc.text(item.label, labelX, finalY, { align: 'right' });
    doc.text(item.value, rightAlignX, finalY, { align: 'right' });
    finalY += 6;
  });

  finalY += 4;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(`TOTAL PAGADO:`, labelX, finalY, { align: 'right' });
  doc.text(`Bs. ${paymentData.receivedAmount}`, rightAlignX, finalY, { align: 'right' });

  // 7. Pie de Página y Seguridad
  const footerY = 240;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(60, 60, 60);
  doc.text(`Observaciones: ${paymentData.observations || 'Pago verificado y aplicado por la administración.'}`, 15, footerY);
  
  doc.text(`Este recibo confirma que el pago ha sido validado para la(s) cuota(s) y propiedad(es) aquí detalladas.`, 15, footerY + 10);
  
  doc.setFont('helvetica', 'bold');
  doc.text(`Firma electrónica: '${paymentData.condoName || 'CONJUNTO RESIDENCIAL EL VALLE'} - Condominio'`, 15, footerY + 15);

  doc.setDrawColor(0);
  doc.setLineWidth(0.5);
  doc.line(15, footerY + 18, 196, footerY + 18);

  doc.setFontSize(7);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(100);
  doc.text('Este recibo se generó de manera automática y es válido sin firma manuscrita.', 105, footerY + 23, { align: 'center' });

  // 8. Salida
  if (outputType === 'blob') {
    return doc.output('blob');
  } else {
    doc.save(`Recibo_Pago_${barcodeValue}.pdf`);
    return null;
  }
};
