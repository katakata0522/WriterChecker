import { RuleEngine } from './RuleEngine.js';
import { StorageManager } from './StorageManager.js';
import { UIManager } from './UIManager.js';
import { applyRuleSchemaV3 } from './RuleSchemaV3Enhancer.js';
import { applyRulePolicyV3 } from './RulePolicyV3Enhancer.js';
import { applyRulePolicyV3Engine } from './RulePolicyV3Engine.js';

applyRuleSchemaV3({ StorageManager, RuleEngine, UIManager });
applyRulePolicyV3({ RuleEngine, UIManager });
applyRulePolicyV3Engine({ RuleEngine });

const engine = new RuleEngine();

self.addEventListener('message', (event) => {
    const { requestId, text, rules, removeAsterisks } = event.data || {};
    if (!Number.isInteger(requestId) || typeof text !== 'string' || !Array.isArray(rules)) {
        self.postMessage({ requestId, error: 'invalid_payload' });
        return;
    }

    try {
        // Worker内でも本体と同じV3ルール・除外・自動修正・全文正規表現を使う
        engine.setRules(rules);
        engine.setRemoveAsterisks(removeAsterisks !== false);
        const tokens = engine.tokenize(text);
        self.postMessage({ requestId, tokens });
    } catch (error) {
        self.postMessage({ requestId, error: error?.message || 'tokenize_failed' });
    }
});