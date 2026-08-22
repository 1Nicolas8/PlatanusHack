# team-27 Platanus Hack 26: Bogotá Project

**Current project logo:** project-logo.png

<img src="./project-logo.png" alt="Project Logo" width="200" />

Track: 🌐 Simulations

team-27

- Andrés Sanabria ([@andy-spike](https://github.com/andy-spike))
- Thomas Alejandro Jutinico Jaramillo ([@thomasjuti](https://github.com/thomasjuti))
- Juan Camilo Mesa Calderon ([@juanmesa527](https://github.com/juanmesa527))
- Juan Nicolas Torrente Heredia ([@1nicolas8](https://github.com/1nicolas8))
- Bryan Alexander Riaño Romero ([@alxbryann](https://github.com/alxbryann))

Before Submitting:

- ✅ Fill in the project metadata (name, oneliner, description and deploy URL) in platanus-hack-project.jsonc

- ✅ Replace the contents of project-description.md with your project description in markdown

- ✅ Provide a 1000x1000 png project logo, max 500kb

- ✅ Provide a concise and to the point readme.

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

Have fun! 🚀

---

## Estado del repo

Arranque limpio. La idea anterior se archivó y el proyecto empieza de cero.

- [`backend/`](./backend) — Express + Supabase. Hoy solo expone healthchecks; la
  infraestructura de migraciones automáticas y deploy ya está resuelta.
- `frontend/` — pendiente.

### Historia anterior

Todo el trabajo previo está preservado y es recuperable:

```bash
git checkout archive/idea-1-sala-de-trading
```

Existe como rama y como tag. No se borró nada.

### Quick start — backend

```bash
cd backend
cp .env.example .env
npm install
npm run db:migrate
npm run dev
```

- `GET /health` — liveness
- `GET /health/ready` — readiness (verifica la base)

Antes de escribir código, leé [`backend/AGENTS.md`](./backend/AGENTS.md). Documenta la
arquitectura, las convenciones y las trampas concretas de Vercel y Supabase que ya nos
costaron tiempo una vez.
