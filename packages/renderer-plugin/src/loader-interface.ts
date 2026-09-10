import type { ComposerIdentity } from "./chat-configuration.js";

export interface ManagedChange {
  target: "context";
  action: "edited" | "removed" | "expanded" | "collapsed";
  revision: string;
  identity: ComposerIdentity;
}

export interface ComposerHandle {
  getStatus(): { available: boolean; hostId?: string; taskId?: string; draftId?: string; reason?: string; contextDisplay?: string; context?: { state: string; display?: string } };
  getSubmission(bindingId: string): unknown;
  prepareSubmission(input: ComposerIdentity & { revision: string; text: string; summary?: string }): { bindingId: string; state: string };
  clearContext(): void;
  unregister(): void;
}
export interface LoaderApi {
  version: string;
  storage: { get(key: string, fallback?: unknown): unknown; set(key: string, value: unknown): unknown };
  settings?: { registerPage(page: { id: string; title: string; description: string; render(root: HTMLElement): () => void }): { open?(): Promise<void>; unregister(): void } };
  composer?: { registerAccessory(spec: { id: string; render(root: HTMLElement, owner: ComposerIdentity): () => void; onChange?(event: ManagedChange): void }): ComposerHandle };
}
