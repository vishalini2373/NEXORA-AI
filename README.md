# NEXORA AI — full-stack starter

A responsive AI platform for anyone, with Student, Teacher and Admin roles.
Includes email/password authentication (Firebase), role-aware dashboard, AI chat with conversation history, notes, quiz generator UI, file upload endpoint, voice input (browser speech recognition), and admin user listing endpoint.

## Requirements
- Node.js 18+
- A Firebase project (Authentication: Email/Password enabled; Firestore created)
- An AI provider endpoint + API key compatible with the OpenAI Chat Completions API (or adapt `server.js`)

## Run locally
1. `npm install`
2. Copy `.env.example` to `.env` and fill values.
3. Edit `public/firebase-config.js` with your Firebase web app config.
4. `npm run dev`
5. Open `http://localhost:3000`

## First admin
Sign up normally. In Firebase Console > Firestore, create collection `users`, document ID = that user's Firebase Auth UID, fields:
`displayName` (string), `email` (string), `role` (string: `admin`), `createdAt` (timestamp).
Never allow users to choose their own role at signup. New users are always `student`; an admin changes roles.

## Deploy
Deploy the Node server to a Node-capable host. GitHub Pages can host only static files and cannot securely run this backend. Set environment variables on your host and use HTTPS. Configure Firebase Auth authorized domains to include your deployed domain.

## Security notes
- AI API key stays on the server in `.env`, never in browser code.
- Server verifies Firebase ID tokens.
- Role checks are server-side.
- Uploads are size-limited and stored temporarily in `uploads/`; production should use private object storage and malware scanning.
- Add Firebase security rules before real users. See `firestore.rules`.
- This is a functional MVP scaffold, not a production-audited service. Review privacy, abuse prevention, rate limits, backups and legal requirements before public launch.
