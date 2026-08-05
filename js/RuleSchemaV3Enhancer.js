/**
 * Writer Checker — Rule Schema V3 enhancer
 *
 * 既存のStorageManager / RuleEngine / UIManagerを破壊せずに拡張し、
 * 旧ルールをV3へ正規化する。既存localStorageキーは維持するため、
 * ロールバック時にも従来版がtarget/replacementを読み取れる。
 */

const RULE_SCHEMA_VERSION = 3;
const VALID_SEVERITIES = new Set(['error', 'warning', 'info']);
const VALID_EXCLUDE_SCOPES = new Set(['url', 'email', 'code']);

function hashString(value) {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i++) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
}

function normalizeString(value, maxLength = 300) {
    return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function defaultReason(rule) {
    const memo = normalizeString(rule?.reason || rule?.memo, 300);
    if (memo) return memo;
    const replacement = typeof rule?.replacement === 'string' ? rule.replacement : '';
    if (!replacement) return '不要な装飾または表記として削除するルールです。';
    return `「${rule?.target || ''}」を「${replacement}」へ統一するルールです。`;
}

function normalizeRuleV3(rule) {
    if (typeof rule !== 'object' || rule === null || typeof rule.target !== 'string') return null;
    const target = rule.target;
    const replacement = typeof rule.replacement === 'string' ? rule.replacement : '';
    const isRegex = rule.isRegex === true;
    const severity = VALID_SEVERITIES.has(rule.severity) ? rule.severity : 'warning';
    const category = normalizeString(rule.category, 80) || '表記統一';
    const reason = defaultReason(rule);
    const excludeScopes = Array.isArray(rule.excludeScopes)
        ? [...new Set(rule.excludeScopes.filter((scope) => VALID_EXCLUDE_SCOPES.has(scope)))]
        : ['url', 'email', 'code'];
    const idSeed = `${target}\u0000${replacement}\u0000${isRegex ? 'regex' : 'literal'}`;

    const normalized = {
        schemaVersion: RULE_SCHEMA_VERSION,
        id: normalizeString(rule.id, 120) || `rule-${hashString(idSeed)}`,
        target,
        replacement,
        severity,
        category,
        reason,
        excludeScopes,
        autoFix: rule.autoFix !== false,
        enabled: rule.enabled !== false
    };

    if (isRegex) normalized.isRegex = true;
    if (typeof rule.memo === 'string' && rule.memo.trim()) normalized.memo = rule.memo.trim().slice(0, 300);
    if (typeof rule.badExample === 'string' && rule.badExample.trim()) normalized.badExample = rule.badExample.trim().slice(0, 300);
    if (typeof rule.goodExample === 'string' && rule.goodExample.trim()) normalized.goodExample = rule.goodExample.trim().slice(0, 300);
    return normalized;
}

function collectProtectedRanges(text) {
    const ranges = [];
    const patterns = [
        { scope: 'code', regex: /```[\s\S]*?```/g },
        { scope: 'code', regex: /`[^`\n]+`/g },
        { scope: 'url', regex: /https?:\/\/[^\s<>()]+/g },
        { scope: 'email', regex: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi }
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

    ranges.sort((a, b) => a.start - b.start || b.end - a.end);
    const merged = [];
    for (const range of ranges) {
        const previous = merged[merged.length - 1];
        if (!previous || range.start >= previous.end) {
            merged.push({ ...range, scopes: new Set([range.scope]) });
        } else {
            previous.end = Math.max(previous.end, range.end);
            previous.scopes.add(range.scope);
        }
    }
    return merged;
}

function tokenizeWithProtectedRanges(engine, originalTokenize, text) {
    const ranges = collectProtectedRanges(text);
    if (ranges.length === 0) return originalTokenize.call(engine, text);

    const tokens = [];
    let cursor = 0;
    for (const range of ranges) {
        if (range.start > cursor) {
            tokens.push(...originalTokenize.call(engine, text.slice(cursor, range.start)));
        }
        tokens.push({ type: 'text', content: text.slice(range.start, range.end), protectedScopes: [...range.scopes] });
        cursor = range.end;
    }
    if (cursor < text.length) tokens.push(...originalTokenize.call(engine, text.slice(cursor)));
    return tokens;
}

function cleanWithProtectedRanges(engine, originalCleaner, text) {
    const ranges = collectProtectedRanges(text);
    if (ranges.length === 0) return originalCleaner.call(engine, text);

    let result = '';
    let cursor = 0;
    for (const range of ranges) {
        if (range.start > cursor) result += originalCleaner.call(engine, text.slice(cursor, range.start));
        result += text.slice(range.start, range.end);
        cursor = range.end;
    }
    if (cursor < text.length) result += originalCleaner.call(engine, text.slice(cursor));
    return result;
}

function installStyles() {
    if (typeof document === 'undefined' || document.getElementById('writer-checker-v3-styles')) return;
    const style = document.createElement('style');
    style.id = 'writer-checker-v3-styles';
    style.textContent = `
        .highlight--error { background:#fee2e2 !important; border-bottom-color:#dc2626 !important; }
        .highlight--warning { background:#fef3c7 !important; border-bottom-color:#d97706 !important; }
        .highlight--info { background:#dbeafe !important; border-bottom-color:#2563eb !important; }
        .rule-v3-fields { display:grid; grid-template-columns:minmax(105px,.7fr) minmax(110px,.8fr) minmax(180px,1.5fr); gap:.45rem; width:100%; margin-top:.45rem; }
        .rule-v3-fields select,.rule-v3-fields input { min-width:0; padding:.5rem .6rem; border:1px solid var(--border-color,#d1d5db); border-radius:.45rem; background:var(--surface,#fff); color:inherit; }
        .issue-severity-badge { flex:none; display:inline-flex; align-items:center; justify-content:center; min-width:4.6rem; padding:.15rem .45rem; border-radius:999px; font-size:.72rem; font-weight:800; margin-right:.5rem; }
        .issue-severity-badge--error { color:#991b1b; background:#fee2e2; }
        .issue-severity-badge--warning { color:#92400e; background:#fef3c7; }
        .issue-severity-badge--info { color:#1e40af; background:#dbeafe; }
        @media (max-width:720px) { .rule-v3-fields { grid-template-columns:1fr; } }
    `;
    document.head.appendChild(style);
}

export function applyRuleSchemaV3({ StorageManager, RuleEngine, UIManager }) {
    if (!StorageManager || !RuleEngine || !UIManager) throw new Error('Rule Schema V3 requires all managers.');
    if (StorageManager.prototype.__ruleSchemaV3Applied) return;

    StorageManager.prototype.__ruleSchemaV3Applied = true;
    const originalSanitizeRule = StorageManager.prototype._sanitizeRule;
    StorageManager.prototype._sanitizeRule = function sanitizeRuleV3(rule) {
        const legacySafe = originalSanitizeRule.call(this, rule);
        return legacySafe ? normalizeRuleV3({ ...rule, ...legacySafe }) : null;
    };
    const originalCloneDefaultRules = StorageManager.prototype._cloneDefaultRules;
    StorageManager.prototype._cloneDefaultRules = function cloneDefaultRulesV3() {
        const defaults = originalCloneDefaultRules.call(this);
        return Object.fromEntries(Object.entries(defaults).map(([name, rules]) => [
            name,
            rules.map(normalizeRuleV3).filter(Boolean)
        ]));
    };

    const originalTokenize = RuleEngine.prototype.tokenize;
    RuleEngine.prototype.tokenize = function tokenizeV3(text) {
        const tokens = tokenizeWithProtectedRanges(this, originalTokenize, text);
        return tokens.map((token) => {
            if (token.type !== 'highlight') return token;
            const rule = Number.isInteger(token.ruleIndex) ? this.rules[token.ruleIndex] : null;
            const normalized = normalizeRuleV3(rule || {
                target: token.target || token.content,
                replacement: token.replacement || '',
                severity: 'info',
                category: '装飾',
                reason: 'AI出力などに含まれる装飾記号です。'
            });
            return { ...token, ruleMeta: normalized };
        });
    };

    const originalCleaner = RuleEngine.prototype.getCleanedText;
    RuleEngine.prototype.getCleanedText = function getCleanedTextV3(text) {
        return cleanWithProtectedRanges(this, originalCleaner, text);
    };

    const originalBuildReason = UIManager.prototype._buildRuleReason;
    UIManager.prototype._buildRuleReason = function buildRuleReasonV3(rule, token) {
        const reason = normalizeString(rule?.reason || token?.ruleMeta?.reason, 300);
        return reason || originalBuildReason.call(this, rule, token);
    };

    const originalBuildIssue = UIManager.prototype._buildIssueDetail;
    UIManager.prototype._buildIssueDetail = function buildIssueDetailV3(token) {
        const issue = originalBuildIssue.call(this, token);
        const rule = this._findRuleForHighlight(token.content, token.ruleIndex, token.target) || token.ruleMeta || {};
        const normalized = normalizeRuleV3({
            target: issue.ruleTarget || token.content,
            replacement: issue.replacement,
            ...rule
        });
        return {
            ...issue,
            severity: normalized?.severity || 'warning',
            category: normalized?.category || '表記統一',
            ruleId: normalized?.id || '',
            badExample: normalized?.badExample || '',
            goodExample: normalized?.goodExample || ''
        };
    };

    const originalRenderInsights = UIManager.prototype._renderIssueInsightList;
    UIManager.prototype._renderIssueInsightList = function renderIssueInsightListV3(issues) {
        originalRenderInsights.call(this, issues);
        if (typeof document === 'undefined') return;
        const lists = this.resultOutput?.querySelectorAll?.('.issue-insight-list');
        const list = lists?.[lists.length - 1];
        if (!list) return;
        [...list.children].forEach((row, index) => {
            const issue = issues[index];
            if (!issue) return;
            const main = row.querySelector?.('.issue-insight-main');
            if (!main) return;
            const badge = document.createElement('span');
            badge.className = `issue-severity-badge issue-severity-badge--${issue.severity}`;
            badge.textContent = issue.severity === 'error' ? '要修正' : issue.severity === 'info' ? '情報' : '注意';
            badge.title = issue.category || '';
            main.prepend(badge);
        });
    };

    const originalRenderAnalysis = UIManager.prototype._renderAnalysisResult;
    UIManager.prototype._renderAnalysisResult = function renderAnalysisResultV3(text, tokens) {
        const result = originalRenderAnalysis.call(this, text, tokens);
        const severityCounts = { error: 0, warning: 0, info: 0 };
        const highlights = this.resultOutput?.querySelectorAll?.('.highlight') || [];
        highlights.forEach((span) => {
            const index = Number.parseInt(span.getAttribute('data-rule-index'), 10);
            const rule = Number.isInteger(index) ? this.rules[index] : null;
            const severity = VALID_SEVERITIES.has(rule?.severity) ? rule.severity : 'warning';
            severityCounts[severity]++;
            span.classList.add(`highlight--${severity}`);
            span.setAttribute('data-severity', severity);
            span.setAttribute('data-category', rule?.category || '表記統一');
            span.setAttribute('aria-label', `${severity === 'error' ? '要修正' : severity === 'info' ? '情報' : '注意'}: ${span.title || span.textContent}`);
        });
        if (this.matchCountStatus && highlights.length > 0) {
            this.matchCountStatus.textContent = `${highlights.length}件（要修正 ${severityCounts.error} / 注意 ${severityCounts.warning} / 情報 ${severityCounts.info}）`;
        }
        if (this._latestAnalysis) this._latestAnalysis.severityCounts = severityCounts;
        return result;
    };

    const originalRenderRules = UIManager.prototype.renderRulesList;
    UIManager.prototype.renderRulesList = function renderRulesListV3() {
        originalRenderRules.call(this);
        installStyles();
        const items = this.rulesList?.querySelectorAll?.('.rule-item') || [];
        items.forEach((item, index) => {
            if (item.querySelector('.rule-v3-fields')) return;
            const rule = normalizeRuleV3(this.rules[index]) || {};
            Object.assign(this.rules[index], rule);

            const fields = document.createElement('div');
            fields.className = 'rule-v3-fields';
            const severity = document.createElement('select');
            severity.className = 'rule-severity';
            for (const [value, label] of [['error', '要修正'], ['warning', '注意'], ['info', '情報']]) {
                const option = document.createElement('option');
                option.value = value;
                option.textContent = label;
                option.selected = rule.severity === value;
                severity.appendChild(option);
            }
            const category = document.createElement('input');
            category.className = 'rule-category';
            category.placeholder = 'カテゴリ（例：固有名詞）';
            category.value = rule.category || '';
            const reason = document.createElement('input');
            reason.className = 'rule-reason';
            reason.placeholder = '指摘理由';
            reason.value = rule.reason || '';
            fields.append(severity, category, reason);
            item.appendChild(fields);
        });
    };

    const originalSaveRules = UIManager.prototype._saveRulesFromUI;
    UIManager.prototype._saveRulesFromUI = function saveRulesFromUIV3() {
        const metadata = [...(this.rulesList?.querySelectorAll?.('.rule-item') || [])].map((item) => ({
            severity: item.querySelector('.rule-severity')?.value || 'warning',
            category: item.querySelector('.rule-category')?.value || '表記統一',
            reason: item.querySelector('.rule-reason')?.value || ''
        }));
        originalSaveRules.call(this);
        this.rules = this.rules.map((rule, index) => normalizeRuleV3({ ...rule, ...metadata[index] })).filter(Boolean);
        this.allRuleSets[this.activeSetName] = this.rules;
        this.ruleEngine.setRules(this.rules);
        this.storageManager.saveAllRuleSets(this.allRuleSets);
    };

    installStyles();
}

export { normalizeRuleV3, collectProtectedRanges, RULE_SCHEMA_VERSION };
