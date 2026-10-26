interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
interface PwaOptions {
  beforeUpdate(): boolean;
  notify(message: string): void;
  showInstallHelp(message: string): void;
}
const installIcon =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/></svg>';
const refreshIcon =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 8a8 8 0 1 0 0 8M20 3v6h-6"/></svg>';
export function setupPwa(options: PwaOptions) {
  const controls = Array.from(
    document.querySelectorAll<HTMLButtonElement>("[data-pwa]"),
  );
  const standalone = window.matchMedia("(display-mode: standalone)");
  const installedKey = "quatre-couronnes-installed";
  let installed =
    standalone.matches ||
    !!(navigator as Navigator & { standalone?: boolean }).standalone;
  try {
    installed ||= localStorage.getItem(installedKey) === "yes";
  } catch {
    /* Private browsing still supports standalone detection. */
  }
  let prompt: InstallPrompt | undefined;
  let registration: ServiceWorkerRegistration | undefined;
  let applying = false;
  let checking = false;
  function remember() {
    installed = true;
    try {
      localStorage.setItem(installedKey, "yes");
    } catch {
      /* Optional preference. */
    }
    render();
  }
  function render() {
    const update = !!registration?.waiting;
    const refresh = installed || update;
    const label = checking
      ? "Recherche…"
      : update
        ? "Mise à jour disponible"
        : refresh
          ? "Vérifier les mises à jour"
          : "Installer le jeu";
    for (const button of controls) {
      button.innerHTML = `${refresh ? refreshIcon : installIcon}<span>${label}</span>`;
      button.title = label;
      button.setAttribute("aria-label", label);
      button.classList.toggle("update-ready", update);
      button.disabled = checking || applying;
    }
  }
  async function updateGame() {
    if (!registration)
      return options.notify(
        "La recherche de mises à jour est indisponible pour le moment.",
      );
    if (!navigator.onLine)
      return options.notify(
        "Vous êtes hors connexion. Le jeu installé reste jouable.",
      );
    checking = true;
    render();
    try {
      await registration.update();
      // update() may resolve before the new worker has finished caching its files.
      const worker = registration.installing;
      if (worker)
        await new Promise<void>((resolve) => {
          if (["installed", "redundant"].includes(worker.state))
            return resolve();
          worker.addEventListener("statechange", () => {
            if (["installed", "redundant"].includes(worker.state)) resolve();
          });
        });
      if (registration.waiting) {
        if (!options.beforeUpdate()) return;
        applying = true;
        options.notify("Partie sauvegardée. Installation de la mise à jour…");
        registration.waiting.postMessage({ type: "APPLY_UPDATE" });
      } else options.notify("Le jeu est à jour.");
    } catch {
      options.notify(
        "La mise à jour n’a pas pu être vérifiée. Réessayez avec une connexion.",
      );
    } finally {
      checking = false;
      render();
    }
  }
  for (const button of controls)
    button.onclick = async () => {
      if (installed || registration?.waiting) return updateGame();
      if (prompt) {
        const request = prompt;
        prompt = undefined;
        await request.prompt();
        if ((await request.userChoice).outcome === "accepted") remember();
        render();
      } else {
        const ios =
          /iPhone|iPad|iPod/.test(navigator.userAgent) ||
          (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
        options.showInstallHelp(
          ios
            ? "Dans Safari, ouvrez Partager, puis « Sur l’écran d’accueil ». Lancez ensuite le jeu depuis son icône."
            : "Dans le menu de votre navigateur, choisissez « Installer cette application » ou « Ajouter au Dock ». Si cette option n’est pas proposée, utilisez Chrome, Edge ou Safari. Le bouton d’installation directe apparaît dès que le navigateur le permet.",
        );
      }
    };
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    prompt = event as InstallPrompt;
    render();
  });
  window.addEventListener("appinstalled", () => {
    prompt = undefined;
    remember();
    options.notify(
      "Le jeu est installé. Le bouton ↻ servira aux mises à jour.",
    );
  });
  standalone.addEventListener("change", () => {
    if (standalone.matches) remember();
  });
  render();
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (applying) window.location.reload();
  });
  navigator.serviceWorker
    .register(new URL("sw.js", document.baseURI), { updateViaCache: "none" })
    .then((reg) => {
      registration = reg;
      if (installed) remember();
      render();
      reg.addEventListener("updatefound", () => {
        const worker = reg.installing;
        worker?.addEventListener("statechange", () => {
          if (worker.state === "installed") {
            render();
            if (navigator.serviceWorker.controller && reg.waiting)
              options.notify(
                "Une mise à jour est disponible : utilisez le bouton ↻.",
              );
          }
        });
      });
      window.addEventListener("online", () => {
        void reg.update().catch(() => {});
      });
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible")
          void reg.update().catch(() => {});
      });
    })
    .catch(() =>
      options.notify(
        "L’installation hors connexion est indisponible dans ce navigateur.",
      ),
    );
}
