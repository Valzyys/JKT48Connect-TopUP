import { Hono } from "hono";
import type { ApiError } from "../shared/api";
import { AppError, type AppContext } from "./context";
import { type Env, loadConfig } from "./env";
import { adminRoutes } from "./routes/admin";
import { publicRoutes } from "./routes/public";
import { catalogNeedsRefresh, syncCatalog } from "./services/catalog";
import { runReconcile } from "./services/reconcile";

type AppEnv = { Bindings: Env; Variables: { ctx: AppContext; clientKey: string } };

export function buildApp(now: () => number = Date.now) {
  const app = new Hono<AppEnv>();

  app.use("/api/*", async (c, next) => {
    const ctx: AppContext = {
      db: c.env.DB,
      config: loadConfig(c.env),
      now,
      defer: (work) => {
        const guarded = work.catch((err: unknown) => console.error("deferred work failed", err instanceof Error ? err.message : err));
        try {
          c.executionCtx.waitUntil(guarded);
        } catch {
          // No execution context (e.g. some test harnesses): the promise still runs.
        }
      },
    };
    c.set("ctx", ctx);
    c.set("clientKey", c.req.header("cf-connecting-ip") ?? "unknown");
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Referrer-Policy", "no-referrer");

    // Serve the latest catalog immediately; refresh in the background when stale.
    if (c.req.method === "GET" && c.req.path.startsWith("/api/games") && ctx.config.catalogId) {
      ctx.defer(
        catalogNeedsRefresh(ctx.db, ctx.config, ctx.now()).then((due) => (due ? syncCatalog(ctx.db, ctx.config, ctx.now()) : null)),
      );
    }
    await next();
  });

  app.route("/api/admin", adminRoutes);
  app.route("/api", publicRoutes);

  app.notFound((c) => c.json<ApiError>({ error: { code: "not_found", message: "Tidak ditemukan." } }, 404));

  app.onError((err, c) => {
    if (err instanceof AppError) {
      return c.json<ApiError>({ error: { code: err.code, message: err.message, ...(err.fields ? { fields: err.fields } : {}) } }, err.status);
    }
    // Internal details stay in the logs; guests get a generic message.
    console.error("unhandled error", err instanceof Error ? `${err.name}: ${err.message}` : err);
    return c.json<ApiError>({ error: { code: "internal", message: "Terjadi kendala di server. Coba lagi sebentar lagi." } }, 500);
  });

  return app;
}

const app = buildApp();

export default {
  fetch: app.fetch,
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    const appCtx: AppContext = {
      db: env.DB,
      config: loadConfig(env),
      now: Date.now,
      defer: (work) => ctx.waitUntil(work.catch((err: unknown) => console.error("deferred work failed", err instanceof Error ? err.message : err))),
    };
    const report = await runReconcile(appCtx);
    console.log("reconcile", JSON.stringify(report));
  },
} satisfies ExportedHandler<Env>;
