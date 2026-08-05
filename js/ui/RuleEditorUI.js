import { normalizeRuleV3, SAFE_REGEX_TEMPLATES, VALID_SEVERITIES } from '../RuleSchema.js';
import { byId, SEVERITY_LABELS } from './UIShared.js';

export const RuleEditorMethods = {
_bindRuleEditorEvents() {
        this.editRulesBtn?.addEventListener('click', () => {
            this.renderRulesList();
            this._closeSidePanel();
            this.ruleModal.classList.remove('hidden');
            this.ruleSearchInput.value = '';
        });
        this.closeModalBtn?.addEventListener('click', () => this._closeRuleModal());
        this.ruleModal?.addEventListener('click', (event) => {
            if (event.target === this.ruleModal) this._closeRuleModal();
        });
        this.addRuleBtn?.addEventListener('click', () => {
            this.rules.push(normalizeRuleV3({ target: '新しい表記', replacement: '推奨表記' }));
            this.renderRulesList();
            this._markRulesDirty();
            this.rulesList.querySelector('.rule-item:last-child .rule-target')?.focus();
        });
        this.saveRulesBtn?.addEventListener('click', () => {
            if (!this._saveRulesFromUI()) return;
            this.ruleModal.classList.add('hidden');
            this.analyzeText();
            this._showToast('ルールを保存しました');
        });
        this.ruleSearchInput?.addEventListener('input', (event) => this._filterRulesList(event.target.value));
        this.regexTemplateBtn?.addEventListener('click', () => this._showRegexTemplates());
        this.rulesList?.addEventListener('input', () => this._markRulesDirty());
        this.rulesList?.addEventListener('change', () => this._markRulesDirty());
    },

renderRulesList() {
        if (!this.rulesList) return;
        this.rulesList.innerHTML = '';
        this.rules.forEach((rawRule, index) => {
            const rule = normalizeRuleV3(rawRule);
            this.rules[index] = rule;
            const item = document.createElement('article');
            item.className = `rule-item${rule.enabled ? '' : ' rule-item--disabled'}`;
            item.dataset.ruleIndex = String(index);
            item.dataset.ruleId = rule.id;

            const main = document.createElement('div');
            main.className = 'rule-item-main';

            const enabled = document.createElement('input');
            enabled.type = 'checkbox';
            enabled.className = 'rule-enabled-checkbox';
            enabled.checked = rule.enabled;
            enabled.title = 'このルールを有効にする';

            const target = document.createElement('input');
            target.type = 'text';
            target.className = 'rule-input rule-target';
            target.value = rule.target;
            target.placeholder = '検出する表記';

            const arrow = document.createElement('span');
            arrow.className = 'rule-arrow';
            arrow.textContent = '→';

            const replacement = document.createElement('input');
            replacement.type = 'text';
            replacement.className = 'rule-input rule-replacement';
            replacement.value = rule.replacement;
            replacement.placeholder = '推奨表記（空欄は削除）';

            const severity = document.createElement('select');
            severity.className = 'rule-severity';
            severity.setAttribute('aria-label', '重大度');
            for (const value of VALID_SEVERITIES) {
                const option = document.createElement('option');
                option.value = value;
                option.textContent = SEVERITY_LABELS[value];
                option.selected = rule.severity === value;
                severity.appendChild(option);
            }

            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'btn-remove-rule';
            remove.title = 'このルールを削除';
            remove.innerHTML = '<i class="fa-solid fa-trash"></i>';
            remove.addEventListener('click', () => {
                if (rule.readOnly) return;
                this.rules.splice(index, 1);
                this.renderRulesList();
                this._markRulesDirty();
            });

            main.append(enabled, target, arrow, replacement, severity, remove);

            const advanced = document.createElement('details');
            advanced.className = 'rule-advanced';
            const summary = document.createElement('summary');
            summary.textContent = '詳細設定';
            advanced.appendChild(summary);

            const grid = document.createElement('div');
            grid.className = 'rule-advanced-grid';
            grid.append(
                this._labeledInput('カテゴリ', 'rule-category', rule.category),
                this._labeledInput('指摘理由', 'rule-reason', rule.reason),
                this._labeledInput('避けたい例', 'rule-bad-example', rule.badExample || ''),
                this._labeledInput('推奨例', 'rule-good-example', rule.goodExample || '')
            );

            const policy = document.createElement('div');
            policy.className = 'rule-policy-row';
            policy.append(
                this._checkbox('自動修正を許可', 'rule-auto-fix', rule.autoFix),
                this._checkbox('正規表現', 'rule-is-regex', rule.isRegex === true),
                ...['url', 'email', 'code'].map((scope) =>
                    this._checkbox(`${scope === 'url' ? 'URL' : scope === 'email' ? 'メール' : 'コード'}を除外`, 'rule-exclude-scope', rule.excludeScopes.includes(scope), scope)
                )
            );
            advanced.append(grid, policy);
            item.append(main, advanced);

            if (rule.readOnly) {
                item.classList.add('rule-item--readonly');
                item.querySelectorAll('input,select,button').forEach((control) => { control.disabled = true; });
            }
            this.rulesList.appendChild(item);
        });
    },

_labeledInput(labelText, className, value) {
        const label = document.createElement('label');
        label.className = 'rule-field';
        const caption = document.createElement('span');
        caption.textContent = labelText;
        const input = document.createElement('input');
        input.type = 'text';
        input.className = className;
        input.value = value;
        label.append(caption, input);
        return label;
    },

_checkbox(labelText, className, checked, scope = '') {
        const label = document.createElement('label');
        label.className = 'rule-checkbox';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.className = className;
        input.checked = checked;
        if (scope) input.dataset.scope = scope;
        label.append(input, document.createTextNode(labelText));
        return label;
    },

_saveRulesFromUI() {
        const nextRules = [];
        const duplicateKeys = new Set();
        for (const item of this.rulesList.querySelectorAll('.rule-item')) {
            const previous = this.rules[Number(item.dataset.ruleIndex)] || {};
            if (previous.readOnly) {
                nextRules.push(previous);
                continue;
            }
            const target = item.querySelector('.rule-target').value;
            if (!target) continue;
            const isRegex = item.querySelector('.rule-is-regex').checked;
            const candidate = normalizeRuleV3({
                ...previous,
                target,
                replacement: item.querySelector('.rule-replacement').value,
                enabled: item.querySelector('.rule-enabled-checkbox').checked,
                severity: item.querySelector('.rule-severity').value,
                category: item.querySelector('.rule-category').value,
                reason: item.querySelector('.rule-reason').value,
                badExample: item.querySelector('.rule-bad-example').value,
                goodExample: item.querySelector('.rule-good-example').value,
                autoFix: item.querySelector('.rule-auto-fix').checked,
                isRegex,
                excludeScopes: [...item.querySelectorAll('.rule-exclude-scope:checked')].map((box) => box.dataset.scope)
            });
            if (isRegex && !this.ruleEngine._buildRegex(candidate)) {
                this._showToast(`正規表現「${target}」が無効です`, 'fa-triangle-exclamation');
                item.querySelector('.rule-target').focus();
                return false;
            }
            const duplicateKey = `${candidate.isRegex ? 'r' : 'l'}:${candidate.target}`;
            if (duplicateKeys.has(duplicateKey)) {
                this._showToast(`同じ検出条件「${target}」が重複しています`, 'fa-triangle-exclamation');
                item.querySelector('.rule-target').focus();
                return false;
            }
            duplicateKeys.add(duplicateKey);
            nextRules.push(candidate);
        }

        this.rules = nextRules;
        this.allRuleSets[this.activeSetName] = nextRules;
        this.ruleEngine.setRules(nextRules);
        this.storageManager.saveAllRuleSets(this.allRuleSets);
        this._hasUnsavedEdits = false;
        this._updateSaveStateStatus();
        this.populateRuleSetSelector();
        return true;
    },

_filterRulesList(query) {
        const normalized = String(query || '').toLowerCase();
        this.rulesList.querySelectorAll('.rule-item').forEach((item) => {
            const searchable = [...item.querySelectorAll('input,select')]
                .map((field) => field.value || field.options?.[field.selectedIndex]?.text || '')
                .join(' ')
                .toLowerCase();
            item.hidden = !searchable.includes(normalized);
        });
    },

_showRegexTemplates() {
        const existing = byId('safeTemplateModal');
        if (existing) existing.remove();
        const modal = document.createElement('div');
        modal.id = 'safeTemplateModal';
        modal.className = 'modal';
        const content = document.createElement('div');
        content.className = 'modal-content modal-content-sm';
        content.innerHTML = `
            <div class="modal-header"><h2><i class="fa-solid fa-shield-halved"></i> 安全テンプレート</h2><button class="btn-close" type="button"><i class="fa-solid fa-xmark"></i></button></div>
            <div class="modal-body"><p class="template-help">必要なものだけ選んで追加します。文字を削除するだけの危険な検出テンプレートは含めていません。</p><div class="safe-template-list"></div></div>
            <div class="modal-footer modal-footer--compact"><button class="btn btn-sm btn-ghost" data-cancel type="button">キャンセル</button><button class="btn btn-sm btn-primary" data-add type="button">選択したルールを追加</button></div>`;
        modal.appendChild(content);
        document.body.appendChild(modal);
        const list = content.querySelector('.safe-template-list');
        for (const template of SAFE_REGEX_TEMPLATES) {
            const label = document.createElement('label');
            label.className = 'safe-template-item';
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.value = template.id;
            const text = document.createElement('span');
            const strong = document.createElement('strong');
            strong.textContent = template.label;
            const description = document.createElement('small');
            description.textContent = template.description;
            text.append(strong, description);
            label.append(input, text);
            list.appendChild(label);
        }
        const close = () => modal.remove();
        content.querySelector('.btn-close').addEventListener('click', close);
        content.querySelector('[data-cancel]').addEventListener('click', close);
        modal.addEventListener('click', (event) => { if (event.target === modal) close(); });
        content.querySelector('[data-add]').addEventListener('click', () => {
            const selected = new Set([...list.querySelectorAll('input:checked')].map((input) => input.value));
            const additions = SAFE_REGEX_TEMPLATES
                .filter((template) => selected.has(template.id))
                .map((template) => normalizeRuleV3(template.rule));
            if (!additions.length) {
                this._showToast('追加するテンプレートを選択してください', 'fa-circle-info');
                return;
            }
            this.rules.push(...additions);
            this.renderRulesList();
            this._markRulesDirty();
            close();
            this._showToast(`${additions.length}件の安全テンプレートを追加しました`);
        });
    },

_markRulesDirty() {
        this._hasUnsavedEdits = true;
        this._updateSaveStateStatus();
    },

_updateSaveStateStatus() {
        if (this.saveStateStatus) this.saveStateStatus.textContent = this._hasUnsavedEdits ? '未保存' : '保存済み';
    },

_closeRuleModal() {
        if (!this._hasUnsavedEdits) {
            this.ruleModal.classList.add('hidden');
            return;
        }
        this._showConfirm('保存していない変更を破棄して閉じますか？', () => {
            this._hasUnsavedEdits = false;
            this._updateSaveStateStatus();
            this.renderRulesList();
            this.ruleModal.classList.add('hidden');
        }, { okText: '破棄して閉じる', danger: true });
    },

_findRuleForHighlight(targetText, ruleIndex, ruleTarget = null) {
        if (Number.isInteger(ruleIndex) && ruleIndex >= 0 && ruleIndex < this.rules.length) {
            const candidate = this.rules[ruleIndex];
            if (typeof ruleTarget !== 'string' || candidate.target === ruleTarget) return candidate;
        }
        if (typeof ruleTarget === 'string') {
            const found = this.rules.find((rule) => rule.target === ruleTarget);
            if (found) return found;
        }
        return this.rules.find((rule) => rule.target === targetText);
    }
};
