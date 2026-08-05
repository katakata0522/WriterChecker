/**
 * Writer Checker — V3 UI consistency adapter
 * トークン由来の重大度・自動修正方針を最終DOMへ確実に反映する。
 */

const VALID_SEVERITIES = new Set(['error', 'warning', 'info']);

function severityLabel(severity) {
    if (severity === 'error') return '要修正';
    if (severity === 'info') return '情報';
    return '注意';
}

export function applyRulePolicyV3UIFix({ UIManager }) {
    if (!UIManager) throw new Error('Rule Policy V3 UI fix requires UIManager.');
    if (UIManager.prototype.__rulePolicyV3UIFixApplied) return;
    UIManager.prototype.__rulePolicyV3UIFixApplied = true;

    const previousRenderAnalysis = UIManager.prototype._renderAnalysisResult;
    UIManager.prototype._renderAnalysisResult = function renderAnalysisPolicyV3UIFix(text, tokens) {
        const result = previousRenderAnalysis.call(this, text, tokens);
        const issues = this._latestAnalysis?.issues || [];
        const highlights = this.resultOutput?.querySelectorAll?.('.highlight') || [];
        const severityCounts = { error: 0, warning: 0, info: 0 };
        let manualReviewCount = 0;

        highlights.forEach((span, index) => {
            const issue = issues[index] || {};
            const severity = VALID_SEVERITIES.has(issue.severity) ? issue.severity : 'warning';
            severityCounts[severity]++;
            if (issue.autoFix === false) manualReviewCount++;

            span.classList.remove('highlight--error', 'highlight--warning', 'highlight--info', 'highlight--manual');
            span.classList.add(`highlight--${severity}`);
            if (issue.autoFix === false) span.classList.add('highlight--manual');
            span.dataset.severity = severity;
            span.dataset.category = issue.category || '表記統一';
            span.dataset.autoFix = issue.autoFix === false ? 'false' : 'true';
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
}
