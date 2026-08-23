# Hippocamp — Platanus Hack 26: Bogotá

**Current project logo:** project-logo.png

<img src="./project-logo.png" alt="Logo de Hippocamp" width="200" />

Track: 🌐 Simulations

**Hippocamp** — la memoria de tu red, antes de publicar.

Publicar es una apuesta a ciegas para founders solitarios. Hippocamp construye gemelos digitales de sus conexiones reales, entrenados con el historial de reacciones, y simula cómo respondería esa audiencia al copy antes de que salga a producción.

- App: [https://platanus-hack-front.vercel.app](https://platanus-hack-front.vercel.app)
- API: [https://platanus-hack-back.vercel.app](https://platanus-hack-back.vercel.app)

team-27

- Thomas Alejandro Jutinico Jaramillo ([@thomasjuti](https://github.com/thomasjuti))
- Juan Nicolas Torrente Heredia ([@1nicolas8](https://github.com/1nicolas8))
- Bryan Alexander Riaño Romero ([@alxbryann](https://github.com/alxbryann))

## Cómo corre

Pegas una URL pública de LinkedIn. Extraemos la red y el historial de reacciones, armamos gemelos digitales de esas conexiones y simulamos cómo recibirían el copy antes de publicarlo.

```bash
# backend
cd backend
cp .env.example .env
npm install
npm run db:migrate
npm run dev

# frontend
cd frontend
npm install
npm run dev
```

La descripción de entrega está en [`project-description.md`](./project-description.md) y la metadata en [`platanus-hack-project.jsonc`](./platanus-hack-project.jsonc).

## ⚠️ Deploying & integrations (Vercel, Render, etc.)

Deploy platforms like **Vercel**, **Render** or **Netlify** can only connect to
repositories **you own** — they can't be granted access to this organization repo.
To deploy (or add any integration) while keeping your commits here, mirror your
code to a personal repo:

1. Create a **personal** repository on your own GitHub account.
2. Point your local `origin` at **both** repos, so a single `git push` updates each one:

   ```bash
   # this org repo (keep it as a push target)...
   git remote set-url --add --push origin https://github.com/platanus-hack/platanus-hack-26-co-team-27.git
   # ...and your personal repo
   git remote set-url --add --push origin https://github.com/<your-user>/<your-repo>.git
   ```

   From now on `git push` sends every commit to **both** repositories.
3. Connect your deploy service (Vercel, Render, …) to your **personal** repo and deploy from there.

Your commits stay mirrored here for judging, while the deploy runs from the repo you control.
