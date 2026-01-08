
'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { collection, onSnapshot, addDoc, doc, getDoc, orderBy, serverTimestamp, Timestamp, deleteDoc, updateDoc, arrayUnion, arrayRemove, setDoc } from 'firebase/firestore';
import { db, storage } from '@/lib/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
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
    condoFee: { amount: number };
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

const DEFAULT_LOGO_BASE64 = `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAASwAAAEsCAMAAABOo35HAAAC2VBMVEX//////wD//wD/zAAAgAD/AADa3N3/2wAzMzN/f39bW1tra2sAAACmpqaurq6IiIhZWVkzMzMmJiaAgICysrLd3d1AQEBQUFCMjIyVlZVCQkIXFxcZGRkAAAAKCgr/qgBKSkr/tAD/wAD/3AD/zDP/yAD/xwD/vgD/uAD/rgD/ngD/lgD/igD/gAD/ewD/cwD/bAD/ZAD/XwD/VwD/UwD/SwD/QwD/PgD/NAD/MAD/LAD/JQD/HAD/FQD2qAD3kwD4iQD6ggD7fgD8eAD9cwD+bAD/agD/ZwD/XQD/VQD/TQD/RgD/PwD/NgD/MwD/LgD/KgD/JAD/IQD/GQD/EQD/AAD/zGb/0Tr/y1z/x1f/w1P/v0v/ukc/u0b/t0P/skL/rUH/qT//pz7/ojz/nTr/mjj/lTf/kjT/jDL/iDH/hC//fy7+ei39dyz9civ8byf8aSX7XyT7VyP6UyH6SyD5RiD5Qh/4Oh74Nh33Lxr3Khj2IRf2GRP1ExL1DxH0CRD0ABClpz0iFw2gpz4dFABlZgB+fgCLiwCSkgCVlACpqQC1tQDJyQDS0gDY2ADf3wD//wD/ugD/qQD/lQD/gQD/dQD/ZAD/VQD/RgD/MAD/HgAAACIiJR8eHhUUEw4LCwAAAACioqKvr693d3dZWVlMTEw/Pz9EREQkJCQtLS0YGBgeHh4BAQEQEBAMDAwCAgL//+f/+Mv/9LX/7p//6Jf/5I3/4Hv/2XL/0VT/y1D/xUr/w0P/vkH/uUD9tj79rzr9pjj9ojn8mjT8kjD8hjD7gC77cy36ayz6XXf4Xm34Vmj3UWX2S171R1v1PlT0N070METzKxyfnyMeGg17ehxqaxttbRxZWhtJSRgtLQxNTg1BQAplZgCJiQCSkgCgoACysgC+vgDExcDHyMLJycPNzMvPzs3S0tHW1tXX2Nba2tve3t7h4eHj4+Pn5+fo6Ojp6eno6Ojq6urr6+vs7Ozt7e3u7u7v7+/w8PDx8fHy8vLz8/P09PT19fX29vb39/f4+Pj5+fn6+vr7+/v8/Pz9/f3+/v7////MMfXfAAAIUklEQVR42uycW3PbNhCGK1l1wJgY40gCSTokTtN0mhZpY9M0LdM0TdM0TdM0TdM0TdM0TfP/H4lJcOIAARzX29737+zsvS/Jm51Fh8PBYVdGkRE2F35/f19kREmRERaX3W13eBwdxlHkZf+q7O0vF2d2Nkf3/r43XvO21o6V03tW2i1vD6e/nZ/9M1d/s2R7e31d8e1V4XkZ13fX/X1cRgaKjLA4lBEReZ8vsiIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiI-Ew-iVBORw0KGgoAAAANSUhEUgAAASwAAAEsCAMAAABOo35HAAAC2VBMVEX//////wD//wD/zAAAgAD/AADa3N3/2wAzMzN/f39bW1tra2sAAACmpqaurq6IiIhZWVkzMzMmJiaAgICysrLd3d1AQEBQUFCMjIyVlZVCQkIXFxcZGRkAAAAKCgr/qgBKSkr/tAD/wAD/3AD/zDP/yAD/xwD/vgD/uAD/rgD/ngD/lgD/igD/gAD/ewD/cwD/bAD/ZAD/XwD/VwD/UwD/SwD/QwD/PgD/NAD/MAD/LAD/JQD/HAD/FQD2qAD3kwD4iQD6ggD7fgD8eAD9cwD+bAD/agD/ZwD/XQD/VQD/TQD/RgD/PwD/NgD/MwD/LgD/KgD/JAD/IQD/GQD/EQD/AAD/zGb/0Tr/y1z/x1f/w1P/v0v/ukc/u0b/t0P/skL/rUH/qT//pz7/ojz/nTr/mjj/lTf/kjT/jDL/iDH/hC//fy7+ei39dyz9civ8byf8aSX7XyT7VyP6UyH6SyD5RiD5Qh/4Oh74Nh33Lxr3Khj2IRf2GRP1ExL1DxH0CRD0ABClpz0iFw2gpz4dFABlZgB+fgCLiwCSkgCVlACpqQC1tQDJyQDS0gDY2ADf3wD//wD/ugD/qQD/lQD/gQD/dQD/ZAD/VQD/RgD/MAD/HgAAACIiJR8eHhUUEw4LCwAAAACioqKvr693d3dZWVlMTEw/Pz9EREQkJCQtLS0YGBgeHh4BAQEQEBAMDAwCAgL//+f/+Mv/9LX/7p//6Jf/5I3/4Hv/2XL/0VT/y1D/xUr/w0P/vkH/uUD9tj79rzr9pjj9ojn8mjT8kjD8hjD7gC77cy36ayz6XXf4Xm34Vmj3UWX2S171R1v1PlT0N070METzKxyfnyMeGg17ehxqaxttbRxZWhtJSRgtLQxNTg1BQAplZgCJiQCSkgCgoACysgC+vgDExcDHyMLJycPNzMvPzs3S0tHW1tXX2Nba2tve3t7h4eHj4+Pn5+fo6Ojp6eno6Ojq6urr6+vs7Ozt7e3u7u7v7+/w8PDx8fHy8vLz8/P09PT19fX29vb39/f4+Pj5+fn6+vr7+/v8/Pz9/f3+/v7////MMfXfAAAIUklEQVR42uycW3PbNhCGK1l1wJgY40gCSTokTtN0mhZpY9M0LdM0TdM0TdM0TdM0TdM0TfP/H4lJcOIAARzX29737+zsvS/Jm51Fh8PBYVdGkRE2F35/f19kREmRERaX3W13eBwdxlHkZf+q7O0vF2d2Nkf3/r43XvO21o6V03tW2i1vD6e/nZ/9M1d/s2R7e31d8e1V4XkZ13fX/X1cRgaKjLA4lBEReZ8vsiIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiIuIiI'I'LBAAAAAAElFTkSuQmCC`;

const emptyCompanyInfo: CompanyInfo = {
-    name: 'Nombre de la Empresa',
-    address: '',
-    rif: '',
-    phone: '',
-    email: '',
-    logo: DEFAULT_LOGO_BASE64,
-    bankName: 'Banco Ejemplo',
-    accountNumber: '0123-4567-89-0123456789',
-};
-
-
-const emptyCondoFee = {
-    amount: 0,
-};
-
-const emptyLoginSettings = {
-    ownerLoginEnabled: true,
-    disabledMessage: 'El inicio de sesión para propietarios se encuentra deshabilitado temporalmente.',
+    name: 'Nombre de la Empresa',
+    address: 'Dirección Fiscal de la Empresa',
+    rif: 'J-00000000-0',
+    phone: '+58 212-555-5555',
+    email: 'contacto@empresa.com',
+    logo: DEFAULT_LOGO_BASE64,
+    bankName: 'Banco Ejemplo',
+    accountNumber: '0123-4567-89-0123456789'
 };
 
-
 export default function AdminSettingsPage() {
     const { toast } = useToast();
     const { requestAuthorization } = useAuthorization();
     const fileInputRef = useRef<HTMLInputElement>(null);
-    
+
     const [settings, setSettings] = useState<Settings>({
         adminProfile: emptyAdminProfile,
         companyInfo: emptyCompanyInfo,
         condoFee: emptyCondoFee,
         loginSettings: emptyLoginSettings,
         exchangeRates: []
     });
+    const [loading, setLoading] = useState(true);
+    const [saving, setSaving] = useState(false);
+    const [uploading, setUploading] = useState(false);
 
     // Rate states
     const [rates, setRates] = useState<ExchangeRate[]>([]);
     const [newRate, setNewRate] = useState<number | string>('');
     const [newRateDate, setNewRateDate] = useState<Date | undefined>(new Date());
     const [isAddingRate, setIsAddingRate] = useState(false);
-
-
-    // Auth Key states
     const [authKey, setAuthKey] = useState('');
     const [isKeyEditing, setIsKeyEditing] = useState(false);
 
     useEffect(() => {
         const settingsRef = doc(db, "config", "mainSettings");
         const unsubscribe = onSnapshot(settingsRef, (doc) => {
             if (doc.exists()) {
                 const data = doc.data() as Settings;
                 setSettings(data);
-
-                // Set individual states for easier handling in the UI
-                if (data.companyInfo) setCompanyInfo(data.companyInfo);
-                if (data.condoFee) setCondoFee(data.condoFee);
-                if (data.exchangeRates) setRates(data.exchangeRates.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
-                if (data.loginSettings) setLoginSettings(data.loginSettings);
-                if (data.adminProfile) setAdminProfile(data.adminProfile);
+                setRates(data.exchangeRates ? data.exchangeRates.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()) : []);
             } else {
-                console.log("No such document!");
-            }
-            setLoading(false);
-        }, (error) => {
-            console.error("Error fetching settings:", error);
-            toast({
-                variant: "destructive",
-                title: "Error al cargar la configuración",
-                description: "No se pudieron obtener los datos de configuración.",
-            });
-            setLoading(false);
+                // Si no hay documento, inicializamos con valores por defecto
+                setSettings({
+                    adminProfile: emptyAdminProfile,
+                    companyInfo: emptyCompanyInfo,
+                    condoFee: emptyCondoFee,
+                    loginSettings: emptyLoginSettings,
+                    exchangeRates: []
+                });
+            }
+            setLoading(false);
+        }, (error) => {
+            console.error("Error fetching settings:", error);
+            toast({
+                variant: "destructive",
+                title: "Error al cargar la configuración",
+                description: "No se pudieron obtener los datos de configuración.",
+            });
+            setLoading(false);
         });
 
         const authKeyRef = doc(db, 'config', 'authorization');
         const unsubscribeAuthKey = onSnapshot(authKeyRef, (doc) => {
             if (doc.exists()) {
                 setAuthKey(doc.data().key);
             }
         });
 
-        return () => {
-            unsubscribe();
-            unsubscribeAuthKey();
-        };
+        return () => { unsubscribe(); unsubscribeAuthKey(); };
     }, [toast]);
 
     const handleInfoChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
         const { name, value } = e.target;
-        setCompanyInfo(prev => ({ ...prev, [name]: value }));
+        setSettings(prev => ({ ...prev, companyInfo: { ...prev.companyInfo, [name]: value }}));
     };
 
     const handleAdminInfoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
         const { name, value } = e.target;
-        setAdminProfile(prev => ({ ...prev, [name]: value }));
+        setSettings(prev => ({...prev, adminProfile: {...prev.adminProfile, [name]: value}}));
     };
 
     const handleFeeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
         const value = e.target.value;
-        setCondoFee({ amount: value === '' ? 0 : parseFloat(value) });
+        setSettings(prev => ({...prev, condoFee: { amount: value === '' ? 0 : parseFloat(value) }}));
     };
 
     const handleLoginSettingsChange = (field: keyof LoginSettings, value: any) => {
-        setLoginSettings(prev => ({...prev, [field]: value}));
+        setSettings(prev => ({...prev, loginSettings: {...prev.loginSettings, [field]: value}}));
     };
 
     const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
@@ -194,30 +182,33 @@
 
     const handleSaveChanges = () => {
         requestAuthorization(async () => {
-            if (!companyInfo) return;
+            const { adminProfile, companyInfo, condoFee, loginSettings, bcvLogo } = settings;
+
+            if (!companyInfo.name || !companyInfo.rif || condoFee.amount === undefined) {
+                toast({
+                    variant: "destructive",
+                    title: "Campos requeridos",
+                    description: "Por favor, complete el nombre de la empresa, RIF y la cuota del condominio.",
+                });
+                return;
+            }
 
             setSaving(true);
             try {
                 const settingsRef = doc(db, 'config', 'mainSettings');
                 await updateDoc(settingsRef, {
-                    adminProfile,
-                    companyInfo,
-                    condoFee
-                });
-
-                const loginSettingsRef = doc(db, 'config', 'loginSettings');
-                await setDoc(loginSettingsRef, loginSettings);
-
+                    'adminProfile.name': adminProfile.name,
+                    'adminProfile.email': adminProfile.email,
+                    'adminProfile.avatar': adminProfile.avatar,
+                    'companyInfo.name': companyInfo.name,
+                    'companyInfo.address': companyInfo.address,
+                    'companyInfo.rif': companyInfo.rif,
+                    'companyInfo.phone': companyInfo.phone,
+                    'companyInfo.email': companyInfo.email,
+                    'companyInfo.logo': companyInfo.logo,
+                    'companyInfo.bankName': companyInfo.bankName,
+                    'companyInfo.accountNumber': companyInfo.accountNumber,
+                    'condoFee.amount': condoFee.amount,
+                    'loginSettings.ownerLoginEnabled': loginSettings.ownerLoginEnabled,
+                    'loginSettings.disabledMessage': loginSettings.disabledMessage,
+                    'bcvLogo': bcvLogo
+                });
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
 
     const handleSaveAuthKey = async () => {
         if (!authKey || authKey.length < 6) {
             toast({ variant: 'destructive', title: 'Clave inválida', description: 'La clave debe tener al menos 6 caracteres.' });
             return;
         }
         setIsKeyEditing(false);
         try {
             const keyRef = doc(db, 'config', 'authorization');
             await setDoc(keyRef, { key: authKey });
             toast({ title: 'Clave de autorización actualizada' });
         } catch (error) {
             toast({ variant: 'destructive', title: 'Error al guardar la clave' });
             console.error("Error saving auth key: ", error);
         }
     };

     if (loading) {
         return (
             <div className="flex h-full w-full items-center justify-center">
                 <Loader2 className="h-10 w-10 animate-spin text-primary" />
             </div>
         );
     }

     return (
         <div className="space-y-8">
             <div className='flex items-center justify-between'>
                 <h1 className="text-3xl font-bold font-headline">Configuración</h1>
-                 <Button size="lg" onClick={handleSaveChanges} disabled={saving || uploading}>
+                 <Button size="lg" onClick={handleSaveChanges} disabled={saving || uploading }>
                     {saving || uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Save className="mr-2 h-4 w-4"/>}
                     Actualizar datos
                 </Button>
             </div>
             
             <Card>
                 <CardHeader>
-                    <CardTitle>Información de la Empresa</CardTitle>
+                    <CardTitle>Información de la Administradora</CardTitle>
                     <CardDescription>Datos que aparecerán en recibos y documentos oficiales.</CardDescription>
                 </CardHeader>
                 <CardContent className="space-y-6">
                     <div className='grid md:grid-cols-2 gap-4'>
                         <div className="space-y-2">
                             <Label htmlFor="logo">Logo de la Empresa</Label>
                             <div className="flex items-center gap-2">
                                 <input type="file" ref={fileInputRef} onChange={handleLogoChange} accept="image/*" className="hidden" />
-                                <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploading || saving}>
+                                <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                                     {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                                     Subir Logo
                                 </Button>
                             </div>
                         </div>
                          <Avatar className="w-24 h-24 text-lg">
-                            <AvatarImage src={companyInfo.logo || undefined} alt="Logo" />
+                            <AvatarImage src={settings.companyInfo.logo || undefined} alt="Logo" />
                             <AvatarFallback><UserCircle className="h-12 w-12"/></AvatarFallback>
                         </Avatar>
                     </div>
                     <div className="grid md:grid-cols-2 gap-4">
                         <div className="space-y-2">
                             <Label htmlFor="name">Nombre de la Administradora</Label>
-                            <Input id="name" name="name" value={companyInfo?.name || ''} onChange={handleInfoChange} />
+                            <Input id="name" name="name" value={settings.companyInfo?.name || ''} onChange={handleInfoChange} />
                         </div>
                         <div className="space-y-2">
                             <Label htmlFor="rif">RIF</Label>
-                            <Input id="rif" name="rif" value={companyInfo?.rif || ''} onChange={handleInfoChange} />
+                            <Input id="rif" name="rif" value={settings.companyInfo?.rif || ''} onChange={handleInfoChange} />
                         </div>
                     </div>
                      <div className="space-y-2">
                         <Label htmlFor="address">Dirección Fiscal</Label>
-                        <Textarea id="address" name="address" value={companyInfo?.address || ''} onChange={handleInfoChange} />
+                        <Textarea id="address" name="address" value={settings.companyInfo?.address || ''} onChange={handleInfoChange} />
                     </div>
                      <div className="grid md:grid-cols-2 gap-4">
                         <div className="space-y-2">
                             <Label htmlFor="phone">Teléfono de Contacto</Label>
-                            <Input id="phone" name="phone" value={companyInfo?.phone || ''} onChange={handleInfoChange} />
+                            <Input id="phone" name="phone" value={settings.companyInfo?.phone || ''} onChange={handleInfoChange} />
                         </div>
                         <div className="space-y-2">
                             <Label htmlFor="email">Correo Electrónico</Label>
-                            <Input id="email" name="email" type="email" value={companyInfo?.email || ''} onChange={handleInfoChange} />
+                            <Input id="email" name="email" type="email" value={settings.companyInfo?.email || ''} onChange={handleInfoChange} />
                         </div>
                     </div>
                 </CardContent>
@@ -420,11 +415,11 @@
                      <div className="space-y-2">
                         <Label htmlFor="condoFee">Cuota Mensual de Condominio (USD)</Label>
                         <Input 
                             id="condoFee" 
                             type="number" 
-                            value={condoFee} 
+                            value={settings.condoFee.amount} 
                             onChange={handleFeeChange} 
                             placeholder="Ej: 25.00"
                             step="0.01"
                         />
                     </div>
                      <div className="space-y-2">
                         <Label htmlFor="bankName">Nombre del Banco Receptor</Label>
-                        <Input id="bankName" name="bankName" value={companyInfo?.bankName || ''} onChange={handleInfoChange} placeholder="Ej: Banco de Venezuela" />
+                        <Input id="bankName" name="bankName" value={settings.companyInfo?.bankName || ''} onChange={handleInfoChange} placeholder="Ej: Banco de Venezuela" />
                     </div>
                     <div className="space-y-2">
                         <Label htmlFor="accountNumber">Número de Cuenta</Label>
-                        <Input id="accountNumber" name="accountNumber" value={companyInfo?.accountNumber || ''} onChange={handleInfoChange} placeholder="Ej: 01020123456789012345" />
+                        <Input id="accountNumber" name="accountNumber" value={settings.companyInfo?.accountNumber || ''} onChange={handleInfoChange} placeholder="Ej: 01020123456789012345" />
                     </div>
                 </CardContent>
             </Card>
@@ -439,12 +434,12 @@
                             <div className="space-y-2">
                                 <Label htmlFor="adminName">Nombre del Administrador</Label>
                                 <Input 
-                                    value={adminProfile.name}
+                                    value={settings.adminProfile.name}
                                     name="name" 
                                     onChange={handleAdminInfoChange} />
                             </div>
                             <div className="space-y-2">
                                 <Label htmlFor="adminEmail">Email del Administrador</Label>
-                                <Input id="adminEmail" name="email" type="email" value={adminProfile.email} disabled />
+                                <Input id="adminEmail" name="email" type="email" value={settings.adminProfile.email} disabled />
                                 <p className="text-xs text-muted-foreground">El email no puede ser cambiado desde aquí.</p>
                             </div>
                         </div>
@@ -452,10 +447,10 @@
                             <Label htmlFor="avatar-upload-admin">Avatar del Administrador</Label>
                             <div className="flex items-center gap-4">
                                 <Avatar className="w-24 h-24 text-lg">
-                                    <AvatarImage src={adminProfile.avatar || undefined} alt="Admin Avatar" />
+                                    <AvatarImage src={settings.adminProfile.avatar || undefined} alt="Admin Avatar" />
                                     <AvatarFallback><UserCircle className="h-12 w-12"/></AvatarFallback>
                                 </Avatar>
-                                <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploading || saving}>
+                                <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                                     {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                                     Cambiar Avatar
                                 </Button>
@@ -470,12 +465,12 @@
                 <CardContent className='space-y-4'>
                     <div className="flex items-center space-x-2">
                         <Switch 
-                            id="ownerLoginEnabled" 
-                            checked={loginSettings.ownerLoginEnabled} 
+                            id="ownerLoginEnabled"
+                            checked={settings.loginSettings.ownerLoginEnabled} 
                             onCheckedChange={(checked) => handleLoginSettingsChange('ownerLoginEnabled', checked)} 
                         />
                         <Label htmlFor="ownerLoginEnabled">Habilitar Ingreso de Propietarios</Label>
-                        <Badge variant={loginSettings.ownerLoginEnabled ? "success" : "destructive"}>
-                            {loginSettings.ownerLoginEnabled ? <Power className="h-3 w-3 mr-1"/> : <PowerOff className="h-3 w-3 mr-1"/>}
-                            {loginSettings.ownerLoginEnabled ? 'Activado' : 'Desactivado'}
+                        <Badge variant={settings.loginSettings.ownerLoginEnabled ? "success" : "destructive"}>
+                            {settings.loginSettings.ownerLoginEnabled ? <Power className="h-3 w-3 mr-1"/> : <PowerOff className="h-3 w-3 mr-1"/>}
+                            {settings.loginSettings.ownerLoginEnabled ? 'Activado' : 'Desactivado'}
                         </Badge>
                     </div>
                      <div className="space-y-2">
@@ -483,7 +478,7 @@
                         <Textarea 
                             id="disabledMessage" 
                             placeholder="Ej: El sistema está en mantenimiento. Estaremos de vuelta pronto."
-                            value={loginSettings.disabledMessage}
+                            value={settings.loginSettings.disabledMessage}
                             onChange={(e) => handleLoginSettingsChange('disabledMessage', e.target.value)}
                         />
                     </div>
@@ -499,23 +494,22 @@
                             <p className="font-mono text-sm bg-slate-100 dark:bg-slate-800 p-2 rounded">
                                 {isKeyEditing ? '••••••••' : authKey}
                             </p>
-                            <Button variant="outline" size="sm" onClick={() => setIsKeyEditing(!isKeyEditing)}>
-                                {isKeyEditing ? 'Cancelar' : 'Cambiar'}
-                            </Button>
                         </div>
-                        {isKeyEditing && (
-                            <div className="flex items-center gap-2">
-                                <Input
-                                    type="password"
-                                    placeholder="Nueva clave"
-                                    onChange={(e) => setAuthKey(e.target.value)}
-                                />
-                                <Button onClick={handleSaveAuthKey}>Guardar Clave</Button>
-                            </div>
-                        )}
+                    </div>
+                    {isKeyEditing && (
+                        <div className="flex items-center gap-2 pt-2">
+                            <Input
+                                type="password"
+                                placeholder="Nueva clave de autorización"
+                                value={authKey}
+                                onChange={(e) => setAuthKey(e.target.value)}
+                            />
+                            <Button onClick={handleSaveAuthKey}>Guardar</Button>
+                            <Button variant="ghost" onClick={() => setIsKeyEditing(false)}>Cancelar</Button>
+                        </div>
+                    )}
+                    {!isKeyEditing && <Button variant="outline" size="sm" onClick={() => setIsKeyEditing(true)}>Cambiar Clave</Button>}
                 </CardContent>
-               
             </Card>
 
             <Card>
@@ -582,12 +576,6 @@
                 </CardContent>
             </Card>
 
-            <div className="flex justify-end pt-4">
-                 <Button size="lg" onClick={handleSaveChanges} disabled={saving}>
-                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Save className="mr-2 h-4 w-4"/>}
-                    Actualizar datos
-                </Button>
-            </div>
         </div>
     );
 }
