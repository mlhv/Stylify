import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { wardrobeRoute } from './routes/wardrobe'
import { authRoute } from './routes/auth'
import { signedUrlRoute } from './routes/signedUrl'

const app = new Hono()

app.use(logger())

const apiRoutes = app.basePath('/api')
    .route('/wardrobe', wardrobeRoute)
    .route('/', authRoute)
    .route('/signed-url', signedUrlRoute)

export default app
export type ApiRoutes = typeof apiRoutes