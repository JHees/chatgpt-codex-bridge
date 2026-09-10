const paragraphSelector = '[data-user-message-bubble] [data-markdown-text-tone="user-message"] > p';
const contextPattern = /^\[Loader context: dev\.codex-chat-bridge \/ [A-Za-z0-9._:-]{1,128}\][\s\S]*\[\/Loader context\]\s*$/;

/** Presentation only: keep React-owned paragraphs and native message data in place. */
export function mountContextPresentation(document: Document, zh: boolean): () => void {
  const controls = new Map<HTMLElement, HTMLButtonElement>();
  const summaries = new Map<HTMLElement, { text: string; title: string; value: string }>();
  const matches = (paragraph: HTMLElement): boolean => paragraph.matches(paragraphSelector)
    && !paragraph.closest('[contenteditable="true"]') && contextPattern.test(paragraph.textContent ?? "");
  const remove = (paragraph: HTMLElement, button: HTMLButtonElement): void => {
    button.remove(); paragraph.removeAttribute("data-bridge-sent-collapsed"); controls.delete(paragraph);
  };
  const refresh = (): void => {
    for (const title of summaries.keys()) if (!title.isConnected) summaries.delete(title);
    for (const fold of document.querySelectorAll('[data-codex-composer] [data-loader-context-fold]')) {
      const text = fold.querySelector("p")?.textContent ?? "";
      const title = fold.querySelector<HTMLElement>('[contenteditable="false"] > span');
      if (!title || !contextPattern.test(text)) continue;
      // The restored draft carries its original selection, not today's task defaults.
      const model = text.match(/(?:^|[。.]\s*)Chat ([^·\r\n]+?) · [^·\r\n]+ · (.+?)(?:。配置 |\. Configuration )/m);
      const value = (zh ? "Chat 协作" : "Chat collaboration") + (model ? ` · ${model[1]} · ${model[2]}` : "");
      if (title.textContent === value) continue;
      if (!summaries.has(title)) summaries.set(title, { text: title.textContent ?? "", title: title.title, value });
      else summaries.get(title)!.value = value;
      title.textContent = value; title.title = value;
    }
    for (const [paragraph, button] of controls) {
      if (!paragraph.isConnected || !matches(paragraph) || button.nextSibling !== paragraph) remove(paragraph, button);
    }
    for (const paragraph of document.querySelectorAll<HTMLElement>(paragraphSelector)) {
      if (controls.has(paragraph) || !matches(paragraph)) continue;
      const button = document.createElement("button"); button.type = "button";
      button.dataset.bridgeSentToggle = "true";
      let expanded = false;
      const show = (): void => {
        paragraph.toggleAttribute("data-bridge-sent-collapsed", !expanded);
        button.setAttribute("aria-expanded", String(expanded));
        button.textContent = zh ? `Chat 协作说明 · ${expanded ? "收起" : "显示更多"}`
          : `Chat collaboration instructions · ${expanded ? "Show less" : "Show more"}`;
      };
      button.onclick = event => { event.preventDefault(); event.stopPropagation(); expanded = !expanded; show(); };
      controls.set(paragraph, button); paragraph.before(button); show();
    }
  };
  const observer = new document.defaultView!.MutationObserver(refresh);
  observer.observe(document.body, { childList: true, characterData: true, subtree: true });
  refresh();
  return () => {
    observer.disconnect();
    for (const [paragraph, button] of controls) remove(paragraph, button);
    for (const [title, previous] of summaries) if (title.textContent === previous.value) { title.textContent = previous.text; title.title = previous.title; }
    summaries.clear();
  };
}
