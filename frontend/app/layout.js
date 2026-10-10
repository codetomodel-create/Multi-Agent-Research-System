import "./globals.css";

export const metadata = {
  title: "MarketIntelligence | Multi-Agent Research Observatory",
  description:
    "A multi-agent market research system: seven LiteLLM-routed agents plan, research in parallel, synthesise and audit a C-suite report, visualised as a live 3D constellation.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// Applies the stored theme before first paint. Without this the static export
// ships the dark token set and light-theme users get a flash of the wrong
// palette on every load.
const THEME_BOOTSTRAP = `
(function () {
  try {
    if (/[?&]demo=1(?:&|$)/.test(location.search)) {
      localStorage.setItem('mr_tour_done', 'true');
    }
    var t = JSON.parse(localStorage.getItem('mr_theme') || '"dark"');
    if (['dark','light','solarized'].indexOf(t) === -1) t = 'dark';
    document.documentElement.setAttribute('data-theme', t);
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();
`;

export default function RootLayout({ children }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
