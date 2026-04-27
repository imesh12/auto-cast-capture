// core/testRun.js

import { run } from "../plugins/event_timelapse/main.js"

async function main(){

  const ctx = {
    camera: { id: 1 },
    now: new Date(),

    saveFile: async (f)=>{
      console.log("CORE SAVE", f)
    }
  }

  const events = await run(ctx)

  console.log("CORE EVENT", events)

}

main()