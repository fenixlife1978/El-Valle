
'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createUserWithEmailAndPassword, getAuth } from 'firebase/auth';
import { doc, setDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, UserPlus, ArrowLeft } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

export default function RegisterPage() {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const router = useRouter();
    const searchParams = useSearchParams();
    const { toast } = useToast();
    const auth = getAuth();

    const role = searchParams.get('role');

    useEffect(() => {
        if (role !== 'admin' && role !== 'owner') {
            router.replace('/');
        }
    }, [role, router]);

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        
        const isOwner = role === 'owner';
        const finalPassword = isOwner ? '123456.Aa' : password;

        if (!name || !email) {
            toast({
                variant: 'destructive',
                title: 'Campos requeridos',
                description: 'Por favor, complete nombre y email.',
            });
            return;
        }

        if (!isOwner && (!finalPassword || finalPassword.length < 6)) {
             toast({
                variant: 'destructive',
                title: 'Contraseña Débil',
                description: 'La contraseña debe tener al menos 6 caracteres.',
            });
            return;
        }

        setLoading(true);
        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, finalPassword);
            const user = userCredential.user;

            await setDoc(doc(db, "owners", user.uid), {
                uid: user.uid,
                name,
                email,
                role: isOwner ? 'propietario' : 'administrador',
                balance: 0,
                properties: [],
                passwordChanged: !isOwner, // Owners must change password, admins don't.
                createdAt: Timestamp.now()
            });

            toast({
                title: 'Registro Exitoso',
                description: `¡Bienvenido, ${name}! Tu cuenta ha sido creada.`,
                className: 'bg-green-100 border-green-400'
            });

            router.push(`/login?role=${role}`);

        } catch (error: any) {
            console.error('Registration error:', error);
            let description = 'Ocurrió un error inesperado. Por favor, intente de nuevo.';
            if (error.code === 'auth/email-already-in-use') {
                description = 'Este correo electrónico ya está en uso por otra cuenta.';
            } else if (error.code === 'auth/invalid-email') {
                description = 'El formato del correo electrónico no es válido.';
            }
            toast({
                variant: 'destructive',
                title: 'Error de Registro',
                description,
            });
        } finally {
            setLoading(false);
        }
    };
    
    if (!role) {
        return null;
    }

    const title = role === 'admin' ? 'Registro de Administrador' : 'Registro de Propietario';
    const description = role === 'admin' ? 'Crea una cuenta para gestionar el condominio.' : 'Crea tu cuenta para acceder al portal.';

    return (
        <main className="min-h-screen flex items-center justify-center bg-background p-4 relative">
            <Link href="/" className="absolute top-4 left-4">
                <Button variant="outline"><ArrowLeft className="mr-2 h-4 w-4" /> Volver</Button>
            </Link>
            <Card className="w-full max-w-sm">
                <CardHeader className="text-center">
                    <div className="mx-auto mb-4">
                        <Image src="/logo.png" alt="Logo" width={80} height={80} data-ai-hint="logo for a condo app"/>
                    </div>
                    <CardTitle className="capitalize font-headline">{title}</CardTitle>
                    <CardDescription>{description}</CardDescription>
                </CardHeader>
                <form onSubmit={handleRegister}>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="name">Nombre Completo</Label>
                            <Input
                                id="name"
                                type="text"
                                placeholder="John Doe"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                required
                                disabled={loading}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="email">Email</Label>
                            <Input
                                id="email"
                                type="email"
                                placeholder="tu@email.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                disabled={loading}
                            />
                        </div>
                         {role === 'admin' && (
                            <div className="space-y-2">
                                <Label htmlFor="password">Contraseña (mín. 6 caracteres)</Label>
                                <Input
                                    id="password"
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                    disabled={loading}
                                />
                            </div>
                        )}
                        {role === 'owner' && (
                             <div className="text-sm text-muted-foreground p-2 border rounded-md bg-muted">
                                <p>Se te asignará la contraseña temporal <code className="font-mono bg-background/50 px-1 py-0.5 rounded">123456.Aa</code>. Deberás cambiarla en tu primer inicio de sesión.</p>
                            </div>
                        )}
                    </CardContent>
                    <CardFooter>
                        <Button type="submit" className="w-full" disabled={loading}>
                            {loading ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                                <UserPlus className="mr-2 h-4 w-4" />
                            )}
                            {loading ? 'Registrando...' : 'Crear Cuenta'}
                        </Button>
                    </CardFooter>
                </form>
            </Card>
        </main>
    );
}
