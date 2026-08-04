# SOBA Action MongoDB Helm Chart

This chart deploys the MongoDB backing store for SOBA Form.io as a separate,
manual Helm release.

The intended model is:

- one-time manual install into `acf456-prod`
- future manual Helm upgrades only when needed
- no OpenShift Route
- no `LoadBalancer`
- no `NodePort`
- internal `ClusterIP` and headless services only
- MongoDB authentication enabled
- TLS disabled by decision
- credentials sourced from Key Vault into a pre-existing Kubernetes Secret
- strict NetworkPolicy for Form.io and approved admin/test pods

## What This Chart Owns

The chart is a pure dependency wrapper around the Bitnami MongoDB chart and sets
SOBA production-style values:

- 3-member MongoDB replica set
- StatefulSet deployment
- rolling update strategy
- persistent PVCs
- PVC retention on delete/scale
- PodDisruptionBudget with `minAvailable: 2`
- non-root app database user
- no external MongoDB access
- Bitnami NetworkPolicy with SOBA Form.io pod selectors

## What This Chart Does Not Own

The chart does not create secret values. Create the Kubernetes Secret before
installing the chart.

It also does not yet include:

- TLS
- backup/restore
- metrics exporter
- automatic password rotation
- Form.io deployment changes
- custom Helm test pod

## Required Secret

Create this Kubernetes Secret before install:

```text
soba-uat-mongodb-auth
```

Required keys:

```text
mongodb-root-password
mongodb-replica-set-key
mongodb-passwords
```

`mongodb-passwords` must contain the password for the configured app user:

```text
formio
```

The app database is:

```text
formio-ce
```

The recommended source of truth is Key Vault. The Kubernetes Secret should be
created from the Key Vault values before running Helm.

## Install

From the SOBA repository root:

```bash
helm dependency build deployments/helm/action-mongodb
```

Then install:

```bash
helm upgrade --install soba-uat-mongodb deployments/helm/action-mongodb -n acf456-prod -f deployments/helm/action-mongodb/values-uat.yaml
```

For prod, use the prod overlay:

```bash
helm upgrade --install soba-prod-mongodb deployments/helm/action-mongodb -n acf456-prod -f deployments/helm/action-mongodb/values-prod.yaml
```

Keep common chart behavior in `values.yaml`. Put environment-specific release
names, secret names, image digest/tag, app labels, and storage size in the
environment overlays.

## Admin Access

MongoDB should remain internal. Admin access should use controlled RBAC and
temporary port-forwarding, not a Route, `NodePort`, or `LoadBalancer`.

Example service name:

```text
soba-uat-mongodb
```

Example headless service name:

```text
soba-uat-mongodb-headless
```

Recommended Form.io MongoDB URI shape using the Bitnami headless service:

```text
mongodb://formio:<password>@soba-uat-mongodb-0.soba-uat-mongodb-headless:27017,soba-uat-mongodb-1.soba-uat-mongodb-headless:27017,soba-uat-mongodb-2.soba-uat-mongodb-headless:27017/formio-ce?replicaSet=rs0&authSource=formio-ce
```

## Network Policy

The chart uses Bitnami's MongoDB NetworkPolicy.

UAT allows MongoDB ingress from Form.io pods matching:

```text
app.kubernetes.io/instance=soba-uat
app.kubernetes.io/component=formio
```

Bitnami's `addExternalClientAccess` is also enabled. For a temporary admin pod
to access MongoDB directly, label it:

```text
soba-uat-mongodb-client=true
```

If Form.io labels change, update `mongodb.networkPolicy.ingressPodMatchLabels`.

## Upgrades

Use manual Helm upgrades. For MongoDB image or configuration changes, treat the
upgrade as a rolling restart of the StatefulSet:

1. Confirm the replica set is healthy.
2. Take a backup when backup tooling is available.
3. Run `helm upgrade`.
4. Wait for each pod to become ready.
5. Confirm primary/secondary health.
6. Run a manual `mongosh` auth check from an approved admin pod.

Do not delete all MongoDB pods at once.
