// resources/js/main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfigProvider } from 'antd';
import App from './App';
import '../css/app.css';
import api from './services/api';
import { getAntdTheme, getInitialIsDark, applyTheme } from './theme/evergreen';

// Create a client
const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            retry: 1,
            refetchOnWindowFocus: false,
            staleTime: 30000,
        },
    },
});

// ─── THEME ────────────────────────────────────────────────────────────────────
// Palette + Ant Design tokens live in ./theme/evergreen (shared with App.tsx).

const isDark = getInitialIsDark();

// Set data-theme before first render so the CSS variables match Ant Design.
// persist=false: keep following the device setting until the toggle is used.
applyTheme(isDark, false);

ReactDOM.createRoot(document.getElementById('app')!).render(
    <React.StrictMode>
        <ConfigProvider theme={getAntdTheme(isDark)}>
            <QueryClientProvider client={queryClient}>
                <BrowserRouter>
                    <App />
                </BrowserRouter>
            </QueryClientProvider>
        </ConfigProvider>
    </React.StrictMode>,
);

// ─── THEME CHANGE LISTENER ────────────────────────────────────────────────────

const observer = new MutationObserver(() => {
    const isDarkNow =
        document.documentElement.getAttribute('data-theme') === 'dark';
    window.dispatchEvent(
        new CustomEvent('theme-change', {
            detail: { isDark: isDarkNow },
        }),
    );
});

observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
});

window.addEventListener('storage', (e) => {
    if (e.key === 'theme') {
        const isDarkNow = e.newValue === 'dark';
        applyTheme(isDarkNow, false);
        window.dispatchEvent(
            new CustomEvent('theme-change', {
                detail: { isDark: isDarkNow },
            }),
        );
    }
});