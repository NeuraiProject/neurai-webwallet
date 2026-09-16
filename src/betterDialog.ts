enum DialogType {
  ALERT = "ALERT",
  CONFIRM = "CONFIRM",
  TOAST = "TOAST",
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function betterToast(text: string) {
  const dom = document.createElement("div");
  dom.innerHTML = `
    <div class="toast toast-top toast-center z-[1000]">
      <div class="alert alert-success shadow-lg whitespace-pre-line">
        <span>${escapeHtml(text)}</span>
      </div>
    </div>
  `;
  document.body.appendChild(dom);
  setTimeout(() => {
    if (dom.parentNode === document.body) document.body.removeChild(dom);
  }, 1500);
}

type ConfirmOptions = {
  warning?: { title: string; text: string };
  confirmLabel?: string;
};

export async function betterConfirm(headline: string, text: string, options?: ConfirmOptions): Promise<boolean> {
  return new Promise<boolean>((resolve, reject) => {
    createDialog(DialogType.CONFIRM, headline, text, resolve, reject, options);
  });
}

export async function betterAlert(headline: string, text: string): Promise<boolean> {
  return new Promise<boolean>((resolve, reject) => {
    createDialog(DialogType.ALERT, headline, text, resolve, reject);
  });
}

function getButtons(dialogType: DialogType, confirmLabel = "OK"): string {
  if (dialogType === DialogType.CONFIRM) {
    return `
      <button type="button" data-action="cancel" class="neurai-btn--secondary">Cancel</button>
      <button type="button" data-action="ok" class="neurai-btn--primary">${escapeHtml(confirmLabel)}</button>
    `;
  }
  if (dialogType === DialogType.ALERT) {
    return `
      <button type="button" data-action="ok" class="neurai-btn--primary">OK</button>
    `;
  }
  return "";
}

function createDialog(
  dialogType: DialogType,
  headline: string,
  text: string,
  resolve: (value: boolean) => void,
  reject: (reason?: unknown) => void,
  options?: ConfirmOptions
) {
  const dom = document.createElement("div");
  dom.innerHTML = `
    <dialog open class="modal modal-open">
      <div class="modal-box neurai-card max-w-lg overflow-hidden">
        <h3 class="font-bold text-lg m-0 mb-2">${escapeHtml(headline)}</h3>
        ${options?.warning ? `<div role="alert" class="rounded-xl border border-warning/60 bg-warning/15 px-4 py-3 mb-4 text-sm text-base-content">
          <p class="font-bold m-0 mb-1">${escapeHtml(options.warning.title)}</p>
          <p class="m-0">${escapeHtml(options.warning.text)}</p>
        </div>` : ""}
        <p class="whitespace-pre-line break-all text-sm text-base-content/85 m-0">${escapeHtml(text)}</p>
        <div class="modal-action mt-4 flex flex-wrap gap-2 justify-end">
          ${getButtons(dialogType, options?.confirmLabel)}
        </div>
      </div>
      <form method="dialog" class="modal-backdrop">
        <button type="button" data-action="backdrop" aria-label="Close">close</button>
      </form>
    </dialog>
  `;
  document.body.appendChild(dom);

  const orgFocusElement = document.querySelector(":focus") as HTMLElement | null;

  const cleanup = () => {
    if (dom.parentNode === document.body) document.body.removeChild(dom);
    if (orgFocusElement) orgFocusElement.focus();
  };
  const close = () => {
    cleanup();
    reject(false);
  };

  // Backdrop click → cancel
  const backdropBtn = dom.querySelector('[data-action="backdrop"]') as HTMLButtonElement | null;
  backdropBtn?.addEventListener("click", () => {
    cleanup();
    resolve(false);
  });

  // OK
  const okBtn = dom.querySelector('[data-action="ok"]') as HTMLButtonElement | null;
  okBtn?.addEventListener("click", () => {
    cleanup();
    resolve(true);
  });
  okBtn?.focus();

  // Cancel
  const cancelBtn = dom.querySelector('[data-action="cancel"]') as HTMLButtonElement | null;
  cancelBtn?.addEventListener("click", () => {
    cleanup();
    resolve(false);
  });

  // Esc closes
  const onKey = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      window.removeEventListener("keydown", onKey);
      close();
    }
  };
  window.addEventListener("keydown", onKey);

  return dom;
}
