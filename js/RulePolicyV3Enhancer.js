/**
 * Writer Checker — Rule Schema V3 policy enhancer
 *
 * V3基盤の上に、ルール別除外・自動修正禁止・詳細UI・レポートを追加する。
 * 既存のV2保存キーと基本操作は維持する。
 */
import { normalizeRuleV3, RULE_SCHEMA_VERSION } from './RuleSchemaV3Enhancer.js';

const VALID_SEVERITIES = new Set(['error', 'warning', 'info']);
const DEFAULT_EXCLUDE_SCOPES = ['url', 'email', 'code'];

function collectRawRanges(text) {
    if (typeof text !== 'string' || text.length === 0) return [];
    const ranges = [];
    const patterns = [
        { scope: 'code', regex: /```[\s\S]*?(?:```|$)/g },
        { scope: 'code', regex: /`[^`\n]+`/g },
        { scope: 'url', regex: /https?:\/\/[^\s<>()"'、。！？]+/g },
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
    return ranges;
}

function sameScopes(left, right) {
    if (left.size !== right.size) return false;
    for (const scope of left) {
        if (!right.has(scope)) return false;
    }
    return true;
}

export function collectScopedRanges(text) {
    const rawRanges = collectRawRanges(text);
    if (rawRanges.length === 0) return [];
    const points = [...new Set(rawRanges.flatMap((range) => [range.start, range.end]))].sort((a, b) => a - b);
    const result = [];

    for (let index = 0; index < points.length - 1; index++) {
        const start = points[index];
        const end = points[index + 1];
        if (start === end) continue;
        const scopes = new Set(
            rawRanges
                .filter((range) => range.start < end && range.end > start)
                .map((range) => range.scope)
        );
        if (scopes.size === 0) continue;
        const previous = result[result.length - 1];
        if (previous && previous.end === start && sameScopes(previous.scopes, scopes)) {
            previous.end = end;
        } else {
            result.push({ start, end, scopes });
        }
    }
    return result;
}

export function splitTextByScopes(text) {
    if (!text) return [];
    const ranges = collectScopedRanges(text);
    if (ranges.length === 0) return [{ content: text, protectedScopes: [] }];

    const segments = [];
    let cursor = 0;
    for (const range of ranges) {
        if (range.start > cursor) {
            segments.push({ content: text.slice(cursor, range.start), protectedScopes: [] });
        }
        segments.push({ content: text.slice(range.start, range.end), protectedScopes: [...range.scopes] });
        cursor = range.end;
    }
    if (cursor < text.length) segments.push({ content: text.slice(cursor), protectedScopes: [] });
    return segments;
}

function hasExcludedScope(excludeScopes, protectedScopes) {
    if (!Array.isArray(excludeScopes) || excludeScopes.length === 0) return false;
    if (!Array.isArray(protectedScopes) || protectedScopes.length === 0) return false;
    return protectedScopes.some((scope) => excludeScopes.includes(scope));
}

function applyPattern(tokens, regex, replacement, target, ruleIndex, ruleMeta, excludeScopes) {
    const result = [];
    for (const token of tokens) {
        if (token.type !== 'text' || hasExcludedScope(excludeScopes, token.protectedScopes)) {
            result.push(token);
            continue;
        }

        let lastIndex = 0;
        let match;
        regex.lastIndex = 0;
        while ((match = regex.exec(token.content)) !== null) {
            if (match[0] === '' && regex.lastIndex === match.index) {
                regex.lastIndex++;
                continue;
            }
            if (match.index > lastIndex) {
                result.push({
                    type: 'text',
                    content: token.content.substring(lastIndex, match.index),
                    protectedScopes: token.protectedScopes || []
                });
            }
            result.push({
                type: 'highlight',
                content: match[0],
                replacement,
                target: target || match[0],
                ruleIndex,
                ruleMeta
            });
            lastIndex = regex.lastIndex;
        }
        if (lastIndex < token.content.length) {
            result.push({
                type: 'text',
                content: token.content.substring(lastIndex),
                protectedScopes: token.protectedScopes || []
            });
        }
    }
    return result;
}

function tokenizeWithPolicies(engine, text) {
    if (!text) return [];
    let tokens = splitTextByScopes(text).map((segment) => ({ type: 'text', ...segment }));

    if (engine.removeAsterisks) {
        const decorationRule = normalizeRuleV3({
            id: 'builtin-remove-asterisks',
            target: '*',
            replacement: '',
            severity: 'info',
            category: '装飾',
            reason: 'AI出力などに含まれるアスタリスク装飾です。',
            excludeScopes: DEFAULT_EXCLUDE_SCOPES,
            autoFix: true
        });
        tokens = applyPattern(tokens, /(\*\*|\*)/g, '', '', null, decorationRule, DEFAULT_EXCLUDE_SCOPES);
    }

    for (const [ruleIndex, rawRule] of engine.rules.entries()) {
        const rule = normalizeRuleV3(rawRule);
        if (!rule || rule.enabled === false || !rule.target) continue;
        const regex = engine._buildRegex(rule);
        if (!regex) continue;
        tokens = applyPattern(tokens, regex, rule.replacement, rule.target, ruleIndex, rule, rule.excludeScopes);
    }
    return tokens;
}

function cleanTextWithPolicies(engine, text) {
    if (!text) return text;
    return splitTextByScopes(text).map((segment) => {
        let result = segment.content;
        if (engine.removeAsterisks && !hasExcludedScope(DEFAULT_EXCLUDE_SCOPES, segment.protectedScopes)) {
            result = result.replace(/\*\*/g, '').replace(/\*/g, '');
        }
        for (const rawRule of engine.rules) {
            const rule = normalizeRuleV3(rawRule);
            if (!rule || rule.enabled === false || rule.autoFix === false || !rule.target) continue;
            if (hasExcludedScope(rule.excludeScopes, segment.protectedScopes)) continue;
            const regex = engine._buildRegex(rule);
            if (!regex) continue;
            result = result.replace(regex, rule.replacement);
        }
        return result;
    }).join('');
}

function severityLabel(severity) {
    if (severity === 'error') return '要修正';
    if (severity === 'info') return '情報';
    return '注意';
}

function installPolicyStyles() {
    if (typeof document === 'undefined' || document.getElementById('writer-checker-v3-policy-styles')) return;
    const style = document.createElement('style');
    style.id = 'writer-checker-v3-policy-styles';
    style.textContent = `
        .highlight--manual { box-shadow:0 0 0 2px rgba(124,58,237,.28); cursor:help; }
        .rule-v3-advanced { width:100%; margin-top:.45rem; border:1px solid var(--border-color,#e5e7eb); border-radius:.5rem; padding:.4rem .55rem; }
        .rule-v3-advanced summary { cursor:pointer; font-size:.82rem; font-weight:700; }
        .rule-v3-example-grid { display:grid; grid-template-columns:1fr 1fr; gap:.45rem; margin-top:.55rem; }
        .rule-v3-example-grid input { min-width:0; padding:.5rem .6rem; border:1px solid var(--border-color,#d1d5db); border-radius:.45rem; background:var(--surface,#fff); color:inherit; }
        .rule-v3-policy-grid { display:flex; flex-wrap:wrap; gap:.45rem .9rem; margin-top:.55rem; font-size:.8rem; }
        .rule-v3-policy-grid label { display:inline-flex; align-items:center; gap:.3rem; }
        .issue-category-badge,.issue-manual-badge { display:inline-flex; align-items:center; justify-content:center; padding:.15rem .45rem; border-radius:999px; font-size:.72rem; font-weight:800; margin-right:.3rem; }
        .issue-category-badge { color:#374151; background:#f3f4f6; }
        .issue-manual-badge { color:#5b21b6; background:#ede9fe; }
        .issue-examples { display:grid; gap:.2rem; margin-top:.35rem; font-size:.78rem; color:var(--text-secondary,#4b5563); }
        .issue-filter-bar { display:flex; flex-wrap:wrap; gap:.35rem; margin:.45rem 0 .7rem; }
        .issue-filter-btn { border:1px solid var(--border-color,#d1d5db); border-radius:999px; padding:.25rem .55rem; background:transparent; color:inherit; cursor:pointer; font-size:.76rem; }
        .issue-filter-btn[aria-pressed="true"] { background:var(--primary-color,#4f46e5); color:#fff; border-color:transparent; }
        @media (max-width:720px) { .rule-v3-example-grid { grid-template-columns:1fr; } }
    `;
    document.head.appendChild(style);
}

export function applyRulePolicyV3({ RuleEngine, UIManager }) {
    if (!RuleEngine || !UIManager) throw new Error('Rule Policy V3 requires RuleEngine and UIManager.');
    if (RuleEngine.prototype.__rulePolicyV3Applied) return;
    RuleEngine.prototype.__rulePolicyV3Applied = true;

    RuleEngine.prototype.tokenize = function tokenizePolicyV3(text) {
        return tokenizeWithPolicies(this, text);
    };
    RuleEngine.prototype.getCleanedText = function getCleanedTextPolicyV3(text) {
        return cleanTextWithPolicies(this, text);
    };

    UIManager.prototype._sanitizeImportedRuleArray = function sanitizeImportedRuleArrayPolicyV3(rules) {
        if (!Array.isArray(rules)) return null;
        return rules.map(normalizeRuleV3).filter(Boolean);
    };

    const previousBuildIssue = UIManager.prototype._buildIssueDetail;
    UIManager.prototype._buildIssueDetail = function buildIssueDetailPolicyV3(token) {
        const issue = previousBuildIssue.call(this, token);
        const rawRule = Number.isInteger(token.ruleIndex) ? this.rules?.[token.ruleIndex] : token.ruleMeta;
        const rule = normalizeRuleV3(rawRule || {
            target: token.target || token.content,
            replacement: token.replacement || ''
        });
        return {
            ...issue,
            autoFix: rule?.autoFix !== false,
            excludeScopes: rule?.excludeScopes || [...DEFAULT_EXCLUDE_SCOPES],
            badExample: rule?.badExample || issue.badExample || '',
            goodExample: rule?.goodExample || issue.goodExample || ''
        };
    };

    const previousRenderInsights = UIManager.prototype._renderIssueInsightList;
    UIManager.prototype._renderIssueInsightList = function renderIssueInsightPolicyV3(issues) {
        previousRenderInsights.call(this, issues);
        if (typeof document === 'undefined') return;
        const lists = this.resultOutput?.querySelectorAll?.('.issue-insight-list');
        const list = lists?.[lists.length - 1];
        if (!list) return;
        const visibleIssues = issues.slice(0, 80);

        [...list.children].forEach((row, index) => {
            const issue = visibleIssues[index];
            if (!issue) return;
            row.dataset.severity = issue.severity;
            row.dataset.autoFix = issue.autoFix ? 'true' : 'false';
            const main = row.querySelector?.('.issue-insight-main');
            if (!main) return;

            if (!main.querySelector('.issue-category-badge')) {
                const category = document.createElement('span');
                category.className = 'issue-category-badge';
                category.textContent = issue.category || '表記統一';
                const severityBadge = main.querySelector('.issue-severity-badge');
                if (severityBadge) severityBadge.after(category);
                else main.prepend(category);
            }
            if (!issue.autoFix && !main.querySelector('.issue-manual-badge')) {
                const manual = document.createElement('span');
                manual.className = 'issue-manual-badge';
                manual.textContent = '要判断';
                const categoryBadge = main.querySelector('.issue-category-badge');
                if (categoryBadge) categoryBadge.after(manual);
                else main.prepend(manual);
            }
            if ((issue.badExample || issue.goodExample) && !main.querySelector('.issue-examples')) {
                const examples = document.createElement('div');
                examples.className = 'issue-examples';
                if (issue.badExample) {
                    const bad = document.createElement('span');
                    bad.textContent = `避けたい例: ${issue.badExample}`;
                    examples.appendChild(bad);
                }
                if (issue.goodExample) {
                    const good = document.createElement('span');
                    good.textContent = `推奨例: ${issue.goodExample}`;
                    examples.appendChild(good);
                }
                main.appendChild(examples);
            }
        });

        const panel = list.closest?.('.issue-insight-panel');
        const title = panel?.querySelector?.('.issue-insight-title');
        if (!panel || !title || panel.querySelector('.issue-filter-bar')) return;
        const filterBar = document.createElement('div');
        filterBar.className = 'issue-filter-bar';
        filterBar.setAttribute('role', 'group');
        filterBar.setAttribute('aria-label', '重大度で絞り込み');
        const filters = [
            ['all', 'すべて', visibleIssues.length],
            ['error', '要修正', visibleIssues.filter((issue) => issue.severity === 'error').length],
            ['warning', '注意', visibleIssues.filter((issue) => issue.severity === 'warning').length],
            ['info', '情報', visibleIssues.filter((issue) => issue.severity === 'info').length]
        ];
        for (const [value, label, count] of filters) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'issue-filter-btn';
            button.dataset.filter = value;
            button.setAttribute('aria-pressed', value === 'all' ? 'true' : 'false');
            button.textContent = `${label} ${count}`;
            button.addEventListener('click', () => {
                filterBar.querySelectorAll('.issue-filter-btn').forEach((item) => {
                    item.setAttribute('aria-pressed', item === button ? 'true' : 'false');
                });
                [...list.children].forEach((item) => {
                    item.hidden = value !== 'all' && item.dataset.severity !== value;
                });
            });
            filterBar.appendChild(button);
        }
        title.after(filterBar);
    };

    const previousRenderAnalysis = UIManager.prototype._renderAnalysisResult;
    UIManager.prototype._renderAnalysisResult = function renderAnalysisPolicyV3(text, tokens) {
        const result = previousRenderAnalysis.call(this, text, tokens);
        const severityCounts = { error: 0, warning: 0, info: 0 };
        let manualReviewCount = 0;
        const issues = this._latestAnalysis?.issues || [];
        const highlights = this.resultOutput?.querySelectorAll?.('.highlight') || [];

        highlights.forEach((span, index) => {
            const issue = issues[index] || {};
            const severity = VALID_SEVERITIES.has(issue.severity) ? issue.severity : 'warning';
            severityCounts[severity]++;
            if (issue.autoFix === false) manualReviewCount++;
            span.dataset.autoFix = issue.autoFix === false ? 'false' : 'true';
            if (issue.autoFix === false) span.classList.add('highlight--manual');
            const manualNote = issue.autoFix === false ? '。文脈確認が必要なため自動修正しません' : '';
            span.setAttribute('aria-label', `${severityLabel(severity)}: ${span.title || span.textContent}${manualNote}`);
        });

        if (this.matchCountStatus && highlights.length > 0) {
            const manualText = manualReviewCount > 0 ? ` / 要判断 ${manualReviewCount}` : '';
            this.matchCountStatus.textContent = `${highlights.length}件（要修正 ${severityCounts.error} / 注意 ${severityCounts.warning} / 情報 ${severityCounts.info}${manualText}）`;
        }
        if (this.matchCountBadge) {
            this.matchCountBadge.style.backgroundColor = severityCounts.error > 0 ? 'var(--danger-color)'
                : severityCounts.warning > 0 ? '#b45309'
                    : severityCounts.info > 0 ? '#2563eb'
                        : 'var(--success-color)';
        }
        if (this._latestAnalysis) {
            this._latestAnalysis.severityCounts = severityCounts;
            this._latestAnalysis.manualReviewCount = manualReviewCount;
        }
        return result;
    };

    const previousBindEditorEvents = UIManager.prototype._bindEditorEvents;
    UIManager.prototype._bindEditorEvents = function bindEditorEventsPolicyV3() {
        previousBindEditorEvents.call(this);
        if (!this.resultOutput || this.resultOutput.dataset.rulePolicyGuardBound === 'true') return;
        this.resultOutput.dataset.rulePolicyGuardBound = 'true';
        this.resultOutput.addEventListener('click', (event) => {
            const highlight = event.target.closest?.('.highlight');
            if (!highlight || highlight.dataset.autoFix !== 'false') return;
            event.preventDefault();
            event.stopImmediatePropagation();
            this._showToast('この指摘は文脈確認が必要なため、自動修正しません。', 'fa-circle-info');
        }, true);
    };

    const previousApplyIndividualFix = UIManager.prototype._applyIndividualFix;
    UIManager.prototype._applyIndividualFix = function applyIndividualFixPolicyV3(targetText, replacementText, occurrenceIndex, options = {}) {
        const ruleIndex = Number.isInteger(options.ruleIndex) ? options.ruleIndex : null;
        const rule = ruleIndex !== null ? normalizeRuleV3(this.rules?.[ruleIndex]) : null;
        if (rule?.autoFix === false) {
            this._showToast('この指摘は文脈確認が必要なため、自動修正しません。', 'fa-circle-info');
            return;
        }
        return previousApplyIndividualFix.call(this, targetText, replacementText, occurrenceIndex, options);
    };

    const previousRenderRules = UIManager.prototype.renderRulesList;
    UIManager.prototype.renderRulesList = function renderRulesPolicyV3() {
        previousRenderRules.call(this);
        installPolicyStyles();
        const items = this.rulesList?.querySelectorAll?.('.rule-item') || [];
        items.forEach((item, index) => {
            if (item.querySelector('.rule-v3-advanced')) return;
            const rule = normalizeRuleV3(this.rules[index]) || {};
            Object.assign(this.rules[index], rule);

            const advanced = document.createElement('details');
            advanced.className = 'rule-v3-advanced';
            const summary = document.createElement('summary');
            summary.textContent = '詳細設定（例文・除外・自動修正）';
            advanced.appendChild(summary);

            const examples = document.createElement('div');
            examples.className = 'rule-v3-example-grid';
            const badExample = document.createElement('input');
            badExample.className = 'rule-bad-example';
            badExample.placeholder = '避けたい例';
            badExample.value = rule.badExample || '';
            const goodExample = document.createElement('input');
            goodExample.className = 'rule-good-example';
            goodExample.placeholder = '推奨例';
            goodExample.value = rule.goodExample || '';
            examples.append(badExample, goodExample);
            advanced.appendChild(examples);

            const policies = document.createElement('div');
            policies.className = 'rule-v3-policy-grid';
            const autoFixLabel = document.createElement('label');
            const autoFix = document.createElement('input');
            autoFix.type = 'checkbox';
            autoFix.className = 'rule-auto-fix';
            autoFix.checked = rule.autoFix !== false;
            autoFixLabel.append(autoFix, document.createTextNode('自動修正を許可'));
            policies.appendChild(autoFixLabel);

            for (const [scope, label] of [['url', 'URLを除外'], ['email', 'メールを除外'], ['code', 'コードを除外']]) {
                const scopeLabel = document.createElement('label');
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.className = 'rule-exclude-scope';
                checkbox.dataset.scope = scope;
                checkbox.checked = rule.excludeScopes.includes(scope);
                scopeLabel.append(checkbox, document.createTextNode(label));
                policies.appendChild(scopeLabel);
            }
            advanced.appendChild(policies);
            item.appendChild(advanced);
        });
    };

    const previousSaveRules = UIManager.prototype._saveRulesFromUI;
    UIManager.prototype._saveRulesFromUI = function saveRulesPolicyV3() {
        const previousRules = this.rules.map((rule) => normalizeRuleV3(rule) || rule);
        const advancedMetadata = [...(this.rulesList?.querySelectorAll?.('.rule-item') || [])].map((item) => ({
            badExample: item.querySelector('.rule-bad-example')?.value || '',
            goodExample: item.querySelector('.rule-good-example')?.value || '',
            autoFix: item.querySelector('.rule-auto-fix')?.checked ?? true,
            excludeScopes: [...item.querySelectorAll('.rule-exclude-scope:checked')]
                .map((checkbox) => checkbox.dataset.scope)
        }));
        previousSaveRules.call(this);
        this.rules = this.rules.map((rule, index) => normalizeRuleV3({
            ...previousRules[index],
            ...rule,
            ...advancedMetadata[index]
        })).filter(Boolean);
        this.allRuleSets[this.activeSetName] = this.rules;
        this.ruleEngine.setRules(this.rules);
        this.storageManager.saveAllRuleSets(this.allRuleSets);
    };

    UIManager.prototype._filterRulesList = function filterRulesListPolicyV3(query) {
        if (!this.rulesList) return;
        const normalizedQuery = String(query || '').toLowerCase();
        this.rulesList.querySelectorAll('.rule-item').forEach((item) => {
            const searchable = [...item.querySelectorAll('input,select')]
                .map((field) => field.value || field.options?.[field.selectedIndex]?.text || '')
                .join(' ')
                .toLowerCase();
            item.style.display = searchable.includes(normalizedQuery) ? '' : 'none';
        });
    };

    UIManager.prototype._generateChangeReport = function generateChangeReportPolicyV3(originalText) {
        return this.ruleEngine.tokenize(originalText)
            .filter((token) => token.type === 'highlight' && token.ruleMeta?.autoFix !== false)
            .map((token) => ({
                from: token.content,
                to: token.replacement || '（削除）',
                severity: token.ruleMeta?.severity || 'warning',
                category: token.ruleMeta?.category || '表記統一'
            }));
    };

    UIManager.prototype._exportCheckReport = function exportCheckReportPolicyV3() {
        const text = this.sourceText.value;
        if (!text) {
            this._showToast('テキストが入力されていません', 'fa-triangle-exclamation');
            return;
        }

        const tokens = this.ruleEngine.tokenize(text);
        const issues = tokens
            .filter((token) => token.type === 'highlight')
            .map((token) => this._buildIssueDetail(token));
        const severityCounts = {
            error: issues.filter((issue) => issue.severity === 'error').length,
            warning: issues.filter((issue) => issue.severity === 'warning').length,
            info: issues.filter((issue) => issue.severity === 'info').length
        };
        const manualReviewCount = issues.filter((issue) => issue.autoFix === false).length;
        const metrics = this._collectTextMetrics(text);
        const doubleHonorificIssues = this._findDoubleHonorificIssues(text);
        const writingScore = this._calculateWritingScore({ text, matchCount: issues.length, doubleHonorificIssues, metrics });
        const comprehensiveSummary = this._buildComprehensiveChecks({
            matchCount: issues.length,
            doubleHonorificIssues,
            writingScore,
            metrics
        });

        let report = `═════ Writer Checker レポート ═════\n`;
        report += `日時: ${new Date().toLocaleString('ja-JP')}\n`;
        report += `ルールセット: ${this.activeSetName}\n`;
        report += `ルール形式: V${RULE_SCHEMA_VERSION}\n`;
        report += `登録ルール数: ${this.rules.length}件\n`;
        report += `文字数: ${metrics.totalChars} / 空白なし: ${metrics.noSpaceChars}\n`;
        report += `漢字率: ${metrics.kanjiPercent}%\n`;
        report += `文章スコア: ${writingScore.score}点 (${writingScore.grade})\n`;
        report += `スコア信頼度: ${writingScore.confidence.toUpperCase()}\n`;
        report += `全部盛り判定: ${comprehensiveSummary.status}\n`;
        report += `二重敬語: ${doubleHonorificIssues.length}件\n`;
        report += `検出数: ${issues.length}件（要修正 ${severityCounts.error} / 注意 ${severityCounts.warning} / 情報 ${severityCounts.info}）\n`;
        report += `人の判断が必要: ${manualReviewCount}件\n\n`;

        if (doubleHonorificIssues.length > 0) {
            report += `─── 二重敬語の検出 ───\n`;
            doubleHonorificIssues.slice(0, 10).forEach((issue, index) => {
                report += `${index + 1}. 「${issue.phrase}」 -> ${issue.suggestion}\n`;
            });
            report += '\n';
        }
        if (issues.length > 0) {
            report += `─── 検出一覧 ───\n`;
            issues.forEach((issue, index) => {
                const after = issue.replacement || '（削除）';
                const manual = issue.autoFix === false ? ' [要判断・自動修正なし]' : '';
                report += `${index + 1}. [${severityLabel(issue.severity)}][${issue.category}]${manual} 「${issue.target}」 → 「${after}」\n`;
                report += `   理由: ${issue.reason}\n`;
                if (issue.badExample) report += `   避けたい例: ${issue.badExample}\n`;
                if (issue.goodExample) report += `   推奨例: ${issue.goodExample}\n`;
            });
        } else {
            report += `検出なし: ルール上の指摘はありません。\n`;
        }

        const blob = new Blob([report], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `writer-checker-report-${new Date().toISOString().slice(0, 10)}.txt`;
        anchor.click();
        URL.revokeObjectURL(url);
        this._showToast('レポートをダウンロードしました');
        this._track('report_exported', {
            score: writingScore.score,
            status: comprehensiveSummary.status,
            issue_count: issues.length,
            error_count: severityCounts.error,
            manual_review_count: manualReviewCount
        });
    };

    installPolicyStyles();
}
