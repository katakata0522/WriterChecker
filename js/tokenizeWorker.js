import { RuleEngine } from './RuleEngine.js';

const engine = new RuleEngine();

self.addEventListener('message', (event) => {
    const { requestId, text, rules } = event.data || {};
    if (!Number.isInteger(requestId) || typeof text !== 'string' || !Array.isArray(rules)) {
        self.postMessage({ requestId, error: 'invalid_payload' });
        return;
    }
    try {
        engine.setRules(rules);
        self.postMessage({ requestId, tokens: engine.tokenize(text) });
    } catch (error) {
        self.postMessage({ requestId, error: error?.message || 'tokenize_failed' });
    }
});
