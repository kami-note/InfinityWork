import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "InfinityWork",
  description: "Portal único de arquivos, documentos e planilhas",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
