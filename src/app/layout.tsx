
import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider } from "@/hooks/use-auth";
import { AuthorizationProvider } from "@/hooks/use-authorization";
import { SupportBanner } from "@/components/support-banner";

const montserrat = Montserrat({
  subsets: ["latin"],
  display: 'swap',
  variable: "--font-montserrat",
});

export const metadata: Metadata = {
  title: "EFAS CondoSys",
  description: "Sistema de autogestión de condominios by EFAS.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={montserrat.variable} suppressHydrationWarning>
      <body className="font-body">
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <AuthProvider>
            <AuthorizationProvider>
              <SupportBanner />
              {children}
              <Toaster />
            </AuthorizationProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
