export const printPDF = (htmlContent: string): void => {
  const printWindow = window.open('', '_blank', 'width=1200,height=800');
  if (!printWindow) {
    alert('Por favor, permite las ventanas emergentes para generar el PDF');
    return;
  }
  
  printWindow.document.write(htmlContent);
  printWindow.document.close();
  
  printWindow.onload = () => {
    printWindow.print();
  };
};

export const downloadPDF = (htmlContent: string, filename: string = 'estado-cuenta.pdf'): void => {
  printPDF(htmlContent);
};

/**
 * Genera un blob PDF a partir de contenido HTML
 */
export const generatePDFBlob = async (htmlContent: string): Promise<Blob | null> => {
  try {
    // Crear un iframe oculto para renderizar el HTML
    const iframe = document.createElement('iframe');
    iframe.style.position = 'absolute';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    document.body.appendChild(iframe);
    
    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!iframeDoc) {
      document.body.removeChild(iframe);
      return null;
    }
    
    iframeDoc.open();
    iframeDoc.write(htmlContent);
    iframeDoc.close();
    
    // Esperar a que el contenido cargue
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Usar html2canvas y jsPDF para generar el PDF
    const html2canvas = (await import('html2canvas')).default;
    const jsPDF = (await import('jspdf')).default;
    
    const element = iframeDoc.body;
    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff'
    });
    
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });
    
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
    
    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
    
    // Limpiar iframe
    document.body.removeChild(iframe);
    
    // Retornar como blob
    return pdf.output('blob');
  } catch (error) {
    console.error('Error generando PDF blob:', error);
    return null;
  }
};

/**
 * Comparte un PDF generado a partir de contenido HTML
 */
export const sharePDF = async (
  htmlContent: string, 
  filename: string = 'documento.pdf',
  title: string = 'Compartir PDF'
): Promise<boolean> => {
  try {
    const blob = await generatePDFBlob(htmlContent);
    
    if (!blob) {
      console.error('No se pudo generar el PDF para compartir');
      return false;
    }
    
    // Verificar si el navegador soporta la API de compartir archivos
    if (navigator.share && navigator.canShare) {
      const file = new File([blob], filename, { type: 'application/pdf' });
      
      const shareData: ShareData = {
        files: [file],
        title: title,
        text: 'Compartir documento PDF'
      };
      
      if (navigator.canShare(shareData)) {
        await navigator.share(shareData);
        return true;
      }
    }
    
    // Fallback: descargar el PDF si no se puede compartir
    console.warn('Compartir archivos no es soportado en este navegador. Descargando PDF...');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    return true;
  } catch (error) {
    console.error('Error al compartir PDF:', error);
    
    // Si el usuario cancela el compartir, no es un error real
    if (error instanceof Error && error.name === 'AbortError') {
      return false;
    }
    
    return false;
  }
};

/**
 * Descarga un PDF como archivo (alternativa a printPDF)
 */
export const downloadPDFAsFile = async (
  htmlContent: string, 
  filename: string = 'documento.pdf'
): Promise<void> => {
  try {
    const blob = await generatePDFBlob(htmlContent);
    
    if (!blob) {
      console.error('No se pudo generar el PDF para descargar');
      return;
    }
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Error descargando PDF:', error);
  }
};