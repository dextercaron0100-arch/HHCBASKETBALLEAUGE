export type Theme = "light" | "dark";
export const themeStorageKey = "hhc-theme-v1";

// Runs before the page paints so a saved light theme does not flash dark.
export const themeInitializationScript = `(()=>{let theme="dark";try{if(localStorage.getItem(${JSON.stringify(themeStorageKey)})==="light")theme="light"}catch{}document.documentElement.dataset.theme=theme})()`;
