import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SidebarLayout } from "@/components/sidebar";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: 'SmartService',
  description: 'Sistema de gestión de servicios de seguridad.',
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <SidebarLayout>{children}</SidebarLayout>
      </body>
    </html>
  );
}
