import type { Redis } from 'redis'
import { connect } from 'redis'
import { Application, Middleware, Router } from 'oak'
import type { Context } from 'oak'
import { NotConnectedError } from './errors.ts'

export class APIServer {
  #app: Application
  #activeRedis: Redis | null = null
  #abort: AbortController | null = null
  #listenPromise: Promise<void> | null = null

  constructor(prefix: string) {
    this.#app = this.#createApp(prefix)
  }

  #createApp(prefix: string): Application {
    const app = new Application()
    const router = new Router({ prefix })
    router.get('/keys', (ctx) => this.#getKeys(ctx))
    router.post('/connections', (ctx) => this.#connect(ctx))
    app.use(router.routes())
    app.use(router.allowedMethods())
    return app
  }

  use(middleware: Middleware): void {
    this.#app.use(middleware)
  }

  listen(port: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      function onListen(): void {
        cleanup()
        resolve()
      }
      function onError(error: unknown): void {
        cleanup()
        reject(error)
      }
      const cleanup = () => {
        this.#app.removeEventListener("listen", onListen)
        this.#app.removeEventListener("error", onError)
      }
      this.#app.addEventListener("listen", onListen, { once: true });
      this.#app.addEventListener("error", onError, { once: true })
      this.#abort = new AbortController()
      this.#listenPromise = this.#app.listen({ port, signal: this.#abort.signal })
    })
  }

  async close(): Promise<void> {
    if (this.#abort) {
      this.#abort.abort()
      await this.#listenPromise

      this.#abort = null
      this.#listenPromise = null

      await this.#disconnectIfNeeded()
    }
  }

  async #connect(ctx: Context): Promise<void> {
    const body = await ctx.request.body({ type: 'json' })
    const request = await body.value
    if (this.#activeRedis) {
      await this.#activeRedis.quit()
    }
    this.#activeRedis = await connect({
      hostname: request.hostname ?? 'localhost',
      port: request.port ?? 6379
    })
    ctx.response.body = { ok: true }
  }

  async #disconnectIfNeeded(): Promise<void> {
    if (this.#activeRedis == null) {
      return
    }
    await this.#activeRedis.quit()
    this.#activeRedis = null
  }

  async #getKeys(ctx: Context): Promise<void> {
    const redis = this.#getRedis()
    const [nextCursor, keys] = await redis.scan(0, {
      pattern: '*',
      count: 500
    })

    ctx.response.body = {
      cursor: parseInt(nextCursor),
      keys
    }
  }

  #getRedis(): Redis {
    if (this.#activeRedis == null) {
      throw new NotConnectedError()
    } else {
      return this.#activeRedis
    }
  }
}
