// resources/js/pages/Customers.tsx
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import type { ColumnsType } from 'antd/es/table';
import {
    Table,
    Button,
    Modal,
    Form,
    Input,
    Select,
    DatePicker,
    TimePicker,
    Card,
    Space,
    Tag,
    message,
    Row,
    Col,
    Descriptions,
    Avatar,
    Spin,
    Tabs,
    Tooltip,
    Alert,
    Badge,
    Popover,
    List,
    Upload,
    Divider,
} from 'antd';
import {
    PlusOutlined,
    CheckCircleOutlined,
    CarOutlined,
    UserOutlined,
    SearchOutlined,
    ClockCircleOutlined,
    PrinterOutlined,
    TeamOutlined,
    BellOutlined,
    LoginOutlined,
    LockOutlined,
    ReloadOutlined,
    CloseCircleOutlined,
    ExclamationCircleOutlined,
    WarningOutlined,
    DollarOutlined,
    DeleteOutlined,
    DownloadOutlined,
    EditOutlined,
    CameraOutlined,
    FileImageOutlined,
    CalendarOutlined,
    EyeOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import api from '../services/api';

dayjs.extend(relativeTime);

const { Option } = Select;
const { TabPane } = Tabs;

// ─── Storage URL ──────────────────────────────────────────────────────────
const STORAGE_URL = '/storage';

// ─── Active-status helper (fixes 0/1 vs boolean bugs) ─────────────────────
/** Only true / 1 = active */
const isCustomerActive = (
    c: { is_active?: boolean | number | null } | null | undefined,
): boolean => !!c && (c.is_active === true || c.is_active === 1);

// ─── INTERFACES ───────────────────────────────────────────────────────────

interface Vehicle {
    id: number;
    plate_number: string;
    vehicle_model: string;
}

interface Customer {
    id: number;
    first_name: string;
    middle_name?: string;
    last_name: string;
    phone_number: string;
    email?: string;
    address?: string;
    plate_number?: string;
    vehicle_model?: string;
    vehicles?: Vehicle[];
    bookings?: Booking[];
    created_at?: string;
    license_number?: string;
    license_type?: 'professional' | 'non_professional' | 'student';
    license_expiration?: string;
    license_photo?: string;
    license_photo_original_name?: string;
    license_photo_url?: string;
    is_active?: boolean | number | null;
}

interface Booking {
    id: number;
    customer_id: number;
    parking_slot_id: number;
    check_in_date: string;
    check_out_date: string;
    status: 'pending' | 'approved' | 'rejected' | 'cancelled' | 'completed';
    booking_type?: 'online' | 'walk_in';
    confirm_by_id?: number;
    created_at: string;
    customer?: Customer;
    parking_slot?: ParkingSlot;
    transaction?: ParkingTransaction;
    has_checked_in?: boolean;
    downpayment_status?: 'paid' | 'unpaid' | null;
    downpayment_amount?: number | null;
    downpayment_reference?: string | null;
    downpayment_gcash_ref?: string | null;
    approved_by?: { first_name: string; last_name: string } | null;
}

interface ParkingTransaction {
    id: number;
    transaction_number: string;
    customer_id?: number;
    parking_slot_id?: number;
    check_in_date: string;
    check_in_time: string;
    expected_checkout_date: string;
    expected_checkout_time: string;
    actual_checkout_date?: string;
    actual_checkout_time?: string;
    expected_nights: number;
    actual_nights_stayed?: number;
    expected_amount: number;
    total_amount?: number;
    discount?: number;
    amount_paid?: number;
    change_amount?: number;
    payment_method?: string;
    status: 'unpaid' | 'paid';
    customer?: Customer;
    parking_slot?: ParkingSlot;
    promos?: any[];
    booking_type?: 'online' | 'walk_in';
    downpayment_paid?: number;
    checked_in_by?: { first_name: string; last_name: string } | null;
    checked_out_by?: { first_name: string; last_name: string } | null;
}

interface ParkingSlot {
    id: number;
    slot_number: string;
    status: 'available' | 'occupied' | 'maintenance';
    nightly_rate: number;
}

interface ReceiptData {
    transaction_number: string;
    customer_name: string;
    customer_phone: string;
    vehicle_model: string;
    plate_number: string;
    slot_number: string;
    check_in: string;
    check_out: string;
    nights_stayed: number;
    rate_per_night: number;
    total_amount: number;
    amount_paid: number;
    discount: number;
    change: number;
    payment_method: string;
    processed_by: string;
    processed_at: string;
}

interface NotificationItem {
    id: string;
    type:
        | 'pending_booking'
        | 'approved_checkin'
        | 'overdue_checkout'
        | 'today_checkout'
        | 'soon_checkout';
    title: string;
    message: string;
    customer_name: string;
    slot_number: string;
    time: string;
    targetTab: string;
    targetId?: number;
    urgency: 'high' | 'medium' | 'low';
}

// ─── LICENSE CONSTANTS ────────────────────────────────────────────────────

const LICENSE_TYPES = [
    { value: 'professional', label: 'Professional' },
    { value: 'non_professional', label: 'Non-Professional' },
    { value: 'student', label: 'Student Permit' },
];

const LICENSE_TYPE_COLORS: Record<string, string> = {
    professional: 'blue',
    non_professional: 'green',
    student: 'orange',
};

const LICENSE_TYPE_LABELS: Record<string, string> = {
    professional: 'Professional',
    non_professional: 'Non-Professional',
    student: 'Student Permit',
};

// ─── HELPER: Compute license_photo_url ─────────────────────────────────────
const computeLicenseUrl = (licensePhoto?: string): string | undefined => {
    if (!licensePhoto) return undefined;
    if (licensePhoto.startsWith('http')) return licensePhoto;
    return `${STORAGE_URL}/${licensePhoto}`;
};

// ─── COMPONENT ────────────────────────────────────────────────────────────

const Customers: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();

    const [activeTab, setActiveTab] = useState('pending');

    const [pendingBookings, setPendingBookings] = useState<Booking[]>([]);
    const [approvedBookings, setApprovedBookings] = useState<Booking[]>([]);

    const [transactions, setTransactions] = useState<ParkingTransaction[]>([]);
    const [history, setHistory] = useState<ParkingTransaction[]>([]);
    const [filteredHistory, setFilteredHistory] = useState<ParkingTransaction[]>([]);

    const [allCustomers, setAllCustomers] = useState<Customer[]>([]);
    const [slots, setSlots] = useState<ParkingSlot[]>([]);

    const [allNotifications, setAllNotifications] = useState<NotificationItem[]>([]);
    const [notifVisible, setNotifVisible] = useState(false);
    const [readNotificationIds, setReadNotificationIds] = useState<Set<string>>(new Set());

    const [loading, setLoading] = useState(true);
    const [approvingId, setApprovingId] = useState<number | null>(null);
    const [rejectingId, setRejectingId] = useState<number | null>(null);
    const [deletingId, setDeletingId] = useState<number | null>(null);

    const [rejectModalOpen, setRejectModalOpen] = useState(false);
    const [selectedBookingId, setSelectedBookingId] = useState<number | null>(null);

    const [checkinModal, setCheckinModal] = useState(false);
    const [prefillBooking, setPrefillBooking] = useState<Booking | null>(null);
    const [checkingIn, setCheckingIn] = useState(false);
    const [checkinForm] = Form.useForm();

    const [checkoutModal, setCheckoutModal] = useState<ParkingTransaction | null>(null);
    const [amountPaid, setAmountPaid] = useState('');
    const [discount, setDiscount] = useState('0');
    const [paymentMethod] = useState<'cash'>('cash');
    const [checkingOut, setCheckingOut] = useState(false);

    const [receiptModal, setReceiptModal] = useState<ReceiptData | null>(null);

    // ─── EXTEND STAY STATES ───────────────────────────────────────────────
    const [extendModal, setExtendModal] = useState<ParkingTransaction | null>(null);
    const [extending, setExtending] = useState(false);
    const [extendForm] = Form.useForm();

    // ─── SEARCH STATES ────────────────────────────────────────────────────
    const [searchText, setSearchText] = useState('');
    const [custSearch, setCustSearch] = useState('');
    const [pendingSearch, setPendingSearch] = useState('');
    const [approvedSearch, setApprovedSearch] = useState('');
    const [activeSearch, setActiveSearch] = useState('');

    const [searchCustModal, setSearchCustModal] = useState(false);
    const [searchResults, setSearchResults] = useState<Customer[]>([]);
    const [searchKW, setSearchKW] = useState('');
    const [searching, setSearching] = useState(false);

    const [viewPaymentModal, setViewPaymentModal] = useState<Booking | null>(null);

    const [editCustomerModal, setEditCustomerModal] = useState(false);
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
    const [editForm] = Form.useForm();
    const [submitting, setSubmitting] = useState(false);
    const [uploadingLicense, setUploadingLicense] = useState(false);
    const [viewCustomerModal, setViewCustomerModal] = useState(false);
    const [viewCustomer, setViewCustomer] = useState<Customer | null>(null);

    const [photoViewerOpen, setPhotoViewerOpen] = useState(false);
    const [photoViewerData, setPhotoViewerData] = useState<{
        url: string;
        name?: string;
        customerName?: string;
    } | null>(null);

    const isAdmin = localStorage.getItem('user_type') === 'admin';
    const mountedRef = useRef(true);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    // ─── COMPUTED ─────────────────────────────────────────────────────────

    const checkoutComputed = useMemo(() => {
        if (!checkoutModal) return null;

        const today = dayjs().startOf('day');
        const checkInDay = dayjs(checkoutModal.check_in_date).startOf('day');
        const actualNights = Math.max(1, today.diff(checkInDay, 'day'));

        const expectedNights = Math.max(
            1,
            checkoutModal.expected_nights ?? actualNights,
        );

        const isOverdue = actualNights > expectedNights;

        // ✅ Manual discount only — no auto-apply, no promo auto-fill
        const baseRate = checkoutModal.parking_slot?.nightly_rate ?? 200;
        const grossTotal = actualNights * baseRate;

        const downpaymentPaid = checkoutModal.downpayment_paid ?? 0;

        const appliedDiscount = parseFloat(discount) || 0;
        const paid = parseFloat(amountPaid) || 0;

        const totalAfterDiscount = Math.max(
            0,
            grossTotal - downpaymentPaid - appliedDiscount,
        );
        const change = paid - totalAfterDiscount;

        return {
            actualNights,
            expectedNights,
            isOverdue,
            baseRate,
            grossTotal,
            downpaymentPaid,
            appliedDiscount,
            paid,
            totalAfterDiscount,
            change,
        };
    }, [checkoutModal, amountPaid, discount]);

    const availSlots = slots.filter((s) => s.status === 'available');
    const occupiedSlots = slots.filter((s) => s.status === 'occupied').length;
    const totalSlots = slots.length;
    const occupancyRate =
        totalSlots > 0 ? Math.round((occupiedSlots / totalSlots) * 100) : 0;

    const totalCustomers = allCustomers.length;
    const totalPending = pendingBookings.length;
    const totalActive = transactions.length;

    const withLicense = allCustomers.filter(
        (c) => c.license_number || c.license_photo,
    ).length;

    const licenseExpiringSoon = allCustomers.filter((c) => {
        if (!c.license_expiration) return false;
        const exp = dayjs(c.license_expiration);
        return exp.isAfter(dayjs()) && exp.isBefore(dayjs().add(30, 'day'));
    }).length;

    const licenseExpired = allCustomers.filter((c) => {
        if (!c.license_expiration) return false;
        return dayjs(c.license_expiration).isBefore(dayjs());
    }).length;

    const activeRevenue = transactions.reduce(
        (s, tx) => s + (tx.expected_amount || 0),
        0,
    );
    const historyRevenue = history.reduce(
        (s, tx) => s + (tx.total_amount || tx.expected_amount || 0),
        0,
    );
    const totalRevenue = activeRevenue + historyRevenue;

    const visibleNotifications = allNotifications.filter(
        (n) => !readNotificationIds.has(n.id),
    );
    const totalNotifCount = visibleNotifications.length;

    const customerBookingTypeMap = useMemo(() => {
        const map = new Map<number, 'online' | 'walk_in' | null>();
        const allEntries: {
            customer_id: number;
            booking_type?: 'online' | 'walk_in';
            created_at: string;
        }[] = [
            ...pendingBookings.map((b) => ({
                customer_id: b.customer_id,
                booking_type: b.booking_type,
                created_at: b.created_at,
            })),
            ...approvedBookings.map((b) => ({
                customer_id: b.customer_id,
                booking_type: b.booking_type,
                created_at: b.created_at,
            })),
            ...transactions.map((t) => ({
                customer_id: t.customer_id!,
                booking_type: t.booking_type,
                created_at: t.check_in_date,
            })),
            ...history.map((t) => ({
                customer_id: t.customer_id!,
                booking_type: t.booking_type,
                created_at: t.check_in_date,
            })),
        ];
        const latestMap = new Map<
            number,
            { type: 'online' | 'walk_in' | null; date: string }
        >();
        allEntries.forEach((entry) => {
            if (!entry.customer_id) return;
            const existing = latestMap.get(entry.customer_id);
            if (!existing || entry.created_at > existing.date) {
                latestMap.set(entry.customer_id, {
                    type: entry.booking_type || 'walk_in',
                    date: entry.created_at,
                });
            }
        });
        latestMap.forEach((value, key) => {
            map.set(key, value.type);
        });
        return map;
    }, [pendingBookings, approvedBookings, transactions, history]);

    // ─── SEARCH FILTERS ───────────────────────────────────────────────────

    const filteredPendingBookings = useMemo(() => {
        if (!pendingSearch) return pendingBookings;
        const q = pendingSearch.toLowerCase();
        return pendingBookings.filter(
            (b) =>
                b.customer?.first_name?.toLowerCase().includes(q) ||
                b.customer?.middle_name?.toLowerCase().includes(q) ||
                b.customer?.last_name?.toLowerCase().includes(q) ||
                b.customer?.phone_number?.includes(q) ||
                b.customer?.plate_number?.toLowerCase().includes(q) ||
                b.customer?.vehicle_model?.toLowerCase().includes(q) ||
                b.parking_slot?.slot_number?.toLowerCase().includes(q),
        );
    }, [pendingSearch, pendingBookings]);

    const filteredApprovedBookings = useMemo(() => {
        if (!approvedSearch) return approvedBookings;
        const q = approvedSearch.toLowerCase();
        return approvedBookings.filter(
            (b) =>
                b.customer?.first_name?.toLowerCase().includes(q) ||
                b.customer?.middle_name?.toLowerCase().includes(q) ||
                b.customer?.last_name?.toLowerCase().includes(q) ||
                b.customer?.phone_number?.includes(q) ||
                b.customer?.plate_number?.toLowerCase().includes(q) ||
                b.customer?.vehicle_model?.toLowerCase().includes(q) ||
                b.parking_slot?.slot_number?.toLowerCase().includes(q),
        );
    }, [approvedSearch, approvedBookings]);

    const filteredTransactions = useMemo(() => {
        if (!activeSearch) return transactions;
        const q = activeSearch.toLowerCase();
        return transactions.filter(
            (t) =>
                t.customer?.first_name?.toLowerCase().includes(q) ||
                t.customer?.middle_name?.toLowerCase().includes(q) ||
                t.customer?.last_name?.toLowerCase().includes(q) ||
                t.customer?.phone_number?.includes(q) ||
                t.customer?.plate_number?.toLowerCase().includes(q) ||
                t.customer?.vehicle_model?.toLowerCase().includes(q) ||
                t.parking_slot?.slot_number?.toLowerCase().includes(q) ||
                t.transaction_number?.toLowerCase().includes(q),
        );
    }, [activeSearch, transactions]);

    // ─── NOTIFICATIONS ────────────────────────────────────────────────────

    const computeAllNotifications = (
        pending: Booking[],
        approved: Booking[],
        active: ParkingTransaction[],
    ): NotificationItem[] => {
        const notifs: NotificationItem[] = [];
        const now = dayjs();

        pending.forEach((b) =>
            notifs.push({
                id: `p-${b.id}`,
                type: 'pending_booking',
                title: 'New Booking',
                message: `${getFullName(b.customer)} – Slot ${b.parking_slot?.slot_number ?? 'N/A'}`,
                customer_name: getFullName(b.customer),
                slot_number: b.parking_slot?.slot_number ?? 'N/A',
                time: dayjs(b.created_at).fromNow(),
                targetTab: 'pending',
                targetId: b.id,
                urgency: 'high',
            }),
        );

        approved
            .filter((b) => !b.has_checked_in)
            .forEach((b) =>
                notifs.push({
                    id: `a-${b.id}`,
                    type: 'approved_checkin',
                    title: 'Ready for Check-in',
                    message: `${getFullName(b.customer)} – Slot ${b.parking_slot?.slot_number ?? 'N/A'}`,
                    customer_name: getFullName(b.customer),
                    slot_number: b.parking_slot?.slot_number ?? 'N/A',
                    time: dayjs(b.created_at).fromNow(),
                    targetTab: 'approved',
                    targetId: b.id,
                    urgency: 'medium',
                }),
            );

        active.forEach((tx) => {
            const co = dayjs(
                `${tx.expected_checkout_date} ${tx.expected_checkout_time}`,
            );
            const h = co.diff(now, 'hour');
            if (h < 0)
                notifs.push({
                    id: `o-${tx.id}`,
                    type: 'overdue_checkout',
                    title: 'Overdue!',
                    message: `${getFullName(tx.customer)} – ${Math.abs(Math.round(h))}h overdue`,
                    customer_name: getFullName(tx.customer),
                    slot_number: tx.parking_slot?.slot_number ?? 'N/A',
                    time: `${Math.abs(Math.round(h))}h ago`,
                    targetTab: 'active',
                    targetId: tx.id,
                    urgency: 'high',
                });
            else if (h <= 24)
                notifs.push({
                    id: `t-${tx.id}`,
                    type: 'today_checkout',
                    title: 'Checkout Today',
                    message: `${getFullName(tx.customer)} – in ${Math.round(h)}h`,
                    customer_name: getFullName(tx.customer),
                    slot_number: tx.parking_slot?.slot_number ?? 'N/A',
                    time: `In ${Math.round(h)}h`,
                    targetTab: 'active',
                    targetId: tx.id,
                    urgency: 'medium',
                });
            else if (h <= 48)
                notifs.push({
                    id: `s-${tx.id}`,
                    type: 'soon_checkout',
                    title: 'Checkout Soon',
                    message: `${getFullName(tx.customer)} – in ${Math.round(h)}h`,
                    customer_name: getFullName(tx.customer),
                    slot_number: tx.parking_slot?.slot_number ?? 'N/A',
                    time: `In ${Math.round(h)}h`,
                    targetTab: 'active',
                    targetId: tx.id,
                    urgency: 'low',
                });
        });

        const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
        return notifs.sort((a, b) => order[a.urgency] - order[b.urgency]);
    };

    // ─── DATA FETCHING ────────────────────────────────────────────────────

    const fetchAllData = async () => {
        setLoading(true);
        try {
            const [pendRes, approvedRes, txRes, histRes, slotsRes, custRes] =
                await Promise.all([
                    api.get('/admin/bookings/pending'),
                    api.get('/admin/bookings', {
                        params: { status: 'approved' },
                    }),
                    api.get('/staff/parking/active'),
                    api.get('/staff/parking/history'),
                    api.get('/parking-slots'),
                    api.get('/admin/customers'),
                ]);

            if (!mountedRef.current) return;

            const p = Array.isArray(pendRes.data) ? pendRes.data : [];
            const a = Array.isArray(approvedRes.data) ? approvedRes.data : [];
            const t = Array.isArray(txRes.data) ? txRes.data : [];
            const h =
                histRes.data?.data ??
                (Array.isArray(histRes.data) ? histRes.data : []);

            const customers: Customer[] = Array.isArray(custRes.data)
                ? custRes.data
                : [];

            customers.forEach((c) => {
                c.license_photo_url = computeLicenseUrl(c.license_photo);
            });

            setPendingBookings(p);
            setApprovedBookings(a);
            setTransactions(t);
            setHistory(h);
            setFilteredHistory(h);
            setSlots(slotsRes.data ?? []);
            setAllCustomers(customers);
            setAllNotifications(computeAllNotifications(p, a, t));
            setReadNotificationIds(new Set());

            setViewCustomer((prev) => {
                if (!prev) return prev;
                const updated = customers.find((c) => c.id === prev.id);
                return updated ? { ...prev, ...updated } : prev;
            });

            setSelectedCustomer((prev) => {
                if (!prev) return prev;
                const updated = customers.find((c) => c.id === prev.id);
                return updated ? { ...prev, ...updated } : prev;
            });
        } catch (e) {
            console.error('fetchAllData error:', e);
            message.error('Failed to load data. Please refresh.');
        } finally {
            if (mountedRef.current) setLoading(false);
        }
    };

    useEffect(() => {
        fetchAllData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        const navState = location.state as
            | {
                  openCheckIn?: boolean;
                  slotId?: number;
                  slotNumber?: string;
                  nightlyRate?: number;
                  timestamp?: number;
              }
            | undefined;

        if (!navState?.openCheckIn || !navState.slotId) return;
        if (!slots.length) return;

        const slot = slots.find((s) => s.id === navState.slotId);
        if (!slot) {
            navigate(location.pathname, { replace: true, state: {} });
            return;
        }

        if (slot.status !== 'available') {
            message.warning(
                `Slot ${slot.slot_number} is no longer available. Please pick another slot.`,
            );
            navigate(location.pathname, { replace: true, state: {} });
            return;
        }

        checkinForm.resetFields();
        checkinForm.setFieldsValue({
            check_in_date: dayjs(),
            check_in_time: dayjs('14:00', 'HH:mm'),
            expected_checkout_date: dayjs().add(1, 'day'),
            expected_checkout_time: dayjs('12:00', 'HH:mm'),
            parking_slot_id: slot.id,
        });

        setPrefillBooking(null);
        setCheckinModal(true);

        message.success(
            `Slot ${slot.slot_number} selected. Complete the check-in form.`,
        );

        navigate(location.pathname, { replace: true, state: {} });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [slots, location.state]);

    useEffect(() => {
        if (!searchText) {
            setFilteredHistory(history);
            return;
        }
        const q = searchText.toLowerCase();
        setFilteredHistory(
            history.filter(
                (r) =>
                    r.customer?.first_name?.toLowerCase().includes(q) ||
                    r.customer?.last_name?.toLowerCase().includes(q) ||
                    r.customer?.phone_number?.includes(q) ||
                    r.transaction_number?.toLowerCase().includes(q),
            ),
        );
    }, [searchText, history]);

    // ─── HELPERS ──────────────────────────────────────────────────────────

    const getFullName = (c?: Customer | null) => {
        if (!c) return '–';
        const mi = c.middle_name ? ` ${c.middle_name.charAt(0)}.` : '';
        return `${c.first_name ?? ''}${mi} ${c.last_name ?? ''}`.trim() || '–';
    };

    const getFullNameFull = (c?: Customer | null) =>
        [c?.first_name, c?.middle_name, c?.last_name]
            .filter(Boolean)
            .join(' ') || '–';

    const openViewPayment = (booking: Booking) => {
        setViewPaymentModal(booking);
    };

    const handleNotifClick = (n: NotificationItem) => {
        setReadNotificationIds((p) => {
            const s = new Set(p);
            s.add(n.id);
            return s;
        });
        setNotifVisible(false);
        setActiveTab(n.targetTab);
    };

    const urgencyColor = (u: string) =>
        ({ high: '#EF4444', medium: '#F59E0B', low: '#0891B2' })[u] ??
        '#64748B';

    const notifIcon = (t: string) =>
        ({
            pending_booking: <BellOutlined />,
            approved_checkin: <CheckCircleOutlined />,
            overdue_checkout: <WarningOutlined />,
        })[t] ?? <ClockCircleOutlined />;

    const openPhotoViewer = (
        url: string,
        name?: string,
        customerName?: string,
    ) => {
        setPhotoViewerData({ url, name, customerName });
        setPhotoViewerOpen(true);
    };

    const handleEditCustomer = (customer: Customer) => {
        setSelectedCustomer(customer);
        editForm.setFieldsValue({
            first_name: customer.first_name,
            middle_name: customer.middle_name || '',
            last_name: customer.last_name,
            email: customer.email || '',
            phone_number: customer.phone_number,
            address: customer.address || '',
            is_active: isCustomerActive(customer),
            license_number: customer.license_number || '',
            license_type: customer.license_type || undefined,
            license_expiration: customer.license_expiration
                ? dayjs(customer.license_expiration)
                : null,
        });
        setEditCustomerModal(true);
    };

    const toggleCustomerStatus = async (customer: Customer) => {
        const currentlyActive = isCustomerActive(customer);
        const action = currentlyActive ? 'deactivate' : 'activate';

        Modal.confirm({
            title: `${action === 'deactivate' ? 'Deactivate' : 'Activate'} Customer`,
            icon: <ExclamationCircleOutlined />,
            content:
                action === 'deactivate'
                    ? `Deactivate ${customer.first_name} ${customer.last_name}'s account? They will be logged out immediately and cannot log in until reactivated.`
                    : `Activate ${customer.first_name} ${customer.last_name}'s account?`,
            okText: `Yes, ${action === 'deactivate' ? 'Deactivate' : 'Activate'}`,
            okButtonProps: { danger: action === 'deactivate' },
            cancelText: 'Cancel',
            onOk: async () => {
                try {
                    const res = await api.patch(
                        `/admin/customers/${customer.id}/toggle-status`,
                    );
                    if (res.data.success) {
                        message.success(res.data.message);
                        await fetchAllData();
                    } else {
                        message.error(
                            res.data.message || 'Failed to update status.',
                        );
                    }
                } catch (error: any) {
                    message.error(
                        error.response?.data?.message ||
                            'Failed to update customer status.',
                    );
                }
            },
        });
    };

    const handleViewCustomer = (customer: Customer) => {
        const enriched: Customer = {
            ...customer,
            license_photo_url:
                customer.license_photo_url ||
                computeLicenseUrl(customer.license_photo),
        };
        setViewCustomer(enriched);
        setViewCustomerModal(true);
    };

    const handleSaveCustomer = async (values: any) => {
        setSubmitting(true);
        try {
            const data = {
                ...values,
                license_expiration: values.license_expiration
                    ? values.license_expiration.format('YYYY-MM-DD')
                    : null,
            };

            const response = await api.put(
                `/admin/customers/${selectedCustomer?.id}`,
                data,
            );
            if (response.data.success) {
                message.success('Customer updated successfully');
                setEditCustomerModal(false);
                fetchAllData();
            } else {
                message.error(
                    response.data.message || 'Failed to update customer',
                );
            }
        } catch (error: any) {
            message.error(
                error.response?.data?.message || 'Failed to update customer',
            );
        } finally {
            setSubmitting(false);
        }
    };

    const handleUploadLicense = async (file: File, customerId: number) => {
        const formData = new FormData();
        formData.append('license_photo', file);

        setUploadingLicense(true);
        try {
            const response = await api.post(
                `/admin/customers/${customerId}/license`,
                formData,
                {
                    headers: { 'Content-Type': 'multipart/form-data' },
                },
            );
            if (response.data.success) {
                message.success('License photo uploaded successfully');
                await fetchAllData();
            }
        } catch (error: any) {
            message.error(
                error.response?.data?.message ||
                    'Failed to upload license photo',
            );
        } finally {
            setUploadingLicense(false);
        }
    };

    const handleDeleteLicense = async (customerId: number) => {
        Modal.confirm({
            title: 'Delete License Photo',
            icon: <ExclamationCircleOutlined />,
            content:
                'Are you sure you want to delete this license photo? This cannot be undone.',
            okText: 'Yes, Delete',
            okButtonProps: { danger: true },
            cancelText: 'Cancel',
            onOk: async () => {
                try {
                    await api.delete(`/admin/customers/${customerId}/license`);
                    message.success('License photo deleted');
                    await fetchAllData();
                } catch (error: any) {
                    message.error(
                        error.response?.data?.message ||
                            'Failed to delete license photo',
                    );
                }
            },
        });
    };

    const approveBooking = async (id: number) => {
        setApprovingId(id);
        try {
            const r = await api.post(`/admin/bookings/${id}/approve`);
            if (r.data.success) {
                message.success('Booking approved! Customer can now check in.');
                const booking = pendingBookings.find((b) => b.id === id);
                setPendingBookings((prev) => prev.filter((b) => b.id !== id));
                if (booking) {
                    setApprovedBookings((prev) => [
                        ...prev,
                        {
                            ...booking,
                            status: 'approved',
                            has_checked_in: false,
                        },
                    ]);
                }
            } else {
                message.error(r.data.message ?? 'Failed to approve.');
                await fetchAllData();
            }
        } catch (e: any) {
            message.error(e.response?.data?.message ?? 'Failed to approve.');
            await fetchAllData();
        } finally {
            if (mountedRef.current) setApprovingId(null);
        }
    };

    const rejectBooking = (id: number) => {
        setSelectedBookingId(id);
        setRejectModalOpen(true);
    };

    const handleRejectConfirm = async () => {
        if (selectedBookingId === null) return;
        setRejectingId(selectedBookingId);
        try {
            const r = await api.post(
                `/admin/bookings/${selectedBookingId}/reject`,
            );
            if (r.data.success) {
                message.success('Booking rejected.');
                setPendingBookings((prev) =>
                    prev.filter((b) => b.id !== selectedBookingId),
                );
            } else {
                message.error(r.data.message ?? 'Failed to reject.');
            }
        } catch (e: any) {
            message.error(e.response?.data?.message ?? 'Failed to reject.');
        } finally {
            setRejectingId(null);
            setRejectModalOpen(false);
            setSelectedBookingId(null);
        }
    };

    const deleteBooking = (id: number) => {
        Modal.confirm({
            title: 'Delete Booking',
            icon: <ExclamationCircleOutlined />,
            content: 'Permanently delete this booking? This cannot be undone.',
            okText: 'Yes, Delete',
            okButtonProps: { danger: true },
            cancelText: 'Cancel',
            onOk: async () => {
                setDeletingId(id);
                try {
                    const r = await api.delete(`/admin/bookings/${id}`);
                    if (r.data.success) {
                        message.success('Booking deleted.');
                        await fetchAllData();
                    } else {
                        message.error(r.data.message ?? 'Failed to delete.');
                    }
                } catch (e: any) {
                    message.error(
                        e.response?.data?.message ?? 'Failed to delete.',
                    );
                } finally {
                    if (mountedRef.current) setDeletingId(null);
                }
            },
        });
    };

    const openCheckinFromApproved = (b: Booking) => {
        if (b.has_checked_in) {
            message.warning('Already checked in.');
            return;
        }
        setPrefillBooking(b);
        setCheckinModal(true);
    };

    const resetCheckinForm = () => {
        setPrefillBooking(null);
        checkinForm.resetFields();
        checkinForm.setFieldsValue({
            check_in_date: dayjs(),
            check_in_time: dayjs('14:00', 'HH:mm'),
            expected_checkout_date: dayjs().add(1, 'day'),
            expected_checkout_time: dayjs('12:00', 'HH:mm'),
        });
    };

    const handleCheckin = async (values: any) => {
        setCheckingIn(true);
        try {
            if (prefillBooking) {
                const r = await api.post('/staff/parking/checkin-existing', {
                    booking_id: prefillBooking.id,
                });
                if (r.data.success) {
                    message.success('Check-in successful!');
                    setCheckinModal(false);
                    setPrefillBooking(null);
                    resetCheckinForm();
                    await fetchAllData();
                    setActiveTab('active');
                } else {
                    message.error(r.data?.message ?? 'Check-in failed.');
                }
                return;
            }

            const ci = dayjs(
                `${values.check_in_date.format('YYYY-MM-DD')} ${values.check_in_time.format('HH:mm:ss')}`,
            );
            const co = dayjs(
                `${values.expected_checkout_date.format('YYYY-MM-DD')} ${values.expected_checkout_time.format('HH:mm:ss')}`,
            );
            const n = calculateNights(
                ci.format('YYYY-MM-DD'),
                co.format('YYYY-MM-DD'),
            );
            const rate =
                slots.find((s) => s.id === values.parking_slot_id)
                    ?.nightly_rate ?? 200;

            const r = await api.post('/staff/parking/checkin', {
                first_name: values.first_name,
                middle_name: values.middle_name ?? '',
                last_name: values.last_name,
                phone_number: values.phone_number,
                email: values.email ?? '',
                address: values.address ?? '',
                plate_number: values.plate_number,
                vehicle_model: values.vehicle_model,
                parking_slot_id: values.parking_slot_id,
                check_in_date: values.check_in_date.format('YYYY-MM-DD'),
                check_in_time: values.check_in_time.format('HH:mm:ss'),
                expected_checkout_date:
                    values.expected_checkout_date.format('YYYY-MM-DD'),
                expected_checkout_time:
                    values.expected_checkout_time.format('HH:mm:ss'),
                expected_nights: n,
                expected_amount: calcTotal(n, rate),
            });

            if (r.data.success) {
                message.success(
                    `Check-in successful! (${n} night${n !== 1 ? 's' : ''})`,
                );
                setCheckinModal(false);
                resetCheckinForm();
                await fetchAllData();
                setActiveTab('active');
            } else {
                message.error(r.data?.message ?? 'Check-in failed.');
            }
        } catch (e: any) {
            message.error(e.response?.data?.message ?? 'Check-in failed.');
        } finally {
            if (mountedRef.current) setCheckingIn(false);
        }
    };

    // ✅ OPEN CHECKOUT — manual discount only
    const openCheckout = (tx: ParkingTransaction) => {
        if (!isAdmin) {
            message.warning('Only admin can process checkout.');
            return;
        }

        setCheckoutModal(tx);

        const today = dayjs().startOf('day');
        const checkInDay = dayjs(tx.check_in_date).startOf('day');
        const actualNights = Math.max(1, today.diff(checkInDay, 'day'));
        const baseRate = tx.parking_slot?.nightly_rate ?? 200;
        const downpaymentPaid = tx.downpayment_paid ?? 0;

        const grossTotal = actualNights * baseRate;
        const computedTotal = Math.max(0, grossTotal - downpaymentPaid);

        // ✅ Always reset discount to 0 — staff types it in manually
        setDiscount('0');
        setAmountPaid(computedTotal.toFixed(2));
    };

    // ✅ CHECKOUT — manual discount only
    const handleCheckout = async () => {
        if (!checkoutModal || !checkoutComputed) return;

        const paid = checkoutComputed.paid;
        const total = checkoutComputed.totalAfterDiscount;

        if (isNaN(paid) || paid < total) {
            message.error(`Insufficient payment. Required: ${fmtPHP(total)}`);
            return;
        }

        const snap = { ...checkoutModal };
        const computed = { ...checkoutComputed };
        setCheckingOut(true);

        try {
            const r = await api.post(`/admin/parking/checkout/${snap.id}`, {
                amount_paid: paid,
                discount: computed.appliedDiscount,
                payment_method: 'cash',
            });

            if (r.data.success) {
                const ch =
                    r.data.change_amount ??
                    r.data.change ??
                    Math.max(0, paid - total);

                setCheckoutModal(null);
                setAmountPaid('');
                setDiscount('0');

                message.success(
                    `Checkout done! ${computed.actualNights} night(s) at ₱${computed.baseRate}/night`,
                );

                setReceiptModal({
                    transaction_number: snap.transaction_number,
                    customer_name: getFullName(snap.customer),
                    customer_phone: snap.customer?.phone_number ?? '',
                    vehicle_model: snap.customer?.vehicle_model ?? '',
                    plate_number: snap.customer?.plate_number ?? '',
                    slot_number: snap.parking_slot?.slot_number ?? '',
                    check_in: `${snap.check_in_date} ${snap.check_in_time}`,
                    check_out:
                        r.data.checked_out_at ??
                        dayjs().format('YYYY-MM-DD HH:mm:ss'),
                    nights_stayed: r.data.nights_stayed ?? computed.actualNights,
                    rate_per_night: r.data.base_rate ?? computed.baseRate,
                    total_amount: r.data.total_amount ?? total,
                    amount_paid: r.data.amount_paid ?? paid,
                    discount: r.data.discount ?? computed.appliedDiscount,
                    change: ch,
                    payment_method: 'cash',
                    processed_by: 'Admin',
                    processed_at: dayjs().format('YYYY-MM-DD HH:mm:ss'),
                });

                await fetchAllData();
                setActiveTab('history');
            } else {
                message.error(r.data.message ?? 'Checkout failed.');
            }
        } catch (e: any) {
            message.error(e.response?.data?.message ?? 'Checkout failed.');
        } finally {
            if (mountedRef.current) setCheckingOut(false);
        }
    };

    // ─── EXTEND STAY HANDLERS ─────────────────────────────────────────────

    const openExtend = (tx: ParkingTransaction) => {
        const cur = dayjs(`${tx.expected_checkout_date} ${tx.expected_checkout_time}`);
        const start = (cur.isAfter(dayjs()) ? cur : dayjs()).add(1, 'day');
        extendForm.setFieldsValue({ check_out_date: start, check_out_time: cur });
        setExtendModal(tx);
    };

    const handleExtend = async (values: any) => {
        if (!extendModal) return;
        setExtending(true);
        try {
            const r = await api.post(`/staff/parking/extend/${extendModal.id}`, {
                check_out_date: values.check_out_date.format('YYYY-MM-DD'),
                check_out_time: values.check_out_time.format('HH:mm:ss'),
            });
            message.success(r.data.message || 'Stay extended.');
            setExtendModal(null);
            await fetchAllData();
        } catch (e: any) {
            message.error(e.response?.data?.message ?? 'Failed to extend.');
        } finally {
            setExtending(false);
        }
    };

    const searchCustomers = async () => {
        if (!searchKW.trim()) {
            message.warning('Enter a keyword.');
            return;
        }
        setSearching(true);
        try {
            const r = await api.get('/customers/search', {
                params: { keyword: searchKW },
            });
            setSearchResults(Array.isArray(r.data) ? r.data : []);
        } catch {
            message.error('Search failed.');
        } finally {
            setSearching(false);
        }
    };

    const selectCustomer = (c: Customer) => {
        if (transactions.some((t) => t.customer_id === c.id)) {
            message.warning('Customer already has an active parking session.');
            setSearchCustModal(false);
            return;
        }
        checkinForm.setFieldsValue({
            first_name: c.first_name,
            middle_name: c.middle_name,
            last_name: c.last_name,
            phone_number: c.phone_number,
            email: c.email,
            address: c.address,
            plate_number: c.plate_number,
            vehicle_model: c.vehicle_model,
        });
        setSearchCustModal(false);
        setCheckinModal(true);
    };

    const filteredCustomers = allCustomers.filter((c) => {
        if (!custSearch) return true;
        const q = custSearch.toLowerCase();
        return (
            c.first_name?.toLowerCase().includes(q) ||
            c.middle_name?.toLowerCase().includes(q) ||
            c.last_name?.toLowerCase().includes(q) ||
            c.phone_number?.includes(q) ||
            c.email?.toLowerCase().includes(q) ||
            c.license_number?.toLowerCase().includes(q)
        );
    });

    const downloadHistoryCsv = () => {
        const data = searchText ? filteredHistory : history;
        if (!data.length) {
            message.warning('No history records to download.');
            return;
        }

        const rows = data.map((tx, i) => ({
            '#': i + 1,
            'Txn #': tx.transaction_number,
            Customer: getFullName(tx.customer),
            Phone: tx.customer?.phone_number ?? '',
            Vehicle: tx.customer?.vehicle_model ?? '',
            Plate: tx.customer?.plate_number ?? '',
            Slot: tx.parking_slot?.slot_number ?? '',
            'Check In': `${tx.check_in_date} ${tx.check_in_time}`,
            'Check Out': tx.actual_checkout_date
                ? `${tx.actual_checkout_date} ${tx.actual_checkout_time ?? ''}`
                : '-',
            Nights: tx.actual_nights_stayed ?? tx.expected_nights ?? 1,
            'Rate/Night': tx.parking_slot?.nightly_rate ?? 200,
            Total: tx.total_amount ?? tx.expected_amount ?? 0,
            'Amount Paid': tx.amount_paid ?? 0,
            Change: tx.change_amount ?? 0,
            Payment: (tx.payment_method ?? 'cash').toUpperCase(),
            Status: tx.status ?? 'paid',
        }));

        const headers = Object.keys(rows[0]);
        const csv = [
            headers.join(','),
            ...rows.map((r) =>
                headers
                    .map((h) => {
                        const v = String((r as any)[h] ?? '');
                        return v.includes(',') || v.includes('"')
                            ? `"${v.replace(/"/g, '""')}"`
                            : v;
                    })
                    .join(','),
            ),
        ].join('\n');

        const blob = new Blob(['\uFEFF' + csv], {
            type: 'text/csv;charset=utf-8;',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `parking_history_${dayjs().format('YYYY-MM-DD_HH-mm')}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        message.success(`Downloaded ${rows.length} records.`);
    };

    // ─── TABLE COLUMN RENDERERS ───────────────────────────────────────────

    const colCustomer = (_: any, r: Booking | ParkingTransaction) => (
        <Space>
            <Avatar icon={<UserOutlined />} size="small" />
            <div>
                <div
                    style={{
                        fontWeight: 600,
                        fontSize: 13,
                        color: 'var(--text-primary)',
                    }}
                >
                    {getFullName(r.customer)}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                    {r.customer?.phone_number}
                </div>
            </div>
        </Space>
    );

    const colVehicleBooking = (_: any, r: Booking) => (
        <div style={{ fontSize: 13 }}>
            <div style={{ color: 'var(--text-primary)' }}>
                {r.customer?.vehicle_model ?? '–'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                {r.customer?.plate_number ?? '–'}
            </div>
        </div>
    );

    const colVehicleTx = (_: any, r: ParkingTransaction) => (
        <div style={{ fontSize: 13 }}>
            <div style={{ color: 'var(--text-primary)' }}>
                {r.customer?.vehicle_model}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                {r.customer?.plate_number}
            </div>
        </div>
    );

    // ─── COLUMN DEFINITIONS ───────────────────────────────────────────────

    const pendingCols: ColumnsType<Booking> = [
        { title: 'Customer', key: 'c', render: colCustomer, width: 200 },
        { title: 'Vehicle', key: 'v', render: colVehicleBooking, width: 160 },
        {
            title: 'Slot',
            key: 's',
            width: 90,
            render: (_: any, r: Booking) => (
                <Tag color="blue" style={{ margin: 0 }}>
                    {r.parking_slot?.slot_number ?? '–'}
                </Tag>
            ),
        },
        {
            title: 'Check In',
            key: 'ci',
            width: 140,
            render: (_: any, r: Booking) => (
                <div style={{ fontSize: 13 }}>
                    <div style={{ color: 'var(--text-primary)' }}>
                        {fmtDate(r.check_in_date)}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                        {fmtTime(r.check_in_date)}
                    </div>
                </div>
            ),
        },
        {
            title: 'Check Out',
            key: 'co',
            width: 140,
            render: (_: any, r: Booking) => (
                <div style={{ fontSize: 13 }}>
                    <div style={{ color: 'var(--text-primary)' }}>
                        {fmtDate(r.check_out_date)}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                        {fmtTime(r.check_out_date)}
                    </div>
                </div>
            ),
        },
        {
            title: 'Downpayment',
            key: 'dp',
            width: 200,
            render: (_: any, r: Booking) => {
                if (!r.downpayment_status) {
                    return (
                        <span
                            style={{
                                fontSize: 12,
                                color: 'var(--text-tertiary)',
                            }}
                        >
                            None
                        </span>
                    );
                }
                return (
                    <div>
                        {r.downpayment_status === 'paid' ? (
                            <Tag
                                color="success"
                                icon={<CheckCircleOutlined />}
                                style={{ margin: 0 }}
                            >
                                Paid ₱{(r.downpayment_amount ?? 0).toFixed(2)}
                            </Tag>
                        ) : r.has_checked_in ? (
                            <Tag color="default" style={{ margin: 0 }}>
                                ₱{(r.downpayment_amount ?? 0).toFixed(2)}
                            </Tag>
                        ) : (
                            <Tag color="orange" style={{ margin: 0 }}>
                                Pending ₱{(r.downpayment_amount ?? 0).toFixed(2)}
                            </Tag>
                        )}
                        {r.downpayment_gcash_ref && (
                            <div
                                style={{
                                    fontSize: 10,
                                    color: '#059669',
                                    marginTop: 2,
                                    fontFamily: 'monospace',
                                    fontWeight: '700',
                                }}
                            >
                                GCash Ref: {r.downpayment_gcash_ref}
                            </div>
                        )}
                        {r.downpayment_status === 'paid' && (
                            <Button
                                size="small"
                                type="link"
                                style={{
                                    padding: 0,
                                    height: 'auto',
                                    fontSize: 11,
                                    marginTop: 4,
                                    color: 'var(--primary)',
                                }}
                                onClick={() => openViewPayment(r)}
                            >
                                View Payment
                            </Button>
                        )}
                    </div>
                );
            },
        },
        {
            title: 'Actions',
            key: 'act',
            width: 240,
            render: (_: any, r: Booking) => (
                <Space size="small">
                    <Button
                        type="primary"
                        size="small"
                        icon={<CheckCircleOutlined />}
                        loading={approvingId === r.id}
                        onClick={() => approveBooking(r.id)}
                        style={{ borderRadius: 6 }}
                    >
                        Approve
                    </Button>
                    <Button
                        danger
                        size="small"
                        icon={<CloseCircleOutlined />}
                        loading={rejectingId === r.id}
                        onClick={() => rejectBooking(r.id)}
                        style={{ borderRadius: 6 }}
                    >
                        Reject
                    </Button>
                </Space>
            ),
        },
    ];

    const approvedCols: ColumnsType<Booking> = [
        { title: 'Customer', key: 'c', render: colCustomer, width: 200 },
        { title: 'Vehicle', key: 'v', render: colVehicleBooking, width: 160 },
        {
            title: 'Slot',
            key: 's',
            width: 90,
            render: (_: any, r: Booking) => (
                <Tag color="green" style={{ margin: 0 }}>
                    {r.parking_slot?.slot_number ?? '–'}
                </Tag>
            ),
        },
        {
            title: 'Check In',
            key: 'ci',
            width: 140,
            render: (_: any, r: Booking) => (
                <div style={{ fontSize: 13 }}>
                    <div style={{ color: 'var(--text-primary)' }}>
                        {fmtDate(r.check_in_date)}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                        {fmtTime(r.check_in_date)}
                    </div>
                </div>
            ),
        },
        {
            title: 'Check Out',
            key: 'co',
            width: 140,
            render: (_: any, r: Booking) => (
                <div style={{ fontSize: 13 }}>
                    <div style={{ color: 'var(--text-primary)' }}>
                        {fmtDate(r.check_out_date)}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                        {fmtTime(r.check_out_date)}
                    </div>
                </div>
            ),
        },
        {
            title: 'Downpayment',
            key: 'dp',
            width: 200,
            render: (_: any, r: Booking) => {
                if (!r.downpayment_status) {
                    return (
                        <span
                            style={{
                                fontSize: 12,
                                color: 'var(--text-tertiary)',
                            }}
                        >
                            None
                        </span>
                    );
                }
                return (
                    <div>
                        {r.downpayment_status === 'paid' ? (
                            <Tag
                                color="success"
                                icon={<CheckCircleOutlined />}
                                style={{ margin: 0 }}
                            >
                                Paid ₱{(r.downpayment_amount ?? 0).toFixed(2)}
                            </Tag>
                        ) : r.has_checked_in ? (
                            <Tag color="default" style={{ margin: 0 }}>
                                ₱{(r.downpayment_amount ?? 0).toFixed(2)}
                            </Tag>
                        ) : (
                            <Tag color="orange" style={{ margin: 0 }}>
                                Pending ₱{(r.downpayment_amount ?? 0).toFixed(2)}
                            </Tag>
                        )}
                        {r.downpayment_gcash_ref && (
                            <div
                                style={{
                                    fontSize: 10,
                                    color: '#059669',
                                    marginTop: 2,
                                    fontFamily: 'monospace',
                                    fontWeight: '700',
                                }}
                            >
                                GCash Ref: {r.downpayment_gcash_ref}
                            </div>
                        )}
                        {r.downpayment_status === 'paid' && (
                            <Button
                                size="small"
                                type="link"
                                style={{
                                    padding: 0,
                                    height: 'auto',
                                    fontSize: 11,
                                    marginTop: 4,
                                    color: 'var(--primary)',
                                }}
                                onClick={() => openViewPayment(r)}
                            >
                                View Payment
                            </Button>
                        )}
                    </div>
                );
            },
        },
        {
            title: 'Status',
            key: 'st',
            width: 150,
            render: (_: any, r: Booking) => {
                if (r.has_checked_in)
                    return (
                        <Tag
                            icon={<CheckCircleOutlined />}
                            color="success"
                            style={{ margin: 0 }}
                        >
                            Checked In
                        </Tag>
                    );
                return (
                    <Tag color="processing" style={{ margin: 0 }}>
                        Awaiting Check-in
                    </Tag>
                );
            },
        },
        {
            title: 'Approved By',
            key: 'ab',
            width: 130,
            render: (_: any, r: Booking) =>
                r.approved_by ? (
                    <span
                        style={{
                            fontSize: 12,
                            color: 'var(--text-secondary)',
                        }}
                    >
                        {r.approved_by.first_name} {r.approved_by.last_name}
                    </span>
                ) : (
                    <span style={{ color: 'var(--text-tertiary)' }}>–</span>
                ),
        },
        {
            title: 'Action',
            key: 'act',
            width: 200,
            render: (_: any, r: Booking) => {
                if (r.has_checked_in)
                    return (
                        <Button size="small" disabled icon={<CheckCircleOutlined />}>
                            Already Checked In
                        </Button>
                    );
                return (
                    <Space size="small">
                        <Button
                            type="primary"
                            size="small"
                            icon={<LoginOutlined />}
                            onClick={() => openCheckinFromApproved(r)}
                            style={{ borderRadius: 6 }}
                        >
                            Check In
                        </Button>
                        {isAdmin && (
                            <Button
                                size="small"
                                icon={<DeleteOutlined />}
                                loading={deletingId === r.id}
                                onClick={() => deleteBooking(r.id)}
                                style={{
                                    borderRadius: 6,
                                    borderColor: '#DC2626',
                                    color: '#DC2626',
                                }}
                            >
                                Delete
                            </Button>
                        )}
                    </Space>
                );
            },
        },
    ];

    const activeCols: ColumnsType<ParkingTransaction> = [
        { title: 'Customer', key: 'c', render: colCustomer, width: 200 },
        { title: 'Vehicle', key: 'v', render: colVehicleTx, width: 160 },
        {
            title: 'Slot',
            key: 's',
            width: 90,
            render: (_: any, r: ParkingTransaction) => (
                <Tag color="blue" style={{ margin: 0 }}>
                    {r.parking_slot?.slot_number}
                </Tag>
            ),
        },
        {
            title: 'Check In',
            key: 'ci',
            width: 140,
            render: (_: any, r: ParkingTransaction) => (
                <div style={{ fontSize: 13 }}>
                    <div style={{ color: 'var(--text-primary)' }}>
                        {fmtDate(r.check_in_date)}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                        {fmtTime(r.check_in_time)}
                    </div>
                </div>
            ),
        },
        {
            title: 'Expected Out',
            key: 'eo',
            width: 160,
            render: (_: any, r: ParkingTransaction) => {
                const co = dayjs(
                    `${r.expected_checkout_date} ${r.expected_checkout_time}`,
                );
                const h = co.diff(dayjs(), 'hour');
                const ov = h < 0;
                const tod = h >= 0 && h <= 24;
                return (
                    <div style={{ fontSize: 13 }}>
                        <div style={{ color: 'var(--text-primary)' }}>
                            {fmtDate(r.expected_checkout_date)}
                        </div>
                        <div
                            style={{
                                fontSize: 11,
                                color: ov
                                    ? '#EF4444'
                                    : tod
                                      ? '#F59E0B'
                                      : 'var(--text-secondary)',
                            }}
                        >
                            {fmtTime(r.expected_checkout_time)}
                            {ov && (
                                <Tag
                                    color="error"
                                    style={{ marginLeft: 4, fontSize: 10 }}
                                >
                                    Overdue
                                </Tag>
                            )}
                            {tod && !ov && (
                                <Tag
                                    color="warning"
                                    style={{ marginLeft: 4, fontSize: 10 }}
                                >
                                    Today
                                </Tag>
                            )}
                        </div>
                    </div>
                );
            },
        },
        {
            title: 'Nights',
            key: 'n',
            align: 'center',
            width: 80,
            render: (_: any, r: ParkingTransaction) => (
                <Tag color="blue" style={{ margin: 0 }}>
                    {r.expected_nights}n
                </Tag>
            ),
        },
        {
            title: 'Est. Amount',
            key: 'amt',
            align: 'right',
            width: 120,
            render: (_: any, r: ParkingTransaction) => (
                <span style={{ fontWeight: 600, color: 'var(--success)' }}>
                    {fmtPHP(r.expected_amount)}
                </span>
            ),
        },
        {
            title: 'Downpayment',
            key: 'dp',
            width: 160,
            render: (_: any, r: ParkingTransaction) => {
                const paidDp = r.downpayment_paid ?? 0;
                if (!paidDp || paidDp <= 0)
                    return (
                        <span
                            style={{
                                fontSize: 12,
                                color: 'var(--text-tertiary)',
                            }}
                        >
                            None
                        </span>
                    );
                return (
                    <Tag
                        color="success"
                        icon={<CheckCircleOutlined />}
                        style={{ margin: 0 }}
                    >
                        Paid ₱{paidDp.toFixed(2)}
                    </Tag>
                );
            },
        },
        {
            title: 'Checked In By',
            key: 'cib',
            width: 130,
            render: (_: any, r: ParkingTransaction) =>
                r.checked_in_by ? (
                    <span
                        style={{
                            fontSize: 12,
                            color: 'var(--text-secondary)',
                        }}
                    >
                        {r.checked_in_by.first_name} {r.checked_in_by.last_name}
                    </span>
                ) : (
                    <span style={{ color: 'var(--text-tertiary)' }}>–</span>
                ),
        },
        {
            title: 'Action',
            key: 'act',
            width: 220,
            render: (_: any, r: ParkingTransaction) => (
                <Space size="small">
                    <Button
                        size="small"
                        icon={<ClockCircleOutlined />}
                        onClick={() => openExtend(r)}
                        style={{ borderRadius: 6 }}
                    >
                        Extend
                    </Button>
                    <Tooltip title={isAdmin ? 'Process checkout' : 'Admin only'}>
                        <Button
                            type="primary"
                            size="small"
                            icon={
                                isAdmin ? <CheckCircleOutlined /> : <LockOutlined />
                            }
                            onClick={() => openCheckout(r)}
                            disabled={!isAdmin}
                            style={{ borderRadius: 6 }}
                        >
                            Check Out
                        </Button>
                    </Tooltip>
                </Space>
            ),
        },
    ];

    const historyCols: ColumnsType<ParkingTransaction> = [
        {
            title: 'Txn #',
            dataIndex: 'transaction_number',
            width: 130,
            render: (t: string) => (
                <span
                    style={{
                        fontFamily: 'monospace',
                        color: 'var(--success)',
                        fontSize: 12,
                    }}
                >
                    {t}
                </span>
            ),
        },
        {
            title: 'Customer',
            key: 'c',
            width: 180,
            render: (_: any, r: ParkingTransaction) => (
                <div style={{ fontSize: 13 }}>
                    <div
                        style={{
                            fontWeight: 500,
                            color: 'var(--text-primary)',
                        }}
                    >
                        {getFullName(r.customer)}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                        {r.customer?.phone_number}
                    </div>
                </div>
            ),
        },
        {
            title: 'Slot',
            key: 's',
            width: 90,
            render: (_: any, r: ParkingTransaction) => (
                <Tag color="blue" style={{ margin: 0 }}>
                    {r.parking_slot?.slot_number}
                </Tag>
            ),
        },
        {
            title: 'Check In',
            key: 'ci',
            width: 140,
            render: (_: any, r: ParkingTransaction) => (
                <div style={{ fontSize: 13 }}>
                    <div style={{ color: 'var(--text-primary)' }}>
                        {fmtDate(r.check_in_date)}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                        {fmtTime(r.check_in_time)}
                    </div>
                </div>
            ),
        },
        {
            title: 'Check Out',
            key: 'co',
            width: 140,
            render: (_: any, r: ParkingTransaction) =>
                r.actual_checkout_date ? (
                    <div style={{ fontSize: 13 }}>
                        <div style={{ color: 'var(--text-primary)' }}>
                            {fmtDate(r.actual_checkout_date)}
                        </div>
                        <div
                            style={{
                                fontSize: 11,
                                color: 'var(--text-secondary)',
                            }}
                        >
                            {fmtTime(r.actual_checkout_time)}
                        </div>
                    </div>
                ) : (
                    <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                        –
                    </span>
                ),
        },
        {
            title: 'Nights',
            key: 'n',
            align: 'center',
            width: 80,
            render: (_: any, r: ParkingTransaction) => (
                <Tag color="blue" style={{ margin: 0 }}>
                    {r.actual_nights_stayed ?? r.expected_nights}n
                </Tag>
            ),
        },
        {
            title: 'Total',
            key: 't',
            align: 'right',
            width: 110,
            render: (_: any, r: ParkingTransaction) => (
                <span style={{ fontWeight: 600, color: 'var(--success)' }}>
                    {fmtPHP(r.total_amount ?? r.expected_amount)}
                </span>
            ),
        },
        {
            title: 'Paid',
            key: 'ap',
            align: 'right',
            width: 110,
            render: (_: any, r: ParkingTransaction) => (
                <span style={{ fontWeight: 600, color: 'var(--primary)' }}>
                    {fmtPHP(r.amount_paid ?? 0)}
                </span>
            ),
        },
        {
            title: 'Downpayment',
            key: 'dp',
            width: 160,
            render: (_: any, r: ParkingTransaction) => {
                const paidDp = r.downpayment_paid ?? 0;
                if (!paidDp || paidDp <= 0)
                    return (
                        <span
                            style={{
                                fontSize: 12,
                                color: 'var(--text-tertiary)',
                            }}
                        >
                            None
                        </span>
                    );
                return (
                    <Tag
                        color="success"
                        icon={<CheckCircleOutlined />}
                        style={{ margin: 0 }}
                    >
                        Paid ₱{paidDp.toFixed(2)}
                    </Tag>
                );
            },
        },
        {
            title: 'Change',
            key: 'ch',
            align: 'right',
            width: 100,
            render: (_: any, r: ParkingTransaction) => {
                const ch = r.change_amount ?? 0;
                return (
                    <span
                        style={{
                            fontSize: 13,
                            color:
                                ch > 0
                                    ? 'var(--success)'
                                    : 'var(--text-tertiary)',
                        }}
                    >
                        {fmtPHP(ch)}
                    </span>
                );
            },
        },
        {
            title: 'Payment',
            key: 'pm',
            align: 'center',
            width: 100,
            render: (_: any, r: ParkingTransaction) => (
                <Tag
                    color={
                        r.payment_method === 'gcash'
                            ? 'blue'
                            : r.payment_method === 'card'
                              ? 'purple'
                              : 'green'
                    }
                    style={{
                        fontSize: 11,
                        textTransform: 'uppercase',
                        margin: 0,
                    }}
                >
                    {r.payment_method ?? 'cash'}
                </Tag>
            ),
        },
        {
            title: 'Type',
            key: 'type',
            width: 80,
            align: 'center',
            render: (_: any, r: ParkingTransaction) => {
                const type = r.booking_type || 'walk_in';
                return (
                    <Tag
                        color={type === 'online' ? 'blue' : 'green'}
                        style={{ fontSize: 11, margin: 0 }}
                    >
                        {type.toUpperCase()}
                    </Tag>
                );
            },
        },
        {
            title: 'Checked In By',
            key: 'cib',
            width: 130,
            render: (_: any, r: ParkingTransaction) =>
                r.checked_in_by ? (
                    <span
                        style={{
                            fontSize: 12,
                            color: 'var(--text-secondary)',
                        }}
                    >
                        {r.checked_in_by.first_name} {r.checked_in_by.last_name}
                    </span>
                ) : (
                    <span style={{ color: 'var(--text-tertiary)' }}>–</span>
                ),
        },
        {
            title: 'Checked Out By',
            key: 'cob',
            width: 130,
            render: (_: any, r: ParkingTransaction) =>
                r.checked_out_by ? (
                    <span
                        style={{
                            fontSize: 12,
                            color: 'var(--text-secondary)',
                        }}
                    >
                        {r.checked_out_by.first_name}{' '}
                        {r.checked_out_by.last_name}
                    </span>
                ) : (
                    <span style={{ color: 'var(--text-tertiary)' }}>–</span>
                ),
        },
    ];

    // ─── CUSTOMER LIST COLUMNS ────────────────────────────────────────────

    const customerCols: ColumnsType<Customer> = [
        {
            title: 'Customer',
            key: 'n',
            width: 220,
            render: (_: any, r: Customer) => (
                <Space>
                    <Avatar icon={<UserOutlined />} size="small" />
                    <div>
                        <div
                            style={{
                                fontWeight: 600,
                                fontSize: 13,
                                color: 'var(--text-primary)',
                            }}
                        >
                            {getFullNameFull(r)}
                        </div>
                        <div
                            style={{
                                fontSize: 11,
                                color: 'var(--text-secondary)',
                            }}
                        >
                            {r.email ?? r.phone_number}
                        </div>
                    </div>
                </Space>
            ),
        },
        {
            title: 'Phone',
            dataIndex: 'phone_number',
            width: 140,
            render: (v: string) => (
                <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>
                    {v}
                </span>
            ),
        },
        {
            title: 'Email',
            dataIndex: 'email',
            width: 180,
            render: (e: string) => (
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                    {e ?? '–'}
                </span>
            ),
        },
        {
            title: 'License',
            key: 'license',
            width: 240,
            render: (_: any, r: Customer) => {
                const hasLicense = r.license_number || r.license_photo;
                const isExpired = r.license_expiration
                    ? dayjs(r.license_expiration).isBefore(dayjs())
                    : false;
                const expiringSoon = r.license_expiration
                    ? dayjs(r.license_expiration).isAfter(dayjs()) &&
                      dayjs(r.license_expiration).isBefore(dayjs().add(30, 'day'))
                    : false;

                const photoUrl =
                    r.license_photo_url || computeLicenseUrl(r.license_photo);

                if (!hasLicense) {
                    return (
                        <span
                            style={{
                                fontSize: 12,
                                color: 'var(--text-tertiary)',
                            }}
                        >
                            Not set
                        </span>
                    );
                }

                return (
                    <div>
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                marginBottom: 4,
                            }}
                        >
                            {photoUrl ? (
                                <Tooltip title="Click to view full size">
                                    <div
                                        onClick={() =>
                                            openPhotoViewer(
                                                photoUrl,
                                                r.license_photo_original_name,
                                                getFullNameFull(r),
                                            )
                                        }
                                        style={{
                                            cursor: 'pointer',
                                            width: 44,
                                            height: 44,
                                            borderRadius: 6,
                                            overflow: 'hidden',
                                            border: '1px solid var(--border-color)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            background: 'var(--bg-surface-hover)',
                                            flexShrink: 0,
                                        }}
                                    >
                                        <img
                                            src={photoUrl}
                                            alt="License"
                                            style={{
                                                width: '100%',
                                                height: '100%',
                                                objectFit: 'cover',
                                            }}
                                            onError={(e) => {
                                                (
                                                    e.target as HTMLImageElement
                                                ).src =
                                                    'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDQiIGhlaWdodD0iNDQiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjQ0IiBoZWlnaHQ9IjQ0IiBmaWxsPSIjMmQzMTQ4Ii8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZpbGw9IiM5OTkiIGZvbnQtc2l6ZT0iMTYiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj7wn5O3PC90ZXh0Pjwvc3ZnPg==';
                                            }}
                                        />
                                    </div>
                                </Tooltip>
                            ) : null}

                            <div style={{ flex: 1, minWidth: 0 }}>
                                {r.license_number && (
                                    <div
                                        style={{
                                            fontWeight: 600,
                                            fontSize: 12,
                                            color: 'var(--text-primary)',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap',
                                        }}
                                    >
                                        {r.license_number}
                                    </div>
                                )}
                                {r.license_type && (
                                    <Tag
                                        color={
                                            LICENSE_TYPE_COLORS[r.license_type]
                                        }
                                        style={{ fontSize: 10, marginTop: 2 }}
                                    >
                                        {LICENSE_TYPE_LABELS[r.license_type]}
                                    </Tag>
                                )}
                            </div>
                        </div>
                        <div style={{ fontSize: 11 }}>
                            {r.license_expiration ? (
                                <>
                                    <CalendarOutlined
                                        style={{ marginRight: 4 }}
                                    />
                                    <span
                                        style={{
                                            color: isExpired
                                                ? '#EF4444'
                                                : expiringSoon
                                                  ? '#F59E0B'
                                                  : 'var(--text-secondary)',
                                        }}
                                    >
                                        {dayjs(r.license_expiration).format(
                                            'MMM DD, YYYY',
                                        )}
                                        {isExpired && ' (Expired)'}
                                        {expiringSoon && ' (Expiring soon)'}
                                    </span>
                                </>
                            ) : (
                                <span
                                    style={{ color: 'var(--text-tertiary)' }}
                                >
                                    No expiration
                                </span>
                            )}
                        </div>
                    </div>
                );
            },
        },
        {
            title: 'Vehicles',
            key: 'v',
            width: 220,
            render: (_: any, r: Customer) => {
                if (!r.vehicles?.length) {
                    return (
                        <span
                            style={{
                                fontSize: 12,
                                color: 'var(--text-tertiary)',
                            }}
                        >
                            –
                        </span>
                    );
                }

                return (
                    <div
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 4,
                        }}
                    >
                        {r.vehicles.slice(0, 2).map((v, i) => (
                            <div
                                key={i}
                                style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    padding: '4px 8px',
                                    background: 'rgba(59,130,246,0.08)',
                                    borderRadius: 6,
                                    border: '1px solid rgba(59,130,246,0.2)',
                                }}
                            >
                                <div
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 4,
                                    }}
                                >
                                    <CarOutlined
                                        style={{
                                            fontSize: 10,
                                            color: '#3B82F6',
                                        }}
                                    />
                                    <span
                                        style={{
                                            fontSize: 11,
                                            fontWeight: 700,
                                            color: 'var(--text-primary)',
                                            fontFamily: 'monospace',
                                        }}
                                    >
                                        {v.plate_number}
                                    </span>
                                </div>
                                <div
                                    style={{
                                        fontSize: 10,
                                        color: 'var(--text-secondary)',
                                        marginLeft: 14,
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                    }}
                                >
                                    {v.vehicle_model || 'Unknown model'}
                                </div>
                            </div>
                        ))}
                        {r.vehicles.length > 2 && (
                            <span
                                style={{
                                    fontSize: 10,
                                    color: 'var(--text-tertiary)',
                                    fontStyle: 'italic',
                                }}
                            >
                                +{r.vehicles.length - 2} more vehicle
                                {r.vehicles.length - 2 > 1 ? 's' : ''}
                            </span>
                        )}
                    </div>
                );
            },
        },
        {
            title: 'Status',
            key: 'is_active',
            width: 110,
            align: 'center',
            render: (_: any, r: Customer) => (
                <Tag
                    color={isCustomerActive(r) ? 'success' : 'error'}
                    style={{ margin: 0, fontWeight: 600 }}
                >
                    {isCustomerActive(r) ? 'Active' : 'Inactive'}
                </Tag>
            ),
        },
        {
            title: 'Type',
            key: 'type',
            width: 100,
            align: 'center',
            render: (_: any, r: Customer) => {
                const type = customerBookingTypeMap.get(r.id);
                if (!type)
                    return (
                        <span style={{ color: 'var(--text-tertiary)' }}>–</span>
                    );
                return (
                    <Tag
                        color={type === 'online' ? 'blue' : 'green'}
                        style={{ margin: 0 }}
                    >
                        {type.toUpperCase()}
                    </Tag>
                );
            },
        },
        {
            title: 'Actions',
            key: 'actions',
            width: 160,
            render: (_: any, r: Customer) => {
                const photoUrl =
                    r.license_photo_url || computeLicenseUrl(r.license_photo);
                return (
                    <Space size={4}>
                        <Tooltip title="View Details">
                            <Button
                                type="text"
                                size="small"
                                icon={<EyeOutlined />}
                                onClick={() => handleViewCustomer(r)}
                                style={{
                                    color: 'var(--primary)',
                                    border: 'none',
                                    background: 'transparent',
                                }}
                            />
                        </Tooltip>
                        {photoUrl && (
                            <Tooltip title="View License Photo">
                                <Button
                                    type="text"
                                    size="small"
                                    icon={<FileImageOutlined />}
                                    onClick={() =>
                                        openPhotoViewer(
                                            photoUrl,
                                            r.license_photo_original_name,
                                            getFullNameFull(r),
                                        )
                                    }
                                    style={{
                                        color: '#8B5CF6',
                                        border: 'none',
                                        background: 'transparent',
                                    }}
                                />
                            </Tooltip>
                        )}
                        {isAdmin && (
                            <Tooltip title="Edit Customer">
                                <Button
                                    type="text"
                                    size="small"
                                    icon={<EditOutlined />}
                                    onClick={() => handleEditCustomer(r)}
                                    style={{
                                        color: 'var(--success)',
                                        border: 'none',
                                        background: 'transparent',
                                    }}
                                />
                            </Tooltip>
                        )}
                        {isAdmin && (
                            <Tooltip
                                title={
                                    isCustomerActive(r)
                                        ? 'Deactivate Account'
                                        : 'Activate Account'
                                }
                            >
                                <Button
                                    type="text"
                                    size="small"
                                    icon={
                                        isCustomerActive(r) ? (
                                            <CloseCircleOutlined />
                                        ) : (
                                            <CheckCircleOutlined />
                                        )
                                    }
                                    onClick={() => toggleCustomerStatus(r)}
                                    style={{
                                        color: isCustomerActive(r)
                                            ? '#DC2626'
                                            : 'var(--success)',
                                        border: 'none',
                                        background: 'transparent',
                                    }}
                                />
                            </Tooltip>
                        )}
                    </Space>
                );
            },
        },
    ];

    // ─── TABS ─────────────────────────────────────────────────────────────

    const tabItems = [
        {
            key: 'pending',
            label: (
                <span style={{ color: 'var(--text-secondary)' }}>
                    <BellOutlined /> Pending{' '}
                    {pendingBookings.length > 0 && (
                        <Badge
                            count={pendingBookings.length}
                            style={{ marginLeft: 6 }}
                        />
                    )}
                </span>
            ),
            children: (
                <>
                    <Input.Search
                        placeholder="Search name, phone, plate, slot…"
                        allowClear
                        value={pendingSearch}
                        onChange={(e) => setPendingSearch(e.target.value)}
                        style={{ width: 320, marginBottom: 16 }}
                        size="small"
                    />
                    <Table
                        columns={pendingCols}
                        dataSource={filteredPendingBookings}
                        rowKey="id"
                        pagination={{ pageSize: 10, size: 'small' }}
                        size="small"
                        scroll={{ x: 'max-content' }}
                        style={{ width: '100%' }}
                        locale={{ emptyText: 'No pending bookings' }}
                    />
                </>
            ),
        },
        {
            key: 'approved',
            label: (
                <span style={{ color: 'var(--text-secondary)' }}>
                    <CheckCircleOutlined /> Approved ({approvedBookings.length})
                </span>
            ),
            children: (
                <>
                    <Input.Search
                        placeholder="Search name, phone, plate, slot…"
                        allowClear
                        value={approvedSearch}
                        onChange={(e) => setApprovedSearch(e.target.value)}
                        style={{ width: 320, marginBottom: 16 }}
                        size="small"
                    />
                    <Table
                        columns={approvedCols}
                        dataSource={filteredApprovedBookings}
                        rowKey="id"
                        pagination={{ pageSize: 10, size: 'small' }}
                        size="small"
                        scroll={{ x: 'max-content' }}
                        style={{ width: '100%' }}
                        locale={{ emptyText: 'No approved bookings' }}
                    />
                </>
            ),
        },
        {
            key: 'active',
            label: (
                <span style={{ color: 'var(--text-secondary)' }}>
                    <CarOutlined /> Active ({transactions.length})
                </span>
            ),
            children: (
                <>
                    <Input.Search
                        placeholder="Search name, phone, plate, slot, txn#…"
                        allowClear
                        value={activeSearch}
                        onChange={(e) => setActiveSearch(e.target.value)}
                        style={{ width: 320, marginBottom: 16 }}
                        size="small"
                    />
                    <Table
                        columns={activeCols}
                        dataSource={filteredTransactions}
                        rowKey="id"
                        pagination={{ pageSize: 10, size: 'small' }}
                        size="small"
                        scroll={{ x: 'max-content' }}
                        style={{ width: '100%' }}
                        locale={{ emptyText: 'No active sessions' }}
                    />
                </>
            ),
        },
        {
            key: 'history',
            label: (
                <span style={{ color: 'var(--text-secondary)' }}>
                    <ClockCircleOutlined /> History ({history.length})
                </span>
            ),
            children: (
                <>
                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: 16,
                            flexWrap: 'wrap',
                            gap: 8,
                        }}
                    >
                        <Input.Search
                            placeholder="Search name, phone, txn#…"
                            allowClear
                            onChange={(e) => setSearchText(e.target.value)}
                            style={{ width: 320 }}
                            size="small"
                        />
                        <Button
                            icon={<DownloadOutlined />}
                            onClick={downloadHistoryCsv}
                            size="small"
                            style={{ color: 'var(--text-secondary)' }}
                        >
                            Download CSV
                        </Button>
                    </div>
                    <Table
                        columns={historyCols}
                        dataSource={filteredHistory}
                        rowKey="id"
                        pagination={{ pageSize: 10, size: 'small' }}
                        size="small"
                        scroll={{ x: 'max-content' }}
                        style={{ width: '100%' }}
                        locale={{ emptyText: 'No history' }}
                    />
                </>
            ),
        },
        {
            key: 'all_customers',
            label: (
                <span style={{ color: 'var(--text-secondary)' }}>
                    <TeamOutlined /> Customers ({allCustomers.length})
                    {licenseExpired > 0 && (
                        <Badge
                            count={licenseExpired}
                            style={{
                                backgroundColor: '#EF4444',
                                marginLeft: 6,
                                fontSize: 10,
                            }}
                            title="Expired licenses"
                        />
                    )}
                    {licenseExpiringSoon > 0 && (
                        <Badge
                            count={licenseExpiringSoon}
                            style={{
                                backgroundColor: '#F59E0B',
                                marginLeft: 4,
                                fontSize: 10,
                            }}
                            title="Licenses expiring soon"
                        />
                    )}
                </span>
            ),
            children: (
                <>
                    <Input.Search
                        placeholder="Search by name, phone, email, license..."
                        allowClear
                        onChange={(e) => setCustSearch(e.target.value)}
                        style={{ width: 320, marginBottom: 16 }}
                        size="small"
                    />
                    <Table
                        columns={customerCols}
                        dataSource={filteredCustomers}
                        rowKey="id"
                        pagination={{ pageSize: 10, size: 'small' }}
                        size="small"
                        scroll={{ x: 'max-content' }}
                        style={{ width: '100%' }}
                        locale={{ emptyText: 'No customers' }}
                    />
                </>
            ),
        },
    ];

    // ─── LOADING ──────────────────────────────────────────────────────────

    if (loading)
        return (
            <div className="page-loading">
                <Spin size="large" tip="Loading…" />
            </div>
        );

    const statBodyStyle: React.CSSProperties = {
        height: 120,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
    };

    const viewCustomerVehicles = viewCustomer?.vehicles ?? [];

    // ─── RENDER ───────────────────────────────────────────────────────────

    return (
        <div>
            {/* PAGE HEADER */}
            <div className="page-header">
                <div>
                    <h1 className="page-title">Parking Management</h1>
                    <p className="page-description">
                        Bookings, check-ins, and check-outs
                    </p>
                </div>
                <Space size="small">
                    <Popover
                        content={
                            <div
                                style={{
                                    width: 340,
                                    maxHeight: 360,
                                    overflowY: 'auto',
                                    background: 'var(--bg-card)',
                                    borderRadius: 8,
                                }}
                            >
                                {visibleNotifications.length === 0 ? (
                                    <div
                                        style={{
                                            textAlign: 'center',
                                            padding: 20,
                                        }}
                                    >
                                        <CheckCircleOutlined
                                            style={{
                                                fontSize: 28,
                                                color: '#059669',
                                            }}
                                        />
                                        <p
                                            style={{
                                                color: 'var(--text-secondary)',
                                                marginTop: 8,
                                            }}
                                        >
                                            All caught up!
                                        </p>
                                    </div>
                                ) : (
                                    <List
                                        size="small"
                                        dataSource={visibleNotifications.slice(
                                            0,
                                            20,
                                        )}
                                        renderItem={(item) => (
                                            <List.Item
                                                key={item.id}
                                                onClick={() =>
                                                    handleNotifClick(item)
                                                }
                                                style={{
                                                    cursor: 'pointer',
                                                    padding: '8px 10px',
                                                    borderRadius: 6,
                                                    marginBottom: 2,
                                                    borderLeft: `3px solid ${urgencyColor(item.urgency)}`,
                                                    background: 'transparent',
                                                }}
                                            >
                                                <List.Item.Meta
                                                    avatar={
                                                        <span
                                                            style={{
                                                                fontSize: 14,
                                                                color: urgencyColor(
                                                                    item.urgency,
                                                                ),
                                                            }}
                                                        >
                                                            {notifIcon(
                                                                item.type,
                                                            )}
                                                        </span>
                                                    }
                                                    title={
                                                        <div
                                                            style={{
                                                                display: 'flex',
                                                                justifyContent:
                                                                    'space-between',
                                                            }}
                                                        >
                                                            <span
                                                                style={{
                                                                    fontWeight: 600,
                                                                    fontSize: 12,
                                                                    color: 'var(--text-primary)',
                                                                }}
                                                            >
                                                                {item.title}
                                                            </span>
                                                            <span
                                                                style={{
                                                                    fontSize: 10,
                                                                    color: 'var(--text-tertiary)',
                                                                }}
                                                            >
                                                                {item.time}
                                                            </span>
                                                        </div>
                                                    }
                                                    description={
                                                        <div>
                                                            <div
                                                                style={{
                                                                    fontSize: 11,
                                                                    color: 'var(--text-secondary)',
                                                                }}
                                                            >
                                                                {item.message}
                                                            </div>
                                                            <div
                                                                style={{
                                                                    fontSize: 10,
                                                                    color: '#2563EB',
                                                                    marginTop: 4,
                                                                }}
                                                            >
                                                                → Go to{' '}
                                                                {item.targetTab}{' '}
                                                                tab
                                                            </div>
                                                        </div>
                                                    }
                                                />
                                            </List.Item>
                                        )}
                                    />
                                )}
                            </div>
                        }
                        title={
                            <span
                                style={{
                                    color: 'var(--text-primary)',
                                    fontWeight: 600,
                                }}
                            >
                                🔔 Notifications
                            </span>
                        }
                        trigger="click"
                        open={notifVisible}
                        onOpenChange={setNotifVisible}
                        placement="bottomRight"
                        overlayStyle={{
                            padding: 0,
                            background: 'var(--bg-card)',
                        }}
                    >
                        <Badge count={totalNotifCount} size="small">
                            <Button
                                icon={<BellOutlined />}
                                size="small"
                                style={{
                                    color: 'var(--text-secondary)',
                                    borderColor: 'var(--border-color)',
                                }}
                            >
                                Notifications
                            </Button>
                        </Badge>
                    </Popover>
                    <Button
                        icon={<ReloadOutlined />}
                        onClick={() => {
                            setPendingSearch('');
                            setApprovedSearch('');
                            setActiveSearch('');
                            setSearchText('');
                            setCustSearch('');
                            fetchAllData();
                        }}
                        size="small"
                        style={{
                            color: 'var(--text-secondary)',
                            borderColor: 'var(--border-color)',
                        }}
                    >
                        Refresh
                    </Button>
                    <Button
                        icon={<SearchOutlined />}
                        onClick={() => setSearchCustModal(true)}
                        size="small"
                        style={{
                            color: 'var(--text-secondary)',
                            borderColor: 'var(--border-color)',
                        }}
                    >
                        Search
                    </Button>
                    <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={() => {
                            resetCheckinForm();
                            setCheckinModal(true);
                        }}
                        size="small"
                    >
                        Check In
                    </Button>
                </Space>
            </div>

            {/* STAT CARDS */}
            <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
                <Col xs={24} sm={12} md={4}>
                    <Card
                        className="stat-card stat-card-success"
                        styles={{ body: statBodyStyle }}
                    >
                        <div
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'flex-start',
                                height: '100%',
                            }}
                        >
                            <div
                                style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    justifyContent: 'space-between',
                                    height: '100%',
                                }}
                            >
                                <div
                                    style={{
                                        color: 'var(--text-tertiary)',
                                        fontSize: 11,
                                        textTransform: 'uppercase',
                                        fontWeight: 600,
                                    }}
                                >
                                    Total Customers
                                </div>
                                <div
                                    style={{
                                        fontSize: 28,
                                        fontWeight: 700,
                                        color: 'var(--text-primary)',
                                    }}
                                >
                                    {totalCustomers}
                                </div>
                                <div
                                    style={{
                                        color: 'var(--text-tertiary)',
                                        fontSize: 10,
                                    }}
                                >
                                    {withLicense} with license
                                </div>
                            </div>
                            <TeamOutlined
                                style={{
                                    color: '#059669',
                                    fontSize: 24,
                                    opacity: 0.8,
                                }}
                            />
                        </div>
                    </Card>
                </Col>
                <Col xs={24} sm={12} md={4}>
                    <Card
                        className="stat-card stat-card-warning"
                        styles={{ body: statBodyStyle }}
                    >
                        <div
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'flex-start',
                                height: '100%',
                            }}
                        >
                            <div
                                style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    justifyContent: 'space-between',
                                    height: '100%',
                                }}
                            >
                                <div
                                    style={{
                                        color: 'var(--text-tertiary)',
                                        fontSize: 11,
                                        textTransform: 'uppercase',
                                        fontWeight: 600,
                                    }}
                                >
                                    Pending Bookings
                                </div>
                                <div
                                    style={{
                                        fontSize: 28,
                                        fontWeight: 700,
                                        color: '#D97706',
                                    }}
                                >
                                    {totalPending}
                                </div>
                            </div>
                            <BellOutlined
                                style={{
                                    color: '#D97706',
                                    fontSize: 24,
                                    opacity: 0.8,
                                }}
                            />
                        </div>
                    </Card>
                </Col>
                <Col xs={24} sm={12} md={4}>
                    <Card
                        className="stat-card stat-card-secondary"
                        styles={{ body: statBodyStyle }}
                    >
                        <div
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'flex-start',
                                height: '100%',
                            }}
                        >
                            <div
                                style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    justifyContent: 'space-between',
                                    height: '100%',
                                }}
                            >
                                <div
                                    style={{
                                        color: 'var(--text-tertiary)',
                                        fontSize: 11,
                                        textTransform: 'uppercase',
                                        fontWeight: 600,
                                    }}
                                >
                                    Active Parking
                                </div>
                                <div
                                    style={{
                                        fontSize: 28,
                                        fontWeight: 700,
                                        color: '#0891B2',
                                    }}
                                >
                                    {totalActive}
                                </div>
                                <div
                                    style={{
                                        color: 'var(--text-tertiary)',
                                        fontSize: 10,
                                    }}
                                >
                                    {occupancyRate}% occupied
                                </div>
                            </div>
                            <CarOutlined
                                style={{
                                    color: '#0891B2',
                                    fontSize: 24,
                                    opacity: 0.8,
                                }}
                            />
                        </div>
                    </Card>
                </Col>
                <Col xs={24} sm={12} md={4}>
                    <Card
                        className="stat-card stat-card-success"
                        styles={{ body: statBodyStyle }}
                    >
                        <div
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'flex-start',
                                height: '100%',
                            }}
                        >
                            <div
                                style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    justifyContent: 'space-between',
                                    height: '100%',
                                }}
                            >
                                <div
                                    style={{
                                        color: 'var(--text-tertiary)',
                                        fontSize: 11,
                                        textTransform: 'uppercase',
                                        fontWeight: 600,
                                    }}
                                >
                                    Total Revenue
                                </div>
                                <div
                                    style={{
                                        fontSize: 20,
                                        fontWeight: 700,
                                        color: '#059669',
                                    }}
                                >
                                    {fmtPHP(totalRevenue)}
                                </div>
                            </div>
                            <DollarOutlined
                                style={{
                                    color: '#059669',
                                    fontSize: 24,
                                    opacity: 0.8,
                                }}
                            />
                        </div>
                    </Card>
                </Col>
                <Col xs={24} sm={12} md={4}>
                    <Card
                        className="stat-card stat-card-danger"
                        styles={{ body: statBodyStyle }}
                    >
                        <div
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'flex-start',
                                height: '100%',
                            }}
                        >
                            <div
                                style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    justifyContent: 'space-between',
                                    height: '100%',
                                }}
                            >
                                <div
                                    style={{
                                        color: 'var(--text-tertiary)',
                                        fontSize: 11,
                                        textTransform: 'uppercase',
                                        fontWeight: 600,
                                    }}
                                >
                                    Expired Licenses
                                </div>
                                <div
                                    style={{
                                        fontSize: 28,
                                        fontWeight: 700,
                                        color: '#EF4444',
                                    }}
                                >
                                    {licenseExpired}
                                </div>
                                <div
                                    style={{
                                        color: 'var(--text-tertiary)',
                                        fontSize: 10,
                                    }}
                                >
                                    {licenseExpiringSoon} expiring soon
                                </div>
                            </div>
                            <CloseCircleOutlined
                                style={{
                                    color: '#EF4444',
                                    fontSize: 24,
                                    opacity: 0.8,
                                }}
                            />
                        </div>
                    </Card>
                </Col>
            </Row>

            {/* MAIN TABS */}
            <Card
                size="small"
                style={{
                    borderRadius: 12,
                    background: 'var(--bg-card)',
                    borderColor: 'var(--border-color)',
                }}
                styles={{ body: { padding: '16px', overflow: 'visible' } }}
            >
                <Tabs
                    activeKey={activeTab}
                    onChange={setActiveTab}
                    items={tabItems}
                    size="small"
                    tabBarStyle={{
                        overflowX: 'auto',
                        whiteSpace: 'nowrap',
                        borderBottom: '1px solid var(--border-color)',
                    }}
                />
            </Card>

            {/* ─── LICENSE PHOTO VIEWER MODAL ─────────────────────────────── */}
            <Modal
                title={
                    <Space>
                        <FileImageOutlined style={{ color: '#8B5CF6' }} />
                        <span
                            style={{
                                fontWeight: 600,
                                color: 'var(--text-primary)',
                            }}
                        >
                            License Photo
                            {photoViewerData?.customerName
                                ? ` – ${photoViewerData.customerName}`
                                : ''}
                        </span>
                    </Space>
                }
                open={photoViewerOpen}
                onCancel={() => setPhotoViewerOpen(false)}
                footer={[
                    <Button
                        key="close"
                        type="primary"
                        onClick={() => setPhotoViewerOpen(false)}
                    >
                        Close
                    </Button>,
                ]}
                width={720}
                centered
                destroyOnClose
            >
                {photoViewerData && (
                    <div
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: 12,
                        }}
                    >
                        <img
                            src={photoViewerData.url}
                            alt="License"
                            style={{
                                maxWidth: '100%',
                                maxHeight: '70vh',
                                objectFit: 'contain',
                                borderRadius: 8,
                                border: '1px solid var(--border-color)',
                                background: 'var(--bg-surface-hover)',
                            }}
                            onError={(e) => {
                                (e.target as HTMLImageElement).src =
                                    'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iIzJkMzE0OCIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmaWxsPSIjOTk5IiBmb250LXNpemU9IjE0IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjNlbSI+SW1hZ2UgTm90IEZvdW5kPC90ZXh0Pjwvc3ZnPg==';
                            }}
                        />
                        {photoViewerData.name && (
                            <div
                                style={{
                                    fontSize: 12,
                                    color: 'var(--text-secondary)',
                                }}
                            >
                                📎 {photoViewerData.name}
                            </div>
                        )}
                    </div>
                )}
            </Modal>

            {/* ─── CUSTOMER EDIT MODAL ───────────────────────────────────── */}
            <Modal
                title={
                    <Space>
                        <EditOutlined style={{ color: 'var(--success)' }} />
                        <span
                            style={{
                                fontWeight: 600,
                                color: 'var(--text-primary)',
                            }}
                        >
                            Edit Customer - {selectedCustomer?.first_name}{' '}
                            {selectedCustomer?.last_name}
                        </span>
                    </Space>
                }
                open={editCustomerModal}
                onCancel={() => setEditCustomerModal(false)}
                footer={null}
                width={640}
                destroyOnClose
            >
                <Form
                    form={editForm}
                    layout="vertical"
                    onFinish={handleSaveCustomer}
                    size="small"
                >
                    <Row gutter={12}>
                        <Col span={8}>
                            <Form.Item
                                name="first_name"
                                label="First Name"
                                rules={[{ required: true }]}
                            >
                                <Input placeholder="First name" />
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item name="middle_name" label="Middle Name">
                                <Input placeholder="Middle name" />
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item
                                name="last_name"
                                label="Last Name"
                                rules={[{ required: true }]}
                            >
                                <Input placeholder="Last name" />
                            </Form.Item>
                        </Col>
                    </Row>

                    <Row gutter={12}>
                        <Col span={12}>
                            <Form.Item
                                name="email"
                                label="Email"
                                rules={[
                                    { required: true, type: 'email' },
                                ]}
                            >
                                <Input placeholder="Email" />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item
                                name="phone_number"
                                label="Phone Number"
                                rules={[{ required: true }]}
                            >
                                <Input placeholder="Phone number" />
                            </Form.Item>
                        </Col>
                    </Row>

                    <Form.Item name="address" label="Address">
                        <Input.TextArea rows={2} placeholder="Address" />
                    </Form.Item>

                    <Form.Item name="is_active" label="Status">
                        <Select placeholder="Status">
                            <Option value={true}>Active</Option>
                            <Option value={false}>Inactive</Option>
                        </Select>
                    </Form.Item>

                    <Divider orientation="left">License Information</Divider>

                    <Row gutter={12}>
                        <Col span={8}>
                            <Form.Item
                                name="license_number"
                                label="License Number"
                            >
                                <Input placeholder="e.g., N01-23-004567" />
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item
                                name="license_type"
                                label="License Type"
                            >
                                <Select placeholder="Select type" allowClear>
                                    {LICENSE_TYPES.map((type) => (
                                        <Option
                                            key={type.value}
                                            value={type.value}
                                        >
                                            {type.label}
                                        </Option>
                                    ))}
                                </Select>
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item
                                name="license_expiration"
                                label="Expiration Date"
                            >
                                <DatePicker style={{ width: '100%' }} />
                            </Form.Item>
                        </Col>
                    </Row>

                    {selectedCustomer &&
                        (() => {
                            const photoUrl =
                                selectedCustomer.license_photo_url ||
                                computeLicenseUrl(
                                    selectedCustomer.license_photo,
                                );

                            return (
                                <div style={{ marginBottom: 16 }}>
                                    <div
                                        style={{
                                            fontSize: 13,
                                            fontWeight: 500,
                                            color: 'var(--text-primary)',
                                            marginBottom: 8,
                                        }}
                                    >
                                        License Photo
                                    </div>
                                    {photoUrl ? (
                                        <Space align="start" size={16}>
                                            <div
                                                onClick={() =>
                                                    openPhotoViewer(
                                                        photoUrl,
                                                        selectedCustomer.license_photo_original_name,
                                                        `${selectedCustomer.first_name} ${selectedCustomer.last_name}`,
                                                    )
                                                }
                                                style={{
                                                    cursor: 'pointer',
                                                    width: 140,
                                                    height: 140,
                                                    borderRadius: 8,
                                                    overflow: 'hidden',
                                                    border: '1px solid var(--border-color)',
                                                    background:
                                                        'var(--bg-surface-hover)',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                }}
                                            >
                                                <img
                                                    src={photoUrl}
                                                    alt="License"
                                                    style={{
                                                        width: '100%',
                                                        height: '100%',
                                                        objectFit: 'cover',
                                                    }}
                                                    onError={(e) => {
                                                        (
                                                            e.target as HTMLImageElement
                                                        ).src =
                                                            'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTQwIiBoZWlnaHQ9IjE0MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTQwIiBoZWlnaHQ9IjE0MCIgZmlsbD0iIzJkMzE0OCIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmaWxsPSIjOTk5IiBmb250LXNpemU9IjEyIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjNlbSI+Tm8gSW1hZ2U8L3RleHQ+PC9zdmc+';
                                                    }}
                                                />
                                            </div>
                                            <div>
                                                <div
                                                    style={{
                                                        fontSize: 11,
                                                        color: 'var(--text-secondary)',
                                                        marginBottom: 8,
                                                    }}
                                                >
                                                    {selectedCustomer.license_photo_original_name ||
                                                        'License photo'}
                                                </div>
                                                <Space
                                                    direction="vertical"
                                                    size={6}
                                                >
                                                    <Button
                                                        size="small"
                                                        icon={<EyeOutlined />}
                                                        onClick={() =>
                                                            openPhotoViewer(
                                                                photoUrl,
                                                                selectedCustomer.license_photo_original_name,
                                                                `${selectedCustomer.first_name} ${selectedCustomer.last_name}`,
                                                            )
                                                        }
                                                    >
                                                        View Full Size
                                                    </Button>
                                                    <Upload
                                                        accept="image/*"
                                                        showUploadList={false}
                                                        beforeUpload={(
                                                            file,
                                                        ) => {
                                                            if (
                                                                selectedCustomer
                                                            ) {
                                                                handleUploadLicense(
                                                                    file,
                                                                    selectedCustomer.id,
                                                                );
                                                            }
                                                            return false;
                                                        }}
                                                    >
                                                        <Button
                                                            size="small"
                                                            icon={
                                                                <CameraOutlined />
                                                            }
                                                            loading={
                                                                uploadingLicense
                                                            }
                                                        >
                                                            Replace Photo
                                                        </Button>
                                                    </Upload>
                                                    <Button
                                                        size="small"
                                                        danger
                                                        icon={
                                                            <DeleteOutlined />
                                                        }
                                                        onClick={() => {
                                                            if (
                                                                selectedCustomer
                                                            ) {
                                                                handleDeleteLicense(
                                                                    selectedCustomer.id,
                                                                );
                                                            }
                                                        }}
                                                    >
                                                        Delete
                                                    </Button>
                                                </Space>
                                            </div>
                                        </Space>
                                    ) : (
                                        <Upload
                                            accept="image/*"
                                            showUploadList={false}
                                            beforeUpload={(file) => {
                                                if (selectedCustomer) {
                                                    handleUploadLicense(
                                                        file,
                                                        selectedCustomer.id,
                                                    );
                                                }
                                                return false;
                                            }}
                                        >
                                            <Button
                                                icon={<CameraOutlined />}
                                                loading={uploadingLicense}
                                            >
                                                Upload License Photo
                                            </Button>
                                        </Upload>
                                    )}
                                    <div
                                        style={{
                                            fontSize: 11,
                                            color: 'var(--text-secondary)',
                                            marginTop: 4,
                                        }}
                                    >
                                        JPG, PNG, GIF up to 5MB
                                    </div>
                                </div>
                            );
                        })()}

                    <Form.Item
                        style={{ textAlign: 'right', marginBottom: 0 }}
                    >
                        <Button
                            onClick={() => setEditCustomerModal(false)}
                            style={{ marginRight: 8 }}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="primary"
                            htmlType="submit"
                            loading={submitting}
                        >
                            Update Customer
                        </Button>
                    </Form.Item>
                </Form>
            </Modal>

            {/* ─── VIEW CUSTOMER MODAL ───────────────────────────────────── */}
            <Modal
                title={
                    <Space>
                        <UserOutlined style={{ color: 'var(--primary)' }} />
                        <span
                            style={{
                                fontWeight: 600,
                                color: 'var(--text-primary)',
                            }}
                        >
                            Customer Details
                        </span>
                    </Space>
                }
                open={viewCustomerModal}
                onCancel={() => setViewCustomerModal(false)}
                footer={[
                    isAdmin && viewCustomer && (
                        <Button
                            key="toggle"
                            danger={isCustomerActive(viewCustomer)}
                            onClick={() => toggleCustomerStatus(viewCustomer)}
                        >
                            {isCustomerActive(viewCustomer)
                                ? 'Deactivate'
                                : 'Activate'}
                        </Button>
                    ),
                    isAdmin && (
                        <Button
                            key="edit"
                            type="primary"
                            onClick={() => {
                                if (viewCustomer) {
                                    setViewCustomerModal(false);
                                    handleEditCustomer(viewCustomer);
                                }
                            }}
                        >
                            <EditOutlined /> Edit
                        </Button>
                    ),
                    <Button
                        key="close"
                        onClick={() => setViewCustomerModal(false)}
                    >
                        Close
                    </Button>,
                ]}
                width={720}
                destroyOnClose
            >
                {viewCustomer && (
                    <Tabs defaultActiveKey="profile">
                        <TabPane tab="Profile" key="profile">
                            <Descriptions bordered size="small" column={2}>
                                <Descriptions.Item label="Name" span={2}>
                                    {viewCustomer.first_name}{' '}
                                    {viewCustomer.middle_name || ''}{' '}
                                    {viewCustomer.last_name}
                                </Descriptions.Item>
                                <Descriptions.Item label="Email">
                                    {viewCustomer.email || 'N/A'}
                                </Descriptions.Item>
                                <Descriptions.Item label="Phone">
                                    {viewCustomer.phone_number}
                                </Descriptions.Item>
                                <Descriptions.Item label="Address" span={2}>
                                    {viewCustomer.address || 'Not set'}
                                </Descriptions.Item>
                                <Descriptions.Item label="Status">
                                    <Badge
                                        status={
                                            isCustomerActive(viewCustomer)
                                                ? 'success'
                                                : 'error'
                                        }
                                        text={
                                            isCustomerActive(viewCustomer)
                                                ? 'Active'
                                                : 'Inactive'
                                        }
                                    />
                                </Descriptions.Item>
                                <Descriptions.Item label="Vehicles">
                                    {viewCustomerVehicles.length} vehicle(s)
                                </Descriptions.Item>
                            </Descriptions>

                            <Divider orientation="left">
                                License Information
                            </Divider>

                            <Descriptions bordered size="small" column={2}>
                                <Descriptions.Item label="License Number">
                                    {viewCustomer.license_number || 'Not set'}
                                </Descriptions.Item>
                                <Descriptions.Item label="License Type">
                                    {viewCustomer.license_type ? (
                                        <Tag
                                            color={
                                                LICENSE_TYPE_COLORS[
                                                    viewCustomer.license_type
                                                ]
                                            }
                                        >
                                            {
                                                LICENSE_TYPE_LABELS[
                                                    viewCustomer.license_type
                                                ]
                                            }
                                        </Tag>
                                    ) : (
                                        'Not set'
                                    )}
                                </Descriptions.Item>
                                <Descriptions.Item label="Expiration Date">
                                    {viewCustomer.license_expiration ? (
                                        <>
                                            {dayjs(
                                                viewCustomer.license_expiration,
                                            ).format('MMM DD, YYYY')}
                                            {dayjs(
                                                viewCustomer.license_expiration,
                                            ).isBefore(dayjs()) && (
                                                <Tag
                                                    color="error"
                                                    style={{ marginLeft: 8 }}
                                                >
                                                    Expired
                                                </Tag>
                                            )}
                                            {dayjs(
                                                viewCustomer.license_expiration,
                                            ).isAfter(dayjs()) &&
                                                dayjs(
                                                    viewCustomer.license_expiration,
                                                ).isBefore(
                                                    dayjs().add(30, 'day'),
                                                ) && (
                                                    <Tag
                                                        color="warning"
                                                        style={{
                                                            marginLeft: 8,
                                                        }}
                                                    >
                                                        Expiring Soon
                                                    </Tag>
                                                )}
                                        </>
                                    ) : (
                                        'Not set'
                                    )}
                                </Descriptions.Item>
                                <Descriptions.Item label="License Photo">
                                    {(() => {
                                        const photoUrl =
                                            viewCustomer.license_photo_url ||
                                            computeLicenseUrl(
                                                viewCustomer.license_photo,
                                            );

                                        if (!photoUrl) {
                                            return (
                                                <div>
                                                    <span
                                                        style={{
                                                            color: 'var(--text-tertiary)',
                                                        }}
                                                    >
                                                        No photo uploaded
                                                    </span>
                                                    {isAdmin && (
                                                        <Upload
                                                            accept="image/*"
                                                            showUploadList={
                                                                false
                                                            }
                                                            beforeUpload={(
                                                                file,
                                                            ) => {
                                                                handleUploadLicense(
                                                                    file,
                                                                    viewCustomer.id,
                                                                );
                                                                return false;
                                                            }}
                                                        >
                                                            <Button
                                                                size="small"
                                                                icon={
                                                                    <CameraOutlined />
                                                                }
                                                                loading={
                                                                    uploadingLicense
                                                                }
                                                                style={{
                                                                    marginTop: 8,
                                                                }}
                                                            >
                                                                Upload Photo
                                                            </Button>
                                                        </Upload>
                                                    )}
                                                </div>
                                            );
                                        }

                                        return (
                                            <Space align="start" size={16}>
                                                <div
                                                    onClick={() =>
                                                        openPhotoViewer(
                                                            photoUrl,
                                                            viewCustomer.license_photo_original_name,
                                                            `${viewCustomer.first_name} ${viewCustomer.last_name}`,
                                                        )
                                                    }
                                                    style={{
                                                        cursor: 'pointer',
                                                        width: 140,
                                                        height: 140,
                                                        borderRadius: 8,
                                                        overflow: 'hidden',
                                                        border: '1px solid var(--border-color)',
                                                        background:
                                                            'var(--bg-surface-hover)',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent:
                                                            'center',
                                                    }}
                                                >
                                                    <img
                                                        src={photoUrl}
                                                        alt="License"
                                                        style={{
                                                            width: '100%',
                                                            height: '100%',
                                                            objectFit: 'cover',
                                                        }}
                                                        onError={(e) => {
                                                            (
                                                                e.target as HTMLImageElement
                                                            ).src =
                                                                'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTQwIiBoZWlnaHQ9IjE0MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTQwIiBoZWlnaHQ9IjE0MCIgZmlsbD0iIzJkMzE0OCIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmaWxsPSIjOTk5IiBmb250LXNpemU9IjEyIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjNlbSI+Tm8gSW1hZ2U8L3RleHQ+PC9zdmc+';
                                                        }}
                                                    />
                                                </div>
                                                <div>
                                                    <div
                                                        style={{
                                                            fontSize: 11,
                                                            color: 'var(--text-secondary)',
                                                            marginBottom: 8,
                                                        }}
                                                    >
                                                        {viewCustomer.license_photo_original_name ||
                                                            'License photo'}
                                                    </div>
                                                    <Space
                                                        direction="vertical"
                                                        size={6}
                                                    >
                                                        <Button
                                                            size="small"
                                                            icon={
                                                                <EyeOutlined />
                                                            }
                                                            onClick={() =>
                                                                openPhotoViewer(
                                                                    photoUrl,
                                                                    viewCustomer.license_photo_original_name,
                                                                    `${viewCustomer.first_name} ${viewCustomer.last_name}`,
                                                                )
                                                            }
                                                        >
                                                            View Full Size
                                                        </Button>
                                                        {isAdmin && (
                                                            <>
                                                                <Upload
                                                                    accept="image/*"
                                                                    showUploadList={
                                                                        false
                                                                    }
                                                                    beforeUpload={(
                                                                        file,
                                                                    ) => {
                                                                        handleUploadLicense(
                                                                            file,
                                                                            viewCustomer.id,
                                                                        );
                                                                        return false;
                                                                    }}
                                                                >
                                                                    <Button
                                                                        size="small"
                                                                        icon={
                                                                            <CameraOutlined />
                                                                        }
                                                                        loading={
                                                                            uploadingLicense
                                                                        }
                                                                    >
                                                                        Replace
                                                                    </Button>
                                                                </Upload>
                                                                <Button
                                                                    size="small"
                                                                    danger
                                                                    icon={
                                                                        <DeleteOutlined />
                                                                    }
                                                                    onClick={() =>
                                                                        handleDeleteLicense(
                                                                            viewCustomer.id,
                                                                        )
                                                                    }
                                                                >
                                                                    Delete
                                                                </Button>
                                                            </>
                                                        )}
                                                    </Space>
                                                </div>
                                            </Space>
                                        );
                                    })()}
                                </Descriptions.Item>
                            </Descriptions>
                        </TabPane>

                        <TabPane tab="Vehicles" key="vehicles">
                            {viewCustomerVehicles.length > 0 ? (
                                viewCustomerVehicles.map((v) => (
                                    <Card
                                        key={v.id}
                                        size="small"
                                        style={{ marginBottom: 8 }}
                                    >
                                        <Space>
                                            <CarOutlined
                                                style={{
                                                    fontSize: 18,
                                                    color: 'var(--primary)',
                                                }}
                                            />
                                            <div>
                                                <div
                                                    style={{
                                                        fontWeight: 600,
                                                        color: 'var(--text-primary)',
                                                    }}
                                                >
                                                    {v.plate_number}
                                                </div>
                                                <div
                                                    style={{
                                                        fontSize: 12,
                                                        color: 'var(--text-secondary)',
                                                    }}
                                                >
                                                    {v.vehicle_model}
                                                </div>
                                            </div>
                                        </Space>
                                    </Card>
                                ))
                            ) : (
                                <div
                                    style={{
                                        textAlign: 'center',
                                        padding: 20,
                                        color: 'var(--text-tertiary)',
                                    }}
                                >
                                    No vehicles registered
                                </div>
                            )}
                        </TabPane>

                        <TabPane tab="Bookings" key="bookings">
                            {(() => {
                                const bookings = viewCustomer.bookings ?? [];
                                if (bookings.length === 0) {
                                    return (
                                        <div
                                            style={{
                                                textAlign: 'center',
                                                padding: 20,
                                                color: 'var(--text-tertiary)',
                                            }}
                                        >
                                            No bookings yet
                                        </div>
                                    );
                                }
                                return bookings.slice(0, 10).map((b) => (
                                    <Card
                                        key={b.id}
                                        size="small"
                                        style={{ marginBottom: 8 }}
                                    >
                                        <Row gutter={8}>
                                            <Col span={6}>
                                                <div
                                                    style={{
                                                        fontSize: 11,
                                                        color: 'var(--text-tertiary)',
                                                    }}
                                                >
                                                    Slot
                                                </div>
                                                <div
                                                    style={{
                                                        fontWeight: 600,
                                                        color: 'var(--text-primary)',
                                                    }}
                                                >
                                                    {b.parking_slot
                                                        ?.slot_number || 'N/A'}
                                                </div>
                                            </Col>
                                            <Col span={6}>
                                                <div
                                                    style={{
                                                        fontSize: 11,
                                                        color: 'var(--text-tertiary)',
                                                    }}
                                                >
                                                    Check In
                                                </div>
                                                <div
                                                    style={{
                                                        fontSize: 12,
                                                        color: 'var(--text-primary)',
                                                    }}
                                                >
                                                    {dayjs(
                                                        b.check_in_date,
                                                    ).format('MMM DD, YYYY')}
                                                </div>
                                            </Col>
                                            <Col span={6}>
                                                <div
                                                    style={{
                                                        fontSize: 11,
                                                        color: 'var(--text-tertiary)',
                                                    }}
                                                >
                                                    Check Out
                                                </div>
                                                <div
                                                    style={{
                                                        fontSize: 12,
                                                        color: 'var(--text-primary)',
                                                    }}
                                                >
                                                    {dayjs(
                                                        b.check_out_date,
                                                    ).format('MMM DD, YYYY')}
                                                </div>
                                            </Col>
                                            <Col span={6}>
                                                <div
                                                    style={{
                                                        fontSize: 11,
                                                        color: 'var(--text-tertiary)',
                                                    }}
                                                >
                                                    Status
                                                </div>
                                                <Tag
                                                    color={
                                                        b.status === 'completed'
                                                            ? 'green'
                                                            : b.status ===
                                                                'approved'
                                                              ? 'blue'
                                                              : b.status ===
                                                                  'pending'
                                                                ? 'orange'
                                                                : b.status ===
                                                                    'rejected'
                                                                  ? 'red'
                                                                  : 'default'
                                                    }
                                                    style={{ margin: 0 }}
                                                >
                                                    {b.status.toUpperCase()}
                                                </Tag>
                                            </Col>
                                        </Row>
                                    </Card>
                                ));
                            })()}
                        </TabPane>
                    </Tabs>
                )}
            </Modal>

            {/* ─── CHECK-IN MODAL ─────────────────────────────────────────── */}
            <Modal
                title={
                    <span
                        style={{
                            color: 'var(--text-primary)',
                            fontWeight: 600,
                        }}
                    >
                        {prefillBooking
                            ? 'Check In – Approved Booking'
                            : 'Walk-in Check In'}
                    </span>
                }
                open={checkinModal}
                onCancel={() => {
                    setCheckinModal(false);
                    resetCheckinForm();
                }}
                footer={null}
                width={640}
                destroyOnClose
                style={{ background: 'var(--bg-card)' }}
            >
                <Form
                    form={checkinForm}
                    layout="vertical"
                    onFinish={handleCheckin}
                    initialValues={{
                        check_in_date: dayjs(),
                        check_in_time: dayjs('14:00', 'HH:mm'),
                        expected_checkout_date: dayjs().add(1, 'day'),
                        expected_checkout_time: dayjs('12:00', 'HH:mm'),
                    }}
                >
                    {prefillBooking ? (
                        <>
                            <Alert
                                message="Checking in from an approved booking. Slot will be marked occupied."
                                type="info"
                                showIcon
                                style={{ marginBottom: 16 }}
                            />
                            <Descriptions
                                size="small"
                                bordered
                                column={2}
                                style={{ marginBottom: 16 }}
                            >
                                <Descriptions.Item label="Customer" span={2}>
                                    {getFullName(prefillBooking.customer)}
                                </Descriptions.Item>
                                <Descriptions.Item label="Phone">
                                    {prefillBooking.customer?.phone_number ??
                                        '–'}
                                </Descriptions.Item>
                                <Descriptions.Item label="Slot">
                                    {prefillBooking.parking_slot
                                        ?.slot_number ?? '–'}
                                </Descriptions.Item>
                                <Descriptions.Item label="Vehicle">
                                    {prefillBooking.customer?.vehicle_model ??
                                        '–'}
                                </Descriptions.Item>
                                <Descriptions.Item label="Plate">
                                    {prefillBooking.customer?.plate_number ??
                                        '–'}
                                </Descriptions.Item>
                                <Descriptions.Item label="Check In">
                                    {fmtDate(prefillBooking.check_in_date)}{' '}
                                    {fmtTime(prefillBooking.check_in_date)}
                                </Descriptions.Item>
                                <Descriptions.Item label="Check Out">
                                    {fmtDate(prefillBooking.check_out_date)}{' '}
                                    {fmtTime(prefillBooking.check_out_date)}
                                </Descriptions.Item>
                            </Descriptions>
                        </>
                    ) : (
                        <>
                            <Row gutter={12}>
                                <Col span={8}>
                                    <Form.Item
                                        name="first_name"
                                        label="First Name"
                                        rules={[{ required: true }]}
                                    >
                                        <Input />
                                    </Form.Item>
                                </Col>
                                <Col span={8}>
                                    <Form.Item
                                        name="middle_name"
                                        label="Middle Name"
                                    >
                                        <Input />
                                    </Form.Item>
                                </Col>
                                <Col span={8}>
                                    <Form.Item
                                        name="last_name"
                                        label="Last Name"
                                        rules={[{ required: true }]}
                                    >
                                        <Input />
                                    </Form.Item>
                                </Col>
                            </Row>
                            <Row gutter={12}>
                                <Col span={12}>
                                    <Form.Item
                                        name="phone_number"
                                        label="Phone"
                                        rules={[{ required: true }]}
                                    >
                                        <Input />
                                    </Form.Item>
                                </Col>
                                <Col span={12}>
                                    <Form.Item name="email" label="Email">
                                        <Input />
                                    </Form.Item>
                                </Col>
                            </Row>
                            <Form.Item name="address" label="Address">
                                <Input />
                            </Form.Item>
                            <Row gutter={12}>
                                <Col span={12}>
                                    <Form.Item
                                        name="vehicle_model"
                                        label="Vehicle Model"
                                        rules={[{ required: true }]}
                                    >
                                        <Input />
                                    </Form.Item>
                                </Col>
                                <Col span={12}>
                                    <Form.Item
                                        name="plate_number"
                                        label="Plate Number"
                                        rules={[{ required: true }]}
                                    >
                                        <Input
                                            style={{
                                                textTransform: 'uppercase',
                                            }}
                                        />
                                    </Form.Item>
                                </Col>
                            </Row>
                            <Form.Item
                                name="parking_slot_id"
                                label="Parking Slot"
                                rules={[{ required: true }]}
                            >
                                <Select placeholder="Select available slot">
                                    {availSlots.map((s) => (
                                        <Option key={s.id} value={s.id}>
                                            {s.slot_number} — ₱{s.nightly_rate}
                                            /night
                                        </Option>
                                    ))}
                                </Select>
                            </Form.Item>
                            <Row gutter={12}>
                                <Col span={12}>
                                    <Form.Item
                                        name="check_in_date"
                                        label="Check-in Date"
                                        rules={[{ required: true }]}
                                    >
                                        <DatePicker
                                            style={{ width: '100%' }}
                                        />
                                    </Form.Item>
                                </Col>
                                <Col span={12}>
                                    <Form.Item
                                        name="check_in_time"
                                        label="Check-in Time"
                                        rules={[{ required: true }]}
                                    >
                                        <TimePicker
                                            style={{ width: '100%' }}
                                            format="HH:mm"
                                        />
                                    </Form.Item>
                                </Col>
                            </Row>
                            <Row gutter={12}>
                                <Col span={12}>
                                    <Form.Item
                                        name="expected_checkout_date"
                                        label="Expected Check-out Date"
                                        rules={[{ required: true }]}
                                    >
                                        <DatePicker
                                            style={{ width: '100%' }}
                                        />
                                    </Form.Item>
                                </Col>
                                <Col span={12}>
                                    <Form.Item
                                        name="expected_checkout_time"
                                        label="Expected Check-out Time"
                                        rules={[{ required: true }]}
                                    >
                                        <TimePicker
                                            style={{ width: '100%' }}
                                            format="HH:mm"
                                        />
                                    </Form.Item>
                                </Col>
                            </Row>
                        </>
                    )}
                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'flex-end',
                            gap: 8,
                            marginTop: 8,
                        }}
                    >
                        <Button
                            onClick={() => {
                                setCheckinModal(false);
                                resetCheckinForm();
                            }}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="primary"
                            htmlType="submit"
                            loading={checkingIn}
                            icon={<LoginOutlined />}
                        >
                            Confirm Check In
                        </Button>
                    </div>
                </Form>
            </Modal>

            {/* ─── CHECK-OUT MODAL (MANUAL DISCOUNT) ──────────────────────── */}
            <Modal
                title={
                    <span
                        style={{
                            color: 'var(--text-primary)',
                            fontWeight: 600,
                        }}
                    >
                        Process Check Out
                    </span>
                }
                open={!!checkoutModal}
                onCancel={() => {
                    setCheckoutModal(null);
                    setAmountPaid('');
                    setDiscount('0');
                }}
                footer={null}
                width={560}
                destroyOnClose
                style={{ background: 'var(--bg-card)' }}
            >
                {checkoutModal && checkoutComputed && (
                    <>
                        <Descriptions
                            size="small"
                            bordered
                            column={2}
                            style={{ marginBottom: 16 }}
                        >
                            <Descriptions.Item label="Customer" span={2}>
                                {getFullName(checkoutModal.customer)}
                            </Descriptions.Item>
                            <Descriptions.Item label="Slot">
                                {checkoutModal.parking_slot?.slot_number}
                            </Descriptions.Item>
                            <Descriptions.Item label="Booked Nights">
                                {checkoutComputed.expectedNights}
                            </Descriptions.Item>
                            <Descriptions.Item label="Actual Nights">
                                {checkoutComputed.actualNights}
                            </Descriptions.Item>
                            <Descriptions.Item label="Rate/Night">
                                <span
                                    style={{
                                        fontWeight: 600,
                                        color: 'var(--text-primary)',
                                    }}
                                >
                                    ₱{checkoutComputed.baseRate}
                                </span>
                            </Descriptions.Item>
                            <Descriptions.Item label="Subtotal" span={2}>
                                {checkoutComputed.actualNights} × ₱
                                {checkoutComputed.baseRate} ={' '}
                                {fmtPHP(checkoutComputed.grossTotal)}
                            </Descriptions.Item>
                        </Descriptions>

                        {checkoutComputed.isOverdue && (
                            <div
                                style={{
                                    marginBottom: 12,
                                    padding: '8px 12px',
                                    background: 'var(--warning-bg)',
                                    borderRadius: 8,
                                    border: '1px solid var(--warning-border)',
                                    fontSize: 12,
                                    color: 'var(--warning-text)',
                                }}
                            >
                                ⚠️ Guest is overdue by{' '}
                                {checkoutComputed.actualNights -
                                    checkoutComputed.expectedNights}{' '}
                                night(s). Base rate ₱
                                {checkoutComputed.baseRate}/night applies.
                            </div>
                        )}

                        {checkoutComputed.downpaymentPaid > 0 && (
                            <div
                                style={{
                                    marginBottom: 12,
                                    padding: '8px 12px',
                                    background: 'var(--info-bg)',
                                    borderRadius: 8,
                                    border: '1px solid var(--info-border)',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                }}
                            >
                                <span
                                    style={{
                                        fontSize: 13,
                                        color: 'var(--info-text)',
                                        fontWeight: 600,
                                    }}
                                >
                                    Downpayment Already Paid
                                </span>
                                <span
                                    style={{
                                        fontSize: 13,
                                        color: 'var(--info-text)',
                                        fontWeight: 700,
                                    }}
                                >
                                    −{' '}
                                    {fmtPHP(checkoutComputed.downpaymentPaid)}
                                </span>
                            </div>
                        )}

                        <div style={{ marginBottom: 12 }}>
                            <label
                                style={{
                                    fontSize: 12,
                                    color: 'var(--text-tertiary)',
                                    display: 'block',
                                    marginBottom: 4,
                                }}
                            >
                                Total After Discount & Downpayment
                            </label>
                            <div
                                style={{
                                    fontSize: 22,
                                    fontWeight: 700,
                                    color: 'var(--success)',
                                }}
                            >
                                {fmtPHP(checkoutComputed.totalAfterDiscount)}
                            </div>
                        </div>

                        <div style={{ marginBottom: 12 }}>
                            <label
                                style={{
                                    fontSize: 12,
                                    color: 'var(--text-tertiary)',
                                    display: 'block',
                                    marginBottom: 4,
                                }}
                            >
                                Manual Discount (₱) — optional
                            </label>
                            <Input
                                type="number"
                                min={0}
                                value={discount}
                                onChange={(e) =>
                                    setDiscount(e.target.value)
                                }
                                prefix="₱"
                                placeholder="0"
                            />
                        </div>

                        <div style={{ marginBottom: 12 }}>
                            <label
                                style={{
                                    fontSize: 12,
                                    color: 'var(--text-tertiary)',
                                    display: 'block',
                                    marginBottom: 4,
                                }}
                            >
                                Amount Paid (₱)
                            </label>
                            <Input
                                type="number"
                                min={0}
                                value={amountPaid}
                                onChange={(e) =>
                                    setAmountPaid(e.target.value)
                                }
                                prefix="₱"
                            />
                        </div>

                        <div style={{ marginBottom: 12 }}>
                            <label
                                style={{
                                    fontSize: 12,
                                    color: 'var(--text-tertiary)',
                                    display: 'block',
                                    marginBottom: 4,
                                }}
                            >
                                Payment Method
                            </label>
                            <div
                                style={{
                                    padding: '8px 12px',
                                    background: 'var(--bg-surface-hover)',
                                    borderRadius: 8,
                                    color: 'var(--text-primary)',
                                    fontWeight: 600,
                                }}
                            >
                                Cash
                            </div>
                        </div>

                        {checkoutComputed.paid > 0 && (
                            <div
                                style={{
                                    padding: 12,
                                    background:
                                        checkoutComputed.change >= 0
                                            ? 'var(--success-bg)'
                                            : 'var(--danger-bg)',
                                    borderRadius: 8,
                                    marginBottom: 16,
                                }}
                            >
                                <div
                                    style={{
                                        fontSize: 12,
                                        color: 'var(--text-tertiary)',
                                    }}
                                >
                                    Change
                                </div>
                                <div
                                    style={{
                                        fontSize: 22,
                                        fontWeight: 700,
                                        color:
                                            checkoutComputed.change >= 0
                                                ? 'var(--success)'
                                                : 'var(--danger)',
                                    }}
                                >
                                    {fmtPHP(
                                        Math.max(0, checkoutComputed.change),
                                    )}
                                </div>
                                {checkoutComputed.change < 0 && (
                                    <div
                                        style={{
                                            fontSize: 11,
                                            color: 'var(--danger)',
                                            marginTop: 4,
                                        }}
                                    >
                                        Insufficient — short by{' '}
                                        {fmtPHP(
                                            Math.abs(checkoutComputed.change),
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        <div
                            style={{
                                display: 'flex',
                                justifyContent: 'flex-end',
                                gap: 8,
                            }}
                        >
                            <Button
                                onClick={() => {
                                    setCheckoutModal(null);
                                    setAmountPaid('');
                                    setDiscount('0');
                                }}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="primary"
                                loading={checkingOut}
                                onClick={handleCheckout}
                                disabled={
                                    !checkoutComputed.paid ||
                                    checkoutComputed.change < 0
                                }
                                icon={<CheckCircleOutlined />}
                            >
                                Confirm Check Out
                            </Button>
                        </div>
                    </>
                )}
            </Modal>

            {/* ─── EXTEND STAY MODAL ──────────────────────────────────────── */}
            <Modal
                title="Extend Stay"
                open={!!extendModal}
                onCancel={() => setExtendModal(null)}
                footer={null}
                destroyOnClose
                width={440}
            >
                {extendModal && (
                    <>
                        <Alert
                            type="info"
                            showIcon
                            style={{ marginBottom: 12 }}
                            message={`${getFullName(
                                extendModal.customer,
                            )} — current check-out: ${fmtDate(
                                extendModal.expected_checkout_date,
                            )} ${fmtTime(extendModal.expected_checkout_time)}`}
                        />
                        <Form
                            form={extendForm}
                            layout="vertical"
                            onFinish={handleExtend}
                        >
                            <Row gutter={12}>
                                <Col span={12}>
                                    <Form.Item
                                        name="check_out_date"
                                        label="New Check-out Date"
                                        rules={[{ required: true }]}
                                    >
                                        <DatePicker
                                            style={{ width: '100%' }}
                                            disabledDate={(d) =>
                                                d.isBefore(dayjs(), 'day')
                                            }
                                        />
                                    </Form.Item>
                                </Col>
                                <Col span={12}>
                                    <Form.Item
                                        name="check_out_time"
                                        label="New Check-out Time"
                                        rules={[{ required: true }]}
                                    >
                                        <TimePicker
                                            style={{ width: '100%' }}
                                            format="HH:mm"
                                        />
                                    </Form.Item>
                                </Col>
                            </Row>
                            <div style={{ textAlign: 'right' }}>
                                <Button
                                    onClick={() => setExtendModal(null)}
                                    style={{ marginRight: 8 }}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    type="primary"
                                    htmlType="submit"
                                    loading={extending}
                                >
                                    Confirm Extend
                                </Button>
                            </div>
                        </Form>
                    </>
                )}
            </Modal>

            {/* ─── RECEIPT MODAL ──────────────────────────────────────────── */}
            <Modal
                title={
                    <span
                        style={{
                            color: 'var(--text-primary)',
                            fontWeight: 600,
                        }}
                    >
                        Receipt
                    </span>
                }
                open={!!receiptModal}
                onCancel={() => setReceiptModal(null)}
                footer={[
                    <Button
                        key="print"
                        icon={<PrinterOutlined />}
                        onClick={() => window.print()}
                    >
                        Print
                    </Button>,
                    <Button
                        key="close"
                        type="primary"
                        onClick={() => setReceiptModal(null)}
                    >
                        Close
                    </Button>,
                ]}
                width={480}
                destroyOnClose
                style={{ background: 'var(--bg-card)' }}
            >
                {receiptModal && (
                    <div style={{ fontFamily: 'monospace', fontSize: 13 }}>
                        <div style={{ textAlign: 'center', marginBottom: 12 }}>
                            <div
                                style={{
                                    fontWeight: 700,
                                    fontSize: 16,
                                    color: 'var(--text-primary)',
                                }}
                            >
                                PARKING RECEIPT
                            </div>
                            <div
                                style={{
                                    color: 'var(--text-tertiary)',
                                    fontSize: 12,
                                }}
                            >
                                Txn: {receiptModal.transaction_number}
                            </div>
                        </div>
                        <Descriptions size="small" column={1} bordered>
                            <Descriptions.Item label="Customer">
                                {receiptModal.customer_name}
                            </Descriptions.Item>
                            <Descriptions.Item label="Phone">
                                {receiptModal.customer_phone}
                            </Descriptions.Item>
                            <Descriptions.Item label="Vehicle">
                                {receiptModal.vehicle_model}
                            </Descriptions.Item>
                            <Descriptions.Item label="Plate">
                                {receiptModal.plate_number}
                            </Descriptions.Item>
                            <Descriptions.Item label="Slot">
                                {receiptModal.slot_number}
                            </Descriptions.Item>
                            <Descriptions.Item label="Check In">
                                {fmtDate(receiptModal.check_in)}{' '}
                                {fmtTime(receiptModal.check_in)}
                            </Descriptions.Item>
                            <Descriptions.Item label="Check Out">
                                {fmtDate(receiptModal.check_out)}{' '}
                                {fmtTime(receiptModal.check_out)}
                            </Descriptions.Item>
                            <Descriptions.Item label="Nights">
                                {receiptModal.nights_stayed}
                            </Descriptions.Item>
                            <Descriptions.Item label="Rate/Night">
                                {fmtPHP(receiptModal.rate_per_night)}
                            </Descriptions.Item>
                            <Descriptions.Item label="Subtotal">
                                {fmtPHP(
                                    receiptModal.total_amount +
                                        receiptModal.discount,
                                )}
                            </Descriptions.Item>
                            <Descriptions.Item label="Discount">
                                {fmtPHP(receiptModal.discount)}
                            </Descriptions.Item>
                            <Descriptions.Item label="Total">
                                {fmtPHP(receiptModal.total_amount)}
                            </Descriptions.Item>
                            <Descriptions.Item label="Paid">
                                {fmtPHP(receiptModal.amount_paid)}
                            </Descriptions.Item>
                            <Descriptions.Item label="Change">
                                {fmtPHP(receiptModal.change)}
                            </Descriptions.Item>
                            <Descriptions.Item label="Payment">
                                {receiptModal.payment_method.toUpperCase()}
                            </Descriptions.Item>
                        </Descriptions>
                        <div
                            style={{
                                textAlign: 'center',
                                marginTop: 12,
                                color: 'var(--text-tertiary)',
                                fontSize: 11,
                            }}
                        >
                            Processed by {receiptModal.processed_by} at{' '}
                            {fmtTime(receiptModal.processed_at)}
                        </div>
                    </div>
                )}
            </Modal>

            {/* ─── REJECT MODAL ───────────────────────────────────────────── */}
            <Modal
                open={rejectModalOpen}
                title={
                    <span
                        style={{
                            color: 'var(--text-primary)',
                            fontWeight: 600,
                        }}
                    >
                        Reject Booking
                    </span>
                }
                onCancel={() => setRejectModalOpen(false)}
                onOk={handleRejectConfirm}
                confirmLoading={rejectingId !== null}
                style={{ background: 'var(--bg-card)' }}
            >
                <p style={{ color: 'var(--text-secondary)' }}>
                    Are you sure you want to reject this booking?
                </p>
            </Modal>

            {/* ─── VIEW PAYMENT DETAILS ─────────────────────────────────── */}
            <Modal
                open={!!viewPaymentModal}
                title={
                    <span
                        style={{
                            color: 'var(--text-primary)',
                            fontWeight: 600,
                        }}
                    >
                        GCash Downpayment Details
                    </span>
                }
                onCancel={() => setViewPaymentModal(null)}
                footer={[
                    <Button
                        key="close"
                        onClick={() => setViewPaymentModal(null)}
                    >
                        Close
                    </Button>,
                ]}
                style={{ background: 'var(--bg-card)' }}
            >
                {viewPaymentModal && (
                    <Descriptions bordered column={1} size="small">
                        <Descriptions.Item label="Customer">
                            {getFullName(viewPaymentModal.customer)}
                        </Descriptions.Item>
                        <Descriptions.Item label="Amount Paid">
                            ₱
                            {(viewPaymentModal.downpayment_amount ?? 0).toFixed(
                                2,
                            )}
                        </Descriptions.Item>
                        <Descriptions.Item label="Status">
                            <Tag
                                color="success"
                                icon={<CheckCircleOutlined />}
                                style={{ margin: 0 }}
                            >
                                Paid
                            </Tag>
                        </Descriptions.Item>
                        <Descriptions.Item label="GCash Reference">
                            {viewPaymentModal.downpayment_gcash_ref ? (
                                <span
                                    style={{
                                        fontFamily: 'monospace',
                                        fontWeight: 700,
                                        color: '#059669',
                                    }}
                                >
                                    {viewPaymentModal.downpayment_gcash_ref}
                                </span>
                            ) : (
                                <span style={{ color: 'var(--text-tertiary)' }}>
                                    Not yet recorded
                                </span>
                            )}
                        </Descriptions.Item>
                    </Descriptions>
                )}
            </Modal>

            {/* ─── CUSTOMER SEARCH MODAL ────────────────────────────────── */}
            <Modal
                title={
                    <span
                        style={{
                            color: 'var(--text-primary)',
                            fontWeight: 600,
                        }}
                    >
                        Search Customer
                    </span>
                }
                open={searchCustModal}
                onCancel={() => {
                    setSearchCustModal(false);
                    setSearchKW('');
                    setSearchResults([]);
                }}
                footer={null}
                width={560}
                destroyOnClose
                style={{ background: 'var(--bg-card)' }}
            >
                <Space.Compact style={{ width: '100%', marginBottom: 16 }}>
                    <Input
                        placeholder="Name, phone, or email…"
                        value={searchKW}
                        onChange={(e) => setSearchKW(e.target.value)}
                        onPressEnter={searchCustomers}
                    />
                    <Button
                        type="primary"
                        icon={<SearchOutlined />}
                        loading={searching}
                        onClick={searchCustomers}
                    >
                        Search
                    </Button>
                </Space.Compact>

                {searchResults.length > 0 && (
                    <List
                        size="small"
                        dataSource={searchResults}
                        renderItem={(c) => (
                            <List.Item
                                key={c.id}
                                actions={[
                                    <Button
                                        key="select"
                                        type="primary"
                                        size="small"
                                        icon={<LoginOutlined />}
                                        onClick={() => selectCustomer(c)}
                                    >
                                        Check In
                                    </Button>,
                                ]}
                            >
                                <List.Item.Meta
                                    avatar={
                                        <Avatar
                                            icon={<UserOutlined />}
                                            size="small"
                                        />
                                    }
                                    title={
                                        <span
                                            style={{
                                                color: 'var(--text-primary)',
                                            }}
                                        >
                                            {getFullNameFull(c)}
                                        </span>
                                    }
                                    description={
                                        <span
                                            style={{
                                                color: 'var(--text-secondary)',
                                            }}
                                        >
                                            {c.phone_number}
                                            {c.email ? ` · ${c.email}` : ''}
                                        </span>
                                    }
                                />
                            </List.Item>
                        )}
                    />
                )}

                {searchResults.length === 0 && searchKW && !searching && (
                    <div
                        style={{
                            textAlign: 'center',
                            color: 'var(--text-tertiary)',
                            padding: 16,
                        }}
                    >
                        No customers found.
                    </div>
                )}
            </Modal>
        </div>
    );
};

// ─── PURE HELPERS ─────────────────────────────────────────────────────────

function calculateNights(checkIn: string, checkOut: string): number {
    return Math.max(
        1,
        dayjs(checkOut).startOf('day').diff(dayjs(checkIn).startOf('day'), 'day'),
    );
}

function calcTotal(nights: number, rate: number): number {
    return nights * rate;
}

const fmtDate = (s?: string | null) =>
    s ? dayjs(s).format('MMM DD, YYYY') : '–';

const fmtTime = (s?: string | null): string => {
    if (!s) return '–';
    if (s.includes('T') || (s.length > 8 && s.includes('-')))
        return dayjs(s).format('h:mm A');
    return dayjs(s, 'HH:mm:ss').format('h:mm A');
};

const fmtPHP = (n?: number | null): string => {
    if (n === undefined || n === null) return '₱0.00';
    return new Intl.NumberFormat('en-PH', {
        style: 'currency',
        currency: 'PHP',
    }).format(n);
};

export default Customers;