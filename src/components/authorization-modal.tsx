"use client";

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, ShieldCheck } from 'lucide-react';

interface AuthorizationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onVerify: (key: string) => Promise<void>;
  isVerifying: boolean;
}

export function AuthorizationModal({ isOpen, onClose, onVerify, isVerifying }: AuthorizationModalProps) {
  const [enteredKey, setEnteredKey] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onVerify(enteredKey);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Acción Protegida</DialogTitle>
            <DialogDescription>
              Para continuar, por favor ingrese la clave de autorización del administrador.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="auth-key">Clave de Autorización</Label>
              <Input
                id="auth-key"
                type="password"
                value={enteredKey}
                onChange={(e) => setEnteredKey(e.target.value)}
                required
                disabled={isVerifying}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isVerifying}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isVerifying}>
              {isVerifying ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ShieldCheck className="mr-2 h-4 w-4" />
              )}
              Autorizar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
