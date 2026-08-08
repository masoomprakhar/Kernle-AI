# Live deployment (ap-south-1)

## URLs

- App: http://kernle-alb-1829412433.ap-south-1.elb.amazonaws.com
- API health: http://kernle-alb-1829412433.ap-south-1.elb.amazonaws.com/api/health
- API docs: http://kernle-alb-1829412433.ap-south-1.elb.amazonaws.com/api/docs

## Stack

| Resource | Name |
|----------|------|
| ECS cluster | `kernle` |
| Services | `kernle-api`, `kernle-web` |
| ALB | `kernle-alb` |
| RDS | `kernle-postgres` |
| Redis | `kernle-redis` |
| S3 | `kernle-assets-251513139101` |
| ECR | `kernle-api`, `kernle-web` |

Demo seed runs on API boot (`RUN_SEED=true`). Demo login after seed: `owner@kernle.local` / `demo1234`.

## Rebuild notes

Always build with `--platform linux/amd64` from Apple Silicon before pushing to ECR.
