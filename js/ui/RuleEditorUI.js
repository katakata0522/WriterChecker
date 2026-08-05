import {
    normalizeRegexFlags,
    normalizeRuleV3,
    SAFE_REGEX_TEMPLATES,
    validateRegexSafety,
    VALID_SEVERITIES
} from '../RuleSchema.js';
import { byId, SEVERITY_LABELS } from './UIShared.js';

function cloneRule(rule) {
    return { ...rule, excludeScopes: Array.isArray(rule?.excludeScopes) ? [...rule.excludeScopes] : [] };
}

function cloneRules(rules) {
    return Array.isArray(rules) ? rules.map(cloneRule) : [];
}

function editableRule(rawRule, index) {
    const normalized = normalizeRuleV3(rawRule);
    if (normalized) return normalized;
    return {
        schemaVersion: 3,
        id: rawRule?.id || `draft-rule-${index + 1}`,
        target: typeof rawRule?.target === 'string' ? rawRule.target : '',
        replacement: typeof rawRule?.replacement === 'string' ? rawRule.replacement : '',
        severity: VALID_SEVERITIES.includes(rawRule?.severity) ? rawRule.severity : 'warning',
        category: typeof rawRule?.category === 'string' ? rawRule.category : '表記統一',
        reason: typeof rawRule?.reason === 'string' ? rawRule.reason : '',
        badExample: typeof rawRule?.badExample === 'string' ? rawRule.badExample : '',
        goodExample: typeof rawRule?.goodExample === 'string' ? rawRule.goodExample : '',
        excludeScopes: Array.isArray(rawRule?.excludeScopes) ? [...rawRule.excludeScopes] : ['url', 'email', 'code'],
        autoFix: rawRule?.autoFix !== false,
        enabled: rawRule?.enabled !== false,
        isRegex: rawRule?.isRegex === true,
        flags: normalizeRegexFlags(rawRule?.flags)
    };
}

function duplicateKey(rule) {
    return `${rule.isRegex ? 'r' : 'l'}:${rule.target}:${rule.isRegex ? normalizeRegexFlags(rule.flags) : ''}`;
}

export const RuleEditorMethods = {
_bindRuleEditorEvents() {
        this.editRulesBtn?.addEventListener('click', () => this._openRuleEditor());
        this.closeModalBtn?.addEventListener('click', () => this._closeRuleModal());
        this.ruleModal?.addEventListener('click', (event) => {
            if (event.target === this.ruleModal) this._closeRuleModal();
        });
        this.addRuleBtn?.addEventListener('click', () => {
            this._captureRuleDraftFromUI();
            this._ensureRuleDraft().push(normalizeRuleV3({ target: '新しい表記', replacement: '推奨表記' }));
            this.renderRulesList();
            this._markRulesDirty();
            queueMicrotask(() => this.rulesList.querySelector('.rule-item:last-child .rule-target')?.focus());
        });
        this.saveRulesBtn?.addEventListener('click', () => {
            if (!this._saveRulesFromUI()) return;
            this._finishRuleModalClose();
            this.analyzeText();
            this._showToast('ルールを保存しました');
        });
        this.ruleSearchInput?.addEventListener('input', (event) => this._filterRulesList(event.target.value));
        this.regexTemplateBtn?.addEventListener('click', () => this._showRegexTemplates());
        this.rulesList?.addEventListener('input', () => this._markRulesDirty());
        this.rulesList?.addEventListener('change', () => this._markRulesDirty());
    },

_openRuleEditor() {
        this._ruleDraft = cloneRules(this.rules);
        this._hasUnsavedEdits = false;
        this._updateSaveStateStatus();
        this._ruleModalReturnFocus = typeof document !== 'undefined' ? document.activeElement : null;
        if (this.ruleSearchInput) this.ruleSearchInput.value = '';
        this.renderRulesList();
        this._closeSidePanel(false);
        this.ruleModal.classList.remove('hidden');
        queueMicrotask(() => this.ruleSearchInput?.focus());
    },

_ensureRuleDraft() {
        if (!Array.isArray(this._ruleDraft)) this._ruleDraft = cloneRules(this.rules);
        return this._ruleDraft;
    },

renderRulesList() {
        if (!this.rulesList) return;
        const editableRules = Array.isArray(this._ruleDraft) ? this._ruleDraft : this.rules;
        this.rulesList.innerHTML = '';
        editableRules.forEach((rawRule, index) => {
            const rule = editableRule(rawRule, index);
            editableRules[index] = rule;
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
            enabled.setAttribute('aria-label', `${index + 1}件目のルールを有効にする`);

            const target = document.createElement('input');
            target.type = 'text';
            target.className = 'rule-input rule-target';
            target.value = rule.target;
            target.placeholder = '検出する表記';
            target.setAttribute('aria-label', `${index + 1}件目の検出する表記`);

            const arrow = document.createElement('span');
            arrow.className = 'rule-arrow';
            arrow.textContent = '→';
            arrow.setAttribute('aria-hidden', 'true');

            const replacement = document.createElement('input');
            replacement.type = 'text';
            replacement.className = 'rule-input rule-replacement';
            replacement.value = rule.replacement;
            replacement.placeholder = '推奨表記（空欄は削除）';
            replacement.setAttribute('aria-label', `${index + 1}件目の推奨表記`);

            const severity = document.createElement('select');
            severity.className = 'rule-severity';
            severity.setAttribute('aria-label', `${index + 1}件目の重大度`);
            for (const value of VALID_SEVERITIES) {
                const option = document.createElement('option');
                option.value = value;
                option.textContent = SEVERITY_LABELS[value];
                option.selected = rule.severity === value;
                severity.appendChild(option);
            }

            const orderControls = document.createElement('div');
            orderControls.className = 'rule-order-controls';
            orderControls.append(
                this._createMoveRuleButton(index, -1, editableRules.length),
                this._createMoveRuleButton(index, 1, editableRules.length)
            );

            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'btn-remove-rule';
            remove.title = 'このルールを削除';
            remove.setAttribute('aria-label', `${index + 1}件目のルールを削除`);
            remove.innerHTML = '<i class="fa-solid fa-trash" aria-hidden="true"></i>';
            remove.addEventListener('click', () => {
                if (rule.readOnly) return;
                this._captureRuleDraftFromUI();
                this._ensureRuleDraft().splice(index, 1);
                this.renderRulesList();
                this._markRulesDirty();
            });

            main.append(enabled, target, arrow, replacement, severity, orderControls, remove);

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
        this._filterRulesList(this.ruleSearchInput?.value || '');
    },

_createMoveRuleButton(index, delta, total) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `btn-rule-move btn-rule-move--${delta < 0 ? 'up' : 'down'}`;
        button.disabled = index + delta < 0 || index + delta >= total;
        button.title = delta < 0 ? '上へ移動' : '下へ移動';
        button.setAttribute('aria-label', `${index + 1}件目のルールを${delta < 0 ? '上' : '下'}へ移動`);
        button.innerHTML = `<i class="fa-solid fa-chevron-${delta < 0 ? 'up' : 'down'}" aria-hidden="true"></i>`;
        button.addEventListener('click', () => {
            this._captureRuleDraftFromUI();
            const draft = this._ensureRuleDraft();
            const nextIndex = index + delta;
            [draft[index], draft[nextIndex]] = [draft[nextIndex], draft[index]];
            this.renderRulesList();
            this._markRulesDirty();
            queueMicrotask(() => this.rulesList.querySelector(`[data-rule-index="${nextIndex}"] .rule-target`)?.focus());
        });
        return button;
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

_collectRulesFromUI({ validate = true } = {}) {
        const sourceRules = Array.isArray(this._ruleDraft) ? this._ruleDraft : this.rules;
        const nextRules = [];
        const duplicateKeys = new Set();

        for (const item of this.rulesList.querySelectorAll('.rule-item')) {
            const previous = sourceRules[Number(item.dataset.ruleIndex)] || {};
            if (previous.readOnly) {
                nextRules.push(previous);
                continue;
            }
            const target = item.querySelector('.rule-target').value;
            const isRegex = item.querySelector('.rule-is-regex').checked;
            const rawCandidate = {
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
            };

            if (!target) {
                if (!validate) {
                    nextRules.push(rawCandidate);
                    continue;
                }
                this._showToast('検出する表記を入力するか、不要な行を削除してください', 'fa-triangle-exclamation');
                item.querySelector('.rule-target').focus();
                return null;
            }

            const candidate = normalizeRuleV3(rawCandidate);
            if (validate && isRegex) {
                const safety = validateRegexSafety(target);
                if (!safety.safe) {
                    this._showToast(safety.reason, 'fa-triangle-exclamation');
                    item.querySelector('.rule-target').focus();
                    return null;
                }
                try {
                    new RegExp(target, normalizeRegexFlags(candidate.flags));
                } catch {
                    this._showToast(`正規表現「${target}」が無効です`, 'fa-triangle-exclamation');
                    item.querySelector('.rule-target').focus();
                    return null;
                }
            }

            if (validate) {
                const key = duplicateKey(candidate);
                if (duplicateKeys.has(key)) {
                    this._showToast(`同じ検出条件「${target}」が重複しています`, 'fa-triangle-exclamation');
                    item.querySelector('.rule-target').focus();
                    return null;
                }
                duplicateKeys.add(key);
            }
            nextRules.push(candidate);
        }
        return nextRules;
    },

_captureRuleDraftFromUI() {
        if (!this.rulesList?.querySelector('.rule-item')) return;
        const draft = this._collectRulesFromUI({ validate: false });
        if (draft) this._ruleDraft = draft;
    },

_saveRulesFromUI() {
        const nextRules = this._collectRulesFromUI({ validate: true });
        if (!nextRules) return false;
        this.rules = nextRules;
        this.allRuleSets[this.activeSetName] = nextRules;
        this.ruleEngine.setRules(nextRules);
        this.storageManager.saveAllRuleSets(this.allRuleSets);
        this._ruleDraft = null;
        this._hasUnsavedEdits = false;
        this._updateSaveStateStatus();
        this.populateRuleSetSelector();
        return true;
    },

_filterRulesList(query) {
        const normalized = String(query || '').toLowerCase();
        let visible = 0;
        const items = [...this.rulesList.querySelectorAll('.rule-item')];
        items.forEach((item) => {
            const searchable = [...item.querySelectorAll('input,select')]
                .map((field) => field.value || field.options?.[field.selectedIndex]?.text || '')
                .join(' ')
                .toLowerCase();
            item.hidden = !searchable.includes(normalized);
            if (!item.hidden) visible++;
        });
        if (this.ruleSearchStatus) {
            this.ruleSearchStatus.textContent = normalized ? `${visible}/${items.length}件を表示` : `${items.length}件`;
        }
    },

_showRegexTemplates() {
        const existing = byId('safeTemplateModal');
        if (existing) existing.remove();
        const trigger = typeof document !== 'undefined' ? document.activeElement : null;
        const modal = document.createElement('div');
        modal.id = 'safeTemplateModal';
        modal.className = 'modal';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-labelledby', 'safeTemplateTitle');
        const content = document.createElement('div');
        content.className = 'modal-content modal-content-sm';
        content.innerHTML = `
            <div class="modal-header"><h2 id="safeTemplateTitle"><i class="fa-solid fa-shield-halved" aria-hidden="true"></i> 安全テンプレート</h2><button class="btn-close" type="button" aria-label="閉じる"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button></div>
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
        const close = () => {
            modal.remove();
            trigger?.focus?.();
        };
        content.querySelector('.btn-close').addEventListener('click', close);
        content.querySelector('[data-cancel]').addEventListener('click', close);
        modal.addEventListener('click', (event) => { if (event.target === modal) close(); });
        modal.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                close();
            }
        });
        content.querySelector('[data-add]').addEventListener('click', () => {
            const selected = new Set([...list.querySelectorAll('input:checked')].map((input) => input.value));
            this._captureRuleDraftFromUI();
            const draft = this._ensureRuleDraft();
            const existingKeys = new Set(draft.filter((rule) => rule?.target).map(duplicateKey));
            const additions = SAFE_REGEX_TEMPLATES
                .filter((template) => selected.has(template.id))
                .map((template) => normalizeRuleV3(template.rule))
                .filter((rule) => !existingKeys.has(duplicateKey(rule)));
            if (!selected.size) {
                this._showToast('追加するテンプレートを選択してください', 'fa-circle-info');
                return;
            }
            if (!additions.length) {
                this._showToast('選択したテンプレートはすでに追加されています', 'fa-circle-info');
                return;
            }
            draft.push(...additions);
            this.renderRulesList();
            this._markRulesDirty();
            close();
            this._showToast(`${additions.length}件の安全テンプレートを追加しました`);
        });
        queueMicrotask(() => list.querySelector('input')?.focus());
    },

_markRulesDirty() {
        this._hasUnsavedEdits = true;
        this._updateSaveStateStatus();
    },

_updateSaveStateStatus() {
        if (this.saveStateStatus) this.saveStateStatus.textContent = this._hasUnsavedEdits ? '未保存' : '保存済み';
    },

_discardRuleDraft() {
        this._ruleDraft = null;
        this._hasUnsavedEdits = false;
        this._updateSaveStateStatus();
        this.renderRulesList();
    },

_finishRuleModalClose() {
        this.ruleModal.classList.add('hidden');
        const returnFocus = this._ruleModalReturnFocus;
        this._ruleModalReturnFocus = null;
        returnFocus?.focus?.();
    },

_closeRuleModal() {
        if (!this._hasUnsavedEdits) {
            this._ruleDraft = null;
            this._finishRuleModalClose();
            return;
        }
        this._showConfirm('保存していない変更を破棄して閉じますか？', () => {
            this._discardRuleDraft();
            this._finishRuleModalClose();
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
