
'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { collection, onSnapshot, addDoc, doc, getDoc, orderBy, serverTimestamp, Timestamp, deleteDoc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { PlusCircle, Trash2, Loader2, Search, XCircle, FileText, Award, User, Home, Info, Stamp, MoreHorizontal, Edit, Power, PowerOff, AlertTriangle, CheckCircle2, Wand2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { ScrollArea } from '@/components/ui/scroll-area';
import jsPDF from 'jspdf';
import QRCode from 'qrcode';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useAuthorization } from '@/hooks/use-authorization';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

// --- Type Definitions ---
type AdminProfile = {
    name: string;
    email: string;
    avatar: string;
};

type CompanyInfo = {
    name: string;
    address: string;
    rif: string;
    phone: string;
    email: string;
    logo: string;
    bankName: string;
    accountNumber: string;
};

type ExchangeRate = {
    id: string;
    date: string; // Stored as 'yyyy-MM-dd'
    rate: number;
    active: boolean;
};

type LoginSettings = {
  ownerLoginEnabled: boolean;
  disabledMessage: string;
};

type Settings = {
    id?: string;
    adminProfile: AdminProfile;
    companyInfo: CompanyInfo;
    condoFee: number;
    exchangeRates: ExchangeRate[];
    bcvLogo?: string;
    loginSettings: LoginSettings;
};

// --- Default / Empty States ---

const emptyAdminProfile: AdminProfile = {
    name: 'Administrador',
    email: 'admin@example.com',
    avatar: ''
};

const DEFAULT_LOGO_BASE64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAASwAAAEsCAMAAABOo35HAAAC2VBMVEX//////wD//wD/zAAAgAD/AADa3N3/2wAzMzN/f39bW1tra2sAAACmpqaurq6IiIhZWVkzMzMmJiaAgICysrLd3d1AQEBQUFCMjIyVlZVCQkIXFxcZGRkAAAAKCgr/qgBKSkr/tAD/4AD/3AD/zDP/yAD/xwD/vgD/uAD/rgD/ngD/lgD/igD/gAD/ewD/cwD/bAD/ZAD/XwD/VwD/UwD/SwD/QwD/PgD/NAD/MAD/LAD/JQD/HAD/FQD2qAD3kwD4iQD6ggD7fgD8eAD9cwD+bAD/agD/ZwD/XQD/VQD/TQD/RgD/PwD/NgD/MwD/LgD/KgD/JAD/IQD/GQD/EQD/AAD/zGb/0Tr/y1z/x1f/w1P/v0v/ukc/u0b/t0P/skL/rUH/qT//pz7/ojz/nTr/mjj/lTf/kjT/jDL/iDH/hC//fy7+ei39dyz9civ8byf8aSX7XyT7VyP6UyH6SyD5RiD5Qh/4Oh74Nh33Lxr3Khj2IRf2GRP1ExL1DxH0CRD0ABClpz0iFw2gpz4dFABlZgB+fgCLiwCSkgCVlACpqQC1tQDJyQDS0gDY2ADf3wD//wD/ugD/qQD/lQD/gQD/dQD/ZAD/VQD/RgD/MAD/HgAAACIiJR8eHhUUEw4LCwAAAACioqKvr693d3dZWVlMTEw/Pz9EREQkJCQtLS0YGBgeHh4BAQEQEBAMDAwCAgL//+f/+Mv/9LX/7p//6Jf/5I3/4Hv/2XL/0VT/y1D/xUr/w0P/vkH/uUD9tj79rzr9pjj9ojn8mjT8kjD8hjD7gC77cy36ayz6XXf4Xm34Vmj3UWX2S171R1v1PlT0N070METzKxyfnyMeGg17ehxqaxttbRxZWhtJSRgtLQxNTg1BQAplZgCJiQCSkgCgoACysgC+vgDExcDHyMLJycPNzMvPzs3S0tHW1tXX2Nba2tve3t7h4eHj4+Pn5+fo6Ojp6eno6Ojq6urr6+vs7Ozt7e3u7u7v7+/w8PDx8fHy8vLz8/P09PT19fX29vb39/f4+Pj5+fn6+vr7+/v8/Pz9/f3+/v7////MMfXfAAAIUklEQVR42uycW3PbNhCGK1l1wJgY40gCSTokTtN0mhZpY9M0LdM0TdM0TdM0TdM0TdM0TfP/H4lJcOIAARzX29737+zsvS/Jm51Fh8PBYVdGkRE2F35/f19kREmRERaX3W13eBwdxlHkZf+q7O0vF2d2Nkf3/r43XvO21o6V03tW2i1vD6e/nZ/9M1d/s2R7e31d8e1V4XkZ13fX/X1cRgaKjLA4lBEReZ8vsiIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIubankName';

const emptyCompanyInfo: CompanyInfo = {
    name: 'Nombre de la Empresa',
    address: 'Dirección Fiscal de la Empresa',
    rif: 'J-00000000-0',
    phone: '+58 212-555-5555',
    email: 'contacto@empresa.com',
    logo: DEFAULT_LOGO_BASE64,
    bankName: 'Banco Ejemplo',
    accountNumber: '0123-4567-89-0123456789',
};


const emptyCondoFee = {
    amount: 0,
};

export default function AdminSettingsPage() {
    const { toast } = useToast();
    const { requestAuthorization } = useAuthorization();

    const [settings, setSettings] = useState<Settings | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);

    // Rate states
    const [newRate, setNewRate] = useState<number | string>('');
    const [newRateDate, setNewRateDate] = useState<Date | undefined>(new Date());
    const [isAddingRate, setIsAddingRate] = useState(false);
    
    // Auth Key states
    const [authKey, setAuthKey] = useState('');
    const [isKeyEditing, setIsKeyEditing] = useState(false);

    // Login Settings states
    const [loginSettings, setLoginSettings] = useState<LoginSettings>({
      ownerLoginEnabled: true,
      disabledMessage: 'El inicio de sesión ha sido deshabilitado temporalmente por mantenimiento.',
    });
    
    useEffect(() => {
        const settingsRef = doc(db, 'config', 'mainSettings');
        const authKeyRef = doc(db, 'config', 'authorization');

        const unsubSettings = onSnapshot(settingsRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setSettings({
                    id: docSnap.id,
                    companyInfo: { ...emptyCompanyInfo, ...data.companyInfo },
                    condoFee: data.condoFee || 0,
                    exchangeRates: data.exchangeRates || [],
                    bcvLogo: data.bcvLogo || null,
                    loginSettings: { ...loginSettings, ...data.loginSettings },
                    adminProfile: data.adminProfile || emptyAdminProfile,
                });
                setLoginSettings({ ...loginSettings, ...data.loginSettings });
            } else {
                setSettings({
                    id: 'mainSettings',
                    companyInfo: emptyCompanyInfo,
                    condoFee: emptyCondoFee.amount,
                    exchangeRates: [],
                    adminProfile: emptyAdminProfile,
                    loginSettings: loginSettings,
                });
            }
            setLoading(false);
        });

        const unsubAuthKey = onSnapshot(authKeyRef, (docSnap) => {
            if (docSnap.exists()) {
                setAuthKey(docSnap.data().key);
            }
        });

        return () => {
            unsubSettings();
            unsubAuthKey();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>, section: keyof Settings, field: string) => {
        const { value } = e.target;
        if (settings) {
            if (section === 'companyInfo' || section === 'adminProfile') {
                setSettings({
                    ...settings,
                    [section]: {
                        ...settings[section],
                        [field]: value
                    }
                });
            } else if (section === 'loginSettings') {
                setLoginSettings(prev => ({ ...prev, [field]: value }));
            }
            else {
                setSettings({
                    ...settings,
                    [field]: value
                });
            }
        }
    };
    
    const handleLoginSettingsChange = (checked: boolean) => {
        setLoginSettings(prev => ({...prev, ownerLoginEnabled: checked}));
    };

    const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>, section: 'companyInfo' | 'adminProfile') => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploading(true);
        try {
            // Simple Base64 conversion for client-side preview and saving
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onloadend = () => {
                const base64data = reader.result as string;
                 if (settings) {
                    if (section === 'companyInfo' || section === 'adminProfile') {
                        setSettings({
                            ...settings,
                            [section]: {
                                ...settings[section],
                                logo: base64data,
                            }
                        });
                    }
                }
                setUploading(false);
                toast({ title: "Imagen lista", description: "La imagen se ha cargado. Haga clic en Guardar para aplicar los cambios." });
            }
        } catch (error) {
            console.error("Error uploading image:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo subir la imagen.' });
            setUploading(false);
        }
    };

    const handleSaveChanges = () => {
        if (!settings) return;

        requestAuthorization(async () => {
            setSaving(true);
            try {
                const settingsRef = doc(db, 'config', 'mainSettings');
                const { id, ...dataToSave } = settings;
                
                 // Aplanar el objeto para la actualización de Firestore
                const flatData = {
                    'companyInfo.name': dataToSave.companyInfo.name,
                    'companyInfo.address': dataToSave.companyInfo.address,
                    'companyInfo.rif': dataToSave.companyInfo.rif,
                    'companyInfo.phone': dataToSave.companyInfo.phone,
                    'companyInfo.email': dataToSave.companyInfo.email,
                    'companyInfo.logo': dataToSave.companyInfo.logo,
                    'companyInfo.bankName': dataToSave.companyInfo.bankName,
                    'companyInfo.accountNumber': dataToSave.companyInfo.accountNumber,
                    'condoFee': Number(dataToSave.condoFee),
                    'loginSettings.ownerLoginEnabled': loginSettings.ownerLoginEnabled,
                    'loginSettings.disabledMessage': loginSettings.disabledMessage
                };

                await updateDoc(settingsRef, flatData);
                
                toast({
                    title: '¡Éxito!',
                    description: 'La configuración ha sido guardada correctamente.',
                    className: 'bg-green-100 text-green-800'
                });
            } catch (error: any) {
                console.error("Error saving settings:", error);
                toast({ variant: 'destructive', title: 'Error', description: `No se pudieron guardar los cambios: ${error.message}` });
            } finally {
                setSaving(false);
            }
        });
    };

    const handleAddRate = () => {
        if (!newRate || !newRateDate) {
            toast({ variant: 'destructive', title: 'Datos incompletos', description: 'Debe ingresar una tasa y una fecha.' });
            return;
        }

        requestAuthorization(async () => {
            setIsAddingRate(true);
            try {
                const settingsRef = doc(db, 'config', 'mainSettings');
                const rateId = `rate-${newRateDate.getTime()}`;
                
                const newRateEntry: ExchangeRate = {
                    id: rateId,
                    date: format(newRateDate, 'yyyy-MM-dd'),
                    rate: Number(newRate),
                    active: false, // Will be handled by the setActiveRate logic
                };

                await updateDoc(settingsRef, {
                    exchangeRates: arrayUnion(newRateEntry)
                });

                await handleSetActiveRate(rateId); // Now set the new rate as active
                
                toast({ title: 'Tasa Agregada', description: `La nueva tasa para el ${format(newRateDate, 'P', {locale: es})} ha sido guardada.` });
                setNewRate('');
                setNewRateDate(new Date());

            } catch (error) {
                console.error("Error adding rate:", error);
                toast({ variant: 'destructive', title: 'Error', description: 'No se pudo agregar la tasa.' });
            } finally {
                setIsAddingRate(false);
            }
        });
    };

    const handleSetActiveRate = async (rateId: string) => {
        if (!settings) return;
        setSaving(true);
        try {
            const settingsRef = doc(db, 'config', 'mainSettings');
            const updatedRates = settings.exchangeRates.map(rate => ({
                ...rate,
                active: rate.id === rateId,
            }));
            await updateDoc(settingsRef, { exchangeRates: updatedRates });
            toast({ title: 'Tasa Activada', description: 'La tasa seleccionada ahora está activa.', className: "bg-blue-100 border-blue-400" });
        } catch (error) {
            console.error('Error setting active rate:', error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo activar la tasa.' });
        } finally {
            setSaving(false);
        }
    };
    
    const handleDeleteRate = async (rateToDelete: ExchangeRate) => {
         if (!settings) return;
         setSaving(true);
        try {
            const settingsRef = doc(db, 'config', 'mainSettings');
            await updateDoc(settingsRef, { exchangeRates: arrayRemove(rateToDelete) });
            toast({ title: 'Tasa Eliminada' });
        } catch (error) {
            console.error('Error deleting rate:', error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo eliminar la tasa.' });
        } finally {
            setSaving(false);
        }
    };

    const handleSaveAuthKey = () => {
        if (!authKey) {
            toast({ variant: 'destructive', title: 'Clave vacía', description: 'La clave de autorización no puede estar vacía.' });
            return;
        }

        requestAuthorization(async () => {
            setSaving(true);
            try {
                const keyDocRef = doc(db, 'config', 'authorization');
                await setDoc(keyDocRef, { key: authKey });
                toast({ title: 'Clave de Autorización Guardada', className: 'bg-green-100' });
                setIsKeyEditing(false);
            } catch (error) {
                console.error("Error saving auth key:", error);
                toast({ variant: 'destructive', title: 'Error', description: 'No se pudo guardar la clave.' });
            } finally {
                setSaving(false);
            }
        });
    };

    const handleScrapeBCV = async () => {
        // Placeholder for future Genkit flow
        toast({ title: 'Próximamente', description: 'Esta función usará IA para obtener la tasa del BCV automáticamente.' });
    };

    if (loading || !settings) {
        return (
            <div className="flex h-full w-full items-center justify-center">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
            </div>
        );
    }
    
    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold font-headline">Configuración</h1>
                <p className="text-muted-foreground">Ajusta los parámetros generales de la aplicación y la comunidad.</p>
            </div>
            
            <Card>
                <CardHeader>
                    <CardTitle>Información de la Empresa</CardTitle>
                    <CardDescription>Datos que aparecerán en recibos y documentos oficiales.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="flex items-center gap-6">
                         <Avatar className="w-24 h-24 text-lg">
                            <AvatarImage src={settings.companyInfo.logo || undefined} alt="Logo" />
                            <AvatarFallback><UserCircle className="h-12 w-12"/></AvatarFallback>
                        </Avatar>
                        <div className="space-y-2">
                             <Label htmlFor="logo-upload">Logo de la Empresa</Label>
                             <div className="flex items-center gap-2">
                                <Input id="logo-upload" type="file" className="hidden" onChange={(e) => handleAvatarUpload(e, 'companyInfo')} accept="image/png,image/jpeg" />
                                <Button type="button" variant="outline" onClick={() => document.getElementById('logo-upload')?.click()} disabled={uploading}>
                                    {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Upload className="mr-2 h-4 w-4"/>} Cambiar Logo
                                </Button>
                             </div>
                             <p className="text-xs text-muted-foreground">PNG o JPG. Recomendado 200x200px, max 1MB.</p>
                        </div>
                     </div>
                    <div className="grid md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="companyName">Nombre del Condominio</Label>
                            <Input id="companyName" value={settings.companyInfo.name} onChange={e => handleInputChange(e, 'companyInfo', 'name')} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="rif">RIF</Label>
                            <Input id="rif" value={settings.companyInfo.rif} onChange={e => handleInputChange(e, 'companyInfo', 'rif')} />
                        </div>
                    </div>
                     <div className="space-y-2">
                        <Label htmlFor="address">Dirección Fiscal</Label>
                        <Textarea id="address" value={settings.companyInfo.address} onChange={e => handleInputChange(e, 'companyInfo', 'address')} />
                    </div>
                     <div className="grid md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="phone">Teléfono de Contacto</Label>
                            <Input id="phone" value={settings.companyInfo.phone} onChange={e => handleInputChange(e, 'companyInfo', 'phone')} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="email">Correo Electrónico</Label>
                            <Input id="email" type="email" value={settings.companyInfo.email} onChange={e => handleInputChange(e, 'companyInfo', 'email')} />
                        </div>
                    </div>
                     <div className="grid md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="bankName">Banco Receptor</Label>
                            <Input id="bankName" value={settings.companyInfo.bankName} onChange={e => handleInputChange(e, 'companyInfo', 'bankName')} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="accountNumber">Número de Cuenta</Label>
                            <Input id="accountNumber" value={settings.companyInfo.accountNumber} onChange={e => handleInputChange(e, 'companyInfo', 'accountNumber')} />
                        </div>
                    </div>
                </CardContent>
            </Card>

            <div className="grid md:grid-cols-2 gap-8">
                <Card>
                    <CardHeader>
                        <CardTitle>Parámetros Financieros</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                         <div className="space-y-2">
                            <Label htmlFor="condoFee">Cuota Mensual de Condominio (USD)</Label>
                            <Input 
                                id="condoFee" 
                                type="number" 
                                value={settings.condoFee || ''} 
                                onChange={e => setSettings({...settings, condoFee: parseFloat(e.target.value) || 0 })} 
                                placeholder="Ej: 25.00"
                            />
                        </div>
                        <div className="p-3 bg-muted/50 rounded-lg flex items-start gap-2 text-xs text-muted-foreground">
                            <AlertTriangle className="h-4 w-4 mt-0.5 text-orange-500 shrink-0"/>
                            <p>Cambiar esta cuota <strong>no</strong> afectará deudas ya generadas. Afectará las nuevas deudas creadas masivamente o por conciliación.</p>
                        </div>
                    </CardContent>
                </Card>

                 <Card>
                    <CardHeader>
                        <CardTitle>Clave de Autorización</CardTitle>
                        <CardDescription>Clave requerida para acciones críticas.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center gap-2">
                            <Input type="password" value={authKey} readOnly={!isKeyEditing} onChange={(e) => setAuthKey(e.target.value)} />
                             <Button variant="outline" size="icon" onClick={() => setIsKeyEditing(!isKeyEditing)}>
                                <Edit className="h-4 w-4" />
                            </Button>
                        </div>
                    </CardContent>
                    {isKeyEditing && (
                        <CardFooter>
                            <Button onClick={handleSaveAuthKey} disabled={saving}>
                                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Save className="mr-2 h-4 w-4"/>}
                                Guardar Clave
                            </Button>
                        </CardFooter>
                    )}
                </Card>
                 <Card>
                    <CardHeader>
                        <CardTitle>Acceso de Propietarios</CardTitle>
                        <CardDescription>Habilitar o deshabilitar el inicio de sesión para propietarios.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                         <div className="flex items-center space-x-2">
                            <Switch 
                                id="owner-login-switch" 
                                checked={loginSettings.ownerLoginEnabled}
                                onCheckedChange={handleLoginSettingsChange}
                            />
                            <Label htmlFor="owner-login-switch" className="flex items-center">
                                {loginSettings.ownerLoginEnabled ? (
                                    <Power className="mr-2 h-4 w-4 text-green-500" />
                                ) : (
                                    <PowerOff className="mr-2 h-4 w-4 text-destructive" />
                                )}
                                {loginSettings.ownerLoginEnabled ? 'Inicio de Sesión Habilitado' : 'Inicio de Sesión Deshabilitado'}
                            </Label>
                        </div>
                         {!loginSettings.ownerLoginEnabled && (
                            <div className="space-y-2">
                                <Label htmlFor="disabledMessage">Mensaje al Deshabilitar</Label>
                                <Textarea 
                                    id="disabledMessage" 
                                    value={loginSettings.disabledMessage} 
                                    onChange={(e) => handleInputChange(e, 'loginSettings', 'disabledMessage')} 
                                />
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Tasas de Cambio (BCV)</CardTitle>
                    <CardDescription>Gestiona las tasas de cambio para los cálculos en bolívares.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid md:grid-cols-3 gap-4 mb-6 p-4 border rounded-lg bg-muted/50">
                        <div className="space-y-2">
                             <Label htmlFor="newRateDate">Fecha de Tasa</Label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button id="newRateDate" variant={"outline"} className={cn("w-full justify-start", !newRateDate && "text-muted-foreground")}>
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {newRateDate ? format(newRateDate, "PPP", { locale: es }) : <span>Seleccione fecha</span>}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={newRateDate} onSelect={setNewRateDate} initialFocus locale={es} /></PopoverContent>
                            </Popover>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="newRate">Nueva Tasa (Bs.)</Label>
                            <Input id="newRate" type="number" value={newRate} onChange={(e) => setNewRate(e.target.value)} placeholder="Ej: 36.45"/>
                        </div>
                         <div className="space-y-2 flex flex-col justify-end">
                             <Button onClick={handleAddRate} disabled={isAddingRate}>
                                {isAddingRate ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <PlusCircle className="mr-2 h-4 w-4"/>}
                                Agregar Tasa
                            </Button>
                        </div>
                    </div>
                     <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Fecha</TableHead>
                                <TableHead>Tasa (Bs.)</TableHead>
                                <TableHead>Estado</TableHead>
                                <TableHead className="text-right">Acciones</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {settings.exchangeRates?.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(rate => (
                                <TableRow key={rate.id} className={rate.active ? "bg-primary/10" : ""}>
                                    <TableCell>{format(parseISO(rate.date), 'PPP', {locale: es})}</TableCell>
                                    <TableCell>Bs. {new Intl.NumberFormat('es-VE', {minimumFractionDigits: 2}).format(rate.rate)}</TableCell>
                                    <TableCell>
                                        <Badge variant={rate.active ? 'success' : 'outline'}>{rate.active ? 'Activa' : 'Inactiva'}</Badge>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4"/></Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent>
                                                {!rate.active && (
                                                    <DropdownMenuItem onClick={() => handleSetActiveRate(rate.id)} disabled={saving}>
                                                        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                                                        Activar
                                                    </DropdownMenuItem>
                                                )}
                                                <DropdownMenuItem className="text-destructive" onClick={() => handleDeleteRate(rate)} disabled={saving}>
                                                     {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Trash2 className="mr-2 h-4 w-4" />}
                                                    Eliminar
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <div className="flex justify-end pt-4">
                 <Button size="lg" onClick={handleSaveChanges} disabled={saving}>
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Save className="mr-2 h-4 w-4"/>}
                    Actualizar datos
                </Button>
            </div>
        </div>
    );
}
