FROM node:20

ARG TZ
ENV TZ="$TZ"

# Outils de dev + iptables/ipset pour le firewall
RUN apt update && apt install -y \
  less git procps sudo fzf zsh man-db unzip gnupg2 gh \
  iptables ipset iproute2 dnsutils aggregate jq \
  && rm -rf /var/lib/apt/lists/*

ENV DEVCONTAINER=true

# Historique bash persistant (via volume monté)
RUN SNIPPET="export PROMPT_COMMAND='history -a' && export HISTFILE=/commandhistory/.bash_history" \
  && mkdir /commandhistory \
  && touch /commandhistory/.bash_history \
  && chown -R node /commandhistory

RUN mkdir -p /workspace && chown -R node:node /workspace
WORKDIR /workspace

# git-delta (joli diff)
RUN ARCH=$(dpkg --print-architecture) && \
  wget -q -O /tmp/git-delta.deb "https://github.com/dandavison/delta/releases/download/0.18.2/git-delta_0.18.2_${ARCH}.deb" && \
  dpkg -i /tmp/git-delta.deb && rm /tmp/git-delta.deb

# Dossier npm global accessible à l'utilisateur node (sinon npm -g échoue en permission)
RUN mkdir -p /usr/local/share/npm-global && chown -R node:node /usr/local/share/npm-global

# Utilisateur non-root par défaut
USER node

ENV NPM_CONFIG_PREFIX=/usr/local/share/npm-global
ENV PATH=$PATH:/usr/local/share/npm-global/bin

# Installe Claude Code dans l'image
RUN npm install -g @anthropic-ai/claude-code

# Scripts privilégiés (firewall + chown du volume node_modules), sudo SANS mot de passe
COPY init-firewall.sh setup-workspace.sh /usr/local/bin/
USER root
RUN chmod +x /usr/local/bin/init-firewall.sh /usr/local/bin/setup-workspace.sh && \
  echo "node ALL=(root) NOPASSWD: /usr/local/bin/init-firewall.sh, /usr/local/bin/setup-workspace.sh" > /etc/sudoers.d/node-setup && \
  chmod 0440 /etc/sudoers.d/node-setup && \
  echo 'export PATH=$PATH:/usr/local/share/npm-global/bin' > /etc/profile.d/npm-global.sh
USER node
