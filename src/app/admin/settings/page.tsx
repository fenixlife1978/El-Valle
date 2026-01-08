
'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { collection, onSnapshot, addDoc, doc, getDoc, orderBy, serverTimestamp, Timestamp, deleteDoc, updateDoc, arrayUnion, arrayRemove, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { PlusCircle, Trash2, Loader2, Search, XCircle, FileText, Award, User, Home, Info, Stamp, MoreHorizontal, Edit, Power, PowerOff, AlertTriangle, CheckCircle2, Wand2, Upload, UserCircle, CalendarIcon, Save } from 'lucide-react';
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
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

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

const DEFAULT_LOGO_BASE64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAASwAAAEsCAMAAABOo35HAAAC2VBMVEX//////wD//wD/zAAAgAD/AADa3N3/2wAzMzN/f39bW1tra2sAAACmpqaurq6IiIhZWVkzMzMmJiaAgICysrLd3d1AQEBQUFCMjIyVlZVCQkIXFxcZGRkAAAAKCgr/qgBKSkr/tAD/wAD/3AD/zDP/yAD/xwD/vgD/uAD/rgD/ngD/lgD/igD/gAD/ewD/cwD/bAD/ZAD/XwD/VwD/UwD/SwD/QwD/PgD/NAD/MAD/LAD/JQD/HAD/FQD2qAD3kwD4iQD6ggD7fgD8eAD9cwD+bAD/agD/ZwD/XQD/VQD/TQD/RgD/PwD/NgD/MwD/LgD/KgD/JAD/IQD/GQD/EQD/AAD/zGb/0Tr/y1z/x1f/w1P/v0v/ukc/u0b/t0P/skL/rUH/qT//pz7/ojz/nTr/mjj/lTf/kjT/jDL/iDH/hC//fy7+ei39dyz9civ8byf8aSX7XyT7VyP6UyH6SyD5RiD5Qh/4Oh74Nh33Lxr3Khj2IRf2GRP1ExL1DxH0CRD0ABClpz0iFw2gpz4dFABlZgB+fgCLiwCSkgCVlACpqQC1tQDJyQDS0gDY2ADf3wD//wD/ugD/qQD/lQD/gQD/dQD/ZAD/VQD/RgD/MAD/HgAAACIiJR8eHhUUEw4LCwAAAACioqKvr693d3dZWVlMTEw/Pz9EREQkJCQtLS0YGBgeHh4BAQEQEBAMDAwCAgL//+f/+Mv/9LX/7p//6Jf/5I3/4Hv/2XL/0VT/y1D/xUr/w0P/vkH/uUD9tj79rzr9pjj9ojn8mjT8kjD8hjD7gC77cy36ayz6XXf4Xm34Vmj3UWX2S171R1v1PlT0N070METzKxyfnyMeGg17ehxqaxttbRxZWhtJSRgtLQxNTg1BQAplZgCJiQCSkgCgoACysgC+vgDExcDHyMLJycPNzMvPzs3S0tHW1tXX2Nba2tve3t7h4eHj4+Pn5+fo6Ojp6eno6Ojq6urr6+vs7Ozt7e3u7u7v7+/w8PDx8fHy8vLz8/P09PT19fX29vb39/f4+Pj5+fn6+vr7+/v8/Pz9/f3+/v7////MMfXfAAAIUklEQVR42uycW3PbNhCGK1l1wJgY40gCSTokTtN0mhZpY9M0LdM0TdM0TdM0TdM0TdM0TfP/H4lJcOIAARzX29737+zsvS/Jm51Fh8PBYVdGkRE2F35/f19kREmRERaX3W13eBwdxlHkZf+q7O0vF2d2Nkf3/r43XvO21o6V03tW2i1vD6e/nZ/9M1d/s2R7e31d8e1V4XkZ13fX/X1cRgaKjLA4lBEReZ8vsiIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiI'L.1_iVBORw0KG-U-AAAAAOXRFB_jJ2uI2yF_yAAAAAElFTkSuQmCC';
+
+const emptyCompanyInfo: CompanyInfo = {
+    name: 'Nombre de la Empresa',
+    address: 'Dirección Fiscal de la Empresa',
+    rif: 'J-00000000-0',
+    phone: '+58 212-555-5555',
+    email: 'contacto@empresa.com',
+    logo: DEFAULT_LOGO_BASE64,
+    bankName: 'Banco Ejemplo',
+    accountNumber: '0123-4567-89-0123456789'
+};
+
 
 const emptyCondoFee = {
     amount: 0,
@@ -250,7 +238,7 @@
                          <Avatar className="w-24 h-24 text-lg">
                             <AvatarImage src={settings.companyInfo.logo || undefined} alt="Logo" />
                             <AvatarFallback><UserCircle className="h-12 w-12"/></AvatarFallback>
-                        </Avatar>
+                        </Avatar> 
                         <div className="space-y-2">
                              <Label htmlFor="logo-upload">Logo de la Empresa</Label>
                              <div className="flex items-center gap-2">
@@ -348,7 +336,7 @@
                 </CardContent>
             </Card>
 
             <div className="flex justify-end pt-4">
-                 <Button size="lg" onClick={handleSaveChanges} disabled={saving}>
+                 <Button size="lg" onClick={handleSaveChanges} disabled={saving || uploading}>
                     {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Save className="mr-2 h-4 w-4"/>}
                     Actualizar datos
                 </Button>
