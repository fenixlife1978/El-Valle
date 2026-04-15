'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Loader2, ArrowLeft, Download, Eye, Home, Heart, ShieldCheck, Users, FileText, AlertCircle } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { format } from 'date-fns';
import { downloadPDF } from '@/lib/print-pdf';

const plantillasInfo: Record<string, { nombre: string, icono: any, campos: string[] }> = {
    residencia: { nombre: 'Constancia de Residencia', icono: Home, campos: ['tiempo_residencia'] },
    concubinato: { nombre: 'Constancia de Concubinato', icono: Heart, campos: ['pareja_nombre', 'pareja_cedula', 'tiempo_convivencia'] },
    buena_conducta: { nombre: 'Constancia de Buena Conducta', icono: ShieldCheck, campos: [] },
    solteria: { nombre: 'Constancia de Soltería', icono: Users, campos: [] },
};

export default function GenerarConstanciaPage() {
    const params = useParams();
    const router = useRouter();
    const tipo = params?.tipo as string;
    const condoId = params?.condoId as string;
    const { user, ownerData, loading: authLoading } = useAuth();
    
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [preview, setPreview] = useState(false);
    const [ownerProperties, setOwnerProperties] = useState<any[]>([]);
    const [formData, setFormData] = useState<Record<string, string>>({});
    const [companyInfo, setCompanyInfo] = useState<any>(null);
    const [plantillaContenido, setPlantillaContenido] = useState<string>('');
    const [headerConfig, setHeaderConfig] = useState<any>(null);
    const [footerConfig, setFooterConfig] = useState<any>(null);

    const info = plantillasInfo[tipo];
    const Icon = info?.icono || FileText;

    useEffect(() => {
        if (authLoading) return;
        
        const fetchData = async () => {
            if (!user?.uid || !condoId || !tipo) return;
            
            try {
                const ownersCollection = condoId === 'condo_01' ? 'owners' : 'propietarios';
                const ownerRef = doc(db, 'condominios', condoId, ownersCollection, user.uid);
                const ownerSnap = await getDoc(ownerRef);
                
                if (ownerSnap.exists()) {
                    const data = ownerSnap.data();
                    setOwnerProperties(data.properties || []);
                }
                
                const settingsRef = doc(db, 'condominios', condoId, 'config', 'mainSettings');
                const settingsSnap = await getDoc(settingsRef);
                if (settingsSnap.exists()) {
                    setCompanyInfo(settingsSnap.data().companyInfo);
                }
                
                // Cargar configuración de encabezado
                const configRef = doc(db, 'condominios', condoId, 'config', 'certificate_config');
                const configSnap = await getDoc(configRef);
                if (configSnap.exists()) {
                    setHeaderConfig(configSnap.data().header);
                    setFooterConfig(configSnap.data().footer);
                }
                
                // Cargar plantilla desde Firestore
                const templatesRef = doc(db, 'condominios', condoId, 'config', 'certificate_templates');
                const templatesSnap = await getDoc(templatesRef);
                if (templatesSnap.exists()) {
                    const templateData = templatesSnap.data()[tipo];
                    if (templateData && templateData.contenido) {
                        setPlantillaContenido(templateData.contenido);
                    } else {
                        setPlantillaContenido(`<div class="content">
                            <p>Por medio de la presente se hace constar que el ciudadano [NOMBRE_COMPLETO], portador de la cédula [CEDULA], residente de [PROPIEDAD]...</p>
                        </div>`);
                    }
                }
                
            } catch (error) {
                console.error("Error cargando datos:", error);
            } finally {
                setLoading(false);
            }
        };
        
        fetchData();
    }, [user?.uid, condoId, tipo, authLoading]);

    const updateFormData = (field: string, value: string) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const generateHTML = () => {
        const property = ownerProperties[0] || { street: 'Calle', house: 'Casa' };
        const fechaActual = new Date();
        const dia = fechaActual.getDate();
        const mes = fechaActual.toLocaleString('es', { month: 'long' });
        const año = fechaActual.getFullYear();
        const nombreCompleto = ownerData?.name || '';
        const cedula = ownerData?.cedula || user?.email?.split('@')[0] || '';
        const nombreCondominio = headerConfig?.title || companyInfo?.nombre || companyInfo?.name || 'CONDOMINIO';
        
        // Construir el HTML del encabezado según configuración
        let logoHTML = '';
        if (headerConfig?.logo && headerConfig?.logoPosition !== 'hidden') {
            logoHTML = `<div class="logo-container" style="text-align: ${headerConfig.logoPosition === 'left' ? 'left' : headerConfig.logoPosition === 'center' ? 'center' : 'right'}">
                <img src="${headerConfig.logo}" class="logo" style="max-height: 60px; width: auto;" />
            </div>`;
        }
        
        let contenido = plantillaContenido
            .replace(/\[NOMBRE_COMPLETO\]/g, nombreCompleto)
            .replace(/\[CEDULA\]/g, cedula)
            .replace(/\[PROPIEDAD\]/g, `${property.street} - Casa ${property.house}`)
            .replace(/\[DIA\]/g, dia.toString())
            .replace(/\[MES\]/g, mes.charAt(0).toUpperCase() + mes.slice(1))
            .replace(/\[AÑO\]/g, año.toString())
            .replace(/\[NOMBRE_CONDOMINIO\]/g, nombreCondominio)
            .replace(/\[TIEMPO_RESIDENCIA\]/g, formData.tiempo_residencia || '_________________')
            .replace(/\[PAREJA_NOMBRE\]/g, formData.pareja_nombre || '_________________')
            .replace(/\[PAREJA_CEDULA\]/g, formData.pareja_cedula || '_________________')
            .replace(/\[TIEMPO_CONVIVENCIA\]/g, formData.tiempo_convivencia || '_________________');
        
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>${info.nombre}</title>
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body { font-family: 'Times New Roman', serif; margin: 0; padding: 20px; background: white; }
                    .container { max-width: 800px; margin: 0 auto; background: white; }
                    .header { background: ${headerConfig?.backgroundColor || '#1A1D23'}; color: ${headerConfig?.textColor || '#FFFFFF'}; padding: 20px; text-align: center; ${headerConfig?.showBorder ? `border-bottom: 3px solid ${headerConfig?.borderColor || '#F28705'};` : ''} }
                    .logo-container { margin-bottom: 10px; }
                    .logo { max-height: 60px; width: auto; }
                    .header-title { font-size: 18px; font-weight: bold; text-transform: uppercase; margin: 5px 0; }
                    .header-subtitle { font-size: 10px; opacity: 0.8; }
                    .content { line-height: 1.8; font-size: 14px; text-align: justify; margin: 30px 0; }
                    .signature { margin-top: 50px; text-align: center; }
                    .signature-line { margin-top: 40px; padding-top: 20px; border-top: 1px solid #000; width: 300px; margin-left: auto; margin-right: auto; }
                    .footer { margin-top: 30px; text-align: center; font-size: 8px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 15px; }
                    .stamp-warning { margin-top: 5px; font-size: 7px; color: #ef4444; font-weight: bold; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        ${logoHTML}
                        <div class="header-title">${nombreCondominio}</div>
                        ${headerConfig?.subtitle ? `<div class="header-subtitle">${headerConfig.subtitle}</div>` : ''}
                    </div>
                    <h1 style="text-align: center; font-size: 20px; margin: 20px 0; text-transform: uppercase;">${info.nombre}</h1>
                    ${contenido}
                    <div class="footer">
                        <p>${footerConfig?.text || 'Documento generado electrónicamente por EFASCondoSys - Sistema de Autogestión de Condominios'}</p>
                        ${footerConfig?.showStampWarning !== false ? '<p class="stamp-warning">⚠️ Debe ser presentado ante la Junta de Condominio para su estampado de sello y firma oficial.</p>' : ''}
                    </div>
                </div>
            </body>
            </html>
        `;
    };

    const handleDownload = async () => {
        setGenerating(true);
        try {
            const html = generateHTML();
            const fileName = `${info.nombre.replace(/ /g, '_')}_${format(new Date(), 'yyyy_MM_dd')}.pdf`;
            await downloadPDF(html, fileName);
        } catch (error) {
            console.error("Error generando PDF:", error);
        } finally {
            setGenerating(false);
        }
    };

    if (authLoading || loading) {
        return (
            <div className="flex flex-col justify-center items-center p-20 space-y-4 bg-[#1A1D23] min-h-screen">
                <Loader2 className="animate-spin h-10 w-10 text-primary" />
                <p className="text-[10px] font-black uppercase tracking-widest text-white/40 animate-pulse italic">Cargando...</p>
            </div>
        );
    }

    if (!info) {
        return (
            <div className="flex flex-col justify-center items-center p-20 space-y-4 bg-[#1A1D23] min-h-screen">
                <AlertCircle className="h-16 w-16 text-red-500" />
                <p className="text-white font-black uppercase text-sm">Tipo de constancia no válido</p>
                <Button onClick={() => router.back()} className="rounded-xl bg-primary text-slate-900 font-black uppercase text-[10px]">
                    Volver
                </Button>
            </div>
        );
    }

    const property = ownerProperties[0] || { street: 'Calle', house: 'Casa' };
    const nombreCompleto = ownerData?.name || '';
    const cedula = ownerData?.cedula || user?.email?.split('@')[0] || '';

    return (
        <div className="space-y-10 animate-in fade-in duration-700 font-montserrat italic bg-[#1A1D23] min-h-screen p-4 md:p-8 text-white">
            <div className="mb-6">
                <div className="flex items-center gap-4">
                    <Button 
                        variant="ghost" 
                        onClick={() => router.back()} 
                        className="rounded-xl bg-white/5 hover:bg-white/10 text-white font-black uppercase text-[10px] h-10 px-4"
                    >
                        <ArrowLeft className="mr-2 h-4 w-4" /> Volver
                    </Button>
                    <div>
                        <h2 className="text-4xl font-black text-white uppercase tracking-tighter italic drop-shadow-sm">
                            {info.nombre}
                        </h2>
                        <div className="h-1.5 w-20 bg-primary mt-2 rounded-full"></div>
                    </div>
                </div>
            </div>

            {!preview ? (
                <Card className="rounded-[2.5rem] border-none shadow-2xl bg-slate-900 overflow-hidden border border-white/5">
                    <CardHeader className="bg-gradient-to-r from-white/5 to-transparent p-6 border-b border-white/5">
                        <CardTitle className="text-white font-black uppercase italic text-lg tracking-tighter flex items-center gap-2">
                            <Icon className="h-5 w-5 text-primary" /> Datos para la Constancia
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-6 space-y-6">
                        <div className="grid grid-cols-1 gap-4">
                            <div className="bg-white/5 p-4 rounded-xl">
                                <p className="text-[8px] font-black uppercase text-slate-500">Nombre Completo</p>
                                <p className="font-black text-white text-sm">{nombreCompleto}</p>
                            </div>
                            <div className="bg-white/5 p-4 rounded-xl">
                                <p className="text-[8px] font-black uppercase text-slate-500">Cédula de Identidad</p>
                                <p className="font-black text-white text-sm">{cedula}</p>
                            </div>
                            <div className="bg-white/5 p-4 rounded-xl">
                                <p className="text-[8px] font-black uppercase text-slate-500">Propiedad</p>
                                <p className="font-black text-white text-sm">{property.street} - Casa {property.house}</p>
                            </div>
                        </div>

                        {info.campos.includes('pareja_nombre') && (
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase text-slate-500">Nombre de la Pareja</Label>
                                <Input 
                                    placeholder="Nombre completo" 
                                    value={formData.pareja_nombre || ''}
                                    onChange={(e) => updateFormData('pareja_nombre', e.target.value)}
                                    className="rounded-xl bg-slate-800 border-none text-white font-black uppercase"
                                />
                            </div>
                        )}

                        {info.campos.includes('pareja_cedula') && (
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase text-slate-500">Cédula de la Pareja</Label>
                                <Input 
                                    placeholder="V-12345678" 
                                    value={formData.pareja_cedula || ''}
                                    onChange={(e) => updateFormData('pareja_cedula', e.target.value)}
                                    className="rounded-xl bg-slate-800 border-none text-white font-black"
                                />
                            </div>
                        )}

                        {info.campos.includes('tiempo_convivencia') && (
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase text-slate-500">Tiempo de Convivencia</Label>
                                <Input 
                                    placeholder="Ej: 3 años" 
                                    value={formData.tiempo_convivencia || ''}
                                    onChange={(e) => updateFormData('tiempo_convivencia', e.target.value)}
                                    className="rounded-xl bg-slate-800 border-none text-white font-black"
                                />
                            </div>
                        )}

                        {info.campos.includes('tiempo_residencia') && (
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase text-slate-500">Tiempo de Residencia (Opcional)</Label>
                                <Input 
                                    placeholder="Ej: 5 años" 
                                    value={formData.tiempo_residencia || ''}
                                    onChange={(e) => updateFormData('tiempo_residencia', e.target.value)}
                                    className="rounded-xl bg-slate-800 border-none text-white font-black"
                                />
                            </div>
                        )}
                    </CardContent>
                    <CardFooter className="bg-white/5 p-6 border-t border-white/5 flex flex-col sm:flex-row gap-4">
                        <Button 
                            onClick={() => setPreview(true)} 
                            className="flex-1 rounded-xl bg-primary hover:bg-primary/90 text-slate-900 font-black uppercase text-[10px] h-12 italic"
                        >
                            <Eye className="mr-2 h-4 w-4" /> Vista Previa
                        </Button>
                    </CardFooter>
                </Card>
            ) : (
                <Card className="rounded-[2.5rem] border-none shadow-2xl bg-slate-900 overflow-hidden border border-white/5">
                    <CardHeader className="bg-gradient-to-r from-white/5 to-transparent p-6 border-b border-white/5 flex flex-row justify-between items-center">
                        <CardTitle className="text-white font-black uppercase italic text-lg tracking-tighter flex items-center gap-2">
                            <Eye className="h-5 w-5 text-primary" /> Vista Previa
                        </CardTitle>
                        <Button variant="ghost" onClick={() => setPreview(false)} className="rounded-xl font-black uppercase text-[10px] text-white/60 hover:text-white">
                            Editar Datos
                        </Button>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="bg-white p-4 rounded-none">
                            <div dangerouslySetInnerHTML={{ __html: generateHTML() }} />
                        </div>
                    </CardContent>
                    <CardFooter className="bg-white/5 p-6 border-t border-white/5 flex flex-col sm:flex-row gap-4">
                        <Button 
                            onClick={handleDownload} 
                            disabled={generating}
                            className="flex-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase text-[10px] h-12 italic"
                        >
                            {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                            Descargar PDF
                        </Button>
                    </CardFooter>
                </Card>
            )}

            <Card className="rounded-[2rem] border-none shadow-2xl bg-slate-900/50 overflow-hidden border border-white/5">
                <CardContent className="p-6">
                    <div className="flex items-start gap-4">
                        <div className="bg-primary/10 p-2 rounded-xl">
                            <AlertCircle className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                            <p className="text-[10px] font-black uppercase text-primary tracking-widest">Importante</p>
                            <p className="text-[9px] text-white/60 mt-1">
                                Este documento es una constancia preliminar generada electrónicamente. 
                                <strong className="text-white block mt-2">Debes presentar el documento impreso ante la Junta de Condominio para su estampado de sello y firma oficial.</strong>
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
