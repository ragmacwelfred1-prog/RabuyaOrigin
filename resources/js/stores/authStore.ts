// stores/authStore.ts
import { create } from 'zustand';
import api from '../services/api';

interface User {
    id: number;
    first_name: string;
    last_name: string;
    email: string;
    role: string;
    phone_number?: string;
}

interface AuthState {
    user: User | null;
    token: string | null;
    userType: string | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    error: string | null;

    login: (
        email: string,
        password: string,
        type: 'admin' | 'staff' | 'customer'
    ) => Promise<{
        success: boolean;
        message?: string;
        otp_required?: boolean;
        challenge?: string;
        email_hint?: string;
    }>;

    completeLogin: (token: string, user: User, userType: string) => void;

    logout: () => void;
    checkAuth: () => Promise<void>;
    clearError: () => void;
    setUser: (user: User | null) => void;
}

// ============================================================
// Soft navigation hook
//
// authStore lives outside React, so it can't call useNavigate().
// App.tsx registers the router's navigate function here once, and
// the axios interceptor uses it instead of window.location.href,
// which would trigger a full page reload.
// ============================================================
let navigateFn: ((path: string) => void) | null = null;

export const registerNavigate = (fn: (path: string) => void) => {
    navigateFn = fn;
};

const softNavigate = (path: string) => {
    if (navigateFn) {
        navigateFn(path);
    } else {
        // Fallback — should only happen if App hasn't mounted yet.
        console.warn('navigateFn not registered, falling back to history API');
        window.history.pushState({}, '', path);
        window.dispatchEvent(new PopStateEvent('popstate'));
    }
};

export const useAuthStore = create<AuthState>((set, get) => ({
    user: null,
    token: localStorage.getItem('token'),
    userType: localStorage.getItem('user_type'),
    isAuthenticated: !!localStorage.getItem('token'),
    isLoading: false,
    error: null,

    // ============================================================
    // checkAuth — the ONLY place global isLoading should be touched
    // ============================================================
    checkAuth: async () => {
        const token = localStorage.getItem('token');
        const storedUserType = localStorage.getItem('user_type');

        if (!token || !storedUserType) {
            set({
                isAuthenticated: false,
                user: null,
                token: null,
                userType: null,
                isLoading: false,
            });
            return;
        }

        if (storedUserType !== 'admin') {
            set({
                isAuthenticated: false,
                user: null,
                token: null,
                userType: null,
                isLoading: false,
            });
            localStorage.removeItem('token');
            localStorage.removeItem('user_type');
            localStorage.removeItem('user');
            return;
        }

        set({ isLoading: true });

        try {
            api.defaults.headers.common['Authorization'] = `Bearer ${token}`;

            const response = await api.get('/me');
            const userData = response.data;

            if (userData.role !== 'admin') {
                throw new Error('User is not an admin');
            }

            localStorage.setItem('user', JSON.stringify(userData));

            set({
                user: userData,
                userType: userData.role,
                isAuthenticated: true,
                isLoading: false,
                error: null,
            });
        } catch (error: any) {
            console.error('Check auth error:', error);
            localStorage.removeItem('token');
            localStorage.removeItem('user_type');
            localStorage.removeItem('user');
            delete api.defaults.headers.common['Authorization'];

            set({
                user: null,
                token: null,
                userType: null,
                isAuthenticated: false,
                isLoading: false,
                error: 'Session expired. Please login again.',
            });
        }
    },

    // ============================================================
    // login — step 1 (password)
    //
    // IMPORTANT: never touches global isLoading. A top-level router
    // guard renders a full-page spinner when isLoading is true, which
    // unmounts <Login /> mid-flow and resets its OTP step state.
    // ============================================================
    login: async (email, password, type) => {
        set({ error: null });

        try {
            let response;

            if (type === 'admin') {
                response = await api.post('/login', { email, password });
            } else if (type === 'staff') {
                response = await api.post('/staff/login', { email, password });
            } else {
                response = await api.post('/customer/login', { email, password });
            }

            console.log('Login response:', response.data);

            // ─── ADMIN 2-STEP: password OK, OTP required ─────────────
            if (type === 'admin' && response.data.otp_required) {
                set({ error: null });
                return {
                    success: true,
                    message:
                        response.data.message ||
                        'Verification code sent to your email.',
                    otp_required: true,
                    challenge: response.data.challenge,
                    email_hint: response.data.email_hint,
                };
            }

            // ─── DIRECT LOGIN (staff / customer) ─────────────────────
            const { token, user, user_type, role } = response.data;
            const actualRole = user_type || user?.role || role;

            console.log('Actual role:', actualRole);
            console.log('Expected type:', type);

            if (type === 'admin' && actualRole !== 'admin') {
                throw new Error('Access denied. Admin privileges required.');
            }
            if (type === 'staff' && actualRole !== 'staff') {
                throw new Error('Access denied. Staff privileges required.');
            }
            if (type === 'customer' && actualRole !== 'customer') {
                throw new Error('Access denied. Customer privileges required.');
            }

            localStorage.setItem('token', token);
            localStorage.setItem('user_type', actualRole);
            localStorage.setItem('user', JSON.stringify(user));

            api.defaults.headers.common['Authorization'] = `Bearer ${token}`;

            set({
                user,
                token,
                userType: actualRole,
                isAuthenticated: true,
                error: null,
            });

            return { success: true, message: 'Login successful' };
        } catch (error: any) {
            console.error('Login error:', error);

            let errorMessage = 'Login failed';
            if (error.response) {
                errorMessage =
                    error.response.data?.message ||
                    error.response.data?.error ||
                    'Invalid credentials';
            } else if (error.message) {
                errorMessage = error.message;
            }

            localStorage.removeItem('token');
            localStorage.removeItem('user_type');
            localStorage.removeItem('user');
            delete api.defaults.headers.common['Authorization'];

            set({
                user: null,
                token: null,
                userType: null,
                isAuthenticated: false,
                error: errorMessage,
            });

            return { success: false, message: errorMessage };
        }
    },

    // ============================================================
    // completeLogin — called after OTP verification succeeds
    // ============================================================
    completeLogin: (token, user, userType) => {
        localStorage.setItem('token', token);
        localStorage.setItem('user_type', userType);
        localStorage.setItem('user', JSON.stringify(user));

        api.defaults.headers.common['Authorization'] = `Bearer ${token}`;

        set({
            user,
            token,
            userType,
            isAuthenticated: true,
            isLoading: false,
            error: null,
        });
    },

    // ============================================================
    // logout
    // ============================================================
    logout: () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user_type');
        localStorage.removeItem('user');
        delete api.defaults.headers.common['Authorization'];

        set({
            user: null,
            token: null,
            userType: null,
            isAuthenticated: false,
            isLoading: false,
            error: null,
        });
    },

    clearError: () => {
        set({ error: null });
    },

    setUser: (user) => {
        set({ user });
        if (user) {
            localStorage.setItem('user', JSON.stringify(user));
        }
    },
}));

// ============================================================
// Axios interceptors
// ============================================================
api.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => Promise.reject(error)
);

api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            const url: string = error.config?.url || '';

            // Anumang auth-related endpoint: huwag i-treat na "session expired".
            // Ang "/login" ay sumasaklaw na sa /login, /login/verify-otp,
            // at /login/resend-otp (prefix match).
            const isAuthEndpoint =
                url.includes('/login') ||
                url.includes('/staff/login') ||
                url.includes('/customer/login');

            const onLoginPage = window.location.pathname === '/login';

            if (!isAuthEndpoint && !onLoginPage) {
                localStorage.removeItem('token');
                localStorage.removeItem('user_type');
                localStorage.removeItem('user');
                delete api.defaults.headers.common['Authorization'];

                useAuthStore.setState({
                    user: null,
                    token: null,
                    userType: null,
                    isAuthenticated: false,
                    isLoading: false,
                    error: 'Session expired. Please login again.',
                });

                softNavigate('/login');
            }
        }
        return Promise.reject(error);
    },
);