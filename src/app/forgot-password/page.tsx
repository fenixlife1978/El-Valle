
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getAuth, sendPasswordResetEmail } from 'firebase/auth';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from '@/hooks/use-toast';
import { Loader2, MailQuestion } from 'lucide-react';
import Link from 'next/link';

export default function ForgotPasswordPage() {
    const router = useRouter();
    const { toast } = useToast();

    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [emailSent, setEmailSent] = useState(false);

    const handlePasswordReset = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            const auth = getAuth();
            await sendPasswordResetEmail(auth, email);
            setEmailSent(true);
            toast({
                title: 'Correo Enviado',
                description: 'Revisa tu bandeja de entrada para restablecer tu contraseña.',
                className: 'bg-green-100 border-green-400 text-green-800'
            });
        } catch (error: any) {
            console.error("Error sending password reset email:", error);
            let description = 'Ocurrió un error. Por favor, verifica el correo e intenta de nuevo.';
            if (error.code === 'auth/user-not-found') {
                description = 'No se encontró ninguna cuenta con ese correo electrónico.';
            }
            toast({
                variant: 'destructive',
                title: 'Error',
                description: description,
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4 font-body">
            <Card className="w-full max-w-md">
                <CardHeader className="text-center">
                    <MailQuestion className="mx-auto h-12 w-12 text-primary"/>
                    <CardTitle className="mt-4 text-3xl font-bold font-headline">Recuperar Contraseña</CardTitle>
                    <CardDescription>
                        {emailSent
                            ? "¡Revisa tu correo electrónico!"
                            : "Ingresa tu correo y te enviaremos un enlace para restablecer tu contraseña."}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {emailSent ? (
                        <div className="text-center text-muted-foreground">
                            <p>Si no ves el correo, revisa tu carpeta de spam o correo no deseado.</p>
                        </div>
                    ) : (
                        <form onSubmit={handlePasswordReset} className="space-y-6">
                            <div className="space-y-2">
                                <Label htmlFor="email">Correo Electrónico</Label>
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
                            <Button type="submit" className="w-full" disabled={loading}>
                                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                {loading ? 'Enviando...' : 'Enviar Correo de Recuperación'}
                            </Button>
                        </form>
                    )}
                </CardContent>
                 <CardFooter className="flex justify-center p-4">
                    <Button variant="link" asChild>
                        <Link href="/login">Volver a inicio de sesión</Link>
                    </Button>
                </CardFooter>
            </Card>
        </div>
    );
}
