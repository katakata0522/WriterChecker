/**
 * Writer Checker — エントリーポイント
 * 各モジュールの初期化を行う。
 */
import { StorageManager } from './StorageManager.js';
import { RuleEngine } from './RuleEngine.js';
import { UIManager } from './UIManager.js';
import { initPWA } from './PWAManager.js';
import { AnalyticsManager } from './AnalyticsManager.js';
import { applyRuleSchemaV3 } from './RuleSchemaV3Enhancer.js';

applyRuleSchemaV3({ StorageManager, RuleEngine, UIManager });

document.addEventListener('DOMContentLoaded', () => {
    const storageManager = new StorageManager();
    const ruleEngine = new RuleEngine();
    const analyticsManager = new AnalyticsManager({
        enabled: storageManager.loadAnalyticsEnabled()
    });
    const uiManager = new UIManager(storageManager, ruleEngine, analyticsManager);

    analyticsManager.track('app_loaded', analyticsManager.getMeasurementReadiness());
    uiManager.analyzeText();
    initPWA();
});