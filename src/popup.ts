(() => {
  const toggle = document.querySelector<HTMLInputElement>("#bubble-enabled");
  const status = document.querySelector<HTMLElement>("#bubble-status");
  if (!toggle || !status) throw new Error("Missing bubble preference controls");
  const control = toggle;
  const message = status;

  function showPreference(enabled: boolean): void {
    control.checked = enabled;
    message.textContent = enabled
      ? "The bubble is enabled on all pages."
      : "The bubble is hidden on all pages. Enable it here whenever you need it.";
  }

  void chrome.storage.local.get({ bubbleEnabled: true }).then((settings) => {
    showPreference(settings.bubbleEnabled !== false);
    control.disabled = false;
  }).catch(() => {
    message.textContent = "Could not load your preference. Close and reopen this menu to retry.";
  });

  control.onchange = async () => {
    const enabled = control.checked;
    control.disabled = true;
    try {
      await chrome.storage.local.set({ bubbleEnabled: enabled });
      showPreference(enabled);
    } catch {
      control.checked = !enabled;
      message.textContent = "Could not save your preference. Please try again.";
    } finally {
      control.disabled = false;
    }
  };
})();
