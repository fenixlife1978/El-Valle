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
