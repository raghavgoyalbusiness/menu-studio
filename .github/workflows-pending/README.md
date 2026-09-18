# Workflows waiting on a token scope

These three files are the real CI/CD workflows. They live here rather than in
`.github/workflows/` because the credential used for the first push has GitHub's
`repo` scope but not `workflow`, and GitHub refuses any push that creates a file
under `.github/workflows/` without it.

To activate them, use a credential with `workflow` scope (a fine-grained PAT with
"Workflows: read and write", or `gh auth refresh -s workflow`) and then:

```bash
git mv .github/workflows-pending/ci.yml .github/workflows-pending/deploy-staging.yml .github/workflows-pending/deploy-production.yml .github/workflows/
git rm .github/workflows-pending/README.md
git commit -m "Activate CI/CD workflows"
git push
```

Nothing else needs to change: the workflows are complete and reference no paths
inside this folder.
