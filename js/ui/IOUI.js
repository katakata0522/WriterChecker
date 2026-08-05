import { normalizeRuleV3, RULE_SCHEMA_VERSION, VALID_SEVERITIES } from '../RuleSchema.js';
import { MAX_INCOMING_TEXT_LENGTH, MAX_SHARE_URL_LENGTH, SEVERITY_LABELS } from './UIShared.js';

const MAX_IMPORT_BYTES = 2_000_000;

export const IOMethods = {
_bindImportExportEvents() {
        this.exportRulesBtn?.addEventListener('click', () => this._exportRules());
        this.importRulesBtn?.addEventListener('click', () => this.importFileInput.click());
        this.importFileInput?.addEventListener('change', (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            if (file.size > MAX_IMPORT_BYTES) {
                this._showToast('2MB以下のルールJSONを選択してください', 'fa-triangle-exclamation');
                event.target.value = '';
                return;
            }
            const reader = new FileReader();
            reader.onload = () => this._processImportedJSON(reader.result);
            reader.readAsText(file);
            event.target.value = '';
        });
        this.shareRulesBtn?.addEventListener('click', async () => {
            const link = this._generateShareLink();
            try {
                await navigator.clipboard.writeText(link);
                this._showToast('共有リンクをコピーしました', 'fa-link');
            } catch {
                this._showToast('共有リンクをコピーできませんでした', 'fa-triangle-exclamation');
            }
        });
    },

_bindExternalEvents() {
        this._setupBookmarkletLink();
        this._importFromWindowName();
        this._importFromHash();
        if (typeof window !== 'undefined') {
            window.addEventListener('beforeunload', () => this._disposeTokenizeWorker());
            window.addEventListener('message', (event) => {
                if (!event.data || event.data.type !== 'writerChecker' || event.source !== window.opener) return;
                this._applyIncomingText(event.data.text, 'ブックマークレット');
            });
        }
    },

_bindDragDropEvents() {
        const pane = this.sourceText?.closest('.editor-pane');
        if (!pane) return;
        pane.addEventListener('dragover', (event) => { event.preventDefault(); pane.classList.add('editor-pane--dragover'); });
        pane.addEventListener('dragleave', () => pane.classList.remove('editor-pane--dragover'));
        pane.addEventListener('drop', (event) => {
            event.preventDefault();
            pane.classList.remove('editor-pane--dragover');
            const file = event.dataTransfer?.files?.[0];
            if (!file) return;
            if (!file.name.endsWith('.txt') && !file.type.startsWith('text/')) {
                this._showToast('テキストファイルのみ読み込めます', 'fa-triangle-exclamation');
                return;
            }
            if (file.size > MAX_INCOMING_TEXT_LENGTH * 4) {
                this._showToast('文章ファイルが大きすぎます', 'fa-triangle-exclamation');
                return;
            }
            const reader = new FileReader();
            reader.onload = () => {
                if (!this._isValidIncomingText(reader.result)) {
                    this._showToast('20万文字以内の文章を読み込んでください', 'fa-triangle-exclamation');
                    return;
                }
                this._replaceTextareaContent(reader.result);
                this.analyzeText();
            };
            reader.readAsText(file);
        });
    },

_exportRules() {
        const payload = { format: 'writer-checker-rules', schemaVersion: RULE_SCHEMA_VERSION, exportedAt: new Date().toISOString(), ruleSets: this.allRuleSets };
        this._downloadText(JSON.stringify(payload, null, 2), 'writer-checker-rules.json', 'application/json');
        this._showToast('ルールをエクスポートしました');
    },

_sanitizeImportedRuleArray(rules) {
        if (!Array.isArray(rules)) return null;
        return rules.map(normalizeRuleV3).filter(Boolean);
    },

_processImportedJSON(jsonString) {
        try {
            if (typeof jsonString !== 'string' || jsonString.length > MAX_IMPORT_BYTES) {
                this._showToast('インポートデータが大きすぎます', 'fa-triangle-exclamation');
                return false;
            }
            const parsed = JSON.parse(jsonString);
            const incoming = parsed?.format === 'writer-checker-rules' ? parsed.ruleSets : parsed;
            if (typeof incoming !== 'object' || incoming === null || Array.isArray(incoming)) {
                this._showToast('Writer CheckerのルールJSONを選択してください', 'fa-triangle-exclamation');
                return false;
            }
            let importedCount = 0;
            let renamedCount = 0;
            for (const [name, rules] of Object.entries(incoming).slice(0, 100)) {
                if (!this._isSafeRuleSetName(name)) continue;
                const normalized = this._sanitizeImportedRuleArray(rules);
                if (normalized === null) continue;
                let destinationName = name;
                if (Object.hasOwn(this.allRuleSets, destinationName)) {
                    let suffix = 1;
                    const baseName = `${name} (インポート)`;
                    destinationName = baseName;
                    while (Object.hasOwn(this.allRuleSets, destinationName)) destinationName = `${baseName} ${++suffix}`;
                    renamedCount++;
                }
                this.allRuleSets[destinationName] = normalized;
                importedCount++;
            }
            if (!importedCount) {
                this._showToast('有効なルールセットがありませんでした', 'fa-triangle-exclamation');
                return false;
            }
            this.storageManager.saveAllRuleSets(this.allRuleSets);
            this._syncActiveRules();
            this.populateRuleSetSelector();
            this.renderRulesList();
            this.analyzeText();
            const renameNote = renamedCount > 0 ? `（重複${renamedCount}件は別名で保存）` : '';
            this._showToast(`${importedCount}個のルールセットをインポートしました${renameNote}`);
            return true;
        } catch {
            this._showToast('JSONを解析できませんでした', 'fa-triangle-exclamation');
            return false;
        }
    },

_generateShareLink() {
        const payload = { format: 'writer-checker-rules', schemaVersion: RULE_SCHEMA_VERSION, ruleSets: { [this.activeSetName]: this.rules } };
        const hash = btoa(encodeURIComponent(JSON.stringify(payload)));
        const url = `${location.origin}${location.pathname}#rules=${hash}`;
        if (url.length > MAX_SHARE_URL_LENGTH) this._showToast('共有リンクが長いため、JSONエクスポートの利用を推奨します', 'fa-triangle-exclamation');
        return url;
    },

_importFromHash() {
        if (typeof location === 'undefined' || !location.hash.startsWith('#rules=')) return;
        try {
            const json = decodeURIComponent(atob(location.hash.slice('#rules='.length)));
            this._processImportedJSON(json);
            history.replaceState(null, '', location.pathname + location.search);
        } catch { /* 無効な共有リンクは安全に無視する。 */ }
    },

_exportCheckReport() {
        const text = this.sourceText.value;
        if (!text) {
            this._showToast('文章を入力してください', 'fa-circle-info');
            return;
        }
        const issues = this.ruleEngine.tokenize(text).filter((token) => token.type === 'highlight').map((token) => this._buildIssueDetail(token));
        const counts = Object.fromEntries(VALID_SEVERITIES.map((severity) => [severity, issues.filter((issue) => issue.severity === severity).length]));
        const groups = new Map();
        for (const issue of issues) {
            const group = groups.get(issue.groupKey) || { ...issue, count: 0 };
            group.count++;
            groups.set(issue.groupKey, group);
        }
        let report = '═════ Writer Checker 検査レポート ═════\n';
        report += `日時: ${new Date().toLocaleString('ja-JP')}\nルールセット: ${this.activeSetName}\nルール形式: V${RULE_SCHEMA_VERSION}\n文字数: ${text.length}\n`;
        report += `検出: ${issues.length}件（要修正 ${counts.error} / 注意 ${counts.warning} / 情報 ${counts.info}）\n要判断: ${issues.filter((issue) => !issue.autoFix).length}件\n\n`;
        if (!groups.size) report += 'ルール上の指摘はありません。\n';
        else [...groups.values()].forEach((issue, index) => {
            report += `${index + 1}. [${SEVERITY_LABELS[issue.severity]}][${issue.category}] 「${issue.ruleTarget}」 → 「${issue.replacement || '（削除）'}」 ×${issue.count}\n`;
            report += `   理由: ${issue.reason}${issue.autoFix ? '' : ' [要判断・自動修正なし]'}\n`;
            if (issue.badExample) report += `   避けたい例: ${issue.badExample}\n`;
            if (issue.goodExample) report += `   推奨例: ${issue.goodExample}\n`;
        });
        this._downloadText(report, `writer-checker-report-${new Date().toISOString().slice(0, 10)}.txt`, 'text/plain');
        this._showToast('検査レポートを保存しました');
    },

_downloadText(content, filename, type) {
        const blob = new Blob([content], { type });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        anchor.click();
        URL.revokeObjectURL(url);
    },

_isValidIncomingText(text) { return typeof text === 'string' && text.length > 0 && text.length <= MAX_INCOMING_TEXT_LENGTH; },
_applyIncomingText(text, sourceName) {
        if (!this._isValidIncomingText(text)) {
            this._showToast('受信した文章が無効です', 'fa-triangle-exclamation');
            return;
        }
        this._replaceTextareaContent(text);
        this.analyzeText();
        this._showToast(`${sourceName}から文章を受信しました`);
    },
_importFromWindowName() {
        if (typeof window === 'undefined' || !window.name) return;
        try {
            const payload = JSON.parse(window.name);
            if (payload?.type !== 'writerChecker') return;
            window.name = '';
            this._applyIncomingText(payload.text, 'ブックマークレット');
        } catch { /* Writer Checker以外のwindow.nameは無視する。 */ }
    },
_buildBookmarkletHref(appUrl) {
        const selector = 'textarea,div[contenteditable=true],.ProseMirror,.ql-editor,[role=textbox]';
        return `javascript:(function(){var appUrl=${JSON.stringify(appUrl)};var t=document.querySelector(${JSON.stringify(selector)});if(!t){alert('テキスト入力欄が見つかりません');return;}var txt=t.innerText||t.value||'';if(!txt){alert('文章が空です');return;}var w=window.open(appUrl,'WriterChecker');if(!w){alert('ポップアップを許可してください');return;}w.name=JSON.stringify({type:'writerChecker',text:txt,ts:Date.now()});if(w.focus)w.focus();})();`;
    },
_setupBookmarkletLink() {
        if (!this.bookmarkletLink || typeof location === 'undefined') return;
        this.bookmarkletLink.href = this._buildBookmarkletHref(`${location.origin}${location.pathname}`);
    }
};
