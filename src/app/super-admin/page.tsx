'use client';

import { useState, useEffect } from 'react';
import { db, auth } from '@/lib/firebase';
import { collection, onSnapshot, doc, updateDoc, setDoc, deleteDoc, query, orderBy } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Loader2, Trash2, Settings2, LogOut, 
  Edit2, Check, ShieldAlert, Building2, 
  Users, Activity, Lock, Search, 
  TrendingUp, LayoutDashboard, Database,
  ArrowRight, PlusCircle
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export default function SuperAdminERP() {
  const { user, loading: authLoading } = useAuth();
  const [condos, setCondos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [newCondoName, setNewCondoName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', key: '' });

  const { toast } = useToast();
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && user?.email?.toLowerCase() === 'vallecondo@gmail.com') {
      const q = query(collection(db, 'condominios'), orderBy('createdAt', 'desc'));
      const unsub = onSnapshot(q, (snap) => {
        setCondos(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setLoading(false);
      }, (err) => {
        console.error("Error ERP Master:", err);
        toast({ variant: 'destructive', title: "Error Crítico", description: "Fallo en la conexión con el núcleo de datos." });
        setLoading(false);
      });
      return () => unsub();
    } else if (!authLoading && user) {
        setLoading(false);
    }
  }, [user, authLoading, toast]);

  const stats = {
    total: condos.length,
    active: condos.filter(c => c.status === 'active').length,
    suspended: condos.filter(c => c.status !== 'active').length,
    newThisMonth: condos.filter(c => {
        const date = c.createdAt ? new Date(c.createdAt) : null;
        return date && date.getMonth() === new Date().getMonth();
    }).length
  };

  const handleCreate = async () => {
    if (!newCondoName) return;
    const slug = newCondoName.toLowerCase().trim()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // quitar acentos
      .replace(/\s+/g, '-');
    const condoId = `${slug}-${Math.floor(100 + Math.random() * 900)}`;
    
    try {
      await setDoc(doc(db, 'condominios', condoId), {
        name: newCondoName.toUpperCase(),
        nombre: newCondoName.toUpperCase(),
        registrationKey: `KEY-${Math.floor(1000 + Math.random() * 9000)}`,
        status: 'active',
        createdAt: new Date().toISOString(),
      });
      setNewCondoName('');
      toast({ title: "Alta Exitosa", description: "Nueva instancia desplegada en la red." });
    } catch (e) { 
      toast({ variant: 'destructive', title: "Error de Núcleo" }); 
    }
  };

  const handleUpdate = async (id: string) => {
    try {
      await updateDoc(doc(db, 'condominios', id), {
        name: editForm.name.toUpperCase(),
        nombre: editForm.name.toUpperCase(),
        registrationKey: editForm.key.toUpperCase()
      });
      setEditingId(null);
      toast({ title: "Registro Actualizado" });
    } catch (e) { toast({ variant: 'destructive', title: "Error" }); }
  };

  const handleSupport = (id: string) => {
    localStorage.setItem('support_condo_id', id);
    localStorage.setItem('activeCondoId', id);
    window.location.href = `/${id}/admin/dashboard`;
  };
  
  const handleLogout = async () => {
    await signOut(auth);
    localStorage.clear();
    router.replace('/');
  };

  const toggleStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'suspended' : 'active';
    try {
      await updateDoc(doc(db, 'condominios', id), { status: newStatus });
      toast({ 
        title: "Cambio de Estado", 
        description: `Condominio ${newStatus === 'active' ? 'Re-activado' : 'Suspendido'}`,
        variant: newStatus === 'active' ? 'default' : 'destructive'
      });
    } catch (e) {
      toast({ variant: 'destructive', title: "Acceso Denegado" });
    }
  };

  const filteredCondos = condos.filter(c => 
    (c.name || c.nombre || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (authLoading || (loading && condos.length === 0)) return (
    <div className="flex h-screen items-center justify-center bg-[#1A1D23]">
        <div className="flex flex-col items-center gap-4">
            <Loader2 className="animate-spin text-[#F28705] h-12 w-12" />
            <p className="text-[10px] font-black uppercase tracking-[0.5em] text-white/40 animate-pulse">Sincronizando Núcleo ERP...</p>
        </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#1A1D23] p-4 md:p-8 font-montserrat text-white italic">
      {/* HEADER ERP */}
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-12 border-b border-white/5 pb-8">
        <div>
            <div className="flex items-center gap-2 text-primary mb-2">
                <Database className="h-4 w-4" />
                <span className="text-[10px] font-black uppercase tracking-[0.3em]">Gestión Centralizada SaaS</span>
            </div>
            <h2 className="text-4xl md:text-5xl font-[900] text-white uppercase tracking-tighter italic leading-none">
                Panel <span className="text-primary">Maestro</span>
            </h2>
            <p className="text-white/40 font-bold mt-4 text-xs md:text-sm uppercase tracking-widest">
                Administración Global de Instancias EFAS CondoSys.
            </p>
        </div>
        <Button onClick={handleLogout} variant="destructive" className="w-full md:w-auto h-12 rounded-xl px-8 font-black uppercase text-[10px] tracking-widest shadow-lg shadow-red-500/20">
          <LogOut className="w-4 h-4 mr-2" /> Salir del Sistema
        </Button>
      </div>

      {/* MÉTRICAS ERP */}
      <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
        <Card className="bg-slate-900 border-none rounded-3xl shadow-xl p-6">
            <p className="text-[10px] font-black text-slate-500 uppercase mb-1">Total Condos</p>
            <div className="flex items-end justify-between">
                <p className="text-4xl font-black italic">{stats.total}</p>
                <LayoutDashboard className="text-white/5 h-10 w-10" />
            </div>
        </Card>
        <Card className="bg-slate-900 border-none rounded-3xl shadow-xl p-6 border-l-4 border-l-emerald-500">
            <p className="text-[10px] font-black text-emerald-500 uppercase mb-1">Activos</p>
            <div className="flex items-end justify-between">
                <p className="text-4xl font-black italic text-emerald-400">{stats.active}</p>
                <Activity className="text-emerald-500/10 h-10 w-10" />
            </div>
        </Card>
        <Card className="bg-slate-900 border-none rounded-3xl shadow-xl p-6 border-l-4 border-l-red-500">
            <p className="text-[10px] font-black text-red-500 uppercase mb-1">Suspendidos</p>
            <div className="flex items-end justify-between">
                <p className="text-4xl font-black italic text-red-400">{stats.suspended}</p>
                <Lock className="text-red-500/10 h-10 w-10" />
            </div>
        </Card>
        <Card className="bg-slate-900 border-none rounded-3xl shadow-xl p-6 border-l-4 border-l-primary">
            <p className="text-[10px] font-black text-primary uppercase mb-1">Nuevos (Mes)</p>
            <div className="flex items-end justify-between">
                <p className="text-4xl font-black italic text-primary">{stats.newThisMonth}</p>
                <TrendingUp className="text-primary/10 h-10 w-10" />
            </div>
        </Card>
      </div>

      {/* ACCIONES DE CONTROL */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
        <Card className="bg-slate-900 border-white/5 rounded-[2.5rem] shadow-2xl p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-primary/20 p-3 rounded-2xl">
                <PlusCircle className="text-primary h-6 w-6"/>
            </div>
            <h3 className="font-black uppercase italic tracking-tight text-lg">Nueva Instancia</h3>
          </div>
          <div className="flex flex-col md:flex-row gap-3">
            <Input 
              placeholder="NOMBRE DEL CONDOMINIO" 
              value={newCondoName}
              onChange={(e) => setNewCondoName(e.target.value)}
              className="flex-1 bg-white/5 border-none h-14 rounded-2xl px-6 font-black uppercase italic placeholder:text-white/20"
            />
            <Button onClick={handleCreate} className="w-full md:w-auto bg-primary hover:bg-primary/90 text-slate-900 font-black h-14 px-10 rounded-2xl uppercase italic shadow-xl shadow-primary/20">
              Activar Servicio
            </Button>
          </div>
        </Card>

        <Card className="bg-slate-900 border-white/5 rounded-[2.5rem] shadow-2xl p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-sky-500/20 p-3 rounded-2xl">
                <Search className="text-sky-400 h-6 w-6"/>
            </div>
            <h3 className="font-black uppercase italic tracking-tight text-lg">Buscador Inteligente</h3>
          </div>
          <div className="relative">
            <Search className="absolute left-6 top-1/2 -translate-y-1/2 h-5 w-5 text-white/20" />
            <Input 
                placeholder="BUSCAR POR NOMBRE O ID..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-white/5 border-none h-14 rounded-2xl pl-16 pr-6 font-black uppercase italic"
            />
          </div>
        </Card>
      </div>

      {/* LISTADO MAESTRO ERP */}
      <div className="max-w-7xl mx-auto bg-slate-900 rounded-[3rem] shadow-2xl border border-white/5 overflow-hidden">
        <div className="bg-white/5 px-10 py-6 border-b border-white/5 flex items-center justify-between">
            <h3 className="font-black uppercase italic tracking-[0.2em] text-xs text-white/60 flex items-center gap-3">
                <Users className="h-4 w-4 text-primary" /> Directorio Maestro de Clientes
            </h3>
            <Badge variant="outline" className="border-white/10 text-[10px] text-white/40">{filteredCondos.length} Instancias Cargadas</Badge>
        </div>
        
        <div className="overflow-x-auto w-full">
          <Table className="w-full">
            <TableHeader className="bg-black/20">
              <TableRow className="hover:bg-transparent border-b border-white/5">
                <TableHead className="py-6 pl-10 text-[10px] font-black uppercase tracking-widest text-slate-500 italic">Cliente / Identificación</TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-widest text-slate-500 italic">Clave Dinámica</TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-widest text-slate-500 italic">Estatus</TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-widest text-slate-500 italic">Kill Switch</TableHead>
                <TableHead className="text-right pr-10 text-[10px] font-black uppercase tracking-widest text-slate-500 italic">Mando</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCondos.map((condo) => (
                <TableRow key={condo.id} className="border-b border-white/5 group hover:bg-white/[0.02] transition-all duration-300">
                  <TableCell className="py-8 pl-10">
                    {editingId === condo.id ? (
                      <Input value={editForm.name} onChange={(e) => setEditForm({...editForm, name: e.target.value})} className="h-10 font-black uppercase bg-slate-800 border-primary" />
                    ) : (
                      <div className="flex items-center gap-4">
                        <div className="h-12 w-12 rounded-2xl bg-white/5 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                            <Building2 className="h-6 w-6 text-white/20 group-hover:text-primary" />
                        </div>
                        <div className="flex flex-col">
                            <span className="font-black text-xl uppercase tracking-tighter group-hover:text-primary transition-colors text-white italic">
                            {condo.name || condo.nombre}
                            </span>
                            <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-1">ID: {condo.id}</span>
                        </div>
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    {editingId === condo.id ? (
                      <Input value={editForm.key} onChange={(e) => setEditForm({...editForm, key: e.target.value})} className="h-10 font-mono bg-slate-800 border-primary uppercase" />
                    ) : (
                      <code className="text-[11px] font-mono font-black text-sky-400 bg-sky-400/10 px-3 py-1.5 rounded-lg border border-sky-400/20 uppercase">
                        {condo.registrationKey || 'S/K'}
                      </code>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className={cn(
                        "inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-[10px] font-black uppercase italic",
                        condo.status === 'active' ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
                    )}>
                      <span className={cn("h-1.5 w-1.5 rounded-full", condo.status === 'active' ? "bg-emerald-400 animate-pulse" : "bg-red-400")}></span>
                      {condo.status === 'active' ? 'Servicio Activo' : 'Suspendido'}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Switch 
                        checked={condo.status === 'active'} 
                        onCheckedChange={() => toggleStatus(condo.id, condo.status)}
                        className="data-[state=checked]:bg-emerald-600"
                    />
                  </TableCell>
                  <TableCell className="text-right pr-10">
                    <div className="flex justify-end gap-2 items-center">
                        {editingId === condo.id ? (
                        <Button onClick={() => handleUpdate(condo.id)} size="icon" className="bg-emerald-600 h-10 w-10 rounded-xl hover:bg-emerald-700 shadow-lg shadow-emerald-500/20"><Check /></Button>
                        ) : (
                        <>
                            <Button 
                                onClick={() => handleSupport(condo.id)} 
                                variant="outline" 
                                className="border-white/10 hover:border-primary hover:text-primary font-black text-[10px] uppercase rounded-xl h-12 px-6 bg-white/5 transition-all active:scale-95"
                            >
                            <Settings2 className="w-4 h-4 mr-2" /> Gestionar
                            </Button>
                            <Button onClick={() => { setEditingId(condo.id); setEditForm({ name: condo.name || condo.nombre, key: condo.registrationKey || '' }); }} variant="ghost" size="icon" className="h-12 w-12 text-slate-500 hover:text-white rounded-xl hover:bg-white/5"><Edit2 className="w-4 h-4" /></Button>
                            <Button onClick={() => { if(confirm("¿Eliminar Instancia?")) deleteDoc(doc(db, 'condominios', condo.id)) }} variant="ghost" size="icon" className="h-12 w-12 text-slate-500 hover:text-red-500 rounded-xl hover:bg-red-500/10"><Trash2 className="w-4 h-4" /></Button>
                        </>
                        )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filteredCondos.length === 0 && !loading && (
                <TableRow>
                  <TableCell colSpan={5} className="p-32 text-center">
                    <div className="flex flex-col items-center gap-4 opacity-20">
                        <Building2 className="h-20 w-20" />
                        <p className="text-sm font-black uppercase italic tracking-[0.5em]">No hay registros para mostrar</p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
