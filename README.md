# Smart Fraud Detection & Prevention System

Hybrid MERN + FastAPI architecture for UPI and credit-card fraud monitoring with rule-based controls, ML fraud scoring, MongoDB persistence, and Socket.io alerts.

## Architecture

- `backend` - Node.js, Express, MongoDB, Mongoose, Socket.io
- `ai-engine` - FastAPI microservice with RandomForest training, prediction, metrics, and joblib model persistence
- `frontend` - React + Tailwind admin dashboard with live fraud events

## Quick Start

### Backend

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

Backend runs on `http://localhost:5000`.

### AI Engine

```bash
cd ai-engine
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python train_model.py
uvicorn app.main:app --reload
```

AI engine runs on `http://localhost:8000`.

### Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

Frontend runs on `http://localhost:5173`.

### Docker

```bash
docker compose up --build
```

This starts MongoDB, the backend, and the AI engine. Run the frontend separately during development.

## API Overview

### Auth

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`

### Transactions

- `POST /api/transactions/process`
- `GET /api/transactions/admin/dashboard`

Example transaction body:

```json
{
  "amount": 75000,
  "paymentMethod": "UPI",
  "identifier": "merchant-or-upi-id",
  "deviceId": "device-123",
  "ipAddress": "8.8.8.8",
  "location": {
    "city": "Delhi",
    "latitude": 28.6139,
    "longitude": 77.209
  }
}
```

### Fraud

- `GET /api/fraud/stats`
- `GET /api/fraud/alerts`
- `PATCH /api/fraud/alerts/:id`

### AI Engine

- `GET /health`
- `POST /predict`
- `POST /train`
- Compatibility routes are also available under `/api/fraud`.

Example AI prediction body:

```json
{
  "userId": "user-123",
  "paymentType": "CARD",
  "transactionAmount": 95000,
  "transactionVelocity": 8,
  "ipRisk": 90,
  "deviceRisk": 80,
  "geoDistance": 1800,
  "impossibleTravel": true,
  "hourOfDay": 2,
  "repeatedFailures": 4,
  "newDeviceFlag": true
}
```

## Environment

Backend variables are documented in `backend/.env.example`. Key values are `MONGO_URI`, `JWT_SECRET`, `ADMIN_REGISTRATION_KEY`, `AI_ENGINE_URL`, `AI_REQUEST_TIMEOUT_MS`, `GEOLOCATION_URL`, and the rate-limit settings.

AI variables are documented in `ai-engine/.env.example`. Key values are `MODEL_DIR`, `DATA_DIR`, `MODEL_VERSION`, `MEDIUM_RISK_THRESHOLD`, `HIGH_RISK_THRESHOLD`, and `SYNTHETIC_TRAINING_ROWS`.

## Capabilities

- JWT authentication, admin protection, validation middleware, Helmet, CORS, and rate limiting
- MongoDB models for users, transactions, fraud alerts, AI confidence, and engineered risk signals
- Hybrid fraud engine combining local rules with FastAPI RandomForest scoring
- Synthetic training data generation when no dataset exists
- Model serialization with joblib and metrics for accuracy, precision, recall, F1, and ROC-AUC
- IP geolocation enrichment using `http://ip-api.com/json/` with cache, timeout, and retry handling
- Real-time Socket.io events: `fraud-alert`, `suspicious-transaction`, and `blocked-transaction`
- Admin dashboard data for blocked counts, risk trends, suspicious geolocation activity, recent alerts, and AI fraud confidence
- Jest, Supertest, and pytest coverage for the fraud flow, AI service integration, invalid payloads, timeouts, and protected routes
