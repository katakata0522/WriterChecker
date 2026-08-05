/**
 * Writer Checker — Rule Schema V3
 * ルールの保存・検出・共有で共通利用する純粋関数。
 */

export const RULE_SCHEMA_VERSION = 3;
export const VALID_SEVERITIES = Object.freeze(['error', 'warning', 'info']);
export const VALID_EXCLUDE_SCOPES = Object.freeze(['url', 'email', 'code']);
export const DEFAULT_EXCLUDE_SCOPES = Object.freeze(['url', 'email', 'code']);

const VALID_FLAG_CHARS = new Set(['d', 'g', 'i', 'm', 's', 'u', 'v', 'y']);
const MAX_RULES_PER_SET = 2000;

function hashString(value) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index++) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
}

function safeString(value, maxLength, { trim = true } = {}) {
    if (typeof value !== 'string') return '';
    const normalized = trim ? value.trim() : value;
    return normalized.slice(0, maxLength);
}

export function normalizeRegexFlags(value) {
    if (typeof value !== 'string') return 'g';
    const flags = [];
    for (const char of value) {
        if (VALID_FLAG_CHARS.has(char) && !flags.includes(char)) flags.push(char);
    }
    if (!flags.includes('g')) flags.push('g');
    return flags.join('');
}

function defaultReason(rule) {
    const explicit = safeString(rule?.reason || rule?.memo, 500);
    if (explicit) return explicit;
    const target = typeof rule?.target === 'string' ? rule.target : '';
    const replacement = typeof rule?.replacement === 'string' ? rule.replacement : '';
    if (!replacement) return `「${target}」を削除するルールです。`;
    return `「${target}」を「${replacement}」へ統一するルールです。`;
}

export function normalizeRuleV3(rule) {
    if (typeof rule !== 'object' || rule === null || typeof rule.target !== 'string') return null;
    const target = safeString(rule.target, 2000, { trim: false });
    if (!target) return null;
    const replacement = safeString(rule.replacement, 2000, { trim: false });
    const isRegex = rule.isRegex === true;
    const severity = VALID_SEVERITIES.includes(rule.severity) ? rule.severity : 'warning';
    const category = safeString(rule.category, 80) || '表記統一';
    const excludeScopes = Array.isArray(rule.excludeScopes)
        ? [...new Set(rule.excludeScopes.filter((scope) => VALID_EXCLUDE_SCOPES.includes(scope)))]
        : [...DEFAULT_EXCLUDE_SCOPES];
    const idSeed = `${target}\u0000${replacement}\u0000${isRegex ? 'regex' : 'literal'}`;
    const normalized = {
        schemaVersion: RULE_SCHEMA_VERSION,
        id: safeString(rule.id, 120) || `rule-${hashString(idSeed)}`,
        target,
        replacement,
        severity,
        category,
        reason: defaultReason(rule),
        excludeScopes,
        autoFix: rule.autoFix !== false,
        enabled: rule.enabled !== false
    };
    if (isRegex) {
        normalized.isRegex = true;
        normalized.flags = normalizeRegexFlags(rule.flags);
    }
    const badExample = safeString(rule.badExample, 500);
    const goodExample = safeString(rule.goodExample, 500);
    if (badExample) normalized.badExample = badExample;
    if (goodExample) normalized.goodExample = goodExample;
    return normalized;
}

export function normalizeRuleArray(rules) {
    if (!Array.isArray(rules)) return null;
    const normalized = rules.slice(0, MAX_RULES_PER_SET).map(normalizeRuleV3).filter(Boolean);
    const seenIds = new Set();
    return normalized.map((rule, index) => {
        if (!seenIds.has(rule.id)) {
            seenIds.add(rule.id);
            return rule;
        }
        const unique = { ...rule, id: `${rule.id}-${index + 1}` };
        seenIds.add(unique.id);
        return unique;
    });
}

export function validateRegexSafety(pattern) {
    if (typeof pattern !== 'string' || pattern.length === 0) return { safe: false, reason: '正規表現が空です。' };
    if (pattern.length > 500) return { safe: false, reason: '正規表現が長すぎます（500文字以内）。' };
    if (/\\[1-9]/.test(pattern) || /\\k<[^>]+>/.test(pattern)) {
        return { safe: false, reason: 'バックリファレンスを含む正規表現は安全のため使用できません。' };
    }
    if (/\((?:[^()\\]|\\.)*[+*](?:[^()\\]|\\.)*\)[+*{]/.test(pattern)) {
        return { safe: false, reason: '量指定子が入れ子になった正規表現は使用できません。' };
    }
    if (/\((?:[^()\\]|\\.)*\|(?:[^()\\]|\\.)*\)[+*{]/.test(pattern)) {
        return { safe: false, reason: '繰り返し対象の選択肢を含む正規表現は使用できません。' };
    }
    return { safe: true, reason: '' };
}

function collectRawRanges(text) {
    if (typeof text !== 'string' || text.length === 0) return [];
    const ranges = [];
    const patterns = [
        { scope: 'code', regex: /```[\s\S]*?(?:```|$)/g },
        { scope: 'code', regex: /`[^`\n]+`/g },
        { scope: 'url', regex: /https?:\/\/[^\s<>()"'、。！？]+/g },
        { scope: 'email', regex: /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/gu }
    ];
    for (const { scope, regex } of patterns) {
        regex.lastIndex = 0;
        let match;
        while ((match = regex.exec(text)) !== null) {
            if (!match[0]) {
                regex.lastIndex++;
                continue;
            }
            ranges.push({ start: match.index, end: match.index + match[0].length, scope });
        }
    }
    return ranges;
}

function sameScopeLists(left, right) {
    return left.length === right.length && left.every((scope, index) => scope === right[index]);
}

/**
 * URL・メール・コードの重なりを、イベント走査で重複のない区間へ変換する。
 * 以前の「全境界 × 全範囲」走査を避け、保護対象が多い文章でも伸びにくくする。
 */
export function collectScopedRanges(text) {
    const rawRanges = collectRawRanges(text);
    if (rawRanges.length === 0) return [];

    const events = rawRanges.flatMap(({ start, end, scope }) => [
        { position: start, scope, delta: 1 },
        { position: end, scope, delta: -1 }
    ]).sort((left, right) => left.position - right.position || left.delta - right.delta);

    const active = new Map();
    const ranges = [];
    let cursor = events[0].position;
    let index = 0;

    while (index < events.length) {
        const position = events[index].position;
        const scopes = [...active.entries()]
            .filter(([, count]) => count > 0)
            .map(([scope]) => scope)
            .sort();

        if (position > cursor && scopes.length > 0) {
            const previous = ranges[ranges.length - 1];
            if (previous && previous.end === cursor && sameScopeLists(previous.scopes, scopes)) {
                previous.end = position;
            } else {
                ranges.push({ start: cursor, end: position, scopes });
            }
        }

        while (index < events.length && events[index].position === position) {
            const event = events[index++];
            const nextCount = (active.get(event.scope) || 0) + event.delta;
            if (nextCount > 0) active.set(event.scope, nextCount);
            else active.delete(event.scope);
        }
        cursor = position;
    }

    return ranges;
}

export function overlaps(leftStart, leftEnd, rightStart, rightEnd) {
    return leftStart < rightEnd && leftEnd > rightStart;
}

/**
 * collectScopedRangesの結果は開始位置順なので、二分探索で最初の候補まで移動する。
 */
export function isMatchExcluded(ranges, start, end, excludeScopes) {
    if (!Array.isArray(excludeScopes) || excludeScopes.length === 0 || !Array.isArray(ranges) || ranges.length === 0) {
        return false;
    }
    const excluded = new Set(excludeScopes);
    let low = 0;
    let high = ranges.length;
    while (low < high) {
        const middle = (low + high) >> 1;
        if (ranges[middle].end <= start) low = middle + 1;
        else high = middle;
    }
    for (let index = low; index < ranges.length && ranges[index].start < end; index++) {
        if (ranges[index].scopes.some((scope) => excluded.has(scope))) return true;
    }
    return false;
}

export const SAFE_REGEX_TEMPLATES = Object.freeze([
    Object.freeze({ id: 'collapse-fullwidth-spaces', label: '連続する全角スペースを1つにする', description: '2個以上続く全角スペースだけを1個へまとめます。', rule: Object.freeze({ target: '[　]{2,}', replacement: '　', isRegex: true, severity: 'warning', category: '空白', reason: '連続する全角スペースを1個へ統一します。', excludeScopes: ['url', 'email', 'code'], autoFix: true }) }),
    Object.freeze({ id: 'collapse-blank-lines', label: '3行以上の空行を2行にする', description: '段落間の過剰な空行だけを縮めます。', rule: Object.freeze({ target: '(\\r?\\n){3,}', replacement: '\n\n', isRegex: true, severity: 'info', category: '改行', reason: '3行以上続く空行を2行へ整理します。', excludeScopes: ['url', 'email', 'code'], autoFix: true }) }),
    Object.freeze({ id: 'collapse-japanese-periods', label: '連続する句点を1つにする', description: '「。。」「。。。」のような連続句点を修正します。', rule: Object.freeze({ target: '。。+', replacement: '。', isRegex: true, severity: 'warning', category: '句読点', reason: '連続する句点を1個へ統一します。', excludeScopes: ['url', 'email', 'code'], autoFix: true }) }),
    Object.freeze({ id: 'normalize-fullwidth-comma', label: '全角コンマを読点にする', description: '全角コンマ「，」だけを日本語の読点「、」へ変換します。', rule: Object.freeze({ target: '，', replacement: '、', isRegex: false, severity: 'warning', category: '句読点', reason: '日本語文章の全角コンマを読点へ統一します。', excludeScopes: ['url', 'email', 'code'], autoFix: true }) })
]);
