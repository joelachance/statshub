import "./globals.css";

export const metadata = {
  title: "statshub — engineering activity",
  description: "Aggregated coding activity across Claude Code, Codex, Cursor and GitHub.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
