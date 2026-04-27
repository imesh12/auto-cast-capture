const { spawn } = require("child_process")

let gst = null

function startCompositor(){

if(gst) return

const cmd=[

"compositor",
"name=comp",
"background=black",

"sink_0::xpos=0",
"sink_0::ypos=0",

"sink_1::xpos=640",
"sink_1::ypos=0",

"sink_2::xpos=1280",
"sink_2::ypos=0",

"sink_3::xpos=0",
"sink_3::ypos=360",

"sink_4::xpos=640",
"sink_4::ypos=360",

"sink_5::xpos=1280",
"sink_5::ypos=360",

"comp.",
"!",
"videoconvert",
"!",
"ximagesink",
"sync=false"

]

gst = spawn("gst-launch-1.0",cmd,{
env:{
...process.env,
DISPLAY:":0"
}
})

}

module.exports={ startCompositor }