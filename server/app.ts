import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { wardrobeRoute } from './routes/wardrobe'
import { authRoute } from './routes/auth'
import { signedUrlRoute } from './routes/signedUrl'
import { recommendationsRoute } from './routes/recommendations'

const app = new Hono()

app.use(logger())

const apiRoutes = app.basePath('/api')
    .route('/', authRoute)
    .route('/signed-url', signedUrlRoute)
    .route('/wardrobe', wardrobeRoute)
    .route('/recommendations', recommendationsRoute)

export default app
export type ApiRoutes = typeof apiRoutes