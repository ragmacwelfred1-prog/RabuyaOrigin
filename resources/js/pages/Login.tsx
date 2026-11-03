// resources/js/pages/Login.tsx
import React, { useState, useEffect, useRef } from 'react';
import { Form, Input, Button, message, Spin, Alert } from 'antd';
import {
    UserOutlined,
    LockOutlined,
    MoonOutlined,
    SunOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import api from '../services/api';
import { getInitialIsDark, applyTheme } from '../theme/evergreen';

const Login: React.FC = () => {
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();
    const { login, isAuthenticated, error, clearError, user, completeLogin } =
        useAuthStore();

    const verifyingRef = useRef(false);

    const [step, setStep] = useState<'credentials' | 'otp'>(() => {
        return sessionStorage.getItem('login_step') === 'otp'
            ? 'otp'
            : 'credentials';
    });
    const [challenge, setChallenge] = useState(
        () => sessionStorage.getItem('login_challenge') ?? '',
    );
    const [emailHint, setEmailHint] = useState(
        () => sessionStorage.getItem('login_email_hint') ?? '',
    );
    const [otp, setOtp] = useState('');
    const [resendIn, setResendIn] = useState(0);

    const [isDark, setIsDark] = useState(getInitialIsDark);

    useEffect(() => {
        if (step === 'otp' && challenge) {
            sessionStorage.setItem('login_step', 'otp');
            sessionStorage.setItem('login_challenge', challenge);
            sessionStorage.setItem('login_email_hint', emailHint);
        }
    }, [step, challenge, emailHint]);

    useEffect(() => {
        if (isAuthenticated && user?.role === 'admin') {
            sessionStorage.removeItem('login_step');
            sessionStorage.removeItem('login_challenge');
            sessionStorage.removeItem('login_email_hint');
            navigate('/dashboard', { replace: true });
        }
    }, [isAuthenticated, navigate, user]);

    useEffect(() => {
        return () => {
            clearError();
        };
    }, [clearError]);

    useEffect(() => {
        if (resendIn <= 0) return;
        const t = setInterval(
            () => setResendIn((s) => Math.max(0, s - 1)),
            1000,
        );
        return () => clearInterval(t);
    }, [resendIn]);

    const toggleTheme = () => {
        const next = !isDark;
        setIsDark(next);
        applyTheme(next);
    };

    const clearOtpScratch = () => {
        sessionStorage.removeItem('login_step');
        sessionStorage.removeItem('login_challenge');
        sessionStorage.removeItem('login_email_hint');
    };

    const onFinish = async (values: { email: string; password: string }) => {
        setLoading(true);
        clearError();
        try {
            const result = await login(values.email, values.password, 'admin');

            if (result.success && result.otp_required) {
                setChallenge(result.challenge ?? '');
                setEmailHint(result.email_hint ?? '');
                setOtp('');
                setResendIn(60);
                setStep('otp');
                message.success(
                    result.message ||
                        'Verification code sent to your email.',
                );
                return;
            }

            if (result.success) {
                message.success(result.message || 'Login successful!');
            } else {
                message.error(result.message || 'Login failed');
            }
        } catch (err: any) {
            console.error('Login error:', err);
            message.error(
                err?.response?.data?.message || 'An unexpected error occurred',
            );
        } finally {
            setLoading(false);
        }
    };

    const verifyOtp = async (code = otp) => {
        if (code.length !== 6) return;
        if (verifyingRef.current) return;
        verifyingRef.current = true;

        setLoading(true);
        clearError();
        try {
            const res = await api.post('/login/verify-otp', {
                challenge,
                otp: code,
            });
            completeLogin(res.data.token, res.data.user, res.data.user_type);
            message.success('Login successful!');
        } catch (err: any) {
            const status = err?.response?.status;
            const msg = err?.response?.data?.message || 'Verification failed';

            message.error(msg);
            setOtp('');

            const sessionDead =
                status === 429 ||
                status === 403 ||
                /session expired|too many attempts|account unavailable/i.test(
                    msg,
                );

            if (sessionDead) {
                setStep('credentials');
                setChallenge('');
                setEmailHint('');
                setResendIn(0);
                clearOtpScratch();
            }
        } finally {
            setLoading(false);
            verifyingRef.current = false;
        }
    };

    const resendOtp = async () => {
        try {
            await api.post('/login/resend-otp', { challenge });
            setResendIn(60);
            setOtp('');
            message.success('New code sent to your email.');
        } catch (err: any) {
            const msg =
                err?.response?.data?.message || 'Could not resend code.';
            message.error(msg);

            if (/session expired/i.test(msg)) {
                setStep('credentials');
                setChallenge('');
                setEmailHint('');
                setResendIn(0);
                clearOtpScratch();
            }
        }
    };

    const backToCredentials = () => {
        setStep('credentials');
        setOtp('');
        setChallenge('');
        setEmailHint('');
        setResendIn(0);
        clearOtpScratch();
        clearError();
    };

    // ─── Theme colors ────────────────────────────────────────────────────────
    const isDarkMode = isDark;
    const fieldBg = isDarkMode ? '#211F1B' : '#FBF8F1';
    const fieldBorder = isDarkMode ? '#3A362F' : '#DDD3BC';
    const fieldColor = isDarkMode ? '#F5F0E6' : '#1E1E1E';
    const inputBg = isDarkMode ? '#1A1815' : '#FFFFFF';
    const rightPanelBg = isDarkMode ? '#141311' : '#FBF8F1';
    const textPrimary = isDarkMode ? '#F5F0E6' : '#1E1E1E';
    const textSecondary = isDarkMode ? '#CFC9BC' : '#3A3A35';
    const textTertiary = isDarkMode ? '#968F80' : '#6B6B60';

    return (
        <div
            style={{
                minHeight: '100vh',
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
                backgroundColor: isDarkMode ? '#141311' : '#F5F0E6',
                transition: 'background-color 0.3s ease',
                padding: '24px',
            }}
        >
            <div
                style={{
                    width: '100%',
                    maxWidth: 900,
                    height: '100%',
                    maxHeight: 600,
                    aspectRatio: '3 / 2',
                    display: 'flex',
                    borderRadius: 32,
                    overflow: 'hidden',
                    boxShadow: isDarkMode
                        ? '0 25px 50px -12px rgba(0, 0, 0, 0.7)'
                        : '0 25px 50px -12px rgba(24, 96, 73, 0.25)',
                    transition: 'box-shadow 0.3s ease',
                    border: `1px solid ${isDarkMode ? '#3A362F' : '#DDD3BC'}`,
                }}
            >
                {/* ─── LEFT: BRAND PANEL (Evergreen hero) ─────────────────── */}
                <div
                    style={{
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        padding: '40px 44px',
                        background: '#186049',
                        position: 'relative',
                        overflow: 'hidden',
                    }}
                >
                    {/* Decorative organic shapes */}
                    <span
                        style={{
                            position: 'absolute',
                            left: -80,
                            bottom: -100,
                            width: 400,
                            height: 400,
                            borderRadius: '50%',
                            background: '#F5F0E6',
                            opacity: 0.08,
                        }}
                    />
                    <span
                        style={{
                            position: 'absolute',
                            right: 60,
                            top: 60,
                            width: 160,
                            height: 160,
                            borderRadius: '50%',
                            background: '#D9A441',
                            opacity: 0.9,
                        }}
                    />
                    <span
                        style={{
                            position: 'absolute',
                            right: -50,
                            bottom: 80,
                            width: 240,
                            height: 240,
                            borderRadius: '50% 0 50% 0',
                            background: '#F5F0E6',
                            opacity: 0.12,
                        }}
                    />
                    <span
                        style={{
                            position: 'absolute',
                            left: 44,
                            top: 52,
                            width: 96,
                            height: 96,
                            borderRadius: '0 50% 0 50%',
                            background: '#F5F0E6',
                            opacity: 0.08,
                        }}
                    />

                    {/* Logo */}
                    <div style={{ position: 'relative', zIndex: 2 }}>
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 12,
                            }}
                        >
                            <div
                                style={{
                                    width: 44,
                                    height: 44,
                                    borderRadius: '50% 0 50% 0',
                                    background: '#D9A441',
                                }}
                            />
                            <div>
                                <div
                                    style={{
                                        fontFamily:
                                            "'Cormorant Garamond', serif",
                                        fontSize: 28,
                                        fontWeight: 700,
                                        color: '#F5F0E6',
                                        letterSpacing: '-0.01em',
                                        lineHeight: 1.1,
                                    }}
                                >
                                    Rabuya
                                </div>
                                <div
                                    style={{
                                        fontSize: 10,
                                        color: 'rgba(245, 240, 230, 0.7)',
                                        letterSpacing: '0.6px',
                                        textTransform: 'uppercase',
                                        fontWeight: 600,
                                    }}
                                >
                                    Park &amp; Fuel Management
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Hero copy */}
                    <div
                        style={{
                            position: 'relative',
                            zIndex: 2,
                            maxWidth: 400,
                        }}
                    >
                        <h1
                            style={{
                                fontFamily: "'Cormorant Garamond', serif",
                                fontSize: 44,
                                fontWeight: 700,
                                color: '#F5F0E6',
                                lineHeight: 1.05,
                                letterSpacing: '-0.02em',
                                marginBottom: 16,
                            }}
                        >
                            Simple goods,
                            <br />
                            <span style={{ color: '#D9A441' }}>
                                grown with care.
                            </span>
                        </h1>
                        <p
                            style={{
                                fontSize: 16,
                                color: 'rgba(245, 240, 230, 0.85)',
                                lineHeight: 1.6,
                                margin: 0,
                            }}
                        >
                            Manage parking and fuel operations with a calm,
                            honest interface built for daily work.
                        </p>
                    </div>

                    <div
                        style={{
                            position: 'relative',
                            zIndex: 2,
                            fontSize: 11,
                            color: 'rgba(245, 240, 230, 0.5)',
                        }}
                    >
                        © {new Date().getFullYear()} Rabuya · All rights
                        reserved
                    </div>
                </div>

                {/* ─── RIGHT: FORM / OTP ──────────────────────────── */}
                <div
                    style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '32px 28px',
                        backgroundColor: rightPanelBg,
                        position: 'relative',
                    }}
                >
                    <button
                        type="button"
                        onClick={toggleTheme}
                        aria-pressed={isDarkMode}
                        aria-label="Dark mode"
                        title={
                            isDarkMode
                                ? 'Switch to light mode'
                                : 'Switch to dark mode'
                        }
                        style={{
                            position: 'absolute',
                            top: 20,
                            right: 22,
                            zIndex: 2,
                            width: 44,
                            height: 44,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: 0,
                            background: 'transparent',
                            border: `2px solid ${
                                isDarkMode ? '#F5F0E6' : '#186049'
                            }`,
                            borderRadius: '50%',
                            color: isDarkMode ? '#F5F0E6' : '#186049',
                            cursor: 'pointer',
                            fontSize: 20,
                            transition: 'background-color 0.2s ease',
                        }}
                    >
                        {isDarkMode ? <SunOutlined /> : <MoonOutlined />}
                    </button>

                    <div style={{ width: '100%', maxWidth: 340 }}>
                        {step === 'credentials' ? (
                            <>
                                <div style={{ marginBottom: 28 }}>
                                    <h2
                                        style={{
                                            fontFamily:
                                                "'Cormorant Garamond', serif",
                                            fontSize: 34,
                                            fontWeight: 700,
                                            color: textPrimary,
                                            letterSpacing: '-0.02em',
                                            marginBottom: 6,
                                            lineHeight: 1.05,
                                        }}
                                    >
                                        Welcome back
                                    </h2>
                                    <p
                                        style={{
                                            fontSize: 13,
                                            color: textSecondary,
                                            margin: 0,
                                        }}
                                    >
                                        Sign in to your admin account to
                                        continue
                                    </p>
                                </div>

                                {error && (
                                    <Alert
                                        message={error}
                                        type="error"
                                        showIcon
                                        style={{
                                            marginBottom: 18,
                                            borderRadius: 12,
                                            fontSize: 12,
                                            padding: '6px 10px',
                                        }}
                                        closable
                                        onClose={clearError}
                                    />
                                )}

                                <Form
                                    name="login"
                                    onFinish={onFinish}
                                    autoComplete="off"
                                    layout="vertical"
                                    size="middle"
                                >
                                    <Form.Item
                                        name="email"
                                        label={
                                            <span
                                                style={{
                                                    fontSize: 11,
                                                    fontWeight: 700,
                                                    color: isDarkMode
                                                        ? '#D9A441'
                                                        : '#186049',
                                                    letterSpacing: '0.4px',
                                                    textTransform: 'uppercase',
                                                }}
                                            >
                                                Email Address
                                            </span>
                                        }
                                        rules={[
                                            {
                                                required: true,
                                                message:
                                                    'Please input your email!',
                                            },
                                            {
                                                type: 'email',
                                                message:
                                                    'Please enter a valid email!',
                                            },
                                        ]}
                                        style={{ marginBottom: 14 }}
                                    >
                                        <Input
                                            prefix={
                                                <UserOutlined
                                                    style={{
                                                        color: textTertiary,
                                                        marginRight: 4,
                                                        fontSize: 13,
                                                    }}
                                                />
                                            }
                                            placeholder="admin@example.com"
                                            style={{
                                                borderRadius: 12,
                                                height: 44,
                                                borderColor: fieldBorder,
                                                background: fieldBg,
                                                color: fieldColor,
                                                fontSize: 13,
                                            }}
                                        />
                                    </Form.Item>

                                    <Form.Item
                                        name="password"
                                        label={
                                            <span
                                                style={{
                                                    fontSize: 11,
                                                    fontWeight: 700,
                                                    color: isDarkMode
                                                        ? '#D9A441'
                                                        : '#186049',
                                                    letterSpacing: '0.4px',
                                                    textTransform: 'uppercase',
                                                }}
                                            >
                                                Password
                                            </span>
                                        }
                                        rules={[
                                            {
                                                required: true,
                                                message:
                                                    'Please input your password!',
                                            },
                                        ]}
                                        style={{ marginBottom: 8 }}
                                    >
                                        <Input.Password
                                            prefix={
                                                <LockOutlined
                                                    style={{
                                                        color: textTertiary,
                                                        marginRight: 4,
                                                        fontSize: 13,
                                                    }}
                                                />
                                            }
                                            placeholder="Enter your password"
                                            style={{
                                                borderRadius: 12,
                                                height: 44,
                                                borderColor: fieldBorder,
                                                background: fieldBg,
                                                color: fieldColor,
                                                fontSize: 13,
                                            }}
                                        />
                                    </Form.Item>

                                    <Form.Item
                                        style={{
                                            marginTop: 20,
                                            marginBottom: 0,
                                        }}
                                    >
                                        <Button
                                            type="primary"
                                            htmlType="submit"
                                            loading={loading}
                                            block
                                            style={{
                                                height: 46,
                                                fontSize: 14,
                                                fontWeight: 700,
                                                borderRadius: 999,
                                                backgroundColor: isDarkMode
                                                    ? '#1B6E52'
                                                    : '#186049',
                                                borderColor: isDarkMode
                                                    ? '#1B6E52'
                                                    : '#186049',
                                                color: isDarkMode
                                                    ? '#F5F0E6'
                                                    : '#FFFFFF',
                                                letterSpacing: '0.3px',
                                            }}
                                        >
                                            {loading ? (
                                                <Spin size="small" />
                                            ) : (
                                                'Sign In'
                                            )}
                                        </Button>
                                    </Form.Item>
                                </Form>

                                <div
                                    style={{
                                        marginTop: 20,
                                        paddingTop: 16,
                                        borderTop: `1px solid ${
                                            isDarkMode
                                                ? '#3A362F'
                                                : '#EDE6D6'
                                        }`,
                                        textAlign: 'center',
                                    }}
                                >
                                    <p
                                        style={{
                                            fontSize: 11,
                                            color: textTertiary,
                                            margin: 0,
                                            lineHeight: 1.6,
                                        }}
                                    >
                                        Admin accounts are managed by the
                                        system administrator.
                                        <br />
                                        Contact support if you need assistance.
                                    </p>
                                </div>
                            </>
                        ) : (
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ marginBottom: 24 }}>
                                    <h2
                                        style={{
                                            fontFamily:
                                                "'Cormorant Garamond', serif",
                                            fontSize: 30,
                                            fontWeight: 700,
                                            color: textPrimary,
                                            letterSpacing: '-0.02em',
                                            marginBottom: 6,
                                            lineHeight: 1.1,
                                        }}
                                    >
                                        Verify your identity
                                    </h2>
                                    <p
                                        style={{
                                            fontSize: 13,
                                            color: textSecondary,
                                            margin: 0,
                                            lineHeight: 1.5,
                                        }}
                                    >
                                        Enter the 6-digit code sent to{' '}
                                        <strong style={{ color: textPrimary }}>
                                            {emailHint}
                                        </strong>
                                    </p>
                                </div>

                                {error && (
                                    <Alert
                                        message={error}
                                        type="error"
                                        showIcon
                                        style={{
                                            marginBottom: 18,
                                            borderRadius: 12,
                                            fontSize: 12,
                                            padding: '6px 10px',
                                            textAlign: 'left',
                                        }}
                                        closable
                                        onClose={clearError}
                                    />
                                )}

                                <Input.OTP
                                    length={6}
                                    value={otp}
                                    onChange={(v) => {
                                        setOtp(v);
                                        if (v.length === 6) verifyOtp(v);
                                    }}
                                    size="large"
                                    style={{ width: '100%' }}
                                />

                                <Button
                                    type="primary"
                                    block
                                    loading={loading}
                                    disabled={otp.length !== 6}
                                    onClick={() => verifyOtp()}
                                    style={{
                                        height: 46,
                                        marginTop: 20,
                                        borderRadius: 999,
                                        backgroundColor: isDarkMode
                                            ? '#1B6E52'
                                            : '#186049',
                                        borderColor: isDarkMode
                                            ? '#1B6E52'
                                            : '#186049',
                                        color: isDarkMode
                                            ? '#F5F0E6'
                                            : '#FFFFFF',
                                        fontWeight: 700,
                                        fontSize: 14,
                                    }}
                                >
                                    Verify &amp; Sign In
                                </Button>

                                <div
                                    style={{
                                        marginTop: 14,
                                        fontSize: 12,
                                        display: 'flex',
                                        justifyContent: 'center',
                                        gap: 8,
                                    }}
                                >
                                    <Button
                                        type="link"
                                        disabled={resendIn > 0}
                                        onClick={resendOtp}
                                        style={{
                                            color: isDarkMode
                                                ? '#D9A441'
                                                : '#186049',
                                            fontSize: 12,
                                            padding: 0,
                                        }}
                                    >
                                        {resendIn > 0
                                            ? `Resend in ${resendIn}s`
                                            : 'Resend code'}
                                    </Button>
                                    <span style={{ color: textTertiary }}>
                                        ·
                                    </span>
                                    <Button
                                        type="link"
                                        onClick={backToCredentials}
                                        style={{
                                            color: textSecondary,
                                            fontSize: 12,
                                            padding: 0,
                                        }}
                                    >
                                        Back
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Login;