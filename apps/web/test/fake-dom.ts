/**
 * Just enough of a browser for react-dom/client to mount a component in node: elements, text, attributes,
 * a 2D canvas that records what was painted on it, ResizeObserver, ImageData, a screen and a pixel ratio.
 * Import it before react-dom, which decides at load whether a DOM exists. The repo has no jsdom.
 */

class FakeNode {
  childNodes: FakeNode[] = [];
  parentNode: FakeNode | null = null;
  constructor(
    readonly nodeType: number,
    readonly nodeName: string,
    readonly ownerDocument: FakeDocument | null,
  ) {}
  get firstChild(): FakeNode | null {
    return this.childNodes[0] ?? null;
  }
  get lastChild(): FakeNode | null {
    return this.childNodes[this.childNodes.length - 1] ?? null;
  }
  appendChild<T extends FakeNode>(child: T): T {
    child.parentNode?.removeChild(child);
    this.childNodes.push(child);
    child.parentNode = this;
    return child;
  }
  insertBefore<T extends FakeNode>(child: T, before: FakeNode | null): T {
    if (!before) return this.appendChild(child);
    child.parentNode?.removeChild(child);
    this.childNodes.splice(this.childNodes.indexOf(before), 0, child);
    child.parentNode = this;
    return child;
  }
  removeChild<T extends FakeNode>(child: T): T {
    this.childNodes = this.childNodes.filter((c) => c !== child);
    child.parentNode = null;
    return child;
  }
  get textContent(): string {
    return this.childNodes.map((c) => c.textContent).join('');
  }
  set textContent(text: string) {
    for (const c of this.childNodes) c.parentNode = null;
    this.childNodes = [];
    if (text && this.ownerDocument) this.appendChild(this.ownerDocument.createTextNode(text));
  }
  addEventListener() {}
  removeEventListener() {}
}

class FakeText extends FakeNode {
  constructor(
    public nodeValue: string,
    doc: FakeDocument,
  ) {
    super(3, '#text', doc);
  }
  override get textContent() {
    return this.nodeValue;
  }
}

export class FakeElement extends FakeNode {
  readonly attributes = new Map<string, string>();
  readonly style: Record<string, string> & { setProperty(name: string, value: string): void } = {
    setProperty(this: Record<string, string>, name: string, value: string) {
      this[name] = value;
    },
  } as never;
  readonly namespaceURI = 'http://www.w3.org/1999/xhtml';
  constructor(
    readonly tagName: string,
    doc: FakeDocument,
  ) {
    super(1, tagName, doc);
  }
  setAttribute(name: string, value: string) {
    this.attributes.set(name, String(value));
  }
  getAttribute(name: string) {
    return this.attributes.get(name) ?? null;
  }
  removeAttribute(name: string) {
    this.attributes.delete(name);
  }
  /** Every element with this tag name under this one. */
  findAll(tag: string): FakeElement[] {
    const out: FakeElement[] = [];
    for (const c of this.childNodes) {
      if (!(c instanceof FakeElement)) continue;
      if (c.tagName === tag.toUpperCase()) out.push(c);
      out.push(...c.findAll(tag));
    }
    return out;
  }
}

/** Every 2D canvas the code under test painted a picture onto, in order. */
export const paintedCanvases: { width: number; height: number }[] = [];

class FakeCanvas extends FakeElement {
  width = 300;
  height = 150;
  getContext(kind: string) {
    if (kind !== '2d') return null;
    return {
      putImageData: (img: { width: number; height: number }) => {
        paintedCanvases.push({ width: img.width, height: img.height });
      },
    };
  }
  toDataURL() {
    return `data:image/png;base64,${this.width}x${this.height}#${paintedCanvases.length}`;
  }
}

class FakeDocument extends FakeNode {
  readonly documentElement: FakeElement;
  readonly body: FakeElement;
  activeElement: FakeElement | null = null;
  constructor() {
    super(9, '#document', null);
    this.documentElement = new FakeElement('HTML', this);
    this.body = new FakeElement('BODY', this);
    this.appendChild(this.documentElement).appendChild(this.body);
  }
  createElement(tag: string): FakeElement {
    const upper = tag.toUpperCase();
    return upper === 'CANVAS' ? new FakeCanvas(upper, this) : new FakeElement(upper, this);
  }
  createTextNode(text: string) {
    return new FakeText(text, this);
  }
}

class FakeImageData {
  readonly data: Uint8ClampedArray;
  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.data = new Uint8ClampedArray(width * height * 4);
  }
}

/** The width every ResizeObserver reports for the element it watches; the test sets it before mounting. */
export const layout = { width: 0 };

class FakeResizeObserver {
  constructor(private readonly callback: (entries: { contentRect: { width: number; height: number } }[]) => void) {}
  observe() {
    // A real observer reports the first size after layout, never inside the call.
    setTimeout(() => this.callback([{ contentRect: { width: layout.width, height: layout.width / 2 } }]), 0);
  }
  unobserve() {}
  disconnect() {}
}

export const document = new FakeDocument();

/** The device the page runs on. */
export const device = { screen: { width: 0, height: 0 }, devicePixelRatio: 1 };

const window = {
  document,
  screen: device.screen,
  get devicePixelRatio() {
    return device.devicePixelRatio;
  },
  get innerWidth() {
    return device.screen.width;
  },
  get innerHeight() {
    return device.screen.height;
  },
  event: undefined,
  HTMLIFrameElement: class {},
  addEventListener() {},
  removeEventListener() {},
  setTimeout,
  clearTimeout,
};

Object.assign(globalThis, { window, document, ImageData: FakeImageData, ResizeObserver: FakeResizeObserver });
