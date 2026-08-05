import { SEVERITY_LABELS } from './UIShared.js';

export const IssueViewMethods = {
_renderIssueGroups(issues) {
        if (!issues.length) return;
        const section = document.createElement('section');
        section.className = 'issue-insight-panel';
        const header = document.createElement('div');
        header.className = 'issue-panel-header';
        const title = document.createElement('h3');
        title.textContent = '指摘の内訳';
        const filters = document.createElement('div');
        filters.className = 'issue-filter-bar';
        filters.setAttribute('role', 'group');
        filters.setAttribute('aria-label', '重大度で絞り込み');
        header.append(title, filters);
        section.appendChild(header);

        const groups = new Map();
        for (const issue of issues) {
            const group = groups.get(issue.groupKey) || { ...issue, occurrences: [] };
            group.occurrences.push(issue);
            groups.set(issue.groupKey, group);
        }
        const ordered = [...groups.values()].sort((left, right) => {
            const order = { error: 0, warning: 1, info: 2 };
            return order[left.severity] - order[right.severity] || left.start - right.start;
        });

        const filterDefs = [
            ['all', 'すべて'], ['error', '要修正'], ['warning', '注意'], ['info', '情報']
        ];
        for (const [value, label] of filterDefs) {
            const count = value === 'all' ? ordered.length : ordered.filter((group) => group.severity === value).length;
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'issue-filter-btn';
            button.dataset.filter = value;
            button.setAttribute('aria-pressed', value === 'all' ? 'true' : 'false');
            button.textContent = `${label} ${count}`;
            filters.appendChild(button);
        }

        const list = document.createElement('div');
        list.className = 'issue-group-list';
        for (const group of ordered) list.appendChild(this._createIssueGroupCard(group));
        section.appendChild(list);
        this.resultOutput.appendChild(section);

        filters.addEventListener('click', (event) => {
            const button = event.target.closest('.issue-filter-btn');
            if (!button) return;
            filters.querySelectorAll('.issue-filter-btn').forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
            list.querySelectorAll('.issue-group-card').forEach((card) => {
                card.hidden = button.dataset.filter !== 'all' && card.dataset.severity !== button.dataset.filter;
            });
        });
    },

_createIssueGroupCard(group) {
        const card = document.createElement('article');
        card.className = 'issue-group-card';
        card.dataset.groupKey = group.groupKey;
        card.dataset.severity = group.severity;

        const heading = document.createElement('div');
        heading.className = 'issue-group-heading';
        const badges = document.createElement('div');
        badges.className = 'issue-badges';
        const severity = document.createElement('span');
        severity.className = `issue-severity issue-severity--${group.severity}`;
        severity.textContent = SEVERITY_LABELS[group.severity];
        const category = document.createElement('span');
        category.className = 'issue-category';
        category.textContent = group.category;
        badges.append(severity, category);
        if (!group.autoFix) {
            const manual = document.createElement('span');
            manual.className = 'issue-manual';
            manual.textContent = '要判断';
            badges.appendChild(manual);
        }
        const count = document.createElement('strong');
        count.className = 'issue-occurrence-count';
        count.textContent = `${group.occurrences.length}か所`;
        heading.append(badges, count);

        const change = document.createElement('p');
        change.className = 'issue-change';
        const from = document.createElement('del');
        from.textContent = group.ruleTarget || group.target;
        const arrow = document.createElement('span');
        arrow.textContent = ' → ';
        const to = document.createElement('ins');
        to.textContent = group.replacement || '（削除）';
        change.append(from, arrow, to);

        const reason = document.createElement('p');
        reason.className = 'issue-reason';
        reason.textContent = group.reason;

        const actions = document.createElement('div');
        actions.className = 'issue-group-actions';
        if (group.occurrences.length > 1) {
            const previous = document.createElement('button');
            previous.type = 'button';
            previous.className = 'btn btn-sm btn-ghost';
            previous.dataset.issueNav = 'prev';
            previous.dataset.groupKey = group.groupKey;
            previous.textContent = '前の箇所';
            const next = document.createElement('button');
            next.type = 'button';
            next.className = 'btn btn-sm btn-ghost';
            next.dataset.issueNav = 'next';
            next.dataset.groupKey = group.groupKey;
            next.textContent = '次の箇所';
            actions.append(previous, next);
        }
        if (Number.isInteger(group.ruleIndex)) {
            const disable = document.createElement('button');
            disable.type = 'button';
            disable.className = 'btn btn-sm btn-ghost issue-disable-rule';
            disable.dataset.disableRule = String(group.ruleIndex);
            disable.textContent = 'このルールを無効化';
            actions.appendChild(disable);
        }

        card.append(heading, change, reason);
        if (group.badExample || group.goodExample) {
            const examples = document.createElement('div');
            examples.className = 'issue-examples';
            if (group.badExample) {
                const bad = document.createElement('p');
                bad.textContent = `避けたい例: ${group.badExample}`;
                examples.appendChild(bad);
            }
            if (group.goodExample) {
                const good = document.createElement('p');
                good.textContent = `推奨例: ${group.goodExample}`;
                examples.appendChild(good);
            }
            card.appendChild(examples);
        }
        if (actions.childElementCount) card.appendChild(actions);
        return card;
    },

_navigateIssueGroup(groupKey, direction) {
        const highlights = [...this.resultOutput.querySelectorAll('.highlight')]
            .filter((item) => item.dataset.groupKey === groupKey);
        if (!highlights.length) return;
        const current = this._groupCursor.get(groupKey) ?? (direction === 'prev' ? 0 : -1);
        const next = direction === 'prev'
            ? (current - 1 + highlights.length) % highlights.length
            : (current + 1) % highlights.length;
        this._groupCursor.set(groupKey, next);
        highlights[next].focus();
        highlights[next].scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
};
