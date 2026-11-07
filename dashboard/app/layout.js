import "./globals.css";

export const metadata = {
  title: "PulseCRM",
  description:
    "Multi-channel CRM and messaging platform for WhatsApp and Telegram",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full bg-slate-50 text-slate-900">{children}</body>
    </html>
  );
}
