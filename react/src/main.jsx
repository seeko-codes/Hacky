import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import Dashboard from './Dashboard';
import { SessionProvider } from './session';
const dashboard=location.pathname==='/'||location.pathname.startsWith('/event-demo');
const styles=dashboard?['/event-demo/dashboard.css']:['/app/hacky.css','/app/hacky-customizer.css','/app/hacky-events.css','/app/hacky-plan.css'];
for(const href of styles){const link=document.createElement('link');link.rel='stylesheet';link.href=href;document.head.append(link);}
if(dashboard){document.title='Knight Hacks IX · Hacker dashboard';document.documentElement.removeAttribute('data-theme');}
createRoot(document.getElementById('root')).render(<React.StrictMode><SessionProvider>{dashboard?<Dashboard/>:<App/>}</SessionProvider></React.StrictMode>);
