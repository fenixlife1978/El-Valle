'use client';
import {useCallback} from 'react';
import {useAuth} from '@/hooks/use-auth';
import {useOfflineSync} from '@/hooks/use-offline-sync';
import type {OfflineOperation} from '@/lib/offline-outbox';
export function OfflineSyncBridge(){const {activeCondoId,role}=useAuth();const send=useCallback(async(op:OfflineOperation):Promise<'success'|'conflict'>=>{const r=await fetch('/api/offline/sync',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({condoId:op.condoId,operations:[{id:op.id,idempotencyKey:op.idempotencyKey,entity:op.entity,action:op.action,payload:op.payload}]})});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Falló la sincronización.');return d.results?.[0]?.status==='success'?'success':'conflict';},[]);useOfflineSync(activeCondoId,send);return null;}
