import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { getUser } from '../kinde'
import { GoogleGenAI } from '@google/genai'
import { db } from '../db'
import { items as itemTable } from '../db/schema/items'
import { eq } from 'drizzle-orm'
import { type OutfitSuggestion } from '../sharedTypes'

const ai = new GoogleGenAI({})

const querySchema = z.object({
    lat: z.string().regex(/^-?\d+(\.\d+)?$/),
    lon: z.string().regex(/^-?\d+(\.\d+)?$/),
})

type OpenMeteoResponse = {
    current: {
        temperature_2m: number
        weathercode: number
        windspeed_10m: number
        precipitation: number
        time: string
    }
    timezone: string
}

async function fetchWeather(lat: string, lon: string): Promise<OpenMeteoResponse> {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weathercode,windspeed_10m,precipitation&temperature_unit=celsius&timezone=auto`
    const res = await fetch(url)
    if (!res.ok) throw new Error('Weather fetch failed')
    return res.json() as Promise<OpenMeteoResponse>
}

function describeWeather(code: number, tempC: number): string {
    if (code === 0) return `clear sky, ${tempC}°C`
    if (code <= 3) return `partly cloudy, ${tempC}°C`
    if (code <= 48) return `foggy, ${tempC}°C`
    if (code <= 67) return `rainy, ${tempC}°C`
    if (code <= 77) return `snowy, ${tempC}°C`
    if (code <= 82) return `rain showers, ${tempC}°C`
    return `stormy, ${tempC}°C`
}

export const recommendationsRoute = new Hono()
    .get('/', getUser, zValidator('query', querySchema), async (c) => {
        const user = c.var.user
        const { lat, lon } = c.req.valid('query')

        const [wardrobeItems, weather] = await Promise.all([
            db.select().from(itemTable).where(eq(itemTable.userId, user.id)).limit(100),
            fetchWeather(lat, lon),
        ])

        if (wardrobeItems.length === 0) {
            return c.json({ error: 'No items in wardrobe' }, 400)
        }

        const now = new Date(weather.current.time)
        const hour = now.getHours()
        const dayName = now.toLocaleDateString('en-US', { weekday: 'long' })
        const timeOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'
        const weatherDesc = describeWeather(weather.current.weathercode, weather.current.temperature_2m)

        const wardrobeList = wardrobeItems.map(item => ({
            id: item.id,
            name: item.name,
            type: item.type,
            color: item.color,
            size: item.size,
            lastWornAt: item.lastWornAt
                ? `last worn ${Math.floor((Date.now() - new Date(item.lastWornAt).getTime()) / 86400000)} days ago`
                : 'never worn',
        }))

        const prompt = `You are a fun, genuine personal stylist helping someone pick an outfit from their real wardrobe.

Context:
- It's ${timeOfDay} on ${dayName}
- Weather: ${weatherDesc}, wind ${weather.current.windspeed_10m} km/h, precipitation ${weather.current.precipitation} mm
- Timezone: ${weather.timezone}

Their wardrobe (${wardrobeItems.length} items):
${JSON.stringify(wardrobeList, null, 2)}

Give them 2-3 outfit suggestions using ONLY items from their wardrobe. Each outfit should be a coherent combination.

Rules:
- Favour items they haven't worn recently or never worn.
- Be genuinely helpful about the weather: if it's cold suggest layering, if rainy avoid delicate fabrics, etc.
- Keep the tone light, conversational, and encouraging — like a friend who happens to be good at fashion. No corporate bullet-point speak.
- If they have fewer than 3 items that can form a real outfit, give fewer suggestions and explain why.

Respond ONLY with a JSON array (no markdown fences, no extra text) matching this exact shape:
[
  {
    "title": "short catchy outfit name",
    "itemIds": [1, 4, 7],
    "reasoning": "2-3 sentences in a fun, personal tone"
  }
]`

        try {
            const response = await ai.models.generateContent({
                model: 'gemini-3-flash-lite-preview',
                contents: prompt,
            })

            const text = response.text ?? ''
            const sanitized = text.trim().replace(/^```json\s*/i, '').replace(/```$/, '')
            const suggestions: OutfitSuggestion[] = JSON.parse(sanitized)
            return c.json({ suggestions })
        } catch (err) {
            console.error('Gemini error:', err)
            return c.json({ suggestions: [] })
        }
    })
