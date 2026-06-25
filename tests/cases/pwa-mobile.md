# PWA & Mobile — Test Cases

Covers PWA installation on Android and iOS, tenant-specific launch URL, full-screen mode, offline fallback, bottom navigation, camera access within PWA, touch target sizing, responsive table layouts, and iPhone safe area handling.

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 1 | Install PWA on Android | Open app in Chrome on Android; tap "Add to Home Screen" prompt | App is installed; icon appears on home screen |
| 2 | Install PWA on iOS | Open app in Safari on iOS; tap Share > "Add to Home Screen" | App is installed; icon appears on home screen |
| 3 | PWA opens to tenant URL | Launch installed PWA from home screen | App opens directly to the tenant's dashboard (e.g., `/{tenant-slug}/dashboard`) |
| 4 | Full-screen mode | Launch PWA from home screen | App runs in standalone mode without browser address bar |
| 5 | Offline fallback page | Disconnect from network; open or navigate within PWA | Offline fallback page is shown with "No internet connection" message |
| 6 | Bottom navigation on mobile | Open app on a mobile device or narrow viewport | Bottom navigation bar is visible with key tabs (Dashboard, Inventory, Sales, etc.) |
| 7 | Camera access in PWA | Open Sales or Verification; tap camera scan button in PWA | Camera permission prompt appears; camera feed loads for barcode scanning |
| 8 | Touch targets meet minimum size | Inspect buttons and interactive elements on mobile | All touch targets are at least 44x44px per accessibility guidelines |
| 9 | Responsive tables on mobile | Open a data table (Inventory, Sales) on a mobile viewport | Table is scrollable horizontally or reformats for mobile readability |
| 10 | iPhone safe area respected | Open app on iPhone with notch/Dynamic Island | Content does not overlap with the notch, home indicator, or status bar area |
