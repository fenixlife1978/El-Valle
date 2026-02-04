'use client';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, AreaChart, Area, CartesianGrid } from 'recharts';
import { format, subMonths, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { es } from 'date-fns/locale';

interface AdminChartsProps {
    payments: any[];
    currentRate: number;
}

export default function AdminCharts({ payments, currentRate }: AdminChartsProps) {
    const getStreetData = () => {
        const streetMap: { [key: string]: number } = {};
        payments.filter(p => p.status === 'aprobado').forEach(p => {
            const calle = p.beneficiaries?.[0]?.street || p.street || "S/D";
            const montoUsd = (p.totalAmount || 0) / (p.exchangeRate || currentRate);
            streetMap[calle] = (streetMap[calle] || 0) + montoUsd;
        });
        return Object.keys(streetMap).map(name => ({
            name: name.toUpperCase(),
            usd: parseFloat(streetMap[name].toFixed(2))
        })).sort((a, b) => b.usd - a.usd);
    };
    const getMonthlyData = () => {
        return Array.from({ length: 6 }).map((_, i) => {
            const date = subMonths(new Date(), i);
            const start = startOfMonth(date);
            const end = endOfMonth(date);
            let totalUsd = 0;
            payments.filter(p => p.status === 'aprobado').forEach(p => {
                const pDate = p.paymentDate?.toDate?.() || (p.paymentDate ? new Date(p.paymentDate) : null);
                if (pDate && isWithinInterval(pDate, { start, end })) {
                    totalUsd += (p.totalAmount || 0) / (p.exchangeRate || currentRate);
                }
            });
            return {
                month: format(date, 'MMM', { locale: es }).toUpperCase(),
                usd: parseFloat(totalUsd.toFixed(2))
            };
        }).reverse();
    };

    const streetData = getStreetData();
    const monthlyData = getMonthlyData();

    return (
        <div className="grid gap-6 md:grid-cols-2">
            <Card className="rounded-[2rem] border-none shadow-xl bg-white overflow-hidden">
                <CardHeader className="bg-slate-900 pb-6">
                    <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-500 italic">
                        Recaudación por Calle (USD)
                    </CardTitle>
                </CardHeader>
                <CardContent className="pt-8 h-64">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={streetData}>
                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 900, fill: '#64748b' }} />
                            <Tooltip cursor={{fill: '#f1f5f9'}} contentStyle={{ borderRadius: '15px', border: 'none', fontSize: '12px' }} />
                            <Bar dataKey="usd" radius={[8, 8, 8, 8]} barSize={30}>
                                {streetData.map((_, i) => (
                                    <Cell key={i} fill={i % 2 === 0 ? '#0f172a' : '#f59e0b'} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>
            <Card className="rounded-[2rem] border-none shadow-xl bg-white overflow-hidden">
                <CardHeader className="bg-slate-900 pb-6">
                    <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-sky-400 italic">
                        Ingresos Mensuales (USD)
                    </CardTitle>
                </CardHeader>
                <CardContent className="pt-8 h-64">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={monthlyData}>
                            <defs>
                                <linearGradient id="colorUsd" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.3}/>
                                    <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0}/>
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 900, fill: '#64748b' }} />
                            <Tooltip contentStyle={{ borderRadius: '15px', border: 'none', fontSize: '12px' }} />
                            <Area type="monotone" dataKey="usd" stroke="#0ea5e9" strokeWidth={4} fillOpacity={1} fill="url(#colorUsd)" />
                        </AreaChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>
        </div>
    );
}
