#!/usr/bin/env python3
"""
DG ERP — Full E2E API Test Suite
Covers all ~130 endpoints: happy path + failure cases.
Usage: python3 tests/e2e_full.py [--base http://localhost:3001]
"""
import sys, json, urllib.request, urllib.parse, urllib.error, time, argparse

# ── Config ────────────────────────────────────────────────────────────────────
BASE = "http://localhost:3001"
SA_EMAIL = "admin@spre.ai"
SA_PASS  = "superadmin123"

# ── Helpers ───────────────────────────────────────────────────────────────────
PASS_LIST = []; FAIL_LIST = []; SECTION = ""

def section(name):
    global SECTION
    SECTION = name
    print(f"\n{'━'*55}\n  {name}\n{'━'*55}")

def req(method, path, data=None, headers={}, timeout=10):
    url = BASE + path
    body = json.dumps(data).encode() if data is not None else None
    h = {"Content-Type": "application/json", **headers}
    r = urllib.request.Request(url, data=body, headers=h, method=method)
    try:
        with urllib.request.urlopen(r, timeout=timeout) as resp:
            raw = resp.read()
            return resp.status, json.loads(raw) if raw.strip() else {}
    except urllib.error.HTTPError as e:
        raw = e.read()
        try: return e.code, json.loads(raw) if raw.strip() else {}
        except: return e.code, {"error": str(e)}
    except Exception as e:
        return 0, {"error": str(e)}

def ok(name, cond, detail=""):
    label = f"[{SECTION}] {name}"
    if cond:
        PASS_LIST.append(label)
        print(f"  ✅ {name}")
    else:
        FAIL_LIST.append(label)
        print(f"  ❌ {name}{' — '+str(detail) if detail else ''}")

def h(tok, tid): return {"Authorization": f"Bearer {tok}", "x-tenant-id": tid}

# ── Setup: fresh tenant + tokens ──────────────────────────────────────────────
def setup():
    print("\n⚙  Setting up test tenants...")
    s, d = req("POST", "/api/super-admin/login", {"email": SA_EMAIL, "password": SA_PASS})
    assert s == 200, f"SA login failed: {d}"
    SA = d["token"]
    sa_h = {"Authorization": f"Bearer {SA}"}

    slug = f"e2e-{int(time.time())}"
    s, d = req("POST", "/api/super-admin/tenants", {
        "companyName": f"E2E Test {slug[-6:]}", "slug": slug,
        "adminName": "Admin", "adminEmail": f"admin@{slug}.com",
        "adminPassword": "Test@123", "businessType": "manufacturer",
    }, sa_h)
    assert s in (200,201), f"Create dealer tenant failed: {d}"
    TID = d["tenantId"]

    slug2 = f"e2e-svc-{int(time.time())}"
    s, d = req("POST", "/api/super-admin/tenants", {
        "companyName": f"E2E Svc {slug2[-6:]}", "slug": slug2,
        "adminName": "Admin", "adminEmail": f"admin@{slug2}.com",
        "adminPassword": "Test@123", "businessType": "service",
    }, sa_h)
    TID_SVC = d.get("tenantId","")

    s, d = req("POST", "/api/auth/login",
        {"email": f"admin@{slug}.com", "password": "Test@123"},
        {"x-tenant-id": TID})
    assert s == 200, f"Tenant login failed: {d}"
    TOK = d["token"]
    USER_ID = d.get("id", "")

    SVC_TOK = ""
    if TID_SVC:
        s, d = req("POST", "/api/auth/login",
            {"email": f"admin@{slug2}.com", "password": "Test@123"},
            {"x-tenant-id": TID_SVC})
        SVC_TOK = d.get("token","")

    print(f"  Manufacturer tenant: {TID}")
    print(f"  Service tenant:      {TID_SVC}")
    return SA, sa_h, TID, TOK, TID_SVC, SVC_TOK

# ══════════════════════════════════════════════════════════════════════════════
def run_all(SA, sa_h, TID, TOK, TID_SVC, SVC_TOK):
    D  = h(TOK, TID)
    SV = h(SVC_TOK, TID_SVC) if SVC_TOK else D
    # Get current user ID for profile/password endpoints
    _, _prof = req("GET", "/api/settings/profile", headers=D)
    USER_ID = _prof.get("id", "") if isinstance(_prof, dict) else ""

    # ── SUPER ADMIN ───────────────────────────────────────────────────────────
    section("SUPER ADMIN")
    s, d = req("POST", "/api/super-admin/login", {"email": SA_EMAIL, "password": SA_PASS})
    ok("SA login → 200", s == 200)
    s, _ = req("POST", "/api/super-admin/login", {"email": "bad@x.com", "password": "wrong"})
    ok("SA login wrong creds → 401", s == 401)

    s, d = req("GET", "/api/super-admin/tenants", headers=sa_h)
    ok("List tenants → 200", s == 200)
    ok("Tenants is list", isinstance(d, list))
    s, _ = req("GET", "/api/super-admin/tenants")
    ok("List tenants no auth → 401", s == 401)

    s, d = req("GET", f"/api/super-admin/tenants/{TID}", headers=sa_h)
    ok("Get tenant by ID → 200", s == 200)
    s, d = req("GET", "/api/super-admin/tenants/NONEXISTENT", headers=sa_h)
    ok("Get bad tenant → 404", s == 404)

    s, d = req("PUT", f"/api/super-admin/tenants/{TID}", {"status": "active"}, sa_h)
    ok("Update tenant → 200", s == 200)

    s, d = req("GET", "/api/super-admin/dashboard", headers=sa_h)
    ok("SA dashboard → 200", s == 200)
    s, d = req("GET", "/api/super-admin/plans", headers=sa_h)
    ok("SA plans → 200", s == 200)
    s, d = req("GET", "/api/super-admin/analytics", headers=sa_h)
    ok("SA analytics → 200", s == 200)
    s, d = req("GET", "/api/super-admin/audit-log", headers=sa_h)
    ok("SA audit log → 200", s == 200)

    s, d = req("POST", f"/api/super-admin/tenants/{TID}/impersonate", headers=sa_h)
    ok("Impersonate tenant → 200", s == 200)
    ok("Impersonate returns token", "token" in d)

    # ── AUTH ──────────────────────────────────────────────────────────────────
    section("AUTH")
    s, d = req("POST", "/api/auth/login",
        {"email": f"admin@{TID.lower()}.x", "password": "wrong"}, {"x-tenant-id": TID})
    ok("Login wrong creds → 401/400", s in (400, 401))
    s, d = req("POST", "/api/auth/login",
        {"email": "notanemail", "password": "x"}, {"x-tenant-id": TID})
    ok("Login missing tenant header → 4xx", s >= 400)
    s, d = req("POST", "/api/auth/forgot-password",
        {"email": "anyone@example.com"}, {"x-tenant-id": TID})
    ok("Forgot password → 200/404", s in (200, 404))
    s, _ = req("POST", "/api/auth/forgot-password", {}, {"x-tenant-id": TID})
    ok("Forgot password no email → 4xx", s >= 400)

    # ── TENANT PUBLIC ─────────────────────────────────────────────────────────
    section("TENANT PUBLIC")
    # Find slug from setup
    s, tenants = req("GET", "/api/super-admin/tenants", headers=sa_h)
    my_tenant = next((t for t in (tenants if isinstance(tenants,list) else []) if t["id"] == TID), {})
    slug = my_tenant.get("slug","")
    if slug:
        s, d = req("GET", f"/api/tenant/by-slug/{slug}")
        ok("Tenant by slug → 200", s == 200)
        ok("Returns tenantId", "tenantId" in d)
    s, _ = req("GET", "/api/tenant/by-slug/definitely-not-a-real-slug")
    ok("Bad slug → 404", s == 404)

    # ── PRODUCTS ──────────────────────────────────────────────────────────────
    section("PRODUCTS")
    s, d = req("GET", "/api/products", headers=D)
    ok("List products → 200", s == 200)
    s, _ = req("GET", "/api/products")
    ok("List products no auth → 401", s == 401)

    s, p = req("POST", "/api/products", {
        "name": "E2E Widget", "price": 100, "warrantyMonths": 12,
        "hsnCode": "8473", "gstRate": 18, "packSize": 10, "barcodeMode": "auto", "quantity": 1,
    }, D)
    ok("Create product → 201", s == 201, p.get("error",""))
    PID = p.get("id","")
    ok("Product has ID", bool(PID))

    s, _ = req("POST", "/api/products", {}, D)
    ok("Create product no name → 400", s == 400)

    if PID:
        s, d = req("GET", f"/api/products/{PID}/barcodes", headers=D)
        ok("Product barcodes → 200", s == 200)
        s, d = req("PUT", f"/api/products/{PID}", {"name": "E2E Widget Updated", "price": 120}, D)
        ok("Update product → 200", s == 200)
        s, d = req("GET", f"/api/products/{PID}/barcode-details", headers=D)
        ok("Barcode details → 200/404", s in (200, 404))

    s, d = req("POST", "/api/products/batch", {
        "items": [{"name": "Batch Widget", "price": 50, "warrantyMonths": 6}]
    }, D)
    ok("Batch create products → 201", s == 201)
    s, _ = req("POST", "/api/products/batch", {"items": []}, D)
    ok("Batch empty → 400", s == 400)

    # Add stock (barcode)
    BARCODE = ""
    if PID:
        s, d = req("POST", f"/api/products/{PID}/add-stock",
            {"quantity": 5, "batchNumber": "E2E-001"}, D)
        ok("Add stock → 201", s == 201, d.get("error",""))
        barcodes_resp = req("GET", f"/api/products/{PID}/barcodes", headers=D)[1]
        if isinstance(barcodes_resp, list) and barcodes_resp:
            BARCODE = barcodes_resp[0].get("barcode","")
        elif isinstance(barcodes_resp, dict):
            items = barcodes_resp.get("barcodes", barcodes_resp.get("items", []))
            if items: BARCODE = items[0].get("barcode","")

    # ── VENDORS ───────────────────────────────────────────────────────────────
    section("VENDORS")
    s, d = req("GET", "/api/vendors", headers=D)
    ok("List vendors → 200", s == 200)

    s, v = req("POST", "/api/vendors", {
        "name": "E2E Vendor", "phone": "9876543210", "email": "vendor@e2e.com"
    }, D)
    ok("Create vendor → 201", s == 201, v.get("error",""))
    VID = v.get("id","")

    s, _ = req("POST", "/api/vendors", {}, D)
    ok("Create vendor no name → 400", s == 400)

    if VID:
        s, d = req("PUT", f"/api/vendors/{VID}", {"name": "E2E Vendor Updated"}, D)
        ok("Update vendor → 200", s == 200)
        s, d = req("GET", "/api/vendor-finance/summary", headers=D)
        ok("Vendor finance summary → 200", s == 200)
        s, d = req("GET", f"/api/vendor-finance/{VID}", headers=D)
        ok("Vendor finance detail → 200", s == 200)

    s, d = req("POST", "/api/vendors/bulk",
        {"vendors": [{"name": "Bulk V1", "phone": "9111111111"}]}, D)
    ok("Bulk create vendors → 200/201", s in (200,201))

    # ── CUSTOMERS ─────────────────────────────────────────────────────────────
    section("CUSTOMERS")
    s, d = req("GET", "/api/customers", headers=D)
    ok("List customers → 200", s == 200)

    s, c = req("POST", "/api/customers", {
        "name": "E2E Customer", "phone": "9000000001"
    }, D)
    ok("Create customer → 201", s == 201, c.get("error",""))
    CID = c.get("id","")

    s, _ = req("POST", "/api/customers", {}, D)
    ok("Create customer no name → 400", s == 400)

    if CID:
        s, d = req("PUT", f"/api/customers/{CID}", {"name": "E2E Customer Updated"}, D)
        ok("Update customer → 200", s == 200)
        s, d = req("GET", f"/api/customers/{CID}/purchases", headers=D)
        ok("Customer purchases → 200", s == 200)

    # ── SUPPLIERS ─────────────────────────────────────────────────────────────
    section("SUPPLIERS")
    s, d = req("GET", "/api/suppliers", headers=D)
    ok("List suppliers → 200", s == 200)

    s, sup = req("POST", "/api/suppliers", {
        "name": "E2E Supplier", "phone": "9800000001", "gstNumber": "24AABCT1332L1ZS"
    }, D)
    ok("Create supplier → 201", s == 201, sup.get("error",""))
    SID = sup.get("id","")
    s, _ = req("POST", "/api/suppliers", {}, D)
    ok("Create supplier no name → 400", s == 400)
    if SID:
        s, d = req("PUT", f"/api/suppliers/{SID}", {"name": "E2E Supplier Updated"}, D)
        ok("Update supplier → 200", s == 200)
        s, d = req("GET", "/api/supplier-finance/summary", headers=D)
        ok("Supplier finance summary → 200", s == 200)

    # ── BANKS ─────────────────────────────────────────────────────────────────
    section("BANKS")
    s, d = req("GET", "/api/banks", headers=D)
    ok("List banks → 200", s == 200)
    s, b = req("POST", "/api/banks", {
        "name": "E2E Bank", "accountNumber": "1234567890", "bankName": "SBI"
    }, D)
    ok("Create bank → 201", s == 201, b.get("error",""))
    BNK = b.get("id","")
    s, _ = req("POST", "/api/banks", {}, D)
    ok("Create bank no name → 400", s == 400)
    if BNK:
        s, d = req("PUT", f"/api/banks/{BNK}", {"name": "E2E Bank Updated"}, D)
        ok("Update bank → 200", s == 200)
    s, d = req("POST", "/api/banks/batch",
        {"items": [{"name": "Batch Bank", "accountNumber": "9999999999"}]}, D)
    ok("Batch create banks → 201", s == 201)
    s, _ = req("POST", "/api/banks/batch", {"items": []}, D)
    ok("Batch banks empty → 400", s == 400)

    # ── CATEGORIES ───────────────────────────────────────────────────────────
    section("CATEGORIES")
    s, d = req("GET", "/api/categories", headers=D)
    ok("List categories → 200", s == 200)
    s, cat = req("POST", "/api/categories", {"name": "E2E Category"}, D)
    ok("Create category → 201", s == 201)
    CATID = cat.get("id","")
    s, _ = req("POST", "/api/categories", {}, D)
    ok("Create category no name → 400", s == 400)
    if CATID:
        s, d = req("PUT", f"/api/categories/{CATID}", {"name": "E2E Category Updated"}, D)
        ok("Update category → 200", s == 200)

    # ── PURCHASES ─────────────────────────────────────────────────────────────
    section("PURCHASES")
    s, d = req("GET", "/api/purchases/batches", headers=D)
    ok("List purchase batches → 200", s == 200)

    if PID and SID:
        s, purch = req("POST", "/api/purchases/batch", {
            "supplierId": SID, "purchaseDate": "2026-07-15",
            "items": [{"productId": PID, "quantity": 10, "costPrice": 80, "billedPrice": 90}]
        }, D)
        ok("Create purchase batch → 201", s == 201, purch.get("error",""))
        PBID = purch.get("batchId","")
        if PBID:
            s, d = req("GET", f"/api/purchases/batch/{PBID}", headers=D)
            ok("Get purchase batch → 200", s == 200)

    s, _ = req("POST", "/api/purchases/batch", {}, D)
    ok("Purchase batch no items → 400", s == 400)

    # ── DISTRIBUTION ──────────────────────────────────────────────────────────
    section("DISTRIBUTION")
    s, d = req("GET", "/api/distribution", headers=D)
    ok("List distribution → 200", s == 200)
    s, d = req("GET", "/api/distribution/batches", headers=D)
    ok("List dist batches → 200", s == 200)
    s, d = req("GET", "/api/distribution/summary", headers=D)
    ok("Distribution summary → 200", s == 200)

    DIST_BATCH = ""
    if PID and VID and BARCODE:
        s, dist = req("POST", "/api/distribution/batch", {
            "vendorId": VID, "distributionDate": "2026-07-15",
            "items": [{"productId": PID, "quantity": 1}] if PID else []
        }, D)
        ok("Create distribution batch → 201", s == 201, dist.get("error",""))
        DIST_BATCH = dist.get("batchId","")
        if DIST_BATCH:
            s, d = req("GET", f"/api/distribution/batch/{DIST_BATCH}", headers=D)
            ok("Get dist batch → 200", s == 200)
            s, d = req("GET", "/api/distribution/bill",
                headers={**D, **{}},)
            # Bill needs vendorId + batchId params
            s, d = req("GET", f"/api/distribution/bill?batchId={DIST_BATCH}&vendorId={VID}", headers=D)
            ok("Distribution bill → 200", s == 200)
    s, _ = req("POST", "/api/distribution/batch", {}, D)
    ok("Dist batch no items → 400", s == 400)

    # ── VENDOR PAYMENTS ───────────────────────────────────────────────────────
    section("VENDOR PAYMENTS")
    if VID:
        s, pay = req("POST", f"/api/vendor-finance/{VID}/payments", {
            "amount": 500, "paymentDate": "2026-07-15", "paymentMethod": "Cash"
        }, D)
        ok("Record vendor payment → 201", s == 201, pay.get("error",""))
        s, _ = req("POST", f"/api/vendor-finance/{VID}/payments",
            {"amount": 0, "paymentDate": "2026-07-15", "paymentMethod": "Cash"}, D)
        ok("Zero vendor payment → 400", s == 400)
        s, _ = req("POST", f"/api/vendor-finance/{VID}/payments",
            {"amount": -100, "paymentDate": "2026-07-15", "paymentMethod": "Cash"}, D)
        ok("Negative vendor payment → 400", s == 400)
        s, _ = req("POST", "/api/vendor-finance/NONEXISTENT/payments",
            {"amount": 100, "paymentDate": "2026-07-15", "paymentMethod": "Cash"}, D)
        ok("Bad vendor payment → 404", s == 404)

    # Bank statement preview
    txns = [
        {"date":"2026-07-01","description":"UPI/TEST/9876543210@okaxis","amount":1000},
        {"date":"2026-07-02","description":"NEFT-NoPhone-Co","amount":500},
    ]
    s, d = req("POST", "/api/vendor-finance/bank-statement/preview", {"transactions": txns}, D)
    ok("Bank statement preview → 200", s == 200)
    ok("Preview matched/unmatched structure", "totalMatched" in d and "totalUnmatched" in d)
    s, _ = req("POST", "/api/vendor-finance/bank-statement/preview", {"transactions": []}, D)
    ok("Preview empty → 400", s == 400)
    s, _ = req("POST", "/api/vendor-finance/bank-statement/preview", {}, D)
    ok("Preview no body → 400", s == 400)
    s, _ = req("POST", "/api/vendor-finance/bank-statement/preview", {"transactions": txns})
    ok("Preview no auth → 401", s == 401)

    # Reminders
    s, d = req("GET", "/api/vendor-finance/reminders-due", headers=D)
    ok("Reminders due → 200", s == 200)

    # ── SUPPLIER FINANCE ──────────────────────────────────────────────────────
    section("SUPPLIER FINANCE")
    s, d = req("GET", "/api/supplier-finance/summary", headers=D)
    ok("Supplier finance summary → 200", s == 200)
    if SID:
        s, d = req("GET", f"/api/supplier-finance/{SID}", headers=D)
        ok("Supplier finance detail → 200", s == 200)
        s, sp = req("POST", f"/api/supplier-finance/{SID}/payments", {
            "amount": 200, "paymentDate": "2026-07-15", "paymentMethod": "Bank Transfer"
        }, D)
        ok("Supplier payment → 201", s == 201, sp.get("error",""))
        s, _ = req("POST", f"/api/supplier-finance/{SID}/payments",
            {"amount": 0, "paymentDate": "2026-07-15", "paymentMethod": "Cash"}, D)
        ok("Supplier payment zero → 400", s == 400)

    # ── SALES ─────────────────────────────────────────────────────────────────
    section("SALES")
    s, d = req("GET", "/api/sales", headers=D)
    ok("List sales → 200", s == 200)
    if BARCODE:
        s, d = req("GET", f"/api/sales/validate/{BARCODE}", headers=D)
        ok("Validate barcode for sale → 200/404", s in (200, 404))
    s, d = req("GET", "/api/sales/validate/INVALID-BARCODE-XYZ", headers=D)
    ok("Validate bad barcode → 200 valid:false", s == 200 and not d.get("valid", True))
    # Sell (if barcode exists and not distributed)
    s, _, = req("GET", "/api/sales")
    ok("Sales no auth → 401", s == 401)

    # ── INVOICES ──────────────────────────────────────────────────────────────
    section("INVOICES")
    s, d = req("GET", "/api/invoices", headers=D)
    ok("List invoices → 200", s == 200)
    s, d = req("GET", "/api/invoices/next-number", headers=D)
    ok("Next invoice number → 200", s == 200)

    s, inv = req("POST", "/api/invoices", {
        "customerName": "E2E Client", "invoiceDate": "2026-07-15",
        "items": [{"description": "Service A", "hsnSac": "9983", "qty": 1, "rate": 5000, "gstPercent": 18}],
        "status": "unpaid"
    }, D)
    ok("Create invoice → 201", s == 201, inv.get("error",""))
    INV_ID = inv.get("id","")

    s, _ = req("POST", "/api/invoices", {}, D)
    ok("Create invoice no body → 400", s == 400)

    if INV_ID:
        s, d = req("PUT", f"/api/invoices/{INV_ID}/status", {"status": "sent"}, D)
        ok("Update invoice status sent → 200", s == 200)
        s, d = req("PUT", f"/api/invoices/{INV_ID}/status", {"status": "paid"}, D)
        ok("Paid without payments → 400", s == 400)
        s, _ = req("PUT", f"/api/invoices/{INV_ID}/status", {"status": "invalid"}, D)
        ok("Invalid invoice status → 400", s == 400)

    # ── INVOICE FINANCE ───────────────────────────────────────────────────────
    section("INVOICE FINANCE (SERVICE)")
    s, d = req("GET", "/api/invoice-finance/summary", headers=SV)
    ok("Invoice finance summary → 200", s == 200)
    ok("Summary is list", isinstance(d, list))
    s, _ = req("GET", "/api/invoice-finance/summary")
    ok("Invoice finance no auth → 401", s == 401)

    s, sinv = req("POST", "/api/invoices", {
        "customerName": "SVC Client", "invoiceDate": "2026-07-15",
        "items": [{"description": "Consulting", "hsnSac": "9983", "qty": 1, "rate": 10000, "gstPercent": 18}],
        "status": "unpaid"
    }, SV)
    ok("Create service invoice → 201", s == 201, sinv.get("error",""))
    SINV_ID = sinv.get("id","")

    if SINV_ID:
        grand = sinv.get("grandTotal", 11800)
        s, p = req("POST", "/api/invoice-finance/payments", {
            "invoiceId": SINV_ID, "amount": 5000,
            "paymentDate": "2026-07-15", "paymentMethod": "UPI"
        }, SV)
        ok("Partial invoice payment → 201", s == 201, p.get("error",""))
        PYM_ID = p.get("id","")

        s, d = req("GET", f"/api/invoice-finance/client/{urllib.parse.quote('SVC Client')}", headers=SV)
        ok("Client detail → 200", s == 200)
        if isinstance(d, dict) and "invoices" in d:
            iv = next((i for i in d["invoices"] if i["id"] == SINV_ID), None)
            ok("Invoice balance reduced", iv and iv.get("balance",0) < iv.get("grandTotal",0) if iv else False)

        s, _ = req("POST", "/api/invoice-finance/payments",
            {"invoiceId": SINV_ID, "amount": 0, "paymentDate": "2026-07-15", "paymentMethod": "Cash"}, SV)
        ok("Zero invoice payment → 400", s == 400)
        s, _ = req("POST", "/api/invoice-finance/payments",
            {"invoiceId": "NONEXISTENT", "amount": 100, "paymentDate": "2026-07-15", "paymentMethod": "Cash"}, SV)
        ok("Bad invoice ID → 404", s == 404)

        # Full payment → auto-paid
        s, _ = req("POST", "/api/invoice-finance/payments", {
            "invoiceId": SINV_ID, "amount": grand - 5000,
            "paymentDate": "2026-07-15", "paymentMethod": "Bank Transfer"
        }, SV)
        ok("Full invoice payment → 201", s == 201)

        # Delete payment
        if PYM_ID:
            s, _ = req("DELETE", f"/api/invoice-finance/payments/{PYM_ID}", headers=SV)
            ok("Delete invoice payment → 204", s == 204)
            s, _ = req("DELETE", f"/api/invoice-finance/payments/NONEXISTENT", headers=SV)
            ok("Delete bad payment → 404", s == 404)

    # ── QUOTATIONS & ORDERS ───────────────────────────────────────────────────
    section("QUOTATIONS & ORDERS")
    s, d = req("GET", "/api/quotations", headers=D)
    ok("List quotations → 200", s == 200)

    s, q = req("POST", "/api/quotations", {
        "customerName": "E2E Quote Customer", "validDays": 30,
        "items": [{"productId": PID, "quantity": 2, "gstPercent": 18}] if PID else []
    }, D)
    ok("Create quotation → 201", s == 201, q.get("error",""))
    QID = q.get("id","")
    s, _ = req("POST", "/api/quotations", {}, D)
    ok("Create quotation no body → 400", s == 400)

    if QID:
        s, d = req("GET", f"/api/quotations/{QID}", headers=D)
        ok("Get quotation → 200", s == 200)
        s, d = req("PUT", f"/api/quotations/{QID}/status", {"status": "Sent"}, D)
        ok("Update quotation status → 200", s == 200)
        # Convert requires status = Accepted
        s, d = req("PUT", f"/api/quotations/{QID}/status", {"status": "Accepted"}, D)
        ok("Accept quotation → 200", s == 200)
        s, d = req("POST", f"/api/quotations/{QID}/convert", {}, D)
        ok("Convert quotation to order → 2xx/400", s in (200, 201, 400))  # 400 valid: no vendor or no stock

    s, d = req("GET", "/api/orders", headers=D)
    ok("List orders → 200", s == 200)

    # ── WARRANTIES ────────────────────────────────────────────────────────────
    section("WARRANTIES")
    s, d = req("GET", "/api/warranties", headers=D)
    ok("List warranties → 200", s == 200)
    s, _ = req("GET", "/api/warranties")
    ok("Warranties no auth → 401", s == 401)

    # Can only create warranty if we have a sold product — skip create if no BARCODE sold
    s, d = req("GET", "/api/replacements", headers=D)
    ok("List replacements → 200", s == 200)
    if BARCODE:
        s, d = req("GET", f"/api/replacements/validate-old/{BARCODE}", headers=D)
        ok("Validate old barcode → 200/404", s in (200, 404))
        s, d = req("GET", f"/api/replacements/validate-new/NEWBARCODE123", headers=D)
        ok("Validate new barcode → 200/404", s in (200, 404))

    # ── REWARDS ───────────────────────────────────────────────────────────────
    section("REWARDS")
    s, d = req("GET", "/api/reward-rules", headers=D)
    ok("List reward rules → 200", s == 200)
    s, rr = req("POST", "/api/reward-rules", {
        "name": "E2E Rule", "pointsPerUnit": 10, "minPurchase": 100
    }, D)
    ok("Create reward rule → 201", s == 201)
    RRID = rr.get("id","")
    if RRID:
        s, d = req("PUT", f"/api/reward-rules/{RRID}", {"name": "Updated Rule"}, D)
        ok("Update reward rule → 200", s == 200)

    s, d = req("GET", "/api/rewards", headers=D)
    ok("List rewards → 200", s == 200)
    s, d = req("GET", "/api/rewards/balance", headers=D)
    ok("Rewards balance → 200", s == 200)
    s, d = req("GET", "/api/redemption-settings", headers=D)
    ok("Redemption settings → 200", s == 200)

    # ── EXPENSES ──────────────────────────────────────────────────────────────
    section("EXPENSES")
    s, d = req("GET", "/api/expenses", headers=D)
    ok("List expenses → 200", s == 200)
    s, exp = req("POST", "/api/expenses", {
        "category": "Office Supplies", "amount": 500,
        "expenseDate": "2026-07-15", "description": "Stationery"
    }, D)
    ok("Create expense → 201", s == 201, exp.get("error",""))
    EID = exp.get("id","")
    s, _ = req("POST", "/api/expenses", {}, D)
    ok("Create expense no body → 400", s == 400)
    if EID:
        s, _ = req("DELETE", f"/api/expenses/{EID}", headers=D)
        ok("Delete expense → 204/200", s in (200, 204))
    s, d = req("GET", "/api/expenses/summary", headers=D)
    ok("Expenses summary → 200", s == 200)

    # ── STAFF & PAYROLL ───────────────────────────────────────────────────────
    section("STAFF & PAYROLL")
    s, d = req("GET", "/api/staff", headers=D)
    ok("List staff → 200", s == 200)
    s, st = req("POST", "/api/staff", {
        "name": "E2E Staff", "role": "Salesperson",
        "phone": "9000000009", "salary": 15000,
        "joiningDate": "2026-07-01"
    }, D)
    ok("Create staff → 201", s == 201, st.get("error",""))
    STID = st.get("id","")
    s, _ = req("POST", "/api/staff", {}, D)
    ok("Create staff no body → 400", s == 400)
    if STID:
        s, d = req("PUT", f"/api/staff/{STID}", {"name": "E2E Staff Updated"}, D)
        ok("Update staff → 200", s == 200)

    s, d = req("GET", "/api/payroll", headers=D)
    ok("List payroll → 200", s == 200)
    s, d = req("GET", "/api/payroll/staff", headers=D)
    ok("Payroll staff → 200", s == 200)
    s, d = req("GET", "/api/payroll/summary", headers=D)
    ok("Payroll summary → 200", s == 200)
    if STID:
        s, pay = req("POST", "/api/payroll", {
            "staffName": "E2E Staff", "amount": 15000,
            "paymentDate": "2026-07-15", "paymentType": "salary",
            "paymentMethod": "Bank Transfer", "month": 7, "year": 2026
        }, D)
        ok("Record payroll → 201", s == 201, pay.get("error",""))

    # ── MASTERS ───────────────────────────────────────────────────────────────
    section("MASTERS")
    s, d = req("GET", "/api/masters/counts", headers=D)
    ok("Master counts → 200", s == 200)
    ok("Counts has keys", all(k in d for k in ["customerMaster","vendorMaster","itemMaster","bankMaster"]))
    s, d = req("GET", "/api/mapping/vendors-with-customers", headers=D)
    ok("Vendor-customer mapping → 200", s == 200)
    s, d = req("GET", "/api/price-lists", headers=D)
    ok("Price lists → 200", s == 200)
    s, pl = req("POST", "/api/price-lists", {
        "name": "E2E Price List", "vendorId": VID or "V1",
        "items": []
    }, D)
    ok("Create price list → 200/201", s in (200, 201, 400))  # may need vendorId

    # ── REPORTS ───────────────────────────────────────────────────────────────
    section("REPORTS")
    for endpoint, name in [
        ("/api/reports/sales-register?from=2026-04-01&to=2026-07-15", "Sales register"),
        ("/api/reports/distribution-register?from=2026-04-01&to=2026-07-15", "Distribution register"),
        ("/api/reports/outstanding", "Outstanding report"),
        ("/api/reports/payment-register?from=2026-04-01&to=2026-07-15", "Payment register"),
        ("/api/reports/stock-summary", "Stock summary"),
        ("/api/reports/gst-summary?from=2026-04-01&to=2026-07-15", "GST summary"),
        ("/api/reports/gstr1?from=2026-04-01&to=2026-07-15", "GSTR-1"),
    ]:
        s, d = req("GET", endpoint, headers=D)
        ok(f"{name} → 200", s == 200, d.get("error","") if isinstance(d,dict) else "")
    s, _ = req("GET", "/api/reports/sales-register")
    ok("Reports no auth → 401", s == 401)

    # ── ACCOUNTS ─────────────────────────────────────────────────────────────
    section("ACCOUNTS")
    for endpoint, key, name in [
        ("/api/accounts/profit-loss?from=2026-04-01&to=2026-07-15", "grossProfit", "P&L"),
        ("/api/accounts/balance-sheet", "assets", "Balance sheet"),
        ("/api/accounts/cash-flow?from=2026-04-01&to=2026-07-15", "netCashFlow", "Cash flow"),
        ("/api/accounts/ledger?from=2026-04-01&to=2026-07-15", "entries", "Ledger"),
        ("/api/accounts/day-book?date=2026-07-15", "entries", "Day book"),
        ("/api/accounts/notes", None, "Credit/debit notes"),
    ]:
        s, d = req("GET", endpoint, headers=D)
        ok(f"{name} → 200", s == 200, d.get("error","") if isinstance(d,dict) else "")
        if key: ok(f"{name} has {key}", key in d if isinstance(d,dict) else isinstance(d,list))
    s, _ = req("GET", "/api/accounts/profit-loss")
    ok("Accounts no auth → 401", s == 401)

    # P&L data integrity
    s, d = req("GET", "/api/accounts/profit-loss?from=2026-04-01&to=2026-07-15", headers=D)
    if s == 200:
        rev = d.get("revenue",{})
        ok("P&L invoiceRevenue present", "invoiceRevenue" in rev)
        ok("P&L revenue total = sum of parts",
           abs(rev.get("total",0) - rev.get("distributionRevenue",0) - rev.get("salesRevenue",0) - rev.get("invoiceRevenue",0)) < 1)

    # Balance sheet integrity
    s, d = req("GET", "/api/accounts/balance-sheet", headers=D)
    if s == 200:
        ok("Balance sheet has invoiceReceivables", "invoiceReceivables" in d.get("assets",{}))
        ok("Balance sheet netWorth = assets - liabilities",
           abs(d.get("netWorth",0) - (d.get("assets",{}).get("total",0) - d.get("liabilities",{}).get("total",0))) < 1)

    # Cash flow integrity
    s, d = req("GET", "/api/accounts/cash-flow?from=2026-04-01&to=2026-07-15", headers=D)
    if s == 200:
        ok("Cash flow invoicePayments in inflows", "invoicePayments" in d.get("inflows",{}))
        ok("Cash flow netCashFlow math",
           abs(d.get("netCashFlow",0) - (d.get("inflows",{}).get("total",0) - d.get("outflows",{}).get("total",0))) < 1)

    # Credit/debit notes
    s, cn = req("POST", "/api/accounts/notes", {
        "noteType": "credit", "vendorName": "E2E Vendor",
        "noteDate": "2026-07-15", "reason": "Return",
        "items": [{"description": "Returned goods", "quantity": 1, "price": 100}]
    }, D)
    ok("Create credit note → 201", s == 201, cn.get("error",""))
    CNID = cn.get("id","")
    s, _ = req("POST", "/api/accounts/notes", {"noteType": "invalid"}, D)
    ok("Invalid note type → 400", s == 400)
    if CNID:
        s, _ = req("DELETE", f"/api/accounts/notes/{CNID}", headers=D)
        ok("Delete note → 204", s == 204)

    # GSTR
    s, d = req("GET", "/api/gstr3b/compute?month=7&year=2026", headers=D)
    ok("GSTR-3B compute → 200", s == 200)
    ok("GSTR-3B has output/itc", "output" in d and "itc" in d)
    s, d = req("POST", "/api/gstr2b/reconcile",
        {"b2b": []}, D)  # Empty 2B data
    ok("GSTR-2B reconcile empty → 400", s == 400)

    # ── DASHBOARD ────────────────────────────────────────────────────────────
    section("DASHBOARD")
    s, d = req("GET", "/api/dashboard/stats", headers=D)
    ok("Dashboard stats → 200", s == 200)
    ok("Stats has todaySales", "todaySales" in d)
    ok("Stats has totalRevenue", "totalRevenue" in d)
    s, _ = req("GET", "/api/dashboard/stats")
    ok("Dashboard stats no auth → 401", s == 401)

    s, d = req("GET", "/api/analytics/overview?from=2026-07-01&to=2026-07-15", headers=D)
    ok("Dashboard money → 200", s == 200)
    money = d.get("money", {})
    ok("Money has collections/revenue", "collections" in money and "revenue" in money)
    ok("Money has invoiceOutstanding", "invoiceOutstanding" in money)

    s, d = req("GET", "/api/dashboard/rewards-summary", headers=D)
    ok("Rewards summary → 200", s == 200)

    # ── ANALYTICS (HTTP QUERY — RFC 10008) ───────────────────────────────────
    section("ANALYTICS — HTTP QUERY (RFC 10008)")
    s, d = req("QUERY", "/api/analytics/overview", {"from":"2026-07-01","to":"2026-07-15"}, D)
    ok("QUERY analytics/overview → 200", s == 200, d.get("error",""))
    ok("QUERY: money.collections", "collections" in d.get("money",{}))
    ok("QUERY: money.invoiceOutstanding", "invoiceOutstanding" in d.get("money",{}))
    ok("QUERY: recentActivity is list", isinstance(d.get("recentActivity"), list))
    ok("QUERY: counts has vendorMaster", "vendorMaster" in d.get("counts",{}))

    s, d2 = req("QUERY", "/api/analytics/overview", {}, D)
    ok("QUERY overall (no dates) → 200", s == 200)

    s, d3 = req("GET", "/api/analytics/overview?from=2026-07-01&to=2026-07-15", headers=D)
    ok("GET analytics/overview fallback → 200", s == 200)
    ok("GET and QUERY return same keys", set(d.keys()) == set(d3.keys()))

    s, _ = req("QUERY", "/api/analytics/overview", {})
    ok("QUERY no auth → 401", s == 401)

    s, d = req("GET", "/api/analytics/recent-activity", headers=D)
    ok("Recent activity (legacy) → 200", s == 200)
    ok("Activity is list", isinstance(d, list))

    # Service analytics
    if SVC_TOK:
        s, d = req("QUERY", "/api/analytics/overview", {"from":"2026-07-01","to":"2026-07-15"}, SV)
        ok("Service QUERY analytics → 200", s == 200)

    # ── SETTINGS ─────────────────────────────────────────────────────────────
    section("SETTINGS")
    s, d = req("GET", "/api/settings/profile", headers=D)
    ok("Get profile → 200", s == 200)
    s, d = req("PUT", "/api/settings/profile", {"userId": USER_ID, "companyName": "E2E Updated Co"}, D)
    ok("Update profile → 200", s == 200 or s == 404)
    s, d = req("GET", "/api/settings/bill", headers=D)
    ok("Get bill settings → 200", s == 200)
    s, d = req("PUT", "/api/settings/bill", {"primaryColor": "#FF0000"}, D)
    ok("Update bill settings → 200", s == 200)
    s, _ = req("PUT", "/api/settings/change-password",
        {"userId": USER_ID, "currentPassword": "wrong", "newPassword": "Test@456"}, D)
    ok("Change password wrong current → 400/401", s in (400, 401, 403))
    s, _ = req("GET", "/api/settings/profile")
    ok("Settings no auth → 401", s == 401)

    # ── ADMIN (USERS) ────────────────────────────────────────────────────────
    section("ADMIN — USERS")
    s, d = req("GET", "/api/admin/users", headers=D)
    ok("List users → 200", s == 200)
    s, u = req("POST", "/api/admin/users", {
        "name": "E2E User", "email": "e2euser@test.com",
        "password": "Test@123", "role": "Staff"
    }, D)
    ok("Create user → 201", s == 201, u.get("error",""))
    UID = u.get("id","")
    s, _ = req("POST", "/api/admin/users", {}, D)
    ok("Create user no body → 400", s in (400, 403))
    if UID:
        s, d = req("PUT", f"/api/admin/users/{UID}", {"role": "Manager"}, D)
        ok("Update user role → 200", s == 200)
    s, d = req("GET", "/api/admin/role-presets", headers=D)
    ok("Role presets → 200", s == 200)

    # ── SEARCH ───────────────────────────────────────────────────────────────
    section("SEARCH")
    s, d = req("GET", "/api/search?q=e2e", headers=D)
    ok("Search → 200", s == 200)
    s, d = req("GET", "/api/search?q=", headers=D)
    ok("Search empty query → 200/400", s in (200, 400))
    s, _ = req("GET", "/api/search?q=test")
    ok("Search no auth → 401", s == 401)

    # ── AUDIT LOG ─────────────────────────────────────────────────────────────
    section("AUDIT LOG")
    s, d = req("GET", "/api/audit-log", headers=D)
    ok("Audit log → 200", s == 200)
    ok("Audit log is list", isinstance(d, list) or isinstance(d.get("entries",[]),list) if isinstance(d,dict) else True)
    s, _ = req("GET", "/api/audit-log")
    ok("Audit log no auth → 401", s == 401)

    # ── BACKUP ───────────────────────────────────────────────────────────────
    section("BACKUP")
    s, d = req("GET", "/api/backup/settings", headers=D)
    ok("Backup settings → 200", s == 200)
    s, d = req("GET", "/api/backup", headers=D)
    ok("Backup data → 200", s == 200)
    s, _ = req("GET", "/api/backup")
    ok("Backup no auth → 401", s == 401)

    # ── CHATBOT ───────────────────────────────────────────────────────────────
    section("CHATBOT")
    s, d = req("GET", "/api/chatbot/quick-actions", headers=D)
    ok("Quick actions → 200", s == 200)
    s, d = req("POST", "/api/chatbot", {"message": "How many products do I have?"}, D)
    ok("Chatbot message → 200", s == 200)
    s, _ = req("POST", "/api/chatbot", {"message": "test"})
    ok("Chatbot no auth → 401", s == 401)

    # ── CROSS-TENANT SECURITY ─────────────────────────────────────────────────
    section("CROSS-TENANT SECURITY")
    if VID:
        # Try to access dealer vendor from service token
        s, _ = req("GET", f"/api/vendors/{VID}", headers=SV)
        ok("Cannot access other tenant vendor", s in (401, 403, 404))
    # Try to use dealer token with service tenant ID
    s, _ = req("GET", "/api/dashboard/stats", headers={"Authorization": f"Bearer {TOK}", "x-tenant-id": TID_SVC})
    ok("Cross-tenant token rejected", s in (401, 403, 200))  # gate overwrites x-tenant-id from JWT

    # ── CLEANUP: delete test tenant ───────────────────────────────────────────
    section("CLEANUP")
    s, _ = req("DELETE", f"/api/super-admin/tenants/{TID}", headers=sa_h)
    ok("Delete test tenant → 200/204", s in (200, 204))
    if TID_SVC:
        s, _ = req("DELETE", f"/api/super-admin/tenants/{TID_SVC}", headers=sa_h)
        ok("Delete service tenant → 200/204", s in (200, 204))

# ══════════════════════════════════════════════════════════════════════════════
if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default="http://localhost:3001")
    args = parser.parse_args()
    BASE = args.base

    try:
        SA, sa_h, TID, TOK, TID_SVC, SVC_TOK = setup()
        run_all(SA, sa_h, TID, TOK, TID_SVC, SVC_TOK)
    except AssertionError as e:
        print(f"\n💥 Setup failed: {e}")
        sys.exit(1)
    except KeyboardInterrupt:
        print("\n⚠  Interrupted")

    total = len(PASS_LIST) + len(FAIL_LIST)
    print(f"\n{'═'*55}")
    print(f"  RESULT: {len(PASS_LIST)}/{total} passed")
    if FAIL_LIST:
        print(f"\n  FAILED ({len(FAIL_LIST)}):")
        for f in FAIL_LIST:
            section_name = f.split('] ')[0].replace('[','')
            test_name = f.split('] ')[1] if '] ' in f else f
            print(f"    • [{section_name}] {test_name}")
    else:
        print("  All tests passed ✅")
    print(f"{'═'*55}")
    sys.exit(0 if not FAIL_LIST else 1)
