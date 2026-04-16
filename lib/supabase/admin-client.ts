import { createClient, type SupabaseClient } from "@supabase/supabase-js"

let singleton: SupabaseClient | null = null

export const canUseSupabase = () => {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
}

export const getSupabaseAdminClient = (): SupabaseClient | null => {
  if (!canUseSupabase()) {
    return null
  }

  if (!singleton) {
    singleton = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL as string,
      process.env.SUPABASE_SERVICE_ROLE_KEY as string,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    )
  }

  return singleton
}