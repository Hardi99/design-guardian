// Script opérateur de suppression RGPD. DRY-RUN par défaut. À LANCER AVEC tsx (PAS `node`) :
//   npx tsx scripts/purge.ts --account <email|uuid>
//   npx tsx scripts/purge.ts --file-key <figma_file_key>
//   npx tsx scripts/purge.ts --project <project_id>
// Ajouter --confirm pour exécuter réellement (sinon : affichage seul, rien n'est supprimé).
import dotenv from 'dotenv'; dotenv.config();
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { collectProjectStoragePaths, purgeProjectData, purgeAccount } from '../src/services/purge.service.ts';

const args = process.argv.slice(2);
const get = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
const confirm = args.includes('--confirm');

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  console.error('Manque SUPABASE_URL / SUPABASE_SERVICE_KEY dans l\'environnement (.env).');
  process.exit(1);
}

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
const storage = db.storage;
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

const account = get('--account');
const fileKey = get('--file-key');
const projectId = get('--project');

function banner() {
  console.log(confirm
    ? '⚠️  MODE RÉEL (--confirm) — suppression effective'
    : '🔍 DRY-RUN (par défaut) — rien ne sera supprimé. Ajoute --confirm pour exécuter.');
}

async function resolveProjectId() {
  if (projectId) return projectId;
  if (fileKey) {
    const { data } = await db.from('projects').select('id').eq('figma_file_key', fileKey).maybeSingle();
    return data?.id;
  }
  return undefined;
}

async function main() {
  banner();

  if (account) {
    let userId = account.includes('@') ? undefined : account;
    if (!userId) {
      const { data } = await db.from('profiles').select('id').eq('email', account).maybeSingle();
      userId = data?.id;
    }
    if (!userId) { console.error('Compte introuvable:', account); process.exit(1); }
    const { data: projects } = await db.from('projects').select('id').eq('owner_id', userId);
    console.log(`Compte ${userId} : ${projects?.length ?? 0} projet(s) possédé(s) + profil + device_links.`);
    if (!confirm) { console.log('(dry-run) Rien supprimé.'); return; }
    const res = await purgeAccount(db, storage, stripe, userId);
    console.log('Supprimé:', res);
    return;
  }

  const pid = await resolveProjectId();
  if (!pid) { console.error('Projet introuvable (passe --project <id> ou --file-key <k>).'); process.exit(1); }
  const paths = await collectProjectStoragePaths(db, storage, pid);
  console.log(`Projet ${pid} : ${paths.length} blob(s) Storage + ligne projet (cascade assets/versions).`);
  if (!confirm) { console.log('(dry-run) Rien supprimé.'); return; }
  const res = await purgeProjectData(db, storage, pid);
  console.log('Supprimé:', res);
}

main().catch(e => { console.error(e); process.exit(1); });
