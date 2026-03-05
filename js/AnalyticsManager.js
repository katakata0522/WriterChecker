/**
 * Writer Checker — AnalyticsManager
 * 計測イベントを安全に正規化し、dataLayer/gtag/sendBeaconへ送る。
 * PIIを含む可能性があるキーは送信しない。
 */

const EVENT_NAME_PATTERN = /^[a-z0-9_]{3,64}$/;
const SAFE_PARAM_KEY_PATTERN = /^[a-z0-9_]{2,48}$/;
const BLOCKED_PARAM_KEYS = new Set([
    'email',
    'mail',
    'name',
    'full_name',
    'first_name',
    'last_name',
    'phone',
    'address',
    'user_id',
    'username',
    'content',
    'text',
    'message'
]);
const RESERVED_PAYLOAD_KEYS = new Set([
    'event',
    'event_time',
    'session_id',
    'page_path'
]);
const READINESS_BANDS = [
    { min: 85, verdict: 'Measurement-Ready' },
    { min: 70, verdict: 'Usable with Gaps' },
    { min: 55, verdict: 'Unreliable' },
    { min: 0, verdict: 'Broken' }
];

export function sanitizeEventName(name) {
    if (typeof name !== 'string') return '';
    const normalized = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    return EVENT_NAME_PATTERN.test(normalized) ? normalized : '';
}

function sanitizeParamKey(key) {
    if (typeof key !== 'string') return '';
    const normalized = key.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    if (!SAFE_PARAM_KEY_PATTERN.test(normalized)) return '';
    if (BLOCKED_PARAM_KEYS.has(normalized)) return '';
    return normalized;
}

export function sanitizeEventParams(params) {
    if (typeof params !== 'object' || params === null || Array.isArray(params)) return {};

    const sanitized = {};
    for (const [rawKey, rawValue] of Object.entries(params)) {
        const key = sanitizeParamKey(rawKey);
        if (!key) continue;
        if (RESERVED_PAYLOAD_KEYS.has(key)) continue;

        if (typeof rawValue === 'number') {
            if (Number.isFinite(rawValue)) sanitized[key] = Math.round(rawValue * 1000) / 1000;
            continue;
        }
        if (typeof rawValue === 'boolean') {
            sanitized[key] = rawValue;
            continue;
        }
        if (typeof rawValue === 'string') {
            const trimmed = rawValue.trim();
            if (!trimmed) continue;
            sanitized[key] = trimmed.slice(0, 120);
        }
    }
    return sanitized;
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function buildSessionId() {
    return `wc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export class AnalyticsManager {
    constructor(options = {}) {
        this.windowLike = options.windowLike || (typeof window !== 'undefined' ? window : null);
        this.navigatorLike = options.navigatorLike || (typeof navigator !== 'undefined' ? navigator : null);
        this.locationLike = options.locationLike || (typeof location !== 'undefined' ? location : null);
        this.storageLike = options.storageLike || (typeof localStorage !== 'undefined' ? localStorage : null);
        this.sessionStorageLike = options.sessionStorageLike || (typeof sessionStorage !== 'undefined' ? sessionStorage : null);
        this.dataLayerName = options.dataLayerName || 'dataLayer';
        this.endpoint = typeof options.endpoint === 'string'
            ? options.endpoint
            : this.windowLike?.WRITER_CHECKER_ANALYTICS_ENDPOINT || '';
        this.enabled = options.enabled !== false;
        this.sampleRate = clamp(
            typeof options.sampleRate === 'number' ? options.sampleRate : 1,
            0,
            1
        );
        this.userConsent = options.userConsent || 'granted';
        this.sessionKey = 'writerCheckerAnalyticsSessionId';
        this.variantPrefix = 'writerCheckerVariant:';
        this.sessionId = this._resolveSessionId();
        this._eventCounter = 0;
    }

    _resolveSessionId() {
        try {
            const existing = this.sessionStorageLike?.getItem(this.sessionKey);
            if (existing && typeof existing === 'string') return existing;
            const created = buildSessionId();
            this.sessionStorageLike?.setItem(this.sessionKey, created);
            return created;
        } catch {
            return buildSessionId();
        }
    }

    getExperimentVariant(experimentName, variants = ['a', 'b']) {
        if (typeof experimentName !== 'string' || !Array.isArray(variants) || variants.length === 0) {
            return variants[0] || 'a';
        }
        const key = `${this.variantPrefix}${experimentName}`;
        try {
            const stored = this.storageLike?.getItem(key);
            if (stored && variants.includes(stored)) return stored;
        } catch {
            // localStorageが使えない場合はセッション値で決定
        }

        const seed = `${experimentName}:${this.sessionId}`;
        let hash = 0;
        for (let i = 0; i < seed.length; i++) {
            hash = ((hash << 5) - hash) + seed.charCodeAt(i);
            hash |= 0;
        }
        const selected = variants[Math.abs(hash) % variants.length];
        try {
            this.storageLike?.setItem(key, selected);
        } catch {
            // 保存失敗は無視
        }
        return selected;
    }

    getMeasurementReadiness() {
        const breakdown = {
            decision_alignment: 20,
            event_model_clarity: 18,
            data_accuracy_integrity: this.endpoint ? 18 : 14,
            conversion_definition_quality: 12,
            attribution_context: 8,
            governance_maintenance: this.enabled ? 8 : 3
        };
        const score = Object.values(breakdown).reduce((sum, value) => sum + value, 0);
        const verdict = READINESS_BANDS.find((band) => score >= band.min)?.verdict || 'Broken';
        return {
            score,
            verdict,
            breakdown
        };
    }

    _buildPayload(eventName, params) {
        const pagePath = typeof this.locationLike?.pathname === 'string'
            ? this.locationLike.pathname
            : '/';
        return {
            event: eventName,
            event_time: new Date().toISOString(),
            session_id: this.sessionId,
            page_path: pagePath,
            ...params
        };
    }

    _buildGtagParams(payload) {
        if (typeof payload !== 'object' || payload === null) return {};
        const { event, ...rest } = payload;
        return rest;
    }

    track(eventName, params = {}) {
        if (!this.enabled || this.userConsent !== 'granted') return false;
        if (this.sampleRate < 1 && Math.random() > this.sampleRate) return false;

        const normalizedEventName = sanitizeEventName(eventName);
        if (!normalizedEventName) return false;

        const sanitizedParams = sanitizeEventParams(params);
        const payload = this._buildPayload(normalizedEventName, sanitizedParams);
        this._eventCounter += 1;

        let sent = false;

        try {
            if (!Array.isArray(this.windowLike?.[this.dataLayerName])) {
                if (this.windowLike) this.windowLike[this.dataLayerName] = [];
            }
            this.windowLike?.[this.dataLayerName]?.push(payload);
            sent = true;
        } catch {
            // dataLayer push失敗は無視して次を試す
        }

        try {
            if (typeof this.windowLike?.gtag === 'function') {
                this.windowLike.gtag('event', normalizedEventName, this._buildGtagParams(payload));
                sent = true;
            }
        } catch {
            // gtag失敗は無視
        }

        try {
            if (this.endpoint && typeof this.navigatorLike?.sendBeacon === 'function') {
                const body = JSON.stringify(payload);
                const blob = new Blob([body], { type: 'application/json' });
                this.navigatorLike.sendBeacon(this.endpoint, blob);
                sent = true;
            }
        } catch {
            // beacon失敗は無視
        }

        return sent;
    }
}
