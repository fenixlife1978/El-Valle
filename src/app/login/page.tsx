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
