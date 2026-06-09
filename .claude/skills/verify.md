# Verify — Spacebook (room-booking)

When asked to verify a change in this project:

## Step 1: Run the test suite
```
npm test
```
All tests must pass before proceeding. If any fail, investigate and fix before continuing.

## Step 2: Start the dev server
```
npm run dev
```
The app runs at http://localhost:3000. Check the relevant path for the change being verified.

## Step 3: Verify the specific change
- For tablet/room display changes: visit `/{workspace}/room/{roomId}` — use the demo workspace at `/demo`
- For booking API changes: attempt a booking through the UI and confirm it completes without errors
- For admin changes: visit `/{workspace}/admin`

## Key paths
- Demo room view (tablet mode): `/demo/room/r1`
- Booking flow: click "BOOK NOW" or a duration button, confirm booking goes through
- Walk-in booking specifically: press a duration button (15m, 30m, etc.) — must succeed without "Invalid email address" error

## Done when
- `npm test` exits 0
- The specific change works as expected in the browser
- No regressions in adjacent features
