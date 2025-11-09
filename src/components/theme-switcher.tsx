
"use client"

import * as React from "react"
import { useTheme } from "next-themes"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const themes = [
    { name: "Oscuro", value: "dark", colors: ["#263238", "#81C784"] },
    { name: "Océano", value: "theme-ocean", colors: ["#0F2B4B", "#78DCE8"] },
    { name: "Bosque", value: "theme-forest", colors: ["#223D22", "#88C088"] },
    { name: "Atardecer", value: "theme-sunset", colors: ["#4B1F21", "#FF8C8C"] },
    { name: "Amanecer", value: "theme-sunrise", colors: ["#FFF8F0", "#FF6B6B"] },
]

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme()

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {themes.map((t) => (
        <div key={t.value} onClick={() => setTheme(t.value)} className="cursor-pointer">
          <div
            className={cn(
              "h-16 w-full rounded-md border-2 transition-all",
              theme === t.value ? "border-primary" : "border-muted"
            )}
          >
            <div className="h-full w-full rounded-md p-2 flex gap-1">
                <div className="h-full w-1/2 rounded" style={{ backgroundColor: t.colors[0] }}></div>
                <div className="h-full w-1/2 rounded" style={{ backgroundColor: t.colors[1] }}></div>
            </div>
          </div>
          <p className="text-center text-sm mt-2 font-medium">{t.name}</p>
        </div>
      ))}
    </div>
  )
}
