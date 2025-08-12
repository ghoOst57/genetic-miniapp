export {};
declare global {
  interface Window {
    Telegram?: any;
    __API_BASE__?: string;
  }
}
interface ImportMetaEnv { readonly VITE_API_BASE?: string; }
interface ImportMeta { readonly env: ImportMetaEnv; }
