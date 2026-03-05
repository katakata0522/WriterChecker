/**
 * Writer Checker — エントリーポイント
 * 各モジュールの初期化を行う。
 */
import { StorageManager } from './StorageManager.js';
import { RuleEngine } from './RuleEngine.js';
import { UIManager } from './UIManager.js';

document.addEventListener('DOMContentLoaded', () => {
    const storageManager = new StorageManager();
    const ruleEngine = new RuleEngine();
    const uiManager = new UIManager(storageManager, ruleEngine);

    uiManager.analyzeText();
});
