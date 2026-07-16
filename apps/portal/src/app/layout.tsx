import type { Metadata } from "next";
import { ThemeProvider } from "@/components/ThemeProvider";
import { UploadQueueProvider } from "@/components/UploadQueueProvider";
import { UploadProgressWidget } from "@/components/UploadProgressWidget";
import "./globals.css";

export const metadata: Metadata = {
  title: "InfinityWork",
  description: "Portal único de arquivos, documentos e planilhas",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <ThemeProvider>
          <UploadQueueProvider>
            {children}
            <UploadProgressWidget />
          </UploadQueueProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
