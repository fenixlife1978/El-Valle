
'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Plus } from 'lucide-react';

type BottomNavItem = {
    href: string;
    icon: React.ElementType;
    label: string;
    isCentral?: boolean;
};

export function BottomNavBar({ items, pathname }: { items: BottomNavItem[], pathname: string }) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 flex h-20 items-center justify-around border-t bg-card p-2 sm:hidden">
      {items.map((item) => {
        const isActive = pathname === item.href;
        if (item.isCentral) {
          return (
            <Link
              href={item.href}
              key={item.href}
              className="-mt-8 flex h-16 w-16 flex-col items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg"
            >
              <item.icon className="h-8 w-8" />
              <span className="sr-only">{item.label}</span>
            </Link>
          );
        }
        return (
          <Link
            href={item.href}
            key={item.href}
            className={cn(
              'flex flex-col items-center justify-center gap-1 rounded-md p-2 text-sm font-medium',
              isActive ? 'text-primary' : 'text-muted-foreground'
            )}
          >
            <item.icon className="h-6 w-6" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
