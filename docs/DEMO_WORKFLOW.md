# End-to-end demo walkthrough (17 steps)

All demo passwords: `Demo@12345` (development only). Frontend http://localhost:5173, API docs http://localhost:8001/api/docs/.

| # | Step | Where |
|---|------|-------|
| 1 | Log in as **Super Admin** `superadmin@schoolbuspro.demo` | /login |
| 2 | Platform → Applications → "Lakeview High School" (PENDING) → Review → **Approve** (choose a plan). | /platform/applications |
| 3 | Copy the invitation link shown (demo mode exposes it; it is also "emailed" to the backend console). Open it in a private window → set a password → you are the new **School Admin**; the school becomes ACTIVE and the onboarding checklist appears. | /invite/<token> |
| 4 | Log in as **School Admin** `admin@greenfield.demo` (the fully seeded school). | /login |
| 5 | Add a vehicle (Vehicles → New), a driver and attendant (Staff → New → Invite), a route with stops (Routes → New → stop editor: click the map), a student and a parent (Students / Parents → New → Invite). | /school/... |
| 6 | Assign the student to the route and pickup stop (Students → row → Assign transport, or Assignments → Assign). Capacity and cross-school rules are enforced. | /school/assignments |
| 7 | Create a scheduled trip (Trips → Create trip, or "Generate trips for date" from the route schedules) and assign the vehicle + driver. | /school/trips |
| 8 | Log in as the **driver** `driver1@greenfield.demo` → Today → open the trip → **Start trip** (asks for location permission). | /driver |
| 9 | Share real location from a phone on HTTPS, **or** use the clearly labelled *Development GPS simulator* on the driver trip page or the admin Live map (DEMO_MODE only). The simulator moves the bus along the route and auto-boards students at stops. | /driver/trips/<id> or /school/trips/live |
| 10 | Log in as the **parent** `parent@greenfield.demo` → Track: the bus appears on the map with the child's stop highlighted. | /parent/track |
| 11 | The header shows "Bus is N min from <stop>": the ETA is computed to the child's assigned stop, not the school. | /parent/track |
| 12 | When the ETA drops to ≤ 10 minutes (`arrival_alert_minutes`, configurable per school) the parent gets the "approximately 10 minutes away" notification once (bell, Alerts page, push if VAPID keys are set). Check Notifications → Sent history as admin to see delivery status. | /parent/notifications |
| 13 | Driver marks the student **Boarded** → parent receives "<name> boarded the bus" (simulator does this automatically at the stop). | /driver/trips/<id> |
| 14 | Driver **Ends trip** → boarded students are dropped at school, "Bus arrived at school" notification is sent, attendance appears under Attendance. | /driver, /school/attendance |
| 15 | School Admin → Invoices → **Generate invoices** (today's date) → open an invoice → **Record payment** (cash/UPI...) or, as the parent, Fees → **Pay now** through the simulated gateway. | /school/invoices, /parent/fees |
| 16 | Open the receipt (Print) and Reports → Finance for billed/collected/outstanding. Reversals keep an immutable adjustment history (Payments → Adjustments). | /school/payments, /school/reports |
| 17 | Try cross-school access: as `admin@sunrise.demo` request a Greenfield vehicle id (404), send `X-School-Id` of another school (403), log in as `admin@riverside.demo` (suspended → operational APIs 403). The automated tests in `backend/tests/test_tenancy_and_rbac.py` cover these too. | API / tests |

For a single reproducible run covering all 17 steps, start the seeded backend using the development-only `config.settings.e2e` settings, then run from the repository root:

```bash
python3 scripts/demo_workflow.py --base http://localhost:8001
```

The script creates its own fictional school, accounts, vehicle, route, student and parent. It approves and accepts an invitation, runs an assigned driver's trip, checks the parent's ETA and arrival alert, boards and drops off the student, invoices and verifies a signed mock payment and receipt, checks reports, and asserts unauthorized requests fail. It adds records; it does not reset existing data. Use a disposable demo database. Exit status is nonzero if any assertion fails.

The manual walkthrough above uses the seeded school. When creating a new student/driver/parent, log in with those newly invited accounts to see their specific assignments. A vehicle already running another seeded trip cannot start a second trip; finish the existing trip or create a separate vehicle. Mock payments and simulator controls are visibly labelled. See [TEST_RESULTS.md](TEST_RESULTS.md) for backend and browser coverage.
