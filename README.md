# FinRelief AI

A full-stack app for tracking debt, running settlement math, and drafting negotiation letters. Built during my SmartBridge internship.

**🌐 Live Demo:** [https://fin-relief-prototype.onrender.com/](https://fin-relief-prototype.onrender.com/)  
*(Note: Deployed on Render's free tier, so the server may take up to a minute to spin up/load on your first visit!)*

For the "why" behind this project and a walkthrough of what it looks like, read [ABOUT.md](ABOUT.md). This file is just the setup.

## Stack

- **Backend:** FastAPI — quick to build with, and Swagger docs come for free
- **Database:** SQLite + SQLAlchemy — no setup overhead for something this size
- **AI:** Google Gemini (`gemini-1.5-flash`) — writes the negotiation letters
- **Auth:** bcrypt + JWT (python-jose)
- **Frontend:** plain HTML/CSS/JS served straight from FastAPI — no build step, no framework to fight with

## Running it locally

1. Clone it:
```bash
git clone https://github.com/Sridattasai18/Fin-relief-prototype.git
cd Fin-relief-prototype
```

2. Copy the env file and fill it in:
```bash
cp .env.example .env
```

You need two values:
```env
GEMINI_API_KEY=your_key_here       # free at https://aistudio.google.com/app/apikey
FINRELIEF_SECRET_KEY=your_secret   # python -c "import secrets; print(secrets.token_hex(32))"
```

Skipping the Gemini key is fine — the app just falls back to a template letter instead of an AI-written one. Everything else works the same either way.

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Run it:
```bash
uvicorn main:app --reload --port 8000
```

5. Open [http://localhost:8000](http://localhost:8000)

The SQLite file (`finrelief.db`) gets created automatically the first time you run it.

## Want to see the UI without setting anything up?

Open `finrelief-design-prototype.html` directly in your browser. It's a static mockup running on fake data — no server, no dependencies, just to get a feel for the layout.

## API

Once the server's running, the full interactive docs are at [http://localhost:8000/docs](http://localhost:8000/docs). Short version below:

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/auth/register` | Create an account |
| `POST` | `/auth/login` | Log in, get JWT token |
| `GET` | `/auth/me` | Current user info |
| `GET` | `/dashboard` | Aggregate stats across all your loans |
| `GET` | `/loans` | List all loans |
| `POST` | `/loans` | Add a loan |
| `PATCH` | `/loans/{id}` | Edit a loan |
| `DELETE` | `/loans/{id}` | Delete a loan (cascades to letters) |
| `GET` | `/settlement/{id}` | Get settlement recommendation + saves snapshot |
| `GET` | `/snapshots` | Stress score history for trend chart |
| `POST` | `/letters` | Generate a negotiation letter |
| `GET` | `/letters` | All past letters |
| `GET` | `/health` | Server health + Gemini status |

## Project layout

```
Fin-relief-prototype/
├── main.py                  # FastAPI backend — API + serves the frontend
├── requirements.txt
├── .env                     # your secrets, not committed
├── .env.example
├── README.md                # this file
├── ABOUT.md                 # project context + screenshots
├── LICENSE
│
├── templates/
│   └── index.html
│
└── static/
    ├── css/style.css
    └── js/app.js
```

## Security notes

- `.env` and `finrelief.db` are both gitignored — your key and any user data never end up in the repo
- Passwords are bcrypt-hashed, never stored or returned as plaintext
- JWTs expire after 24 hours

If you're actually deploying this somewhere instead of running it locally:
- Don't rely on `.env` in production — set `FINRELIEF_SECRET_KEY` as a real environment variable
- Lock down CORS — it's wide open (`*`) right now because that's fine for local dev, not for prod
- Add rate limiting to `/auth/login` before it's public
- Move off SQLite to Postgres if more than one person will use it

## License

MIT. Use it, change it, ship it — just don't run real people's financial data through this without adding proper security first.

---

Built as part of a SmartBridge project. The settlement numbers are illustrative — talk to an actual financial advisor before making real decisions with your debt.
