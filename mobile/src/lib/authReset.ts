// The Kinde provider keeps "signed in" in private state that only its own logout can reset.
// Changing this counter remounts the provider (it is used as its key), which re-reads the
// device storage and, with the tokens removed, comes back signed out.
let epoch = 0
const listeners = new Set<() => void>()

export function resetAuthProvider() {
  epoch += 1
  for (const listener of listeners) listener()
}

export function subscribeAuthReset(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function authResetEpoch() {
  return epoch
}
