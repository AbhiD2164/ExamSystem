# ExMint: Production Deployment & Integration Guide

This guide provides step-by-step instructions to configure and deploy the **ExMint Universal Examination, Proctoring & AI Evaluation Platform** using:
* **Frontend**: React + Vite on **Vercel**
* **Backend API**: Django REST Framework + Gunicorn on **Render** (or Linux VPS)
* **Database**: **Supabase** Managed PostgreSQL
* **Email Service**: **Firebase Authentication** / Transactional SMTP (100% Free, Zero SMS Cost)
* **AI Evaluation Engine**: **Ollama** (Free, Open-Source, Zero Usability Limits)

---

## Architecture Overview

```
                        ┌───────────────────────────────────────────────┐
                        │              Frontend (Vercel)                │
                        │       React.js 18 + Vite (SPA Client)         │
                        └───────────────────────┬───────────────────────┘
                                                │ HTTPS / REST (JWT Auth)
                                                ▼
                        ┌───────────────────────────────────────────────┐
                        │               Backend (Render)                │
                        │           Django REST + Gunicorn (WSGI)       │
                        └───────┬───────────────┬───────────────┬───────┘
                                │               │               │
            PostgreSQL URI (SSL)│               │ JSON API      │ SMTP / Action Links
                                ▼               ▼               ▼
                      ┌──────────────────┐ ┌─────────┐ ┌──────────────────┐
                      │     Supabase     │ │ Ollama  │ │ Firebase / SMTP  │
                      │ PostgreSQL (DB)  │ │ (LLM)   │ │  Email Service   │
                      └──────────────────┘ └─────────┘ └──────────────────┘
```

---

## 1. Setting up the GitHub Repository (`ExMint`)

1. Open your browser and navigate to [github.com/new](https://github.com/new).
2. Set the repository name to **`ExMint`**.
3. Choose **Public** or **Private**, leave "Initialize with README" unchecked, and click **Create repository**.
4. In your terminal, link your local repository and push:
   ```bash
   # If you want to rename your current origin to ExMint:
   git remote set-url origin https://github.com/AbhiD2164/ExMint.git
   
   # Or add a dedicated remote:
   git remote add exmint https://github.com/AbhiD2164/ExMint.git

   # Push the main branch:
   git push -u origin main
   ```
*(Note: If you already use `ExamSystem` on GitHub, you can simply rename the repository in **GitHub Settings → Repository Name → Rename** to `ExMint`)*.

---

## 2. Integrating Supabase (Production PostgreSQL Database)

Supabase provides enterprise-grade PostgreSQL with automatic connection pooling and SSL encryption for free.

1. Go to [supabase.com](https://supabase.com) and create an account or sign in.
2. Click **New Project**, choose a project name (e.g. `exmint-db`), set a strong database password, and select your region.
3. Once provisioned, open **Project Settings → Database**.
4. Under **Connection string**, select **URI**:
   * Mode: **Session** (Port 5432) or **Transaction Pooler** (Port 6543, recommended for multi-instance deployments):
   ```text
   postgresql://postgres.[PROJECT-REF]:[YOUR-PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres
   ```
5. Set this string as the `DATABASE_URL` environment variable on Render. Django automatically configures `dj_database_url` with connection pooling (`conn_max_age=600`) and SSL enforcement.

---

## 3. Integrating Firebase & Email Service (Free Verification & Password Reset)

The system uses pure email authentication with 6-digit OTP codes and optional Firebase action links (no paid SMS services).

1. Go to [console.firebase.google.com](https://console.firebase.google.com) and create a free project (e.g. `exmint-auth`).
2. In the left navigation, click **Build → Authentication → Get Started**.
3. Under the **Sign-in method** tab, enable **Email/Password**.
4. Click **Project Settings** (gear icon) → **General** tab:
   * Under **Your apps**, click the web icon (`</>`) to register a web app (`ExMint Web`).
   * Copy the `firebaseConfig` keys (`apiKey`, `authDomain`, `projectId`, `appId`).
5. Under **Project Settings → Service accounts**:
   * Click **Generate new private key** (downloads a `.json` file).
   * Save this JSON content or set `FIREBASE_PROJECT_ID` in your backend environment variables.
6. **Configuring SMTP Delivery**:
   * For production emails (Gmail, SendGrid, Brevo, Resend):
     * `EMAIL_HOST`: `smtp.gmail.com` (or your SMTP host)
     * `EMAIL_PORT`: `587`
     * `EMAIL_USE_TLS`: `True`
     * `EMAIL_HOST_USER`: `your-email@gmail.com`
     * `EMAIL_HOST_PASSWORD`: `<your-app-password>` (Use a Google App Password, not your raw password)
     * `DEFAULT_FROM_EMAIL`: `ExMint Examination <noreply@exmint.io>`

---

## 4. Integrating Ollama AI Evaluation (Zero Usability Limit, Free)

ExMint evaluates non-MCQ written answers (short, one-line, long descriptive) by understanding conceptual definitions rather than requiring exact keyword matches.

### Recommended Free Models:
* **`llama3.2:3b`** *(Default)*: Lightweight (~2GB VRAM/RAM), ultra-fast evaluation, runs smoothly on CPU.
* **`qwen2.5:3b` / `qwen2.5:7b`**: Excellent for multilingual and STEM/academic questions.
* **`mistral:7b`**: Best for deep, multi-paragraph descriptive answers.

### Local Development:
```bash
# 1. Install Ollama from https://ollama.ai
# 2. Pull and start the recommended model:
ollama run llama3.2:3b

# Ollama will listen on http://localhost:11434/api/generate
```

### Production Hosting for Ollama:
To access Ollama in production from Render:
1. Run Ollama on any $5–$10/month Linux VPS (DigitalOcean, Hetzner, AWS EC2, or a GPU droplet).
2. Start Ollama listening on public interface:
   ```bash
   OLLAMA_HOST=0.0.0.0:11434 ollama serve
   ```
3. Set in your backend environment:
   ```bash
   AI_EVALUATION_PROVIDER=ollama
   OLLAMA_BASE_URL=http://<YOUR-VPS-IP>:11434
   OLLAMA_MODEL=llama3.2:3b
   ```
4. *(Optional Fallback)*: Set `GEMINI_API_KEY` from [aistudio.google.com](https://aistudio.google.com). If Ollama is ever restarted or offline, the system seamlessly uses Gemini API or the built-in Semantic NLP engine.

---

## 5. Deploying Backend API to Render

1. Sign in to [render.com](https://render.com) and click **New + → Web Service**.
2. Connect your GitHub repository (`ExMint` or `ExamSystem`).
3. Fill in the deployment settings:
   * **Name**: `exmint-api`
   * **Root Directory**: `backend`
   * **Runtime**: `Python 3`
   * **Build Command**:
     ```bash
     pip install -r requirements.txt && python manage.py migrate && python manage.py collectstatic --noinput
     ```
   * **Start Command**:
     ```bash
     gunicorn core.wsgi:application --bind 0.0.0.0:$PORT
     ```
4. Add the following **Environment Variables**:

| Variable | Recommended Value |
| :--- | :--- |
| `DEBUG` | `False` |
| `SECRET_KEY` | `<generate-a-random-secure-string>` |
| `ALLOWED_HOSTS` | `exmint-api.onrender.com,localhost,127.0.0.1` |
| `DATABASE_URL` | `<Your-Supabase-PostgreSQL-URI>` |
| `FRONTEND_URL` | `https://exmint.vercel.app` |
| `CORS_ALLOWED_ORIGINS` | `https://exmint.vercel.app` |
| `AI_EVALUATION_PROVIDER` | `ollama` (or `gemini`) |
| `OLLAMA_BASE_URL` | `http://<YOUR-OLLAMA-HOST>:11434` |
| `OLLAMA_MODEL` | `llama3.2:3b` |
| `GEMINI_API_KEY` | `<Optional-Google-AI-Studio-Key>` |
| `EMAIL_HOST` | `smtp.gmail.com` |
| `EMAIL_PORT` | `587` |
| `EMAIL_USE_TLS` | `True` |
| `EMAIL_HOST_USER` | `your-email@gmail.com` |
| `EMAIL_HOST_PASSWORD` | `<your-app-password>` |
| `DEFAULT_FROM_EMAIL` | `ExMint Platform <noreply@exmint.io>` |

5. Click **Create Web Service**.
6. Once deployed, open Render's **Shell** tab to create your superuser:
   ```bash
   python manage.py createsuperuser
   ```

---

## 6. Deploying Frontend SPA to Vercel

1. Go to [vercel.com](https://vercel.com) and click **Add New → Project**.
2. Import your GitHub repository (`ExMint`).
3. Configure Project Settings:
   * **Framework Preset**: `Vite`
   * **Root Directory**: `frontend`
   * **Build Command**: `npm run build`
   * **Output Directory**: `dist`
4. Set Environment Variables:

| Variable | Value |
| :--- | :--- |
| `VITE_API_URL` | `https://exmint-api.onrender.com/api` |
| `VITE_FIREBASE_API_KEY` | `<your-firebase-api-key>` |
| `VITE_FIREBASE_AUTH_DOMAIN` | `<your-project>.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | `<your-firebase-project-id>` |
| `VITE_FIREBASE_APP_ID` | `<your-firebase-app-id>` |

5. Click **Deploy**. Vercel will build and launch your client in ~30 seconds.
6. Copy your live Vercel URL (e.g. `https://exmint.vercel.app`) and ensure it is listed in Render's `CORS_ALLOWED_ORIGINS`.

---

## 7. Verifying End-to-End Workflow

1. **Registration**: Sign up a new student account at `/register` using their email. Enter the 6-digit verification code.
2. **Community Creation**: Log in as administrator at `/communities` and register a College or Company community.
3. **Invite Link**: As community manager, generate an Invite Link (with optional `@college.edu` domain restriction) and copy the URL:
   `https://exmint.vercel.app/join/<token>`
4. **Member Join**: Open the invite link in another browser; verify that eligible candidates join as approved members.
5. **Exam Creation & AI Grading**: Create an exam under the community with both MCQ and short/long written questions. When a student submits, MCQs are graded deterministically, and written questions are scored using Ollama/Gemini contextual understanding.
6. **Proctoring**: Attempt an exam in fullscreen; verify camera tracking and ensure permission dialogues do not trigger false tab-switch breach alerts.
