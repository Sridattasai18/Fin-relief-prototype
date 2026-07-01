# FinRelief AI 🧾

> **Technical Documentation & Setup Guide**

*For deep context on the project's purpose, use cases, and a visual walkthrough, please read [ABOUT.md](ABOUT.md).*

---

## 🚀 Overview

FinRelief AI is a full-stack web application designed to help users manage their debt, calculate realistic settlement options, and generate AI-powered negotiation letters.

### Tech Stack

| Layer | Tech | Why |
|---|---|---|
| **Backend** | FastAPI (Python) | Fast, auto-documented REST API |
| **Database** | SQLite + SQLAlchemy | Zero-config, stores users/loans/letters/history |
| **AI** | Google Gemini API (`gemini-1.5-flash`) | Powers the letter generation |
| **Auth** | bcrypt + python-jose JWT | Secure password hashing + token auth |
| **Frontend** | Vanilla HTML + CSS + JS | Served directly by FastAPI, no build step |

---

## 🛠 Getting Started

### 1. Clone the repo
```bash
git clone https://github.com/Sridattasai18/Fin-track-prototype.git
cd Fin-track-prototype
```

### 2. Set up your environment
```bash
# Copy the example env file
cp .env.example .env
```

Open `.env` and fill in two values:

```env
GEMINI_API_KEY=your_key_here       # get free at https://aistudio.google.com/app/apikey
FINRELIEF_SECRET_KEY=your_secret   # generate: python -c "import secrets; print(secrets.token_hex(32))"
```

> **The Gemini API key is optional.** If you skip it, letters will be generated using a professional template instead. The rest of the app works perfectly without it.

### 3. Install dependencies
```bash
pip install -r requirements.txt
```

### 4. Run the server
```bash
uvicorn main:app --reload --port 8000
```

### 5. Open the app
Go to **[http://localhost:8000](http://localhost:8000)** in your browser.

The database (`finrelief.db`) is created automatically on first run.

---

## 🎨 Instant Offline UI Demo

If you want to see how the app looks and feels **before running any servers or installing dependencies**, you can open the static file **[finrelief-design-prototype.html](file:///c:/Users/kalig/OneDrive/Desktop/SMARTBRIDGE-PROJ/Fin-track-prototype/finrelief-design-prototype.html)** directly in your browser. It runs completely offline with mock data, letting you explore the layout immediately.

---

## 📖 API Documentation

Once the server is running, visit **[http://localhost:8000/docs](http://localhost:8000/docs)** for the full interactive Swagger UI — every endpoint is documented and testable from the browser.

### Quick reference

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

---

## 📁 Project Structure

```
Fin-track-prototype/
├── main.py                  ← FastAPI backend (API + serves frontend)
├── requirements.txt         ← Python dependencies
├── .env                     ← Your secrets (not committed to git)
├── .env.example             ← Template to copy from
├── .gitignore
├── README.md                ← Technical documentation
├── ABOUT.md                 ← Project context & visual walkthrough
├── LICENSE                  ← MIT License
│
├── templates/
│   └── index.html           ← The frontend HTML
│
└── static/
    ├── css/
    │   └── style.css        ← All styles
    └── js/
        └── app.js           ← All frontend logic + API calls
```

---

## 🔒 Security Notes

- `.env` is in `.gitignore` — your API key and JWT secret are **never committed**
- Passwords are **bcrypt-hashed** — never stored or returned in plaintext  
- JWT tokens expire after **24 hours**
- The database file (`finrelief.db`) is also gitignored — no user data in the repo

**Before any public deployment:**
- Set a real `FINRELIEF_SECRET_KEY` via environment variable (not just `.env`)
- Restrict CORS to your actual frontend domain (currently `*` for local dev)
- Consider adding rate limiting to `/auth/login` to prevent brute-force attacks
- Switch to PostgreSQL for anything beyond local/demo use

---

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details. You are free to modify and use it, but please do not run it in production with real financial data without the necessary security hardening.

---

*Built as part of a SmartBridge project. Financial calculations are illustrative — always consult a certified financial advisor for real debt settlement decisions.*
