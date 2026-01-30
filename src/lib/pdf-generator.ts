
'use client';

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import JsBarcode from 'jsbarcode';

const formatCurrency = (num: number) => {
    if (typeof num !== 'number' || isNaN(num)) return '0,00';
    return num.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export const generatePaymentReceipt = (paymentData: any, condoLogoUrl: string | null, outputType: 'download' | 'blob' = 'download'): Blob | null => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;

  // 1. Encabezado Azul Oscuro
  doc.setFillColor(30, 41, 59); // Slate-800
  doc.rect(0, 0, 210, 25, 'F');

  // 2. Logo del Condominio
  if (condoLogoUrl) {
    try {
      doc.addImage(condoLogoUrl, 'JPEG', 14, 6.5, 12, 12);
    } catch (e) {
      console.error("Error adding logo to PDF:", e);
    }
  }

  // 3. Texto del Encabezado
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(paymentData.condoName, 35, 12);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(`RIF: ${paymentData.rif}`, 35, 17);

  // 4. Cuerpo del Recibo
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('RECIBO DE PAGO', 105, 45, { align: 'center' });

  // Código de barras
  const barcodeValue = `REC-${paymentData.receiptNumber}`;
  try {
      const canvas = document.createElement('canvas');
      JsBarcode(canvas, barcodeValue, {
          format: "CODE128", height: 40, width: 1, displayValue: false, margin: 0,
      });
      const barcodeDataUrl = canvas.toDataURL("image/png");
      doc.addImage(barcodeDataUrl, 'PNG', pageWidth - margin - 50, 35, 45, 15);
  } catch (e) {
      console.error("Barcode generation failed", e);
  }
  doc.setFontSize(8);
  doc.text(`N° de recibo: ${paymentData.receiptNumber}`, 190, 55, { align: 'right' });


  // 5. Información del Beneficiario
  doc.setFontSize(9);
  const infoX = 15;
  let currentY = 65;
  
  const details = [
    { label: 'Beneficiario:', value: paymentData.ownerName },
    { label: 'Método de pago:', value: paymentData.method },
    { label: 'Banco Emisor:', value: paymentData.bank },
    { label: 'N° de Referencia Bancaria:', value: paymentData.reference },
    { label: 'Fecha del pago:', value: paymentData.date },
    { label: 'Tasa de Cambio Aplicada:', value: `Bs. ${paymentData.rate} por USD` }
  ];

  details.forEach(item => {
    doc.setFont('helvetica', 'bold');
    doc.text(item.label, infoX, currentY);
    doc.setFont('helvetica', 'normal');
    doc.text(String(item.value), infoX + 45, currentY);
    currentY += 5;
  });

  // 6. Tabla de Conceptos
  autoTable(doc, {
    startY: 100,
    head: [['Período', 'Concepto (Propiedad)', 'Monto ($)', 'Monto Pagado (Bs)']],
    body: paymentData.concepts,
    headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold' },
    styles: { fontSize: 8, halign: 'center' },
    columnStyles: { 1: { halign: 'left' } }
  });

  // 7. Totales
  let finalY = (doc as any).lastAutoTable.finalY + 10;
  const totalX = 190;

  const totals = [
    { label: 'Saldo a Favor Anterior:', value: `Bs. ${paymentData.prevBalance}` },
    { label: 'Monto del Pago Recibido:', value: `Bs. ${paymentData.receivedAmount}` },
    { label: 'Total Abonado en Deudas:', value: `Bs. ${paymentData.totalDebtPaid}` },
    { label: 'Saldo a Favor Actual:', value: `Bs. ${paymentData.currentBalance}` }
  ];

  totals.forEach(item => {
    doc.setFont('helvetica', 'normal');
    doc.text(item.label, totalX - 50, finalY, { align: 'right' });
    doc.text(item.value, totalX, finalY, { align: 'right' });
    finalY += 5;
  });

  doc.setFont('helvetica', 'bold');
  doc.text('TOTAL PAGADO:', totalX - 50, finalY + 5, { align: 'right' });
  doc.text(`Bs. ${paymentData.receivedAmount}`, totalX, finalY + 5, { align: 'right' });

  // 8. Pie de página y Notas
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  const footerY = 250;
  doc.text(`Observaciones: ${paymentData.observations}`, 15, footerY);
  doc.text('Este recibo confirma que el pago ha sido validado para la(s) cuota(s) y propiedad(es) aquí detalladas.', 15, footerY + 10);
  doc.setFont('helvetica', 'bold');
  doc.text(`Firma electrónica: '${paymentData.condoName} - Condominio'`, 15, footerY + 15);

  doc.setLineWidth(0.5);
  doc.line(15, footerY + 20, 195, footerY + 20);
  doc.setFont('helvetica', 'italic');
  doc.text('Este recibo se generó de manera automática y es válido sin firma manuscrita.', 105, footerY + 25, { align: 'center' });

  if (outputType === 'blob') {
    return doc.output('blob');
  } else {
    doc.save(`Recibo_${paymentData.receiptNumber}.pdf`);
    return null;
  }
};
