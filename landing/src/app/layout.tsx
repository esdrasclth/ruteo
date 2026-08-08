import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Cada página del sitio define su propio título; esto es solo el respaldo.
export const metadata: Metadata = {
  title: "Ruteo",
  description:
    "Casillero, aduana y última milla en una sola operación, para empresas que traen paquetes del extranjero a Honduras.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* Red de seguridad: la aparición al hacer scroll arranca con el
            contenido a opacidad 0 y lo enciende el observador. Sin JS ese
            observador no llega nunca, así que la página se quedaría en blanco.
            Esta regla la deja visible y quieta. */}
        <noscript>
          <style
            dangerouslySetInnerHTML={{
              __html: ".reveal > *{opacity:1;transform:none}",
            }}
          />
        </noscript>
        {children}
      </body>
    </html>
  );
}
