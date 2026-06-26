import express from 'express'
import dotenv from 'dotenv'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import authRoutes from './routes/auth'
import employeeRoutes from './routes/employees'

dotenv.config()

const app = express()

app.use(helmet())
app.use(express.json())

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Trop de requêtes, réessaie dans 15 minutes' },
})

app.get('/health', (req, res) => {
  res.json({ status: 'ok' })
})

app.use('/auth', authLimiter, authRoutes)
app.use('/employees', employeeRoutes)

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`Serveur démarré sur le port ${PORT}`)
})

export default app