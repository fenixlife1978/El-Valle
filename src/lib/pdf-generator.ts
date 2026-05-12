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
 * Optimizado para desglosar Saldo Anterior y Monto Recibido.
 */
export const generatePaymentReceipt = async (paymentData: any, condoLogoUrl: string | null, outputType: 'download' | 'blob' = 'download'): Promise<Blob | null> => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });
  
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;

  // Detectar si es pago en dólares
  const isDolares = (paymentData.method || '').toLowerCase().includes('usd') || 
                    (paymentData.method || '').toLowerCase().includes('dolares');
  const monedaSimbolo = isDolares ? '$' : 'Bs.';

  // 1. Encabezado Institucional
  doc.setFillColor(28, 35, 51); 
  doc.rect(0, 0, 210, 28, 'F');

  // 2. Logo e Identidad
  if (condoLogoUrl) {
    try {
      doc.setFillColor(255, 255, 255);
      doc.circle(23, 14, 9, 'F');
      doc.addImage(condoLogoUrl, 'JPEG', 16, 7, 14, 14);
    } catch (e) {
      doc.setFontSize(24);
      doc.setTextColor(255, 255, 255);
      doc.text('🏢', 20, 20);
    }
  }

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text(paymentData.condoName || 'CONJUNTO RESIDENCIAL EL VALLE', 38, 14);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(`RIF: ${paymentData.rif || 'J-40587208-0'}`, 38, 19);

  // 3. Título
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(isDolares ? 'RECIBO DE PAGO - DÓLARES USD' : 'RECIBO DE PAGO', 105, 48, { align: 'center' });

  // 4. Datos de la Transacción
  doc.setFontSize(9);
  let currentY = 60;
  
  const details = [
    { label: 'Beneficiario:', value: paymentData.ownerName },
    { label: 'Propiedad:', value: paymentData.property || 'N/A' },
    { label: 'Método de pago:', value: isDolares ? 'EFECTIVO USD' : (paymentData.method || 'N/A') },
    { label: 'Banco Emisor:', value: paymentData.bank || 'N/A' },
    { label: 'N° de Referencia Bancaria:', value: paymentData.reference || 'N/A' },
    { label: 'Fecha del pago:', value: paymentData.date },
    { label: isDolares ? 'Moneda:' : 'Tasa de Cambio Aplicada:', value: isDolares ? 'DÓLARES ESTADOUNIDENSES (USD)' : `Bs. ${paymentData.rate} por USD` }
  ];

  details.forEach(item => {
    doc.setFont('helvetica', 'bold');
    doc.text(item.label, 15, currentY);
    doc.setFont('helvetica', 'normal');
    doc.text(String(item.value), 65, currentY);
    currentY += 6;
  });

  // 5. Tabla de Conceptos
  autoTable(doc, {
    startY: 110,
    head: [['Período', 'Concepto (Propiedad)', isDolares ? 'Monto USD ($)' : 'Monto ($)', isDolares ? 'Monto Pagado (USD)' : 'Monto Pagado (Bs)']],
    body: paymentData.concepts,
    headStyles: { 
        fillColor: isDolares ? [15, 23, 42] : [30, 80, 220], 
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

  // 6. Resumen de Saldos
  let finalY = (doc as any).lastAutoTable.finalY + 10;
  const rightAlignX = 196;
  const labelX = 150;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  
  const summary = [
    { label: 'Saldo a Favor Anterior:', value: `${monedaSimbolo} ${paymentData.prevBalance || '0,00'}` },
    { label: 'Monto del Pago Recibido:', value: `${monedaSimbolo} ${paymentData.receivedAmount || '0,00'}` },
    { label: 'Total Abonado en Deudas:', value: `${monedaSimbolo} ${paymentData.totalDebtPaid || '0,00'}` },
    { label: 'Saldo a Favor Actual:', value: `${monedaSimbolo} ${paymentData.currentBalance || '0,00'}` }
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
  doc.text(`${monedaSimbolo} ${paymentData.receivedAmount || paymentData.totalDebtPaid || '0,00'}`, rightAlignX, finalY, { align: 'right' });

  // 7. Pie de Página
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

  // 8. Código de Barras
  const barcodeValue = paymentData.receiptNumber || `REC-${Date.now()}`;
  try {
      const canvas = document.createElement('canvas');
      JsBarcode(canvas, barcodeValue, { format: "CODE128", height: 40, width: 2, displayValue: false, margin: 0 });
      const barcodeDataUrl = canvas.toDataURL("image/png");
      doc.addImage(barcodeDataUrl, 'PNG', 80, footerY + 28, 50, 12);
  } catch (e) {}
  
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text(`N° de recibo: ${barcodeValue}`, 105, footerY + 45, { align: 'center' });

  if (outputType === 'blob') {
    return doc.output('blob');
  } else {
    const safeName = (paymentData.ownerName || 'Beneficiario').replace(/[^a-z0-9]/gi, '_').toUpperCase();
    doc.save(`Recibo_Pago_${safeName}.pdf`);
    return null;
  }
};