function cloneRules(rules) {
    return Array.isArray(rules)
        ? rules.map((rule) => ({ ...rule, excludeScopes: Array.isArray(rule.excludeScopes) ? [...rule.excludeScopes] : [] }))
        : [];
}

export const RuleSetMethods = {
_bindRuleSetEvents() {
        this.ruleSetSelector?.addEventListener('change', (event) => {
            const nextName = event.target.value;
            const switchSet = () => {
                this._discardRuleDraft?.();
                if (this.ruleModal && !this.ruleModal.classList.contains('hidden')) this._finishRuleModalClose?.();
                this.activeSetName = nextName;
                this._syncActiveRules();
                this.storageManager.saveActiveSetName(nextName);
                this.ruleSetSelector.value = nextName;
                this._hasUnsavedEdits = false;
                this._updateSaveStateStatus();
                this.renderRulesList();
                this.analyzeText();
                this._track('ruleset_changed', { ruleset_name: nextName, ruleset_count: this.rules.length });
            };

            if (!this._hasUnsavedEdits) {
                switchSet();
                return;
            }
            this.ruleSetSelector.value = this.activeSetName;
            this._showConfirm(
                '保存していないルール編集があります。破棄してルールセットを切り替えますか？',
                switchSet,
                { okText: '破棄して切り替える', danger: true }
            );
        });

        this.addRuleSetBtn?.addEventListener('click', () => {
            this._nameModalReturnFocus = typeof document !== 'undefined' ? document.activeElement : null;
            this.newRuleSetNameInput.value = '';
            this.nameModalError.classList.add('hidden');
            this.nameModal.classList.remove('hidden');
            queueMicrotask(() => this.newRuleSetNameInput.focus());
        });
        this.duplicateRuleSetBtn?.addEventListener('click', () => this._duplicateActiveRuleSet());
        this.closeNameModalBtn?.addEventListener('click', () => this._closeNameModal());
        this.nameModal?.addEventListener('click', (event) => {
            if (event.target === this.nameModal) this._closeNameModal();
        });
        this.newRuleSetNameInput?.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                this.confirmNameBtn.click();
            }
        });
        this.confirmNameBtn?.addEventListener('click', () => {
            const name = this.newRuleSetNameInput.value.trim();
            if (!this._isSafeRuleSetName(name)) {
                this.nameModalError.textContent = '1〜120文字の名前を入力してください。';
                this.nameModalError.classList.remove('hidden');
                return;
            }
            if (Object.hasOwn(this.allRuleSets, name)) {
                this.nameModalError.textContent = '同じ名前のルールセットが存在します。';
                this.nameModalError.classList.remove('hidden');
                return;
            }
            this._createRuleSet(name);
            this._closeNameModal();
            this._showToast(`「${name}」を作成しました`);
        });

        this.deleteRuleSetBtn?.addEventListener('click', () => {
            if (Object.keys(this.allRuleSets).length <= 1) {
                this._showToast('最後のルールセットは削除できません', 'fa-triangle-exclamation');
                return;
            }
            const deleting = this.activeSetName;
            this._showConfirm(
                `ルールセット「${deleting}」を削除します。\nこの操作は元に戻せません。`,
                () => {
                    delete this.allRuleSets[deleting];
                    this.activeSetName = Object.keys(this.allRuleSets)[0];
                    this._syncActiveRules();
                    this.storageManager.saveAllRuleSets(this.allRuleSets);
                    this.storageManager.saveActiveSetName(this.activeSetName);
                    this.populateRuleSetSelector();
                    this.renderRulesList();
                    this.analyzeText();
                    this._showToast('ルールセットを削除しました');
                },
                { okText: '削除する', danger: true }
            );
        });
    },

_closeNameModal() {
        this.nameModal?.classList.add('hidden');
        const returnFocus = this._nameModalReturnFocus;
        this._nameModalReturnFocus = null;
        returnFocus?.focus?.();
    },

populateRuleSetSelector() {
        if (!this.ruleSetSelector) return;
        this.ruleSetSelector.innerHTML = '';
        for (const [name, rules] of Object.entries(this.allRuleSets)) {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = `${name} (${rules.length})`;
            option.selected = name === this.activeSetName;
            this.ruleSetSelector.appendChild(option);
        }
        if (this.deleteRuleSetBtn) this.deleteRuleSetBtn.disabled = Object.keys(this.allRuleSets).length <= 1;
    },

_createRuleSet(name) {
        if (!this._isSafeRuleSetName(name) || Object.hasOwn(this.allRuleSets, name)) return false;
        this.allRuleSets[name] = [];
        this.activeSetName = name;
        this._syncActiveRules();
        this.storageManager.saveAllRuleSets(this.allRuleSets);
        this.storageManager.saveActiveSetName(name);
        this.populateRuleSetSelector();
        this.renderRulesList();
        this.analyzeText();
        return true;
    },

_duplicateActiveRuleSet() {
        const originalName = this.activeSetName;
        const suffix = ' のコピー';
        const baseName = `${originalName.slice(0, Math.max(1, 120 - suffix.length))}${suffix}`;
        let name = baseName;
        let number = 2;
        while (Object.hasOwn(this.allRuleSets, name)) {
            const numberedSuffix = ` のコピー ${number++}`;
            name = `${originalName.slice(0, Math.max(1, 120 - numberedSuffix.length))}${numberedSuffix}`;
        }
        this.allRuleSets[name] = cloneRules(this.rules);
        this.activeSetName = name;
        this._syncActiveRules();
        this.storageManager.saveAllRuleSets(this.allRuleSets);
        this.storageManager.saveActiveSetName(name);
        this.populateRuleSetSelector();
        this.renderRulesList();
        this.analyzeText();
        this._closeSidePanel(false);
        this.ruleSetSelector?.focus?.();
        this._showToast(`「${originalName}」を複製しました`, 'fa-copy');
        return name;
    },

_isSafeRuleSetName(name) {
        return typeof name === 'string'
            && name.trim().length > 0
            && name.length <= 120
            && !['__proto__', 'constructor', 'prototype'].includes(name);
    },

_syncActiveRules() {
        if (!Object.hasOwn(this.allRuleSets, this.activeSetName)) {
            this.activeSetName = Object.keys(this.allRuleSets)[0];
            this.storageManager?.saveActiveSetName?.(this.activeSetName);
        }
        this.rules = this.allRuleSets[this.activeSetName] || [];
        this.ruleEngine.setRules(this.rules);
    }
};
