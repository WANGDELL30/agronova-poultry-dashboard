'use client';

import { useEffect } from 'react';

/**
 * Last-resort boundary for errors in the root layout or its providers (AUDIT H2). It replaces the
 * whole document, so it renders its own <html>/<body> and uses static bilingual text instead of
 * the language provider, which may be the component that failed.
 */
export default function GlobalError({
  error,
  reset,
}: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="id">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          fontFamily: 'system-ui, sans-serif',
          background: '#f6f8f5',
          color: '#17231c',
        }}
      >
        <main role="alert" style={{ maxWidth: 480, padding: 24, textAlign: 'center' }}>
          <h1 style={{ fontSize: 22, margin: '0 0 8px' }}>Aplikasi gagal dimuat</h1>
          <p style={{ margin: '0 0 4px' }}>
            Terjadi kesalahan saat memuat dashboard AgroNova. Coba muat ulang halaman.
          </p>
          <p lang="en" style={{ margin: '0 0 20px', color: '#4b5a51' }}>
            The application failed to load. An error occurred while loading the AgroNova dashboard.
            Try reloading the page.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              padding: '10px 18px',
              border: 0,
              borderRadius: 8,
              background: '#1f7a4d',
              color: '#fff',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Coba lagi / Try again
          </button>
        </main>
      </body>
    </html>
  );
}
