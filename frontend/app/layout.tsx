import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/layout/Sidebar";
import { ThemeProvider } from "@/components/layout/ThemeProvider";

export const metadata: Metadata = {
  title: "Rappi Ops — Sistema de Alertas",
  description: "Sistema de alertas operacionales con AI para Rappi Monterrey",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className="flex min-h-screen bg-[var(--bg)]">
        <ThemeProvider>
          <Sidebar />
          <main className="flex-1 flex flex-col min-h-screen overflow-auto">
            {children}
          </main>
        </ThemeProvider>
      </body>
    </html>
  );
}
