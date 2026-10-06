import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
import { queryClient } from './lib/queryClient';
import { AuthProvider } from './features/auth/AuthProvider';
import { ToastProvider } from './components/ui/Toast';
import './styles/global.css';
import { EmbeddedProvider } from './lib/EmbeddedProvider';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ToastProvider>
          <AuthProvider>
            <EmbeddedProvider>
              <App />
            </EmbeddedProvider>
          </AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);