/**
 * Static error page shown when bootstrap fails (usually `config.json` missing or invalid, D-017).
 * Copy comes from `i18n/<lang>.json` (`boot.*`). Only if that file is unreachable too does it use the
 * built-in strings below: the one place copy lives outside the translation files, because by then
 * nothing else can be loaded. Keep them identical to `boot.*` in es.json and en.json.
 */
interface BootCopy {
  title: string;
  message: string;
  retry: string;
}

const LAST_RESORT: Readonly<Record<'es' | 'en', BootCopy>> = {
  es: {
    title: 'No pudimos cargar Prompt Battle',
    message: 'Revisa tu conexión y vuelve a intentarlo.',
    retry: 'Reintentar',
  },
  en: {
    title: "We couldn't load Prompt Battle",
    message: 'Check your connection and try again.',
    retry: 'Try again',
  },
};

function storedLanguage(): 'es' | 'en' {
  try {
    return localStorage.getItem('lang') === 'en' ? 'en' : 'es';
  } catch {
    return 'es';
  }
}

async function loadCopy(lang: 'es' | 'en'): Promise<BootCopy> {
  try {
    const response = await fetch(new URL(`i18n/${lang}.json`, document.baseURI), {
      cache: 'no-cache',
    });
    const json = (await response.json()) as { boot?: Partial<BootCopy> };
    const boot = json.boot;
    if (boot?.title && boot.message && boot.retry) {
      return { title: boot.title, message: boot.message, retry: boot.retry };
    }
  } catch {
    // Fall through to the built-in copy.
  }
  return LAST_RESORT[lang];
}

export async function renderBootError(): Promise<void> {
  const lang = storedLanguage();
  const copy = await loadCopy(lang);
  document.documentElement.lang = lang === 'en' ? 'en' : 'es-CO';

  const main = document.createElement('main');
  main.className = 'boot-error';
  const title = document.createElement('h1');
  title.textContent = copy.title;
  const message = document.createElement('p');
  message.textContent = copy.message;
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.textContent = copy.retry;
  retry.addEventListener('click', () => location.reload());
  main.append(title, message, retry);
  document.body.replaceChildren(main);
}
