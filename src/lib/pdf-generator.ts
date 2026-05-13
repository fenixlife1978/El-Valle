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

// ============================================
// 1. RECIBO DE PAGO NORMAL (CUOTAS)
// ============================================
export const generatePaymentReceipt = async (paymentData: any, condoLogoUrl: string | null, outputType: 'download' | 'blob' = 'download'): Promise<Blob | null> => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    
    const isDolares = (paymentData.method || '').toLowerCase().includes('usd') || 
                      (paymentData.method || '').toLowerCase().includes('dolares');
    const monedaSimbolo = isDolares ? '$' : 'Bs.';

    // Encabezado
    doc.setFillColor(28, 35, 51);
    doc.rect(0, 0, 210, 28, 'F');

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
    doc.text(paymentData.condoName || 'CONDOMINIO', 38, 14);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`RIF: ${paymentData.rif || 'J-40587208-0'}`, 38, 19);

    doc.setTextColor(0, 0, 0);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text(isDolares ? 'RECIBO DE PAGO - DÓLARES USD' : 'RECIBO DE PAGO', 105, 48, { align: 'center' });

    doc.setFontSize(9);
    let currentY = 60;

    const details = [
        { label: 'Beneficiario:', value: paymentData.ownerName },
        { label: 'Propiedad:', value: paymentData.property || 'N/A' },
        { label: 'Método de pago:', value: isDolares ? 'EFECTIVO USD' : (paymentData.method || 'N/A') },
        { label: 'Banco Emisor:', value: paymentData.bank || 'N/A' },
        { label: 'N° de Referencia:', value: paymentData.reference || 'N/A' },
        { label: 'Fecha del pago:', value: paymentData.date },
        { label: isDolares ? 'Moneda:' : 'Tasa de Cambio:', value: isDolares ? 'DÓLARES USD' : `Bs. ${paymentData.rate} por USD` }
    ];

    details.forEach(item => {
        doc.setFont('helvetica', 'bold');
        doc.text(item.label, 15, currentY);
        doc.setFont('helvetica', 'normal');
        doc.text(String(item.value), 65, currentY);
        currentY += 6;
    });

    autoTable(doc, {
        startY: 110,
        head: [['Período', 'Concepto', isDolares ? 'Monto USD' : 'Monto $', isDolares ? 'Pagado USD' : 'Pagado Bs']],
        body: paymentData.concepts,
        headStyles: { fillColor: isDolares ? [15, 23, 42] : [30, 80, 220], textColor: 255, fontStyle: 'bold', fontSize: 8, halign: 'center' },
        styles: { fontSize: 8, cellPadding: 3 },
        alternateRowStyles: { fillColor: [245, 248, 255] }
    });

    let finalY = (doc as any).lastAutoTable.finalY + 10;
    const rightAlignX = 196;
    const labelX = 150;

    doc.setFontSize(9);
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
    doc.text(`${monedaSimbolo} ${paymentData.receivedAmount}`, rightAlignX, finalY, { align: 'right' });

    const footerY = 240;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(60, 60, 60);
    doc.text(`Observaciones: ${paymentData.observations || 'Pago verificado y aplicado por la administración.'}`, 15, footerY);
    doc.text(`Firma electrónica: '${paymentData.condoName || 'CONDOMINIO'} - Condominio'`, 15, footerY + 15);

    const barcodeValue = paymentData.receiptNumber || `REC-${Date.now()}`;
    try {
        const canvas = document.createElement('canvas');
        JsBarcode(canvas, barcodeValue, { format: "CODE128", height: 40, width: 2, displayValue: false, margin: 0 });
        const barcodeDataUrl = canvas.toDataURL("image/png");
        doc.addImage(barcodeDataUrl, 'PNG', 80, footerY + 28, 50, 12);
    } catch (e) {}

    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.text(`N° de recibo: ${barcodeValue}`, 105, footerY + 45, { align: 'center' });

    if (outputType === 'blob') {
        return doc.output('blob');
    } else {
        const safeName = (paymentData.ownerName || 'Beneficiario').replace(/[^a-z0-9]/gi, '_').toUpperCase();
        doc.save(`Recibo_Pago_${safeName}.pdf`);
        return null;
    }
};

// ============================================
// 2. COMPROBANTE DE INGRESO EN EFECTIVO
// ============================================
export const generateCashReceipt = async (data: any, condoLogoUrl: string | null, outputType: 'download' | 'blob' = 'download'): Promise<Blob | null> => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const margin = 15;

    doc.setFillColor(28, 35, 51);
    doc.rect(0, 0, 210, 28, 'F');

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
    doc.text(data.condoName || 'CONDOMINIO', 38, 14);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`RIF: ${data.rif || 'J-40587208-0'}`, 38, 19);

    doc.setTextColor(0, 0, 0);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('COMPROBANTE DE INGRESO EN EFECTIVO', 105, 48, { align: 'center' });

    doc.setFontSize(10);
    let currentY = 65;

    const details = [
        { label: 'Recibido de:', value: data.ownerName },
        { label: 'Concepto:', value: 'PAGO DE CUOTAS DE CONDOMINIO' },
        { label: 'Propiedad:', value: data.property || 'N/A' },
        { label: 'Monto:', value: `Bs. ${formatCurrency(data.amount)}` },
        { label: 'Fecha:', value: data.paymentDate },
        { label: 'Referencia:', value: data.reference || 'EFECTIVO' }
    ];

    details.forEach(item => {
        doc.setFont('helvetica', 'bold');
        doc.text(item.label, margin, currentY);
        doc.setFont('helvetica', 'normal');
        doc.text(String(item.value), 65, currentY);
        currentY += 7;
    });

    const barcodeValue = data.receiptNumber || `CASH-${Date.now()}`;
    try {
        const canvas = document.createElement('canvas');
        JsBarcode(canvas, barcodeValue, { format: "CODE128", height: 30, width: 1.5, displayValue: false, margin: 0 });
        const barcodeDataUrl = canvas.toDataURL("image/png");
        doc.addImage(barcodeDataUrl, 'PNG', 80, 180, 50, 10);
    } catch (e) {}

    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.text(`N° Comprobante: ${barcodeValue}`, 105, 195, { align: 'center' });

    if (outputType === 'blob') {
        return doc.output('blob');
    } else {
        doc.save(`Comprobante_Efectivo_${data.ownerName.replace(/[^a-z0-9]/gi, '_').toUpperCase()}.pdf`);
        return null;
    }
};

// ============================================
// 3. COMPROBANTE DE EGRESO EN EFECTIVO
// ============================================
export const generateCashExpenseReceipt = async (data: any, condoLogoUrl: string | null, outputType: 'download' | 'blob' = 'download'): Promise<Blob | null> => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const margin = 15;

    doc.setFillColor(28, 35, 51);
    doc.rect(0, 0, 210, 28, 'F');

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
    doc.text(data.condoName || 'CONDOMINIO', 38, 14);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`RIF: ${data.rif || 'J-40587208-0'}`, 38, 19);

    doc.setTextColor(0, 0, 0);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('COMPROBANTE DE EGRESO EN EFECTIVO', 105, 48, { align: 'center' });

    doc.setFontSize(10);
    let currentY = 65;

    const details = [
        { label: 'Pagado a:', value: data.receptorName },
        { label: 'Concepto:', value: data.concept },
        { label: 'Monto:', value: data.currency === 'USD' ? `$ ${formatUSD(data.amount)} USD` : `Bs. ${formatCurrency(data.amount)}` },
        { label: 'Fecha:', value: data.expenseDate },
        { label: 'Referencia:', value: data.reference || 'N/A' },
        { label: 'Autorizado por:', value: data.authorizedBy },
        { label: 'Entregado por:', value: data.deliveredBy }
    ];

    details.forEach(item => {
        doc.setFont('helvetica', 'bold');
        doc.text(item.label, margin, currentY);
        doc.setFont('helvetica', 'normal');
        doc.text(String(item.value), 65, currentY);
        currentY += 7;
    });

    const barcodeValue = data.receiptNumber || `EGR-${Date.now()}`;
    try {
        const canvas = document.createElement('canvas');
        JsBarcode(canvas, barcodeValue, { format: "CODE128", height: 30, width: 1.5, displayValue: false, margin: 0 });
        const barcodeDataUrl = canvas.toDataURL("image/png");
        doc.addImage(barcodeDataUrl, 'PNG', 80, 200, 50, 10);
    } catch (e) {}

    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.text(`N° Comprobante: ${barcodeValue}`, 105, 215, { align: 'center' });

    if (outputType === 'blob') {
        return doc.output('blob');
    } else {
        doc.save(`Comprobante_Egreso_${data.receptorName.replace(/[^a-z0-9]/gi, '_').toUpperCase()}.pdf`);
        return null;
    }
};

// ============================================
// 4. COMPROBANTE DE OPERACIÓN DE CAMBIO USD
// ============================================
export const generateExchangeReceipt = async (data: any, condoLogoUrl: string | null, outputType: 'download' | 'blob' = 'download'): Promise<Blob | null> => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const margin = 15;
    const isCompra = data.operationType === 'compra';

    doc.setFillColor(28, 35, 51);
    doc.rect(0, 0, 210, 28, 'F');

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
    doc.text(data.condoName || 'CONDOMINIO', 38, 14);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`RIF: ${data.rif || 'J-40587208-0'}`, 38, 19);

    doc.setTextColor(0, 0, 0);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(isCompra ? 'COMPROBANTE DE COMPRA DE USD' : 'COMPROBANTE DE VENTA DE USD', 105, 48, { align: 'center' });

    doc.setFontSize(10);
    let currentY = 65;

    const details = [
        { label: isCompra ? 'Vendedor:' : 'Comprador:', value: data.counterpartyName },
        ...(data.counterpartyId ? [{ label: 'Cédula/RIF:', value: data.counterpartyId }] : []),
        { label: 'Monto USD:', value: `$ ${formatUSD(data.usdAmount)}` },
        { label: 'Monto Bs.:', value: `Bs. ${formatCurrency(data.bsAmount)}` },
        { label: 'Tasa de Cambio:', value: `Bs. ${formatCurrency(data.exchangeRate)} por USD` },
        { label: 'Fecha:', value: data.operationDate },
        { label: 'Autorizado por:', value: data.authorizedBy },
        { label: 'Entregado por:', value: data.deliveredBy }
    ];

    details.forEach(item => {
        doc.setFont('helvetica', 'bold');
        doc.text(item.label, margin, currentY);
        doc.setFont('helvetica', 'normal');
        doc.text(String(item.value), 65, currentY);
        currentY += 7;
    });

    const barcodeValue = data.receiptNumber || `USD-${Date.now()}`;
    try {
        const canvas = document.createElement('canvas');
        JsBarcode(canvas, barcodeValue, { format: "CODE128", height: 30, width: 1.5, displayValue: false, margin: 0 });
        const barcodeDataUrl = canvas.toDataURL("image/png");
        doc.addImage(barcodeDataUrl, 'PNG', 80, 200, 50, 10);
    } catch (e) {}

    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.text(`N° Comprobante: ${barcodeValue}`, 105, 215, { align: 'center' });

    if (outputType === 'blob') {
        return doc.output('blob');
    } else {
        const fileName = isCompra ? `Compra_USD_${data.counterpartyName.replace(/[^a-z0-9]/gi, '_').toUpperCase()}` : `Venta_USD_${data.counterpartyName.replace(/[^a-z0-9]/gi, '_').toUpperCase()}`;
        doc.save(`${fileName}.pdf`);
        return null;
    }
};


