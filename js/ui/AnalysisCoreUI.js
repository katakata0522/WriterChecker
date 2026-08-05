import { normalizeRuleV3 } from '../RuleSchema.js';
import { SEVERITY_LABELS } from './UIShared.js';

export const AnalysisCoreMethods = {
_bindTextEvents() {
        this.sourceText?.addEventListener('input', () => {
            if (!this._hasTrackedInputStart && this.sourceText.value.trim()) {
                this._hasTrackedInputStart = true;
                this._track('text_input_started', { ruleset_name: this.activeSetName });
            }
            this._analyzeTextDebounced();
        });
        this.clearBtn?.addEventListener('click', () => {
            if (this.sourceText.value) this._pushUndo(this.sourceText.value);
            this.sourceText.value = '';
            this.analyzeText();
            this.sourceText.focus?.();
        });
        this.pasteBtn?.addEventListener('click', async () => {
            try {
                const text = await navigator.clipboard.readText();
                this._replaceTextareaContent(text);
                this.analyzeText();
            } catch {
                this._showToast('クリップボードを読み取れませんでした', 'fa-triangle-exclamation');
            }
        });
        this.sampleBtn?.addEventListener('click', () => this._insertSampleText());
        this.replaceBtn?.addEventListener('click', () => this._replaceAllAutoFixable());
        this.copyBtn?.addEventListener('click', () => this._copyCleanedText());
        this.undoBtn?.addEventListener('click', () => this._undo());
        this.exportReportBtn?.addEventListener('click', () => this._exportCheckReport());

        this.resultOutput?.addEventListener('click', (event) => {
            const highlight = event.target.closest('.highlight');
            if (highlight) {
                this._handleHighlightClick(highlight);
                return;
            }
            const nav = event.target.closest('[data-issue-nav]');
            if (nav) {
                this._navigateIssueGroup(nav.dataset.groupKey, nav.dataset.issueNav);
                return;
            }
            const disable = event.target.closest('[data-disable-rule]');
            if (disable) this._confirmDisableRule(Number(disable.dataset.disableRule));
        });

        this.mobileReplaceBtn?.addEventListener('click', () => this.replaceBtn.click());
        this.mobileCopyBtn?.addEventListener('click', () => this.copyBtn.click());
        this.mobileSettingsBtn?.addEventListener('click', () => this.sidePanelToggle.click());
    },

_analyzeTextDebounced() {
        clearTimeout(this._analyzeDebounceTimer);
        this._updateStatusBar(this.sourceText.value);
        this._analyzeDebounceTimer = setTimeout(() => this.analyzeText(), 250);
    },

analyzeText() {
        const text = this.sourceText?.value || '';
        this._updateStatusBar(text);
        const requestId = ++this._analysisRequestSeq;
        if (!text) {
            this.resultOutput.innerHTML = '<div class="placeholder-text">文章を貼り付けると、ルールに一致した箇所を表示します。</div>';
            this.matchCountBadge.textContent = '0';
            this.matchCountStatus.textContent = '指摘なし';
            this._latestAnalysis = null;
            this._hasTrackedInputStart = false;
            this._lastTrackedAnalysisKey = '';
            this._updateBadgeStyle({ error: 0, warning: 0, info: 0 });
            return Promise.resolve();
        }
        return this._tokenizeForAnalysis(text).then((tokens) => {
            if (requestId !== this._analysisRequestSeq || this.sourceText.value !== text) return;
            this._renderAnalysisResult(text, tokens);
        }).catch(() => {
            if (requestId !== this._analysisRequestSeq || this.sourceText.value !== text) return;
            this._analysisTokensSource = 'sync_fallback';
            this._renderAnalysisResult(text, this.ruleEngine.tokenize(text));
        });
    },

_renderAnalysisResult(text, tokens) {
        this.resultOutput.innerHTML = '';
        const fragment = document.createDocumentFragment();
        const issues = [];
        const counts = { error: 0, warning: 0, info: 0 };
        let manualCount = 0;

        for (const token of tokens) {
            if (token.type === 'text') {
                fragment.appendChild(document.createTextNode(token.content));
                continue;
            }
            const issue = this._buildIssueDetail(token);
            issues.push(issue);
            counts[issue.severity]++;
            if (!issue.autoFix) manualCount++;

            const span = document.createElement('span');
            span.className = `highlight highlight--${issue.severity}${issue.autoFix ? '' : ' highlight--manual'}`;
            span.dataset.ruleIndex = Number.isInteger(issue.ruleIndex) ? String(issue.ruleIndex) : '';
            span.dataset.start = String(issue.start);
            span.dataset.end = String(issue.end);
            span.dataset.replacement = issue.replacement;
            span.dataset.autoFix = String(issue.autoFix);
            span.dataset.groupKey = issue.groupKey;
            span.tabIndex = 0;
            span.title = `${SEVERITY_LABELS[issue.severity]}・${issue.category}: ${issue.reason}`;
            span.setAttribute('aria-label', span.title);
            span.textContent = issue.target;
            fragment.appendChild(span);
            if (issue.autoFix && issue.replacement) {
                const inserted = document.createElement('span');
                inserted.className = 'inserted';
                inserted.textContent = issue.replacement;
                fragment.appendChild(inserted);
            }
        }

        this.resultOutput.appendChild(fragment);
        this._renderIssueGroups(issues);
        this.matchCountBadge.textContent = String(issues.length);
        this.matchCountStatus.textContent = issues.length
            ? `要修正 ${counts.error}　注意 ${counts.warning}　情報 ${counts.info}${manualCount ? `　要判断 ${manualCount}` : ''}`
            : '指摘なし';
        this._updateBadgeStyle(counts);
        this._latestAnalysis = { text, tokens, issues, counts, manualCount };

        const analysisKey = `${issues.length}:${counts.error}:${counts.warning}:${this.activeSetName}:${text.length}`;
        if (analysisKey !== this._lastTrackedAnalysisKey) {
            this._lastTrackedAnalysisKey = analysisKey;
            this._track('text_analyzed', {
                match_count: issues.length,
                error_count: counts.error,
                warning_count: counts.warning,
                manual_review_count: manualCount,
                text_length: text.length,
                ruleset_name: this.activeSetName,
                token_source: this._analysisTokensSource
            });
        }
    },

_buildIssueDetail(token) {
        const rule = normalizeRuleV3(token.ruleMeta || this.rules[token.ruleIndex] || {
            target: token.target || token.content,
            replacement: token.replacement || ''
        });
        const replacement = token.replacement ?? rule.replacement;
        return {
            ruleId: rule.id,
            groupKey: rule.id || `${rule.target}->${replacement}`,
            target: token.content,
            ruleTarget: rule.target,
            replacement,
            severity: rule.severity,
            category: rule.category,
            reason: rule.reason,
            badExample: rule.badExample || '',
            goodExample: rule.goodExample || '',
            autoFix: rule.autoFix,
            ruleIndex: Number.isInteger(token.ruleIndex) ? token.ruleIndex : null,
            start: Number.isInteger(token.start) ? token.start : 0,
            end: Number.isInteger(token.end) ? token.end : 0
        };
    },

_updateStatusBar(text) {
        if (this.charCount) this.charCount.textContent = `${text.length.toLocaleString('ja-JP')}文字`;
    },

_updateBadgeStyle(counts) {
        if (!this.matchCountBadge) return;
        this.matchCountBadge.classList.remove('badge-count--error', 'badge-count--warning', 'badge-count--info', 'badge-count--ok');
        const className = counts.error > 0 ? 'badge-count--error'
            : counts.warning > 0 ? 'badge-count--warning'
                : counts.info > 0 ? 'badge-count--info'
                    : 'badge-count--ok';
        this.matchCountBadge.classList.add(className);
    }
};
