import type { Metadata } from 'next';
import { ThemeProvider } from '@mui/material/styles';
import { AppRouterCacheProvider } from '@mui/material-nextjs/v16-appRouter';
import { DM_Mono, DM_Sans, Playfair_Display } from 'next/font/google';
import theme from '@/theme';
import './globals.css';

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm-sans',
  display: 'swap',
  weight: ['400', '500', '600'],
  style: ['normal', 'italic'],
  // Removed `axes` because Next.js requires `weight: 'variable'` when axes are defined.
});

const dmMono = DM_Mono({
  subsets: ['latin'],
  variable: '--font-dm-mono',
  display: 'swap',
  weight: ['400', '500'],
});

const playfairDisplay = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-playfair',
  display: 'swap',
  weight: ['600', '700'],
});

export const metadata: Metadata = {
  title: {
    default: 'Bunge Mkononi',
    template: '%s | Bunge Mkononi',
  },
  description: 'Track Kenyan Parliament bills, votes, and citizen participation in one place.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased" data-scroll-behavior="smooth">
      <body className={`${dmSans.variable} ${dmMono.variable} ${playfairDisplay.variable} min-h-full text-foreground`}>
        <AppRouterCacheProvider options={{ enableCssLayer: true }}>
          <ThemeProvider theme={theme}>{children}</ThemeProvider>
        </AppRouterCacheProvider>
      </body>
    </html>
  );
}
