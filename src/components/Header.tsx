import type { ReactNode } from 'react';

export default function Header({ children }: { children: ReactNode }) {
  return (
    <header className="header">
      <h1 className="wordmark">Curve</h1>
      <div className="header-actions">{children}</div>
    </header>
  );
}
