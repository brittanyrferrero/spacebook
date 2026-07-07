# Admin guide

## Getting started

### Creating a workspace

Navigate to `/generate` and click **Create workspace**. You will be redirected to `/admin-enter/[slug]/[token]` — enter your email address to claim the workspace. The first person to claim it becomes the **super admin**.

After claiming, you are taken to the admin panel at `/[slug]/admin`.

### Sharing the workspace with your team

Share the workspace URL — `https://your-app.com/[slug]` — with your team. Anyone who navigates to that URL can enter the workspace and make bookings. There is no sign-up; the URL is the credential.

### The admin password

The admin password is set server-side (`ADMIN_PASSWORD` environment variable) and is the same across all workspaces on the deployment. Keep it secret. When visiting `/[slug]/admin`, you are prompted for this password. Successful entry gives you a 7-day admin cookie.

---

## Security: the workspace URL is your access credential

The workspace URL — the slug — is how access is controlled. Anyone who knows the slug can enter the workspace. There are no per-user passwords.

To revoke access for a former team member or if the URL was shared too widely, **rename the workspace URL** (Settings → Rename workspace URL). All existing session cookies are immediately invalidated; every user will need to re-enter the new URL.

Renaming the URL is disruptive — everyone on the team needs the new link and every kiosk tablet needs to be reconfigured. Only do it when necessary.

---

## Admin panel navigation

The admin panel has five sections, accessible from the sidebar:

- **Overview** — analytics and utilisation stats
- **Bookings** — view, cancel, and export bookings
- **Rooms** — manage rooms and Google Calendar connections
- **Members** — manage the member list
- **Settings** — workspace configuration

---

## Rooms

### Adding a room

In the Rooms tab, click **+ Add room**. Fill in:

- **Name** — the room's display name (e.g. "Lovelace")
- **Room type** — optional category (e.g. Meeting Room, Boardroom); types are managed from the panel above the room list
- **Capacity** — maximum number of people
- **Amenities** — tick available amenities; the amenity list is managed from the panel above the room list

### Editing a room

Click **Edit** next to any room. Name, type, capacity, and amenities can be changed at any time.

### Reordering rooms

Drag rooms using the dot-grid handle on the left. The displayed order on the booking page reflects this order.

### Disabling a room

Toggle the switch on the right side of a room row. Disabled rooms are hidden from the booking view (desktop and tablet) but all of their data — past and future bookings — is retained untouched. Re-enabling is instant and reverses this completely.

If the room is connected to Google Calendar, that connection is deliberately left alone while disabled — see [ADR-015](decisions/015-disable-room-leaves-gcal-connected.md) for why. In practice this means: no new booking can be made against the room through Spacebook (whether from the booking page, directly via the API, or via an event created on its linked Google Calendar), but the Google Calendar itself keeps working normally and isn't disconnected. Re-enabling never requires reconnecting Google Calendar.

### Deleting a room

Click **Delete**. This is a **permanent, hard delete** — the room and all of its bookings are removed from the database (bookings and recurring series reference their room and are deleted along with it). There is no recovery. If you might want to bring the room back later, disable it instead.

### Room types and amenities

Room types and amenities are workspace-wide lists used when creating or editing rooms. Add or remove options using the panels at the top of the Rooms tab. Deleting a type or amenity removes it from the lists but does not retroactively change existing rooms.

### Connecting Google Calendar

Each room can be linked to a Google Calendar to enable two-way sync.

1. Click **+ GCal** next to the room
2. Complete the Google OAuth flow — you will be asked to sign in to a Google account that has access to the calendar you want to link
3. After authorising, choose the specific calendar from the list
4. The room now shows **✓ GCal** when connected

Once connected, bookings made in Spacebook are written to the calendar, and events added externally to that calendar are checked against existing Spacebook bookings. Conflicts are rejected — Spacebook is always the source of truth — and the organiser of the conflicting external event is emailed.

GCal push notifications renew automatically via a daily cron job. If the app URL changes, all GCal connections must be disconnected and reconnected.

To disconnect: click **✓ GCal** and confirm.

---

## Members

Members are the people in your workspace. Adding someone to the member list enables name autocomplete on the booking form and tracks their booking history.

### Adding a member

In the Members tab, fill in a name and email in the form at the top and click **+ Add member**.

### Batch import

Click **Batch add** to paste multiple members at once. Paste one member per line, with name and email separated by a tab or a comma. You can also paste a plain email address — the username part will be used as the name. Duplicates are silently skipped.

Example format:
```
Alice Smith    alice@example.com
Bob Jones      bob@example.com
```

### Editing and removing members

Click **Edit** next to a member to change their name or email inline. Click **Remove** to delete them from the workspace. Bulk removal is available by selecting members with the checkboxes.

### Admin roles

Members can be assigned roles by a super admin:

| Role | Capabilities |
|---|---|
| **User** | Can make bookings |
| **Admin** | Can manage rooms, bookings, and settings |
| **Super admin** | All admin capabilities, plus adding and removing other admins |

Role assignment is done inline in the Members table — super admins see a role dropdown next to each member.

### Limits

Trial workspaces have a member limit (default: 3). The trial banner in the admin panel shows current usage against the limit. Contact your Spacebook administrator to increase or remove limits.

---

## Bookings

### Viewing bookings

The Bookings tab shows all bookings for the selected date range. Use the preset buttons (7 days, 30 days, this month, this quarter) or a custom range. Filter by room using the room buttons.

Bookings are sortable by room, booker name, email, purpose, and date.

### Cancelling a booking

Click **Cancel** next to a booking. For recurring bookings, you are prompted to choose scope:

- **Just this occurrence** — cancels the single instance
- **This and all future occurrences** — cancels from this date onwards
- **All occurrences in the series** — cancels the entire recurring series

Select multiple bookings with the checkboxes and use **Cancel X selected** for bulk cancellation (cancels individual occurrences only, not whole series).

### Exporting bookings

While on the Bookings tab, click **Export CSV** in the top bar. The export includes room, booker name, email, title, date, start time, and end time for all bookings in the current date range and room filter.

---

## Analytics (Overview)

The Overview tab shows booking data for the selected date range. Filter by room type or individual room using the buttons at the top.

### Metrics

| Metric | What it means |
|---|---|
| **Total bookings** | Count of non-cancelled bookings in the period |
| **Hours booked** | Sum of booking durations in hours |
| **Avg. duration** | Mean booking length in hours |
| **Utilisation** | Hours booked ÷ total available hours (active rooms × display window hours × working days) |
| **Outside display window** | Bookings that start or end outside the configured display hours. If non-zero, a suggestion to widen the display window is shown. |

### Charts

- **Booking origin** — breakdown between Desktop (web), Tablet (kiosk), and Google Calendar (external event) bookings
- **Space pressure** — how often rooms are occupied simultaneously. Shows peak concurrent usage, percentage of time at full capacity, and percentage at high demand (80%+). Only shown when there are 2+ rooms.
- **Bookings by room** — bar chart of booking count per room
- **Busiest hours** — heat bar showing which hours of day are most booked, across the data collection window
- **Busiest days** — heat bar showing which days of the week are most booked
- **Bookings by day & hour** — heatmap grid of day-of-week vs. hour-of-day

### Count weekends

By default, utilisation calculations exclude weekends. Toggle **Count weekends** in Settings to include Saturday and Sunday in the denominator.

---

## Settings

### Display hours

The calendar grid shown to bookers spans the display hours (default: 8am – 8pm). Adjusting this narrows or widens the booking interface. Display hours must span at least 2 hours.

Tip: if the Overview shows bookings outside the display window, consider widening these hours.

### Data collection window (booking hours)

A separate, wider time range that controls what hours are available for bookings (default: 6am – 10pm). Bookings can be made in this window even if they fall outside the display hours. Useful if some rooms are used outside core hours.

### Count weekends

Toggles whether Saturday and Sunday are included in utilisation calculations. Off by default.

### Booking visibility

Controls what information other users can see about existing bookings in the calendar:

- **Show booking title** — displays the meeting title to all users
- **Show organiser name** — displays the booker's name
- **Allow editing others' bookings** — lets any signed-in user edit or cancel bookings they didn't create

### Workspace name

A display name shown in the admin panel header. Does not affect the URL. Leave blank to show the slug instead.

### Rename workspace URL

Changes the workspace slug (the URL path). This is a destructive operation:

- All existing session cookies are immediately invalidated
- All users must re-enter the workspace using the new URL
- Bookmarks and links to the old URL stop working
- Kiosk tablets need to be reconfigured with the new tablet URL

Use this to revoke broad access or increase security. The slug must be 3–50 characters, lowercase letters, numbers, and hyphens only.

### Admin password

The admin password is set globally via the `ADMIN_PASSWORD` environment variable in Vercel. It is not configurable per workspace from the admin panel.

---

## Trial limits and upgrading

New workspaces start on a trial tier with these limits:

| Resource | Trial limit |
|---|---|
| Rooms | 10 |
| Members | 3 |
| Bookings (lifetime total) | 50 |

A yellow banner at the top of the admin panel shows current usage against limits when on a trial plan.

To upgrade or change limits, contact your Spacebook administrator (the person who manages the Palantir super-admin panel). There is no self-serve upgrade flow — limits are adjusted manually via Palantir.

---

## Tablet kiosk setup

Each room can have a dedicated kiosk URL for a tablet mounted outside the room. The tablet shows that room's live availability and allows bookings.

### Getting the tablet URL

1. Go to the Rooms tab in the admin panel
2. Find the room — if it has a tablet token, a **Tablet URL** button appears on the right
3. Click **Tablet URL** to copy the URL to your clipboard

The URL format is:
```
https://your-app.com/api/[workspace]/t/[token]
```

### Setting up the tablet

1. Open the copied URL in the tablet's browser
2. The browser is automatically signed in with a long-lived (10-year) session cookie and redirected to the room's kiosk view
3. Add the page to the home screen or set it as the browser's home page for a kiosk-style setup

The tablet session cookie never expires and does not require re-entry of the workspace URL. If the workspace URL is renamed, the tablet must be reconfigured by opening the new tablet URL again.
