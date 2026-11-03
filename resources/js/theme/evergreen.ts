// resources/js/theme/evergreen.ts
//
// Single source of truth for the Evergreen light/dark theme (matches HomePage).
//   Light: cream surfaces, forest-green headings + buttons, gold accents.
//   Dark : deep-forest surfaces, cream headings, GOLD buttons + accents.
//
// The matching CSS variables live in resources/css/app.css.

import { theme as antdTheme } from 'antd';

// ─── Theme state helpers ─────────────────────────────────────────────────────

// Kept as 'theme' so any page that already reads it keeps working.
export const THEME_STORAGE_KEY = 'theme';

/** Saved choice → current data-theme → device setting → light. */
export const getInitialIsDark = (): boolean => {
    try {
        const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
        if (saved === 'light' || saved === 'dark') return saved === 'dark';
    } catch {
        // Storage can be blocked (private mode); fall through.
    }
    const attr = document.documentElement.getAttribute('data-theme');
    if (attr === 'light' || attr === 'dark') return attr === 'dark';
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
};

/**
 * Sets data-theme on <html> (CSS variables + color-scheme follow from it).
 * Pass persist=false on first load so the device setting keeps being followed
 * until the person actually presses the toggle.
 */
export const applyTheme = (dark: boolean, persist = true) => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    if (!persist) return;
    try {
        window.localStorage.setItem(THEME_STORAGE_KEY, dark ? 'dark' : 'light');
    } catch {
        // Ignore storage errors; the toggle still works for this visit.
    }
};

// ─── Palettes (same values as the HomePage variables) ────────────────────────

const LIGHT = {
    bg: '#F5F0E6',
    bgAlt: '#EDE6D6',
    card: '#FBF8F1',
    border: '#DDD3BC',
    borderSoft: '#EDE6D6',
    text: '#1E1E1E',
    muted: '#3A3A35',
    faint: '#6B6B60',

    primary: '#186049',
    primaryHover: '#124A38',
    primaryActive: '#0F4030',
    primaryBg: '#DCEFE5',
    primaryBgHover: '#C5E3D3',
    primaryBorder: '#B9DFC9',

    link: '#186049',
    linkHover: '#124A38',
    linkActive: '#0F4030',

    btnFg: '#FFFFFF',
    brandText: '#186049',

    success: '#186049',
    successBg: '#DCEFE5',
    successBorder: '#B9DFC9',
    warning: '#D9A441',
    warningBg: '#FBEFD2',
    warningBorder: '#F2DCA8',
    error: '#A63B31',
    errorBg: '#F8DFD9',
    errorBorder: '#EFC2B7',
    info: '#2E6E8E',
    infoBg: '#DAEAF1',
    infoBorder: '#B4D3E1',

    selectedBg: '#DCEFE5',
    hoverBg: '#EDE6D6',
    selectedHoverBg: '#C5E3D3',
    tableHeaderBg: '#EDE6D6',
    mask: 'rgba(24, 96, 73, 0.35)',
};

const DARK = {
    bg: '#141311',
    bgAlt: '#1A1815',
    card: '#211F1B',
    border: '#3A362F',
    borderSoft: '#2A2722',
    text: '#F5F0E6',
    muted: '#CFC9BC',
    faint: '#968F80',

    // Forest is the brand/action colour; gold is the accent (links, labels, focus).
    primary: '#1B6E52',
    primaryHover: '#238A66',
    primaryActive: '#155A43',
    primaryBg: '#173D2D',
    primaryBgHover: '#22573E',
    primaryBorder: '#22573E',

    link: '#D9A441',
    linkHover: '#E8C876',
    linkActive: '#C08F32',

    btnFg: '#F5F0E6',
    brandText: '#D9A441',

    success: '#4FB083',
    successBg: '#173D2D',
    successBorder: '#22573E',
    warning: '#E8B859',
    warningBg: '#3D2F12',
    warningBorder: '#5A4718',
    error: '#E07B6E',
    errorBg: '#3D1C17',
    errorBorder: '#5C2A23',
    info: '#6FB3CE',
    infoBg: '#142E3A',
    infoBorder: '#1F4A5C',

    selectedBg: '#173D2D',
    hoverBg: '#2B2823',
    selectedHoverBg: '#22573E',
    tableHeaderBg: '#1A1815',
    mask: 'rgba(0, 0, 0, 0.75)',
};

// ─── Ant Design theme ────────────────────────────────────────────────────────

export const getAntdTheme = (dark: boolean) => {
    const c = dark ? DARK : LIGHT;

    return {
        algorithm: dark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        token: {
            colorPrimary: c.primary,
            colorPrimaryHover: c.primaryHover,
            colorPrimaryActive: c.primaryActive,
            colorPrimaryBg: c.primaryBg,
            colorPrimaryBgHover: c.primaryBgHover,
            colorPrimaryBorder: c.primaryBorder,
            colorLink: c.link,
            colorLinkHover: c.linkHover,
            colorLinkActive: c.linkActive,

            colorSuccess: c.success,
            colorSuccessBg: c.successBg,
            colorSuccessBorder: c.successBorder,
            colorWarning: c.warning,
            colorWarningBg: c.warningBg,
            colorWarningBorder: c.warningBorder,
            colorError: c.error,
            colorErrorBg: c.errorBg,
            colorErrorBorder: c.errorBorder,
            colorInfo: c.info,
            colorInfoBg: c.infoBg,
            colorInfoBorder: c.infoBorder,

            colorBgBase: dark ? DARK.bg : LIGHT.card,
            colorBgContainer: c.card,
            colorBgElevated: c.card,
            colorBgLayout: c.bg,
            colorBgSpotlight: c.card,
            colorText: c.text,
            colorTextBase: c.text,
            colorTextSecondary: c.muted,
            colorTextTertiary: c.faint,
            colorBorder: c.border,
            colorBorderSecondary: c.borderSoft,

            controlItemBgActive: c.selectedBg,
            controlItemBgHover: c.hoverBg,
            controlItemBgActiveHover: c.selectedHoverBg,

            borderRadius: 12,
            borderRadiusLG: 16,
            borderRadiusSM: 8,
            fontFamily:
                "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        },
        components: {
            Button: {
                borderRadius: 999,
                controlHeight: 38,
                controlHeightSM: 32,
                controlHeightLG: 46,
                fontWeight: 600,
                primaryColor: c.btnFg,
                ...(dark
                    ? {
                          colorBgContainer: c.card,
                          colorBorder: c.border,
                          colorText: c.text,
                          colorTextSecondary: c.muted,
                      }
                    : {}),
            },
            Card: {
                borderRadiusLG: 24,
                colorBgContainer: c.card,
                colorBorder: c.border,
            },
            Table: {
                borderRadius: 16,
                colorBgContainer: c.card,
                colorBgBody: c.card,
                colorBgHeader: c.tableHeaderBg,
                colorBorder: c.border,
                colorText: c.text,
                headerBg: c.tableHeaderBg,
                headerColor: c.brandText,
                headerBorderRadius: 16,
            },
            Modal: {
                borderRadiusLG: 24,
                colorBgElevated: c.card,
                colorBgMask: c.mask,
                colorBorder: c.border,
                colorText: c.text,
            },
            Input: {
                borderRadius: 12,
                colorBgContainer: c.card,
                colorBorder: c.border,
                colorText: c.text,
                colorPlaceholder: c.faint,
            },
            Select: {
                borderRadius: 12,
                colorBgContainer: c.card,
                colorBorder: c.border,
                colorText: c.text,
                optionSelectedBg: c.selectedBg,
            },
            DatePicker: {
                borderRadius: 12,
                colorBgContainer: c.card,
                colorBorder: c.border,
                colorText: c.text,
            },
            Tag: {
                borderRadius: 999,
                colorText: c.text,
                colorBg: c.card,
            },
            Tabs: {
                colorText: c.muted,
                colorBorder: c.border,
                itemColor: c.muted,
                itemHoverColor: c.brandText,
                itemSelectedColor: c.brandText,
                itemActiveColor: c.brandText,
                inkBarColor: '#D9A441',
            },
            Popover: {
                borderRadius: 16,
                colorBgElevated: c.card,
                colorBorder: c.border,
                colorText: c.text,
            },
            Dropdown: {
                borderRadius: 16,
                colorBgElevated: c.card,
                colorBorder: c.border,
                colorText: c.text,
            },
            Alert: {
                borderRadius: 12,
                colorText: c.text,
                colorBorder: c.border,
            },
            Descriptions: {
                colorBgContainer: c.card,
                colorBorder: c.border,
                colorText: c.text,
            },
            List: {
                colorBgContainer: c.card,
                colorText: c.text,
            },
            Typography: {
                colorText: c.text,
                colorTextSecondary: c.muted,
            },
        },
    };
};