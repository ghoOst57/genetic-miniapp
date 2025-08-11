
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Укажи домен своего туннеля (subdomain.loca.lt / *.trycloudflare.com / *.ngrok.io|app)
// Можно передавать через переменную окружения TUNNEL_HOST, чтобы не править файл каждый раз.
const TUNNEL_HOST = process.env.TUNNEL_HOST || "spicy-nails-invite.loca.lt"; // ← замени при необходимости

// Разрешим популярные домены туннелей сразу (чтоб не менять каждый раз)
const allowed = [
  /\.loca\.lt$/,
  /\.trycloudflare\.com$/,
  /\.ngrok\.(io|app)$/,
  TUNNEL_HOST,
];

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,          // слушать на всех интерфейсах
    port: 5173,
    strictPort: true,
    allowedHosts: allowed,
    // Настройки HMR через публичный HTTPS туннеля
    hmr: {
      protocol: "wss",
      host: TUNNEL_HOST,
      port: 443,
    },
  },
  preview: {
    host: true,
    port: 4173,
    allowedHosts: allowed,
  },
});

