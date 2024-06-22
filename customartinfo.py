'''
Collection of information used for defining custom album art for
song and artist combinations. This is intended specifically for
displaying a single album art image for a consistent look when
playing compilation albums that have songs from multiple artists or
compilation albums of a single artist that has songs spanning multiple
albums. Even when listed here, whether to display defined custom album
art or whatever album art is returned from Shazam can be changed during
playback.

After defining albums with custom art, add each one to the albums list to
display custom album art for the listed songs whenever they are played.

To provide custom album artwork for a collection of songs,
define an album as:

example1 = [
    [
        "song1 + artist1;",
        "song2 + artist2;",
        "song3 + artist3;",
        "song4 + artist3;"
    ],
    customArtFolderPath + "numbered-artist-collection.jpg"
]

example2 = [
    [
        "song1 + artist;",
        "song2 + artist;",
        "song3 + artist;"
    ],
    customArtFolderPath + "artist-best-of.jpg"
]

albums = [example1, example2]
'''

customArtFolderPath = "suggestion_artwork/"
    
albums = []