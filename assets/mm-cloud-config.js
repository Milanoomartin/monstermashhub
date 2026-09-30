/* Monster Mash Cloud — connect the app to your Supabase project.
   Supabase dashboard → Project Settings → API (or "Connect"):
     url     → Project URL, e.g. https://abcdefghijklmnop.supabase.co
     anonKey → the "anon" public key or the "publishable" key (sb_publishable_…)
   Both are meant to be public: the database rules in supabase/schema.sql decide
   what each signed-in player can see. NEVER put the service_role / secret key here.

   providers: extra sign-in buttons. Turn each one on first in
   Supabase → Authentication → Sign In / Providers, then list it here, e.g. ['google', 'discord'].
   Email + password and email sign-in links always work.

   Leave url empty to run the app without cloud features (everything stays on this device). */
window.MM_CLOUD = {
  url: '',
  anonKey: '',
  providers: [],
};
