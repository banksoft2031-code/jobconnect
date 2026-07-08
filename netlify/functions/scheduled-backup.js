// netlify/functions/scheduled-backup.js
//
// Runs automatically every day (Netlify Scheduled Function — no browser
// needs to be open). Copies the live Firebase data into a timestamped
// snapshot under data/auto_backups/{timestamp}, and keeps only the most
// recent KEEP_LAST snapshots so the database doesn't grow forever.

const DB_URL = "https://jobconnect-85e55-default-rtdb.firebaseio.com";
const KEEP_LAST = 30; // keep last 30 daily backups (~1 month)

export default async (req) => {
  try {
    // 1. Fetch the live data
    const [dataRes, usersRes] = await Promise.all([
      fetch(`${DB_URL}/data.json`),
      fetch(`${DB_URL}/users.json`),
    ]);

    if (!dataRes.ok || !usersRes.ok) {
      throw new Error(
        `Fetch failed: data=${dataRes.status} users=${usersRes.status}`
      );
    }

    const data = await dataRes.json();
    const users = await usersRes.json();

    const timestamp = new Date().toISOString(); // e.g. 2026-07-08T02:00:00.000Z
    const key = timestamp.replace(/[.#$\[\]]/g, "_");

    const snapshot = {
      ts: timestamp,
      data: data || null,
      users: users || null,
    };

    // 2. Save the new snapshot
    const putRes = await fetch(
      `${DB_URL}/data/auto_backups/${key}.json`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(snapshot),
      }
    );
    if (!putRes.ok) {
      throw new Error(`Save failed: ${putRes.status}`);
    }

    // 3. Prune old backups beyond KEEP_LAST
    const listRes = await fetch(
      `${DB_URL}/data/auto_backups.json?shallow=true`
    );
    if (listRes.ok) {
      const listing = await listRes.json();
      if (listing) {
        const keys = Object.keys(listing).sort(); // ISO-based keys sort chronologically
        const toDelete = keys.slice(0, Math.max(0, keys.length - KEEP_LAST));
        await Promise.all(
          toDelete.map((k) =>
            fetch(`${DB_URL}/data/auto_backups/${k}.json`, {
              method: "DELETE",
            })
          )
        );
      }
    }

    console.log(`Auto-backup saved: ${key}`);
    return new Response(
      JSON.stringify({ ok: true, key }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Auto-backup failed:", err);
    return new Response(
      JSON.stringify({ ok: false, error: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};

// Runs once a day. Netlify uses UTC for cron schedules.
export const config = {
  schedule: "@daily",
};
