// Minimal test host for the real ReactDOM client renderer. No React hooks,
// scheduler, reconciler or state updates are mocked. Browser QA complements it.
class Target {
  listeners = new Map();
  addEventListener(type, listener, capture = false) {
    const rows = this.listeners.get(type) || [];
    rows.push({ listener, capture: typeof capture === 'object' ? Boolean(capture.capture) : Boolean(capture) });
    this.listeners.set(type, rows);
  }
  removeEventListener(type, listener) {
    this.listeners.set(type, (this.listeners.get(type) || []).filter(row => row.listener !== listener));
  }
  dispatchEvent(event) {
    if (!event.target) Object.defineProperty(event, 'target', { value: this, configurable: true });
    const path = []; for (let node = this; node; node = node.parentNode) path.push(node);
    const invoke = (node, capture) => {
      Object.defineProperty(event, 'currentTarget', { value: node, configurable: true });
      for (const row of node.listeners.get(event.type) || []) if (row.capture === capture) row.listener.call(node, event);
    };
    for (const node of [...path].reverse()) invoke(node, true);
    for (const node of path) { invoke(node, false); if (event.cancelBubble || !event.bubbles) break; }
    return !event.defaultPrevented;
  }
}
class HostNode extends Target {
  constructor(type, name, document) {
    super(); this.nodeType = type; this.nodeName = name; this.ownerDocument = document;
    this.parentNode = null; this.childNodes = []; this.nodeValue = null;
  }
  appendChild(node) { return this.insertBefore(node, null); }
  insertBefore(node, before) {
    node.parentNode?.removeChild(node);
    const index = before ? this.childNodes.indexOf(before) : this.childNodes.length;
    if (index < 0) throw new Error('Unknown insertion point');
    this.childNodes.splice(index, 0, node); node.parentNode = this; return node;
  }
  removeChild(node) {
    const index = this.childNodes.indexOf(node); if (index < 0) throw new Error('Unknown child');
    this.childNodes.splice(index, 1); node.parentNode = null; return node;
  }
  get firstChild() { return this.childNodes[0] || null; }
  get lastChild() { return this.childNodes.at(-1) || null; }
  get nextSibling() { return this.parentNode?.childNodes[this.parentNode.childNodes.indexOf(this) + 1] || null; }
  get textContent() { return this.nodeType === 3 ? this.nodeValue : this.childNodes.map(n => n.textContent).join(''); }
  set textContent(value) {
    if (this.nodeType === 3) { this.nodeValue = String(value); return; }
    for (const child of this.childNodes) child.parentNode = null;
    this.childNodes = [];
    if (value !== '') this.appendChild(this.ownerDocument.createTextNode(String(value)));
  }
  contains(node) { return node === this || this.childNodes.some(child => child.contains(node)); }
  getRootNode() { return this.parentNode ? this.parentNode.getRootNode() : this; }
}
class HostElement extends HostNode {
  constructor(name, document, namespace = 'http://www.w3.org/1999/xhtml') {
    super(1, name.toUpperCase(), document);
    this.tagName = this.nodeName; this.localName = name; this.namespaceURI = namespace;
    this.attributes = new Map(); this.style = { setProperty(name, value) { this[name] = value; } };
    this.disabled = false;
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  removeAttribute(name) { this.attributes.delete(name); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  setAttributeNS(namespace, name, value) { this.setAttribute(name, value); }
  removeAttributeNS(namespace, name) { this.removeAttribute(name); }
  focus() { this.ownerDocument.activeElement = this; }
  click() {
    if (this.disabled) return;
    this.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));
  }
}
class HostDocument extends HostNode {
  constructor() {
    super(9, '#document', null); this.ownerDocument = this;
    this.documentElement = new HostElement('html', this); this.appendChild(this.documentElement);
    this.body = new HostElement('body', this); this.documentElement.appendChild(this.body);
    this.activeElement = this.body;
  }
  createElement(name) { return new HostElement(name, this); }
  createElementNS(namespace, name) { return new HostElement(name, this, namespace); }
  createTextNode(value) { const node = new HostNode(3, '#text', this); node.nodeValue = String(value); return node; }
  hasFocus() { return true; }
}
export function installReactDomHost() {
  const document = new HostDocument(), window = new Target();
  Object.assign(window, { document, HTMLElement: HostElement, HTMLIFrameElement: class {}, Node: HostNode,
    setTimeout, clearTimeout, getSelection: () => null, location: { href: 'http://fixture.invalid/' } });
  document.defaultView = window;
  globalThis.window = window; globalThis.document = document;
  globalThis.HTMLElement = HostElement; globalThis.Node = HostNode;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  return document;
}
export function elements(node) {
  return [...node.childNodes.flatMap(child => [child, ...elements(child)])].filter(child => child.nodeType === 1);
}
