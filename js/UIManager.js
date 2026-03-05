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
        if (!Object.hasOwn(this.allRuleSets, this.activeSetName)) {
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
        this.MAX_SHARE_URL_LENGTH = 2000;
        this.MAX_INCOMING_TEXT_LENGTH = 200000;
        this._guideProgress = {
            sample: false,
            replace: false,
            diff: false
        };
        this._latestAnalysis = null;

        this._cacheElements();
        this._bindEvents();

        // 初期表示
        this.populateRuleSetSelector();
        this.removeAsterisksCheckbox.checked = this.removeAsterisks;
        this.renderRulesList();
        this.renderRuleToggleList();
        this._updateSaveStateStatus();
        this._updateGuideProgressUI();
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
        this.sampleBtn = document.getElementById('sampleBtn');
        this.bookmarkletLink = document.getElementById('bookmarkletLink');
        this.headerSampleBtn = document.getElementById('headerSampleBtn');
        this.activeRuleSetStatus = document.getElementById('activeRuleSetStatus');
        this.saveStateStatus = document.getElementById('saveStateStatus');
        this.matchCountStatus = document.getElementById('matchCountStatus');
        this.writingScoreStatus = document.getElementById('writingScoreStatus');
        this.comprehensiveStatus = document.getElementById('comprehensiveStatus');
        this.guideStepSample = document.getElementById('guideStepSample');
        this.guideStepReplace = document.getElementById('guideStepReplace');
        this.guideStepDiff = document.getElementById('guideStepDiff');
        this.guideSampleBtn = document.getElementById('guideSampleBtn');
        this.mobileSampleBtn = document.getElementById('mobileSampleBtn');
        this.mobileReplaceBtn = document.getElementById('mobileReplaceBtn');
        this.mobileCopyBtn = document.getElementById('mobileCopyBtn');
        this.mobileSettingsBtn = document.getElementById('mobileSettingsBtn');

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
        this.exportRulesBtns = [
            document.getElementById('exportRulesBtn'),
            document.getElementById('exportRulesBtnModal'),
        ].filter(Boolean);
        this.importRulesBtns = [
            document.getElementById('importRulesBtn'),
            document.getElementById('importRulesBtnModal'),
        ].filter(Boolean);
        this.importFileInputs = [
            document.getElementById('importFileInput'),
            document.getElementById('importFileInputModal'),
        ].filter(Boolean);
        this.shareRulesBtns = [
            document.getElementById('shareRulesBtn'),
            document.getElementById('shareRulesBtnModal'),
        ].filter(Boolean);

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
        this.fullCheckBtn = document.getElementById('fullCheckBtn');
        this.shareScoreXBtn = document.getElementById('shareScoreXBtn');
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
        this._hasUnsavedEdits = false; // C-2
        this._bindRuleSetEvents();
        this._bindImportExportEvents();
        this._bindEditorEvents();
        this._bindKeyboardEvents();
        this._bindDragDropEvents();
        this._bindExternalEvents();
        this._bindSidePanelEvents();
        this._bindContextMenu(); // B-4
        this._bindQuickActionEvents();
    }

    /** ルールセットの選択・作成・削除 */
    _bindRuleSetEvents() {
        this.ruleSetSelector.addEventListener('change', (e) => {
            const newName = e.target.value;
            const doSwitch = () => {
                this.activeSetName = newName;
                this.rules = this.allRuleSets[this.activeSetName];
                this.ruleEngine.setRules(this.rules);
                this.storageManager.saveActiveSetName(this.activeSetName);
                if (this.activeRuleSetStatus) this.activeRuleSetStatus.textContent = this.activeSetName;
                this._updatePresetTooltip();
                this._applyPresetAsterisk();
                this.renderRuleToggleList();
                this.analyzeText();
            };
            // C-2: 未保存のカスタムルールがあれば確認
            if (this._hasUnsavedEdits) {
                this._showConfirm(
                    '編集中のルールがあります。保存せずにルールセットを切り替えますか？',
                    () => { this._hasUnsavedEdits = false; this._updateSaveStateStatus(); doSwitch(); },
                    { okText: '切り替える' }
                );
                this.ruleSetSelector.value = this.activeSetName;
            } else {
                doSwitch();
            }
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
            if (!this._isSafeRuleSetName(name)) {
                this.nameModalError.textContent = 'その名前は使用できません';
                this.nameModalError.classList.remove('hidden');
                return;
            }
            if (this.allRuleSets[name]) {
                this.nameModalError.textContent = 'その名前のルールセットは既に存在します';
                this.nameModalError.classList.remove('hidden');
                return;
            }

            if (!this._createRuleSet(name)) {
                this.nameModalError.textContent = 'ルールセットの作成に失敗しました';
                this.nameModalError.classList.remove('hidden');
                return;
            }

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
                },
                { okText: '削除する', danger: true }
            );
        });
    }

    /** インポート・エクスポート・共有 */
    _bindImportExportEvents() {
        this.exportRulesBtns.forEach((btn) => {
            btn.addEventListener('click', () => {
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
        });

        this.shareRulesBtns.forEach((btn) => {
            btn.addEventListener('click', async () => {
                const link = this._generateShareLink();
                try {
                    await navigator.clipboard.writeText(link);
                    this._showToast('共有リンクをコピーしました！', 'fa-link');
                } catch {
                    this._showToast('コピーに失敗しました', 'fa-triangle-exclamation');
                }
            });
        });

        this.importRulesBtns.forEach((btn, index) => {
            btn.addEventListener('click', () => {
                const input = this.importFileInputs[index] || this.importFileInputs[0];
                if (input) input.click();
            });
        });

        this.importFileInputs.forEach((input) => {
            input.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (!file) return;

                const reader = new FileReader();
                reader.onload = (event) => {
                    this._processImportedJSON(event.target.result);
                    input.value = '';
                };
                reader.readAsText(file);
            });
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
            this._markRulesDirty();
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

        this.rulesList.addEventListener('input', () => this._markRulesDirty());
        this.rulesList.addEventListener('change', () => this._markRulesDirty());

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

        if (this.fullCheckBtn) {
            this.fullCheckBtn.addEventListener('click', () => {
                this._openFullCheckModalFromCurrentText();
            });
        }

        if (this.shareScoreXBtn) {
            this.shareScoreXBtn.addEventListener('click', () => {
                this._shareScoreToX();
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

        // A-2: サンプルテキスト挿入
        if (this.sampleBtn) {
            this.sampleBtn.addEventListener('click', () => {
                this._insertSampleText();
            });
        }

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
            this._setGuideStepDone('replace');
            this.analyzeText();
            this._showDiffView(changes);
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
            const ruleIndexRaw = parseInt(highlight.getAttribute('data-rule-index'), 10);
            const ruleIndex = Number.isNaN(ruleIndexRaw) ? null : ruleIndexRaw;
            const matchedText = highlight.getAttribute('data-match') || highlight.textContent || '';
            if (targetText === null || isNaN(occurrenceIndex)) return;

            // F-10: 確認ポップアップ
            const displayReplacement = replacementText || '（削除）';
            this._showConfirm(
                `「${targetText}」→「${displayReplacement}」\nに修正しますか？`,
                () => {
                    this._applyIndividualFix(targetText, replacementText, occurrenceIndex, {
                        ruleIndex,
                        matchedText
                    });
                },
                { okText: '修正する' }
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
                this._closeSidePanel();
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
        this._setupBookmarkletLink();
        this._importFromWindowName();
        this._importFromHash();

        window.addEventListener('message', (e) => {
            if (!e.data || e.data.type !== 'writerChecker') return;
            if (e.source !== window.opener) return;
            this._applyIncomingText(e.data.text, 'ブックマークレット');
        });
    }

    _bindQuickActionEvents() {
        if (this.guideSampleBtn && this.sampleBtn) {
            this.guideSampleBtn.addEventListener('click', () => this.sampleBtn.click());
        }
        if (this.mobileSampleBtn && this.sampleBtn) {
            this.mobileSampleBtn.addEventListener('click', () => this.sampleBtn.click());
        }
        if (this.mobileReplaceBtn && this.replaceBtn) {
            this.mobileReplaceBtn.addEventListener('click', () => this.replaceBtn.click());
        }
        if (this.mobileCopyBtn && this.copyBtn) {
            this.mobileCopyBtn.addEventListener('click', () => this.copyBtn.click());
        }
        if (this.mobileSettingsBtn && this.sidePanelToggle) {
            this.mobileSettingsBtn.addEventListener('click', () => this.sidePanelToggle.click());
        }
        if (this.headerSampleBtn && this.sampleBtn) {
            this.headerSampleBtn.addEventListener('click', () => this.sampleBtn.click());
        }
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
        if (this.activeRuleSetStatus) this.activeRuleSetStatus.textContent = this.activeSetName;
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
                this._markRulesDirty();
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
                    this._markRulesDirty();
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
                this._markRulesDirty();
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
                this._markRulesDirty();
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
        this._hasUnsavedEdits = false;
        this._updateSaveStateStatus();
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
            if (this.matchCountStatus) this.matchCountStatus.textContent = '0件';
            this._latestAnalysis = null;
            this._updateBadgeStyle(0);
            this._updateWritingScoreStatus(null);
            this._updateComprehensiveStatus(null);
            return;
        }

        const tokens = this.ruleEngine.tokenize(text);
        let matchCount = 0;
        const occurrenceCounters = {};
        const fragment = document.createDocumentFragment();

        for (const token of tokens) {
            if (token.type === 'text') {
                fragment.appendChild(document.createTextNode(token.content));
            } else if (token.type === 'highlight') {
                matchCount++;
                const span = document.createElement('span');
                span.className = 'highlight';

                const targetKey = token.content;
                occurrenceCounters[targetKey] = (occurrenceCounters[targetKey] || 0);
                span.setAttribute('data-target', targetKey);
                span.setAttribute('data-occurrence', occurrenceCounters[targetKey].toString());
                occurrenceCounters[targetKey]++;
                if (Number.isInteger(token.ruleIndex) && token.ruleIndex >= 0) {
                    span.setAttribute('data-rule-index', token.ruleIndex.toString());
                }
                span.setAttribute('data-rule-target', token.target || token.content);

                span.setAttribute('data-replacement', token.replacement ?? '');
                span.setAttribute('data-match', token.content);
                span.textContent = token.content;
                fragment.appendChild(span);

                // 差分プレビュー
                if (token.replacement !== undefined && token.replacement !== '') {
                    const ins = document.createElement('span');
                    ins.className = 'inserted';
                    ins.textContent = token.replacement;
                    fragment.appendChild(ins);
                }
            }
        }

        this.resultOutput.appendChild(fragment);
        this.matchCountBadge.textContent = matchCount.toString();
        if (this.matchCountStatus) this.matchCountStatus.textContent = `${matchCount}件`;
        this._updateBadgeStyle(matchCount);

        const metrics = this._collectTextMetrics(text);
        const doubleHonorificIssues = this._findDoubleHonorificIssues(text);
        const writingScore = this._calculateWritingScore({
            text,
            matchCount,
            doubleHonorificIssues,
            metrics
        });
        const comprehensiveSummary = this._buildComprehensiveChecks({
            matchCount,
            doubleHonorificIssues,
            writingScore,
            metrics
        });

        this._latestAnalysis = {
            text,
            tokens,
            matchCount,
            metrics,
            doubleHonorificIssues,
            writingScore,
            comprehensiveSummary
        };
        this._updateWritingScoreStatus(writingScore);
        this._updateComprehensiveStatus(comprehensiveSummary);
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

    _collectTextMetrics(text) {
        const safeText = typeof text === 'string' ? text : '';
        const cleanText = safeText.replace(/[\s\u3000\n\r]/g, '');
        const noSpaceChars = cleanText.length;
        const sentenceCount = Math.max(
            1,
            safeText.split(/[。！？!?]+/).map((s) => s.trim()).filter(Boolean).length
        );
        const averageSentenceLength = sentenceCount > 0 ? Math.round(noSpaceChars / sentenceCount) : 0;
        const kanjiCount = (cleanText.match(/[\u4e00-\u9faf\u3400-\u4dbf]/g) || []).length;
        const kanjiPercent = noSpaceChars > 0 ? Math.round((kanjiCount / noSpaceChars) * 100) : 0;

        return {
            totalChars: safeText.length,
            noSpaceChars,
            sentenceCount,
            averageSentenceLength,
            kanjiPercent
        };
    }

    _findDoubleHonorificIssues(text) {
        if (typeof text !== 'string' || text.length === 0) return [];

        const patterns = [
            { regex: /ご連絡させていただ(?:きます|きました|く|き)/g, suggestion: '「ご連絡いたします」または「連絡させていただきます」に統一' },
            { regex: /お伺いさせていただ(?:きます|きました|く|き)/g, suggestion: '「伺います」または「お伺いします」に統一' },
            { regex: /拝見させていただ(?:きます|きました|く|き)/g, suggestion: '「拝見します」に統一' },
            { regex: /お越しになられ(?:る|ます|ました)/g, suggestion: '「お越しになる」または「来られる」に統一' },
            { regex: /ご覧になられ(?:る|ます|ました)/g, suggestion: '「ご覧になる」または「見られる」に統一' },
            { regex: /お召し上がりになられ(?:る|ます|ました)/g, suggestion: '「召し上がる」に統一' }
        ];

        const issues = [];
        for (const pattern of patterns) {
            pattern.regex.lastIndex = 0;
            let match;
            while ((match = pattern.regex.exec(text)) !== null) {
                issues.push({
                    type: 'double_honorific',
                    phrase: match[0],
                    index: match.index,
                    suggestion: pattern.suggestion
                });
            }
        }

        issues.sort((a, b) => a.index - b.index);
        const unique = [];
        const seen = new Set();
        for (const issue of issues) {
            const key = `${issue.index}:${issue.phrase}`;
            if (seen.has(key)) continue;
            seen.add(key);
            unique.push(issue);
        }
        return unique;
    }

    _calculateWritingScore({ text, matchCount, doubleHonorificIssues = [], metrics = null } = {}) {
        const resolvedMetrics = metrics || this._collectTextMetrics(text || '');
        const safeMatchCount = Number.isFinite(matchCount) ? Math.max(0, matchCount) : 0;
        const safeDoubleHonorificCount = Array.isArray(doubleHonorificIssues) ? doubleHonorificIssues.length : 0;

        let score = 100;
        const penalties = [];

        const rulePenalty = Math.min(safeMatchCount * 3, 45);
        if (rulePenalty > 0) {
            score -= rulePenalty;
            penalties.push({ label: 'ルール違反', value: rulePenalty });
        }

        const honorificPenalty = Math.min(safeDoubleHonorificCount * 8, 24);
        if (honorificPenalty > 0) {
            score -= honorificPenalty;
            penalties.push({ label: '二重敬語', value: honorificPenalty });
        }

        if (resolvedMetrics.noSpaceChars < 30) {
            score -= 12;
            penalties.push({ label: '文章量不足', value: 12 });
        } else if (resolvedMetrics.noSpaceChars < 80) {
            score -= 5;
            penalties.push({ label: '文章量不足', value: 5 });
        }

        if (resolvedMetrics.averageSentenceLength > 70) {
            score -= 10;
            penalties.push({ label: '1文が長すぎる', value: 10 });
        } else if (resolvedMetrics.averageSentenceLength > 55) {
            score -= 5;
            penalties.push({ label: '1文がやや長い', value: 5 });
        }

        if (resolvedMetrics.kanjiPercent < 12 || resolvedMetrics.kanjiPercent > 50) {
            score -= 7;
            penalties.push({ label: '漢字率バランス', value: 7 });
        } else if (resolvedMetrics.kanjiPercent < 15 || resolvedMetrics.kanjiPercent > 45) {
            score -= 3;
            penalties.push({ label: '漢字率バランス', value: 3 });
        }

        const normalizedScore = Math.max(0, Math.min(100, Math.round(score)));
        const level = normalizedScore >= 85 ? 'good' : normalizedScore >= 65 ? 'warn' : 'bad';
        const grade = normalizedScore >= 95 ? 'S'
            : normalizedScore >= 85 ? 'A'
                : normalizedScore >= 75 ? 'B'
                    : normalizedScore >= 65 ? 'C'
                        : normalizedScore >= 50 ? 'D'
                            : 'E';

        return {
            score: normalizedScore,
            grade,
            level,
            penalties
        };
    }

    _buildComprehensiveChecks({ matchCount, doubleHonorificIssues = [], writingScore, metrics } = {}) {
        const safeMatchCount = Number.isFinite(matchCount) ? Math.max(0, matchCount) : 0;
        const safeDoubleCount = Array.isArray(doubleHonorificIssues) ? doubleHonorificIssues.length : 0;
        const safeMetrics = metrics || {
            noSpaceChars: 0,
            averageSentenceLength: 0,
            kanjiPercent: 0
        };
        const scoreValue = writingScore?.score ?? 0;

        const items = [
            {
                id: 'rule_violations',
                label: 'ルール違反',
                level: safeMatchCount === 0 ? 'pass' : 'fail',
                detail: safeMatchCount === 0 ? '検出なし' : `${safeMatchCount}件検出`
            },
            {
                id: 'double_honorific',
                label: '二重敬語',
                level: safeDoubleCount === 0 ? 'pass' : 'fail',
                detail: safeDoubleCount === 0 ? '検出なし' : `${safeDoubleCount}件検出`
            },
            {
                id: 'sentence_length',
                label: '1文の長さ',
                level: safeMetrics.averageSentenceLength <= 55 ? 'pass'
                    : safeMetrics.averageSentenceLength <= 70 ? 'warn'
                        : 'fail',
                detail: `平均${safeMetrics.averageSentenceLength}文字`
            },
            {
                id: 'kanji_balance',
                label: '漢字率',
                level: (safeMetrics.kanjiPercent >= 20 && safeMetrics.kanjiPercent <= 40) ? 'pass'
                    : (safeMetrics.kanjiPercent >= 15 && safeMetrics.kanjiPercent <= 45) ? 'warn'
                        : 'fail',
                detail: `${safeMetrics.kanjiPercent}%`
            },
            {
                id: 'text_volume',
                label: '文章量',
                level: safeMetrics.noSpaceChars >= 60 ? 'pass'
                    : safeMetrics.noSpaceChars >= 30 ? 'warn'
                        : 'fail',
                detail: `${safeMetrics.noSpaceChars}文字(空白除く)`
            },
            {
                id: 'writing_score',
                label: '総合スコア',
                level: scoreValue >= 80 ? 'pass' : scoreValue >= 65 ? 'warn' : 'fail',
                detail: `${scoreValue}点`
            }
        ];

        const failCount = items.filter((item) => item.level === 'fail').length;
        const warnCount = items.filter((item) => item.level === 'warn').length;
        const passCount = items.length - failCount - warnCount;

        const status = failCount === 0 && warnCount <= 1 ? '良好'
            : failCount <= 1 && scoreValue >= 65 ? '要改善'
                : '要修正';
        const level = status === '良好' ? 'good' : status === '要改善' ? 'warn' : 'bad';

        return {
            status,
            level,
            passCount,
            warnCount,
            failCount,
            items
        };
    }

    _updateWritingScoreStatus(scoreData) {
        if (!this.writingScoreStatus) return;
        const chip = this.writingScoreStatus.closest('.status-chip');
        if (chip) chip.classList.remove('is-good', 'is-warn', 'is-bad');

        if (!scoreData) {
            this.writingScoreStatus.textContent = '-';
            return;
        }

        this.writingScoreStatus.textContent = `${scoreData.score}点 (${scoreData.grade})`;
        if (chip) chip.classList.add(`is-${scoreData.level}`);
    }

    _updateComprehensiveStatus(summary) {
        if (!this.comprehensiveStatus) return;
        const chip = this.comprehensiveStatus.closest('.status-chip');
        if (chip) chip.classList.remove('is-good', 'is-warn', 'is-bad');

        if (!summary) {
            this.comprehensiveStatus.textContent = '-';
            return;
        }

        this.comprehensiveStatus.textContent = `${summary.status} (${summary.failCount}NG)`;
        if (chip) chip.classList.add(`is-${summary.level}`);
    }

    _updateSaveStateStatus() {
        if (!this.saveStateStatus) return;
        this.saveStateStatus.textContent = this._hasUnsavedEdits ? '未保存' : '保存済み';
    }

    _setGuideStepDone(stepKey) {
        if (!Object.hasOwn(this._guideProgress, stepKey)) return;
        this._guideProgress[stepKey] = true;
        this._updateGuideProgressUI();
    }

    _updateGuideProgressUI() {
        if (this.guideStepSample) this.guideStepSample.classList.toggle('is-done', this._guideProgress.sample);
        if (this.guideStepReplace) this.guideStepReplace.classList.toggle('is-done', this._guideProgress.replace);
        if (this.guideStepDiff) this.guideStepDiff.classList.toggle('is-done', this._guideProgress.diff);
    }

    _insertSampleText() {
        const sample = `お世話になっております。\n\n本日は先日の打ち合わせの件についてご連絡致します。\n以下の内容を確認して頂ければ幸いです。\n\n全ての資料を添付しておりますので、ご確認下さい。\n何卒宜しくお願い致します。\n\n尚、不明な点が御座いましたら、何時でもご連絡下さい。\n了解しましたと返信を頂けますと幸いです。\n\n※この文章には**AI装飾**と表記ゆれが含まれています。`;
        this._replaceTextareaContent(sample);
        this._setGuideStepDone('sample');
        this.analyzeText();
        this._showToast('サンプルテキストを挿入しました', 'fa-flask');
    }

    _openFullCheckModalFromCurrentText() {
        if (!this.sourceText.value) {
            this._showToast('テキストが入力されていません', 'fa-info-circle');
            return;
        }

        if (!this._latestAnalysis || this._latestAnalysis.text !== this.sourceText.value) {
            this.analyzeText();
        }
        if (!this._latestAnalysis) return;

        this._showComprehensiveCheckModal(this._latestAnalysis);
    }

    _showComprehensiveCheckModal(analysis) {
        const existing = document.getElementById('fullCheckModal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'fullCheckModal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content modal-content-lg">
                <div class="modal-header">
                    <h2><i class="fa-solid fa-clipboard-check"></i> 全部盛りチェック</h2>
                    <button class="btn-close" id="closeFullCheckModal"><i class="fa-solid fa-xmark"></i></button>
                </div>
                <div class="modal-body comprehensive-modal-body">
                    <section class="comprehensive-score">
                        <p class="comprehensive-score-label">文章スコア</p>
                        <p class="comprehensive-score-value" id="fullCheckScoreValue"></p>
                        <p class="comprehensive-score-meta" id="fullCheckScoreMeta"></p>
                    </section>
                    <section>
                        <h3 class="comprehensive-section-title">判定内訳</h3>
                        <div id="comprehensiveCheckList" class="comprehensive-list"></div>
                    </section>
                    <section>
                        <h3 class="comprehensive-section-title">二重敬語の検出</h3>
                        <div id="doubleHonorificList" class="comprehensive-issues"></div>
                    </section>
                </div>
                <div class="modal-footer modal-footer--compact">
                    <button class="btn btn-sm btn-ghost" id="fullCheckShareBtn"><i class="fa-brands fa-x-twitter"></i> Xで共有</button>
                    <button class="btn btn-sm btn-primary" id="fullCheckCloseBtn">閉じる</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        const scoreValue = modal.querySelector('#fullCheckScoreValue');
        const scoreMeta = modal.querySelector('#fullCheckScoreMeta');
        scoreValue.textContent = `${analysis.writingScore.score}点 (${analysis.writingScore.grade})`;
        scoreValue.classList.add(`is-${analysis.writingScore.level}`);
        scoreMeta.textContent = `全部盛り判定: ${analysis.comprehensiveSummary.status} / 検出: ${analysis.matchCount}件`;

        const checksEl = modal.querySelector('#comprehensiveCheckList');
        for (const item of analysis.comprehensiveSummary.items) {
            const row = document.createElement('div');
            row.className = `comprehensive-row is-${item.level}`;

            const label = document.createElement('span');
            label.className = 'comprehensive-row-label';
            label.textContent = item.label;

            const detail = document.createElement('span');
            detail.className = 'comprehensive-row-detail';
            detail.textContent = item.detail;

            row.append(label, detail);
            checksEl.appendChild(row);
        }

        const issuesEl = modal.querySelector('#doubleHonorificList');
        if (analysis.doubleHonorificIssues.length === 0) {
            const ok = document.createElement('p');
            ok.className = 'comprehensive-empty';
            ok.textContent = '二重敬語は検出されませんでした。';
            issuesEl.appendChild(ok);
        } else {
            const list = document.createElement('ul');
            list.className = 'comprehensive-issue-list';
            analysis.doubleHonorificIssues.slice(0, 10).forEach((issue) => {
                const item = document.createElement('li');
                const phrase = document.createElement('code');
                phrase.textContent = issue.phrase;
                const suggestion = document.createElement('span');
                suggestion.textContent = ` ${issue.suggestion}`;
                item.append(phrase, suggestion);
                list.appendChild(item);
            });
            issuesEl.appendChild(list);
        }

        const close = () => modal.remove();
        modal.querySelector('#closeFullCheckModal').addEventListener('click', close);
        modal.querySelector('#fullCheckCloseBtn').addEventListener('click', close);
        modal.querySelector('#fullCheckShareBtn').addEventListener('click', () => {
            this._shareScoreToX();
        });
        modal.addEventListener('click', (e) => {
            if (e.target === modal) close();
        });
    }

    _buildScoreShareText(analysis = this._latestAnalysis) {
        if (!analysis?.writingScore || !analysis?.comprehensiveSummary) {
            return 'Writer Checkerで文章チェック中です。 #WriterChecker';
        }
        return `私の文章スコアは${analysis.writingScore.score}点（${analysis.writingScore.grade}）、全部盛り判定は「${analysis.comprehensiveSummary.status}」。あなたは何点？ #WriterChecker`;
    }

    async _shareScoreToX() {
        if (!this.sourceText.value) {
            this._showToast('テキストを入力してから共有してください', 'fa-info-circle');
            return;
        }

        if (!this._latestAnalysis || this._latestAnalysis.text !== this.sourceText.value) {
            this.analyzeText();
        }
        if (!this._latestAnalysis) return;

        const shareText = this._buildScoreShareText(this._latestAnalysis);
        const intentUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(location.href)}`;
        const popup = window.open(intentUrl, '_blank', 'noopener,noreferrer');
        if (popup) {
            this._showToast('X共有画面を開きました', 'fa-brands fa-x-twitter');
            return;
        }

        try {
            await navigator.clipboard.writeText(`${shareText}\n${location.href}`);
            this._showToast('ポップアップがブロックされたため共有文をコピーしました', 'fa-copy');
        } catch {
            this._showToast('共有ウィンドウを開けませんでした', 'fa-triangle-exclamation');
        }
    }

    // =========================================================================
    //  ユーティリティ
    // =========================================================================

    _markRulesDirty() {
        this._hasUnsavedEdits = true;
        this._updateSaveStateStatus();
    }

    _createRuleSet(name) {
        if (!this._isSafeRuleSetName(name)) return false;
        if (this.allRuleSets[name]) return false;

        this.allRuleSets[name] = [];
        this.activeSetName = name;
        this.rules = this.allRuleSets[this.activeSetName];
        this.storageManager.saveAllRuleSets(this.allRuleSets);
        this.storageManager.saveActiveSetName(this.activeSetName);
        this.ruleEngine.setRules(this.rules);
        this.populateRuleSetSelector();
        this.analyzeText();
        return true;
    }

    _isSafeRuleSetName(name) {
        return typeof name === 'string'
            && name.trim().length > 0
            && name !== '__proto__'
            && name !== 'constructor'
            && name !== 'prototype';
    }

    _sanitizeImportedRuleArray(rules) {
        if (!Array.isArray(rules)) return null;
        return rules
            .filter((r) => typeof r === 'object' && r !== null && typeof r.target === 'string')
            .map((r) => {
                const rule = {
                    target: r.target,
                    replacement: typeof r.replacement === 'string' ? r.replacement : ''
                };
                if (r.isRegex === true) rule.isRegex = true;
                if (r.enabled === false) rule.enabled = false;
                if (typeof r.memo === 'string' && r.memo) rule.memo = r.memo;
                return rule;
            });
    }

    _syncActiveRules() {
        if (!Object.hasOwn(this.allRuleSets, this.activeSetName)) {
            this.activeSetName = Object.keys(this.allRuleSets)[0];
            this.storageManager.saveActiveSetName(this.activeSetName);
        }
        this.rules = this.allRuleSets[this.activeSetName];
        this.ruleEngine.setRules(this.rules);
    }

    _isValidIncomingText(text) {
        return typeof text === 'string'
            && text.length > 0
            && text.length <= this.MAX_INCOMING_TEXT_LENGTH;
    }

    _applyIncomingText(text, sourceName) {
        if (!this._isValidIncomingText(text)) {
            this._showToast('受信テキストが無効です。文字数と内容を確認してください。', 'fa-triangle-exclamation');
            return;
        }
        this._replaceTextareaContent(text);
        this.analyzeText();
        this._showToast(`${sourceName}からテキストを受信しました`);
    }

    _importFromWindowName() {
        if (!window.name) return;
        try {
            const payload = JSON.parse(window.name);
            if (!payload || payload.type !== 'writerChecker') return;
            window.name = '';
            this._applyIncomingText(payload.text, 'ブックマークレット');
        } catch {
            // Writer Checker向けでないwindow.nameは無視
        }
    }

    _buildBookmarkletHref(appUrl) {
        const selector = 'textarea,div[contenteditable=true],.ProseMirror,.ql-editor,[role=textbox]';
        const noInputMsg = 'テキストエリアが見つかりません';
        const emptyMsg = 'テキストが空です';
        const popupMsg = 'ポップアップを許可してから再実行してください';

        return `javascript:(function(){var appUrl=${JSON.stringify(appUrl)};var t=document.querySelector(${JSON.stringify(selector)});if(!t){alert(${JSON.stringify(noInputMsg)});return;}var txt=t.innerText||t.value||'';if(!txt){alert(${JSON.stringify(emptyMsg)});return;}var w=window.open(appUrl,'WriterChecker');if(!w){alert(${JSON.stringify(popupMsg)});return;}try{w.name=JSON.stringify({type:'writerChecker',text:txt,ts:Date.now()});if(w.focus){w.focus();}}catch(e){alert(${JSON.stringify(popupMsg)});}})();`;
    }

    _setupBookmarkletLink() {
        if (!this.bookmarkletLink) return;
        const appUrl = `${location.origin}${location.pathname}`;
        this.bookmarkletLink.href = this._buildBookmarkletHref(appUrl);
    }

    _findRuleForHighlight(targetText, ruleIndex, ruleTarget = null) {
        if (Number.isInteger(ruleIndex) && ruleIndex >= 0 && ruleIndex < this.rules.length) {
            const candidate = this.rules[ruleIndex];
            if (typeof ruleTarget !== 'string' || candidate.target === ruleTarget) {
                return candidate;
            }
        }
        if (typeof ruleTarget === 'string') {
            const byRuleTarget = this.rules.find((r) => r.target === ruleTarget);
            if (byRuleTarget) return byRuleTarget;
        }
        return this.rules.find((r) => r.target === targetText);
    }

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
        icon.className = iconName.includes(' ')
            ? iconName
            : `fa-solid ${iconName}`;
        this.toast.appendChild(icon);
        this.toast.appendChild(document.createTextNode(` ${message}`));

        this.toast.classList.remove('hidden');
        this._toastTimer = setTimeout(() => {
            this.toast.classList.add('hidden');
            this._toastTimer = null;
        }, 3000);
    }

    _showConfirm(message, onConfirm, options = {}) {
        this.confirmModalMsg.textContent = '';
        const lines = message.split('\n');
        lines.forEach((line, i) => {
            this.confirmModalMsg.appendChild(document.createTextNode(line));
            if (i < lines.length - 1) this.confirmModalMsg.appendChild(document.createElement('br'));
        });
        this.confirmModalOkBtn.textContent = options.okText || '実行する';
        this.confirmModalCancelBtn.textContent = options.cancelText || 'キャンセル';
        this.confirmModalOkBtn.classList.toggle('btn-danger', options.danger === true);

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

    // C-3: エラーメッセージを具体化したインポート処理
    _processImportedJSON(jsonString) {
        try {
            let data;
            try {
                data = JSON.parse(jsonString);
            } catch (parseErr) {
                this._showToast('JSONの解析に失敗しました。ファイルが破損しているか、JSON形式ではありません。', 'fa-triangle-exclamation');
                return;
            }

            if (typeof data !== 'object' || data === null || Array.isArray(data)) {
                this._showToast('ファイル形式が正しくありません。Writer Checkerからエクスポートした .json ファイルを選択してください。', 'fa-triangle-exclamation');
                return;
            }

            if (Object.keys(data).length === 0) {
                this._showToast('ファイルにルールセットが含まれていません。空のファイルです。', 'fa-triangle-exclamation');
                return;
            }

            let importCount = 0;
            let skippedCount = 0;
            const overwrittenKeys = [];

            for (const key of Object.keys(data)) {
                if (!this._isSafeRuleSetName(key)) {
                    skippedCount++;
                    continue;
                }

                const validRules = this._sanitizeImportedRuleArray(data[key]);
                if (validRules === null) {
                    skippedCount++;
                    continue;
                }

                if (this.allRuleSets[key] && this.allRuleSets[key].length > 0) {
                    overwrittenKeys.push(key);
                }
                this.allRuleSets[key] = validRules;
                importCount++;
            }

            if (importCount > 0) {
                this.storageManager.saveAllRuleSets(this.allRuleSets);
                this._syncActiveRules();
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
                this._showToast('有効なルールセットが見つかりませんでした。各ルールに「target」プロパティが必要です。', 'fa-triangle-exclamation');
            }
        } catch (err) {
            console.error('Import error', err);
            this._showToast('予期しないエラーが発生しました。ファイルの内容を確認してください。', 'fa-triangle-exclamation');
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
                if (!this._isSafeRuleSetName(key)) continue;
                const validRules = this._sanitizeImportedRuleArray(imported[key]);
                if (validRules === null) continue;
                this.allRuleSets[key] = validRules;
                count++;
            }
            if (count > 0) {
                this.storageManager.saveAllRuleSets(this.allRuleSets);
                this._syncActiveRules();
                this.populateRuleSetSelector();
                this.renderRulesList();
                this.analyzeText();
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
        if (url.length > this.MAX_SHARE_URL_LENGTH) {
            this._showToast('ルールが多いため共有リンクが長くなっています。一部のSNSでは正しく動作しない場合があります。', 'fa-triangle-exclamation');
        }
        return url;
    }

    // =========================================================================
    //  F-02: プリセット説明ツールチップ
    // =========================================================================

    _updatePresetTooltip() {
        const desc = this.storageManager.presetDescriptions[this.activeSetName];
        if (this.presetTooltip) {
            this.presetTooltip.textContent = desc || `カスタムルール ${this.rules.length}件`;
        }
        if (this.headerSampleBtn) {
            this.headerSampleBtn.title = desc || `カスタムルール ${this.rules.length}件`;
        }
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

    _buildRegexFromRule(rule) {
        if (!rule || typeof rule.target !== 'string' || rule.target.length === 0) return null;
        try {
            const escapeRegExp = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const pattern = rule.isRegex ? rule.target : escapeRegExp(rule.target);
            return new RegExp(pattern, 'g');
        } catch {
            return null;
        }
    }

    _applyRegexIndividualFix(source, rule, replacementText, matchedText, occurrenceIndex) {
        const regex = this._buildRegexFromRule(rule);
        if (!regex) return null;

        let match;
        let found = 0;
        regex.lastIndex = 0;

        while ((match = regex.exec(source)) !== null) {
            if (match[0] === '' && regex.lastIndex === match.index) {
                regex.lastIndex++;
                continue;
            }

            if (match[0] !== matchedText) continue;
            if (found !== occurrenceIndex) {
                found++;
                continue;
            }

            let replacedSegment = replacementText || '';
            if (rule.isRegex) {
                try {
                    const singleRegex = new RegExp(rule.target);
                    replacedSegment = match[0].replace(singleRegex, replacementText || '');
                } catch {
                    replacedSegment = replacementText || '';
                }
            }

            const before = source.substring(0, match.index);
            const after = source.substring(match.index + match[0].length);
            return before + replacedSegment + after;
        }

        return null;
    }

    _applyIndividualFix(targetText, replacementText, occurrenceIndex, options = {}) {
        const source = this.sourceText.value;
        const ruleIndex = Number.isInteger(options.ruleIndex) ? options.ruleIndex : null;
        const matchedText = typeof options.matchedText === 'string' ? options.matchedText : '';
        const lookupText = matchedText || targetText;
        if (!lookupText) return;

        if (ruleIndex !== null && ruleIndex >= 0 && ruleIndex < this.rules.length) {
            const rule = this.rules[ruleIndex];
            if (rule?.isRegex) {
                const regexReplaced = this._applyRegexIndividualFix(
                    source,
                    rule,
                    replacementText,
                    lookupText,
                    occurrenceIndex
                );
                if (regexReplaced !== null) {
                    this._replaceTextareaContent(regexReplaced);
                    this.analyzeText();
                    return;
                }
            }
        }

        let currentIndex = -1;
        let found = 0;
        let startPos = 0;

        while (startPos < source.length) {
            currentIndex = source.indexOf(lookupText, startPos);
            if (currentIndex === -1) break;
            if (found === occurrenceIndex) break;
            found++;
            startPos = currentIndex + 1;
        }

        if (currentIndex !== -1 && found === occurrenceIndex) {
            const before = source.substring(0, currentIndex);
            const after = source.substring(currentIndex + lookupText.length);
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
                this._markRulesDirty();
                this._showToast(`${templates.length}件のテンプレートを追加しました`);
            },
            { okText: '追加する' }
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
        const metrics = this._collectTextMetrics(text);
        const doubleHonorificIssues = this._findDoubleHonorificIssues(text);
        const writingScore = this._calculateWritingScore({
            text,
            matchCount: changes.length,
            doubleHonorificIssues,
            metrics
        });
        const comprehensiveSummary = this._buildComprehensiveChecks({
            matchCount: changes.length,
            doubleHonorificIssues,
            writingScore,
            metrics
        });

        let report = `═════ Writer Checker レポート ═════\n`;
        report += `日時: ${new Date().toLocaleString('ja-JP')}\n`;
        report += `ルールセット: ${this.activeSetName}\n`;
        report += `文字数: ${metrics.totalChars} / 空白なし: ${metrics.noSpaceChars}\n`;
        report += `漢字率: ${metrics.kanjiPercent}%\n`;
        report += `文章スコア: ${writingScore.score}点 (${writingScore.grade})\n`;
        report += `全部盛り判定: ${comprehensiveSummary.status}\n`;
        report += `二重敬語: ${doubleHonorificIssues.length}件\n`;
        report += `検出数: ${changes.length}件\n\n`;

        if (doubleHonorificIssues.length > 0) {
            report += `─── 二重敬語の検出 ───\n`;
            doubleHonorificIssues.slice(0, 10).forEach((issue, index) => {
                report += `${index + 1}. 「${issue.phrase}」 -> ${issue.suggestion}\n`;
            });
            report += '\n';
        }

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
    // =========================================================================
    //  B-1: 差分ビュー（修正前後の比較）
    // =========================================================================

    _showDiffView(changes) {
        if (changes.length === 0) return;
        this._setGuideStepDone('diff');

        // 既存の差分ビューを削除
        const existing = document.getElementById('diffViewModal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'diffViewModal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content modal-content-sm" style="max-width:560px;">
                <div class="modal-header">
                    <h2><i class="fa-solid fa-code-compare"></i> 修正結果 (${changes.length}件)</h2>
                    <button class="btn-close" id="closeDiffView"><i class="fa-solid fa-xmark"></i></button>
                </div>
                <div class="modal-body" style="max-height:400px;overflow-y:auto;padding:1rem 1.5rem;">
                    <div id="diffList" class="diff-list"></div>
                </div>
                <div class="modal-footer" style="padding:0.75rem 1.5rem;text-align:right;border-top:1px solid var(--border-color);">
                    <button class="btn btn-sm btn-primary" id="closeDiffOk">OK</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        const diffList = document.getElementById('diffList');
        const grouped = {};
        for (const c of changes) {
            const key = `${c.from}→${c.to}`;
            grouped[key] = grouped[key] || { from: c.from, to: c.to, count: 0 };
            grouped[key].count++;
        }
        for (const item of Object.values(grouped)) {
            const row = document.createElement('div');
            row.className = 'diff-row';
            row.innerHTML = `
                <span class="diff-del">${this._escapeHtml(item.from)}</span>
                <span class="diff-arrow">→</span>
                <span class="diff-ins">${this._escapeHtml(item.to || '（削除）')}</span>
                ${item.count > 1 ? `<span class="diff-count">×${item.count}</span>` : ''}
            `;
            diffList.appendChild(row);
        }

        const close = () => modal.remove();
        document.getElementById('closeDiffView').addEventListener('click', close);
        document.getElementById('closeDiffOk').addEventListener('click', close);
        modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
    }

    _escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // =========================================================================
    //  B-4: ハイライト右クリック「このルールを無視」
    // =========================================================================

    _bindContextMenu() {
        this.resultOutput.addEventListener('contextmenu', (e) => {
            const highlight = e.target.closest('.highlight');
            if (!highlight) return;
            e.preventDefault();

            // 既存メニューを削除
            this._removeContextMenu();

            const targetText = highlight.getAttribute('data-target');
            const ruleIndexRaw = parseInt(highlight.getAttribute('data-rule-index'), 10);
            const ruleIndex = Number.isNaN(ruleIndexRaw) ? null : ruleIndexRaw;
            const ruleTarget = highlight.getAttribute('data-rule-target');
            const displayTargetText = targetText || '対象';
            const menu = document.createElement('div');
            menu.className = 'context-menu';
            menu.innerHTML = `
                <button class="context-menu-item" data-action="ignore">
                    <i class="fa-solid fa-eye-slash"></i> 「${this._escapeHtml(displayTargetText.substring(0, 15))}」のルールを無効化
                </button>
            `;
            menu.style.left = `${e.pageX}px`;
            menu.style.top = `${e.pageY}px`;
            document.body.appendChild(menu);

            menu.querySelector('[data-action="ignore"]').addEventListener('click', () => {
                const rule = this._findRuleForHighlight(targetText, ruleIndex, ruleTarget);
                if (rule) {
                    rule.enabled = false;
                    this.ruleEngine.setRules(this.rules);
                    this.allRuleSets[this.activeSetName] = this.rules;
                    this.storageManager.saveAllRuleSets(this.allRuleSets);
                    this.renderRuleToggleList();
                    this.analyzeText();
                    this._showToast(`「${displayTargetText}」のルールを無効化しました`, 'fa-eye-slash');
                }
                this._removeContextMenu();
            });

            // クリックで閉じる
            const closeMenu = (ev) => {
                if (!menu.contains(ev.target)) {
                    this._removeContextMenu();
                    document.removeEventListener('click', closeMenu);
                }
            };
            setTimeout(() => document.addEventListener('click', closeMenu), 0);
        });
    }

    _removeContextMenu() {
        const old = document.querySelector('.context-menu');
        if (old) old.remove();
    }
}
