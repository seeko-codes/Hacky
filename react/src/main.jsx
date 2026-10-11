import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { SessionProvider } from './session';
// Demo entry: select a person first. The KnightHacks clone is kept in the repo,
// but its old route is inactive while the demo opens directly into Hacky.
if (location.pathname === '/' || location.pathname.startsWith('/event-demo')) {
  location.replace('/api/demo/portal');
} else {
  const styles = ['/app/hacky.css', '/app/hacky-customizer.css', '/app/hacky-events.css', '/app/hacky-plan.css'];
  for (const href of styles) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.append(link);
  }
  createRoot(document.getElementById('root')).render(<React.StrictMode><SessionProvider><App/></SessionProvider></React.StrictMode>);
}
