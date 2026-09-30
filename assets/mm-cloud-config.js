/* Monster Mash Cloud — connect the app to your Supabase project.
   Supabase dashboard → Project Settings → API (or "Connect"):
     url     → Project URL
     anonKey → the "publishable" key (sb_publishable_…) or the legacy "anon" public key
   Both are meant to be public: the database rules in supabase/schema.sql decide
   what each signed-in player can see. NEVER put the service_role / secret key here.

   Players sign in with email + password (or a one-time email link).

   Leave url empty to run the app without cloud features (everything stays on this device). */
window.MM_CLOUD = {
  url: 'https://geqbkdfpheemoqlhihsj.supabase.co',
  anonKey: 'sb_publishable_QEIa9p5lfwzb9upBR8kT4Q_bVWzfHdh',
};
