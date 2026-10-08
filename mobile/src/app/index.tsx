import { useKindeAuth } from '@kinde/expo'
import { Redirect } from 'expo-router'

// TEMPORARY (Task 3 only): serves "/" so the guard has somewhere to start. Task 4 replaces it with (tabs)/index.
export default function Index() {
  const { isAuthenticated } = useKindeAuth()
  return <Redirect href={isAuthenticated ? '/debug-auth' : '/sign-in'} />
}
