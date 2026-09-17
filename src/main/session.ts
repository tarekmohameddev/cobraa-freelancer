export type AuthSession = {
  userId: number
  token: string
  email?: string
}

let session: AuthSession | null = null

export function getSession() {
  return session
}

export function setSession(next: AuthSession | null) {
  session = next
}

