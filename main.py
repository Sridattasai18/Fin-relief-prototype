"""
FinRelief AI — backend (v2)
Real authentication (bcrypt + JWT), SQLite storage, loans/settlement/letters API.
New in v2:
  - StressSnapshot model + history endpoint (powers real trend chart)
  - GET /dashboard  — aggregate stats across all loans
  - PATCH /loans/{id} — edit a loan
  - Gemini AI letter generation (set GEMINI_API_KEY env var; falls back to template)
  - Letter→Loan FK ondelete=CASCADE (no more orphan letters)
  - loan relationship on Letter model

Run:
    pip install -r requirements.txt
    uvicorn main:app --reload --port 8000

Docs (auto-generated):
    http://localhost:8000/docs
"""

import os
import datetime
from typing import Optional, List

# Load .env file automatically (works whether you run uvicorn or plain python)
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass  # python-dotenv not installed — fall back to real env vars

from fastapi import FastAPI, Depends, HTTPException, status, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import create_engine, Column, Integer, String, Float, ForeignKey, DateTime
from sqlalchemy.orm import declarative_base, sessionmaker, relationship, Session
import bcrypt
from jose import jwt, JWTError

# ---------------------------------------------------------------------------
# Optional Gemini integration — safe to run without it
# ---------------------------------------------------------------------------
try:
    import google.generativeai as genai
    _GENAI_AVAILABLE = True
except ImportError:
    _GENAI_AVAILABLE = False

_RAW_GEMINI_KEY = os.environ.get("GEMINI_API_KEY", "")
# Treat the placeholder value (or empty string) as "not configured"
GEMINI_API_KEY = _RAW_GEMINI_KEY if _RAW_GEMINI_KEY and _RAW_GEMINI_KEY != "paste_your_gemini_api_key_here" else ""
if _GENAI_AVAILABLE and GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)

# ---------------------------------------------------------------------------
# Config — move these to real environment variables before deploying publicly.
# ---------------------------------------------------------------------------
SECRET_KEY = os.environ.get("FINRELIEF_SECRET_KEY", "dev-only-secret-change-me")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 hours

DATABASE_URL = "sqlite:///./finrelief.db"

# ---------------------------------------------------------------------------
# DB setup
# ---------------------------------------------------------------------------
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    loans = relationship("Loan", back_populates="owner", cascade="all, delete-orphan")
    letters = relationship("Letter", back_populates="owner", cascade="all, delete-orphan")
    snapshots = relationship("StressSnapshot", back_populates="owner", cascade="all, delete-orphan")


class Loan(Base):
    __tablename__ = "loans"
    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.id"))
    lender = Column(String, nullable=False)
    loan_type = Column(String, default="Personal loan")
    amount = Column(Float, nullable=False)
    emi = Column(Float, nullable=False)
    overdue_days = Column(Integer, default=0)
    income = Column(Float, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    owner = relationship("User", back_populates="loans")
    # Cascade delete letters and snapshots when a loan is removed
    letters = relationship("Letter", back_populates="loan", cascade="all, delete-orphan")
    snapshots = relationship("StressSnapshot", back_populates="loan", cascade="all, delete-orphan")


class Letter(Base):
    __tablename__ = "letters"
    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.id"))
    loan_id = Column(Integer, ForeignKey("loans.id", ondelete="CASCADE"))
    lender = Column(String, nullable=False)
    settlement_pct = Column(Float, nullable=False)
    body = Column(String, nullable=False)
    source = Column(String, default="Fallback")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    owner = relationship("User", back_populates="letters")
    loan = relationship("Loan", back_populates="letters")


class StressSnapshot(Base):
    """One data point per settlement computation — powers the trend chart."""
    __tablename__ = "stress_snapshots"
    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.id"))
    loan_id = Column(Integer, ForeignKey("loans.id", ondelete="CASCADE"))
    lender = Column(String, nullable=False)
    stress_score = Column(Float, nullable=False)
    settlement_pct = Column(Float, nullable=False)
    dti = Column(Float, nullable=False)
    surplus = Column(Float, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    owner = relationship("User", back_populates="snapshots")
    loan = relationship("Loan", back_populates="snapshots")


Base.metadata.create_all(bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------
class RegisterIn(BaseModel):
    name: str
    email: EmailStr
    password: str = Field(min_length=6)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


class LoanIn(BaseModel):
    lender: str
    loan_type: str = "Personal loan"
    amount: float
    emi: float
    overdue_days: int = 0
    income: float


class LoanPatch(BaseModel):
    lender: Optional[str] = None
    loan_type: Optional[str] = None
    amount: Optional[float] = None
    emi: Optional[float] = None
    overdue_days: Optional[int] = None
    income: Optional[float] = None


class LoanOut(LoanIn):
    id: int

    class Config:
        from_attributes = True


class LetterIn(BaseModel):
    loan_id: int
    settlement_pct: Optional[float] = None


class LetterOut(BaseModel):
    id: int
    loan_id: int
    lender: str
    settlement_pct: float
    body: str
    source: str
    created_at: datetime.datetime

    class Config:
        from_attributes = True


class SnapshotOut(BaseModel):
    id: int
    loan_id: int
    lender: str
    stress_score: float
    settlement_pct: float
    dti: float
    surplus: float
    created_at: datetime.datetime

    class Config:
        from_attributes = True


class DashboardOut(BaseModel):
    loan_count: int
    total_debt: float
    total_emi: float
    avg_dti: float
    overall_stress: float
    recommended_settlement_pct: float
    monthly_surplus: float


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.datetime.utcnow() + datetime.timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: Optional[str] = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = db.query(User).filter(User.id == int(user_id)).first()
    if user is None:
        raise credentials_exception
    return user


# ---------------------------------------------------------------------------
# Settlement / scoring logic (shared between endpoint and dashboard)
# ---------------------------------------------------------------------------
def _score(income: float, emi: float, overdue_days: int) -> dict:
    dti = min(100.0, (emi / max(income, 1)) * 100)
    surplus = income - emi - (income * 0.4)
    stress = min(100.0, max(0.0, (dti * 0.5) + (min(overdue_days, 180) / 180 * 40) + (10 if surplus < 0 else 0)))
    settle_pct = min(70.0, max(20.0, 25 + (stress * 0.35)))
    return {"dti": dti, "surplus": surplus, "stress": stress, "settle_pct": settle_pct}


# ---------------------------------------------------------------------------
# Gemini letter generation helper
# ---------------------------------------------------------------------------
def _generate_letter_body(user_name: str, user_email: str, loan: Loan, settlement_pct: float) -> tuple[str, str]:
    """Returns (body, source) where source is 'AI' or 'Fallback'."""
    amount = round(loan.amount * settlement_pct / 100)

    if _GENAI_AVAILABLE and GEMINI_API_KEY:
        try:
            model = genai.GenerativeModel("gemini-1.5-flash")
            prompt = f"""You are a financial advisor drafting a professional One Time Settlement (OTS) negotiation letter on behalf of a borrower in India.

Borrower: {user_name} ({user_email})
Lender: {loan.lender}
Loan type: {loan.loan_type}
Outstanding balance: Rs. {loan.amount:,.0f}
Monthly EMI: Rs. {loan.emi:,.0f}
Overdue days: {loan.overdue_days}
Proposed settlement: Rs. {amount:,.0f} ({settlement_pct:.0f}% of outstanding)

Write a formal, empathetic, and concise OTS letter (200–280 words). Use a professional tone. Include:
1. Salutation to the Loan Recovery Department
2. Subject line about OTS request
3. Brief explanation of financial hardship without excessive detail
4. Clear settlement proposal with amount and timeline (15 working days)
5. Request for credit bureau reporting as "Settled"
6. Professional sign-off

Do NOT include markdown formatting. Output plain text only."""
            response = model.generate_content(prompt)
            body = response.text.strip()
            return body, "AI"
        except Exception:
            pass  # fall through to template

    # Template fallback
    body = f"""To,
The Manager - Loan Recovery Department
{loan.lender}

Subject: Request for One Time Settlement (OTS) on Loan Account

Dear Sir/Madam,

I am writing regarding my outstanding {loan.loan_type.lower()} with {loan.lender}, currently overdue by {loan.overdue_days} days, with an outstanding balance of Rs. {loan.amount:,.0f}.

Due to a temporary but significant financial constraint, I have been unable to maintain regular EMI payments of Rs. {loan.emi:,.0f}. After careful assessment of my financial situation, I would like to propose a One Time Settlement of Rs. {amount:,.0f} (approximately {settlement_pct:.0f}% of the outstanding amount), payable in full within 15 working days of your written approval.

I believe this settlement would be mutually beneficial — it allows you to recover a substantial portion of the outstanding balance while helping me avoid further financial distress. I am committed to honouring this agreement promptly upon your approval.

I sincerely request you to consider this proposal favourably. Upon settlement, I kindly request that you report my account status to the credit bureau as "Settled."

I am available for any discussion or documentation required and can be reached at {user_email}.

Yours sincerely,
{user_name}
{user_email}"""
    return body, "Fallback"


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(title="FinRelief AI API", version="2.0.0")

# NOTE: allow_origins=["*"] is for local dev only.
# Restrict to your real frontend domain before deploying.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Static files + frontend HTML
# Visit http://localhost:8000  →  serves templates/index.html
# All JS/CSS at /static/**   →  served from static/ directory
# ---------------------------------------------------------------------------
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/", include_in_schema=False)
def serve_frontend():
    """Serve the frontend SPA at the root URL."""
    return FileResponse("templates/index.html")


# ---------------------------------------------------------------------------
# Auth endpoints
# ---------------------------------------------------------------------------
@app.post("/auth/register", response_model=TokenOut, status_code=201)
def register(payload: RegisterIn, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="An account with this email already exists.")

    user = User(name=payload.name, email=payload.email, hashed_password=hash_password(payload.password))
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token({"sub": str(user.id)})
    return {"access_token": token, "user": {"id": user.id, "name": user.name, "email": user.email}}


@app.post("/auth/login", response_model=TokenOut)
def login(payload: LoginIn, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Incorrect email or password.")

    token = create_access_token({"sub": str(user.id)})
    return {"access_token": token, "user": {"id": user.id, "name": user.name, "email": user.email}}


@app.get("/auth/me")
def me(current_user: User = Depends(get_current_user)):
    return {"id": current_user.id, "name": current_user.name, "email": current_user.email}


# ---------------------------------------------------------------------------
# Loan endpoints
# ---------------------------------------------------------------------------
@app.get("/loans", response_model=List[LoanOut])
def list_loans(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(Loan).filter(Loan.owner_id == current_user.id).all()


@app.post("/loans", response_model=LoanOut, status_code=201)
def create_loan(payload: LoanIn, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    loan = Loan(owner_id=current_user.id, **payload.model_dump())
    db.add(loan)
    db.commit()
    db.refresh(loan)
    return loan


@app.get("/loans/{loan_id}", response_model=LoanOut)
def get_loan(loan_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    loan = db.query(Loan).filter(Loan.id == loan_id, Loan.owner_id == current_user.id).first()
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found.")
    return loan


@app.patch("/loans/{loan_id}", response_model=LoanOut)
def update_loan(loan_id: int, payload: LoanPatch, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    loan = db.query(Loan).filter(Loan.id == loan_id, Loan.owner_id == current_user.id).first()
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found.")
    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(loan, field, value)
    db.commit()
    db.refresh(loan)
    return loan


@app.delete("/loans/{loan_id}", status_code=204)
def delete_loan(loan_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    loan = db.query(Loan).filter(Loan.id == loan_id, Loan.owner_id == current_user.id).first()
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found.")
    db.delete(loan)
    db.commit()
    return None


# ---------------------------------------------------------------------------
# Dashboard aggregate endpoint
# ---------------------------------------------------------------------------
@app.get("/dashboard", response_model=DashboardOut)
def get_dashboard(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    loans = db.query(Loan).filter(Loan.owner_id == current_user.id).all()
    if not loans:
        return DashboardOut(
            loan_count=0, total_debt=0, total_emi=0,
            avg_dti=0, overall_stress=0,
            recommended_settlement_pct=0, monthly_surplus=0
        )

    total_debt = sum(l.amount for l in loans)
    total_emi = sum(l.emi for l in loans)
    # Use max income across loans as the household income proxy
    max_income = max(l.income for l in loans)

    scores = [_score(l.income, l.emi, l.overdue_days) for l in loans]
    avg_dti = sum(s["dti"] for s in scores) / len(scores)
    overall_stress = sum(s["stress"] for s in scores) / len(scores)
    recommended_settlement_pct = sum(s["settle_pct"] for s in scores) / len(scores)
    monthly_surplus = max_income - total_emi - (max_income * 0.4)

    return DashboardOut(
        loan_count=len(loans),
        total_debt=round(total_debt, 2),
        total_emi=round(total_emi, 2),
        avg_dti=round(avg_dti, 1),
        overall_stress=round(overall_stress, 1),
        recommended_settlement_pct=round(recommended_settlement_pct, 1),
        monthly_surplus=round(monthly_surplus, 2),
    )


# ---------------------------------------------------------------------------
# Settlement endpoint (also saves a stress snapshot)
# ---------------------------------------------------------------------------
@app.get("/settlement/{loan_id}")
def compute_settlement(loan_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """
    Computes settlement score and saves a StressSnapshot for trend chart history.
    """
    loan = db.query(Loan).filter(Loan.id == loan_id, Loan.owner_id == current_user.id).first()
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found.")

    s = _score(loan.income, loan.emi, loan.overdue_days)

    # Persist snapshot (skip if one was already created in the last 5 minutes to avoid duplicates)
    recent_cutoff = datetime.datetime.utcnow() - datetime.timedelta(minutes=5)
    recent = db.query(StressSnapshot).filter(
        StressSnapshot.loan_id == loan_id,
        StressSnapshot.owner_id == current_user.id,
        StressSnapshot.created_at >= recent_cutoff
    ).first()
    if not recent:
        snap = StressSnapshot(
            owner_id=current_user.id,
            loan_id=loan.id,
            lender=loan.lender,
            stress_score=round(s["stress"], 1),
            settlement_pct=round(s["settle_pct"], 1),
            dti=round(s["dti"], 1),
            surplus=round(s["surplus"], 2),
        )
        db.add(snap)
        db.commit()

    source = "AI" if (_GENAI_AVAILABLE and GEMINI_API_KEY) else "Fallback"

    return {
        "loan_id": loan.id,
        "dti": round(s["dti"], 1),
        "surplus": round(s["surplus"], 2),
        "stress_score": round(s["stress"], 1),
        "overdue_days": loan.overdue_days,
        "settlement_pct": round(s["settle_pct"], 1),
        "settlement_amount": round(loan.amount * s["settle_pct"] / 100, 2),
        "outstanding_amount": loan.amount,
        "source": source,
    }


# ---------------------------------------------------------------------------
# Stress snapshot history (powers the trend chart)
# ---------------------------------------------------------------------------
@app.get("/snapshots", response_model=List[SnapshotOut])
def list_snapshots(
    limit: int = 30,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return (
        db.query(StressSnapshot)
        .filter(StressSnapshot.owner_id == current_user.id)
        .order_by(StressSnapshot.created_at.asc())
        .limit(limit)
        .all()
    )


# ---------------------------------------------------------------------------
# Letter endpoints
# ---------------------------------------------------------------------------
@app.post("/letters", response_model=LetterOut, status_code=201)
def create_letter(payload: LetterIn, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    loan = db.query(Loan).filter(Loan.id == payload.loan_id, Loan.owner_id == current_user.id).first()
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found.")

    # Recompute server-side — never trust client-supplied percentage
    score = _score(loan.income, loan.emi, loan.overdue_days)
    settlement_pct = round(score["settle_pct"], 2)

    body, source = _generate_letter_body(current_user.name, current_user.email, loan, settlement_pct)

    letter = Letter(
        owner_id=current_user.id,
        loan_id=loan.id,
        lender=loan.lender,
        settlement_pct=settlement_pct,
        body=body,
        source=source,
    )
    db.add(letter)
    db.commit()
    db.refresh(letter)
    return letter


@app.get("/letters", response_model=List[LetterOut])
def list_letters(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(Letter).filter(Letter.owner_id == current_user.id).order_by(Letter.created_at.desc()).all()


@app.get("/letters/{letter_id}", response_model=LetterOut)
def get_letter(letter_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    letter = db.query(Letter).filter(Letter.id == letter_id, Letter.owner_id == current_user.id).first()
    if not letter:
        raise HTTPException(status_code=404, detail="Letter not found.")
    return letter


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------
@app.get("/health")
def health():
    gemini_status = "configured" if (_GENAI_AVAILABLE and GEMINI_API_KEY) else "not configured (using template fallback)"
    return {"status": "ok", "gemini": gemini_status}
