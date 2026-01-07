---
description: Procedures for GitHub push and Vercel deployment
---

# Deployment Workflow

// turbo-all

## GitHub Configuration
Always ensure the origin remote is set to the correct repository before pushing:
- **Repository**: `https://github.com/NMMonteiro/eu-projects-apps_3.1.git`
- **Branch**: `main`

### Steps to push:
1. Verify remote: `git remote -v`
2. If incorrect, fix: `git remote set-url origin https://github.com/NMMonteiro/eu-projects-apps_3.1.git`
3. Add changes: `git add .`
4. Commit: `git commit -m "Your message"`
5. Push: `git push origin main`

## Vercel Deployment
Deploy to the production environment using the Vercel CLI.
- **Project URL**: `https://vercel.com/nunos-projects-d60951f9/eu-projects-apps-3-1`

### Steps to deploy:
1. Run deployment: `vercel --prod`
2. (Wait for completion)
3. Provide the deployment URL to the user.

---
**Note**: Always check this workflow before performing any deployment actions.
