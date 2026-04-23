'use client';

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import JsBarcode from 'jsbarcode';

const formatCurrency = (num: number) => {
    if (typeof num !== 'number' || isNaN(num)) return '0,00';
    return num.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const formatUSD = (num: number) => {
    if (typeof num !== 'number' || isNaN(num)) return '0.00';
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

/**
 * Motor de Generación de Recibos EFAS CondoSys
 */
export const generatePaymentReceipt = async (paymentData: any, condoLogoUrl: string | null, outputType: 'download' | 'blob' = 'download'): Promise<Blob | null> => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });
  
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;

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
      console.warn("No se pudo cargar el logo en el PDF:", e);
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
  doc.text('RECIBO DE PAGO', 105, 48, { align: 'center' });

  // 4. Datos de la Transacción
  doc.setFontSize(9);
  let currentY = 60;
  
  const details = [
    { label: 'Beneficiario:', value: paymentData.ownerName },
    { label: 'Propiedad:', value: paymentData.property || 'N/A' },
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

  // 5. Tabla de Conceptos
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

  // 6. Resumen de Saldos
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
  doc.text(`Bs. ${paymentData.totalDebtPaid}`, rightAlignX, finalY, { align: 'right' });

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

  // 8. Código de Barras al final centrado
  const barcodeValue = paymentData.receiptNumber || `REC-${Date.now()}`;
  try {
      const canvas = document.createElement('canvas');
      JsBarcode(canvas, barcodeValue, {
          format: "CODE128", height: 40, width: 2, displayValue: false, margin: 0,
      });
      const barcodeDataUrl = canvas.toDataURL("image/png");
      doc.addImage(barcodeDataUrl, 'PNG', 80, footerY + 28, 50, 12);
  } catch (e) {
      console.error("Fallo al generar código de barras:", e);
  }
  
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text(`N° de recibo: ${barcodeValue}`, 105, footerY + 45, { align: 'center' });

  // 9. Salida
  if (outputType === 'blob') {
    return doc.output('blob');
  } else {
    const safeName = (paymentData.ownerName || 'Beneficiario').replace(/[^a-z0-9]/gi, '_').toUpperCase();
    doc.save(`Recibo_Pago_${safeName}.pdf`);
    return null;
  }
};

// ============================================
// COMPROBANTE DE INGRESO EN EFECTIVO (CAJA PRINCIPAL)
// ============================================
export interface CashReceiptData {
  condoName: string;
  rif: string;
  receiptNumber: string;
  ownerName: string;
  property: string;
  paymentDate: string;
  amount: number;
  exchangeRate: number;
  reference?: string;
  observations?: string;
  concepts?: string[][];
}

export const generateCashReceipt = async (
  data: CashReceiptData,
  condoLogoUrl: string | null,
  outputType: 'download' | 'blob' = 'download'
): Promise<Blob | null> => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;

  // ============================================
  // 1. ENCABEZADO INSTITUCIONAL
  // ============================================
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, 210, 35, 'F');

  // Logo
  if (condoLogoUrl) {
    try {
      doc.setFillColor(255, 255, 255);
      doc.circle(22, 17, 11, 'F');
      doc.addImage(condoLogoUrl, 'JPEG', 13, 8, 18, 18);
    } catch (e) {
      console.warn("No se pudo cargar el logo en el PDF:", e);
      doc.setFontSize(28);
      doc.setTextColor(255, 255, 255);
      doc.text('🏢', 18, 24, { align: 'center' });
    }
  } else {
    doc.setFontSize(28);
    doc.setTextColor(255, 255, 255);
    doc.text('🏢', 18, 24, { align: 'center' });
  }

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(data.condoName.toUpperCase(), 40, 18);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`RIF: ${data.rif}`, 40, 26);

  // Logo del sistema (derecha)
  doc.setFontSize(12);
  doc.setTextColor(242, 135, 5);
  doc.setFont('helvetica', 'bold');
  doc.text('EFAS CondoSys', 195, 18, { align: 'right' });
  doc.setFontSize(7);
  doc.setTextColor(200, 200, 200);
  doc.text('Sistema de Autogestión de Condominios', 195, 26, { align: 'right' });

  // ============================================
  // 2. TÍTULO DEL COMPROBANTE
  // ============================================
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('COMPROBANTE DE INGRESO EN EFECTIVO', 105, 55, { align: 'center' });

  // Línea decorativa
  doc.setDrawColor(242, 135, 5);
  doc.setLineWidth(1.5);
  doc.line(margin, 65, pageWidth - margin, 65);

  // ============================================
  // 3. DETALLES DEL INGRESO
  // ============================================
  let currentY = 78;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('DETALLES DE LA TRANSACCIÓN', margin, currentY);
  currentY += 8;

  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.3);
  doc.line(margin, currentY - 2, pageWidth - margin, currentY - 2);

  const details = [
    { label: 'Propietario:', value: data.ownerName },
    { label: 'Propiedad:', value: data.property },
    { label: 'Fecha de Pago:', value: data.paymentDate },
    { label: 'Tasa de Cambio Aplicada:', value: `Bs. ${formatCurrency(data.exchangeRate)} por USD` },
    { label: 'Referencia:', value: data.reference || 'EFECTIVO' },
    { label: 'Cuenta de Destino:', value: 'CAJA PRINCIPAL' }
  ];

  doc.setFontSize(9);
  details.forEach(item => {
    doc.setFont('helvetica', 'bold');
    doc.text(`${item.label}`, margin, currentY);
    doc.setFont('helvetica', 'normal');
    doc.text(String(item.value), margin + 55, currentY);
    currentY += 7;
  });

  // ============================================
  // 4. CONCEPTOS
  // ============================================
  currentY += 5;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('CONCEPTOS', margin, currentY);
  currentY += 6;
  doc.line(margin, currentY - 2, pageWidth - margin, currentY - 2);

  if (data.concepts && data.concepts.length > 0) {
    autoTable(doc, {
      startY: currentY,
      head: [['Período', 'Concepto', 'Monto ($)', 'Monto (Bs.)']],
      body: data.concepts,
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: 255,
        fontStyle: 'bold',
        fontSize: 9,
        halign: 'center'
      },
      styles: { fontSize: 9, cellPadding: 4, halign: 'center' },
      columnStyles: {
        0: { cellWidth: 30, halign: 'center' },
        1: { halign: 'left' },
        2: { halign: 'right' },
        3: { halign: 'right' }
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: margin, right: margin }
    });

    currentY = (doc as any).lastAutoTable.finalY + 8;
  } else {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('Pago en efectivo registrado en CAJA PRINCIPAL.', margin, currentY);
    currentY += 10;
  }

  // Monto Total (destacado)
  doc.setFillColor(242, 135, 5);
  doc.roundedRect(margin, currentY, pageWidth - (margin * 2), 12, 3, 3, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('MONTO TOTAL RECIBIDO:', margin + 5, currentY + 8);
  doc.text(`Bs. ${formatCurrency(data.amount)}`, pageWidth - margin - 5, currentY + 8, { align: 'right' });

  currentY += 20;

  // ============================================
  // 5. FIRMAS Y CONFORMIDAD
  // ============================================
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('ENTREGA CONFORME', margin, currentY);
  doc.text('RECIBE CONFORME', pageWidth - margin - 50, currentY);

  currentY += 5;
  doc.setDrawColor(100, 100, 100);
  doc.setLineWidth(0.5);
  doc.line(margin, currentY + 15, margin + 60, currentY + 15);
  doc.line(pageWidth - margin - 60, currentY + 15, pageWidth - margin, currentY + 15);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('Firma del Propietario', margin + 30, currentY + 22, { align: 'center' });
  doc.text('Firma de Tesorería', pageWidth - margin - 30, currentY + 22, { align: 'center' });

  doc.setFontSize(7);
  doc.setTextColor(100, 100, 100);
  doc.text(data.ownerName, margin + 30, currentY + 28, { align: 'center' });
  doc.text('Administración del Condominio', pageWidth - margin - 30, currentY + 28, { align: 'center' });

  // ============================================
  // 6. PIE DE PÁGINA
  // ============================================
  const footerY = 260;
  doc.setDrawColor(242, 135, 5);
  doc.setLineWidth(1);
  doc.line(margin, footerY, pageWidth - margin, footerY);

  doc.setFontSize(7);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(120, 120, 120);
  doc.text('Documento generado electrónicamente por EFASCondoSys', 105, footerY + 6, { align: 'center' });
  doc.text('Comprobante de ingreso en efectivo - Válido sin firma manuscrita', 105, footerY + 12, { align: 'center' });

  // ============================================
  // 7. CÓDIGO DE BARRAS AL FINAL CENTRADO
  // ============================================
  const barcodeValue = data.receiptNumber || `CASH-${Date.now()}`;
  try {
    const canvas = document.createElement('canvas');
    JsBarcode(canvas, barcodeValue, {
      format: "CODE128",
      height: 40,
      width: 2,
      displayValue: false,
      margin: 0,
    });
    const barcodeDataUrl = canvas.toDataURL("image/png");
    doc.addImage(barcodeDataUrl, 'PNG', 80, footerY + 18, 50, 12);
  } catch (e) {
    console.error("Fallo al generar código de barras:", e);
  }

  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text(`N° Comprobante: ${barcodeValue}`, 105, footerY + 35, { align: 'center' });

  // ============================================
  // 8. SALIDA
  // ============================================
  if (outputType === 'blob') {
    return doc.output('blob');
  } else {
    const safeName = (data.ownerName || 'Propietario').replace(/[^a-z0-9]/gi, '_').toUpperCase();
    doc.save(`Comprobante_Efectivo_${safeName}.pdf`);
    return null;
  }
};