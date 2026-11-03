// resources/js/App.tsx
import React, { useEffect, useState } from 'react';
import {
    Routes,
    Route,
    Navigate,
    useLocation,
    useNavigate,
} from 'react-router-dom';
import { ConfigProvider, Spin } from 'antd';
import { useAuthStore, registerNavigate } from './stores/authStore';
import Layout from './components/Layout/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Customers from './pages/Customers';
import ParkingSlots from './pages/ParkingSlots';
import FuelProducts from './pages/FuelProducts';
import InventoryManagement from './pages/InventoryManagement';
import Suppliers from './pages/Suppliers';
import Staff from './pages/Staff';
import Reports from './pages/Reports';
import Profile from './pages/Profile';
import Settings from './pages/Settings';
import SystemAnalytics from './pages/SystemAnalytics';
import Promos from './pages/Promo';
import ParkingCalendar from './pages/ParkingCalendar';
import ParkingRemittances from './pages/ParkingRemittances';
import Chat from './pages/Chat';
import { getAntdTheme, getInitialIsDark } from './theme/evergreen';

// ─── Protected Route Component ───────────────────────────────────────────────

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
    const { isAuthenticated } = useAuthStore();
    const location = useLocation();

    if (!isAuthenticated) {
        return <Navigate to="/login" state={{ from: location }} replace />;
    }
    return <>{children}</>;
};

// ─── Main App Component ──────────────────────────────────────────────────────

function App() {
    const { isAuthenticated, isLoading, checkAuth } = useAuthStore();
    const [initialized, setInitialized] = useState(false);
    const location = useLocation();
    const navigate = useNavigate();
    const [isDark, setIsDark] = useState(getInitialIsDark);

    useEffect(() => {
        registerNavigate((path: string) => navigate(path, { replace: true }));
    }, [navigate]);

    useEffect(() => {
        const init = async () => {
            try {
                await checkAuth();
            } catch (error) {
                console.error('Auth check failed:', error);
            } finally {
                setInitialized(true);
            }
        };
        init();
    }, [checkAuth]);

    useEffect(() => {
        const handleThemeChange = (e: CustomEvent) => {
            setIsDark(e.detail.isDark);
        };

        window.addEventListener(
            'theme-change',
            handleThemeChange as EventListener,
        );

        const observer = new MutationObserver(() => {
            const dark =
                document.documentElement.getAttribute('data-theme') === 'dark';
            setIsDark(dark);
        });

        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['data-theme'],
        });

        const handleStorageChange = (e: StorageEvent) => {
            if (e.key === 'theme') {
                const dark = e.newValue === 'dark';
                setIsDark(dark);
            }
        };

        window.addEventListener('storage', handleStorageChange);

        return () => {
            window.removeEventListener(
                'theme-change',
                handleThemeChange as EventListener,
            );
            observer.disconnect();
            window.removeEventListener('storage', handleStorageChange);
        };
    }, []);

    const isLoginPage = location.pathname === '/login';

    if (!isLoginPage && (!initialized || isLoading)) {
        return (
            <div
                className="app-loading"
                style={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    minHeight: '100vh',
                    background: 'var(--bg-primary)',
                }}
            >
                <Spin size="large" tip="Loading application..." />
            </div>
        );
    }

    if (isLoginPage) {
        return (
            <ConfigProvider theme={getAntdTheme(isDark)}>
                <Routes>
                    <Route
                        path="/login"
                        element={
                            isAuthenticated ? (
                                <Navigate to="/dashboard" replace />
                            ) : (
                                <Login />
                            )
                        }
                    />
                    <Route
                        path="*"
                        element={<Navigate to="/login" replace />}
                    />
                </Routes>
            </ConfigProvider>
        );
    }

    if (!isAuthenticated) {
        return (
            <ConfigProvider theme={getAntdTheme(isDark)}>
                <Routes>
                    <Route
                        path="*"
                        element={
                            <Navigate
                                to="/login"
                                state={{ from: location }}
                                replace
                            />
                        }
                    />
                </Routes>
            </ConfigProvider>
        );
    }

    return (
        <ConfigProvider theme={getAntdTheme(isDark)}>
            <Layout>
                <Routes>
                    <Route
                        path="/"
                        element={<Navigate to="/dashboard" replace />}
                    />
                    <Route
                        path="/login"
                        element={<Navigate to="/dashboard" replace />}
                    />
                    <Route path="/dashboard" element={<Dashboard />} />
                    <Route path="/customers" element={<Customers />} />
                    <Route
                        path="/parking-remittances"
                        element={<ParkingRemittances />}
                    />
                    <Route
                        path="/parking-calendar"
                        element={<ParkingCalendar />}
                    />
                    <Route path="/parking-slots" element={<ParkingSlots />} />
                    <Route path="/fuel-products" element={<FuelProducts />} />
                    <Route
                        path="/inventory"
                        element={<InventoryManagement />}
                    />
                    <Route path="/suppliers" element={<Suppliers />} />
                    <Route path="/reports" element={<Reports />} />
                    <Route path="/staff" element={<Staff />} />
                    <Route path="/profile" element={<Profile />} />
                    <Route path="/settings" element={<Settings />} />
                    <Route
                        path="/system-analytics"
                        element={<SystemAnalytics />}
                    />
                    <Route path="/promos" element={<Promos />} />
                    <Route path="/chat" element={<Chat />} />
                    <Route
                        path="*"
                        element={<Navigate to="/dashboard" replace />}
                    />
                </Routes>
            </Layout>
        </ConfigProvider>
    );
}

export default App;