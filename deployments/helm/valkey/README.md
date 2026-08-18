# valkey

Standalone Valkey (Redis-compatible) chart providing a **shared cache** for SOBA, so cache
invalidation (notably workspace membership/role) takes effect across all backend replicas instead
of per-pod.

Deployed as per-namespace shared infra, **before** soba — the same model as `clamav` and
`temporal`. The soba backend does not depend on this release directly; it reaches Valkey through an
in-namespace `soba-valkey` ExternalName alias created by the soba chart when
`backend.config.cacheDefaultCode == cache-redis`.

## Deploy

```
helm upgrade --install valkey ./deployments/helm/valkey \
  --namespace <namespace> -f ./deployments/helm/valkey/values-<env>.yaml
```

Release it as `valkey` (or set `fullnameOverride: valkey`) so its Service is named `valkey` — the
soba chart's default alias points at `valkey.<namespace>.svc.cluster.local`. For any other release
name, set `valkey.externalName` in the soba values instead. The soba backend then connects with
`PLUGIN_CACHE_REDIS_URL=redis://<soba-release>-valkey:6379` (wired by the soba chart).

## Notes

- Single instance, no persistence (`--save ""`): the cache is best-effort. If Valkey is
  unreachable the backend falls through to Postgres — slower, not an outage.
- `allkeys-lru` eviction bounds memory; values are small (memberships).
- A NetworkPolicy (`nsp.create`, default on) allows in-namespace ingress on 6379 for default-deny
  namespaces.

## Security / trust model

This deploys Valkey with **no `requirepass` and no TLS**, and the NetworkPolicy admits **any pod in
the namespace**. The soba backend caches authorization state here (workspace membership/role), and
the per-release key prefix is collision-avoidance, **not** an isolation boundary — any pod that can
reach Valkey can read or forge another release's cached roles. This is only safe when the namespace
is a **single trust domain** (a dedicated env namespace, or PR namespaces owned by the same team),
which is the assumption on the target OpenShift platform.

If a namespace ever becomes multi-tenant, enable `requirepass` (and TLS), which means moving
`PLUGIN_CACHE_REDIS_URL` out of the backend ConfigMap into a Secret — a coordinated change, not a
values tweak — and/or run a dedicated Valkey per trust domain.
