import type { H3Event } from 'h3'

export interface AppUser { id: string, email: string, displayName: string }

// requireUserSession returns a User typed by the module (augmentation can be
// finicky across the app/server tsconfig split), so we assert our known shape
// here in one place. The session is always set by our own auth routes.
export async function requireAppUser(event: H3Event): Promise<AppUser> {
  const { user } = await requireUserSession(event)
  return user as unknown as AppUser
}
