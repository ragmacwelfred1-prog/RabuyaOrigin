// resources/js/pages/Chat.tsx
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    Avatar,
    Badge,
    Button,
    Empty,
    Input,
    Segmented,
    Spin,
    Tag,
    message,
} from 'antd';
import {
    MessageOutlined,
    SearchOutlined,
    SendOutlined,
    PictureOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import api from '../services/api';
import { useAuthStore } from '../stores/authStore';

dayjs.extend(relativeTime);

// ─── Types ──────────────────────────────────────────────────────────────────

interface Contact {
    id: number;
    role: 'customer' | 'staff';
    full_name: string;
    first_name: string;
    last_name: string;
    email?: string;
    phone_number?: string;
    employee_id?: string;
    plate_number?: string;
    conversation_id: number | null;
    has_chat: boolean;
    unread_count: number;
    latest_message: {
        body: string;
        sender_id: number;
        created_at: string;
    } | null;
    last_message_at: string | null;
}

interface ChatMessage {
    id: number;
    conversation_id: number;
    sender_id: number;
    body: string | null;
    image_path?: string | null;
    image_url?: string | null;
    image_original_name?: string | null;
    created_at: string;
    sender?: { first_name: string; last_name: string; role: string };
}

type Filter = 'all' | 'customer' | 'staff';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const initials = (c: { first_name?: string; last_name?: string }) =>
    `${c.first_name?.[0] ?? ''}${c.last_name?.[0] ?? ''}`.toUpperCase() || '?';

const roleColor = (role: string) => (role === 'staff' ? '#8B5CF6' : '#10B981');

// ─── Component ──────────────────────────────────────────────────────────────

const Chat: React.FC = () => {
    const { user } = useAuthStore();

    // Contacts
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [contactsLoading, setContactsLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [filter, setFilter] = useState<Filter>('all');

    // Active conversation
    const [active, setActive] = useState<Contact | null>(null);
    const [conversationId, setConversationId] = useState<number | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [msgLoading, setMsgLoading] = useState(false);
    const [text, setText] = useState('');
    const [sending, setSending] = useState(false);

    // Image
    const [pendingFile, setPendingFile] = useState<File | null>(null);
    const [pendingPreview, setPendingPreview] = useState<string | null>(null);
    const [viewerImage, setViewerImage] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const bottomRef = useRef<HTMLDivElement>(null);
    const activeConvRef = useRef<number | null>(null);
    const lastCountRef = useRef(0);

    // ─── Debounce search ────────────────────────────────────────────────────
    useEffect(() => {
        const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
        return () => clearTimeout(t);
    }, [search]);

    // ─── Contacts ───────────────────────────────────────────────────────────
    const loadContacts = useCallback(
        async (silent = false) => {
            if (!silent) setContactsLoading(true);
            try {
                const r = await api.get('/chat/contacts', {
                    params: {
                        search: debouncedSearch || undefined,
                        role: filter === 'all' ? undefined : filter,
                    },
                });
                setContacts(
                    Array.isArray(r.data?.contacts) ? r.data.contacts : [],
                );
            } catch {
                if (!silent) message.error('Failed to load contacts');
            } finally {
                if (!silent) setContactsLoading(false);
            }
        },
        [debouncedSearch, filter],
    );

    useEffect(() => {
        loadContacts();
    }, [loadContacts]);

    // Auto-refresh contacts (unread badges / latest previews)
    useEffect(() => {
        const id = setInterval(() => {
            if (!document.hidden) loadContacts(true);
        }, 8000);
        return () => clearInterval(id);
    }, [loadContacts]);

    // ─── Messages ───────────────────────────────────────────────────────────
    const loadMessages = useCallback(
        async (convId: number, silent = false) => {
            if (!silent) setMsgLoading(true);
            try {
                const r = await api.get(
                    `/chat/conversations/${convId}/messages`,
                );
                if (activeConvRef.current !== convId) return;
                setMessages(
                    Array.isArray(r.data?.messages) ? r.data.messages : [],
                );
            } catch {
                if (!silent) message.error('Failed to load messages');
            } finally {
                if (!silent && activeConvRef.current === convId)
                    setMsgLoading(false);
            }
        },
        [],
    );

    // Poll active conversation
    useEffect(() => {
        if (!conversationId) return;
        const id = setInterval(() => {
            if (!document.hidden) loadMessages(conversationId, true);
        }, 4000);
        return () => clearInterval(id);
    }, [conversationId, loadMessages]);

    // Auto-scroll to bottom
    useEffect(() => {
        if (messages.length !== lastCountRef.current) {
            lastCountRef.current = messages.length;
            setTimeout(() => {
                bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
            }, 40);
        }
    }, [messages]);

    // ─── Open contact ───────────────────────────────────────────────────────
    const openContact = async (c: Contact) => {
        setActive(c);
        setMessages([]);
        lastCountRef.current = 0;
        setMsgLoading(true);
        clearPendingImage();
        try {
            const r = await api.post('/chat/start', { contact_id: c.id });
            const convId: number = r.data.conversation.id;
            activeConvRef.current = convId;
            setConversationId(convId);
            await loadMessages(convId);

            // Clear unread locally
            setContacts((prev) =>
                prev.map((x) =>
                    x.id === c.id
                        ? {
                              ...x,
                              conversation_id: convId,
                              has_chat: true,
                              unread_count: 0,
                          }
                        : x,
                ),
            );
        } catch (e: any) {
            setMsgLoading(false);
            message.error(e.response?.data?.message || 'Failed to open chat');
        }
    };

    // ─── Image picker ───────────────────────────────────────────────────────
    const clearPendingImage = () => {
        setPendingFile(null);
        setPendingPreview(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            message.error('Please select an image file');
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            message.error('Image must be under 5MB');
            return;
        }
        setPendingFile(file);
        const reader = new FileReader();
        reader.onload = () => setPendingPreview(reader.result as string);
        reader.readAsDataURL(file);
    };

    // ─── Send ───────────────────────────────────────────────────────────────
    const handleSend = async () => {
        const body = text.trim();
        if ((!body && !pendingFile) || !conversationId || sending) return;

        setSending(true);
        try {
            const formData = new FormData();
            if (body) formData.append('body', body);
            if (pendingFile) formData.append('image', pendingFile);

            const r = await api.post(
                `/chat/conversations/${conversationId}/messages`,
                formData,
                { headers: { 'Content-Type': 'multipart/form-data' } },
            );

            setMessages((prev) => [...prev, r.data.message]);
            setText('');
            clearPendingImage();
            loadContacts(true);
        } catch (e: any) {
            message.error(e.response?.data?.message || 'Failed to send');
        } finally {
            setSending(false);
        }
    };

    // ─── Styles ─────────────────────────────────────────────────────────────
    const panel: React.CSSProperties = {
        background: 'var(--bg-card)',
        border: '1px solid var(--border-color)',
        borderRadius: 12,
    };

    const totalUnread = contacts.reduce(
        (s, c) => s + (c.unread_count || 0),
        0,
    );

    const canSend =
        (text.trim().length > 0 || !!pendingFile) && !sending;

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-title">
                        <MessageOutlined
                            style={{
                                color: 'var(--primary)',
                                marginRight: 10,
                            }}
                        />
                        Messages
                        {totalUnread > 0 && (
                            <Badge
                                count={totalUnread}
                                style={{ marginLeft: 10 }}
                            />
                        )}
                    </h1>
                    <p className="page-description">
                        Chat with customers and staff.
                    </p>
                </div>
            </div>

            <div
                style={{
                    display: 'flex',
                    gap: 16,
                    height: 'calc(100vh - 190px)',
                    minHeight: 480,
                }}
            >
                {/* ═══ LEFT: Contacts ═══ */}
                <div
                    style={{
                        ...panel,
                        width: 340,
                        display: 'flex',
                        flexDirection: 'column',
                        flexShrink: 0,
                    }}
                >
                    <div
                        style={{
                            padding: 12,
                            borderBottom: '1px solid var(--border-color)',
                        }}
                    >
                        <Input
                            allowClear
                            prefix={
                                <SearchOutlined
                                    style={{ color: 'var(--text-tertiary)' }}
                                />
                            }
                            placeholder="Search name, email, phone, plate..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            style={{ borderRadius: 20, marginBottom: 10 }}
                        />
                        <Segmented
                            block
                            size="small"
                            value={filter}
                            onChange={(v) => setFilter(v as Filter)}
                            options={[
                                { label: 'All', value: 'all' },
                                { label: 'Customers', value: 'customer' },
                                { label: 'Staff', value: 'staff' },
                            ]}
                        />
                    </div>

                    <div style={{ flex: 1, overflowY: 'auto' }}>
                        {contactsLoading ? (
                            <div style={{ textAlign: 'center', padding: 30 }}>
                                <Spin />
                            </div>
                        ) : contacts.length === 0 ? (
                            <Empty
                                image={Empty.PRESENTED_IMAGE_SIMPLE}
                                description="No contacts found"
                                style={{ marginTop: 40 }}
                            />
                        ) : (
                            contacts.map((c) => {
                                const isActive = active?.id === c.id;
                                const mine =
                                    c.latest_message?.sender_id === user?.id;
                                return (
                                    <div
                                        key={c.id}
                                        onClick={() => openContact(c)}
                                        style={{
                                            display: 'flex',
                                            gap: 10,
                                            alignItems: 'center',
                                            padding: '10px 12px',
                                            cursor: 'pointer',
                                            background: isActive
                                                ? 'var(--primary-bg)'
                                                : 'transparent',
                                            borderLeft: isActive
                                                ? '3px solid var(--primary)'
                                                : '3px solid transparent',
                                        }}
                                    >
                                        <Avatar
                                            size={42}
                                            style={{
                                                background: roleColor(c.role),
                                                flexShrink: 0,
                                            }}
                                        >
                                            {initials(c)}
                                        </Avatar>

                                        <div
                                            style={{ flex: 1, minWidth: 0 }}
                                        >
                                            <div
                                                style={{
                                                    display: 'flex',
                                                    justifyContent:
                                                        'space-between',
                                                    gap: 6,
                                                }}
                                            >
                                                <span
                                                    style={{
                                                        fontWeight:
                                                            c.unread_count
                                                                ? 700
                                                                : 600,
                                                        color: 'var(--text-primary)',
                                                        fontSize: 13,
                                                        overflow: 'hidden',
                                                        textOverflow:
                                                            'ellipsis',
                                                        whiteSpace: 'nowrap',
                                                    }}
                                                >
                                                    {c.full_name}
                                                </span>
                                                {c.last_message_at && (
                                                    <span
                                                        style={{
                                                            fontSize: 10,
                                                            color: 'var(--text-tertiary)',
                                                            flexShrink: 0,
                                                        }}
                                                    >
                                                        {dayjs(
                                                            c.last_message_at,
                                                        ).fromNow(true)}
                                                    </span>
                                                )}
                                            </div>

                                            <div
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: 6,
                                                    marginTop: 2,
                                                }}
                                            >
                                                <Tag
                                                    color={
                                                        c.role === 'staff'
                                                            ? 'purple'
                                                            : 'green'
                                                    }
                                                    style={{
                                                        margin: 0,
                                                        fontSize: 9,
                                                        lineHeight: '14px',
                                                        padding: '0 4px',
                                                    }}
                                                >
                                                    {c.role.toUpperCase()}
                                                </Tag>
                                                <span
                                                    style={{
                                                        flex: 1,
                                                        fontSize: 12,
                                                        color: c.unread_count
                                                            ? 'var(--text-primary)'
                                                            : 'var(--text-secondary)',
                                                        fontWeight:
                                                            c.unread_count
                                                                ? 600
                                                                : 400,
                                                        overflow: 'hidden',
                                                        textOverflow:
                                                            'ellipsis',
                                                        whiteSpace: 'nowrap',
                                                    }}
                                                >
                                                    {c.latest_message
                                                        ? `${mine ? 'You: ' : ''}${c.latest_message.body || '📷 Photo'}`
                                                        : c.plate_number ||
                                                          c.email ||
                                                          'Start a conversation'}
                                                </span>
                                                {c.unread_count > 0 && (
                                                    <Badge
                                                        count={c.unread_count}
                                                        size="small"
                                                    />
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* ═══ RIGHT: Conversation ═══ */}
                <div
                    style={{
                        ...panel,
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        minWidth: 0,
                    }}
                >
                    {!active ? (
                        <div
                            style={{
                                flex: 1,
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: 'var(--text-tertiary)',
                                gap: 8,
                            }}
                        >
                            <MessageOutlined style={{ fontSize: 48 }} />
                            <div>
                                Select a customer or staff to start chatting
                            </div>
                        </div>
                    ) : (
                        <>
                            {/* Header */}
                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 12,
                                    padding: '12px 16px',
                                    borderBottom:
                                        '1px solid var(--border-color)',
                                }}
                            >
                                <Avatar
                                    size={40}
                                    style={{
                                        background: roleColor(active.role),
                                    }}
                                >
                                    {initials(active)}
                                </Avatar>
                                <div style={{ minWidth: 0 }}>
                                    <div
                                        style={{
                                            fontWeight: 700,
                                            color: 'var(--text-primary)',
                                        }}
                                    >
                                        {active.full_name}{' '}
                                        <Tag
                                            color={
                                                active.role === 'staff'
                                                    ? 'purple'
                                                    : 'green'
                                            }
                                            style={{ marginLeft: 6 }}
                                        >
                                            {active.role.toUpperCase()}
                                        </Tag>
                                    </div>
                                    <div
                                        style={{
                                            fontSize: 12,
                                            color: 'var(--text-secondary)',
                                        }}
                                    >
                                        {[
                                            active.phone_number,
                                            active.email,
                                            active.employee_id &&
                                                `ID: ${active.employee_id}`,
                                            active.plate_number,
                                        ]
                                            .filter(Boolean)
                                            .join(' • ')}
                                    </div>
                                </div>
                            </div>

                            {/* Messages */}
                            <div
                                style={{
                                    flex: 1,
                                    overflowY: 'auto',
                                    padding: 16,
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: 6,
                                    background:
                                        'var(--bg-surface-hover)',
                                }}
                            >
                                {msgLoading ? (
                                    <div
                                        style={{
                                            textAlign: 'center',
                                            padding: 30,
                                        }}
                                    >
                                        <Spin />
                                    </div>
                                ) : messages.length === 0 ? (
                                    <div
                                        style={{
                                            margin: 'auto',
                                            color: 'var(--text-tertiary)',
                                            fontSize: 13,
                                        }}
                                    >
                                        No messages yet — say hi 👋
                                    </div>
                                ) : (
                                    messages.map((m, i) => {
                                        const isMine =
                                            m.sender_id === user?.id;
                                        const prev = messages[i - 1];
                                        const showName =
                                            !isMine &&
                                            prev?.sender_id !== m.sender_id;
                                        const hasImage = !!m.image_url;
                                        const hasText =
                                            !!m.body && m.body.length > 0;
                                        const imageOnly =
                                            hasImage && !hasText;
                                        return (
                                            <div
                                                key={m.id}
                                                style={{
                                                    alignSelf: isMine
                                                        ? 'flex-end'
                                                        : 'flex-start',
                                                    maxWidth: '70%',
                                                }}
                                            >
                                                {showName &&
                                                    m.sender && (
                                                        <div
                                                            style={{
                                                                fontSize: 10,
                                                                color: 'var(--text-tertiary)',
                                                                marginLeft: 8,
                                                                marginBottom: 2,
                                                            }}
                                                        >
                                                            {m.sender.first_name}{' '}
                                                            {
                                                                m.sender
                                                                    .last_name
                                                            }
                                                        </div>
                                                    )}
                                                <div
                                                    style={{
                                                        padding: imageOnly
                                                            ? 4
                                                            : '8px 12px',
                                                        borderRadius: 16,
                                                        background: isMine
                                                            ? 'var(--primary)'
                                                            : 'var(--bg-card)',
                                                        color: isMine
                                                            ? '#fff'
                                                            : 'var(--text-primary)',
                                                        border: isMine
                                                            ? 'none'
                                                            : '1px solid var(--border-color)',
                                                        fontSize: 13,
                                                        wordBreak:
                                                            'break-word',
                                                        whiteSpace: 'pre-wrap',
                                                    }}
                                                    title={dayjs(
                                                        m.created_at,
                                                    ).format(
                                                        'MMM D, YYYY h:mm A',
                                                    )}
                                                >
                                                    {hasImage && (
                                                        <img
                                                            src={m.image_url!}
                                                            alt="attachment"
                                                            onClick={() =>
                                                                setViewerImage(
                                                                    m.image_url!,
                                                                )
                                                            }
                                                            style={{
                                                                maxWidth: 240,
                                                                maxHeight: 240,
                                                                borderRadius: 12,
                                                                cursor: 'zoom-in',
                                                                display:
                                                                    'block',
                                                                marginBottom:
                                                                    hasText
                                                                        ? 6
                                                                        : 0,
                                                            }}
                                                        />
                                                    )}
                                                    {hasText && m.body}
                                                </div>
                                                <div
                                                    style={{
                                                        fontSize: 9,
                                                        color: 'var(--text-tertiary)',
                                                        textAlign: isMine
                                                            ? 'right'
                                                            : 'left',
                                                        margin: '2px 8px 0',
                                                    }}
                                                >
                                                    {dayjs(
                                                        m.created_at,
                                                    ).format('h:mm A')}
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                                <div ref={bottomRef} />
                            </div>

                            {/* Composer */}
                            <div
                                style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: 8,
                                    padding: 12,
                                    borderTop:
                                        '1px solid var(--border-color)',
                                }}
                            >
                                {pendingPreview && (
                                    <div
                                        style={{
                                            position: 'relative',
                                            width: 80,
                                        }}
                                    >
                                        <img
                                            src={pendingPreview}
                                            alt="preview"
                                            style={{
                                                width: 80,
                                                height: 80,
                                                borderRadius: 10,
                                                objectFit: 'cover',
                                            }}
                                        />
                                        <button
                                            onClick={clearPendingImage}
                                            style={{
                                                position: 'absolute',
                                                top: -6,
                                                right: -6,
                                                background: 'var(--danger)',
                                                color: '#fff',
                                                border: 'none',
                                                borderRadius: '50%',
                                                width: 22,
                                                height: 22,
                                                cursor: 'pointer',
                                                fontSize: 12,
                                                fontWeight: 700,
                                            }}
                                        >
                                            ×
                                        </button>
                                    </div>
                                )}

                                <div
                                    style={{
                                        display: 'flex',
                                        gap: 8,
                                        alignItems: 'flex-end',
                                    }}
                                >
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept="image/*"
                                        onChange={handleFileSelect}
                                        style={{ display: 'none' }}
                                    />
                                    <Button
                                        type="text"
                                        icon={<PictureOutlined />}
                                        onClick={() =>
                                            fileInputRef.current?.click()
                                        }
                                        disabled={sending}
                                        style={{
                                            width: 40,
                                            height: 40,
                                            borderRadius: 20,
                                            background:
                                                'rgba(16,185,129,0.1)',
                                            border: '1px solid rgba(16,185,129,0.35)',
                                            color: 'var(--primary)',
                                        }}
                                    />
                                    <Input.TextArea
                                        autoSize={{
                                            minRows: 1,
                                            maxRows: 4,
                                        }}
                                        placeholder="Type a message... (Enter to send, Shift+Enter for new line)"
                                        value={text}
                                        onChange={(e) =>
                                            setText(e.target.value)
                                        }
                                        onPressEnter={(e) => {
                                            if (!e.shiftKey) {
                                                e.preventDefault();
                                                handleSend();
                                            }
                                        }}
                                        maxLength={2000}
                                        style={{ borderRadius: 18 }}
                                    />
                                    <Button
                                        type="primary"
                                        shape="circle"
                                        size="large"
                                        icon={<SendOutlined />}
                                        loading={sending}
                                        disabled={!canSend || !conversationId}
                                        onClick={handleSend}
                                    />
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* ═══ Fullscreen image viewer ═══ */}
            {viewerImage && (
                <div
                    onClick={() => setViewerImage(null)}
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(0,0,0,0.95)',
                        zIndex: 9999,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'zoom-out',
                    }}
                >
                    <img
                        src={viewerImage}
                        alt="full"
                        style={{
                            maxWidth: '90%',
                            maxHeight: '90%',
                            borderRadius: 12,
                        }}
                    />
                </div>
            )}
        </div>
    );
};

export default Chat;