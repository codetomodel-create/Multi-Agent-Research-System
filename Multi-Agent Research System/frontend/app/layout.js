import "./globals.css";

export const metadata = {
  title: "MarketIntelligence | AI Market Research Assistant",
  description: "Dynamic config-driven multi-agent C-suite intelligence system routing tasks dynamically between light research and heavy critique models using LiteLLM.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
