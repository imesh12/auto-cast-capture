import { run } from "../plugins/event_timelapse/main.js"

function createCtx(){
  return {
    camera: { id: 1 },
    now: new Date(),

    saveFile: async (f)=>{
      console.log("SAVE", f)
    }
  }
}

// API
if(req.url === "/api/plugin/run" && req.method === "POST"){

  let body = ""

  req.on("data", chunk => body += chunk)

  req.on("end", async ()=>{

    const data = JSON.parse(body)

    console.log("RUN PLUGIN:", data.plugin)

    // 今は直結（後でpluginRunnerに変更）
    const events = await run(createCtx())

    console.log("EVENT:", events)

    res.writeHead(200, { "Content-Type":"application/json" })
    res.end(JSON.stringify(events))

  })

  return
}