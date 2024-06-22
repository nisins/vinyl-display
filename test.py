import asyncio
import websockets
import json

websocketHost  = "localhost" # address for the websocket
websocketPort  = 8764        # port for the websocket

num = 0

titles = [
    "Making The Most Of The Night",
    "Emotion",
    "This Is What They Say",
    "This Is Who We Are",
    "Uninspired"
]

artists = [
    "Carly Rae Jepsen",
    "Carly Rae Jepsen",
    "Carly Rae Jepsen",
    "Cartel",
    "Cartel"
]

albums = [
    "Emotion (Deluxe Expanded Edition)",
    "Emotion (Deluxe Expanded Edition)",
    "Dedicated Side B",
    "Cartel (Bonus Track Version)",
    "Collider"
]

arts = [
    "https://is1-ssl.mzstatic.com/image/thumb/Music124/v4/cb/64/d9/cb64d953-3fc9-4c41-565c-5c9f510be59c/20UMGIM69423.rgb.jpg/400x400bb.webp",
    "https://is1-ssl.mzstatic.com/image/thumb/Music124/v4/cb/64/d9/cb64d953-3fc9-4c41-565c-5c9f510be59c/20UMGIM69423.rgb.jpg/400x400bb.webp",
    "https://www.shazam.com/mkimage/image/thumb/Music114/v4/89/47/d7/8947d7fe-e955-c53b-d362-ffdeb531903c/20UMGIM35319.rgb.jpg/400x400bb-60.webp",
    "https://is1-ssl.mzstatic.com/image/thumb/Features/00/c1/a8/dj.gvrcvihp.jpg/400x400bb.webp",
    "https://www.shazam.com/mkimage/image/thumb/Music113/v4/6b/33/02/6b3302d1-9c00-f1e9-4de4-df8879d2cfc5/859709533285_cover.jpg/400x400bb-60.webp",
]

async def echo(websocket):
    async for message in websocket:
        global num
        
        songInfo = {
            "song"    : titles[num % (len(titles))],
            "artist"  : artists[num % (len(artists))],
            "art"     : arts[num % (len(arts))],
            "album"   : albums[num % (len(albums))],
            "matched" : True
        }

        if message == "no match":
            songInfo["matched"] = False
            songInfo["art"]     = "record.png"
            songInfo["song"]    = "♫♫♫"
            songInfo["artist"]  = ""
            songInfo["album"]   = ""

        if message == "record":
            songInfo["art"] = "record.png"

        num += 1

        print(songInfo)
        await websocket.send(json.dumps(songInfo))

async def main():
    async with websockets.serve(echo, websocketHost, websocketPort):
        await asyncio.Future()
    
asyncio.run(main())