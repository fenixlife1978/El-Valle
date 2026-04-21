import { db } from '@/lib/firebase';
import { collection, getDocs, query, where, doc, updateDoc, writeBatch } from 'firebase/firestore';

const CONDO_ID = 'condo_01'; // Cambia esto si tu condoId es diferente

interface ExtraordinaryFund {
    id: string;
    ownerId: string;
    campaignId: string;
    campaignName: string;
    monto: number;
    montoUSD: number;
    exchangeRate: number;
    sourcePaymentId: string;
    fecha: any;
}

interface OwnerExtraordinaryDebt {
    id: string;
    ownerId: string;
    debtId: string;
    amountUSD: number;
    status: 'pending' | 'partial' | 'paid';
    pendingUSD?: number;
    amountPaidBs?: number;
    amountPaidUSD?: number;
    partialPayments?: any[];
}

async function syncExtraordinaryDebts() {
    console.log('🚀 Iniciando sincronización de deudas extraordinarias...');
    console.log(`📁 Condominio: ${CONDO_ID}`);
    
    try {
        // 1. Obtener todos los pagos de extraordinary_funds
        const fundsQuery = query(
            collection(db, 'condominios', CONDO_ID, 'extraordinary_funds'),
            where('tipo', '==', 'ingreso')
        );
        
        const fundsSnapshot = await getDocs(fundsQuery);
        const payments = fundsSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        })) as ExtraordinaryFund[];
        
        console.log(`💰 Encontrados ${payments.length} pagos en extraordinary_funds`);
        
        // 2. Obtener todas las deudas
        const debtsQuery = query(
            collection(db, 'condominios', CONDO_ID, 'owner_extraordinary_debts')
        );
        
        const debtsSnapshot = await getDocs(debtsQuery);
        const debts = debtsSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        })) as OwnerExtraordinaryDebt[];
        
        console.log(`📋 Encontradas ${debts.length} deudas en owner_extraordinary_debts`);
        
        // 3. Agrupar pagos por ownerId + debtId (campaña)
        const paymentsByOwnerAndCampaign: Record<string, ExtraordinaryFund[]> = {};
        
        for (const payment of payments) {
            if (!payment.ownerId || !payment.campaignId) {
                console.warn(`⚠️ Pago ${payment.id} no tiene ownerId o campaignId`);
                continue;
            }
            
            const key = `${payment.ownerId}_${payment.campaignId}`;
            if (!paymentsByOwnerAndCampaign[key]) {
                paymentsByOwnerAndCampaign[key] = [];
            }
            paymentsByOwnerAndCampaign[key].push(payment);
        }
        
        console.log(`🔑 Agrupados en ${Object.keys(paymentsByOwnerAndCampaign).length} combinaciones owner/campaña`);
        
        // 4. Para cada deuda, calcular el total pagado y actualizar
        const batch = writeBatch(db);
        let updateCount = 0;
        const updates: any[] = [];
        
        for (const debt of debts) {
            const key = `${debt.ownerId}_${debt.debtId}`;
            const debtPayments = paymentsByOwnerAndCampaign[key] || [];
            
            if (debtPayments.length === 0) {
                // No tiene pagos, asegurar que esté en pending
                if (debt.status !== 'pending') {
                    updates.push({
                        debtId: debt.id,
                        ownerName: debt.ownerId,
                        campaignName: debt.debtId,
                        oldStatus: debt.status,
                        newStatus: 'pending'
                    });
                    
                    const debtRef = doc(db, 'condominios', CONDO_ID, 'owner_extraordinary_debts', debt.id);
                    batch.update(debtRef, {
                        status: 'pending',
                        pendingUSD: debt.amountUSD,
                        amountPaidBs: 0,
                        amountPaidUSD: 0,
                        partialPayments: []
                    });
                    updateCount++;
                }
                continue;
            }
            
            // Ordenar pagos por fecha
            debtPayments.sort((a, b) => {
                const dateA = a.fecha?.toDate?.() || new Date(0);
                const dateB = b.fecha?.toDate?.() || new Date(0);
                return dateA.getTime() - dateB.getTime();
            });
            
            // Calcular totales
            let totalPaidUSD = 0;
            let totalPaidBs = 0;
            const partialPayments: any[] = [];
            
            for (const payment of debtPayments) {
                totalPaidUSD += payment.montoUSD || 0;
                totalPaidBs += payment.monto || 0;
                
                partialPayments.push({
                    amountUSD: payment.montoUSD || 0,
                    amountBs: payment.monto || 0,
                    date: payment.fecha,
                    paymentId: payment.sourcePaymentId || payment.id,
                    exchangeRate: payment.exchangeRate
                });
            }
            
            const pendingUSD = Math.max(0, debt.amountUSD - totalPaidUSD);
            
            let newStatus: 'pending' | 'partial' | 'paid';
            if (pendingUSD <= 0.01) {
                newStatus = 'paid';
            } else if (totalPaidUSD > 0) {
                newStatus = 'partial';
            } else {
                newStatus = 'pending';
            }
            
            // Verificar si necesita actualización
            const needsUpdate = 
                debt.status !== newStatus ||
                (debt.pendingUSD || debt.amountUSD) !== pendingUSD ||
                (debt.amountPaidUSD || 0) !== totalPaidUSD;
            
            if (needsUpdate) {
                updates.push({
                    debtId: debt.id,
                    ownerId: debt.ownerId,
                    campaignId: debt.debtId,
                    oldStatus: debt.status,
                    newStatus: newStatus,
                    totalPaidUSD: totalPaidUSD,
                    pendingUSD: pendingUSD,
                    paymentsCount: debtPayments.length
                });
                
                const debtRef = doc(db, 'condominios', CONDO_ID, 'owner_extraordinary_debts', debt.id);
                batch.update(debtRef, {
                    status: newStatus,
                    pendingUSD: pendingUSD,
                    amountPaidBs: totalPaidBs,
                    amountPaidUSD: totalPaidUSD,
                    partialPayments: partialPayments,
                    updatedAt: new Date()
                });
                updateCount++;
            }
        }
        
        // 5. Ejecutar batch
        if (updateCount > 0) {
            await batch.commit();
            console.log(`✅ Sincronización completada. ${updateCount} deudas actualizadas.`);
            
            console.log('\n📊 RESUMEN DE CAMBIOS:');
            console.log('─'.repeat(80));
            
            const byCampaign: Record<string, any[]> = {};
            for (const update of updates) {
                const campaignId = update.campaignId || 'desconocida';
                if (!byCampaign[campaignId]) {
                    byCampaign[campaignId] = [];
                }
                byCampaign[campaignId].push(update);
            }
            
            for (const [campaignId, campaignUpdates] of Object.entries(byCampaign)) {
                console.log(`\n📁 Campaña: ${campaignId}`);
                console.log(`   Actualizaciones: ${campaignUpdates.length}`);
                
                const statusChanges = campaignUpdates.reduce((acc, u) => {
                    const key = `${u.oldStatus} → ${u.newStatus}`;
                    acc[key] = (acc[key] || 0) + 1;
                    return acc;
                }, {} as Record<string, number>);
                
                for (const [change, count] of Object.entries(statusChanges)) {
                    console.log(`   - ${change}: ${count} propietarios`);
                }
            }
        } else {
            console.log('✅ Todas las deudas ya están sincronizadas. No se requieren cambios.');
        }
        
        // 6. Mostrar deudas sin pagos pero con estado incorrecto
        const pendingWithoutPayments = debts.filter(d => 
            d.status !== 'pending' && 
            !paymentsByOwnerAndCampaign[`${d.ownerId}_${d.debtId}`]
        );
        
        if (pendingWithoutPayments.length > 0) {
            console.log(`\n⚠️ ${pendingWithoutPayments.length} deudas marcadas como pagadas/parciales pero sin pagos registrados.`);
            console.log('   Se han corregido a "pending".');
        }
        
        console.log('\n✨ Sincronización finalizada.');
        
    } catch (error) {
        console.error('❌ Error durante la sincronización:', error);
    }
}

// Ejecutar el script
syncExtraordinaryDebts().then(() => {
    console.log('🏁 Script completado.');
    process.exit(0);
}).catch(error => {
    console.error('💥 Error fatal:', error);
    process.exit(1);
});