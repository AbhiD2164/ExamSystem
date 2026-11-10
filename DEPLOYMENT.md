# Production deployment

## Current application layout

- **Frontend:** React/Vite static site, deployed from `frontend/` to Vercel.
- **API:** Django REST Framework + Gunicorn, deployed from `backend/` to Render.
- **Authentication:** Django password/JWT accounts use a unique, normalized email and unique E.164 mobile number. Firebase Phone Authentication verifies the mobile number; Django sends a six-digit email OTP through configured SMTP. Both channels must be verified for new signups.
- **Database:** Django uses Supabase-hosted PostgreSQL via `DATABASE_URL`; Supabase is not the identity provider. SQLite is for local development only.
- **Communities:** Platform administrators register school, college, employer, and other communities and appoint community managers. Users submit join requests; community owners/managers explicitly approve or reject them. Managers can assign exam-creator status and a limited list of assessment types to designated groups such as a TnP cell or member-selection committee.
- **Assessment:** A published assessment requires an explicit candidate-email allowlist. A candidate also needs an approved membership in the owning community. Search, direct IDs, enrollment records, or public flags cannot bypass these checks. MCQs are graded against answer keys; written answers are AI-graded at submission. Result access remains blocked until the scheduled release instant.
- **Time:** Exam and result wall-clock values are entered in the owning community's IANA time zone (for example `America/New_York`) and stored as aware datetimes. Responses are UTC timestamps; browsers display these in the viewer's local time.
- **Proctoring:** Camera-based face landmark signals and browser visibility changes are reported by the client. A fourth tab-hide event or one reported absence longer than five seconds sets the score to zero and the result to `FAIL`. Browser proctoring is a deterrent, not tamper-proof evidence; it cannot prove the user's identity or reliably observe activity outside the browser.

## Render API + Supabase database

1. Create a Supabase project and copy its PostgreSQL connection string. Set it as Render's `DATABASE_URL`; use a Supabase pooler/connection option reachable from Render and URL-encode reserved characters in the password.
2. Deploy the repository to Render using the root `render.yaml` blueprint. It builds the backend dependencies, collects static files, applies migrations, and starts Gunicorn.
3. Set Render environment variables:
   - `DEBUG=False`
   - `SECRET_KEY` (Render generates one in the blueprint; do not replace it with a checked-in value)
   - `ALLOWED_HOSTS` to the Render API hostname (and any API custom domain)
   - `DATABASE_URL` to the Supabase PostgreSQL connection string
   - `CORS_ALLOWED_ORIGINS` to the exact Vercel origin, including `https://` and no path
   - `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USE_TLS`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`, and `DEFAULT_FROM_EMAIL` from a transactional SMTP provider for email OTP delivery
   - `FIREBASE_PROJECT_ID` and exactly one of `FIREBASE_CREDENTIALS_JSON` or `FIREBASE_CREDENTIALS_FILE` on the backend. Enable Firebase Authentication's Phone provider, configure authorized web domains, and keep service-account credentials out of the frontend and source control.
   - `GEMINI_API_KEY` if using Google AI Studio for written-answer grading
   - `GEMINI_MODEL` if you want to override the default `gemini-2.5-flash` model; select a model currently available to your AI Studio project
4. Keep `CORS_ALLOW_ALL=False`. Configure the actual Vercel production origin after its first deployment, then redeploy the API.
5. Create the initial Django admin with Render's one-off shell/command using `python manage.py createsuperuser`. Existing migrated users are retained and marked verified; old examiner accounts are mapped into legacy communities by the data migration.

The Django email backend prints verification codes to the console only when SMTP is not configured (local development). In production, configure and test SMTP delivery, SPF/DKIM, sender-domain verification, and spam-folder handling before inviting users. Supabase database hosting does **not** automatically configure Django's SMTP delivery. Firebase's email verification feature is not used for email OTPs; email codes are delivered by SMTP.

Firebase Phone Authentication uses Firebase's SMS delivery and reCAPTCHA protections. SMS availability, daily quotas, supported regions, and pricing depend on Firebase's current plan and policy; do not assume that production SMS is unlimited or free. Configure a billing-enabled Firebase project if required by your account/region, set usage alerts/limits, and test the permitted regions and quotas before launch. Firebase client config is public web-app config; restrict its API key to your application domains. The backend service-account key remains secret.

## Vercel frontend

1. Import the same repository into Vercel and set the project root to `frontend`.
2. Use `npm run build` and `dist` as the output directory; `frontend/vercel.json` supplies SPA route fallback.
3. Set `VITE_API_URL` to the API base ending in `/api`, for example `https://your-api.onrender.com/api`. This value is public configuration, not a secret.
4. Set `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, and `VITE_FIREBASE_APP_ID` from the Firebase web app configuration. These are public client settings; configure Firebase Authorized domains and restrict the API key.
5. Redeploy Vercel, then add its exact origin to Render's `CORS_ALLOWED_ORIGINS`.
6. Verify phone OTP and email OTP signup, login, password reset, community join request and approval/rejection, scoped exam-creator access, allowlisted assessment visibility, denied direct-ID/submission attempts, question upload, a complete submission, scheduled result visibility, and a camera-enabled exam over HTTPS.

Camera access requires a secure context (HTTPS, or localhost for development). The application does not need microphone permission for camera face tracking; screen sharing is optional and browser visibility events—not permission prompts—are used for tab-switch monitoring.

## AI grading configuration and scaling

The written-answer evaluator tries Google AI Studio when `GEMINI_API_KEY` is set, then an Ollama endpoint, then the built-in contextual NLP heuristic. The heuristic is a fallback, **not** an equivalent substitute for a domain expert or a production LLM. Ollama's default `http://localhost:11434` refers to the API container itself after deployment, not a developer laptop. For production, use Gemini or run Ollama on a separately secured, network-reachable host and set `OLLAMA_BASE_URL`/`OLLAMA_MODEL` accordingly.

Grading currently runs in the submission request so the score is available before the release time, but LLM calls can make that request slow. Before high-volume production, move grading into durable background jobs (for example Celery + Redis) and return a queued/pending grading state; do not rely on in-process threads. Review AI marks before using them for high-stakes decisions.

## Other hosting options

- **AWS:** Run Django in ECS/Fargate or App Runner, host PostgreSQL on RDS, and serve the Vite build from S3 + CloudFront. Store secrets in Secrets Manager, use SES for transactional email, and configure security groups, HTTPS, backups, and CORS domains. Ollama can run on a separate GPU-capable EC2 instance if needed.
- **Docker:** Containerize the backend and frontend for repeatable deployments on Render, ECS, App Runner, or a VM. Continue using managed PostgreSQL/SMTP rather than container-local storage.
- **Kubernetes:** EKS or another managed Kubernetes platform is an option when multiple services, autoscaling, and operational staff justify the added complexity. It is not required for this two-service application; use managed PostgreSQL, a job queue, secrets management, and ingress/TLS rather than placing state in pods.

Supabase Auth is an alternative identity provider, but this code uses Django's own account/password and email OTP flow plus Firebase Phone Authentication. The Supabase project currently provides PostgreSQL hosting; switching identity providers would require explicit JWT validation and account migration.
