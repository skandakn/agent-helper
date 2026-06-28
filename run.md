# Running the Hackathon Agent

This document contains all the commands you need to run, manage, and use the Hackathon Launch & Marketing Agent.

## Prerequisites
- Docker and Docker Compose installed.
- Ensure the `.env` file exists at the project root (copied from `.env.example`).

---

## 🚀 Development Mode

Use this mode when you are actively developing the project. The frontend runs with hot-reloading enabled, and the backend runs with auto-reload.

**Start the stack (in the background):**
```bash
cd hackathon-agent
docker compose up --build -d
```

**Start the stack (and view live logs in your terminal):**
```bash
docker compose up --build
```

---

## 🏭 Production Mode

Use this mode to test the fully built standalone frontend and production backend configuration.

**Start the production stack:**
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build -d
```

---

## 🛠️ Management Commands

**View logs for all services:**
```bash
docker compose logs -f
```

**View logs for a specific service (e.g., backend or frontend):**
```bash
docker compose logs -f backend
docker compose logs -f frontend
```

**Stop all running containers:**
```bash
docker compose down
```

**Stop all containers and remove the database/storage volumes (Full Reset):**
```bash
docker compose down -v
```

---

## 🌐 Accessing the Application

Once the stack is running, you can access the services at the following URLs:

- **Frontend Dashboard:** [http://localhost:3000](http://localhost:3000)
- **Backend API Docs (Swagger):** [http://localhost:8000/docs](http://localhost:8000/docs)
- **Qdrant Dashboard (Optional):** [http://localhost:6333/dashboard](http://localhost:6333/dashboard)
