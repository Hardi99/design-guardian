// ─── UI THREAD — Preact + HTTP. Aucun accès API Figma ici. ───────────────────

import { render, h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import type { MainToUI } from './types.js';
import { useAppStore } from './useAppStore.js';
import { appStore } from './store.js';
import type { Asset, Plan } from './store.js';
import type { AssetIdentity } from './fileSplit.js';
import { initSentry } from './sentry.js';
import { API_BASE, api, send, session, maxPlan } from './ui/api.js';
import { Spinner } from './ui/components/common.js';
import { LoadingScreen } from './ui/screens/Loading.js';
import { openHistory } from './ui/history.js';
import { pickHistory } from './ui/historyPick.js';
import { HomeScreen } from './ui/screens/Home.js';
import { FrameHistoryScreen } from './ui/screens/FrameHistory.js';
import { CheckpointScreen } from './ui/screens/Checkpoint.js';
import { UpgradeScreen } from './ui/screens/Upgrade.js';
import { DiffScreen } from './ui/diff/DiffScreen.js';
import './ui.css';

initSentry();

// ─── App (routeur) ────────────────────────────────────────────────────────────

function App() {
  const screen        = useAppStore(s => s.screen);
  const setScreen     = useAppStore(s => s.setScreen);
  const setApiKey     = useAppStore(s => s.setApiKey);
  const setPlan       = useAppStore(s => s.setPlan);
  const setAuthor     = useAppStore(s => s.setAuthor);
  const setAssets     = useAppStore(s => s.setAssets);
  const setSnapshot   = useAppStore(s => s.setSnapshot);
  const setInitErr    = useAppStore(s => s.setInitErr);
  const setSplitOffer = useAppStore(s => s.setSplitOffer);
  const diffVersionId = useAppStore(s => s.diffVersion?.id ?? null);
  const [showUpgrade, setShowUpgrade] = useState(false);

  useEffect(() => {
    const handler = async (e: MessageEvent) => {
      const msg = e.data.pluginMessage as MainToUI;
      if (!msg) return;
      switch (msg.type) {
        case 'FILE_INFO': {
          session.fileName = msg.fileName;
          session.fileKey = msg.fileKey;
          session.lastAssetId = msg.lastAssetId;
          try {
            const res = await fetch(`${API_BASE}/api/projects/auto-init`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ figma_file_key: msg.fileKey, figma_file_name: msg.fileName }),
            });
            // Une réponse d'erreur n'est pas un projet : sans cette garde, la clé d'API restait
            // vide et toutes les requêtes suivantes échouaient (« Invalid api key »).
            if (!res.ok) { setInitErr(`Connexion refusée par le serveur (${res.status}).`); break; }
            const data = await res.json() as { api_key: string; project: { id: string; name: string; plan: string }; assets: Asset[] };
            setApiKey(data.api_key);
            setPlan(maxPlan(appStore.getState().plan, (data.project.plan as Plan) ?? 'free'));
            setAssets(data.assets);
            // Réponse fraîche : l'historique déjà ouvert (depuis le cache) reste ouvert s'il existe.
            const open = appStore.getState().asset;
            if (appStore.getState().screen === 'loading' || !open || !data.assets.some(a => a.id === open.id)) {
              await openHistory(data.api_key, data.assets, open?.id ?? null);
            }
            // Rafraîchit le cache stale-while-revalidate (source de vérité = ce fetch frais).
            send({ type: 'PERSIST_STATE', fileKey: msg.fileKey, apiKey: data.api_key, plan: data.project.plan, assets: data.assets });
            // Projet partagé avec d'autres fichiers (anciennes versions du plugin) ? Le plugin
            // vérifie quels éléments suivis sont dans ce fichier (cf. fileSplit.ts). Best-effort.
            if (data.assets.length > 0) {
              api<{ identities: AssetIdentity[] }>(data.api_key, '/api/assets/identities')
                .then(r => { if (r.identities.length > 0) send({ type: 'CHECK_PRESENCE', identities: r.identities }); })
                .catch(() => { /* best-effort : pas de tri possible */ });
            }
          } catch {
            setInitErr('Impossible de joindre le serveur.');
          }
          break;
        }
        case 'CACHED_STATE': {
          // Affichage STALE immédiat (2e ouverture) : le fetch auto-init frais (ci-dessus)
          // écrasera cet état dès qu'il répond — cette branche ne fait qu'accélérer le 1er rendu.
          // Garde anti-course inverse : si le fetch frais est déjà arrivé (apiKey posé), ne
          // pas écraser avec le stale (CACHED_STATE peut arriver après sur une file lente).
          if (appStore.getState().apiKey) break;
          // L'accueil fait `apiKey!` — exiger apiKey ET assets avant de l'afficher.
          if (msg.apiKey && msg.assets) {
            setApiKey(msg.apiKey);
            if (msg.plan) setPlan(maxPlan(appStore.getState().plan, msg.plan as Plan));
            setAssets(msg.assets);
            const cachedPick = pickHistory(msg.assets, { currentId: null, lastId: session.lastAssetId });
            if (cachedPick) { appStore.getState().setAsset(cachedPick); setScreen('home'); }
          }
          break;
        }
        case 'INIT_ERROR':     setInitErr(msg.message); break;
        case 'FRAME_RENDERED': {
          // Upload global (pas dans l'écran de capture, qu'on peut quitter avant la fin des
          // exports). Best-effort : un rendu manquant affiche « Rendu indisponible. ».
          const key = appStore.getState().apiKey;
          if (key) {
            void api(key, `/api/checkpoints/${msg.versionId}/render`, {
              method: 'POST',
              body: JSON.stringify({ render_svg_b64: msg.b64, render_kind: msg.kind, frame_key: msg.key }),
            }).catch(() => { /* best-effort */ });
          }
          break;
        }
        case 'PRESENCE':
          setSplitOffer(msg.offer ? { here: msg.here, elsewhere: msg.elsewhere } : null);
          break;
        case 'SPLIT_READY': {
          const { apiKey, splitOffer } = appStore.getState();
          try {
            const data = await api<{ api_key: string; project: { plan: string }; assets: Asset[] }>(apiKey!, '/api/projects/split', {
              method: 'POST',
              body: JSON.stringify({ figma_file_key: msg.fileKey, figma_file_name: session.fileName, asset_ids: splitOffer?.here ?? [] }),
            });
            setApiKey(data.api_key);
            setAssets(data.assets);
            setSplitOffer(null);
            session.fileKey = msg.fileKey;
            await openHistory(data.api_key, data.assets, appStore.getState().asset?.id ?? null);
            send({ type: 'PERSIST_STATE', fileKey: msg.fileKey, apiKey: data.api_key, plan: data.project.plan, assets: data.assets });
          } catch (e) {
            send({ type: 'SPLIT_ROLLBACK', fileKey: msg.previous });
            alert(`[DG] Séparation impossible : ${(e as Error).message}`);
          }
          break;
        }
        case 'AUTHOR_INFO':    setAuthor(msg.author); break;
        case 'SNAPSHOT_READY': setSnapshot(msg.snapshot, msg.render_svg_b64, msg.render_kind); setScreen('checkpoint'); break;
        case 'ERROR': alert(`[DG] ${msg.message}`); break;
        case 'LINK_TOKEN': {
          session.linkToken = msg.token;
          if (msg.token) {
            try {
              const me = await fetch(`${API_BASE}/api/link/me`, { headers: { 'X-Link-Token': msg.token } }).then(r => r.json()) as { plan: Plan };
              setPlan(maxPlan(appStore.getState().plan, me.plan ?? 'free'));
            } catch { /* garde le plan projet */ }
          }
          break;
        }
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  if (showUpgrade) return <UpgradeScreen onBack={() => setShowUpgrade(false)} />;

  if (screen === 'loading')    return <LoadingScreen />;
  if (screen === 'home')       return <HomeScreen onUpgrade={() => setShowUpgrade(true)} />;
  if (screen === 'frameHistory') return <FrameHistoryScreen />;
  if (screen === 'diff')       return <DiffScreen key={diffVersionId} />;
  if (screen === 'checkpoint') return <CheckpointScreen />;
  return <Spinner full />;
}

render(h(App, null), document.body);
