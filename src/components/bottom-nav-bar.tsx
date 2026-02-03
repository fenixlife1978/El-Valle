
'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Plus } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { LucideIcon } from 'lucide-react';

type SubMenuItem = {
  href: string;
  icon: LucideIcon;
  label: string;
};

export type BottomNavItem = {
    href: string;
    icon: React.ElementType;
    label: string;
    isCentral?: boolean;
    subMenu?: SubMenuItem[];
};

export function BottomNavBar({ items, pathname }: { items: BottomNavItem[], pathname: string }) {
  const router = useRouter();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 flex h-16 items-center justify-around border-t bg-card p-2 sm:hidden">
      {items.map((item) => {
        const isActive = pathname === item.href;
        if (item.isCentral) {
          return (
            <div key={item.href} className="relative">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="default"
                    size="icon"
                    className="h-14 w-14 rounded-full shadow-lg border-2 border-background absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center justify-center"
                  >
                    <Plus className="h-7 w-7" />
                    <span className="sr-only">{item.label}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  side="top"
                  align="center"
                  className="w-56 mb-2"
                >
                  {item.subMenu?.map((subItem) => (
                    <DropdownMenuItem 
                      key={subItem.href} 
                      onClick={() => router.push(subItem.href)}
                      className="gap-2 cursor-pointer"
                    >
                      <subItem.icon className="h-4 w-4" />
                      <span>{subItem.label}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        }
        return (
          <button
            type="button"
            key={item.href}
            onClick={() => router.push(item.href)}
            className={cn(
              'flex flex-col items-center justify-center gap-1 rounded-md p-2 text-sm font-medium',
              isActive ? 'text-primary' : 'text-muted-foreground'
            )}
          >
            <item.icon className="h-6 w-6" />
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
