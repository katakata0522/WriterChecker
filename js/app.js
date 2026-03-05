/**
 * Writer Checker — エントリーポイント
 * 各モジュールの初期化とService Worker登録。
 */
import { StorageManager } from './StorageManager.js';
import { RuleEngine } from './RuleEngine.js';
import { UIManager } from './UIManager.js';

document.addEventListener('DOMContentLoaded', () => {
    const storageManager = new StorageManager();
    const ruleEngine = new RuleEngine();
    const uiManager = new UIManager(storageManager, ruleEngine);

    uiManager.analyzeText();

    // Service Worker登録（HTTPSまたはlocalhost環境のみ）
    if ('serviceWorker' in navigator && window.isSecureContext) {
        navigator.serviceWorker.register('./sw.js').catch((err) => {
            console.warn('SW登録に失敗:', err);
        });
    }
});
