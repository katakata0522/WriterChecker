export const SEVERITY_LABELS = Object.freeze({ error: '要修正', warning: '注意', info: '情報' });
export const MAX_SHARE_URL_LENGTH = 2000;
export const MAX_INCOMING_TEXT_LENGTH = 200000;
export const WORKER_THRESHOLD = 3000;

export function byId(id) {
    return typeof document === 'undefined' ? null : document.getElementById(id);
}

export function appendText(element, text) {
    element.appendChild(document.createTextNode(text));
}
