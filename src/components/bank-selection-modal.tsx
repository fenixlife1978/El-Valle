
'use client';

import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { VENEZUELAN_BANKS } from '@/lib/banks';
import { Search } from 'lucide-react';

interface BankSelectionModalProps {
    isOpen: boolean;
    onOpenChange: (isOpen: boolean) => void;
    selectedValue: string;
    onSelect: (value: string) => void;
}

export function BankSelectionModal({ isOpen, onOpenChange, selectedValue, onSelect }: BankSelectionModalProps) {
    const [searchTerm, setSearchTerm] = useState('');

    const filteredBanks = useMemo(() => {
        if (!searchTerm) {
            return VENEZUELAN_BANKS;
        }
        const lowercasedFilter = searchTerm.toLowerCase();
        return VENEZUELAN_BANKS.filter(bank =>
            bank.label.toLowerCase().includes(lowercasedFilter)
        );
    }, [searchTerm]);

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Seleccionar Banco Emisor</DialogTitle>
                    <DialogDescription>
                        Busque y seleccione el banco desde el cual se realizó el pago.
                    </DialogDescription>
                </DialogHeader>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        placeholder="Buscar banco..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-9"
                    />
                </div>
                <ScrollArea className="h-72 w-full rounded-md border">
                    <div className="p-2">
                        {filteredBanks.map((bank) => (
                            <div
                                key={bank.value}
                                onClick={() => onSelect(bank.label)}
                                className="flex cursor-pointer items-center rounded-sm p-3 text-sm hover:bg-accent"
                            >
                                {bank.label}
                            </div>
                        ))}
                    </div>
                </ScrollArea>
            </DialogContent>
        </Dialog>
    );
}
