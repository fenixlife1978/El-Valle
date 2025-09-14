
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Database, Upload, Trash2, Loader2, FileUp, AlertTriangle, Terminal, RefreshCw, History, Download } from 'lucide-react';
import { collection, getDocs, writeBatch, doc, addDoc, query, orderBy, onSnapshot, deleteDoc, Timestamp } from 'firebase/firestore';
import { db, storage } from '@/lib/firebase';
import { ref, uploadString, getDownloadURL, listAll, deleteObject } from 'firebase/storage';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const COLLECTIONS_TO_BACKUP = ['owners', 'payments', 'debts', 'historical_payments', 'config'];

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


    return (
        <div className="space-y-8">
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
