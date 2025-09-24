
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

    const [debtToDelete, setDebtToDelete] = useState<Debt | null>(debtToDelete);
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


// FILE: src/app/admin/layout.tsx
'use client';

import {
    Home,
    Landmark,
    Users,
    Settings,
    FileSearch,
    CircleDollarSign,
    ListChecks,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { DashboardLayout, type NavItem } from '@/components/dashboard-layout';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

const adminNavItems: NavItem[] = [
    { href: "/admin/dashboard", icon: Home, label: "Dashboard" },
    { 
      href: "/admin/payments", 
      icon: Landmark, 
      label: "Pagos",
      items: [
        { href: "/admin/payments", label: "Reportar Pago" },
        { href: "/admin/payments/advance", label: "Registrar Adelanto" },
        { href: "/admin/payments/verify", label: "Verificar Pagos" },
        { href: "/admin/payments/reconciliation", label: "Conciliación Bancaria" },
        { href: "/admin/payments/calculator", label: "Calculadora de Pagos" },
        { href: "/admin/payments/history", label: "Pagos Históricos" },
      ]
    },
    { href: "/admin/debts", icon: CircleDollarSign, label: "Gestión de Deudas" },
    { href: "/admin/reports", icon: FileSearch, label: "Informes" },
    { href: "/admin/people", icon: Users, label: "Personas" },
    { 
      href: "/admin/settings", 
      icon: Settings, 
      label: "Configuración",
      items: [
        { href: "/admin/settings", label: "Ajustes Generales" },
        { href: "/admin/settings/backup", label: "Backup y Restauración" },
      ]
    },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
    return (
        <DashboardLayout userName="Edwin Aguiar" userRole="Administrador" navItems={adminNavItems}>
            {children}
        </DashboardLayout>
    );
}


// FILE: src/app/admin/payments/advance/page.tsx
'use client';

import { useState, useEffect, useMemo } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle, Loader2, CalendarPlus, Info, Check, Search, XCircle } from 'lucide-react';
import { collection, onSnapshot, query, addDoc, serverTimestamp, doc, getDoc, writeBatch, Timestamp, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { addMonths, format } from 'date-fns';
import { es } from 'date-fns/locale';
import { ScrollArea } from '@/components/ui/scroll-area';

type Owner = {
    id: string;
    name: string;
    properties: { street: string; house: string }[];
};

const months = Array.from({ length: 12 }, (_, i) => {
    const date = addMonths(new Date(), i);
    return {
        value: format(date, 'yyyy-MM'),
        label: format(date, 'MMMM yyyy', { locale: es }),
    };
});

export default function AdvancePaymentPage() {
    const { toast } = useToast();
    const [owners, setOwners] = useState<Owner[]>([]);
    const [loading, setLoading] = useState(false);
    
    // Form State
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedOwner, setSelectedOwner] = useState<Owner | null>(null);
    const [selectedMonths, setSelectedMonths] = useState<string[]>([]);
    const [monthlyAmount, setMonthlyAmount] = useState('');
    const [observations, setObservations] = useState('');

    const totalAmount = useMemo(() => {
        const amount = parseFloat(monthlyAmount);
        if (isNaN(amount) || amount <= 0 || selectedMonths.length === 0) {
            return 0;
        }
        return amount * selectedMonths.length;
    }, [monthlyAmount, selectedMonths]);

    useEffect(() => {
        const ownersQuery = query(collection(db, "owners"));
        const ownersUnsubscribe = onSnapshot(ownersQuery, (snapshot) => {
            const ownersData: Owner[] = snapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    name: data.name,
                    properties: data.properties || []
                };
            });
            setOwners(ownersData.sort((a, b) => a.name.localeCompare(b.name)));
        });

        return () => {
            ownersUnsubscribe();
        };
    }, []);

    const filteredOwners = useMemo(() => {
        if (!searchTerm || searchTerm.length < 3) return [];
        return owners.filter(owner =>
            owner.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            owner.properties.some(p => \`\${p.street} - \${p.house}\`.toLowerCase().includes(searchTerm.toLowerCase()))
        );
    }, [searchTerm, owners]);

    const handleOwnerSelect = (owner: Owner) => {
        setSelectedOwner(owner);
        setSearchTerm('');
    };
    
    const resetOwnerSelection = () => {
        setSelectedOwner(null);
        setSearchTerm('');
    };

    const handleMonthToggle = (monthValue: string) => {
        setSelectedMonths(prev =>
            prev.includes(monthValue)
                ? prev.filter(m => m !== monthValue)
                : [...prev, monthValue]
        );
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const monthlyAmountNum = parseFloat(monthlyAmount);
        if (!selectedOwner || selectedMonths.length === 0 || isNaN(monthlyAmountNum) || monthlyAmountNum <= 0) {
            toast({
                variant: 'destructive',
                title: 'Datos Incompletos',
                description: 'Debe seleccionar un propietario, al menos un mes y un monto de cuota válido.',
            });
            return;
        }

        setLoading(true);

        try {
            // Check for existing debts for the selected months to prevent duplicates
            const existingDebtsQuery = query(
                collection(db, "debts"),
                where("ownerId", "==", selectedOwner.id),
                where("status", "==", "paid"),
                where("description", "==", "Cuota de Condominio (Pagada por adelantado)")
            );
            const existingDebtsSnapshot = await getDocs(existingDebtsQuery);
            const existingPaidMonths = existingDebtsSnapshot.docs.map(d => {
                const data = d.data();
                return \`\${data.year}-\${String(data.month).padStart(2, '0')}\`;
            });

            const duplicates = selectedMonths.filter(m => existingPaidMonths.includes(m));
            if (duplicates.length > 0) {
                 const monthLabels = duplicates.map(dup => {
                    const [year, month] = dup.split('-').map(Number);
                    const date = new Date(year, month - 1);
                    return format(date, 'MMMM yyyy', { locale: es });
                }).join(', ');
                toast({
                    variant: 'destructive',
                    title: 'Meses Duplicados',
                    description: \`Los meses \${monthLabels} ya han sido pagados por adelantado.\`,
                });
                setLoading(false);
                return;
            }

            const batch = writeBatch(db);
            const paymentDate = Timestamp.now();
            
            // 1. Create future 'paid' debt documents for each month
            selectedMonths.forEach(monthStr => {
                const [year, month] = monthStr.split('-').map(Number);
                const debtRef = doc(collection(db, "debts"));
                batch.set(debtRef, {
                    ownerId: selectedOwner.id,
                    property: selectedOwner.properties[0], // Assuming first property for simplicity
                    year,
                    month,
                    amountUSD: monthlyAmountNum,
                    description: "Cuota de Condominio (Pagada por adelantado)",
                    status: 'paid',
                    paymentDate: paymentDate,
                    paidAmountUSD: monthlyAmountNum,
                });
            });
            
            // 2. Create the main payment document with the total amount
            const paymentRef = doc(collection(db, "payments"));
            batch.set(paymentRef, {
                reportedBy: selectedOwner.id, // Admin is reporting on behalf of owner
                beneficiaries: [{ 
                    ownerId: selectedOwner.id, 
                    ownerName: selectedOwner.name,
                    ...selectedOwner.properties[0],
                    amount: totalAmount 
                }],
                beneficiaryIds: [selectedOwner.id],
                totalAmount: totalAmount,
                exchangeRate: 1, // Rate is not relevant as we are paying in USD equivalent
                paymentDate: paymentDate,
                reportedAt: serverTimestamp(),
                paymentMethod: 'adelanto',
                bank: 'N/A',
                reference: \`Adelanto \${selectedMonths.join(', ')}\`,
                status: 'aprobado', // Advance payments are approved by definition
                observations: observations,
            });

            await batch.commit();

            toast({
                title: 'Adelanto Registrado Exitosamente',
                description: \`Se registró el pago de \${selectedMonths.length} meses para \${selectedOwner.name}.\`,
                className: 'bg-green-100 border-green-400 text-green-800'
            });

            // Reset form
            setSelectedOwner(null);
            setSelectedMonths([]);
            setMonthlyAmount('');
            setObservations('');
            setSearchTerm('');

        } catch (error) {
            console.error("Error registering advance payment: ", error);
            const errorMessage = error instanceof Error ? error.message : "No se pudo completar la operación.";
            toast({
                variant: 'destructive',
                title: 'Error en la Operación',
                description: errorMessage,
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold font-headline">Registrar Pago por Adelantado</h1>
                <p className="text-muted-foreground">Seleccione un propietario y los meses futuros que desea cancelar.</p>
            </div>
            <form onSubmit={handleSubmit}>
                <Card>
                    <CardHeader>
                        <CardTitle>Detalles del Adelanto</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="space-y-2">
                             <Label htmlFor="owner-search">1. Propietario</Label>
                            {!selectedOwner ? (
                                <>
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                        <Input
                                            id="owner-search"
                                            placeholder="Buscar por nombre o casa (mín. 3 caracteres)..."
                                            className="pl-9"
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                        />
                                    </div>
                                    {searchTerm.length >= 3 && filteredOwners.length > 0 && (
                                        <Card className="border rounded-md">
                                            <ScrollArea className="h-48">
                                                {filteredOwners.map(owner => (
                                                    <div key={owner.id} onClick={() => handleOwnerSelect(owner)} className="p-3 hover:bg-muted cursor-pointer border-b last:border-b-0">
                                                        <p className="font-medium">{owner.name}</p>
                                                        <p className="text-sm text-muted-foreground">{owner.properties.map(p => \`\${p.street} - \${p.house}\`).join(', ')}</p>
                                                    </div>
                                                ))}
                                            </ScrollArea>
                                        </Card>
                                    )}
                                </>
                            ) : (
                                <Card className="bg-muted/50 p-4 flex items-center justify-between">
                                    <div>
                                        <p className="font-semibold text-primary">{selectedOwner.name}</p>
                                        <p className="text-sm text-muted-foreground">{selectedOwner.properties.map(p => \`\${p.street} - \${p.house}\`).join(', ')}</p>
                                    </div>
                                    <Button variant="ghost" size="icon" onClick={resetOwnerSelection}>
                                        <XCircle className="h-5 w-5 text-destructive"/>
                                    </Button>
                                </Card>
                            )}
                        </div>

                       {selectedOwner && (
                        <>
                            <div className="space-y-2">
                                <Label>2. Meses a Pagar por Adelantado</Label>
                                 <Card className="bg-muted/50 p-4">
                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                                        {months.map(month => (
                                            <Button
                                                key={month.value}
                                                type="button"
                                                variant={selectedMonths.includes(month.value) ? 'default' : 'outline'}
                                                className="flex items-center justify-center gap-2 capitalize"
                                                onClick={() => handleMonthToggle(month.value)}
                                            >
                                                {selectedMonths.includes(month.value) && <Check className="h-4 w-4" />}
                                                {month.label}
                                            </Button>
                                        ))}
                                    </div>
                                </Card>
                            </div>

                            <div className="grid md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <Label htmlFor="monthlyAmount">3. Monto de Cuota Pagada por Mes (USD)</Label>
                                    <Input
                                        id="monthlyAmount"
                                        type="number"
                                        value={monthlyAmount}
                                        onChange={(e) => setMonthlyAmount(e.target.value)}
                                        placeholder="25.00"
                                        required
                                    />
                                </div>
                                 <div className="space-y-2">
                                    <Label htmlFor="totalAmount">Monto Total a Pagar (USD)</Label>
                                    <Input
                                        id="totalAmount"
                                        type="number"
                                        value={totalAmount.toFixed(2)}
                                        className="font-bold text-lg bg-muted"
                                        readOnly
                                    />
                                    {selectedMonths.length > 0 &&
                                        <p className="text-sm text-muted-foreground">
                                            {selectedMonths.length} {selectedMonths.length > 1 ? 'meses' : 'mes'} seleccionados
                                        </p>
                                    }
                                </div>
                            </div>
                            
                            <div className="space-y-2">
                                <Label htmlFor="observations">Observaciones (Opcional)</Label>
                                <Input
                                    id="observations"
                                    value={observations}
                                    onChange={(e) => setObservations(e.target.value)}
                                    placeholder="Ej: Pago realizado por Zelle"
                                />
                            </div>
                        </>
                       )}
                    </CardContent>
                    {selectedOwner && (
                    <CardFooter>
                        <Button type="submit" className="w-full md:w-auto ml-auto" disabled={loading}>
                            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
                            Guardar Adelanto
                        </Button>
                    </CardFooter>
                    )}
                </Card>
            </form>
        </div>
    );
}


// FILE: src/app/admin/payments/calculator/page.tsx
'use client';

import { useState, useEffect, useMemo } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Loader2, Search, Info, Calculator, Minus, Equal, Check, Receipt } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { collection, query, onSnapshot, where, doc, getDoc, getDocs, writeBatch, Timestamp, orderBy, addDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { format, addMonths } from 'date-fns';
import { es } from 'date-fns/locale';

type Owner = {
    id: string;
    name: string;
    house: string;
    street: string;
    balance: number;
};

type Debt = {
    id: string;
    ownerId: string;
    year: number;
    month: number;
    amountUSD: number;
    description: string;
    status: 'pending' | 'paid';
};

type PaymentDetails = {
    paymentMethod: 'movil' | 'transferencia' | '';
    bank: string;
    otherBank: string;
    reference: string;
};

const venezuelanBanks = [
    { value: 'banesco', label: 'Banesco' }, { value: 'mercantil', label: 'Mercantil' },
    { value: 'provincial', label: 'Provincial' }, { value: 'bdv', label: 'Banco de Venezuela' },
    { value: 'bnc', label: 'Banco Nacional de Crédito (BNC)' }, { value: 'tesoro', label: 'Banco del Tesoro' },
    { value: 'otro', label: 'Otro' },
];

const monthsLocale = [
    { value: 1, label: 'Enero' }, { value: 2, label: 'Febrero' }, { value: 3, label: 'Marzo' },
    { value: 4, label: 'Abril' }, { value: 5, label: 'Mayo' }, { value: 6, label: 'Junio' },
    { value: 7, label: 'Julio' }, { value: 8, 'label': 'Agosto' }, { value: 9, 'label': 'Septiembre' },
    { value: 10, 'label': 'Octubre' }, { value: 11, 'label': 'Noviembre' }, { value: 12, 'label': 'Diciembre' }
];

export default function PaymentCalculatorPage() {
    const [owners, setOwners] = useState<Owner[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeRate, setActiveRate] = useState(0);
    const [condoFee, setCondoFee] = useState(0);

    const [selectedOwner, setSelectedOwner] = useState<Owner | null>(null);
    const [ownerDebts, setOwnerDebts] = useState<Debt[]>([]);
    const [loadingDebts, setLoadingDebts] = useState(false);
    
    const [selectedPendingDebts, setSelectedPendingDebts] = useState<string[]>([]);
    const [selectedAdvanceMonths, setSelectedAdvanceMonths] = useState<string[]>([]);
    
    const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
    const [processingPayment, setProcessingPayment] useState(false);
    const [paymentDetails, setPaymentDetails] = useState<PaymentDetails>({ paymentMethod: '', bank: '', otherBank: '', reference: '' });

    const { toast } = useToast();

    useEffect(() => {
        const fetchPrerequisites = async () => {
            setLoading(true);
            try {
                const settingsRef = doc(db, 'config', 'mainSettings');
                const settingsSnap = await getDoc(settingsRef);
                if (settingsSnap.exists()) {
                    const settings = settingsSnap.data();
                    setCondoFee(settings.condoFee || 0);
                    const rates = settings.exchangeRates || [];
                    const activeRateObj = rates.find((r: any) => r.active);
                    if (activeRateObj) setActiveRate(activeRateObj.rate);
                    else if (rates.length > 0) {
                        const sortedRates = [...rates].sort((a:any, b:any) => new Date(b.date).getTime() - new Date(a.date).getTime());
                        setActiveRate(sortedRates[0].rate);
                    }
                }

                const ownersQuery = query(collection(db, "owners"));
                const ownersSnapshot = await getDocs(ownersQuery);
                const ownersData: Owner[] = ownersSnapshot.docs.map(doc => {
                    const data = doc.data();
                    return { 
                        id: doc.id, name: data.name, 
                        house: (data.properties && data.properties.length > 0) ? data.properties[0].house : data.house,
                        street: (data.properties && data.properties.length > 0) ? data.properties[0].street : data.street,
                        balance: data.balance || 0,
                    };
                });
                setOwners(ownersData);

            } catch (error) {
                console.error("Error fetching data:", error);
                toast({ variant: 'destructive', title: 'Error de Carga', description: 'No se pudieron cargar los datos necesarios.' });
            } finally {
                setLoading(false);
            }
        };
        fetchPrerequisites();
    }, [toast]);

    const filteredOwners = useMemo(() => {
        if (!searchTerm || searchTerm.length < 3) return [];
        return owners.filter(owner => 
            owner.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            String(owner.house).toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [searchTerm, owners]);

    const handleSelectOwner = async (owner: Owner) => {
        setSelectedOwner(owner);
        setSearchTerm('');
        setLoadingDebts(true);
        setSelectedPendingDebts([]);
        setSelectedAdvanceMonths([]);

        try {
            const q = query(collection(db, "debts"), where("ownerId", "==", owner.id));
            const querySnapshot = await getDocs(q);
            const debtsData: Debt[] = [];
            querySnapshot.forEach((doc) => debtsData.push({ id: doc.id, ...doc.data() } as Debt));
            setOwnerDebts(debtsData.sort((a, b) => a.year - b.year || a.month - b.month));
        } catch (error) {
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron cargar las deudas del propietario.' });
        } finally {
            setLoadingDebts(false);
        }
    };
    
    const handlePendingDebtSelection = (debtId: string) => {
        setSelectedPendingDebts(prev => prev.includes(debtId) ? prev.filter(id => id !== debtId) : [...prev, debtId]);
    };
    
    const handleAdvanceMonthSelection = (monthValue: string) => {
        setSelectedAdvanceMonths(prev => prev.includes(monthValue) ? prev.filter(m => m !== monthValue) : [...prev, m]);
    };

    const futureMonths = useMemo(() => {
        const paidAdvanceMonths = ownerDebts
            .filter(d => d.status === 'paid' && d.description.includes('Adelantado'))
            .map(d => \`\${d.year}-\${String(d.month).padStart(2, '0')}\`);

        return Array.from({ length: 12 }, (_, i) => {
            const date = addMonths(new Date(), i);
            const value = format(date, 'yyyy-MM');
            return {
                value,
                label: format(date, 'MMMM yyyy', { locale: es }),
                disabled: paidAdvanceMonths.includes(value),
            };
        });
    }, [ownerDebts]);

    const paymentCalculator = useMemo(() => {
        if (!selectedOwner) return { totalToPay: 0, hasSelection: false, dueMonthsCount: 0, advanceMonthsCount: 0 };
        
        const dueMonthsTotalUSD = ownerDebts
            .filter(debt => selectedPendingDebts.includes(debt.id))
            .reduce((sum, debt) => sum + debt.amountUSD, 0);
        
        const advanceMonthsTotalUSD = selectedAdvanceMonths.length * condoFee;
        const totalDebtUSD = dueMonthsTotalUSD + advanceMonthsTotalUSD;
        const totalDebtBs = totalDebtUSD * activeRate;
        const totalToPay = Math.max(0, totalDebtBs - selectedOwner.balance);

        return {
            totalToPay,
            hasSelection: selectedPendingDebts.length > 0 || selectedAdvanceMonths.length > 0,
            dueMonthsCount: selectedPendingDebts.length,
            advanceMonthsCount: selectedAdvanceMonths.length,
            totalDebtBs: totalDebtBs,
            balanceInFavor: selectedOwner.balance,
            condoFee
        };
    }, [selectedPendingDebts, selectedAdvanceMonths, ownerDebts, activeRate, condoFee, selectedOwner]);

    const handleRegisterPayment = async () => {
        if (!paymentDetails.paymentMethod || !paymentDetails.bank || !paymentDetails.reference) {
            toast({ variant: 'destructive', title: 'Campos requeridos', description: 'Por favor, complete todos los detalles del pago.' });
            return;
        }
        if (paymentDetails.bank === 'otro' && !paymentDetails.otherBank) {
            toast({ variant: 'destructive', title: 'Campo requerido', description: 'Por favor, especifique el nombre del otro banco.' });
            return;
        }

        setProcessingPayment(true);
        if (!selectedOwner) return;

        try {
            const batch = writeBatch(db);
            const paymentDate = Timestamp.now();
            let totalPaidUSD = 0;
            const ownerRef = doc(db, 'owners', selectedOwner.id);

            // 1. Update pending debts
            const debtsToUpdate = ownerDebts.filter(d => selectedPendingDebts.includes(d.id));
            debtsToUpdate.forEach(debt => {
                const debtRef = doc(db, 'debts', debt.id);
                batch.update(debtRef, { status: 'paid', paymentDate, paidAmountUSD: debt.amountUSD });
                totalPaidUSD += debt.amountUSD;
            });
            
            // 2. Create new debts for advance months
            selectedAdvanceMonths.forEach(monthStr => {
                const [year, month] = monthStr.split('-').map(Number);
                const debtRef = doc(collection(db, "debts"));
                batch.set(debtRef, {
                    ownerId: selectedOwner.id, year, month, amountUSD: condoFee,
                    description: "Cuota de Condominio (Pagada por adelantado)",
                    status: 'paid', paymentDate, paidAmountUSD: condoFee,
                });
                totalPaidUSD += condoFee;
            });

            // 3. Create payment document
            const paymentRef = doc(collection(db, 'payments'));
            const paymentData = {
                reportedBy: selectedOwner.id, // Admin reporting for owner
                beneficiaries: [{ ownerId: selectedOwner.id, ownerName: selectedOwner.name, house: selectedOwner.house, street: selectedOwner.street, amount: paymentCalculator.totalDebtBs }],
                beneficiaryIds: [selectedOwner.id],
                totalAmount: paymentCalculator.totalDebtBs,
                exchangeRate: activeRate,
                paymentDate: paymentDate,
                reportedAt: paymentDate,
                paymentMethod: paymentDetails.paymentMethod,
                bank: paymentDetails.bank === 'otro' ? paymentDetails.otherBank : paymentDetails.bank,
                reference: paymentDetails.reference,
                status: 'aprobado',
                observations: 'Pago registrado desde calculadora.'
            };
            batch.set(paymentRef, paymentData);

            // 4. Update owner balance
            const newBalance = Math.max(0, selectedOwner.balance - paymentCalculator.totalDebtBs);
            batch.update(ownerRef, { balance: newBalance });

            await batch.commit();

            toast({ title: 'Pago Registrado Exitosamente', description: 'Las deudas y el saldo del propietario han sido actualizados.', className: 'bg-green-100 border-green-400 text-green-800' });
            setIsPaymentDialogOpen(false);
            setPaymentDetails({ paymentMethod: '', bank: '', otherBank: '', reference: '' });
            // Refresh owner data
            handleSelectOwner(selectedOwner);

        } catch (error) {
            console.error(error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo registrar el pago.' });
        } finally {
            setProcessingPayment(false);
        }
    };

    if (loading) return <div className="flex justify-center items-center h-64"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>;
    
    return (
        <div className="space-y-4">
            <div>
                <h1 className="text-3xl font-bold font-headline">Calculadora de Pagos</h1>
                <p className="text-muted-foreground">Calcule y registre pagos de deudas pendientes y adelantos de cuotas.</p>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                <div className="lg:col-span-2 space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>1. Buscar Propietario</CardTitle>
                            <div className="relative mt-2">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input placeholder="Buscar por nombre o casa (mínimo 3 caracteres)..." className="pl-9" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                            </div>
                        </CardHeader>
                        <CardContent>
                            {searchTerm.length >= 3 && filteredOwners.length > 0 && (
                                <ScrollArea className="border rounded-md h-48">
                                    {filteredOwners.map(owner => (
                                        <div key={owner.id} onClick={() => handleSelectOwner(owner)} className="p-3 hover:bg-muted cursor-pointer border-b last:border-b-0">
                                            <p className="font-medium">{owner.name}</p>
                                            <p className="text-sm text-muted-foreground">{owner.street} - {owner.house}</p>
                                        </div>
                                    ))}
                                </ScrollArea>
                            )}
                             {selectedOwner && (
                                <Card className="bg-muted/50 p-4 mt-4">
                                    <p className="font-semibold text-primary">{selectedOwner.name}</p>
                                    <p className="text-sm text-muted-foreground">{selectedOwner.street} - {selectedOwner.house}</p>
                                </Card>
                            )}
                        </CardContent>
                    </Card>

                    {selectedOwner && (
                    <>
                        <Card>
                            <CardHeader><CardTitle>2. Deudas Pendientes</CardTitle></CardHeader>
                            <CardContent className="p-0">
                                <ScrollArea className="h-72">
                                    <Table>
                                        <TableHeader><TableRow><TableHead className="w-[50px] text-center">Pagar</TableHead><TableHead>Período</TableHead><TableHead>Monto (USD)</TableHead><TableHead className="text-right">Monto (Bs.)</TableHead></TableRow></TableHeader>
                                        <TableBody>
                                            {loadingDebts ? <TableRow><TableCell colSpan={4} className="h-24 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto"/></TableCell></TableRow>
                                            : ownerDebts.filter(d => d.status === 'pending').length === 0 ? <TableRow><TableCell colSpan={4} className="h-24 text-center"><Info className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />No tiene deudas pendientes.</TableCell></TableRow>
                                            : ownerDebts.filter(d => d.status === 'pending').map((debt) => (
                                                <TableRow key={debt.id} data-state={selectedPendingDebts.includes(debt.id) ? 'selected' : ''}>
                                                    <TableCell className="text-center"><Checkbox onCheckedChange={() => handlePendingDebtSelection(debt.id)} checked={selectedPendingDebts.includes(debt.id)} /></TableCell>
                                                    <TableCell className="font-medium">{monthsLocale.find(m => m.value === debt.month)?.label} {debt.year}</TableCell>
                                                    <TableCell>${debt.amountUSD.toFixed(2)}</TableCell>
                                                    <TableCell className="text-right">Bs. {(debt.amountUSD * activeRate).toLocaleString('es-VE', {minimumFractionDigits: 2})}</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </ScrollArea>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader><CardTitle>3. Pagar Meses por Adelantado</CardTitle><CardDescription>Cuota mensual actual: ${condoFee.toFixed(2)}</CardDescription></CardHeader>
                            <CardContent>
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                                    {futureMonths.map(month => (
                                        <Button key={month.value} type="button" variant={selectedAdvanceMonths.includes(month.value) ? 'default' : 'outline'}
                                            className="flex items-center justify-center gap-2 capitalize" onClick={() => handleAdvanceMonthSelection(month.value)} disabled={month.disabled}>
                                            {selectedAdvanceMonths.includes(month.value) && <Check className="h-4 w-4" />}
                                            {month.label}
                                        </Button>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    </>
                    )}
                </div>
                
                <div className="lg:sticky lg:top-20">
                     {paymentCalculator.hasSelection && (
                        <Card>
                             <CardHeader>
                                <CardTitle className="flex items-center"><Calculator className="mr-2 h-5 w-5"/> 4. Resumen de Pago</CardTitle>
                                <CardDescription>Cálculo basado en su selección.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                {paymentCalculator.dueMonthsCount > 0 && <p className="text-sm text-muted-foreground">{paymentCalculator.dueMonthsCount} mes(es) adeudado(s) seleccionado(s).</p>}
                                {paymentCalculator.advanceMonthsCount > 0 && <p className="text-sm text-muted-foreground">{paymentCalculator.advanceMonthsCount} mes(es) por adelanto seleccionado(s) x ${paymentCalculator.condoFee.toFixed(2)} c/u.</p>}
                                <hr className="my-2"/>
                                <div className="flex justify-between items-center text-lg">
                                    <span className="text-muted-foreground">Sub-Total Deuda:</span>
                                    <span className="font-medium">Bs. {paymentCalculator.totalDebtBs.toLocaleString('es-VE', {minimumFractionDigits: 2})}</span>
                                </div>
                                <div className="flex justify-between items-center text-md">
                                    <span className="text-muted-foreground flex items-center"><Minus className="mr-2 h-4 w-4"/> Saldo a Favor:</span>
                                    <span className="font-medium text-green-500">Bs. {paymentCalculator.balanceInFavor.toLocaleString('es-VE', {minimumFractionDigits: 2})}</span>
                                </div>
                                <hr className="my-2"/>
                                <div className="flex justify-between items-center text-2xl font-bold">
                                    <span className="flex items-center"><Equal className="mr-2 h-5 w-5"/> TOTAL A PAGAR:</span>
                                    <span className="font-bold text-primary">Bs. {paymentCalculator.totalToPay.toLocaleString('es-VE', {minimumFractionDigits: 2})}</span>
                                </div>
                            </CardContent>
                            <CardFooter className="flex-col items-stretch gap-2 pt-6">
                                <Button onClick={() => setIsPaymentDialogOpen(true)} disabled={!paymentCalculator.hasSelection}>
                                    <Receipt className="mr-2 h-4 w-4" />
                                    Registrar Pago
                                </Button>
                            </CardFooter>
                        </Card>
                    )}
                </div>
            </div>

             <Dialog open={isPaymentDialogOpen} onOpenChange={setIsPaymentDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Registrar Pago</DialogTitle>
                        <DialogDescription>
                            Ingrese los detalles de la transacción para completar el registro.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="space-y-2">
                           <Label htmlFor="paymentMethod">Tipo de Pago</Label>
                           <Select value={paymentDetails.paymentMethod} onValueChange={(v) => setPaymentDetails(d => ({...d, paymentMethod: v as any}))}>
                                <SelectTrigger><SelectValue placeholder="Seleccione..." /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="transferencia">Transferencia</SelectItem>
                                    <SelectItem value="movil">Pago Móvil</SelectItem>
                                </SelectContent>
                           </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="bank">Banco Emisor</Label>
                            <Select value={paymentDetails.bank} onValueChange={(v) => setPaymentDetails(d => ({...d, bank: v}))}>
                                <SelectTrigger><SelectValue placeholder="Seleccione un banco..." /></SelectTrigger>
                                <SelectContent>{venezuelanBanks.map(b => <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                        {paymentDetails.bank === 'otro' && (
                            <div className="space-y-2">
                                <Label htmlFor="otherBank">Nombre del Otro Banco</Label>
                                <Input id="otherBank" value={paymentDetails.otherBank} onChange={(e) => setPaymentDetails(d => ({...d, otherBank: e.target.value}))} />
                            </div>
                        )}
                        <div className="space-y-2">
                            <Label htmlFor="reference">Referencia</Label>
                            <Input id="reference" value={paymentDetails.reference} onChange={(e) => setPaymentDetails(d => ({...d, reference: e.target.value.replace(/\\D/g, '')}))} />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsPaymentDialogOpen(false)} disabled={processingPayment}>Cancelar</Button>
                        <Button onClick={handleRegisterPayment} disabled={processingPayment}>
                            {processingPayment ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                            Confirmar y Guardar Pago
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}


// FILE: src/app/admin/payments/history/page.tsx
'use client';

import { useState, useEffect, useMemo } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { collection, query, onSnapshot, where, getDocs, addDoc, doc, updateDoc, deleteDoc, Timestamp, serverTimestamp, orderBy, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { PlusCircle, MoreHorizontal, Edit, Trash2, Loader2, Search, XCircle, Info } from 'lucide-react';
import { format, differenceInCalendarMonths, addMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import { ScrollArea } from '@/components/ui/scroll-area';

type Owner = {
    id: string;
    name: string;
    properties: { street: string, house: string }[];
};

type HistoricalPayment = {
    id?: string;
    ownerId: string;
    ownerName: string;
    property: { street: string, house: string };
    referenceMonth: number;
    referenceYear: number;
    paymentDate: Timestamp;
    amountUSD: number; // Changed from amount to amountUSD
    observations?: string;
    createdAt?: Timestamp;
};

const months = [
    { value: 1, label: 'Enero' }, { value: 2, label: 'Febrero' }, { value: 3, label: 'Marzo' },
    { value: 4, label: 'Abril' }, { value: 5, label: 'Mayo' }, { value: 6, label: 'Junio' },
    { value: 7, label: 'Julio' }, { value: 8, label: 'Agosto' }, { value: 9, label: 'Septiembre' },
    { value: 10, label: 'Octubre' }, { value: 11, label: 'Noviembre' }, { value: 12, 'label': 'Diciembre' }
];

const currentYear = new Date().getFullYear();
const years = Array.from({ length: 15 }, (_, i) => currentYear - i);

export default function HistoricalPaymentsPage() {
    const [owners, setOwners] = useState<Owner[]>([]);
    const [historicalPayments, setHistoricalPayments] = useState<HistoricalPayment[]>([]);
    const [loading, setLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [isDialogOpen, setIsDialogOpen] = useState(false);
    
    // State for the new range-based form
    const [selectedOwner, setSelectedOwner] = useState<Owner | null>(null);
    const [selectedProperty, setSelectedProperty] = useState<{ street: string, house: string } | null>(null);
    const [fromMonth, setFromMonth] = useState(new Date().getMonth() + 1);
    const [fromYear, setFromYear] = useState(currentYear);
    const [toMonth, setToMonth] = useState(new Date().getMonth() + 1);
    const [toYear, setToYear] = useState(currentYear);
    const [amountUSD, setAmountUSD] = useState('');
    const [observations, setObservations] = useState('');

    const [searchTerm, setSearchTerm] = useState('');
    const [historySearchTerm, setHistorySearchTerm] = useState('');

    const [paymentToDelete, setPaymentToDelete] = useState<HistoricalPayment | null>(null);
    const [isDeleteConfirmationOpen, setIsDeleteConfirmationOpen] = useState(false);

    const { toast } = useToast();

    useEffect(() => {
        const ownersQuery = query(collection(db, "owners"));
        const ownersUnsubscribe = onSnapshot(ownersQuery, (snapshot) => {
            setOwners(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Owner)));
        });

        const paymentsQuery = query(collection(db, "historical_payments"), orderBy("createdAt", "desc"));
        const paymentsUnsubscribe = onSnapshot(paymentsQuery, (snapshot) => {
            setHistoricalPayments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as HistoricalPayment)));
            setLoading(false);
        });

        return () => {
            ownersUnsubscribe();
            paymentsUnsubscribe();
        };
    }, []);

    const filteredOwners = useMemo(() => {
        if (!searchTerm || searchTerm.length < 3) return [];
        return owners.filter(owner =>
            owner.name.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [searchTerm, owners]);

    const filteredHistoricalPayments = useMemo(() => {
        if (!historySearchTerm) return historicalPayments;
        const lowerCaseSearch = historySearchTerm.toLowerCase();
        return historicalPayments.filter(payment =>
            payment.ownerName.toLowerCase().includes(lowerCaseSearch) ||
            (payment.property.street && payment.property.street.toLowerCase().includes(lowerCaseSearch)) ||
            (payment.property.house && payment.property.house.toLowerCase().includes(lowerCaseSearch))
        );
    }, [historySearchTerm, historicalPayments]);

    const handleAddPayment = () => {
        setSelectedOwner(null);
        setSelectedProperty(null);
        setSearchTerm('');
        setFromMonth(new Date().getMonth() + 1);
        setFromYear(currentYear);
        setToMonth(new Date().getMonth() + 1);
        setToYear(currentYear);
        setAmountUSD('');
        setObservations('');
        setIsDialogOpen(true);
    };

    const handleDeletePayment = (payment: HistoricalPayment) => {
        setPaymentToDelete(payment);
        setIsDeleteConfirmationOpen(true);
    };

    const confirmDelete = async () => {
        if (!paymentToDelete?.id) return;
        try {
            await deleteDoc(doc(db, "historical_payments", paymentToDelete.id));
            toast({ title: "Pago eliminado", description: "El registro del pago histórico ha sido eliminado." });
        } catch (error) {
            console.error(error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo eliminar el registro.' });
        } finally {
            setIsDeleteConfirmationOpen(false);
            setPaymentToDelete(null);
        }
    };
    
    const handleSavePayment = async () => {
        if (!selectedOwner || !selectedProperty || !amountUSD || parseFloat(amountUSD) <= 0) {
            toast({ variant: 'destructive', title: 'Campos requeridos', description: 'Debe seleccionar un propietario, una propiedad y un monto mensual válido en USD.' });
            return;
        }

        const startDate = new Date(fromYear, fromMonth - 1);
        const endDate = new Date(toYear, toMonth - 1);

        if (startDate > endDate) {
            toast({ variant: 'destructive', title: 'Rango Inválido', description: 'La fecha de inicio no puede ser posterior a la fecha final.' });
            return;
        }

        setIsSubmitting(true);

        try {
            const batch = writeBatch(db);
            const monthsToGenerate = differenceInCalendarMonths(endDate, startDate) + 1;
            let paymentsCreated = 0;

            const existingDebtsQuery = query(collection(db, 'debts'), 
                where('ownerId', '==', selectedOwner.id),
                where('property.street', '==', selectedProperty.street),
                where('property.house', '==', selectedProperty.house)
            );
            const existingHistoricalPaymentsQuery = query(collection(db, 'historical_payments'),
                where('ownerId', '==', selectedOwner.id),
                where('property.street', '==', selectedProperty.street),
                where('property.house', '==', selectedProperty.house)
            );

            const [existingDebtsSnapshot, existingHistoricalSnapshot] = await Promise.all([
                getDocs(existingDebtQuery),
                getDocs(existingHistoricalPaymentsQuery)
            ]);

            const occupiedPeriods = new Set([
                ...existingDebtsSnapshot.docs.map(d => \`\${d.data().year}-\${d.data().month}\`),
                ...existingHistoricalSnapshot.docs.map(d => \`\${d.data().referenceYear}-\${d.data().referenceMonth}\`)
            ]);

            for (let i = 0; i < monthsToGenerate; i++) {
                const currentDate = addMonths(startDate, i);
                const currentYear = currentDate.getFullYear();
                const currentMonth = currentDate.getMonth() + 1;
                
                if (occupiedPeriods.has(\`\${currentYear}-\${currentMonth}\`)) {
                    continue; // Skip if a debt or historical payment already exists
                }

                const paymentRef = doc(collection(db, "historical_payments"));
                batch.set(paymentRef, {
                    ownerId: selectedOwner.id,
                    ownerName: selectedOwner.name,
                    property: selectedProperty,
                    referenceMonth: currentMonth,
                    referenceYear: currentYear,
                    amountUSD: parseFloat(amountUSD),
                    paymentDate: Timestamp.fromDate(new Date(currentYear, currentMonth -1)), // Use the reference date as payment date
                    createdAt: serverTimestamp(),
                    observations,
                });
                paymentsCreated++;
            }
            
            if (paymentsCreated > 0) {
                await batch.commit();
                toast({
                    title: "Pagos Registrados",
                    description: \`Se han guardado \${paymentsCreated} pagos históricos.\`,
                    className: "bg-green-100 text-green-800"
                });
            } else {
                 toast({
                    title: "Sin Cambios",
                    description: "Todos los meses en el rango seleccionado ya tienen un pago o deuda registrada.",
                    variant: "default"
                });
            }

            setIsDialogOpen(false);

        } catch (error) {
            console.error(error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo guardar el registro de los pagos.' });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleSelectOwner = (owner: Owner) => {
        setSelectedOwner(owner);
        setSearchTerm('');
        if (owner.properties && owner.properties.length > 0) {
            setSelectedProperty(owner.properties[0]);
        }
    };
    
    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-3xl font-bold font-headline">Pagos Históricos</h1>
                    <p className="text-muted-foreground">Registre pagos de períodos pasados de forma masiva. Estos no afectarán los ingresos corrientes.</p>
                </div>
                <Button onClick={handleAddPayment}>
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Registrar Pagos Históricos
                </Button>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Historial de Pagos Registrados</CardTitle>
                    <div className="relative mt-2">
                         <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                         <Input
                            placeholder="Buscar por propietario, propiedad..."
                            className="pl-9"
                            value={historySearchTerm}
                            onChange={(e) => setHistorySearchTerm(e.target.value)}
                         />
                    </div>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Propietario</TableHead>
                                <TableHead>Propiedad</TableHead>
                                <TableHead>Período de Referencia</TableHead>
                                <TableHead>Monto (USD)</TableHead>
                                <TableHead>Fecha de Registro</TableHead>
                                <TableHead className="text-right">Acciones</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow><TableCell colSpan={6} className="h-24 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto"/></TableCell></TableRow>
                            ) : filteredHistoricalPayments.length === 0 ? (
                                <TableRow><TableCell colSpan={6} className="h-24 text-center">No hay pagos históricos que coincidan con la búsqueda.</TableCell></TableRow>
                            ) : (
                                filteredHistoricalPayments.map(p => (
                                    <TableRow key={p.id}>
                                        <TableCell>{p.ownerName}</TableCell>
                                        <TableCell>{p.property.street} - {p.property.house}</TableCell>
                                        <TableCell>{months.find(m=>m.value === p.referenceMonth)?.label} {p.referenceYear}</TableCell>
                                        <TableCell>$ {p.amountUSD.toLocaleString('en-US', {minimumFractionDigits: 2})}</TableCell>
                                        <TableCell>{p.createdAt ? format(p.createdAt.toDate(), "dd/MM/yyyy") : '-'}</TableCell>
                                        <TableCell className="text-right">
                                            <Button variant="ghost" size="icon" onClick={() => handleDeletePayment(p)}>
                                                <Trash2 className="h-4 w-4 text-destructive"/>
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="sm:max-w-xl max-h-[90vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle>Registrar Pagos Históricos por Rango</DialogTitle>
                        <DialogDescription>Seleccione un propietario, un rango de fechas y un monto fijo en USD por mes.</DialogDescription>
                    </DialogHeader>
                    <div className="flex-grow overflow-y-auto pr-6 -mr-6">
                        <div className="grid gap-6 py-4">
                            {!selectedOwner ? (
                                <div className='space-y-2'>
                                    <Label htmlFor="owner-search">1. Buscar Propietario</Label>
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                        <Input id="owner-search" placeholder="Buscar por nombre (mín. 3 caracteres)..." className="pl-9" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                                    </div>
                                    {searchTerm.length >= 3 && filteredOwners.length > 0 && (
                                        <Card className="border rounded-md">
                                            <ScrollArea className="h-48">{filteredOwners.map(owner => (<div key={owner.id} onClick={() => handleSelectOwner(owner)} className="p-3 hover:bg-muted cursor-pointer border-b last:border-b-0"><p className="font-medium">{owner.name}</p></div>))}</ScrollArea>
                                        </Card>
                                    )}
                                </div>
                            ) : (
                                <Card className="bg-muted/50 p-4 space-y-4">
                                    <div className='flex items-center justify-between'>
                                        <div><p className="font-semibold text-primary">{selectedOwner.name}</p></div>
                                        <Button variant="ghost" size="icon" onClick={() => setSelectedOwner(null)}><XCircle className="h-5 w-5 text-destructive"/></Button>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>2. Propiedad</Label>
                                        <Select onValueChange={(v) => setSelectedProperty(selectedOwner.properties.find(p => \`\${p.street}-\${p.house}\` === v) || null)} value={selectedProperty ? \`\${selectedProperty.street}-\${selectedProperty.house}\` : ''}>
                                            <SelectTrigger><SelectValue/></SelectTrigger>
                                            <SelectContent>{selectedOwner.properties.map(p => (<SelectItem key={\`\${p.street}-\${p.house}\`} value={\`\${p.street}-\${p.house}\`}>{\`\${p.street} - \${p.house}\`}</SelectItem>))}</SelectContent>
                                        </Select>
                                    </div>
                                </Card>
                            )}
                            
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>3. Desde</Label>
                                     <div className="flex gap-2">
                                        <Select value={String(fromMonth)} onValueChange={(v) => setFromMonth(Number(v))}>
                                            <SelectTrigger><SelectValue/></SelectTrigger>
                                            <SelectContent>{months.map(m => <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>)}</SelectContent>
                                        </Select>
                                        <Select value={String(fromYear)} onValueChange={(v) => setFromYear(Number(v))}>
                                            <SelectTrigger><SelectValue/></SelectTrigger>
                                            <SelectContent>{years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
                                        </Select>
                                     </div>
                                </div>
                                <div className="space-y-2">
                                    <Label>4. Hasta</Label>
                                     <div className="flex gap-2">
                                        <Select value={String(toMonth)} onValueChange={(v) => setToMonth(Number(v))}>
                                            <SelectTrigger><SelectValue/></SelectTrigger>
                                            <SelectContent>{months.map(m => <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>)}</SelectContent>
                                        </Select>
                                        <Select value={String(toYear)} onValueChange={(v) => setToYear(Number(v))}>
                                            <SelectTrigger><SelectValue/></SelectTrigger>
                                            <SelectContent>{years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
                                        </Select>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="space-y-2">
                                <Label htmlFor="amountUSD">5. Monto Pagado por Mes (USD)</Label>
                                <Input id="amountUSD" type="number" value={amountUSD} onChange={(e) => setAmountUSD(e.target.value)} placeholder="Ej: 25.00"/>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="observations">Observaciones (Opcional)</Label>
                                <Input id="observations" value={observations} onChange={(e) => setObservations(e.target.value)} maxLength={250} />
                            </div>

                             <Card className="bg-muted/50">
                                <CardContent className="p-4 text-sm text-muted-foreground">
                                    <Info className="inline h-4 w-4 mr-2"/>
                                    Se creará un registro de pago para cada mes en el rango que no tenga ya una deuda o pago histórico asociado.
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                    <DialogFooter className="mt-auto pt-4 border-t">
                        <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
                        <Button onClick={handleSavePayment} disabled={isSubmitting || !selectedOwner}>
                            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}
                            Guardar Pagos
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

             <Dialog open={isDeleteConfirmationOpen} onOpenChange={setIsDeleteConfirmationOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>¿Está seguro?</DialogTitle>
                        <DialogDescription>
                            Esta acción no se puede deshacer. Esto eliminará permanentemente el registro del pago histórico.
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


// FILE: src/app/admin/payments/page.tsx
'use client';
import { useState, useEffect, useRef, useMemo } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { useToast } from '@/hooks/use-toast';
import { CalendarIcon, CheckCircle2, Trash2, PlusCircle, Loader2, Search, XCircle, Wand2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { collection, onSnapshot, query, addDoc, serverTimestamp, doc, getDoc, where, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { ScrollArea } from '@/components/ui/scroll-area';
import { inferPaymentDetails } from '@/ai/flows/infer-payment-details';
import { Textarea } from '@/components/ui/textarea';


// --- Static Data ---
const venezuelanBanks = [
    { value: 'banesco', label: 'Banesco' },
    { value: 'mercantil', label: 'Mercantil' },
    { value: 'provincial', label: 'Provincial' },
    { value: 'bdv', label: 'Banco de Venezuela' },
    { value: 'bnc', label: 'Banco Nacional de Crédito (BNC)' },
    { value: 'tesoro', label: 'Banco del Tesoro' },
    { value: 'otro', label: 'Otro' },
];

type Owner = {
    id: string;
    name: string;
    properties: { street: string, house: string }[];
};

type ExchangeRate = {
    id: string;
    date: string; // Stored as 'yyyy-MM-dd'
    rate: number;
    active: boolean;
};

// --- Type Definitions ---
type BeneficiaryType = 'propio' | 'terceros';
type PaymentMethod = 'movil' | 'transferencia' | 'pago-historico' | '';
type BeneficiarySplit = { property: { street: string, house: string }; amount: number | string; };

const ADMIN_USER_ID = 'G2jhcEnp05TcvjYj8SwhzVCHbW83';

export default function UnifiedPaymentsPage() {
    const { toast } = useToast();
    const [owners, setOwners] = useState<Owner[]>([]);
    const [loading, setLoading] = useState(false);

    // --- Form State ---
    const [paymentDate, setPaymentDate] = useState<Date | undefined>();
    const [exchangeRate, setExchangeRate] = useState<number | null>(null);
    const [exchangeRateMessage, setExchangeRateMessage] = useState('');
    const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('');
    const [bank, setBank] = useState('');
    const [otherBank, setOtherBank] = useState('');
    const [reference, setReference] = useState('');
    const [beneficiaryType, setBeneficiaryType] = useState<BeneficiaryType>('propio');
    const [totalAmount, setTotalAmount] = useState<number | string>('');
    
    // State for the AI feature
    const [aiPrompt, setAiPrompt] = useState('');
    const [isInferring, setIsInferring] = useState(false);

    // State for the new beneficiary selection flow
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedOwner, setSelectedOwner] = useState<Owner | null>(null);
    const [beneficiarySplits, setBeneficiarySplits] = useState<BeneficiarySplit[]>([]);

    // --- Data Fetching ---
    useEffect(() => {
        const q = query(collection(db, "owners"));
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const ownersData: Owner[] = [];
            querySnapshot.forEach((doc) => {
                ownersData.push({ id: doc.id, ...doc.data() } as Owner);
            });
            setOwners(ownersData.sort((a, b) => a.name.localeCompare(b.name)));
        }, (error) => {
            console.error("Error fetching owners: ", error);
            toast({ variant: 'destructive', title: 'Error de Conexión', description: 'No se pudieron cargar los propietarios.' });
        });

        return () => unsubscribe();
    }, [toast]);
    
    useEffect(() => {
        const fetchRateAndFee = async () => {
             try {
                const settingsRef = doc(db, 'config', 'mainSettings');
                const docSnap = await getDoc(settingsRef);
                if (docSnap.exists()) {
                    const settings = docSnap.data();

                    if (paymentDate) {
                        setExchangeRate(null);
                        setExchangeRateMessage('Buscando tasa...');
                        const allRates = (settings.exchangeRates || []) as ExchangeRate[];
                        
                        const paymentDateString = format(paymentDate, 'yyyy-MM-dd');
                        const applicableRates = allRates
                            .filter(r => r.date <= paymentDateString)
                            .sort((a, b) => b.date.localeCompare(a.date));

                        if (applicableRates.length > 0) {
                             setExchangeRate(applicableRates[0].rate);
                             setExchangeRateMessage('');
                        } else {
                           setExchangeRateMessage('No hay tasa para esta fecha.');
                        }
                    } else {
                        setExchangeRate(null);
                        setExchangeRateMessage('');
                    }

                } else {
                     setExchangeRateMessage('No hay configuraciones. Contacte al administrador.');
                }
            } catch (e) {
                 setExchangeRateMessage('Error al buscar tasa.');
                 console.error(e);
            }
        }
        fetchRateAndFee();
    }, [paymentDate]);

    // --- Derived State & Calculations ---
    const filteredOwners = useMemo(() => {
        if (!searchTerm || searchTerm.length < 3) return [];
        const lowerCaseSearch = searchTerm.toLowerCase();
        return owners.filter(owner => {
            const ownerName = owner.name.toLowerCase();
            const propertiesMatch = owner.properties?.some(p => 
                (p.house && String(p.house).toLowerCase().includes(lowerCaseSearch)) ||
                (p.street && String(p.street).toLowerCase().includes(lowerCaseSearch))
            );
            return ownerName.includes(lowerCaseSearch) || propertiesMatch;
        });
    }, [searchTerm, owners]);

    const assignedTotal = useMemo(() => {
        return beneficiarySplits.reduce((acc, split) => acc + (Number(split.amount) || 0), 0);
    }, [beneficiarySplits]);

    const balance = useMemo(() => {
        return (Number(totalAmount) || 0) - assignedTotal;
    }, [totalAmount, assignedTotal]);


    // --- Handlers & Effects ---
    const resetForm = () => {
        setPaymentDate(undefined);
        setExchangeRate(null);
        setExchangeRateMessage('');
        setPaymentMethod('');
        setBank('');
        setOtherBank('');
        setReference('');
        setBeneficiaryType('propio');
        setTotalAmount('');
        setSearchTerm('');
        setSelectedOwner(null);
        setBeneficiarySplits([]);
        setAiPrompt('');
    }
    
    const handleOwnerSelect = (owner: Owner) => {
        setSelectedOwner(owner);
        setSearchTerm('');
        if (owner.properties && owner.properties.length > 0) {
            setBeneficiarySplits([{ property: owner.properties[0], amount: '' }]);
        } else {
             toast({ variant: 'destructive', title: 'Propietario sin Propiedades', description: 'Este propietario no tiene propiedades asignadas y no puede recibir pagos.' });
            setBeneficiarySplits([]);
        }
    };

    const resetOwnerSelection = () => {
        setSelectedOwner(null);
        setBeneficiarySplits([]);
        setSearchTerm('');
    };

    const addSplit = () => {
        if (!selectedOwner) return;
        const availableProps = selectedOwner.properties.filter(
            p => !beneficiarySplits.some(s => s.property.street === p.street && s.property.house === p.house)
        );
        if (availableProps.length > 0) {
            setBeneficiarySplits([...beneficiarySplits, { property: availableProps[0], amount: '' }]);
        }
    };

    const removeSplit = (index: number) => {
        if (beneficiarySplits.length > 1) {
            setBeneficiarySplits(beneficiarySplits.filter((_, i) => i !== index));
        }
    };

    const handleSplitChange = (index: number, field: 'property' | 'amount', value: any) => {
        const newSplits = [...beneficiarySplits];
        if (field === 'property') {
            newSplits[index].property = value;
        } else {
            newSplits[index].amount = value;
        }
        setBeneficiarySplits(newSplits);
    };

     const handleInferDetails = async () => {
        if (!aiPrompt.trim()) {
            toast({ variant: 'destructive', title: 'Texto Vacío', description: 'Por favor, ingrese una descripción del pago.' });
            return;
        }
        setIsInferring(true);
        try {
            const result = await inferPaymentDetails({ text: aiPrompt });
            setTotalAmount(result.totalAmount);
            setReference(result.reference);
            setPaymentMethod(result.paymentMethod as PaymentMethod);
            setBank(result.bank);
            // Dates from AI are 'yyyy-MM-dd', parseISO handles this without timezone shifts.
            setPaymentDate(parseISO(result.paymentDate));

            toast({ title: 'Datos Extraídos', description: 'Los campos del formulario han sido actualizados.', className: 'bg-green-100 border-green-400 text-green-800' });
        } catch (error) {
            console.error("Error inferring payment details:", error);
            toast({ variant: 'destructive', title: 'Error de IA', description: 'No se pudieron extraer los detalles. Por favor, llene los campos manualmente.' });
        } finally {
            setIsInferring(false);
        }
    };
    
    const validateForm = async (): Promise<{ isValid: boolean, error?: string }> => {
        // Level A: Required fields validation
        if (!paymentDate) return { isValid: false, error: 'La fecha del pago es obligatoria.' };
        if (!exchangeRate || exchangeRate <= 0) return { isValid: false, error: 'Se requiere una tasa de cambio válida para la fecha seleccionada.' };
        if (!paymentMethod) return { isValid: false, error: 'Debe seleccionar un tipo de pago.' };
        if (!bank) return { isValid: false, error: 'Debe seleccionar un banco.' };
        if (bank === 'otro' && !otherBank.trim()) return { isValid: false, error: 'Debe especificar el nombre del otro banco.' };
        if (!totalAmount || Number(totalAmount) <= 0) return { isValid: false, error: 'El monto total debe ser mayor a cero.' };
        if (!selectedOwner) return { isValid: false, error: 'Debe seleccionar un beneficiario.' };
        if (beneficiarySplits.length === 0) return { isValid: false, error: 'Debe asignar el monto a al menos una propiedad.' };
        if (beneficiarySplits.some(s => !s.property || !s.amount || Number(s.amount) <= 0)) return { isValid: false, error: 'Debe completar un monto válido para cada propiedad.' };
        
        // This is the corrected validation logic.
        if (Math.abs(balance) > 0.01) {
             return { isValid: false, error: \`El monto total (Bs. \${Number(totalAmount).toFixed(2)}) no coincide con la suma de los montos asignados (Bs. \${assignedTotal.toFixed(2)}).\` };
        }
        
        // Level B: Format validation
        if (!/^\\d{6,}$/.test(reference)) {
            return { isValid: false, error: 'La referencia debe tener al menos 6 dígitos.' };
        }
        
        // Level C: Duplicate validation
        try {
            const q = query(collection(db, "payments"), 
                where("reference", "==", reference),
                where("totalAmount", "==", Number(totalAmount)),
                where("paymentDate", "==", Timestamp.fromDate(paymentDate))
            );
            const querySnapshot = await getDocs(q);
            if (!querySnapshot.empty) {
                return { isValid: false, error: 'Ya existe un reporte de pago con esta misma referencia, monto y fecha.' };
            }
        } catch (dbError) {
             console.error("Error checking for duplicates:", dbError);
             return { isValid: false, error: "No se pudo verificar si el pago ya existe. Intente de nuevo." };
        }

        return { isValid: true };
    };


    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            const validation = await validateForm();
            if (!validation.isValid) {
                toast({ variant: 'destructive', title: 'Error de Validación', description: validation.error, duration: 6000 });
                setLoading(false);
                return;
            }

            const paymentData = {
                paymentDate: Timestamp.fromDate(paymentDate!),
                exchangeRate: exchangeRate,
                paymentMethod: paymentMethod,
                bank: bank === 'otro' ? otherBank : bank,
                reference: reference,
                totalAmount: Number(totalAmount),
                beneficiaries: beneficiarySplits.map(s => ({
                    ownerId: selectedOwner!.id,
                    ownerName: selectedOwner!.name,
                    ...s.property,
                    amount: Number(s.amount)
                })),
                beneficiaryIds: Array.from(new Set(beneficiarySplits.map(() => selectedOwner!.id))),
                status: 'pendiente' as 'pendiente',
                reportedAt: serverTimestamp(),
                reportedBy: beneficiaryType === 'propio' ? selectedOwner!.id : ADMIN_USER_ID,
            };
            
            await addDoc(collection(db, "payments"), paymentData);
            
            toast({ 
                title: 'Reporte Enviado Exitosamente', 
                description: 'Tu reporte ha sido enviado para revisión por el administrador.', 
                className: 'bg-green-100 border-green-400 text-green-800' 
            });
            resetForm();

        } catch (error) {
            console.error("Error submitting payment: ", error);
            const errorMessage = typeof error === 'string' ? error : "No se pudo enviar el reporte. Por favor, intente de nuevo.";
            toast({ variant: "destructive", title: "Error Inesperado", description: errorMessage });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold font-headline">Reporte de Pagos</h1>
                <p className="text-muted-foreground">Formulario único para registrar pagos propios o a terceros.</p>
            </div>
            
             <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Wand2 />
                        Asistente de IA para Llenado Rápido
                    </CardTitle>
                    <CardDescription>
                        Pega aquí los detalles de un pago (ej. de un capture o mensaje de WhatsApp) y la IA llenará los campos por ti.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                     <Textarea
                        placeholder="Ej: Pago móvil Banesco por 4500 Bs con ref 012345 del día de ayer."
                        value={aiPrompt}
                        onChange={(e) => setAiPrompt(e.target.value)}
                        className="mb-4"
                        rows={3}
                        disabled={isInferring || loading}
                    />
                    <Button onClick={handleInferDetails} disabled={isInferring || loading}>
                        {isInferring ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Wand2 className="mr-2 h-4 w-4"/>}
                        Analizar con IA
                    </Button>
                </CardContent>
            </Card>

            <form onSubmit={handleSubmit}>
                <Card className="mb-6">
                    <CardHeader><CardTitle>Detalles de la Transacción</CardTitle></CardHeader>
                    <CardContent className="grid md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                             <Label htmlFor="paymentDate">1. Fecha del Pago</Label>
                             <Popover>
                                <PopoverTrigger asChild>
                                    <Button id="paymentDate" variant={"outline"} className={cn("w-full justify-start", !paymentDate && "text-muted-foreground")} disabled={loading}>
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {paymentDate ? format(paymentDate, "PPP", { locale: es }) : <span>Seleccione una fecha</span>}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={paymentDate} onSelect={setPaymentDate} initialFocus locale={es} disabled={(date) => date > new Date()} /></PopoverContent>
                            </Popover>
                        </div>
                        <div className="space-y-2">
                            <Label>2. Tasa de Cambio (Bs. por USD)</Label>
                            <Input type="text" value={exchangeRate ? \`Bs. \${exchangeRate.toFixed(2)}\` : exchangeRateMessage || 'Seleccione una fecha'} readOnly className={cn("bg-muted/50")} />
                        </div>
                        <div className="space-y-2">
                           <Label htmlFor="paymentMethod">3. Tipo de Pago</Label>
                           <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as PaymentMethod)} disabled={loading}>
                                <SelectTrigger id="paymentMethod"><SelectValue placeholder="Seleccione..." /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="transferencia">Transferencia</SelectItem>
                                    <SelectItem value="movil">Pago Móvil</SelectItem>
                                </SelectContent>
                           </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="bank">4. Banco Emisor</Label>
                             <Select value={bank} onValueChange={setBank} disabled={loading}>
                                <SelectTrigger id="bank"><SelectValue placeholder="Seleccione un banco..." /></SelectTrigger>
                                <SelectContent>{venezuelanBanks.map(b => <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                        {bank === 'otro' && (
                            <div className="space-y-2 md:col-span-2">
                                <Label htmlFor="otherBank">Nombre del Otro Banco</Label>
                                <Input id="otherBank" value={otherBank} onChange={(e) => setOtherBank(e.target.value)} disabled={loading}/>
                            </div>
                        )}
                        <div className="space-y-2 md:col-span-2">
                             <Label htmlFor="reference">5. Referencia (Últimos 6 dígitos o más)</Label>
                             <Input id="reference" value={reference} onChange={(e) => setReference(e.target.value.replace(/\\D/g, ''))} disabled={loading}/>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader><CardTitle>Detalles de los Beneficiarios</CardTitle></CardHeader>
                    <CardContent className="space-y-6">
                        <div className="grid md:grid-cols-2 gap-6">
                            <div className="space-y-3">
                                <Label>6. Tipo de Pago</Label>
                                <RadioGroup value={beneficiaryType} onValueChange={(v) => setBeneficiaryType(v as BeneficiaryType)} className="flex gap-4" disabled={loading}>
                                    <div className="flex items-center space-x-2"><RadioGroupItem value="propio" id="r-propio" /><Label htmlFor="r-propio">Pago Propio</Label></div>
                                    <div className="flex items-center space-x-2"><RadioGroupItem value="terceros" id="r-terceros" /><Label htmlFor="r-terceros">Pago a Terceros</Label></div>
                                </RadioGroup>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="totalAmount">7. Monto Total del Pago (Bs.)</Label>
                                <Input id="totalAmount" type="number" value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} placeholder="0.00" disabled={loading}/>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <Label className="font-semibold">8. Asignación de Montos</Label>
                            {!selectedOwner ? (
                                <div className='space-y-2'>
                                    <Label htmlFor="owner-search">Buscar Beneficiario</Label>
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                        <Input id="owner-search" placeholder="Buscar por nombre (mín. 3 caracteres)..." className="pl-9" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} disabled={loading}/>
                                    </div>
                                    {searchTerm.length >= 3 && filteredOwners.length > 0 && (
                                        <Card className="border rounded-md">
                                            <ScrollArea className="h-48">{filteredOwners.map(owner => (<div key={owner.id} onClick={() => handleOwnerSelect(owner)} className="p-3 hover:bg-muted cursor-pointer border-b last:border-b-0"><p className="font-medium">{owner.name}</p><p className="text-sm text-muted-foreground">{owner.properties?.map(p => \`\${p.street}-\${p.house}\`).join(', ')}</p></div>))}</ScrollArea>
                                        </Card>
                                    )}
                                </div>
                            ) : (
                                <Card className="bg-muted/50 p-4 space-y-4">
                                    <div className='flex items-center justify-between'>
                                        <div><p className="font-semibold text-primary">{selectedOwner.name}</p><p className="text-sm text-muted-foreground">{selectedOwner.properties?.map(p => \`\${p.street}-\${p.house}\`).join(', ')}</p></div>
                                        <Button variant="ghost" size="icon" onClick={resetOwnerSelection} disabled={loading}><XCircle className="h-5 w-5 text-destructive"/></Button>
                                    </div>

                                    {beneficiarySplits.map((split, index) => (
                                        <div key={index} className="flex items-center gap-2">
                                            <div className="flex-1">
                                                <Select onValueChange={(v) => handleSplitChange(index, 'property', selectedOwner.properties.find(p => \`\${p.street}-\${p.house}\` === v))} value={\`\${split.property.street}-\${split.property.house}\`} disabled={loading}>
                                                    <SelectTrigger><SelectValue/></SelectTrigger>
                                                    <SelectContent>{selectedOwner.properties.map(p => (<SelectItem key={\`\${p.street}-\${p.house}\`} value={\`\${p.street}-\${p.house}\`} disabled={beneficiarySplits.some(s => s.property.street === p.street && s.property.house === p.house && s.property !== split.property)}>{\`\${p.street} - \${p.house}\`}</SelectItem>))}</SelectContent>
                                                </Select>
                                            </div>
                                            <div className="w-40"><Input type="number" placeholder="Monto (Bs.)" value={split.amount} onChange={(e) => handleSplitChange(index, 'amount', e.target.value)} disabled={loading}/></div>
                                            <Button type="button" variant="ghost" size="icon" onClick={() => removeSplit(index)} disabled={beneficiarySplits.length <= 1 || loading}><Trash2 className="h-4 w-4 text-destructive"/></Button>
                                        </div>
                                    ))}
                                    {selectedOwner.properties && selectedOwner.properties.length > beneficiarySplits.length && (
                                        <Button type="button" variant="outline" size="sm" onClick={addSplit} disabled={loading}><PlusCircle className="mr-2 h-4 w-4"/>Asignar a otra propiedad</Button>
                                    )}

                                    <div className="p-4 bg-background/50 rounded-lg space-y-2 mt-4">
                                        <div className="flex justify-between text-sm font-medium"><span>Monto Total:</span><span>Bs. {Number(totalAmount || 0).toFixed(2)}</span></div>
                                        <div className="flex justify-between text-sm"><span>Total Asignado:</span><span>Bs. {assignedTotal.toFixed(2)}</span></div>
                                        <div className={cn("flex justify-between text-sm font-bold", balance !== 0 ? 'text-destructive' : 'text-green-600')}><span>Balance:</span><span>Bs. {balance.toFixed(2)}</span></div>
                                    </div>
                                </Card>
                            )}
                        </div>
                    </CardContent>
                    <CardFooter className='flex flex-col items-end gap-4'>
                         <Button type="submit" className="w-full md:w-auto" disabled={loading}>
                            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <CheckCircle2 className="mr-2 h-4 w-4"/>}
                            {loading ? 'Enviando...' : 'Enviar Reporte'}
                        </Button>
                    </CardFooter>
                </Card>
            </form>
        </div>
    );
}


// FILE: src/app/admin/payments/reconciliation/page.tsx
'use client';

import { useState, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Upload, Calendar as CalendarIcon, Bot, Loader2, CheckCircle, XCircle, FileDown, AlertTriangle } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { format, parse, isValid } from 'date-fns';
import { es } from 'date-fns/locale';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type BankMovement = {
    date: Date;
    reference: string;
    amount: number;
    originalReference: string;
};

type AppPayment = {
    id: string;
    date: Date;
    reference: string;
    amount: number;
    ownerName: string;
};

type ReconciliationResult = {
    conciliated: { bank: BankMovement, app: AppPayment }[];
    notFoundInApp: BankMovement[];
    notFoundInBank: AppPayment[];
};

const formatToTwoDecimals = (num: number) => {
    if (typeof num !== 'number' || isNaN(num)) return '0,00';
    const truncated = Math.trunc(num * 100) / 100;
    return truncated.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export default function ReconciliationPage() {
    const { toast } = useToast();
    const [bankStatements, setBankStatements] = useState<BankMovement[]>([]);
    const [appPayments, setAppPayments] = useState<AppPayment[]>([]);
    const [dateRange, setDateRange] = useState<{ from?: Date, to?: Date }>();
    const [loading, setLoading] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [reconciliationResults, setReconciliationResults] = useState<ReconciliationResult | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const totals = useMemo(() => {
        if (!reconciliationResults) return { conciliated: 0, notFoundInApp: 0, notFoundInBank: 0, totalBank: 0 };
        return {
            conciliated: reconciliationResults.conciliated.reduce((sum, item) => sum + item.bank.amount, 0),
            notFoundInApp: reconciliationResults.notFoundInApp.reduce((sum, item) => sum + item.amount, 0),
            notFoundInBank: reconciliationResults.notFoundInBank.reduce((sum, item) => sum + item.amount, 0),
            totalBank: bankStatements.reduce((sum, item) => sum + item.amount, 0)
        };
    }, [reconciliationResults, bankStatements]);
    
    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setLoading(true);
        setBankStatements([]);
        setReconciliationResults(null);

        try {
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const data = event.target?.result;
                    const workbook = XLSX.read(data, { type: 'binary' });
                    const sheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[sheetName];
                    const json: any[] = XLSX.utils.sheet_to_json(worksheet);

                    if (json.length > 0) {
                        const requiredColumns = ['Fecha', 'Referencia', 'Monto'];
                        const firstRow = json[0];
                        const hasAllColumns = requiredColumns.every(col => col in firstRow);
                        if (!hasAllColumns) {
                             toast({ variant: 'destructive', title: 'Columnas Faltantes', description: \`El archivo debe contener las columnas: \${requiredColumns.join(', ')}.\` });
                             setLoading(false);
                             return;
                        }
                    }

                    const parsedStatements: BankMovement[] = json.map(row => {
                        const originalRef = String(row['Referencia'] || '');
                        const amount = parseFloat(String(row['Monto'] || '0').replace(',', '.'));
                        
                        let date;
                        if(typeof row['Fecha'] === 'number') {
                            // Excel date serial number
                            date = XLSX.SSF.parse_date_code(row['Fecha']);
                            date = new Date(date.y, date.m - 1, date.d, date.H, date.M, date.S);
                        } else {
                            // String date
                            date = parse(String(row['Fecha']), 'dd/MM/yyyy', new Date());
                        }

                        if (!isValid(date) || isNaN(amount)) {
                            console.warn('Fila inválida omitida:', row);
                            return null;
                        }
                        
                        return {
                            date: date,
                            originalReference: originalRef,
                            reference: originalRef.slice(-6),
                            amount: amount,
                        };
                    }).filter((item): item is BankMovement => item !== null);
                    
                    setBankStatements(parsedStatements);
                    toast({ title: 'Archivo Cargado', description: \`Se han procesado \${parsedStatements.length} movimientos bancarios.\` });
                } catch (error) {
                     toast({ variant: 'destructive', title: 'Error al procesar el archivo', description: 'El archivo parece estar corrupto o en un formato inesperado.' });
                     console.error(error);
                } finally {
                    setLoading(false);
                }
            };
            reader.readAsBinaryString(file);
        } catch (error) {
             toast({ variant: 'destructive', title: 'Error de Lectura', description: 'No se pudo leer el archivo.' });
             setLoading(false);
        }
    };
    
    const handleReconciliation = async () => {
        if (!dateRange?.from || !dateRange?.to || bankStatements.length === 0) {
            toast({ variant: 'destructive', title: 'Faltan Datos', description: 'Por favor, carga un estado de cuenta y selecciona un rango de fechas.' });
            return;
        }

        setProcessing(true);
        setReconciliationResults(null);

        try {
            // Fetch owners for name mapping
            const ownersSnapshot = await getDocs(collection(db, "owners"));
            const ownersMap = new Map(ownersSnapshot.docs.map(doc => [doc.id, doc.data().name]));

            // 1. Fetch app payments within the date range
            const q = query(
                collection(db, "payments"),
                where("paymentDate", ">=", Timestamp.fromDate(dateRange.from)),
                where("paymentDate", "<=", Timestamp.fromDate(dateRange.to))
            );
            const querySnapshot = await getDocs(q);
            const appPaymentsData: AppPayment[] = querySnapshot.docs.map(doc => {
                const data = doc.data();
                const ownerId = data.beneficiaries?.[0]?.ownerId || 'unknown';
                return {
                    id: doc.id,
                    date: (data.paymentDate as Timestamp).toDate(),
                    reference: String(data.reference || '').slice(-6),
                    amount: data.totalAmount,
                    ownerName: ownersMap.get(ownerId) || 'Desconocido',
                };
            });
            setAppPayments(appPaymentsData);

            // 2. Filter bank statements by date range
            const filteredBankStatements = bankStatements.filter(bs => 
                bs.date >= dateRange.from! && bs.date <= dateRange.to!
            );
            
            // 3. Perform reconciliation
            const conciliated: { bank: BankMovement, app: AppPayment }[] = [];
            let mutableAppPayments = [...appPaymentsData];
            const notFoundInApp: BankMovement[] = [];

            for (const bankItem of filteredBankStatements) {
                const bankDateStr = format(bankItem.date, 'yyyy-MM-dd');
                
                const matchIndex = mutableAppPayments.findIndex(appItem => {
                    const appDateStr = format(appItem.date, 'yyyy-MM-dd');
                    const amountDiff = Math.abs(appItem.amount - bankItem.amount);
                    return appItem.reference === bankItem.reference &&
                           appDateStr === bankDateStr &&
                           amountDiff <= 0.01;
                });

                if (matchIndex !== -1) {
                    const matchedAppPayment = mutableAppPayments.splice(matchIndex, 1)[0];
                    conciliated.push({ bank: bankItem, app: matchedAppPayment });
                } else {
                    notFoundInApp.push(bankItem);
                }
            }

            setReconciliationResults({
                conciliated,
                notFoundInApp,
                notFoundInBank: mutableAppPayments, // Remaining items in mutableAppPayments
            });

            toast({ title: 'Conciliación Completada', description: 'Se han comparado los movimientos.', className: 'bg-green-100 border-green-400 text-green-800' });

        } catch (error) {
            console.error(error);
            toast({ variant: 'destructive', title: 'Error en la Conciliación', description: 'No se pudieron obtener los registros de la aplicación.' });
        } finally {
            setProcessing(false);
        }
    };


    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold font-headline">Conciliación Bancaria</h1>
                <p className="text-muted-foreground">Carga un estado de cuenta bancario para compararlo con los registros de la aplicación.</p>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="lg:col-span-1">
                    <CardHeader>
                        <CardTitle>1. Cargar Estado de Cuenta Bancario</CardTitle>
                        <CardDescription>Sube un archivo .xlsx con columnas: Fecha, Referencia, Monto.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Input 
                            ref={fileInputRef}
                            id="bank-statement" 
                            type="file"
                            accept=".xlsx"
                            onChange={handleFileChange}
                            className="hidden"
                        />
                         <Button onClick={() => fileInputRef.current?.click()} variant="outline" className="w-full" disabled={loading}>
                            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                            {bankStatements.length > 0 ? \`\${bankStatements.length} movimientos cargados\` : 'Seleccionar archivo'}
                        </Button>
                        <AlertTriangle className="mt-4 text-orange-400" />
                        <p className="text-xs text-muted-foreground mt-2">La referencia debe contener al menos 6 dígitos. El sistema usará los últimos 6.</p>
                    </CardContent>
                </Card>

                <Card className="lg:col-span-2">
                    <CardHeader>
                        <CardTitle>2. Rango de Fechas</CardTitle>
                        <CardDescription>Selecciona el período que deseas conciliar.</CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col sm:flex-row gap-4">
                        <div className="flex-1 space-y-2">
                            <Label>Desde</Label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !dateRange?.from && "text-muted-foreground")}>
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {dateRange?.from ? format(dateRange.from, "PPP", { locale: es }) : <span>Selecciona una fecha</span>}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={dateRange?.from} onSelect={(date) => setDateRange(prev => ({...prev, from: date}))} initialFocus /></PopoverContent>
                            </Popover>
                        </div>
                        <div className="flex-1 space-y-2">
                            <Label>Hasta</Label>
                             <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !dateRange?.to && "text-muted-foreground")}>
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {dateRange?.to ? format(dateRange.to, "PPP", { locale: es }) : <span>Selecciona una fecha</span>}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={dateRange?.to} onSelect={(date) => setDateRange(prev => ({...prev, to: date}))} initialFocus /></PopoverContent>
                            </Popover>
                        </div>
                    </CardContent>
                </Card>
            </div>
            
            <div className="text-center">
                <Button onClick={handleReconciliation} disabled={processing || bankStatements.length === 0 || !dateRange?.from || !dateRange?.to} size="lg">
                    {processing ? <Loader2 className="mr-2 h-5 w-5 animate-spin"/> : <Bot className="mr-2 h-5 w-5"/>}
                    {processing ? 'Conciliando...' : 'Iniciar Conciliación'}
                </Button>
            </div>

            {reconciliationResults && (
                 <Card>
                    <CardHeader>
                        <CardTitle>3. Resultados de la Conciliación</CardTitle>
                        <div className="pt-2">
                            <Label>Total Conciliado: Bs. {formatToTwoDecimals(totals.conciliated)} de Bs. {formatToTwoDecimals(totals.totalBank)}</Label>
                            <Progress value={(totals.totalBank > 0 ? (totals.conciliated / totals.totalBank) * 100 : 0)} className="mt-2"/>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <Tabs defaultValue="conciliated">
                            <TabsList className="grid w-full grid-cols-3">
                                <TabsTrigger value="conciliated">Conciliados ({reconciliationResults.conciliated.length})</TabsTrigger>
                                <TabsTrigger value="not-in-app">No en App ({reconciliationResults.notFoundInApp.length})</TabsTrigger>
                                <TabsTrigger value="not-in-bank">No en Banco ({reconciliationResults.notFoundInBank.length})</TabsTrigger>
                            </TabsList>
                            <TabsContent value="conciliated">
                                <Table>
                                    <TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Propietario (App)</TableHead><TableHead>Referencia</TableHead><TableHead className="text-right">Monto</TableHead></TableRow></TableHeader>
                                    <TableBody>
                                        {reconciliationResults.conciliated.map(({bank, app}) => (
                                            <TableRow key={bank.originalReference + bank.date} className="bg-green-100/50">
                                                <TableCell>{format(bank.date, 'dd/MM/yyyy')}</TableCell>
                                                <TableCell>{app.ownerName}</TableCell>
                                                <TableCell>{bank.reference}</TableCell>
                                                <TableCell className="text-right">Bs. {formatToTwoDecimals(bank.amount)}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </TabsContent>
                             <TabsContent value="not-in-app">
                                <Table>
                                     <TableHeader><TableRow><TableHead>Fecha (Banco)</TableHead><TableHead>Referencia (Banco)</TableHead><TableHead className="text-right">Monto (Banco)</TableHead><TableHead>Causa Probable</TableHead></TableRow></TableHeader>
                                     <TableBody>
                                         {reconciliationResults.notFoundInApp.map((item) => (
                                             <TableRow key={item.originalReference + item.date} className="bg-orange-100/50">
                                                 <TableCell>{format(item.date, 'dd/MM/yyyy')}</TableCell>
                                                 <TableCell>{item.reference}</TableCell>
                                                 <TableCell className="text-right">Bs. {formatToTwoDecimals(item.amount)}</TableCell>
                                                 <TableCell>No registrado en la app</TableCell>
                                             </TableRow>
                                         ))}
                                     </TableBody>
                                </Table>
                             </TabsContent>
                             <TabsContent value="not-in-bank">
                                <Table>
                                      <TableHeader><TableRow><TableHead>Fecha (App)</TableHead><TableHead>Propietario (App)</TableHead><TableHead>Referencia (App)</TableHead><TableHead className="text-right">Monto (App)</TableHead><TableHead>Causa Probable</TableHead></TableRow></TableHeader>
                                      <TableBody>
                                         {reconciliationResults.notFoundInBank.map((item) => (
                                             <TableRow key={item.id} className="bg-red-100/50">
                                                 <TableCell>{format(item.date, 'dd/MM/yyyy')}</TableCell>
                                                 <TableCell>{item.ownerName}</TableCell>
                                                 <TableCell>{item.reference}</TableCell>
                                                 <TableCell className="text-right">Bs. {formatToTwoDecimals(item.amount)}</TableCell>
                                                 <TableCell>No encontrado en estado de cuenta</TableCell>
                                             </TableRow>
                                         ))}
                                      </TableBody>
                                </Table>
                             </TabsContent>
                        </Tabs>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}


// FILE: src/app/admin/payments/verify/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { CheckCircle2, XCircle, MoreHorizontal, Printer, Filter, Loader2, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { collection, onSnapshot, query, doc, updateDoc, getDoc, writeBatch, where, orderBy, Timestamp, getDocs, deleteField, deleteDoc, runTransaction, addDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { format, addMonths, startOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';

type PaymentStatus = 'pendiente' | 'aprobado' | 'rechazado';
type PaymentMethod = 'transferencia' | 'movil' | 'adelanto' | 'conciliacion';

type Owner = {
    id: string;
    name: string;
    properties?: { street: string, house: string }[];
};

type Beneficiary = { ownerId: string; ownerName: string; amount: number; street?: string; house?: string; };

type FullPayment = {
  id: string;
  beneficiaries: Beneficiary[];
  beneficiaryIds: string[];
  totalAmount: number;
  exchangeRate: number;
  paymentDate: Timestamp;
  status: PaymentStatus;
  user?: string; 
  unit: string;
  amount: number;
  date: string;
  bank: string;
  type: PaymentMethod;
  reference: string;
  reportedBy: string;
  reportedAt?: Timestamp;
  observations?: string;
  isReconciled?: boolean;
};

type Debt = {
    id: string;
    ownerId: string;
    property: { street: string; house: string; };
    year: number;
    month: number;
    amountUSD: number;
    description: string;
    status: 'pending' | 'paid';
    paidAmountUSD?: number;
    paymentDate?: Timestamp;
    paymentId?: string;
};

type CompanyInfo = {
    name: string;
    address: string;
    rif: string;
    phone: string;
    email: string;
    logo: string;
};

type ReceiptData = {
    payment: FullPayment;
    ownerName: string; 
    ownerUnit: string; // This can represent the primary unit or a summary
    paidDebts: Debt[];
} | null;

const statusVariantMap: { [key in PaymentStatus]: 'warning' | 'success' | 'destructive' } = {
  pendiente: 'warning',
  aprobado: 'success',
  rechazado: 'destructive',
};

const statusTextMap: { [key in PaymentStatus]: string } = {
    pendiente: 'Pendiente',
    aprobado: 'Aprobado',
    rechazado: 'Rechazado',
};

const monthsLocale: { [key: number]: string } = {
    1: 'Enero', 2: 'Febrero', 3: 'Marzo', 4: 'Abril', 5: 'Mayo', 6: 'Junio',
    7: 'Julio', 8: 'Agosto', 9: 'Septiembre', 10: 'Octubre', 11: 'Noviembre', 12: 'Diciembre'
};

const formatToTwoDecimals = (num: number) => {
    if (typeof num !== 'number' || isNaN(num)) return '0,00';
    const truncated = Math.trunc(num * 100) / 100;
    return truncated.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};


export default function VerifyPaymentsPage() {
  const [payments, setPayments] = useState<FullPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<PaymentStatus | 'todos'>('todos');
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);
  const [condoFee, setCondoFee] = useState(0);
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const [isReceiptPdfPreviewOpen, setIsReceiptPdfPreviewOpen] = useState(false);
  const [paymentToDelete, setPaymentToDelete] = useState<FullPayment | null>(null);
  const [isDeleteConfirmationOpen, setIsDeleteConfirmationOpen] = useState(false);
  const { toast } = useToast();
  const [ownersMap, setOwnersMap] = useState<Map<string, Owner>>(new Map());

  useEffect(() => {
    const ownersQuery = query(collection(db, "owners"));
    const ownersUnsubscribe = onSnapshot(ownersQuery, (snapshot) => {
        const newOwnersMap = new Map<string, Owner>();
        snapshot.forEach(doc => {
            newOwnersMap.set(doc.id, { id: doc.id, ...doc.data() } as Owner);
        });
        setOwnersMap(newOwnersMap);
    });

    return () => ownersUnsubscribe();
  }, []);

  useEffect(() => {
    if (ownersMap.size === 0) return;

    setLoading(true);

    const q = query(collection(db, "payments"), orderBy('reportedAt', 'desc'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
        const paymentsData: FullPayment[] = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            const firstBeneficiary = data.beneficiaries?.[0];
            
            let userName = 'Beneficiario no identificado';
            let unit = 'Propiedad no especificada';

            if (firstBeneficiary?.ownerId) {
                const owner = ownersMap.get(firstBeneficiary.ownerId);
                if (owner) {
                    userName = owner.name;
                    if (data.beneficiaries?.length > 1) {
                        unit = "Múltiples Propiedades";
                    } else if (firstBeneficiary.street && firstBeneficiary.house) {
                        unit = \`\${firstBeneficiary.street} - \${firstBeneficiary.house}\`;
                    } else if (owner.properties && owner.properties.length > 0) {
                        // Fallback to the first property of the owner
                        unit = \`\${owner.properties[0].street} - \${owner.properties[0].house}\`;
                    }
                }
            }

            paymentsData.push({
                id: doc.id,
                user: userName,
                unit: unit,
                amount: data.totalAmount,
                date: new Date(data.paymentDate.seconds * 1000).toISOString(),
                bank: data.bank,
                type: data.paymentMethod,
                reference: data.reference,
                status: data.status,
                beneficiaries: data.beneficiaries,
                beneficiaryIds: data.beneficiaryIds || [],
                totalAmount: data.totalAmount,
                exchangeRate: data.exchangeRate,
                paymentDate: data.paymentDate,
                reportedBy: data.reportedBy,
                reportedAt: data.reportedAt,
                observations: data.observations,
                isReconciled: data.isReconciled,
            });
        });

        setPayments(paymentsData);
        setLoading(false);
    }, (error) => {
        console.error("Error fetching payments: ", error);
        toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron cargar los pagos.' });
        setLoading(false);
    });
    
    const fetchSettings = async () => {
        const settingsRef = doc(db, 'config', 'mainSettings');
        const docSnap = await getDoc(settingsRef);
        if (docSnap.exists()) {
            const settings = docSnap.data();
            setCompanyInfo(settings.companyInfo as CompanyInfo);
            setCondoFee(settings.condoFee || 0);
        }
    };
    fetchSettings();

    return () => unsubscribe();
  }, [toast, ownersMap]);


  const handleStatusChange = async (id: string, newStatus: PaymentStatus) => {
    const paymentRef = doc(db, 'payments', id);
  
    if (newStatus === 'rechazado') {
      try {
        await updateDoc(paymentRef, { status: 'rechazado' });
        toast({ title: 'Pago Rechazado', description: \`El pago ha sido marcado como rechazado.\` });
      } catch (error) {
        console.error("Error rejecting payment: ", error);
        toast({ variant: 'destructive', title: 'Error', description: 'No se pudo actualizar el estado.' });
      }
      return;
    }
  
    if (newStatus === 'aprobado') {
        try {
            await runTransaction(db, async (transaction) => {
                const paymentDoc = await transaction.get(paymentRef);
                if (!paymentDoc.exists() || paymentDoc.data().status === 'aprobado') {
                    throw new Error('El pago no existe o ya fue aprobado anteriormente.');
                }
    
                const paymentData = { id: paymentDoc.id, ...paymentDoc.data() } as FullPayment;

                // --- Get correct exchange rate for the payment date ---
                const settingsRef = doc(db, 'config', 'mainSettings');
                const settingsSnap = await getDoc(settingsRef);
                if (!settingsSnap.exists()) throw new Error('No se encontró el documento de configuración.');
                
                const allRates = (settingsSnap.data().exchangeRates || []) as {date: string, rate: number}[];
                const paymentDateString = format(paymentData.paymentDate.toDate(), 'yyyy-MM-dd');
                const applicableRates = allRates
                    .filter(r => r.date <= paymentDateString)
                    .sort((a, b) => b.date.localeCompare(a.date));

                const exchangeRate = applicableRates.length > 0 ? applicableRates[0].rate : 0;
                
                if (!exchangeRate || exchangeRate <= 0) throw new Error('La tasa de cambio para este pago es inválida o no está definida.');
                if (condoFee <= 0) throw new Error('La cuota de condominio no está configurada.');
                
                const beneficiary = paymentData.beneficiaries[0];
                if (!beneficiary) throw new Error('El pago no tiene un beneficiario definido.');

                const ownerRef = doc(db, 'owners', beneficiary.ownerId);
                const ownerDoc = await transaction.get(ownerRef);
                if (!ownerDoc.exists()) throw new Error(\`El propietario \${beneficiary.ownerId} no fue encontrado.\`);
                
                const ownerData = ownerDoc.data();
                const initialBalance = ownerData.balance || 0;
                
                // --- Switch to cents for all calculations ---
                const initialBalanceInCents = Math.round(initialBalance * 100);
                const paymentAmountInCents = Math.round(paymentData.totalAmount * 100);
                let availableFundsInCents = paymentAmountInCents + initialBalanceInCents;
                
                // --- 1. Liquidate Pending Debts (in cents) ---
                const debtsQuery = query(
                    collection(db, 'debts'),
                    where('ownerId', '==', beneficiary.ownerId),
                    where('status', '==', 'pending')
                );
                const debtsSnapshot = await getDocs(debtsQuery);
                // ALWAYS sort debts chronologically to ensure the oldest are paid first.
                const sortedDebts = debtsSnapshot.docs.sort((a, b) => {
                    const dataA = a.data();
                    const dataB = b.data();
                    if (dataA.year !== dataB.year) return dataA.year - dataB.year;
                    return dataA.month - dataB.month;
                });
                
                if (sortedDebts.length > 0) {
                    for (const debtDoc of sortedDebts) {
                        const debt = { id: debtDoc.id, ...debtDoc.data() } as Debt;
                        const debtAmountInCents = Math.round(debt.amountUSD * exchangeRate * 100);
                        
                        if (availableFundsInCents >= debtAmountInCents) {
                            availableFundsInCents -= debtAmountInCents;
                            transaction.update(debtDoc.ref, {
                                status: 'paid', paidAmountUSD: debt.amountUSD,
                                paymentDate: paymentData.paymentDate, paymentId: paymentData.id,
                            });
                        } else {
                            break; // Stop if funds are insufficient for the next oldest debt
                        }
                    }
                }
                
                // --- 2 & 3. Create and Liquidate Future Debts (in cents) ---
                const condoFeeInCents = Math.round(condoFee * exchangeRate * 100);
                if (availableFundsInCents >= condoFeeInCents) {
                    const allExistingDebtsQuery = query(collection(db, 'debts'), where('ownerId', '==', beneficiary.ownerId));
                    const allExistingDebtsSnap = await getDocs(allExistingDebtsQuery);
                    const existingDebtPeriods = new Set(allExistingDebtsSnap.docs.map(d => \`\${d.data().year}-\${d.data().month}\`));

                    const startDate = startOfMonth(new Date());
                    const propertyForFutureDebts = ownerData.properties?.[0];

                    if (propertyForFutureDebts) {
                         for (let i = 0; i < 24; i++) { // Look ahead 24 months
                            const futureDebtDate = addMonths(startDate, i);
                            const futureYear = futureDebtDate.getFullYear();
                            const futureMonth = futureDebtDate.getMonth() + 1;
                            const periodKey = \`\${futureYear}-\${futureMonth}\`;
                            
                            if (existingDebtPeriods.has(periodKey)) continue;

                            if (availableFundsInCents >= condoFeeInCents) {
                                availableFundsInCents -= condoFeeInCents;
                                
                                const debtRef = doc(collection(db, 'debts'));
                                transaction.set(debtRef, {
                                    ownerId: beneficiary.ownerId,
                                    property: propertyForFutureDebts,
                                    year: futureYear, month: futureMonth,
                                    amountUSD: condoFee,
                                    description: "Cuota de Condominio (Pagada por adelantado)",
                                    status: 'paid', paidAmountUSD: condoFee,
                                    paymentDate: paymentData.paymentDate, paymentId: paymentData.id,
                                });
                            } else {
                                break;
                            }
                        }
                    }
                }
                
                // --- 4. Update Balance and generate Observation Note ---
                const finalBalance = availableFundsInCents / 100; // Convert back to Bs
                const observationNote = \`Pago por Bs. \${formatToTwoDecimals(paymentData.totalAmount)}. Tasa aplicada: Bs. \${formatToTwoDecimals(exchangeRate)}. Saldo Anterior: Bs. \${formatToTwoDecimals(initialBalance)}. Saldo a Favor Actual: Bs. \${formatToTwoDecimals(finalBalance)}.\`;
                
                transaction.update(ownerRef, { balance: finalBalance });
                transaction.update(paymentRef, { status: 'aprobado', observations: observationNote, exchangeRate: exchangeRate });
            });
    
            toast({
                title: 'Pago Aprobado y Procesado',
                description: 'El saldo del propietario y las deudas han sido actualizados.',
                className: 'bg-green-100 border-green-400 text-green-800',
            });
        } catch (error) {
            console.error("Error processing payment approval: ", error);
            const errorMessage = error instanceof Error ? error.message : 'No se pudo aprobar y procesar el pago.';
            toast({ variant: 'destructive', title: 'Error en la Operación', description: errorMessage });
        }
    }
  };

  const showReceiptPdfPreview = async (payment: FullPayment) => {
    if (!payment.id) {
        toast({ variant: 'destructive', title: 'Error', description: 'ID de pago inválido.' });
        return;
    }
    try {
        const ownerName = payment.user || 'Beneficiario no identificado';
        
        const ownerUnitSummary = payment.beneficiaries.length > 1 
            ? "Múltiples Propiedades" 
            : (payment.unit || 'N/A');

        const paidDebtsQuery = query(
            collection(db, "debts"),
            where("paymentId", "==", payment.id)
        );
        const paidDebtsSnapshot = await getDocs(paidDebtsQuery);
        const paidDebts = paidDebtsSnapshot.docs
            .map(doc => ({id: doc.id, ...doc.data()}) as Debt)
            .sort((a,b) => b.year - b.year || b.month - b.month);
        
        setReceiptData({ 
            payment, 
            ownerName: ownerName,
            ownerUnit: ownerUnitSummary, 
            paidDebts 
        });
        setIsReceiptPdfPreviewOpen(true);
    } catch (error) {
        console.error("Error generating receipt preview: ", error);
        toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron cargar los datos para el recibo.' });
    }
  }

  const handleDeletePayment = (payment: FullPayment) => {
    setPaymentToDelete(payment);
    setIsDeleteConfirmationOpen(true);
  };

  const confirmDelete = async () => {
    if (!paymentToDelete) return;
    const paymentRef = doc(db, "payments", paymentToDelete.id);

    try {
        if (paymentToDelete.status === 'aprobado') {
             const batch = writeBatch(db);

            // Revert owner balances
            for (const beneficiary of paymentToDelete.beneficiaries) {
                const ownerRef = doc(db, 'owners', beneficiary.ownerId);
                const ownerDoc = await getDoc(ownerRef);
                if (ownerDoc.exists()) {
                    const currentBalance = ownerDoc.data().balance || 0;
                    const amountToRevert = beneficiary.amount || 0;
                    // This logic is simplified; a full reversal would require knowing how much balance was used.
                    // For now, we revert the paid amount back to the balance.
                    batch.update(ownerRef, { balance: currentBalance + amountToRevert });
                }
            }

            // Un-pay associated debts
            const debtsToRevertQuery = query(collection(db, 'debts'), where('paymentId', '==', paymentToDelete.id));
            const debtsToRevertSnapshot = await getDocs(debtsToRevertQuery);
            debtsToRevertSnapshot.forEach(debtDoc => {
                if (debtDoc.data().description.includes('Pagada por adelantado')) {
                    // If it was an advance payment debt, delete it entirely
                    batch.delete(debtDoc.ref);
                } else {
                    // Otherwise, revert it to pending
                    batch.update(debtDoc.ref, {
                        status: 'pending',
                        paymentDate: deleteField(),
                        paidAmountUSD: deleteField(),
                        paymentId: deleteField()
                    });
                }
            });
            
            // Delete the payment itself
            batch.delete(paymentRef);
            await batch.commit();

            toast({ title: "Pago Revertido", description: "El pago ha sido eliminado y las deudas y saldos han sido revertidos." });

        } else {
            await deleteDoc(paymentRef);
            toast({ title: "Pago Eliminado", description: "El registro del pago pendiente/rechazado ha sido eliminado." });
        }

    } catch (error) {
        console.error("Error deleting/reverting payment: ", error);
        const errorMessage = error instanceof Error ? error.message : "No se pudo completar la operación.";
        toast({
            variant: "destructive",
            title: "Error en la Operación",
            description: errorMessage,
        });
    } finally {
        setIsDeleteConfirmationOpen(false);
        setPaymentToDelete(null);
    }
  };


  const handleDownloadPdf = () => {
    if (!receiptData || !companyInfo) return;
    const { payment, ownerName, paidDebts } = receiptData;
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 14;

    if (companyInfo.logo) {
        try { doc.addImage(companyInfo.logo, 'PNG', margin, margin, 25, 25); }
        catch(e) { console.error("Error adding logo to PDF", e); }
    }
    doc.setFontSize(12).setFont('helvetica', 'bold').text(companyInfo.name, margin + 30, margin + 8);
    doc.setFontSize(9).setFont('helvetica', 'normal');
    doc.text(companyInfo.rif, margin + 30, margin + 14);
    doc.text(companyInfo.address, margin + 30, margin + 19);
    doc.text(\`Teléfono: \${companyInfo.phone}\`, margin + 30, margin + 24);
    
    doc.setFontSize(10).text(\`Fecha de Emisión: \${new Date().toLocaleDateString('es-VE')}\`, pageWidth - margin, margin + 8, { align: 'right' });
    
    doc.setLineWidth(0.5).line(margin, margin + 32, pageWidth - margin, margin + 32);

    doc.setFontSize(16).setFont('helvetica', 'bold').text("RECIBO DE PAGO", pageWidth / 2, margin + 45, { align: 'center' });
    doc.setFontSize(10).setFont('helvetica', 'normal').text(\`N° de recibo: \${payment.id.substring(0, 10)}\`, pageWidth - margin, margin + 50, { align: 'right' });

    let startY = margin + 60;
    doc.setFontSize(10).text(\`Nombre del Beneficiario: \${ownerName}\`, margin, startY);
    startY += 6;
    doc.text(\`Método de pago: \${payment.type}\`, margin, startY);
    startY += 6;
    doc.text(\`Banco Emisor: \${payment.bank}\`, margin, startY);
    startY += 6;
    doc.text(\`N° de Referencia Bancaria: \${payment.reference}\`, margin, startY);
    startY += 6;
    doc.text(\`Fecha del pago: \${format(payment.paymentDate.toDate(), 'dd/MM/yyyy')}\`, margin, startY);
    startY += 6;
    doc.text(\`Tasa de Cambio Aplicada: Bs. \${formatToTwoDecimals(payment.exchangeRate)} por USD\`, margin, startY);

    startY += 10;
    
    let totalPaidInConcepts = 0;
    const tableBody = paidDebts.map(debt => {
        const debtAmountBs = (debt.paidAmountUSD || debt.amountUSD) * payment.exchangeRate;
        totalPaidInConcepts += debtAmountBs;
        const propertyLabel = debt.property ? \`\${debt.property.street} - \${debt.property.house}\` : 'N/A';
        const periodLabel = \`\${monthsLocale[debt.month]} \${debt.year}\`;
        const concept = \`\${debt.description} (\${propertyLabel})\`;
        
        return [
            periodLabel,
            concept,
            \`$\${(debt.paidAmountUSD || debt.amountUSD).toFixed(2)}\`,
            \`Bs. \${formatToTwoDecimals(debtAmountBs)}\`
        ];
    });

    if (paidDebts.length > 0) {
        (doc as any).autoTable({
            startY: startY,
            head: [['Período', 'Concepto (Propiedad)', 'Monto ($)', 'Monto Pagado (Bs)']],
            body: tableBody,
            theme: 'striped',
            headStyles: { fillColor: [44, 62, 80], textColor: 255 },
            styles: { fontSize: 9, cellPadding: 2.5 },
            didDrawPage: (data: any) => { startY = data.cursor.y; }
        });
        startY = (doc as any).lastAutoTable.finalY + 8;
    } else {
        totalPaidInConcepts = payment.totalAmount;
        (doc as any).autoTable({
            startY: startY,
            head: [['Concepto', 'Monto Pagado (Bs)']],
            body: [['Abono a Saldo a Favor', \`Bs. \${formatToTwoDecimals(payment.totalAmount)}\`]],
            theme: 'striped',
            headStyles: { fillColor: [44, 62, 80], textColor: 255 },
            styles: { fontSize: 9, cellPadding: 2.5 },
            didDrawPage: (data: any) => { startY = data.cursor.y; }
        });
        startY = (doc as any).lastAutoTable.finalY + 8;
    }
    
    // Totals Section
    const totalLabel = "TOTAL PAGADO:";
    const totalValue = \`Bs. \${formatToTwoDecimals(totalPaidInConcepts)}\`;
    doc.setFontSize(11).setFont('helvetica', 'bold');
    const totalValueWidth = doc.getStringUnitWidth(totalValue) * 11 / doc.internal.scaleFactor;
    doc.text(totalValue, pageWidth - margin, startY, { align: 'right' });
    doc.text(totalLabel, pageWidth - margin - totalValueWidth - 2, startY, { align: 'right' });

    startY += 10;
    
    // Observations Section
    if (payment.observations) {
        doc.setFontSize(9).setFont('helvetica', 'italic');
        const splitObservations = doc.splitTextToSize(payment.observations, pageWidth - margin * 2);
        doc.text("Observaciones:", margin, startY);
        startY += 5;
        doc.text(splitObservations, margin, startY);
        startY += (splitObservations.length * 4) + 4;
    }

    // --- Footer Section ---
    const legalNote = 'Todo propietario que requiera de firma y sello húmedo deberá imprimir éste recibo y hacerlo llegar al condominio para su respectiva estampa.';
    const splitLegalNote = doc.splitTextToSize(legalNote, pageWidth - (margin * 2));
    doc.setFontSize(9).setFont('helvetica', 'bold').text(splitLegalNote, margin, startY);
    startY += (splitLegalNote.length * 4) + 4;

    doc.setFontSize(9).setFont('helvetica', 'normal').text('Este recibo confirma que el pago ha sido validado para la(s) cuota(s) y propiedad(es) aquí detalladas.', margin, startY);
    startY += 8;
    doc.setFont('helvetica', 'bold').text(\`Firma electrónica: '\${companyInfo.name} - Condominio'\`, margin, startY);
    startY += 10;
    doc.setLineWidth(0.2).line(margin, startY, pageWidth - margin, startY);
    startY += 5;
    doc.setFontSize(8).setFont('helvetica', 'italic').text('Este recibo se generó de manera automática y es válido sin firma manuscrita.', pageWidth / 2, startY, { align: 'center'});

    doc.save(\`Recibo_de_Pago_\${payment.id.substring(0,7)}.pdf\`);
    setIsReceiptPreviewOpen(false);
  };

  const filteredPayments = payments.filter(p => filter === 'todos' || p.status === filter);

  return (
    <div className="space-y-8">
        <div>
            <h1 className="text-3xl font-bold font-headline">Verificación de Pagos</h1>
            <p className="text-muted-foreground">Aprueba o rechaza los pagos reportados y genera recibos.</p>
        </div>

        <Card>
            <CardHeader>
                <div className="flex justify-between items-center">
                    <CardTitle>Pagos Registrados</CardTitle>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline">
                                <Filter className="mr-2 h-4 w-4" />
                                Filtrar por: <span className="font-semibold ml-1 capitalize">{filter === 'todos' ? 'Todos' : statusTextMap[filter]}</span>
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setFilter('todos')}>Todos</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setFilter('pendiente')}>{statusTextMap['pendiente']}</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setFilter('aprobado')}>{statusTextMap['aprobado']}</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setFilter('rechazado')}>{statusTextMap['rechazado']}</DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Beneficiario</TableHead>
                            <TableHead>Unidad</TableHead>
                            <TableHead>Monto</TableHead>
                            <TableHead>Fecha</TableHead>
                            <TableHead>Banco</TableHead>
                            <TableHead>Estado</TableHead>
                            <TableHead className="text-right">Acciones</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow>
                                <TableCell colSpan={7} className="h-24 text-center">
                                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
                                </TableCell>
                            </TableRow>
                        ) : filteredPayments.length === 0 ? (
                             <TableRow>
                                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                                    No hay pagos que coincidan con el filtro seleccionado.
                                </TableCell>
                             </TableRow>
                        ) : (
                            filteredPayments.map((payment) => (
                            <TableRow key={payment.id}>
                                <TableCell className="font-medium">{payment.user}</TableCell>
                                <TableCell>{payment.unit}</TableCell>
                                <TableCell>
                                    {payment.type === 'adelanto' 
                                        ? \`$\${formatToTwoDecimals(payment.amount)}\`
                                        : \`Bs. \${formatToTwoDecimals(payment.amount)}\`
                                    }
                                </TableCell>
                                <TableCell>{new Date(payment.date).toLocaleDateString('es-VE')}</TableCell>
                                <TableCell>{payment.bank}</TableCell>
                                <TableCell>
                                    <Badge variant={statusVariantMap[payment.status]}>
                                        {statusTextMap[payment.status]}
                                    </Badge>
                                </TableCell>
                                <TableCell className="text-right">
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" className="h-8 w-8 p-0">
                                                <span className="sr-only">Abrir menú</span>
                                                <MoreHorizontal className="h-4 w-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            {payment.status === 'pendiente' && (
                                                <>
                                                    <DropdownMenuItem onClick={() => handleStatusChange(payment.id, 'aprobado')}>
                                                        <CheckCircle2 className="mr-2 h-4 w-4 text-green-500" />
                                                        Aprobar
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => handleStatusChange(payment.id, 'rechazado')} className="text-destructive">
                                                        <XCircle className="mr-2 h-4 w-4" />
                                                        Rechazar
                                                    </DropdownMenuItem>
                                                </>
                                            )}
                                            {payment.status === 'aprobado' && (
                                                <DropdownMenuItem onClick={() => showReceiptPdfPreview(payment)}>
                                                    <Printer className="mr-2 h-4 w-4" />
                                                    Generar Recibo
                                                </DropdownMenuItem>
                                            )}
                                             <DropdownMenuItem onClick={() => handleDeletePayment(payment)} className="text-destructive">
                                                <Trash2 className="mr-2 h-4 w-4" />
                                                Eliminar
                                             </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </TableCell>
                            </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>

        <Dialog open={isReceiptPdfPreviewOpen} onOpenChange={setIsReceiptPreviewOpen}>
            <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Vista Previa del Recibo</DialogTitle>
                    <DialogDescription>
                        Revise el recibo antes de descargarlo. El diseño se ajustará en el PDF final.
                    </DialogDescription>
                </DialogHeader>
                <div className="flex-grow overflow-y-auto pr-4 -mr-4">
                {receiptData && companyInfo && (
                     <div className="border rounded-md p-4 bg-white text-black font-sans text-xs space-y-4">
                        {/* Header */}
                        <div className="flex justify-between items-start">
                            <div className="flex items-center gap-4">
                                {companyInfo.logo && <img src={companyInfo.logo} alt="Logo" className="w-20 h-20 object-contain"/>}
                                <div>
                                    <p className="font-bold">{companyInfo.name}</p>
                                    <p>{companyInfo.rif}</p>
                                    <p>{companyInfo.address}</p>
                                    <p>Teléfono: {companyInfo.phone}</p>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="font-bold text-lg">RECIBO DE PAGO</p>
                                <p><strong>Fecha Emisión:</strong> {format(new Date(), 'dd/MM/yyyy')}</p>
                                <p><strong>N° Recibo:</strong> {receiptData.payment.id.substring(0, 10)}</p>
                            </div>
                        </div>
                        <hr className="my-2 border-gray-400"/>
                        {/* Details */}
                         <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                             <p><strong>Beneficiario:</strong></p><p>{receiptData.ownerName}</p>
                             <p><strong>Unidad:</strong></p><p>{receiptData.ownerUnit}</p>
                             <p><strong>Método de pago:</strong></p><p>{receiptData.payment.type}</p>
                             <p><strong>Banco Emisor:</strong></p><p>{receiptData.payment.bank}</p>
                             <p><strong>N° de Referencia:</strong></p><p>{receiptData.payment.reference}</p>
                             <p><strong>Fecha del pago:</strong></p><p>{format(receiptData.payment.paymentDate.toDate(), 'dd/MM/yyyy')}</p>
                             <p><strong>Tasa de Cambio Aplicada:</strong></p><p>Bs. {formatToTwoDecimals(receiptData.payment.exchangeRate)} por USD</p>
                        </div>
                        {/* Concept Table */}
                        <Table className="text-xs">
                            <TableHeader>
                                <TableRow className="bg-gray-700 text-white hover:bg-gray-800">
                                    <TableHead className="text-white">Período</TableHead>
                                    <TableHead className="text-white">Concepto (Propiedad)</TableHead>
                                    <TableHead className="text-white text-right">Monto ($)</TableHead>
                                    <TableHead className="text-white text-right">Monto Pagado (Bs)</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {receiptData.paidDebts.length > 0 ? (
                                    receiptData.paidDebts.map((debt, index) => (
                                        <TableRow key={index} className="even:bg-gray-100">
                                            <TableCell>{monthsLocale[debt.month]} {debt.year}</TableCell>
                                            <TableCell>{debt.description} ({debt.property ? \`\${debt.property.street} - \${debt.property.house}\` : 'N/A'})</TableCell>
                                            <TableCell className="text-right">$\{(debt.paidAmountUSD || debt.amountUSD).toFixed(2)}</TableCell>
                                            <TableCell className="text-right">Bs. {formatToTwoDecimals((debt.paidAmountUSD || debt.amountUSD) * receiptData.payment.exchangeRate)}</TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={4} className="h-24 text-center">Abono a Saldo a Favor</TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                         <div className="text-right font-bold mt-2 pr-4">
                            Total Pagado: Bs. {formatToTwoDecimals(receiptData.paidDebts.reduce((acc, debt) => acc + ((debt.paidAmountUSD || debt.amountUSD) * receiptData.payment.exchangeRate), 0) > 0 ? receiptData.paidDebts.reduce((acc, debt) => acc + ((debt.paidAmountUSD || debt.amountUSD) * receiptData.payment.exchangeRate), 0) : receiptData.payment.amount)}
                         </div>
                        {/* Footer */}
                        <div className="mt-6 text-gray-600 text-[10px] space-y-2">
                             <p className="text-left text-[11px] font-bold">Todo propietario que requiera de firma y sello húmedo deberá imprimir éste recibo y hacerlo llegar al condominio para su respectiva estampa.</p>
                             <p className="text-left">Este recibo confirma que su pago ha sido validado conforme a los términos establecidos por la comunidad.</p>
                             <p className="text-left font-bold mt-2">Firma electrónica: '{companyInfo.name} - Condominio'</p>
                             <hr className="my-4 border-gray-400"/>
                             <p className="italic text-center">Este recibo se generó de manera automática y es válido sin firma manuscrita.</p>
                        </div>
                    </div>
                )}
                </div>
                <DialogFooter className="mt-auto pt-4 border-t">
                    <Button variant="outline" onClick={() => setIsReceiptPreviewOpen(false)}>Cerrar</Button>
                    <Button onClick={handleDownloadPdf}>
                        <Printer className="mr-2 h-4 w-4"/> Descargar PDF
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    </div>
  );
}
    
    

    

// FILE: src/app/admin/people/page.tsx
'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PlusCircle, MoreHorizontal, Edit, Trash2, FileUp, FileDown, Loader2, MinusCircle, KeyRound, Search, RefreshCw } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { collection, query, onSnapshot, addDoc, updateDoc, deleteDoc, doc, getDoc, setDoc, getDocs, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';


type Role = 'propietario' | 'administrador';

type Property = {
    street: string;
    house: string;
};

type Owner = {
    id: string; 
    name: string;
    properties: Property[];
    email?: string;
    balance: number;
    role: Role;
    passwordChanged?: boolean;
};

type CompanyInfo = {
    name: string;
    address: string;
    rif: string;
    phone: string;
    email: string;
    logo: string;
};

const emptyOwner: Omit<Owner, 'id' | 'balance'> & { id?: string; balance: number | string; } = { 
    name: '', 
    properties: [{ street: '', house: '' }], 
    email: '', 
    balance: 0, 
    role: 'propietario',
    passwordChanged: false,
};

const streets = Array.from({ length: 8 }, (_, i) => \`Calle \${i + 1}\`);

const getHousesForStreet = (street: string) => {
    if (!street) return [];
    const streetString = String(street);
    const streetNumber = parseInt(streetString.replace('Calle ', '') || '0');
    if (isNaN(streetNumber)) return [];
    const houseCount = streetNumber === 1 ? 4 : 14;
    return Array.from({ length: houseCount }, (_, i) => \`Casa \${i + 1}\`);
};

const ADMIN_USER_ID = 'G2jhcEnp05TcvjYj8SwhzVCHbW83'; 

const formatToTwoDecimals = (num: number) => {
    if (typeof num !== 'number' || isNaN(num)) return '0,00';
    const truncated = Math.trunc(num * 100) / 100;
    return truncated.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export default function PeopleManagementPage() {
    const [owners, setOwners] = useState<Owner[]>([]);
    const [loading, setLoading] = useState(true);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isDeleteConfirmationOpen, setIsDeleteConfirmationOpen] = useState(false);
    const [currentOwner, setCurrentOwner] = useState<Omit<Owner, 'id'> & { id?: string; balance: number | string; }>(emptyOwner);
    const [ownerToDelete, setOwnerToDelete] = useState<Owner | null>(null);
    const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const importFileRef = useRef<HTMLInputElement>(null);
    const { toast } = useToast();

    useEffect(() => {
        const q = query(collection(db, "owners"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const ownersData: Owner[] = [];
            snapshot.forEach((doc) => {
                const data = doc.data();
                ownersData.push({ id: doc.id, ...data, balance: data.balance ?? 0 } as Owner);
            });
            
            const getSortKeys = (owner: Owner) => {
                const prop = (owner.properties && owner.properties.length > 0) ? owner.properties[0] : { street: 'N/A', house: 'N/A' };
                const streetNum = parseInt(String(prop.street || '').replace('Calle ', '') || '999');
                const houseNum = parseInt(String(prop.house || '').replace('Casa ', '') || '999');
                return { streetNum, houseNum };
            };

            ownersData.sort((a, b) => {
                const aKeys = getSortKeys(a);
                const bKeys = getSortKeys(b);
                if (aKeys.streetNum !== bKeys.streetNum) {
                    return aKeys.streetNum - bKeys.streetNum;
                }
                return aKeys.houseNum - bKeys.houseNum;
            });

            setOwners(ownersData);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching owners: ", error);
            toast({ variant: 'destructive', title: 'Error de Conexión', description: 'No se pudieron cargar los propietarios.' });
            setLoading(false);
        });

        const fetchCompanyInfo = async () => {
            const settingsRef = doc(db, 'config', 'mainSettings');
            const docSnap = await getDoc(settingsRef);
            if (docSnap.exists()) {
                setCompanyInfo(docSnap.data().companyInfo as CompanyInfo);
            }
        };
        fetchCompanyInfo();

        return () => unsubscribe();
    }, [toast]);
    
    const filteredOwners = useMemo(() => {
        if (!searchTerm) return owners;
        const lowerCaseSearch = searchTerm.toLowerCase();
        return owners.filter(owner => {
            const ownerName = owner.name.toLowerCase();
            const propertiesMatch = owner.properties?.some(p => 
                (p.house && String(p.house).toLowerCase().includes(lowerCaseSearch)) ||
                (p.street && String(p.street).toLowerCase().includes(lowerCaseSearch))
            );
            return ownerName.includes(lowerCaseSearch) || propertiesMatch;
        });
    }, [searchTerm, owners]);

    const handleAddOwner = () => {
        setCurrentOwner(emptyOwner);
        setIsDialogOpen(true);
    };

    const handleEditOwner = (owner: Owner) => {
        const editableOwner = {
            ...owner,
            properties: owner.properties && owner.properties.length > 0 
                ? owner.properties 
                : [{ street: '', house: '' }]
        };
        setCurrentOwner(editableOwner);
        setIsDialogOpen(true);
    };

    const handleDeleteOwner = (owner: Owner) => {
        setOwnerToDelete(owner);
        setIsDeleteConfirmationOpen(true);
    }

    const confirmDelete = async () => {
        if (ownerToDelete) {
             try {
                // Here you would also call a cloud function to delete the auth user
                await deleteDoc(doc(db, "owners", ownerToDelete.id));
                toast({ title: 'Propietario Eliminado', description: \`\${ownerToDelete.name} ha sido eliminado de la base de datos.\` });
            } catch (error) {
                console.error("Error deleting document: ", error);
                toast({ variant: 'destructive', title: 'Error', description: 'No se pudo eliminar el propietario.' });
            } finally {
                setIsDeleteConfirmationOpen(false);
                setOwnerToDelete(null);
            }
        }
    }

    const handleSaveOwner = async () => {
        if (!currentOwner.name || !currentOwner.email || currentOwner.properties.some(p => !p.street || !p.house)) {
            toast({ variant: 'destructive', title: 'Error de Validación', description: 'Nombre, Email, calle y casa son obligatorios.' });
            return;
        }

        const { id, ...ownerData } = currentOwner;
        const balanceValue = parseFloat(String(ownerData.balance).replace(',', '.') || '0');
        const dataToSave: any = {
            name: ownerData.name,
            email: ownerData.email,
            properties: ownerData.properties,
            role: ownerData.role,
            balance: isNaN(balanceValue) ? 0 : balanceValue,
            passwordChanged: ownerData.passwordChanged || false,
        };
        
        try {
            if (id) { // Editing existing owner
                const ownerRef = doc(db, "owners", id);
                await updateDoc(ownerRef, dataToSave);
                toast({ title: 'Propietario Actualizado', description: 'Los datos han sido guardados exitosamente.' });
            } else { // Creating new owner
                // This would be a cloud function call in a real app to protect credentials
                // For simplicity, we simulate the result. A real implementation is needed.
                const newOwnerRef = doc(collection(db, "owners"));
                await setDoc(newOwnerRef, dataToSave);
                toast({ title: 'Propietario Agregado', description: \`Se ha creado el perfil para \${dataToSave.name}. Se necesita acción manual en Firebase para crear su cuenta de autenticación con la contraseña '123456'.\` });
            }
        } catch (error: any) {
            console.error("Error saving owner: ", error);
            toast({ variant: 'destructive', title: 'Error', description: error.message || 'No se pudieron guardar los cambios.' });
        } finally {
            setIsDialogOpen(false);
            setCurrentOwner(emptyOwner);
        }
    };


    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { id, value } = e.target;
        setCurrentOwner({ 
            ...currentOwner, 
            [id]: value
        });
    };

    const handleRoleChange = (value: string) => {
        setCurrentOwner({ ...currentOwner, role: value as Role });
    };

    const handlePropertyChange = (index: number, field: 'street' | 'house', value: string) => {
        const newProperties = [...currentOwner.properties];
        newProperties[index] = { ...newProperties[index], [field]: value };
        if (field === 'street') {
            newProperties[index].house = ''; // Reset house when street changes
        }
        setCurrentOwner({ ...currentOwner, properties: newProperties });
    };

    const addProperty = () => {
        setCurrentOwner({ ...currentOwner, properties: [...currentOwner.properties, { street: '', house: '' }] });
    };

    const removeProperty = (index: number) => {
        const newProperties = currentOwner.properties.filter((_, i) => i !== index);
        setCurrentOwner({ ...currentOwner, properties: newProperties });
    };
    
    const handleExportExcel = () => {
        const dataToExport = owners.flatMap(o => {
            if (o.id === ADMIN_USER_ID) return []; // Exclude admin
            const properties = (o.properties && o.properties.length > 0) ? o.properties : [{ street: 'N/A', house: 'N/A'}];
            return properties.map(p => ({
                Nombre: o.name,
                Calle: p.street,
                Casa: p.house,
                Email: o.email || '',
                'Saldo a Favor (Bs.)': parseFloat(String(o.balance)) || 0,
                Rol: o.role,
            }));
        });
        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Propietarios");
        XLSX.writeFile(workbook, "propietarios.xlsx");
    };

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
        doc.text("Lista de Propietarios", pageWidth / 2, margin + 45, { align: 'center' });

        (doc as any).autoTable({
            head: [['Nombre', 'Propiedades', 'Email', 'Rol', 'Saldo a Favor (Bs.)']],
            body: owners.filter(o => o.id !== ADMIN_USER_ID).map(o => { // Exclude admin
                const properties = (o.properties && o.properties.length > 0) 
                    ? o.properties.map(p => \`\${p.street} - \${p.house}\`).join('\\n') 
                    : 'N/A';
                const balanceNum = parseFloat(String(o.balance));
                const balanceDisplay = balanceNum > 0 ? \`Bs. \${formatToTwoDecimals(balanceNum)}\` : '-';
                return [o.name, properties, o.email || '-', o.role, balanceDisplay];
            }),
            startY: margin + 55,
            headStyles: { fillColor: [30, 80, 180] },
            styles: { cellPadding: 2, fontSize: 8 },
        });

        doc.save('propietarios.pdf');
    };
    
    const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) {
            return;
        }

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const data = event.target?.result;
                if (!data) throw new Error("File data is empty.");

                const workbook = XLSX.read(data, { type: 'binary' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const json = XLSX.utils.sheet_to_json(worksheet, { header: ["name", "street", "house", "email", "balance", "role"], range: 1 });
                
                const ownersMap: { [key: string]: Partial<Owner> } = {};
                (json as any[]).forEach(item => {
                    if (!item.name) return; // Name is the minimum requirement
                    const key = (item.email || item.name).toLowerCase(); // Use name as key if email is missing
                    if (!ownersMap[key]) {
                        const balanceNum = parseFloat(item.balance);
                        ownersMap[key] = {
                            name: item.name,
                            email: item.email || undefined,
                            balance: isNaN(balanceNum) ? 0 : parseFloat(balanceNum.toFixed(2)),
                            role: (item.role === 'administrador' || item.role === 'propietario') ? item.role : 'propietario',
                            properties: []
                        };
                    }
                    if (item.street && item.house && ownersMap[key].properties) {
                        (ownersMap[key].properties as Property[]).push({ street: String(item.street), house: String(item.house) });
                    }
                });

                const newOwners = Object.values(ownersMap);
                const batch = writeBatch(db);
                let successCount = 0;
                
                for (const ownerData of newOwners) {
                    if (ownerData.name === 'EDWIN AGUIAR' || !ownerData.email) continue;
                    if (ownerData.properties && ownerData.properties.length > 0) {
                        const ownerDocRef = doc(collection(db, "owners"));
                         batch.set(ownerDocRef, { ...ownerData, passwordChanged: false });
                         successCount++;
                    }
                }

                await batch.commit();

                toast({
                    title: 'Importación Completada',
                    description: \`\${successCount} de \${newOwners.length} registros han sido agregados. La creación de cuentas de autenticación debe realizarse manualmente en Firebase.\`,
                    className: 'bg-green-100 border-green-400 text-green-800'
                });

            } catch (error) {
                console.error("Error al importar el archivo:", error);
                toast({
                    variant: 'destructive',
                    title: 'Error de Importación',
                    description: 'Hubo un problema al leer o guardar los datos. Asegúrate de que el formato es correcto.',
                });
            } finally {
                if (e.target) e.target.value = '';
            }
        };
        reader.readAsBinaryString(file);
    };


    const handleImportClick = () => {
        importFileRef.current?.click();
    };


    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-3xl font-bold font-headline">Gestión de Personas</h1>
                    <p className="text-muted-foreground">Agrega, edita y consulta personas en la base de datos.</p>
                </div>
                <div className="flex gap-2 flex-wrap">
                    <Button onClick={handleImportClick} variant="outline">
                        <FileUp className="mr-2 h-4 w-4" />
                        Importar Excel
                    </Button>
                     <input type="file" ref={importFileRef} onChange={handleFileImport} accept=".xlsx, .xls" className="hidden"/>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline">
                                <FileDown className="mr-2 h-4 w-4" />
                                Exportar
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                            <DropdownMenuItem onClick={handleExportExcel}>Exportar a Excel</DropdownMenuItem>
                            <DropdownMenuItem onClick={handleExportPDF}>Exportar a PDF</DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                    <Button onClick={handleAddOwner}>
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Agregar Persona
                    </Button>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Lista de Propietarios</CardTitle>
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
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Nombre</TableHead>
                                    <TableHead>Propiedades</TableHead>
                                    <TableHead>Email</TableHead>
                                    <TableHead>Rol</TableHead>
                                    <TableHead>Saldo a Favor (Bs.)</TableHead>
                                    <TableHead className="text-right">Acciones</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="h-24 text-center">
                                            <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
                                        </TableCell>
                                    </TableRow>
                                ) : filteredOwners.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                                            No se encontraron personas que coincidan con la búsqueda.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredOwners.map((owner) => (
                                        <TableRow key={owner.id}>
                                            <TableCell className="font-medium">{owner.name}</TableCell>
                                            <TableCell>
                                                {owner.properties && owner.properties.length > 0 
                                                    ? owner.properties.map(p => \`\${p.street} - \${p.house}\`).join(', ') 
                                                    : 'N/A'
                                                }
                                            </TableCell>
                                            <TableCell>{owner.email || '-'}</TableCell>
                                            <TableCell className="capitalize">{owner.role}</TableCell>
                                            <TableCell>
                                                 {owner.balance > 0
                                                    ? \`Bs. \${formatToTwoDecimals(owner.balance)}\` 
                                                    : '-'}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" className="h-8 w-8 p-0">
                                                            <span className="sr-only">Abrir menú</span>
                                                            <MoreHorizontal className="h-4 w-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuItem onClick={() => handleEditOwner(owner)}>
                                                            <Edit className="mr-2 h-4 w-4" />
                                                            Editar
                                                        </DropdownMenuItem>
                                                        {owner.id !== ADMIN_USER_ID && ( // Prevent admin deletion
                                                            <DropdownMenuItem onClick={() => handleDeleteOwner(owner)} className="text-destructive focus:text-destructive focus:bg-destructive/10">
                                                                <Trash2 className="mr-2 h-4 w-4" />
                                                                Eliminar
                                                            </DropdownMenuItem>
                                                        )}
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="sm:max-w-md max-h-[90vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle>{currentOwner.id ? 'Editar Persona' : 'Agregar Nueva Persona'}</DialogTitle>
                        <DialogDescription>
                            Completa la información aquí. Haz clic en guardar cuando termines.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex-grow overflow-y-auto pr-6 -mr-6">
                        <div className="grid gap-4 py-4">
                            <div className="space-y-2">
                                <Label htmlFor="name">Nombre</Label>
                                <Input id="name" value={currentOwner.name} onChange={handleInputChange} />
                            </div>
                             <div className="space-y-2">
                                <Label htmlFor="email">Email</Label>
                                <Input id="email" type="email" value={currentOwner.email || ''} onChange={handleInputChange} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="role">Rol</Label>
                                <Select onValueChange={handleRoleChange} value={currentOwner.role}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Seleccione un rol" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="propietario">Propietario</SelectItem>
                                        <SelectItem value="administrador">Administrador</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            
                            <div className="space-y-4">
                                <Label>Propiedades</Label>
                                {currentOwner.properties.map((prop, index) => {
                                    const houseOptions = getHousesForStreet(prop.street);
                                    return (
                                    <div key={index} className="grid grid-cols-10 gap-2 items-center p-2 rounded-md border">
                                        <div className="col-span-4 space-y-1">
                                            <Label htmlFor={\`street-\${index}\`} className="text-xs">Calle</Label>
                                            <Select onValueChange={(v) => handlePropertyChange(index, 'street', v)} value={prop.street}>
                                                <SelectTrigger><SelectValue placeholder="Calle..." /></SelectTrigger>
                                                <SelectContent>{streets.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                                            </Select>
                                        </div>
                                        <div className="col-span-4 space-y-1">
                                            <Label htmlFor={\`house-\${index}\`} className="text-xs">Casa</Label>
                                            <Select onValueChange={(v) => handlePropertyChange(index, 'house', v)} value={prop.house} disabled={!prop.street}>
                                                <SelectTrigger><SelectValue placeholder="Casa..." /></SelectTrigger>
                                                <SelectContent>{houseOptions.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent>
                                            </Select>
                                        </div>
                                        <div className="col-span-2 flex items-end justify-end h-full">
                                        {currentOwner.properties.length > 1 && (
                                            <Button size="icon" variant="ghost" className="text-destructive" onClick={() => removeProperty(index)}>
                                                <MinusCircle className="h-5 w-5"/>
                                            </Button>
                                        )}
                                        </div>
                                    </div>
                                )})}
                                <Button variant="outline" size="sm" onClick={addProperty}>
                                    <PlusCircle className="mr-2 h-4 w-4"/>
                                    Agregar Propiedad
                                </Button>
                            </div>

                           
                            <div className="space-y-2">
                                <Label htmlFor="balance">Saldo a Favor (Bs.)</Label>
                                <Input id="balance" type="number" value={String(currentOwner.balance)} onChange={handleInputChange} placeholder="0.00" />
                            </div>
                        </div>
                    </div>
                    <DialogFooter className="mt-auto pt-4 border-t">
                        <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
                        <Button onClick={handleSaveOwner}>Guardar Cambios</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={isDeleteConfirmationOpen} onOpenChange={setIsDeleteConfirmationOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>¿Estás seguro?</DialogTitle>
                        <DialogDescription>
                            Esta acción no se puede deshacer. Esto eliminará permanentemente a <span className="font-semibold">{ownerToDelete?.name}</span> de la base de datos de la app.
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


// FILE: src/app/admin/reports/page.tsx
'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { es } from "date-fns/locale";
import { Calendar as CalendarIcon, Download, Search, Loader2, FileText, FileSpreadsheet, ArrowUpDown, Building, BadgeInfo, BadgeCheck, BadgeX, History, ChevronDown, ChevronRight, TrendingUp, TrendingDown, DollarSign, Receipt } from "lucide-react";
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { collection, getDocs, query, where, doc, getDoc, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';
import { Calendar } from "@/components/ui/calendar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from '@/components/ui/label';
import { format, addMonths, startOfMonth, parse, getMonth, getYear, isBefore, isEqual, differenceInCalendarMonths, differenceInMonths } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LabelList } from 'recharts';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';


type Owner = {
    id: string;
    name: string;
    properties: { street: string, house: string }[];
    email?: string;
    balance: number;
};

type Payment = {
  id: string;
  paymentDate: Timestamp;
  totalAmount: number;
  exchangeRate?: number;
  beneficiaries: { ownerId: string; street?: string; house?: string; amount: number;}[];
  status: 'aprobado' | 'pendiente' | 'rechazado';
  reportedBy: string;
  reference?: string;
  reference: string;
};

type IncomeReportRow = {
    ownerName: string;
    street: string;
    house: string;
    date: string;
    amount: number;
    reference: string;
};


type HistoricalPayment = {
    ownerId: string;
    referenceMonth: number;
    referenceYear: number;
};

type Debt = {
    id: string;
    ownerId: string;
    year: number;
    month: number;
    amountUSD: number;
    description: string;
    status: 'pending' | 'paid';
    paymentDate?: Timestamp;
    paidAmountUSD?: number;
    property: { street: string, house: string };
};

type CompanyInfo = {
    name: string;
    address: string;
    rif: string;
    phone: string;
    email: string;
    logo: string;
};

type IntegralReportRow = {
    ownerId: string;
    name: string;
    properties: string;
    lastPaymentDate: string;
    paidAmount: number;
    avgRate: number;
    balance: number;
    status: 'Solvente' | 'No Solvente';
    solvencyPeriod: string;
    monthsOwed: number;
    adjustmentDebtUSD: number; // New field for pending adjustment debt
};

type DelinquentOwner = {
    id: string;
    name: string;
    properties: string;
    debtAmountUSD: number;
    monthsOwed: number;
};

type BalanceOwner = {
    id: string;
    name: string;
    properties: string;
    balance: number;
};

type PaymentWithDebts = Payment & {
    liquidatedDebts: Debt[];
};

type AdvancePaymentReportRow = {
    ownerId: string;
    ownerName: string;
    october: { amount: number; status: string; toAdjust: number; } | null;
    november: { amount: number; status: string; toAdjust: number; } | null;
    december: { amount: number; status: string; toAdjust: number; } | null;
};

type AccountStatementData = {
    payments: Payment[];
    debts: Debt[];
    totalPaidBs: number;
    totalDebtUSD: number;
    balance: number;
};


const monthsLocale: { [key: number]: string } = {
    1: 'Ene', 2: 'Feb', 3: 'Mar', 4: 'Abr', 5: 'May', 6: 'Jun',
    7: 'Jul', 8: 'Ago', 9: 'Sep', 10: 'Oct', 11: 'Nov', 12: 'Dic'
};

type SortKey = 'name' | 'debtAmountUSD' | 'monthsOwed';
type SortDirection = 'asc' | 'desc';

const formatToTwoDecimals = (num: number) => {
    if (typeof num !== 'number' || isNaN(num)) {
        return '0,00';
    }
    const truncated = Math.trunc(num * 100) / 100;
    return truncated.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// Custom Label for Bar Charts
const CustomBarLabel = (props: any) => {
    const { x, y, width, value } = props;
    return (
        <text x={x + width / 2} y={y} fill="#fff" textAnchor="middle" dy={-6} fontSize="12" fontWeight="bold">
            {\`$\${Math.round(value)}\`}
        </text>
    );
};


export default function ReportsPage() {
    const { toast } = useToast();
    const [loading, setLoading] = useState(true);
    const [generatingReport, setGeneratingReport] = useState(false);
    
    // Data stores
    const [owners, setOwners] = useState<Owner[]>([]);
    const [allPayments, setAllPayments] = useState<Payment[]>([]);
    const [allDebts, setAllDebts] = useState<Debt[]>([]);
    const [allHistoricalPayments, setAllHistoricalPayments] = useState<HistoricalPayment[]>([]);
    const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);
    const [activeRate, setActiveRate] = useState(0);

    // Filters for Integral Report
    const [integralStatusFilter, setIntegralStatusFilter] = useState('todos');
    const [integralOwnerFilter, setIntegralOwnerFilter] = useState('');
    const [integralDateRange, setIntegralDateRange] = useState<{ from?: Date; to?: Date }>({});
    
    // Filters for Income Report
    const [incomeDateRange, setIncomeDateRange] = useState<{ from?: Date; to?: Date }>({});
    const [incomeSearchTerm, setIncomeSearchTerm] = useState('');

    // State for Delinquency Report
    const [allDelinquentOwners, setAllDelinquentOwners] = useState<DelinquentOwner[]>([]);
    const [delinquencyFilterType, setDelinquencyFilterType] = useState('all');
    const [customMonthRange, setCustomMonthRange] = useState({ from: '1', to: '6' });
    const [delinquencySearchTerm, setDelinquencySearchTerm] = useState('');
    const [delinquencySortConfig, setDelinquencySortConfig] = useState<{ key: SortKey, direction: SortDirection }>({ key: 'name', direction: 'asc' });
    const [selectedDelinquentOwners, setSelectedDelinquentOwners] = useState<Set<string>>(new Set());
    const [includeDelinquencyAmounts, setIncludeDelinquencyAmounts] = useState(true);
    
    // State for Individual Report
    const [individualSearchTerm, setIndividualSearchTerm] = useState('');
    const [selectedIndividual, setSelectedIndividual] = useState<Owner | null>(null);
    const [individualPayments, setIndividualPayments] = useState<PaymentWithDebts[]>([]);
    const [individualDebtUSD, setIndividualDebtUSD] = useState(0);

    // State for Account Statement report
    const [statementSearchTerm, setStatementSearchTerm] = useState('');
    const [selectedStatementOwner, setSelectedStatementOwner] = useState<Owner | null>(null);
    const [accountStatementData, setAccountStatementData] = useState<AccountStatementData | null>(null);
    

    // State for Balance Report
    const [balanceOwners, setBalanceOwners] = useState<BalanceOwner[]>([]);
    const [balanceSearchTerm, setBalanceSearchTerm] = useState('');

    // State for Charts
    const [chartsDateRange, setChartsDateRange] = useState<{ from?: Date; to?: Date }>({});


    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const settingsRef = doc(db, 'config', 'mainSettings');
            const ownersQuery = query(collection(db, 'owners'), where('name', '!=', 'EDWIN AGUIAR'));
            const paymentsQuery = query(collection(db, 'payments'));
            const debtsQuery = query(collection(db, 'debts'));
            const historicalPaymentsQuery = query(collection(db, 'historical_payments'));
            
            const [settingsSnap, ownersSnapshot, paymentsSnapshot, debtsSnapshot, historicalPaymentsSnapshot] = await Promise.all([
                getDoc(settingsRef),
                getDocs(ownersQuery),
                getDocs(paymentsQuery),
                getDocs(debtsQuery),
                getDocs(historicalPaymentsQuery)
            ]);

            let rate = 0;
            if (settingsSnap.exists()){
                 const settings = settingsSnap.data();
                 setCompanyInfo(settings.companyInfo);
                 const rates = settings.exchangeRates || [];
                 const activeRateObj = rates.find((r: any) => r.active);
                 rate = activeRateObj ? activeRateObj.rate : (rates.length > 0 ? rates[0]?.rate : 0);
                 setActiveRate(rate);
            }

            const ownersData = ownersSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Owner));
            setOwners(ownersData);

            const paymentsData = paymentsSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Payment));
            setAllPayments(paymentsData);
            
            const debtsData = debtsSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Debt));
            setAllDebts(debtsData);
            setAllHistoricalPayments(historicalPaymentsSnapshot.docs.map(d => d.data() as HistoricalPayment));

             // --- Delinquency Data Calculation ---
            const debtsByOwner = new Map<string, { totalUSD: number, count: number }>();
            debtsData.filter(d => d.status === 'pending').forEach(debt => {
                const ownerData = debtsByOwner.get(debt.ownerId) || { totalUSD: 0, count: 0 };
                // We only count base fees for "months owed", not adjustments
                if (debt.description.toLowerCase().includes('condominio')) {
                    ownerData.count += 1;
                }
                ownerData.totalUSD += debt.amountUSD;
                debtsByOwner.set(debt.ownerId, ownerData);
            });

            const delinquentData: DelinquentOwner[] = [];
            debtsByOwner.forEach((debtInfo, ownerId) => {
                const owner = ownersData.find(o => o.id === ownerId);
                if (owner) {
                    delinquentData.push({
                        id: ownerId,
                        name: owner.name,
                        properties: (owner.properties || []).map((p: any) => \`\${p.street} - \${p.house}\`).join(', '),
                        debtAmountUSD: debtInfo.totalUSD,
                        monthsOwed: debtInfo.count,
                    });
                }
            });
            setAllDelinquentOwners(delinquentData);
            setSelectedDelinquentOwners(new Set(delinquentData.map(o => o.id)));

            // --- Balance Report Data Calculation ---
            const getSortKeys = (owner: Owner) => {
                const prop = (owner.properties && owner.properties.length > 0) ? owner.properties[0] : { street: 'N/A', house: 'N/A' };
                const streetNum = parseInt(String(prop.street || '').replace('Calle ', '') || '999');
                const houseNum = parseInt(String(prop.house || '').replace('Casa ', '') || '999');
                return { streetNum, houseNum };
            };

            const ownersWithBalance = ownersData.filter(o => o.balance > 0);
            
            const balanceReportData = ownersWithBalance.sort((a, b) => {
                const aKeys = getSortKeys(a);
                const bKeys = getSortKeys(b);
                if (aKeys.streetNum !== bKeys.streetNum) {
                    return aKeys.streetNum - bKeys.streetNum;
                }
                return aKeys.houseNum - bKeys.houseNum;
            }).map(owner => {
                return {
                    id: owner.id,
                    name: owner.name,
                    properties: (owner.properties || []).map(p => \`\${p.street} - \${p.house}\`).join(', '),
                    balance: owner.balance,
                };
            });

            setBalanceOwners(balanceReportData);

        } catch (error) {
            console.error("Error fetching report data:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron cargar los datos para los reportes.' });
        } finally {
            setLoading(false);
        }
    }, [toast]);
    
    useEffect(() => {
        fetchData();
    }, [fetchData]);


    const integralReportData = useMemo<IntegralReportRow[]>(() => {
        const getSortKeys = (owner: Owner) => {
            const prop = (owner.properties && owner.properties.length > 0) ? owner.properties[0] : { street: 'N/A', house: 'N/A' };
            const streetNum = parseInt(String(prop.street || '').replace('Calle ', '') || '999');
            const houseNum = parseInt(String(prop.house || '').replace('Casa ', '') || '999');
            return { streetNum, houseNum };
        };
    
        const sortedOwners = [...owners].sort((a, b) => {
            const aKeys = getSortKeys(a);
            const bKeys = getSortKeys(b);
            if (aKeys.streetNum !== bKeys.streetNum) return aKeys.streetNum - bKeys.streetNum;
            return aKeys.houseNum - bKeys.houseNum;
        });

        const startOfCurrentMonth = startOfMonth(new Date());

        return sortedOwners.map(owner => {
            const ownerAllDebts = allDebts.filter(d => d.ownerId === owner.id);
            const ownerHistoricalPayments = allHistoricalPayments.filter(hp => hp.ownerId === owner.id);
            
            // Phase 1: Determine all "solvent months"
            const solventMonths = new Set<string>();

            ownerAllDebts.forEach(debt => {
                const isJuly2025OrBefore = debt.year < 2025 || (debt.year === 2025 && debt.month <= 7);
                const isPaid = debt.status === 'paid';
                const paidAmount = debt.paidAmountUSD || 0;

                if (isPaid) {
                    if (isJuly2025OrBefore && paidAmount >= 10) {
                        solventMonths.add(\`\${debt.year}-\${debt.month}\`);
                    } else if (!isJuly2025OrBefore && paidAmount >= 15) {
                        solventMonths.add(\`\${debt.year}-\${debt.month}\`);
                    } else if (debt.description.toLowerCase().includes('ajuste por aumento')) {
                        solventMonths.add(\`\${debt.year}-\${debt.month}\`);
                    }
                }
            });
            ownerHistoricalPayments.forEach(hp => {
                 solventMonths.add(\`\${hp.referenceYear}-\${hp.referenceMonth}\`);
            });


            // Phase 2: Find the last consecutive solvent month
            let lastSolventDate: Date | null = null;
            if (solventMonths.size > 0) {
                const sortedSolventPeriods = Array.from(solventMonths).map(p => {
                    const [year, month] = p.split('-').map(Number);
                    return new Date(year, month - 1);
                }).sort((a, b) => a.getTime() - b.getTime());

                lastSolventDate = sortedSolventPeriods[0];
                for (let i = 0; i < sortedSolventPeriods.length - 1; i++) {
                    const current = sortedSolventPeriods[i];
                    const next = sortedSolventPeriods[i + 1];
                    if (differenceInCalendarMonths(next, current) > 1) {
                        break; 
                    }
                    lastSolventDate = next;
                }
            }
            
            // Phase 3: Determine solvency status and period string
            const pendingDebtsUpToCurrentMonth = ownerAllDebts.filter(d => {
                const debtDate = new Date(d.year, d.month - 1);
                return d.status === 'pending' && (isEqual(debtDate, startOfCurrentMonth) || isBefore(debtDate, startOfCurrentMonth));
            });
            
            const status: 'Solvente' | 'No Solvente' = pendingDebtsUpToCurrentMonth.length === 0 ? 'Solvente' : 'No Solvente';
            
            let solvencyPeriod = 'N/A';
            if (status === 'No Solvente') {
                const oldestDebt = [...pendingDebtsUpToCurrentMonth].sort((a,b) => a.year - b.year || a.month - a.month)[0];
                if (oldestDebt) {
                    solvencyPeriod = \`Desde \${monthsLocale[oldestDebt.month]} \${oldestDebt.year}\`;
                }
            } else {
                 if (lastSolventDate) {
                    solvencyPeriod = \`Hasta \${format(lastSolventDate, 'MMM yyyy', { locale: es })}\`;
                 }
            }
            
            // Phase 4: Calculate months owed
            let monthsOwed = 0;
            if (status === 'No Solvente' && lastSolventDate) {
                 monthsOwed = differenceInMonths(startOfCurrentMonth, lastSolventDate);
            } else if (status === 'No Solvente' && !lastSolventDate) {
                // If never paid, count all pending months up to current
                monthsOwed = pendingDebtsUpToCurrentMonth.length;
            }

            // Phase 5: Calculate pending adjustment debt
            const adjustmentDebtUSD = ownerAllDebts
                .filter(d => d.status === 'pending' && d.description.toLowerCase().includes('ajuste por aumento de cuota'))
                .reduce((sum, d) => sum + d.amountUSD, 0);
            
            // Phase 6: Filter payments for reporting based on date range
            const fromDate = integralDateRange.from;
            const toDate = integralDateRange.to;
            if (fromDate) fromDate.setHours(0, 0, 0, 0);
            if (toDate) toDate.setHours(23, 59, 59, 999);
    
            const ownerPayments = allPayments.filter(p => {
                const isOwnerPayment = p.beneficiaries.some(b => b.ownerId === owner.id) && p.status === 'aprobado';
                if (!isOwnerPayment) return false;
                const paymentDate = p.paymentDate.toDate();
                if (fromDate && paymentDate < fromDate) return false;
                if (toDate && paymentDate > toDate) return false;
                return true;
            });
    
            const totalPaid = ownerPayments.reduce((sum, p) => sum + p.totalAmount, 0);
            const totalRateWeight = ownerPayments.reduce((sum, p) => sum + ((p.exchangeRate || 0) * p.totalAmount), 0);
            const avgRate = totalPaid > 0 ? totalRateWeight / totalPaid : 0;
            
            let lastPaymentDate = '';
            if (ownerPayments.length > 0) {
                const lastPayment = [...ownerPayments].sort((a, b) => b.paymentDate.toMillis() - a.paymentDate.toMillis())[0];
                lastPaymentDate = format(lastPayment.paymentDate.toDate(), 'dd/MM/yyyy');
            }
    
            return {
                ownerId: owner.id,
                name: owner.name,
                properties: (owner.properties || []).map(p => \`\${p.street}-\${p.house}\`).join(', '),
                lastPaymentDate,
                paidAmount: totalPaid,
                avgRate: avgRate,
                balance: owner.balance,
                status,
                solvencyPeriod,
                monthsOwed: monthsOwed > 0 ? monthsOwed : 0,
                adjustmentDebtUSD: adjustmentDebtUSD,
            };
        }).filter(row => {
            const statusMatch = integralStatusFilter === 'todos' || row.status.toLowerCase().replace(' ', '') === integralStatusFilter.toLowerCase().replace(' ', '');
            const ownerMatch = !integralOwnerFilter || row.name.toLowerCase().includes(integralOwnerFilter.toLowerCase());
            return statusMatch && ownerMatch;
        });
    }, [owners, allDebts, allHistoricalPayments, allPayments, integralDateRange, integralStatusFilter, integralOwnerFilter]);
    
    // --- Delinquency Report Logic ---
    const filteredAndSortedDelinquents = useMemo(() => {
        let owners = [...allDelinquentOwners];
        switch (delinquencyFilterType) {
            case '2_or_more': owners = owners.filter(o => o.monthsOwed >= 2); break;
            case '3_exact': owners = owners.filter(o => o.monthsOwed === 3); break;
            case 'custom':
                const from = parseInt(customMonthRange.from) || 1;
                const to = parseInt(customMonthRange.to) || 6;
                owners = owners.filter(o => o.monthsOwed >= from && o.monthsOwed <= to);
                break;
            default: break;
        }

        if (delinquencySearchTerm) {
            const lowerCaseSearch = delinquencySearchTerm.toLowerCase();
            owners = owners.filter(o => o.name.toLowerCase().includes(lowerCaseSearch) || o.properties.toLowerCase().includes(lowerCaseSearch));
        }

        owners.sort((a, b) => {
            if (a[delinquencySortConfig.key] < b[delinquencySortConfig.key]) return delinquencySortConfig.direction === 'asc' ? -1 : 1;
            if (a[delinquencySortConfig.key] > b[delinquencySortConfig.key]) return delinquencySortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });

        return owners;
    }, [allDelinquentOwners, delinquencyFilterType, customMonthRange, delinquencySearchTerm, delinquencySortConfig]);

     const debtsByStreetChartData = useMemo(() => {
        const fromDate = chartsDateRange.from;
        const toDate = chartsDateRange.to;
        if(fromDate) fromDate.setHours(0,0,0,0);
        if(toDate) toDate.setHours(23,59,59,999);

        const filteredDebts = allDebts.filter(debt => {
            if (debt.status !== 'pending') return false;
            // Use optional chaining to safely access property
            const street = debt.property?.street;
            if (!street || !street.startsWith('Calle')) return false;
            const streetNumber = parseInt(street.replace('Calle ', ''));
            if (streetNumber > 8) return false;


            const debtDate = new Date(debt.year, debt.month - 1);
            if (fromDate && debtDate < fromDate) return false;
            if (toDate && debtDate > toDate) return false;
            return true;
        });

        const debtsByStreet = filteredDebts.reduce((acc, debt) => {
            // This check is now safe due to the filter above
            const street = debt.property.street;
            if (!acc[street]) acc[street] = 0;
            acc[street] += debt.amountUSD;
            return acc;
        }, {} as { [key: string]: number });
        
        return Object.entries(debtsByStreet).map(([name, TotalDeuda]) => ({ name, TotalDeuda: parseFloat(TotalDeuda.toFixed(2)) }))
            .sort((a, b) => {
                const streetNumA = parseInt(a.name.replace('Calle ', ''));
                const streetNumB = parseInt(b.name.replace('Calle ', ''));
                return streetNumA - streetNumB;
            });
    }, [allDebts, chartsDateRange]);

    const incomeByStreetChartData = useMemo(() => {
        const fromDate = chartsDateRange.from;
        const toDate = chartsDateRange.to;
        if(fromDate) fromDate.setHours(0,0,0,0);
        if(toDate) toDate.setHours(23,59,59,999);

        const filteredPayments = allPayments.filter(payment => {
            if (payment.status !== 'aprobado') return false;
            const paymentDate = payment.paymentDate.toDate();
            if (fromDate && paymentDate < fromDate) return false;
            if (toDate && paymentDate > toDate) return false;
            return true;
        });
        
        const incomeByStreet = filteredPayments.reduce((acc, payment) => {
            payment.beneficiaries.forEach(beneficiary => {
                if (beneficiary.street && beneficiary.street.startsWith('Calle')) {
                    const streetNumber = parseInt(beneficiary.street.replace('Calle ', ''));
                    if (streetNumber > 8) return;

                    if (!acc[beneficiary.street]) acc[beneficiary.street] = 0;
                    // Approximate income in USD
                    const incomeUSD = beneficiary.amount / (payment.exchangeRate || activeRate || 1);
                    acc[beneficiary.street] += incomeUSD;
                }
            });
            return acc;
        }, {} as { [key: string]: number });

        return Object.entries(incomeByStreet).map(([name, TotalIngresos]) => ({ name, TotalIngresos: parseFloat(TotalIngresos.toFixed(2)) }))
            .sort((a, b) => {
                const streetNumA = parseInt(a.name.replace('Calle ', ''));
                const streetNumB = parseInt(b.name.replace('Calle ', ''));
                return streetNumA - streetNumB;
            });
    }, [allPayments, chartsDateRange, activeRate]);


    useEffect(() => {
        setSelectedDelinquentOwners(new Set(filteredAndSortedDelinquents.map(o => o.id)));
    }, [filteredAndSortedDelinquents]);

    const filteredIndividualOwners = useMemo(() => {
        if (!individualSearchTerm) return [];
        return owners.filter(o => o.name.toLowerCase().includes(individualSearchTerm.toLowerCase()));
    }, [individualSearchTerm, owners]);

    const filteredStatementOwners = useMemo(() => {
        if (!statementSearchTerm) return [];
        return owners.filter(o => o.name.toLowerCase().includes(statementSearchTerm.toLowerCase()));
    }, [statementSearchTerm, owners]);

    const filteredBalanceOwners = useMemo(() => {
        if (!balanceSearchTerm) return balanceOwners;
        return balanceOwners.filter(o => o.name.toLowerCase().includes(balanceSearchTerm.toLowerCase()));
    }, [balanceSearchTerm, balanceOwners]);

    // --- Advance Payment Report Logic ---
    const advancePaymentReportData = useMemo<AdvancePaymentReportRow[]>(() => {
        const targetYear = 2025;
        const targetMonths = [10, 11, 12]; // Oct, Nov, Dec
        const feeThreshold = 15;
        const adjustmentAmount = 5;

        // Filter debts for the specific period and type
        const advanceDebts = allDebts.filter(debt => 
            debt.year === targetYear && 
            targetMonths.includes(debt.month) && 
            debt.status === 'paid' && 
            debt.description.includes('adelantado')
        );

        if (advanceDebts.length === 0) return [];

        const dataByOwner = new Map<string, AdvancePaymentReportRow>();

        for (const debt of advanceDebts) {
            if (!dataByOwner.has(debt.ownerId)) {
                const owner = owners.find(o => o.id === debt.ownerId);
                dataByOwner.set(debt.ownerId, {
                    ownerId: debt.ownerId,
                    ownerName: owner?.name || 'Desconocido',
                    october: null,
                    november: null,
                    december: null,
                });
            }

            const ownerData = dataByOwner.get(debt.ownerId)!;
            const paidAmount = debt.paidAmountUSD || debt.amountUSD;
            const needsAdjustment = paidAmount < feeThreshold && paidAmount === 10;
            
            const monthData = {
                amount: paidAmount,
                status: needsAdjustment ? 'Por ajustar' : 'Pagado',
                toAdjust: needsAdjustment ? adjustmentAmount : 0,
            };

            if (debt.month === 10) ownerData.october = monthData;
            else if (debt.month === 11) ownerData.november = monthData;
            else if (debt.month === 12) ownerData.december = monthData;
        }

        return Array.from(dataByOwner.values());
    }, [allDebts, owners]);


    // --- Handlers ---
    const incomeReportRows = useMemo<IncomeReportRow[]>(() => {
        const ownersMap = new Map(owners.map(o => [o.id, o]));

        const filtered = allPayments.filter(payment => {
            if (payment.status !== 'aprobado') return false;
            const paymentDate = payment.paymentDate.toDate();
            if (incomeDateRange.from && paymentDate < incomeDateRange.from) return false;
            if (incomeDateRange.to && paymentDate > incomeDateRange.to) return false;
            return true;
        }).flatMap(payment => 
            payment.beneficiaries.map(b => ({
                ownerName: ownersMap.get(b.ownerId)?.name || 'Desconocido',
                street: b.street || 'N/A',
                house: b.house || 'N/A',
                date: format(payment.paymentDate.toDate(), 'dd/MM/yyyy'),
                amount: b.amount,
                reference: payment.reference || 'N/A'
            }))
        ).filter(row => {
            if (!incomeSearchTerm) return true;
            const lowerCaseSearch = incomeSearchTerm.toLowerCase();
            return row.ownerName.toLowerCase().includes(lowerCaseSearch) ||
                   row.street.toLowerCase().includes(lowerCaseSearch) ||
                   row.house.toLowerCase().includes(lowerCaseSearch);
        });

        return filtered;
    }, [allPayments, owners, incomeDateRange, incomeSearchTerm]);


    const handleSelectIndividual = async (owner: Owner) => {
        setSelectedIndividual(owner);
        setIndividualSearchTerm('');

        const allApprovedPayments = allPayments.filter(p => p.beneficiaries.some(b => b.ownerId === owner.id) && p.status === 'aprobado')
            .sort((a,b) => b.paymentDate.toMillis() - a.paymentDate.toMillis());

        const paymentsWithDebts: PaymentWithDebts[] = [];
        for (const payment of allApprovedPayments) {
            const liquidatedDebts = allDebts.filter(d => d.paymentId === payment.id)
                .sort((a,b) => a.year - b.year || a.month - b.month);
            
            paymentsWithDebts.push({
                ...payment,
                liquidatedDebts,
            });
        }
        
        setIndividualPayments(paymentsWithDebts);

        const totalDebt = allDebts
            .filter(d => d.ownerId === owner.id && d.status === 'pending')
            .reduce((acc, debt) => acc + debt.amountUSD, 0);
        setIndividualDebtUSD(totalDebt);
    };

    const handleSelectStatementOwner = (owner: Owner) => {
        setSelectedStatementOwner(owner);
        setStatementSearchTerm('');
        setAccountStatementData(null); // Clear previous data

        const ownerDebts = allDebts.filter(d => d.ownerId === owner.id)
            .sort((a, b) => a.year - b.year || a.month - b.month);

        const ownerPayments = allPayments.filter(p => 
                p.beneficiaries.some(b => b.ownerId === owner.id) && p.status === 'aprobado'
            ).sort((a, b) => a.paymentDate.toMillis() - b.paymentDate.toMillis());

        const totalDebtUSD = ownerDebts.filter(d => d.status === 'pending').reduce((sum, d) => sum + d.amountUSD, 0);
        const totalPaidBs = ownerPayments.reduce((sum, p) => sum + p.totalAmount, 0);

        setAccountStatementData({
            debts: ownerDebts,
            payments: ownerPayments,
            totalDebtUSD: totalDebtUSD,
            totalPaidBs: totalPaidBs,
            balance: owner.balance,
        });
    };


    const handleExportIntegral = (formatType: 'pdf' | 'excel') => {
        const data = integralReportData;
        const headers = [["Propietario", "Propiedad", "Fecha Últ. Pago", "Monto Pagado (Bs)", "Tasa Prom. (Bs/$)", "Saldo a Favor (Bs)", "Estado", "Periodo", "Meses Adeudados", "Deuda por Ajuste ($)"]];
        const body = data.map(row => [
            row.name, row.properties, row.lastPaymentDate,
            row.paidAmount > 0 ? formatToTwoDecimals(row.paidAmount) : '',
            row.avgRate > 0 ? formatToTwoDecimals(row.avgRate) : '',
            row.balance > 0 ? formatToTwoDecimals(row.balance) : '',
            row.status,
            row.solvencyPeriod,
            row.monthsOwed > 0 ? row.monthsOwed : '',
            row.adjustmentDebtUSD > 0 ? \`$\${row.adjustmentDebtUSD.toFixed(2)}\` : ''
        ]);

        const filename = \`reporte_integral_\${new Date().toISOString().split('T')[0]}\`;
        const emissionDate = format(new Date(), "dd/MM/yyyy 'a las' HH:mm:ss");
        let periodString = "Período de Pagos: Todos";
        if (integralDateRange.from && integralDateRange.to) {
            periodString = \`Período de Pagos: Desde \${format(integralDateRange.from, 'P', { locale: es })} hasta \${format(integralDateRange.to, 'P', { locale: es })}\`;
        } else if (integralDateRange.from) {
            periodString = \`Período de Pagos: Desde \${format(integralDateRange.from, 'P', { locale: es })}\`;
        } else if (integralDateRange.to) {
            periodString = \`Período de Pagos: Hasta \${format(integralDateRange.to, 'P', { locale: es })}\`;
        }

        if (formatType === 'pdf') {
            const doc = new jsPDF({ orientation: 'landscape' });
            const pageWidth = doc.internal.pageSize.getWidth();
            let startY = 15;
            if (companyInfo?.logo) doc.addImage(companyInfo.logo, 'PNG', 15, startY, 20, 20);
            if (companyInfo) doc.setFontSize(12).setFont('helvetica', 'bold').text(companyInfo.name, 40, startY + 5);

            doc.setFontSize(16).setFont('helvetica', 'bold').text('Reporte Integral de Propietarios', pageWidth / 2, startY + 15, { align: 'center'});
            
            startY += 25;
            doc.setFontSize(9).setFont('helvetica', 'normal');
            doc.text(periodString, 15, startY);
            doc.text(\`Fecha de Emisión: \${emissionDate}\`, pageWidth - 15, startY, { align: 'right'});
            
            startY += 10;
            
            (doc as any).autoTable({
                head: headers, body: body, startY: startY,
                headStyles: { fillColor: [30, 80, 180] }, 
                styles: { fontSize: 7, cellPadding: 1.5, overflow: 'linebreak' },
                 columnStyles: { 
                    3: { halign: 'right' },
                    4: { halign: 'right' },
                    5: { halign: 'right' },
                    8: { halign: 'center' },
                    9: { halign: 'right' },
                }
            });
            doc.save(\`\${filename}.pdf\`);
        } else {
             const worksheet = XLSX.utils.json_to_sheet(data.map(row => ({
                 "Propietario": row.name, 
                 "Propiedad": row.properties, 
                 "Fecha Últ. Pago": row.lastPaymentDate, 
                 "Monto Pagado (Bs)": row.paidAmount,
                 "Tasa Prom. (Bs/$)": row.avgRate, 
                 "Saldo a Favor (Bs)": row.balance, 
                 "Estado": row.status, 
                 "Periodo": row.solvencyPeriod, 
                 "Meses Adeudados": row.monthsOwed,
                 "Deuda por Ajuste ($)": row.adjustmentDebtUSD
            })));
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Reporte Integral");
            XLSX.writeFile(workbook, \`\${filename}.xlsx\`);
        }
    };
    
    const handleExportDelinquency = (formatType: 'pdf' | 'excel') => {
        const data = filteredAndSortedDelinquents.filter(o => selectedDelinquentOwners.has(o.id));
        if (data.length === 0) {
            toast({ variant: "destructive", title: "Nada para exportar", description: "Por favor, seleccione al menos un propietario." });
            return;
        }

        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();
        const margin = 14;

        if (companyInfo?.logo) doc.addImage(companyInfo.logo, 'PNG', margin, margin, 25, 25);
        if (companyInfo) doc.setFontSize(12).setFont('helvetica', 'bold').text(companyInfo.name, margin + 30, margin + 8);
        
        doc.setFontSize(10).text(\`Fecha de Emisión: \${new Date().toLocaleDateString('es-VE')}\`, pageWidth - margin, margin + 8, { align: 'right' });
        doc.setFontSize(16).setFont('helvetica', 'bold').text("Reporte de Morosidad", pageWidth / 2, margin + 45, { align: 'center' });
        
        const head = includeDelinquencyAmounts 
            ? [['Propietario', 'Propiedades', 'Meses Adeudados', 'Deuda (USD)', 'Deuda (Bs.)']]
            : [['Propietario', 'Propiedades', 'Meses Adeudados']];
        
        const body = data.map(o => {
            const row: (string|number)[] = [o.name, o.properties, o.monthsOwed];
            if (includeDelinquencyAmounts) {
                row.push(\`$\${o.debtAmountUSD.toFixed(2)}\`);
                row.push(\`Bs. \${formatToTwoDecimals(o.debtAmountUSD * activeRate)}\`);
            }
            return row;
        });

        if (formatType === 'pdf') {
            (doc as any).autoTable({
                head: head, body: body, startY: margin + 55, headStyles: { fillColor: [220, 53, 69] },
                styles: { cellPadding: 2, fontSize: 8 },
            });
            doc.save(\`reporte_morosidad_\${format(new Date(), 'yyyy-MM-dd')}.pdf\`);
        } else {
             const dataToExport = data.map(o => {
                const baseData = { 'Propietario': o.name, 'Propiedades': o.properties, 'Meses Adeudados': o.monthsOwed };
                if (includeDelinquencyAmounts) {
                    return { ...baseData, 'Deuda (USD)': o.debtAmountUSD, 'Deuda (Bs.)': o.debtAmountUSD * activeRate };
                }
                return baseData;
            });
            const worksheet = XLSX.utils.json_to_sheet(dataToExport);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Morosidad");
            XLSX.writeFile(workbook, \`reporte_morosidad_\${format(new Date(), 'yyyy-MM-dd')}.xlsx\`);
        }
    };
    
    const handleSortDelinquency = (key: SortKey) => {
        let direction: SortDirection = 'asc';
        if (delinquencySortConfig.key === key && delinquencySortConfig.direction === 'asc') direction = 'desc';
        setDelinquencySortConfig({ key, direction });
    };

    const renderSortIcon = (key: SortKey) => {
        if (delinquencySortConfig.key !== key) return <ArrowUpDown className="h-4 w-4 opacity-50" />;
        return delinquencySortConfig.direction === 'asc' ? '▲' : '▼';
    };

    const handleSelectIndividual = async (owner: Owner) => {
        setSelectedIndividual(owner);
        setIndividualSearchTerm('');
    };

    const handleSelectStatementOwner = (owner: Owner) => {
        setSelectedStatementOwner(owner);
        setStatementSearchTerm('');
    };
    
    const generateCommunityUpdates = async () => {
        setGeneratingReport(true);
        if (!selectedIndividual) return;

        try {
            const owner = selectedIndividual;
            const ownerAllDebts = allDebts.filter(d => d.ownerId === owner.id);
            const paymentHistory = ownerAllDebts.map(d => `${monthsLocale[d.month]} ${d.year}: ${d.status}`).join(', ');

            const communityUpdatesText = await getDocs(collection(db, 'announcements'))
            .then(snapshot => snapshot.docs.map(doc => doc.data().text).join('\\n'));

            const aiInput = {
                userProfile: \`Name: \${owner.name}, Properties: \${owner.properties.map(p => \`\${p.street}-\${p.house}\`).join(', ')}\`,
                paymentHistory: paymentHistory,
                allUpdates: communityUpdatesText,
            };

            const updates = await getCommunityUpdates(aiInput);
            setCommunityUpdates(updates.updates);

        } catch (error) {
             console.error('Error generating community updates:', error);
             toast({ variant: 'destructive', title: 'Error de IA', description: 'No se pudieron generar las actualizaciones de la comunidad.' });
        } finally {
            setGeneratingReport(false);
        }
    };


    if (loading) {
        return <div className="flex justify-center items-center h-64"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>;
    }
    
    return (
        <div className="space-y-4">
            <div>
                <h1 className="text-3xl font-bold font-headline">Módulo de Informes</h1>
                <p className="text-muted-foreground">Genere y exporte reportes detallados sobre la gestión del condominio.</p>
            </div>
            
            <Tabs defaultValue="integral" className="w-full">
                 <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-6 h-auto flex-wrap">
                    <TabsTrigger value="integral">Integral</TabsTrigger>
                    <TabsTrigger value="individual">Ficha Individual</TabsTrigger>
                    <TabsTrigger value="estado-de-cuenta">Estado de Cuenta</TabsTrigger>
                    <TabsTrigger value="delinquency">Morosidad</TabsTrigger>
                    <TabsTrigger value="balance">Saldos a Favor</TabsTrigger>
                    <TabsTrigger value="income">Ingresos</TabsTrigger>
                    <TabsTrigger value="advance_payments">Pagos Anticipados</TabsTrigger>
                    <TabsTrigger value="charts">Gráficos</TabsTrigger>
                </TabsList>
                
                <TabsContent value="integral">
                    <Card>
                        <CardHeader>
                            <CardTitle>Reporte Integral de Propietarios</CardTitle>
                            <CardDescription>Una vista consolidada del estado financiero de todos los propietarios.</CardDescription>
                             <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-4">
                                <div className="space-y-2">
                                    <Label>Buscar Propietario</Label>
                                    <Input placeholder="Nombre..." value={integralOwnerFilter} onChange={e => setIntegralOwnerFilter(e.target.value)} />
                                </div>
                                <div className="space-y-2">
                                    <Label>Estado</Label>
                                    <Select value={integralStatusFilter} onValueChange={setIntegralStatusFilter}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="todos">Todos</SelectItem>
                                            <SelectItem value="solvente">Solvente</SelectItem>
                                            <SelectItem value="nosolvente">No Solvente</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label>Pagos Desde</Label>
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <Button variant="outline" className={cn("w-full justify-start", !integralDateRange.from && "text-muted-foreground")}>
                                                <CalendarIcon className="mr-2 h-4 w-4" />
                                                {integralDateRange.from ? format(integralDateRange.from, "P", { locale: es }) : "Fecha"}
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent><Calendar mode="single" selected={integralDateRange.from} onSelect={d => setIntegralDateRange(prev => ({...prev, from: d}))} /></PopoverContent>
                                    </Popover>
                                </div>
                                <div className="space-y-2">
                                    <Label>Pagos Hasta</Label>
                                     <Popover>
                                        <PopoverTrigger asChild>
                                            <Button variant="outline" className={cn("w-full justify-start", !integralDateRange.to && "text-muted-foreground")}>
                                                <CalendarIcon className="mr-2 h-4 w-4" />
                                                {integralDateRange.to ? format(integralDateRange.to, "P", { locale: es }) : "Fecha"}
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent><Calendar mode="single" selected={integralDateRange.to} onSelect={d => setIntegralDateRange(prev => ({...prev, to: d}))} /></PopoverContent>
                                    </Popover>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                             <div className="flex justify-end gap-2 mb-4">
                                <Button variant="outline" onClick={() => handleExportIntegral('pdf')} disabled={generatingReport}>
                                    <FileText className="mr-2 h-4 w-4" /> Exportar a PDF
                                </Button>
                                <Button variant="outline" onClick={() => handleExportIntegral('excel')} disabled={generatingReport}>
                                    <FileSpreadsheet className="mr-2 h-4 w-4" /> Exportar a Excel
                                </Button>
                            </div>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Propietario</TableHead>
                                        <TableHead>Propiedad</TableHead>
                                        <TableHead>Fecha Últ. Pago</TableHead>
                                        <TableHead className="text-right">Monto Pagado</TableHead>
                                        <TableHead className="text-right">Tasa Prom.</TableHead>
                                        <TableHead className="text-right">Saldo a Favor</TableHead>
                                        <TableHead>Estado</TableHead>
                                        <TableHead>Periodo</TableHead>
                                        <TableHead className="text-center">Meses Adeudados</TableHead>
                                        <TableHead className="text-right">Deuda por Ajuste ($)</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {integralReportData.map(row => (
                                        <TableRow key={row.ownerId}>
                                            <TableCell className="font-medium">{row.name}</TableCell>
                                            <TableCell>{row.properties}</TableCell>
                                            <TableCell>{row.lastPaymentDate}</TableCell>
                                            <TableCell className="text-right">{row.paidAmount > 0 ? \`Bs. \${formatToTwoDecimals(row.paidAmount)}\`: ''}</TableCell>
                                            <TableCell className="text-right">{row.avgRate > 0 ? \`Bs. \${formatToTwoDecimals(row.avgRate)}\`: ''}</TableCell>
                                            <TableCell className="text-right">{row.balance > 0 ? \`Bs. \${formatToTwoDecimals(row.balance)}\`: ''}</TableCell>
                                            <TableCell>
                                                <span className={cn('font-semibold', row.status === 'No Solvente' ? 'text-destructive' : 'text-green-600')}>{row.status}</span>
                                            </TableCell>
                                            <TableCell>{row.solvencyPeriod}</TableCell>
                                            <TableCell className="text-center">{row.monthsOwed > 0 ? row.monthsOwed : ''}</TableCell>
                                            <TableCell className="text-right">{row.adjustmentDebtUSD > 0 ? \`$\${row.adjustmentDebtUSD.toFixed(2)}\`: ''}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>

                 <TabsContent value="individual">
                     <Card>
                        <CardHeader>
                            <CardTitle>Ficha Individual de Pagos</CardTitle>
                            <CardDescription>Busque un propietario para ver su historial detallado de pagos y los meses que liquida cada uno.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="relative max-w-sm">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input placeholder="Buscar por nombre..." className="pl-9" value={individualSearchTerm} onChange={e => setIndividualSearchTerm(e.target.value)} />
                            </div>
                            {individualSearchTerm && filteredIndividualOwners.length > 0 && (
                                <Card className="border rounded-md">
                                    <ScrollArea className="h-48">
                                        {filteredIndividualOwners.map(owner => (
                                            <div key={owner.id} onClick={() => handleSelectIndividual(owner)} className="p-3 hover:bg-muted cursor-pointer border-b last:border-b-0"><p className="font-medium">{owner.name}</p><p className="text-sm text-muted-foreground">{(owner.properties || []).map(p => \`\${p.street} - \${p.house}\`).join(', ')}</p></div>))}</ScrollArea>
                                        </Card>
                                    )}
                                </div>
                            )}

                            {selectedIndividual && (
                                <Card className="mt-4 bg-card-foreground/5 dark:bg-card-foreground/5">
                                    <CardHeader>
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <CardTitle>{selectedIndividual.name}</CardTitle>
                                                <CardDescription>{(selectedIndividual.properties || []).map(p => \`\${p.street} - \${p.house}\`).join(', ')}</CardDescription>
                                            </div>
                                            <div className="flex gap-2">
                                                <Button variant="outline" onClick={() => handleExportIndividual('pdf')}><FileText className="mr-2 h-4 w-4" /> Exportar PDF</Button>
                                            </div>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="space-y-6">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <Card>
                                                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                                    <CardTitle className="text-sm font-medium">Deuda Total (USD)</CardTitle>
                                                    <BadgeX className="h-4 w-4 text-destructive" />
                                                </CardHeader>
                                                <CardContent>
                                                    <div className="text-2xl font-bold text-destructive">$\${individualDebtUSD.toFixed(2)}</div>
                                                </CardContent>
                                            </Card>
                                             <Card>
                                                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                                    <CardTitle className="text-sm font-medium">Saldo a Favor (Bs)</CardTitle>
                                                    <BadgeCheck className="h-4 w-4 text-green-500" />
                                                </CardHeader>
                                                <CardContent>
                                                    <div className="text-2xl font-bold text-green-500">Bs. {formatToTwoDecimals(selectedIndividual.balance)}</div>
                                                </CardContent>
                                            </Card>
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-semibold mb-2 flex items-center"><History className="mr-2 h-5 w-5"/> Historial de Pagos Aprobados</h3>
                                            <ScrollArea className="h-[28rem] border rounded-md">
                                                 {individualPayments.length > 0 ? (
                                                    <div className="p-2 space-y-2">
                                                        {individualPayments.map((payment) => (
                                                            <Collapsible key={payment.id} className="border rounded-md">
                                                                <CollapsibleTrigger className="w-full p-3 hover:bg-muted/50 rounded-t-md">
                                                                    <div className="flex items-center justify-between">
                                                                        <div className="flex items-center gap-2">
                                                                            <ChevronRight className="h-4 w-4 transition-transform duration-200 group-data-[state=open]:rotate-90" />
                                                                            <div className="text-left">
                                                                                <p className="font-semibold text-primary">{format(payment.paymentDate.toDate(), 'dd/MM/yyyy')}</p>
                                                                                <p className="text-xs text-muted-foreground">Ref: {payment.reference}</p>
                                                                            </div>
                                                                        </div>
                                                                        <div className="text-right">
                                                                             <p className="font-bold text-lg">Bs. {formatToTwoDecimals(payment.totalAmount)}</p>
                                                                             <p className="text-xs text-muted-foreground">Tasa: Bs. {formatToTwoDecimals(payment.exchangeRate || 0)}</p>
                                                                        </div>
                                                                    </div>
                                                                </CollapsibleTrigger>
                                                                <CollapsibleContent>
                                                                    <div className="p-2 border-t bg-background">
                                                                        {payment.liquidatedDebts.length > 0 ? (
                                                                            <Table>
                                                                                <TableHeader>
                                                                                    <TableRow>
                                                                                        <TableHead>Mes Liquidado</TableHead>
                                                                                        <TableHead>Concepto</TableHead>
                                                                                        <TableHead className="text-right">Monto Pagado ($)</TableHead>
                                                                                    </TableRow>
                                                                                </TableHeader>
                                                                                <TableBody>
                                                                                    {payment.liquidatedDebts.map(debt => (
                                                                                        <TableRow key={debt.id}>
                                                                                            <TableCell>{monthsLocale[debt.month]} {debt.year}</TableCell>
                                                                                            <TableCell>{debt.description}</TableCell>
                                                                                            <TableCell className="text-right">$\{(debt.paidAmountUSD || debt.amountUSD).toFixed(2)}</TableCell>
                                                                                        </TableRow>
                                                                                    ))}
                                                                                </TableBody>
                                                                            </Table>
                                                                        ) : (
                                                                            <p className="text-sm text-muted-foreground px-4 py-2">Este pago fue acreditado a saldo a favor.</p>
                                                                        )}
                                                                    </div>
                                                                </CollapsibleContent>
                                                            </Collapsible>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center justify-center h-full text-muted-foreground">No se encontraron pagos aprobados.</div>
                                                )}
                                            </ScrollArea>
                                        </div>
                                    </CardContent>
                                </Card>
                            )}
                        </CardContent>
                     </Card>
                 </TabsContent>

                <TabsContent value="estado-de-cuenta">
                     <Card>
                        <CardHeader>
                            <CardTitle>Estado de Cuenta</CardTitle>
                            <CardDescription>Busque un propietario para ver su estado de cuenta.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="relative max-w-sm">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input placeholder="Buscar por nombre..." className="pl-9" value={statementSearchTerm} onChange={e => setStatementSearchTerm(e.target.value)} />
                            </div>
                            {statementSearchTerm && filteredStatementOwners.length > 0 && (
                                <Card className="border rounded-md">
                                    <ScrollArea className="h-48">
                                        {filteredStatementOwners.map(owner => (
                                            <div key={owner.id} onClick={() => handleSelectStatementOwner(owner)} className="p-3 hover:bg-muted cursor-pointer border-b last:border-b-0">
                                                <p className="font-medium">{owner.name}</p>
                                                <p className="text-sm text-muted-foreground">{(owner.properties || []).map(p => \`\${p.street} - \${p.house}\`).join(', ')}</p></div>))}</ScrollArea>
                                        </Card>
                                    )}
                                </div>
                            )}

                            {selectedStatementOwner && accountStatementData && (
                                <Card className="mt-4 bg-card-foreground/5 dark:bg-card-foreground/5">
                                    <CardHeader>
                                        <div className="flex justify-between items-center">
                                            <div className="flex items-center gap-4">
                                                {companyInfo?.logo && <img src={companyInfo.logo} alt="Logo" className="w-16 h-16 rounded-md"/>}
                                                <div>
                                                    <p className="font-bold">{companyInfo?.name} | {companyInfo?.rif}</p>
                                                    <p className="text-sm">Propietario: {selectedStatementOwner.name}</p>
                                                    <p className="text-sm">Propiedad(es): {(selectedStatementOwner.properties || []).map(p => \`\${p.street}-\${p.house}\`).join(', ')}</p>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <h2 className="text-2xl font-bold">ESTADO DE CUENTA</h2>
                                                <p className="text-xs">Fecha: {format(new Date(), "dd/MM/yyyy 'a las' HH:mm:ss")}</p>
                                                <Button size="sm" variant="outline" className="mt-2" onClick={() => handleExportAccountStatement('pdf')}><FileText className="mr-2 h-4 w-4" /> Exportar PDF</Button>
                                            </div>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="space-y-6">
                                        <div>
                                            <h3 className="font-bold mb-2">Resumen de Pagos</h3>
                                            <Table>
                                                <TableHeader>
                                                    <TableRow className="bg-[#004D40] hover:bg-[#00382e] text-white">
                                                        <TableHead className="text-white">Fecha</TableHead>
                                                        <TableHead className="text-white">Concepto</TableHead>
                                                        <TableHead className="text-white">Pagado por</TableHead>
                                                        <TableHead className="text-white text-right">Monto (Bs)</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {accountStatementData.payments.map(p => (
                                                        <TableRow key={p.id}>
                                                            <TableCell>{format(p.paymentDate.toDate(), 'dd-MM-yyyy')}</TableCell>
                                                            <TableCell>Pago Cuota(s)</TableCell>
                                                            <TableCell>Administrador</TableCell>
                                                            <TableCell className="text-right">{formatToTwoDecimals(p.totalAmount)}</TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                                <TableFooter>
                                                     <TableRow className="bg-[#004D40] hover:bg-[#00382e] text-white font-bold">
                                                        <TableCell colSpan={3}>Total Pagado</TableCell>
                                                        <TableCell className="text-right">Bs. {formatToTwoDecimals(accountStatementData.totalPaidBs)}</TableCell>
                                                    </TableRow>
                                                </TableFooter>
                                            </Table>
                                        </div>
                                        <div>
                                            <h3 className="font-bold mb-2">Resumen de Deudas</h3>
                                            <Table>
                                                <TableHeader>
                                                    <TableRow className="bg-[#004D40] hover:bg-[#00382e] text-white">
                                                        <TableHead className="text-white">Periodo</TableHead>
                                                        <TableHead className="text-white">Concepto</TableHead>
                                                        <TableHead className="text-white text-right">Monto ($)</TableHead>
                                                        <TableHead className="text-white text-right">Estado</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                     {accountStatementData.debts.map(d => (
                                                        <TableRow key={d.id}>
                                                            <TableCell>{monthsLocale[d.month]} {d.year}</TableCell>
                                                            <TableCell>{d.description}</TableCell>
                                                            <TableCell className="text-right">$\${d.amountUSD.toFixed(2)}</TableCell>
                                                            <TableCell className="text-right">{d.status === 'paid' ? 'Pagada' : 'Pendiente'}</TableCell>
                                                        </TableRow>
                                                     ))}
                                                </TableBody>
                                                <TableFooter>
                                                    <TableRow className="bg-[#004D40] hover:bg-[#00382e] text-white font-bold">
                                                        <TableCell colSpan={2}>Total Adeudado</TableCell>
                                                        <TableCell className="text-right">$\${accountStatementData.totalDebtUSD.toFixed(2)}</TableCell>
                                                        <TableCell></TableCell>
                                                    </TableRow>
                                                </TableFooter>
                                            </Table>
                                        </div>
                                        <div className="text-right font-bold text-lg pt-4">
                                            Saldo a Favor Actual: Bs. {formatToTwoDecimals(accountStatementData.balance)}
                                        </div>
                                    </CardContent>
                                </Card>
                            )}
                        </CardContent>
                     </Card>
                </TabsContent>

                 <TabsContent value="delinquency">
                     <Card>
                        <CardHeader>
                            <CardTitle>Reporte Interactivo de Morosidad</CardTitle>
                            <CardDescription>Filtre, seleccione y exporte la lista de propietarios con deudas pendientes.</CardDescription>
                             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-4 items-end">
                                <div className="space-y-2">
                                    <Label>Antigüedad de Deuda</Label>
                                    <Select value={delinquencyFilterType} onValueChange={setDelinquencyFilterType}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">Todos los morosos</SelectItem>
                                            <SelectItem value="2_or_more">2 meses o más</SelectItem>
                                            <SelectItem value="3_exact">Exactamente 3 meses</SelectItem>
                                            <SelectItem value="custom">Rango personalizado</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                {delinquencyFilterType === 'custom' && (
                                    <div className="md:col-span-2 lg:col-span-1 grid grid-cols-2 gap-2 items-end">
                                        <div className="space-y-2">
                                            <Label>Desde (meses)</Label>
                                            <Input type="number" value={customMonthRange.from} onChange={e => setCustomMonthRange(c => ({...c, from: e.target.value}))} />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Hasta (meses)</Label>
                                            <Input type="number" value={customMonthRange.to} onChange={e => setCustomMonthRange(c => ({...c, to: e.target.value}))} />
                                        </div>
                                    </div>
                                )}
                                 <div className="space-y-2 md:col-start-1 lg:col-start-auto">
                                    <Label>Buscar Propietario</Label>
                                     <div className="relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                        <Input placeholder="Buscar por nombre o propiedad..." className="pl-9" value={delinquencySearchTerm} onChange={e => setDelinquencySearchTerm(e.target.value)} />
                                    </div>
                                </div>
                                 <div className="flex items-center space-x-2">
                                    <Checkbox id="include-amounts" checked={includeDelinquencyAmounts} onCheckedChange={(checked) => setIncludeDelinquencyAmounts(Boolean(checked))} />
                                    <Label htmlFor="include-amounts" className="cursor-pointer">
                                        Incluir montos en el reporte
                                    </Label>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-center justify-between mb-4">
                                <p className="text-sm text-muted-foreground">
                                    Mostrando {filteredAndSortedDelinquents.length} de {allDelinquentOwners.length} propietarios morosos. 
                                    Seleccionados: {selectedDelinquentOwners.size}
                                </p>
                                <div className="flex gap-2">
                                    <Button variant="outline" onClick={() => handleExportDelinquency('pdf')}><FileText className="mr-2 h-4 w-4" /> Exportar a PDF</Button>
                                    <Button variant="outline" onClick={() => handleExportDelinquency('excel')}><FileSpreadsheet className="mr-2 h-4 w-4" /> Exportar a Excel</Button>
                                </div>
                            </div>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-[50px]">
                                             <Checkbox 
                                                checked={selectedDelinquentOwners.size === filteredAndSortedDelinquents.length && filteredAndSortedDelinquents.length > 0}
                                                onCheckedChange={(checked) => setSelectedDelinquentOwners(new Set(Boolean(checked) ? filteredAndSortedDelinquents.map(o => o.id) : []))}
                                            />
                                        </TableHead>
                                        <TableHead>
                                            <Button variant="ghost" onClick={() => handleSortDelinquency('name')}>
                                                Propietario {renderSortIcon('name')}
                                            </Button>
                                        </TableHead>
                                        <TableHead>Propiedades</TableHead>
                                        <TableHead>
                                             <Button variant="ghost" onClick={() => handleSortDelinquency('monthsOwed')}>
                                                Meses {renderSortIcon('monthsOwed')}
                                            </Button>
                                        </TableHead>
                                        <TableHead className="text-right">
                                             <Button variant="ghost" onClick={() => handleSortDelinquency('debtAmountUSD')}>
                                                Deuda (USD) {renderSortIcon('debtAmountUSD')}
                                            </Button>
                                        </TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredAndSortedDelinquents.length > 0 ? (
                                        filteredAndSortedDelinquents.map(owner => (
                                            <TableRow key={owner.id} data-state={selectedDelinquentOwners.has(owner.id) ? 'selected' : undefined}>
                                                <TableCell>
                                                    <Checkbox
                                                        checked={selectedDelinquentOwners.has(owner.id)}
                                                        onCheckedChange={() => {
                                                            const newSelection = new Set(selectedDelinquentOwners);
                                                            if (newSelection.has(owner.id)) newSelection.delete(owner.id);
                                                            else newSelection.add(owner.id);
                                                            setSelectedDelinquentOwners(newSelection);
                                                        }}
                                                    />
                                                </TableCell>
                                                <TableCell className="font-medium">{owner.name}</TableCell>
                                                <TableCell>{owner.properties}</TableCell>
                                                <TableCell>{owner.monthsOwed}</TableCell>
                                                <TableCell className="text-right font-semibold">$\${owner.debtAmountUSD.toFixed(2)}</TableCell>
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={5} className="h-24 text-center">
                                                No se encontraron propietarios con los filtros seleccionados.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                     </Card>
                 </TabsContent>

                 <TabsContent value="balance">
                     <Card>
                        <CardHeader>
                            <CardTitle>Consulta de Saldos a Favor</CardTitle>
                            <CardDescription>Lista de todos los propietarios con saldo positivo en sus cuentas.</CardDescription>
                             <div className="flex items-center justify-between mt-4">
                                <div className="relative max-w-sm">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                    <Input placeholder="Buscar por propietario..." className="pl-9" value={balanceSearchTerm} onChange={e => setBalanceSearchTerm(e.target.value)} />
                                </div>
                                <div className="flex gap-2">
                                    <Button variant="outline" onClick={() => handleExportBalance('pdf')}><FileText className="mr-2 h-4 w-4" /> PDF</Button>
                                    <Button variant="outline" onClick={() => handleExportBalance('excel')}><FileSpreadsheet className="mr-2 h-4 w-4" /> Excel</Button>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Propietario</TableHead>
                                        <TableHead>Propiedades</TableHead>
                                        <TableHead className="text-right">Saldo (Bs.)</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredBalanceOwners.length > 0 ? (
                                        filteredBalanceOwners.map(owner => (
                                            <TableRow key={owner.id}>
                                                <TableCell className="font-medium">{owner.name}</TableCell>
                                                <TableCell>{owner.properties}</TableCell>
                                                <TableCell className="text-right font-bold text-green-500">Bs. {formatToTwoDecimals(owner.balance)}</TableCell>
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow><TableCell colSpan={3} className="h-24 text-center">No hay propietarios con saldo a favor.</TableCell></TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                     </Card>
                 </TabsContent>
                 
                <TabsContent value="income">
                     <Card>
                        <CardHeader>
                            <CardTitle>Informe de Ingresos</CardTitle>
                            <CardDescription>Consulta los pagos aprobados en un período específico.</CardDescription>
                             <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 items-end">
                                <div className="space-y-2">
                                    <Label>Buscar Propietario/Propiedad</Label>
                                    <Input placeholder="Nombre, calle o casa..." value={incomeSearchTerm} onChange={e => setIncomeSearchTerm(e.target.value)} />
                                </div>
                                <div className="space-y-2">
                                    <Label>Pagos Desde</Label>
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <Button variant="outline" className={cn("w-full justify-start", !incomeDateRange.from && "text-muted-foreground")}>
                                                <CalendarIcon className="mr-2 h-4 w-4" />
                                                {incomeDateRange.from ? format(incomeDateRange.from, "P", { locale: es }) : "Fecha"}
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent><Calendar mode="single" selected={incomeDateRange.from} onSelect={d => setIncomeDateRange(prev => ({...prev, from: d}))} /></PopoverContent>
                                    </Popover>
                                </div>
                                <div className="space-y-2">
                                    <Label>Pagos Hasta</Label>
                                     <Popover>
                                        <PopoverTrigger asChild>
                                            <Button variant="outline" className={cn("w-full justify-start", !incomeDateRange.to && "text-muted-foreground")}>
                                                <CalendarIcon className="mr-2 h-4 w-4" />
                                                {incomeDateRange.to ? format(incomeDateRange.to, "P", { locale: es }) : "Fecha"}
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent><Calendar mode="single" selected={incomeDateRange.to} onSelect={d => setIncomeDateRange(prev => ({...prev, to: d}))} /></PopoverContent>
                                    </Popover>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                             <div className="flex justify-end gap-2 mb-4">
                                <Button variant="outline" onClick={() => handleExportIncomeReport('pdf')} disabled={generatingReport}>
                                    <FileText className="mr-2 h-4 w-4" /> Exportar a PDF
                                </Button>
                                <Button variant="outline" onClick={() => handleExportIncomeReport('excel')} disabled={generatingReport}>
                                    <FileSpreadsheet className="mr-2 h-4 w-4" /> Exportar a Excel
                                </Button>
                            </div>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Propietario</TableHead>
                                        <TableHead>Calle</TableHead>
                                        <TableHead>Casa</TableHead>
                                        <TableHead>Fecha</TableHead>
                                        <TableHead className="text-right">Monto (Bs.)</TableHead>
                                        <TableHead className="text-right">Referencia</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {incomeReportRows.length > 0 ? (
                                        incomeReportRows.map((row, index) => (
                                            <TableRow key={index}>
                                                <TableCell>{row.ownerName}</TableCell>
                                                <TableCell>{row.street}</TableCell>
                                                <TableCell>{row.house}</TableCell>
                                                <TableCell>{row.date}</TableCell>
                                                <TableCell className="text-right">{formatToTwoDecimals(row.amount)}</TableCell>
                                                <TableCell className="text-right">{row.reference}</TableCell>
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow><TableCell colSpan={6} className="h-24 text-center">No se encontraron ingresos para el período y filtro seleccionados.</TableCell></TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="advance_payments">
                    <Card>
                        <CardHeader>
                            <CardTitle>Reporte de Pagos Anticipados (Oct-Dic 2025)</CardTitle>
                            <CardDescription>Auditoría de pagos por adelantado y ajustes pendientes para el último trimestre de 2025.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="flex justify-end gap-2 mb-4">
                                <Button variant="outline" onClick={() => handleExportAdvancePaymentReport('pdf')} disabled={generatingReport}>
                                    <FileText className="mr-2 h-4 w-4" /> Exportar a PDF
                                </Button>
                            </div>
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead rowSpan={2} className="align-bottom">Propietario</TableHead>
                                            <TableHead colSpan={3} className="text-center">Octubre 2025</TableHead>
                                            <TableHead colSpan={3} className="text-center">Noviembre 2025</TableHead>
                                            <TableHead colSpan={3} className="text-center">Diciembre 2025</TableHead>
                                        </TableRow>
                                        <TableRow>
                                            <TableHead className="text-center">Monto ($)</TableHead>
                                            <TableHead className="text-center">Estado</TableHead>
                                            <TableHead className="text-center">Por Ajustar ($)</TableHead>
                                            <TableHead className="text-center">Monto ($)</TableHead>
                                            <TableHead className="text-center">Estado</TableHead>
                                            <TableHead className="text-center">Por Ajustar ($)</TableHead>
                                            <TableHead className="text-center">Monto ($)</TableHead>
                                            <TableHead className="text-center">Estado</TableHead>
                                            <TableHead className="text-center">Por Ajustar ($)</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {advancePaymentReportData.length > 0 ? (
                                            advancePaymentReportData.map(row => (
                                                <TableRow key={row.ownerId}>
                                                    <TableCell className="font-medium">{row.ownerName}</TableCell>
                                                    
                                                    <TableCell className="text-center">{row.october ? \`$\${row.october.amount.toFixed(2)}\` : '—'}</TableCell>
                                                    <TableCell className="text-center">{row.october ? row.october.status : '—'}</TableCell>
                                                    <TableCell className="text-center">{row.october && row.october.toAdjust > 0 ? \`$\${row.october.toAdjust.toFixed(2)}\` : '—'}</TableCell>
                                                    
                                                    <TableCell className="text-center">{row.november ? \`$\${row.november.amount.toFixed(2)}\` : '—'}</TableCell>
                                                    <TableCell className="text-center">{row.november ? row.november.status : '—'}</TableCell>
                                                    <TableCell className="text-center">{row.november && row.november.toAdjust > 0 ? \`$\${row.november.toAdjust.toFixed(2)}\` : '—'}</TableCell>
                                                    
                                                    <TableCell className="text-center">{row.december ? \`$\${row.december.amount.toFixed(2)}\` : '—'}</TableCell>
                                                    <TableCell className="text-center">{row.december ? row.december.status : '—'}</TableCell>
                                                    <TableCell className="text-center">{row.december && row.december.toAdjust > 0 ? \`$\${row.december.toAdjust.toFixed(2)}\` : '—'}</TableCell>
                                                </TableRow>
                                            ))
                                        ) : (
                                            <TableRow>
                                                <TableCell colSpan={10} className="h-24 text-center">
                                                    No se encontraron pagos anticipados para el período Oct-Dic 2025.
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                 <TabsContent value="charts">
                     <Card>
                        <CardHeader>
                            <CardTitle>Gráficos de Gestión</CardTitle>
                            <CardDescription>Visualizaciones de datos clave del condominio, filtradas por período.</CardDescription>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
                                <div className="space-y-2">
                                    <Label>Desde</Label>
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !chartsDateRange.from && "text-muted-foreground")}>
                                                <CalendarIcon className="mr-2 h-4 w-4" />
                                                {chartsDateRange.from ? format(chartsDateRange.from, "P", { locale: es }) : <span>Seleccione fecha de inicio</span>}
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={chartsDateRange.from} onSelect={d => setChartsDateRange(prev => ({ ...prev, from: d }))} /></PopoverContent>
                                    </Popover>
                                </div>
                                <div className="space-y-2">
                                    <Label>Hasta</Label>
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !chartsDateRange.to && "text-muted-foreground")}>
                                                <CalendarIcon className="mr-2 h-4 w-4" />
                                                {chartsDateRange.to ? format(chartsDateRange.to, "P", { locale: es }) : <span>Seleccione fecha final</span>}
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={chartsDateRange.to} onSelect={d => setChartsDateRange(prev => ({ ...prev, to: d }))} /></PopoverContent>
                                    </Popover>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-8">
                             <div className="p-4 bg-gray-800 text-white rounded-lg" id="debt-chart-container">
                                <h3 className="font-semibold text-center mb-4">Deudas Actuales por Calle (USD)</h3>
                                {debtsByStreetChartData.length > 0 ? (
                                <ResponsiveContainer width="100%" height={350}>
                                    <BarChart data={debtsByStreetChartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                                        <XAxis dataKey="name" stroke="#a1a1aa" fontSize={12} tickLine={false} axisLine={false} />
                                        <YAxis stroke="#a1a1aa" fontSize={12} tickLine={false} axisLine={false} />
                                        <Bar dataKey="TotalDeuda" fill="#dc2626" name="Deuda Total (USD)" radius={[4, 4, 0, 0]}>
                                            <LabelList dataKey="TotalDeuda" content={<CustomBarLabel />} />
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                                ) : (
                                    <p className="text-center text-gray-400 py-8">No hay datos de deuda para mostrar en el período seleccionado.</p>
                                )}
                                <div className="flex justify-center gap-2 mt-4">
                                   <Button size="sm" variant="outline" onClick={() => handleExportChart('debt-chart-container', 'Gráfico de Deuda por Calle (USD)', 'pdf')}><FileText className="mr-2 h-4 w-4" /> PDF</Button>
                                   <Button size="sm" variant="outline" onClick={() => handleExportChart('debt-chart-container', 'Gráfico de Deuda por Calle (USD)', 'excel')}><FileSpreadsheet className="mr-2 h-4 w-4" /> Excel</Button>
                                </div>
                             </div>
                             <div className="p-4 bg-gray-800 text-white rounded-lg" id="income-chart-container">
                                <h3 className="font-semibold text-center mb-4">Ingresos por Calle (USD)</h3>
                                {incomeByStreetChartData.length > 0 ? (
                                <ResponsiveContainer width="100%" height={350}>
                                    <BarChart data={incomeByStreetChartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                                        <XAxis dataKey="name" stroke="#a1a1aa" fontSize={12} tickLine={false} axisLine={false} />
                                        <YAxis stroke="#a1a1aa" fontSize={12} tickLine={false} axisLine={false} />
                                        <Bar dataKey="TotalIngresos" fill="#2563eb" name="Ingreso Total (USD)" radius={[4, 4, 0, 0]}>
                                            <LabelList dataKey="TotalIngresos" content={<CustomBarLabel />} />
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                                ) : (
                                    <p className="text-center text-gray-400 py-8">No hay datos de ingresos para mostrar en el período seleccionado.</p>
                                )}
                                 <div className="flex justify-center gap-2 mt-4">
                                     <Button size="sm" variant="outline" onClick={() => handleExportChart('income-chart-container', 'Gráfico de Ingresos por Calle (USD)', 'pdf')}><FileText className="mr-2 h-4 w-4" /> PDF</Button>
                                     <Button size="sm" variant="outline" onClick={() => handleExportChart('income-chart-container', 'Gráfico de Ingresos por Calle (USD)', 'excel')}><FileSpreadsheet className="mr-2 h-4 w-4" /> Excel</Button>
                                 </div>
                             </div>
                        </CardContent>
                     </Card>
                 </TabsContent>
            </Tabs>
        </div>
    );
}


// FILE: src/app/globals.css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 224 71% 4%; /* Dark Blue */
    --foreground: 0 0% 98%; /* White */

    --card: 224 71% 9%;
    --card-foreground: 0 0% 98%;

    --popover: 224 71% 4%;
    --popover-foreground: 0 0% 98%;

    --primary: 217 91% 60%; /* Vibrant Blue */
    --primary-foreground: 0 0% 98%; /* White */

    --secondary: 224 71% 14%;
    --secondary-foreground: 0 0% 98%;

    --muted: 224 71% 14%;
    --muted-foreground: 220 14% 65%;
    
    --accent: 48 96% 50%; /* Yellow */
    --accent-foreground: 222 47% 11%; /* Dark Blue */

    --destructive: 0 63% 31%;
    --destructive-foreground: 0 0% 98%;
    
    --success: 142 71% 41%;
    --success-foreground: 0 0% 98%;
    
    --warning: 48 96% 50%;
    --warning-foreground: 222 47% 11%;

    --border: 224 71% 14%;
    --input: 224 71% 14%;
    --ring: 217 91% 60%;

    --radius: 0.5rem;

    --chart-1: 217 91% 60%;
    --chart-2: 48 96% 50%;
    --chart-3: 160 60% 45%;
    --chart-4: 280 65% 60%;
    --chart-5: 340 75% 55%;
    
    --sidebar-background: 224 71% 4%;
    --sidebar-foreground: 0 0% 98%;
    --sidebar-primary: 217 91% 60%;
    --sidebar-primary-foreground: 0 0% 98%;
    --sidebar-accent: 224 71% 14%;
    --sidebar-accent-foreground: 0 0% 98%;
    --sidebar-border: 224 71% 10%;
    --sidebar-ring: 217 91% 60%;
  }

  .dark {
    --background: 224 71% 4%;
    --foreground: 0 0% 98%;

    --card: 224 71% 9%;
    --card-foreground: 0 0% 98%;

    --popover: 224 71% 4%;
    --popover-foreground: 0 0% 98%;

    --primary: 217 91% 60%;
    --primary-foreground: 0 0% 98%;

    --secondary: 224 71% 14%;
    --secondary-foreground: 0 0% 98%;

    --muted: 224 71% 14%;
    --muted-foreground: 220 14% 65%;

    --accent: 48 96% 50%;
    --accent-foreground: 222 47% 11%;
    
    --destructive: 0 63% 31%;
    --destructive-foreground: 0 0% 98%;
    
    --success: 142 71% 41%;
    --success-foreground: 0 0% 98%;

    --warning: 48 96% 50%;
    --warning-foreground: 222 47% 11%;

    --border: 224 71% 14%;
    --input: 224 71% 14%;
    --ring: 217 91% 60%;

    --chart-1: 217 91% 60%;
    --chart-2: 48 96% 50%;
    --chart-3: 160 60% 45%;
    --chart-4: 280 65% 60%;
    --chart-5: 340 75% 55%;

    --sidebar-background: 224 71% 4%;
    --sidebar-foreground: 0 0% 98%;
    --sidebar-primary: 217 91% 60%;
    --sidebar-primary-foreground: 0 0% 98%;
    --sidebar-accent: 224 71% 14%;
    --sidebar-accent-foreground: 0 0% 98%;
    --sidebar-border: 224 71% 10%;
    --sidebar-ring: 217 91% 60%;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
  }
}


// FILE: src/app/layout.tsx
import type {Metadata} from 'next';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";

export const metadata: Metadata = {
  title: 'CondoConnect',
  description: 'Condominium Management App',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter&display=swap" rel="stylesheet" />
      </head>
      <body className="font-body antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  );
}


// FILE: src/app/login/page.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Loader2, KeyRound, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { db, app } from '@/lib/firebase';

export default function LoginPage() {
    const router = useRouter();
    const { toast } = useToast();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const auth = getAuth(app);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email || !password) {
            toast({ variant: 'destructive', title: 'Campos requeridos', description: 'Por favor, ingrese su correo y contraseña.' });
            return;
        }
        setLoading(true);

        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            if (user) {
                const userDocRef = doc(db, 'owners', user.uid);
                const userDocSnap = await getDoc(userDocRef);

                if (userDocSnap.exists()) {
                    const userData = userDocSnap.data();
                    const sessionData = {
                        uid: user.uid,
                        email: user.email,
                        role: userData.role,
                        name: userData.name,
                        passwordChanged: userData.passwordChanged,
                    };
                    localStorage.setItem('user-session', JSON.stringify(sessionData));
                    
                    if (userData.role === 'administrador') {
                        router.push('/admin/dashboard');
                    } else {
                        // If password not changed, force redirection
                        if (!userData.passwordChanged) {
                             router.push('/owner/change-password');
                        } else {
                             router.push('/owner/dashboard');
                        }
                    }
                } else {
                     toast({ variant: 'destructive', title: 'Error', description: 'No se encontró un perfil asociado a esta cuenta.' });
                }
            }
        } catch (error: any) {
            console.error('Login error:', error);
            let description = 'Ocurrió un error inesperado. Por favor, intente de nuevo.';
            if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
                description = 'El correo o la contraseña son incorrectos.';
            }
            toast({ variant: 'destructive', title: 'Error de Autenticación', description: description });
        } finally {
            setLoading(false);
        }
    };

    return (
        <main className="min-h-screen flex items-center justify-center bg-background p-4">
            <div className="w-full max-w-md space-y-8">
                <div className="text-center">
                    <Building2 className="mx-auto h-12 w-12 text-primary" />
                    <h1 className="mt-6 text-3xl font-bold tracking-tight text-foreground font-headline">
                        Iniciar Sesión
                    </h1>
                    <p className="mt-2 text-sm text-muted-foreground">
                        Accede a tu panel de administrador o propietario.
                    </p>
                </div>

                <form className="space-y-6" onSubmit={handleLogin}>
                     <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            id="email"
                            name="email"
                            type="email"
                            autoComplete="email"
                            required
                            className="pl-10"
                            placeholder="Correo Electrónico"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                        />
                    </div>
                     <div className="relative">
                        <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            id="password"
                            name="password"
                            type="password"
                            autoComplete="current-password"
                            required
                            className="pl-10"
                            placeholder="Contraseña"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                    </div>
                    <div>
                        <Button type="submit" className="w-full" disabled={loading}>
                            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Ingresar
                        </Button>
                    </div>
                </form>
            </div>
        </main>
    );
}


// FILE: src/app/owner/change-password/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { KeyRound, Loader2, LogOut, CheckCircle } from 'lucide-react';
import { getAuth, updatePassword } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { db, app } from '@/lib/firebase';

export default function ChangePasswordPage() {
    const router = useRouter();
    const { toast } = useToast();
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [session, setSession] = useState<any>(null);

    useEffect(() => {
        const userSession = localStorage.getItem('user-session');
        if (!userSession) {
            router.push('/login');
            return;
        }
        const parsedSession = JSON.parse(userSession);
        if (parsedSession.passwordChanged) {
            router.push('/owner/dashboard');
        }
        setSession(parsedSession);
    }, [router]);

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (newPassword.length < 6) {
            toast({ variant: 'destructive', title: 'Contraseña muy corta', description: 'La contraseña debe tener al menos 6 caracteres.' });
            return;
        }
        if (newPassword !== confirmPassword) {
            toast({ variant: 'destructive', title: 'Las contraseñas no coinciden', description: 'Por favor, verifique su nueva contraseña.' });
            return;
        }

        setLoading(true);
        const auth = getAuth(app);
        const user = auth.currentUser;

        if (user && session) {
            try {
                await updatePassword(user, newPassword);
                
                const userDocRef = doc(db, 'owners', user.uid);
                await updateDoc(userDocRef, {
                    passwordChanged: true
                });

                // Update session in localStorage
                const updatedSession = { ...session, passwordChanged: true };
                localStorage.setItem('user-session', JSON.stringify(updatedSession));

                toast({
                    title: 'Contraseña Actualizada',
                    description: 'Serás redirigido a tu panel de control.',
                    className: 'bg-green-100 border-green-400 text-green-800'
                });

                router.push('/owner/dashboard');

            } catch (error: any) {
                console.error("Error changing password:", error);
                toast({ variant: 'destructive', title: 'Error al cambiar la contraseña', description: 'Por favor, cierre sesión y vuelva a intentarlo.' });
            } finally {
                setLoading(false);
            }
        }
    };
    
    const handleLogout = () => {
        const auth = getAuth(app);
        auth.signOut();
        localStorage.removeItem('user-session');
        router.push('/login');
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
            <Card className="w-full max-w-md">
                <CardHeader>
                    <CardTitle className="text-2xl font-bold font-headline flex items-center gap-2">
                        <KeyRound className="h-6 w-6 text-primary"/>
                        Cambiar Contraseña
                    </CardTitle>
                    <CardDescription>
                        Por seguridad, debes establecer una nueva contraseña para continuar.
                    </CardDescription>
                </CardHeader>
                <form onSubmit={handleChangePassword}>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="new-password">Nueva Contraseña</Label>
                            <Input
                                id="new-password"
                                type="password"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="confirm-password">Confirmar Nueva Contraseña</Label>
                            <Input
                                id="confirm-password"
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                required
                            />
                        </div>
                    </CardContent>
                    <CardFooter className="flex flex-col gap-4">
                        <Button type="submit" className="w-full" disabled={loading}>
                            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4"/>}
                            Guardar y Continuar
                        </Button>
                         <Button type="button" variant="outline" className="w-full" onClick={handleLogout}>
                            <LogOut className="mr-2 h-4 w-4" />
                            Cerrar Sesión
                        </Button>
                    </CardFooter>
                </form>
            </Card>
        </div>
    );
}


// FILE: src/app/owner/dashboard/page.tsx
'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Landmark, AlertCircle, Building, Eye, Printer, Megaphone, Loader2, Wallet, FileText, CalendarClock, Scale, Calculator, Minus, Equal, ShieldCheck, TrendingUp, TrendingDown, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getCommunityUpdates } from '@/ai/flows/community-updates';
import { db } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import { doc, onSnapshot, collection, query, where, orderBy, limit, getDoc, getDocs, Timestamp } from 'firebase/firestore';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import jsPDF from 'jspdf';
import 'jspdf-autotable';


type Payment = {
    id: string;
    date: string;
    amount: number;
    bank: string;
    type: string;
    ref: string;
    status: 'aprobado' | 'pendiente' | 'rechazado';
    reportedAt: any;
    exchangeRate: number;
    paymentDate: Timestamp;
    reference: string;
    beneficiaries: { ownerId: string, ownerName: string, house?: string, street?: string, amount: number }[];
};

type UserData = {
    id: string;
    unit: string;
    name: string;
    balance: number;
    properties: { street: string, house: string }[];
};

type Debt = {
    id: string;
    ownerId: string;
    property: { street: string; house: string; };
    year: number;
    month: number;
    amountUSD: number;
    description: string;
    status: 'pending' | 'paid';
    paidAmountUSD?: number;
    paymentDate?: Timestamp;
    paymentId?: string;
};

type CompanyInfo = {
    name: string;
    address: string;
    rif: string;
    phone: string;
    email: string;
    logo: string;
};

type ReceiptData = {
    payment: Payment;
    ownerName: string;
    ownerUnit: string;
    paidDebts: Debt[];
} | null;


type SolvencyStatus = 'solvente' | 'moroso' | 'cargando...';

const statusVariantMap: { [key in SolvencyStatus]: 'success' | 'destructive' | 'outline' } = {
  'solvente': 'success',
  'moroso': 'destructive',
  'cargando...': 'outline',
};

const monthsLocale: { [key: number]: string } = {
    1: 'Enero', 2: 'Febrero', 3: 'Marzo', 4: 'Abril', 5: 'Mayo', 6: 'Junio',
    7: 'Julio', 8: 'Agosto', 9: 'Septiembre', 10: 'Octubre', 11: 'Noviembre', 12: 'Diciembre'
};

const formatToTwoDecimals = (num: number) => {
    if (typeof num !== 'number' || isNaN(num)) return '0,00';
    const truncated = Math.trunc(num * 100) / 100;
    return truncated.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export default function OwnerDashboardPage() {
    const router = useRouter();
    const [session, setSession] = useState<any>(null);

    const [loading, setLoading] = useState(true);
    const [userData, setUserData] = useState<UserData | null>(null);
    const [payments, setPayments] = useState<Payment[]>([]);
    const [debts, setDebts] = useState<Debt[]>([]);
    const [dashboardStats, setDashboardStats] = useState({
        balanceInFavor: 0,
        totalDebtUSD: 0,
        exchangeRate: 0,
    });
    const [solvencyStatus, setSolvencyStatus] = useState<SolvencyStatus>('cargando...');
    const [solvencyPeriod, setSolvencyPeriod] = useState('');
    const [communityUpdates, setCommunityUpdates] = useState<string[]>([]);
    const [selectedDebts, setSelectedDebts] = useState<string[]>([]);
    const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);
    const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
    const [isReceiptPreviewOpen, setIsReceiptPreviewOpen] = useState(false);
    
    useEffect(() => {
        const userSession = localStorage.getItem('user-session');
        if (!userSession) {
            router.push('/login?role=owner');
            return;
        }
        const parsedSession = JSON.parse(userSession);
        setSession(parsedSession);
        
        const userId = parsedSession.uid;
        let settingsUnsubscribe: () => void;
        let userUnsubscribe: () => void;
        let paymentsUnsubscribe: () => void;
        let debtsUnsubscribe: () => void;
    
        const settingsRef = doc(db, 'config', 'mainSettings');
        settingsUnsubscribe = onSnapshot(settingsRef, (settingsSnap) => {
            let activeRate = 0;
            if (settingsSnap.exists()) {
                const settings = settingsSnap.data();
                setCompanyInfo(settings.companyInfo || null);
                const rates = settings.exchangeRates || [];
                const activeRateObj = rates.find((r: any) => r.active);
                if (activeRateObj) {
                    activeRate = activeRateObj.rate;
                } else if (rates.length > 0) {
                    const sortedRates = [...rates].sort((a:any,b:any) => new Date(b.date).getTime() - new Date(a.date).getTime());
                    activeRate = sortedRates[0].rate;
                }
            } else {
                console.error("Settings document not found!");
            }
    
            if (userUnsubscribe) userUnsubscribe();
            const userDocRef = doc(db, "owners", userId);
            userUnsubscribe = onSnapshot(userDocRef, (userSnap) => {
                if (userSnap.exists()) {
                    const data = userSnap.data();
                    const ownerData = { 
                        id: userSnap.id, 
                        name: data.name,
                        properties: data.properties || [],
                        unit: (data.properties && data.properties.length > 0) ? \`\${data.properties[0].street} - \${data.properties[0].house}\` : 'N/A',
                        balance: data.balance || 0,
                    } as UserData;
                    setUserData(ownerData);
    
                    setDashboardStats(prev => ({
                        ...prev,
                        balanceInFavor: ownerData.balance || 0,
                        exchangeRate: activeRate
                    }));

                    if (debtsUnsubscribe) debtsUnsubscribe();
                    const debtsQuery = query(collection(db, "debts"), where("ownerId", "==", userId));
                    debtsUnsubscribe = onSnapshot(debtsQuery, async (debtsSnapshot) => {
                        const allDebtsData: Debt[] = [];
                        debtsSnapshot.forEach(d => allDebtsData.push({ id: d.id, ...d.data() } as Debt));

                        const pendingDebts = allDebtsData.filter(d => d.status === 'pending');
                        const totalDebtUSD = pendingDebts.reduce((sum, d) => sum + d.amountUSD, 0);

                        setDebts(pendingDebts.sort((a, b) => b.year - a.year || b.month - b.month));
                        setDashboardStats(prev => ({...prev, totalDebtUSD }));

                        if (totalDebtUSD > 0) {
                            setSolvencyStatus('moroso');
                            const oldestDebt = [...pendingDebts].sort((a, b) => a.year - b.year || a.month - b.month)[0];
                            if (oldestDebt) {
                                setSolvencyPeriod(\`Desde \${monthsLocale[oldestDebt.month] || ''} \${oldestDebt.year}\`);
                            }
                        } else {
                            setSolvencyStatus('solvente');
                            const lastPaidDebt = allDebtsData
                                .filter(d => d.status === 'paid')
                                .sort((a,b) => b.year - b.year || b.month - b.month)[0];
                            
                            if (lastPaidDebt) {
                                setSolvencyPeriod(\`Hasta \${monthsLocale[lastPaidDebt.month] || ''} \${lastPaidDebt.year}\`);
                            } else {
                                const now = new Date();
                                setSolvencyPeriod(\`Hasta \${monthsLocale[now.getMonth() + 1] || ''} \${now.getFullYear()}\`);
                            }
                        }
                        
                    });
                    
                    if (paymentsUnsubscribe) paymentsUnsubscribe();
                    const paymentsQuery = query(collection(db, "payments"), where("beneficiaryIds", "array-contains", userId), orderBy('paymentDate', 'desc'), limit(3));
                    paymentsUnsubscribe = onSnapshot(paymentsQuery, (snapshot) => {
                        const paymentsData: Payment[] = [];
                        snapshot.forEach((doc) => {
                            paymentsData.push({ id: doc.id, ...doc.data() } as Payment);
                        });
                        setPayments(paymentsData);
                    });
    
                } else {
                    console.log("No such user document!");
                }
                setLoading(false);
            });
        });
    
        return () => {
            if (settingsUnsubscribe) settingsUnsubscribe();
            if (userUnsubscribe) userUnsubscribe();
            if (paymentsUnsubscribe) paymentsUnsubscribe();
            if (debtsUnsubscribe) debtsUnsubscribe();
        };
    
    }, [router]);
    
    const handleDebtSelection = (debtId: string) => {
        setSelectedDebts(prev => 
            prev.includes(debtId) ? prev.filter(id => id !== debtId) : [...prev, debtId]
        );
    };

    const paymentCalculator = useMemo(() => {
        const totalSelectedDebtUSD = debts
            .filter(debt => selectedDebts.includes(debt.id))
            .reduce((sum, debt) => sum + debt.amountUSD, 0);
            
        const totalSelectedDebtBs = totalSelectedDebtUSD * dashboardStats.exchangeRate;
        const totalToPay = Math.max(0, totalSelectedDebtBs - dashboardStats.balanceInFavor);

        return {
            totalSelectedBs: totalSelectedDebtBs,
            balanceInFavor: dashboardStats.balanceInFavor,
            totalToPay: totalToPay,
            hasSelection: selectedDebts.length > 0,
        };
    }, [selectedDebts, debts, dashboardStats]);

  const showReceiptPreview = async (payment: Payment) => {
    if (!userData) return;

    try {
        const ownerName = (payment.beneficiaries && payment.beneficiaries.length > 0 && payment.beneficiaries[0].ownerName) 
            ? payment.beneficiaries[0].ownerName 
            : userData.name;

        const paidDebtsQuery = query(
            collection(db, "debts"),
            where("paymentId", "==", payment.id)
        );
        const paidDebtsSnapshot = await getDocs(paidDebtsQuery);
        const paidDebts = paidDebtsSnapshot.docs
            .map(doc => ({id: doc.id, ...doc.data()}) as Debt)
            .sort((a,b) => b.year - b.year || b.month - b.month);
        
        setReceiptData({ 
            payment, 
            ownerName: ownerName,
            ownerUnit: userData.unit,
            paidDebts 
        });
        setIsReceiptPreviewOpen(true);
    } catch (error) {
        console.error("Error generating receipt preview: ", error);
    }
  }

   const handleDownloadPdf = () => {
    if (!receiptData || !companyInfo) return;
    const { payment, ownerName, ownerUnit, paidDebts } = receiptData;
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 14;

    // --- Header ---
    if (companyInfo.logo) {
        try { doc.addImage(companyInfo.logo, 'PNG', margin, margin, 25, 25); }
        catch (e) { console.error("Error adding image to PDF: ", e)}
    }
    doc.setFontSize(12).setFont('helvetica', 'bold').text(companyInfo.name, margin + 30, margin + 8);
    doc.setFontSize(9).setFont('helvetica', 'normal');
    doc.text(companyInfo.rif, margin + 30, margin + 14);
    doc.text(companyInfo.address, margin + 30, margin + 19);
    doc.text(\`Teléfono: \${companyInfo.phone}\`, margin + 30, margin + 24);
    
    doc.setFontSize(10).text(\`Fecha de Emisión: \${new Date(), 'dd/MM/yyyy'}\`, pageWidth - margin, margin + 8, { align: 'right' });
    
    doc.setLineWidth(0.5).line(margin, margin + 32, pageWidth - margin, margin + 32);

    // --- Title ---
    doc.setFontSize(16).setFont('helvetica', 'bold').text("RECIBO DE PAGO", pageWidth / 2, margin + 45, { align: 'center' });
    doc.setFontSize(10).setFont('helvetica', 'normal').text(\`N° de recibo: \${payment.id.substring(0, 10)}\`, pageWidth - margin, margin + 50, { align: 'right' });

    // --- Payment Details ---
    let startY = margin + 60;
    doc.setFontSize(10).text(\`Nombre del Beneficiario: \${ownerName}\`, margin, startY);
    startY += 6;
    doc.text(\`Unidad: \${ownerUnit}\`, margin, startY);
    startY += 6;
    doc.text(\`Método de pago: \${payment.type}\`, margin, startY);
    startY += 6;
    doc.text(\`Banco Emisor: \${payment.bank}\`, margin, startY);
    startY += 6;
    doc.text(\`N° de Referencia Bancaria: \${payment.reference}\`, margin, startY);
    startY += 6;
    doc.text(\`Fecha del pago: \${format(payment.paymentDate.toDate(), 'dd/MM/yyyy')}\`, margin, startY);
    startY += 6;
    doc.text(\`Tasa de Cambio Aplicada: Bs. \${formatToTwoDecimals(payment.exchangeRate)} por USD\`, margin, startY);
    startY += 10;
    
    let totalPaidInConcepts = 0;
    const tableBody = paidDebts.map(debt => {
        const debtAmountBs = (debt.paidAmountUSD || debt.amountUSD) * payment.exchangeRate;
        totalPaidInConcepts += debtAmountBs;
        const propertyLabel = debt.property ? \`\${debt.property.street} - \${debt.property.house}\` : 'N/A';
        const periodLabel = \`\${monthsLocale[debt.month]} \${debt.year}\`;
        const concept = \`\${debt.description} (\${propertyLabel})\`;
        
        return [
            periodLabel,
            concept,
            \`$\${(debt.paidAmountUSD || debt.amountUSD).toFixed(2)}\`,
            \`Bs. \${formatToTwoDecimals(debtAmountBs)}\`
        ];
    });

    if (paidDebts.length > 0) {
        (doc as any).autoTable({
            startY: startY,
            head: [['Período', 'Concepto (Propiedad)', 'Monto ($)', 'Monto Pagado (Bs)']],
            body: tableBody,
            theme: 'striped',
            headStyles: { fillColor: [44, 62, 80], textColor: 255 },
            styles: { fontSize: 9, cellPadding: 2.5 },
            didDrawPage: (data: any) => { startY = data.cursor.y; }
        });
        startY = (doc as any).lastAutoTable.finalY + 8;
    } else {
        totalPaidInConcepts = payment.amount;
        (doc as any).autoTable({
            startY: startY,
            head: [['Concepto', 'Monto Pagado (Bs)']],
            body: [['Abono a Saldo a Favor', \`Bs. \${formatToTwoDecimals(payment.amount)}\`]],
            theme: 'striped',
            headStyles: { fillColor: [44, 62, 80], textColor: 255 },
            styles: { fontSize: 9, cellPadding: 2.5 },
            didDrawPage: (data: any) => { startY = data.cursor.y; }
        });
        startY = (doc as any).lastAutoTable.finalY + 8;
    }
    
    // Totals Section
    const totalLabel = "TOTAL PAGADO:";
    const totalValue = \`Bs. \${formatToTwoDecimals(totalPaidInConcepts)}\`;
    doc.setFontSize(11).setFont('helvetica', 'bold');
    const totalValueWidth = doc.getStringUnitWidth(totalValue) * 11 / doc.internal.scaleFactor;
    doc.text(totalValue, pageWidth - margin, startY, { align: 'right' });
    doc.text(totalLabel, pageWidth - margin - totalValueWidth - 2, startY, { align: 'right' });

    startY += 10;

    // --- Footer Section ---
    const legalNote = 'Todo propietario que requiera de firma y sello húmedo deberá imprimir éste recibo y hacerlo llegar al condominio para su respectiva estampa.';
    const splitLegalNote = doc.splitTextToSize(legalNote, pageWidth - (margin * 2));
    doc.setFontSize(8).setFont('helvetica', 'normal').text(splitLegalNote, margin, startY);
    startY += (splitLegalNote.length * 4) + 4;

    doc.setFontSize(9).text('Este recibo confirma que su pago ha sido validado conforme a los términos establecidos por la comunidad.', margin, startY);
    startY += 8;
    doc.setFont('helvetica', 'bold').text(\`Firma electrónica: '\${companyInfo.name} - Condominio'\`, margin, startY);
    startY += 10;
    doc.setLineWidth(0.2).line(margin, startY, pageWidth - margin, startY);
    startY += 5;
    doc.setFontSize(8).setFont('helvetica', 'italic').text('Este recibo se generó de manera automática y es válido sin firma manuscrita.', pageWidth / 2, startY, { align: 'center'});

    doc.save(\`Recibo_de_Pago_\${payment.id.substring(0,7)}.pdf\`);
    setIsReceiptPreviewOpen(false);
  };

  if (loading) {
    return (
        <div className="flex justify-center items-center h-full">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
    );
  }

  if (!userData) {
    return (
        <div className="flex flex-col justify-center items-center h-full gap-4">
            <p className="text-lg">No se encontró información del propietario.</p>
        </div>
    )
  }

  return (
    <div className="space-y-8">
        <div>
            <h1 className="text-3xl font-bold font-headline">Panel de Propietario</h1>
            <p className="text-muted-foreground">Bienvenido, {userData?.name || 'Propietario'}. Aquí está el resumen de tu cuenta.</p>
        </div>
      
      <Card className="w-full rounded-2xl shadow-lg border-2 border-border/20">
            <CardHeader className="flex flex-col md:flex-row md:items-start md:justify-between p-6 gap-4">
                <div className="flex-1">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Estado de Cuenta</CardTitle>
                    <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                             <p className="text-xs text-destructive">Deuda Total Pendiente</p>
                             <p className="text-2xl font-bold text-destructive">$\${dashboardStats.totalDebtUSD.toFixed(2)}</p>
                             <p className="text-sm text-muted-foreground">~ Bs. {formatToTwoDecimals(dashboardStats.totalDebtUSD * dashboardStats.exchangeRate)}</p>
                        </div>
                        <div>
                            <p className="text-xs text-success">Saldo a Favor</p>
                            <p className="text-2xl font-bold text-success">Bs. {formatToTwoDecimals(dashboardStats.balanceInFavor)}</p>
                            <p className="text-sm text-muted-foreground">~ $\${dashboardStats.exchangeRate > 0 ? formatToTwoDecimals(dashboardStats.balanceInFavor / dashboardStats.exchangeRate) : '0,00'}</p>
                        </div>
                    </div>
                </div>
                 <div className="flex flex-col items-start md:items-end flex-shrink-0">
                    <Badge variant={statusVariantMap[solvencyStatus]} className="text-base capitalize mb-2">
                        {solvencyStatus === 'moroso' ? <AlertCircle className="mr-2 h-4 w-4"/> : <ShieldCheck className="mr-2 h-4 w-4"/>}
                        {solvencyStatus}
                    </Badge>
                     {solvencyPeriod && <p className="text-sm font-semibold text-muted-foreground">{solvencyPeriod}</p>}
                 </div>
            </CardHeader>
            <CardContent className="px-6 pb-6">
                 <div className="text-xs text-muted-foreground">
                    Tasa de cambio del día: Bs. {formatToTwoDecimals(dashboardStats.exchangeRate)} por USD
                 </div>
            </CardContent>
        </Card>

       <div className="grid gap-8 lg:grid-cols-1">
          <div>
            <h2 className="text-2xl font-bold mb-4 font-headline">Desglose de Deudas Pendientes</h2>
            <Card>
                <Table>
                <TableHeader>
                    <TableRow>
                    <TableHead className="w-[50px] text-center">Pagar</TableHead>
                    <TableHead>Período</TableHead>
                    <TableHead>Concepto</TableHead>
                    <TableHead className="text-right">Monto (Bs.)</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {loading ? (
                        <TableRow><TableCell colSpan={4} className="h-24 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto"/></TableCell></TableRow>
                    ) : debts.length === 0 ? (
                        <TableRow><TableCell colSpan={4} className="h-24 text-center text-muted-foreground">¡Felicidades! No tienes deudas pendientes.</TableCell></TableRow>
                    ) : (
                    debts.map((debt) => (
                    <TableRow key={debt.id}>
                        <TableCell className="text-center">
                            <Checkbox 
                                onCheckedChange={() => handleDebtSelection(debt.id)}
                                checked={selectedDebts.includes(debt.id)}
                                aria-label={\`Seleccionar deuda de \${monthsLocale[debt.month]} \${debt.year}\`}
                            />
                        </TableCell>
                        <TableCell className="font-medium">{monthsLocale[debt.month]} \${debt.year}</TableCell>
                        <TableCell>{debt.description}</TableCell>
                        <TableCell className="text-right">Bs. {formatToTwoDecimals(debt.amountUSD * dashboardStats.exchangeRate)}</TableCell>
                    </TableRow>
                    )))}
                </TableBody>
                </Table>
                 {paymentCalculator.hasSelection && (
                    <CardFooter className="p-4 bg-muted/50 border-t">
                        <div className="w-full max-w-md ml-auto space-y-2">
                             <h3 className="text-lg font-semibold flex items-center"><Calculator className="mr-2 h-5 w-5"/> Calculadora de Pago</h3>
                             <div className="flex justify-between items-center">
                                 <span className="text-muted-foreground">Total Seleccionado:</span>
                                 <span className="font-medium">Bs. {formatToTwoDecimals(paymentCalculator.totalSelectedBs)}</span>
                             </div>
                             <div className="flex justify-between items-center text-sm">
                                 <span className="text-muted-foreground flex items-center"><Minus className="mr-2 h-4 w-4"/> Saldo a Favor:</span>
                                 <span className="font-medium">Bs. {formatToTwoDecimals(paymentCalculator.balanceInFavor)}</span>
                             </div>
                             <hr className="my-1"/>
                             <div className="flex justify-between items-center text-lg">
                                 <span className="font-bold flex items-center"><Equal className="mr-2 h-4 w-4"/> TOTAL A PAGAR:</span>
                                 <span className="font-bold text-primary">Bs. {formatToTwoDecimals(paymentCalculator.totalToPay)}</span>
                             </div>
                        </div>
                    </CardFooter>
                )}
            </Card>
           
        </div>

        <div>
            <h2 className="text-2xl font-bold mb-4 font-headline">Mis Últimos Pagos Aprobados</h2>
            <Card>
                <Table>
                <TableHeader>
                    <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Monto</TableHead>
                    <TableHead>Banco</TableHead>
                    <TableHead>Referencia</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {loading ? (
                        <TableRow><TableCell colSpan={6} className="h-24 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto"/></TableCell></TableRow>
                    ) : payments.length === 0 ? (
                        <TableRow><TableCell colSpan={6} className="h-24 text-center text-muted-foreground">No tienes pagos aprobados recientemente.</TableCell></TableRow>
                    ) : (
                    payments.map((payment) => (
                    <TableRow key={payment.id}>
                        <TableCell>{format(payment.paymentDate.toDate(), 'dd/MM/yyyy')}</TableCell>
                        <TableCell>
                            {payment.type === 'adelanto' 
                                ? \`$\${formatToTwoDecimals(payment.amount)}\`
                                : \`Bs. \${formatToTwoDecimals(payment.amount)}\`
                            }
                        </TableCell>
                        <TableCell>{payment.bank}</TableCell>
                        <TableCell>{payment.ref}</TableCell>
                        <TableCell>
                          <Badge variant={payment.status === 'aprobado' ? 'success' : payment.status === 'rechazado' ? 'destructive' : 'warning'}>
                            {payment.status.charAt(0).toUpperCase() + payment.status.slice(1)}
                          </Badge>
                        </TableCell>
                         <TableCell className="text-right">
                            {payment.status === 'aprobado' ? (
                                <Button variant="ghost" size="icon" onClick={() => showReceiptPreview(payment)}>
                                    <FileText className="h-4 w-4"/>
                                    <span className="sr-only">Ver Recibo</span>
                                </Button>
                            ) : (
                                <Button variant="ghost" size="icon" disabled>
                                    <FileText className="h-4 w-4 text-muted-foreground/50"/>
                                    <span className="sr-only">Ver Recibo (No disponible)</span>
                                </Button>
                            )}
                        </TableCell>
                    </TableRow>
                    )))}
                </TableBody>
                </Table>
            </Card>
        </div>
      </div>
      
       {/* Receipt Preview Dialog */}
        <Dialog open={isReceiptPreviewOpen} onOpenChange={setIsReceiptPreviewOpen}>
            <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Vista Previa del Recibo</DialogTitle>
                    <DialogDescription>
                        Revise el recibo antes de descargarlo. El diseño se ajustará en el PDF final.
                    </DialogDescription>
                </DialogHeader>
                {receiptData && companyInfo && (
                     <div className="flex-grow overflow-y-auto pr-4 -mr-4 border rounded-md p-4 bg-white text-black font-sans text-xs space-y-4">
                        {/* Header */}
                        <div className="flex justify-between items-start">
                            <div className="flex items-center gap-4">
                                {companyInfo.logo && <img src={companyInfo.logo} alt="Logo" className="w-20 h-20 object-contain"/>}
                                <div>
                                    <p className="font-bold">{companyInfo.name}</p>
                                    <p>{companyInfo.rif}</p>
                                    <p>{companyInfo.address}</p>
                                    <p>Teléfono: {companyInfo.phone}</p>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="font-bold text-lg">RECIBO DE PAGO</p>
                                <p><strong>Fecha Emisión:</strong> {format(new Date(), 'dd/MM/yyyy')}</p>
                                <p><strong>N° Recibo:</strong> {receiptData.payment.id.substring(0, 10)}</p>
                            </div>
                        </div>
                        <hr className="my-2 border-gray-400"/>
                        {/* Details */}
                         <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                             <p><strong>Beneficiario:</strong></p><p>{receiptData.ownerName}</p>
                             <p><strong>Unidad:</strong></p><p>{receiptData.ownerUnit}</p>
                             <p><strong>Método de pago:</strong></p><p>{receiptData.payment.type}</p>
                             <p><strong>Banco Emisor:</strong></p><p>{receiptData.payment.bank}</p>
                             <p><strong>N° de Referencia:</strong></p><p>{receiptData.payment.reference}</p>
                             <p><strong>Fecha del pago:</strong></p><p>{format(receiptData.payment.paymentDate.toDate(), 'dd/MM/yyyy')}</p>
                             <p><strong>Tasa de Cambio Aplicada:</strong></p><p>Bs. {formatToTwoDecimals(receiptData.payment.exchangeRate)} por USD</p>
                        </div>
                        {/* Concept Table */}
                        <Table className="text-xs">
                            <TableHeader>
                                <TableRow className="bg-gray-700 text-white hover:bg-gray-800">
                                    <TableHead className="text-white">Período</TableHead>
                                    <TableHead className="text-white">Concepto (Propiedad)</TableHead>
                                    <TableHead className="text-white text-right">Monto ($)</TableHead>
                                    <TableHead className="text-white text-right">Monto Pagado (Bs)</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {receiptData.paidDebts.length > 0 ? (
                                    receiptData.paidDebts.map((debt, index) => (
                                        <TableRow key={index} className="even:bg-gray-100">
                                            <TableCell>{monthsLocale[debt.month]} {debt.year}</TableCell>
                                            <TableCell>{debt.description} ({debt.property.street} - {debt.property.house})</TableCell>
                                            <TableCell className="text-right">$\{(debt.paidAmountUSD || debt.amountUSD).toFixed(2)}</TableCell>
                                            <TableCell className="text-right">Bs. {formatToTwoDecimals((debt.paidAmountUSD || debt.amountUSD) * receiptData.payment.exchangeRate)}</TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={4} className="h-24 text-center">Abono a Saldo a Favor</TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                         <div className="text-right font-bold mt-2 pr-4">
                            Total Pagado: Bs. {formatToTwoDecimals(receiptData.paidDebts.reduce((acc, debt) => acc + ((debt.paidAmountUSD || debt.amountUSD) * receiptData.payment.exchangeRate), 0) > 0 ? receiptData.paidDebts.reduce((acc, debt) => acc + ((debt.paidAmountUSD || debt.amountUSD) * receiptData.payment.exchangeRate), 0) : receiptData.payment.amount)}
                         </div>
                        {/* Footer */}
                        <div className="mt-6 text-gray-600 text-[10px] space-y-2">
                             <p className="text-left text-[11px] font-semibold">Todo propietario que requiera de firma y sello húmedo deberá imprimir éste recibo y hacerlo llegar al condominio para su respectiva estampa.</p>
                             <p className="text-left">Este recibo confirma que su pago ha sido validado conforme a los términos establecidos por la comunidad.</p>
                             <p className="text-left font-bold mt-2">Firma electrónica: '{companyInfo.name} - Condominio'</p>
                             <hr className="my-4 border-gray-400"/>
                             <p className="italic text-center">Este recibo se generó de manera automática y es válido sin firma manuscrita.</p>
                        </div>
                    </div>
                )}
                <DialogFooter className="mt-auto pt-4 border-t">
                    <Button variant="outline" onClick={() => setIsReceiptPreviewOpen(false)}>Cerrar</Button>
                    <Button onClick={handleDownloadPdf}>
                        <Printer className="mr-2 h-4 w-4"/> Descargar PDF
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    </div>
  );
}


// FILE: src/app/owner/layout.tsx
'use client';

import {
    Home,
    Landmark,
    Settings,
} from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardLayout, type NavItem } from '@/components/dashboard-layout';
import { Loader2 } from 'lucide-react';

const ownerNavItems: NavItem[] = [
    { href: "/owner/dashboard", icon: Home, label: "Dashboard" },
    { 
      href: "/admin/payments", 
      icon: Landmark, 
      label: "Reportar Pago",
    },
    { href: "/owner/settings", icon: Settings, label: "Configuración" },
];

export default function OwnerLayout({ children }: { children: ReactNode }) {

    return (
        <DashboardLayout userName="Edwin Aguiar" userRole="Propietario" navItems={ownerNavItems}>
            {children}
        </DashboardLayout>
    );
}


// FILE: src/app/owner/settings/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Upload, Save, Loader2, UserCircle, KeyRound } from 'lucide-react';
import { db } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import { doc, getDoc, updateDoc, onSnapshot } from 'firebase/firestore';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';


type OwnerProfile = {
    id: string;
    name: string;
    email: string;
    avatar: string;
};

const emptyOwnerProfile: OwnerProfile = {
    id: '',
    name: 'Propietario',
    email: '',
    avatar: ''
};

export default function OwnerSettingsPage() {
    const { toast } = useToast();
    const router = useRouter();
    const [session, setSession] = useState<any>(null);

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    
    const [profile, setProfile] = useState<OwnerProfile>(emptyOwnerProfile);
    const [avatarPreview, setAvatarPreview] = useState<string | null>(null);


    useEffect(() => {
        const userSession = localStorage.getItem('user-session');
        if (!userSession) {
            router.push('/login?role=owner');
            return;
        }
        const parsedSession = JSON.parse(userSession);
        setSession(parsedSession);

        const userRef = doc(db, 'owners', parsedSession.uid);
        const unsubscribe = onSnapshot(userRef, (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.data();
                const profileData = {
                    id: snapshot.id,
                    name: data.name || 'Propietario',
                    email: data.email || '',
                    avatar: data.avatar || ''
                };
                setProfile(profileData);
                setAvatarPreview(profileData.avatar);
            }
            setLoading(false);
        }, (error) => {
            console.error("Error fetching owner profile:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo cargar tu perfil.' });
            setLoading(false);
        });

        return () => unsubscribe();
    }, [router, toast]);

    const handleProfileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setProfile({ ...profile, [e.target.name]: e.target.value });
    };

    const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            if (file.size > 1 * 1024 * 1024) { // 1MB limit
                 toast({ variant: 'destructive', title: 'Archivo muy grande', description: 'La imagen no debe pesar más de 1MB.' });
                return;
            }
            const reader = new FileReader();
            reader.onloadend = () => {
                const result = reader.result as string;
                setAvatarPreview(result);
                setProfile({ ...profile, avatar: result });
            };
            reader.readAsDataURL(file);
        }
    };
    
    const handleSaveChanges = async () => {
        if (!profile.id) return;
        setSaving(true);
        try {
            const userRef = doc(db, 'owners', profile.id);
            const { name, avatar } = profile;
            await updateDoc(userRef, { name, avatar });
            
            toast({
                title: 'Perfil Actualizado',
                description: 'Tus cambios han sido guardados.',
                className: 'bg-green-100 border-green-400 text-green-800'
            });

        } catch(error) {
             console.error("Error saving profile:", error);
             toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron guardar tus cambios.' });
        } finally {
            setSaving(false);
        }
    };


    if (loading) {
        return (
            <div className="flex justify-center items-center h-full">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
            </div>
        );
    }
    
    if (!profile.id) {
        return <div className="text-center">No se encontró información del propietario.</div>
    }

    return (
        <div className="space-y-8 max-w-4xl mx-auto">
            <div>
                <h1 className="text-3xl font-bold font-headline">Configuración de la Cuenta</h1>
                <p className="text-muted-foreground">Gestiona tu información personal y seguridad.</p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Mi Perfil</CardTitle>
                    <CardDescription>Edita tu nombre y foto de perfil.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="flex items-center gap-6">
                        <Avatar className="w-24 h-24 text-lg">
                            <AvatarImage src={avatarPreview || ''} alt="User Avatar" />
                            <AvatarFallback><UserCircle className="h-12 w-12"/></AvatarFallback>
                        </Avatar>
                        <div className="space-y-2">
                             <Label htmlFor="avatar-upload">Foto de Perfil</Label>
                             <div className="flex items-center gap-2">
                                <Input id="avatar-upload" type="file" className="hidden" onChange={handleAvatarChange} accept="image/png, image/jpeg" />
                                <Button type="button" variant="outline" onClick={() => document.getElementById('avatar-upload')?.click()}>
                                    <Upload className="mr-2 h-4 w-4"/> Cambiar Foto
                                </Button>
                             </div>
                             <p className="text-xs text-muted-foreground">PNG o JPG. Recomendado 200x200px, max 1MB.</p>
                        </div>
                     </div>
                    <div className="grid md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="name">Nombre</Label>
                            <Input id="name" name="name" value={profile.name} onChange={handleProfileChange} />
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="email">Email</Label>
                            <Input id="email" name="email" type="email" value={profile.email} disabled />
                             <p className="text-xs text-muted-foreground">El email no puede ser modificado.</p>
                        </div>
                    </div>
                </CardContent>
                <CardFooter>
                     <Button onClick={handleSaveChanges} disabled={saving}>
                        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Save className="mr-2 h-4 w-4"/>}
                        Guardar Cambios de Perfil
                    </Button>
                </CardFooter>
            </Card>
        </div>
    );
}


// FILE: src/app/page.tsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export default function RedirectPage() {
    const router = useRouter();

    useEffect(() => {
        router.replace('/admin/dashboard');
    }, [router]);

    return (
        <main className="min-h-screen flex flex-col items-center justify-center bg-background p-4 font-body">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <p className="text-muted-foreground mt-4">Redirigiendo al panel de administrador...</p>
        </main>
    );
}


// FILE: src/components/dashboard-layout.tsx
'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Building2, LogOut, type LucideIcon, ChevronDown, TrendingUp } from 'lucide-react';
import * as React from 'react';
import { doc, onSnapshot, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  SidebarTrigger,
  SidebarInset,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
} from '@/components/ui/sidebar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';

export type NavItem = {
  href: string;
  icon: LucideIcon;
  label: string;
  items?: Omit<NavItem, 'icon' | 'items'>[];
};

type CompanyInfo = {
    name: string;
    logo: string;
};

type ExchangeRate = {
    id: string;
    date: string; // Stored as 'yyyy-MM-dd'
    rate: number;
    active: boolean;
};

const BCVLogo = () => (
    <svg width="24" height="24" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="shrink-0">
        <path d="M49.619 19.468C32.769 19.468 19.23 33.007 19.23 49.857C19.23 66.707 32.769 80.246 49.619 80.246C66.469 80.246 80 66.707 80 49.857C80 33.007 66.469 19.468 49.619 19.468Z" fill="#D52B1E"></path>
        <path d="M57.618 36.436H41.62V63.278H57.618V55.772H49.125V44.022H57.618V36.436Z" fill="white"></path>
    </svg>
);


const CustomHeader = ({ userRole, userName }: { userRole: string, userName: string }) => {
    const router = useRouter();
    const [activeRate, setActiveRate] = React.useState<ExchangeRate | null>(null);

    React.useEffect(() => {
        const settingsRef = doc(db, 'config', 'mainSettings');
        const settingsUnsubscribe = onSnapshot(settingsRef, (docSnap) => {
            if (docSnap.exists()) {
                const settings = docSnap.data();
                const rates: ExchangeRate[] = settings.exchangeRates || [];
                let currentActiveRate = rates.find(r => r.active) || null;
                if (!currentActiveRate && rates.length > 0) {
                    currentActiveRate = [...rates].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
                }
                setActiveRate(currentActiveRate);
            }
        });

        return () => {
            settingsUnsubscribe();
        };
    }, []);

    const handleLogout = () => {
        localStorage.removeItem('user-session');
        router.push('/login');
    };

    const displayName = userName;

    return (
        <header className="sticky top-0 z-10 flex h-auto flex-col items-center gap-2 border-b bg-background/80 p-2 backdrop-blur-sm sm:flex-row sm:h-16 sm:px-4">
             <div className="flex w-full items-center justify-between sm:w-auto">
                <SidebarTrigger className="sm:hidden" />
                <h1 className="text-md font-semibold text-foreground">Hola, {displayName}</h1>
            </div>

            <div className="flex w-full items-center justify-between gap-4 sm:w-auto sm:ml-auto">
                {activeRate && (
                    <Card className="flex items-center gap-3 p-2 rounded-lg bg-card/50 flex-shrink-0">
                       <BCVLogo />
                       <div>
                            <p className="text-sm font-bold leading-none">Bs. {activeRate.rate.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</p>
                            <p className="text-xs text-muted-foreground leading-none">
                                Tasa BCV - {format(new Date(activeRate.date.replace(/-/g, '/')), 'dd MMM yyyy', { locale: es })}
                            </p>
                       </div>
                    </Card>
                )}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="relative h-10 w-10 rounded-full">
                        <Avatar className="h-10 w-10">
                        <AvatarImage src="" alt={displayName} data-ai-hint="profile picture"/>
                        <AvatarFallback>{displayName.charAt(0)}</AvatarFallback>
                        </Avatar>
                    </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                    <DropdownMenuLabel>
                        <div className="flex flex-col space-y-1">
                        <p className="text-sm font-medium leading-none font-headline">{displayName}</p>
                        </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleLogout} className="cursor-pointer">
                        <LogOut className="mr-2 h-4 w-4" />
                        <span>Salir</span>
                    </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </header>
    );
};


export function DashboardLayout({
  children,
  userName,
  userRole,
  navItems,
}: {
  children: React.ReactNode;
  userName: string;
  userRole: string;
  navItems: NavItem[];
}) {
  const router = useRouter();
  const [companyInfo, setCompanyInfo] = React.useState<CompanyInfo | null>(null);

  React.useEffect(() => {
    const settingsRef = doc(db, 'config', 'mainSettings');
    const unsubscribe = onSnapshot(settingsRef, (docSnap) => {
        if (docSnap.exists()) {
            setCompanyInfo(docSnap.data().companyInfo as CompanyInfo);
        }
    });
    return () => unsubscribe();
  }, []);

  const isSubItemActive = (parentHref: string, items?: Omit<NavItem, 'icon' | 'items'>[]) => {
    const pathname = usePathname();
    if (pathname === parentHref) return true;
    return items?.some(item => pathname === item.href) ?? false;
  }
  
  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <div className="flex items-center gap-2 p-2">
            {companyInfo?.logo ? <img src={companyInfo.logo} alt="Logo" className="w-8 h-8 rounded-md object-cover"/> : <Building2 className="w-6 h-6 text-primary" />}
            <span className="font-semibold text-lg font-headline truncate">{companyInfo?.name || 'Cargando...'}</span>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarMenu>
            {navItems.map((item) => 
                item.items ? (
                  <Collapsible key={item.label} defaultOpen={isSubItemActive(item.href, item.items)}>
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                          <SidebarMenuButton
                            isActive={isSubItemActive(item.href, item.items)}
                            tooltip={{ children: item.label }}
                            className="justify-between"
                          >
                            <div className='flex gap-2 items-center'>
                              <item.icon />
                              <span>{item.label}</span>
                            </div>
                            <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200 group-data-[state=open]:-rotate-180" />
                          </SidebarMenuButton>
                      </CollapsibleTrigger>
                    </SidebarMenuItem>
                    <CollapsibleContent>
                       <SidebarMenuSub>
                        {item.items.map(subItem => (
                          <SidebarMenuSubItem key={subItem.label}>
                             <Link href={subItem.href} passHref>
                                <SidebarMenuSubButton asChild isActive={usePathname() === subItem.href}>
                                  <span>{subItem.label}</span>
                                </SidebarMenuSubButton>
                            </Link>
                          </SidebarMenuSubItem>
                        ))}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </Collapsible>
                ) : (
                  <SidebarMenuItem key={item.label}>
                    <Link href={item.href}>
                      <SidebarMenuButton
                        isActive={usePathname() === item.href}
                        tooltip={{ children: item.label }}
                      >
                          <item.icon />
                          <span>{item.label}</span>
                      </SidebarMenuButton>
                    </Link>
                  </SidebarMenuItem>
                )
            )}
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter>
            {/* Can add footer content here if needed */}
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <CustomHeader userRole={userRole} userName={userName} />
        <main className="flex-1 p-4 md:p-8 bg-background">{children}</main>
        <footer className="bg-secondary text-secondary-foreground p-4 text-center text-sm">
           © {new Date().getFullYear()} {companyInfo?.name || 'CondoConnect'}. Todos los derechos reservados.
        </footer>
      </SidebarInset>
    </SidebarProvider>
  );
}


// FILE: src/components/ui/accordion.tsx
"use client"

import * as React from "react"
import * as AccordionPrimitive from "@radix-ui/react-accordion"
import { ChevronDown } from "lucide-react"

import { cn } from "@/lib/utils"

const Accordion = AccordionPrimitive.Root

const AccordionItem = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Item>
>(({ className, ...props }, ref) => (
  <AccordionPrimitive.Item
    ref={ref}
    className={cn("border-b", className)}
    {...props}
  />
))
AccordionItem.displayName = "AccordionItem"

const AccordionTrigger = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <AccordionPrimitive.Header className="flex">
    <AccordionPrimitive.Trigger
      ref={ref}
      className={cn(
        "flex flex-1 items-center justify-between py-4 font-medium transition-all hover:underline [&[data-state=open]>svg]:rotate-180",
        className
      )}
      {...props}
    >
      {children}
      <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200" />
    </AccordionPrimitive.Trigger>
  </AccordionPrimitive.Header>
))
AccordionTrigger.displayName = AccordionPrimitive.Trigger.displayName

const AccordionContent = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <AccordionPrimitive.Content
    ref={ref}
    className="overflow-hidden text-sm transition-all data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down"
    {...props}
  >
    <div className={cn("pb-4 pt-0", className)}>{children}</div>
  </AccordionPrimitive.Content>
))

AccordionContent.displayName = AccordionPrimitive.Content.displayName

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent }


// FILE: src/components/ui/alert-dialog.tsx
"use client"

import * as React from "react"
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"

const AlertDialog = AlertDialogPrimitive.Root

const AlertDialogTrigger = AlertDialogPrimitive.Trigger

const AlertDialogPortal = AlertDialogPrimitive.Portal

const AlertDialogOverlay = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Overlay
    className={cn(
      "fixed inset-0 z-50 bg-black/80  data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
    ref={ref}
  />
))
AlertDialogOverlay.displayName = AlertDialogPrimitive.Overlay.displayName

const AlertDialogContent = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Content>
>(({ className, ...props }, ref) => (
  <AlertDialogPortal>
    <AlertDialogOverlay />
    <AlertDialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg",
        className
      )}
      {...props}
    />
  </AlertDialogPortal>
))
AlertDialogContent.displayName = AlertDialogPrimitive.Content.displayName

const AlertDialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-2 text-center sm:text-left",
      className
    )}
    {...props}
  />
)
AlertDialogHeader.displayName = "AlertDialogHeader"

const AlertDialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      className
    )}
    {...props}
  />
)
AlertDialogFooter.displayName = "AlertDialogFooter"

const AlertDialogTitle = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold", className)}
    {...props}
  />
))
AlertDialogTitle.displayName = AlertDialogPrimitive.Title.displayName

const AlertDialogDescription = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
AlertDialogDescription.displayName =
  AlertDialogPrimitive.Description.displayName

const AlertDialogAction = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Action>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Action>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Action
    ref={ref}
    className={cn(buttonVariants(), className)}
    {...props}
  />
))
AlertDialogAction.displayName = AlertDialogPrimitive.Action.displayName

const AlertDialogCancel = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Cancel>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Cancel>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Cancel
    ref={ref}
    className={cn(
      buttonVariants({ variant: "outline" }),
      "mt-2 sm:mt-0",
      className
    )}
    {...props}
  />
))
AlertDialogCancel.displayName = AlertDialogPrimitive.Cancel.displayName

export {
  AlertDialog,
  AlertDialogPortal,
  AlertDialogOverlay,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
}


// FILE: src/components/ui/alert.tsx
import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const alertVariants = cva(
  "relative w-full rounded-lg border p-4 [&>svg~*]:pl-7 [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-foreground",
  {
    variants: {
      variant: {
        default: "bg-background text-foreground",
        destructive:
          "border-destructive/50 text-destructive dark:border-destructive [&>svg]:text-destructive",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

const Alert = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>
>(({ className, variant, ...props }, ref) => (
  <div
    ref={ref}
    role="alert"
    className={cn(alertVariants({ variant }), className)}
    {...props}
  />
))
Alert.displayName = "Alert"

const AlertTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h5
    ref={ref}
    className={cn("mb-1 font-medium leading-none tracking-tight", className)}
    {...props}
  />
))
AlertTitle.displayName = "AlertTitle"

const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-sm [&_p]:leading-relaxed", className)}
    {...props}
  />
))
AlertDescription.displayName = "AlertDescription"

export { Alert, AlertTitle, AlertDescription }


// FILE: src/components/ui/avatar.tsx
"use client"

import * as React from "react"
import * as AvatarPrimitive from "@radix-ui/react-avatar"

import { cn } from "@/lib/utils"

const Avatar = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Root
    ref={ref}
    className={cn(
      "relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full",
      className
    )}
    {...props}
  />
))
Avatar.displayName = AvatarPrimitive.Root.displayName

const AvatarImage = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Image>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Image>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Image
    ref={ref}
    className={cn("aspect-square h-full w-full", className)}
    {...props}
  />
))
AvatarImage.displayName = AvatarPrimitive.Image.displayName

const AvatarFallback = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Fallback>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Fallback
    ref={ref}
    className={cn(
      "flex h-full w-full items-center justify-center rounded-full bg-muted",
      className
    )}
    {...props}
  />
))
AvatarFallback.displayName = AvatarPrimitive.Fallback.displayName

export { Avatar, AvatarImage, AvatarFallback }


// FILE: src/components/ui/badge.tsx
import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
        outline: "text-foreground",
        success:
          "border-transparent bg-success text-success-foreground hover:bg-success/80",
        warning:
          "border-transparent bg-warning text-warning-foreground hover:bg-warning/80",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }


// FILE: src/components/ui/button.tsx
import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-90 disabled:bg-amber-500 disabled:text-amber-900 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }


// FILE: src/components/ui/calendar.tsx
"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { DayPicker } from "react-day-picker"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"

export type CalendarProps = React.ComponentProps<typeof DayPicker>

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
        month: "space-y-4",
        caption: "flex justify-center pt-1 relative items-center",
        caption_label: "text-sm font-medium",
        nav: "space-x-1 flex items-center",
        nav_button: cn(
          buttonVariants({ variant: "outline" }),
          "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100"
        ),
        nav_button_previous: "absolute left-1",
        nav_button_next: "absolute right-1",
        table: "w-full border-collapse space-y-1",
        head_row: "flex",
        head_cell:
          "text-muted-foreground rounded-md w-9 font-normal text-[0.8rem]",
        row: "flex w-full mt-2",
        cell: "h-9 w-9 text-center text-sm p-0 relative [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-accent/50 [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
        day: cn(
          buttonVariants({ variant: "ghost" }),
          "h-9 w-9 p-0 font-normal aria-selected:opacity-100"
        ),
        day_range_end: "day-range-end",
        day_selected:
          "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
        day_today: "bg-accent text-accent-foreground",
        day_outside:
          "day-outside text-muted-foreground aria-selected:bg-accent/50 aria-selected:text-muted-foreground",
        day_disabled: "text-muted-foreground opacity-50",
        day_range_middle:
          "aria-selected:bg-accent aria-selected:text-accent-foreground",
        day_hidden: "invisible",
        ...classNames,
      }}
      components={{
        IconLeft: ({ className, ...props }) => (
          <ChevronLeft className={cn("h-4 w-4", className)} {...props} />
        ),
        IconRight: ({ className, ...props }) => (
          <ChevronRight className={cn("h-4 w-4", className)} {...props} />
        ),
      }}
      {...props}
    />
  )
}
Calendar.displayName = "Calendar"

export { Calendar }


// FILE: src/components/ui/card.tsx
import * as React from "react"

import { cn } from "@/lib/utils"

const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "rounded-lg border bg-card text-card-foreground shadow-sm",
      className
    )}
    {...props}
  />
))
Card.displayName = "Card"

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 p-6", className)}
    {...props}
  />
))
CardHeader.displayName = "CardHeader"

const CardTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      "text-2xl font-semibold leading-none tracking-tight",
      className
    )}
    {...props}
  />
))
CardTitle.displayName = "CardTitle"

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
CardDescription.displayName = "CardDescription"

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
))
CardContent.displayName = "CardContent"

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-6 pt-0", className)}
    {...props}
  />
))
CardFooter.displayName = "CardFooter"

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }


// FILE: src/components/ui/carousel.tsx
"use client"

import * as React from "react"
import useEmblaCarousel, {
  type UseEmblaCarouselType,
} from "embla-carousel-react"
import { ArrowLeft, ArrowRight } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

type CarouselApi = UseEmblaCarouselType[1]
type UseCarouselParameters = Parameters<typeof useEmblaCarousel>
type CarouselOptions = UseCarouselParameters[0]
type CarouselPlugin = UseCarouselParameters[1]

type CarouselProps = {
  opts?: CarouselOptions
  plugins?: CarouselPlugin
  orientation?: "horizontal" | "vertical"
  setApi?: (api: CarouselApi) => void
}

type CarouselContextProps = {
  carouselRef: ReturnType<typeof useEmblaCarousel>[0]
  api: ReturnType<typeof useEmblaCarousel>[1]
  scrollPrev: () => void
  scrollNext: () => void
  canScrollPrev: boolean
  canScrollNext: boolean
} & CarouselProps

const CarouselContext = React.createContext<CarouselContextProps | null>(null)

function useCarousel() {
  const context = React.useContext(CarouselContext)

  if (!context) {
    throw new Error("useCarousel must be used within a <Carousel />")
  }

  return context
}

const Carousel = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & CarouselProps
>(
  (
    {
      orientation = "horizontal",
      opts,
      setApi,
      plugins,
      className,
      children,
      ...props
    },
    ref
  ) => {
    const [carouselRef, api] = useEmblaCarousel(
      {
        ...opts,
        axis: orientation === "horizontal" ? "x" : "y",
      },
      plugins
    )
    const [canScrollPrev, setCanScrollPrev] = React.useState(false)
    const [canScrollNext, setCanScrollNext] = React.useState(false)

    const onSelect = React.useCallback((api: CarouselApi) => {
      if (!api) {
        return
      }

      setCanScrollPrev(api.canScrollPrev())
      setCanScrollNext(api.canScrollNext())
    }, [])

    const scrollPrev = React.useCallback(() => {
      api?.scrollPrev()
    }, [api])

    const scrollNext = React.useCallback(() => {
      api?.scrollNext()
    }, [api])

    const handleKeyDown = React.useCallback(
      (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.key === "ArrowLeft") {
          event.preventDefault()
          scrollPrev()
        } else if (event.key === "ArrowRight") {
          event.preventDefault()
          scrollNext()
        }
      },
      [scrollPrev, scrollNext]
    )

    React.useEffect(() => {
      if (!api || !setApi) {
        return
      }

      setApi(api)
    }, [api, setApi])

    React.useEffect(() => {
      if (!api) {
        return
      }

      onSelect(api)
      api.on("reInit", onSelect)
      api.on("select", onSelect)

      return () => {
        api?.off("select", onSelect)
      }
    }, [api, onSelect])

    return (
      <CarouselContext.Provider
        value={{
          carouselRef,
          api: api,
          opts,
          orientation:
            orientation || (opts?.axis === "y" ? "vertical" : "horizontal"),
          scrollPrev,
          scrollNext,
          canScrollPrev,
          canScrollNext,
        }}
      >
        <div
          ref={ref}
          onKeyDownCapture={handleKeyDown}
          className={cn("relative", className)}
          role="region"
          aria-roledescription="carousel"
          {...props}
        >
          {children}
        </div>
      </CarouselContext.Provider>
    )
  }
)
Carousel.displayName = "Carousel"

const CarouselContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
  const { carouselRef, orientation } = useCarousel()

  return (
    <div ref={carouselRef} className="overflow-hidden">
      <div
        ref={ref}
        className={cn(
          "flex",
          orientation === "horizontal" ? "-ml-4" : "-mt-4 flex-col",
          className
        )}
        {...props}
      />
    </div>
  )
})
CarouselContent.displayName = "CarouselContent"

const CarouselItem = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
  const { orientation } = useCarousel()

  return (
    <div
      ref={ref}
      role="group"
      aria-roledescription="slide"
      className={cn(
        "min-w-0 shrink-0 grow-0 basis-full",
        orientation === "horizontal" ? "pl-4" : "pt-4",
        className
      )}
      {...props}
    />
  )
})
CarouselItem.displayName = "CarouselItem"

const CarouselPrevious = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<typeof Button>
>(({ className, variant = "outline", size = "icon", ...props }, ref) => {
  const { orientation, scrollPrev, canScrollPrev } = useCarousel()

  return (
    <Button
      ref={ref}
      variant={variant}
      size={size}
      className={cn(
        "absolute  h-8 w-8 rounded-full",
        orientation === "horizontal"
          ? "-left-12 top-1/2 -translate-y-1/2"
          : "-top-12 left-1/2 -translate-x-1/2 rotate-90",
        className
      )}
      disabled={!canScrollPrev}
      onClick={scrollPrev}
      {...props}
    >
      <ArrowLeft className="h-4 w-4" />
      <span className="sr-only">Previous slide</span>
    </Button>
  )
})
CarouselPrevious.displayName = "CarouselPrevious"

const CarouselNext = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<typeof Button>
>(({ className, variant = "outline", size = "icon", ...props }, ref) => {
  const { orientation, scrollNext, canScrollNext } = useCarousel()

  return (
    <Button
      ref={ref}
      variant={variant}
      size={size}
      className={cn(
        "absolute h-8 w-8 rounded-full",
        orientation === "horizontal"
          ? "-right-12 top-1/2 -translate-y-1/2"
          : "-bottom-12 left-1/2 -translate-x-1/2 rotate-90",
        className
      )}
      disabled={!canScrollNext}
      onClick={scrollNext}
      {...props}
    >
      <ArrowRight className="h-4 w-4" />
      <span className="sr-only">Next slide</span>
    </Button>
  )
})
CarouselNext.displayName = "CarouselNext"

export {
  type CarouselApi,
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
}


// FILE: src/components/ui/chart.tsx
"use client"

import * as React from "react"
import * as RechartsPrimitive from "recharts"

import { cn } from "@/lib/utils"

// Format: { THEME_NAME: CSS_SELECTOR }
const THEMES = { light: "", dark: ".dark" } as const

export type ChartConfig = {
  [k in string]: {
    label?: React.ReactNode
    icon?: React.ComponentType
  } & (
    | { color?: string; theme?: never }
    | { color?: never; theme: Record<keyof typeof THEMES, string> }
  )
}

type ChartContextProps = {
  config: ChartConfig
}

const ChartContext = React.createContext<ChartContextProps | null>(null)

function useChart() {
  const context = React.useContext(ChartContext)

  if (!context) {
    throw new Error("useChart must be used within a <ChartContainer />")
  }

  return context
}

const ChartContainer = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div"> & {
    config: ChartConfig
    children: React.ComponentProps<
      typeof RechartsPrimitive.ResponsiveContainer
    >["children"]
  }
>(({ id, className, children, config, ...props }, ref) => {
  const uniqueId = React.useId()
  const chartId = \`chart-\${id || uniqueId.replace(/:/g, "")}\`

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        data-chart={chartId}
        ref={ref}
        className={cn(
          "flex aspect-video justify-center text-xs [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-border/50 [&_.recharts-curve.recharts-tooltip-cursor]:stroke-border [&_.recharts-dot[stroke='#fff']]:stroke-transparent [&_.recharts-layer]:outline-none [&_.recharts-polar-grid_[stroke='#ccc']]:stroke-border [&_.recharts-radial-bar-background-sector]:fill-muted [&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted [&_.recharts-reference-line_[stroke='#ccc']]:stroke-border [&_.recharts-sector[stroke='#fff']]:stroke-transparent [&_.recharts-sector]:outline-none [&_.recharts-surface]:outline-none",
          className
        )}
        {...props}
      >
        <ChartStyle id={chartId} config={config} />
        <RechartsPrimitive.ResponsiveContainer>
          {children}
        </RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  )
})
ChartContainer.displayName = "Chart"

const ChartStyle = ({ id, config }: { id: string; config: ChartConfig }) => {
  const colorConfig = Object.entries(config).filter(
    ([, config]) => config.theme || config.color
  )

  if (!colorConfig.length) {
    return null
  }

  return (
    <style
      dangerouslySetInnerHTML={{
        __html: Object.entries(THEMES)
          .map(
            ([theme, prefix]) => \`
\${prefix} [data-chart=\${id}] {
\${colorConfig
  .map(([key, itemConfig]) => {
    const color =
      itemConfig.theme?.[theme as keyof typeof itemConfig.theme] ||
      itemConfig.color
    return color ? \`  --color-\${key}: \${color};\` : null
  })
  .join("\\n")}
}
\`
          )
          .join("\\n"),
      }}
    />
  )
}

const ChartTooltip = RechartsPrimitive.Tooltip

const ChartTooltipContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<typeof RechartsPrimitive.Tooltip> &
    React.ComponentProps<"div"> & {
      hideLabel?: boolean
      hideIndicator?: boolean
      indicator?: "line" | "dot" | "dashed"
      nameKey?: string
      labelKey?: string
    }
>(
  (
    {
      active,
      payload,
      className,
      indicator = "dot",
      hideLabel = false,
      hideIndicator = false,
      label,
      labelFormatter,
      labelClassName,
      formatter,
      color,
      nameKey,
      labelKey,
    },
    ref
  ) => {
    const { config } = useChart()

    const tooltipLabel = React.useMemo(() => {
      if (hideLabel || !payload?.length) {
        return null
      }

      const [item] = payload
      const key = \`\${labelKey || item.dataKey || item.name || "value"}\`
      const itemConfig = getPayloadConfigFromPayload(config, item, key)
      const value =
        !labelKey && typeof label === "string"
          ? config[label as keyof typeof config]?.label || label
          : itemConfig?.label

      if (labelFormatter) {
        return (
          <div className={cn("font-medium", labelClassName)}>
            {labelFormatter(value, payload)}
          </div>
        )
      }

      if (!value) {
        return null
      }

      return <div className={cn("font-medium", labelClassName)}>{value}</div>
    }, [
      label,
      labelFormatter,
      payload,
      hideLabel,
      labelClassName,
      config,
      labelKey,
    ])

    if (!active || !payload?.length) {
      return null
    }

    const nestLabel = payload.length === 1 && indicator !== "dot"

    return (
      <div
        ref={ref}
        className={cn(
          "grid min-w-[8rem] items-start gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl",
          className
        )}
      >
        {!nestLabel ? tooltipLabel : null}
        <div className="grid gap-1.5">
          {payload.map((item, index) => {
            const key = \`\${nameKey || item.name || item.dataKey || "value"}\`
            const itemConfig = getPayloadConfigFromPayload(config, item, key)
            const indicatorColor = color || item.payload.fill || item.color

            return (
              <div
                key={item.dataKey}
                className={cn(
                  "flex w-full flex-wrap items-stretch gap-2 [&>svg]:h-2.5 [&>svg]:w-2.5 [&>svg]:text-muted-foreground",
                  indicator === "dot" && "items-center"
                )}
              >
                {formatter && item?.value !== undefined && item.name ? (
                  formatter(item.value, item.name, item, index, item.payload)
                ) : (
                  <>
                    {itemConfig?.icon ? (
                      <itemConfig.icon />
                    ) : (
                      !hideIndicator && (
                        <div
                          className={cn(
                            "shrink-0 rounded-[2px] border-[--color-border] bg-[--color-bg]",
                            {
                              "h-2.5 w-2.5": indicator === "dot",
                              "w-1": indicator === "line",
                              "w-0 border-[1.5px] border-dashed bg-transparent":
                                indicator === "dashed",
                              "my-0.5": nestLabel && indicator === "dashed",
                            }
                          )}
                          style={
                            {
                              "--color-bg": indicatorColor,
                              "--color-border": indicatorColor,
                            } as React.CSSProperties
                          }
                        />
                      )
                    )}
                    <div
                      className={cn(
                        "flex flex-1 justify-between leading-none",
                        nestLabel ? "items-end" : "items-center"
                      )}
                    >
                      <div className="grid gap-1.5">
                        {nestLabel ? tooltipLabel : null}
                        <span className="text-muted-foreground">
                          {itemConfig?.label || item.name}
                        </span>
                      </div>
                      {item.value && (
                        <span className="font-mono font-medium tabular-nums text-foreground">
                          {item.value.toLocaleString()}
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }
)
ChartTooltipContent.displayName = "ChartTooltip"

const ChartLegend = RechartsPrimitive.Legend

const ChartLegendContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div"> &
    Pick<RechartsPrimitive.LegendProps, "payload" | "verticalAlign"> & {
      hideIcon?: boolean
      nameKey?: string
    }
>(
  (
    { className, hideIcon = false, payload, verticalAlign = "bottom", nameKey },
    ref
  ) => {
    const { config } = useChart()

    if (!payload?.length) {
      return null
    }

    return (
      <div
        ref={ref}
        className={cn(
          "flex items-center justify-center gap-4",
          verticalAlign === "top" ? "pb-3" : "pt-3",
          className
        )}
      >
        {payload.map((item) => {
          const key = \`\${nameKey || item.dataKey || "value"}\`
          const itemConfig = getPayloadConfigFromPayload(config, item, key)

          return (
            <div
              key={item.value}
              className={cn(
                "flex items-center gap-1.5 [&>svg]:h-3 [&>svg]:w-3 [&>svg]:text-muted-foreground"
              )}
            >
              {itemConfig?.icon && !hideIcon ? (
                <itemConfig.icon />
              ) : (
                <div
                  className="h-2 w-2 shrink-0 rounded-[2px]"
                  style={{
                    backgroundColor: item.color,
                  }}
                />
              )}
              {itemConfig?.label}
            </div>
          )
        })}
      </div>
    )
  }
)
ChartLegendContent.displayName = "ChartLegend"

// Helper to extract item config from a payload.
function getPayloadConfigFromPayload(
  config: ChartConfig,
  payload: unknown,
  key: string
) {
  if (typeof payload !== "object" || payload === null) {
    return undefined
  }

  const payloadPayload =
    "payload" in payload &&
    typeof payload.payload === "object" &&
    payload.payload !== null
      ? payload.payload
      : undefined

  let configLabelKey: string = key

  if (
    key in payload &&
    typeof payload[key as keyof typeof payload] === "string"
  ) {
    configLabelKey = payload[key as keyof typeof payload] as string
  } else if (
    payloadPayload &&
    key in payloadPayload &&
    typeof payloadPayload[key as keyof typeof payloadPayload] === "string"
  ) {
    configLabelKey = payloadPayload[
      key as keyof typeof payloadPayload
    ] as string
  }

  return configLabelKey in config
    ? config[configLabelKey]
    : config[key as keyof typeof config]
}

export {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  ChartStyle,
}


// FILE: src/components/ui/checkbox.tsx
"use client"

import * as React from "react"
import * as CheckboxPrimitive from "@radix-ui/react-checkbox"
import { Check } from "lucide-react"

import { cn } from "@/lib/utils"

const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      "peer h-4 w-4 shrink-0 rounded-sm border border-primary ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground",
      className
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator
      className={cn("flex items-center justify-center text-current")}
    >
      <Check className="h-4 w-4" />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
))
Checkbox.displayName = CheckboxPrimitive.Root.displayName

export { Checkbox }


// FILE: src/components/ui/collapsible.tsx
"use client"

import * as CollapsiblePrimitive from "@radix-ui/react-collapsible"

const Collapsible = CollapsiblePrimitive.Root

const CollapsibleTrigger = CollapsiblePrimitive.CollapsibleTrigger

const CollapsibleContent = CollapsiblePrimitive.CollapsibleContent

export { Collapsible, CollapsibleTrigger, CollapsibleContent }


// FILE: src/components/ui/dialog.tsx
"use client"

import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"

const Dialog = DialogPrimitive.Root

const DialogTrigger = DialogPrimitive.Trigger

const DialogPortal = DialogPrimitive.Portal

const DialogClose = DialogPrimitive.Close

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg",
        className
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
))
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-1.5 text-center sm:text-left",
      className
    )}
    {...props}
  />
)
DialogHeader.displayName = "DialogHeader"

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      className
    )}
    {...props}
  />
)
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "text-lg font-semibold leading-none tracking-tight",
      className
    )}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}


// FILE: src/components/ui/dropdown-menu.tsx
"use client"

import * as React from "react"
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu"
import { Check, ChevronRight, Circle } from "lucide-react"

import { cn } from "@/lib/utils"

const DropdownMenu = DropdownMenuPrimitive.Root

const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger

const DropdownMenuGroup = DropdownMenuPrimitive.Group

const DropdownMenuPortal = DropdownMenuPrimitive.Portal

const DropdownMenuSub = DropdownMenuPrimitive.Sub

const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup

const DropdownMenuSubTrigger = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.SubTrigger>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubTrigger> & {
    inset?: boolean
  }
>(({ className, inset, children, ...props }, ref) => (
  <DropdownMenuPrimitive.SubTrigger
    ref={ref}
    className={cn(
      "flex cursor-default gap-2 select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none focus:bg-accent data-[state=open]:bg-accent [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
      inset && "pl-8",
      className
    )}
    {...props}
  >
    {children}
    <ChevronRight className="ml-auto" />
  </DropdownMenuPrimitive.SubTrigger>
))
DropdownMenuSubTrigger.displayName =
  DropdownMenuPrimitive.SubTrigger.displayName

const DropdownMenuSubContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.SubContent>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubContent>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.SubContent
    ref={ref}
    className={cn(
      "z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
      className
    )}
    {...props}
  />
))
DropdownMenuSubContent.displayName =
  DropdownMenuPrimitive.SubContent.displayName

const DropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
        className
      )}
      {...props}
    />
  </DropdownMenuPrimitive.Portal>
))
DropdownMenuContent.displayName = DropdownMenuPrimitive.Content.displayName

const DropdownMenuItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & {
    inset?: boolean
  }
>(({ className, inset, ...props }, ref) => (
  <DropdownMenuPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
      inset && "pl-8",
      className
    )}
    {...props}
  />
))
DropdownMenuItem.displayName = DropdownMenuPrimitive.Item.displayName

const DropdownMenuCheckboxItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.CheckboxItem>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.CheckboxItem>
>(({ className, children, checked, ...props }, ref) => (
  <DropdownMenuPrimitive.CheckboxItem
    ref={ref}
    className={cn(
      "relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      className
    )}
    checked={checked}
    {...props}
  >
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <DropdownMenuPrimitive.ItemIndicator>
        <Check className="h-4 w-4" />
      </DropdownMenuPrimitive.ItemIndicator>
    </span>
    {children}
  </DropdownMenuPrimitive.CheckboxItem>
))
DropdownMenuCheckboxItem.displayName =
  DropdownMenuPrimitive.CheckboxItem.displayName

const DropdownMenuRadioItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.RadioItem>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.RadioItem>
>(({ className, children, ...props }, ref) => (
  <DropdownMenuPrimitive.RadioItem
    ref={ref}
    className={cn(
      "relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      className
    )}
    {...props}
  >
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <DropdownMenuPrimitive.ItemIndicator>
        <Circle className="h-2 w-2 fill-current" />
      </DropdownMenuPrimitive.ItemIndicator>
    </span>
    {children}
  </DropdownMenuPrimitive.RadioItem>
))
DropdownMenuRadioItem.displayName = DropdownMenuPrimitive.RadioItem.displayName

const DropdownMenuLabel = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label> & {
    inset?: boolean
  }
>(({ className, inset, ...props }, ref) => (
  <DropdownMenuPrimitive.Label
    ref={ref}
    className={cn(
      "px-2 py-1.5 text-sm font-semibold",
      inset && "pl-8",
      className
    )}
    {...props}
  />
))
DropdownMenuLabel.displayName = DropdownMenuPrimitive.Label.displayName

const DropdownMenuSeparator = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Separator
    ref={ref}
    className={cn("-mx-1 my-1 h-px bg-muted", className)}
    {...props}
  />
))
DropdownMenuSeparator.displayName = DropdownMenuPrimitive.Separator.displayName

const DropdownMenuShortcut = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) => {
  return (
    <span
      className={cn("ml-auto text-xs tracking-widest opacity-60", className)}
      {...props}
    />
  )
}
DropdownMenuShortcut.displayName = "DropdownMenuShortcut"

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuGroup,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuRadioGroup,
}


// FILE: src/components/ui/form.tsx
"use client"

import * as React from "react"
import * as LabelPrimitive from "@radix-ui/react-label"
import { Slot } from "@radix-ui/react-slot"
import {
  Controller,
  FormProvider,
  useFormContext,
  type ControllerProps,
  type FieldPath,
  type FieldValues,
} from "react-hook-form"

import { cn } from "@/lib/utils"
import { Label } from "@/components/ui/label"

const Form = FormProvider

type FormFieldContextValue<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>
> = {
  name: TName
}

const FormFieldContext = React.createContext<FormFieldContextValue>(
  {} as FormFieldContextValue
)

const FormField = <
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>
>({
  ...props
}: ControllerProps<TFieldValues, TName>) => {
  return (
    <FormFieldContext.Provider value={{ name: props.name }}>
      <Controller {...props} />
    </FormFieldContext.Provider>
  )
}

const useFormField = () => {
  const fieldContext = React.useContext(FormFieldContext)
  const itemContext = React.useContext(FormItemContext)
  const { getFieldState, formState } = useFormContext()

  const fieldState = getFieldState(fieldContext.name, formState)

  if (!fieldContext) {
    throw new Error("useFormField should be used within <FormField>")
  }

  const { id } = itemContext

  return {
    id,
    name: fieldContext.name,
    formItemId: \`\${id}-form-item\`,
    formDescriptionId: \`\${id}-form-item-description\`,
    formMessageId: \`\${id}-form-item-message\`,
    ...fieldState,
  }
}

type FormItemContextValue = {
  id: string
}

const FormItemContext = React.createContext<FormItemContextValue>(
  {} as FormItemContextValue
)

const FormItem = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
  const id = React.useId()

  return (
    <FormItemContext.Provider value={{ id }}>
      <div ref={ref} className={cn("space-y-2", className)} {...props} />
    </FormItemContext.Provider>
  )
})
FormItem.displayName = "FormItem"

const FormLabel = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...props }, ref) => {
  const { error, formItemId } = useFormField()

  return (
    <Label
      ref={ref}
      className={cn(error && "text-destructive", className)}
      htmlFor={formItemId}
      {...props}
    />
  )
})
FormLabel.displayName = "FormLabel"

const FormControl = React.forwardRef<
  React.ElementRef<typeof Slot>,
  React.ComponentPropsWithoutRef<typeof Slot>
>(({ ...props }, ref) => {
  const { error, formItemId, formDescriptionId, formMessageId } = useFormField()

  return (
    <Slot
      ref={ref}
      id={formItemId}
      aria-describedby={
        !error
          ? \`\${formDescriptionId}\`
          : \`\${formDescriptionId} \${formMessageId}\`
      }
      aria-invalid={!!error}
      {...props}
    />
  )
})
FormControl.displayName = "FormControl"

const FormDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => {
  const { formDescriptionId } = useFormField()

  return (
    <p
      ref={ref}
      id={formDescriptionId}
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
})
FormDescription.displayName = "FormDescription"

const FormMessage = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, children, ...props }, ref) => {
  const { error, formMessageId } = useFormField()
  const body = error ? String(error?.message ?? "") : children

  if (!body) {
    return null
  }

  return (
    <p
      ref={ref}
      id={formMessageId}
      className={cn("text-sm font-medium text-destructive", className)}
      {...props}
    >
      {body}
    </p>
  )
})
FormMessage.displayName = "FormMessage"

export {
  useFormField,
  Form,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
  FormField,
}


// FILE: src/components/ui/input.tsx
import * as React from "react"

import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }


// FILE: src/components/ui/label.tsx
"use client"

import * as React from "react"
import * as LabelPrimitive from "@radix-ui/react-label"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const labelVariants = cva(
  "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
)

const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> &
    VariantProps<typeof labelVariants>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn(labelVariants(), className)}
    {...props}
  />
))
Label.displayName = LabelPrimitive.Root.displayName

export { Label }


// FILE: src/components/ui/menubar.tsx
"use client"

import * as React from "react"
import * as MenubarPrimitive from "@radix-ui/react-menubar"
import { Check, ChevronRight, Circle } from "lucide-react"

import { cn } from "@/lib/utils"

function MenubarMenu({
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.Menu>) {
  return <MenubarPrimitive.Menu {...props} />
}

function MenubarGroup({
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.Group>) {
  return <MenubarPrimitive.Group {...props} />
}

function MenubarPortal({
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.Portal>) {
  return <MenubarPrimitive.Portal {...props} />
}

function MenubarRadioGroup({
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.RadioGroup>) {
  return <MenubarPrimitive.RadioGroup {...props} />
}

function MenubarSub({
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.Sub>) {
  return <MenubarPrimitive.Sub data-slot="menubar-sub" {...props} />
}

const Menubar = React.forwardRef<
  React.ElementRef<typeof MenubarPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof MenubarPrimitive.Root>
>(({ className, ...props }, ref) => (
  <MenubarPrimitive.Root
    ref={ref}
    className={cn(
      "flex h-10 items-center space-x-1 rounded-md border bg-background p-1",
      className
    )}
    {...props}
  />
))
Menubar.displayName = MenubarPrimitive.Root.displayName

const MenubarTrigger = React.forwardRef<
  React.ElementRef<typeof MenubarPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof MenubarPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <MenubarPrimitive.Trigger
    ref={ref}
    className={cn(
      "flex cursor-default select-none items-center rounded-sm px-3 py-1.5 text-sm font-medium outline-none focus:bg-accent focus:text-accent-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground",
      className
    )}
    {...props}
  />
))
MenubarTrigger.displayName = MenubarPrimitive.Trigger.displayName

const MenubarSubTrigger = React.forwardRef<
  React.ElementRef<typeof MenubarPrimitive.SubTrigger>,
  React.ComponentPropsWithoutRef<typeof MenubarPrimitive.SubTrigger> & {
    inset?: boolean
  }
>(({ className, inset, children, ...props }, ref) => (
  <MenubarPrimitive.SubTrigger
    ref={ref}
    className={cn(
      "flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground",
      inset && "pl-8",
      className
    )}
    {...props}
  >
    {children}
    <ChevronRight className="ml-auto h-4 w-4" />
  </MenubarPrimitive.SubTrigger>
))
MenubarSubTrigger.displayName = MenubarPrimitive.SubTrigger.displayName

const MenubarSubContent = React.forwardRef<
  React.ElementRef<typeof MenubarPrimitive.SubContent>,
  React.ComponentPropsWithoutRef<typeof MenubarPrimitive.SubContent>
>(({ className, ...props }, ref) => (
  <MenubarPrimitive.SubContent
    ref={ref}
    className={cn(
      "z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
      className
    )}
    {...props}
  />
))
MenubarSubContent.displayName = MenubarPrimitive.SubContent.displayName

const MenubarContent = React.forwardRef<
  React.ElementRef<typeof MenubarPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof MenubarPrimitive.Content>
>(
  (
    { className, align = "start", alignOffset = -4, sideOffset = 8, ...props },
    ref
  ) => (
    <MenubarPrimitive.Portal>
      <MenubarPrimitive.Content
        ref={ref}
        align={align}
        alignOffset={alignOffset}
        sideOffset={sideOffset}
        className={cn(
          "z-50 min-w-[12rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
          className
        )}
        {...props}
      />
    </MenubarPrimitive.Portal>
  )
)
MenubarContent.displayName = MenubarPrimitive.Content.displayName

const MenubarItem = React.forwardRef<
  React.ElementRef<typeof MenubarPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof MenubarPrimitive.Item> & {
    inset?: boolean
  }
>(({ className, inset, ...props }, ref) => (
  <MenubarPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      inset && "pl-8",
      className
    )}
    {...props}
  />
))
MenubarItem.displayName = MenubarPrimitive.Item.displayName

const MenubarCheckboxItem = React.forwardRef<
  React.ElementRef<typeof MenubarPrimitive.CheckboxItem>,
  React.ComponentPropsWithoutRef<typeof MenubarPrimitive.CheckboxItem>
>(({ className, children, checked, ...props }, ref) => (
  <MenubarPrimitive.CheckboxItem
    ref={ref}
    className={cn(
      "relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      className
    )}
    checked={checked}
    {...props}
  >
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <MenubarPrimitive.ItemIndicator>
        <Check className="h-4 w-4" />
      </MenubarPrimitive.ItemIndicator>
    </span>
    {children}
  </MenubarPrimitive.CheckboxItem>
))
MenubarCheckboxItem.displayName = MenubarPrimitive.CheckboxItem.displayName

const MenubarRadioItem = React.forwardRef<
  React.ElementRef<typeof MenubarPrimitive.RadioItem>,
  React.ComponentPropsWithoutRef<typeof MenubarPrimitive.RadioItem>
>(({ className, children, ...props }, ref) => (
  <MenubarPrimitive.RadioItem
    ref={ref}
    className={cn(
      "relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      className
    )}
    {...props}
  >
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <MenubarPrimitive.ItemIndicator>
        <Circle className="h-2 w-2 fill-current" />
      </MenubarPrimitive.ItemIndicator>
    </span>
    {children}
  </MenubarPrimitive.RadioItem>
))
MenubarRadioItem.displayName = MenubarPrimitive.RadioItem.displayName

const MenubarLabel = React.forwardRef<
  React.ElementRef<typeof MenubarPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof MenubarPrimitive.Label> & {
    inset?: boolean
  }
>(({ className, inset, ...props }, ref) => (
  <MenubarPrimitive.Label
    ref={ref}
    className={cn(
      "px-2 py-1.5 text-sm font-semibold",
      inset && "pl-8",
      className
    )}
    {...props}
  />
))
MenubarLabel.displayName = MenubarPrimitive.Label.displayName

const MenubarSeparator = React.forwardRef<
  React.ElementRef<typeof MenubarPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof MenubarPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <MenubarPrimitive.Separator
    ref={ref}
    className={cn("-mx-1 my-1 h-px bg-muted", className)}
    {...props}
  />
))
MenubarSeparator.displayName = MenubarPrimitive.Separator.displayName

const MenubarShortcut = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) => {
  return (
    <span
      className={cn(
        "ml-auto text-xs tracking-widest text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}
MenubarShortcut.displayname = "MenubarShortcut"

export {
  Menubar,
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarSeparator,
  MenubarLabel,
  MenubarCheckboxItem,
  MenubarRadioGroup,
  MenubarRadioItem,
  MenubarPortal,
  MenubarSubContent,
  MenubarSubTrigger,
  MenubarGroup,
  MenubarSub,
  MenubarShortcut,
}


// FILE: src/components/ui/popover.tsx
"use client"

import * as React from "react"
import * as PopoverPrimitive from "@radix-ui/react-popover"

import { cn } from "@/lib/utils"

const Popover = PopoverPrimitive.Root

const PopoverTrigger = PopoverPrimitive.Trigger

const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, align = "center", sideOffset = 4, ...props }, ref) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      className={cn(
        "z-50 w-72 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
        className
      )}
      {...props}
    />
  </PopoverPrimitive.Portal>
))
PopoverContent.displayName = PopoverPrimitive.Content.displayName

export { Popover, PopoverTrigger, PopoverContent }


// FILE: src/components/ui/progress.tsx
"use client"

import * as React from "react"
import * as ProgressPrimitive from "@radix-ui/react-progress"

import { cn } from "@/lib/utils"

const Progress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root>
>(({ className, value, ...props }, ref) => (
  <ProgressPrimitive.Root
    ref={ref}
    className={cn(
      "relative h-2 w-full overflow-hidden rounded-full bg-secondary",
      className
    )}
    {...props}
  >
    <ProgressPrimitive.Indicator
      className="h-full w-full flex-1 bg-primary transition-all"
      style={{ transform: \`translateX(-\${100 - (value || 0)}%)\` }}
    />
  </ProgressPrimitive.Root>
))
Progress.displayName = ProgressPrimitive.Root.displayName

export { Progress }


// FILE: src/components/ui/radio-group.tsx
"use client"

import * as React from "react"
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group"
import { Circle } from "lucide-react"

import { cn } from "@/lib/utils"

const RadioGroup = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Root>
>(({ className, ...props }, ref) => {
  return (
    <RadioGroupPrimitive.Root
      className={cn("grid gap-2", className)}
      {...props}
      ref={ref}
    />
  )
})
RadioGroup.displayName = RadioGroupPrimitive.Root.displayName

const RadioGroupItem = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item>
>(({ className, ...props }, ref) => {
  return (
    <RadioGroupPrimitive.Item
      ref={ref}
      className={cn(
        "aspect-square h-4 w-4 rounded-full border border-primary text-primary ring-offset-background focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator className="flex items-center justify-center">
        <Circle className="h-2.5 w-2.5 fill-current text-current" />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  )
})
RadioGroupItem.displayName = RadioGroupPrimitive.Item.displayName

export { RadioGroup, RadioGroupItem }


// FILE: src/components/ui/scroll-area.tsx
"use client"

import * as React from "react"
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area"

import { cn } from "@/lib/utils"

const ScrollArea = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root>
>(({ className, children, ...props }, ref) => (
  <ScrollAreaPrimitive.Root
    ref={ref}
    className={cn("relative overflow-hidden", className)}
    {...props}
  >
    <ScrollAreaPrimitive.Viewport className="h-full w-full rounded-[inherit]">
      {children}
    </ScrollAreaPrimitive.Viewport>
    <ScrollBar />
    <ScrollAreaPrimitive.Corner />
  </ScrollAreaPrimitive.Root>
))
ScrollArea.displayName = ScrollAreaPrimitive.Root.displayName

const ScrollBar = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>
>(({ className, orientation = "vertical", ...props }, ref) => (
  <ScrollAreaPrimitive.ScrollAreaScrollbar
    ref={ref}
    orientation={orientation}
    className={cn(
      "flex touch-none select-none transition-colors",
      orientation === "vertical" &&
        "h-full w-2.5 border-l border-l-transparent p-[1px]",
      orientation === "horizontal" &&
        "h-2.5 flex-col border-t border-t-transparent p-[1px]",
      className
    )}
    {...props}
  >
    <ScrollAreaPrimitive.ScrollAreaThumb className="relative flex-1 rounded-full bg-border" />
  </ScrollAreaPrimitive.ScrollAreaScrollbar>
))
ScrollBar.displayName = ScrollAreaPrimitive.ScrollAreaScrollbar.displayName

export { ScrollArea, ScrollBar }


// FILE: src/components/ui/select.tsx
"use client"

import * as React from "react"
import * as SelectPrimitive from "@radix-ui/react-select"
import { Check, ChevronDown, ChevronUp } from "lucide-react"

import { cn } from "@/lib/utils"

const Select = SelectPrimitive.Root

const SelectGroup = SelectPrimitive.Group

const SelectValue = SelectPrimitive.Value

const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn(
      "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1",
      className
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <ChevronDown className="h-4 w-4 opacity-50" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
))
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName

const SelectScrollUpButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollUpButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollUpButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollUpButton
    ref={ref}
    className={cn(
      "flex cursor-default items-center justify-center py-1",
      className
    )}
    {...props}
  >
    <ChevronUp className="h-4 w-4" />
  </SelectPrimitive.ScrollUpButton>
))
SelectScrollUpButton.displayName = SelectPrimitive.ScrollUpButton.displayName

const SelectScrollDownButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollDownButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollDownButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollDownButton
    ref={ref}
    className={cn(
      "flex cursor-default items-center justify-center py-1",
      className
    )}
    {...props}
  >
    <ChevronDown className="h-4 w-4" />
  </SelectPrimitive.ScrollDownButton>
))
SelectScrollDownButton.displayName =
  SelectPrimitive.ScrollDownButton.displayName

const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = "popper", ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      className={cn(
        "relative z-50 max-h-96 min-w-[8rem] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
        position === "popper" &&
          "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1",
        className
      )}
      position={position}
      {...props}
    >
      <SelectScrollUpButton />
      <SelectPrimitive.Viewport
        className={cn(
          "p-1",
          position === "popper" &&
            "h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]"
        )}
      >
        {children}
      </SelectPrimitive.Viewport>
      <SelectScrollDownButton />
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
))
SelectContent.displayName = SelectPrimitive.Content.displayName

const SelectLabel = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Label
    ref={ref}
    className={cn("py-1.5 pl-8 pr-2 text-sm font-semibold", className)}
    {...props}
  />
))
SelectLabel.displayName = SelectPrimitive.Label.displayName

const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      className
    )}
    {...props}
  >
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <Check className="h-4 w-4" />
      </SelectPrimitive.ItemIndicator>
    </span>

    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
))
SelectItem.displayName = SelectPrimitive.Item.displayName

const SelectSeparator = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Separator
    ref={ref}
    className={cn("-mx-1 my-1 h-px bg-muted", className)}
    {...props}
  />
))
SelectSeparator.displayName = SelectPrimitive.Separator.displayName

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
}


// FILE: src/components/ui/separator.tsx
"use client"

import * as React from "react"
import * as SeparatorPrimitive from "@radix-ui/react-separator"

import { cn } from "@/lib/utils"

const Separator = React.forwardRef<
  React.ElementRef<typeof SeparatorPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SeparatorPrimitive.Root>
>(
  (
    { className, orientation = "horizontal", decorative = true, ...props },
    ref
  ) => (
    <SeparatorPrimitive.Root
      ref={ref}
      decorative={decorative}
      orientation={orientation}
      className={cn(
        "shrink-0 bg-border",
        orientation === "horizontal" ? "h-[1px] w-full" : "h-full w-[1px]",
        className
      )}
      {...props}
    />
  )
)
Separator.displayName = SeparatorPrimitive.Root.displayName

export { Separator }


// FILE: src/components/ui/sheet.tsx
"use client"

import * as React from "react"
import * as SheetPrimitive from "@radix-ui/react-dialog"
import { cva, type VariantProps } from "class-variance-authority"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"

const Sheet = SheetPrimitive.Root

const SheetTrigger = SheetPrimitive.Trigger

const SheetClose = SheetPrimitive.Close

const SheetPortal = SheetPrimitive.Portal

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Overlay
    className={cn(
      "fixed inset-0 z-50 bg-black/80  data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
    ref={ref}
  />
))
SheetOverlay.displayName = SheetPrimitive.Overlay.displayName

const sheetVariants = cva(
  "fixed z-50 gap-4 bg-background p-6 shadow-lg transition ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-300 data-[state=open]:duration-500",
  {
    variants: {
      side: {
        top: "inset-x-0 top-0 border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top",
        bottom:
          "inset-x-0 bottom-0 border-t data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
        left: "inset-y-0 left-0 h-full w-3/4 border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-sm",
        right:
          "inset-y-0 right-0 h-full w-3/4  border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-sm",
      },
    },
    defaultVariants: {
      side: "right",
    },
  }
)

interface SheetContentProps
  extends React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content>,
    VariantProps<typeof sheetVariants> {}

const SheetContent = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Content>,
  SheetContentProps
>(({ side = "right", className, children, ...props }, ref) => (
  <SheetPortal>
    <SheetOverlay />
    <SheetPrimitive.Content
      ref={ref}
      className={cn(sheetVariants({ side }), className)}
      {...props}
    >
      {children}
      <SheetPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-secondary">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </SheetPrimitive.Close>
    </SheetPrimitive.Content>
  </SheetPortal>
))
SheetContent.displayName = SheetPrimitive.Content.displayName

const SheetHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-2 text-center sm:text-left",
      className
    )}
    {...props}
  />
)
SheetHeader.displayName = "SheetHeader"

const SheetFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      className
    )}
    {...props}
  />
)
SheetFooter.displayName = "SheetFooter"

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Title>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold text-foreground", className)}
    {...props}
  />
))
SheetTitle.displayName = SheetPrimitive.Title.displayName

const SheetDescription = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Description>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
SheetDescription.displayName = SheetPrimitive.Description.displayName

export {
  Sheet,
  SheetPortal,
  SheetOverlay,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}


// FILE: src/components/ui/sidebar.tsx
"use client"

import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { VariantProps, cva } from "class-variance-authority"
import { PanelLeft } from "lucide-react"

import { useIsMobile } from "@/hooks/use-mobile"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

const SIDEBAR_COOKIE_NAME = "sidebar_state"
const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7
const SIDEBAR_WIDTH = "16rem"
const SIDEBAR_WIDTH_MOBILE = "18rem"
const SIDEBAR_WIDTH_ICON = "3rem"
const SIDEBAR_KEYBOARD_SHORTCUT = "b"

type SidebarContext = {
  state: "expanded" | "collapsed"
  open: boolean
  setOpen: (open: boolean) => void
  openMobile: boolean
  setOpenMobile: (open: boolean) => void
  isMobile: boolean
  toggleSidebar: () => void
}

const SidebarContext = React.createContext<SidebarContext | null>(null)

function useSidebar() {
  const context = React.useContext(SidebarContext)
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider.")
  }

  return context
}

const SidebarProvider = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div"> & {
    defaultOpen?: boolean
    open?: boolean
    onOpenChange?: (open: boolean) => void
  }
>(
  (
    {
      defaultOpen = true,
      open: openProp,
      onOpenChange: setOpenProp,
      className,
      style,
      children,
      ...props
    },
    ref
  ) => {
    const isMobile = useIsMobile()
    const [openMobile, setOpenMobile] = React.useState(false)

    // This is the internal state of the sidebar.
    // We use openProp and setOpenProp for control from outside the component.
    const [_open, _setOpen] = React.useState(defaultOpen)
    const open = openProp ?? _open
    const setOpen = React.useCallback(
      (value: boolean | ((value: boolean) => boolean)) => {
        const openState = typeof value === "function" ? value(open) : value
        if (setOpenProp) {
          setOpenProp(openState)
        } else {
          _setOpen(openState)
        }

        // This sets the cookie to keep the sidebar state.
        document.cookie = \`\${SIDEBAR_COOKIE_NAME}=\${openState}; path=/; max-age=\${SIDEBAR_COOKIE_MAX_AGE}\`
      },
      [setOpenProp, open]
    )

    // Helper to toggle the sidebar.
    const toggleSidebar = React.useCallback(() => {
      return isMobile
        ? setOpenMobile((open) => !open)
        : setOpen((open) => !open)
    }, [isMobile, setOpen, setOpenMobile])

    // Adds a keyboard shortcut to toggle the sidebar.
    React.useEffect(() => {
      const handleKeyDown = (event: KeyboardEvent) => {
        if (
          event.key === SIDEBAR_KEYBOARD_SHORTCUT &&
          (event.metaKey || event.ctrlKey)
        ) {
          event.preventDefault()
          toggleSidebar()
        }
      }

      window.addEventListener("keydown", handleKeyDown)
      return () => window.removeEventListener("keydown", handleKeyDown)
    }, [toggleSidebar])

    // We add a state so that we can do data-state="expanded" or "collapsed".
    // This makes it easier to style the sidebar with Tailwind classes.
    const state = open ? "expanded" : "collapsed"

    const contextValue = React.useMemo<SidebarContext>(
      () => ({
        state,
        open,
        setOpen,
        isMobile,
        openMobile,
        setOpenMobile,
        toggleSidebar,
      }),
      [state, open, setOpen, isMobile, openMobile, setOpenMobile, toggleSidebar]
    )

    return (
      <SidebarContext.Provider value={contextValue}>
        <TooltipProvider delayDuration={0}>
          <div
            style={
              {
                "--sidebar-width": SIDEBAR_WIDTH,
                "--sidebar-width-icon": SIDEBAR_WIDTH_ICON,
                ...style,
              } as React.CSSProperties
            }
            className={cn(
              "group/sidebar-wrapper flex min-h-svh w-full has-[[data-variant=inset]]:bg-sidebar",
              className
            )}
            ref={ref}
            {...props}
          >
            {children}
          </div>
        </TooltipProvider>
      </SidebarContext.Provider>
    )
  }
)
SidebarProvider.displayName = "SidebarProvider"

const Sidebar = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div"> & {
    side?: "left" | "right"
    variant?: "sidebar" | "floating" | "inset"
    collapsible?: "offcanvas" | "icon" | "none"
  }
>(
  (
    {
      side = "left",
      variant = "sidebar",
      collapsible = "offcanvas",
      className,
      children,
      ...props
    },
    ref
  ) => {
    const { isMobile, state, openMobile, setOpenMobile } = useSidebar()

    if (collapsible === "none") {
      return (
        <div
          className={cn(
            "flex h-full w-[--sidebar-width] flex-col bg-sidebar text-sidebar-foreground",
            className
          )}
          ref={ref}
          {...props}
        >
          {children}
        </div>
      )
    }

    if (isMobile) {
      return (
        <Sheet open={openMobile} onOpenChange={setOpenMobile} {...props}>
          <SheetContent
            data-sidebar="sidebar"
            data-mobile="true"
            className="w-[--sidebar-width] bg-sidebar p-0 text-sidebar-foreground [&>button]:hidden"
            style={
              {
                "--sidebar-width": SIDEBAR_WIDTH_MOBILE,
              } as React.CSSProperties
            }
            side={side}
          >
            <SheetTitle className="sr-only">Menu</SheetTitle>
            <div className="flex h-full w-full flex-col">{children}</div>
          </SheetContent>
        </Sheet>
      )
    }

    return (
      <div
        ref={ref}
        className="group peer hidden md:block text-sidebar-foreground"
        data-state={state}
        data-collapsible={state === "collapsed" ? collapsible : ""}
        data-variant={variant}
        data-side={side}
      >
        {/* This is what handles the sidebar gap on desktop */}
        <div
          className={cn(
            "duration-200 relative h-svh w-[--sidebar-width] bg-transparent transition-[width] ease-linear",
            "group-data-[collapsible=offcanvas]:w-0",
            "group-data-[side=right]:rotate-180",
            variant === "floating" || variant === "inset"
              ? "group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)_+_theme(spacing.4))]"
              : "group-data-[collapsible=icon]:w-[--sidebar-width-icon]"
          )}
        />
        <div
          className={cn(
            "duration-200 fixed inset-y-0 z-10 hidden h-svh w-[--sidebar-width] transition-[left,right,width] ease-linear md:flex",
            side === "left"
              ? "left-0 group-data-[collapsible=offcanvas]:left-[calc(var(--sidebar-width)*-1)]"
              : "right-0 group-data-[collapsible=offcanvas]:right-[calc(var(--sidebar-width)*-1)]",
            // Adjust the padding for floating and inset variants.
            variant === "floating" || variant === "inset"
              ? "p-2 group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)_+_theme(spacing.4)_+2px)]"
              : "group-data-[collapsible=icon]:w-[--sidebar-width-icon] group-data-[side=left]:border-r group-data-[side=right]:border-l",
            className
          )}
          {...props}
        >
          <div
            data-sidebar="sidebar"
            className="flex h-full w-full flex-col bg-sidebar group-data-[variant=floating]:rounded-lg group-data-[variant=floating]:border group-data-[variant=floating]:border-sidebar-border group-data-[variant=floating]:shadow"
          >
            {children}
          </div>
        </div>
      </div>
    )
  }
)
Sidebar.displayName = "Sidebar"

const SidebarTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<typeof Button>
>(({ className, onClick, ...props }, ref) => {
  const { toggleSidebar } = useSidebar()

  return (
    <Button
      ref={ref}
      data-sidebar="trigger"
      variant="ghost"
      size="icon"
      className={cn("h-7 w-7", className)}
      onClick={(event) => {
        onClick?.(event)
        toggleSidebar()
      }}
      {...props}
    >
      <PanelLeft />
      <span className="sr-only">Toggle Sidebar</span>
    </Button>
  )
})
SidebarTrigger.displayName = "SidebarTrigger"

const SidebarRail = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<"button">
>(({ className, ...props }, ref) => {
  const { toggleSidebar } = useSidebar()

  return (
    <button
      ref={ref}
      data-sidebar="rail"
      aria-label="Toggle Sidebar"
      tabIndex={-1}
      onClick={toggleSidebar}
      title="Toggle Sidebar"
      className={cn(
        "absolute inset-y-0 z-20 hidden w-4 -translate-x-1/2 transition-all ease-linear after:absolute after:inset-y-0 after:left-1/2 after:w-[2px] hover:after:bg-sidebar-border group-data-[side=left]:-right-4 group-data-[side=right]:left-0 sm:flex",
        "[[data-side=left]_&]:cursor-w-resize [[data-side=right]_&]:cursor-e-resize",
        "[[data-side=left][data-state=collapsed]_&]:cursor-e-resize [[data-side=right][data-state=collapsed]_&]:cursor-w-resize",
        "group-data-[collapsible=offcanvas]:translate-x-0 group-data-[collapsible=offcanvas]:after:left-full group-data-[collapsible=offcanvas]:hover:bg-sidebar",
        "[[data-side=left][data-collapsible=offcanvas]_&]:-right-2",
        "[[data-side=right][data-collapsible=offcanvas]_&]:-left-2",
        className
      )}
      {...props}
    />
  )
})
SidebarRail.displayName = "SidebarRail"

const SidebarInset = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"main">
>(({ className, ...props }, ref) => {
  return (
    <main
      ref={ref}
      className={cn(
        "relative flex min-h-svh flex-1 flex-col bg-background",
        "peer-data-[variant=inset]:min-h-[calc(100svh-theme(spacing.4))] md:peer-data-[variant=inset]:m-2 md:peer-data-[state=collapsed]:peer-data-[variant=inset]:ml-2 md:peer-data-[variant=inset]:ml-0 md:peer-data-[variant=inset]:rounded-xl md:peer-data-[variant=inset]:shadow",
        className
      )}
      {...props}
    />
  )
})
SidebarInset.displayName = "SidebarInset"

const SidebarInput = React.forwardRef<
  React.ElementRef<typeof Input>,
  React.ComponentProps<typeof Input>
>(({ className, ...props }, ref) => {
  return (
    <Input
      ref={ref}
      data-sidebar="input"
      className={cn(
        "h-8 w-full bg-background shadow-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
        className
      )}
      {...props}
    />
  )
})
SidebarInput.displayName = "SidebarInput"

const SidebarHeader = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div">
>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      data-sidebar="header"
      className={cn("flex flex-col gap-2 p-2", className)}
      {...props}
    />
  )
})
SidebarHeader.displayName = "SidebarHeader"

const SidebarFooter = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div">
>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      data-sidebar="footer"
      className={cn("flex flex-col gap-2 p-2", className)}
      {...props}
    />
  )
})
SidebarFooter.displayName = "SidebarFooter"

const SidebarSeparator = React.forwardRef<
  React.ElementRef<typeof Separator>,
  React.ComponentProps<typeof Separator>
>(({ className, ...props }, ref) => {
  return (
    <Separator
      ref={ref}
      data-sidebar="separator"
      className={cn("mx-2 w-auto bg-sidebar-border", className)}
      {...props}
    />
  )
})
SidebarSeparator.displayName = "SidebarSeparator"

const SidebarContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div">
>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      data-sidebar="content"
      className={cn(
        "flex min-h-0 flex-1 flex-col gap-2 overflow-auto group-data-[collapsible=icon]:overflow-hidden",
        className
      )}
      {...props}
    />
  )
})
SidebarContent.displayName = "SidebarContent"

const SidebarGroup = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div">
>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      data-sidebar="group"
      className={cn("relative flex w-full min-w-0 flex-col p-2", className)}
      {...props}
    />
  )
})
SidebarGroup.displayName = "SidebarGroup"

const SidebarGroupLabel = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div"> & { asChild?: boolean }
>(({ className, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "div"

  return (
    <Comp
      ref={ref}
      data-sidebar="group-label"
      className={cn(
        "duration-200 flex h-8 shrink-0 items-center rounded-md px-2 text-xs font-medium text-sidebar-foreground/70 outline-none ring-sidebar-ring transition-[margin,opa] ease-linear focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0",
        "group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0",
        className
      )}
      {...props}
    />
  )
})
SidebarGroupLabel.displayName = "SidebarGroupLabel"

const SidebarGroupAction = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<"button"> & { asChild?: boolean }
>(({ className, asChild = false, showOnHover = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      ref={ref}
      data-sidebar="group-action"
      className={cn(
        "absolute right-1 top-1.5 flex aspect-square w-5 items-center justify-center rounded-md p-0 text-sidebar-foreground outline-none ring-sidebar-ring transition-transform hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 peer-hover/menu-button:text-sidebar-accent-foreground peer-data-[active=true]/menu-button:text-sidebar-accent-foreground [&>svg]:size-4 [&>svg]:shrink-0",
        // Increases the hit area of the button on mobile.
        "after:absolute after:-inset-2 after:md:hidden",
        "peer-data-[size=sm]/menu-button:top-1",
        "peer-data-[size=default]/menu-button:top-1.5",
        "peer-data-[size=lg]/menu-button:top-2.5",
        "group-data-[collapsible=icon]:hidden",
        showOnHover &&
          "group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100 data-[state=open]:opacity-100 peer-data-[active=true]/menu-button:text-sidebar-accent-foreground md:opacity-0",
        className
      )}
      {...props}
    />
  )
})
SidebarGroupAction.displayName = "SidebarGroupAction"

const SidebarGroupContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div">
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-sidebar="group-content"
    className={cn("w-full text-sm", className)}
    {...props}
  />
))
SidebarGroupContent.displayName = "SidebarGroupContent"

const SidebarMenu = React.forwardRef<
  HTMLUListElement,
  React.ComponentProps<"ul">
>(({ className, ...props }, ref) => (
  <ul
    ref={ref}
    data-sidebar="menu"
    className={cn("flex w-full min-w-0 flex-col gap-1", className)}
    {...props}
  />
))
SidebarMenu.displayName = "SidebarMenu"

const SidebarMenuItem = React.forwardRef<
  HTMLLIElement,
  React.ComponentProps<"li">
>(({ className, ...props }, ref) => (
  <li
    ref={ref}
    data-sidebar="menu-item"
    className={cn("group/menu-item relative", className)}
    {...props}
  />
))
SidebarMenuItem.displayName = "SidebarMenuItem"

const sidebarMenuButtonVariants = cva(
  "peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm outline-none ring-sidebar-ring transition-[width,height,padding] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 group-has-[[data-sidebar=menu-action]]/menu-item:pr-8 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground data-[state=open]:hover:bg-sidebar-accent data-[state=open]:hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:!size-8 group-data-[collapsible=icon]:!p-2 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        outline:
          "bg-background shadow-[0_0_0_1px_hsl(var(--sidebar-border))] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:shadow-[0_0_0_1px_hsl(var(--sidebar-accent))]",
      },
      size: {
        default: "h-8 text-sm",
        sm: "h-7 text-xs",
        lg: "h-12 text-sm group-data-[collapsible=icon]:!p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

const SidebarMenuButton = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<"button"> & {
    asChild?: boolean
    isActive?: boolean
    tooltip?: string | React.ComponentProps<typeof TooltipContent>
  } & VariantProps<typeof sidebarMenuButtonVariants>
>(
  (
    {
      asChild = false,
      isActive = false,
      variant = "default",
      size = "default",
      tooltip,
      className,
      ...props
    },
    ref
  ) => {
    const Comp = asChild ? Slot : "button"
    const { isMobile, state } = useSidebar()

    const button = (
      <Comp
        ref={ref}
        data-sidebar="menu-button"
        data-size={size}
        data-active={isActive}
        className={cn(sidebarMenuButtonVariants({ variant, size }), className)}
        {...props}
      />
    )

    if (!tooltip) {
      return button
    }

    if (typeof tooltip === "string") {
      tooltip = {
        children: tooltip,
      }
    }

    return (
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent
          side="right"
          align="center"
          hidden={state !== "collapsed" || isMobile}
          {...tooltip}
        />
      </Tooltip>
    )
  }
)
SidebarMenuButton.displayName = "SidebarMenuButton"

const SidebarMenuAction = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<"button"> & {
    asChild?: boolean
    showOnHover?: boolean
  }
>(({ className, asChild = false, showOnHover = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      ref={ref}
      data-sidebar="menu-action"
      className={cn(
        "absolute right-1 top-1.5 flex aspect-square w-5 items-center justify-center rounded-md p-0 text-sidebar-foreground outline-none ring-sidebar-ring transition-transform hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 peer-hover/menu-button:text-sidebar-accent-foreground peer-data-[active=true]/menu-button:text-sidebar-accent-foreground [&>svg]:size-4 [&>svg]:shrink-0",
        // Increases the hit area of the button on mobile.
        "after:absolute after:-inset-2 after:md:hidden",
        "peer-data-[size=sm]/menu-button:top-1",
        "peer-data-[size=default]/menu-button:top-1.5",
        "peer-data-[size=lg]/menu-button:top-2.5",
        "group-data-[collapsible=icon]:hidden",
        showOnHover &&
          "group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100 data-[state=open]:opacity-100 peer-data-[active=true]/menu-button:text-sidebar-accent-foreground md:opacity-0",
        className
      )}
      {...props}
    />
  )
})
SidebarMenuAction.displayName = "SidebarMenuAction"

const SidebarMenuBadge = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div">
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-sidebar="menu-badge"
    className={cn(
      "absolute right-1 flex h-5 min-w-5 items-center justify-center rounded-md px-1 text-xs font-medium tabular-nums text-sidebar-foreground select-none pointer-events-none",
      "peer-hover/menu-button:text-sidebar-accent-foreground peer-data-[active=true]/menu-button:text-sidebar-accent-foreground",
      "peer-data-[size=sm]/menu-button:top-1",
      "peer-data-[size=default]/menu-button:top-1.5",
      "peer-data-[size=lg]/menu-button:top-2.5",
      "group-data-[collapsible=icon]:hidden",
      className
    )}
    {...props}
  />
))
SidebarMenuBadge.displayName = "SidebarMenuBadge"

const SidebarMenuSkeleton = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div"> & {
    showIcon?: boolean
  }
>(({ className, showIcon = false, ...props }, ref) => {
  // Random width between 50 to 90%.
  const width = React.useMemo(() => {
    return \`\${Math.floor(Math.random() * 40) + 50}%\`
  }, [])

  return (
    <div
      ref={ref}
      data-sidebar="menu-skeleton"
      className={cn("rounded-md h-8 flex gap-2 px-2 items-center", className)}
      {...props}
    >
      {showIcon && (
        <Skeleton
          className="size-4 rounded-md"
          data-sidebar="menu-skeleton-icon"
        />
      )}
      <Skeleton
        className="h-4 flex-1 max-w-[--skeleton-width]"
        data-sidebar="menu-skeleton-text"
        style={
          {
            "--skeleton-width": width,
          } as React.CSSProperties
        }
      />
    </div>
  )
})
SidebarMenuSkeleton.displayName = "SidebarMenuSkeleton"

const SidebarMenuSub = React.forwardRef<
  HTMLUListElement,
  React.ComponentProps<"ul">
>(({ className, ...props }, ref) => (
  <ul
    ref={ref}
    data-sidebar="menu-sub"
    className={cn(
      "mx-3.5 flex min-w-0 translate-x-px flex-col gap-1 border-l border-sidebar-border px-2.5 py-0.5",
      "group-data-[collapsible=icon]:hidden",
      className
    )}
    {...props}
  />
))
SidebarMenuSub.displayName = "SidebarMenuSub"

const SidebarMenuSubItem = React.forwardRef<
  HTMLLIElement,
  React.ComponentProps<"li">
>(({ ...props }, ref) => <li ref={ref} {...props} />)
SidebarMenuSubItem.displayName = "SidebarMenuSubItem"

const SidebarMenuSubButton = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<"button"> & {
    asChild?: boolean
    size?: "sm" | "md"
    isActive?: boolean
  }
>(({ asChild = false, size = "md", isActive, className, ...props }, ref) => {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      ref={ref}
      data-sidebar="menu-sub-button"
      data-size={size}
      data-active={isActive}
      className={cn(
        "flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 text-sidebar-foreground outline-none ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-sidebar-accent-foreground",
        "data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground",
        size === "sm" && "text-xs",
        size === "md" && "text-sm",
        "group-data-[collapsible=icon]:hidden",
        className
      )}
      {...props}
    />
  )
})
SidebarMenuSubButton.displayName = "SidebarMenuSubButton"

export {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
}


// FILE: src/components/ui/skeleton.tsx
import { cn } from "@/lib/utils"

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  )
}

export { Skeleton }


// FILE: src/components/ui/slider.tsx
"use client"

import * as React from "react"
import * as SliderPrimitive from "@radix-ui/react-slider"

import { cn } from "@/lib/utils"

const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    className={cn(
      "relative flex w-full touch-none select-none items-center",
      className
    )}
    {...props}
  >
    <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-secondary">
      <SliderPrimitive.Range className="absolute h-full bg-primary" />
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb className="block h-5 w-5 rounded-full border-2 border-primary bg-background ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50" />
  </SliderPrimitive.Root>
))
Slider.displayName = SliderPrimitive.Root.displayName

export { Slider }


// FILE: src/components/ui/switch.tsx
"use client"

import * as React from "react"
import * as SwitchPrimitives from "@radix-ui/react-switch"

import { cn } from "@/lib/utils"

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input",
      className
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        "pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0"
      )}
    />
  </SwitchPrimitives.Root>
))
Switch.displayName = SwitchPrimitives.Root.displayName

export { Switch }


// FILE: src/components/ui/table.tsx
import * as React from "react"

import { cn } from "@/lib/utils"

const Table = React.forwardRef<
  HTMLTableElement,
  React.HTMLAttributes<HTMLTableElement>
>(({ className, ...props }, ref) => (
  <div className="relative w-full overflow-auto">
    <table
      ref={ref}
      className={cn("w-full caption-bottom text-sm", className)}
      {...props}
    />
  </div>
))
Table.displayName = "Table"

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead ref={ref} className={cn("[&_tr]:border-b", className)} {...props} />
))
TableHeader.displayName = "TableHeader"

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    className={cn("[&_tr:last-child]:border-0", className)}
    {...props}
  />
))
TableBody.displayName = "TableBody"

const TableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn(
      "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
      className
    )}
    {...props}
  />
))
TableFooter.displayName = "TableFooter"

const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(({ className, ...props }, ref) => (
  <tr
    ref={ref}
    className={cn(
      "border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted",
      className
    )}
    {...props}
  />
))
TableRow.displayName = "TableRow"

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      "h-12 px-4 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0",
      className
    )}
    {...props}
  />
))
TableHead.displayName = "TableHead"

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td
    ref={ref}
    className={cn("p-4 align-middle [&:has([role=checkbox])]:pr-0", className)}
    {...props}
  />
))
TableCell.displayName = "TableCell"

const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption
    ref={ref}
    className={cn("mt-4 text-sm text-muted-foreground", className)}
    {...props}
  />
))
TableCaption.displayName = "TableCaption"

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}


// FILE: src/components/ui/tabs.tsx
"use client"

import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"

import { cn } from "@/lib/utils"

const Tabs = TabsPrimitive.Root

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "inline-flex h-auto flex-wrap items-center justify-center rounded-md bg-muted p-1 text-muted-foreground",
      className
    )}
    {...props}
  />
))
TabsList.displayName = TabsPrimitive.List.displayName

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm",
      className
    )}
    {...props}
  />
))
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className
    )}
    {...props}
  />
))
TabsContent.displayName = TabsPrimitive.Content.displayName

export { Tabs, TabsList, TabsTrigger, TabsContent }


// FILE: src/components/ui/textarea.tsx
import * as React from 'react';

import {cn} from '@/lib/utils';

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<'textarea'>>(
  ({className, ...props}, ref) => {
    return (
      <textarea
        className={cn(
          'flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Textarea.displayName = 'Textarea';

export {Textarea};


// FILE: src/components/ui/toast.tsx
"use client"

import * as React from "react"
import * as ToastPrimitives from "@radix-ui/react-toast"
import { cva, type VariantProps } from "class-variance-authority"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"

const ToastProvider = ToastPrimitives.Provider

const ToastViewport = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Viewport>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Viewport>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Viewport
    ref={ref}
    className={cn(
      "fixed top-0 z-[100] flex max-h-screen w-full flex-col-reverse p-4 sm:bottom-0 sm:right-0 sm:top-auto sm:flex-col md:max-w-[420px]",
      className
    )}
    {...props}
  />
))
ToastViewport.displayName = ToastPrimitives.Viewport.displayName

const toastVariants = cva(
  "group pointer-events-auto relative flex w-full items-center justify-between space-x-4 overflow-hidden rounded-md border p-6 pr-8 shadow-lg transition-all data-[swipe=cancel]:translate-x-0 data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)] data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=move]:transition-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[swipe=end]:animate-out data-[state=closed]:fade-out-80 data-[state=closed]:slide-out-to-right-full data-[state=open]:slide-in-from-top-full data-[state=open]:sm:slide-in-from-bottom-full",
  {
    variants: {
      variant: {
        default: "border bg-background text-foreground",
        destructive:
          "destructive group border-destructive bg-destructive text-destructive-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

const Toast = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Root> &
    VariantProps<typeof toastVariants>
>(({ className, variant, ...props }, ref) => {
  return (
    <ToastPrimitives.Root
      ref={ref}
      className={cn(toastVariants({ variant }), className)}
      {...props}
    />
  )
})
Toast.displayName = ToastPrimitives.Root.displayName

const ToastAction = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Action>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Action>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Action
    ref={ref}
    className={cn(
      "inline-flex h-8 shrink-0 items-center justify-center rounded-md border bg-transparent px-3 text-sm font-medium ring-offset-background transition-colors hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 group-[.destructive]:border-muted/40 group-[.destructive]:hover:border-destructive/30 group-[.destructive]:hover:bg-destructive group-[.destructive]:hover:text-destructive-foreground group-[.destructive]:focus:ring-destructive",
      className
    )}
    {...props}
  />
))
ToastAction.displayName = ToastPrimitives.Action.displayName

const ToastClose = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Close>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Close>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Close
    ref={ref}
    className={cn(
      "absolute right-2 top-2 rounded-md p-1 text-foreground/50 opacity-0 transition-opacity hover:text-foreground focus:opacity-100 focus:outline-none focus:ring-2 group-hover:opacity-100 group-[.destructive]:text-red-300 group-[.destructive]:hover:text-red-50 group-[.destructive]:focus:ring-red-400 group-[.destructive]:focus:ring-offset-red-600",
      className
    )}
    toast-close=""
    {...props}
  >
    <X className="h-4 w-4" />
  </ToastPrimitives.Close>
))
ToastClose.displayName = ToastPrimitives.Close.displayName

const ToastTitle = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Title>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Title>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Title
    ref={ref}
    className={cn("text-sm font-semibold", className)}
    {...props}
  />
))
ToastTitle.displayName = ToastPrimitives.Title.displayName

const ToastDescription = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Description>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Description>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Description
    ref={ref}
    className={cn("text-sm opacity-90", className)}
    {...props}
  />
))
ToastDescription.displayName = ToastPrimitives.Description.displayName

type ToastProps = React.ComponentPropsWithoutRef<typeof Toast>

type ToastActionElement = React.ReactElement<typeof ToastAction>

export {
  type ToastProps,
  type ToastActionElement,
  ToastProvider,
  ToastViewport,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastClose,
  ToastAction,
}


// FILE: src/components/ui/tooltip.tsx
"use client"

import * as React from "react"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"

import { cn } from "@/lib/utils"

const TooltipProvider = TooltipPrimitive.Provider

const Tooltip = TooltipPrimitive.Root

const TooltipTrigger = TooltipPrimitive.Trigger

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Content
    ref={ref}
    sideOffset={sideOffset}
    className={cn(
      "z-50 overflow-hidden rounded-md border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
      className
    )}
    {...props}
  />
))
TooltipContent.displayName = TooltipPrimitive.Content.displayName

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }


// FILE: src/hooks/use-mobile.tsx
import * as React from "react"

const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(\`(max-width: \${MOBILE_BREAKPOINT - 1}px)\`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener("change", onChange)
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return !!isMobile
}


// FILE: src/hooks/use-toast.ts
"use client"

// Inspired by react-hot-toast library
import * as React from "react"

import type {
  ToastActionElement,
  ToastProps,
} from "@/components/ui/toast"

const TOAST_LIMIT = 1
const TOAST_REMOVE_DELAY = 1000000

type ToasterToast = ToastProps & {
  id: string
  title?: React.ReactNode
  description?: React.ReactNode
  action?: ToastActionElement
}

const actionTypes = {
  ADD_TOAST: "ADD_TOAST",
  UPDATE_TOAST: "UPDATE_TOAST",
  DISMISS_TOAST: "DISMISS_TOAST",
  REMOVE_TOAST: "REMOVE_TOAST",
} as const

let count = 0

function genId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER
  return count.toString()
}

type ActionType = typeof actionTypes

type Action =
  | {
      type: ActionType["ADD_TOAST"]
      toast: ToasterToast
    }
  | {
      type: ActionType["UPDATE_TOAST"]
      toast: Partial<ToasterToast>
    }
  | {
      type: ActionType["DISMISS_TOAST"]
      toastId?: ToasterToast["id"]
    }
  | {
      type: ActionType["REMOVE_TOAST"]
      toastId?: ToasterToast["id"]
    }

interface State {
  toasts: ToasterToast[]
}

const toastTimeouts = new Map<string, ReturnType<typeof setTimeout>>()

const addToRemoveQueue = (toastId: string) => {
  if (toastTimeouts.has(toastId)) {
    return
  }

  const timeout = setTimeout(() => {
    toastTimeouts.delete(toastId)
    dispatch({
      type: "REMOVE_TOAST",
      toastId: toastId,
    })
  }, TOAST_REMOVE_DELAY)

  toastTimeouts.set(toastId, timeout)
}

export const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case "ADD_TOAST":
      return {
        ...state,
        toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT),
      }

    case "UPDATE_TOAST":
      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === action.toast.id ? { ...t, ...action.toast } : t
        ),
      }

    case "DISMISS_TOAST": {
      const { toastId } = action

      // ! Side effects ! - This could be extracted into a dismissToast() action,
      // but I'll keep it here for simplicity
      if (toastId) {
        addToRemoveQueue(toastId)
      } else {
        state.toasts.forEach((toast) => {
          addToRemoveQueue(toast.id)
        })
      }

      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === toastId || toastId === undefined
            ? {
                ...t,
                open: false,
              }
            : t
        ),
      }
    }
    case "REMOVE_TOAST":
      if (action.toastId === undefined) {
        return {
          ...state,
          toasts: [],
        }
      }
      return {
        ...state,
        toasts: state.toasts.filter((t) => t.id !== action.toastId),
      }
  }
}

const listeners: Array<(state: State) => void> = []

let memoryState: State = { toasts: [] }

function dispatch(action: Action) {
  memoryState = reducer(memoryState, action)
  listeners.forEach((listener) => {
    listener(memoryState)
  })
}

type Toast = Omit<ToasterToast, "id">

function toast({ ...props }: Toast) {
  const id = genId()

  const update = (props: ToasterToast) =>
    dispatch({
      type: "UPDATE_TOAST",
      toast: { ...props, id },
    })
  const dismiss = () => dispatch({ type: "DISMISS_TOAST", toastId: id })

  dispatch({
    type: "ADD_TOAST",
    toast: {
      ...props,
      id,
      open: true,
      onOpenChange: (open) => {
        if (!open) dismiss()
      },
    },
  })

  return {
    id: id,
    dismiss,
    update,
  }
}

function useToast() {
  const [state, setState] = React.useState<State>(memoryState)

  React.useEffect(() => {
    listeners.push(setState)
    return () => {
      const index = listeners.indexOf(setState)
      if (index > -1) {
        listeners.splice(index, 1)
      }
    }
  }, [state])

  return {
    ...state,
    toast,
    dismiss: (toastId?: string) => dispatch({ type: "DISMISS_TOAST", toastId }),
  }
}

export { useToast, toast }


// FILE: src/lib/firebase.ts
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyBxKTp_QYuxHWB18jirph5vhY6tWCWR_HI",
  authDomain: "condominio-prueba.firebaseapp.com",
  projectId: "condominio-prueba",
  storageBucket: "condominio-prueba.firebasestorage.app",
  messagingSenderId: "787293423330",
  appId: "1:787293423330:web:7e982a8ecc839f666840bb",
  measurementId: "G-D2YHG41VJJ"
};


// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);
const storage = getStorage(app);
const auth = getAuth(app);

export { app, db, storage, auth };


// FILE: src/lib/utils.ts
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}


// FILE: tailwind.config.ts
import type {Config} from 'tailwindcss';

export default {
  darkMode: ['class'],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        body: ['Inter', 'sans-serif'],
        headline: ['Inter', 'sans-serif'],
        code: ['monospace'],
      },
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        success: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning))',
          foreground: 'hsl(var(--warning-foreground))',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        chart: {
          '1': 'hsl(var(--chart-1))',
          '2': 'hsl(var(--chart-2))',
          '3': 'hsl(var(--chart-3))',
          '4': 'hsl(var(--chart-4))',
          '5': 'hsl(var(--chart-5))',
        },
        sidebar: {
          DEFAULT: 'hsl(var(--sidebar-background))',
          foreground: 'hsl(var(--sidebar-foreground))',
          primary: 'hsl(var(--sidebar-primary))',
          'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
          accent: 'hsl(var(--sidebar-accent))',
          'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
          border: 'hsl(var(--sidebar-border))',
          ring: 'hsl(var(--sidebar-ring))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'accordion-down': {
          from: {
            height: '0',
          },
          to: {
            height: 'var(--radix-accordion-content-height)',
          },
        },
        'accordion-up': {
          from: {
            height: 'var(--radix-accordion-content-height)',
          },
          to: {
            height: '0',
          },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
} satisfies Config;


// FILE: tsconfig.json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
`;
        navigator.clipboard.writeText(codeToCopy);
        toast({
            title: 'Código Copiado',
            description: 'El código fuente completo de la aplicación ha sido copiado a tu portapapeles.',
        });
    };


    return (
        <div className="space-y-8">
             <Card>
                <CardHeader>
                    <CardTitle>Reglas de Seguridad de Firestore</CardTitle>
                    <CardDescription>Copia y pega estas reglas en la sección "Rules" de tu base de datos en la consola de Firebase para aplicar los permisos correctos.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Textarea
                        readOnly
                        value={FIRESTORE_RULES}
                        className="h-64 font-mono text-xs bg-muted/50"
                    />
                </CardContent>
                <CardFooter>
                    <Button onClick={handleCopyRules}>
                        <Copy className="mr-2 h-4 w-4" />
                        Copiar Reglas
                    </Button>
                </CardFooter>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Exportar Código Fuente</CardTitle>
                    <CardDescription>Copia el código fuente completo de la aplicación en tu portapapeles.</CardDescription>
                </CardHeader>
                <CardContent>
                     <Textarea
                        readOnly
                        value={"// El código completo se copiará al pulsar el botón."}
                        className="h-24 font-mono text-xs bg-muted/50"
                    />
                </CardContent>
                <CardFooter>
                    <Button onClick={handleCopyFullCode}>
                        <Code className="mr-2 h-4 w-4" />
                        Copiar Código Completo
                    </Button>
                </CardFooter>
            </Card>
            
            <Card>
                <CardHeader>
                    <CardTitle>Crear Cuenta de Administrador</CardTitle>
                    <CardDescription>Crea la cuenta de administrador principal si no existe.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Button onClick={handleCreateAdmin}>Crear Administrador</Button>
                </CardContent>
            </Card>


            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <Card className="overflow-hidden shadow-lg">
                    <CardHeader className="bg-muted/50">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-primary/10 rounded-lg">
                            <RefreshCw className="h-8 w-8 text-primary" />
                            </div>
                            <div>
                                <CardTitle className="text-2xl font-bold text-primary">Backup y Restauración</CardTitle>
                                <CardDescription>Gestiona copias de seguridad de los datos de tu aplicación.</CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="p-6 space-y-4">
                        <Button 
                            onClick={handleCreateBackup} 
                            disabled={!!loadingAction} 
                            className="w-full h-14 text-lg bg-green-600 hover:bg-green-700 text-white font-bold"
                        >
                            {loadingAction === 'create' ? <Loader2 className="mr-2 h-5 w-5 animate-spin"/> : <Database className="mr-3 h-5 w-5"/>}
                            Crear Backup
                        </Button>

                        <Button 
                            onClick={() => document.getElementById('restore-input')?.click()} 
                            disabled={!!loadingAction} 
                            variant="secondary" 
                            className="w-full h-14 text-lg font-bold"
                        >
                            {loadingAction === 'restore' ? <Loader2 className="mr-2 h-5 w-5 animate-spin"/> : <FileUp className="mr-3 h-5 w-5"/>}
                            Restaurar desde Archivo
                        </Button>
                        <Input id="restore-input" type="file" accept=".json" onChange={handleFileSelect} className="hidden" />

                        <Button 
                            onClick={() => setIsClearConfirmOpen(true)} 
                            disabled={!!loadingAction} 
                            variant="destructive" 
                            className="w-full h-14 text-lg font-bold"
                        >
                            {loadingAction === 'clear' ? <Loader2 className="mr-2 h-5 w-5 animate-spin"/> : <Trash2 className="mr-3 h-5 w-5"/>}
                            Limpiar Datos
                        </Button>
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center text-lg"><Terminal className="mr-2 h-5 w-5"/>Consola de Mensajes</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="bg-gray-900 text-white font-mono text-xs rounded-md p-4 h-96 overflow-y-auto flex flex-col-reverse">
                            <div>
                                {logs.map((log, index) => (
                                    <p key={index} className={log.includes('ERROR') ? 'text-red-400' : 'text-green-400'}>
                                        {log}
                                    </p>
                                ))}
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Dialog open={isClearConfirmOpen} onOpenChange={setIsClearConfirmOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center"><AlertTriangle className="mr-2 h-6 w-6 text-destructive"/>¿Está seguro que desea limpiar los datos?</DialogTitle>
                        <DialogDescription>
                            Esta acción es irreversible y eliminará permanentemente todas las colecciones de la base de datos. Se recomienda crear un backup primero.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsClearConfirmOpen(false)}>Cancelar</Button>
                        <Button variant="destructive" onClick={handleClearData}>Sí, limpiar todos los datos</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            
            <Dialog open={isRestoreConfirmOpen} onOpenChange={setIsRestoreConfirmOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center"><AlertTriangle className="mr-2 h-6 w-6 text-destructive"/>¿Está seguro que desea restaurar?</DialogTitle>
                         <DialogDescription>
                            Esta acción borrará todos los datos actuales y los reemplazará con los del archivo <span className="font-bold">{fileToRestore?.name}</span>. Esta acción es irreversible.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => {setIsRestoreConfirmOpen(false); setFileToRestore(null);}}>Cancelar</Button>
                        <Button variant="destructive" onClick={confirmRestore}>Sí, restaurar desde backup</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

        </div>
    );
}
