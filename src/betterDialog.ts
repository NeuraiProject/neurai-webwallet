import "./betterDialog.css";

enum DialogType {
  ALERT = "ALERT",
  CONFIRM = "CONFIRM",
  TOAST = "TOAST",
}

export function betterToast(text: string) {
  const html = ` <dialog open><article class="rebel-dialog__article rebel-dialog__toast"> 
  </header>
  <p class="rebel-dialog__text">
   ${text}
  </p> 
</article>
</dialog>`;
  const dom = document.createElement("div");
  document.body.appendChild(dom);
  dom.innerHTML = html;

  setTimeout(() => document.body.removeChild(dom), 1000);
}
export async function betterConfirm(headline: string, text: string): Promise<boolean> {
  const promise = new Promise<boolean>((resolve, reject) => {
    createDialog(DialogType.CONFIRM, headline, text, resolve, reject);
  });
  return promise;
}
export async function betterAlert(headline: string, text: string): Promise<boolean> {
  const promise = new Promise<boolean>((resolve, reject) => {
    createDialog(DialogType.ALERT, headline, text, resolve, reject);
  });
  return promise;
}

function getButtons(dialogType: DialogType) {
  if (dialogType === DialogType.CONFIRM) {
    return `
      <button class="secondary rebel-dialog__button">Cancel</button> 
      <button class="primary rebel-dialog__button">OK</button>
      `;
  } else if (dialogType === DialogType.ALERT) {
    return ` 
      <button class="primary rebel-dialog__button">OK</button>
      `;
  }
  return "";
}

function createDialog(
  dialogType: DialogType,
  headline: string,
  text: string,
  resolve: (value: boolean) => void,
  reject: (reason?: unknown) => void
) {
  const html = `   <dialog open>
      <article class="rebel-dialog__article">
        <header>
          <a href="#close" aria-label="Close" class="close"></a>
          ${headline}
        </header>
        <p class="rebel-dialog__text">${text}</p>
        <footer class="rebel-dialog__footer">  
         ${getButtons(dialogType)}
        </footer>
      </article>
    </dialog>`;
  const dom = document.createElement("div");
  document.body.appendChild(dom);
  dom.innerHTML = html;

  //Nifty, remember which element had focus before we show dialog
  const orgFocusElement = document.querySelector(
    ":focus"
  ) as HTMLElement | null;
  const close = () => {
    document.body.removeChild(dom);
    reject(false);
    if (orgFocusElement) {
      orgFocusElement.focus();
    }
  };
  const dialog = dom.querySelector("dialog");
  const article = dom.querySelector("article");

  //Close if use clicks the X icon top right
  article?.querySelector(".close")?.addEventListener("click", close);

  //Cancel if user clicks outside of the dialog
  dialog?.addEventListener("click", (event) => {
    // Check if the click target is the container div or one of its children
    if (event.target === dialog) {
      // Remove the content div
      close();
    }
  });
  (dom.querySelector("button.primary") as HTMLElement)?.focus();
  (dom.querySelector("button.primary") as HTMLElement)?.addEventListener(
    "click",
    (event) => {
      resolve(true);
      close();
    }
  );
  dom.querySelector("button.secondary")?.addEventListener("click", (event) => {
    resolve(false);
    close();
  });

  return dom;
}
