import { useKindeAuth } from '@kinde/expo'
import { useEffect, useState } from 'react'
import { Pressable, ScrollView, Text } from 'react-native'

import { API_URL, KINDE_AUDIENCE } from '@/lib/config'

// TEMPORARY (Task 3 only): proves the token check in the spec, then is deleted in Task 4.
type Report = { aud: string; audOk: boolean; sub: string; meStatus: number; meUserId: string }

function decodePayload(token: string): { aud?: string | string[]; sub?: string } {
  const part = token.split('.')[1] ?? ''
  const base64 = part.replace(/-/g, '+').replace(/_/g, '/')
  return JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')))
}

export default function DebugAuth() {
  const kinde = useKindeAuth()
  const [report, setReport] = useState<Report | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function run() {
      const token = await kinde.getAccessToken()
      if (!token) throw new Error('No access token stored')
      const payload = decodePayload(token)
      const aud = ([] as string[]).concat(payload.aud ?? [])
      const res = await fetch(`${API_URL}/api/me`, { headers: { Authorization: `Bearer ${token}` } })
      const body = res.ok ? ((await res.json()) as { user?: { id?: string } }) : null
      setReport({
        aud: aud.join(', ') || '(none)',
        audOk: aud.includes(KINDE_AUDIENCE),
        sub: payload.sub ?? '(none)',
        meStatus: res.status,
        meUserId: body?.user?.id ?? '(none)',
      })
    }
    run().catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [kinde])

  return (
    <ScrollView className="flex-1 bg-white" contentContainerClassName="gap-3 p-6 pt-20">
      <Text className="text-2xl font-bold">Token check</Text>
      {error ? <Text className="text-red-600">{error}</Text> : null}
      {report ? (
        <>
          <Text selectable>aud: {report.aud}</Text>
          <Text className={report.audOk ? 'text-green-700' : 'text-red-600'}>
            {report.audOk ? 'PASS: audience present' : `FAIL: audience ${KINDE_AUDIENCE} missing`}
          </Text>
          <Text selectable>sub: {report.sub}</Text>
          <Text selectable>GET /api/me: {report.meStatus}</Text>
          <Text selectable>/api/me user id: {report.meUserId}</Text>
        </>
      ) : (
        <Text>Checking…</Text>
      )}
      <Pressable className="mt-6 items-center rounded-lg bg-neutral-900 py-4" onPress={() => void kinde.logout({ revokeToken: true })}>
        <Text className="font-semibold text-white">Sign out</Text>
      </Pressable>
    </ScrollView>
  )
}
