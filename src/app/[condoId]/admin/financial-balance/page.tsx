'use client';

import React, { useState, useEffect, useMemo, use } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, setDoc, serverTimestamp, getDoc, onSnapshot, orderBy } from 'firebase/firestore';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Save, Download, Landmark, Coins, Wallet, Share2, CalendarClock, DollarSign } from "lucide-react";
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import { Label } from '@/components/ui/label';
import { downloadPDF } from '@/lib/print-pdf';

const formatCurrency = (num: number) => {
    if (typeof num !== 'number' || isNaN(num)) return '0,00';
    return num.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const formatUSD = (num: number) => {
    if (typeof num !== 'number' || isNaN(num)) return '0.00';
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const months = Array.from({ length: 12 }, (_, i) => ({
    value: String(i + 1),
    label: format(new Date(2000, i), 'MMMM', { locale: es }),
}));

const BDV_ACCOUNT_ID = "Hlc0ky0QdnaXIsuf19Od";

interface FinancialAccount {
    id: string;
    nombre: string;
    saldoActual: number;
    tipo?: string;
}

interface EgresoConFecha {
    fecha: string;
    concepto: string;
    monto: number;
    cuenta: string;
}

const generarCodigoBarrasSVG = (texto: string): string => {
    const chars = texto.split('');
    let patron = '';
    for (let i = 0; i < chars.length; i++) {
        const code = chars[i].charCodeAt(0);
        for (let j = 0; j < 8; j++) {
            patron += ((code >> j) & 1) ? '1' : '0';
        }
    }
    const anchoBarra = 3;
    const alto = 50;
    let svg = `<svg width="${patron.length * anchoBarra}" height="${alto}" xmlns="http://www.w3.org/2000/svg">`;
    svg += `<rect width="100%" height="100%" fill="white"/>`;
    for (let i = 0; i < patron.length; i++) {
        if (patron[i] === '1') {
            svg += `<rect x="${i * anchoBarra}" y="0" width="${anchoBarra}" height="${alto}" fill="black"/>`;
        }
    }
    svg += `</svg>`;
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
};

const generarNumeroDocumento = (periodo: string, condoId: string) => {
    return `BAL-${periodo.replace(/-/g, '')}-${condoId.substring(0, 6).toUpperCase()}`;
};

const generateBalanceHTML = (
    condominioData: any,
    periodo: string,
    saldoInicBDV: number,
    saldoInicCaja: number,
    saldoInicChica: number,
    saldoInicDolares: number,
    ingresosMesBDV: number,
    ingresosMesCaja: number,
    ingresosMesDolares: number,
    egresosDolares: EgresoConFecha[],
    egresos: EgresoConFecha[],
    saldoFinBDV: number,
    saldoFinCaja: number,
    saldoFinChica: number,
    saldoFinDolares: number,
    totalIngresos: number,
    totalIngresosUSD: number,
    totalEgresos: number,
    totalEgresosUSD: number,
    totalDisponible: number,
    totalDisponibleUSD: number,
    lastDayOfMonthStr: string,
    notas: string
): string => {
    
    const condominioNombre = condominioData?.nombre || condominioData?.name || "CONJUNTO RESIDENCIAL EL VALLE";
    const condominioRif = condominioData?.rif || "J-40587208-0";
    const condominioLogo = condominioData?.logo || "/logo-condominio-el-valle.png";
    const numeroDocumento = generarNumeroDocumento(periodo.replace(/ /g, ''), condominioData?.id || 'CONDO');
    const codigoBarrasSVG = generarCodigoBarrasSVG(numeroDocumento);

    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>Balance de Ingresos y Egresos - ${condominioNombre}</title>
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: 'Helvetica', 'Arial', sans-serif; margin: 20px; padding: 20px; background: white; }
            .container { max-width: 1200px; margin: 0 auto; background: white; }
            .top-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 2px solid #e2e8f0; }
            .condominio-section { display: flex; align-items: center; gap: 15px; }
            .logo-circle { width: 65px; height: 65px; border-radius: 50%; overflow: hidden; background: #FFFFFF; border: 3px solid #F5A623; display: flex; align-items: center; justify-content: center; }
            .logo-circle img { width: 100%; height: 100%; object-fit: cover; }
            .condominio-nombre { font-size: 14px; font-weight: 900; color: #1A1D23; text-transform: uppercase; }
            .condominio-rif { font-size: 10px; color: #64748b; font-weight: 600; margin-top: 3px; }
            .system-logo { height: 40px; width: auto; object-fit: contain; }
            .title-section { text-align: center; margin: 20px 0; }
            .title-section h1 { color: #1e293b; font-size: 22px; font-weight: 900; letter-spacing: 2px; }
            .info-row { display: flex; align-items: center; gap: 20px; margin: 20px 0; }
            .info-card { flex: 1; background: #f8fafc; padding: 12px; border-radius: 8px; border-left: 4px solid #F28705; }
            .info-card label { font-size: 9px; font-weight: 700; text-transform: uppercase; color: #64748b; display: block; margin-bottom: 5px; }
            .info-card value { font-size: 14px; font-weight: 900; color: #1e293b; }
            .barcode-box { background: #f8fafc; padding: 8px 12px; border-radius: 8px; border-right: 4px solid #F28705; text-align: center; min-width: 180px; }
            .barcode-box img { max-width: 180px; height: auto; }
            .barcode-number { font-size: 8px; color: #64748b; margin-top: 5px; }
            table { width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 10px; }
            th { background: #1A1D23; color: white; padding: 10px 8px; font-weight: 700; text-transform: uppercase; font-size: 9px; }
            td { padding: 8px 6px; border-bottom: 1px solid #e2e8f0; }
            .text-right { text-align: right; }
            .text-left { text-align: left; }
            .text-center { text-align: center; }
            .font-bold { font-weight: 900; }
            .bg-gray { background: #f1f5f9; }
            .text-usd { color: #b8860b; }
            .footer { margin-top: 30px; padding-top: 15px; text-align: center; font-size: 8px; color: #94a3b8; border-top: 1px solid #e2e8f0; }
            .notas { margin-top: 30px; padding: 15px; background: #f8fafc; border-radius: 8px; font-size: 9px; color: #475569; }
            .section-title { background: #1A1D23; color: #F28705; padding: 8px 12px; font-size: 10px; font-weight: 900; text-transform: uppercase; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="top-header">
                <div class="condominio-section">
                    <div class="logo-circle"><img src="${condominioLogo}" alt="${condominioNombre}" onerror="this.style.display='none'"></div>
                    <div><div class="condominio-nombre">${condominioNombre}</div><div class="condominio-rif">RIF: ${condominioRif}</div></div>
                </div>
                <div><img class="system-logo" src="/logos/efascondosys-logo.png" alt="EFASCondoSys"></div>
            </div>
            <div class="title-section"><h1>BALANCE DE INGRESOS Y EGRESOS</h1></div>
            <div class="info-row">
                <div class="info-card"><label>Período</label><value>${periodo}</value></div>
                <div class="info-card"><label>Corte al</label><value>${lastDayOfMonthStr}</value></div>
                <div class="barcode-box"><img src="${codigoBarrasSVG}" alt="Código de barras"><div class="barcode-number">${numeroDocumento}</div></div>
            </div>

            <!-- I. SALDOS INICIALES -->
            <table>
                <thead><tr><th colspan="3">I. SALDOS INICIALES</th></tr></thead>
                <tbody>
                    <tr><td>Banco de Venezuela</td><td class="text-right">Bs. ${formatCurrency(saldoInicBDV)}</td><td></td></tr>
                    <tr><td>Caja Principal</td><td class="text-right">Bs. ${formatCurrency(saldoInicCaja)}</td><td></td></tr>
                    <tr><td>Caja Chica (Fondo Fijo Inicial)</td><td class="text-right">Bs. ${formatCurrency(saldoInicChica)}</td><td></td></tr>
                    <tr><td class="text-usd">Cuenta en Dólares (USD Efectivo)</td><td class="text-right text-usd">$ ${formatUSD(saldoInicDolares)}</td><td class="text-right">Bs. ${formatCurrency(saldoInicDolares * 0)}</td></tr>
                    <tr class="bg-gray font-bold"><td>TOTAL SALDOS INICIALES</td><td class="text-right" colspan="2">Bs. ${formatCurrency(saldoInicBDV + saldoInicCaja + saldoInicChica)}</td></tr>
                </tbody>
            </table>

            <!-- II. INGRESOS DEL MES -->
            <table>
                <thead><tr><th colspan="3">II. INGRESOS DEL MES</th></tr></thead>
                <tbody>
                    <tr><td>Banco de Venezuela (Ingresos Ordinarios)</td><td class="text-right">Bs. ${formatCurrency(ingresosMesBDV)}</td><td></td></tr>
                    <tr><td>Caja Principal (Efectivo)</td><td class="text-right">Bs. ${formatCurrency(ingresosMesCaja)}</td><td></td></tr>
                    <tr><td class="text-usd">Cuenta en Dólares (Ingresos USD)</td><td class="text-right text-usd">$ ${formatUSD(ingresosMesDolares)}</td><td class="text-right">Bs. 0,00</td></tr>
                    <tr class="bg-gray font-bold"><td>TOTAL INGRESOS</td><td class="text-right" colspan="2">Bs. ${formatCurrency(ingresosMesBDV + ingresosMesCaja)} | USD: $ ${formatUSD(ingresosMesDolares)}</td></tr>
                </tbody>
            </table>

            <!-- III. EGRESOS DEL MES -->
            <table>
                <thead><tr><th>FECHA</th><th>CONCEPTO</th><th>CUENTA</th><th class="text-right">MONTO</th></tr></thead>
                <tbody>
                    ${egresos.map(e => `<tr><td class="text-left">${e.fecha}</td><td class="text-left">${e.concepto.toUpperCase()}</td><td class="text-left">${e.cuenta}</td><td class="text-right">Bs. ${formatCurrency(e.monto)}</td></tr>`).join('')}
                    ${egresosDolares.map(e => `<tr class="text-usd"><td class="text-left">${e.fecha}</td><td class="text-left">${e.concepto.toUpperCase()}</td><td class="text-left">${e.cuenta}</td><td class="text-right">$ ${formatUSD(e.monto)}</td></tr>`).join('')}
                    ${egresos.length === 0 && egresosDolares.length === 0 ? '<tr><td colspan="4" class="text-center">No hay egresos registrados</td></tr>' : ''}
                    <tr class="bg-gray font-bold"><td colspan="3" class="text-right">TOTAL EGRESOS</td><td class="text-right">Bs. ${formatCurrency(totalEgresos)} | USD: $ ${formatUSD(totalEgresosUSD)}</td></tr>
                </tbody>
            </table>

            <!-- IV. SALDOS FINALES -->
            <table>
                <thead><tr><th colspan="3">IV. SALDOS FINALES AL ${lastDayOfMonthStr}</th></tr></thead>
                <tbody>
                    <tr><td>Banco de Venezuela (Cierre)</td><td class="text-right">Bs. ${formatCurrency(saldoFinBDV)}</td><td></td></tr>
                    <tr><td>Caja Principal (Cierre)</td><td class="text-right">Bs. ${formatCurrency(saldoFinCaja)}</td><td></td></tr>
                    <tr><td>Caja Chica (Cierre)</td><td class="text-right">Bs. ${formatCurrency(saldoFinChica)}</td><td></td></tr>
                    <tr><td class="text-usd">Cuenta en Dólares (Cierre)</td><td class="text-right text-usd">$ ${formatUSD(saldoFinDolares)}</td><td class="text-right">Bs. 0,00</td></tr>
                </tbody>
            </table>

            <!-- V. VALIDACIÓN DE TESORERÍA -->
            <table>
                <thead><tr><th colspan="3">V. VALIDACIÓN DE TESORERÍA</th></tr></thead>
                <tbody>
                    <tr><td>Total Ingresos (Saldos + Mes)</td><td class="text-right" colspan="2">Bs. ${formatCurrency(totalIngresos)}</td></tr>
                    <tr><td>(-) Total Egresos</td><td class="text-right" colspan="2">Bs. ${formatCurrency(totalEgresos)}</td></tr>
                    <tr class="bg-gray font-bold"><td>TOTAL DISPONIBLE (Bs.)</td><td class="text-right" colspan="2">Bs. ${formatCurrency(totalDisponible)}</td></tr>
                    <tr class="text-usd"><td>DISPONIBLE USD (Efectivo)</td><td class="text-right text-usd" colspan="2">$ ${formatUSD(totalDisponibleUSD)}</td></tr>
                </tbody>
            </table>

            ${notas ? `<div class="notas"><strong>NOTAS Y OBSERVACIONES:</strong><br/>${notas}</div>` : ''}
            <div class="footer">
                <p>Documento generado por <strong>EFASCondoSys</strong> - Sistema de Autogestión de Condominios</p>
                <p>Este balance refleja los movimientos financieros del período</p>
            </div>
        </div>
    </body>
    </html>
    `;
};

export default function FinancialBalancePage({ params }: { params: Promise<{ condoId: string }> }) {
    const resolvedParams = use(params);
    const { condoId: urlCondoId } = resolvedParams;
    const { userProfile, companyInfo: authCompanyInfo } = useAuth();
    const { toast } = useToast();

    const workingCondoId = userProfile?.workingCondoId || userProfile?.condominioId || urlCondoId;

    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [selectedMonth, setSelectedMonth] = useState(String(new Date().getMonth() + 1)); 
    const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()));

    const [saldoInicBDV, setSaldoInicBDV] = useState(0.00);
    const [saldoInicCaja, setSaldoInicCaja] = useState(0.00);
    const [saldoInicChica, setSaldoInicChica] = useState(0.00);
    const [saldoInicDolares, setSaldoInicDolares] = useState(0.00);
    const [saldoFinBDV, setSaldoFinBDV] = useState(0.00);
    const [saldoFinCaja, setSaldoFinCaja] = useState(0.00);
    const [saldoFinChica, setSaldoFinChica] = useState(0.00);
    const [saldoFinDolares, setSaldoFinDolares] = useState(0.00);
    const [egresosTesorería, setEgresosTesorería] = useState<EgresoConFecha[]>([]);
    const [egresosDolares, setEgresosDolares] = useState<EgresoConFecha[]>([]);
    const [ingresosMesBDV, setIngresosMesBDV] = useState(0);
    const [ingresosMesCaja, setIngresosMesCaja] = useState(0);
    const [ingresosMesDolares, setIngresosMesDolares] = useState(0);
    const [notas, setNotas] = useState("");
    const [cuentasReales, setCuentasReales] = useState<FinancialAccount[]>([]);
    const [cuentaDolares, setCuentaDolares] = useState<FinancialAccount | null>(null);
    const [condominioData, setCondominioData] = useState<any>(null);

    useEffect(() => {
        if (!workingCondoId || workingCondoId === "[condoId]") return;
        const fetchCondominioData = async () => {
            try {
                const docRef = doc(db, 'condominios', workingCondoId);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) setCondominioData(docSnap.data());
            } catch (error) { console.error("Error cargando datos del condominio:", error); }
        };
        fetchCondominioData();
    }, [workingCondoId]);

    useEffect(() => {
        if (!workingCondoId) return;
        
        const unsubCuentas = onSnapshot(collection(db, 'condominios', workingCondoId, 'cuentas'), (snap) => {
            const data: FinancialAccount[] = snap.docs.map(d => {
                const docData = d.data();
                return { id: d.id, nombre: (docData.nombre || 'SIN NOMBRE').toString(), saldoActual: Number(docData.saldoActual || 0), tipo: docData.tipo };
            }).filter(a => !a.nombre.toUpperCase().includes('MERCANTIL'));
            
            setCuentasReales(data);
            
            const bdv = data.find(a => a.id === BDV_ACCOUNT_ID || a.nombre.toUpperCase().includes('BANCO'));
            const caja = data.find(a => a.nombre.toUpperCase().includes('CAJA PRINCIPAL'));
            const chica = data.find(a => a.nombre.toUpperCase().includes('CAJA CHICA'));
            const dolares = data.find(a => a.tipo === 'dolares' || a.nombre.toUpperCase().includes('DOLARES'));
            
            if (bdv) setSaldoFinBDV(bdv.saldoActual || 0);
            if (caja) setSaldoFinCaja(caja.saldoActual || 0);
            if (chica) setSaldoFinChica(chica.saldoActual || 0);
            if (dolares) { setSaldoFinDolares(dolares.saldoActual || 0); setCuentaDolares(dolares); }
        });

        const fetchData = async () => {
            setLoading(true);
            try {
                const year = parseInt(selectedYear), month = parseInt(selectedMonth) - 1;
                const from = startOfMonth(new Date(year, month, 1)), to = endOfMonth(from);
                
                const docId = `${selectedYear}-${selectedMonth.padStart(2, '0')}`;
                const savedRef = doc(db, 'condominios', workingCondoId, 'financial_statements', docId);
                const savedSnap = await getDoc(savedRef);
                
                if (savedSnap.exists()) {
                    const d = savedSnap.data();
                    setSaldoInicBDV(d.saldoInicBDV || 0);
                    setSaldoInicCaja(d.saldoInicCaja || 0);
                    setSaldoInicChica(d.saldoInicChica || 0);
                    setSaldoInicDolares(d.saldoInicDolares || 0);
                    setSaldoFinBDV(d.saldoFinBDV || 0);
                    setSaldoFinCaja(d.saldoFinCaja || 0);
                    setSaldoFinChica(d.saldoFinChica || 0);
                    setSaldoFinDolares(d.saldoFinDolares || 0);
                    setNotas(d.notas || "");
                }

                const tSnap = await getDocs(query(
                    collection(db, 'condominios', workingCondoId, 'transacciones'), 
                    where('fecha', '>=', from), 
                    where('fecha', '<=', to), 
                    orderBy('fecha', 'desc')
                ));
                
                const allTxs = tSnap.docs.map(d => ({ id: d.id, ...d.data() } as any)).filter(t => {
                    const desc = (t.descripcion || "").toUpperCase();
                    const accName = (t.nombreCuenta || "").toUpperCase();
                    return !accName.includes('MERCANTIL') && !desc.includes('TRASLADO') && !desc.includes('RECEPCIÓN') && !desc.includes('TRANSFERENCIA ENTRE CUENTAS') && !desc.includes('INGRESO DESDE');
                });

                // Separar transacciones en Bs y USD
                const txsBs = allTxs.filter(t => t.tipoCuenta !== 'dolares');
                const txsUSD = allTxs.filter(t => t.tipoCuenta === 'dolares');

                // Egresos en Bs
                const egresosBs = txsBs.filter(t => t.tipo === 'egreso').map(t => ({ 
                    fecha: t.fecha?.toDate ? format(t.fecha.toDate(), 'dd/MM/yy') : format(new Date(), 'dd/MM/yy'),
                    concepto: t.descripcion, monto: t.monto, cuenta: t.nombreCuenta 
                }));
                setEgresosTesorería(egresosBs);

                // Egresos en USD
                const egresosUsd = txsUSD.filter(t => t.tipo === 'egreso').map(t => ({ 
                    fecha: t.fecha?.toDate ? format(t.fecha.toDate(), 'dd/MM/yy') : format(new Date(), 'dd/MM/yy'),
                    concepto: t.descripcion, monto: t.montoUSD || t.monto, cuenta: t.nombreCuenta 
                }));
                setEgresosDolares(egresosUsd);

                // Ingresos BDV
                const ordBDV = txsBs.filter(t => t.tipo === 'ingreso' && (t.cuentaId === BDV_ACCOUNT_ID || t.nombreCuenta?.toUpperCase().includes('BANCO')) && t.referencia?.toUpperCase() !== 'EFECTIVO').reduce((sum, t) => sum + t.monto, 0);
                setIngresosMesBDV(ordBDV);

                // Ingresos Caja
                const cashCaja = txsBs.filter(t => t.tipo === 'ingreso' && (t.referencia?.toUpperCase() === 'EFECTIVO' || t.nombreCuenta?.toUpperCase().includes('CAJA PRINCIPAL'))).reduce((sum, t) => sum + t.monto, 0);
                setIngresosMesCaja(cashCaja);

                // Ingresos USD
                const ingresosUSD = txsUSD.filter(t => t.tipo === 'ingreso').reduce((sum, t) => sum + (Number(t.montoUSD) || t.monto), 0);
                setIngresosMesDolares(ingresosUSD);

            } catch (e) { console.error("Error fetching data:", e); } 
            finally { setLoading(false); }
        };
        fetchData();
        return () => unsubCuentas();
    }, [selectedMonth, selectedYear, workingCondoId]);

    const totalIngresos = useMemo(() => saldoInicBDV + saldoInicCaja + saldoInicChica + ingresosMesBDV + ingresosMesCaja, [saldoInicBDV, saldoInicCaja, saldoInicChica, ingresosMesBDV, ingresosMesCaja]);
    const totalIngresosUSD = useMemo(() => saldoInicDolares + ingresosMesDolares, [saldoInicDolares, ingresosMesDolares]);
    const totalEgresos = useMemo(() => egresosTesorería.reduce((sum, e) => sum + e.monto, 0), [egresosTesorería]);
    const totalEgresosUSD = useMemo(() => egresosDolares.reduce((sum, e) => sum + e.monto, 0), [egresosDolares]);
    const totalDisponible = useMemo(() => totalIngresos - totalEgresos, [totalIngresos, totalEgresos]);
    const totalDisponibleUSD = useMemo(() => totalIngresosUSD - totalEgresosUSD, [totalIngresosUSD, totalEgresosUSD]);

    const lastDayOfMonthStr = useMemo(() => format(endOfMonth(new Date(parseInt(selectedYear), parseInt(selectedMonth)-1)), 'dd/MM/yyyy'), [selectedMonth, selectedYear]);
    const periodLabel = useMemo(() => `${months.find(m => m.value === selectedMonth)?.label.toUpperCase()} ${selectedYear}`, [selectedMonth, selectedYear]);

    const handleGeneratePDF = async () => {
        const html = generateBalanceHTML(
            condominioData || { nombre: authCompanyInfo?.name, rif: authCompanyInfo?.rif },
            periodLabel,
            saldoInicBDV, saldoInicCaja, saldoInicChica, saldoInicDolares,
            ingresosMesBDV, ingresosMesCaja, ingresosMesDolares,
            egresosDolares, egresosTesorería,
            saldoFinBDV, saldoFinCaja, saldoFinChica, saldoFinDolares,
            totalIngresos, totalIngresosUSD, totalEgresos, totalEgresosUSD,
            totalDisponible, totalDisponibleUSD,
            lastDayOfMonthStr, notas
        );
        const fileName = `Balance_Ingresos_Egresos_${periodLabel.replace(/ /g, '_')}.pdf`;
        downloadPDF(html, fileName);
    };

    const handleSave = async () => {
        if (!workingCondoId) return;
        setSaving(true);
        try {
            const docId = `${selectedYear}-${selectedMonth.padStart(2, '0')}`;
            await setDoc(doc(db, 'condominios', workingCondoId, 'financial_statements', docId), {
                periodo: docId, 
                saldoInicBDV, saldoInicCaja, saldoInicChica, saldoInicDolares,
                saldoFinBDV, saldoFinCaja, saldoFinChica, saldoFinDolares,
                ingresosMesBDV, ingresosMesCaja, ingresosMesDolares,
                egresos: egresosTesorería, egresosDolares,
                totalIngresos, totalIngresosUSD, totalEgresos, totalEgresosUSD,
                totalDisponible, totalDisponibleUSD,
                notas, updatedAt: serverTimestamp()
            });
            toast({ title: "Balance Guardado" });
        } catch (e) { toast({ variant: 'destructive', title: "Error al guardar" }); } 
        finally { setSaving(false); }
    };

    return (
        <div className="max-w-5xl mx-auto p-6 space-y-8 bg-[#1A1D23] min-h-screen font-montserrat text-white italic">
            <div className="flex flex-col md:flex-row justify-between items-end gap-4 mb-10 border-b border-white/5 pb-6">
                <div>
                    <h1 className="text-4xl font-black uppercase italic tracking-tighter text-white">Balance de <span className="text-primary">Ingresos y Egresos</span></h1>
                    <p className="text-[10px] font-black uppercase text-white/40 tracking-[0.3em] mt-2 italic">{authCompanyInfo?.name?.toUpperCase() || "EL VALLE"}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                        <SelectTrigger className="w-36 bg-slate-900 border-white/5 font-black uppercase text-[10px] rounded-xl"><SelectValue /></SelectTrigger>
                        <SelectContent className="bg-slate-900 border-white/10 text-white">{months.map(m => (<SelectItem key={m.value} value={m.value} className="font-black uppercase text-[10px]">{m.label}</SelectItem>))}</SelectContent>
                    </Select>
                    <Input className="w-24 bg-slate-900 border-white/5 font-black rounded-xl" type="number" value={selectedYear} onChange={e => setSelectedYear(e.target.value)} />
                    <Button onClick={handleGeneratePDF} variant="outline" className="rounded-xl border-white/10 text-white h-10 font-black uppercase text-[10px] bg-white/5 hover:bg-white/10 italic"><Download className="mr-2 h-4 w-4" /> Exportar PDF</Button>
                    <Button onClick={handleSave} disabled={saving} className="rounded-xl bg-primary text-slate-900 h-10 font-black uppercase text-[10px] italic">{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Guardar</Button>
                </div>
            </div>

            {loading ? <div className="py-20 flex justify-center"><Loader2 className="animate-spin h-10 w-10 text-primary" /></div> : <>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    {cuentasReales.filter(acc => acc.tipo !== 'dolares').map(acc => (
                        <Card key={acc.id} className="rounded-[2rem] border-none shadow-2xl bg-slate-900 text-white p-6 border border-white/5 relative overflow-hidden italic transition-transform hover:scale-105">
                            <div className="relative z-10">
                                <p className="text-[10px] font-black uppercase text-primary italic">{acc.nombre}</p>
                                <p className="text-2xl font-black italic mt-1">Bs. {formatCurrency(acc.saldoActual)}</p>
                            </div>
                            {acc.nombre?.includes('BANCO') ? <Landmark className="absolute top-4 right-4 h-10 w-10 text-white/5"/> : acc.nombre?.includes('CAJA PRINCIPAL') ? <Coins className="absolute top-4 right-4 h-10 w-10 text-white/5"/> : <Wallet className="absolute top-4 right-4 h-10 w-10 text-white/5"/>}
                        </Card>
                    ))}
                    {cuentaDolares && (
                        <Card className="rounded-[2rem] border-none shadow-2xl bg-slate-900 text-white p-6 border border-yellow-500/30 relative overflow-hidden italic transition-transform hover:scale-105">
                            <div className="relative z-10">
                                <p className="text-[10px] font-black uppercase text-yellow-500 italic">{cuentaDolares.nombre}</p>
                                <p className="text-2xl font-black italic mt-1 text-yellow-500">$ {formatUSD(cuentaDolares.saldoActual)}</p>
                                <p className="text-[9px] text-white/30 mt-1">USD Efectivo</p>
                            </div>
                            <DollarSign className="absolute top-4 right-4 h-10 w-10 text-yellow-500/10"/>
                        </Card>
                    )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-10">
                    <Card className="rounded-[2.5rem] bg-slate-900 border-none shadow-2xl overflow-hidden border border-white/5">
                        <CardHeader className="bg-slate-950 p-6 border-b border-white/5">
                            <CardTitle className="text-[10px] font-black uppercase tracking-widest text-white/40 italic">I. Saldos Iniciales y II. Ingresos</CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Table>
                                <TableBody>
                                    <TableRow className="bg-white/5 border-b border-white/5"><TableCell className="font-black text-white text-[10px] uppercase italic px-8 py-4">Banco de Venezuela (Saldo Inicial)</TableCell><TableCell className="p-2"><Input type="number" className="text-right bg-slate-950 font-black h-10 border-none italic" value={saldoInicBDV} onChange={e=>setSaldoInicBDV(Number(e.target.value))}/></TableCell></TableRow>
                                    <TableRow className="bg-white/5 border-b border-white/5"><TableCell className="font-black text-white text-[10px] uppercase italic px-8 py-4">Caja Principal (Saldo Inicial)</TableCell><TableCell className="p-2"><Input type="number" className="text-right bg-slate-950 font-black h-10 border-none italic" value={saldoInicCaja} onChange={e=>setSaldoInicCaja(Number(e.target.value))}/></TableCell></TableRow>
                                    <TableRow className="bg-white/5 border-b border-white/5"><TableCell className="font-black text-white text-[10px] uppercase italic px-8 py-4">Caja Chica (Fondo Inicial)</TableCell><TableCell className="p-2"><Input type="number" className="text-right bg-slate-950 font-black h-10 border-none italic" value={saldoInicChica} onChange={e=>setSaldoInicChica(Number(e.target.value))}/></TableCell></TableRow>
                                    <TableRow className="bg-yellow-500/5 border-b border-white/5"><TableCell className="font-black text-yellow-500 text-[10px] uppercase italic px-8 py-4">Cuenta en Dólares (Saldo Inicial USD)</TableCell><TableCell className="p-2"><Input type="number" className="text-right bg-slate-950 font-black h-10 border-none text-yellow-500 italic" value={saldoInicDolares} onChange={e=>setSaldoInicDolares(Number(e.target.value))}/></TableCell></TableRow>
                                    <TableRow className="border-b border-white/5"><TableCell className="text-white/60 text-[10px] font-black uppercase italic px-8 py-4">Ingresos Ordinarios BDV (Mes)</TableCell><TableCell className="text-right font-black italic pr-8">Bs. {formatCurrency(ingresosMesBDV)}</TableCell></TableRow>
                                    <TableRow className="border-b border-white/5"><TableCell className="text-white/60 text-[10px] font-black uppercase italic px-8 py-4">Ingresos Efectivo Caja (Mes)</TableCell><TableCell className="text-right font-black text-emerald-500 italic pr-8">Bs. {formatCurrency(ingresosMesCaja)}</TableCell></TableRow>
                                    <TableRow className="border-b border-white/5 bg-yellow-500/5"><TableCell className="text-yellow-500 text-[10px] font-black uppercase italic px-8 py-4">Ingresos en Dólares USD (Mes)</TableCell><TableCell className="text-right font-black text-yellow-500 italic pr-8">$ {formatUSD(ingresosMesDolares)}</TableCell></TableRow>
                                    <TableRow className="border-none bg-primary/10"><TableCell className="font-black text-primary text-[10px] uppercase italic px-8 py-6">TOTAL DISPONIBILIDAD BRUTA</TableCell><TableCell className="text-right font-black text-white italic pr-8">Bs. {formatCurrency(totalIngresos)} | USD $ {formatUSD(totalIngresosUSD)}</TableCell></TableRow>
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>

                    <Card className="rounded-[2.5rem] bg-slate-900 border-none shadow-2xl overflow-hidden border border-white/5">
                        <CardHeader className="bg-slate-950 p-6 border-b border-white/5">
                            <CardTitle className="text-[10px] font-black uppercase tracking-widest text-white/40 italic">III. Detalle de Egresos del Mes</CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader><TableRow className="bg-slate-950/50 border-white/5"><TableHead className="text-white/40 font-black text-[10px] uppercase px-8 py-4">Fecha</TableHead><TableHead className="text-white/40 font-black text-[10px] uppercase">Concepto</TableHead><TableHead className="text-white/40 font-black text-[10px] uppercase">Cuenta</TableHead><TableHead className="text-right text-white/40 font-black text-[10px] pr-8">Monto</TableHead></TableRow></TableHeader>
                                <TableBody>
                                    {egresosTesorería.map((e, i) => (
                                        <TableRow key={`bs-${i}`} className="border-white/5 hover:bg-white/5">
                                            <TableCell className="py-4 px-8 font-bold text-white/40 text-xs italic">{e.fecha}</TableCell>
                                            <TableCell className="py-4"><div className="text-white font-black uppercase text-[10px] italic">{e.concepto}</div></TableCell>
                                            <TableCell className="py-4"><div className="text-[8px] font-black text-white/20 uppercase">{e.cuenta}</div></TableCell>
                                            <TableCell className="text-right font-black text-red-500 italic pr-8">Bs. {formatCurrency(e.monto)}</TableCell>
                                        </TableRow>
                                    ))}
                                    {egresosDolares.map((e, i) => (
                                        <TableRow key={`usd-${i}`} className="border-white/5 hover:bg-yellow-500/5 bg-yellow-500/5">
                                            <TableCell className="py-4 px-8 font-bold text-yellow-500/60 text-xs italic">{e.fecha}</TableCell>
                                            <TableCell className="py-4"><div className="text-yellow-500 font-black uppercase text-[10px] italic">{e.concepto}</div></TableCell>
                                            <TableCell className="py-4"><div className="text-[8px] font-black text-yellow-500/30 uppercase">{e.cuenta}</div></TableCell>
                                            <TableCell className="text-right font-black text-yellow-500 italic pr-8">$ {formatUSD(e.monto)}</TableCell>
                                        </TableRow>
                                    ))}
                                    {egresosTesorería.length === 0 && egresosDolares.length === 0 && (
                                        <TableRow><TableCell colSpan={4} className="text-center py-8 text-white/30 italic">No hay egresos registrados</TableCell></TableRow>
                                    )}
                                </TableBody>
                                <TableFooter className="bg-red-50/10 border-none">
                                    <TableRow className="border-none">
                                        <TableCell colSpan={3} className="font-black text-red-400 text-[10px] uppercase italic px-8 py-6">Total Egresos</TableCell>
                                        <TableCell className="text-right font-black text-red-500 text-lg italic pr-8">Bs. {formatCurrency(totalEgresos)} | USD $ {formatUSD(totalEgresosUSD)}</TableCell>
                                    </TableRow>
                                </TableFooter>
                            </Table>
                        </CardContent>
                    </Card>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-8">
                    <Card className="rounded-[2.5rem] bg-slate-950 border border-primary/20 shadow-xl overflow-hidden">
                        <CardHeader className="bg-primary/10 p-6 border-b border-white/5">
                            <CardTitle className="text-[10px] font-black uppercase tracking-widest text-primary italic">IV. Saldos Finales al {lastDayOfMonthStr}</CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Table>
                                <TableBody>
                                    <TableRow className="border-b border-white/5"><TableCell className="font-black text-white text-[10px] uppercase italic px-8 py-4">Saldo Final Banco de Venezuela</TableCell><TableCell className="p-2"><Input type="number" className="text-right bg-slate-950 font-black h-10 border-none italic" value={saldoFinBDV} onChange={e=>setSaldoFinBDV(Number(e.target.value))}/></TableCell></TableRow>
                                    <TableRow className="border-b border-white/5"><TableCell className="font-black text-white text-[10px] uppercase italic px-8 py-4">Saldo Final Caja Principal</TableCell><TableCell className="p-2"><Input type="number" className="text-right bg-slate-950 font-black h-10 border-none italic" value={saldoFinCaja} onChange={e=>setSaldoFinCaja(Number(e.target.value))}/></TableCell></TableRow>
                                    <TableRow className="border-b border-white/5"><TableCell className="font-black text-white text-[10px] uppercase italic px-8 py-4">Saldo Final Caja Chica</TableCell><TableCell className="p-2"><Input type="number" className="text-right bg-slate-950 font-black h-10 border-none italic" value={saldoFinChica} onChange={e=>setSaldoFinChica(Number(e.target.value))}/></TableCell></TableRow>
                                    <TableRow className="border-b border-yellow-500/20 bg-yellow-500/5"><TableCell className="font-black text-yellow-500 text-[10px] uppercase italic px-8 py-4">Saldo Final Cuenta en Dólares (USD)</TableCell><TableCell className="p-2"><Input type="number" className="text-right bg-slate-950 font-black h-10 border-none text-yellow-500 italic" value={saldoFinDolares} onChange={e=>setSaldoFinDolares(Number(e.target.value))}/></TableCell></TableRow>
                                    <TableRow className="bg-primary/20 border-none"><TableCell className="font-black text-primary text-[10px] uppercase italic px-8 py-6">DISPONIBILIDAD DE TESORERÍA</TableCell><TableCell className="text-right font-black text-white text-xl italic pr-8">Bs. {formatCurrency(totalDisponible)} | USD $ {formatUSD(totalDisponibleUSD)}</TableCell></TableRow>
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>

                    <Card className="rounded-[2rem] bg-slate-950 border border-emerald-500/20 shadow-xl flex items-center justify-center">
                        <CardContent className="p-8 flex flex-col items-center text-center gap-4">
                            <div className="p-4 bg-emerald-500/10 rounded-2xl"><CalendarClock className="h-10 w-10 text-emerald-500" /></div>
                            <div>
                                <p className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.3em]">Total Disponible ({selectedMonth}/{selectedYear})</p>
                                <h3 className="text-4xl font-black italic text-white tracking-tighter mt-1">Bs. {formatCurrency(totalDisponible)}</h3>
                                {totalDisponibleUSD > 0 && (
                                    <h3 className="text-2xl font-black italic text-yellow-500 tracking-tighter mt-1">$ {formatUSD(totalDisponibleUSD)} USD</h3>
                                )}
                                <p className="text-[9px] font-bold text-slate-500 uppercase mt-2 italic">Diferencia neta entre ingresos totales y egresos totales</p>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <div className="pt-10"><Label className="text-[10px] font-black uppercase text-white/40 ml-4 italic">Notas y Observaciones del Balance</Label><Textarea className="rounded-[2rem] bg-slate-900 border-white/5 text-white font-bold p-6 min-h-[120px] shadow-2xl italic mt-2 uppercase text-xs focus-visible:ring-primary" value={notas} onChange={e => setNotas(e.target.value)} placeholder="Escriba aquí los detalles relevantes..." /></div>
            </> }
        </div>
    );
}