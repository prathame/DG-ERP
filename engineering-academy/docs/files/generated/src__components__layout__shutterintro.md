---
sidebar_label: "ShutterIntro.tsx"
title: "File src/components/layout/ShutterIntro.tsx"
description: "Deep walkthrough of src/components/layout/ShutterIntro.tsx in DG-ERP / Dhandho"
---

# File walkthrough: `src/components/layout/ShutterIntro.tsx`

:::info Ownership context
Auto-generated from the live source tree so **no file is invisible** during onboarding.
:::

## Purpose

`src/components/layout/ShutterIntro.tsx` is part of Dhandho (DG-ERP). Approximate size: **421 lines**.

## Business value

Ask: *If this file disappeared tomorrow, which user-facing workflow would break?*

## Imports

- `motion/react`
- `react`

## Exports and symbols

**Exported names:** `ShutterIntro`

**Classes:** _none_

## Functions (7 detected)

### Function: splitGraphemes

```ts
splitGraphemes(str: string)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/components/layout/ShutterIntro.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `splitGraphemes` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: SplitFlapChar

```ts
SplitFlapChar({ char, delayMs, trigger, instant }: { char: string; delayMs: number; trigger: number; instant?: boolean })
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/components/layout/ShutterIntro.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `SplitFlapChar` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: SplitFlapWord

```ts
SplitFlapWord({ word, trigger }: { word: string; trigger: number })
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/components/layout/ShutterIntro.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `SplitFlapWord` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: playShutterSound

```ts
playShutterSound()
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/components/layout/ShutterIntro.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `playShutterSound` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: ShutterIntro

```ts
ShutterIntro({ onDone }: { onDone: ()
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/components/layout/ShutterIntro.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `ShutterIntro` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: flip

```ts
flip(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/components/layout/ShutterIntro.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `flip` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: unlockAudio

```ts
unlockAudio(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/components/layout/ShutterIntro.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `unlockAudio` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |


## Execution flow

1. Module loaded by Node (`tsx`) or Vite.
2. Top-level imports initialize dependencies.
3. Callers import exported symbols.

## Call hierarchy

```bash
# From DG-ERP repo root
rg -n "ShutterIntro" --glob '!node_modules' -g '*.ts' -g '*.tsx'
```

## Performance impact

Line count **421**. Large view/route files are refactor candidates.

## Security impact

Review for: tenant scoping, IDOR, secrets in logs, XSS, path traversal on backups.

## Scalability

In-memory caches (authCache, GET Map) do **not** share across instances.

## Refactoring opportunities

- Extract pure helpers for unit tests
- Split modules larger than ~800 lines
- Deduplicate GST math via shared SQL fragments

## Common mistakes

- Forgetting `tenant_id` in a new query
- Trusting JWT role claims without live DB hydration
- Putting secrets in `VITE_*` env vars
- Returning raw DB errors to clients

## Alternative implementations

| Approach | Trade-off |
| --- | --- |
| Keep as-is | Fast to ship; harder to test |
| Split module | Clearer ownership; more files |
| Shared package | Reuse across surfaces; packaging cost |

## Related academy pages

- [File index](/files/)
- [Generated index](/files/generated/)
- [Architecture](/architecture/system-overview)
- [Security threat model](/security/threat-model)

## Hands-on

1. Open `src/components/layout/ShutterIntro.tsx` in the IDE.
2. Breakpoint the largest exported function.
3. Trigger via UI or supertest.
4. Write one sentence on why this file exists in the product narrative.

---

*Generated by scripts/generate-file-deepdives.mjs · slug: `src__components__layout__shutterintro`*
