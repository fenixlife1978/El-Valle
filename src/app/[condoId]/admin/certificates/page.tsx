'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { useToast } from '@/hooks/use-toast';
import { doc, getDoc, setDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Loader2, Save, Eye, Home, Heart, ShieldCheck, Users, FileText, Upload, X, Search, Edit2, User, Download } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useAuthorization } from '@/hooks/use-authorization';
import { compressImage } from '@/lib/utils';
import { format } from 'date-fns';
import { downloadPDF } from '@/lib/print-pdf';

interface Plantilla {
    id: string;
    nombre: string;
    contenido: string;
    icono: string;
}

interface Owner {
    id: string;
    name: string;
    cedula?: string;
    properties: { street: string; house: string }[];
}

const plantillasDisponibles: Plantilla[] = [
    { id: 'residencia', nombre: 'Constancia de Residencia', icono: 'Home', contenido: `<p>Quien suscribe, en mis funciones de Presidente de <strong>[NOMBRE_CONDOMINIO]</strong>, por medio de la presente hace constar que el(la) ciudadano(a): <strong>[NOMBRE_COMPLETO]</strong>, portador(a) de la cédula de identidad N° <strong>[CEDULA]</strong>, reside en este Urbanismo en el inmueble ubicado en; <strong>[PROPIEDAD]</strong>, desde hace aproximadamente <strong>[TIEMPO_RESIDENCIA]</strong>.</p>
<p>&nbsp;</p>
<p>Constancia que se expide en la Ciudad de Independencia, Municipio Independencia, del Estado Yaracuy a los <strong>[DIA]</strong> días del mes de <strong>[MES]</strong> del año <strong>[AÑO]</strong>.</p>` },
    { id: 'solteria', nombre: 'Constancia de Soltería', icono: 'Users', contenido: `<p>Por medio de la presente, la Junta Administradora de Condominio de <strong>[NOMBRE_CONDOMINIO]</strong>, hace constar que el(la) ciudadano(a):</p>
<p>&nbsp;</p>
<p><strong>[NOMBRE_COMPLETO]</strong>, Cédula de Identidad N° <strong>[CEDULA]</strong>,</p>
<p>&nbsp;</p>
<p>Residente en el inmueble ubicado en: <strong>[PROPIEDAD]</strong>, es <strong>SOLTERO(A)</strong> según información suministrada y verificada por esta Junta Administradora.</p>
<p>&nbsp;</p>
<p>Se expide la presente constancia a solicitud de la parte interesada, en el Municipio Independencia del Estado Yaracuy, a los <strong>[DIA]</strong> días del mes de <strong>[MES]</strong> del año <strong>[AÑO]</strong>.</p>` },
    { id: 'buena_conducta', nombre: 'Constancia de Buena Conducta', icono: 'ShieldCheck', contenido: `<p>Quien suscribe, en mis funciones de Presidente de <strong>[NOMBRE_CONDOMINIO]</strong>, por medio de la presente hace constar que el(la) ciudadano(a): <strong>[NOMBRE_COMPLETO]</strong>, portador(a) de la cédula de identidad N° <strong>[CEDULA]</strong>, quien reside en el inmueble identificado con; <strong>[PROPIEDAD]</strong>, ha demostrado una conducta de sana convivencia y respeto, apegado a las normas y leyes de nuestra sociedad.</p>
<p>&nbsp;</p>
<p>Constancia que se expide en la Ciudad de Independencia, Municipio Independencia, del Estado Yaracuy a los <strong>[DIA]</strong> días del mes de <strong>[MES]</strong> del año <strong>[AÑO]</strong>.</p>` },
    { id: 'concubinato', nombre: 'Constancia de Concubinato', icono: 'Heart', contenido: `<p>Nosotros, miembros de la Junta de Condominio de <strong>[NOMBRE_CONDOMINIO]</strong>, por medio de la presente hacemos constar que los ciudadanos:</p>
<p>&nbsp;</p>
<p><strong>[NOMBRE_COMPLETO]</strong>, titular de la cédula de identidad N° <strong>[CEDULA]</strong>, y <strong>[PAREJA_NOMBRE]</strong>, titular de la cédula de identidad N° <strong>[PAREJA_CEDULA]</strong>,</p>
<p>&nbsp;</p>
<p>residen en este conjunto residencial y mantienen una relación de concubinato, conviviendo de manera estable, pública y notoria en el inmueble ubicado en <strong>[PROPIEDAD]</strong>, desde hace aproximadamente <strong>[TIEMPO_CONVIVENCIA]</strong>.</p>
<p>&nbsp;</p>
<p>Esta constancia se expide a solicitud de los interesados, en el <strong>[NOMBRE_CONDOMINIO]</strong>, a los <strong>[DIA]</strong> días del mes de <strong>[MES]</strong> del año <strong>[AÑO]</strong>, para los fines legales y administrativos que les sean convenientes.</p>` },
];

const getIcon = (iconName: string) => {
    switch (iconName) {
        case 'Home': return <Home className="h-5 w-5" />;
        case 'Heart': return <Heart className="h-5 w-5" />;
        case 'ShieldCheck': return <ShieldCheck className="h-5 w-5" />;
        case 'Users': return <Users className="h-5 w-5" />;
        default: return <FileText className="h-5 w-5" />;
    }
};

export default function CertificatesPage() {
    const params = useParams();
    const condoId = params?.condoId as string;
    const { toast } = useToast();
    const { requestAuthorization } = useAuthorization();
    const { companyInfo } = useAuth();

    const [owners, setOwners] = useState<Owner[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedPlantilla, setSelectedPlantilla] = useState<Plantilla | null>(null);
    const [selectedOwner, setSelectedOwner] = useState<Owner | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [showResults, setShowResults] = useState(false);
    const [manualMode, setManualMode] = useState(false);
    const [formData, setFormData] = useState({
        nombreCompleto: '',
        cedula: '',
        propiedad: '',
        tiempoResidencia: '',
        parejaNombre: '',
        parejaCedula: '',
        tiempoConvivencia: ''
    });
    const [preview, setPreview] = useState(false);
    const [generating, setGenerating] = useState(false);
    
    const [headerConfig, setHeaderConfig] = useState({
        title: '',
        subtitle: '',
        logo: null as string | null,
        logoSize: 60,
        showBorder: true,
        borderColor: '#F28705'
    });
    const [margins, setMargins] = useState({ top: 25, bottom: 25, left: 20, right: 20 });
    const [footerText, setFooterText] = useState('Documento generado electrónicamente por EFASCondoSys');
    const [showStampWarning, setShowStampWarning] = useState(true);

    useEffect(() => {
        if (!condoId) return;
        const loadData = async () => {
            try {
                const ownersCol = condoId === 'condo_01' ? 'owners' : 'propietarios';
                const q = query(collection(db, 'condominios', condoId, ownersCol), where('role', '==', 'propietario'));
                const snap = await getDocs(q);
                setOwners(snap.docs.map(d => ({ id: d.id, ...d.data() } as Owner)));
                
                const configRef = doc(db, 'condominios', condoId, 'config', 'certificate_config');
                const configSnap = await getDoc(configRef);
                if (configSnap.exists()) {
                    const data = configSnap.data();
                    if (data.header) setHeaderConfig(prev => ({ ...prev, ...data.header }));
                    if (data.margins) setMargins(data.margins);
                    if (data.footerText) setFooterText(data.footerText);
                    if (data.showStampWarning !== undefined) setShowStampWarning(data.showStampWarning);
                }
            } catch (error) {
                console.error(error);
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, [condoId]);

    const saveConfig = async () => {
        requestAuthorization(async () => {
            try {
                await setDoc(doc(db, 'condominios', condoId, 'config', 'certificate_config'), {
                    header: headerConfig,
                    margins,
                    footerText,
                    showStampWarning,
                    updatedAt: new Date().toISOString()
                }, { merge: true });
                toast({ title: 'Configuración guardada' });
            } catch (error) {
                toast({ variant: 'destructive', title: 'Error al guardar' });
            }
        });
    };

    const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const base64 = await compressImage(file, 200, 200);
            setHeaderConfig(prev => ({ ...prev, logo: base64 }));
            toast({ title: 'Logo cargado' });
        } catch (error) {
            toast({ variant: 'destructive', title: 'Error al cargar logo' });
        }
    };

    const generateHTML = () => {
        if (!selectedPlantilla) return '';
        
        let nombre = '', cedula = '', propiedad = '', tiempoResidencia = '';
        let parejaNombre = '', parejaCedula = '', tiempoConvivencia = '';
        
        if (manualMode) {
            nombre = formData.nombreCompleto;
            cedula = formData.cedula;
            propiedad = formData.propiedad;
            tiempoResidencia = formData.tiempoResidencia;
            parejaNombre = formData.parejaNombre;
            parejaCedula = formData.parejaCedula;
            tiempoConvivencia = formData.tiempoConvivencia;
        } else if (selectedOwner) {
            nombre = selectedOwner.name || '';
            cedula = formData.cedula || selectedOwner.cedula || '';
            const prop = selectedOwner.properties?.[0] || { street: 'Calle', house: 'Casa' };
            propiedad = `${prop.street} - ${prop.house}`;
            tiempoResidencia = formData.tiempoResidencia;
            parejaNombre = formData.parejaNombre;
            parejaCedula = formData.parejaCedula;
            tiempoConvivencia = formData.tiempoConvivencia;
        } else {
            return '';
        }
        
        const fecha = new Date();
        const dia = fecha.getDate();
        const mes = fecha.toLocaleString('es', { month: 'long' });
        const año = fecha.getFullYear();
        const nombreCondominio = headerConfig.title || companyInfo?.nombre || companyInfo?.name || 'CONDOMINIO';
        const numeroConstancia = `CERT-${selectedPlantilla.id.toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
        
        let logoHtml = '';
        if (headerConfig.logo) {
            logoHtml = `<div style="text-align: center; margin-bottom: 10px;"><img src="${headerConfig.logo}" style="max-height: ${headerConfig.logoSize}px; width: auto;" /></div>`;
        }
        
        let contenido = selectedPlantilla.contenido
            .replace(/\[NOMBRE_COMPLETO\]/g, nombre)
            .replace(/\[CEDULA\]/g, cedula)
            .replace(/\[PROPIEDAD\]/g, propiedad)
            .replace(/\[TIEMPO_RESIDENCIA\]/g, tiempoResidencia || '_______')
            .replace(/\[PAREJA_NOMBRE\]/g, parejaNombre || '_______')
            .replace(/\[PAREJA_CEDULA\]/g, parejaCedula || '_______')
            .replace(/\[TIEMPO_CONVIVENCIA\]/g, tiempoConvivencia || '_______')
            .replace(/\[DIA\]/g, dia.toString())
            .replace(/\[MES\]/g, mes.charAt(0).toUpperCase() + mes.slice(1))
            .replace(/\[AÑO\]/g, año.toString())
            .replace(/\[NOMBRE_CONDOMINIO\]/g, nombreCondominio);
        
        return `<!DOCTYPE html>
        <html>
        <head><meta charset="UTF-8"><title>${selectedPlantilla.nombre}</title>
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            @page { margin: ${margins.top}mm ${margins.right}mm ${margins.bottom}mm ${margins.left}mm; }
            body { font-family: 'Times New Roman', Times, serif; background: white; font-size: 12pt; line-height: 1.5; }
            .header { text-align: center; margin-bottom: 20px; padding-bottom: 10px; ${headerConfig.showBorder ? `border-bottom: 3px solid ${headerConfig.borderColor};` : ''} }
            .header-title { font-size: 16pt; font-weight: bold; text-transform: uppercase; }
            .header-subtitle { font-size: 10pt; color: #555; margin-top: 5px; }
            h1 { text-align: center; font-size: 18pt; font-weight: bold; text-transform: uppercase; margin: 40px 0 30px 0; letter-spacing: 2px; }
            .content { text-align: justify; }
            .content p { margin-bottom: 16px; }
            .signature { margin-top: 60px; text-align: center; }
            .signature-line { width: 250px; margin: 20px auto 10px auto; border-top: 1px solid #000; }
            .footer { margin-top: 20px; text-align: center; font-size: 8pt; color: #666; border-top: 1px solid #ccc; padding-top: 10px; }
            .warning { margin-top: 5px; font-size: 7pt; color: #c00; font-weight: bold; }
            .barcode-container { text-align: center; margin-top: 15px; padding-bottom: 10px; }
            .barcode-container svg { display: block; margin: 0 auto; max-width: 180px; height: 45px; }
            .barcode-number { font-size: 7pt; font-family: 'Courier New', monospace; margin-top: 4px; color: #555; }
        </style>
        </head>
        <body>
            <div class="header">
                ${logoHtml}
                <div class="header-title">${nombreCondominio}</div>
                ${headerConfig.subtitle ? `<div class="header-subtitle">${headerConfig.subtitle}</div>` : ''}
            </div>
            <h1>${selectedPlantilla.nombre}</h1>
            <div class="content">${contenido}</div>
            <div class="signature">
                <div class="signature-line"></div>
                <p><strong>Por: ${nombreCondominio}</strong></p>
            </div>
            <div class="footer">
                <p>${footerText}</p>
                ${showStampWarning ? `<p class="warning">⚠️ Debe ser presentado ante la Junta de Condominio para su estampado de sello y firma oficial.</p>` : ''}
            </div>
            <div class="barcode-container">
                <svg id="barcode-${numeroConstancia}"></svg>
                <div class="barcode-number">N° ${numeroConstancia}</div>
            </div>
            <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"></script>
            <script>
                try {
                    JsBarcode("#barcode-${numeroConstancia}", "${numeroConstancia}", {
                        format: "CODE128",
                        width: 2,
                        height: 40,
                        displayValue: false,
                        margin: 0
                    });
                } catch(e) {}
            </script>
        </body>
        </html>`;
    };

    const handleDownload = async () => {
        if (!selectedPlantilla || (!manualMode && !selectedOwner) || (manualMode && !formData.nombreCompleto)) {
            toast({ variant: 'destructive', title: 'Error', description: 'Complete todos los datos requeridos' });
            return;
        }
        setGenerating(true);
        try {
            const html = generateHTML();
            const nombreArchivo = manualMode ? formData.nombreCompleto : selectedOwner?.name;
            await downloadPDF(html, `${selectedPlantilla.nombre.replace(/ /g, '_')}_${nombreArchivo?.replace(/ /g, '_')}_${format(new Date(), 'yyyy_MM_dd')}.pdf`);
            toast({ title: 'PDF generado correctamente' });
        } catch (error) {
            toast({ variant: 'destructive', title: 'Error al generar PDF' });
        } finally {
            setGenerating(false);
        }
    };

    const updateForm = (field: string, value: string) => setFormData(prev => ({ ...prev, [field]: value }));

    const filteredOwners = owners.filter(o => o.name?.toLowerCase().includes(searchTerm.toLowerCase()));

    if (loading) return <div className="flex justify-center items-center p-20 bg-[#1A1D23] min-h-screen"><Loader2 className="animate-spin h-10 w-10 text-primary" /></div>;

    return (
        <div className="space-y-6 p-4 md:p-8 bg-[#1A1D23] min-h-screen">
            <div className="mb-6">
                <h2 className="text-4xl font-black text-white uppercase tracking-tighter italic drop-shadow-sm">
                    Constancias y <span className="text-primary">Certificados</span>
                </h2>
                <div className="h-1.5 w-20 bg-primary mt-2 rounded-full"></div>
            </div>

            <Tabs defaultValue="generar" className="w-full">
                <TabsList className="grid w-full grid-cols-3 h-12 bg-slate-800/50 p-1 rounded-2xl">
                    <TabsTrigger value="generar" className="rounded-xl font-black uppercase text-[10px]">Generar</TabsTrigger>
                    <TabsTrigger value="plantillas" className="rounded-xl font-black uppercase text-[10px]">Plantillas</TabsTrigger>
                    <TabsTrigger value="config" className="rounded-xl font-black uppercase text-[10px]">Configuración</TabsTrigger>
                </TabsList>

                <TabsContent value="generar" className="mt-6">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="space-y-6">
                            <Card className="rounded-[2rem] border-none bg-slate-900">
                                <CardHeader><CardTitle className="text-white font-black text-lg">1. Seleccionar Plantilla</CardTitle></CardHeader>
                                <CardContent>
                                    <div className="grid grid-cols-2 gap-3">
                                        {plantillasDisponibles.map(p => (
                                            <Button key={p.id} variant={selectedPlantilla?.id === p.id ? 'default' : 'outline'} onClick={() => setSelectedPlantilla(p)} className="rounded-xl h-16 flex flex-col gap-1">
                                                {getIcon(p.icono)}<span className="text-[9px] font-black uppercase">{p.nombre}</span>
                                            </Button>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="rounded-[2rem] border-none bg-slate-900">
                                <CardHeader className="flex flex-row justify-between items-center">
                                    <CardTitle className="text-white font-black text-lg">2. Datos del Beneficiario</CardTitle>
                                    <div className="flex items-center gap-2"><span className="text-[8px] text-white/40">Modo manual</span><Switch checked={manualMode} onCheckedChange={setManualMode} /></div>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    {!manualMode ? (
                                        <div className="relative">
                                            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                                            <Input placeholder="Buscar propietario..." value={searchTerm} onChange={e => { setSearchTerm(e.target.value); setShowResults(true); }} className="pl-9 rounded-xl bg-slate-800 border-none text-white" />
                                            {showResults && searchTerm.length >= 2 && filteredOwners.length > 0 && (
                                                <div className="absolute z-50 w-full mt-1 bg-slate-800 border border-white/10 rounded-xl max-h-48 overflow-auto">
                                                    {filteredOwners.map(o => (
                                                        <div key={o.id} onClick={() => { setSelectedOwner(o); setSearchTerm(''); setShowResults(false); }} className="p-3 hover:bg-white/10 cursor-pointer">
                                                            <p className="font-black text-white text-sm">{o.name}</p>
                                                            <p className="text-[9px] text-white/40">{o.properties?.map(p => `${p.street} - ${p.house}`).join(', ')}</p>
                                                            <p className="text-[9px] text-white/40">Cédula: {o.cedula || 'No registrada'}</p>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <>
                                            <Input placeholder="Nombre completo" value={formData.nombreCompleto} onChange={e => updateForm('nombreCompleto', e.target.value)} className="rounded-xl bg-slate-800 border-none text-white" />
                                            <Input placeholder="Cédula de identidad (ej: V-12345678)" value={formData.cedula} onChange={e => updateForm('cedula', e.target.value)} className="rounded-xl bg-slate-800 border-none text-white" />
                                            <Input placeholder="Propiedad (Calle y Casa)" value={formData.propiedad} onChange={e => updateForm('propiedad', e.target.value)} className="rounded-xl bg-slate-800 border-none text-white" />
                                        </>
                                    )}
                                    
                                    {selectedOwner && !manualMode && (
                                        <div className="mt-2 p-3 bg-slate-800/50 rounded-xl">
                                            <p className="text-[10px] text-white/60">Cédula (editable):</p>
                                            <Input value={formData.cedula} onChange={e => updateForm('cedula', e.target.value)} placeholder="Ingresar cédula" className="mt-1 rounded-xl bg-slate-800 border-none text-white" />
                                        </div>
                                    )}
                                    
                                    {selectedPlantilla?.id === 'residencia' && (
                                        <Input placeholder="Tiempo de residencia (ej: 5 años)" value={formData.tiempoResidencia} onChange={e => updateForm('tiempoResidencia', e.target.value)} className="rounded-xl bg-slate-800 border-none text-white" />
                                    )}
                                    {selectedPlantilla?.id === 'concubinato' && (
                                        <>
                                            <Input placeholder="Nombre de la pareja" value={formData.parejaNombre} onChange={e => updateForm('parejaNombre', e.target.value)} className="rounded-xl bg-slate-800 border-none text-white" />
                                            <Input placeholder="Cédula de la pareja" value={formData.parejaCedula} onChange={e => updateForm('parejaCedula', e.target.value)} className="rounded-xl bg-slate-800 border-none text-white" />
                                            <Input placeholder="Tiempo de convivencia" value={formData.tiempoConvivencia} onChange={e => updateForm('tiempoConvivencia', e.target.value)} className="rounded-xl bg-slate-800 border-none text-white" />
                                        </>
                                    )}
                                </CardContent>
                            </Card>

                            <Button onClick={() => setPreview(true)} disabled={!selectedPlantilla || (!manualMode && !selectedOwner) || (manualMode && !formData.nombreCompleto)} className="w-full rounded-xl bg-primary text-slate-900 font-black h-12">
                                <Eye className="mr-2 h-4 w-4" /> Vista Previa
                            </Button>
                        </div>

                        <div>
                            {preview && selectedPlantilla && (
                                <Card className="rounded-[2rem] border-none bg-slate-900 sticky top-4">
                                    <CardHeader className="flex flex-row justify-between items-center">
                                        <CardTitle className="text-white font-black text-lg">Vista Previa</CardTitle>
                                        <Button variant="ghost" onClick={() => setPreview(false)} className="text-white/60">Editar</Button>
                                    </CardHeader>
                                    <CardContent className="p-0">
                                        <div className="bg-white p-6 rounded-b-[2rem] max-h-[70vh] overflow-auto">
                                            <div dangerouslySetInnerHTML={{ __html: generateHTML() }} />
                                        </div>
                                    </CardContent>
                                    <CardFooter className="p-4">
                                        <Button onClick={handleDownload} disabled={generating} className="w-full rounded-xl bg-emerald-600 text-white font-black h-12">
                                            {generating ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : <Download className="mr-2 h-4 w-4" />} Descargar PDF
                                        </Button>
                                    </CardFooter>
                                </Card>
                            )}
                        </div>
                    </div>
                </TabsContent>

                <TabsContent value="plantillas" className="mt-6">
                    <Card className="rounded-[2rem] border-none bg-slate-900">
                        <CardHeader><CardTitle className="text-white font-black text-lg">Editar Plantillas</CardTitle></CardHeader>
                        <CardContent>
                            <div className="space-y-6">
                                {plantillasDisponibles.map(p => (
                                    <div key={p.id} className="border border-white/10 rounded-xl p-4">
                                        <h3 className="font-black text-white text-sm mb-2">{p.nombre}</h3>
                                        <textarea value={p.contenido} onChange={e => p.contenido = e.target.value} className="w-full h-48 rounded-xl bg-slate-800 border-none text-white text-sm p-3 font-mono" />
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                        <CardFooter><Button onClick={() => toast({ title: 'Plantillas guardadas' })} className="rounded-xl bg-primary text-slate-900 font-black">Guardar Plantillas</Button></CardFooter>
                    </Card>
                </TabsContent>

                <TabsContent value="config" className="mt-6">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <Card className="rounded-[2rem] border-none bg-slate-900">
                            <CardHeader><CardTitle className="text-white font-black text-lg">Encabezado</CardTitle></CardHeader>
                            <CardContent className="space-y-4">
                                <Input placeholder="Título del condominio" value={headerConfig.title} onChange={e => setHeaderConfig(prev => ({ ...prev, title: e.target.value }))} className="rounded-xl bg-slate-800 border-none text-white" />
                                <Input placeholder="Subtítulo (ej: RIF: ...)" value={headerConfig.subtitle} onChange={e => setHeaderConfig(prev => ({ ...prev, subtitle: e.target.value }))} className="rounded-xl bg-slate-800 border-none text-white" />
                                <div className="flex items-center gap-4">
                                    <Button onClick={() => document.getElementById('logo-upload')?.click()} variant="outline" className="rounded-xl">Subir Logo</Button>
                                    <input id="logo-upload" type="file" className="hidden" accept="image/*" onChange={handleLogoUpload} />
                                    {headerConfig.logo && <Button variant="ghost" onClick={() => setHeaderConfig(prev => ({ ...prev, logo: null }))} className="text-red-500">Eliminar Logo</Button>}
                                </div>
                                {headerConfig.logo && (
                                    <div><Label className="text-white/60 text-[10px]">Tamaño del logo ({headerConfig.logoSize}px)</Label><Slider value={[headerConfig.logoSize]} onValueChange={v => setHeaderConfig(prev => ({ ...prev, logoSize: v[0] }))} min={30} max={120} step={5} /></div>
                                )}
                                <div className="flex items-center justify-between"><Label className="text-white/60 text-[10px]">Mostrar borde inferior</Label><Switch checked={headerConfig.showBorder} onCheckedChange={c => setHeaderConfig(prev => ({ ...prev, showBorder: c }))} /></div>
                                {headerConfig.showBorder && <div><Label className="text-white/60 text-[10px]">Color del borde</Label><Input type="color" value={headerConfig.borderColor} onChange={e => setHeaderConfig(prev => ({ ...prev, borderColor: e.target.value }))} className="h-10 w-24 rounded-xl bg-slate-800" /></div>}
                            </CardContent>
                        </Card>

                        <Card className="rounded-[2rem] border-none bg-slate-900">
                            <CardHeader><CardTitle className="text-white font-black text-lg">Márgenes y Pie</CardTitle></CardHeader>
                            <CardContent className="space-y-4">
                                <div className="grid grid-cols-2 gap-3">
                                    <div><Label className="text-white/60 text-[10px]">Superior (mm)</Label><Input type="number" value={margins.top} onChange={e => setMargins(prev => ({ ...prev, top: parseInt(e.target.value) || 0 }))} className="rounded-xl bg-slate-800 border-none text-white" /></div>
                                    <div><Label className="text-white/60 text-[10px]">Inferior (mm)</Label><Input type="number" value={margins.bottom} onChange={e => setMargins(prev => ({ ...prev, bottom: parseInt(e.target.value) || 0 }))} className="rounded-xl bg-slate-800 border-none text-white" /></div>
                                    <div><Label className="text-white/60 text-[10px]">Izquierdo (mm)</Label><Input type="number" value={margins.left} onChange={e => setMargins(prev => ({ ...prev, left: parseInt(e.target.value) || 0 }))} className="rounded-xl bg-slate-800 border-none text-white" /></div>
                                    <div><Label className="text-white/60 text-[10px]">Derecho (mm)</Label><Input type="number" value={margins.right} onChange={e => setMargins(prev => ({ ...prev, right: parseInt(e.target.value) || 0 }))} className="rounded-xl bg-slate-800 border-none text-white" /></div>
                                </div>
                                <Input placeholder="Texto del pie de página" value={footerText} onChange={e => setFooterText(e.target.value)} className="rounded-xl bg-slate-800 border-none text-white" />
                                <div className="flex items-center justify-between"><Label className="text-white/60 text-[10px]">Mostrar advertencia de sello</Label><Switch checked={showStampWarning} onCheckedChange={setShowStampWarning} /></div>
                                <Button onClick={saveConfig} className="w-full rounded-xl bg-primary text-slate-900 font-black h-12"><Save className="mr-2 h-4 w-4" /> Guardar Configuración</Button>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
}