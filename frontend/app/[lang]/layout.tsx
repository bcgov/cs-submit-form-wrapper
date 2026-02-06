import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "../globals.css";
import DictionaryProvider from './Providers';
import { Locale } from "./dictionaries";
import { getDictionary } from "./dictionaries";
import { Header } from "../ui/Header";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export default async function RootLayout({
  children,
  params
}: Readonly<{
  children: React.ReactNode;
  params: { lang: Locale };
}>) {
  const param = await params;
  const dictionary = await getDictionary(param.lang);
  return (
    <html lang={param.lang}>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <DictionaryProvider dictionary={dictionary}>
          <Header />
          {children}
        </DictionaryProvider>
      </body>
    </html>
  );
}
