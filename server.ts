/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import { buildDebugApk, ensurePwaIcons } from "./scripts/build-apk";

const MODEL_UPGRADES: Record<string, string> = {
  "gemini-2.5-flash": "gemini-3-flash-preview",
  "gemini-2.5-pro": "gemini-3.1-pro-preview",
  "gemini-3-pro-preview": "gemini-3.1-pro-preview",
  "gemini-2.0-flash": "gemini-3-flash-preview",
  "gemini-2.0-flash-exp": "gemini-3-flash-preview",
};

function resolveModel(model?: string): string {
  if (!model) return "gemini-3-flash-preview";
  return MODEL_UPGRADES[model] || model;
}

function serializeGenerateContentResponse(r: any) {
  return {
    candidates: r?.candidates,
    promptFeedback: r?.promptFeedback,
    usageMetadata: r?.usageMetadata,
    modelVersion: r?.modelVersion,
    responseId: r?.responseId,
    text: r?.text,
    functionCalls: r?.functionCalls,
    data: r?.data,
    executableCode: r?.executableCode,
    codeExecutionResult: r?.codeExecutionResult,
  };
}

const chats = new Map<string, any>();
const videoOps = new Map<string, any>();

function setupAutoApkSync(rootDir: string) {
  let debounceTimer: NodeJS.Timeout | null = null;

  const triggerSync = (changedPath: string) => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      buildDebugApk({ rootDir, runViteBuild: false, force: false }).catch((err) =>
        console.error(`[APK Watcher] Failed to sync debug.apk after ${changedPath}:`, err)
      );
    }, 600);
  };

  const watchTargets = ["App.tsx", "index.tsx", "index.html", "types.ts", "components", "utils", "hooks"];
  for (const target of watchTargets) {
    const fullPath = path.join(rootDir, target);
    if (fs.existsSync(fullPath)) {
      try {
        fs.watch(fullPath, { recursive: false }, (_eventType, filename) => {
          triggerSync(filename || target);
        });
      } catch {
        // Ignore watch errors on unsupported filesystems
      }
    }
  }
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;
  const rootDir = process.cwd();

  // Ensure PWA icons and initial debug/debug.apk exist on startup
  ensurePwaIcons(rootDir);
  buildDebugApk({ rootDir, runViteBuild: false, force: false }).catch((err) =>
    console.error("[Backend] Initial APK sync error:", err)
  );
  setupAutoApkSync(rootDir);

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  for (const dir of ["examples", "assets", "public"]) {
    const dirPath = path.join(rootDir, dir);
    if (fs.existsSync(dirPath)) {
      app.use(`/${dir}`, express.static(dirPath));
    }
  }

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  // --- Android debug/debug.apk Endpoints ---
  app.get("/api/apk/info", async (_req, res): Promise<any> => {
    try {
      const info = await buildDebugApk({ rootDir, runViteBuild: false, force: false });
      return res.json(info);
    } catch (error: any) {
      console.error("[Backend] /api/apk/info error:", error);
      return res.status(500).json({ error: error.message || "Failed to read APK info." });
    }
  });

  app.post("/api/apk/rebuild", async (_req, res): Promise<any> => {
    try {
      const info = await buildDebugApk({ rootDir, runViteBuild: true, force: true });
      return res.json(info);
    } catch (error: any) {
      console.error("[Backend] /api/apk/rebuild error:", error);
      return res.status(500).json({ error: error.message || "Failed to rebuild debug.apk." });
    }
  });

  app.get("/debug/debug.apk", async (_req, res): Promise<any> => {
    try {
      await buildDebugApk({ rootDir, runViteBuild: false, force: false });
      const apkFile = path.join(rootDir, "debug", "debug.apk");
      if (!fs.existsSync(apkFile)) {
        return res.status(404).send("debug.apk not found.");
      }
      res.setHeader("Content-Type", "application/vnd.android.package-archive");
      res.setHeader("Content-Disposition", 'attachment; filename="debug.apk"');
      res.setHeader("Cache-Control", "no-store");
      return res.sendFile(apkFile);
    } catch (error: any) {
      console.error("[Backend] /debug/debug.apk download error:", error);
      return res.status(500).send("Failed to serve debug.apk");
    }
  });

  app.post("/api/generate-content", async (req, res): Promise<any> => {
    try {
      const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
      if (!apiKey) {
        return res.status(503).json({
          error: "API key is not configured. Please add your GEMINI_API_KEY in Settings > Secrets.",
        });
      }
      const ai = new GoogleGenAI({ apiKey });
      const params = { ...req.body, model: resolveModel(req.body?.model) };
      const response = await ai.models.generateContent(params);
      return res.json(serializeGenerateContentResponse(response));
    } catch (error: any) {
      console.error("[Backend] /api/generate-content error:", error);
      return res.status(500).json({ error: error.message || "Failed to generate content." });
    }
  });

  app.post("/api/generate-content-stream", async (req, res): Promise<any> => {
    try {
      const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
      if (!apiKey) {
        return res.status(503).json({
          error: "API key is not configured. Please add your GEMINI_API_KEY in Settings > Secrets.",
        });
      }
      const ai = new GoogleGenAI({ apiKey });
      const params = { ...req.body, model: resolveModel(req.body?.model) };
      const stream = await ai.models.generateContentStream(params);
      res.setHeader("Content-Type", "application/x-ndjson");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      for await (const chunk of stream) {
        res.write(JSON.stringify(serializeGenerateContentResponse(chunk)) + "\n");
      }
      res.end();
    } catch (error: any) {
      console.error("[Backend] /api/generate-content-stream error:", error);
      if (!res.headersSent) {
        return res.status(500).json({ error: error.message || "Failed to stream content." });
      }
      res.end();
    }
  });

  app.post("/api/chat-message", async (req, res): Promise<any> => {
    try {
      const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
      if (!apiKey) {
        return res.status(503).json({
          error: "API key is not configured. Please add your GEMINI_API_KEY in Settings > Secrets.",
        });
      }
      const { sessionId, model, config, history, message, msgConfig } = req.body || {};
      const ai = new GoogleGenAI({ apiKey });
      let chat = sessionId ? chats.get(sessionId) : undefined;
      if (!chat) {
        chat = ai.chats.create({
          model: resolveModel(model),
          config,
          history,
        });
        if (sessionId) chats.set(sessionId, chat);
      }
      const response = await chat.sendMessage({ message, config: msgConfig });
      return res.json(serializeGenerateContentResponse(response));
    } catch (error: any) {
      console.error("[Backend] /api/chat-message error:", error);
      return res.status(500).json({ error: error.message || "Failed to send chat message." });
    }
  });

  app.post("/api/chat-stream", async (req, res): Promise<any> => {
    try {
      const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
      if (!apiKey) {
        return res.status(503).json({
          error: "API key is not configured. Please add your GEMINI_API_KEY in Settings > Secrets.",
        });
      }
      const { sessionId, model, config, history, message, msgConfig } = req.body || {};
      const ai = new GoogleGenAI({ apiKey });
      let chat = sessionId ? chats.get(sessionId) : undefined;
      if (!chat) {
        chat = ai.chats.create({
          model: resolveModel(model),
          config,
          history,
        });
        if (sessionId) chats.set(sessionId, chat);
      }
      const stream = await chat.sendMessageStream({ message, config: msgConfig });
      res.setHeader("Content-Type", "application/x-ndjson");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      for await (const chunk of stream) {
        res.write(JSON.stringify(serializeGenerateContentResponse(chunk)) + "\n");
      }
      res.end();
    } catch (error: any) {
      console.error("[Backend] /api/chat-stream error:", error);
      if (!res.headersSent) {
        return res.status(500).json({ error: error.message || "Failed to stream chat message." });
      }
      res.end();
    }
  });

  app.post("/api/generate-images", async (req, res): Promise<any> => {
    try {
      const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
      if (!apiKey) {
        return res.status(503).json({
          error: "API key is not configured. Please add your GEMINI_API_KEY in Settings > Secrets.",
        });
      }
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateImages(req.body);
      return res.json(response);
    } catch (error: any) {
      console.error("[Backend] /api/generate-images error:", error);
      return res.status(500).json({ error: error.message || "Failed to generate images." });
    }
  });

  app.post("/api/generate-videos", async (req, res): Promise<any> => {
    try {
      const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
      if (!apiKey) {
        return res.status(503).json({
          error: "API key is not configured. Please add your GEMINI_API_KEY in Settings > Secrets.",
        });
      }
      const ai = new GoogleGenAI({ apiKey });
      const body = { ...req.body };
      if (body.video?.uri && String(body.video.uri).includes("/api/video-download?b64=")) {
        const b64Part = String(body.video.uri).split("b64=")[1]?.split("&")[0] || "";
        if (b64Part) {
          body.video = { ...body.video, uri: Buffer.from(b64Part, "base64url").toString("utf-8") };
        }
      }
      const op = await ai.models.generateVideos(body);
      if (op.name) {
        videoOps.set(op.name, op);
      }
      return res.json({
        name: op.name,
        done: op.done,
        metadata: op.metadata,
        error: op.error,
        response: op.response,
      });
    } catch (error: any) {
      console.error("[Backend] /api/generate-videos error:", error);
      return res.status(500).json({ error: error.message || "Failed to start video generation." });
    }
  });

  app.post("/api/videos-operation", async (req, res): Promise<any> => {
    try {
      const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
      if (!apiKey) {
        return res.status(503).json({
          error: "API key is not configured. Please add your GEMINI_API_KEY in Settings > Secrets.",
        });
      }
      const ai = new GoogleGenAI({ apiKey });
      const opName = req.body?.operation?.name;
      const storedOp = opName ? videoOps.get(opName) : undefined;
      if (!storedOp) {
        return res.status(404).json({ error: "Video operation not found on server." });
      }
      const op = await ai.operations.getVideosOperation({ operation: storedOp });
      if (op.name) {
        videoOps.set(op.name, op);
      }
      const responseCopy = op.response ? JSON.parse(JSON.stringify(op.response)) : undefined;
      if (op.done && responseCopy?.generatedVideos) {
        for (const gv of responseCopy.generatedVideos) {
          if (gv.video?.uri) {
            const b64 = Buffer.from(gv.video.uri, "utf-8").toString("base64url");
            gv.video.uri = `/api/video-download?b64=${b64}`;
          }
        }
      }
      return res.json({
        name: op.name,
        done: op.done,
        metadata: op.metadata,
        error: op.error,
        response: responseCopy,
      });
    } catch (error: any) {
      console.error("[Backend] /api/videos-operation error:", error);
      return res.status(500).json({ error: error.message || "Failed to poll video operation." });
    }
  });

  app.get("/api/video-download", async (req, res): Promise<any> => {
    try {
      const apiKey = (process.env.GEMINI_API_KEY || process.env.API_KEY || "").trim();
      if (!apiKey) {
        return res.status(503).json({ error: "API key is not configured." });
      }
      let rawUri = "";
      if (req.query.b64) {
        rawUri = Buffer.from(String(req.query.b64).split("&")[0], "base64url").toString("utf-8");
      } else {
        rawUri = String(req.query.uri || "").split("&key=")[0];
      }
      if (!rawUri) {
        return res.status(400).json({ error: "Missing uri parameter." });
      }
      const sep = rawUri.includes("?") ? "&" : "?";
      const downloadUrl = `${rawUri}${sep}key=${apiKey}`;
      const upstream = await fetch(downloadUrl);
      if (!upstream.ok) {
        const errText = await upstream.text().catch(() => "");
        return res.status(upstream.status).send(errText || upstream.statusText);
      }
      res.setHeader("Content-Type", upstream.headers.get("content-type") || "video/mp4");
      const arrayBuf = await upstream.arrayBuffer();
      return res.send(Buffer.from(arrayBuf));
    } catch (error: any) {
      console.error("[Backend] /api/video-download error:", error);
      return res.status(500).json({ error: error.message || "Failed to download video." });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(rootDir, "dist");
    app.use(express.static(distPath));
    app.use((_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Backend] Server running on http://localhost:${PORT}`);
  });
}

startServer();
