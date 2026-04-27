const express = require("express")
const router = express.Router()
const db = require("../db")

router.post("/update", (req, res) => {
  const c = req.body || {}

  db.run(
    `
    UPDATE cameras SET
      name = ?,
      rtsp_url = ?,
      address = ?,
      lat = ?,
      lng = ?,
      people_count_enabled = ?,
      people_count_type = ?,
      timelapse_enabled = ?,
      tl_interval = ?,
      tl_start_hour = ?,
      tl_end_hour = ?,
      tl_days = ?,
      tl_status = ?,
      tl_is_running = ?,
      updated_at = datetime('now','localtime')
    WHERE id = ?
    `,
    [
      c.name ?? "",
      c.rtsp_url ?? "",
      c.address ?? "",
      c.lat ?? null,
      c.lng ?? null,
      Number(c.people_count_enabled ?? 0),
      c.people_count_type ?? "ai",
      Number(c.timelapse_enabled ?? 0),
      Number(c.tl_interval ?? 0),
      c.tl_start_hour === "" || c.tl_start_hour === undefined ? null : c.tl_start_hour,
      c.tl_end_hour === "" || c.tl_end_hour === undefined ? null : c.tl_end_hour,
      c.tl_days ?? "",
      c.tl_status ?? "stopped",
      Number(c.tl_is_running ?? 0),
      Number(c.id)
    ],
    function (err) {
      if (err) {
        console.error("camera update error:", err)
        return res.status(500).json({
          ok: false,
          error: err.message
        })
      }

      res.json({
        ok: true,
        changes: this.changes
      })
    }
  )
})

module.exports = router