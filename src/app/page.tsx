
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Building2, Loader2, User, Wrench } from "lucide-react";
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
// Firebase auth is no longer used directly on login, but might be needed elsewhere.
// Keeping it for now but commenting out the specific sign-in function.
import { signInWithEmailAndPassword, Auth, getAuth } from 'firebase/auth';

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

type Role = "owner" | "admin" | null;

type CompanyInfo = {
  name: string;
  logo: string;
};

export default function LoginPage() {
  const [selectedRole, setSelectedRole] = useState<Role>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);
  const [isCompanyInfoLoading, setIsCompanyInfoLoading] = useState(true);
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    const fetchCompanyInfo = async () => {
      try {
        const settingsRef = doc(db, 'config', 'mainSettings');
        const docSnap = await getDoc(settingsRef);
        if (docSnap.exists()) {
          setCompanyInfo(docSnap.data().companyInfo as CompanyInfo);
        }
      } catch (error) {
        console.error("Error fetching company info:", error);
      } finally {
        setIsCompanyInfoLoading(false);
      }
    };
    fetchCompanyInfo();
  }, []);

  const handleRoleSelect = (role: Role) => {
    setSelectedRole(role);
    setEmail('');
    setPassword('');
  };

  const handleBack = () => {
    setSelectedRole(null);
    setEmail('');
    setPassword('');
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
        // We now query Firestore directly to find a user with the matching email and role.
        const q = query(
            collection(db, "owners"), 
            where("email", "==", email), 
            where("role", "==", selectedRole)
        );
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
             throw new Error("No se encontró un usuario con ese email y rol.");
        }
        
        // Assuming the first match is the correct user.
        const userDoc = querySnapshot.docs[0];
        
        // Here we can proceed, but we are not validating the password against anything.
        // This is a simplification to solve the reported error.
        // For a real app, you would use Firebase Auth to sign in, and then get the user doc.
        
        const auth = getAuth();
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        toast({
            title: "Inicio de sesión exitoso",
            description: "Redirigiendo...",
        });
        
        router.push(selectedRole === 'admin' ? '/admin/dashboard' : '/owner/dashboard');
        
    } catch (error: any) {
        console.error("Authentication error:", error);
        let description = "Por favor verifique sus credenciales.";
        if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
            description = "Correo electrónico o contraseña incorrectos.";
        } else if (error.message) {
            description = error.message;
        }
        toast({
            variant: "destructive",
            title: "Error de autenticación",
            description: description,
        });
    } finally {
      setIsLoading(false);
    }
  };


  const renderRoleSelection = () => (
    <div className="flex flex-col md:flex-row justify-center gap-8 mt-6">
      <Card
        className="w-full md:w-64 text-center cursor-pointer hover:shadow-lg hover:border-primary transition-all transform hover:-translate-y-1"
        onClick={() => handleRoleSelect("owner")}
      >
        <CardContent className="p-6 flex flex-col items-center justify-center gap-4">
          <User className="w-16 h-16 text-primary" />
          <p className="text-lg font-medium">Ingresar como Propietario</p>
        </CardContent>
      </Card>
      <Card
        className="w-full md:w-64 text-center cursor-pointer hover:shadow-lg hover:border-primary transition-all transform hover:-translate-y-1"
        onClick={() => handleRoleSelect("admin")}
      >
        <CardContent className="p-6 flex flex-col items-center justify-center gap-4">
          <Wrench className="w-16 h-16 text-primary" />
          <p className="text-lg font-medium">Ingresar como Administrador</p>
        </CardContent>
      </Card>
    </div>
  );

  const renderLoginForm = () => (
    <div className="w-full max-w-sm mx-auto">
      <Button variant="ghost" onClick={handleBack} className="mb-4">
        <ArrowLeft className="mr-2 h-4 w-4" /> Volver
      </Button>
      <h2 className="text-2xl font-bold text-center text-foreground mb-6">
        Accede a tu panel de {selectedRole === "owner" ? "Propietario" : "Administrador"}
      </h2>
      <form onSubmit={handleLogin}>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Correo Electrónico</Label>
            <Input
              id="email"
              type="email"
              placeholder={"tu@email.com"}
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Contraseña</Label>
            <Input 
              id="password" 
              type="password" 
              placeholder="••••••••" 
              required 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
            />
          </div>
        </div>
        <Button type="submit" className="w-full mt-6" disabled={isLoading}>
          {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Ingresar
        </Button>
        <div className="mt-4 text-center text-sm">
          <a href="#" className="underline text-primary">
            ¿Olvidaste tu contraseña?
          </a>
        </div>
      </form>
    </div>
  );

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-4xl shadow-2xl">
        <CardHeader className="text-center p-8 rounded-t-lg">
          <div className="mx-auto bg-card rounded-full p-4 w-24 h-24 flex items-center justify-center mb-4">
            {isCompanyInfoLoading ? <Loader2 className="w-12 h-12 text-primary animate-spin" /> :
              companyInfo?.logo ? <img src={companyInfo.logo} alt="Logo" className="w-full h-full object-cover rounded-full" /> : <Building2 className="w-12 h-12 text-primary" />
            }
          </div>
          <CardTitle className="text-3xl font-headline">Bienvenido a {isCompanyInfoLoading ? '...' : companyInfo?.name || 'CondoConnect'}</CardTitle>
          <CardDescription className="text-muted-foreground text-lg">
            Ingresa a tu cuenta de condominio
          </CardDescription>
        </CardHeader>
        <CardContent className="p-8">
          {selectedRole ? renderLoginForm() : renderRoleSelection()}
        </CardContent>
      </Card>
    </div>
  );
}