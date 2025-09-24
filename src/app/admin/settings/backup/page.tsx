
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Database, Upload, Trash2, Loader2, FileUp, AlertTriangle, Terminal, RefreshCw, History, Download, Copy, Code } from 'lucide-react';
import { collection, getDocs, writeBatch, doc, addDoc, query, orderBy, onSnapshot, deleteDoc, Timestamp, setDoc } from 'firebase/firestore';
import { db, storage, app } from '@/lib/firebase';
import { ref, uploadString, getDownloadURL, listAll, deleteObject } from 'firebase/storage';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Textarea } from '@/components/ui/textarea';
import { createUserWithEmailAndPassword, getAuth } from 'firebase/auth';


const COLLECTIONS_TO_BACKUP = ['owners', 'payments', 'debts', 'historical_payments', 'config'];

const FIRESTORE_RULES = `rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}`;


// Helper function to convert Firestore Timestamps to strings
const convertTimestamps = (data: any): any => {
    if (data === null || data === undefined) {
        return data;
    }
    if (data instanceof Timestamp) {
        return data.toDate().toISOString();
    }
    if (Array.isArray(data)) {
        return data.map(item => convertTimestamps(item));
    }
    if (typeof data === 'object' && data.constructor === Object) {
        const res: { [key: string]: any } = {};
        for (const key in data) {
            res[key] = convertTimestamps(data[key]);
        }
        return res;
    }
    return data;
};

export default function BackupPage() {
    const { toast } = useToast();
    const [loadingAction, setLoadingAction] = useState<string | null>(null);
    const [logs, setLogs] = useState<string[]>(['Consola de operaciones lista.']);
    const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);
    const [isRestoreConfirmOpen, setIsRestoreConfirmOpen] = useState(false);
    const [fileToRestore, setFileToRestore] = useState<File | null>(null);

    const addLog = (message: string) => {
        setLogs(prev => [`${format(new Date(), 'HH:mm:ss')}: ${message}`, ...prev]);
    };

    const handleCreateAdmin = async () => {
        const email = "Vallecondo@gmail.com";
        const password = "M110710.m";
        const auth = getAuth(app);
        
        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;
            
            const adminProfile = {
                name: "EDWIN AGUIAR",
                email: email,
                role: "administrador",
                balance: 0,
                passwordChanged: true,
                properties: [{ street: 'Calle 1', house: 'Casa 1' }] // Default property
            };

            await setDoc(doc(db, "owners", user.uid), adminProfile);

            toast({ title: 'Administrador Creado', description: `La cuenta para ${email} ha sido creada.` });

        } catch (error: any) {
            if (error.code === 'auth/email-already-in-use') {
                toast({ variant: 'default', title: 'Cuenta Existente', description: 'La cuenta de administrador ya existe.' });
            } else {
                toast({ variant: 'destructive', title: 'Error', description: error.message });
            }
        }
    };


    const handleCreateBackup = async () => {
        setLoadingAction('create');
        addLog('Iniciando proceso de creación de backup...');
        const backupData: { [key: string]: any[] } = {};

        try {
            for (const collectionName of COLLECTIONS_TO_BACKUP) {
                addLog(`Exportando colección: ${collectionName}...`);
                await new Promise(resolve => setTimeout(resolve, 0)); // Allow UI to update
                const collectionRef = collection(db, collectionName);
                const snapshot = await getDocs(collectionRef);
                const collectionData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
                
                backupData[collectionName] = convertTimestamps(collectionData);
                addLog(`-> ${snapshot.size} documentos exportados de ${collectionName}.`);
            }

            addLog('Serializando datos a formato JSON...');
            await new Promise(resolve => setTimeout(resolve, 0));
            const jsonString = JSON.stringify(backupData, null, 2);
            
            const timestamp = new Date().toISOString();
            const fileName = `backup-condoconnect-${timestamp}.json`;
            
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            addLog('¡Backup creado y descargado localmente!');
            toast({ title: 'Backup Creado', description: 'El archivo se ha descargado localmente.', className: 'bg-green-100 border-green-400 text-green-800' });
        } catch (error) {
            console.error('Error creando backup:', error);
            const errorMessage = error instanceof Error ? error.message : 'Error desconocido.';
            addLog(`ERROR al crear backup: ${errorMessage}`);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo completar la creación del backup.' });
        } finally {
            setLoadingAction(null);
        }
    };
    
    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            if (file.type === 'application/json') {
                setFileToRestore(file);
                setIsRestoreConfirmOpen(true);
            } else {
                toast({ variant: 'destructive', title: 'Archivo Inválido', description: 'Por favor, seleccione un archivo JSON.' });
            }
        }
        e.target.value = '';
    };

    const confirmRestore = async () => {
        if (!fileToRestore) return;
        
        setIsRestoreConfirmOpen(false);
        setLoadingAction('restore');
        
        const sourceName = fileToRestore.name;
        addLog(`Iniciando restauración desde: ${sourceName}...`);

        try {
            addLog('Limpiando datos actuales antes de restaurar...');
            await clearAllData(false);
            addLog('Datos actuales eliminados.');

            let jsonString = await fileToRestore.text();
            
            const backupData = JSON.parse(jsonString);
            
            for (const collectionName of COLLECTIONS_TO_BACKUP) {
                if (backupData[collectionName]) {
                    addLog(`Restaurando colección: ${collectionName}...`);
                    const collectionData = backupData[collectionName];
                    const batch = writeBatch(db); // Create a new batch for each collection to avoid size limits
                    for (const docData of collectionData) {
                        const { id, ...data } = docData;
                        // Firestore timestamps from ISO string needs conversion on restore
                        const restoredData = Object.entries(data).reduce((acc, [key, value]) => {
                             if (typeof value === 'string' && /^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}.\\d{3}Z$/.test(value)) {
                                acc[key] = Timestamp.fromDate(new Date(value));
                            } else {
                                acc[key] = value;
                            }
                            return acc;
                        }, {} as {[key: string]: any});
                        
                        const docRef = doc(db, collectionName, id);
                        batch.set(docRef, restoredData);
                    }
                    await batch.commit();
                     addLog(`-> ${collectionData.length} documentos restaurados en ${collectionName}.`);
                }
            }
            addLog('¡Restauración completada exitosamente!');
            toast({ title: 'Restauración Completa', description: 'Los datos han sido restaurados desde el backup.', className: 'bg-green-100 border-green-400 text-green-800' });
            
        } catch (error) {
            console.error('Error durante la restauración:', error);
            const errorMessage = error instanceof Error ? error.message : 'Error desconocido.';
            addLog(`ERROR al restaurar: ${errorMessage}`);
            toast({ variant: 'destructive', title: 'Error de Restauración', description: 'El archivo de backup podría estar corrupto o tener un formato incorrecto.' });
        } finally {
             setLoadingAction(null);
             setFileToRestore(null);
        }
    };
    
    const clearAllData = async (showToasts = true) => {
        try {
            for (const collectionName of COLLECTIONS_TO_BACKUP) {
                if(showToasts) addLog(`Limpiando colección: ${collectionName}...`);
                const collectionRef = collection(db, collectionName);
                const snapshot = await getDocs(collectionRef);
                if (snapshot.empty) continue;
                const batch = writeBatch(db);
                snapshot.docs.forEach(d => batch.delete(d.ref));
                await batch.commit();
                if(showToasts) addLog(`-> ${snapshot.size} documentos eliminados de ${collectionName}.`);
            }
             if(showToasts) {
                addLog('¡Limpieza de datos completada!');
                toast({ title: 'Datos Eliminados', description: 'Todas las colecciones han sido limpiadas.', className: 'bg-green-100 border-green-400 text-green-800' });
             }
        } catch (error) {
             console.error('Error limpiando datos:', error);
             const errorMessage = error instanceof Error ? error.message : 'Error desconocido.';
             if(showToasts) {
                addLog(`ERROR al limpiar datos: ${errorMessage}`);
                toast({ variant: 'destructive', title: 'Error', description: 'No se pudo completar la limpieza de datos.' });
             }
             throw error;
        }
    };


    const handleClearData = async () => {
        setIsClearConfirmOpen(false);
        setLoadingAction('clear');
        addLog('Iniciando limpieza de todos los datos...');
        await clearAllData();
        setLoadingAction(null);
    };

    const handleCopyRules = () => {
        navigator.clipboard.writeText(FIRESTORE_RULES);
        toast({
            title: 'Reglas Copiadas',
            description: 'Las reglas de Firestore han sido copiadas a tu portapapeles.',
        });
    };
    
    const handleCopyFullCode = () => {
        const codeToCopy = `// FILE: .env


// FILE: README.md
# Firebase Studio

This is a NextJS starter in Firebase Studio.

To get started, take a look at src/app/page.tsx.


// FILE: apphosting.yaml
# Settings to manage and configure a Firebase App Hosting backend.
# https://firebase.google.com/docs/app-hosting/configure

runConfig:
  # Increase this value if you'd like to automatically spin up
  # more instances in response to increased traffic.
  maxInstances: 1


// FILE: components.json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "default",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.ts",
    "css": "src/app/globals.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "iconLibrary": "lucide"
}


// FILE: next.config.ts
import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    // allowedDevOrigins is no longer an experimental feature.
  },
  allowedDevOrigins: ["https://6000-firebase-studio-1755127519376.cluster-joak5ukfbnbyqspg4tewa33d24.cloudworkstations.dev"],
  webpack(config) {
    config.module.rules.push({
      test: /\\.svg$/,
      use: ["@svgr/webpack"]
    });

    return config;
  },
};

export default nextConfig;


// FILE: package.json
{
  "name": "nextn",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "GENKIT_TELEMETRY_DISABLED=true genkit start -- tsx --watch src/ai/flows/*.ts & next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@fortawesome/fontawesome-svg-core": "^6.5.2",
    "@fortawesome/free-solid-svg-icons": "^6.5.2",
    "@fortawesome/react-fontawesome": "^0.2.2",
    "@genkit-ai/googleai": "^1.14.1",
    "@genkit-ai/next": "^1.14.1",
    "@hookform/resolvers": "^4.1.3",
    "@radix-ui/react-accordion": "^1.2.3",
    "@radix-ui/react-alert-dialog": "^1.1.6",
    "@radix-ui/react-avatar": "^1.1.3",
    "@radix-ui/react-checkbox": "^1.1.4",
    "@radix-ui/react-collapsible": "^1.1.11",
    "@radix-ui/react-dialog": "^1.1.6",
    "@radix-ui/react-dropdown-menu": "^2.1.6",
    "@radix-ui/react-label": "^2.1.2",
    "@radix-ui/react-menubar": "^1.1.6",
    "@radix-ui/react-popover": "^1.1.6",
    "@radix-ui/react-progress": "^1.1.2",
    "@radix-ui/react-radio-group": "^1.2.3",
    "@radix-ui/react-scroll-area": "^1.2.3",
    "@radix-ui/react-select": "^2.1.6",
    "@radix-ui/react-separator": "^1.1.2",
    "@radix-ui/react-slider": "^1.2.3",
    "@radix-ui/react-slot": "^1.2.3",
    "@radix-ui/react-switch": "^1.1.3",
    "@radix-ui/react-tabs": "^1.1.3",
    "@radix-ui/react-toast": "^1.2.6",
    "@radix-ui/react-tooltip": "^1.1.8",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "date-fns": "^3.6.0",
    "dotenv": "^16.5.0",
    "embla-carousel-react": "^8.6.0",
    "firebase": "^11.9.1",
    "genkit": "^1.14.1",
    "html2canvas": "^1.4.1",
    "jspdf": "^2.5.1",
    "jspdf-autotable": "^3.8.2",
    "lucide-react": "^0.475.0",
    "next": "15.3.3",
    "patch-package": "^8.0.0",
    "react": "^18.3.1",
    "react-day-picker": "^8.10.1",
    "react-dom": "^18.3.1",
    "react-firebase-hooks": "^5.1.1",
    "react-hook-form": "^7.54.2",
    "recharts": "^2.15.1",
    "tailwind-merge": "^3.0.1",
    "tailwindcss-animate": "^1.0.7",
    "xlsx": "^0.18.5",
    "zod": "^3.24.2"
  },
  "devDependencies": {
    "@types/node": "^20",
    "@types/react": "^18",
    "@types/react-dom": "^18",
    "genkit-cli": "^1.14.1",
    "postcss": "^8",
    "tailwindcss": "^3.4.1",
    "typescript": "^5"
  }
}


// FILE: src/ai/dev.ts
import { config } from 'dotenv';
config();

import '@/ai/flows/community-updates.ts';
import '@/ai/flows/infer-payment-details.ts';


// FILE: src/ai/flows/community-updates.ts
'use server';
/**
 * @fileOverview A community updates AI agent.
 *
 * - getCommunityUpdates - A function that handles the community updates process.
 * - GetCommunityUpdatesInput - The input type for the getCommunityUpdates function.
 * - GetCommunityUpdatesOutput - The return type for the getCommunityUpdates function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const GetCommunityUpdatesInputSchema = z.object({
  userProfile: z
    .string()
    .describe('The user profile, including role, unit number, and name.'),
  paymentHistory: z
    .string()
    .describe('The user payment history, including dates, amounts, and status.'),
  allUpdates: z.string().describe('A list of all community updates.'),
});
export type GetCommunityUpdatesInput = z.infer<typeof GetCommunityUpdatesInputSchema>;

const GetCommunityUpdatesOutputSchema = z.object({
  updates: z
    .array(z.string())
    .length(3)
    .describe('The top 3 most relevant community updates for the user.'),
});
export type GetCommunityUpdatesOutput = z.infer<typeof GetCommunityUpdatesOutputSchema>;

export async function getCommunityUpdates(
  input: GetCommunityUpdatesInput
): Promise<GetCommunityUpdatesOutput> {
  return getCommunityUpdatesFlow(input);
}

const prompt = ai.definePrompt({
  name: 'getCommunityUpdatesPrompt',
  input: {schema: GetCommunityUpdatesInputSchema},
  output: {schema: GetCommunityUpdatesOutputSchema},
  prompt: \`You are an AI that provides community updates to users.

You will receive a user profile, their payment history, and a list of all community updates.

Based on this information, you will determine the top 3 most relevant community updates for the user.

User Profile: {{{userProfile}}}
Payment History: {{{paymentHistory}}}
All Updates: {{{allUpdates}}}

Top 3 Updates:\`,
});

const getCommunityUpdatesFlow = ai.defineFlow(
  {
    name: 'getCommunityUpdatesFlow',
    inputSchema: GetCommunityUpdatesInputSchema,
    outputSchema: GetCommunityUpdatesOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);


// FILE: src/ai/flows/infer-payment-details.ts
'use server';
/**
 * @fileOverview An AI agent for inferring payment details from natural language.
 *
 * - inferPaymentDetails - A function that interprets user text to fill out a payment form.
 * - InferPaymentDetailsInput - The input type for the inferPaymentDetails function.
 * - InferPaymentDetailsOutput - The return type for the inferPaymentDetails function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import { format } from 'date-fns';

const venezuelanBanks = [
    'banesco', 'mercantil', 'provincial', 'bdv', 'bnc', 'tesoro', 'otro'
];
const paymentMethods = ['movil', 'transferencia'];

// We define a strict output schema. The AI will do its best to conform to this.
const InferPaymentDetailsOutputSchema = z.object({
  totalAmount: z.number().describe('The numeric total amount of the payment.'),
  paymentDate: z.string().describe(\`The date of the payment in 'yyyy-MM-dd' format. Today's date is \${format(new Date(), 'yyyy-MM-dd')}.\`),
  paymentMethod: z.enum(paymentMethods).describe('The payment method used.'),
  bank: z.enum(venezuelanBanks).describe('The source bank of the payment.'),
  reference: z.string().describe('The payment reference number, containing only digits.'),
});
export type InferPaymentDetailsOutput = z.infer<typeof InferPaymentDetailsOutputSchema>;

const InferPaymentDetailsInputSchema = z.object({
  text: z.string().describe('The user-provided text describing the payment.'),
});
export type InferPaymentDetailsInput = z.infer<typeof InferPaymentDetailsInputSchema>;


export async function inferPaymentDetails(input: InferPaymentDetailsInput): Promise<InferPaymentDetailsOutput> {
  return inferPaymentDetailsFlow(input);
}


const prompt = ai.definePrompt({
  name: 'inferPaymentDetailsPrompt',
  input: {schema: InferPaymentDetailsInputSchema},
  output: {schema: InferPaymentDetailsOutputSchema},
  prompt: \`You are an expert financial assistant for a condominium management app in Venezuela. Your task is to analyze a user's text description of a payment and accurately extract the key details into a structured format.

The user will provide text that might be informal or contain abbreviations. You must interpret it correctly.

Key Information to Extract:
- Amount: The total amount paid in Bolivars (Bs.). Extract only the number.
- Date: The date the payment was made. If the user says "hoy" (today), "ayer" (yesterday), or provides a date, convert it to 'yyyy-MM-dd' format. Today is \${format(new Date(), 'yyyy-MM-dd')}.
- Method: Determine if it was a 'movil' (Pago Móvil) or 'transferencia' (Transferencia).
- Bank: Identify the bank. Common banks are Banesco, Mercantil, Provincial, Banco de Venezuela (BDV), BNC, Tesoro. If you cannot identify a specific bank, use 'otro'.
- Reference: Extract the reference number. It should be a string of digits.

Analyze the following text and return the structured data.

User's Text: {{{text}}}
\`,
});

const inferPaymentDetailsFlow = ai.defineFlow(
  {
    name: 'inferPaymentDetailsFlow',
    inputSchema: InferPaymentDetailsInputSchema,
    outputSchema: InferPaymentDetailsOutputSchema,
  },
  async (input) => {
    const {output} = await prompt(input);
    if (!output) {
      throw new Error('AI failed to infer payment details.');
    }
    // Sanitize reference to ensure it only contains digits
    output.reference = output.reference.replace(/\\D/g, '');
    return output;
  }
);


// FILE: src/ai/genkit.ts
import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';

export const ai = genkit({
  plugins: [googleAI()],
  model: 'googleai/gemini-2.0-flash',
});


// FILE: src/app/admin/dashboard/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Landmark, AlertCircle, Building, Eye, Printer, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { collection, onSnapshot, query, where, limit, orderBy, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

type Payment = {
  id: string;
  user: string;
  unit: string;
  amount: number;
  date: string;
  bank: string;
  type: string;
  status: 'aprobado' | 'pendiente' | 'rechazado';
};

type Owner = {
    id: string;
    name: string;
    properties?: { street: string, house: string }[];
};

const formatToTwoDecimals = (num: number) => {
    const truncated = Math.trunc(num * 100) / 100;
    return truncated.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};


export default function AdminDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    paymentsThisMonthBs: 0,
    paymentsThisMonthUsd: 0,
    pendingPayments: 0,
    totalUnits: 0,
  });
  const [recentPayments, setRecentPayments] = useState<Payment[]>([]);
  const [ownersMap, setOwnersMap] = useState<Map<string, Owner>>(new Map());

  useEffect(() => {
    setLoading(true);

    const ownersQuery = query(collection(db, "owners"));
    const ownersUnsubscribe = onSnapshot(ownersQuery, (snapshot) => {
        const newOwnersMap = new Map<string, Owner>();
        let totalUnits = 0;
        snapshot.forEach(doc => {
            const ownerData = doc.data() as Omit<Owner, 'id'>;
            newOwnersMap.set(doc.id, { id: doc.id, ...ownerData });
            if (ownerData.properties && ownerData.properties.length > 0) {
                totalUnits += ownerData.properties.length;
            }
        });
        setOwnersMap(newOwnersMap);
        setStats(prev => ({ ...prev, totalUnits }));

        // === Start listening to payments ONLY after owners are loaded ===
        if (newOwnersMap.size > 0) {
            const paymentsQuery = query(collection(db, "payments"));
            const paymentsUnsubscribe = onSnapshot(paymentsQuery, (snapshot) => {
                let monthTotalBs = 0;
                let monthTotalUsd = 0;
                let pendingCount = 0;
                const now = new Date();
                snapshot.forEach(doc => {
                    const payment = doc.data();
                    const paymentDate = new Date(payment.paymentDate.seconds * 1000);
                    
                    const isIncomePayment = !['adelanto', 'conciliacion', 'pago-historico'].includes(payment.paymentMethod);

                    if (payment.status === 'aprobado' && isIncomePayment && paymentDate.getMonth() === now.getMonth() && paymentDate.getFullYear() === now.getFullYear()) {
                        const amountBs = Number(payment.totalAmount);
                        monthTotalBs += amountBs;
                        if (payment.exchangeRate && payment.exchangeRate > 0) {
                            monthTotalUsd += amountBs / payment.exchangeRate;
                        }
                    }
                    if (payment.status === 'pendiente') {
                        pendingCount++;
                    }
                });
                setStats(prev => ({ ...prev, paymentsThisMonthBs: monthTotalBs, paymentsThisMonthUsd: monthTotalUsd, pendingPayments: pendingCount }));
            });

            const recentPaymentsQuery = query(collection(db, "payments"), orderBy('reportedAt', 'desc'), limit(5));
            const recentPaymentsUnsubscribe = onSnapshot(recentPaymentsQuery, (snapshot) => {
                const paymentsData = snapshot.docs.map((paymentDoc) => {
                    const data = paymentDoc.data();
                    const firstBeneficiary = data.beneficiaries?.[0];
                    
                    let userName = 'Beneficiario no identificado';
                    let unit = 'Propiedad no especificada';

                    if (firstBeneficiary?.ownerId) {
                        const owner = newOwnersMap.get(firstBeneficiary.ownerId);
                        if(owner) {
                            userName = owner.name;
                            // Determine the unit string
                            if (data.beneficiaries?.length > 1) {
                                unit = "Múltiples Propiedades";
                            } else if (firstBeneficiary.street && firstBeneficiary.house) {
                                unit = \`\${firstBeneficiary.street} - \${firstBeneficiary.house}\`;
                            } else if (owner.properties && owner.properties.length > 0) {
                                // Fallback to the first property of the owner from the map
                                unit = \`\${owner.properties[0].street} - \${owner.properties[0].house}\`;
                            }
                        }
                    } else if (firstBeneficiary?.ownerName) {
                        userName = firstBeneficiary.ownerName;
                    }

                    return { 
                        id: paymentDoc.id,
                        user: userName,
                        unit: unit,
                        amount: data.totalAmount,
                        date: new Date(data.paymentDate.seconds * 1000).toISOString(),
                        bank: data.bank,
                        type: data.paymentMethod,
                        status: data.status,
                    };
                });
                setRecentPayments(paymentsData);
                setLoading(false);
            });

            // Return cleanup function for payment listeners
            return () => {
                paymentsUnsubscribe();
                recentPaymentsUnsubscribe();
            };
        } else {
             setLoading(false); // No owners found, stop loading
        }
    });

    // Return cleanup function for the main owner listener
    return () => {
        ownersUnsubscribe();
    };
}, []);


  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold font-headline">Panel de Administrador</h1>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pagos Recibidos este Mes</CardTitle>
            <Landmark className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : (
              <div>
                <div className="text-2xl font-bold">Bs. {formatToTwoDecimals(stats.paymentsThisMonthBs)}</div>
                <p className="text-xs text-muted-foreground">~ ${formatToTwoDecimals(stats.paymentsThisMonthUsd)}</p>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pagos Pendientes</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : <div className="text-2xl font-bold">{stats.pendingPayments}</div>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Unidades Totales</CardTitle>
            <Building className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : <div className="text-2xl font-bold">{stats.totalUnits}</div>}
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="text-2xl font-bold mb-4 font-headline">Últimos Pagos Registrados</h2>
        <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Unidad</TableHead>
                  <TableHead>Monto</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Banco</TableHead>
                  <TableHead>Tipo de Pago</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-24 text-center">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
                    </TableCell>
                  </TableRow>
                ) : recentPayments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                      No hay pagos registrados recientemente.
                    </TableCell>
                  </TableRow>
                ) : (
                  recentPayments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell>{payment.user}</TableCell>
                    <TableCell>{payment.unit}</TableCell>
                    <TableCell>
                        {payment.type === 'adelanto' 
                            ? \`$ \${formatToTwoDecimals(payment.amount)}\`
                            : \`Bs. \${formatToTwoDecimals(payment.amount)}\`
                        }
                    </TableCell>
                    <TableCell>{new Date(payment.date).toLocaleDateString('es-VE')}</TableCell>
                    <TableCell>{payment.bank}</TableCell>
                    <TableCell>{payment.type}</TableCell>
                    <TableCell>
                      <Badge variant={payment.status === 'aprobado' ? 'success' : payment.status === 'rechazado' ? 'destructive' : 'warning'}>
                        {payment.status.charAt(0).toUpperCase() + payment.status.slice(1)}
                      </Badge>
                    </TableCell>
                    <TableCell className="flex gap-2">
                        <Button variant="ghost" size="icon">
                            <Eye className="h-4 w-4"/>
                            <span className="sr-only">Ver</span>
                        </Button>
                        <Button variant="ghost" size="icon">
                            <Printer className="h-4 w-4"/>
                            <span className="sr-only">Imprimir</span>
                        </Button>
                    </TableCell>
                  </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
        </Card>
      </div>
    </div>
  );
}


// FILE: src/app/admin/debts/page.tsx
'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PlusCircle, MoreHorizontal, Edit, Trash2, Loader2, Info, ArrowLeft, Search, WalletCards, Calculator, Minus, Equal, FileDown, FileCog, CalendarPlus, Building, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { collection, query, onSnapshot, where, doc, getDoc, writeBatch, updateDoc, deleteDoc, runTransaction, Timestamp, getDocs, addDoc, orderBy, setDoc, limit, deleteField } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Badge } from '@/components/ui/badge';
import { differenceInCalendarMonths, format, addMonths, startOfMonth } from 'date-fns';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';


type Owner = {
    id: string;
    name: string;
    balance: number;
    pendingDebtUSD: number;
    properties?: { street: string, house: string }[];
};

type Property = {
    street: string;
    house: string;
};

type Debt = {
    id:string;
    ownerId: string;
    property: Property;
    year: number;
    month: number;
    amountUSD: number;
    description: string;
    status: 'pending' | 'paid';
    paidAmountUSD?: number;
    paymentDate?: Timestamp;
    paymentId?: string;
};

type Payment = {
    id: string;
    paymentDate: Timestamp;
    bank: string;
    paymentMethod: string;
    reference: string;
};


type View = 'list' | 'detail';

type MassDebt = {
    description: string;
    amountUSD: number;
    fromMonth: number;
    fromYear: number;
    toMonth: number;
    toYear: number;
};

type CompanyInfo = {
    name: string;
    address: string;
    rif: string;
    phone: string;
    email: string;
    logo: string;
};

const emptyMassDebt: MassDebt = { 
    description: 'Cuota de Condominio', 
    amountUSD: 25, 
    fromMonth: new Date().getMonth() + 1,
    fromYear: new Date().getFullYear(),
    toMonth: new Date().getMonth() + 1,
    toYear: new Date().getFullYear(),
};

const months = [
    { value: 1, label: 'Enero' }, { value: 2, label: 'Febrero' }, { value: 3, label: 'Marzo' },
    { value: 4, label: 'Abril' }, { value: 5, label: 'Mayo' }, { value: 6, label: 'Junio' },
    { value: 7, label: 'Julio' }, { value: 8, label: 'Agosto' }, { value: 9, label: 'Septiembre' },
    { value: 10, label: 'Octubre' }, { value: 11, label: 'Noviembre' }, { value: 12, label: 'Diciembre' }
];

const years = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() + 5 - i);

const formatToTwoDecimals = (num: number) => {
    const truncated = Math.trunc(num * 100) / 100;
    return truncated.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};


const ADMIN_USER_ID = 'G2jhcEnp05TcvjYj8SwhzVCHbW83'; // EDWIN AGUIAR's ID

export default function DebtManagementPage() {
    const [view, setView] = useState<View>('list');
    const [owners, setOwners] = useState<Owner[]>([]);
    const [loading, setLoading] = useState(true);
    const [isReconciling, setIsReconciling] = useState(false);
    const [isGeneratingMonthlyDebt, setIsGeneratingMonthlyDebt] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeRate, setActiveRate] = useState(0);
    const [condoFee, setCondoFee] = useState(0);
    const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);

    const [selectedOwner, setSelectedOwner] = useState<Owner | null>(null);
    const [selectedOwnerDebts, setSelectedOwnerDebts] = useState<Debt[]>([]);
    const [loadingDebts, setLoadingDebts] = useState(false);
    
    const [isMassDebtDialogOpen, setIsMassDebtDialogOpen] = useState(false);
    const [currentMassDebt, setCurrentMassDebt] = useState<MassDebt>(emptyMassDebt);
    const [propertyForMassDebt, setPropertyForMassDebt] = useState<Property | null>(null);
    
    const [isEditDebtDialogOpen, setIsEditDebtDialogOpen] = useState(false);
    const [debtToEdit, setDebtToEdit] = useState<Debt | null>(null);
    const [currentDebtData, setCurrentDebtData] = useState<{description: string, amountUSD: number | string}>({ description: '', amountUSD: '' });

    const [debtToDelete, setDebtToDelete] = useState<Debt | null>(null);
    const [isDeleteConfirmationOpen, setIsDeleteConfirmationOpen] = useState(false);
    
    const { toast } = useToast();
    
    const forceUpdateDebtState = useCallback(async (showToast = false) => {
        if(showToast) toast({ title: "Sincronizando...", description: "Recalculando todas las deudas pendientes." });
        
        const debtsQuery = query(collection(db, "debts"), where("status", "==", "pending"));
        const snapshot = await getDocs(debtsQuery);
        
        setOwners(prevOwners => {
            const debtsByOwner: { [key: string]: number } = {};
            prevOwners.forEach(owner => {
                debtsByOwner[owner.id] = 0;
            });

            snapshot.forEach(doc => {
                const debt = doc.data();
                if (debt.ownerId) {
                    debtsByOwner[debt.ownerId] = (debtsByOwner[debt.ownerId] || 0) + debt.amountUSD;
                }
            });
            
            return prevOwners.map(owner => ({
                ...owner,
                pendingDebtUSD: debtsByOwner[owner.id] || 0
            }));
        });
        if(showToast) toast({ title: "Saldos Sincronizados", description: "Las deudas pendientes se han actualizado.", className: "bg-green-100 border-green-400 text-green-800" });

    }, [toast]);


    // Fetch All Owners and initial data
    useEffect(() => {
        setLoading(true);

        const fetchInitialSettings = async () => {
             try {
                const settingsRef = doc(db, 'config', 'mainSettings');
                const settingsSnap = await getDoc(settingsRef);
                if (settingsSnap.exists()) {
                    const settings = settingsSnap.data();
                    setCompanyInfo(settings.companyInfo as CompanyInfo);
                    setCondoFee(settings.condoFee || 0);
                    const rates = (settings.exchangeRates || []);
                    const activeRateObj = rates.find((r: any) => r.active);
                    if (activeRateObj) {
                        setActiveRate(activeRateObj.rate);
                    } else if (rates.length > 0) {
                        const sortedRates = [...rates].sort((a:any,b:any) => new Date(b.date).getTime() - new Date(a.date).getTime());
                        setActiveRate(sortedRates[0].rate);
                    }
                }
            } catch (error) {
                console.error("Error fetching settings:", error);
                toast({ variant: 'destructive', title: 'Error de Carga', description: 'No se pudieron cargar datos críticos.' });
            }
        };

        const ownersQuery = query(collection(db, "owners"));
        const ownersUnsubscribe = onSnapshot(ownersQuery, async (snapshot) => {
            const ownersData: Owner[] = snapshot.docs.map(doc => {
                const data = doc.data();
                return { 
                    id: doc.id, 
                    name: data.name, 
                    balance: data.balance || 0,
                    pendingDebtUSD: 0, // Will be calculated by the debts listener
                    properties: data.properties,
                };
            }).filter(owner => owner.id !== ADMIN_USER_ID); // Exclude admin
            setOwners(ownersData);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching owners:", error);
            toast({ variant: 'destructive', title: 'Error de Carga', description: 'No se pudieron cargar los propietarios.' });
            setLoading(false);
        });
        
        fetchInitialSettings();

        return () => ownersUnsubscribe();

    }, [toast]);

    // REAL-TIME DEBT LISTENER
    useEffect(() => {
        const debtsQuery = query(collection(db, "debts"), where("status", "==", "pending"));
        
        const unsubscribe = onSnapshot(debtsQuery, (snapshot) => {
            setOwners(prevOwners => {
                const debtsByOwner: { [key: string]: number } = {};
                // Initialize all owners with 0 debt
                prevOwners.forEach(owner => {
                    debtsByOwner[owner.id] = 0;
                });

                // Calculate pending debt only for those who have it
                snapshot.forEach(doc => {
                    const debt = doc.data();
                    if (debt.ownerId && debt.ownerId !== ADMIN_USER_ID) {
                        debtsByOwner[debt.ownerId] = (debtsByOwner[debt.ownerId] || 0) + debt.amountUSD;
                    }
                });
                
                // Map the new debts to the owners
                return prevOwners.map(owner => ({
                    ...owner,
                    pendingDebtUSD: debtsByOwner[owner.id] || 0
                }));
            });

        }, (error) => {
            console.error("Error listening to debts:", error);
            toast({ variant: 'destructive', title: 'Error de Sincronización', description: 'No se pudo actualizar el estado de las deudas en tiempo real.' });
        });

        return () => unsubscribe();
    }, [toast]);

     const handleReconcileAll = useCallback(async () => {
        if (activeRate <= 0 || condoFee <= 0) {
            toast({ variant: 'destructive', title: 'Error de Configuración', description: 'Tasa de cambio y cuota de condominio deben estar configuradas. No se puede conciliar.' });
            return;
        }

        setIsReconciling(true);
        toast({ title: 'Iniciando conciliación...', description: 'Procesando deudas y saldos a favor. Esto puede tardar.' });
        
        const ownersWithBalance = owners.filter(o => Number(o.balance) > 0 && o.id !== ADMIN_USER_ID);

        if (ownersWithBalance.length === 0) {
             toast({ title: 'Sin Saldos a Favor', description: 'Ningún propietario tiene saldo a favor para conciliar.' });
             setIsReconciling(false);
             return;
        }
        
        let reconciledCount = 0;
        let processedOwners = 0;
        const condoFeeInBs = condoFee * activeRate;

        for (const owner of ownersWithBalance) {
            processedOwners++;
            try {
                await runTransaction(db, async (transaction) => {
                    const ownerRef = doc(db, 'owners', owner.id);
                    const ownerDoc = await transaction.get(ownerRef);
                    if (!ownerDoc.exists()) throw new Error(\`Propietario \${owner.id} no encontrado.\`);

                    let availableBalance = Number(ownerDoc.data().balance || 0);
                    if (availableBalance <= 0) return;

                    // --- Phase 1: Pay off existing pending debts ---
                    // Fetch all pending debts for the owner without complex ordering on the server
                    const debtsQuery = query(
                        collection(db, 'debts'),
                        where('ownerId', '==', owner.id),
                        where('status', '==', 'pending')
                    );
                    
                    const debtsSnapshot = await getDocs(debtsQuery);
                    // Sort the documents client-side
                    const sortedDebts = debtsSnapshot.docs.sort((a, b) => {
                        const dataA = a.data();
                        const dataB = b.data();
                        if (dataA.year !== dataB.year) {
                            return dataA.year - dataB.year;
                        }
                        return dataA.month - dataB.month;
                    });
                    
                    let balanceChanged = false;

                    if (sortedDebts.length > 0) {
                        for (const debtDoc of sortedDebts) {
                            const debt = { id: debtDoc.id, ...debtDoc.data() } as Debt;
                            const debtAmountBs = debt.amountUSD * activeRate;
                            
                            if (Math.round(availableBalance * 100) >= Math.round(debtAmountBs * 100)) {
                                availableBalance -= debtAmountBs;
                                
                                const paymentRef = doc(collection(db, "payments"));
                                transaction.set(paymentRef, {
                                    reportedBy: owner.id,
                                    beneficiaries: [{ ownerId: owner.id, ownerName: owner.name, ...debt.property, amount: debtAmountBs }],
                                    totalAmount: debtAmountBs,
                                    exchangeRate: activeRate,
                                    paymentDate: Timestamp.now(),
                                    reportedAt: Timestamp.now(),
                                    paymentMethod: 'conciliacion',
                                    bank: 'Sistema (Saldo a Favor)',
                                    reference: \`CONC-\${debt.year}-\${debt.month}\`,
                                    status: 'aprobado',
                                    observations: \`Cuota de \${months.find(m=>m.value === debt.month)?.label} \${debt.year} pagada por conciliación para \${debt.property.street} - \${debt.property.house}.\`,
                                });

                                transaction.update(debtDoc.ref, {
                                    status: 'paid',
                                    paidAmountUSD: debt.amountUSD,
                                    paymentDate: Timestamp.now(),
                                    paymentId: paymentRef.id
                                });

                                balanceChanged = true;
                            } else {
                                break; 
                            }
                        }
                    }

                    // --- Phase 2: Proactively pay future fees with remaining balance ---
                    if (owner.properties && owner.properties.length > 0 && Math.round(availableBalance * 100) >= Math.round(condoFeeInBs * 100)) {
                        
                        const allExistingDebtsQuery = query(collection(db, 'debts'), where('ownerId', '==', owner.id));
                        const allExistingDebtsSnap = await getDocs(allExistingDebtsQuery);
                        const existingDebtPeriodsByProp = new Map<string, Set<string>>();
                        allExistingDebtsSnap.docs.forEach(d => {
                            const debtData = d.data();
                            if (debtData.property && debtData.property.street && debtData.property.house) {
                                const propKey = \`\${debtData.property.street}-\${debtData.property.house}\`;
                                if(!existingDebtPeriodsByProp.has(propKey)) existingDebtPeriodsByProp.set(propKey, new Set());
                                existingDebtPeriodsByProp.get(propKey)!.add(\`\${debtData.year}-\${debtData.month}\`);
                            }
                        });
                        
                        const startDate = startOfMonth(new Date());

                        for (const property of owner.properties) {
                             if (!property || !property.street || !property.house) continue;
                             const propKey = \`\${property.street}-\${property.house}\`;
                             const existingDebtsForProp = existingDebtPeriodsByProp.get(propKey) || new Set();

                             for (let i = 0; i < 12; i++) { // Look ahead 12 months
                                const futureDebtDate = addMonths(startDate, i);
                                const futureYear = futureDebtDate.getFullYear();
                                const futureMonth = futureDebtDate.getMonth() + 1;
                                const periodKey = \`\${futureYear}-\${futureMonth}\`;
                                
                                if (existingDebtsForProp.has(periodKey)) continue; // Skip if debt already exists for this prop

                                if (Math.round(availableBalance * 100) >= Math.round(condoFeeInBs * 100)) {
                                    availableBalance -= condoFeeInBs;
                                    const paymentDate = Timestamp.now();
                                    const paymentRef = doc(collection(db, 'payments'));
                                    transaction.set(paymentRef, {
                                        reportedBy: owner.id,
                                        beneficiaries: [{ ownerId: owner.id, ownerName: owner.name, ...property, amount: condoFeeInBs }],
                                        totalAmount: condoFeeInBs,
                                        exchangeRate: activeRate,
                                        paymentDate: paymentDate,
                                        reportedAt: paymentDate,
                                        paymentMethod: 'conciliacion',
                                        bank: 'Sistema (Adelanto por Saldo)',
                                        reference: \`CONC-ADV-\${futureYear}-\${futureMonth}\`,
                                        status: 'aprobado',
                                        observations: \`Cuota de \${months.find(m=>m.value === futureMonth)?.label} \${futureYear} para \${property.street} - \${property.house} pagada por adelanto automático.\`
                                    });

                                    const debtRef = doc(collection(db, 'debts'));
                                    transaction.set(debtRef, {
                                        ownerId: owner.id,
                                        property: property,
                                        year: futureYear,
                                        month: futureMonth,
                                        amountUSD: condoFee,
                                        description: "Cuota de Condominio (Pagada por adelantado)",
                                        status: 'paid',
                                        paidAmountUSD: condoFee,
                                        paymentDate: paymentDate,
                                        paymentId: paymentRef.id,
                                    });

                                    balanceChanged = true;

                                } else {
                                    break;
                                }
                            }
                        }
                    }
    
                    if (balanceChanged) {
                        transaction.update(ownerRef, { balance: availableBalance });
                        if(!reconciledCount) reconciledCount++;
                    }
                });
            } catch (error) {
                console.error(\`Error procesando propietario \${owner.id}:\`, error);
            }
        }

        if (reconciledCount > 0) {
            toast({
                title: 'Conciliación Completada',
                description: \`Se procesaron las cuentas de \${reconciledCount} de \${processedOwners} propietarios con saldo.\`,
                className: 'bg-green-100 border-green-400 text-green-800'
            });
        } else {
             toast({ title: 'Sin Conciliaciones Necesarias', description: 'Ningún propietario tiene saldo suficiente para cubrir deudas pendientes o adelantar cuotas.' });
        }

        setIsReconciling(false);
    }, [toast, activeRate, condoFee, owners]);

    
    const handleGenerateMonthlyDebt = async () => {
        setIsGeneratingMonthlyDebt(true);
        toast({ title: 'Iniciando proceso...', description: 'Generando deudas para el mes en curso.' });

        if (condoFee <= 0) {
            toast({ variant: 'destructive', title: 'Error de Configuración', description: 'La cuota de condominio no está configurada o es cero.' });
            setIsGeneratingMonthlyDebt(false);
            return;
        }

        try {
            const today = new Date();
            const year = today.getFullYear();
            const month = today.getMonth() + 1;

            const existingDebtsQuery = query(collection(db, 'debts'), where('year', '==', year), where('month', '==', month));
            const existingDebtsSnapshot = await getDocs(existingDebtsQuery);
            const ownersWithDebtForProp = new Set(existingDebtsSnapshot.docs.map(doc => {
                const data = doc.data();
                if (data.property && data.property.street && data.property.house) {
                    return \`\${data.ownerId}-\${data.property.street}-\${data.property.house}\`;
                }
                return null;
            }).filter(Boolean));

            const batch = writeBatch(db);
            let newDebtsCount = 0;

            const ownersToProcess = owners.filter(owner => owner.id !== ADMIN_USER_ID);

            for (const owner of ownersToProcess) {
                if (owner.properties && owner.properties.length > 0) {
                    for (const property of owner.properties) {
                         if (property && property.street && property.house) {
                            const key = \`\${owner.id}-\${property.street}-\${property.house}\`;
                            if (!ownersWithDebtForProp.has(key)) {
                                const debtRef = doc(collection(db, 'debts'));
                                batch.set(debtRef, {
                                    ownerId: owner.id,
                                    property: property,
                                    year: year,
                                    month: month,
                                    amountUSD: condoFee,
                                    description: 'Cuota de Condominio',
                                    status: 'pending'
                                });
                                newDebtsCount++;
                            }
                        }
                    }
                }
            }

            if (newDebtsCount === 0) {
                 toast({ title: 'Proceso Completado', description: 'Todos los propietarios ya tienen una deuda (pagada o pendiente) para el mes en curso.' });
                setIsGeneratingMonthlyDebt(false);
                return;
            }
            
            await batch.commit();

            toast({
                title: 'Deudas Generadas Exitosamente',
                description: \`Se han generado \${newDebtsCount} nuevas deudas para el mes de \${months.find(m => m.value === month)?.label} \${year}.\`,
                className: 'bg-green-100 border-green-400 text-green-800'
            });

        } catch (error) {
            console.error("Error generating monthly debt: ", error);
            const errorMessage = error instanceof Error ? error.message : "Ocurrió un error desconocido.";
            toast({ variant: 'destructive', title: 'Error al Generar Deudas', description: errorMessage });
        } finally {
            setIsGeneratingMonthlyDebt(false);
        }
    };


    // Filter owners based on search term
    const filteredOwners = useMemo(() => {
        if (!searchTerm) return owners;
        const lowerCaseSearch = searchTerm.toLowerCase();
        return owners.filter(owner => {
            const ownerName = owner.name.toLowerCase();
            const propertiesMatch = owner.properties?.some(p => 
                p && (String(p.house).toLowerCase().includes(lowerCaseSearch) ||
                String(p.street).toLowerCase().includes(lowerCaseSearch))
            );
            return ownerName.includes(lowerCaseSearch) || propertiesMatch;
        });
    }, [searchTerm, owners]);

    // Fetch Debts for selected owner when view changes to 'detail'
    useEffect(() => {
        if (view !== 'detail' || !selectedOwner) {
            setSelectedOwnerDebts([]);
            return;
        }

        setLoadingDebts(true);
        const q = query(collection(db, "debts"), where("ownerId", "==", selectedOwner.id));
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const debtsData: Debt[] = [];
            querySnapshot.forEach((doc) => {
                debtsData.push({ id: doc.id, ...doc.data() } as Debt);
            });
            setSelectedOwnerDebts(debtsData.sort((a,b) => b.year - a.year || b.month - a.month));
            setLoadingDebts(false);
        }, (error) => {
            console.error("Error fetching owner debts:", error);
            setLoadingDebts(false);
        });

        return () => unsubscribe();
    }, [view, selectedOwner]);
    
    // Group debts by property for the detailed view
    const debtsByProperty = useMemo(() => {
        const grouped = new Map<string, { pending: Debt[], paid: Debt[] }>();
        if (!selectedOwner || !selectedOwner.properties) return grouped;

        // Initialize map with all properties of the owner
        selectedOwner.properties.forEach(prop => {
            if (prop && prop.street && prop.house) {
                const key = \`\${prop.street}-\${prop.house}\`;
                grouped.set(key, { pending: [], paid: [] });
            }
        });

        // Group debts into the map
        selectedOwnerDebts.forEach(debt => {
            // Defensive check: only process debts with valid property info
            if (debt.property && debt.property.street && debt.property.house) {
                const key = \`\${debt.property.street}-\${debt.property.house}\`;
                if (!grouped.has(key)) {
                     grouped.set(key, { pending: [], paid: [] });
                }
                if (debt.status === 'pending') {
                    grouped.get(key)!.pending.push(debt);
                } else {
                    grouped.get(key)!.paid.push(debt);
                }
            }
        });
        
        // Sort debts within each group from most recent to oldest
        grouped.forEach(value => {
            value.pending.sort((a,b) => b.year - a.year || b.month - a.month);
            value.paid.sort((a,b) => b.year - a.year || b.month - a.month);
        });

        return grouped;
    }, [selectedOwner, selectedOwnerDebts]);


    // Calculate payment details for a specific property
    const paymentCalculator = useCallback((property: Property) => {
        if (!selectedOwner || activeRate <= 0) return { totalSelectedBs: 0, balanceInFavor: 0, totalToPay: 0, hasSelection: false };

        const propKey = \`\${property.street}-\${property.house}\`;
        const pendingDebtsForProperty = debtsByProperty.get(propKey)?.pending || [];
            
        const totalSelectedDebtUSD = pendingDebtsForProperty.reduce((sum, debt) => sum + debt.amountUSD, 0);
        const totalSelectedDebtBs = totalSelectedDebtUSD * activeRate;
        
        const totalToPay = Math.max(0, totalSelectedDebtBs - selectedOwner.balance);

        return {
            totalSelectedBs: totalSelectedDebtBs,
            balanceInFavor: selectedOwner.balance,
            totalToPay: totalToPay,
            hasSelection: pendingDebtsForProperty.length > 0,
        };
    }, [debtsByProperty, selectedOwner, activeRate]);

    const handleManageOwnerDebts = (owner: Owner) => {
        setSelectedOwner(owner);
        setView('detail');
    };

    const handleAddMassiveDebt = (property: Property) => {
        if (!selectedOwner) return;
        const today = new Date();
        setPropertyForMassDebt(property);
        setCurrentMassDebt({
             ...emptyMassDebt,
             fromMonth: today.getMonth() + 1,
             fromYear: today.getFullYear(),
             toMonth: today.getMonth() + 1,
             toYear: today.getFullYear(),
        });
        setIsMassDebtDialogOpen(true);
    };

    const handleEditDebt = (debt: Debt) => {
        setDebtToEdit(debt);
        setCurrentDebtData({ description: debt.description, amountUSD: debt.amountUSD });
        setIsEditDebtDialogOpen(true);
    };
    
    const handleDeleteDebt = (debt: Debt) => {
        setDebtToDelete(debt);
        setIsDeleteConfirmationOpen(true);
    }
    
    const confirmDelete = async () => {
        if (!debtToDelete || !selectedOwner) return;
    
        try {
            const ownerRef = doc(db, "owners", selectedOwner.id);
            const debtRef = doc(db, "debts", debtToDelete.id);
            
            await runTransaction(db, async (transaction) => {
                const ownerDoc = await transaction.get(ownerRef);
                
                if (!ownerDoc.exists()) throw "El documento del propietario no existe.";
    
                if (debtToDelete.status === 'paid' && debtToDelete.paidAmountUSD && activeRate > 0) {
                     const currentBalanceBs = ownerDoc.data().balance || 0;
                     const debtAmountBs = debtToDelete.paidAmountUSD * activeRate;
                     const newBalanceBs = currentBalanceBs + debtAmountBs;
                     transaction.update(ownerRef, { balance: newBalanceBs });
    
                     if (debtToDelete.paymentId) {
                         const paymentRef = doc(db, "payments", debtToDelete.paymentId);
                         transaction.delete(paymentRef);
                     }
                }
                
                transaction.delete(debtRef);
            });
    
            toast({ title: 'Deuda Eliminada', description: 'La deuda ha sido eliminada y el saldo del propietario ha sido ajustado si correspondía.' });
    
        } catch (error) {
            console.error("Error deleting debt: ", error);
            const errorMessage = typeof error === 'string' ? error : (error instanceof Error ? error.message : 'No se pudo eliminar la deuda.');
            toast({ variant: 'destructive', title: 'Error', description: errorMessage });
        } finally {
            setIsDeleteConfirmationOpen(false);
            setDebtToDelete(null);
        }
    }

    const handleSaveMassDebt = async () => {
        if (!selectedOwner || !propertyForMassDebt) return;
        if (!currentMassDebt.description || currentMassDebt.amountUSD <= 0) {
            toast({ variant: 'destructive', title: 'Error de Validación', description: 'La descripción y un monto mayor a cero son obligatorios.' });
            return;
        }

        const { fromMonth, fromYear, toMonth, toYear, amountUSD, description } = currentMassDebt;
        const startDate = new Date(fromYear, fromMonth - 1, 1);
        const endDate = new Date(toYear, toMonth - 1, 1);

        if (startDate > endDate) {
            toast({ variant: 'destructive', title: 'Error de Fecha', description: 'La fecha "Desde" no puede ser posterior a la fecha "Hasta".' });
            return;
        }

        const monthsToGenerate = differenceInCalendarMonths(endDate, startDate) + 1;

        try {
            if (activeRate <= 0) throw "No hay una tasa de cambio activa o registrada configurada.";
            
            const existingDebtQuery = query(collection(db, 'debts'), 
                where('ownerId', '==', selectedOwner.id),
                where('property.street', '==', propertyForMassDebt.street),
                where('property.house', '==', propertyForMassDebt.house)
            );
            const existingHistoricalPaymentQuery = query(collection(db, 'historical_payments'), 
                where('ownerId', '==', selectedOwner.id),
                where('property.street', '==', propertyForMassDebt.street),
                where('property.house', '==', propertyForMassDebt.house)
            );
            
            const [existingDebtsSnapshot, existingHistoricalSnapshot] = await Promise.all([
                getDocs(existingDebtQuery),
                getDocs(existingHistoricalPaymentQuery)
            ]);
            
            const existingDebtPeriods = new Set(existingDebtsSnapshot.docs.map(d => \`\${d.data().year}-\${d.data().month}\`));
            existingHistoricalSnapshot.forEach(d => {
                existingDebtPeriods.add(\`\${d.data().referenceYear}-\${d.data().referenceMonth}\`);
            });
            
            let newDebtsCreated = 0;

            await runTransaction(db, async (transaction) => {
                const ownerRef = doc(db, "owners", selectedOwner.id);
                const ownerDoc = await transaction.get(ownerRef);
                if (!ownerDoc.exists()) throw "El documento del propietario no existe.";

                let currentBalanceBs = ownerDoc.data().balance || 0;

                for (let i = 0; i < monthsToGenerate; i++) {
                    const debtDate = addMonths(startDate, i);
                    const debtYear = debtDate.getFullYear();
                    const debtMonth = debtDate.getMonth() + 1;
                    
                    if (existingDebtPeriods.has(\`\${debtYear}-\${debtMonth}\`)) {
                        continue; 
                    }

                    newDebtsCreated++;
                    const debtAmountBs = amountUSD * activeRate;
                    const debtRef = doc(collection(db, "debts"));
                    let debtData: any = {
                        ownerId: selectedOwner.id, 
                        property: propertyForMassDebt,
                        year: debtYear, 
                        month: debtMonth,
                        amountUSD: amountUSD, 
                        description: description, 
                        status: 'pending'
                    };

                    if (currentBalanceBs >= debtAmountBs) {
                        currentBalanceBs -= debtAmountBs;
                        const paymentDate = Timestamp.now();

                        const paymentRef = doc(collection(db, "payments"));
                        transaction.set(paymentRef, {
                            reportedBy: selectedOwner.id,
                            beneficiaries: [{ ownerId: selectedOwner.id, ownerName: selectedOwner.name, ...propertyForMassDebt, amount: debtAmountBs }],
                            totalAmount: debtAmountBs,
                            exchangeRate: activeRate,
                            paymentDate: paymentDate,
                            reportedAt: paymentDate,
                            paymentMethod: 'conciliacion',
                            bank: 'Sistema (Saldo a Favor)',
                            reference: \`CONC-DEBT-\${paymentDate.toMillis()}\`,
                            status: 'aprobado',
                            observations: \`Cuota de \${months.find(m=>m.value === debtMonth)?.label} \${debtYear} para \${propertyForMassDebt.street}-\${propertyForMassDebt.house} pagada por conciliación.\`,
                        });

                        debtData = {
                            ...debtData,
                            status: 'paid',
                            paidAmountUSD: amountUSD,
                            paymentDate: paymentDate,
                            paymentId: paymentRef.id,
                        };
                    }
                    
                    transaction.set(debtRef, debtData);
                }
                
                transaction.update(ownerRef, { balance: currentBalanceBs });
            });

            toast({ title: 'Proceso Completado', description: \`Se procesaron \${monthsToGenerate} meses y se generaron \${newDebtsCreated} nuevas deudas. El saldo del propietario fue actualizado.\` });

        } catch (error) {
            console.error("Error generating mass debts: ", error);
            const errorMessage = typeof error === 'string' ? error : (error instanceof Error ? error.message : 'No se pudieron guardar las deudas.');
            toast({ variant: 'destructive', title: 'Error en la Transacción', description: errorMessage });
        } finally {
            setIsMassDebtDialogOpen(false);
            setCurrentMassDebt(emptyMassDebt);
            setPropertyForMassDebt(null);
        }
    };
    
    const handleSaveSingleDebt = async () => {
        if (!debtToEdit || !currentDebtData.description || Number(currentDebtData.amountUSD) <= 0) {
             toast({ variant: 'destructive', title: 'Error de Validación', description: 'La descripción y un monto mayor a cero son obligatorios.' });
            return;
        }

        try {
            const debtRef = doc(db, "debts", debtToEdit.id);
            await updateDoc(debtRef, {
                description: currentDebtData.description,
                amountUSD: Number(currentDebtData.amountUSD)
            });
            toast({ title: 'Deuda Actualizada', description: \`La deuda ha sido actualizada exitosamente.\` });
        } catch (error) {
            console.error("Error updating debt: ", error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo actualizar la deuda.' });
        } finally {
            setIsEditDebtDialogOpen(false);
            setDebtToEdit(null);
        }
    };

    const handleMassDebtInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { id, value, type } = e.target;
        setCurrentMassDebt({ 
            ...currentMassDebt, 
            [id]: type === 'number' ? (value === '' ? '' : parseFloat(value)) : value
        });
    };
    
    const handleMassDebtSelectChange = (field: 'fromYear' | 'fromMonth' | 'toYear' | 'toMonth') => (value: string) => {
        setCurrentMassDebt({ ...currentMassDebt, [field]: parseInt(value) });
    };

    const periodDescription = useMemo(() => {
        const { fromMonth, fromYear, toMonth, toYear } = currentMassDebt;
        const startDate = new Date(fromYear, fromMonth - 1, 1);
        const endDate = new Date(toYear, toMonth - 1, 1);
        if (startDate > endDate) return "La fecha de inicio no puede ser posterior a la fecha final.";
        
        const monthsCount = differenceInCalendarMonths(endDate, startDate) + 1;
        const fromDateStr = months.find(m => m.value === fromMonth)?.label + \` \${fromYear}\`;
        const toDateStr = months.find(m => m.value === toMonth)?.label + \` \${toYear}\`;
        
        return \`Se generarán \${monthsCount} deuda(s) para los meses sin registro previo desde \${fromDateStr} hasta \${toDateStr}.\`;
    }, [currentMassDebt]);

    const handleExportPDF = () => {
        const doc = new jsPDF();
        const pageHeight = doc.internal.pageSize.getHeight();
        const pageWidth = doc.internal.pageSize.getWidth();
        const margin = 14;

        if (companyInfo?.logo) {
            doc.addImage(companyInfo.logo, 'PNG', margin, margin, 25, 25);
        }
        if (companyInfo) {
            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.text(companyInfo.name, margin + 30, margin + 8);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.text(\`\${companyInfo.rif} | \${companyInfo.phone}\`, margin + 30, margin + 14);
            doc.text(companyInfo.address, margin + 30, margin + 19);
        }
        doc.setFontSize(10);
        doc.text(\`Fecha de Emisión: \${new Date().toLocaleDateString('es-VE')}\`, pageWidth - margin, margin + 8, { align: 'right' });
        doc.setLineWidth(0.5);
        doc.line(margin, margin + 32, pageWidth - margin, margin + 32);
        
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text("Lista de Deudas de Propietarios", pageWidth / 2, margin + 45, { align: 'center' });

        (doc as any).autoTable({
            head: [['Propietario', 'Ubicación', 'Deuda Pendiente (Bs.)', 'Saldo a Favor (Bs.)']],
            body: filteredOwners.map(o => {
                const ownerProperty = (o.properties && o.properties.length > 0) ? o.properties.map(p => \`\${p.street} - \${p.house}\`).join(', ') : 'N/A';
                const debtDisplay = o.pendingDebtUSD > 0 ? \`Bs. \${formatToTwoDecimals(o.pendingDebtUSD * activeRate)}\` : 'Bs. 0,00';
                const balanceDisplay = o.balance > 0 ? \`Bs. \${formatToTwoDecimals(o.balance)}\` : 'Bs. 0,00';
                return [o.name, ownerProperty, debtDisplay, balanceDisplay];
            }),
            startY: margin + 55,
            headStyles: { fillColor: [30, 80, 180] },
            styles: { cellPadding: 2, fontSize: 8 },
        });

        doc.save('lista_deudas_propietarios.pdf');
    };

    if (loading) {
         return (
            <div className="flex justify-center items-center h-64">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
            </div>
        );
    }
    
    // Main List View
    if (view === 'list') {
        return (
            <div className="space-y-8">
                 <div>
                    <h1 className="text-3xl font-bold font-headline">Gestión de Deudas</h1>
                    <p className="text-muted-foreground">Busque un propietario para ver o registrar sus deudas por propiedad.</p>
                </div>
                 <Card>
                    <CardHeader>
                        <div className="flex justify-between items-center gap-2 flex-wrap">
                            <CardTitle>Lista de Propietarios</CardTitle>
                            <div className="flex gap-2 flex-wrap">
                                 <Button onClick={() => forceUpdateDebtState(true)} variant="outline">
                                    <RefreshCw className="mr-2 h-4 w-4" />
                                    Sincronizar Saldos
                                </Button>
                                <Button onClick={handleGenerateMonthlyDebt} variant="outline" disabled={isGeneratingMonthlyDebt}>
                                    {isGeneratingMonthlyDebt ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <CalendarPlus className="mr-2 h-4 w-4" />}
                                    Generar Deuda del Mes
                                </Button>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="outline">
                                            <FileDown className="mr-2 h-4 w-4" />
                                            Exportar
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent>
                                        <DropdownMenuItem onClick={handleExportPDF}>Exportar a PDF</DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                        </div>
                        <div className="relative mt-2">
                             <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                             <Input 
                                placeholder="Buscar por nombre, calle o casa..." 
                                className="pl-9"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                             />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <Table>
                             <TableHeader>
                                <TableRow>
                                    <TableHead>Propietario</TableHead>
                                    <TableHead>Propiedades</TableHead>
                                    <TableHead>Deuda Pendiente (Bs.)</TableHead>
                                    <TableHead>Saldo a Favor (Bs.)</TableHead>
                                    <TableHead className="text-right">Acción</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                     <TableRow>
                                        <TableCell colSpan={5} className="h-24 text-center">
                                             <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
                                        </TableCell>
                                    </TableRow>
                                ) : filteredOwners.length === 0 ? (
                                     <TableRow>
                                        <TableCell colSpan={5} className="h-24 text-center">
                                            <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
                                                <Info className="h-8 w-8" />
                                                <span>No se encontraron propietarios.</span>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredOwners.map((owner) => {
                                        const ownerProperties = (owner.properties && owner.properties.length > 0) ? owner.properties.map(p => \`\${p.street} - \${p.house}\`).join('; ') : 'N/A';
                                        return (
                                        <TableRow key={owner.id}>
                                            <TableCell className="font-medium">{owner.name}</TableCell>
                                            <TableCell>{ownerProperties}</TableCell>
                                            <TableCell>
                                               {owner.pendingDebtUSD > 0 ? (
                                                    <Badge variant="destructive">
                                                        Bs. {formatToTwoDecimals(owner.pendingDebtUSD * activeRate)}
                                                    </Badge>
                                                ) : (
                                                    <Badge variant="outline">Bs. 0,00</Badge>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                               {Number(owner.balance) > 0 ? (
                                                    <Badge variant="success">
                                                        Bs. {formatToTwoDecimals(Number(owner.balance))}
                                                    </Badge>
                                                ) : (
                                                    <Badge variant="outline">Bs. 0,00</Badge>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Button variant="outline" size="sm" onClick={() => handleManageOwnerDebts(owner)}>
                                                    Gestionar Deudas <WalletCards className="ml-2 h-4 w-4" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    )})
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </div>
        );
    }
    
    // Detail View
    if (view === 'detail' && selectedOwner) {
        return (
            <div className="space-y-8">
                 <Button variant="outline" onClick={() => setView('list')}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Volver a la Lista
                </Button>

                <Card>
                    <CardHeader>
                         <CardTitle>Deudas de: <span className="text-primary">{selectedOwner.name}</span></CardTitle>
                         <CardDescription>Gestione las deudas para cada propiedad individualmente.</CardDescription>
                    </CardHeader>
                </Card>
                
                {loadingDebts ? (
                    <div className="flex justify-center items-center h-64">
                        <Loader2 className="h-10 w-10 animate-spin text-primary" />
                    </div>
                ) : (selectedOwner.properties && selectedOwner.properties.length > 0) ? (
                    <Accordion type="multiple" className="w-full space-y-4">
                        {selectedOwner.properties.map((property, index) => {
                             if (!property || !property.street || !property.house) return null;
                             const propKey = \`\${property.street}-\${property.house}\`;
                             const { pending: pendingDebts, paid: paidDebts } = debtsByProperty.get(propKey) || { pending: [], paid: [] };
                             const calc = paymentCalculator(property);

                            return (
                            <Card key={propKey}>
                                <AccordionItem value={propKey} className="border-b-0">
                                    <AccordionTrigger className="p-6 hover:no-underline">
                                        <div className="flex items-center gap-4 text-left">
                                             <div className="p-3 bg-muted rounded-md">
                                                <Building className="h-6 w-6 text-primary"/>
                                             </div>
                                             <div>
                                                <h3 className="text-lg font-semibold">\${property.street} - \${property.house}</h3>
                                                <p className="text-sm text-muted-foreground">{pendingDebts.length} deuda(s) pendiente(s).</p>
                                             </div>
                                        </div>
                                    </AccordionTrigger>
                                    <AccordionContent className="px-6 pb-0">
                                        <div className="border-t pt-4">
                                            <div className="flex justify-end mb-4">
                                                <Button size="sm" onClick={() => handleAddMassiveDebt(property)}>
                                                    <PlusCircle className="mr-2 h-4 w-4" />
                                                    Agregar Deuda Masiva a esta Propiedad
                                                </Button>
                                            </div>
                                            <Table>
                                                <TableHeader>
                                                    <TableRow>
                                                        <TableHead>Período</TableHead>
                                                        <TableHead>Descripción</TableHead>
                                                        <TableHead>Monto (Bs.)</TableHead>
                                                        <TableHead>Estado</TableHead>
                                                        <TableHead className="text-right">Acciones</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                     {pendingDebts.length === 0 && paidDebts.length === 0 && (
                                                         <TableRow>
                                                            <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                                                                No hay deudas registradas para esta propiedad.
                                                            </TableCell>
                                                        </TableRow>
                                                     )}
                                                     {pendingDebts.map((debt) => (
                                                        <TableRow key={debt.id}>
                                                            <TableCell className="font-medium">{months.find(m => m.value === debt.month)?.label} {debt.year}</TableCell>
                                                            <TableCell>{debt.description}</TableCell>
                                                            <TableCell>Bs. {formatToTwoDecimals(debt.amountUSD * activeRate)}</TableCell>
                                                            <TableCell><Badge variant={'warning'}>Pendiente</Badge></TableCell>
                                                            <TableCell className="text-right">
                                                                <DropdownMenu>
                                                                    <DropdownMenuTrigger asChild><Button variant="ghost" className="h-8 w-8 p-0"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                                                                    <DropdownMenuContent align="end">
                                                                        <DropdownMenuItem onClick={() => handleEditDebt(debt)}><Edit className="mr-2 h-4 w-4" />Editar</DropdownMenuItem>
                                                                        <DropdownMenuItem onClick={() => handleDeleteDebt(debt)} className="text-destructive"><Trash2 className="mr-2 h-4 w-4" />Eliminar</DropdownMenuItem>
                                                                    </DropdownMenuContent>
                                                                </DropdownMenu>
                                                            </TableCell>
                                                        </TableRow>
                                                    ))}
                                                    {paidDebts.map((debt) => (
                                                        <TableRow key={debt.id} className="text-muted-foreground">
                                                            <TableCell className="font-medium">{months.find(m => m.value === debt.month)?.label} {debt.year}</TableCell>
                                                            <TableCell>{debt.description}</TableCell>
                                                            <TableCell>Bs. {formatToTwoDecimals((debt.paidAmountUSD || debt.amountUSD) * activeRate)}</TableCell>
                                                            <TableCell><Badge variant={'success'}>Pagada</Badge></TableCell>
                                                            <TableCell className="text-right">
                                                                 <DropdownMenu>
                                                                    <DropdownMenuTrigger asChild><Button variant="ghost" className="h-8 w-8 p-0"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                                                                    <DropdownMenuContent align="end">
                                                                        <DropdownMenuItem onClick={() => handleEditDebt(debt)}><Edit className="mr-2 h-4 w-4" />Editar</DropdownMenuItem>
                                                                        <DropdownMenuItem onClick={() => handleDeleteDebt(debt)} className="text-destructive"><Trash2 className="mr-2 h-4 w-4" />Eliminar</DropdownMenuItem>
                                                                    </DropdownMenuContent>
                                                                </DropdownMenu>
                                                            </TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                             {calc.hasSelection && (
                                                <CardFooter className="p-4 bg-muted/50 border-t mt-4">
                                                    <div className="w-full max-w-md ml-auto space-y-2">
                                                        <h3 className="text-lg font-semibold flex items-center"><Calculator className="mr-2 h-5 w-5"/> Calculadora de Pago</h3>
                                                        <div className="flex justify-between items-center">
                                                            <span className="text-muted-foreground">Total Pendiente para esta propiedad:</span>
                                                            <span className="font-medium">Bs. {formatToTwoDecimals(calc.totalSelectedBs)}</span>
                                                        </div>
                                                        <div className="flex justify-between items-center text-sm">
                                                            <span className="text-muted-foreground flex items-center"><Minus className="mr-2 h-4 w-4"/> Saldo a Favor del Propietario:</span>
                                                            <span className="font-medium">Bs. {formatToTwoDecimals(calc.balanceInFavor)}</span>
                                                        </div>
                                                        <hr className="my-1"/>
                                                        <div className="flex justify-between items-center text-lg">
                                                            <span className="font-bold flex items-center"><Equal className="mr-2 h-4 w-4"/> TOTAL SUGERIDO A PAGAR:</span>
                                                            <span className="font-bold text-primary">Bs. {formatToTwoDecimals(calc.totalToPay)}</span>
                                                        </div>
                                                    </div>
                                                </CardFooter>
                                            )}
                                        </div>
                                    </AccordionContent>
                                </AccordionItem>
                            </Card>
                        )})}
                    </Accordion>
                ) : (
                     <Card>
                        <CardContent className="h-48 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                            <Info className="h-8 w-8" />
                            <span>Este propietario no tiene propiedades asignadas.</span>
                        </CardContent>
                    </Card>
                )}

                 {/* Mass Debt Dialog */}
                <Dialog open={isMassDebtDialogOpen} onOpenChange={setIsMassDebtDialogOpen}>
                    <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col">
                        <DialogHeader>
                            <DialogTitle>Agregar Deudas a {propertyForMassDebt?.street} - {propertyForMassDebt?.house}</DialogTitle>
                            <DialogDescription>
                                Seleccione el rango de fechas. El sistema generará deudas para los meses sin registro previo en ese período.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="flex-grow overflow-y-auto pr-6 -mr-6">
                            <div className="grid gap-4 py-4">
                                <div className="space-y-2">
                                    <Label htmlFor="description">Descripción</Label>
                                    <Input id="description" value={currentMassDebt.description} onChange={handleMassDebtInputChange} />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="fromYear">Desde el Año</Label>
                                        <Select onValueChange={handleMassDebtSelectChange('fromYear')} value={String(currentMassDebt.fromYear)}>
                                            <SelectTrigger><SelectValue/></SelectTrigger>
                                            <SelectContent>{years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="fromMonth">Desde el Mes</Label>
                                        <Select onValueChange={handleMassDebtSelectChange('fromMonth')} value={String(currentMassDebt.fromMonth)}>
                                            <SelectTrigger><SelectValue/></SelectTrigger>
                                            <SelectContent>{months.map(m => <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>)}</SelectContent>
                                        </Select>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="toYear">Hasta el Año</Label>
                                        <Select onValueChange={handleMassDebtSelectChange('toYear')} value={String(currentMassDebt.toYear)}>
                                            <SelectTrigger><SelectValue/></SelectTrigger>
                                            <SelectContent>{years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="toMonth">Hasta el Mes</Label>
                                        <Select onValueChange={handleMassDebtSelectChange('toMonth')} value={String(currentMassDebt.toMonth)}>
                                            <SelectTrigger><SelectValue/></SelectTrigger>
                                            <SelectContent>{months.map(m => <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>)}</SelectContent>
                                        </Select>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="amountUSD">Monto Mensual (USD)</Label>
                                    <Input id="amountUSD" type="number" value={currentMassDebt.amountUSD} onChange={handleMassDebtInputChange} placeholder="25.00" />
                                </div>
                                <Card className="bg-muted/50">
                                    <CardContent className="p-4 text-sm text-muted-foreground">
                                        <Info className="inline h-4 w-4 mr-2"/>
                                        {periodDescription}
                                        <p className="text-xs mt-2">Si el propietario tiene saldo a favor, se usará para pagar estas nuevas deudas automáticamente.</p>
                                    </CardContent>
                                </Card>
                            </div>
                        </div>
                        <DialogFooter className="mt-auto pt-4 border-t">
                            <Button variant="outline" onClick={() => setIsMassDebtDialogOpen(false)}>Cancelar</Button>
                            <Button onClick={handleSaveMassDebt}>Generar Deudas</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                {/* Edit Debt Dialog */}
                <Dialog open={isEditDebtDialogOpen} onOpenChange={setIsEditDebtDialogOpen}>
                    <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                            <DialogTitle>Editar Deuda</DialogTitle>
                             <DialogDescription>
                                Modifique la descripción o el monto de la deuda para {debtToEdit ? \`\${months.find(m => m.value === debtToEdit.month)?.label} \${debtToEdit.year}\` : ''}.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                            <div className="space-y-2">
                                <Label htmlFor="edit-description">Descripción</Label>
                                <Input 
                                    id="edit-description" 
                                    value={currentDebtData.description} 
                                    onChange={(e) => setCurrentDebtData({...currentDebtData, description: e.target.value })} 
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="edit-amountUSD">Monto (USD)</Label>
                                <Input 
                                    id="edit-amountUSD" 
                                    type="number" 
                                    value={currentDebtData.amountUSD} 
                                    onChange={(e) => setCurrentDebtData({...currentDebtData, amountUSD: e.target.value })} 
                                    placeholder="25.00" 
                                />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setIsEditDebtDialogOpen(false)}>Cancelar</Button>
                            <Button onClick={handleSaveSingleDebt}>Guardar Cambios</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                {/* Delete Confirmation Dialog */}
                <Dialog open={isDeleteConfirmationOpen} onOpenChange={setIsDeleteConfirmationOpen}>
                    <DialogContent className="sm:max-w-[425px]">
                        <DialogHeader>
                            <DialogTitle>¿Está seguro?</DialogTitle>
                            <DialogDescription>
                                Esta acción no se puede deshacer. Esto eliminará permanentemente la deuda y ajustará el saldo del propietario si la deuda ya estaba pagada.
                            </DialogDescription>
                        </DialogHeader>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setIsDeleteConfirmationOpen(false)}>Cancelar</Button>
                            <Button variant="destructive" onClick={confirmDelete}>Sí, eliminar</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
        );
    }
    
    // Fallback while loading or if view is invalid
    return null;
}

    