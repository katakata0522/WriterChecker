export const FixActionsMethods = {
_handleHighlightClick(highlight) {
        if (highlight.dataset.autoFix !== 'true') {
            this._showToast('この指摘は文脈確認が必要なため自動修正しません', 'fa-circle-info');
            return;
        }
        const start = Number(highlight.dataset.start);
        const end = Number(highlight.dataset.end);
        const replacement = highlight.dataset.replacement ?? '';
        const before = this.sourceText.value.slice(start, end);
        this._showConfirm(
            `「${before}」を「${replacement || '（削除）'}」へ修正しますか？`,
            () => this._applyIndividualFix(before, replacement, 0, { start, end }),
            { okText: '修正する' }
        );
    },

_applyIndividualFix(targetText, replacementText, occurrenceIndex, options = {}) {
        const source = this.sourceText.value;
        if (Number.isInteger(options.start) && Number.isInteger(options.end)) {
            this._replaceTextareaContent(
                source.slice(0, options.start) + (replacementText ?? '') + source.slice(options.end)
            );
            this.analyzeText();
            return;
        }
        const ruleIndex = Number.isInteger(options.ruleIndex) ? options.ruleIndex : null;
        const rule = ruleIndex !== null ? this.rules[ruleIndex] : null;
        if (rule?.autoFix === false) return;
        const lookupText = options.matchedText || targetText;
        if (!lookupText) return;
        let found = -1;
        let cursor = 0;
        for (let index = 0; index <= occurrenceIndex; index++) {
            found = source.indexOf(lookupText, cursor);
            if (found < 0) return;
            cursor = found + lookupText.length;
        }
        let replacement = replacementText ?? '';
        if (rule?.isRegex) {
            const regex = this.ruleEngine._buildRegex(rule);
            if (regex) replacement = lookupText.replace(regex, rule.replacement);
        }
        this._replaceTextareaContent(source.slice(0, found) + replacement + source.slice(found + lookupText.length));
        this.analyzeText();
    },

_confirmDisableRule(ruleIndex) {
        const rule = this.rules[ruleIndex];
        if (!rule || rule.readOnly) return;
        this._showConfirm(
            `「${rule.target}」のルールを、この文章だけでなく現在のルールセット全体で無効化しますか？`,
            () => {
                rule.enabled = false;
                this.allRuleSets[this.activeSetName] = this.rules;
                this.ruleEngine.setRules(this.rules);
                this.storageManager.saveAllRuleSets(this.allRuleSets);
                this.analyzeText();
                this._showToast('ルールを無効化しました', 'fa-eye-slash');
            },
            { okText: '無効化する', danger: true }
        );
    },

_createFixPlan(text) {
        // ルール変更直後でも古い解析結果を再利用せず、常に現在のルールから計画を作る。
        return this.ruleEngine.createFixPlan(text);
    },

_generateChangeReport(originalText) {
        return this._createFixPlan(originalText).tokens
            .filter((token) => token.type === 'highlight' && token.ruleMeta?.autoFix !== false && token.replacement !== token.content)
            .map((token) => ({
                from: token.content,
                to: token.replacement || '（削除）',
                severity: token.ruleMeta?.severity || 'warning',
                category: token.ruleMeta?.category || '表記統一'
            }));
    },

_replaceAllAutoFixable() {
        const original = this.sourceText.value;
        if (!original) {
            this._showToast('文章を入力してください', 'fa-circle-info');
            return;
        }
        const plan = this._createFixPlan(original);
        if (plan.cleanedText === original || plan.autoFixCount === 0) {
            const note = plan.manualCount ? `要判断の指摘が${plan.manualCount}件あります` : '自動修正できる箇所はありません';
            this._showToast(note, 'fa-circle-info');
            return;
        }
        this._replaceTextareaContent(plan.cleanedText);
        this.analyzeText();
        const manualNote = plan.manualCount ? ` 要判断${plan.manualCount}件は未修正です。` : '';
        this._showToast(`${plan.autoFixCount}か所を修正しました。${manualNote}元に戻せます。`, 'fa-wand-magic-sparkles');
    },

_insertSampleText() {
        this._replaceTextareaContent('このサービスはＷＥＢ上で出来ます。\n詳しい内容を確認して下さい。\n\nhttps://example.com/出来る はURL内なので除外されます。');
        this.analyzeText();
    },

_pushUndo(value) {
        const snapshot = String(value ?? '');
        if (this._undoStack[this._undoStack.length - 1] === snapshot) return;
        this._undoStack.push(snapshot);
        if (this._undoStack.length > 20) this._undoStack.shift();
        if (this.undoBtn) this.undoBtn.hidden = false;
    },

_replaceTextareaContent(newText, skipUndo = false) {
        const current = String(this.sourceText.value ?? '');
        const next = String(newText ?? '');
        if (current === next) return false;
        if (!skipUndo) this._pushUndo(current);
        this.sourceText.value = next;
        this.sourceText.focus?.();
        this._updateActionAvailability?.(next, null);
        return true;
    },

_undo() {
        const previous = this._undoStack.pop();
        if (previous === undefined) return;
        this._replaceTextareaContent(previous, true);
        this.analyzeText();
        this._showToast('元に戻しました', 'fa-rotate-left');
        if (!this._undoStack.length && this.undoBtn) this.undoBtn.hidden = true;
    },

_fallbackCopy(text, successMessage = '修正結果をコピーしました') {
        const area = document.createElement('textarea');
        area.value = text;
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.select();
        try {
            document.execCommand('copy');
            this._showToast(successMessage);
        } catch {
            this._showToast('コピーできませんでした', 'fa-triangle-exclamation');
        }
        area.remove();
    },

async _copyCleanedText() {
        const source = this.sourceText.value;
        if (!source) {
            this._showToast('コピーする文章がありません', 'fa-circle-info');
            return;
        }
        const plan = this._createFixPlan(source);
        const successMessage = plan.manualCount
            ? `修正結果をコピーしました（要判断${plan.manualCount}件は未修正）`
            : '修正結果をコピーしました';
        try {
            await navigator.clipboard.writeText(plan.cleanedText);
            this._showToast(successMessage);
            this._track('result_copied', {
                text_length: plan.cleanedText.length,
                auto_fix_count: plan.autoFixCount,
                manual_review_count: plan.manualCount
            });
        } catch {
            this._fallbackCopy(plan.cleanedText, successMessage);
        }
    }
};
