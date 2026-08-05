/**
 * Writer Checker — UIManager
 * 画面全体の状態を保持し、責務別モジュールを明示的に合成する。
 */
import { byId } from './ui/UIShared.js';
import { RuleSetMethods } from './ui/RuleSetUI.js';
import { RuleEditorMethods } from './ui/RuleEditorUI.js';
import { AnalysisCoreMethods } from './ui/AnalysisCoreUI.js';
import { IssueViewMethods } from './ui/IssueViewUI.js';
import { FixActionsMethods } from './ui/FixActionsUI.js';
import { IOMethods } from './ui/IOUI.js';
import { ShellMethods } from './ui/ShellUI.js';

export class UIManager {
    constructor(storageManager, ruleEngine, analyticsManager = null) {
        this.storageManager = storageManager;
        this.ruleEngine = ruleEngine;
        this.analyticsManager = analyticsManager;
        this.allRuleSets = storageManager.loadAllRuleSets();
        this.activeSetName = storageManager.loadActiveSetName();
        this._syncActiveRules();
        this._undoStack = [];
        this._analyzeDebounceTimer = null;
        this._toastTimer = null;
        this._analysisRequestSeq = 0;
        this._workerRequestSeq = 0;
        this._workerPending = new Map();
        this._tokenizeWorker = null;
        this._analysisTokensSource = 'sync';
        this._latestAnalysis = null;
        this._hasUnsavedEdits = false;
        this._lastTrackedAnalysisKey = '';
        this._hasTrackedInputStart = false;
        this._groupCursor = new Map();
        this._cacheElements();
        this._bindEvents();
        this.populateRuleSetSelector();
        this.renderRulesList();
        this._updateSaveStateStatus();
    }

    _cacheElements() {
        this.sourceText = byId('sourceText');
        this.resultOutput = byId('resultOutput');
        this.matchCountBadge = byId('matchCount');
        this.matchCountStatus = byId('matchCountStatus');
        this.replaceBtn = byId('replaceBtn');
        this.copyBtn = byId('copyBtn');
        this.undoBtn = byId('undoBtn');
        this.clearBtn = byId('clearBtn');
        this.pasteBtn = byId('pasteBtn');
        this.sampleBtn = byId('sampleBtn');
        this.charCount = byId('charCount');
        this.ruleSetSelector = byId('ruleSetSelector');
        this.addRuleSetBtn = byId('addRuleSetBtn');
        this.deleteRuleSetBtn = byId('deleteRuleSetBtn');
        this.editRulesBtn = byId('editRulesBtn');
        this.ruleModal = byId('ruleModal');
        this.closeModalBtn = byId('closeModalBtn');
        this.saveRulesBtn = byId('saveRulesBtn');
        this.rulesList = byId('rulesList');
        this.addRuleBtn = byId('addRuleBtn');
        this.ruleSearchInput = byId('ruleSearchInput');
        this.regexTemplateBtn = byId('regexTemplateBtn');
        this.saveStateStatus = byId('saveStateStatus');
        this.nameModal = byId('nameModal');
        this.closeNameModalBtn = byId('closeNameModalBtn');
        this.newRuleSetNameInput = byId('newRuleSetName');
        this.nameModalError = byId('nameModalError');
        this.confirmNameBtn = byId('confirmNameBtn');
        this.confirmModal = byId('confirmModal');
        this.closeConfirmModalBtn = byId('closeConfirmModalBtn');
        this.confirmModalMsg = byId('confirmModalMsg');
        this.confirmModalCancelBtn = byId('confirmModalCancelBtn');
        this.confirmModalOkBtn = byId('confirmModalOkBtn');
        this.sidePanel = byId('sidePanel');
        this.sidePanelOverlay = byId('sidePanelOverlay');
        this.sidePanelToggle = byId('sidePanelToggle');
        this.sidePanelClose = byId('sidePanelClose');
        this.bookmarkletLink = byId('bookmarkletLink');
        this.exportRulesBtn = byId('exportRulesBtn');
        this.importRulesBtn = byId('importRulesBtn');
        this.importFileInput = byId('importFileInput');
        this.shareRulesBtn = byId('shareRulesBtn');
        this.exportReportBtn = byId('exportReportBtn');
        this.mobileReplaceBtn = byId('mobileReplaceBtn');
        this.mobileCopyBtn = byId('mobileCopyBtn');
        this.mobileSettingsBtn = byId('mobileSettingsBtn');
        this.toast = byId('toast');
        if (this.sourceText) this.sourceText.maxLength = 200000;
        this.sidePanelToggle?.setAttribute('aria-expanded', 'false');
        this.sidePanelToggle?.setAttribute('aria-controls', 'sidePanel');
    }

    _bindEvents() {
        this._bindRuleSetEvents();
        this._bindRuleEditorEvents();
        this._bindTextEvents();
        this._bindImportExportEvents();
        this._bindSidePanelEvents();
        this._bindExternalEvents();
        this._bindKeyboardEvents();
        this._bindDragDropEvents();
    }
}

Object.assign(UIManager.prototype, RuleSetMethods, RuleEditorMethods, AnalysisCoreMethods, IssueViewMethods, FixActionsMethods, IOMethods, ShellMethods);
