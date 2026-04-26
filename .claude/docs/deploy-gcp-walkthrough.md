# Cloud Run deploy — GCP setup walkthrough

Step-by-step explanation of the `gcloud` commands in
[the README's Deploy section](../../README.md#deploy). If you've never
configured Workload Identity Federation before, this is the long
version: what each piece does, why it exists, and how to verify it.

## Mental model

Four pieces, each with one job:

1. **Artifact Registry** — where the Docker image lives (GCP's
   container registry).
2. **Service Account** — the GCP identity that runs the deploy. Not
   you, a separate non-human principal.
3. **IAM bindings** — the permissions that identity has.
4. **Workload Identity Federation (WIF)** — the bridge that lets
   GitHub Actions speak as that service account without ever holding
   a JSON key.

The runtime flow:

```
GitHub Actions runner
  │ (1) mints an OIDC token signed by token.actions.githubusercontent.com
  │     claims: { repository: "MicheleBellitti/stadera-web", ref: "main", … }
  ▼
GCP STS (Security Token Service)
  │ (2) verifies signature against the WIF Provider's issuer
  │     applies attribute_condition: assertion.repository == "<your repo>"
  │     if pass: issues a short-lived federated GCP token (~1h)
  ▼
GCP IAM
  │ (3) federated token impersonates the service account because of the
  │     iam.workloadIdentityUser binding on attribute.repository
  ▼
Service account does the work
       (4) uses run.admin / artifactregistry.writer / iam.serviceAccountUser
           to push the image and deploy Cloud Run
```

No JSON keys anywhere. The only "credential" is the OIDC token GitHub
mints fresh for every workflow run. It's valid for ~10 minutes and
scoped to that single run — uncopyable, unleakable in any meaningful
way.

## Common variables

The README sets these once at the top:

```sh
PROJECT=stadera-prod          # GCP project where everything lives
REGION=europe-west1           # closest to user (Italy)
REPO=stadera                  # Artifact Registry name (just a label)
SERVICE=stadera-web           # Cloud Run service name
SA=stadera-web-deployer       # service account local name
SA_EMAIL=$SA@$PROJECT.iam.gserviceaccount.com
```

`$SA_EMAIL` is what GCP IAM calls a *principal*: every identity is a
principal, and you bind permissions to principals.

Useful distinction GCP forces on you:

- **Project ID** — the human string (`stadera-prod`). Stable forever.
- **Project number** — a 12-digit number assigned at creation
  (`gcloud projects describe $PROJECT --format='value(projectNumber)'`).
  Used in resource paths like the WIF provider URI.

---

## Step 1 — Artifact Registry repository

```sh
gcloud artifacts repositories create $REPO \
    --repository-format=docker --location=$REGION \
    --project=$PROJECT
```

**What it does:** creates a Docker repository inside Artifact Registry
in `europe-west1`. Artifact Registry is GCP's container registry —
the equivalent of Docker Hub, but inside your project, with IAM-based
access control.

**Why we need it:** Cloud Run deploys from a Docker image, and that
image has to live in a registry Cloud Run can authenticate against.
Artifact Registry is the standard choice on GCP (the older "Container
Registry" is deprecated).

**Verify:**

```sh
gcloud artifacts repositories list --project=$PROJECT
```

You should see a row `stadera   DOCKER   europe-west1`.

**What can go wrong:**

- API not enabled → `gcloud services enable artifactregistry.googleapis.com`
- Region typo: no error, but you push to a region the workflow doesn't
  expect. Match the `GCP_REGION` GitHub variable.

---

## Step 2 — Service account

```sh
gcloud iam service-accounts create $SA --project=$PROJECT
SA_EMAIL=$SA@$PROJECT.iam.gserviceaccount.com
```

**What it does:** creates a non-human identity with email
`stadera-web-deployer@stadera-prod.iam.gserviceaccount.com`. The
account exists but has zero permissions yet.

**Why a separate identity:** we don't want CI to run as Michele. Two
reasons:

1. *Principle of least privilege* — Michele has owner-level access to
   the project. The deployer doesn't need that.
2. *Rotation / revocation* — if the deployer ever misbehaves (rogue
   workflow, leaked secret), you delete the SA. Your own account
   stays untouched.

**Verify:**

```sh
gcloud iam service-accounts list --project=$PROJECT
```

---

## Step 3 — IAM permissions

```sh
gcloud projects add-iam-policy-binding $PROJECT \
    --member="serviceAccount:$SA_EMAIL" --role=roles/run.admin

gcloud projects add-iam-policy-binding $PROJECT \
    --member="serviceAccount:$SA_EMAIL" --role=roles/artifactregistry.writer

gcloud projects add-iam-policy-binding $PROJECT \
    --member="serviceAccount:$SA_EMAIL" --role=roles/iam.serviceAccountUser
```

**What they do:** add three "policy bindings" to the project's IAM
policy. Every binding is a triple `{principal, role, scope}`:

- `principal` = who gets the permission (`$SA_EMAIL`)
- `role` = what they can do (below)
- `scope` = where (here: the whole project, via the `projects` command)

**The three roles, in plain English:**

| Role | What it grants |
|---|---|
| `roles/run.admin` | create / update / delete Cloud Run services in this project |
| `roles/artifactregistry.writer` | push images into Artifact Registry repos |
| `roles/iam.serviceAccountUser` | "act as" *another* service account during deploy |

The third one is subtle. Cloud Run associates every running service
with a *runtime* service account (by default the project's compute SA,
`<projectnum>-compute@developer.gserviceaccount.com`). When the
deployer creates the service, it has to assign that runtime SA to it
— and to do so, GCP requires `iam.serviceAccountUser` on the runtime
SA. Without it, deploy fails with `Permission iam.serviceaccounts.actAs denied`.

**Tradeoff:** `run.admin` is broad. For a multi-team org you'd
narrow to `roles/run.developer` (create/update only, no delete) and
scope `serviceAccountUser` to the specific runtime SA. For
single-tenant Stadera, broad-on-the-project is fine.

**Verify:** print the bindings touching this SA:

```sh
gcloud projects get-iam-policy $PROJECT \
    --flatten="bindings[].members" \
    --filter="bindings.members:$SA_EMAIL" \
    --format="value(bindings.role)"
```

Should print the three roles.

---

## Step 4 — Workload Identity Pool

```sh
POOL=github-pool
PROVIDER=github-provider
GITHUB_REPO=MicheleBellitti/stadera-web

gcloud iam workload-identity-pools create $POOL \
    --location=global --project=$PROJECT
```

**What it does:** creates an empty *pool* — a logical container for
external (federated) identities. Think of the pool as a labelled box
where "trusted external IdPs for this project" go. You create the pool
once and can later add multiple *providers* into it (one per IdP:
GitHub Actions, GitLab CI, AWS, OIDC-compliant CI, …).

**Why `global`:** WIF is a global service, not regional. The
`--location=global` flag is an API contract, not a placement choice.

```sh
POOL_ID=$(gcloud iam workload-identity-pools describe $POOL \
    --location=global --project=$PROJECT --format='value(name)')
```

**What it does:** captures the pool's full resource name into
`$POOL_ID`. The format is:

```
projects/<project_number>/locations/global/workloadIdentityPools/github-pool
```

You'll need this string twice:

- in Step 6, to construct the principal set
- in the GitHub `WIF_PROVIDER` secret, with `/providers/<provider>` appended

`<project_number>` is numeric (12 digits). Distinct from the project ID
(`stadera-prod`). Get it on demand:

```sh
gcloud projects describe $PROJECT --format='value(projectNumber)'
```

---

## Step 5 — Workload Identity Provider

The densest command. Spelt out:

```sh
gcloud iam workload-identity-pools providers create-oidc $PROVIDER \
    --location=global \
    --workload-identity-pool=$POOL \
    --project=$PROJECT \
    --display-name="GitHub Actions" \
    --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
    --attribute-condition="assertion.repository=='$GITHUB_REPO'" \
    --issuer-uri="https://token.actions.githubusercontent.com"
```

**Big picture:** tell GCP "accept OIDC tokens signed by GitHub Actions,
but **only** if they come from this specific repository, and translate
the GitHub claims into the GCP attributes I care about."

**Flag by flag:**

### `--issuer-uri`

The public URL where GCP will fetch GitHub's JWKS (JSON Web Key Set)
to verify token signatures. GitHub publishes its OIDC discovery doc at
`https://token.actions.githubusercontent.com/.well-known/openid-configuration`,
which points at the JWKS. Anyone can read both — verification is
public-key crypto, no shared secret.

### `--attribute-mapping`

Translates the *claims* in the GitHub OIDC token into GCP *attributes*.

Syntax: `target=source,target=source,…`

Targets:

- `google.subject` — **mandatory**, must produce a unique identifier
  for the principal. Used in audit logs. We map it to GitHub's `sub`
  claim, which looks like
  `repo:MicheleBellitti/stadera-web:ref:refs/heads/main` — already
  unique enough.
- `attribute.<name>` — custom GCP attributes you define. We map
  `attribute.repository` from GitHub's `repository` claim
  (e.g. `MicheleBellitti/stadera-web`). This is what we'll filter on in
  Step 6 to scope the binding to *only this repo*.

You can map more attributes if you want finer control. Common extras:

- `attribute.ref = assertion.ref` — to allow only `refs/heads/main`
- `attribute.environment = assertion.environment` — to require a
  GitHub deployment environment

We keep it minimal here.

### `--attribute-condition`

A CEL expression that must evaluate `true` for the token to be
accepted. Tokens that fail this condition are rejected at the STS
layer — they never reach the IAM binding evaluation.

Ours: `assertion.repository=='MicheleBellitti/stadera-web'`. Even if
someone in a different repo tries to use this WIF provider with a
valid GitHub OIDC token, GCP rejects the exchange. Defense against
the *confused deputy* pattern.

Common to also pin the branch:

```cel
assertion.repository=='MicheleBellitti/stadera-web' && assertion.ref=='refs/heads/main'
```

For Stadera that's overkill (workflow already only runs on `main`
push) but it's belt + suspenders.

**Verify:**

```sh
gcloud iam workload-identity-pools providers describe $PROVIDER \
    --location=global --workload-identity-pool=$POOL --project=$PROJECT
```

Inspect the `attributeMapping` and `attributeCondition` fields.

---

## Step 6 — Bind the GitHub repo to the service account

```sh
gcloud iam service-accounts add-iam-policy-binding $SA_EMAIL \
    --project=$PROJECT \
    --role=roles/iam.workloadIdentityUser \
    --member="principalSet://iam.googleapis.com/$POOL_ID/attribute.repository/$GITHUB_REPO"
```

**What it does:** says "any identity entering through `$POOL_ID` whose
`attribute.repository` equals `MicheleBellitti/stadera-web` is allowed
to **impersonate** the service account `stadera-web-deployer`."

**`principalSet://`:** a URL-style identifier for a *set* of principals
(plural), as opposed to `serviceAccount:foo@bar.iam` which is a
single principal. Read it as: "every identity in this pool that has
this attribute value, whoever they end up being at runtime."

**`roles/iam.workloadIdentityUser`:** the specific role that grants
*impersonation via WIF*. Without this binding, even a perfectly valid
token from your repo would get a federated GCP token but fail at the
"act as the SA" step.

The binding lives **on the service account**, not on the project —
because impersonation is permission *over the SA*, not over a project
resource.

**Verify:**

```sh
gcloud iam service-accounts get-iam-policy $SA_EMAIL --project=$PROJECT
```

You should see a member starting with
`principalSet://iam.googleapis.com/.../attribute.repository/MicheleBellitti/stadera-web`.

---

## Step 7 — Print the values you need on GitHub

```sh
echo "WIF_PROVIDER       = $POOL_ID/providers/$PROVIDER"
echo "WIF_SERVICE_ACCOUNT = $SA_EMAIL"
```

These are the two GitHub Secrets the deploy workflow consumes.

- `WIF_PROVIDER`:
  `projects/<projectnum>/locations/global/workloadIdentityPools/github-pool/providers/github-provider`
- `WIF_SERVICE_ACCOUNT`:
  `stadera-web-deployer@stadera-prod.iam.gserviceaccount.com`

Set them via *Settings → Secrets and variables → Actions → Secrets →
New repository secret*. They're consumed by
`google-github-actions/auth@v2` in `deploy.yml`.

The non-secret variables (`GCP_PROJECT`, `GCP_REGION`,
`ARTIFACT_REGISTRY_REPO`, `CLOUD_RUN_SERVICE`, `BACKEND_API_URL`) live
in the *Variables* tab in the same UI.

---

## End-to-end smoke test

After the secrets/variables are set, the first push to `main` runs
`deploy.yml`. Reading the logs by step:

| Step | What it should look like | Common failure |
|---|---|---|
| `auth` | "Successfully exchanged token" | "Permission denied on service account" → Step 6 binding wrong, or `WIF_PROVIDER` secret has a typo |
| `setup-gcloud` | "Successfully setup gcloud" | rare; usually network |
| `Configure Docker for Artifact Registry` | "gcloud credential helpers already registered" | wrong region in `GCP_REGION` |
| `Build image` | docker progress | usually local-only — caching, base image pull |
| `Push image` | digest sha256:… | "denied: requires roles/artifactregistry.writer" → Step 3 missing role |
| `Deploy to Cloud Run` | "Service [stadera-web] has been deployed" | "actAs denied" → Step 3 `serviceAccountUser` missing |

After a successful run:

```sh
gcloud run services describe stadera-web \
    --region=europe-west1 --format='value(status.url)'
```

prints the public URL of the deployed frontend.

---

## References

- [Workload Identity Federation overview](https://cloud.google.com/iam/docs/workload-identity-federation)
- [google-github-actions/auth](https://github.com/google-github-actions/auth) — the GitHub Action that does the client-side OIDC dance
- [Cloud Run IAM roles](https://cloud.google.com/run/docs/reference/iam/roles)
- [Artifact Registry quickstart](https://cloud.google.com/artifact-registry/docs/docker/quickstart)
