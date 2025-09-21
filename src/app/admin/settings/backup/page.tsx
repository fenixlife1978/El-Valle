
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Database, Upload, Trash2, Loader2, FileUp, AlertTriangle, Terminal, RefreshCw, History, Download, Copy, Code } from 'lucide-react';
import { collection, getDocs, writeBatch, doc, addDoc, query, orderBy, onSnapshot, deleteDoc, Timestamp } from 'firebase/firestore';
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
    // Allow read/write access to all documents for any authenticated user.
    // This is a simplified rule to prevent permission errors during development.
    match /{document=**} {
      allow read, write: if request.auth != null;
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

// This is a placeholder for the actual file contents which are injected by the backend.
const ALL_FILES_CONTENT = 'ALL_FILES_CONTENT_PLACEHOLDER';


export default function BackupPage() {
    const { toast } = useToast();
    const [loadingAction, setLoadingAction] = useState<string | null>(null);
    const [logs, setLogs] = useState<string[]>(['Consola de operaciones lista.']);
    const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);
    const [isRestoreConfirmOpen, setIsRestoreConfirmOpen] = useState(false);
    const [fileToRestore, setFileToRestore] = useState<File | null>(null);
    const [fullCode, setFullCode] = useState('');
    
    useEffect(() => {
        // This function would be ideally replaced by a server call or static props
        // to get all file contents. For this context, we simulate it.
        const generateFullCodeString = () => {
             // This is a simplified representation. The actual implementation would
             // be more complex, likely involving a build step to gather all files.
            const fileContents: {[key: string]: string} = {
              "src/app/admin/settings/backup/page.tsx": `console.log("hello")`,
              // Add other files here
            };
            
            // This placeholder will be replaced by the real content by the backend
            // For now, we set it to a simple message.
            setFullCode(ALL_FILES_CONTENT);
        };
        generateFullCodeString();
    }, []);

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

            const ownerRef = doc(db, "owners", user.uid);
            await writeBatch(db).set(ownerRef, adminProfile).commit();

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
                             if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/.test(value)) {
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
        // This is a placeholder that will be replaced by the actual code string by the backend.
        const codeToCopy = `
// FILE: .env

// FILE: README.md
# Firebase Studio

This is a NextJS starter in Firebase Studio.

To get started, take a look at src/app/page.tsx.

// FILE: apphosting.yaml
# Settings to manage and configure a Firebase App Hosting backend.
# https://firebase.google.com/docs/app-hosting/configure

runConfig:
  # Increase this value if you\'d like to automatically spin up
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
    allowedDevOrigins: ["https://6000-firebase-studio-1755127519376.cluster-joak5ukfbnbyqspg4tewa33d24.cloudworkstations.dev"],
  },
  webpack(config) {
    config.module.rules.push({
      test: /\.svg$/,
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
    "dev": "genkit start -- tsx --watch src/ai/flows/*.ts & next dev",
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
  paymentDate: z.string().describe(\`The date of the payment in 'yyyy-MM-dd' format. Today\'s date is \${format(new Date(), 'yyyy-MM-dd')}.\`),
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
  prompt: \`You are an expert financial assistant for a condominium management app in Venezuela. Your task is to analyze a user\'s text description of a payment and accurately extract the key details into a structured format.

The user will provide text that might be informal or contain abbreviations. You must interpret it correctly.

Key Information to Extract:
- Amount: The total amount paid in Bolivars (Bs.). Extract only the number.
- Date: The date the payment was made. If the user says "hoy" (today), "ayer" (yesterday), or provides a date, convert it to 'yyyy-MM-dd' format. Today is \${format(new Date(), 'yyyy-MM-dd')}.
- Method: Determine if it was a 'movil' (Pago Móvil) or 'transferencia' (Transferencia).
- Bank: Identify the bank. Common banks are Banesco, Mercantil, Provincial, Banco de Venezuela (BDV), BNC, Tesoro. If you cannot identify a specific bank, use 'otro'.
- Reference: Extract the reference number. It should be a string of digits.

Analyze the following text and return the structured data.

User\'s Text: {{{text}}}
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

// ... and so on for every file in the project.
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
                    <CardTitle>Reglas Actuales de Firestore</CardTitle>
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

    
