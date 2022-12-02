// define hardware
declare type _Gadget = Gadget & {
    VideoChip0: VideoChip,
    LedStrip0: LedStrip5,
    Wifi0: Wifi,
    CPU0: CPU,
}
declare const gdt: _Gadget
declare type Module = {  }
declare type WifiWebResponseEvent = {
    RequestHandle: number,
    ResponseCode: number,
    IsError: boolean,
    ErrorType: string,
    ErrorMessage: string,
    ContentType: string,
    Text: string,
    Type: string,
}

const ARIA2_URL = "http://127.0.0.1:6800/jsonrpc"
const ARIA2_TOKEN = "3f89fac2-9a96-4813-939d-078ab373cc1a"

// Retro Gadgets
import { decode as jsonDecode, encode as jsonEncode } from "./json"
const leds = gdt.LedStrip0
const wifi = gdt.Wifi0
const cpu = gdt.CPU0
const video = gdt.VideoChip0
const W = video.Width
const H = video.Height
let httpCallback: undefined | ((resp: WifiWebResponseEvent) => void) = undefined
let httpHandler: number = -1
let timer: number = 0
let ledStatus: number = 0
let speedHistory: number[] = []
for (let i=0; i<W; i++) {
    speedHistory.push(0)
}

function init() {
    // lua start at 1
    leds.Colors[1] = color.green
    leds.Colors[2] = color.green
    leds.Colors[3] = color.green
    leds.Colors[4] = color.green
    leds.Colors[5] = color.green
    leds.States[1] = false
    leds.States[2] = false
    leds.States[3] = false
    leds.States[4] = false
    leds.States[5] = false
}
init()

declare type Aria2Request = {
    jsonrpc: "2.0",
    id: "rgwidget",
    method: string,
    params: Array<string | number | Array<string>>,
}
declare type Aria2ResposeStatusList = {
    jsonrpc: string,
    id: string,
    result: Array<{
        gid: string,
        totalLength: number,
        completedLength: number,
        downloadSpeed: number,
    }>,
}

function makeAria2Request(method: string, ...params: Array<string | number | Array<string>>) {
    if (wifi.AccessDenied) {
        logError("Can't access network.")
        return
    }
    const obj: Aria2Request = {
        jsonrpc: "2.0",
        id: "rgwidget",
        method: method,
        params: [`token:${ARIA2_TOKEN}`]
    }
    for (const param of params) {
        obj.params.push(param)
    }
    const req = jsonEncode(obj)
    // print("==== Request ====\n", req)
    httpHandler = wifi.WebCustomRequest(ARIA2_URL, "POST", {}, "application/json", req)
}

function callbackTellActive(arg : WifiWebResponseEvent) {
    const resp = jsonDecode<Aria2ResposeStatusList>(arg.Text)
    const stList = resp.result
    let total = 0
    let current = 0
    let speed = 0
    for (const st of stList) {
        total += st.totalLength
        current += st.completedLength
        speed += st.downloadSpeed
    }
    speedHistory.splice(0, 1)
    speedHistory.push(speed)
    // find max speed
    let maxSpeed = 0
    for (const speed of speedHistory) {
        maxSpeed = speed > maxSpeed ? speed : maxSpeed
    }
    // render
    if (total > 0) {
        let ledNum = current / total * 5
        if (ledStatus <= 0) {
            ledNum = Math.floor(ledNum)
        } else {
            ledNum = Math.ceil(ledNum)
        }
        for (let i=0; i<5; i++) {
            leds.States[i+1] = i < ledNum
        }
    }
    video.FillRect(vec2(0, 0), vec2(W, H), color.black)
    if (maxSpeed > 0) {
        for (let x=0; x<W; x++) {
            const h = speedHistory[x] / maxSpeed * H
            const offsetY = H - h
            video.DrawLine(vec2(x, offsetY), vec2(x, H), color.white)
        }
    }
    print("speed:", Math.floor(speed / 1024), "Kb/s")
}

httpCallback = callbackTellActive

function update() {
    timer -= cpu.DeltaTime
    if (timer <= 0) {
        makeAria2Request("aria2.tellActive", ["gid", "totalLength", "completedLength", "downloadSpeed"])
        timer = 0.5
        ledStatus = ledStatus > 0 ? 0 : 1
    }
}

function eventChannel1(sender : Module, arg : WifiWebResponseEvent) {
    if (arg.IsError) {
        logError(arg.ErrorMessage)
    }
    if (httpCallback != undefined) {
        httpCallback(arg)
    } else {
        print("==== Response ====\n", arg.Text)
    }
    httpHandler = -1
}
