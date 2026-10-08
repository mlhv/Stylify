// EXPO_PUBLIC_ values are read at build time and ship inside the app; none of them is a secret.
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://stylify.space'
export const KINDE_DOMAIN = process.env.EXPO_PUBLIC_KINDE_DOMAIN
export const KINDE_CLIENT_ID = process.env.EXPO_PUBLIC_KINDE_CLIENT_ID
// Must equal KINDE_AUDIENCE on the server, or every request is a 401.
export const KINDE_AUDIENCE = 'https://stylify.space/api'
