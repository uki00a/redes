import { APIServer } from './api_server.ts'
import { assert, assertEquals } from 'std/testing/asserts.ts'

Deno.test('[api/api_server]: GET /keys', async () => {
  const server = new APIServer('/api')
  try {
    const port = 3000
    await server.listen(port)
    {
      const res = await fetch(`http://127.0.0.1:${port}/api/connections`, {
        method: 'POST',
        body: '{}',
        headers: { 'Content-Type': 'text/json' }
      })
      assertEquals(res.status, 200)
      assertEquals(await res.json(), { ok: true })
    }

    {
      const res = await fetch(`http://127.0.0.1:${port}/api/keys`)
      assertEquals(res.status, 200)
      const payload = await res.json()
      assert(payload)
    }
  } finally {
    await server.close()
  }
})