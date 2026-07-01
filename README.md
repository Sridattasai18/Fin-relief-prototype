# FinRelief AI 🧾

> **An AI-powered debt settlement assistant that helps people in financial distress figure out what they can realistically settle for — and then writes the negotiation letter for them.**

---

## What is this?

If you've ever fallen behind on loan EMIs and felt completely lost — not knowing whether to call the bank, how much to offer, or how to even word an email to your lender — this tool was built for you.

FinRelief AI does three things:

1. **Analyses your financial situation** — it looks at your income, your EMI, how overdue you are, and tells you your debt-to-income ratio, monthly surplus, and an overall debt stress score.
2. **Recommends a settlement percentage** — based on that analysis, it tells you: "realistically, you could settle for around X% of what you owe." This gives you a number to walk into that conversation with.
3. **Writes the negotiation letter** — using Google's Gemini AI, it drafts a professional, lender-specific One Time Settlement (OTS) request letter that you can actually send. No awkward "please reduce my debt" email — just a clean, formal letter that sounds like a real financial advisor wrote it.

It's not magic, and it doesn't guarantee anything — but it gives you clarity and a starting point when you're overwhelmed.

---

## 🎨 UI Demo & Visual Walkthrough

### 🚀 Instant Offline UI Demo
If you want to see how the app looks and feels **before running any servers or installing dependencies**, you can open the static file **[finrelief-design-prototype.html](file:///c:/Users/kalig/OneDrive/Desktop/SMARTBRIDGE-PROJ/Fin-track-prototype/finrelief-design-prototype.html)** directly in your browser. It runs completely offline with mock data, letting you explore the layout immediately.

---

### 📸 Visual App Walkthrough

Below is a step-by-step look at how the real app works, from account creation to AI letter generation.

#### 1. Secure Access (Register & Login)
Keep your personal financial data private with password hashing and secure session tokens.
![Secure Login Screen](docs/screenshots/01_login.png)

#### 2. The Overview (Dashboard)
A snapshot of your overall debt-to-income (DTI) ratio, monthly surplus, debt stress score, and active loans, plus a historical trend chart showing your stress trajectory over time.
![Financial Dashboard](docs/screenshots/02_dashboard.png)

#### 3. Your Active Debt (Loans Page)
Manage your debts in one simple table. Add new loans or update existing EMI/overdue parameters inline at any time.
![Active Loans List](docs/screenshots/03_loans.png)

#### 4. The Recommendation (Settlement Analyzer)
Analyze your DTI, surplus, and stress levels. Drag the sliders to explore "what-if" scenarios, and view the backend's official One Time Settlement suggestion.
![One Time Settlement Analysis](docs/screenshots/04_settlement.png)

#### 5. AI Letter Generation (Letters Page)
Read and copy the professional settlement letters drafted for you. Access your complete letter history at any time.
![AI-Generated Settlement Letter](docs/screenshots/05_letters.png)

---

## Features

### 🏠 Dashboard
- Live **DTI ratio**, **monthly surplus**, **debt stress score**, and **active loan count** — all computed from your actual data
- A **trend chart** that tracks your stress score and settlement percentage over time as you revisit your loans
- A dynamic **"What this means"** insight card that translates your numbers into plain language

### 💳 Loans
- Add multiple loans (personal loan, credit card, digital lending app, NBFC loan)
- Edit any loan after the fact — update overdue days, income, EMI as your situation changes
- Delete a loan (cleanly removes its letters and history too)

### 📊 Settlement Analyser
- Pulls the **official recommendation from the backend** using a financial scoring formula (DTI + overdue weight + surplus penalty)
- **Interactive sliders** — drag income, EMI, and overdue days to preview "what if" scenarios instantly
- Shows whether the recommendation came from **Gemini AI** or the **formula fallback**

### ✉️ AI Negotiation Letter Generator
- One click from the Settlement page → generates a full OTS letter
- If your Gemini API key is set, **Gemini writes the letter** using real context: your lender's name, your overdue days, your proposed amount, your income situation
- If no API key → falls back to a solid, professional template letter (still very usable)
- Full **letter history** — every letter you've generated is saved and clickable
- **Copy to clipboard** in one click, or regenerate with slight variation

### 🔐 Auth
- Register with name, email, password
- Passwords are bcrypt-hashed — never stored or returned in plaintext
- JWT tokens (24 hours) — your data stays yours
- Wrong password correctly rejected

---

## Tech Stack

| Layer | Tech | Why |
|---|---|---|
| **Backend** | FastAPI (Python) | Fast, auto-documented REST API |
| **Database** | SQLite + SQLAlchemy | Zero-config, stores users/loans/letters/history |
| **AI** | Google Gemini API (`gemini-1.5-flash`) | Powers the letter generation |
| **Auth** | bcrypt + python-jose JWT | Secure password hashing + token auth |
| **Frontend** | Vanilla HTML + CSS + JS | Served directly by FastAPI, no build step |

---

## Getting Started

### 1. Clone the repo
```bash
git clone https://github.com/your-username/Fin-track-prototype.git
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

That's it. The database (`finrelief.db`) is created automatically on first run.

---

## How to Use It

### First time
1. Click **"Create an account"** on the login screen
2. Enter your name, email, and a password (min 6 characters)
3. You're in — you'll land on the Dashboard

### Add your first loan
1. Go to **Loans** → click **+ Add loan**
2. Fill in: lender name, loan type, outstanding amount, monthly EMI, how many days overdue, and your monthly income
3. Click **Add loan** — it's saved to the database

### Get a settlement recommendation
1. Click **Review →** on any loan (or go to **Settlement** in the sidebar)
2. The page shows your DTI ratio, monthly surplus, debt stress score, and a recommended settlement percentage
3. Use the sliders to explore "what if I had a higher income / lower EMI" scenarios
4. The **official recommendation** in the dark card on the right is always computed by the backend

### Generate a negotiation letter
1. From the Settlement page, click **Generate letter**
2. If Gemini is configured → the AI writes a personalised OTS letter based on your exact situation
3. If not → a professional template letter is generated
4. Copy it, send it to your lender, or regenerate for a slightly different version
5. Every letter is saved in your **Letters** history

### Track over time
- Every time you visit a loan's Settlement page, a snapshot of your stress score is saved
- Once you have 2+ snapshots, the **Dashboard trend chart** switches from illustrative data to your real history

---

## About the AI Letter Generation

The letter writing is powered by **Google Gemini** (`gemini-1.5-flash`), and it's designed to sound like a real financial advisor wrote it — not a robot.

When you click "Generate letter," the backend sends Gemini a prompt that includes:
- Your lender's name and loan type
- Your outstanding balance and EMI
- How many days you've been overdue
- Your proposed settlement amount and percentage

Gemini then writes a **200–280 word formal OTS letter** in a professional, empathetic tone — one that clearly explains your situation, makes a concrete settlement offer, and requests that the account be reported as "Settled" to the credit bureau.

The letters are lender-specific, which means a letter for HDFC Bank will sound different from one for a digital lending app. That context matters when you're negotiating.

If Gemini is unavailable or you haven't set an API key, the app falls back to a well-structured template letter — it won't break, and the letter is still perfectly usable.

**To get your free Gemini API key:** visit [https://aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) — it takes about 2 minutes and has a generous free tier.

---

## API Documentation

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

## Project Structure

```
Fin-track-prototype/
├── main.py                  ← FastAPI backend (API + serves frontend)
├── requirements.txt         ← Python dependencies
├── .env                     ← Your secrets (not committed to git)
├── .env.example             ← Template to copy from
├── .gitignore
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

## Security Notes

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

## Contributing / Running in Development

```bash
# Install deps
pip install -r requirements.txt

# Set up environment
cp .env.example .env
# (edit .env with your keys)

# Start with hot-reload
uvicorn main:app --reload --port 8000

# The API docs are at:
# http://localhost:8000/docs
```

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details. You are free to modify and use it, but please do not run it in production with real financial data without the necessary security hardening.

---

*Built as part of a SmartBridge project. Financial calculations are illustrative — always consult a certified financial advisor for real debt settlement decisions.*
