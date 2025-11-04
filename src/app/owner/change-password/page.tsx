'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, KeyRound, Eye, EyeOff } from 'lucide-react';
import { getAuth, updatePassword, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/use-auth';

export default function ChangePasswordPage() {
    const router = useRouter();
    const { user, ownerData, loading: authLoading } = useAuth();
    const { toast } = useToast();

    const [oldPassword, setOldPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [showOldPassword, setShowOldPassword] = useState(false);
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);


    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!user || !ownerData) {
            toast({ variant: 'destructive', title: 'Error', description: 'No se ha podido identificar al usuario.' });
            return;
        }

        if (newPassword.length < 6) {
             toast({ variant: 'destructive', title: 'Contraseña Débil', description: 'La nueva contraseña debe tener al menos 6 caracteres.' });
            return;
        }

        if (newPassword !== confirmPassword) {
            toast({ variant: 'destructive', title: 'Error', description: 'Las nuevas contraseñas no coinciden.' });
            return;
        }

        setLoading(true);
        try {
            // Re-authenticate the user to confirm their identity
            const credential = EmailAuthProvider.credential(user.email!, oldPassword);
            await reauthenticateWithCredential(user, credential);
            
            // If re-authentication is successful, update the password
            await updatePassword(user, newPassword);

            // Mark in Firestore that the password has been changed
            const userDocRef = doc(db, 'owners', user.uid);
            await updateDoc(userDocRef, {
                passwordChanged: true
            });

            toast({
                title: 'Contraseña Actualizada',
                description: 'Tu contraseña ha sido cambiada exitosamente. Serás redirigido al panel.',
                className: 'bg-green-100 border-green-400 text-green-800'
            });

            router.push('/owner/dashboard');

        } catch (error: any) {
            console.error("Password change error:", error);
            let description = 'Ocurrió un error inesperado.';
            if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
                description = 'La contraseña actual es incorrecta.';
            } else if (error.code === 'auth/weak-password') {
                description = 'La nueva contraseña es demasiado débil.';
            }
            toast({
                variant: 'destructive',
                title: 'Error al cambiar contraseña',
                description: description
            });
        } finally {
            setLoading(false);
        }
    };

    if (authLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <Loader2 className="h-8 w-8 animate-spin" />
            </div>
        );
    }
    
    return (
        <main className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
            <Card className="w-full max-w-sm">
                <CardHeader className="text-center">
                     <div className="flex justify-center mb-4">
                        <KeyRound className="h-10 w-10 text-primary"/>
                    </div>
                    <CardTitle>Cambio de Contraseña</CardTitle>
                    <CardDescription>Por tu seguridad, debes cambiar la contraseña inicial proporcionada por el administrador.</CardDescription>
                </CardHeader>
                <form onSubmit={handleChangePassword}>
                    <CardContent className="space-y-4">
                        <div className="space-y-2 relative">
                            <Label htmlFor="old-password">Contraseña Actual (temporal)</Label>
                            <Input
                                id="old-password"
                                type={showOldPassword ? "text" : "password"}
                                value={oldPassword}
                                onChange={(e) => setOldPassword(e.target.value)}
                                required
                                className="pr-10"
                            />
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="absolute right-1 top-7 h-7 w-7 text-muted-foreground"
                                onClick={() => setShowOldPassword((prev) => !prev)}
                            >
                                {showOldPassword ? <EyeOff className="h-4 w-4"/> : <Eye className="h-4 w-4"/>}
                            </Button>
                        </div>
                         <div className="space-y-2 relative">
                            <Label htmlFor="new-password">Nueva Contraseña</Label>
                            <Input
                                id="new-password"
                                type={showNewPassword ? "text" : "password"}
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                required
                                className="pr-10"
                            />
                             <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="absolute right-1 top-7 h-7 w-7 text-muted-foreground"
                                onClick={() => setShowNewPassword((prev) => !prev)}
                            >
                                {showNewPassword ? <EyeOff className="h-4 w-4"/> : <Eye className="h-4 w-4"/>}
                            </Button>
                        </div>
                        <div className="space-y-2 relative">
                            <Label htmlFor="confirm-password">Confirmar Nueva Contraseña</Label>
                            <Input
                                id="confirm-password"
                                type={showConfirmPassword ? "text" : "password"}
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                required
                                className="pr-10"
                            />
                             <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="absolute right-1 top-7 h-7 w-7 text-muted-foreground"
                                onClick={() => setShowConfirmPassword((prev) => !prev)}
                            >
                                {showConfirmPassword ? <EyeOff className="h-4 w-4"/> : <Eye className="h-4 w-4"/>}
                            </Button>
                        </div>
                    </CardContent>
                    <CardFooter>
                        <Button type="submit" className="w-full" disabled={loading}>
                            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {loading ? 'Cambiando...' : 'Cambiar Contraseña'}
                        </Button>
                    </CardFooter>
                </form>
            </Card>
        </main>
    );
}
