import { ShieldAlert, Phone } from 'lucide-react';
export default function SuspendedPage() {
    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-white p-6 text-center">
            <div className="bg-rose-50 p-8 rounded-[3rem] mb-8"><ShieldAlert className="w-20 h-20 text-rose-600" /></div>
            <h1 className="font-black italic text-4xl text-slate-900 uppercase tracking-tighter mb-4">Servicio Suspendido</h1>
            <p className="max-w-md text-slate-500 mb-8 font-medium">El acceso ha sido restringido temporalmente. Contacte a EFAS CondoSys para regularizar su estatus.</p>
            <div className="bg-slate-900 text-white px-8 py-4 rounded-2xl font-bold uppercase text-xs tracking-widest">Soporte: vallecondo@gmail.com</div>
        </div>
    );
}
