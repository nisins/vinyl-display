#!/usr/bin/env python

import asyncio
import websockets
import time
import pyaudio
from array import array
from shazamio import Shazam
import wave
import json
import threading

from customarthandler import CustomArtHandler
from correctionhandler import CorrectionHandler

'''
Variables for various settings
'''
tempdir                = ''                  # temporary directory path (change based on your OS)
audioDeviceId          = 4                   # index for the input device used to record from sounddevice.query_devices() 
silenceThreshold       = 512                 # threshold for silence/sound; configure based on your system
chunk                  = 1024
recordingLengthSeconds = 15                  # length of audio recording in seconds
sampleRate             = 44100               # sample rate, 44100 hz
numChannels            = 2                   # number of audio channels
audioFormat            = pyaudio.paInt16
websocketHost          = "localhost"         # address for the websocket
websocketPort          = 8764                # port for the websocket
placeholderArt         = "record.png"        # placeholder image used when identifying a song fails or if a song match has no album art

'''
Other global variables
'''
artHandler             = CustomArtHandler() 
correctionHandler      = CorrectionHandler()
connections            = list()              # websocket connections
connectionsLock        = threading.Lock()
playedTracksAlbumsLock = threading.Lock()
playedTracks           = set()               # played song and artist combination - format: "song + artist;"
playedAlbums           = set()               # played album and artist combination with album art - format: "album + artist; - art-url"


def writePlayedInformation():
    '''
    Writes the data of played song artist combinations and album artist
    combinations. Used to make updating custom art and corrections easier
    by saving what songs have been played. 
    '''

    global playedTracks
    global playedAlbums

    with playedTracksAlbumsLock:
        
        if len(playedTracks) == 0 and len(playedAlbums) == 0:
            return
        
        file = open("played.txt", "a")

        file.write("/"*70 + "\n")
        file.write("Played song+artist combinations:\n")

        for combo in playedTracks:
            file.write("\t\"" + combo + "\",\n")
        
        file.write("\nPlayed album+artist combinations:\n")

        for combo in playedAlbums:
            file.write("\t" + combo + "\n")
            
        file.write("\n\n\n")
            
        file.close()
        
        # Clear the logged information
        playedTracks = set()
        playedAlbums = set()
    
    
def checkSilence(soundData):
    '''
    Check if there is silence on the audio port.

    Returns "True" if the audio data is below the user-supplied threshold.
    '''

    return max(soundData) < silenceThreshold
             
        
async def listenAudio():
    '''
    Record audio from the audio port, identify it, and
    send the data over to any clients over the websocket connection.
    '''

    while True:
        # Create the audio stream for listening
        p = pyaudio.PyAudio()
        stream = None

        try:
            stream = p.open(
                format             = audioFormat, 
                channels           = numChannels, 
                rate               = sampleRate,
                input              = True, 
                output             = False,
                input_device_index = audioDeviceId,
                frames_per_buffer  = chunk)

        except Exception as e:
            print("error listening, sleep for 5")
            print(e)
            p.terminate()
            time.sleep(5)

            continue

        # Little endian, signed short
        soundData = array('h', stream.read(chunk, exception_on_overflow = False))

        # Is sound present?
        silent = checkSilence(soundData)
               
        # Sound is present
        if not silent:
                
            print('Recording audio...')
                
            frames = []

            # Record sample of audio signal
            for i in range(0, int(sampleRate / chunk * recordingLengthSeconds)):
                data = stream.read(chunk, exception_on_overflow = False)
                frames.append(data)
 
            # Save the audio sample
            recordAudio( frames, p )
                
            # Identify the audio sample
            songInfo = await identifySong(frames)
            print(songInfo)
            
            songAndArtist  = None
            albumAndArtist = None
            
            # Data the websocket clients will receive
            songData = {
                "matched"               : False,
                "song"                  : None,
                "artist"                : None,
                "album"                 : None,
                "art"                   : None,
                "customArt"             : None,
                "usingPlaceholderImage" : False,
                "fullResponse"          : songInfo
            }
            
            if len(songInfo["matches"]) > 0:
                songData["matched"]   = True
                song                  = None
                artist                = None
                album                 = None
                art                   = None
                customArt             = None
                usingPlaceholderImage = False
                
                try:
                    song = songInfo["track"]["title"]

                except:
                    print("error getting song title from shazam response")
                    
                try:
                    artist = songInfo["track"]["subtitle"]

                except:
                    print("error getting artist name from shazam response")
                
                try:
                    album = songInfo["track"]["sections"][0]["metadata"][0]["text"]

                except:
                    print("error getting album name from shazam response")
                    album = "" # Song matches may or may not have an album
                
                try:
                    art = songInfo["track"]["images"]["coverarthq"]

                except:
                    print("error getting hq album art from shazam response")
                
                # If there was no hq art, try to get the standard quality art
                if art is None:
                    try:
                        art = songInfo["track"]["images"]["coverart"]

                    except:
                        print("error falling back to and getting normal quality album art from shazam response")
                        art                   = placeholderArt # If the song match has no art, default to placeholder
                        usingPlaceholderImage = True
                
                # Log each song + artist combination and album + artist combination
                with playedTracksAlbumsLock:
                    try:
                        songAndArtist = songInfo["track"]["title"] + " + " + songInfo["track"]["subtitle"] + ";"
                        
                        # Only log songs that dont exist in the custom art handler
                        if not artHandler.songAndArtistExists(songAndArtist):
                            playedTracks.add(songAndArtist)

                    except Exception as e:
                        print("error logging song+artist")
                        print(e)
                    
                    try:
                        albumAndArtist = songInfo["track"]["sections"][0]["metadata"][0]["text"] + " + " + songInfo["track"]["subtitle"] + "; - " + art
                        playedAlbums.add(albumAndArtist)

                    except Exception as e:
                        print("error logging album+artist")
                        print(e)
                
                # Get custom art if there is any, and check if this song needs to be corrected
                customArt  = artHandler.getCustomArt(songAndArtist)
                correction = correctionHandler.getCorrection(songAndArtist)
                
                if correction != None:

                    # If the song was corrected, get the correct data to replace it with
                    print("correction: " + songAndArtist + " changed to " + correction["song"] + " by " + correction["artist"] + " on album " + correction["album"])
                    song      = correction["song"]
                    artist    = correction["artist"]
                    album     = correction["album"]
                    art       = correction["art"]
                    customArt = artHandler.getCustomArt(song + " + " + artist + ";")
                
                # Write to the object that gets sent to the websocket clients
                songData["song"]                  = song
                songData["artist"]                = artist
                songData["album"]                 = album
                songData["art"]                   = art
                songData["customArt"]             = customArt
                songData["usingPlaceholderImage"] = usingPlaceholderImage

            else:
                # This is the information that will be displayed when Shazam is unable to match a song
                songData["matched"]               = False
                songData["song"]                  = "♫♫♫"
                songData["artist"]                = ""
                songData["album"]                 = ""
                songData["art"]                   = placeholderArt
                songData["customArt"]             = placeholderArt
                songData["usingPlaceholderImage"] = True

            # Close audio stream to be able to start listening again
            stream.stop_stream()
            stream.close()
            p.terminate()

            try:
                print("sending data")
                with connectionsLock:
                    websockets.broadcast(connections, json.dumps(songData))
                    print("data sent")

            except Exception as e:
                print("issue sending data")
                print(e)
        

def recordAudio( WriteData, p ):
    '''
    Save audio data frames as a temporary wave file.
       
    Arguments:
    -WriteData: audio data
    -p: pyaudio.PyAudio object
    '''

    wf = wave.open(tempdir + 'audiochunk.wav', 'wb')
    wf.setnchannels(numChannels)
    wf.setsampwidth(p.get_sample_size(audioFormat))
    wf.setframerate(sampleRate)
    wf.writeframes(b''.join(WriteData))
    wf.close()


async def identifySong( frames ):
    '''
    Identify song file using Shazam.
    '''

    print('Identifying song...')

    shazam   = Shazam()
    response = await shazam.recognize(tempdir + 'audiochunk.wav')

    print("done with shazam")

    return response


async def websocketHandler(websocket):
    '''
    Websocket connection handler that manages new connections
    and messages that are received from any clients.
    '''

    global connections
    with connectionsLock:

        # Get rid of closed connections
        aliveConnections = []
        for i in range(len(connections)):
            if connections[i].closed == False:
                aliveConnections.append(connections[i])
        
        connections = aliveConnections
        connections.append(websocket)
        print("new connection")
        
    try:
        async for message in websocket:

            # Received from client automatically when switching from
            # now playing screen to the suggestions screen
            if message == "save played":
                try:
                    writePlayedInformation()

                except Exception as e:
                    print("error writing played info file")
                    print(e)

    except Exception as e:
        print(e)

async def main():
    '''
    Opens the websocket at the given address and port.
    '''

    async with websockets.serve(websocketHandler, websocketHost, websocketPort):
        await asyncio.Future()  # Run forever
        
def listenEntry():
    '''
    Entry function to kick off song recording
    and identification.
    '''

    asyncio.run(listenAudio())

# Create a thread to handle song recording, identification, and sending
# the data using the websocket connection
listeningThread = threading.Thread(target=listenEntry)
listeningThread.start()

# Create websocket and handle connections and messages received from clients
asyncio.run(main())