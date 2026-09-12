import { defineConfig, lazyPlugins } from "vite-plus";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import fs from "node:fs";
import path from "node:path";

// https://vite.dev/config/
export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  fmt: {},
  lint: {
    plugins: ["react", "typescript", "oxc"],
    rules: {
      "react/rules-of-hooks": "error",
      "react/only-export-components": [
        "warn",
        {
          allowConstantExport: true,
        },
      ],
      "vite-plus/prefer-vite-plus-imports": "error",
    },
    options: {
      typeAware: true,
      typeCheck: true,
    },
    jsPlugins: [
      {
        name: "vite-plus",
        specifier: "vite-plus/oxlint-plugin",
      },
    ],
  },
  plugins: lazyPlugins(() => [
    tailwindcss(),
    react(),
    {
      name: "serve-external-assets",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url?.startsWith("/charts/") || req.url?.startsWith("/soundasset/")) {
            // URL might have query parameters (e.g. ?t=123), so we parse the path
            const urlPath = req.url.split("?")[0];
            const filePath = path.resolve(__dirname, "..", urlPath.slice(1));

            if (fs.existsSync(filePath)) {
              const ext = path.extname(filePath);
              if (ext === ".wav") res.setHeader("Content-Type", "audio/wav");
              else if (ext === ".csv") res.setHeader("Content-Type", "text/csv");

              res.statusCode = 200;
              fs.createReadStream(filePath).pipe(res);
              return;
            }
          }
          next();
        });
      },
    },
  ]),
});
