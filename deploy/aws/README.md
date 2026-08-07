# AWS ECS Fargate deploy notes

## Images

| Service | Dockerfile | Container port | Health check |
|---------|------------|----------------|--------------|
| API | `apps/api/Dockerfile` | 3000 | `GET /api/health` |
| Web | `apps/web/Dockerfile` | 3000 | `GET /` |

Build from repo root. Push to ECR repositories `kernle-api` and `kernle-web`.

## Required secrets (API)

- `DATABASE_URL` — RDS Postgres
- `REDIS_URL` — ElastiCache
- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`
- `WEB_ORIGIN` / `APP_URL` — public web URL
- S3: `S3_BUCKET`, `S3_REGION` (omit `S3_ENDPOINT` for native AWS S3)

## Task defs

Replace `ACCOUNT_ID` in:

- `ecs-task-api.json`
- `ecs-task-web.json`

Register with:

```bash
aws ecs register-task-definition --cli-input-json file://deploy/aws/ecs-task-api.json --region ap-south-1
aws ecs register-task-definition --cli-input-json file://deploy/aws/ecs-task-web.json --region ap-south-1
```

## ALB

- `api.example.com` → target group → API service (path `/api/*` or host-based)
- `app.example.com` → target group → Web service

Web image must be rebuilt when `NEXT_PUBLIC_API_URL` changes (build arg).
