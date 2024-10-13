import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { serveStatic } from 'hono/bun'
import { wardrobeRoute } from './routes/wardrobe'
import { authRoute } from './routes/auth'
import { signedUrlRoute } from './routes/signedUrl'

const app = new Hono()

app.use(logger())

const apiRoutes = app.basePath('/api').route('/wardrobe', wardrobeRoute).route('/', authRoute).route('/signed-url', signedUrlRoute)

app.get('*', serveStatic({ root: './frontend/dist' }))
app.get('*', serveStatic({ path: './frontend/dist/index.html' }))

export default app
export type ApiRoutes = typeof apiRoutes