import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('アプリとWorkerはEnhancerを重ねず同じ直接実装を使う', () => {
    const app = read('js/app.js');
    const worker = read('js/tokenizeWorker.js');
    assert.doesNotMatch(app, /Enhancer|applyRulePolicy/);
    assert.doesNotMatch(worker, /Enhancer|applyRulePolicy/);
    assert.match(app, /StorageManager/);
    assert.match(app, /RuleEngine/);
    assert.match(worker, /RuleEngine/);
});

test('PWAは新しいスキーマ・UI・スタイル・Workerをキャッシュする', () => {
    const sw = read('sw.js');
    for (const asset of ['style-v3.css', 'js/RuleSchema.js', 'js/RuleEngine.js', 'js/StorageManager.js', 'js/UIManager.js', 'js/tokenizeWorker.js', 'js/ui/UIShared.js', 'js/ui/RuleSetUI.js', 'js/ui/RuleEditorUI.js', 'js/ui/AnalysisCoreUI.js', 'js/ui/IssueViewUI.js', 'js/ui/FixActionsUI.js', 'js/ui/IOUI.js', 'js/ui/ShellUI.js']) {
        assert.ok(sw.includes(asset), `${asset} がAPP_SHELLに必要`);
    }
});

test('UIManagerが参照するDOM IDはHTMLに存在する', () => {
    const ui = read('js/UIManager.js');
    const html = read('index.html');
    const cacheSection = ui.slice(ui.indexOf('_cacheElements()'), ui.indexOf('_bindEvents()'));
    const ids = [...cacheSection.matchAll(/byId\('([^']+)'\)/g)].map((match) => match[1]);
    for (const id of ids) assert.match(html, new RegExp(`id="${id}"`), `${id} がHTMLに必要`);
});

test('旧V3の実行時パッチ層を本番エントリから排除する', () => {
    const app = read('js/app.js');
    const sw = read('sw.js');
    for (const obsolete of ['RuleSchemaV3Enhancer', 'RulePolicyV3Enhancer', 'RulePolicyV3Engine', 'RulePolicyV3UIFix']) {
        assert.ok(!app.includes(obsolete));
        assert.ok(!sw.includes(obsolete));
    }
});
