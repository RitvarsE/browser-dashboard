// api/config.js — atdod lapai (pārlūkam) Supabase publisko konfigurāciju.
// URL un ANON atslēga ir PUBLISKAS un drošas rādīt pārlūkā — datus aizsargā
// Supabase Row Level Security (RLS). Slepenā service_role atslēga NETIEK
// atdota. Vērtības nāk no Vercel vides mainīgajiem (Supabase↔Vercel integrācija
// tos iestata automātiski).

module.exports = function handler(req, res) {
  const env = process.env;
  const url =
    env.SUPABASE_URL ||
    env.NEXT_PUBLIC_SUPABASE_URL ||
    env.SUPABASE_NEXT_PUBLIC_SUPABASE_URL ||
    "";
  const anonKey =
    env.SUPABASE_ANON_KEY ||
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    env.SUPABASE_NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    "";

  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({ url, anonKey, configured: Boolean(url && anonKey) });
};
