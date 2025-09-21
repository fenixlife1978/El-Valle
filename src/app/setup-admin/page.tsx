
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from '@/hooks/use-toast';
import { Loader2, ShieldCheck } from 'lucide-react';

export default function SetupAdminPage() {
    const router = useRouter();
    const { toast } = useToast();

    const [email] = useState('vallecondo@gmail.com');
    const [password] = useState('M110710.m');
    const [loading, setLoading] = useState(false);

    const handleCreateAdmin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            // First, check if this admin user already exists in Firestore to prevent overwrites
            const adminDocRefCheck = doc(db, "owners", "G2jhcEnp05TcvjYj8SwhzVCHbW83");
            const docSnap = await getDoc(adminDocRefCheck);

            if (docSnap.exists()) {
                toast({
                    variant: "destructive",
                    title: "Administrador ya existe",
                    description: "La cuenta de administrador principal ya ha sido configurada.",
                });
                router.push('/login?role=admin');
                return;
            }

            // Create user in Firebase Auth
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            // Create user profile in Firestore with the specific UID
            const userData = {
                name: 'EDWIN AGUIAR',
                email: user.email,
                role: 'administrador',
                balance: 0,
                mustChangePass: false,
                properties: [{ street: 'N/A', house: 'N/A' }],
            };
            
            // Use the specific UID for the admin document
            await setDoc(doc(db, "owners", "G2jhcEnp05TcvjYj8SwhzVCHbW83"), userData);

            toast({
                title: '¡Administrador Creado!',
                description: 'La cuenta principal ha sido configurada. Ahora puedes iniciar sesión.',
                className: 'bg-green-100 border-green-400 text-green-800'
            });

            router.push('/login?role=admin');

        } catch (error: any) {
            console.error("Admin setup error:", error);
            let description = "Ocurrió un error inesperado durante la configuración.";
            if (error.code === 'auth/email-already-in-use') {
                description = "El correo electrónico del administrador ya está registrado en autenticación. Inicia sesión normalmente.";
                 router.push('/login?role=admin');
            }
            toast({
                variant: "destructive",
                title: "Error de Configuración",
                description: description,
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <main className="min-h-screen flex items-center justify-center bg-background p-4 font-body">
            <Card className="w-full max-w-md">
                <CardHeader className="text-center">
                    <ShieldCheck className="mx-auto h-12 w-12 text-primary" />
                    <CardTitle className="text-3xl font-bold font-headline mt-4">
                        Configuración Inicial
                    </CardTitle>
                    <CardDescription>
                        Crea la cuenta de administrador principal para CondoConnect.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleCreateAdmin} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="email">Correo del Administrador</Label>
                            <Input id="email" type="email" value={email} readOnly disabled />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="password">Contraseña</Label>
                            <Input id="password" type="password" value={password} readOnly disabled />
                        </div>
                        <div className="pt-2">
                            <Button type="submit" className="w-full h-12 text-lg" disabled={loading}>
                                {loading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <ShieldCheck className="mr-2 h-5 w-5" />}
                                Crear Administrador
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </main>
    );
}
