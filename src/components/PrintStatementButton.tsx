'use client';

import { Printer } from 'lucide-react';
import { PDFContent } from './BankStatementPDF';
import { downloadPDF } from '@/lib/print-pdf';

interface Transaction {
  fecha: string;
  descripcion: string;
  referencia: string;
  ingreso?: number;
  egreso?: number;
  saldo: number;
}

interface PrintStatementButtonProps {
  transactions: Transaction[];
  companyInfo: any;
  periodo: string;
  saldoInicial: number;
  bancoInfo?: {
    nombre: string;
    cuenta: string;
  };
}

export const PrintStatementButton = ({
  transactions,
  companyInfo,
  periodo,
  saldoInicial,
  bancoInfo
}: PrintStatementButtonProps) => {
  
  const handlePrint = () => {
    const html = PDFContent({
      transactions,
      companyInfo,
      periodo,
      saldoInicial,
      bancoInfo
    });
    const fileName = `Estado_Cuenta_${periodo.replace(/ /g, '_')}.pdf`;
    downloadPDF(html, fileName);
  };

  return (
    <button
      onClick={handlePrint}
      className="flex items-center gap-2 bg-[#F28705] hover:bg-[#E07600] text-white px-4 py-2 rounded-lg transition-all duration-200 shadow-md hover:shadow-lg"
    >
      <Printer className="h-4 w-4" />
      Generar Estado de Cuenta PDF
    </button>
  );
};
