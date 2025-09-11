import type { Metadata } from "next";
import { Inter, Roboto_Mono } from "next/font/google";
import 'bootstrap/dist/css/bootstrap.min.css';
import "./globals.css";
import AuthSessionProvider from "@/components/SessionProvider";
import Navigation from "@/components/Navigation";
import { ToastProvider } from "@/contexts/ToastContext";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const robotoMono = Roboto_Mono({
  variable: "--font-roboto-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Dashboard Project",
  description: "Dashboard application with Next.js and Bootstrap",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link 
          rel="stylesheet" 
          href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.css" 
        />
      </head>
      <body
        className={`${inter.variable} ${robotoMono.variable} antialiased`}
      >
        <AuthSessionProvider>
          <ToastProvider>
            <Navigation />
            <div className="container-fluid">
              {children}
            </div>
          </ToastProvider>
        </AuthSessionProvider>
      </body>
    </html>
  );
}
