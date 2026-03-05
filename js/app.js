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

    // Service Worker撤去: 既存SWがあれば自動解除
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then((regs) => {
            regs.forEach((reg) => reg.unregister());
        });
        caches.keys().then((keys) => {
            keys.forEach((key) => caches.delete(key));
        });
    }
});
