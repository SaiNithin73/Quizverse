# QuizVerse deployment

## Recommended free setup

- Render Web Service: frontend, Express API, and Socket.io
- Supabase: persistent PostgreSQL database
- GitHub: source repository

## Render setup

1. Open Render and choose **New > Blueprint**.
2. Connect `SaiNithin73/Quizverse`.
3. Select `render.yaml`.
4. Add these secret environment variables when prompted:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
QUIZVERSE_HOST_PASSWORD
```

Do not add `.env` to GitHub. It is ignored locally.

Render runs:

```text
npm install && npm run build
npm start
```

The Node server serves the built React app and Socket.io from the same URL. Use the generated Render URL for both participants and the host dashboard.

## Supabase setup

Run `supabase/schema.sql` in Supabase SQL Editor before the first deployment. The question seed is already prepared in `supabase/seed-questions.js`.

To seed the 100 questions locally, with a local `.env` containing the Supabase URL and service-role key:

```powershell
node --env-file=.env supabase/seed-questions.js
```

The server health endpoint is:

```text
https://YOUR-RENDER-DOMAIN.onrender.com/api/health
```

It should report `database.connected: true`.
