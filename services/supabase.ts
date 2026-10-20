import { createClient } from '@supabase/supabase-js'
import { leadSchema } from '../lib/lead-target.js'

// Env unset = today's target (VITE_SUPABASE_URL's project, schema public); the WS hub switch is an env change only
// (see lib/lead-target.js). Each env read stays a full import.meta.env.VITE_* expression so Vite inlines only it.
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
    db: { schema: leadSchema(import.meta.env.VITE_SUPABASE_DB_SCHEMA) as 'public' },
    auth: {
      lockAcquireTimeout: 1000,
      lock: async (name: string, acquireTimeout: number, fn: () => Promise<any>) => await fn()
    }
  }
)
