# Local Development Workflow

This document outlines the standard workflow for running Deetoo locally.

## Prerequisites
- Node.js >= 20.x
- Docker & Docker Compose
- pnpm >= 9.x (or npm)

## 1. Environment Setup
Copy the template environment file:
```bash
cp .env.example .env
```
Ensure required environment variables are configured (ports, secrets, database credentials).

## 2. Infrastructure Services (PostgreSQL, PostGIS, Redis)
Start containerized PostgreSQL 16 (with PostGIS 3.4) and Redis 7:
```bash
docker-compose up -d
```
Verify services:
```bash
docker-compose ps
```

## 3. Database Migrations & Seeds
Run versioned SQL schema migrations and development baseline seeds:
```bash
npm run db:migrate
npm run db:seed
```

## 4. Launching the Development Server
Start the unified platform development server:
```bash
npm run dev
```
The server will start on `http://localhost:3000`:
- **API & Health**: `http://localhost:3000/health`, `http://localhost:3000/api/v1/system/info`
- **Frontend Workspace**: `http://localhost:3000/`

## 5. Verification Commands
- **Linting**: `npm run lint`
- **Type Checking**: `npm run check-types`
- **Test Suite**: `npm test`
- **Production Build**: `npm run build`
