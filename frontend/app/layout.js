import "./globals.css";

export const metadata = {
  title: "MarketIntelligence | AI Market Research Assistant",
  description: "Dynamic config-driven multi-agent C-suite intelligence system routing tasks dynamically between light research and heavy critique models using LiteLLM.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
