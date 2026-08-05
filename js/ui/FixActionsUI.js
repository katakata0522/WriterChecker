export const FixActionsMethods = {
_handleHighlightClick(highlight) {
        if (highlight.dataset.autoFix !== 'true') {
            this._showToast('この指摘は文脈確認が必要なため自動修正しません', 'fa-circle-info');
            return;
        }
        const start = Number(highlight.dataset.start);
        const end = Number(highlight.dataset.end);
        const replacement = highlight.dataset.replacement || '';
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
                source.slice(0, options.start) + (replacementText || '') + source.slice(options.end)
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
        let replacement = replacementText || '';
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

_generateChangeReport(originalText) {
        return this.ruleEngine.tokenize(originalText)
            .filter((token) => token.type === 'highlight' && token.ruleMeta?.autoFix !== false)
            .map((token) => ({
                from: token.content,
                to: token.replacement || '（削除）',
                severity: token.ruleMeta?.severity || 'warning',
                category: token.ruleMeta?.category || '表記統一'
            }));
    },

_replaceAllAutoFixable() {
        const original = this.sourceText.value;
        const changes = this._generateChangeReport(original);
        const cleaned = this.ruleEngine.getCleanedText(original);
        if (!original || cleaned === original) {
            this._showToast('自動修正できる箇所はありません', 'fa-circle-info');
            return;
        }
        this._replaceTextareaContent(cleaned);
        this.analyzeText();
        this._showToast(`${changes.length}か所を修正しました。元に戻すこともできます。`, 'fa-wand-magic-sparkles');
    },

_insertSampleText() {
        this._replaceTextareaContent('このサービスはＷＥＢ上で出来ます。\n詳しい内容を確認して下さい。\n\nhttps://example.com/出来る はURL内なので除外されます。');
        this.analyzeText();
    },

_pushUndo(value) {
        if (!value) return;
        this._undoStack.push(value);
        if (this._undoStack.length > 20) this._undoStack.shift();
        if (this.undoBtn) this.undoBtn.hidden = false;
    },

_replaceTextareaContent(newText, skipUndo = false) {
        if (!skipUndo && this.sourceText.value) this._pushUndo(this.sourceText.value);
        this.sourceText.value = String(newText ?? '');
        this.sourceText.focus?.();
    },

_undo() {
        const previous = this._undoStack.pop();
        if (previous === undefined) return;
        this._replaceTextareaContent(previous, true);
        this.analyzeText();
        this._showToast('元に戻しました', 'fa-rotate-left');
        if (!this._undoStack.length) this.undoBtn.hidden = true;
    },

_fallbackCopy(text) {
        const area = document.createElement('textarea');
        area.value = text;
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.select();
        try {
            document.execCommand('copy');
            this._showToast('修正結果をコピーしました');
        } catch {
            this._showToast('コピーできませんでした', 'fa-triangle-exclamation');
        }
        area.remove();
    },

async _copyCleanedText() {
        const cleaned = this.ruleEngine.getCleanedText(this.sourceText.value);
        if (!cleaned) {
            this._showToast('コピーする文章がありません', 'fa-circle-info');
            return;
        }
        try {
            await navigator.clipboard.writeText(cleaned);
            this._showToast('修正結果をコピーしました');
            this._track('result_copied', { text_length: cleaned.length });
        } catch {
            this._fallbackCopy(cleaned);
        }
    }
};
