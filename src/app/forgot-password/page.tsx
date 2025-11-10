
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, MailQuestion } from 'lucide-react';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import Link from 'next/link';

export default function ForgotPasswordPage() {
    const router = useRouter();
    const { toast } = useToast();

    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);

    const handlePasswordReset = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email) {
            toast({
                variant: 'destructive',
                title: 'Correo requerido',
                description: 'Por favor, ingrese su correo electrónico.',
            });
            return;
        }

        setLoading(true);
        try {
            await sendPasswordResetEmail(auth(), email);
            toast({
                title: 'Correo Enviado',
                description: 'Se ha enviado un enlace para restablecer su contraseña a su correo electrónico.',
                className: 'bg-green-100 border-green-400 text-green-800'
            });
            router.push('/login');
        } catch (error: any) {
            console.error("Password reset error:", error);
            let description = 'Ocurrió un error inesperado.';
            if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-email') {
                description = 'No se encontró un usuario con ese correo electrónico.';
            }
            toast({
                variant: 'destructive',
                title: 'Error al enviar correo',
                description: description,
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <main className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
            <Card className="w-full max-w-sm">
                <CardHeader className="text-center">
                    <div className="flex justify-center mb-4">
                        <MailQuestion className="h-10 w-10 text-primary"/>
                    </div>
                    <CardTitle>Restablecer Contraseña</CardTitle>
                    <CardDescription>Ingrese su correo electrónico y le enviaremos un enlace para restablecer su contraseña.</CardDescription>
                </CardHeader>
                <form onSubmit={handlePasswordReset}>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="email">Correo Electrónico</Label>
                            <Input
                                id="email"
                                type="email"
                                placeholder="su.correo@ejemplo.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                        </div>
                    </CardContent>
                    <CardFooter className="flex flex-col gap-4">
                        <Button type="submit" className="w-full" disabled={loading}>
                            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {loading ? 'Enviando...' : 'Enviar Correo de Restablecimiento'}
                        </Button>
                         <Button variant="link" size="sm" asChild>
                            <Link href="/login">Volver a Iniciar Sesión</Link>
                        </Button>
                    </CardFooter>
                </form>
            </Card>
        </main>
    );
}

    