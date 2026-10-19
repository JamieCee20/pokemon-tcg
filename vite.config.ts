import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api/pricing": {
        target: "http://127.0.0.1:3001",
        configure(proxy) {
          proxy.on("error", (_error, _request, response) => {
            if ("writeHead" in response && !response.headersSent) {
              response.writeHead(502, {
                "Content-Type": "application/json; charset=utf-8",
                "Cache-Control": "no-store",
              });
              response.end(
                JSON.stringify({
                  error:
                    "Pricing service is unavailable. Start the pricing-api server and try again.",
                  code: "proxy_unavailable",
                }),
              );
            }
          });
        },
      },
      "/api/apitcg": {
        target: "http://127.0.0.1:3001",
        configure(proxy) {
          proxy.on("error", (_error, _request, response) => {
            if ("writeHead" in response && !response.headersSent) {
              response.writeHead(502, {
                "Content-Type": "application/json; charset=utf-8",
                "Cache-Control": "no-store",
              });
              response.end(
                JSON.stringify({
                  error:
                    "APITCG service is unavailable. Start the pricing-api server and try again.",
                  code: "proxy_unavailable",
                }),
              );
            }
          });
        },
      },
    },
  },
});
