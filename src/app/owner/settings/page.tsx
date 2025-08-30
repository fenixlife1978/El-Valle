
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Upload, Save, Loader2, UserCircle, KeyRound } from 'lucide-react';
import { doc, getDoc, updateDoc, onSnapshot, collection, query, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
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
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    
    const [profile, setProfile] = useState<OwnerProfile>(emptyOwnerProfile);
    const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');


    useEffect(() => {
        const fetchFirstOwner = async () => {
            setLoading(true);
            const ownersQuery = query(collection(db, "owners"), limit(1));
            const unsubscribe = onSnapshot(ownersQuery, (snapshot) => {
                if (!snapshot.empty) {
                    const ownerDoc = snapshot.docs[0];
                    const data = ownerDoc.data();
                    const profileData = {
                        id: ownerDoc.id,
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

            return unsubscribe;
        };
        
        const cleanupPromise = fetchFirstOwner();
        return () => {
            cleanupPromise.then(cleanup => cleanup());
        };

    }, [toast]);

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

    const handleChangePassword = async () => {
        toast({
            variant: 'destructive',
            title: 'Función Deshabilitada',
            description: 'El cambio de contraseña no está disponible sin autenticación.',
        });
    }


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

            <Card>
                <CardHeader>
                    <CardTitle>Seguridad</CardTitle>
                    <CardDescription>Cambia tu contraseña de acceso.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="new-password">Nueva Contraseña</Label>
                        <Input 
                            id="new-password" 
                            type="password" 
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder="••••••••"
                            disabled
                        />
                    </div>
                     <div className="space-y-2">
                        <Label htmlFor="confirm-password">Confirmar Contraseña</Label>
                        <Input 
                            id="confirm-password" 
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                             placeholder="••••••••"
                             disabled
                        />
                    </div>
                </CardContent>
                <CardFooter>
                    <Button onClick={handleChangePassword} disabled>
                        <KeyRound className="mr-2 h-4 w-4"/>
                        Cambiar Contraseña
                    </Button>
                </CardFooter>
            </Card>

        </div>
    );
}
