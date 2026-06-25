#!/bin/bash
# Donne le volume node_modules (monté vide, root) à l'utilisateur node,
# pour que `npm install` puisse y écrire sans casser le node_modules Windows de l'hôte.
set -euo pipefail
mkdir -p /workspace/backend/node_modules
chown -R node:node /workspace/backend/node_modules
echo "node_modules (volume) prêt pour l'utilisateur node"
