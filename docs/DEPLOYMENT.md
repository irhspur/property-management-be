# Deployment

Deployment lives in the **proptrove-infra** repo, not here. This repo builds an
image and knows nothing about where it runs.

    ../proptrove-infra/docs/DEPLOYMENT.md      full runbook
    ../proptrove-infra/scripts/deploy.sh       ./scripts/deploy.sh api prod
    ../proptrove-infra/stacks/api/             the production compose stack

What stays in this repo: `dockerfile`, `.dockerignore` (how to build this
source) and `docker-compose.dev.yml` (local development). See `npm run
docker:dev`.
