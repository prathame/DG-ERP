---
sidebar_label: Quiz · Frontend
title: "Quiz: Frontend"
description: Self-check on App shell, routing, api.ts, platforms, and state.
---

# Quiz: Frontend

## Q1

Why is there no React Router?

<details>
<summary>Answer</summary>

Authenticated UX is tab-driven (`activeTab` + `history.pushState`) after `/{slug}` login. Avoiding a router kept the console simple; trade-off is weaker deep links into sub-states.

</details>

## Q2

What does `fetchApi` do on 401 (non-auth endpoint)?

<details>
<summary>Answer</summary>

Clears `session` and redirects to `/{slug}` (or login flow).

</details>

## Q3


</details>

## Q4

Where does the JWT live on the client?

<details>
<summary>Answer</summary>

`localStorage` via `src/lib/session.ts` — accepted XSS risk; mitigate with CSP + careful HTML.

</details>

## Q5

Why lazy-load feature views in `App.tsx`?

<details>
<summary>Answer</summary>

Keep the authenticated shell small enough to pass the CI gzip main-chunk gate and improve time-to-interactive.

</details>

## Related

- [App Shell](/frontend/app-shell)  
- [API Client](/frontend/api-client)  
- [Platforms](/frontend/platforms)  
- [Quiz: Architecture](/quizzes/quiz-architecture)  
