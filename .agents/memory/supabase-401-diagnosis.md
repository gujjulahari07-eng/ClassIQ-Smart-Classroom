---
name: Supabase 401 diagnosis
description: Distinguishes rejected project credentials from frontend, API, and schema errors in ClassIQ.
---

When Supabase returns `Invalid API key` from both REST and Realtime while the web workflow, API health endpoint, and workspace typecheck succeed, treat it as a project credential/configuration issue. Restarting workflows and re-entering matching URL variables did not resolve this project's 401; the active publishable key still needed verification in Supabase.

**Why:** The client and server cannot repair a key that the Supabase project rejects, and a missing SQL schema would produce a table/schema error rather than an invalid-key response.

**How to apply:** Verify the active publishable/anon key in the same Supabase project's API settings, ensure the browser and API URLs match it, and update the key through Replit Secrets. Do not expose the key or switch to a service-role key. Apply the database schema separately after authentication succeeds.
