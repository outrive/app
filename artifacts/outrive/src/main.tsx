import { createRoot } from 'react-dom/client';
import { setBaseUrl } from '@workspace/api-client-react';

import App from './App';

import './index.css';

// Ensure the auto-generated API client resolves relative URLs correctly
// when the app is served under a sub-path (e.g. /outrive/).
const base = (import.meta.env.BASE_URL ?? '').replace(/\/+$/, '');
setBaseUrl(base || null);

createRoot(document.getElementById('root')!).render(<App />);
