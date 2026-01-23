
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, UserPlus, Eye, EyeOff } from 'lucide-react';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import Link from 'next/link';

export default function RegisterPage() {
    const router = useRouter();
    const { toast } = useToast();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email || !password || !confirmPassword) {
            toast({ variant: 'destructive', title: 'Campos requeridos', description: 'Por favor, complete todos los campos.' });
            return;
        }
        if (password !== confirmPassword) {
            toast({ variant: 'destructive', title: 'Las contraseñas no coinciden', description: 'Por favor, verifique su contraseña.' });
            return;
        }

        setLoading(true);
        try {
            await createUserWithEmailAndPassword(auth, email, password);
            toast({
                title: '¡Registro exitoso!',
                description: 'Tu cuenta ha sido creada. Serás redirigido.',
                className: 'bg-blue-100 border-blue-400 text-blue-800'
            });
            // The AuthGuard will handle redirection
        } catch (error: any) {
            console.error("Registration error:", error);
            let description = 'Ocurrió un error inesperado.';
            if (error.code === 'auth/email-already-in-use') {
                description = 'Este correo electrónico ya está registrado. Por favor, intenta iniciar sesión.';
            } else if (error.code === 'auth/weak-password') {
                description = 'La contraseña es demasiado débil. Debe tener al menos 6 caracteres.';
            } else if (error.code === 'auth/invalid-email') {
                description = 'El formato del correo electrónico no es válido.';
            }
            toast({ variant: 'destructive', title: 'Error en el Registro', description });
        } finally {
            setLoading(false);
        }
    };

    return (
        <main className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
            <Card className="w-full max-w-sm">
                <CardHeader className="text-center">
                    <div className="flex justify-center mb-4">
                        <UserPlus className="h-10 w-10 text-primary"/>
                    </div>
                    <CardTitle>Crear Cuenta de Propietario</CardTitle>
                    <CardDescription>Regístrate para acceder a tu panel.</CardDescription>
                </CardHeader>
                <form onSubmit={handleRegister}>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="email">Correo Electrónico</Label>
                            <Input id="email" type="email" placeholder="su.correo@ejemplo.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="password">Contraseña</Label>
                            <div className="relative">
                                <Input id="password" type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} required className="pr-10"/>
                                <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 text-muted-foreground" onClick={() => setShowPassword(p => !p)}>
                                    {showPassword ? <EyeOff className="h-4 w-4"/> : <Eye className="h-4 w-4"/>}
                                </Button>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="confirmPassword">Confirmar Contraseña</Label>
                            <Input id="confirmPassword" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
                        </div>
                    </CardContent>
                    <CardFooter className="flex flex-col gap-4">
                        <Button type="submit" className="w-full" disabled={loading}>
                            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {loading ? 'Registrando...' : 'Crear Cuenta'}
                        </Button>
                        <Button variant="link" size="sm" asChild>
                            <Link href="/login?role=owner">¿Ya tienes cuenta? Inicia sesión</Link>
                        </Button>
                    </CardFooter>
                </form>
            </Card>
        </main>
    );
}
