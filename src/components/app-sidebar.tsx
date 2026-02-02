"use client"

import * as React from "react"
import { useParams, usePathname } from "next/navigation"
import {
  LayoutDashboard,
  Users,
  CreditCard,
  FileText,
  Megaphone,
  Settings,
  ShieldCheck,
  Building,
  CalendarDays,
  Hammer
} from "lucide-react"

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"

const navItems = [
  { title: "Panel Principal", url: "/admin/dashboard", icon: LayoutDashboard },
  { title: "Residentes", url: "/admin/residents", icon: Users },
  { title: "Cuentas por Cobrar", url: "/admin/billing", icon: CreditCard },
  { title: "Noticias y Avisos", url: "/admin/news", icon: Megaphone },
  { title: "Documentos", url: "/admin/documents", icon: FileText },
  { title: "Instalaciones", url: "/admin/facilities", icon: Building },
  { title: "Mantenimiento", url: "/admin/maintenance", icon: Hammer },
  { title: "Configuración", url: "/admin/settings", icon: Settings },
]

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const params = useParams()
  const pathname = usePathname()
  const condoId = params?.condoId as string

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader className="h-20 flex items-center justify-center border-b border-sidebar-border">
        <div className="flex items-center gap-3 px-4 py-2 bg-primary/10 rounded-xl border border-primary/20 group-data-[collapsible=icon]:p-0">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shrink-0">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div className="flex flex-col group-data-[collapsible=icon]:hidden">
            <span className="font-black text-xs tracking-tighter uppercase leading-none text-primary">EFAS</span>
            <span className="text-[10px] font-bold text-muted-foreground uppercase leading-none mt-1">CondoSys</span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="px-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground/50">Administración</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const dynamicUrl = `/${condoId}${item.url}`
                const isActive = pathname === dynamicUrl
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild tooltip={item.title} isActive={isActive} className={isActive ? "bg-primary/10 text-primary font-bold" : ""}>
                      <a href={dynamicUrl}>
                        <item.icon className={isActive ? "text-primary" : "text-muted-foreground"} />
                        <span className="text-sm">{item.title}</span>
                      </a>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  )
}
