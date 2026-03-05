import { RuleEngine } from './RuleEngine.js';

const engine = new RuleEngine();

self.addEventListener('message', (event) => {
    const { requestId, text, rules, removeAsterisks } = event.data || {};
    if (!Number.isInteger(requestId) || typeof text !== 'string' || !Array.isArray(rules)) {
        self.postMessage({ requestId, error: 'invalid_payload' });
        return;
    }

    try {
        // Worker内でも本体と同じルール適用ロジックを使う
        engine.setRules(rules);
        engine.setRemoveAsterisks(removeAsterisks !== false);
        const tokens = engine.tokenize(text);
        self.postMessage({ requestId, tokens });
    } catch (error) {
        self.postMessage({ requestId, error: error?.message || 'tokenize_failed' });
    }
});
