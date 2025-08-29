"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Building2, Loader2, User, Wrench } from "lucide-react";
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

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
    if (role === 'admin') {
      setEmail('vallecondo@gmail.com');
    } else {
      setEmail('');
    }
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

    // Mock authentication
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Check for generic password
    if (password === '123456') {
      toast({
        variant: "destructive",
        title: "Cambio de Contraseña Requerido",
        description: "Por su seguridad, debe cambiar su contraseña inicial. Redirigiendo...",
      });
      // Redirect to a dedicated settings/profile page to change password
      router.push(selectedRole === 'admin' ? '/admin/settings' : '/owner/settings');
      return;
    }


    if ((selectedRole === 'owner' && email && password) || 
        (selectedRole === 'admin' && email === 'vallecondo@gmail.com' && password)) {
      
      toast({
        title: "Inicio de sesión exitoso",
        description: "Redirigiendo...",
      });
      
      if (selectedRole === 'admin') {
        router.push('/admin/dashboard');
      } else {
        router.push('/owner/dashboard');
      }
    } else {
      toast({
        variant: "destructive",
        title: "Error de autenticación",
        description: "Por favor verifique sus credenciales.",
      });
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
      <h2 className="text-2xl font-bold text-center text-primary-foreground mb-6">
        Accede a tu panel de {selectedRole === "owner" ? "Propietario" : "Administrador"}
      </h2>
      <form onSubmit={handleLogin}>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Correo Electrónico</Label>
            <Input
              id="email"
              type="email"
              placeholder={selectedRole === 'admin' ? "admin@email.com" : "tu@email.com"}
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
