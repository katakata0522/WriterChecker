import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const workflowPath = path.join(projectRoot, '.github', 'workflows', 'quality-gate.yml');
const packagePath = path.join(projectRoot, 'package.json');

describe('Regression automation guard', () => {
    it('GitHub Actionsの品質ゲートが存在する', () => {
        const exists = fs.existsSync(workflowPath);
        assert.strictEqual(exists, true);
    });

    it('package.jsonに回帰チェック用スクリプトが定義されている', () => {
        const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
        assert.ok(pkg.scripts['test:regression']);
        assert.ok(pkg.scripts['qa:gate']);
    });
});

