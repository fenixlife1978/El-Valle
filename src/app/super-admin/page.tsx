
'use client';

import { useState, useEffect } from 'react';
import { db, auth } from '@/lib/firebase';
import { collection, onSnapshot, doc, updateDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Loader2, Trash2, Settings2, RefreshCcw, LogOut, 
  Edit2, Check, X, ShieldAlert 
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';

export default function SuperAdminPage() {
  const { user, loading: authLoading } = useAuth();
  const [condos, setCondos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newCondoName, setNewCondoName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', key: '' });

  const { toast } = useToast();
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && user?.email === 'vallecondo@gmail.com') {
      const unsub = onSnapshot(collection(db, 'condominios'), (snap) => {
        setCondos(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setLoading(false);
      });
      return () => unsub();
    }
  }, [user, authLoading]);

  const handleCreate = async () => {
    if (!newCondoName) return;
    const slug = newCondoName.toLowerCase().trim().replace(/\s+/g, '-');
    const condoId = `${slug}-${Math.floor(100 + Math.random() * 900)}`;
    
    try {
      await setDoc(doc(db, 'condominios', condoId), {
        name: newCondoName,
        nombre: newCondoName,
        registrationKey: `KEY-${Math.floor(1000 + Math.random() * 9000)}`,
        status: 'active',
        createdAt: new Date().toISOString(),
        // CAMPOS BASE PARA EVITAR ERRORES EN EL HEADER
        rif: "", 
        logo: "", 
        direccion: "",
        telefono: "",
        correo_contacto: ""
      });
      setNewCondoName('');
      toast({ title: "Servicio Activado", description: "Campos de configuración inicializados." });
    } catch (e) { 
      toast({ variant: 'destructive', title: "Error al crear" }); 
    }
  };

  const handleUpdate = async (id: string) => {
    try {
      await updateDoc(doc(db, 'condominios', id), {
        name: editForm.name,
        nombre: editForm.name,
        registrationKey: editForm.key
      });
      setEditingId(null);
      toast({ title: "Cambios guardados" });
    } catch (e) { toast({ variant: 'destructive', title: "Error" }); }
  };

  const handleSupport = (id: string) => {
    localStorage.setItem('support_mode_id', id);
    router.push('/admin/dashboard');
  };

  if (loading) return (
    <div className="flex h-screen items-center justify-center bg-slate-950">
        <Loader2 className="animate-spin text-amber-500 h-10 w-10" />
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 p-8 font-sans">
      <div className="max-w-6xl mx-auto flex justify-between items-start mb-8">
        <div className="mb-10">
          <h2 className="text-4xl font-black text-slate-900 uppercase tracking-tighter italic drop-shadow-sm">
            <span className="text-orange-500">EFAS</span>CONDOSYS <span className="text-slate-300 font-light">MASTER</span>
          </h2>
          <div className="h-1.5 w-20 bg-orange-500 mt-2 rounded-full"></div>
          <p className="text-slate-500 font-bold mt-3 text-sm uppercase tracking-wide">
            SUPER ADMIN: {user?.email}
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => signOut(auth)} className="bg-red-800 hover:bg-red-900 text-white font-bold rounded-xl px-6 uppercase italic">
            <LogOut className="w-4 h-4 mr-2" /> Salir
          </Button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto mb-10">
        <div className="bg-[#0f172a] text-white p-3 rounded-t-3xl flex items-center gap-2">
          <span className="text-orange-500 font-bold ml-4">+</span>
          <span className="text-[11px] font-black uppercase tracking-wider">Activar Nuevo Condominio</span>
        </div>
        <div className="bg-white p-8 rounded-b-3xl shadow-xl flex gap-4 items-center border border-slate-100">
          <Input 
            placeholder="Nombre del Condominio" 
            value={newCondoName}
            onChange={(e) => setNewCondoName(e.target.value)}
            className="flex-1 bg-slate-50 border-slate-200 h-14 rounded-2xl px-6 font-bold"
          />
          <Button onClick={handleCreate} className="bg-[#58b1e1] hover:bg-[#409cd0] text-slate-800 font-black h-14 px-12 rounded-2xl uppercase italic">
            Activar Servicio
          </Button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-100">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-slate-50 border-b text-[10px] font-black uppercase text-slate-400 tracking-widest">
              <th className="p-8">Cliente / ID</th>
              <th className="p-8">Key de Acceso</th>
              <th className="p-8">Estatus</th>
              <th className="p-8 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {condos.map((condo) => (
              <tr key={condo.id} className="border-b hover:bg-slate-50/50 transition-colors">
                <td className="p-8">
                  {editingId === condo.id ? (
                    <Input value={editForm.name} onChange={(e) => setEditForm({...editForm, name: e.target.value})} className="h-10 font-black uppercase" />
                  ) : (
                    <>
                      <div className="font-black text-slate-700 uppercase italic leading-none">{condo.name || condo.nombre}</div>
                      <div className="text-[10px] font-bold text-blue-400 mt-1">{condo.id}</div>
                    </>
                  )}
                </td>
                <td className="p-8">
                  {editingId === condo.id ? (
                    <Input value={editForm.key} onChange={(e) => setEditForm({...editForm, key: e.target.value})} className="h-10 font-mono" />
                  ) : (
                    <span className="font-mono text-xs font-black text-slate-400 bg-slate-100 px-2 py-1 rounded">{condo.registrationKey}</span>
                  )}
                </td>
                <td className="p-8">
                  <span className={`px-4 py-1 rounded-full text-[10px] font-black uppercase ${condo.status === 'active' ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'}`}>
                    {condo.status === 'active' ? '● Activo' : '● Suspendido'}
                  </span>
                </td>
                <td className="p-8 text-right flex justify-end gap-2">
                  {editingId === condo.id ? (
                    <Button onClick={() => handleUpdate(condo.id)} size="icon" className="bg-green-500 h-10 w-10"><Check /></Button>
                  ) : (
                    <>
                      <Button onClick={() => handleSupport(condo.id)} variant="outline" className="border-slate-200 font-black text-[10px] uppercase rounded-xl h-10">
                        <Settings2 className="w-3 h-3 mr-2" /> Gestionar
                      </Button>
                      <Button onClick={() => { setEditingId(condo.id); setEditForm({ name: condo.name || condo.nombre, key: condo.registrationKey }); }} variant="ghost" size="icon" className="text-slate-400"><Edit2 className="w-4 h-4" /></Button>
                      <Button onClick={() => deleteDoc(doc(db, 'condominios', condo.id))} variant="ghost" size="icon" className="text-slate-200 hover:text-red-500"><Trash2 className="w-4 h-4" /></Button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
