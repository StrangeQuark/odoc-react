import type { ReactNode } from 'react';
import { Route, Routes } from 'react-router-dom';

/**
 * Route composition deliberately contains no screen logic. App-level providers
 * and feature-owned screens are supplied by the bootstrap layer, leaving this
 * module as the one place that owns public route matching.
 */
export function AppRoutes({
  catalog,
  forbidden,
  home,
  notFound,
}: {
  catalog: ReactNode;
  forbidden: ReactNode;
  home: ReactNode;
  notFound: ReactNode;
}) {
  return (
    <Routes>
      <Route path="/" element={home} />
      <Route path="/forbidden" element={forbidden} />
      <Route path="/ui-preview" element={catalog} />
      <Route path="*" element={notFound} />
    </Routes>
  );
}
