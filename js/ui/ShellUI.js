import { appendText, WORKER_THRESHOLD } from './UIShared.js';

export const ShellMethods = {
_bindSidePanelEvents() {
        this.sidePanelToggle?.addEventListener('click', () => this._openSidePanel());
        this.sidePanelClose?.addEventListener('click', () => this._closeSidePanel());
        this.sidePanelOverlay?.addEventListener('click', () => this._closeSidePanel());
    },

_bindKeyboardEvents() {
        if (typeof document === 'undefined') return;
        document.addEventListener('keydown', (event) => {
            if ((event.key === 'Enter' || event.key === ' ') && event.target.classList?.contains('highlight')) {
                event.preventDefault();
                this._handleHighlightClick(event.target);
                return;
            }
            if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                event.preventDefault();
                this.replaceBtn.click();
            }
            if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'c') {
                event.preventDefault();
                this.copyBtn.click();
            }
            if (event.key === 'Escape') {
                if (this.ruleModal && !this.ruleModal.classList.contains('hidden')) {
                    this._closeRuleModal();
                    return;
                }
                if (this.confirmModal && !this.confirmModal.classList.contains('hidden')) {
                    this.confirmModal.classList.add('hidden');
                    return;
                }
                if (this.nameModal && !this.nameModal.classList.contains('hidden')) {
                    this.nameModal.classList.add('hidden');
                    return;
                }
                this._closeSidePanel();
            }
        });
    },

_openSidePanel() {
        this.sidePanelToggle?.setAttribute('aria-expanded', 'true');
        this.sidePanel?.classList.remove('hidden');
        this.sidePanelOverlay?.classList.remove('hidden');
    },

_closeSidePanel() {
        this.sidePanelToggle?.setAttribute('aria-expanded', 'false');
        this.sidePanel?.classList.add('hidden');
        this.sidePanelOverlay?.classList.add('hidden');
    },

_showConfirm(message, onConfirm, options = {}) {
        if (!this.confirmModal) {
            onConfirm?.();
            return;
        }
        this.confirmModalMsg.textContent = message;
        this.confirmModalOkBtn.textContent = options.okText || '実行する';
        this.confirmModalOkBtn.classList.toggle('btn-danger', options.danger === true);
        this.confirmModal.classList.remove('hidden');
        const close = () => this.confirmModal.classList.add('hidden');
        this.confirmModalOkBtn.onclick = () => { close(); onConfirm?.(); };
        this.confirmModalCancelBtn.onclick = close;
        this.closeConfirmModalBtn.onclick = close;
    },

_showToast(message, iconName = 'fa-check') {
        if (!this.toast) return;
        if (this._toastTimer) clearTimeout(this._toastTimer);
        this.toast.innerHTML = '';
        const icon = document.createElement('i');
        icon.className = iconName.includes(' ') ? iconName : `fa-solid ${iconName}`;
        this.toast.append(icon);
        appendText(this.toast, ` ${message}`);
        this.toast.classList.remove('hidden');
        this._toastTimer = setTimeout(() => this.toast.classList.add('hidden'), 3200);
    },

_shouldUseWorkerForText(text) {
        return typeof text === 'string' && text.length >= WORKER_THRESHOLD && typeof Worker !== 'undefined';
    },

async _tokenizeForAnalysis(text) {
        if (!this._shouldUseWorkerForText(text)) {
            this._analysisTokensSource = 'sync';
            return this.ruleEngine.tokenize(text);
        }
        try {
            const tokens = await this._analyzeTokensInWorker(text);
            this._analysisTokensSource = 'worker';
            return tokens;
        } catch {
            this._analysisTokensSource = 'sync_fallback';
            return this.ruleEngine.tokenize(text);
        }
    },

_ensureTokenizeWorker() {
        if (this._tokenizeWorker) return this._tokenizeWorker;
        if (typeof Worker === 'undefined') return null;
        try {
            this._tokenizeWorker = new Worker(new URL('./tokenizeWorker.js', import.meta.url), { type: 'module' });
            this._tokenizeWorker.addEventListener('message', (event) => {
                const { requestId, tokens, error } = event.data || {};
                const pending = this._workerPending.get(requestId);
                if (!pending) return;
                clearTimeout(pending.timeoutId);
                this._workerPending.delete(requestId);
                if (Array.isArray(tokens)) pending.resolve(tokens);
                else pending.reject(new Error(error || 'worker_response_invalid'));
            });
            this._tokenizeWorker.addEventListener('error', () => this._disposeTokenizeWorker());
        } catch {
            this._tokenizeWorker = null;
        }
        return this._tokenizeWorker;
    },

_analyzeTokensInWorker(text) {
        return new Promise((resolve, reject) => {
            const worker = this._ensureTokenizeWorker();
            if (!worker) return reject(new Error('worker_unavailable'));
            const requestId = ++this._workerRequestSeq;
            const timeoutId = setTimeout(() => {
                this._workerPending.delete(requestId);
                this._disposeTokenizeWorker();
                reject(new Error('worker_timeout'));
            }, 2500);
            this._workerPending.set(requestId, { resolve, reject, timeoutId });
            worker.postMessage({ requestId, text, rules: this.rules });
        });
    },

_disposeTokenizeWorker() {
        for (const pending of this._workerPending.values()) {
            clearTimeout(pending.timeoutId);
            pending.reject(new Error('worker_disposed'));
        }
        this._workerPending.clear();
        this._tokenizeWorker?.terminate();
        this._tokenizeWorker = null;
    },

_track(eventName, params = {}) {
        try { this.analyticsManager?.track(eventName, params); }
        catch { /* 計測失敗で操作を止めない。 */ }
    }
};
