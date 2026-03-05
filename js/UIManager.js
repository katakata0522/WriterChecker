/**
 * Writer Checker — UIManager
 * UIの初期化、イベントバインド、テキスト解析、ルール管理を担うメインクラス。
 */
export class UIManager {
    constructor(storageManager, ruleEngine) {
        this.storageManager = storageManager;
        this.ruleEngine = ruleEngine;

        // ルールセット読み込み
        this.allRuleSets = this.storageManager.loadAllRuleSets();
        this.activeSetName = this.storageManager.loadActiveSetName();
        if (!this.allRuleSets[this.activeSetName]) {
            this.activeSetName = Object.keys(this.allRuleSets)[0];
        }
        this.rules = this.allRuleSets[this.activeSetName];
        this.removeAsterisks = this.storageManager.loadAsteriskSetting();

        this.ruleEngine.setRules(this.rules);
        this.ruleEngine.setRemoveAsterisks(this.removeAsterisks);

        // 内部ステート
        this._analyzeDebounceTimer = null;
        this._toastTimer = null;
        this._confirmCallback = null;
        this._undoStack = [];
        this.highlightOnly = false; // F-13: 指摘のみモード

        this._cacheElements();
        this._bindEvents();

        // 初期表示
        this.populateRuleSetSelector();
        this.removeAsterisksCheckbox.checked = this.removeAsterisks;
        this.renderRulesList();
        this.renderRuleToggleList();
    }

    // =========================================================================
    //  DOM要素キャッシュ
    // =========================================================================

    _cacheElements() {
        // メインUI
        this.sourceText = document.getElementById('sourceText');
        this.resultOutput = document.getElementById('resultOutput');
        this.matchCountBadge = document.getElementById('matchCount');
        this.replaceBtn = document.getElementById('replaceBtn');
        this.clearBtn = document.getElementById('clearBtn');
        this.pasteBtn = document.getElementById('pasteBtn');
        this.copyBtn = document.getElementById('copyBtn');
        this.undoBtn = document.getElementById('undoBtn');

        // ルールセットセレクタ
        this.ruleSetSelector = document.getElementById('ruleSetSelector');
        this.addRuleSetBtn = document.getElementById('addRuleSetBtn');
        this.deleteRuleSetBtn = document.getElementById('deleteRuleSetBtn');
        this.presetTooltip = document.getElementById('presetTooltip'); // F-02

        // ルール編集モーダル
        this.ruleModal = document.getElementById('ruleModal');
        this.editRulesBtn = document.getElementById('editRulesBtn');
        this.closeModalBtn = document.getElementById('closeModalBtn');
        this.saveRulesBtn = document.getElementById('saveRulesBtn');
        this.rulesList = document.getElementById('rulesList');
        this.addRuleBtn = document.getElementById('addRuleBtn');
        this.removeAsterisksCheckbox = document.getElementById('removeAsterisks');
        this.highlightOnlyCheckbox = document.getElementById('highlightOnly'); // F-13
        this.ruleSearchInput = document.getElementById('ruleSearchInput'); // F-04

        // ルールセット名入力モーダル
        this.nameModal = document.getElementById('nameModal');
        this.closeNameModalBtn = document.getElementById('closeNameModalBtn');
        this.newRuleSetNameInput = document.getElementById('newRuleSetName');
        this.nameModalError = document.getElementById('nameModalError');
        this.confirmNameBtn = document.getElementById('confirmNameBtn');

        // インポート・エクスポート・共有
        this.exportRulesBtn = document.getElementById('exportRulesBtn');
        this.importRulesBtn = document.getElementById('importRulesBtn');
        this.importFileInput = document.getElementById('importFileInput');
        this.shareRulesBtn = document.getElementById('shareRulesBtn');

        // ステータスバー
        this.charCount = document.getElementById('charCount');
        this.charCountNoSpace = document.getElementById('charCountNoSpace');
        this.lineCount = document.getElementById('lineCount');
        this.manuscriptCount = document.getElementById('manuscriptCount');
        this.readTime = document.getElementById('readTime');
        this.kanjiRate = document.getElementById('kanjiRate');
        this.kanjiBarFill = document.getElementById('kanjiBarFill'); // F-11

        // トースト・確認モーダル
        this.toast = document.getElementById('toast');
        this.confirmModal = document.getElementById('confirmModal');
        this.closeConfirmModalBtn = document.getElementById('closeConfirmModalBtn');
        this.confirmModalMsg = document.getElementById('confirmModalMsg');
        this.confirmModalCancelBtn = document.getElementById('confirmModalCancelBtn');
        this.confirmModalOkBtn = document.getElementById('confirmModalOkBtn');
        this.exportReportBtn = document.getElementById('exportReportBtn'); // F-14
        this.regexTemplateBtn = document.getElementById('regexTemplateBtn'); // F-08

        // サイドパネル
        this.sidePanel = document.getElementById('sidePanel');
        this.sidePanelOverlay = document.getElementById('sidePanelOverlay');
        this.sidePanelToggle = document.getElementById('sidePanelToggle');
        this.sidePanelClose = document.getElementById('sidePanelClose');
        this.ruleToggleList = document.getElementById('ruleToggleList');
        this.ruleToggleCount = document.getElementById('ruleToggleCount');
    }

    // =========================================================================
    //  イベントバインド（サブメソッドに分割）
    // =========================================================================

    _bindEvents() {
        this._bindRuleSetEvents();
        this._bindImportExportEvents();
        this._bindEditorEvents();
        this._bindKeyboardEvents();
        this._bindDragDropEvents();
        this._bindExternalEvents();
        this._bindSidePanelEvents();
    }

    /** ルールセットの選択・作成・削除 */
    _bindRuleSetEvents() {
        this.ruleSetSelector.addEventListener('change', (e) => {
            this.activeSetName = e.target.value;
            this.rules = this.allRuleSets[this.activeSetName];
            this.ruleEngine.setRules(this.rules);
            this.storageManager.saveActiveSetName(this.activeSetName);
            this._updatePresetTooltip(); // F-02
            this._applyPresetAsterisk(); // F-07
            this.renderRuleToggleList(); // サイドパネル更新
            this.analyzeText();
        });

        // 新規作成モーダル
        this.addRuleSetBtn.addEventListener('click', () => {
            this.newRuleSetNameInput.value = '';
            this.nameModalError.classList.add('hidden');
            this.nameModal.classList.remove('hidden');
            setTimeout(() => this.newRuleSetNameInput.focus(), 100);
        });

        this.closeNameModalBtn.addEventListener('click', () => {
            this.nameModal.classList.add('hidden');
        });

        this.nameModal.addEventListener('click', (e) => {
            if (e.target === this.nameModal) this.nameModal.classList.add('hidden');
        });

        this.newRuleSetNameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.confirmNameBtn.click();
            }
        });

        this.confirmNameBtn.addEventListener('click', () => {
            const name = this.newRuleSetNameInput.value.trim();
            if (!name) {
                this.nameModalError.textContent = '名前を入力してください';
                this.nameModalError.classList.remove('hidden');
                return;
            }
            if (this.allRuleSets[name]) {
                this.nameModalError.textContent = 'その名前のルールセットは既に存在します';
                this.nameModalError.classList.remove('hidden');
                return;
            }

            this.allRuleSets[name] = [];
            this.activeSetName = name;
            this.rules = this.allRuleSets[this.activeSetName];
            this.storageManager.saveAllRuleSets(this.allRuleSets);
            this.storageManager.saveActiveSetName(this.activeSetName);
            this.ruleEngine.setRules(this.rules);
            this.populateRuleSetSelector();
            this.analyzeText();
            this.nameModal.classList.add('hidden');
            this._showToast(`「${name}」を作成しました`);
        });

        // 削除
        this.deleteRuleSetBtn.addEventListener('click', () => {
            if (Object.keys(this.allRuleSets).length <= 1) {
                this._showToast('最後のルールセットは削除できません', 'fa-triangle-exclamation');
                return;
            }
            this._showConfirm(
                `ルールセット「${this.activeSetName}」を削除してもよろしいですか？\nこの操作は元に戻せません。`,
                () => {
                    delete this.allRuleSets[this.activeSetName];
                    this.activeSetName = Object.keys(this.allRuleSets)[0];
                    this.rules = this.allRuleSets[this.activeSetName];
                    this.storageManager.saveAllRuleSets(this.allRuleSets);
                    this.storageManager.saveActiveSetName(this.activeSetName);
                    this.ruleEngine.setRules(this.rules);
                    this.populateRuleSetSelector();
                    this.analyzeText();
                    this._showToast('ルールセットを削除しました');
                }
            );
        });
    }

    /** インポート・エクスポート・共有 */
    _bindImportExportEvents() {
        this.exportRulesBtn.addEventListener('click', () => {
            const json = JSON.stringify(this.allRuleSets, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'writer-checker-rules.json';
            a.click();
            URL.revokeObjectURL(url);
            this._showToast('ルールをエクスポートしました');
        });

        this.shareRulesBtn.addEventListener('click', async () => {
            const link = this._generateShareLink();
            try {
                await navigator.clipboard.writeText(link);
                this._showToast('共有リンクをコピーしました！', 'fa-link');
            } catch {
                this._showToast('コピーに失敗しました', 'fa-triangle-exclamation');
            }
        });

        this.importRulesBtn.addEventListener('click', () => {
            this.importFileInput.click();
        });

        this.importFileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                this._processImportedJSON(event.target.result);
                this.importFileInput.value = '';
            };
            reader.readAsText(file);
        });
    }

    /** テキストエリア・結果パネル・ルール編集モーダル */
    _bindEditorEvents() {
        // ルール編集モーダル
        this.editRulesBtn.addEventListener('click', () => {
            this.renderRulesList();
            this.removeAsterisksCheckbox.checked = this.removeAsterisks;
            this.highlightOnlyCheckbox.checked = this.highlightOnly; // F-13
            if (this.ruleSearchInput) this.ruleSearchInput.value = ''; // F-04
            this._closeSidePanel(); // サイドパネルを閉じてからモーダルを開く
            this.ruleModal.classList.remove('hidden');
        });

        this.closeModalBtn.addEventListener('click', () => this.ruleModal.classList.add('hidden'));

        this.ruleModal.addEventListener('click', (e) => {
            if (e.target === this.ruleModal) this.ruleModal.classList.add('hidden');
        });

        this.addRuleBtn.addEventListener('click', () => {
            this.rules.push({ target: '', replacement: '' });
            this.renderRulesList();
            const newInputs = this.rulesList.querySelectorAll('.rule-item:last-child .rule-target');
            if (newInputs.length > 0) newInputs[0].focus();
        });

        this.saveRulesBtn.addEventListener('click', () => {
            this._saveRulesFromUI();
            this.ruleModal.classList.add('hidden');
            this.renderRuleToggleList(); // サイドパネル同期
            this.analyzeText();
            this._showToast('ルールを保存しました');
        });

        // F-04: ルール検索
        if (this.ruleSearchInput) {
            this.ruleSearchInput.addEventListener('input', (e) => {
                this._filterRulesList(e.target.value);
            });
        }

        // F-08: 正規表現テンプレート
        if (this.regexTemplateBtn) {
            this.regexTemplateBtn.addEventListener('click', () => {
                this._showRegexTemplates();
            });
        }

        // F-14: レポートエクスポート
        if (this.exportReportBtn) {
            this.exportReportBtn.addEventListener('click', () => {
                this._exportCheckReport();
            });
        }

        // テキスト入力
        this.sourceText.addEventListener('input', () => this._analyzeTextDebounced());

        this.clearBtn.addEventListener('click', () => {
            if (this.sourceText.value) {
                this._undoStack.push(this.sourceText.value);
                if (this._undoStack.length > 20) this._undoStack.shift();
                this.undoBtn.style.display = '';
            }
            this.sourceText.value = '';
            this.analyzeText();
            this.sourceText.focus();
        });

        this.pasteBtn.addEventListener('click', async () => {
            try {
                const text = await navigator.clipboard.readText();
                this._replaceTextareaContent(text);
                this.analyzeText();
            } catch {
                this._showToast('クリップボードにアクセスできませんでした', 'fa-triangle-exclamation');
            }
        });

        this.copyBtn.addEventListener('click', async () => {
            const textToCopy = this.ruleEngine.getCleanedText(this.sourceText.value);
            if (!textToCopy) return;
            try {
                await navigator.clipboard.writeText(textToCopy);
                this._showToast('結果をコピーしました！');
            } catch {
                this._fallbackCopy(textToCopy);
            }
        });

        // 一括修正 (F-03: 修正レポート付き)
        this.replaceBtn.addEventListener('click', () => {
            const original = this.sourceText.value;
            const cleaned = this.ruleEngine.getCleanedText(original);
            if (cleaned === original || !original) {
                this._showToast('修正する箇所がありませんでした', 'fa-info-circle');
                return;
            }
            const changes = this._generateChangeReport(original, cleaned);
            this._replaceTextareaContent(cleaned);
            this.analyzeText();
            this._showChangeReport(changes);
            this.undoBtn.style.display = '';
        });

        // Undoボタン
        this.undoBtn.addEventListener('click', () => {
            if (this._undoStack.length === 0) return;
            const prev = this._undoStack.pop();
            this._replaceTextareaContent(prev, true);
            this.analyzeText();
            this._showToast('元に戻しました', 'fa-rotate-left');
            if (this._undoStack.length === 0) this.undoBtn.style.display = 'none';
        });

        // 個別クリック修正 (F-10: 確認ポップアップ付き / F-13: 指摘のみモード対応)
        this.resultOutput.addEventListener('click', (e) => {
            const highlight = e.target.closest('.highlight');
            if (!highlight) return;

            // F-13: 指摘のみモードの場合はクリック修正を無効化
            if (this.highlightOnly) {
                this._showToast('指摘のみモードが有効です。ルール設定でOFFにできます。', 'fa-info-circle');
                return;
            }

            const targetText = highlight.getAttribute('data-target');
            const replacementText = highlight.getAttribute('data-replacement');
            const occurrenceIndex = parseInt(highlight.getAttribute('data-occurrence'), 10);
            if (targetText === null || isNaN(occurrenceIndex)) return;

            // F-10: 確認ポップアップ
            const displayReplacement = replacementText || '（削除）';
            this._showConfirm(
                `「${targetText}」→「${displayReplacement}」\nに修正しますか？`,
                () => {
                    this._applyIndividualFix(targetText, replacementText, occurrenceIndex);
                }
            );
        });
    }

    /** キーボードショートカット */
    _bindKeyboardEvents() {
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                this.replaceBtn.click();
            }
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'C') {
                e.preventDefault();
                this.copyBtn.click();
            }
            if (e.key === 'Escape') {
                this.ruleModal.classList.add('hidden');
                this.nameModal.classList.add('hidden');
                this.confirmModal.classList.add('hidden');
            }
        });
    }

    /** ドラッグ＆ドロップでのファイル読込 */
    _bindDragDropEvents() {
        const pane = this.sourceText.closest('.editor-pane');

        pane.addEventListener('dragover', (e) => {
            e.preventDefault();
            pane.classList.add('editor-pane--dragover');
        });

        pane.addEventListener('dragleave', () => {
            pane.classList.remove('editor-pane--dragover');
        });

        pane.addEventListener('drop', (e) => {
            e.preventDefault();
            pane.classList.remove('editor-pane--dragover');
            const file = e.dataTransfer.files[0];
            if (!file) return;

            if (!file.name.endsWith('.txt') && !file.type.startsWith('text/')) {
                this._showToast('テキストファイルのみ対応しています', 'fa-triangle-exclamation');
                return;
            }
            const reader = new FileReader();
            reader.onload = (ev) => {
                this._replaceTextareaContent(ev.target.result);
                this.analyzeText();
                this._showToast(`${file.name} を読み込みました`);
            };
            reader.readAsText(file);
        });
    }

    /** URLハッシュインポート + ブックマークレット受信 */
    _bindExternalEvents() {
        this._importFromHash();

        window.addEventListener('message', (e) => {
            if (e.origin !== location.origin) return;
            if (e.data && e.data.type === 'writerChecker' && e.data.text) {
                this._replaceTextareaContent(e.data.text);
                this.analyzeText();
                this._showToast('ブックマークレットからテキストを受信しました');
            }
        });
    }

    // =========================================================================
    //  ルールセット管理
    // =========================================================================

    populateRuleSetSelector() {
        this.ruleSetSelector.innerHTML = '';
        for (const setName of Object.keys(this.allRuleSets)) {
            const option = document.createElement('option');
            option.value = setName;
            option.textContent = `${setName} (${this.allRuleSets[setName].length})`;
            if (setName === this.activeSetName) option.selected = true;
            this.ruleSetSelector.appendChild(option);
        }
        this.deleteRuleSetBtn.disabled = Object.keys(this.allRuleSets).length <= 1;
        this._updatePresetTooltip(); // F-02
    }

    renderRulesList() {
        this.rulesList.innerHTML = '';

        // イベント委譲（初回のみ設定）
        if (!this._rulesListDelegated) {
            this.rulesList.addEventListener('click', (e) => {
                const removeBtn = e.target.closest('.btn-remove-rule');
                if (!removeBtn) return;
                const index = parseInt(removeBtn.getAttribute('data-index'), 10);
                if (isNaN(index) || index < 0 || index >= this.rules.length) return;
                this.rules.splice(index, 1);
                this.renderRulesList();
            });
            this._rulesListDelegated = true;
        }

        this.rules.forEach((rule, index) => {
            const ruleItem = document.createElement('div');
            ruleItem.className = 'rule-item';

            // F-05: ドラッグ並び替え
            ruleItem.draggable = true;
            ruleItem.setAttribute('data-rule-index', index.toString());
            ruleItem.addEventListener('dragstart', (e) => {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', index.toString());
                ruleItem.classList.add('rule-item--dragging');
            });
            ruleItem.addEventListener('dragend', () => {
                ruleItem.classList.remove('rule-item--dragging');
            });
            ruleItem.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                ruleItem.classList.add('rule-item--dragover');
            });
            ruleItem.addEventListener('dragleave', () => {
                ruleItem.classList.remove('rule-item--dragover');
            });
            ruleItem.addEventListener('drop', (e) => {
                e.preventDefault();
                ruleItem.classList.remove('rule-item--dragover');
                const fromIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
                const toIndex = index;
                if (fromIndex !== toIndex && !isNaN(fromIndex)) {
                    const [moved] = this.rules.splice(fromIndex, 1);
                    this.rules.splice(toIndex, 0, moved);
                    this.renderRulesList();
                }
            });

            const targetInput = document.createElement('input');
            targetInput.type = 'text';
            targetInput.className = 'rule-input rule-target';
            targetInput.placeholder = '対象 (例: 出来る)';
            targetInput.value = rule.target || '';

            const arrow = document.createElement('i');
            arrow.className = 'fa-solid fa-arrow-right rule-arrow';

            const replacementInput = document.createElement('input');
            replacementInput.type = 'text';
            replacementInput.className = 'rule-input rule-replacement';
            replacementInput.placeholder = '置換 (例: できる)';
            replacementInput.value = rule.replacement || '';

            const regexToggle = document.createElement('button');
            regexToggle.className = `btn-regex-toggle${rule.isRegex ? ' active' : ''}`;
            regexToggle.title = '正規表現モード';
            regexToggle.textContent = '.*';
            regexToggle.addEventListener('click', () => {
                rule.isRegex = !rule.isRegex;
                regexToggle.classList.toggle('active', rule.isRegex);
            });

            // F-15: メモフィールド
            const memoInput = document.createElement('input');
            memoInput.type = 'text';
            memoInput.className = 'rule-input rule-memo';
            memoInput.placeholder = 'メモ';
            memoInput.value = rule.memo || '';

            const removeBtn = document.createElement('button');
            removeBtn.className = 'btn-remove-rule';
            removeBtn.title = 'このルールを削除';
            removeBtn.setAttribute('data-index', index.toString());
            const removeIcon = document.createElement('i');
            removeIcon.className = 'fa-solid fa-trash';
            removeIcon.style.pointerEvents = 'none';
            removeBtn.appendChild(removeIcon);

            // ルール有効/無効チェックボックス
            const enabledCheckbox = document.createElement('input');
            enabledCheckbox.type = 'checkbox';
            enabledCheckbox.className = 'rule-enabled-checkbox';
            enabledCheckbox.checked = rule.enabled !== false; // デフォルトはON
            enabledCheckbox.title = 'このルールを有効/無効';
            enabledCheckbox.addEventListener('change', () => {
                rule.enabled = enabledCheckbox.checked;
                ruleItem.classList.toggle('rule-item--disabled', !enabledCheckbox.checked);
            });

            // 初期状態で無効の場合グレーアウト
            if (rule.enabled === false) {
                ruleItem.classList.add('rule-item--disabled');
            }

            ruleItem.append(enabledCheckbox, targetInput, arrow, replacementInput, regexToggle, memoInput, removeBtn);
            this.rulesList.appendChild(ruleItem);
        });
    }

    _saveRulesFromUI() {
        const items = this.rulesList.querySelectorAll('.rule-item');
        const newRules = [];

        items.forEach((item) => {
            const target = item.querySelector('.rule-target')?.value || '';
            const replacement = item.querySelector('.rule-replacement')?.value || '';
            const isRegex = item.querySelector('.btn-regex-toggle')?.classList.contains('active') || false;
            const memo = item.querySelector('.rule-memo')?.value || '';
            const enabled = item.querySelector('.rule-enabled-checkbox')?.checked ?? true;

            if (target) {
                const rule = { target, replacement, enabled };
                if (isRegex) rule.isRegex = true;
                if (memo) rule.memo = memo;
                newRules.push(rule);
            }
        });

        this.rules = newRules;
        this.allRuleSets[this.activeSetName] = this.rules;
        this.removeAsterisks = this.removeAsterisksCheckbox.checked;
        this.highlightOnly = this.highlightOnlyCheckbox ? this.highlightOnlyCheckbox.checked : false;

        this.ruleEngine.setRules(this.rules);
        this.ruleEngine.setRemoveAsterisks(this.removeAsterisks);
        this.storageManager.saveAllRuleSets(this.allRuleSets);
        this.storageManager.saveAsteriskSetting(this.removeAsterisks);
    }

    // =========================================================================
    //  テキスト解析・ステータスバー
    // =========================================================================

    _analyzeTextDebounced() {
        clearTimeout(this._analyzeDebounceTimer);
        this._updateStatusBar(this.sourceText.value);
        this._analyzeDebounceTimer = setTimeout(() => this.analyzeText(), 300);
    }

    analyzeText() {
        const text = this.sourceText.value;
        this.resultOutput.innerHTML = '';
        this._updateStatusBar(text);

        if (!text) {
            const div = document.createElement('div');
            div.className = 'placeholder-text';
            div.textContent = 'テキストを入力するか貼り付けると、レギュレーション違反がハイライトされます。';
            this.resultOutput.appendChild(div);
            this.matchCountBadge.textContent = '0';
            this._updateBadgeStyle(0);
            return;
        }

        const tokens = this.ruleEngine.tokenize(text);
        let matchCount = 0;
        const occurrenceCounters = {};

        for (const token of tokens) {
            if (token.type === 'text') {
                this.resultOutput.appendChild(document.createTextNode(token.content));
            } else if (token.type === 'highlight') {
                matchCount++;
                const span = document.createElement('span');
                span.className = 'highlight';

                const targetKey = token.content;
                occurrenceCounters[targetKey] = (occurrenceCounters[targetKey] || 0);
                span.setAttribute('data-target', targetKey);
                span.setAttribute('data-occurrence', occurrenceCounters[targetKey].toString());
                occurrenceCounters[targetKey]++;

                span.setAttribute('data-replacement', token.replacement || '削除');
                span.textContent = token.content;
                this.resultOutput.appendChild(span);

                // 差分プレビュー
                if (token.replacement !== undefined && token.replacement !== '') {
                    const ins = document.createElement('span');
                    ins.className = 'inserted';
                    ins.textContent = token.replacement;
                    this.resultOutput.appendChild(ins);
                }
            }
        }

        this.matchCountBadge.textContent = matchCount.toString();
        this._updateBadgeStyle(matchCount);
    }

    _updateStatusBar(text) {
        if (!text) {
            this.charCount.textContent = '文字数: 0';
            this.charCountNoSpace.textContent = '空白なし: 0';
            this.lineCount.textContent = '行数: 0';
            this.manuscriptCount.textContent = '原稿用紙: 0枚';
            this.readTime.textContent = '読了: 0分';
            this.kanjiRate.textContent = '漢字率: 0%';
            this._updateKanjiBar(0); // F-11
            return;
        }

        const totalChars = text.length;
        const cleanText = text.replace(/[\s\u3000\n\r]/g, '');
        const noSpaceChars = cleanText.length;
        const lines = text.split(/\r\n|\r|\n/).length;
        const manuscripts = Math.ceil(noSpaceChars / 400);
        const minutes = Math.ceil(noSpaceChars / 500);
        const kanjiCount = (cleanText.match(/[\u4e00-\u9faf\u3400-\u4dbf]/g) || []).length;
        const kanjiPercent = noSpaceChars > 0 ? Math.round((kanjiCount / noSpaceChars) * 100) : 0;

        this.charCount.textContent = `文字数: ${totalChars}`;
        this.charCountNoSpace.textContent = `空白なし: ${noSpaceChars}`;
        this.lineCount.textContent = `行数: ${lines}`;
        this.manuscriptCount.textContent = `原稿用紙: ${manuscripts}枚`;
        this.readTime.textContent = `読了: ${minutes > 0 ? minutes : '< 1'}分`;
        this.kanjiRate.textContent = `漢字率: ${kanjiPercent}%`;
        this._updateKanjiBar(kanjiPercent); // F-11
    }

    /** F-11: 漢字率バーインジケーター更新 */
    _updateKanjiBar(percent) {
        if (!this.kanjiBarFill) return;
        this.kanjiBarFill.style.width = `${Math.min(percent, 100)}%`;
        // 20-30%: 適正(緑), 30-40%: 注意(黄), 40%+: 多い(赤), 0-20%: 少ない(青)
        if (percent >= 20 && percent <= 30) {
            this.kanjiBarFill.style.backgroundColor = 'var(--success-color)';
            this.kanjiRate.title = '✅ 読みやすい範囲です (20〜30%)';
        } else if (percent > 30 && percent <= 40) {
            this.kanjiBarFill.style.backgroundColor = '#f59e0b';
            this.kanjiRate.title = '⚠️ やや漢字が多めです (適正: 20〜30%)';
        } else if (percent > 40) {
            this.kanjiBarFill.style.backgroundColor = 'var(--danger-color)';
            this.kanjiRate.title = '❌ 漢字が多すぎます (適正: 20〜30%)';
        } else {
            this.kanjiBarFill.style.backgroundColor = '#60a5fa';
            this.kanjiRate.title = 'ℹ️ 漢字が少なめです (適正: 20〜30%)';
        }
    }

    _updateBadgeStyle(count) {
        const color = count > 0 ? 'var(--danger-color)' : 'var(--success-color)';
        this.matchCountBadge.style.backgroundColor = color;
        this.matchCountBadge.style.color = 'white';
    }

    // =========================================================================
    //  ユーティリティ
    // =========================================================================

    /** textareaの内容をブラウザUndoスタック保持しつつ全置換 */
    _replaceTextareaContent(newText, skipUndo = false) {
        if (!skipUndo && this.sourceText.value) {
            this._undoStack.push(this.sourceText.value);
            if (this._undoStack.length > 20) this._undoStack.shift();
        }
        this.sourceText.focus();
        this.sourceText.select();
        if (!document.execCommand('insertText', false, newText)) {
            this.sourceText.value = newText;
        }
    }

    _showToast(message, iconName = 'fa-check') {
        if (this._toastTimer) clearTimeout(this._toastTimer);
        this.toast.innerHTML = '';

        const icon = document.createElement('i');
        icon.className = `fa-solid ${iconName}`;
        this.toast.appendChild(icon);
        this.toast.appendChild(document.createTextNode(` ${message}`));

        this.toast.classList.remove('hidden');
        this._toastTimer = setTimeout(() => {
            this.toast.classList.add('hidden');
            this._toastTimer = null;
        }, 3000);
    }

    _showConfirm(message, onConfirm) {
        this.confirmModalMsg.textContent = '';
        const lines = message.split('\n');
        lines.forEach((line, i) => {
            this.confirmModalMsg.appendChild(document.createTextNode(line));
            if (i < lines.length - 1) this.confirmModalMsg.appendChild(document.createElement('br'));
        });

        this._confirmCallback = onConfirm;
        this.confirmModal.classList.remove('hidden');

        const close = () => {
            this.confirmModal.classList.add('hidden');
            this._confirmCallback = null;
        };
        const ok = () => {
            if (this._confirmCallback) this._confirmCallback();
            close();
        };

        this.confirmModalOkBtn.onclick = ok;
        this.confirmModalCancelBtn.onclick = close;
        this.closeConfirmModalBtn.onclick = close;
    }

    _fallbackCopy(text) {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
            document.execCommand('copy');
            this._showToast('結果をコピーしました！');
        } catch {
            this._showToast('コピーに失敗しました', 'fa-triangle-exclamation');
        }
        document.body.removeChild(textArea);
    }

    // =========================================================================
    //  インポート・共有
    // =========================================================================

    _processImportedJSON(jsonString) {
        try {
            const data = JSON.parse(jsonString);

            if (typeof data !== 'object' || data === null || Array.isArray(data)) {
                throw new Error('Invalid format');
            }

            let importCount = 0;
            let skippedCount = 0;
            const overwrittenKeys = [];

            for (const key of Object.keys(data)) {
                if (!Array.isArray(data[key])) {
                    skippedCount++;
                    continue;
                }

                const validRules = data[key]
                    .filter(r => typeof r === 'object' && r !== null && typeof r.target === 'string')
                    .map(r => {
                        const rule = {
                            target: r.target,
                            replacement: typeof r.replacement === 'string' ? r.replacement : ''
                        };
                        if (r.isRegex) rule.isRegex = true;
                        return rule;
                    });

                if (this.allRuleSets[key] && this.allRuleSets[key].length > 0) {
                    overwrittenKeys.push(key);
                }
                this.allRuleSets[key] = validRules;
                importCount++;
            }

            if (importCount > 0) {
                this.storageManager.saveAllRuleSets(this.allRuleSets);
                this.rules = this.allRuleSets[this.activeSetName];
                this.ruleEngine.setRules(this.rules);
                this.populateRuleSetSelector();
                this.renderRulesList();
                this.analyzeText();

                let msg = skippedCount > 0
                    ? `${importCount}個のルールセットをインポート（${skippedCount}個スキップ）`
                    : `${importCount}個のルールセットをインポートしました`;
                if (overwrittenKeys.length > 0) {
                    msg += `（上書き: ${overwrittenKeys.join(', ')}）`;
                }
                this._showToast(msg);
            } else {
                this._showToast('有効なルールセットが見つかりませんでした', 'fa-triangle-exclamation');
            }
        } catch (err) {
            console.error('Import error', err);
            this._showToast('ファイルの読み込みに失敗しました', 'fa-triangle-exclamation');
        }
    }

    _importFromHash() {
        try {
            const hash = location.hash.replace('#rules=', '');
            if (!hash || hash === location.hash) return;
            const json = decodeURIComponent(atob(hash));
            const imported = JSON.parse(json);
            if (typeof imported !== 'object' || imported === null || Array.isArray(imported)) return;

            let count = 0;
            for (const key of Object.keys(imported)) {
                if (!Array.isArray(imported[key])) continue;
                this.allRuleSets[key] = imported[key];
                count++;
            }
            if (count > 0) {
                this.storageManager.saveAllRuleSets(this.allRuleSets);
                this.populateRuleSetSelector();
                this.renderRulesList();
                this._showToast(`共有リンクから${count}個のルールセットをインポートしました`);
            }
            history.replaceState(null, '', location.pathname + location.search);
        } catch {
            // 無効なハッシュは無視
        }
    }

    _generateShareLink() {
        const currentSet = { [this.activeSetName]: this.rules };
        const json = JSON.stringify(currentSet);
        const hash = btoa(encodeURIComponent(json));
        const url = `${location.origin}${location.pathname}#rules=${hash}`;
        if (url.length > 2000) {
            this._showToast('ルールが多いため共有リンクが長くなっています。一部のSNSでは正しく動作しない場合があります。', 'fa-triangle-exclamation');
        }
        return url;
    }

    // =========================================================================
    //  F-02: プリセット説明ツールチップ
    // =========================================================================

    _updatePresetTooltip() {
        if (!this.presetTooltip) return;
        const desc = this.storageManager.presetDescriptions[this.activeSetName];
        this.presetTooltip.textContent = desc || `カスタムルール ${this.rules.length}件`;
    }

    // =========================================================================
    //  F-07: プリセット×アスタリスク自動連動
    // =========================================================================

    _applyPresetAsterisk() {
        const recommended = this.storageManager.presetAsteriskDefaults[this.activeSetName];
        if (recommended !== undefined) {
            this.removeAsterisks = recommended;
            this.removeAsterisksCheckbox.checked = recommended;
            this.ruleEngine.setRemoveAsterisks(recommended);
            this.storageManager.saveAsteriskSetting(recommended);
        }
    }

    // =========================================================================
    //  F-10: 個別修正の実行
    // =========================================================================

    _applyIndividualFix(targetText, replacementText, occurrenceIndex) {
        const source = this.sourceText.value;
        let currentIndex = -1;
        let found = 0;
        let startPos = 0;

        while (startPos < source.length) {
            currentIndex = source.indexOf(targetText, startPos);
            if (currentIndex === -1) break;
            if (found === occurrenceIndex) break;
            found++;
            startPos = currentIndex + 1;
        }

        if (currentIndex !== -1 && found === occurrenceIndex) {
            const before = source.substring(0, currentIndex);
            const after = source.substring(currentIndex + targetText.length);
            this._replaceTextareaContent(before + (replacementText || '') + after);
            this.analyzeText();
        }
    }

    // =========================================================================
    //  F-03: 修正レポート
    // =========================================================================

    _generateChangeReport(originalText, cleanedText) {
        const tokens = this.ruleEngine.tokenize(originalText);
        const changes = [];
        for (const token of tokens) {
            if (token.type === 'highlight') {
                changes.push({
                    from: token.content,
                    to: token.replacement || '（削除）'
                });
            }
        }
        return changes;
    }

    _showChangeReport(changes) {
        if (changes.length === 0) return;
        const summary = changes.slice(0, 10).map(c => `・「${c.from}」→「${c.to}」`).join('\n');
        const more = changes.length > 10 ? `\n…他${changes.length - 10}件` : '';
        this._showToast(`${changes.length}箇所修正しました`, 'fa-wand-magic-sparkles');
    }

    // =========================================================================
    //  F-04: ルール検索フィルタ
    // =========================================================================



    _filterRulesList(query) {
        if (!this.rulesList) return;
        const items = this.rulesList.querySelectorAll('.rule-item');
        const q = query.toLowerCase();
        items.forEach(item => {
            const target = item.querySelector('.rule-target');
            const replacement = item.querySelector('.rule-replacement');
            const memo = item.querySelector('.rule-memo');
            const text = (target?.value || '') + (replacement?.value || '') + (memo?.value || '');
            item.style.display = text.toLowerCase().includes(q) ? '' : 'none';
        });
    }

    // =========================================================================
    //  F-08: 正規表現テンプレート
    // =========================================================================

    _showRegexTemplates() {
        const templates = [
            { target: '[０-９]+', replacement: '', memo: '全角数字を検出', isRegex: true },
            { target: '[ａ-ｚＡ-Ｚ]+', replacement: '', memo: '全角英字を検出', isRegex: true },
            { target: '^[\\s　]+', replacement: '', memo: '行頭空白を除去', isRegex: true },
            { target: '[　]{2,}', replacement: '　', memo: '連続全角スペースを縮小', isRegex: true },
            { target: '(\\r?\\n){3,}', replacement: '\n\n', memo: '3行以上の空行を縮小', isRegex: true },
            { target: '。。+', replacement: '。', memo: '連続句点を縮小', isRegex: true },
            { target: '[、，]', replacement: '、', memo: 'コンマを読点に統一', isRegex: true },
            { target: '\\s+$', replacement: '', memo: '行末空白を除去', isRegex: true },
        ];

        const listHtml = templates.map((t, i) =>
            `・${t.memo}（${t.target}）`
        ).join('\n');

        this._showConfirm(
            `正規表現テンプレートを全て追加しますか？\n\n${listHtml}`,
            () => {
                for (const t of templates) {
                    this.rules.push({ ...t });
                }
                this.renderRulesList();
                this._showToast(`${templates.length}件のテンプレートを追加しました`);
            }
        );
    }

    // =========================================================================
    //  F-14: チェックレポートエクスポート
    // =========================================================================

    _exportCheckReport() {
        const text = this.sourceText.value;
        if (!text) {
            this._showToast('テキストが入力されていません', 'fa-triangle-exclamation');
            return;
        }

        const tokens = this.ruleEngine.tokenize(text);
        const changes = [];
        for (const token of tokens) {
            if (token.type === 'highlight') {
                changes.push({ from: token.content, to: token.replacement || '（削除）' });
            }
        }

        const cleanText = text.replace(/[\s\u3000\n\r]/g, '');
        const kanjiCount = (cleanText.match(/[\u4e00-\u9faf\u3400-\u4dbf]/g) || []).length;
        const kanjiPercent = cleanText.length > 0 ? Math.round((kanjiCount / cleanText.length) * 100) : 0;

        let report = `═════ Writer Checker レポート ═════\n`;
        report += `日時: ${new Date().toLocaleString('ja-JP')}\n`;
        report += `ルールセット: ${this.activeSetName}\n`;
        report += `文字数: ${text.length} / 空白なし: ${cleanText.length}\n`;
        report += `漢字率: ${kanjiPercent}%\n`;
        report += `検出数: ${changes.length}件\n\n`;

        if (changes.length > 0) {
            report += `─── 検出一覧 ───\n`;
            changes.forEach((c, i) => {
                report += `${i + 1}. 「${c.from}」 → 「${c.to}」\n`;
            });
        } else {
            report += `検出なし: 規定過りです！\n`;
        }

        const blob = new Blob([report], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `writer-checker-report-${new Date().toISOString().slice(0, 10)}.txt`;
        a.click();
        URL.revokeObjectURL(url);
        this._showToast('レポートをダウンロードしました');
    }

    // =========================================================================
    //  サイドパネル
    // =========================================================================

    _bindSidePanelEvents() {
        // 開閉
        this.sidePanelToggle.addEventListener('click', () => this._openSidePanel());
        this.sidePanelClose.addEventListener('click', () => this._closeSidePanel());
        this.sidePanelOverlay.addEventListener('click', () => this._closeSidePanel());

        // オプショントグルの即時反映
        this.removeAsterisksCheckbox.addEventListener('change', () => {
            this.removeAsterisks = this.removeAsterisksCheckbox.checked;
            this.ruleEngine.setRemoveAsterisks(this.removeAsterisks);
            this.storageManager.saveAsteriskSetting(this.removeAsterisks);
            this.analyzeText();
        });

        this.highlightOnlyCheckbox.addEventListener('change', () => {
            this.highlightOnly = this.highlightOnlyCheckbox.checked;
        });
    }

    _openSidePanel() {
        this.renderRuleToggleList();
        this.removeAsterisksCheckbox.checked = this.removeAsterisks;
        this.highlightOnlyCheckbox.checked = this.highlightOnly;
        this.sidePanel.classList.remove('hidden');
        this.sidePanelOverlay.classList.remove('hidden');
    }

    _closeSidePanel() {
        this.sidePanel.classList.add('hidden');
        this.sidePanelOverlay.classList.add('hidden');
    }

    /**
     * サイドパネルにルール一覧をチェックボックス付きで描画。
     * オンオフ切替は即時反映（RuleEngine更新＋解析実行＋保存）。
     */
    renderRuleToggleList() {
        if (!this.ruleToggleList) return;
        this.ruleToggleList.innerHTML = '';

        const enabledCount = this.rules.filter(r => r.enabled !== false).length;
        if (this.ruleToggleCount) {
            this.ruleToggleCount.textContent = `${enabledCount}/${this.rules.length}`;
        }

        this.rules.forEach((rule, index) => {
            const item = document.createElement('label');
            item.className = `rule-toggle-item${rule.enabled === false ? ' disabled' : ''}`;

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = rule.enabled !== false;
            checkbox.addEventListener('change', () => {
                rule.enabled = checkbox.checked;
                item.classList.toggle('disabled', !checkbox.checked);

                // カウント更新
                const count = this.rules.filter(r => r.enabled !== false).length;
                if (this.ruleToggleCount) {
                    this.ruleToggleCount.textContent = `${count}/${this.rules.length}`;
                }

                // 即時反映
                this.ruleEngine.setRules(this.rules);
                this.allRuleSets[this.activeSetName] = this.rules;
                this.storageManager.saveAllRuleSets(this.allRuleSets);
                this.analyzeText();
            });

            const preview = document.createElement('span');
            preview.className = 'rule-preview';

            const from = document.createElement('span');
            from.className = 'from';
            from.textContent = rule.target;

            const arrow = document.createElement('span');
            arrow.className = 'arrow';
            arrow.textContent = '→';

            const to = document.createElement('span');
            to.className = 'to';
            to.textContent = rule.replacement || '（削除）';

            preview.append(from, arrow, to);
            item.append(checkbox, preview);
            this.ruleToggleList.appendChild(item);
        });
    }
}
