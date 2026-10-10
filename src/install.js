let installPrompt = null;

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installPrompt = event;
  window.dispatchEvent(new Event('appinstallavailable'));
});

window.addEventListener('appinstalled', () => {
  installPrompt = null;
  window.dispatchEvent(new Event('swrappinstalled'));
});

export function canPromptInstall() {
  return !!installPrompt;
}

export async function promptInstall() {
  if (!installPrompt) return false;
  const prompt = installPrompt;
  installPrompt = null;
  await prompt.prompt();
  const { outcome } = await prompt.userChoice;
  return outcome === 'accepted';
}
