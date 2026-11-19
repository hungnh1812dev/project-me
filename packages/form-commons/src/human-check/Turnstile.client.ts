import { TURNSTILE_SCRIPT_URL, type HumanCheckForm } from '../constants/Security.constants';

/** The slice of Cloudflare's explicit-render API the kit uses. */
export interface TurnstileApi {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      action: string;
      appearance: 'interaction-only';
      callback: (token: string) => void;
      'expired-callback': () => void;
      'error-callback': () => void;
    },
  ) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export type TurnstileStatus = 'loading' | 'ready' | 'expired' | 'failed';

export interface TurnstileState {
  token: string;
  status: TurnstileStatus;
}

interface FormEntry {
  state: TurnstileState;
  /** Set while a `useTurnstile` of this form is mounted; the widget renders only then. */
  isRegistered: boolean;
  siteKey: string | undefined;
  container: HTMLElement | null;
  widgetId: string | null;
  listeners: Set<() => void>;
}

const INITIAL_STATE: TurnstileState = { token: '', status: 'loading' };

/** One registry per page: forms by id, the configured site key and the script. */
const forms = new Map<HumanCheckForm, FormEntry>();
let configuredSiteKey: string | undefined;
let scriptStatus: 'idle' | 'loading' | 'ready' | 'failed' = 'idle';

export function configureTurnstile({ siteKey }: { siteKey: string }): void {
  configuredSiteKey = siteKey;
}

/** The site key a form uses: its own override, else the configured one. */
export function resolveTurnstileSiteKey(override?: string): string {
  const siteKey = override ?? configuredSiteKey;
  if (siteKey === undefined || siteKey === '') {
    throw new Error('Turnstile has no site key: call configureTurnstile({ siteKey }) first.');
  }
  return siteKey;
}

function entryOf(formId: HumanCheckForm): FormEntry {
  let entry = forms.get(formId);
  if (entry === undefined) {
    entry = {
      state: INITIAL_STATE,
      isRegistered: false,
      siteKey: undefined,
      container: null,
      widgetId: null,
      listeners: new Set(),
    };
    forms.set(formId, entry);
  }
  return entry;
}

function setState(entry: FormEntry, state: TurnstileState): void {
  entry.state = state;
  entry.listeners.forEach((listener) => listener());
}

function renderWidget(formId: HumanCheckForm, entry: FormEntry): void {
  const api = window.turnstile;
  const isRenderable = entry.isRegistered && entry.container !== null && entry.widgetId === null;
  if (api === undefined || !isRenderable || entry.container === null) return;
  entry.widgetId = api.render(entry.container, {
    sitekey: resolveTurnstileSiteKey(entry.siteKey),
    action: formId,
    appearance: 'interaction-only',
    callback: (token) => setState(entry, { token, status: 'ready' }),
    'expired-callback': () => setState(entry, { token: '', status: 'expired' }),
    'error-callback': () => setState(entry, { token: '', status: 'failed' }),
  });
  setState(entry, { token: '', status: 'ready' });
}

function renderAllWidgets(): void {
  forms.forEach((entry, formId) => renderWidget(formId, entry));
}

function failAllForms(): void {
  forms.forEach((entry) => setState(entry, { token: '', status: 'failed' }));
}

/**
 * Adds the script element at most once per page; never at import. After a
 * load error the failed element is gone and the next call adds one new element.
 */
function loadScript(): void {
  if ((scriptStatus !== 'idle' && scriptStatus !== 'failed') || typeof document === 'undefined') {
    return;
  }
  if (window.turnstile !== undefined) {
    scriptStatus = 'ready';
    return;
  }
  if (scriptStatus === 'failed') forms.forEach((entry) => setState(entry, INITIAL_STATE));
  scriptStatus = 'loading';
  const script = document.createElement('script');
  script.src = TURNSTILE_SCRIPT_URL;
  script.async = true;
  script.addEventListener('load', () => {
    scriptStatus = 'ready';
    renderAllWidgets();
  });
  script.addEventListener('error', () => {
    script.remove();
    scriptStatus = 'failed';
    failAllForms();
  });
  document.head.appendChild(script);
}

/** Called by `useTurnstile`: loads the script and records the form's site key. */
export function registerTurnstileForm(
  formId: HumanCheckForm,
  siteKey: string | undefined,
): () => void {
  const entry = entryOf(formId);
  entry.siteKey = siteKey;
  entry.isRegistered = true;
  loadScript();
  if (scriptStatus === 'failed') setState(entry, { token: '', status: 'failed' });
  renderWidget(formId, entry);
  return () => {
    entry.isRegistered = false;
    entry.siteKey = undefined;
  };
}

/** Called by `TurnstileSlot`: renders the form's widget into the container; the returned function removes it. */
export function attachTurnstileContainer(
  formId: HumanCheckForm,
  container: HTMLElement,
): () => void {
  const entry = entryOf(formId);
  entry.container = container;
  loadScript();
  if (scriptStatus === 'failed') setState(entry, { token: '', status: 'failed' });
  renderWidget(formId, entry);
  return () => {
    if (entry.widgetId !== null) window.turnstile?.remove(entry.widgetId);
    entry.widgetId = null;
    entry.container = null;
    setState(entry, scriptStatus === 'failed' ? entry.state : INITIAL_STATE);
  };
}

/** Starts a fresh challenge; a token works once, so call it after every request that sent one. */
export function resetTurnstile(formId: HumanCheckForm): void {
  const entry = forms.get(formId);
  if (entry === undefined) return;
  loadScript();
  if (entry.widgetId !== null) window.turnstile?.reset(entry.widgetId);
  setState(entry, scriptStatus === 'failed' ? entry.state : { token: '', status: 'ready' });
}

export function subscribeTurnstile(formId: HumanCheckForm, listener: () => void): () => void {
  const { listeners } = entryOf(formId);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getTurnstileState(formId: HumanCheckForm): TurnstileState {
  return forms.get(formId)?.state ?? INITIAL_STATE;
}

export function getServerTurnstileState(): TurnstileState {
  return INITIAL_STATE;
}

/** Test hook: forgets every form, the site key and the script state. */
export function resetTurnstileRegistryForTests(): void {
  forms.clear();
  configuredSiteKey = undefined;
  scriptStatus = 'idle';
}
