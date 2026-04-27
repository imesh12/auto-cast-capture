//ptzControl.js  PTZ
const http = require("http")

async function move(cameraId,cmd){

 const cam =
 await dbGet(`
   SELECT ip
   FROM cameras
   WHERE id=?
 `,[cameraId])

 const url =
 `http://${cam.ip}/axis-cgi/com/ptz.cgi?move=${cmd}`

 http.get(url)

}

module.exports = { move }
