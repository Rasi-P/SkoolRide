#!/usr/bin/env python3
"""Reproducible end-to-end demo of SchoolBus Pro against a running, seeded backend.

Usage:  python scripts/demo_workflow.py [--base http://localhost:8001]
Exercises the 17-step workflow from docs/DEMO_WORKFLOW.md through the REST API and prints each step's outcome.
It needs: `python manage.py seed_demo_data` run beforehand and DEMO_MODE=True (for the GPS simulator and mock payments).
Standard library only; exits non-zero if any step fails.
"""
from __future__ import annotations

import argparse
import http.cookiejar
import json
import sys
import time
import urllib.error
import urllib.request

PASSWORD = "Demo@12345"


class Api:
    def __init__(self, base: str):
        self.base = base.rstrip("/")
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        with self.opener.open(self.base + "/api/auth/csrf/") as response:
            self.csrf = json.load(response)["csrfToken"]

    def call(self, method, path, token=None, data=None, school=None):
        req = urllib.request.Request(self.base + path, method=method)
        req.add_header("Content-Type", "application/json")
        req.add_header("X-CSRFToken", self.csrf)
        if token:
            req.add_header("Authorization", f"Bearer {token}")
        if school:
            req.add_header("X-School-Id", school)
        body = json.dumps(data).encode() if data is not None else None
        try:
            with self.opener.open(req, body, timeout=30) as r:
                txt = r.read().decode()
                try:
                    return r.status, json.loads(txt) if txt else None
                except ValueError:
                    return r.status, txt
        except urllib.error.HTTPError as e:
            txt = e.read().decode()
            try:
                return e.code, json.loads(txt)
            except ValueError:
                return e.code, txt[:300]

    def login(self, email):
        st, d = self.call("POST", "/api/auth/login/", data={"email": email, "password": PASSWORD})
        if st != 200:
            raise SystemExit(f"Login failed for {email}: {st} {d}")
        return d["access"], d["user"]


def step(n, title):
    print(f"\n[{n:>2}] {title}")


def ok(msg):
    print(f"      ok  {msg}")


def expect(cond, msg):
    if not cond:
        print(f"      FAIL {msg}")
        raise SystemExit(1)
    ok(msg)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default="http://localhost:8001")
    args = parser.parse_args()
    api = Api(args.base)
    stamp = int(time.time()) % 100000

    step(1, "Log in as Super Admin")
    sa, _ = api.login("superadmin@schoolbuspro.demo")
    ok("superadmin@schoolbuspro.demo")

    step(2, "Review and approve a pending school application")
    st, apps_ = api.call("GET", "/api/platform/applications/?status=PENDING", sa)
    if apps_["count"] == 0:
        st, created = api.call("POST", "/api/public/register-school/", data={
            "school_name": f"Demo Academy {stamp}", "contact_name": "Demo Principal", "contact_email": f"principal{stamp}@demo-academy.test",
            "contact_phone": "+91 99999 00000", "address": "1 Demo Street", "city": "Mysuru", "estimated_students": 120, "estimated_vehicles": 2})
        expect(st == 201, f"submitted a fresh application {created['tracking_code']}")
        st, apps_ = api.call("GET", "/api/platform/applications/?status=PENDING", sa)
    app = apps_["results"][0]
    api.call("POST", f"/api/platform/applications/{app['id']}/review/", sa)
    st, d = api.call("POST", f"/api/platform/applications/{app['id']}/approve/", sa, {"notes": "Approved in demo"})
    expect(st == 201, f"approved '{app['school_name']}' -> school {d['school']['id']}")

    step(3, "Provision the school's admin account (accept invitation)")
    token = d["invitation"]["accept_url"].rsplit("/", 1)[-1]
    st, acc = api.call("POST", "/api/auth/invitations/accept/", data={"token": token, "password": "NewAdmin@12345", "first_name": "Demo", "last_name": "Admin"})
    expect(st == 200, f"admin account created for {acc['user']['email']}; school is {acc['user']['memberships'][0]['school_status']}")
    new_admin = acc["access"]
    st, onboarding = api.call("GET", "/api/school/onboarding/", new_admin)
    ok(f"onboarding checklist: {onboarding['completed_steps']}/{onboarding['total_steps']} steps done")

    step(4, "Log in as School Admin (Greenfield)")
    ga, gu = api.login("admin@greenfield.demo")
    gschool = gu["memberships"][0]["school_id"]
    ok("admin@greenfield.demo")

    step(5, "Add a vehicle, driver, attendant, route with stops, student and parent")
    st, vehicle = api.call("POST", "/api/fleet/vehicles/", ga, {"registration_number": f"KA99DEMO{stamp % 10000:04d}", "fleet_number": "9", "capacity": 20, "vehicle_type": "MINI_BUS"})
    expect(st == 201, f"vehicle {vehicle['registration_number']}")
    st, driver = api.call("POST", "/api/people/staff/", ga, {"staff_type": "DRIVER", "employee_id": f"GF-DRV-{stamp}", "first_name": "Demo", "last_name": "Driver", "phone": "+91 90000 00001",
                                                          "licence_number": "KA05 DEMO", "licence_expiry": "2030-01-01", "email": f"demo.driver{stamp}@greenfield.demo"})
    expect(st == 201, f"driver {driver['full_name']}")
    st, attendant = api.call("POST", "/api/people/staff/", ga, {"staff_type": "ATTENDANT", "employee_id": f"GF-ATT-{stamp}", "first_name": "Demo", "last_name": "Attendant", "phone": "+91 90000 00002"})
    expect(st == 201, f"attendant {attendant['full_name']}")
    st, a1 = api.call("POST", f"/api/fleet/vehicles/{vehicle['id']}/assign-staff/", ga, {"staff": driver["id"], "role": "DRIVER"})
    expect(st == 201, "driver assigned to vehicle")
    st, route = api.call("POST", "/api/routing/routes/", ga, {"name": f"Demo Loop {stamp}", "code": f"D{stamp % 1000}", "vehicle": vehicle["id"], "driver": driver["id"], "attendant": attendant["id"]})
    expect(st == 201, f"route {route['code']}")
    stops = [
        {"name": "Hope Farm Junction", "latitude": "12.985500", "longitude": "77.758800", "planned_pickup_time": "07:00:00", "planned_dropoff_time": "16:00:00", "wait_minutes": 2},
        {"name": "ITPL Main Gate", "latitude": "12.987000", "longitude": "77.736000", "planned_pickup_time": "07:12:00", "planned_dropoff_time": "15:50:00", "wait_minutes": 2},
        {"name": "Greenfield International School", "latitude": "12.969800", "longitude": "77.750000", "planned_pickup_time": "07:30:00", "planned_dropoff_time": "15:30:00", "is_school_stop": True},
    ]
    st, stops = api.call("PUT", f"/api/routing/routes/{route['id']}/stops/", ga, stops)
    expect(st == 200 and len(stops) == 3, "3 ordered stops saved")
    st, student = api.call("POST", "/api/people/students/", ga, {"admission_number": f"GF-DEMO-{stamp}", "first_name": "Demo", "last_name": "Student", "grade": "4", "section": "A"})
    expect(st == 201, f"student {student['full_name']}")
    st, parent = api.call("POST", "/api/people/parents/", ga, {"first_name": "Demo", "last_name": "Parent", "email": f"demo.parent{stamp}@parent.demo", "phone": "+91 90000 00003"})
    expect(st == 201, f"parent {parent['full_name']}")
    st, link = api.call("POST", "/api/people/guardian-links/", ga, {"parent": parent["id"], "student": student["id"], "relationship": "MOTHER", "is_primary": True})
    expect(st == 201, "guardian linked to student")
    st, inv = api.call("POST", f"/api/people/parents/{parent['id']}/invite/", ga)
    expect(st == 201, "parent invited")
    st, pacc = api.call("POST", "/api/auth/invitations/accept/", data={"token": inv["accept_url"].rsplit("/", 1)[-1], "password": "Parent@12345"})
    expect(st == 200, "parent accepted invitation (account active)")
    parent_token = pacc["access"]

    step(6, "Assign the student to the route and pickup stop")
    # Second stop: the simulated bus starts at the first stop, so the ETA/arrival alert path is exercised.
    st, assignment = api.call("POST", "/api/routing/assignments/", ga, {"student": student["id"], "route": route["id"], "pickup_stop": stops[1]["id"], "dropoff_stop": stops[1]["id"]})
    expect(st == 201, f"assigned to {assignment['route_code']} at {assignment['pickup_stop_name']}")

    step(7, "Create a scheduled trip with the vehicle and driver")
    st, home = api.call("GET", "/api/school/dashboard/", ga)
    today = home["date"]
    st, trip = api.call("POST", "/api/trips/trips/", ga, {"route": route["id"], "direction": "PICKUP", "scheduled_date": today, "scheduled_start_time": "07:00:00", "vehicle": vehicle["id"], "driver": driver["id"]})
    expect(st == 201 and trip["expected_students"] == 1, f"trip {trip['id']} scheduled with 1 expected student")

    step(8, "Log in as the driver and start the trip")
    st, dinv = api.call("POST", f"/api/people/staff/{driver['id']}/invite/", ga, {})
    expect(st == 201, "driver invited")
    st, dacc = api.call("POST", "/api/auth/invitations/accept/", data={"token": dinv["accept_url"].rsplit("/", 1)[-1], "password": "Driver@12345"})
    expect(st == 200, "driver account active")
    dt = dacc["access"]
    st, started = api.call("POST", f"/api/driver/trips/{trip['id']}/start/", dt)
    expect(st == 200 and started["status"] == "IN_PROGRESS", "trip started by its driver")
    other_token, _ = api.login("driver2@greenfield.demo")
    st, denied = api.call("POST", f"/api/driver/trips/{trip['id']}/end/", other_token)
    expect(st == 404, "another driver cannot modify this trip (404)")

    step(9, "Feed GPS: real device sample + development simulator")
    st, loc = api.call("POST", f"/api/driver/trips/{trip['id']}/location/", dt, {"latitude": 12.9990, "longitude": 77.7700, "accuracy_m": 9, "speed_mps": 7})
    expect(st == 202, "driver location accepted (validated)")
    st, bad = api.call("POST", f"/api/driver/trips/{trip['id']}/location/", dt, {"latitude": 12.9990, "longitude": 77.7700, "accuracy_m": 900})
    expect(st == 400, "poor-accuracy sample rejected")
    st, sim = api.call("POST", f"/api/demo/simulations/{trip['id']}/", ga, {"action": "start", "speed_mps": 10, "auto_board": False})
    expect(st == 200 and sim["simulated"], f"simulator running: '{sim['label']}'")
    for _ in range(3):
        api.call("POST", f"/api/demo/simulations/{trip['id']}/", ga, {"action": "tick"})
        time.sleep(1)

    step(10, "Log in as the parent and view the bus on the map")
    st, live = api.call("GET", f"/api/parent/children/{student['id']}/live/", parent_token)
    expect(st == 200 and live["location"] is not None and live["location"]["is_simulated"], f"bus at {live['location']['latitude']:.5f},{live['location']['longitude']:.5f} (simulated feed)")

    step(11, "Verify the ETA to the student's assigned stop")
    eta = live["eta"]
    expect(eta is not None, f"ETA to {live['trip_student']['stop']['name']}: {eta['minutes'] if eta else '?'} min ({int((eta or {}).get('distance_m') or 0)} m)")

    step(12, "Trigger and verify the ten-minute notification")
    st, n = api.call("GET", "/api/notifications/mine/?category=ARRIVAL_SOON", parent_token)
    expect(st == 200 and n["count"] >= 1, f"ARRIVAL_SOON notification: '{n['results'][0]['body']}'")
    for _ in range(2):
        api.call("POST", f"/api/demo/simulations/{trip['id']}/", ga, {"action": "tick"})
    st, n2 = api.call("GET", "/api/notifications/mine/?category=ARRIVAL_SOON", parent_token)
    expect(n2["count"] == n["count"], "no duplicate arrival alerts after further GPS updates")
    api.call("POST", f"/api/demo/simulations/{trip['id']}/", ga, {"action": "stop"})

    step(13, "Mark the student boarded and verify the parent notification")
    st, detail = api.call("GET", f"/api/driver/trips/{trip['id']}/", dt)
    ts = detail["students"][0]
    st, boarded = api.call("POST", f"/api/driver/trips/{trip['id']}/students/{ts['id']}/board/", dt, {})
    expect(st == 200 and boarded["status"] == "BOARDED", "student boarded")
    st, n = api.call("GET", "/api/notifications/mine/?category=BOARDED", parent_token)
    expect(n["count"] == 1, f"parent notified: '{n['results'][0]['title']}'")

    step(14, "Complete the trip and record the drop-off")
    st, ended = api.call("POST", f"/api/driver/trips/{trip['id']}/end/", dt)
    expect(st == 200 and ended["status"] == "COMPLETED" and ended["dropped_count"] == 1, "trip completed; boarded student dropped at school")
    st, events = api.call("GET", f"/api/trips/boarding-events/?trip={trip['id']}", ga)
    expect({e["event_type"] for e in events["results"]} >= {"BOARDED", "DROPPED"}, "boarding and drop-off events recorded")

    step(15, "Generate a transport invoice and record a demo payment")
    st, plans = api.call("GET", "/api/billing/fee-plans/", ga)
    plan = plans["results"][0]
    st, fa = api.call("POST", "/api/billing/fee-assignments/", ga, {"student": student["id"], "fee_plan": plan["id"]})
    expect(st == 201, f"fee plan '{plan['name']}' assigned")
    st, gen = api.call("POST", "/api/billing/invoices/generate/", ga, {"anchor_date": today, "students": [student["id"]]})
    expect(st == 201 and gen["created"] == 1, f"invoice {gen['invoices'][0]['invoice_number']} total {gen['invoices'][0]['total']}")
    invoice = gen["invoices"][0]
    st, pay = api.call("POST", "/api/billing/payments/record/", ga, {"student": student["id"], "invoice": invoice["id"], "amount": "500.00", "method": "CASH", "transaction_reference": f"CASH-{stamp}"})
    expect(st == 201 and pay["status"] == "VERIFIED", f"offline payment {pay['payment_number']} recorded, receipt {pay['receipt_number']}")
    st, order = api.call("POST", f"/api/parent/invoices/{invoice['id']}/", parent_token)
    expect(st == 201 and order["order"]["is_simulated"], "parent initiated a SIMULATED online payment for the balance")
    st, chk = api.call("POST", "/api/billing/mock-gateway/checkout/", parent_token, {"order_id": order["order"]["order_id"], "amount": order["order"]["amount"]})
    st, verified = api.call("POST", "/api/parent/payments/verify/", parent_token, chk)
    expect(st == 200 and verified["status"] == "VERIFIED" and verified["is_simulated"], f"gateway signature verified server-side; receipt {verified['receipt_number']}")

    step(16, "Verify the receipt and financial report")
    st, receipt = api.call("GET", f"/api/parent/receipts/{verified['receipt_id']}/", parent_token)
    expect(st == 200 and receipt["receipt_number"] == verified["receipt_number"], "parent can open the receipt")
    st, inv_detail = api.call("GET", f"/api/billing/invoices/{invoice['id']}/", ga)
    expect(inv_detail["status"] == "PAID", "invoice fully paid")
    st, fin = api.call("GET", "/api/reports/finance/", ga)
    expect(st == 200, f"finance report: billed {fin['billed']}, collected {fin['collected']} (simulated {fin['simulated_collected']})")

    step(17, "Attempt cross-school and unauthorized access")
    su, suu = api.login("admin@sunrise.demo")
    st, _ = api.call("GET", f"/api/fleet/vehicles/{vehicle['id']}/", su)
    expect(st == 404, "another school's admin cannot read the vehicle (404)")
    st, _ = api.call("GET", "/api/fleet/vehicles/", su, school=gschool)
    expect(st == 403, "spoofing X-School-Id is rejected (403)")
    st, _ = api.call("POST", "/api/routing/routes/", su, {"name": "X", "code": "X9", "vehicle": vehicle["id"]})
    expect(st == 400, "cross-school foreign key rejected (400)")
    ra, _ = api.login("admin@riverside.demo")
    st, _ = api.call("GET", "/api/fleet/vehicles/", ra)
    expect(st == 403, "suspended school cannot use operational APIs (403)")
    st, _ = api.call("GET", "/api/people/students/", parent_token)
    expect(st == 403, "parent cannot access admin endpoints (403)")
    st, _ = api.call("GET", "/api/school/dashboard/")
    expect(st == 401, "anonymous request rejected (401)")

    print("\nAll 17 steps completed successfully.")


if __name__ == "__main__":
    try:
        main()
    except SystemExit as e:
        sys.exit(e.code if isinstance(e.code, int) else 1)
