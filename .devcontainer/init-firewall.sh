#!/bin/bash
# Firewall en ALLOWLIST : l'agent ne peut joindre QUE les domaines listés.
# Tout le reste (réseau interne, internet) est bloqué. Lancé au démarrage du conteneur.
set -euo pipefail
IFS=$'\n\t'

# Purge des règles existantes
iptables -F
iptables -X
iptables -t nat -F
iptables -t nat -X
iptables -t mangle -F
iptables -t mangle -X
ipset destroy allowed-domains 2>/dev/null || true

# DNS + localhost AVANT de restreindre
iptables -A OUTPUT -p udp --dport 53 -j ACCEPT
iptables -A INPUT  -p udp --sport 53 -j ACCEPT
iptables -A OUTPUT -p tcp --dport 53 -j ACCEPT
iptables -A INPUT  -p tcp --sport 53 -j ACCEPT
iptables -A INPUT  -i lo -j ACCEPT
iptables -A OUTPUT -o lo -j ACCEPT

ipset create allowed-domains hash:net

# Plages d'IP GitHub (méta API)
echo "Récupération des plages GitHub..."
gh_ranges=$(curl -s https://api.github.com/meta)
if [ -z "$gh_ranges" ]; then echo "ERREUR: plages GitHub introuvables"; exit 1; fi
if ! echo "$gh_ranges" | jq -e '.web and .api and .git' >/dev/null; then
  echo "ERREUR: réponse GitHub incomplète"; exit 1
fi
while read -r cidr; do
  [[ "$cidr" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}/[0-9]{1,2}$ ]] || { echo "CIDR invalide: $cidr"; exit 1; }
  ipset add allowed-domains "$cidr"
done < <(echo "$gh_ranges" | jq -r '(.web + .api + .git + .hooks)[]' | aggregate -q)

# Domaines autorisés — npm/anthropic + dépendances de project-M2 (Supabase, OpenAI).
# Ajoute ici tout autre domaine dont TON projet a besoin.
# Un domaine qui ne résout pas = AVERTISSEMENT (on continue), jamais un crash du firewall.
for domain in \
  "registry.npmjs.org" \
  "api.anthropic.com" \
  "zrlwwxarwgfkdwgshocb.supabase.co" \
  "api.openai.com"; do
  echo "Résolution $domain..."
  ips=$(dig +short A "$domain")
  if [ -z "$ips" ]; then echo "AVERTISSEMENT: $domain ne résout pas, ignoré"; continue; fi
  while read -r ip; do
    [[ "$ip" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] || { echo "AVERTISSEMENT: IP invalide $domain: $ip, ignorée"; continue; }
    ipset add allowed-domains "$ip"
  done < <(echo "$ips")
done

# Autorise le réseau de l'hôte (pour que VS Code parle au conteneur)
HOST_IP=$(ip route | grep default | cut -d" " -f3)
[ -z "$HOST_IP" ] && { echo "ERREUR: IP hôte introuvable"; exit 1; }
HOST_NETWORK=$(echo "$HOST_IP" | sed "s/\.[0-9]*$/.0\/24/")
echo "Réseau hôte: $HOST_NETWORK"
iptables -A INPUT  -s "$HOST_NETWORK" -j ACCEPT
iptables -A OUTPUT -d "$HOST_NETWORK" -j ACCEPT

# Politique par défaut : TOUT bloquer
iptables -P INPUT DROP
iptables -P FORWARD DROP
iptables -P OUTPUT DROP

# Connexions déjà établies
iptables -A INPUT  -m state --state ESTABLISHED,RELATED -j ACCEPT
iptables -A OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT

# Autorise uniquement vers l'allowlist
iptables -A OUTPUT -m set --match-set allowed-domains dst -j ACCEPT

echo "Firewall configuré. Vérification..."
if curl --connect-timeout 5 https://example.com >/dev/null 2>&1; then
  echo "ERREUR: example.com joignable -> firewall défaillant"; exit 1
else
  echo "OK: example.com bloqué (attendu)"
fi
if ! curl --connect-timeout 5 https://api.anthropic.com >/dev/null 2>&1; then
  echo "ERREUR: api.anthropic.com injoignable -> firewall trop strict"; exit 1
else
  echo "OK: api.anthropic.com joignable"
fi
